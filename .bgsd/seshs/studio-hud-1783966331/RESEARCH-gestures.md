# Scout β — hand-gesture interaction research (2026-07-13)

## Bottom line (drives the architecture)
1. Pinch physically drags the tracked fingertip → cursor bound to index tip lands wrong / reads as drag. Fix: cursor on stable landmark (palm centroid = mean of landmarks 0,5,9,13,17, or index MCP 5), anchor click at pre-pinch position (~120ms back in a 200ms ring buffer), freeze cursor during pinch until drag threshold exceeded.
2. Synthetic DOM events are isTrusted:false — CANNOT drive native scroll/click/focus in webviews. Only real OS input (enigo/CGEvent) works, and it reaches child WebviewWindows with zero per-webview plumbing. This is what Project Gameface ships. Do NOT use dispatchEvent/webview.eval as pointer transport.

## Key numbers
- Pinch hysteresis: enter 0.80 / exit 0.70 (Ultraleap tuned values). Pinch ratio = dist(4,8)/dist(5,6), depth-normalized by knuckle span.
- Refractory 250-300ms after click; velocity gating suppresses pinch-enter during fast moves; buffer pinch bool a few frames.
- One-Euro filter: start mincutoff=0.7Hz, beta=1.0; tune (lower mincutoff kills idle jitter, raise beta kills flick lag). Filter the STABLE landmark, per-axis.
- MediaPipe GestureRecognizer has NO pinch class (7 canned: Closed_Fist, Open_Palm, Pointing_Up, Thumb_Up/Down, Victory, ILoveYou). Use it only for coarse mode poses (fist/palm); compute pinch from landmarks.

## State machines
- CLICK: IDLE --(strength>0.80)--> PINCHED {anchor at ringbuffer[-120ms], freeze cursor, enigo move+mouse_down; if travel > drag threshold → unfreeze drag} --(strength<0.70)--> IDLE {mouse_up, 250ms refractory}.
- SCROLL: sticky explicit mode via Closed_Fist (held 2 frames, hysteresis on exit); freeze cursor; vertical fist translation → enigo real wheel deltas; visible HUD scroll indicator (mode feedback is THE disambiguation fix); optional inertia.
- RESIZE: reuse pinch machine — pinch over a resize handle = grab/drag/release (mouse_down on handle, drag, mouse_up). Widget move: Open_Palm→Closed_Fist grab. Two-handed pinch-scale optional only.

## Delivery architecture
Camera → MediaPipe in HUD webview → cursor landmark + pinch ratio + mode pose → One-Euro → IPC {x,y,action} → Rust enigo (real cursor move/click/scroll) → OS delivers to whatever webview is under cursor (incl. child WebviewWindows, third-party content, popups).
- Tauri v2 has NO input-injection API (discussion #11507); child-webview event bridge unreliable (#10921).
- macOS caveats: needs Accessibility (+ Input Monitoring) permission — build into onboarding; real clicks steal focus (camera loop must not need HUD focus); map normalized coords → global screen coords (Retina scale, multi-monitor); MediaPipe+filtering in JS, enigo calls in Rust.
- Coordinate mapping: absolute, camera sub-region → screen with edge padding; optional gain curve + open-palm clutch to recenter.
- Dwell-click as accessibility fallback only.

Full cited report in conductor transcript (sources: Ultraleap docs, arXiv 2401.10948 Vision Pro gaze+pinch, Project Gameface, 1€ filter Casiez, MDN isTrusted, Tauri #11507/#10921, enigo docs).
