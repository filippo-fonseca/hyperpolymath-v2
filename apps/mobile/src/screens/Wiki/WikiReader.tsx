// Wiki page reader. Fetches the full page by id and renders the markdown mirror
// `content`. When `content` is empty (legacy page), it falls back to a plain
// text extract of `contentJson`. The Edit button stays disabled with a subtle
// hint until unit-wiki-editor wires an `onEdit` handler.

import { useCallback, useEffect, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { KiwiLoader } from "../../components/KiwiLoader";
import { getWikiPage, type WikiPage } from "../../lib/wiki-api";
import { font, sd } from "../../theme";
import { Markdown } from "./Markdown";

type LoadState =
  | { phase: "loading" }
  | { phase: "error" }
  | { phase: "ready"; page: WikiPage };

/** Best-effort plain-text extract from a BlockNote contentJson document. */
function contentJsonToText(json: unknown): string {
  const out: string[] = [];
  const walkInline = (nodes: unknown): string => {
    if (!Array.isArray(nodes)) return "";
    return nodes
      .map((n) => {
        if (typeof n === "string") return n;
        if (n && typeof n === "object" && "text" in n) {
          return String((n as { text: unknown }).text ?? "");
        }
        return "";
      })
      .join("");
  };
  const walkBlocks = (blocks: unknown) => {
    if (!Array.isArray(blocks)) return;
    for (const block of blocks) {
      if (!block || typeof block !== "object") continue;
      const b = block as { content?: unknown; children?: unknown };
      const line = walkInline(b.content).trim();
      if (line) out.push(line);
      if (b.children) walkBlocks(b.children);
    }
  };
  walkBlocks(json);
  return out.join("\n\n");
}

export function WikiReader({ pageId, onBack, onEdit }: {
  pageId: string;
  onBack: () => void;
  /** Wired by unit-wiki-editor; disabled with a hint while undefined. */
  onEdit?: (page: WikiPage) => void;
}) {
  const insets = useSafeAreaInsets();
  const [state, setState] = useState<LoadState>({ phase: "loading" });
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const page = await getWikiPage(pageId);
    setState(page ? { phase: "ready", page } : { phase: "error" });
  }, [pageId]);

  useEffect(() => {
    setState({ phase: "loading" });
    void load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const page = state.phase === "ready" ? state.page : null;
  const body =
    page && page.content.trim()
      ? page.content
      : page
        ? contentJsonToText(page.contentJson)
        : "";

  return (
    <View style={styles.root}>
      <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
        <Pressable
          onPress={onBack}
          hitSlop={10}
          style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.6 }]}
          accessibilityRole="button"
          accessibilityLabel="Back to wiki"
        >
          <Text style={styles.backLabel}>‹ WIKI</Text>
        </Pressable>
        <View style={styles.topSpacer} />
        {onEdit && page ? (
          <Pressable
            onPress={() => onEdit(page)}
            hitSlop={10}
            style={({ pressed }) => [styles.editBtn, pressed && { opacity: 0.6 }]}
            accessibilityRole="button"
            accessibilityLabel="Edit page"
          >
            <Text style={styles.editLabel}>EDIT</Text>
          </Pressable>
        ) : (
          <View style={styles.editBtnDisabled} accessibilityLabel="Editor coming soon">
            <Text style={styles.editLabelDisabled}>EDIT</Text>
          </View>
        )}
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={sd.accent} />
        }
      >
        {state.phase === "loading" ? (
          <View style={styles.center}>
            <KiwiLoader size={32} />
          </View>
        ) : null}

        {state.phase === "error" ? (
          <View style={styles.center}>
            <Text style={styles.errorTitle}>Could not load page</Text>
            <Text style={styles.errorHint}>
              Pull to retry. Check the server URL and sign-in in Settings.
            </Text>
          </View>
        ) : null}

        {page ? (
          <>
            <View style={styles.titleRow}>
              {page.emoji ? <Text style={styles.emoji}>{page.emoji}</Text> : null}
              <Text style={styles.title} selectable>
                {page.title || "Untitled"}
              </Text>
            </View>
            <Text style={styles.meta}>
              {page.pinned ? "PINNED · " : ""}
              UPDATED {relativeTime(page.updatedAt)}
            </Text>

            {!onEdit ? (
              <Text style={styles.editHint}>Editing arrives in this session.</Text>
            ) : null}

            <View style={styles.divider} />

            {body.trim() ? (
              <Markdown source={body} />
            ) : (
              <Text style={styles.emptyBody}>This page is empty.</Text>
            )}
          </>
        ) : null}
        <View style={{ height: 90 }} />
      </ScrollView>
    </View>
  );
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "recently";
  const mins = Math.floor((Date.now() - then) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: sd.app,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  backBtn: {
    paddingVertical: 4,
    paddingRight: 8,
  },
  backLabel: {
    color: sd.accent,
    fontFamily: font.mono,
    fontSize: 12,
    letterSpacing: 0.8,
  },
  topSpacer: {
    flex: 1,
  },
  editBtn: {
    borderRadius: sd.radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: sd.line,
    backgroundColor: sd.box,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  editLabel: {
    color: sd.ink,
    fontFamily: font.mono,
    fontSize: 11,
    letterSpacing: 1,
  },
  editBtnDisabled: {
    borderRadius: sd.radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: sd.line,
    backgroundColor: sd.darkBox,
    paddingHorizontal: 14,
    paddingVertical: 6,
    opacity: 0.5,
  },
  editLabelDisabled: {
    color: sd.inkFaint,
    fontFamily: font.mono,
    fontSize: 11,
    letterSpacing: 1,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 4,
  },
  center: {
    paddingTop: 80,
    alignItems: "center",
    gap: 10,
  },
  errorTitle: {
    color: sd.ink,
    fontFamily: font.sansSemiBold,
    fontSize: 16,
  },
  errorHint: {
    color: sd.inkFaint,
    fontFamily: font.sans,
    fontSize: 13,
    textAlign: "center",
    paddingHorizontal: 30,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginTop: 4,
  },
  emoji: {
    fontSize: 28,
    lineHeight: 34,
  },
  title: {
    flex: 1,
    color: sd.ink,
    fontFamily: font.sansBold,
    fontSize: 27,
    letterSpacing: -0.4,
    lineHeight: 33,
  },
  meta: {
    color: sd.inkFaint,
    fontFamily: font.mono,
    fontSize: 10,
    letterSpacing: 0.8,
    marginTop: 8,
  },
  editHint: {
    color: sd.inkFaint,
    fontFamily: font.sans,
    fontSize: 12,
    fontStyle: "italic",
    marginTop: 6,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: sd.line,
    marginVertical: 18,
  },
  emptyBody: {
    color: sd.inkFaint,
    fontFamily: font.sans,
    fontSize: 15,
  },
});
