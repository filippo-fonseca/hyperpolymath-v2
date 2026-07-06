import { randomUUID } from "node:crypto";

import { type AgentMail, AgentMailClient } from "agentmail";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { extractEmailAddress, isAllowedAgentMailSender } from "@/lib/agentmail/webhook";
import { scheduleAutoTagging } from "@/lib/captures/auto-tag";
import { db } from "@/lib/db";
import { agentmailIngestEvents, captures, tasks, users } from "@/lib/db/schema";
import { HAIKU_MODEL, getAnthropicClient } from "@/lib/jarvis/anthropic-client";

export interface AgentMailReceivedEvent {
  eventId: string;
  eventType: string;
  message: AgentMail.Message;
}

const ExtractedTaskSchema = z.object({
  title: z.string().min(1).max(180),
  notes: z.string().max(1200).optional().nullable(),
  priority: z.enum(["P1", "P2", "P3"]).optional().nullable(),
  dueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .nullable(),
});

const EmailAnalysisSchema = z.object({
  summary: z.string().min(1).max(2000),
  transcript: z.string().min(1).max(6000),
  tasks: z.array(ExtractedTaskSchema).max(8).default([]),
});

type EmailAnalysis = z.infer<typeof EmailAnalysisSchema>;

function getOwnerEmail(): string {
  return process.env.AGENTMAIL_OWNER_EMAIL ?? "filifonsecacagnazzo@gmail.com";
}

function getMessageText(message: AgentMail.Message): string {
  return message.extractedText?.trim() || message.text?.trim() || message.preview?.trim() || "";
}

function firstUrl(text: string): string | null {
  return text.match(/https?:\/\/[^\s<>"')]+/)?.[0] ?? null;
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

function fallbackAnalysis(message: AgentMail.Message): EmailAnalysis {
  const text = getMessageText(message);
  return {
    summary: truncate(text || message.preview || "Email received with no plain text body.", 1200),
    transcript: truncate(text || message.preview || "", 6000),
    tasks: [],
  };
}

async function fetchFullMessage(message: AgentMail.Message): Promise<AgentMail.Message> {
  if (getMessageText(message)) return message;
  const apiKey = process.env.AGENTMAIL_API_KEY;
  if (!apiKey) return message;
  const client = new AgentMailClient({ apiKey });
  return client.inboxes.messages.get(message.inboxId, message.messageId);
}

async function analyzeEmail(message: AgentMail.Message): Promise<EmailAnalysis> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return fallbackAnalysis(message);

  const text = getMessageText(message);
  if (!text) return fallbackAnalysis(message);

  const client = getAnthropicClient(apiKey);
  try {
    const response = await client.messages.create({
      model: process.env.AGENTMAIL_ANTHROPIC_MODEL ?? HAIKU_MODEL,
      max_tokens: 1400,
      temperature: 0,
      system:
        "You process inbound email for Filippo's Hyperpolymath assistant. Extract a concise capture summary and only create tasks when the email clearly asks Filippo to do something.",
      messages: [
        {
          role: "user",
          content: `From: ${message.from}
Subject: ${message.subject ?? "(no subject)"}

Email body:
${truncate(text, 12000)}`,
        },
      ],
      tools: [
        {
          name: "record_email_capture",
          description:
            "Return the synopsis/transcript to capture and any concrete tasks Filippo should do.",
          input_schema: {
            type: "object",
            additionalProperties: false,
            required: ["summary", "transcript", "tasks"],
            properties: {
              summary: {
                type: "string",
                description: "A concise synopsis of the email in Filippo's context.",
              },
              transcript: {
                type: "string",
                description: "The relevant email text or forwarded-thread excerpt to preserve.",
              },
              tasks: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: ["title", "notes", "priority", "dueDate"],
                  properties: {
                    title: { type: "string" },
                    notes: { type: "string" },
                    priority: { type: "string", enum: ["P1", "P2", "P3"] },
                    dueDate: {
                      type: "string",
                      description:
                        "YYYY-MM-DD only when the email gives a clear date; otherwise null.",
                    },
                  },
                },
              },
            },
          },
        },
      ],
      tool_choice: { type: "tool", name: "record_email_capture" },
    });

    const tool = response.content.find((block) => block.type === "tool_use");
    if (!tool || tool.type !== "tool_use") return fallbackAnalysis(message);
    const parsed = EmailAnalysisSchema.safeParse(tool.input);
    return parsed.success ? parsed.data : fallbackAnalysis(message);
  } catch (err) {
    console.error("[agentmail] email analysis failed", err);
    return fallbackAnalysis(message);
  }
}

