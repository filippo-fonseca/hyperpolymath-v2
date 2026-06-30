"use client";

import {
  Calendar,
  FileText,
  ListTodo,
  NotebookPen,
  PencilLine,
  type LucideIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useMemo } from "react";

import { createCapture } from "@/app/actions/captures";
import { createPage } from "@/app/actions/pages";

/** A single quick-create action surfaced by Cmd+K and Cmd+Shift+K. */
export interface QuickCreateAction {
  /** Stable identity, used for React keys and keyword/value matching. */
  id: string;
  label: string;
  icon: LucideIcon;
  /** Keyword tokens the palettes filter against (cmdk-style). */
  keywords: string[];
  /** Optional keyboard-shortcut hint shown by the Cmd+Shift+K palette. */
  shortcut?: string;
  /** Runs the action. Callers close their palette before/after as needed. */
  run: () => void | Promise<void>;
}

/**
 * Pull #hashtags out of free text so a quick capture typed straight into a
 * palette links its tags, mirroring how the /captures composer extracts them.
 */
export function extractHashtags(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(/#([\p{L}\p{N}_-]+)/gu)) {
    out.add(m[1].toLowerCase());
  }
  return Array.from(out);
}

interface Options {
  /**
   * How the core "New capture" action behaves. Cmd+Shift+K has a composer mode
   * (pass a callback); Cmd+K has none, so it omits this and the action navigates
   * to /captures instead.
   */
  onCompose?: () => void;
}

/**
 * Shared source of truth for the create actions offered by both command
 * palettes (Cmd+K JARVIS dialog and Cmd+Shift+K command menu). Centralizing the
 * create logic (createPage, createCapture, route navigations) keeps the two
 * surfaces in lockstep.
 *
 * - `actions` are the four core creates (capture/task/page/event).
 * - `captureText(trimmed)` builds the contextual "Capture '<text>'" action when
 *   the user has typed something; returns null for empty input.
 */
export function useQuickCreateActions({ onCompose }: Options = {}) {
  const router = useRouter();

  const newPage = useCallback(async () => {
    const r = await createPage({ id: crypto.randomUUID(), title: "", content: "" });
    if (r.success) router.push(`/wiki/${r.data.id}`);
  }, [router]);

  const newCapture = useCallback(() => {
    // Cmd+Shift+K opens its composer mode; Cmd+K (no composer) goes to /captures.
    if (onCompose) {
      onCompose();
      return;
    }
    router.push("/captures");
  }, [onCompose, router]);

  const actions = useMemo<QuickCreateAction[]>(() => {
    return [
      {
        id: "new-capture",
        label: "New quick capture",
        icon: NotebookPen,
        keywords: ["qc", "capture", "note", "thought", "jot", "quick"],
        shortcut: "⌃⌥C",
        run: newCapture,
      },
      {
        id: "new-task",
        label: "New task",
        icon: ListTodo,
        keywords: ["task", "todo", "to-do"],
        shortcut: "⌃⌥T",
        run: () => router.push("/tasks?create=now"),
      },
      {
        id: "new-page",
        label: "New page",
        icon: FileText,
        keywords: ["page", "wiki", "doc", "document"],
        shortcut: "⌃⌥P",
        run: newPage,
      },
      {
        id: "new-event",
        label: "New event",
        icon: Calendar,
        keywords: ["event", "calendar", "meeting", "cal"],
        shortcut: "⌃⌥E",
        run: () => router.push("/calendar?create=now"),
      },
    ];
  }, [router, newPage, newCapture]);

  const captureText = useCallback(
    (trimmed: string): QuickCreateAction | null => {
      if (!trimmed) return null;
      return {
        id: "capture-text",
        label: `Capture “${trimmed}”`,
        icon: PencilLine,
        keywords: ["capture"],
        shortcut: "⏎",
        run: async () => {
          await createCapture({
            id: crypto.randomUUID(),
            content: trimmed,
            hashtagNames: extractHashtags(trimmed),
          });
          router.push("/captures");
        },
      };
    },
    [router]
  );

  return { actions, captureText };
}
