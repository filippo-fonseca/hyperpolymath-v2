package main

import (
	"context"
	"database/sql"
	"errors"
	"testing"

	_ "modernc.org/sqlite"
)

// --- pure matching helpers ---------------------------------------------------

func TestLevenshtein(t *testing.T) {
	cases := []struct {
		a, b string
		want int
	}{
		{"", "", 0},
		{"mama", "mama", 0},
		{"mama", "mamma", 1}, // the reported bug: one inserted 'm'
		{"emir", "emir ahmed", 6},
		{"kitten", "sitting", 3},
		{"abc", "", 3},
	}
	for _, c := range cases {
		if got := levenshtein(c.a, c.b); got != c.want {
			t.Errorf("levenshtein(%q,%q)=%d want %d", c.a, c.b, got, c.want)
		}
	}
}

func TestIsFuzzyMatch(t *testing.T) {
	if !isFuzzyMatch("mamma", "mama") {
		t.Error(`"mama" should fuzzy-match "mamma"`)
	}
	if !isFuzzyMatch("mamma rossi", "mama") {
		t.Error(`"mama" should fuzzy-match first token of "mamma rossi"`)
	}
	if isFuzzyMatch("isabella", "mama") {
		t.Error(`"mama" must NOT fuzzy-match "isabella"`)
	}
	if isFuzzyMatch("ab", "xy") {
		t.Error("2-char queries should not fuzzy-match (threshold 0)")
	}
}

func TestScoreContactTier(t *testing.T) {
	c := resolvedContact{fullName: "Emir Ahmed", firstName: "Emir"}
	if got := scoreContactTier(c, "emir"); got != matchExact {
		t.Errorf("first_name exact should be matchExact, got %d", got)
	}
	if got := scoreContactTier(resolvedContact{fullName: "Emir Ahmed"}, "emir"); got != matchFirstToken {
		t.Errorf("first token should be matchFirstToken, got %d", got)
	}
	if got := scoreContactTier(resolvedContact{fullName: "MAMMA"}, "mama"); got != matchFuzzy {
		t.Errorf("MAMMA vs mama should be matchFuzzy, got %d", got)
	}
	if got := scoreContactTier(resolvedContact{fullName: "Isabella"}, "mama"); got != matchNone {
		t.Errorf("unrelated name should be matchNone, got %d", got)
	}
	// A contact's SELF-reported push_name matching exactly ranks BELOW a saved
	// full/first-name token match. This is what breaks the real tie where "Emir"
	// matched both your saved "Emir Ahmed" and a bare @lid whose push_name is
	// also "Emir": the saved contact must win so the send resolves (not goes
	// ambiguous) and reaches the right person.
	if got := scoreContactTier(resolvedContact{pushName: "Emir"}, "emir"); got != matchPrefix {
		t.Errorf("push_name exact should be matchPrefix (below saved names), got %d", got)
	}
	savedTier := scoreContactTier(resolvedContact{fullName: "Emir Ahmed"}, "emir")
	pushTier := scoreContactTier(resolvedContact{pushName: "Emir"}, "emir")
	if savedTier <= pushTier {
		t.Errorf("saved-name match (%d) must outrank push-name match (%d)", savedTier, pushTier)
	}
}

// --- alias expansion ---------------------------------------------------------

func TestExpandAlias(t *testing.T) {
	aliases := map[string]string{"mama": "MAMMA", "dad": "Papà"}
	if got := expandAlias(aliases, "Mama"); got != "MAMMA" {
		t.Errorf("alias should be case-insensitive; got %q", got)
	}
	if got := expandAlias(aliases, "  mama "); got != "MAMMA" {
		t.Errorf("alias should trim; got %q", got)
	}
	if got := expandAlias(aliases, "Rohan"); got != "Rohan" {
		t.Errorf("non-alias should pass through; got %q", got)
	}
	if got := expandAlias(nil, "mama"); got != "mama" {
		t.Errorf("nil alias map should pass through; got %q", got)
	}
}

// --- chooseTopContact decision ----------------------------------------------

