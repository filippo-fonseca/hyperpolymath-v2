// The composer — mobile port of the browser console's power input.
//
//   /        → slash command picker (task / capture / event / ask / help)
//   $word    → project suggestions from the user's project list
//   #word    → hashtag suggestions (+ "new" affordance)
//   p1/p2/p3/p0/ptop → priority badge (parsed live)
//   "tomorrow 5pm"   → date badge via chrono (parsed live, tz-aware)
//
// Phone UX: suggestions render as a tappable list directly above the input
// (no keyboard nav needed); a pinned slash command shows as a dismissible
// chip; detected priority/date tokens show as passive badges so you know
// JARVIS saw them before you hit send.

import { parseDates, parsePriority } from "@hyperpolymath/jarvis-core/parsers";
import type { SlashCommand } from "@hyperpolymath/jarvis-core/parsers";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import type { HashtagRef, ProjectRef } from "../lib/jarvis-context";
import { projectTokenName } from "../lib/input-payload";
import { colors, mono, serif } from "../theme";

const SLASH_COMMANDS: Array<{ key: SlashCommand; description: string }> = [
  { key: "task", description: "force task creation" },
  { key: "capture", description: "force capture creation" },
  { key: "event", description: "force calendar event" },
  { key: "ask", description: "ask a question (text reply, no action)" },
  { key: "help", description: "show this list" },
];

const PRIORITY_TOKEN_RE = /\b(ptop|p0|p1|p2|p3)\b/i;

interface ActiveToken {
  kind: "slash" | "project" | "hashtag";
  /** Query text after the trigger char. */
  query: string;
  /** Index of the trigger char in the input value. */
  start: number;
}

