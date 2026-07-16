You are Scout B (recon, STRICTLY READ-ONLY — you must not edit, write, create, or delete any file; no git commands that mutate state) working in /Users/filippofonseca/Developer/Projects/hyperpolymath-v2-sd-restyle (branch bgsd/sd-all-features).

Context: the app's sidebar was just rebuilt to a Spacedrive register (apps/web/components/shell/Sidebar.tsx, PersistentNav.tsx, AppShell.tsx, TopTabBar.tsx). The user reports three defects and one design complaint:

BUG 1 — Collapse/uncollapse glitch: "if you hit collapse and then try to make it uncollapsed, you can't; if you click the dropdown to make it collapse, it doesn't show up, it just closes the sidebar."
BUG 2 — After a page refresh, the sidebar became TRANSPARENT and rendered OVER the page content (overlay, not in-flow).
DESIGN — The workspace pill at the top opens/looks like a workspace-switcher dropdown; user wants it gone: just the Hyperpolymath wordmark, and that wordmark must use the logotype font (EB Garamond via components/ui/Logotype.tsx / --font-logotype), not Space Grotesk.

MISSION: root-cause all three with file:line evidence. Be very thorough.
1. Map the collapse state machine: who owns collapsed state (Sidebar? AppShell? localStorage/persisted?), what toggles it (buttons, kbd shortcut, the workspace pill click?), what renders in collapsed mode, and how the user re-expands. Identify exactly why clicking the workspace pill/dropdown collapses the sidebar and why re-expanding fails or is undiscoverable.
2. Transparency/overlay on refresh: look for hydration-dependent classes, persisted state read in useEffect causing mismatch, position fixed vs in-flow switching, background classes applied conditionally (e.g. bg only when mounted), z-index layering, 'use client' mount gating. Explain the exact mechanism that yields a transparent sidebar overlapping content after refresh.
3. Workspace pill: what does clicking it do today (dropdown menu? collapse?), what's in the dropdown, what would removing it break. Where is the wordmark text rendered and which font does it use (is Logotype.tsx used in the sidebar or not?).
4. Note the mobile/responsive behavior of the sidebar (sheet? overlay?) since the overlay bug may be the mobile branch leaking into desktop.

Your final response IS the deliverable and is captured to a file. Output ONLY the compact markdown report: per-bug root cause with file:line, the state flow in prose, and a recommended minimal fix per item. No preamble, under ~120 lines, no file dumps.
