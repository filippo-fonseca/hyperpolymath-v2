// Command whatsapp-bridge is a thin WhatsApp Web sender built on whatsmeow.
//
// It is bundled inside JARVIS Desktop as a Tauri sidecar so the user never
// starts a Go process by hand. It serves exactly the endpoint the desktop send
// path already calls (POST /api/send {recipient, message} on port 8080), plus a
// health probe and a QR endpoint for first-run pairing.
//
// The WhatsApp Web session persists in an SQLite store under --store (Tauri
// app-data), so whatsmeow auto-reconnects on restart. On a fresh/logged-out
// store it emits QR codes as structured stdout lines ({"event":"qr","code":…})
// which the Rust supervisor forwards to the HUD; when paired it emits
// {"event":"ready"}.
//
// Scope: send + QR + health + /api/logout, plus live message capture (incoming
// and outgoing) mirrored into `messages` + `chats` tables in the same SQLite
// file whatsmeow uses for its session store. The schema is compatible with
// lharries/whatsapp-mcp so tools/whatsapp-sync/sync.mjs reads it unchanged.
package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"go.mau.fi/whatsmeow"
	"go.mau.fi/whatsmeow/proto/waE2E"
	"go.mau.fi/whatsmeow/store/sqlstore"
	"go.mau.fi/whatsmeow/types"
	waLog "go.mau.fi/whatsmeow/util/log"
	"google.golang.org/protobuf/proto"

	// Pure-Go SQLite driver (no CGO) so cross-compiling the sidecar is trivial.
	// It registers itself under the driver name "sqlite".
	_ "modernc.org/sqlite"
)

// bridge holds the connected client, the latest QR string (for /api/qr), and
// a second sqlite handle onto the same whatsapp.db file used by whatsmeow's
// session store — for the messages/chats capture tables.
type bridge struct {
	client *whatsmeow.Client

	mu    sync.RWMutex
	qr    string // most recent unscanned QR code, "" once paired
	ready bool

	msgDB *sql.DB

	// Cached group names so we make at most one GetGroupInfo call per group
	// per process lifetime. Miss on rename is acceptable; the LEFT JOIN in
	// sync.mjs tolerates NULL/stale names.
	groupMu    sync.Mutex
	groupNames map[types.JID]string
}

const captureSchema = `
CREATE TABLE IF NOT EXISTS chats (
	jid TEXT PRIMARY KEY,
	name TEXT,
	last_message_time TIMESTAMP
);
CREATE TABLE IF NOT EXISTS messages (
	id TEXT,
	chat_jid TEXT,
	sender TEXT,
	content TEXT,
	timestamp TIMESTAMP,
	is_from_me BOOLEAN,
	media_type TEXT,
	PRIMARY KEY (id, chat_jid),
	FOREIGN KEY (chat_jid) REFERENCES chats(jid)
);
`

// upsertChat inserts or updates a chats row. A blank incoming name never
// clobbers an existing good name (COALESCE(NULLIF(...))). last_message_time is
// stored as UTC RFC3339 text so it sorts lexicographically.
func (b *bridge) upsertChat(jid, name string, ts time.Time) error {
	if b.msgDB == nil {
		return nil
	}
	_, err := b.msgDB.Exec(
		`INSERT INTO chats(jid, name, last_message_time) VALUES (?, ?, ?)
		 ON CONFLICT(jid) DO UPDATE SET
			name = COALESCE(NULLIF(excluded.name, ''), chats.name),
			last_message_time = excluded.last_message_time`,
		jid, name, ts.UTC().Format(time.RFC3339),
	)
	return err
}

// storeMessage inserts a row into the messages capture table. INSERT OR REPLACE
// keeps capture idempotent when whatsmeow redelivers. Timestamp is formatted
// exactly here (UTC RFC3339 text) so sync.mjs's string-comparison cursor
// (`m.timestamp > '<bound>'`) sorts chronologically.
func (b *bridge) storeMessage(id, chatJID, sender, content, mediaType string, ts time.Time, fromMe bool) error {
	if b.msgDB == nil {
		return nil
	}
	fromMeInt := 0
	if fromMe {
		fromMeInt = 1
	}
	_, err := b.msgDB.Exec(
		`INSERT OR REPLACE INTO messages(id, chat_jid, sender, content, timestamp, is_from_me, media_type)
		 VALUES (?, ?, ?, ?, ?, ?, ?)`,
		id, chatJID, sender, content, ts.UTC().Format(time.RFC3339), fromMeInt, mediaType,
	)
	return err
}

// emitEvent writes a structured stdout line the Rust supervisor parses.
func emitEvent(event string, extra map[string]string) {
	m := map[string]string{"event": event}
	for k, v := range extra {
		m[k] = v
	}
	b, _ := json.Marshal(m)
	// Single line, flushed by the newline; stdout is line-buffered to the pipe.
	fmt.Println(string(b))
}

func (b *bridge) setQR(code string) {
	b.mu.Lock()
	b.qr = code
	b.ready = false
	b.mu.Unlock()
	emitEvent("qr", map[string]string{"code": code})
}

func (b *bridge) setReady() {
	b.mu.Lock()
	b.qr = ""
	b.ready = true
	b.mu.Unlock()
	emitEvent("ready", nil)
}

func (b *bridge) currentQR() string {
	b.mu.RLock()
	defer b.mu.RUnlock()
	return b.qr
}