/** Find the trigger token the caret is currently inside (end of text). */
function findActiveToken(value: string): ActiveToken | null {
  const m = value.match(/(^|\s)([/$#])([\p{L}\p{N}_]*)$/u);
  if (!m) return null;
  const trigger = m[2]!;
  const query = m[3] ?? "";
  const start = value.length - query.length - 1;
  if (trigger === "/") {
    // Slash only counts at the very start of the message.
    if (start !== 0) return null;
    return { kind: "slash", query, start };
  }
  return { kind: trigger === "$" ? "project" : "hashtag", query, start };
}

export interface TextBarSubmit {
  text: string;
  pinnedCommand: SlashCommand | null;
}

export function TextBar({
  disabled,
  projects,
  hashtags,
  timezone,
  focusRef,
  onSubmit,
}: {
  disabled: boolean;
  projects: ProjectRef[];
  hashtags: HashtagRef[];
  timezone: string;
  /** Optional ref — callers can call `.current?.focus()` to open the keyboard. */
  focusRef?: React.RefObject<TextInput | null>;
  onSubmit: (submit: TextBarSubmit) => void;
}) {
  const [value, setValue] = useState("");
  const [pinned, setPinned] = useState<SlashCommand | null>(null);
  const [focused, setFocused] = useState(false);
  const internalRef = useRef<TextInput>(null);
  const resolvedRef = focusRef ?? internalRef;

  const active = useMemo(() => findActiveToken(value), [value]);

  // Live token badges — what JARVIS will see at send time.
  const [badges, setBadges] = useState<string[]>([]);
  useEffect(() => {
    const t = setTimeout(() => {
      const next: string[] = [];
      const pm = value.match(PRIORITY_TOKEN_RE);
      if (pm) next.push(parsePriority(value));
      try {
        for (const d of parseDates(value, timezone).slice(0, 2)) {
          next.push(`⏱ ${d.text}`);
        }
      } catch {
        // chrono should never throw; badges are best-effort
      }
      setBadges(next);
    }, 180);
    return () => clearTimeout(t);
  }, [value, timezone]);

  const suggestions = useMemo(() => {
    if (!active) return [];
    const q = active.query.toLowerCase();
    if (active.kind === "slash") {
      return SLASH_COMMANDS.filter((c) => c.key.startsWith(q)).map((c) => ({
        key: c.key,
        label: `/${c.key}`,
        detail: c.description,
      }));
    }
    if (active.kind === "project") {
      return projects
        .filter((p) => projectTokenName(p.name).includes(q))
        .slice(0, 6)
        .map((p) => ({
          key: p.id,
          label: `${p.icon ? `${p.icon} ` : ""}${p.name}`,
          detail: `$${projectTokenName(p.name)}`,
        }));
    }
    const matches = hashtags
      .filter((h) => h.name.includes(q))
      .slice(0, 6)
      .map((h) => ({ key: h.name, label: `#${h.displayName}`, detail: "" }));
    if (q && !hashtags.some((h) => h.name === q)) {
      matches.push({ key: `new-${q}`, label: `#${q}`, detail: "new" });
    }
    return matches;
  }, [active, projects, hashtags]);

  const applySuggestion = (key: string, label: string) => {
    if (!active) return;
    const before = value.slice(0, active.start);
    if (active.kind === "slash") {
      setPinned(key as SlashCommand);
      setValue(before);
      return;
    }
    if (active.kind === "project") {
      const project = projects.find((p) => p.id === key);
      const token = project ? `$${projectTokenName(project.name)}` : label;
      setValue(`${before}${token} `);
      return;
    }
    const tag = key.startsWith("new-") ? key.slice(4) : key;
    setValue(`${before}#${tag} `);
  };

  const submit = () => {
    const text = value.trim();
    if ((!text && !pinned) || disabled) return;
    setValue("");
    const pinnedCommand = pinned;
    setPinned(null);
    onSubmit({ text, pinnedCommand });
  };

  const showHint = focused && !value && !pinned;

  return (
    <View>
      {suggestions.length > 0 && (
        <View style={styles.suggestions}>
          {suggestions.map((s) => (
            <Pressable
              key={s.key}
              onPress={() => applySuggestion(s.key, s.label)}
              style={({ pressed }) => [styles.suggestionRow, pressed && styles.suggestionPressed]}
            >
              <Text style={styles.suggestionLabel}>{s.label}</Text>
              {s.detail ? <Text style={styles.suggestionDetail}>{s.detail}</Text> : null}
            </Pressable>
          ))}
        </View>
      )}

      {(pinned || badges.length > 0 || showHint) && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="always"
          style={styles.chipRow}
          contentContainerStyle={styles.chipRowContent}
        >
          {pinned ? (
            <Pressable onPress={() => setPinned(null)} style={[styles.chip, styles.chipPinned]}>
              <Text style={styles.chipPinnedText}>/{pinned}</Text>
              <Text style={styles.chipDismiss}>×</Text>
            </Pressable>
          ) : null}
          {badges.map((b) => (
            <View key={b} style={styles.chip}>
              <Text style={styles.chipText}>{b}</Text>
            </View>
          ))}
          {showHint ? (
            <Text style={styles.hint}>/ commands · $ projects · # tags · p1 · “tmrw 5pm”</Text>
          ) : null}
        </ScrollView>
      )}

      <View style={styles.row}>
        <TextInput
          ref={resolvedRef}
          style={styles.input}
          value={value}
          onChangeText={setValue}
          onSubmitEditing={submit}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder="Tell JARVIS what's on your mind…"
          placeholderTextColor={colors.textDim}
          returnKeyType="send"
          submitBehavior="submit"
          autoCapitalize="sentences"
          autoCorrect
          editable={!disabled}
          multiline={false}
        />
        <Pressable
          onPress={submit}
          disabled={disabled || (!value.trim() && !pinned)}
          style={({ pressed }) => [
            styles.send,
            (disabled || (!value.trim() && !pinned)) && styles.sendDisabled,
            pressed && { opacity: 0.7 },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Send"
        >
          <Text style={styles.sendLabel}>↑</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  suggestions: {
    marginHorizontal: 16,
    marginBottom: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    overflow: "hidden",
  },
  suggestionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.hairline,
  },
  suggestionPressed: {
    backgroundColor: "rgba(0, 212, 255, 0.08)",
  },
  suggestionLabel: {
    color: colors.text,
    fontFamily: serif,
    fontSize: 16,
  },
  suggestionDetail: {
    color: colors.textDim,
    fontFamily: mono,
    fontSize: 11,
  },
  chipRow: {
    marginBottom: 6,
    maxHeight: 30,
  },
  chipRowContent: {
    paddingHorizontal: 16,
    gap: 6,
    alignItems: "center",
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "rgba(0, 212, 255, 0.07)",
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  chipPinned: {
    backgroundColor: "rgba(0, 212, 255, 0.16)",
  },
  chipText: {
    color: colors.accent,
    fontFamily: mono,
    fontSize: 11,
  },
  chipPinnedText: {
    color: colors.accent,
    fontFamily: mono,
    fontSize: 11,
    fontWeight: "700",
  },
  chipDismiss: {
    color: colors.textDim,
    fontFamily: mono,
    fontSize: 13,
    marginTop: -1,
  },
  hint: {
    color: colors.textDim,
    fontFamily: mono,
    fontSize: 10,
    letterSpacing: 0.5,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 2,
  },
  input: {
    flex: 1,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    color: colors.text,
    paddingHorizontal: 16,
    fontFamily: serif,
    fontSize: 17,
  },
  send: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "rgba(0, 212, 255, 0.12)",
  },
  sendDisabled: {
    opacity: 0.35,
  },
  sendLabel: {
    color: colors.accent,
    fontSize: 18,
    fontFamily: mono,
  },
});
