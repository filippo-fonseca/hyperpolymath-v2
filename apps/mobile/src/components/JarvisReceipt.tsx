// Action receipt — mobile twin of apps/web/components/jarvis/JarvisReceipt.tsx.
// Intent communicated via the leading 6px dot (amber task / sage capture /
// coral event / cyan memory), mono uppercase label row with ✓ or ✕, then a
// serif body with the resolved fields (title, priority · due, hashtags,
// start → end, key: value). Errors get the 3px coral left edge.

import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { colors, mono, serif } from "../theme";

// Intent ink palette — hex approximations of the web oklch tokens
// (--ink-amber / --ink-sage / --ink-coral / --hud-cyan-light).
const INK = {
  amber: "#d9a03f",
  sage: "#7fa57c",
  coral: "#d4705f",
  cyanLight: "#3aa6c4",
} as const;

const INTENT_META: Record<string, { label: string; dot: string }> = {
  create_task: { label: "TASK", dot: INK.amber },
  create_capture: { label: "CAPTURE", dot: INK.sage },
  create_event: { label: "EVENT", dot: INK.coral },
  remember_fact: { label: "MEMORY", dot: INK.cyanLight },
  ask_clarification: { label: "QUESTION", dot: INK.cyanLight },
};

export interface ReceiptAction {
  toolUseId: string;
  name: string;
  result: unknown;
  /** Locally undone via the 5s window — renders as a tombstone. */
  undone?: boolean;
}

