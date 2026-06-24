/**
 * issue-specer.ts (260615-h74).
 *
 * The LLM gate for the captures-to-issues daily cron. Each tagged capture is
 * passed through ONE claude-sonnet-4-6 call that decides, under two hard rules,
 * whether the capture should become a public GitHub issue and, if so, drafts a
 * public-safe title and body.
 *
 * All model output is Zod-validated and FAIL-CLOSED: any parse error, malformed
 * response, or empty tool call collapses to { actionable: false }, so we never
 * emit an issue from output we could not validate.
 *
 * Two gates are encoded in the prompt:
 *   1. ACTIONABILITY: only genuine platform ideas, feature requests, bugs, or
 *      wish-list items for the Hyperpolymath app become actionable. Ranting,
 *      praise, or personal musings are not actionable.
 *   2. PRIVACY: the issue is published on a PUBLIC repo, so anything sensitive
 *      or personal is refused (actionable=false), and actionable bodies are
 *      written to be safe to publish.
 */

import { z } from "zod";
import { getAnthropicClient, JARVIS_MODEL } from "@/lib/jarvis/anthropic-client";

export interface IssueDecision {
  actionable: boolean;
  title: string;
  body: string;
  labels: string[];
}

// Zod schema for the model's structured decision. Parsed before any value is
// trusted; on failure we fall back to the safe default below.
const issueDecisionSchema = z.object({
  actionable: z.boolean(),
  title: z.string(),
  body: z.string(),
  labels: z.array(z.string()),
});

// Fail-closed default: never emit an issue from unparseable or absent output.
const SAFE_DEFAULT: IssueDecision = {
  actionable: false,
  title: "",
  body: "",
  labels: [],
};

const TOOL_NAME = "emit_issue_decision";

// JSON Schema mirror of issueDecisionSchema for Strict Tool Use. Keeping it
// inline (rather than deriving) avoids a runtime dependency on a Zod-to-JSON
// converter and keeps the contract explicit for auditors.
const TOOL_INPUT_SCHEMA = {
  type: "object" as const,
  properties: {
    actionable: {
      type: "boolean",
      description:
        "true ONLY for a genuine, public-safe platform idea, feature request, bug, or wish-list item; false otherwise.",
    },
    title: {
      type: "string",
      description: "Concise public issue title. Empty string when actionable is false.",
    },
    body: {
      type: "string",
      description:
        "Clean, public-safe issue spec (problem, proposed behavior, acceptance notes). Empty string when actionable is false.",
    },
    labels: {
      type: "array",
      items: { type: "string" },
      description: 'Relevant labels. Always include "kiwi-drafted".',
    },
  },
  required: ["actionable", "title", "body", "labels"],
  additionalProperties: false,
};

const SYSTEM_PROMPT = [
  "You are the gate that decides whether one quick capture from the Hyperpolymath app should become a GitHub issue on a PUBLIC, open-source repository.",
  "",
  "You MUST obey two hard rules.",
  "",
  "RULE 1 (ACTIONABILITY GATE): Set actionable=true ONLY when the capture is a genuine platform idea, feature request, bug report, or wish-list item FOR the Hyperpolymath app. Ranting, praise (for example, 'this app is great'), personal musings, journal-style notes, reminders, or anything that is not a concrete request for the product are NOT actionable: set actionable=false, leave title and body empty, and the system will do nothing with it.",
  "",
  "RULE 2 (PRIVACY GATE): The issue is published on a PUBLIC GitHub repository. NEVER put anything sensitive or personal in the title or body (names of private individuals, contact details, credentials, secrets, health or financial details, locations, or anything the author would not want public). If the capture contains sensitive or personal information, REFUSE by setting actionable=false. When actionable=true, write the title as a concise public issue title and the body as a clean public-safe spec covering the problem, the proposed behavior, and brief acceptance notes, phrased so it is safe to publish to anyone.",
  "",
  'LABELS: always include "kiwi-drafted" in labels. You may add a small number of relevant labels (for example, "bug" or "enhancement") when they clearly apply.',
  "",
  "Always respond by calling the emit_issue_decision tool. Do not write prose.",
].join("\n");

/**
 * Run one capture through the gate. Returns a Zod-validated decision, or the
 * fail-closed default on any error.
 */
export async function specCaptureAsIssue(captureContent: string): Promise<IssueDecision> {
  try {
    // Owner-system path (daily cron): runs as the owner's own infra with no
    // end-user, so it uses the owner's ANTHROPIC_API_KEY explicitly. No BYOK.
    const ownerKey = process.env.ANTHROPIC_API_KEY;
    if (!ownerKey) throw new Error("ANTHROPIC_API_KEY required for issue-specer");
    const client = getAnthropicClient(ownerKey);
    const response = await client.messages.create({
      model: JARVIS_MODEL,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      tools: [
        {
          name: TOOL_NAME,
          description:
            "Emit the issue decision for one capture. Always call this exactly once.",
          input_schema: TOOL_INPUT_SCHEMA,
        },
      ],
      // Force the tool so the model must return structured input.
      tool_choice: { type: "tool", name: TOOL_NAME },
      messages: [
        {
          role: "user",
          content: `Evaluate this capture:\n\n${captureContent}`,
        },
      ],
    });

    // Extract the forced tool_use block. Type the input as unknown, then parse.
    const toolUse = response.content.find((block) => block.type === "tool_use");
    if (!toolUse || toolUse.type !== "tool_use") {
      return SAFE_DEFAULT;
    }

    const raw: unknown = toolUse.input;
    const parsed = issueDecisionSchema.safeParse(raw);
    if (!parsed.success) {
      return SAFE_DEFAULT;
    }
    return parsed.data;
  } catch (err) {
    console.error("[issue-specer] specCaptureAsIssue failed; failing closed", err);
    return SAFE_DEFAULT;
  }
}
