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
	"errors"
	"flag"
	"fmt"
	"log"
	"math/rand"
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
	"go.mau.fi/whatsmeow/types/events"
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

	// connState is the lifecycle bundle reported by /api/health, guarded by
	// stateMu (separate from mu so a health poll never contends with QR setters).
	// state is one of: connecting | connected | reconnecting | logged_out |
	// perm_failure. reason carries a human string for perm_failure/logged_out
	// (e.g. "stream_replaced", "temp_ban until <t>"). lastConnected/
	// lastDisconnected are zero until the first such transition. degraded flips
	// true on KeepAliveTimeout and clears on KeepAliveRestored — the connection
	// is nominally up but pings are missing (whatsmeow force-reconnects after
	// 3 min on its own).
	stateMu          sync.RWMutex
	state            string
	stateReason      string
	lastConnected    time.Time
	lastDisconnected time.Time
	degraded         bool

	msgDB *sql.DB

	// Cached group names so we make at most one GetGroupInfo call per group
	// per process lifetime. Miss on rename is acceptable; the LEFT JOIN in
	// sync.mjs tolerates NULL/stale names.
	groupMu    sync.Mutex
	groupNames map[types.JID]string
}

// extractContent pulls a text body out of a whatsmeow message, or classifies
// which media field is present. Returns (content, mediaType). Both empty means
// the row is not worth persisting (receipts, reactions, protocol messages).
func extractContent(m *waE2E.Message) (string, string) {
	if m == nil {
		return "", ""
	}
	if c := m.GetConversation(); c != "" {
		return c, ""
	}
	if ext := m.GetExtendedTextMessage(); ext != nil {
		if t := ext.GetText(); t != "" {
			return t, ""
		}
	}
	switch {
	case m.GetImageMessage() != nil:
		return "", "image"
	case m.GetVideoMessage() != nil:
		return "", "video"
	case m.GetAudioMessage() != nil:
		return "", "audio"
	case m.GetDocumentMessage() != nil:
		return "", "document"
	case m.GetStickerMessage() != nil:
		return "", "sticker"
	}
	return "", ""
}

// chatDisplayName resolves the best-effort display name for a chat JID. For
// groups it calls whatsmeow.GetGroupInfo once per process (cached); for DMs it
// prefers the message's PushName. Failure returns "" — the caller upserts with
// COALESCE so blanks never clobber existing names.
func (b *bridge) chatDisplayName(ctx context.Context, chat types.JID, pushName string) string {
	if chat.Server == types.GroupServer {
		b.groupMu.Lock()
		if name, ok := b.groupNames[chat]; ok {
			b.groupMu.Unlock()
			return name
		}
		b.groupMu.Unlock()

		info, err := b.client.GetGroupInfo(ctx, chat)
		name := ""
		if err == nil && info != nil {
			name = info.Name
		}
		b.groupMu.Lock()
		b.groupNames[chat] = name
		b.groupMu.Unlock()
		return name
	}
	return pushName
}

