# sesh-mobile-sd-overhaul

**Prompt:** Better, more usable mobile app — Spacedrive UI, Google login (no device-code paste), Jarvis chat quality, max feature parity. Staging branch → PR into `next`. Conductor = this cloud agent (not Fable).

**Scale:** feature  
**Branch:** `cursor/mobile-sd-overhaul-d8ce`  
**Base / integration:** `next`  
**Epic:** #319

## Assumptions (plane / uninterrupted)

1. Google OAuth via Supabase is primary auth; `hpd_` remains advanced fallback in settings.
2. Server dual-auth: extend existing bearer validators so all `/api/device/*` + `/api/jarvis/*` accept JWT without per-route rewrites.
3. Mobile discovers public Supabase URL/anon key via `/api/mobile/bootstrap` from the configured server URL.
4. UI mirrors desktop sd tokens (PR #303), dark-only (same D2 as desktop/JARVIS).
5. Feature parity priority: Calendar → Today → Areas/Projects CRUD → Search. Wiki/nutrition/insights deferred.

## Units

| id | issue | status |
|----|-------|--------|
| u1-theme | TBD | pending |
| u2-dual-auth | TBD | pending |
| u3-google-auth | TBD | pending |
| u4-shell | TBD | pending |
| u5-jarvis | TBD | pending |
| u6-features | TBD | pending |

## Reference

- `apps/desktop/src/styles/sd-tokens.css`
- `apps/desktop/src/studio/tokens.ts`
- `docs/DESIGN-SYSTEM.md`
