/**
 * POST /api/jarvis/computer-use/step — one step of the Computer Use fallback loop.
 *
 * The DESKTOP drives the agentic loop: it executes the computer_use
 * DesktopAction by repeatedly capturing a (downscaled) screenshot, POSTing it
 * here, and executing the returned computer actions with its Rust primitives
 * (mouse_click / mouse_move / type_text / press_key). This endpoint makes ONE
 * Anthropic call per POST with the `computer_20251124` tool (beta
 * `computer-use-2025-11-24`) and returns the model's next actions.
 *
 * LOOP STATE IS STATELESS ON THE SERVER (deliberate): on Vercel, consecutive
 * steps can land on DIFFERENT lambda instances (see the same constraint
 * documented in lib/voice/physical-extension/bus.ts), so an in-memory
 * Map<session_id, history> would drop sessions mid-task. Instead each response
 * returns `history` — the conversation so far with every image block STRIPPED
 * (replaced by a text placeholder) — and the desktop echoes it back verbatim
 * on the next step. Only the CURRENT screenshot ships per request, so payloads
 * stay bounded (~1 downscaled PNG + small JSON) for all 15 steps, well under
 * Vercel's request-body cap.
 *
 * NO bash / text_editor companion tools are registered — this drives the
 * user's real Mac; the computer tool is the only surface.
 *
 * Auth (copied from /api/jarvis/screenshot/describe — three accepted callers):
 *   a) Desktop app: Authorization: Bearer hpd_... (per-device token).
 *   b) ESP32 bridge: X-Trigger-Secret matching PHYSICAL_TRIGGER_SECRET.
 *   c) Browser: Supabase cookie via getClaims().
 *
 * Spoken narration: any text the model emits (`say`) is ALSO published over
 * the physical SSE bus (jarvis-response-start/chunk/end — same pattern as
 * screenshot/describe) so JARVIS narrates progress/completion aloud.
 *
 * HARD CAP: MAX_STEPS (15) steps per session. On cap the endpoint returns
 * done:true with a spoken "I couldn't finish that one, sir." line without
 * calling Anthropic.
 */

import { randomUUID } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { validateDesktopBearer } from "@/lib/auth/desktop-bearer";
import { getUserKeyOrNull } from "@/lib/byok/keys";
import {
  getAnthropicClient,
  JARVIS_MODEL,
} from "@/lib/jarvis/anthropic-client";
import {
  emitJarvisResponseChunk,
  emitJarvisResponseEnd,
  emitJarvisResponseStart,
} from "@/lib/voice/physical-extension/bus";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Hard cap on loop length. step_index is 0-based, so indices 0..14 are the
 *  15 allowed steps; index >= 15 short-circuits to the spoken failure line. */
const MAX_STEPS = 15;

// Cap the DECODED screenshot at ~8MB (same as screenshot/describe). base64
// inflates 4/3, so the check runs on the decoded estimate.
const MAX_DECODED_BYTES = 8 * 1024 * 1024;

// Cap the echoed history JSON so a runaway session can't balloon requests.
const MAX_HISTORY_CHARS = 2 * 1024 * 1024;

const CAP_FAILURE_LINE =
  "I'm afraid I couldn't finish that one, sir — it needed more steps than I allow myself.";

const COMPUTER_USE_SYSTEM_PROMPT = [
  "You are JARVIS's hands: a computer-operation agent driving the user's macOS desktop to complete ONE stated task, then stop.",
  "RULES:",
  "- Do ONLY the stated task; never begin unrelated work.",
  "- FORBIDDEN, no exceptions: composing or sending messages or emails, making purchases or payments, deleting files, and interacting with system security prompts (password dialogs, permission prompts, Touch ID). If the task requires any of these, stop and report why instead of acting.",
  "- Prefer keyboard shortcuts over pixel-hunting where reliable (e.g. Cmd+W to close a tab, Cmd+A to select all); click only when no shortcut does the job.",
  "- The desktop CANNOT scroll or drag with the mouse and cannot hold keys: never emit scroll, drag, or hold actions — use keyboard equivalents (arrow keys, Page Down/Up, Cmd+Arrow) instead.",
  "- Screenshots are downscaled; emit coordinates in the screenshot's own pixel space.",
  "- Each step, either call the computer tool with the next action(s), or — when the task is complete or impossible — reply with NO tool call and a short spoken report.",
  '- Any text you emit is spoken aloud to the user by JARVIS the butler (dry, British, address the user as "sir"): keep it to ONE short sentence, no coordinates, no technical detail.',
].join("\n");

// ---------------------------------------------------------------------------
// Wire types (fixed contract with apps/desktop/src/actions/computer-use.ts)
// ---------------------------------------------------------------------------

interface StepToolResult {
  tool_use_id: string;
  ok: boolean;
  error?: string;
}

interface StepRequestBody {
  session_id?: unknown;
  task?: unknown;
  step_index?: unknown;
  screenshot_base64?: unknown;
  display_width?: unknown;
  display_height?: unknown;
  /** Opaque echo of the previous response's `history`. */
  history?: unknown;
  /** Execution results for the previous response's actions. */
  tool_results?: unknown;
}

