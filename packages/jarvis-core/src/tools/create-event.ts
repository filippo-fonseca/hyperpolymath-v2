// Zod schema for `create_event` tool (D-08).
// Events are time-bound — start + end are both required.
// calendar_id defaults to user's gcal_default_calendar_id at the executor
// boundary if absent; the model may omit it and let the server fill in.

import { z } from "zod";

export function zCreateEventFor(opts: { voiceActive?: boolean }) {
  return z.object({
    title: z.string().min(1).max(500),
    calendar_id: z.string().optional(),
    start: z.iso.datetime({ offset: true }),
    end: z.iso.datetime({ offset: true }),
    description: z.string().max(5_000).optional(),
    // voice_summary REQUIRED when voiceActive — see create-task.ts for rationale.
    ...(opts.voiceActive
      ? { voice_summary: z.string().min(1).max(200) }
      : {}),
  });
}

export const zCreateEvent = zCreateEventFor({ voiceActive: false });