func TestChooseTopContact(t *testing.T) {
	// Single sub-exact (first-token) candidate resolves — "Emir" → "Emir Ahmed".
	seen := map[string]resolvedContact{
		"111@s.whatsapp.net": {jid: "111@s.whatsapp.net", fullName: "Emir Ahmed", tier: matchFirstToken},
	}
	got, err := chooseTopContact(seen, "emir")
	if err != nil {
		t.Fatalf("single partial match should resolve, got err %v", err)
	}
	if got.jid != "111@s.whatsapp.net" {
		t.Errorf("wrong jid: %s", got.jid)
	}

	// Two distinct JIDs at the top tier → ambiguous (never guess).
	seen = map[string]resolvedContact{
		"111@s.whatsapp.net": {jid: "111@s.whatsapp.net", fullName: "Emir Ahmed", tier: matchFirstToken},
		"222@s.whatsapp.net": {jid: "222@s.whatsapp.net", fullName: "Emir Khan", tier: matchFirstToken},
	}
	_, err = chooseTopContact(seen, "emir")
	var amb *errContactAmbiguous
	if !errors.As(err, &amb) {
		t.Fatalf("two top-tier candidates should be ambiguous, got %v", err)
	}
	if len(amb.candidates) != 2 {
		t.Errorf("ambiguous should carry 2 candidates, got %d", len(amb.candidates))
	}

	// A weaker tier is dominated by a stronger one → single strong wins.
	seen = map[string]resolvedContact{
		"111@s.whatsapp.net": {jid: "111@s.whatsapp.net", fullName: "Emir Ahmed", tier: matchExact},
		"222@s.whatsapp.net": {jid: "222@s.whatsapp.net", fullName: "Emiro", tier: matchFuzzy},
	}
	got, err = chooseTopContact(seen, "emir")
	if err != nil || got.jid != "111@s.whatsapp.net" {
		t.Fatalf("stronger tier should win uniquely, got %v / %s", err, got.jid)
	}

	// Empty → not found.
	_, err = chooseTopContact(map[string]resolvedContact{}, "ghost")
	var nf *errContactNotFound
	if !errors.As(err, &nf) {
		t.Fatalf("empty set should be not-found, got %v", err)
	}
}

// --- integration: resolveRecipientToJID against an in-memory contacts DB -----

func newTestBridge(t *testing.T) *bridge {
	t.Helper()
	db, err := sql.Open("sqlite", "file::memory:?cache=shared")
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	// Minimal whatsmeow_contacts shape (see whatsmeow 00-latest-schema.sql).
	_, err = db.Exec(`CREATE TABLE whatsmeow_contacts (
		our_jid TEXT, their_jid TEXT,
		first_name TEXT, full_name TEXT, push_name TEXT,
		business_name TEXT, redacted_phone TEXT,
		PRIMARY KEY (our_jid, their_jid));`)
	if err != nil {
		t.Fatalf("create table: %v", err)
	}
	t.Cleanup(func() { db.Close() })
	// client left nil: selfUser()/ourJID() are nil-safe and return "".
	return &bridge{msgDB: db}
}

func insertContact(t *testing.T, b *bridge, ourJID, theirJID, full, first, push string) {
	t.Helper()
	_, err := b.msgDB.Exec(
		`INSERT INTO whatsmeow_contacts(our_jid, their_jid, full_name, first_name, push_name) VALUES (?,?,?,?,?)`,
		ourJID, theirJID, full, first, push)
	if err != nil {
		t.Fatalf("insert contact: %v", err)
	}
}

func TestResolveRecipient_FuzzyFallback(t *testing.T) {
	b := newTestBridge(t)
	insertContact(t, b, "me@s.whatsapp.net", "39111@s.whatsapp.net", "MAMMA", "", "")
	jid, err := b.resolveRecipientToJID(context.Background(), "mama")
	if err != nil {
		t.Fatalf(`"mama" should fuzzy-resolve to "MAMMA", got err %v`, err)
	}
	if jid.User != "39111" {
		t.Errorf("resolved to wrong JID user %q", jid.User)
	}
}

