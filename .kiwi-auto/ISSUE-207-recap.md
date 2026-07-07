# Issue #207 — skipped

**Title:** Feature Request: Posture reminder ("PosturePoke") integrated into the app

## Why skipped
This is a BAD fit for an unattended 45-minute quick slot per the doability rules:

- **New feature, not a bug fix.** Introduces an entirely new user-facing capability with no existing surface to hook into.
- **Multi-surface + architectural.** Needs: (a) a settings UI to enable/disable and pick interval, (b) persistence of the user's preference (DB column or user_settings row, likely a migration), (c) an in-app notification/prompt surface (which notification system? toast? banner? desktop notification?), (d) a scheduler/timer that fires at the configured interval and survives navigation/tab-switch.
- **Open design questions.** Where does the reminder appear (web, desktop app, both)? What visual register (neumorphic glass tile? toast?)? Does it integrate with the notification center (#189) or stand alone? Does it interact with Jarvis? The issue explicitly leaves "integration with existing assistant/productivity suite" as an open stretch goal.
- **Product/UX judgment required.** "Non-intrusive and dismissible" is subjective; picking the right nudge modality is a design call, not a mechanical fix.
- **Likely needs a migration** for persisted per-user interval + enabled flag — the doability rules explicitly exclude issues that introduce migrations in an unattended slot.

## Recommendation
Route through `/gsd:discuss-phase` → `/gsd:plan-phase` in an attended session so the surface, persistence shape, and notification mechanism can be decided before code is written. Consider bundling with #189 (Notification Center overhaul) since they share the toast/notification surface.

Branch left untouched.