/** 5s countdown undo button — mirrors the web receipt's UndoButton. */
function UndoButton({ onUndo }: { onUndo: () => void }) {
  const [seconds, setSeconds] = useState(5);
  const [hidden, setHidden] = useState(false);
  const cancelled = useRef(false);

  useEffect(() => {
    const t = setInterval(() => {
      setSeconds((s) => {
        if (s <= 1) {
          clearInterval(t);
          setHidden(true);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, []);

  if (hidden) return null;
  return (
    <Pressable
      hitSlop={8}
      onPress={() => {
        if (cancelled.current) return;
        cancelled.current = true;
        setHidden(true);
        onUndo();
      }}
      style={({ pressed }) => [styles.undo, pressed && { opacity: 0.6 }]}
      accessibilityRole="button"
      accessibilityLabel="Undo"
    >
      <Text style={styles.undoText}>Undo ({seconds})</Text>
    </Pressable>
  );
}

interface ActionResult {
  ok?: boolean;
  error?: string;
  receipt?: Record<string, unknown>;
}

/** Port of the web fmtDate — allDay-aware, today/tomorrow relative. */
function fmtDate(iso: unknown, allDay?: boolean): string {
  if (typeof iso !== "string") return String(iso ?? "");
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;

  let inferredAllDay: boolean;
  if (typeof allDay === "boolean") {
    inferredAllDay = allDay;
  } else {
    const m = d.getMinutes();
    const s = d.getSeconds();
    const h = d.getHours();
    inferredAllDay = s === 0 && m === 0 && (h === 0 || h === 12);
  }

  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const isTomorrow =
    d.getFullYear() === tomorrow.getFullYear() &&
    d.getMonth() === tomorrow.getMonth() &&
    d.getDate() === tomorrow.getDate();

  if (inferredAllDay) {
    if (sameDay) return "today";
    if (isTomorrow) return "tomorrow";
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function ReceiptBody({ name, receipt }: { name: string; receipt: Record<string, unknown> }) {
  if (name === "create_task") {
    const projects = Array.isArray(receipt.project_ids) ? receipt.project_ids.length : 0;
    return (
      <>
        <Text style={styles.title}>{String(receipt.title ?? "")}</Text>
        <Text style={styles.meta}>
          {String(receipt.priority ?? "P3")}
          {receipt.due
            ? ` · due ${fmtDate(receipt.due, typeof receipt.allDay === "boolean" ? receipt.allDay : undefined)}`
            : ""}
          {projects ? ` · ${projects} project${projects > 1 ? "s" : ""}` : ""}
        </Text>
      </>
    );
  }
  if (name === "create_capture") {
    const hashtags = Array.isArray(receipt.hashtags) ? (receipt.hashtags as string[]) : [];
    return (
      <>
        <Text style={styles.title}>{String(receipt.content ?? "")}</Text>
        {hashtags.length ? <Text style={styles.meta}>#{hashtags.join(" #")}</Text> : null}
      </>
    );
  }
  if (name === "create_event") {
    const allDay = typeof receipt.allDay === "boolean" ? receipt.allDay : undefined;
    return (
      <>
        <Text style={styles.title}>{String(receipt.title ?? "")}</Text>
        <Text style={styles.meta}>
          {fmtDate(receipt.start, allDay)} → {fmtDate(receipt.end, allDay)}
        </Text>
      </>
    );
  }
  if (name === "remember_fact") {
    return (
      <>
        <Text style={styles.title}>
          <Text style={styles.titleStrong}>{String(receipt.key ?? "")}</Text>
          {": "}
          {String(receipt.value ?? "")}
        </Text>
        <Text style={styles.meta}>{String(receipt.type ?? "")} · remembered</Text>
      </>
    );
  }
  // Generic fallback for tools without a bespoke body (future CRUD receipts):
  // show whatever human-readable fields the receipt carries.
  const headline = receipt.title ?? receipt.content ?? receipt.summary ?? receipt.key;
  return headline ? <Text style={styles.title}>{String(headline)}</Text> : null;
}

export function JarvisReceipt({
  action,
  onUndo,
}: {
  action: ReceiptAction;
  /** When provided (and the action succeeded), shows the 5s undo window. */
  onUndo?: () => void;
}) {
  const meta = INTENT_META[action.name] ?? {
    label: action.name.replace(/_/g, " ").toUpperCase(),
    dot: INK.cyanLight,
  };
  const result = (action.result ?? {}) as ActionResult;
  const ok = result.ok === true;
  const receipt = ok ? (result.receipt ?? {}) : null;
  const undone = action.undone === true;

  return (
    <View style={[styles.card, !ok && styles.cardError, undone && styles.cardUndone]}>
      <View style={styles.headerRow}>
        <View style={[styles.dot, { backgroundColor: meta.dot }]} />
        <Text style={styles.label}>{meta.label}</Text>
        <Text style={[styles.check, { color: ok ? INK.sage : INK.coral }]}>
          {ok ? "✓" : "✕"}
        </Text>
        {undone ? (
          <Text style={styles.undoneLabel}>undone</Text>
        ) : ok && onUndo ? (
          <UndoButton onUndo={onUndo} />
        ) : null}
      </View>
      {ok && receipt ? (
        <View style={[styles.body, undone && styles.bodyUndone]}>
          <ReceiptBody name={action.name} receipt={receipt} />
        </View>
      ) : (
        <Text style={styles.error}>{result.error ?? "failed"}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 4,
    backgroundColor: "rgba(0, 212, 255, 0.04)",
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: 8,
    // Soft cyan ambient halo (web: 0 0 24px --hud-cyan-glow-soft)
    shadowColor: colors.accent,
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
  },
  cardError: {
    borderLeftWidth: 3,
    borderLeftColor: INK.coral,
    shadowOpacity: 0,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  label: {
    color: colors.textDim,
    fontFamily: mono,
    fontSize: 10,
    letterSpacing: 1.5,
  },
  check: {
    fontFamily: mono,
    fontSize: 11,
    marginLeft: 2,
  },
  body: {
    marginTop: 5,
    gap: 2,
  },
  title: {
    color: colors.text,
    fontFamily: serif,
    fontSize: 15,
    lineHeight: 20,
  },
  titleStrong: {
    fontFamily: serif,
    fontWeight: "700",
  },
  meta: {
    color: colors.textDim,
    fontFamily: mono,
    fontSize: 11,
    letterSpacing: 0.5,
  },
  error: {
    color: INK.coral,
    fontFamily: mono,
    fontSize: 11,
    marginTop: 5,
  },
  cardUndone: {
    opacity: 0.45,
    shadowOpacity: 0,
  },
  bodyUndone: {
    opacity: 0.7,
  },
  undoneLabel: {
    marginLeft: "auto",
    color: colors.textDim,
    fontFamily: mono,
    fontSize: 10,
    letterSpacing: 1,
  },
  undo: {
    marginLeft: "auto",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  undoText: {
    color: colors.textDim,
    fontFamily: mono,
    fontSize: 10,
    letterSpacing: 0.5,
  },
});
