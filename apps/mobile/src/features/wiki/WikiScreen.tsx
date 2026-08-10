// Wiki browse: the Files.app drill-in over the folder tree, restyled to the
// craft register. Root shows the daily-note fast path, then the current
// level's folders as tinted tiles and its pages as rows. A non-empty search
// flattens the whole tree. Server order is trusted throughout.

import { useRouter } from "expo-router";
import {
  ChevronRight,
  FileText,
  Folder,
  PenLine,
  Pin,
  Plus,
  Search,
  X,
} from "lucide-react-native";
import React, { useCallback, useMemo, useState } from "react";
import { RefreshControl, ScrollView, TextInput, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";

import { getDailyPage } from "@/api/wiki";
import { queryClient } from "@/data/queryClient";
import { queryKeys } from "@/data/queryKeys";
import {
  useWikiMutations,
  useWikiTree,
  type WikiFolder,
  type WikiPageMeta,
} from "@/data/useWiki";
import { tintFor, useTheme, withAlpha } from "@/theme";
import {
  AppText,
  Button,
  EmptyState,
  ListRow,
  PressableRow,
  ScreenHeader,
  Screen,
  SectionHeader,
  SkeletonRows,
  Spinner,
} from "@/ui";

import { relativeTime } from "./relativeTime";

export default function WikiScreen() {
  const t = useTheme();
  const router = useRouter();
  const tree = useWikiTree();
  const { create } = useWikiMutations();

  const [stack, setStack] = useState<WikiFolder[]>([]);
  const [query, setQuery] = useState("");
  const [dailyOpening, setDailyOpening] = useState(false);

  const folders = tree.data?.folders ?? [];
  const pages = tree.data?.pages ?? [];
  const current = stack.length ? stack[stack.length - 1] : null;
  const currentId = current?.id ?? null;
  const searching = query.trim().length > 0;
  const q = query.trim().toLowerCase();

  const subfolders = useMemo(
    () => folders.filter((f) => f.parentId === currentId),
    [folders, currentId],
  );
  const folderPages = useMemo(
    () => pages.filter((p) => p.folderId === currentId),
    [pages, currentId],
  );
  const pagesPerFolder = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of pages) {
      if (p.folderId) counts.set(p.folderId, (counts.get(p.folderId) ?? 0) + 1);
    }
    return counts;
  }, [pages]);

  const matchedFolders = useMemo(
    () => (searching ? folders.filter((f) => f.name.toLowerCase().includes(q)) : []),
    [folders, q, searching],
  );
  const matchedPages = useMemo(
    () =>
      searching
        ? pages.filter((p) => (p.title || "Untitled").toLowerCase().includes(q))
        : [],
    [pages, q, searching],
  );

  const openPage = useCallback(
    (id: string) => router.push(`/wiki/${id}`),
    [router],
  );

  const openDaily = useCallback(async () => {
    if (dailyOpening) return;
    setDailyOpening(true);
    try {
      const page = await getDailyPage();
      if (page) {
        queryClient.setQueryData(queryKeys.wikiPage(page.id), page);
        router.push(`/wiki/${page.id}`);
      }
    } finally {
      setDailyOpening(false);
    }
  }, [dailyOpening, router]);

  const newPage = useCallback(() => {
    create.mutate(
      { folderId: currentId },
      { onSuccess: (page) => router.push(`/wiki/${page.id}`) },
    );
  }, [create, currentId, router]);

  const enterFolder = useCallback((folder: WikiFolder) => {
    setStack((s) => [...s, folder]);
    setQuery("");
  }, []);
  const goUpTo = useCallback((index: number) => setStack((s) => s.slice(0, index)), []);

  return (
    <Screen padded={false}>
      <View style={{ paddingHorizontal: 16 }}>
        <ScreenHeader
          title="Wiki"
          subtitle={tree.data ? `${pages.length} pages` : undefined}
          right={
            <PressableRow
              onPress={newPage}
              haptic
              disabled={create.isPending}
              accessibilityRole="button"
              accessibilityLabel="New page"
              style={{
                width: 32,
                height: 32,
                borderRadius: t.radius.tile,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {create.isPending ? (
                <Spinner size="sm" />
              ) : (
                <Plus size={18} color={t.c.inkMuted} strokeWidth={2} />
              )}
            </PressableRow>
          }
        />

        {/* Search field — surface input, hairline edge, radius 10. */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            height: 36,
            borderRadius: t.radius.btn,
            borderWidth: 0.5,
            borderColor: t.c.edge,
            backgroundColor: t.c.surface,
            paddingHorizontal: 10,
            marginTop: 8,
          }}
        >
          <Search size={15} color={t.c.inkFaint} strokeWidth={2} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search pages…"
            placeholderTextColor={t.c.inkFaint}
            autoCapitalize="none"
            autoCorrect={false}
            style={{
              flex: 1,
              fontFamily: t.fonts.sans,
              fontSize: t.type.body.fontSize,
              color: t.c.ink,
              paddingVertical: 0,
            }}
          />
          {searching ? (
            <PressableRow
              onPress={() => setQuery("")}
              accessibilityRole="button"
              accessibilityLabel="Clear search"
              style={{ padding: 4, borderRadius: 999 }}
            >
              <X size={13} color={t.c.inkFaint} strokeWidth={2} />
            </PressableRow>
          ) : null}
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 96 }}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={tree.isRefetching}
            onRefresh={() => void tree.refetch()}
            tintColor={t.c.inkMuted}
          />
        }
      >
        {tree.isLoading ? (
          <View style={{ paddingTop: 16 }}>
            <SkeletonRows rows={6} />
          </View>
        ) : tree.isError && !tree.data ? (
          <EmptyState
            title="Couldn't load the wiki"
            caption="Check the server connection, then try again."
            action={
              <Button
                label="Retry"
                variant="outline"
                size="sm"
                onPress={() => void tree.refetch()}
              />
            }
          />
        ) : searching ? (
          <SearchResults
            folders={matchedFolders}
            pages={matchedPages}
            pagesPerFolder={pagesPerFolder}
            onOpenFolder={enterFolder}
            onOpenPage={openPage}
          />
        ) : (
          <>
            {stack.length === 0 ? (
              <DailyNoteRow opening={dailyOpening} onPress={() => void openDaily()} />
            ) : (
              <Breadcrumbs stack={stack} onCrumb={goUpTo} />
            )}

            {subfolders.length === 0 && folderPages.length === 0 ? (
              <EmptyState
                title={stack.length === 0 ? "No pages yet" : "This folder is empty"}
                caption={
                  stack.length === 0
                    ? "Start with today's note, or create a page."
                    : "Pages filed here will show up in this view."
                }
              />
            ) : (
              <>
                {subfolders.length > 0 ? (
                  <FolderGrid
                    folders={subfolders}
                    pagesPerFolder={pagesPerFolder}
                    onOpen={enterFolder}
                  />
                ) : null}
                {folderPages.length > 0 ? (
                  <View style={{ marginTop: subfolders.length > 0 ? 4 : 8, gap: 2 }}>
                    {folderPages.map((page, i) => (
                      <PageListRow
                        key={page.id}
                        page={page}
                        index={i}
                        onPress={() => openPage(page.id)}
                      />
                    ))}
                  </View>
                ) : null}
              </>
            )}
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

/** Root fast path: open (or create) today's note. */
function DailyNoteRow({ opening, onPress }: { opening: boolean; onPress: () => void }) {
  const t = useTheme();
  const sky = t.scheme === "light" ? tintFor("sky-anchor", "light") : tintFor("sky-anchor", "dark");
  return (
    <Animated.View entering={FadeInDown.duration(t.motion.duration.enter)}>
      <PressableRow
        onPress={onPress}
        haptic
        accessibilityRole="button"
        accessibilityLabel="Write today's note"
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
          marginTop: 12,
          borderRadius: t.radius.card,
          borderWidth: 0.5,
          borderColor: t.c.edge,
          backgroundColor: t.c.surfaceRaised,
          padding: 12,
          ...t.shadow.card,
        }}
      >
        <View
          style={{
            width: 36,
            height: 36,
            borderRadius: t.radius.btn,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: sky.bg,
            borderWidth: 0.5,
            borderColor: withAlpha(sky.edge, 0.45),
          }}
        >
          <PenLine size={17} color={sky.ink} strokeWidth={2} />
        </View>
        <View style={{ flex: 1 }}>
          <AppText variant="body" weight="medium">
            Today&apos;s note
          </AppText>
          <AppText variant="micro" mono faint>
            {new Date().toLocaleDateString(undefined, {
              weekday: "long",
              month: "short",
              day: "numeric",
            })}
          </AppText>
        </View>
        {opening ? (
          <Spinner size="sm" />
        ) : (
          <ChevronRight size={16} color={t.c.inkFaint} strokeWidth={2} />
        )}
      </PressableRow>
    </Animated.View>
  );
}

