# Units — studio-hud-1783966331

Conductor decisions (oracle, recorded):
- **Keep the virtual-cursor architecture.** No enigo real-cursor hijack in v1: it would commandeer the user's physical pointer and demand macOS Accessibility permission. The scroll-IPC precedent (`studio_webview_scroll`) is mirrored for clicks instead (webview.eval inside the child). enigo stays a recorded fallback if eval-clicks prove insufficient.
- **Pinch is the trust anchor.** User reports pinch-hold grab/drag is the ONLY reliable gesture today. Its immediate-freeze-on-engage design (gesture-core.ts:871-878) is the pattern to generalize. Quick-pinch-release becomes the PRIMARY click (with pre-onset anchoring per research); palm-click stays as secondary. Pinch-hold grab timings/thresholds are user-validated: DO NOT TOUCH.
- U3/U4 seam: window CustomEvent `studio:gesture-interaction`, detail `{widgetId, kind:'resize'|'drag', active:boolean}`. U4 dispatches; U3 listens.
- Routing: all four units opus/xhigh (BGSD posture floor; every unit ≥0.4 difficulty — reasons per unit below).

| unit | branch | scope | difficulty | model | issue |
|---|---|---|---|---|---|
| U1 transcript-order | bgsd/shud-transcript | turnId-keyed transcript pairing in main.ts | 0.45 (stateful DOM machine rewrite) | opus/xhigh | #283 |
| U2 widget-dedup | bgsd/shud-dedup | cross-turn URL dedup + bucket unification | 0.40 (contained, test-heavy) | opus/xhigh | #280 |
| U3 webview-containment | bgsd/shud-containment | popup handling (Rust) + bounds sync during gesture ops | 0.55 (Rust + TS, OS webview semantics) | opus/xhigh | #281 |
| U4 gesture-engine | bgsd/shud-gestures | click anchoring/primary-pinch-click, scroll gates + IPC, resize gates, click IPC into child webviews | 0.75 (cross-cutting, judgment-heavy) | opus/xhigh | #282 |

Wave 1: all four parallel (U3/U4 both touch studio_webview.rs in different regions; conductor resolves at merge).
Deliverable after merge: user-facing gesture breakdown doc.
