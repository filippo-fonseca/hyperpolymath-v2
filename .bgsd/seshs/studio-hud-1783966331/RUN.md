# bgsd session — `studio-hud-1783966331`

**Request:** Studio HUD fix sweep (post-PR-#274 native Tauri Studio), from live user testing on 2026-07-13:
1. Chat transcript ordering wrong — user/JARVIS turns render out of order; must read like a proper text conversation.
2. Duplicate widgets spawned for a single query (World Cup search opened two identical widgets).
3. Widget web content (popups etc.) overflows widget bounds.
4. Hand-cursor cannot operate INSIDE widgets (in-widget browser or any widget content) — pointer events don't reach widget internals.
5. Hand-based clicking unreliable — click gesture interpreted as mouse movement; need robust click gesture (likely cursor-anchoring on pinch).
6. Hand-cursor scrolling broken within widgets and everywhere.
7. Widget resizing broken (added mid-kickoff by user).

Plus: extensive research on hand-cursor / MediaPipe gesture interaction patterns; final deliverable includes a full user-facing gesture breakdown.

**Scale:** feature · **Routing:** adaptive · **Verification:** full ladder (gesture units get code-verify + synthetic pointer tests; final gesture feel needs human smoke).
**Conductor:** Kiwi on Fable 5 (session model). Build/eval lanes: Opus 4.8 direct.
**Integration branch:** `bgsd/studio-hud` off `next` (per big-builds-integrate-on-dedicated-branch rule). `next → main` human-only.

**Doctor:** READY (claude CLI + subscription + GSD all green).

## Status
- [x] Doctor gate
- [x] Scale/routing/verification selected (Feature / adaptive / full ladder)
- [ ] Scouts: implementation deep-dive + gesture-interaction research
- [ ] Decomposition + unit briefs
- [x] Epic issue: [#279](https://github.com/filippo-fonseca/hyperpolymath-v2/issues/279)
- [ ] Per-unit GitHub issues (after decomposition)
- [ ] Wave 1 build
- [ ] Loop 1 verify→fix
- [ ] Merge to `bgsd/studio-hud` + Loop 2
- [ ] Review gate + landing PR
- [ ] Gesture breakdown doc for user

## Notes
- Stack currently running from the main checkout on `next` (web :3000, jarvis-desktop debug binary, local Supabase). Workers must NOT touch the main checkout; isolated worktrees only.
- Live repro observed by user: "Who plays in the world?" partial utterance answered AFTER the full question's answer; two identical World Cup widgets; popups overflowing widget; no pointer inside widgets; clicks read as moves; scroll broken; resize broken.
