# Handoff: Task reminders, mobile deadline notifications, calendar cleanup

**Status:** ready to deploy · staging PR open  
**Date:** 2026-07-24  
**Sesh:** `sesh-task-reminders-notifications`  
**Branch:** `cursor/task-reminders-notifications-75d4`  
**Base:** `main`

---

## 1. What shipped

| Area | Behavior |
|------|----------|
| **Task reminders (web + mobile)** | Unlimited offsets before due (`minutes` / `hours` / `days` / `weeks`). Optional `due_time` (HH:mm); default **09:00** for fire-time math when unset. |
| **Mobile notifications** | Local scheduled notifications via `expo-notifications` for each reminder + the due moment. Permission prompt on Tasks tab + Settings → Enable. |
| **Calendar archive (web + mobile)** | Select overdue and/or a date range → archive (= delete from Google Calendar). Web: Calendar toolbar **Archive…**. Mobile: Calendar header **archive**. |
| **Clear stale tasks** | Overdue panel / mobile Tasks: clear incomplete tasks due more than **N** days ago. |

---

## 2. Deploy checklist (do these in order)

### A. Apply Postgres migration (prod)

Hand-apply (journal intentionally unused):

```bash
# From a machine with prod DATABASE_URL (vercel env pull — not the stale
# CLOUD_DATABASE_URL in .env.local):
psql "$DATABASE_URL" -f apps/web/drizzle/0039_task_reminders.sql
# or mirror:
psql "$DATABASE_URL" -f apps/web/supabase/migrations/0055_task_reminders.sql
```

Idempotent (`IF NOT EXISTS`). Verify:

```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'tasks' AND column_name IN ('due_time', 'reminders');
```

### B. Deploy web (Vercel)

Merge/deploy the branch. No new env vars. Device routes extended:

- `POST /api/device/tasks` — `reminders`, `dueTime`; `action: "clear_stale"`
- `GET /api/device/calendar` — `timeMin`, `timeMax`, `overdue=1`
- `POST|DELETE /api/device/calendar` — `{ action: "archive", items: [...] }`

### C. Rebuild mobile native binary (required)

`expo-notifications` + permission strings need a **new native build** (OTA alone is not enough for first install of the plugin).

1. Bump already set: `apps/mobile/app.json` → `version` **1.3.0** (runtimeVersion = appVersion).
2. From `apps/mobile`:

```bash
eas build -p ios --profile production   # or your usual profile
eas build -p android --profile production
```

3. Submit / install the new binary, then optionally ship JS updates via `eas update` on that runtime.

### D. OS permission verification

| Platform | What to check |
|----------|----------------|
| **iOS** | Prompt: “JARVIS notifies you about task deadlines…”. Settings → JARVIS → Notifications On. |
| **Android 13+** | `POST_NOTIFICATIONS` runtime prompt. Channel **Task deadlines**. Exact alarms if OEM restricts. |
| **Expo Go** | Local notifications OK; push not required for this feature. |

### E. Product smoke test

1. Web: edit a task → set due date + time → add 15m / 1h / 1d reminders → save.  
2. Mobile (new binary): allow notifications → same task appears with schedules (or create locally).  
3. Wait / advance device clock in a debug build, or schedule a 1-minute reminder.  
4. Calendar → Archive… → select overdue range → archive a throwaway event.  
5. Tasks overdue → Clear >Nd on a throwaway incomplete task.

---

## 3. Notes / semantics

- **Archive events** = Google Calendar **delete** (no local soft-archive table). Confirmed in UI copy.
- **Reminders** are client-scheduled on mobile from the tasks feed. Editing/completing a task resyncs schedules. Killing the app is fine; OS keeps local schedules.
- **No push server / Expo push token table** in this sesh — local-only is enough for single-user deadline pings. Remote push can be layered later.
- Migrations live in both `apps/web/drizzle/0039_task_reminders.sql` and `apps/web/supabase/migrations/0055_task_reminders.sql`. Do **not** edit `drizzle/meta/_journal.json`.

---

## 4. Key files

| Path | Role |
|------|------|
| `apps/web/lib/tasks/reminders.ts` | Shared reminder types + fire-time math |
| `apps/web/drizzle/0039_task_reminders.sql` | DDL |
| `apps/web/components/tasks/TaskRemindersControl.tsx` | Web editor |
| `apps/web/components/calendar/CalendarCleanupPanel.tsx` | Web bulk archive |
| `apps/web/app/actions/gcal-events.ts` | `bulkArchiveEvents` |
| `apps/web/app/actions/tasks.ts` | reminders fields + `clearStaleIncompleteTasks` |
| `apps/mobile/src/lib/task-notifications.ts` | Permissions + schedule sync |
| `apps/mobile/app.json` | Plugin + permission strings + v1.3.0 |

---

## 5. Local run

```bash
git fetch origin
git checkout cursor/task-reminders-notifications-75d4
pnpm install
# apply 0039/0055 to local Supabase
pnpm --filter web dev
cd apps/mobile && npx expo start
# for notification plugin: development build / eas build, not bare Expo Go for full fidelity
```
