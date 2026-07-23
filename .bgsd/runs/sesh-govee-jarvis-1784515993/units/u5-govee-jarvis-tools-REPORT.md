# u5-govee-jarvis-tools REPORT

**Run:** sesh-govee-jarvis-1784515993  
**Branch:** `bgsd/govee-u5-tools`  
**Base:** `origin/bgsd/govee-integration` (`a671fc08`)  
**Worktree:** `/Users/filippofonseca/Developer/Projects/hyperpolymath-v2-wt-govee-u5-tools`  
**Status:** complete

## Summary

Jarvis tools `list_lights` + `control_lights` with Zod-discriminated `LightCommand`, device name/default resolution, BYOK `govee` → `GOVEE_API_KEY` client wiring, and executor/run-turn dispatch.

## Commits

| SHA | Message |
|-----|---------|
| `16edacc3` | feat(jarvis-core): add list_lights and control_lights tools |
| `cce6bd44` | feat(govee): add key and device resolution helpers |
| `61c00023` | feat(jarvis): wire list_lights and control_lights executors |
| `7a62418f` | test(govee): cover light tool Zod schemas and device resolution |

## Files

### jarvis-core
- `packages/jarvis-core/src/tools/list-lights.ts`
- `packages/jarvis-core/src/tools/control-lights.ts` — discriminated `LightCommand`
- `packages/jarvis-core/src/tools/index.ts` — registration (before `computer_use`)
- `packages/jarvis-core/src/types.ts`, `tool-names.ts`, `executor/interface.ts`, `index.ts`
- `packages/jarvis-core/src/routines/labels.ts`, `personality.ts` (tool rules only; no Studio widget)
- `packages/jarvis-core/tests/lights-tools.test.ts` (+ count updates in related tests)

### web
- `apps/web/lib/govee/resolve-target.ts` — pure `resolveTargetDevice` + `packRgb`
- `apps/web/lib/govee/resolve.ts` — `resolveGoveeClient` / `loadUserGoveeDevices` (BYOK → env)
- `apps/web/lib/govee/index.ts`
- `apps/web/lib/jarvis/executor.ts` — `listLights` / `controlLights`
- `apps/web/lib/jarvis/run-turn.ts` — validators + dispatch
- `apps/web/lib/jarvis/routine-runner.ts` — param validators
- `apps/web/lib/jarvis/ack-phrases.ts`
- `apps/web/lib/govee/__tests__/resolve.test.ts`

## Contract notes

- **Device resolution:** exact case-insensitive name → unique partial → sole device → single `isDefault` → actionable ambiguous error (names the candidates).
- **API key:** `getUserKeyOrNull(userId, "govee")` then `GOVEE_API_KEY`.
- **Commands mapped** to `GoveeClient` methods; scene/DIY resolved by name (client passes option values verbatim).
- **list_lights** reads `user_govee_devices` only (no per-device `getState` — avoids rate-limit hammering).
- Studio HOME widget / catalog / ANSWER-AND-SHOW left to **u6**.

## Verification

```bash
cd packages/jarvis-core && pnpm typecheck   # pass
cd packages/jarvis-core && pnpm test lights-tools.test.ts tools.test.ts computer-control-tools.test.ts ask-clarification.test.ts
# 72 passed

cd apps/web && pnpm typecheck               # pass
cd apps/web && pnpm exec vitest run lib/govee/__tests__/resolve.test.ts
# 8 passed
```

## Blockers

None. Settings UI (u4) and Studio home widget (u6) are out of scope; tools work once devices exist in `user_govee_devices` and a key is available.
