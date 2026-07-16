You are Scout A (recon, STRICTLY READ-ONLY — you must not edit, write, create, or delete any file; no git commands that mutate state) working in /Users/filippofonseca/Developer/Projects/hyperpolymath-v2-sd-restyle (branch bgsd/sd-all-features).

Context: The app just shipped a "Spacedrive register" redesign (see docs/DESIGN-SYSTEM.md and apps/web/app/design/page.tsx) covering the sidebar, LifeOS page, tasks surfaces, and design docs. Signature elements: Space Grotesk font app-wide, dimensional icons in apps/web/components/ui/icons, sd tokens (--sd-*), card v2 grammar (WidgetCard), single cyan accent, bans on gradients/glassmorphism/glow rings/neumorphic .glass-tile/.glass-button.

MISSION: Inventory EVERY user-facing surface in apps/web and classify its styling state. Be very thorough.

1. Enumerate all routes under apps/web/app (both (app) group and public), plus major feature component dirs under apps/web/components (habits, training, journal, wiki, captures, projects, areas, settings, routines, dev, jarvis, etc.).
2. For each surface, classify: ALREADY-SD (uses sd tokens/register), PARTIAL, or OLD (still carries pre-sd styling). Detect old-register traces by grepping for: glass-tile, glass-button, lifeos-glass, backdrop-blur, bg-gradient, glow/shadow-glow, font-serif where it isn't the logotype, neumorphic classes, old accent colors.
3. For each OLD/PARTIAL surface: list the route, the main component files (paths), rough size (line counts of key files), and the 3-5 most prominent old-register offenses (with file:line).
4. Specifically deep-check: habits, training, journal, wiki, captures, settings, routines, projects detail page, areas detail page, DEV tab, sign-in page, and shared app-wide modals/dialogs (command menu, dialogs, context menus, toasts).

Your final response IS the deliverable and is captured to a file. Output ONLY the compact markdown report: a table (surface | route | state | key files | size | worst offenses) followed by a short "biggest lifts" ranking. No preamble, no file dumps, under ~150 lines.
