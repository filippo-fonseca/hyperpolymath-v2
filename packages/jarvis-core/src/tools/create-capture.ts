// Zod schema for `create_capture` tool (D-08).
// Capture-first fallback action — least-structured of the three tools.

import { z } from "zod";

export function zCreateCaptureFor(opts: { voiceActive?: boolean }) {
  return z.object({
    content: z.string().min(1).max(10_000),
    hashtags: z.array(z.string().min(1).max(64)).optional(),
    project_ids: z.array(z.uuid()).optional(),
    // Resurfacing (remind-me) date. OPTIONAL — omit when the user gives no
    // "remind me" intent. When present, an ISO 8601 datetime WITH offset (the
    // model resolves natural language like "next Tuesday" against the CURRENT
    // USER TIME block), mirroring how create_task's `due` is emitted.
    resurface_at: z.iso.datetime({ offset: true }).optional(),
    // voice_summary REQUIRED when voiceActive — see create-task.ts for rationale.
    ...(opts.voiceActive
      ? { voice_summary: z.string().min(1).max(200) }
      : {}),
  });
}

export const zCreateCapture = zCreateCaptureFor({ voiceActive: false });