// handleEvent is the whatsmeow event bus callback. It captures *events.Message
// into the messages/chats tables and tracks the connection lifecycle for
// truthful /api/health reporting + self-recovery from the recoverable subset of
// whatsmeow's PermanentDisconnect class. *events.HistorySync is intentionally
// not handled ("start fresh from now" per the unit brief).
//
// whatsmeow's built-in auto-reconnect (EnableAutoReconnect, default true)
// already recovers transient socket drops; we do NOT run a bespoke reconnect
// loop for those. We only add manual recovery for the two recoverable
// PermanentDisconnect cases (StreamReplaced reclaim, TemporaryBan expiry) and
// surface the rest truthfully.
func (b *bridge) handleEvent(evt any) {
	switch evt := evt.(type) {
	case *events.Message:
		b.handleMessage(evt)

	case *events.Connected:
		// Socket up + authed. Presence-available is required for some delivery
		// behavior; a paired session has a pushname so this succeeds.
		b.markConnected()
		if err := b.client.SendPresence(context.Background(), types.PresenceAvailable); err != nil {
			log.Printf("lifecycle: SendPresence after Connected failed: %v", err)
		}
		log.Printf("lifecycle: connected")

	case *events.Disconnected:
		// Server/network closed the socket. Auto-reconnect is already running;
		// just reflect it. No manual action.
		b.markDisconnected()
		log.Printf("lifecycle: disconnected (auto-reconnect in progress)")

	case *events.KeepAliveTimeout:
		// Ping missed. whatsmeow force-reconnects after 3 min of failures on
		// its own; we only surface the degraded flag for v1.
		b.setDegraded(true)
		log.Printf("lifecycle: keepalive timeout (errorCount=%d)", evt.ErrorCount)

	case *events.KeepAliveRestored:
		b.setDegraded(false)
		log.Printf("lifecycle: keepalive restored")

	case *events.LoggedOut:
		// Device unpaired; whatsmeow wipes the session row. Reconnecting is
		// futile — flip to logged_out, clear ready so the /api/qr flow can
		// restart, and emit a stdout line the desktop pump parses.
		reason := "logged_out"
		if evt.Reason != 0 {
			reason = evt.Reason.String()
		}
		b.setState("logged_out", reason)
		b.mu.Lock()
		b.ready = false
		b.mu.Unlock()
		log.Printf("lifecycle: logged out (%s)", reason)
		emitEvent("logged_out", map[string]string{"reason": reason})

	case *events.StreamReplaced:
		// Another client connected with the same session keys. Do NOT blind
		// reconnect (ping-pong risk). After a randomized 30-60s delay, attempt
		// exactly one Connect() to reclaim the session in case the other copy
		// was a short-lived orphan; if we get replaced again, stay down.
		b.setState("perm_failure", "stream_replaced")
		log.Printf("lifecycle: stream replaced — scheduling one reclaim attempt")
		go b.reclaimAfterStreamReplaced()

	case *events.TemporaryBan:
		reason := fmt.Sprintf("temp_ban %s", evt.Code.String())
		if evt.Expire > 0 {
			reason = fmt.Sprintf("temp_ban until %s (%s)", time.Now().Add(evt.Expire).Format(time.RFC3339), evt.Code.String())
		}
		b.setState("perm_failure", reason)
		log.Printf("lifecycle: temporary ban — %s", reason)
		go b.reconnectAfter(evt.Expire)

	default:
		// Catch the remaining PermanentDisconnect class (ClientOutdated,
		// CATRefreshError, ConnectFailure) generically. These need human
		// judgment (rebuild the binary, etc.) — surface, don't retry.
		if pd, ok := evt.(events.PermanentDisconnect); ok {
			desc := pd.PermanentDisconnectDescription()
			b.setState("perm_failure", desc)
			log.Printf("lifecycle: permanent disconnect — %s", desc)
		}
	}
}

// handleMessage persists a captured incoming/outgoing message into the
// chats/messages tables (unchanged capture logic, factored out of the type
// switch).
func (b *bridge) handleMessage(msg *events.Message) {
	if msg == nil {
		return
	}
	content, mediaType := extractContent(msg.Message)
	if content == "" && mediaType == "" {
		return
	}
	chatJID := msg.Info.Chat.String()
	name := b.chatDisplayName(context.Background(), msg.Info.Chat, msg.Info.PushName)
	if err := b.upsertChat(chatJID, name, msg.Info.Timestamp); err != nil {
		log.Printf("capture: upsertChat %s: %v", chatJID, err)
		return
	}
	if err := b.storeMessage(
		msg.Info.ID, chatJID, msg.Info.Sender.User,
		content, mediaType, msg.Info.Timestamp, msg.Info.IsFromMe,
	); err != nil {
		log.Printf("capture: storeMessage %s/%s: %v", chatJID, msg.Info.ID, err)
	}
}

