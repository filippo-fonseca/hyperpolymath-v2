// Zod schema for `create_task` tool (D-08).
//
// Priority + status literals MIRROR the Postgres enums at
// apps/web/lib/db/enums.ts — note SPACES, not underscores ("in progress"
// not "in_progress"). HANDOFF non-negotiables preserved: "P∞" and "lesno".

import { z } from "zod";

const PrioritySchema = z.enum(["P∞", "P1", "P2", "P3"]);
const StatusSchema = z.enum([
  "not started",
  "up next",
  "in progress",
  "almost done",
  "lesno",
]);

export function zCreateTaskFor(opts: { voiceActive?: boolean }) {
  return z.object({
    title: z.string().min(1).max(500),
    priority: PrioritySchema.optional(),
    status: StatusSchema.optional(),
    // `due` is OPTIONAL by design (Phase 19, D-02): when the user gives no
    // date (or says "no date"), the model MUST omit `due` entirely — the
    // executor then routes the task to the Inbox (dueDate = NULL), never to
    // today. The explicit "omit due → Inbox; do NOT default to today"
    // instruction lives in the create_task tool DESCRIPTION in ./index.ts
    // (the model reads the description, not this schema). No today/now
    // default exists anywhere in this path.
    due: z.iso.datetime({ offset: true }).optional(),
    project_ids: z.array(z.uuid()).optional(),
    // voice_summary is REQUIRED when voiceActive — making it optional caused
    // Claude to skip emitting it despite the VOICE_ADDENDUM "MUST include"
    // instruction, leaving the TTS pipeline silent (Phase 7 verification).
    ...(opts.voiceActive
      ? { voice_summary: z.string().min(1).max(200) }
      : {}),
  });
}

export const zCreateTask = zCreateTaskFor({ voiceActive: false });