function Breadcrumbs({
  stack,
  onCrumb,
}: {
  stack: WikiFolder[];
  onCrumb: (index: number) => void;
}) {
  const t = useTheme();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={{ marginTop: 10, maxHeight: 30 }}
      contentContainerStyle={{ alignItems: "center", gap: 6 }}
    >
      <PressableRow
        onPress={() => onCrumb(0)}
        style={{ paddingVertical: 4, paddingHorizontal: 4, borderRadius: 6 }}
      >
        <AppText variant="meta" muted>
          Wiki
        </AppText>
      </PressableRow>
      {stack.map((f, i) => {
        const active = i === stack.length - 1;
        return (
          <View key={f.id} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <AppText variant="meta" faint>
              /
            </AppText>
            <PressableRow
              onPress={() => onCrumb(i + 1)}
              style={{ paddingVertical: 4, paddingHorizontal: 4, borderRadius: 6 }}
            >
              <AppText
                variant="meta"
                weight={active ? "medium" : "regular"}
                muted={!active}
                numberOfLines={1}
                style={{ maxWidth: 150 }}
              >
                {f.name}
              </AppText>
            </PressableRow>
          </View>
        );
      })}
    </ScrollView>
  );
}

/** Two-up folder tiles with tinted icon plates (web folder painting). */
function FolderGrid({
  folders,
  pagesPerFolder,
  onOpen,
}: {
  folders: WikiFolder[];
  pagesPerFolder: Map<string, number>;
  onOpen: (f: WikiFolder) => void;
}) {
  const t = useTheme();
  return (
    <View
      style={{
        flexDirection: "row",
        flexWrap: "wrap",
        gap: 10,
        marginTop: 12,
      }}
    >
      {folders.map((folder, i) => {
        // Device tree carries no chosen color yet; the stable hash keeps
        // every folder's hue consistent with the web's unpainted fallback.
        const tint = tintFor(folder.id, t.scheme);
        const count = pagesPerFolder.get(folder.id) ?? 0;
        return (
          <Animated.View
            key={folder.id}
            entering={FadeInDown.duration(t.motion.duration.enter).delay(
              Math.min(i, 8) * 20,
            )}
            style={{ flexBasis: "48%", flexGrow: 1 }}
          >
            <PressableRow
              onPress={() => onOpen(folder)}
              haptic
              accessibilityRole="button"
              accessibilityLabel={`Folder ${folder.name}`}
              style={{
                borderRadius: t.radius.card,
                borderWidth: 0.5,
                borderColor: t.c.edge,
                backgroundColor: t.c.surfaceRaised,
                padding: 12,
                gap: 10,
                ...t.shadow.card,
              }}
            >
              <View
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: t.radius.btn,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: tint.bg,
                  borderWidth: 0.5,
                  borderColor: withAlpha(tint.edge, 0.45),
                }}
              >
                <Folder size={17} color={tint.ink} strokeWidth={2} />
              </View>
              <View>
                <AppText variant="body" weight="medium" numberOfLines={1}>
                  {folder.name}
                </AppText>
                <AppText variant="micro" mono faint>
                  {count === 1 ? "1 page" : `${count} pages`}
                </AppText>
              </View>
            </PressableRow>
          </Animated.View>
        );
      })}
    </View>
  );
}

