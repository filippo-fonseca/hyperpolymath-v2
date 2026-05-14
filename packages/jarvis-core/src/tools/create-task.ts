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
    due: z.iso.datetime({ offset: true }).optional(),
    project_ids: z.array(z.uuid()).optional(),
    ...(opts.voiceActive
      ? { voice_summary: z.string().max(200).optional() }
      : {}),
  });
}

export const zCreateTask = zCreateTaskFor({ voiceActive: false });