// reclaimAfterStreamReplaced waits a randomized 30-60s then attempts exactly one
// Connect() to reclaim a session that was replaced by a (possibly short-lived
// orphan) second client. If Connect errors, we stay in perm_failure. If the
// reclaim itself gets StreamReplaced again, that event re-enters handleEvent and
// we do NOT loop (each StreamReplaced schedules at most one attempt, but the
// second replacement means a genuine other owner exists — surfaced as
// perm_failure, no further auto-retry beyond that single attempt's schedule).
func (b *bridge) reclaimAfterStreamReplaced() {
	delay := 30*time.Second + time.Duration(rand.Int63n(int64(30*time.Second)))
	log.Printf("lifecycle: stream-replaced reclaim in %s", delay.Round(time.Second))
	time.Sleep(delay)
	b.setState("reconnecting", "stream_replaced_reclaim")
	if err := b.client.Connect(); err != nil {
		b.setState("perm_failure", fmt.Sprintf("stream_replaced (reclaim failed: %v)", err))
		log.Printf("lifecycle: stream-replaced reclaim failed: %v", err)
	}
}

// reconnectAfter waits until `expire` (plus 5-30s jitter) then attempts one
// Connect() — used to resume after a TemporaryBan window elapses.
func (b *bridge) reconnectAfter(expire time.Duration) {
	if expire < 0 {
		expire = 0
	}
	jitter := 5*time.Second + time.Duration(rand.Int63n(int64(25*time.Second)))
	delay := expire + jitter
	log.Printf("lifecycle: scheduling reconnect after ban in %s", delay.Round(time.Second))
	time.Sleep(delay)
	b.setState("reconnecting", "post_ban_reconnect")
	if err := b.client.Connect(); err != nil {
		b.setState("perm_failure", fmt.Sprintf("post-ban reconnect failed: %v", err))
		log.Printf("lifecycle: post-ban reconnect failed: %v", err)
	}
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
	// Ready implies a live, authed session; keep lifecycle state coherent even
	// if the *events.Connected arm hasn't fired yet.
	b.markConnected()
	emitEvent("ready", nil)
}

func (b *bridge) currentQR() string {
	b.mu.RLock()
	defer b.mu.RUnlock()
	return b.qr
}

// setState updates the lifecycle state + reason atomically. A blank reason
// clears any prior reason (so a recovery to `connected` wipes a stale
// perm_failure message).
func (b *bridge) setState(state, reason string) {
	b.stateMu.Lock()
	b.state = state
	b.stateReason = reason
	b.stateMu.Unlock()
}

// markConnected records a successful connect: state=connected, reason cleared,
// lastConnected stamped, degraded cleared.
func (b *bridge) markConnected() {
	b.stateMu.Lock()
	b.state = "connected"
	b.stateReason = ""
	b.lastConnected = time.Now()
	b.degraded = false
	b.stateMu.Unlock()
}

// markDisconnected records a socket close: state=reconnecting (whatsmeow's
// auto-reconnect is already running), lastDisconnected stamped.
func (b *bridge) markDisconnected() {
	b.stateMu.Lock()
	b.state = "reconnecting"
	b.lastDisconnected = time.Now()
	b.stateMu.Unlock()
}

// setDegraded flips the degraded flag (keepalives failing / restored) without
// changing the coarse state.
func (b *bridge) setDegraded(degraded bool) {
	b.stateMu.Lock()
	b.degraded = degraded
	b.stateMu.Unlock()
}

// stateSnapshot returns a copy of the lifecycle bundle for /api/health.
func (b *bridge) stateSnapshot() (state, reason string, lastConn, lastDisc time.Time, degraded bool) {
	b.stateMu.RLock()
	defer b.stateMu.RUnlock()
	return b.state, b.stateReason, b.lastConnected, b.lastDisconnected, b.degraded
}

