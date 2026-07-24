# Handoff: Mobile SD overhaul (Google login + Spacedrive UI)

**Status:** ready to test locally · staging PR open  
**Date:** 2026-07-23  
**Sesh:** `sesh-mobile-sd-overhaul`  
**Epic:** [#319](https://github.com/filippo-fonseca/hyperpolymath-v2/issues/319)  
**PR:** [#326](https://github.com/filippo-fonseca/hyperpolymath-v2/pull/326) → base **`next`**

---

## 1. Branch & links

| What | Value |
|------|--------|
| Working branch | `cursor/mobile-sd-overhaul-d8ce` |
| Base / merge target | `next` (integration branch) |
| PR | https://github.com/filippo-fonseca/hyperpolymath-v2/pull/326 |
| Epic | https://github.com/filippo-fonseca/hyperpolymath-v2/issues/319 |
| Unit issues | #320 theme · #321 dual-auth · #322 Google login · #323 shell · #324 Jarvis · #325 features |
| Design reference | `docs/DESIGN-SYSTEM.md` + desktop tokens from PR #303 |
| Sesh record | `.bgsd/seshs/sesh-mobile-sd-overhaul/RUN.md` |

```bash
git fetch origin
git checkout cursor/mobile-sd-overhaul-d8ce
git pull origin cursor/mobile-sd-overhaul-d8ce
pnpm install
```

---

## 2. Is web login still proper? (yes)

**Web Google sign-in is unchanged.** This work does **not** touch the cookie OAuth path.

| Surface | How you auth | Code path | Changed? |
|---------|--------------|-----------|----------|
| **Web app** (browser) | Google OAuth → cookies → `getClaims()` | `SignInButton` → `redirectTo: ${origin}/auth/callback` → `lib/auth/get-user.ts` | **No** |
| **Desktop** | `hpd_…` device token | `validateDesktopBearer` (hpd_ branch) | Still works (same path first) |
| **Mobile (new)** | Google OAuth → Supabase access JWT in `Authorization: Bearer` | `validateDesktopBearer` (JWT branch via `auth.admin.getUser`) | **Added** |
| **Mobile (fallback)** | Paste `hpd_…` | same hpd_ branch as desktop | Still works |

What we changed on the server:

- Extended **only** `apps/web/lib/auth/desktop-bearer.ts` so that if the bearer is **not** `hpd_…`, it tries to validate a Supabase access JWT.
- Added `GET /api/mobile/bootstrap` (returns public `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY`).
- Added device routes for calendar / areas-projects mutations used by mobile.

Web pages, `(app)` layouts, and `/sign-in` still use **cookie sessions**. They never send an `Authorization: Bearer` header for normal browsing, so they never hit the new JWT branch.

### Supabase dashboard change is additive

You must **add** a redirect URI for the mobile scheme. Do **not** change Site URL or remove existing web callbacks.

- Keep: `https://hyperpolymath.com/auth/callback` (and local `http://localhost:3000/auth/callback` if you already have it)
- Add: `jarvis://auth/callback`
- Optionally add Expo Go URIs once you know them (see §5)

Changing redirect allow-list entries does not break web login as long as you leave the existing web URLs in place.

---

## 3. What shipped (quick map)

### Auth
- Login gate: Continue with Google (primary)
- Advanced: device token still available on login + Settings
- Session in SecureStore; API clients send JWT (or `hpd_` fallback)
- Server dual-auth on existing `/api/device/*` and `/api/jarvis/*` bearer routes

### UI
- sd tokens mirrored from desktop (`apps/mobile/src/theme.ts`)
- Space Grotesk + JetBrains Mono; EB Garamond logotype-only
- Tab shell: **Today · Tasks · Jarvis · Captures · More**

### Jarvis
- Transcript persistence, better history, stop/interrupt → `POST /api/jarvis/voice/cancel`

### Features
- Today dashboard, Calendar (upcoming), Search, Areas/Projects CRUD
- Habits + Training under **More**

---

## 4. Environment variables

### Web (`apps/web/.env.local`) — no *new* required vars

You already need these for a normal local web stack. Mobile JWT validation reuses them:

| Var | Role for this work |
|-----|--------------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Served to mobile via `/api/mobile/bootstrap` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Same (public; already in the browser bundle) |
| `SUPABASE_SERVICE_ROLE_KEY` | Used by `createAdminClient()` to validate mobile JWTs (`auth.getUser(jwt)`). **Already required** for other admin paths — not a new secret. |
| `DATABASE_URL` | Unchanged (Drizzle / device CRUD) |

**Mobile does not need `EXPO_PUBLIC_*` baked in.** On launch / sign-in it calls:

```http
GET {serverUrl}/api/mobile/bootstrap
→ { supabaseUrl, supabaseAnonKey }
```

So the only “mobile config” is the **Server URL** field on the login screen (defaults to `https://hyperpolymath.com`; for local use your Mac’s LAN URL).

### Optional / not required for Google login

| Var | Notes |
|-----|--------|
| Device token `hpd_…` | Fallback only; mint at web `/settings/desktop` |
| Extra Expo env files | Not required for this PR |

### Verify bootstrap once web is up

```bash
curl -s http://localhost:3000/api/mobile/bootstrap | jq .
# expect: { "supabaseUrl": "https://….supabase.co", "supabaseAnonKey": "eyJ…" }
```

If this 503s, `NEXT_PUBLIC_SUPABASE_*` are missing from the web env.

---

## 5. What you must do in Supabase (and Google) dashboards

### A. Supabase Auth → URL configuration

Open your project:

1. https://supabase.com/dashboard → your Hyperpolymath project  
2. **Authentication → URL Configuration**  
   (direct pattern: `https://supabase.com/dashboard/project/<PROJECT_REF>/auth/url-configuration`)

**Redirect URLs — add (do not remove existing):**

```
jarvis://auth/callback
```

If you test in **Expo Go**, also add whatever `makeRedirectUri` prints (often like `exp://192.168.x.x:8081/--/auth/callback`). Easiest way: temporarily `console.log` in the app, or after first failed login check the OAuth error / redirect URL in the browser.

**Site URL:** leave as production (or your usual value). Do **not** set Site URL to `jarvis://…`.

### B. Google Cloud OAuth client (only if redirects fail)

Supabase-hosted Google provider usually only needs the Supabase callback URL already configured. If Google rejects the redirect:

1. https://console.cloud.google.com/apis/credentials  
2. Open the OAuth 2.0 Client used by Supabase  
3. Ensure authorized redirect URIs still include Supabase’s callback  
   (`https://<PROJECT_REF>.supabase.co/auth/v1/callback`)  
4. You do **not** put `jarvis://` in Google’s console — Google talks to Supabase; Supabase then redirects to `jarvis://auth/callback`.

### C. Deploy note

JWT validation on **production** needs `SUPABASE_SERVICE_ROLE_KEY` set in Vercel (it already should be). Preview deploys of this branch need the same env as prod for mobile Google login against that preview URL.

---

## 6. Run locally — exact steps

### 6.1 Web API (required for mobile to talk to anything)

```bash
cd /path/to/hyperpolymath-v2
git checkout cursor/mobile-sd-overhaul-d8ce
pnpm install

# Ensure apps/web/.env.local has NEXT_PUBLIC_SUPABASE_*, SUPABASE_SERVICE_ROLE_KEY, DATABASE_URL, etc.
# (same file you already use for web — no new keys for this feature)

pnpm --filter web dev
# → http://localhost:3000
```

**Sanity checks (web login unaffected):**

1. Open http://localhost:3000/sign-in  
2. Continue with Google → should land back on the app via `/auth/callback` as before  
3. `curl -s http://localhost:3000/api/mobile/bootstrap | jq .` returns URL + anon key  

**Phone/simulator cannot use `localhost`.** Find your Mac LAN IP:

```bash
ipconfig getifaddr en0   # or en1; or System Settings → Network
```

Example server URL for the phone: `http://192.168.1.42:3000`

Allow inbound Node on that port (macOS firewall) if the phone can’t reach it.

### 6.2 Mobile (Expo)

```bash
cd apps/mobile
# from repo root after pnpm install is fine:
pnpm --filter mobile start
# or: cd apps/mobile && npx expo start
```

Then:

- **iOS Simulator:** press `i` in the Expo CLI  
- **Physical iPhone:** Expo Go **or** (better for `jarvis://` scheme) a **dev client / EAS build** — custom schemes are reliable in a native build; Expo Go uses `exp://…` redirects which you must also allowlist in Supabase  

On the **Login** screen:

1. Set **Server** to `http://<YOUR_LAN_IP>:3000` (local) or `https://hyperpolymath.com` (prod, after this branch is deployed)  
2. Tap **Continue with Google**  
3. Complete Google → app should open with session and show Today / Jarvis tabs  

**Fallback if OAuth redirect isn’t allowlisted yet:** expand “Use a device token instead”, paste an `hpd_…` from https://hyperpolymath.com/settings/desktop (or local `/settings/desktop`), continue.

### 6.3 Quick API auth smoke (optional)

With a Supabase access token from a signed-in session (or an `hpd_` token):

```bash
# Should be 200/400-with-body, not 401, when token is valid:
curl -s -o /dev/null -w "%{http_code}\n" \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"text":""}' \
  http://localhost:3000/api/jarvis/voice/text
```

`401` → token/server mismatch or service-role missing for JWT path.  
Empty-text `400` / handled response → auth worked.

### 6.4 Typecheck

```bash
pnpm --filter mobile typecheck
pnpm --filter web typecheck   # if you want extra confidence on server routes
```

---

## 7. Your checklist (do in order)

1. [ ] Checkout `cursor/mobile-sd-overhaul-d8ce` and `pnpm install`  
2. [ ] Confirm `apps/web/.env.local` still has `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`  
3. [ ] Supabase → Auth → URL Configuration → **add** `jarvis://auth/callback` (keep all existing web redirects)  
4. [ ] `pnpm --filter web dev` → verify **web** Google login still works at `/sign-in`  
5. [ ] `curl …/api/mobile/bootstrap` returns JSON  
6. [ ] `pnpm --filter mobile start` → set Server to LAN URL → **Continue with Google**  
7. [ ] Smoke: Today loads tasks, Jarvis text turn works, Calendar under More, Projects edit under More  
8. [ ] When happy: merge PR https://github.com/filippo-fonseca/hyperpolymath-v2/pull/326 into **`next`**  
9. [ ] After merge/deploy: EAS rebuild so TestFlight gets scheme + new native modules (`expo-auth-session`, fonts, etc.)  

---

## 8. Testing matrix (minimum)

| Case | Expected |
|------|----------|
| Web `/sign-in` Google | Unchanged success → app shell |
| Mobile Google → local web | Session stored; Today/Jarvis load |
| Mobile Google → prod (post-deploy) | Same against `https://hyperpolymath.com` |
| Mobile advanced `hpd_` | Still signs in without Google |
| Mobile Sign out | Returns to Login; web session on the same Google account unaffected |
| Desktop `hpd_` | Unchanged |

---

## 9. Risks / gotchas

1. **Redirect URI missing** → Google/Supabase succeeds then app never resumes; fix §5.  
2. **Server URL = localhost on device** → bootstrap fails; use LAN IP.  
3. **`SUPABASE_SERVICE_ROLE_KEY` missing** → JWT path returns unauthed (null); web cookies still fine; mobile Google API calls 401.  
4. **Expo Go vs dev build** — prefer a development build / EAS for `jarvis://`; Expo Go needs extra redirect allowlisting.  
5. **Merge target is `next`**, not `main` — per BGSD integration branch.

---

## 10. Out of scope / deferred

- Wiki, nutrition, insights on mobile  
- Deep per-row sd polish on every list cell  
- Changing web Site URL or web OAuth redirect  
- Removing desktop device-token flow  

---

## 11. Rollback

If anything feels wrong after merge to `next`:

- Revert the PR branch merge; web cookie auth never depended on the JWT branch.  
- Or temporarily remove `jarvis://auth/callback` from Supabase redirects (mobile Google stops; web unaffected).  

---

*Generated for Filippo’s local verification of PR #326 / sesh-mobile-sd-overhaul.*