func TestResolveRecipient_PartialFirstName(t *testing.T) {
	b := newTestBridge(t)
	insertContact(t, b, "me@s.whatsapp.net", "1555@s.whatsapp.net", "Emir Ahmed", "Emir", "")
	jid, err := b.resolveRecipientToJID(context.Background(), "Emir")
	if err != nil {
		t.Fatalf(`"Emir" should resolve to "Emir Ahmed", got %v`, err)
	}
	if jid.User != "1555" {
		t.Errorf("wrong JID user %q", jid.User)
	}
}

// The real-world Emir case: a contact YOU saved as "Emir Ahmed" (full_name)
// plus a separate bare @lid entry whose WhatsApp push_name also happens to be
// "Emir". Saying "Emir" must resolve UNIQUELY to the saved contact (not go
// ambiguous, and not pick the unroutable @lid) — and report that full name.
func TestResolveRecipient_PrefersSavedOverPush(t *testing.T) {
	b := newTestBridge(t)
	insertContact(t, b, "me@s.whatsapp.net", "12035085391@s.whatsapp.net", "Emir Ahmed", "", "Emir")
	insertContact(t, b, "me@s.whatsapp.net", "115921939120202@lid", "", "", "Emir")
	jid, name, err := b.resolveRecipientNamed(context.Background(), "Emir")
	if err != nil {
		t.Fatalf(`"Emir" should resolve to saved "Emir Ahmed", got %v`, err)
	}
	if jid.User != "12035085391" {
		t.Errorf("should resolve to the saved phone JID, got %q", jid.String())
	}
	if name != "Emir Ahmed" {
		t.Errorf("should report the saved full name for read-back, got %q", name)
	}
}

func TestResolveRecipient_Alias(t *testing.T) {
	b := newTestBridge(t)
	b.aliases = map[string]string{"mommy": "MAMMA"}
	insertContact(t, b, "me@s.whatsapp.net", "39111@s.whatsapp.net", "MAMMA", "", "")
	jid, err := b.resolveRecipientToJID(context.Background(), "mommy")
	if err != nil {
		t.Fatalf(`alias "mommy"→"MAMMA" should resolve, got %v`, err)
	}
	if jid.User != "39111" {
		t.Errorf("wrong JID user %q", jid.User)
	}
}

func TestResolveRecipient_NotFound(t *testing.T) {
	b := newTestBridge(t)
	insertContact(t, b, "me@s.whatsapp.net", "1555@s.whatsapp.net", "Rohan Sharma", "Rohan", "")
	_, err := b.resolveRecipientToJID(context.Background(), "Zebediah")
	var nf *errContactNotFound
	if !errors.As(err, &nf) {
		t.Fatalf("unknown name should be not-found, got %v", err)
	}
}

func TestResolveRecipient_Ambiguous(t *testing.T) {
	b := newTestBridge(t)
	insertContact(t, b, "me@s.whatsapp.net", "1@s.whatsapp.net", "Emir Ahmed", "Emir", "")
	insertContact(t, b, "me@s.whatsapp.net", "2@s.whatsapp.net", "Emir Khan", "Emir", "")
	_, err := b.resolveRecipientToJID(context.Background(), "Emir")
	var amb *errContactAmbiguous
	if !errors.As(err, &amb) {
		t.Fatalf("two Emirs should be ambiguous, got %v", err)
	}
}

func TestResolveRecipient_PhoneAndJIDPassthrough(t *testing.T) {
	b := newTestBridge(t)
	jid, err := b.resolveRecipientToJID(context.Background(), "+14155551234")
	if err != nil || jid.User != "14155551234" {
		t.Fatalf("phone passthrough failed: %v / %q", err, jid.User)
	}
	jid, err = b.resolveRecipientToJID(context.Background(), "1555@s.whatsapp.net")
	if err != nil || jid.User != "1555" {
		t.Fatalf("JID passthrough failed: %v / %q", err, jid.User)
	}
}