// looksLikePhoneNumber reports whether a recipient string is a bare phone
// number (digits, optional leading '+', and dashes/spaces as visual separators)
// vs. a contact name. A recipient with no '@' is a phone number when every
// non-space rune is a digit / '+' / '-' AND at least one digit is present.
// Everything else (letters, apostrophes, dots, emoji) is treated as a name and
// routed through the whatsmeow_contacts lookup.
func looksLikePhoneNumber(s string) bool {
	hasDigit := false
	for _, r := range s {
		switch {
		case r >= '0' && r <= '9':
			hasDigit = true
		case r == '+' || r == '-' || r == ' ':
			// separator / prefix
		default:
			return false
		}
	}
	return hasDigit
}

// resolvedContact carries one candidate row from whatsmeow_contacts. Kept small
// so ambiguity errors can include a human-readable disambiguation list.
type resolvedContact struct {
	jid           string
	fullName      string
	firstName     string
	pushName      string
	businessName  string
	redactedPhone string
	// tier is the best (highest-confidence) match tier this row achieved
	// against the query: matchExact > matchFirstToken > matchPrefix >
	// matchContains. Used to rank candidates and decide send/ambiguous.
	tier matchTier
}

// matchTier ranks how confidently a contact row matches the query name. Higher
// is more confident. resolveRecipientToJID gathers candidates with a broad
// LIKE query, scores each in Go, then sends only when a single distinct JID
// occupies the top tier present (else ambiguous).
type matchTier int

const (
	matchNone       matchTier = 0
	matchContains   matchTier = 1 // query appears as an interior/last word
	matchPrefix     matchTier = 2 // a name starts with query + boundary
	matchFirstToken matchTier = 3 // query == first whitespace token of a name
	matchExact      matchTier = 4 // query == full_name or first_name exactly
)

// firstToken returns the first whitespace-separated token of s, lower-cased.
func firstToken(s string) string {
	fields := strings.Fields(strings.ToLower(s))
	if len(fields) == 0 {
		return ""
	}
	return fields[0]
}

// scoreContactTier computes the best match tier for a candidate row against the
// lowered query. full_name / first_name carry the exact tier; full_name's first
// token outranks push_name's; prefix and contains apply across full_name,
// push_name and business_name.
func scoreContactTier(c resolvedContact, q string) matchTier {
	full := strings.ToLower(c.fullName)
	first := strings.ToLower(c.firstName)
	push := strings.ToLower(c.pushName)
	business := strings.ToLower(c.businessName)

	best := matchNone
	bump := func(t matchTier) {
		if t > best {
			best = t
		}
	}

	// Tier 4 — exact full_name / first_name.
	if full == q || first == q {
		bump(matchExact)
	}
	// Tier 3 — first token of full_name (then push_name) equals query.
	if firstToken(full) == q || firstToken(push) == q {
		bump(matchFirstToken)
	}
	// Tier 2 — a name starts with query followed by a word boundary (space)
	// or is exactly the query. "emir" matches "Emir Ahmed".
	hasPrefix := func(name string) bool {
		return name == q || strings.HasPrefix(name, q+" ")
	}
	if hasPrefix(full) || hasPrefix(push) || hasPrefix(business) {
		bump(matchPrefix)
	}
	// Tier 1 — query appears as a standalone interior/last word.
	hasWord := func(name string) bool {
		return strings.Contains(" "+name+" ", " "+q+" ")
	}
	if hasWord(full) || hasWord(push) || hasWord(business) {
		bump(matchContains)
	}
	return best
}

