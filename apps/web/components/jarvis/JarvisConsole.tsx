"use client";

import { useCallback, useRef, useState } from "react";
import {
  streamJarvis,
  type JarvisRequest,
} from "./jarvis-stream-client";
import { JarvisScrollback } from "./JarvisScrollback";
import { JarvisInput, type JarvisInputPayload } from "./JarvisInput";
import type { ScrollbackAction, ScrollbackTurn } from "./jarvis-types";

/**
 * JARVIS Console (D-01) — top-level orchestrator.
 *
 * Owns:
 *   - Scrollback state (D-05) — single source of truth for visible turns
 *   - Session memory (D-06) — last 10 turns mapped to model history
 *   - AbortController plumbing (foundation for Plan 05-04 cancel UX)
 *   - SSE stream consumption via streamJarvis
 *
 * IDs use native `crypto.randomUUID()` directly (B4 fix — no @/lib/uuid).
 */

interface ProjectSource {
  id: string;
  name: string;
  icon?: string | null;
}
interface HashtagSource {
  id: string;
  name: string;
  displayName: string;
}

interface Props {
  userTimezone: string;
  initialProjects: ProjectSource[];
  initialHashtags: HashtagSource[];
}

const HISTORY_TURN_LIMIT = 10;

export function JarvisConsole({
  userTimezone,
  initialProjects,
  initialHashtags,
}: Props) {
  const [turns, setTurns] = useState<ScrollbackTurn[]>([]);
  const [streaming, setStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // Session memory (D-06) — derive from visible scrollback at submit time.
  const buildHistory = useCallback(
    (current: ScrollbackTurn[]): Array<{ role: "user" | "assistant"; content: string }> => {
      return current
        .slice(-HISTORY_TURN_LIMIT)
        .map((t) => ({
          role: (t.kind === "user" ? "user" : "assistant") as
            | "user"
            | "assistant",
          content: t.kind === "user" ? t.text : t.textDelta,
        }))
        .filter((m) => m.content.length > 0);
    },
    [],
  );

  const handleSubmit = useCallback(
    async (payload: JarvisInputPayload) => {
      const userTurn: ScrollbackTurn = {
        kind: "user",
        id: crypto.randomUUID(),
        text: payload.input,
        createdAt: new Date(),
      };
      const assistantId = crypto.randomUUID();
      const assistantTurn: ScrollbackTurn = {
        kind: "assistant",
        id: assistantId,
        textDelta: "",
        actions: [],
        createdAt: new Date(),
        status: "streaming",
      };

      let snapshot: ScrollbackTurn[] = [];
      setTurns((prev) => {
        snapshot = prev;
        return [...prev, userTurn, assistantTurn];
      });

      const history = buildHistory(snapshot);

      setStreaming(true);
      const ac = new AbortController();
      abortRef.current = ac;

      const request: JarvisRequest = {
        input: payload.input,
        history,
        parsedDates: payload.parsedDates,
        parsedPriority: payload.parsedPriority ?? undefined,
        slashCommand: payload.slashCommand,
        linkedProjectIds: payload.projectIds, // M5
        linkedHashtags: payload.hashtags, // M6
      };

      await streamJarvis(
        request,
        {
          onText: (delta) => {
            setTurns((prev) =>
              prev.map((t) =>
                t.id === assistantId && t.kind === "assistant"
                  ? { ...t, textDelta: t.textDelta + delta }
                  : t,
              ),
            );
          },
          onAction: (data) => {
            const action: ScrollbackAction = {
              toolUseId: data.toolUseId,
              name: data.name as ScrollbackAction["name"],
              result: data.result as ScrollbackAction["result"],
            };
            setTurns((prev) =>
              prev.map((t) =>
                t.id === assistantId && t.kind === "assistant"
                  ? { ...t, actions: [...t.actions, action] }
                  : t,
              ),
            );
          },
          onDone: () => {
            setTurns((prev) =>
              prev.map((t) =>
                t.id === assistantId && t.kind === "assistant"
                  ? { ...t, status: "done" }
                  : t,
              ),
            );
            setStreaming(false);
            abortRef.current = null;
          },
          onError: (message) => {
            setTurns((prev) =>
              prev.map((t) =>
                t.id === assistantId && t.kind === "assistant"
                  ? { ...t, status: "error", errorMessage: message }
                  : t,
              ),
            );
            setStreaming(false);
            abortRef.current = null;
          },
        },
        ac.signal,
      );
    },
    [buildHistory],
  );

  return (
    <div className="flex h-[calc(100vh-3rem)] flex-col">
      <JarvisScrollback turns={turns} />
      <div className="border-t bg-card px-6 py-3">
        <JarvisInput
          userTimezone={userTimezone}
          getProjects={() => initialProjects}
          getHashtags={() => initialHashtags}
          onSubmit={handleSubmit}
          disabled={streaming}
        />
      </div>
    </div>
  );
}
