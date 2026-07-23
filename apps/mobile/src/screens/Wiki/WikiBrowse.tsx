// Wiki browse surface: a Files.app-style drill-in over the folder tree.
// The current folder shows its subfolders then its pages; a breadcrumb walks
// back up. Root lists pinned pages first (server already sorts this way; we
// preserve its order). A non-empty search flattens the whole tree into page +
// folder hits. Pull-to-refresh re-pulls the tree. Server order is trusted.

import { useMemo, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { KiwiLoader } from "../../components/KiwiLoader";
import { EmptyState, ScreenHeader, SearchBar } from "../../components/shell";
import { useCollection } from "../../lib/use-collection";
import { getWikiTree, type WikiFolder, type WikiPageMeta, type WikiTree } from "../../lib/wiki-api";
import { font, sd } from "../../theme";

export function WikiBrowse({
  active,
  onOpenPage,
}: {
  active: boolean;
  onOpenPage: (pageId: string) => void;
}) {
  const insets = useSafeAreaInsets();
  const { data, loading, refresh } = useCollection<WikiTree>(getWikiTree, active);
  const [stack, setStack] = useState<WikiFolder[]>([]);
  const [query, setQuery] = useState("");

  const current = stack.length ? stack[stack.length - 1] : null;
  const currentId = current?.id ?? null;
  const searching = query.trim().length > 0;

  const folders = data?.folders ?? [];
  const pages = data?.pages ?? [];

  const pageCount = pages.length;

  // Drill-in view: subfolders + pages of the current folder (server order kept).
  const subfolders = useMemo(
    () => folders.filter((f) => f.parentId === currentId),
    [folders, currentId],
  );
  const folderPages = useMemo(
    () => pages.filter((p) => p.folderId === currentId),
    [pages, currentId],
  );

  // Search view: flat hits across the whole tree.
  const q = query.trim().toLowerCase();
  const matchedPages = useMemo(
    () => (searching ? pages.filter((p) => (p.title || "Untitled").toLowerCase().includes(q)) : []),
    [pages, q, searching],
  );
  const matchedFolders = useMemo(
    () => (searching ? folders.filter((f) => f.name.toLowerCase().includes(q)) : []),
    [folders, q, searching],
  );

  const enterFolder = (folder: WikiFolder) => {
    setStack((s) => [...s, folder]);
    setQuery("");
  };
  const goUpTo = (index: number) => setStack((s) => s.slice(0, index));

  return (
    <View style={styles.root}>
      <ScreenHeader
        title="Wiki"
        count={data ? pageCount : undefined}
        paddingTop={insets.top + 8}
      />
      <SearchBar value={query} onChangeText={setQuery} placeholder="Search pages…" />

      {!searching && stack.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.crumbRow}
          contentContainerStyle={styles.crumbContent}
        >
          <Crumb label="Wiki" onPress={() => goUpTo(0)} />
          {stack.map((f, i) => (
            <Crumb
              key={f.id}
              label={f.name}
              chevron
              active={i === stack.length - 1}
              onPress={() => goUpTo(i + 1)}
            />
          ))}
        </ScrollView>
      ) : null}

      <ScrollView
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={() => void refresh()} tintColor={sd.accent} />
        }
      >
        {data === null ? (
          <View style={styles.loader}>
            <KiwiLoader size={34} />
          </View>
        ) : null}

        {data !== null && searching ? (
          <SearchResults
            folders={matchedFolders}
            pages={matchedPages}
            onOpenFolder={enterFolder}
            onOpenPage={onOpenPage}
          />
        ) : null}

        {data !== null && !searching ? (
          <>
            {subfolders.length === 0 && folderPages.length === 0 ? (
              <EmptyState
                message={
                  stack.length === 0
                    ? "No wiki pages yet. Create one on the web or in the editor."
                    : "This folder is empty."
                }
              />
            ) : null}

            {subfolders.map((folder) => (
              <FolderRow
                key={folder.id}
                folder={folder}
                pageCount={pages.filter((p) => p.folderId === folder.id).length}
                onPress={() => enterFolder(folder)}
              />
            ))}
            {folderPages.map((page) => (
              <PageRow key={page.id} page={page} onPress={() => onOpenPage(page.id)} />
            ))}
          </>
        ) : null}
        <View style={{ height: 90 }} />
      </ScrollView>
    </View>
  );
}

