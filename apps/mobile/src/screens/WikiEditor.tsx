// Native host for the BlockNote 'use dom' editor. Loads a wiki page (by id, or
// the get-or-create daily page, or a fresh blank page), renders the native
// chrome (title TextInput + save-state affordance in the sd register), and
// hosts <WikiEditorDom> inside a KeyboardAvoidingView. Edits and the title
// autosave on a debounce; "Done" flushes immediately and closes.
//
// Navigation is stitched by the Conductor at merge: this screen is a plain
// component driven by a `target` prop + `onClose`. unit-wiki-browse links to it
// via WIKI_EDITOR_ROUTE / dailyQuickEntryTarget().

import type { Block } from "@blocknote/core";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import WikiEditorDom from "../components/wiki-editor/WikiEditorDom";
import { hasUnknownNodes } from "../components/wiki-editor/sanitize";
import {
  createPage,
  getDailyPage,
  getPage,
  patchPage,
  type WikiPage,
} from "../components/wiki-editor/wikiApi";
import { font, sd } from "../theme";

/** Route name for the manual nav stack (Root wires this at integration). */
export const WIKI_EDITOR_ROUTE = "wikiEditor" as const;

/** What the editor should open. */
export type WikiEditorTarget =
  | { kind: "page"; id: string }
  | { kind: "daily"; date?: string }
  | { kind: "new"; folderId?: string | null };

/** The daily "write it down" fast path — browse/More/tab link straight to this. */
export function dailyQuickEntryTarget(date?: string): WikiEditorTarget {
  return { kind: "daily", date };
}

type SaveState = "idle" | "saving" | "saved" | "error";

const SAVE_DEBOUNCE_MS = 800;

