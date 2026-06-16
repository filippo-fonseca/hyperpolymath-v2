/**
 * Morning Dump — parse a free-form daily brain-dump into a PROPOSED plan.
 *
 * Issues #32 / #33. This is a NEW, self-contained surface. It reuses the
 * existing JARVIS pieces (Anthropic client + jarvis-core tool definitions +
 * the create_* Zod validators) without touching the live console/undo files.
 *
 * Unlike the streaming console turn, this is a single non-streaming pass that
 * NEVER executes anything. It asks the model to propose create_task /
 * create_event / create_capture actions, validates each one against the same
 * jarvis-core schemas the live executor uses, drops anything that fails
 * validation, and returns a typed plan for the client to review + edit before
 * an explicit commit. Nothing lands in the DB or Google Calendar here.
 */

import { JARVIS_MODEL, getAnthropicClient } from "@/lib/jarvis/anthropic-client";
import {
  buildToolDefinitions,
  zCreateCaptureFor,
  zCreateEventFor,
  zCreateTaskFor,
} from "@hyperpolymath/jarvis-core";
import type { z } from "zod";

// Plan items are typed against the jarvis-core schemas (not the executor Action
// types) so the validated `.data` shape flows through without a cast. The
// non-voice variants are what the executor's create* methods accept.
type TaskInput = z.infer<ReturnType<typeof zCreateTaskFor>>;
type EventInput = z.infer<ReturnType<typeof zCreateEventFor>>;
type CaptureInput = z.infer<ReturnType<typeof zCreateCaptureFor>>;

export type MorningDumpItem =
  | { kind: "task"; input: TaskInput }
  | { kind: "event"; input: EventInput }
  | { kind: "capture"; input: CaptureInput };

export interface MorningDumpPlan {
  items: MorningDumpItem[];
}

export interface ParseMorningDumpOptions {
  dump: string;
  /** Local "now" context so the model dates "this morning"/"3pm" correctly. */
  temporalContext: string;
  abortSignal?: AbortSignal;
}

const SYSTEM = [
  "You are JARVIS in Morning Dump mode. The user has pasted a free-form, loosely",
  "structured stream of consciousness about their day. Your job is to turn it",
  "into a clean PROPOSED daily plan. The user will review and edit it before",
  "anything is committed, so propose the most useful structure you can.",
  "",
  "RULES:",
  "- Emit one tool call per distinct item you find.",
  "- create_task for action items / things to get done. Add an explicit `due`",
  "  ISO timestamp ONLY if the user named a day or time; otherwise omit `due`",
  "  (it lands in the Inbox). Set `priority` only if the user signals urgency.",
  "- create_event for anything time-bound with a clear start and end (meetings,",
  "  classes, calls, workouts at a set time). Both start and end are required",
  "  ISO timestamps with an offset; infer a sensible duration if the user gave",
  "  only a start.",
  "- create_capture for thoughts, ideas, worries, or anything that is not a",
  "  concrete task or a scheduled event. Keep the user's own words in `content`.",
  "- Loose, rambling, or contradictory input is expected. Do your best to split",
  "  it into atomic items. When in doubt between a task and a capture, prefer a",
  "  task if there is a clear deliverable, otherwise a capture.",
  "- Do NOT ask clarifying questions and do NOT emit any other tool. Propose the",
  "  plan directly from what you were given.",
].join("\n");

interface AnthropicToolUseBlock {
  type: string;
  name?: string;
  input?: unknown;
}

/**
 * Run the proposal pass. Pure-ish: takes the dump + temporal context, returns
 * the validated plan. The Anthropic client is the only side-effect and is
 * mocked in tests.
 */
export async function parseMorningDump(opts: ParseMorningDumpOptions): Promise<MorningDumpPlan> {
  const anth = getAnthropicClient();

  // Only the three create_* tools are relevant to a proposed plan — strip the
  // CRUD/find/clarify tools so the model can't reach for them here.
  const allTools = buildToolDefinitions({ voiceActive: false });
  const tools = allTools.filter(
    (t) => t.name === "create_task" || t.name === "create_event" || t.name === "create_capture"
  );

  const taskValidator = zCreateTaskFor({ voiceActive: false });
  const eventValidator = zCreateEventFor({ voiceActive: false });
  const captureValidator = zCreateCaptureFor({ voiceActive: false });

  const message = await anth.messages.create(
    {
      model: JARVIS_MODEL,
      max_tokens: 2048,
      system: [
        { type: "text", text: SYSTEM },
        { type: "text", text: opts.temporalContext },
      ] as unknown as never,
      tools: tools as unknown as never,
      tool_choice: { type: "auto" } as unknown as never,
      messages: [{ role: "user", content: opts.dump }] as unknown as never,
    },
    opts.abortSignal ? { signal: opts.abortSignal } : undefined
  );

  const blocks = (message.content ?? []) as AnthropicToolUseBlock[];
  const items: MorningDumpItem[] = [];

  for (const block of blocks) {
    if (block.type !== "tool_use") continue;
    if (block.name === "create_task") {
      const parsed = taskValidator.safeParse(block.input);
      if (parsed.success) items.push({ kind: "task", input: parsed.data });
    } else if (block.name === "create_event") {
      const parsed = eventValidator.safeParse(block.input);
      if (parsed.success) items.push({ kind: "event", input: parsed.data });
    } else if (block.name === "create_capture") {
      const parsed = captureValidator.safeParse(block.input);
      if (parsed.success) items.push({ kind: "capture", input: parsed.data });
    }
  }

  return { items };
}
