# Conductor Steering Directive

- Run: sesh-1783963573841
- Unit: unit-landing-restyle-9f2b
- Scale: feature
- Updated: 2026-07-13T20:44:47.012Z

## Required Checkpoints
- before implementation
- after planning
- after every commit
- on a blocker or assumption
- before verification
- after every verification result

## Latest Direction
A1 was RIGHT and the fault was the Conductor's: ambient-layer was closed but never merged. FIXED: rehearsal now carries components/ui/ambient (AmbientGlow, FocalOrb) plus the AppShell whisper mount. Merge rehearsal/sesh-1783963573841 and REPLACE your landing-local AmbientGlow/FocalOrb with the canonical ui/ambient primitives (extend via props/composition if the hero needs more drama; do not fork). A2 printed-plate hero AFFIRMED. A3 (brand HudCoreBubble as THE orb) is an inspired call, affirmed with enthusiasm. A4 affirmed.