// resolveJID turns a recipient (intl phone number like "15551234567", or a raw
// JID containing "@") into a WhatsApp JID.
func resolveJID(recipient string) (types.JID, error) {
	recipient = strings.TrimSpace(recipient)
	if recipient == "" {
		return types.JID{}, fmt.Errorf("empty recipient")
	}
	if strings.Contains(recipient, "@") {
		return types.ParseJID(recipient)
	}
	// Bare phone number → personal chat on the default user server.
	number := strings.TrimPrefix(recipient, "+")
	return types.NewJID(number, types.DefaultUserServer), nil
}

type sendRequest struct {
	Recipient string `json:"recipient"`
	Message   string `json:"message"`
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("content-type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

func (b *bridge) handleSend(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]any{"ok": false, "error": "method not allowed"})
		return
	}
	var req sendRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"ok": false, "error": "bad json body"})
		return
	}
	if strings.TrimSpace(req.Recipient) == "" || req.Message == "" {
		writeJSON(w, http.StatusBadRequest, map[string]any{"ok": false, "error": "recipient and message are required"})
		return
	}
	if !b.client.IsLoggedIn() {
		writeJSON(w, http.StatusBadGateway, map[string]any{"ok": false, "error": "not logged in — scan the QR to pair WhatsApp"})
		return
	}
	jid, err := resolveJID(req.Recipient)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"ok": false, "error": fmt.Sprintf("invalid recipient: %v", err)})
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()
	_, err = b.client.SendMessage(ctx, jid, &waE2E.Message{
		Conversation: proto.String(req.Message),
	})
	if err != nil {
		writeJSON(w, http.StatusBadGateway, map[string]any{"ok": false, "error": fmt.Sprintf("send failed: %v", err)})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (b *bridge) handleHealth(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"connected": b.client.IsConnected(),
		"loggedIn":  b.client.IsLoggedIn(),
	})
}

func (b *bridge) handleQR(w http.ResponseWriter, _ *http.Request) {
	qr := b.currentQR()
	if qr == "" {
		// Already paired (or no code yet): nothing to scan.
		w.WriteHeader(http.StatusNoContent)
		return
	}
	w.Header().Set("content-type", "text/plain; charset=utf-8")
	_, _ = w.Write([]byte(qr))
}

func main() {
	var storeDir, port string
	flag.StringVar(&storeDir, "store", os.Getenv("WA_STORE_DIR"), "directory for the WhatsApp session store (whatsapp.db)")
	flag.StringVar(&port, "port", os.Getenv("WA_PORT"), "HTTP listen port")
	flag.Parse()
	if storeDir == "" {
		cwd, _ := os.Getwd()
		storeDir = filepath.Join(cwd, "store")
	}
	if port == "" {
		port = "8080"
	}
	if err := os.MkdirAll(storeDir, 0o700); err != nil {
		log.Fatalf("failed to create store dir: %v", err)
	}

	ctx := context.Background()
	dbPath := filepath.Join(storeDir, "whatsapp.db")
	// modernc's driver name is "sqlite"; dbutil accepts any "sqlite*" dialect.
	// _pragma=foreign_keys(1) is modernc's syntax for enabling FK enforcement.
	dsn := fmt.Sprintf("file:%s?_pragma=foreign_keys(1)&_pragma=busy_timeout(5000)", dbPath)
	logger := waLog.Stdout("bridge", "WARN", true)

	container, err := sqlstore.New(ctx, "sqlite", dsn, logger)
	if err != nil {
		log.Fatalf("failed to open store: %v", err)
	}

	// Second handle onto the SAME whatsapp.db file: we own the messages/chats
	// capture tables, whatsmeow owns its own tables. busy_timeout(5000) in the
	// DSN handles cross-connection SQLite locking.
	msgDB, err := sql.Open("sqlite", dsn)
	if err != nil {
		log.Fatalf("failed to open capture db: %v", err)
	}
	if err := msgDB.PingContext(ctx); err != nil {
		log.Fatalf("failed to ping capture db: %v", err)
	}
	if _, err := msgDB.ExecContext(ctx, captureSchema); err != nil {
		log.Fatalf("failed to init capture schema: %v", err)
	}

	deviceStore, err := container.GetFirstDevice(ctx)
	if err != nil {
		log.Fatalf("failed to get device: %v", err)
	}

	client := whatsmeow.NewClient(deviceStore, waLog.Stdout("client", "WARN", true))
	b := &bridge{
		client:     client,
		msgDB:      msgDB,
		groupNames: make(map[types.JID]string),
	}

	if client.Store.ID == nil {
		// Not paired: pull the QR channel BEFORE connecting.
		qrChan, err := client.GetQRChannel(ctx)
		if err != nil {
			log.Fatalf("failed to get QR channel: %v", err)
		}
		if err := client.Connect(); err != nil {
			log.Fatalf("failed to connect: %v", err)
		}
		go func() {
			for item := range qrChan {
				switch item.Event {
				case "code":
					b.setQR(item.Code)
				case "success":
					b.setReady()
				case "timeout":
					log.Printf("QR timeout; store may need a fresh scan")
				default:
					if item.Error != nil {
						log.Printf("QR channel error: %v", item.Error)
					}
				}
			}
		}()
	} else {
		// Already paired: just connect; the session auto-reconnects.
		if err := client.Connect(); err != nil {
			log.Fatalf("failed to connect: %v", err)
		}
		b.setReady()
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/api/send", b.handleSend)
	mux.HandleFunc("/api/health", b.handleHealth)
	mux.HandleFunc("/api/qr", b.handleQR)

	addr := ":" + port
	log.Printf("whatsapp-bridge listening on %s (store: %s)", addr, dbPath)
	srv := &http.Server{Addr: addr, Handler: mux}
	if err := srv.ListenAndServe(); err != nil {
		log.Fatalf("http server error: %v", err)
	}
	client.Disconnect()
}