function SearchResults({
  folders,
  pages,
  onOpenFolder,
  onOpenPage,
}: {
  folders: WikiFolder[];
  pages: WikiPageMeta[];
  onOpenFolder: (f: WikiFolder) => void;
  onOpenPage: (id: string) => void;
}) {
  if (folders.length === 0 && pages.length === 0) {
    return <EmptyState message="No matches." />;
  }
  return (
    <>
      {folders.length > 0 ? <Text style={styles.kicker}>FOLDERS</Text> : null}
      {folders.map((folder) => (
        <FolderRow key={folder.id} folder={folder} onPress={() => onOpenFolder(folder)} />
      ))}
      {pages.length > 0 ? (
        <Text style={[styles.kicker, folders.length > 0 && styles.kickerLower]}>PAGES</Text>
      ) : null}
      {pages.map((page) => (
        <PageRow key={page.id} page={page} onPress={() => onOpenPage(page.id)} />
      ))}
    </>
  );
}

function FolderRow({
  folder,
  pageCount,
  onPress,
}: {
  folder: WikiFolder;
  pageCount?: number;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.72 }]}
      accessibilityRole="button"
      accessibilityLabel={`Folder ${folder.name}`}
    >
      <Text style={styles.folderGlyph}>▸</Text>
      <View style={styles.rowBody}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {folder.name}
        </Text>
      </View>
      {typeof pageCount === "number" ? (
        <Text style={styles.rowCount}>{pageCount}</Text>
      ) : null}
    </Pressable>
  );
}

function PageRow({ page, onPress }: { page: WikiPageMeta; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.72 }]}
      accessibilityRole="button"
      accessibilityLabel={`Page ${page.title || "Untitled"}`}
    >
      <Text style={styles.pageGlyph}>{page.emoji ? page.emoji : "❦"}</Text>
      <View style={styles.rowBody}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {page.title || "Untitled"}
        </Text>
        <Text style={styles.rowMeta}>
          {page.pinned ? "PINNED · " : ""}
          {page.dailyDate ? `DAILY ${page.dailyDate} · ` : ""}
          {relativeTime(page.updatedAt)}
        </Text>
      </View>
      {page.pinned ? <Text style={styles.pin}>◆</Text> : null}
    </Pressable>
  );
}

function Crumb({
  label,
  onPress,
  chevron,
  active,
}: {
  label: string;
  onPress: () => void;
  chevron?: boolean;
  active?: boolean;
}) {
  return (
    <View style={styles.crumbItem}>
      {chevron ? <Text style={styles.crumbSep}>/</Text> : null}
      <Pressable onPress={onPress} hitSlop={6}>
        <Text style={[styles.crumbLabel, active && styles.crumbActive]} numberOfLines={1}>
          {label}
        </Text>
      </Pressable>
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
  list: {
    paddingHorizontal: 20,
    gap: 10,
  },
  loader: {
    paddingTop: 80,
    alignItems: "center",
  },
  crumbRow: {
    maxHeight: 34,
    marginBottom: 6,
  },
  crumbContent: {
    paddingHorizontal: 20,
    alignItems: "center",
    gap: 6,
  },
  crumbItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  crumbSep: {
    color: sd.inkFaint,
    fontFamily: font.mono,
    fontSize: 12,
  },
  crumbLabel: {
    color: sd.inkDull,
    fontFamily: font.mono,
    fontSize: 11,
    letterSpacing: 0.6,
    maxWidth: 160,
  },
  crumbActive: {
    color: sd.accent,
  },
  kicker: {
    color: sd.inkFaint,
    fontFamily: font.mono,
    fontSize: 11,
    letterSpacing: 1.6,
    marginBottom: 2,
  },
  kickerLower: {
    marginTop: 12,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
    borderRadius: sd.radius.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: sd.line,
    backgroundColor: sd.box,
    padding: 14,
  },
  folderGlyph: {
    color: sd.accent,
    fontFamily: font.mono,
    fontSize: 16,
    width: 22,
    textAlign: "center",
  },
  pageGlyph: {
    fontSize: 18,
    width: 22,
    textAlign: "center",
    color: sd.inkDull,
  },
  rowBody: {
    flex: 1,
    gap: 3,
  },
  rowTitle: {
    color: sd.ink,
    fontFamily: font.sansMedium,
    fontSize: 16,
  },
  rowMeta: {
    color: sd.inkFaint,
    fontFamily: font.mono,
    fontSize: 10,
    letterSpacing: 0.4,
  },
  rowCount: {
    color: sd.inkFaint,
    fontFamily: font.mono,
    fontSize: 11,
  },
  pin: {
    color: sd.accent,
    fontSize: 11,
  },
});