function buildCaptureContent(message: AgentMail.Message, analysis: EmailAnalysis): string {
  const parts = [
    `Email from ${message.from}`,
    `Subject: ${message.subject ?? "(no subject)"}`,
    "",
    "Summary",
    analysis.summary,
  ];
  if (analysis.transcript.trim()) {
    parts.push("", "Transcript", analysis.transcript.trim());
  }
  return parts.join("\n");
}

async function replyWithReceipt(input: {
  message: AgentMail.Message;
  captureId: string;
  taskCount: number;
}): Promise<void> {
  const apiKey = process.env.AGENTMAIL_API_KEY;
  if (!apiKey) return;
  try {
    const client = new AgentMailClient({ apiKey });
    await client.inboxes.messages.reply(input.message.inboxId, input.message.messageId, {
      text: [
        "Captured in Hyperpolymath.",
        "",
        `Capture ID: ${input.captureId}`,
        `Tasks created: ${input.taskCount}`,
      ].join("\n"),
    });
  } catch (err) {
    console.error("[agentmail] receipt reply failed", err);
  }
}

export async function processAgentMailReceivedEvent(event: AgentMailReceivedEvent): Promise<{
  status: "done" | "duplicate" | "ignored";
  captureId?: string;
  taskCount?: number;
}> {
  const senderEmail = extractEmailAddress(event.message.from);
  const [ledgerRow] = await db
    .insert(agentmailIngestEvents)
    .values({
      eventId: event.eventId,
      inboxId: event.message.inboxId,
      messageId: event.message.messageId,
      sender: senderEmail,
      subject: event.message.subject ?? null,
      status: "received",
    })
    .onConflictDoNothing()
    .returning({ eventId: agentmailIngestEvents.eventId });

  if (!ledgerRow) return { status: "duplicate" };

  if (!isAllowedAgentMailSender(event.message.from)) {
    await db
      .update(agentmailIngestEvents)
      .set({ status: "ignored_sender", processedAt: sql`now()` })
      .where(eq(agentmailIngestEvents.eventId, event.eventId));
    return { status: "ignored" };
  }

  try {
    const [owner] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, getOwnerEmail()))
      .limit(1);
    if (!owner) throw new Error(`AgentMail owner user not found: ${getOwnerEmail()}`);

    const message = await fetchFullMessage(event.message);
    const analysis = await analyzeEmail(message);
    const content = buildCaptureContent(message, analysis);
    const captureId = randomUUID();
    const url = firstUrl(`${message.subject ?? ""}\n${getMessageText(message)}`);

    const createdTaskIds = await db.transaction(async (tx) => {
      await tx.insert(captures).values({
        id: captureId,
        userId: owner.id,
        content,
        createdVia: "jarvis",
        sourceDevice: "AgentMail",
        sourceInput: "email",
        sourceChannel: "email",
        url,
      });

      const [{ maxPos }] = await tx
        .select({ maxPos: sql<number>`COALESCE(MAX(${tasks.kanbanPosition}), -1)` })
        .from(tasks)
        .where(and(eq(tasks.userId, owner.id), eq(tasks.status, "not started")));

      const taskRows = analysis.tasks.map((task, index) => ({
        id: randomUUID(),
        userId: owner.id,
        title: task.title,
        notes: task.notes?.trim()
          ? `${task.notes.trim()}\n\nSource email: ${message.subject ?? "(no subject)"}`
          : `Source email: ${message.subject ?? "(no subject)"}`,
        priority: task.priority ?? "P3",
        status: "not started" as const,
        dueDate: task.dueDate ?? null,
        kanbanPosition: maxPos + index + 1,
      }));

      if (taskRows.length > 0) {
        await tx.insert(tasks).values(taskRows);
      }

      await tx
        .update(agentmailIngestEvents)
        .set({
          captureId,
          status: "done",
          processedAt: sql`now()`,
        })
        .where(eq(agentmailIngestEvents.eventId, event.eventId));

      return taskRows.map((task) => task.id);
    });

    scheduleAutoTagging(captureId, owner.id, content);
    await replyWithReceipt({ message, captureId, taskCount: createdTaskIds.length });
    return { status: "done", captureId, taskCount: createdTaskIds.length };
  } catch (err) {
    await db
      .update(agentmailIngestEvents)
      .set({
        status: "error",
        error: err instanceof Error ? err.message : String(err),
        processedAt: sql`now()`,
      })
      .where(eq(agentmailIngestEvents.eventId, event.eventId));
    throw err;
  }
}
