# sd3 authed verify — pass 1

Env: LIVE :3000 (200, not restarted) · LOCAL Supabase 127.0.0.1:54321 · authed as `dev@local.test` (UID 8ec795be…) via minted @supabase/ssr cookie · 1440×900 headless, single browser under global lock · seed: 3 areas / 2 projects / 3 tasks / 3 captures / 2 habits.

Verdict: 11 PASS · 1 SKIP (no-voice) · 1 BLOCKED-partial (gcal offline) · 2 defects in captures.

## Per-item
1. lifeos widgets — **PASS**. `document.scrollHeight=900 ≤ innerHeight=900` (no page scroll); Insights renders as a compact cell (bottom-right). dark+light.
2. lifeos areas toggle — **PASS**. Click Areas → `lifeos:view="areas"`; after reload still `"areas"` (persists). dark+light.
3. sidebar — **PASS**. Wordmark leaf `<span>` font-family = **EB Garamond**; collapse icon-button `aria-label="Collapse sidebar"` present, no dropdown. Collapse → rail w=56px. Re-expand **FIRST CLICK** → w=230, `sidebar-collapsed=false` (old trap gone). Post-refresh `aside` opacity=**1** (no transparency).
4. dialog + ⌘K — **PASS**. ⌘K menu: dialog `backdrop-filter:none`, overlay `backdrop-filter:none` + `bg rgba(0,0,0,0.5)`, opaque plate. Project-settings dialog: `backdrop-filter:none`, opaque plate `lab(10.69…)`. sd plates, no glass/blur.
5. journaling — **PASS**. full page + calendar crop + editor focused (`document.activeElement=TEXTAREA`). dark+light.
6. project header icon → IconPicker — **PASS**. Popover 360×411, search input + 130 icon buttons (ACADEMIC row: BookOpen/GraduationCap/FlaskConic…) captured open.
7. floating HUD pill — **SKIP**. Not triggerable without voice; only fixed bottom-anchored element is the TanStack devtools button. HUD pill belongs to the voice-everywhere flow (inactive in a cookie session).
8. habits — **PASS**. Full page dark. "New habit" `background-color=lab(68.49 -35.68 -24.01)` — strongly negative a/b = saturated **cyan** (not neutral, where a≈b≈0), dark-ink text `rgb(13,14,33)` → accent-cyan **primary** confirmed (visual: cyan-filled pill).
9. training + stats — **PASS**. `/training` and `/training/stats` both render full sd-register dark (adherence bar, 12-month heatmap, by-batch, duration-trend). No redirect.
10. journaling — **PASS** (covered by item 5, no extra pass).
11. calendar — **BLOCKED (partial)**. gcal **disconnected locally** → "Connect your calendar" EmptyState captured dark+light. Week grid / event-chip / detail-panel NOT capturable (no connection, no events). Filters text present but no grid. Matches brief's disconnected fallback.
12. captures — **PASS w/ 2 defects**. Feed dark+light, composer focused, PubMed link-preview crop, hashtag crops. Send="Capture" `bg=lab(68.49 -35.68 -24.01)` = cyan primary ✓. Defects D1, D2 below.
13. nutrition — **PASS**. `/nutrition` day view + `/nutrition/stats` render clean sd register dark (calorie/macro rings, "Log your first meal" cyan primary).

## Defects
- **D1 (item 12, composer glow ring).** Focused capture composer renders a cyan glow ring, contradicting "no glow ring". Textarea `box-shadow` = `lab(3.05…) 0 0 0 2px, lab(68.49 -35.68 -24.01) 0 0 0 4px, rgba(34,211,238,0.18) 0 0 12px 0` — the last layer is a 12px cyan blur glow (see `captures-composer-focused-dark.png`). Repro: /captures → click composer → cyan ring+glow appears.
- **D2 (item 12, hashtag rail empty).** Left "HASHTAGS" rail reads "No hashtags yet." although 3 captures carry inline hashtags (#calendar, #research, #implants) that render as chips in the feed. Repro: /captures → compare left rail vs feed. Caveat: rail may key off an extracted `tags` relation rather than inline-text hashtags (seed set content only), so it could be by-design; flagging since a user typing #tag would expect it listed.

## Browser lock
Acquired global lock `/tmp/bgsd-browser.lock` (was free), wrote PID; released after the last capture. One headless Chromium only.

## Frames (26)
lifeos-widgets-{dark,light} · lifeos-areas-{dark,light} · sidebar-{expanded,collapsed}-dark · cmdk-dark · dialog-project-settings-dark · journaling-{dark,light,editor-focused-dark,calendar-crop-dark} · project-iconpicker-dark · habits-dark · training-{dark,stats-dark} · calendar-emptystate-{dark,light} · captures-{dark,light,composer-focused-dark,linkpreview-crop-dark,hashtag-crop-dark,hashtag-rail-crop-dark} · nutrition-{dark,stats-dark}