function PageListRow({
  page,
  index,
  onPress,
}: {
  page: WikiPageMeta;
  index: number;
  onPress: () => void;
}) {
  const t = useTheme();
  return (
    <Animated.View
      entering={FadeInDown.duration(t.motion.duration.enter).delay(Math.min(index, 12) * 15)}
    >
      <ListRow
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`Page ${page.title || "Untitled"}`}
        style={{ minHeight: 48 }}
        left={
          page.emoji ? (
            <AppText variant="subtitle">{page.emoji}</AppText>
          ) : (
            <FileText size={17} color={t.c.inkMuted} strokeWidth={1.75} />
          )
        }
        right={
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            {page.pinned ? <Pin size={12} color={t.c.inkFaint} strokeWidth={2} /> : null}
            <AppText variant="micro" mono faint>
              {relativeTime(page.updatedAt)}
            </AppText>
          </View>
        }
      >
        <AppText variant="body" numberOfLines={1}>
          {page.title || "Untitled"}
        </AppText>
        {page.dailyDate ? (
          <AppText variant="micro" mono faint>
            daily · {page.dailyDate}
          </AppText>
        ) : null}
      </ListRow>
    </Animated.View>
  );
}

function SearchResults({
  folders,
  pages,
  pagesPerFolder,
  onOpenFolder,
  onOpenPage,
}: {
  folders: WikiFolder[];
  pages: WikiPageMeta[];
  pagesPerFolder: Map<string, number>;
  onOpenFolder: (f: WikiFolder) => void;
  onOpenPage: (id: string) => void;
}) {
  if (folders.length === 0 && pages.length === 0) {
    return <EmptyState title="No matches" caption="Try a different search." />;
  }
  return (
    <View>
      {folders.length > 0 ? (
        <>
          <SectionHeader title="Folders" count={folders.length} />
          <FolderGrid folders={folders} pagesPerFolder={pagesPerFolder} onOpen={onOpenFolder} />
        </>
      ) : null}
      {pages.length > 0 ? (
        <>
          <SectionHeader title="Pages" count={pages.length} />
          <View style={{ gap: 2 }}>
            {pages.map((page, i) => (
              <PageListRow
                key={page.id}
                page={page}
                index={i}
                onPress={() => onOpenPage(page.id)}
              />
            ))}
          </View>
        </>
      ) : null}
    </View>
  );
}