/** One next action for the desktop: the raw computer tool_use input plus its
 *  id (the desktop echoes the id back in the next step's tool_results). */
interface StepAction {
  id: string;
  input: Record<string, unknown>;
}

// Loose message shapes — history is our own previous output, round-tripped.
type ContentBlock = { type?: string; [key: string]: unknown };
interface HistoryMessage {
  role: "user" | "assistant";
  content: string | ContentBlock[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isHistoryMessage(v: unknown): v is HistoryMessage {
  if (!v || typeof v !== "object") return false;
  const m = v as { role?: unknown; content?: unknown };
  return (
    (m.role === "user" || m.role === "assistant") &&
    (typeof m.content === "string" || Array.isArray(m.content))
  );
}

/** Replace every image block (including those nested in tool_result content)
 *  with a text placeholder so the echoed history carries no screenshots. */
function stripImages(messages: HistoryMessage[]): HistoryMessage[] {
  const stripBlock = (b: ContentBlock): ContentBlock => {
    if (b.type === "image") {
      return { type: "text", text: "[screenshot omitted — see latest screenshot]" };
    }
    if (b.type === "tool_result" && Array.isArray(b["content"])) {
      return { ...b, content: (b["content"] as ContentBlock[]).map(stripBlock) };
    }
    return b;
  };
  return messages.map((m) =>
    typeof m.content === "string" ? m : { ...m, content: m.content.map(stripBlock) },
  );
}

function imageBlock(pngBase64: string): ContentBlock {
  return {
    type: "image",
    source: { type: "base64", media_type: "image/png", data: pngBase64 },
  };
}

/** Publish a spoken line over the physical SSE bus (start → chunk → end),
 *  exactly like screenshot/describe, so the desktop TTS pipeline plays it. */
function speak(line: string): void {
  const turnId = randomUUID();
  emitJarvisResponseStart({ turnId, at: Date.now() });
  emitJarvisResponseChunk({ turnId, delta: line, at: Date.now() });
  emitJarvisResponseEnd({ turnId, at: Date.now() });
}

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest): Promise<Response> {
  // 1. Auth — same three-caller pattern as /api/jarvis/screenshot/describe.
  const desktopUserId = await validateDesktopBearer(req);
  let userId: string | null = desktopUserId;
  if (!desktopUserId) {
    const triggerSecret = req.headers.get("x-trigger-secret");
    if (triggerSecret) {
      const expected = process.env.PHYSICAL_TRIGGER_SECRET;
      if (!expected || triggerSecret !== expected) {
        return new Response("Unauthorized", { status: 401 });
      }
    } else {
      const supabase = await createClient();
      const claimsResult = await supabase.auth.getClaims();
      if (claimsResult.error || !claimsResult.data?.claims?.sub) {
        return new Response("Unauthorized", { status: 401 });
      }
      userId = claimsResult.data.claims.sub;
    }
  }

  // 2. Parse + validate body
  let body: StepRequestBody;
  try {
    body = (await req.json()) as StepRequestBody;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const sessionId = typeof body.session_id === "string" ? body.session_id.trim() : "";
  const task = typeof body.task === "string" ? body.task.trim() : "";
  const stepIndex = typeof body.step_index === "number" ? body.step_index : NaN;
  const screenshotBase64 =
    typeof body.screenshot_base64 === "string" ? body.screenshot_base64.trim() : "";
  const displayWidth = typeof body.display_width === "number" ? body.display_width : NaN;
  const displayHeight = typeof body.display_height === "number" ? body.display_height : NaN;

  if (!sessionId || !task) {
    return Response.json({ error: "session_id and task are required" }, { status: 400 });
  }
  if (!Number.isInteger(stepIndex) || stepIndex < 0) {
    return Response.json({ error: "step_index must be a non-negative integer" }, { status: 400 });
  }
  if (
    !Number.isFinite(displayWidth) ||
    !Number.isFinite(displayHeight) ||
    displayWidth < 1 ||
    displayHeight < 1
  ) {
    return Response.json(
      { error: "display_width and display_height are required" },
      { status: 400 },
    );
  }

  // 2a. HARD CAP — refuse further model calls; speak the failure line.
  if (stepIndex >= MAX_STEPS) {
    console.warn(
      `[computer-use/step] session=${sessionId} hit the ${MAX_STEPS}-step cap — aborting`,
    );
    speak(CAP_FAILURE_LINE);
    return Response.json({
      ok: true,
      session_id: sessionId,
      done: true,
      actions: [],
      say: CAP_FAILURE_LINE,
      history: [],
    });
  }

  if (!screenshotBase64) {
    return Response.json({ error: "screenshot_base64 is required" }, { status: 400 });
  }
  const approxDecodedBytes = Math.floor((screenshotBase64.length * 3) / 4);
  if (approxDecodedBytes > MAX_DECODED_BYTES) {
    return Response.json({ error: "Screenshot too large (max 8MB decoded)" }, { status: 413 });
  }

  const history: HistoryMessage[] = Array.isArray(body.history)
    ? body.history.filter(isHistoryMessage)
    : [];
  if (JSON.stringify(history).length > MAX_HISTORY_CHARS) {
    return Response.json({ error: "history too large" }, { status: 413 });
  }
  const toolResults: StepToolResult[] = Array.isArray(body.tool_results)
    ? (body.tool_results as unknown[]).flatMap((r) => {
        if (!r || typeof r !== "object") return [];
        const t = r as { tool_use_id?: unknown; ok?: unknown; error?: unknown };
        if (typeof t.tool_use_id !== "string" || typeof t.ok !== "boolean") return [];
        return [
          {
            tool_use_id: t.tool_use_id,
            ok: t.ok,
            ...(typeof t.error === "string" ? { error: t.error } : {}),
          },
        ];
      })
    : [];

  // 3. BYOK — user's own Anthropic key when there is a user identity; owner
  //    env fallback for the keyless trigger-secret path (same as describe).
  const anthropicKey =
    (userId ? await getUserKeyOrNull(userId, "anthropic") : null) ??
    process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) {
    return Response.json({ error: "key_missing", provider: "anthropic" }, { status: 402 });
  }

  // 4. Build the conversation for this step.
  let messages: HistoryMessage[];
  if (history.length === 0 || toolResults.length === 0) {
    // First step (or a desync where no tool results came back): fresh task
    // briefing + current screen. step_index > 0 with no results means the
    // desktop restarted the conversation — treat it as a fresh start.
    messages = [
      {
        role: "user",
        content: [
          {
            type: "text",
            text:
              `Task: ${task}\n` +
              `This is step ${stepIndex + 1} of at most ${MAX_STEPS}. ` +
              "The current screen is attached.",
          },
          imageBlock(screenshotBase64),
        ],
      },
    ];
  } else {
    // Continue: echoed history already ends with the assistant tool_use turn.
    // Answer each pending tool_use with its execution result; the LAST
    // tool_result carries the fresh screenshot (post-action screen state).
    const resultBlocks: ContentBlock[] = toolResults.map((r, i) => ({
      type: "tool_result",
      tool_use_id: r.tool_use_id,
      ...(r.ok ? {} : { is_error: true }),
      content: [
        {
          type: "text",
          text: r.ok ? "ok" : `error: ${r.error ?? "action failed"}`,
        },
        ...(i === toolResults.length - 1 ? [imageBlock(screenshotBase64)] : []),
      ],
    }));
    messages = [...history, { role: "user", content: resultBlocks }];
  }

  // 5. One Anthropic call with the computer_20251124 tool. NO bash /
  //    text_editor companions — this is the user's real Mac.
  let content: Array<{ type: string; [key: string]: unknown }>;
  let stopReason: string | null;
  try {
    const anth = getAnthropicClient(anthropicKey);
    const message = await anth.beta.messages.create({
      model: JARVIS_MODEL,
      max_tokens: 2000,
      betas: ["computer-use-2025-11-24"],
      system: COMPUTER_USE_SYSTEM_PROMPT,
      tools: [
        {
          type: "computer_20251124",
          name: "computer",
          display_width_px: Math.round(displayWidth),
          display_height_px: Math.round(displayHeight),
          // zoom lets the model request a cropped look at a region; the
          // desktop serves it via screencapture -R.
          enable_zoom: true,
        },
      ],
      messages: messages as never,
    });
    content = message.content as never;
    stopReason = message.stop_reason;
  } catch (err) {
    console.error(`[computer-use/step] session=${sessionId} Anthropic call failed`, err);
    return Response.json({ error: "Computer-use upstream failed" }, { status: 502 });
  }

  // 6. Split the response into spoken text + next actions.
  const say = content
    .flatMap((b) => (b.type === "text" && typeof b["text"] === "string" ? [b["text"]] : []))
    .join(" ")
    .trim();
  const actions: StepAction[] = content.flatMap((b) =>
    b.type === "tool_use" && b["name"] === "computer" && typeof b["id"] === "string"
      ? [{ id: b["id"] as string, input: (b["input"] ?? {}) as Record<string, unknown> }]
      : [],
  );
  const done = actions.length === 0 || stopReason !== "tool_use";

  console.log(
    `[computer-use/step] session=${sessionId} step=${stepIndex} actions=${actions.length} ` +
      `done=${done} stop_reason=${stopReason ?? "?"}${say ? ` say="${say.slice(0, 80)}"` : ""}`,
  );

  // 7. Narrate over the physical SSE bus so JARVIS speaks progress/completion.
  if (say) speak(say);

  // 8. Echo the updated, image-stripped history for the next step.
  const nextHistory = done
    ? []
    : stripImages([...messages, { role: "assistant", content: content as ContentBlock[] }]);

  return Response.json({
    ok: true,
    session_id: sessionId,
    done,
    actions: done ? [] : actions,
    ...(say ? { say } : {}),
    history: nextHistory,
  });
}
