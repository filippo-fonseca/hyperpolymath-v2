# sesh-mobile-sd-overhaul

**Prompt:** Better, more usable mobile app — Spacedrive UI, Google login (no device-code paste), Jarvis chat quality, max feature parity. Staging branch → PR into `next`. Conductor = this cloud agent (not Fable).

**Scale:** feature  
**Branch:** `cursor/mobile-sd-overhaul-d8ce`  
**Base / integration:** `next`  
**Epic:** #319  
**PR:** #326 → `next`

## Assumptions (plane / uninterrupted)

1. Google OAuth via Supabase is primary auth; `hpd_` remains advanced fallback in settings.
2. Server dual-auth: extend existing bearer validators so all `/api/device/*` + `/api/jarvis/*` accept JWT without per-route rewrites.
3. Mobile discovers public Supabase URL/anon key via `/api/mobile/bootstrap` from the configured server URL.
4. UI mirrors desktop sd tokens (PR #303), dark-only (same D2 as desktop/JARVIS).
5. Feature parity priority: Calendar → Today → Areas/Projects CRUD → Search. Wiki/nutrition/insights deferred.

## Units

| id | issue | status | notes |
|----|-------|--------|-------|
| u1-theme | #320 | done | `bec2255d` |
| u2-dual-auth | #321 | done | `e2585c5d` |
| u3-google-auth | #322 | done | `c6ac7142` |
| u4-shell | #323 | done | `e0407bb3` + `5b77d675` |
| u5-jarvis | #324 | done | `bd88b30d` |
| u6-features | #325 | done | calendar/today/more + areas CRUD + search |

## Reference

- `apps/desktop/src/styles/sd-tokens.css`
- `apps/desktop/src/studio/tokens.ts`
- `docs/DESIGN-SYSTEM.md`

## Follow-ups / human setup

- Add Supabase Auth redirect: `jarvis://auth/callback`
- EAS rebuild to pick up scheme + new native deps
- Deferred: wiki, nutrition, insights, full screen-by-screen sd polish on Tasks/Habits/Captures row chrome