export function WikiEditorScreen({
  target,
  onClose,
}: {
  target: WikiEditorTarget;
  onClose?: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [page, setPage] = useState<WikiPage | null>(null);
  const [title, setTitle] = useState("");
  const [loadError, setLoadError] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [domReady, setDomReady] = useState(false);

  // Latest document JSON from the editor (null until the first real edit).
  const latestDoc = useRef<Block[] | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  // Load the target page. Re-runs if the target identity changes.
  const targetKey =
    target.kind === "page"
      ? `page:${target.id}`
      : target.kind === "daily"
        ? `daily:${target.date ?? "today"}`
        : `new:${target.folderId ?? ""}`;
  useEffect(() => {
    let cancelled = false;
    setLoadError(false);
    setPage(null);
    latestDoc.current = null;
    (async () => {
      try {
        const loaded =
          target.kind === "page"
            ? await getPage(target.id)
            : target.kind === "daily"
              ? await getDailyPage(target.date)
              : await createPage({ folderId: target.folderId ?? null });
        if (cancelled) return;
        setPage(loaded);
        setTitle(loaded.title ?? "");
      } catch {
        if (!cancelled) setLoadError(true);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetKey]);

  // Data-loss guard (Conductor amendment): a page whose contentJson carries
  // nodes the default schema can't render would be silently stripped by a
  // save. Such pages open READ-ONLY in v1 — no edits, no saves — so web-only
  // blocks (callout, linkEmbed, mentions, receipts) are never destroyed from
  // the phone. New / daily / plain / legacy-markdown pages lock nothing.
  const locked = page !== null && hasUnknownNodes(page.contentJson);

  // Persist the current title + latest document. `immediate` bypasses the
  // debounce (used by "Done"). Returns true on success.
  const doSave = useCallback(async (): Promise<boolean> => {
    const current = page;
    if (!current || locked) return false;
    setSaveState("saving");
    try {
      const patch: Parameters<typeof patchPage>[1] = { title };
      if (latestDoc.current) patch.contentJson = latestDoc.current as unknown[];
      const updated = await patchPage(current.id, patch);
      if (!mounted.current) return true;
      setPage(updated);
      setSaveState("saved");
      return true;
    } catch {
      if (mounted.current) setSaveState("error");
      return false;
    }
  }, [page, title, locked]);

  const scheduleSave = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void doSave();
    }, SAVE_DEBOUNCE_MS);
  }, [doSave]);

  const handleTitleChange = useCallback(
    (next: string) => {
      setTitle(next);
      scheduleSave();
    },
    [scheduleSave],
  );

  // Bridged from the DOM editor on every (debounced-by-us) edit.
  const handleDomChange = useCallback(
    async (doc: Block[]) => {
      latestDoc.current = doc;
      scheduleSave();
    },
    [scheduleSave],
  );

  const handleReady = useCallback(async () => {
    setDomReady(true);
  }, []);

  const handleDone = useCallback(async () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    await doSave();
    onClose?.();
  }, [doSave, onClose]);

  // Only hand content to the DOM editor once it has mounted (kept tiny at first
  // render to dodge the #46374 blank-WebView bug), and only when a page exists.
  const deliver = domReady && page !== null;
  // Daily / brand-new pages want the caret in the body straight away.
  const autoFocus = target.kind !== "page";

  return (
    <View style={[styles.root, { paddingTop: insets.top + 6 }]}>
      <View style={styles.header}>
        <Pressable
          onPress={() => void handleDone()}
          hitSlop={10}
          style={({ pressed }) => [styles.doneBtn, pressed && { opacity: 0.7 }]}
          accessibilityRole="button"
          accessibilityLabel="Done"
        >
          <Text style={styles.doneLabel}>Done</Text>
        </Pressable>
        {page?.emoji ? <Text style={styles.emoji}>{page.emoji}</Text> : null}
        <TextInput
          style={styles.titleInput}
          value={title}
          onChangeText={handleTitleChange}
          placeholder="Untitled"
          placeholderTextColor={sd.inkFaint}
          editable={page !== null && !locked}
          returnKeyType="done"
        />
        <SaveBadge state={locked ? "idle" : saveState} />
      </View>

      {locked ? (
        <View style={styles.lockBanner}>
          <Text style={styles.lockText}>
            This page uses blocks mobile can&apos;t edit yet — read-only.
          </Text>
        </View>
      ) : null}

      <KeyboardAvoidingView
        style={styles.body}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        {loadError ? (
          <View style={styles.center}>
            <Text style={styles.errorText}>Couldn&apos;t load this page.</Text>
          </View>
        ) : (
          <WikiEditorDom
            contentKey={page?.id}
            content={deliver ? (page?.contentJson ?? null) : null}
            markdownFallback={deliver ? (page?.content ?? undefined) : undefined}
            editable={!locked}
            autoFocus={autoFocus && !locked}
            onReady={handleReady}
            onChange={handleDomChange}
            dom={{
              scrollEnabled: true,
              style: { flex: 1, backgroundColor: sd.app },
              containerStyle: { flex: 1, backgroundColor: sd.app },
            }}
          />
        )}
        {page === null && !loadError ? (
          <View style={styles.center} pointerEvents="none">
            <ActivityIndicator color={sd.accent} />
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </View>
  );
}

function SaveBadge({ state }: { state: SaveState }) {
  if (state === "idle") return <View style={styles.badgeSlot} />;
  const label =
    state === "saving" ? "saving…" : state === "saved" ? "saved" : "retry save";
  const color = state === "error" ? sd.coral : state === "saved" ? sd.sage : sd.inkFaint;
  return (
    <View style={styles.badgeSlot}>
      <Text style={[styles.badgeLabel, { color }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: sd.app,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: sd.line,
  },
  doneBtn: {
    paddingVertical: 4,
    paddingRight: 4,
  },
  doneLabel: {
    color: sd.accent,
    fontFamily: font.sansSemiBold,
    fontSize: 15,
  },
  emoji: {
    fontSize: 18,
  },
  titleInput: {
    flex: 1,
    color: sd.ink,
    fontFamily: font.sansSemiBold,
    fontSize: 19,
    letterSpacing: -0.2,
    paddingVertical: 2,
  },
  badgeSlot: {
    minWidth: 64,
    alignItems: "flex-end",
  },
  badgeLabel: {
    fontFamily: font.mono,
    fontSize: 10,
    letterSpacing: 0.6,
  },
  lockBanner: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: sd.darkBox,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: sd.line,
  },
  lockText: {
    color: sd.amber,
    fontFamily: font.mono,
    fontSize: 11,
    letterSpacing: 0.4,
  },
  body: {
    flex: 1,
  },
  center: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  errorText: {
    color: sd.inkFaint,
    fontFamily: font.sans,
    fontSize: 14,
  },
});