// escapeLike escapes LIKE metacharacters (% _ \) in s so it can be embedded in
// a LIKE pattern used with `ESCAPE '\'`.
func escapeLike(s string) string {
	r := strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`)
	return r.Replace(s)
}

func (c resolvedContact) displayLabel() string {
	name := c.fullName
	if name == "" {
		name = c.firstName
	}
	if name == "" {
		name = c.pushName
	}
	if name == "" {
		name = c.businessName
	}
	if name == "" {
		name = "(unnamed)"
	}
	if c.redactedPhone != "" {
		return fmt.Sprintf("%s (%s)", name, c.redactedPhone)
	}
	return name
}

// errContactNotFound / errContactAmbiguous are sentinel-ish errors that
// resolveRecipientToJID returns so handleSend can map them to 400s with the
// exact error text the JARVIS confirm-gate surfaces to the user. They carry
// the query and (for ambiguous) the candidate list.
type errContactNotFound struct{ query string }

func (e *errContactNotFound) Error() string {
	return fmt.Sprintf("no WhatsApp contact matches %q", e.query)
}

type errContactAmbiguous struct {
	query      string
	candidates []resolvedContact
}

func (e *errContactAmbiguous) Error() string {
	// Cap the candidate list so the error body stays small even if a
	// name matches dozens of rows. Six is enough for a human to skim.
	const cap = 6
	labels := make([]string, 0, len(e.candidates))
	for i, c := range e.candidates {
		if i == cap {
			labels = append(labels, fmt.Sprintf("… and %d more", len(e.candidates)-cap))
			break
		}
		labels = append(labels, c.displayLabel())
	}
	return fmt.Sprintf("ambiguous WhatsApp contact %q — matched: %s", e.query, strings.Join(labels, "; "))
}

// resolveRecipientToJID is the send-path recipient resolver. It preserves the
// two existing recipient forms (raw '@'-JID, bare intl phone number) and adds
// a smart, tiered name → JID lookup against whatsmeow_contacts.
//
// The name path gathers candidates with a broad LIKE query (exact + first-token
// + prefix + interior-word patterns), then ranks each distinct their_jid by its
// best match tier in Go: exact > first-token > prefix > contains. We take the
// set of distinct JIDs at the highest tier present; exactly one → send, more
// than one → errContactAmbiguous (ask the user, never guess), zero rows →
// errContactNotFound. This makes "Emir" resolve to "Emir Ahmed" (a first-token
// match) while still surfacing genuine ambiguity. The bridge's msgDB handle
// points at the same SQLite file whatsmeow uses for its session store, so the
// contacts table lives alongside our capture tables — no second connection.
func (b *bridge) resolveRecipientToJID(ctx context.Context, recipient string) (types.JID, error) {
	recipient = strings.TrimSpace(recipient)
	if recipient == "" {
		return types.JID{}, fmt.Errorf("empty recipient")
	}
	if strings.Contains(recipient, "@") {
		return types.ParseJID(recipient)
	}
	if looksLikePhoneNumber(recipient) {
		// Preserve the original phone-number branch verbatim: only "+" is
		// stripped. Separator normalization is out of scope for this unit.
		number := strings.TrimPrefix(recipient, "+")
		return types.NewJID(number, types.DefaultUserServer), nil
	}
	// Name path — query whatsmeow_contacts. Case-insensitive match against
	// the four name-bearing columns. If msgDB is nil (defensive; shouldn't
	// happen in bundled use) surface a clear error.
	if b.msgDB == nil {
		return types.JID{}, fmt.Errorf("contact lookup unavailable: no contacts database")
	}
	lowered := strings.ToLower(recipient)
	esc := escapeLike(lowered)
	// LIKE patterns feeding the broad candidate fetch (all matched against the
	// lowered column, ESCAPE '\'):
	//   exact           -> q          (also covered by the '=' terms)
	//   first-token     -> q || ' %'  (query is the first whitespace token)
	//   prefix          -> q || '%'   (name starts with query)
	//   interior word   -> '% ' || q || ' %'
	//   last word       -> '% ' || q
	// The Go scorer (scoreContactTier) does the precise tier assignment; these
	// patterns just cast a wide enough net to bring the rows back.
	firstTokenPat := esc + " %"
	prefixPat := esc + "%"
	interiorPat := "% " + esc + " %"
	lastWordPat := "% " + esc
	rows, err := b.msgDB.QueryContext(ctx, `
		SELECT their_jid,
		       COALESCE(full_name, ''),
		       COALESCE(first_name, ''),
		       COALESCE(push_name, ''),
		       COALESCE(business_name, ''),
		       COALESCE(redacted_phone, '')
		FROM whatsmeow_contacts
		WHERE LOWER(COALESCE(full_name, '')) = ?
		   OR LOWER(COALESCE(first_name, '')) = ?
		   OR LOWER(COALESCE(push_name, '')) = ?
		   OR LOWER(COALESCE(business_name, '')) = ?
		   OR LOWER(COALESCE(full_name, ''))     LIKE ? ESCAPE '\'
		   OR LOWER(COALESCE(full_name, ''))     LIKE ? ESCAPE '\'
		   OR LOWER(COALESCE(full_name, ''))     LIKE ? ESCAPE '\'
		   OR LOWER(COALESCE(full_name, ''))     LIKE ? ESCAPE '\'
		   OR LOWER(COALESCE(push_name, ''))     LIKE ? ESCAPE '\'
		   OR LOWER(COALESCE(push_name, ''))     LIKE ? ESCAPE '\'
		   OR LOWER(COALESCE(push_name, ''))     LIKE ? ESCAPE '\'
		   OR LOWER(COALESCE(push_name, ''))     LIKE ? ESCAPE '\'
		   OR LOWER(COALESCE(business_name, '')) LIKE ? ESCAPE '\'
		   OR LOWER(COALESCE(business_name, '')) LIKE ? ESCAPE '\'
		   OR LOWER(COALESCE(business_name, '')) LIKE ? ESCAPE '\'
	`,
		lowered, lowered, lowered, lowered,
		firstTokenPat, prefixPat, interiorPat, lastWordPat,
		firstTokenPat, prefixPat, interiorPat, lastWordPat,
		prefixPat, interiorPat, lastWordPat,
	)
	if err != nil {
		return types.JID{}, fmt.Errorf("contact lookup failed: %w", err)
	}
	defer rows.Close()

	// Collapse to one entry per distinct their_jid, keeping the row that
	// achieved the highest match tier for that JID.
	seen := map[string]resolvedContact{}
	for rows.Next() {
		var c resolvedContact
		if err := rows.Scan(&c.jid, &c.fullName, &c.firstName, &c.pushName, &c.businessName, &c.redactedPhone); err != nil {
			return types.JID{}, fmt.Errorf("contact scan failed: %w", err)
		}
		c.tier = scoreContactTier(c, lowered)
		if c.tier == matchNone {
			// LIKE over-matched (shouldn't normally happen given the
			// patterns), but never treat a non-scoring row as a candidate.
			continue
		}
		if existing, ok := seen[c.jid]; ok {
			if c.tier > existing.tier {
				seen[c.jid] = c
			}
			continue
		}
		seen[c.jid] = c
	}
	if err := rows.Err(); err != nil {
		return types.JID{}, fmt.Errorf("contact lookup iteration failed: %w", err)
	}
	if len(seen) == 0 {
		return types.JID{}, &errContactNotFound{query: recipient}
	}

	// Find the highest tier present, then collect the distinct JIDs at it.
	topTier := matchNone
	for _, c := range seen {
		if c.tier > topTier {
			topTier = c.tier
		}
	}
	top := make([]resolvedContact, 0, len(seen))
	for _, c := range seen {
		if c.tier == topTier {
			top = append(top, c)
		}
	}
	if len(top) == 1 {
		return types.ParseJID(top[0].jid)
	}
	// Multiple distinct JIDs share the top tier — genuinely ambiguous, ask the
	// user rather than guessing. Surface just the top-tier candidates.
	return types.JID{}, &errContactAmbiguous{query: recipient, candidates: top}
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
	jid, err := b.resolveRecipientToJID(r.Context(), req.Recipient)
	if err != nil {
		// Not-found and ambiguous are user-actionable — surface their
		// error text verbatim so the desktop confirm-gate / JARVIS can
		// tell the user what went wrong instead of a false success.
		var notFound *errContactNotFound
		var ambiguous *errContactAmbiguous
		if errors.As(err, &notFound) || errors.As(err, &ambiguous) {
			writeJSON(w, http.StatusBadRequest, map[string]any{"ok": false, "error": err.Error()})
			return
		}
		writeJSON(w, http.StatusBadRequest, map[string]any{"ok": false, "error": fmt.Sprintf("invalid recipient: %v", err)})
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()
	resp, err := b.client.SendMessage(ctx, jid, &waE2E.Message{
		Conversation: proto.String(req.Message),
	})
	if err != nil {
		writeJSON(w, http.StatusBadGateway, map[string]any{"ok": false, "error": fmt.Sprintf("send failed: %v", err)})
		return
	}
	// Mirror the outgoing message into the capture store. SendMessage does not
	// fire events.Message on the sending client, so we insert here. Failure
	// must not fail the send response — log only.
	go func(chat types.JID, resp whatsmeow.SendResponse, body string) {
		senderUser := ""
		if id := b.client.Store.ID; id != nil {
			senderUser = id.User
		}
		name := b.chatDisplayName(context.Background(), chat, "")
		chatJID := chat.String()
		if err := b.upsertChat(chatJID, name, resp.Timestamp); err != nil {
			log.Printf("capture(send): upsertChat %s: %v", chatJID, err)
			return
		}
		if err := b.storeMessage(resp.ID, chatJID, senderUser, body, "", resp.Timestamp, true); err != nil {
			log.Printf("capture(send): storeMessage %s/%s: %v", chatJID, resp.ID, err)
		}
	}(jid, resp, req.Message)
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (b *bridge) handleHealth(w http.ResponseWriter, _ *http.Request) {
	state, reason, lastConn, lastDisc, degraded := b.stateSnapshot()
	// Timestamps are RFC3339 UTC strings, or "" when never set, so the desktop
	// can render/compare them without a zero-time sentinel.
	lastConnStr := ""
	if !lastConn.IsZero() {
		lastConnStr = lastConn.UTC().Format(time.RFC3339)
	}
	lastDiscStr := ""
	if !lastDisc.IsZero() {
		lastDiscStr = lastDisc.UTC().Format(time.RFC3339)
	}
	writeJSON(w, http.StatusOK, map[string]any{
		// Backward-compat booleans the desktop polls today — KEEP.
		"connected": b.client.IsConnected(),
		"loggedIn":  b.client.IsLoggedIn(),
		// Truthful lifecycle bundle (Phase 1).
		"state":            state,
		"reason":           reason,
		"lastConnected":    lastConnStr,
		"lastDisconnected": lastDiscStr,
		"degraded":         degraded,
	})
}

// handleLogout clears the paired device from the whatsmeow store and exits the
// process. The Rust supervisor (apps/desktop/src-tauri/src/whatsapp.rs) respawns
// the sidecar on Terminated with capped linear backoff; the fresh process sees
// Store.ID == nil and re-enters the QR pairing flow (main.go:client.Store.ID ==
// nil branch), which re-fires the existing {"event":"qr"} stdout events.
func (b *bridge) handleLogout(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]any{"ok": false, "error": "method not allowed"})
		return
	}
	if b.client.Store.ID == nil {
		writeJSON(w, http.StatusOK, map[string]any{"ok": true, "note": "already logged out"})
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 15*time.Second)
	defer cancel()
	if err := b.client.Logout(ctx); err != nil && !errors.Is(err, whatsmeow.ErrNotLoggedIn) {
		writeJSON(w, http.StatusBadGateway, map[string]any{"ok": false, "error": fmt.Sprintf("logout failed: %v", err)})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
	// Let the response flush, then exit so the supervisor restarts us into the
	// QR branch on a fresh (device-less) store.
	go func() {
		time.Sleep(300 * time.Millisecond)
		log.Printf("logout complete; exiting for supervisor respawn")
		os.Exit(0)
	}()
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

// startPairing runs the QR-channel pairing flow in-process: it pulls the QR
// channel BEFORE connecting, connects, and pumps the channel's code/success/
// timeout items into setQR/setReady. It is callable both from main (first run)
// and, in a later phase, from a logged-out state so a re-pair never needs a
// process bounce. Initial connect failure is NOT fatal — with
// InitialAutoReconnect the client will come up when the network does.
func (b *bridge) startPairing(ctx context.Context) error {
	qrChan, err := b.client.GetQRChannel(ctx)
	if err != nil {
		return fmt.Errorf("get QR channel: %w", err)
	}
	if err := b.client.Connect(); err != nil {
		log.Printf("pairing connect failed (will auto-reconnect): %v", err)
		b.setState("reconnecting", "initial_connect_failed")
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
	return nil
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
		state:      "connecting",
	}

	// Configure reconnection behavior. EnableAutoReconnect stays on (default) so
	// whatsmeow recovers transient drops without a bespoke loop. InitialAutoReconnect
	// makes a boot-time network blip enter that loop instead of erroring out, so
	// a daemon can start before the network is up. AutoReconnectHook logs each
	// failed attempt, keeps state truthful, and clamps whatsmeow's unbounded
	// linear backoff (AutoReconnectErrors*2s): when the NEXT delay would exceed
	// 60s we pin AutoReconnectErrors to 30 (→ ~60s). It ALWAYS returns true;
	// giving up is launchd's/the supervisor's job, never the client's.
	client.EnableAutoReconnect = true
	client.InitialAutoReconnect = true
	client.AutoReconnectHook = func(err error) bool {
		b.setState("reconnecting", "")
		log.Printf("lifecycle: auto-reconnect attempt failed (errors=%d): %v", client.AutoReconnectErrors, err)
		// AutoReconnectErrors was already incremented before this hook fires;
		// the next delay is AutoReconnectErrors*2s. Clamp so we never wait more
		// than ~60s between attempts.
		if client.AutoReconnectErrors*2 > 60 {
			client.AutoReconnectErrors = 30
		}
		return true
	}

	// Register the capture + lifecycle handler BEFORE either connect branch so no
	// messages or lifecycle events are missed on the already-paired path.
	client.AddEventHandler(b.handleEvent)

	if client.Store.ID == nil {
		// Not paired: run the in-process pairing flow.
		if err := b.startPairing(ctx); err != nil {
			log.Fatalf("failed to start pairing: %v", err)
		}
	} else {
		// Already paired: just connect; the session auto-reconnects. Do NOT
		// fatal on failure — with InitialAutoReconnect the client enters the
		// background reconnect loop, so log, mark reconnecting, and serve HTTP.
		if err := client.Connect(); err != nil {
			log.Printf("initial connect failed (will auto-reconnect): %v", err)
			b.setState("reconnecting", "initial_connect_failed")
		} else {
			b.setReady()
		}
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/api/send", b.handleSend)
	mux.HandleFunc("/api/health", b.handleHealth)
	mux.HandleFunc("/api/qr", b.handleQR)
	mux.HandleFunc("/api/logout", b.handleLogout)

	addr := ":" + port
	log.Printf("whatsapp-bridge listening on %s (store: %s)", addr, dbPath)
	srv := &http.Server{Addr: addr, Handler: mux}
	if err := srv.ListenAndServe(); err != nil {
		log.Fatalf("http server error: %v", err)
	}
	client.Disconnect()
}
