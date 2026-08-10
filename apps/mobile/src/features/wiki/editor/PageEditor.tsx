// Native host for the BlockNote 'use dom' editor. The page is already loaded
// by PageScreen; this component owns the editing session: it withholds content
// until the DOM side signals ready (#46374), debounces autosave by 800ms
// through the data layer's patch mutation, and reports save state upward so
// the screen header can show the badge. Flush is exposed imperatively for the
// header's "Done".

import type { Block } from "@blocknote/core";
import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { KeyboardAvoidingView, Platform, View } from "react-native";

import { useWikiMutations, type WikiPage } from "@/data/useWiki";
import { useTheme } from "@/theme";
import { Spinner } from "@/ui";

import WikiEditorDom from "./WikiEditorDom";

export type SaveState = "idle" | "saving" | "saved" | "error";

export interface PageEditorHandle {
  /** Cancel the debounce and persist now (used by the header's Done). */
  flush: () => Promise<void>;
}

const SAVE_DEBOUNCE_MS = 800;

export const PageEditor = forwardRef<
  PageEditorHandle,
  {
    page: WikiPage;
    autoFocus?: boolean;
    onSaveState?: (state: SaveState) => void;
    onTitleChange?: (title: string) => void;
  }
>(function PageEditor({ page, autoFocus = false, onSaveState, onTitleChange }, ref) {
  const t = useTheme();
  const { patch } = useWikiMutations();

  const [domReady, setDomReady] = useState(false);

  // Latest edits, staged between debounced saves.
  const latestDoc = useRef<Block[] | null>(null);
  const latestTitle = useRef<string>(page.title ?? "");
  const dirty = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  const setState = useCallback(
    (s: SaveState) => {
      if (mounted.current) onSaveState?.(s);
    },
    [onSaveState],
  );

  const doSave = useCallback(async (): Promise<void> => {
    if (!dirty.current) return;
    dirty.current = false;
    setState("saving");
    try {
      const body: { title?: string; contentJson?: unknown[] } = {
        title: latestTitle.current,
      };
      if (latestDoc.current) body.contentJson = latestDoc.current as unknown[];
      await patch.mutateAsync({ id: page.id, patch: body });
      setState("saved");
    } catch {
      dirty.current = true;
      setState("error");
    }
  }, [page.id, patch, setState]);

  const scheduleSave = useCallback(() => {
    dirty.current = true;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void doSave();
    }, SAVE_DEBOUNCE_MS);
  }, [doSave]);

  useImperativeHandle(
    ref,
    () => ({
      flush: async () => {
        if (saveTimer.current) clearTimeout(saveTimer.current);
        await doSave();
      },
    }),
    [doSave],
  );

  const handleTitleChange = useCallback(
    async (next: string) => {
      latestTitle.current = next;
      onTitleChange?.(next);
      scheduleSave();
    },
    [onTitleChange, scheduleSave],
  );

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

  // Only hand content to the DOM editor once it has mounted (kept tiny at
  // first render to dodge the #46374 blank-WebView bug).
  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <WikiEditorDom
        contentKey={page.id}
        content={domReady ? (page.contentJson ?? null) : null}
        markdownFallback={domReady ? (page.content ?? undefined) : undefined}
        editable
        autoFocus={autoFocus}
        title={page.title ?? ""}
        emoji={page.emoji}
        titleEditable
        scheme={t.scheme}
        onReady={handleReady}
        onChange={handleDomChange}
        onTitleChange={handleTitleChange}
        dom={{
          scrollEnabled: true,
          style: { flex: 1, backgroundColor: t.c.canvas },
          containerStyle: { flex: 1, backgroundColor: t.c.canvas },
        }}
      />
      {!domReady ? (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Spinner size="md" />
        </View>
      ) : null}
    </KeyboardAvoidingView>
  );
});
