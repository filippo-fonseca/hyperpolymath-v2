"use client";

import { deletePage, getPagesForCurrentUser, updatePage } from "@/app/actions/pages";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { PageWithProjects } from "@/lib/db/queries/pages";
import { tableKey } from "@/lib/realtime/query-keys";
import { useTableSubscription } from "@/lib/realtime/useTableSubscription";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { Check, FileText, Plus, Trash2, X } from "lucide-react";
import { useTheme } from "next-themes";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

// BlockNote needs the browser DOM — load client-only.
const PageBlockEditor = dynamic(() => import("./PageBlockEditor"), { ssr: false });

interface ActiveProject {
  id: string;
  name: string;
  icon: string | null;
  isClass: boolean;
  courseCode: string | null;
  areaName: string | null;
  areaEmoji: string | null;
}

interface Props {
  userId: string;
  page: PageWithProjects;
  initialActiveProjects: ActiveProject[];
}

const AUTOSAVE_DELAY = 1500;

/**
 * /pages/[pageId] client island. Notion-style BlockNote editor with 1.5s
 * autosave, emoji picker, project link management, and delete.
 */
export function PageDetailClient({ userId, page: initialPage, initialActiveProjects }: Props) {
  const router = useRouter();
  const { resolvedTheme } = useTheme();

  useTableSubscription("pages", userId);
  useTableSubscription("pages_projects", userId, {
    alsoInvalidate: [tableKey("pages", userId)],
  });

  const { data: allPages = [] } = useQuery({
    queryKey: tableKey("pages", userId),
    queryFn: () => getPagesForCurrentUser(),
    initialData: [initialPage],
  });

  const serverPage = allPages.find((p) => p.id === initialPage.id) ?? initialPage;

  // Local edit state. `content` is the markdown mirror; `contentJson` is the
  // BlockNote document (source of truth). Both move together on every edit.
  const [title, setTitle] = useState(serverPage.title);
  const [content, setContent] = useState(serverPage.content);
  const [contentJson, setContentJson] = useState<unknown>(serverPage.contentJson);
  const [emoji, setEmoji] = useState<string | null>(serverPage.emoji);
  const [linkedProjectIds, setLinkedProjectIds] = useState<string[]>(
    serverPage.projects.map((p) => p.id)
  );
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [showSaved, setShowSaved] = useState(false);
  const [emojiInput, setEmojiInput] = useState(serverPage.emoji ?? "");
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);

  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedFadeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const titleRef = useRef<HTMLInputElement | null>(null);
  const editorFocusRef = useRef<(() => void) | null>(null);

  // Freshly-created pages open empty; drop the cursor straight into the title
  // so the user can start typing without a click. Runs once on mount only.
  // biome-ignore lint/correctness/useExhaustiveDependencies: mount-only autofocus
  useEffect(() => {
    if (initialPage.title.trim() === "") titleRef.current?.focus();
  }, []);

  const save = useCallback(
    async (
      overrides?: Partial<{
        title: string;
        content: string;
        contentJson: unknown;
        emoji: string | null;
        projectIds: string[];
      }>
    ) => {
      await updatePage({
        id: initialPage.id,
        title: overrides?.title ?? title,
        content: overrides?.content ?? content,
        contentJson: overrides && "contentJson" in overrides ? overrides.contentJson : contentJson,
        emoji: overrides?.emoji !== undefined ? overrides.emoji : emoji,
        projectIds: overrides?.projectIds !== undefined ? overrides.projectIds : linkedProjectIds,
      });
      setSavedAt(new Date());
      setShowSaved(true);
      if (savedFadeTimer.current) clearTimeout(savedFadeTimer.current);
      savedFadeTimer.current = setTimeout(() => setShowSaved(false), 2000);
    },
    [initialPage.id, title, content, contentJson, emoji, linkedProjectIds]
  );

  const scheduleAutosave = useCallback(
    (overrides?: Parameters<typeof save>[0]) => {
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
      autosaveTimer.current = setTimeout(() => {
        void save(overrides);
      }, AUTOSAVE_DELAY);
    },
    [save]
  );

  // Cmd+S forces an immediate save (the editor is always live otherwise).
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
        void save();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [save]);

  function handleEditorChange(json: unknown, markdown: string) {
    setContentJson(json);
    setContent(markdown);
    scheduleAutosave({ content: markdown, contentJson: json });
  }

  async function handleDelete() {
    await deletePage(initialPage.id);
    router.push("/pages");
  }

  function handleTitleChange(v: string) {
    setTitle(v);
    scheduleAutosave({ title: v });
  }

  function handleEmojiCommit() {
    const val = emojiInput.trim() || null;
    setEmoji(val);
    setEmojiOpen(false);
    scheduleAutosave({ emoji: val });
  }

  function handleUnlinkProject(projectId: string) {
    const next = linkedProjectIds.filter((id) => id !== projectId);
    setLinkedProjectIds(next);
    scheduleAutosave({ projectIds: next });
  }

  function handleLinkProject(projectId: string) {
    if (linkedProjectIds.includes(projectId)) return;
    const next = [...linkedProjectIds, projectId];
    setLinkedProjectIds(next);
    setLinkOpen(false);
    scheduleAutosave({ projectIds: next });
  }

  const linkedProjects = initialActiveProjects.filter((p) => linkedProjectIds.includes(p.id));
  const unlinkableProjects = initialActiveProjects.filter((p) => !linkedProjectIds.includes(p.id));

  const colorMode = resolvedTheme === "dark" ? "dark" : "light";

  // Breadcrumb from the page's primary (first) project link: Area / Project /
  // Folder. The page can be linked to several projects; the chips row below
  // shows the full set, so the breadcrumb just anchors the primary location.
  const primaryLink = serverPage.projects[0] ?? null;
  const primaryProject = primaryLink
    ? initialActiveProjects.find((p) => p.id === primaryLink.id)
    : undefined;

  return (
    <div className="flex flex-col gap-4 p-6 max-w-3xl mx-auto w-full min-h-full">
      {/* Breadcrumb: Pages / Area / Project / Folder */}
      <nav className="flex items-center gap-1 text-[11px] font-mono text-[var(--ink-muted)] flex-wrap">
        <button
          type="button"
          onClick={() => router.push("/pages")}
          className="hover:text-[var(--ink)] transition-colors cursor-pointer"
        >
          Pages
        </button>
        {primaryProject?.areaName && (
          <>
            <span className="opacity-50">/</span>
            <span>{primaryProject.areaName}</span>
          </>
        )}
        {primaryLink && (
          <>
            <span className="opacity-50">/</span>
            <button
              type="button"
              onClick={() => router.push(`/projects/${primaryLink.id}`)}
              className="hover:text-[var(--ink)] transition-colors cursor-pointer truncate max-w-[200px]"
            >
              {primaryLink.name}
            </button>
          </>
        )}
        {primaryLink?.folderName && (
          <>
            <span className="opacity-50">/</span>
            <span className="truncate max-w-[200px]">{primaryLink.folderName}</span>
          </>
        )}
      </nav>

      {/* Top bar: saved indicator + delete */}
      <div className="flex items-center justify-end gap-2 h-6">
        {showSaved && (
          <span className="flex items-center gap-1 text-[11px] font-mono text-[var(--ink-muted)] animate-fade-in">
            <Check size={11} strokeWidth={2} />
            Saved
          </span>
        )}

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <button
              type="button"
              className="p-1.5 rounded-sm text-[var(--ink-muted)] hover:text-red-500 hover:bg-[var(--surface)] transition-colors duration-150 cursor-pointer"
              title="Delete page"
            >
              <Trash2 size={13} strokeWidth={1.5} />
            </button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="font-serif">Delete this page?</AlertDialogTitle>
              <AlertDialogDescription className="font-serif text-[13px]">
                This will permanently delete &ldquo;{title || "Untitled page"}&rdquo;. Project links
                will be removed but the projects themselves are untouched. This action cannot be
                undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="font-serif text-[13px]">Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDelete}
                className="font-serif text-[13px] bg-red-600 hover:bg-red-700 text-white"
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      {/* Emoji + Title row */}
      <div className="flex items-start gap-3">
        {/* Emoji picker */}
        <Popover open={emojiOpen} onOpenChange={setEmojiOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-sm hover:bg-[var(--surface)] transition-colors duration-150 cursor-pointer text-[20px] leading-none"
              title="Set emoji"
            >
              {emoji ? (
                <span>{emoji}</span>
              ) : (
                <FileText size={18} strokeWidth={1.25} className="text-[var(--ink-muted)]" />
              )}
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-56 p-3 flex flex-col gap-2" align="start">
            <label
              htmlFor="page-emoji-input"
              className="text-[11px] font-mono text-[var(--ink-muted)] uppercase tracking-wide"
            >
              Emoji
            </label>
            <input
              id="page-emoji-input"
              type="text"
              maxLength={4}
              value={emojiInput}
              onChange={(e) => setEmojiInput(e.target.value)}
              placeholder="Type an emoji..."
              className="w-full px-2 py-1.5 text-[14px] bg-transparent border border-[var(--edge)] rounded-sm text-[var(--ink)] placeholder:text-[var(--ink-muted)] focus:outline-none focus:border-[var(--ink-muted)] transition-colors duration-150"
              onKeyDown={(e) => {
                if (e.key === "Enter") handleEmojiCommit();
              }}
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleEmojiCommit}
                className="flex-1 py-1 text-[12px] font-mono text-[var(--ink)] border border-[var(--edge)] rounded-sm hover:bg-[var(--surface)] transition-colors duration-150 cursor-pointer"
              >
                Set
              </button>
              <button
                type="button"
                onClick={() => {
                  setEmojiInput("");
                  setEmoji(null);
                  setEmojiOpen(false);
                  scheduleAutosave({ emoji: null });
                }}
                className="px-2 py-1 text-[12px] font-mono text-[var(--ink-muted)] border border-[var(--edge)] rounded-sm hover:bg-[var(--surface)] transition-colors duration-150 cursor-pointer"
              >
                Clear
              </button>
            </div>
          </PopoverContent>
        </Popover>

        {/* Inline title */}
        <input
          ref={titleRef}
          type="text"
          value={title}
          onChange={(e) => handleTitleChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              editorFocusRef.current?.();
            }
          }}
          placeholder="Untitled page"
          className="flex-1 text-[22px] font-serif font-medium text-[var(--ink)] bg-transparent border-none outline-none placeholder:text-[var(--ink-muted)] placeholder:font-serif placeholder:font-medium"
        />
      </div>

      {/* Project links row */}
      <div className="flex flex-wrap items-center gap-2">
        {linkedProjects.map((proj) => (
          <span
            key={proj.id}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-sm text-[12px] font-mono text-[var(--ink-muted)] bg-[var(--surface)] border border-[var(--edge)]"
          >
            {proj.name}
            <button
              type="button"
              onClick={() => handleUnlinkProject(proj.id)}
              className="ml-0.5 hover:text-[var(--ink)] transition-colors duration-100 cursor-pointer"
              title="Unlink project"
            >
              <X size={10} strokeWidth={2} />
            </button>
          </span>
        ))}
        <Popover open={linkOpen} onOpenChange={setLinkOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="flex items-center gap-1 px-2 py-0.5 rounded-sm text-[12px] font-mono text-[var(--ink-muted)] border border-dashed border-[var(--edge)] hover:bg-[var(--surface)] transition-colors duration-150 cursor-pointer"
            >
              <Plus size={10} strokeWidth={2} />
              Link project
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-56 p-2 flex flex-col gap-1" align="start">
            {unlinkableProjects.length === 0 ? (
              <p className="px-2 py-1 text-[12px] font-mono text-[var(--ink-muted)]">
                All projects linked
              </p>
            ) : (
              unlinkableProjects.map((proj) => (
                <button
                  key={proj.id}
                  type="button"
                  onClick={() => handleLinkProject(proj.id)}
                  className="w-full text-left px-2 py-1.5 text-[13px] font-serif text-[var(--ink)] hover:bg-[var(--surface)] rounded-sm transition-colors duration-100 cursor-pointer truncate"
                >
                  {proj.name}
                </button>
              ))
            )}
          </PopoverContent>
        </Popover>
      </div>

      {/* Last edited */}
      <p className="text-[11px] font-mono text-[var(--ink-muted)]">
        Last edited {formatDistanceToNow(new Date(serverPage.updatedAt), { addSuffix: true })}
      </p>

      {/* Editor — always-live Notion-style block editor */}
      <div className="flex-1 min-h-[400px]">
        <PageBlockEditor
          initialContentJson={serverPage.contentJson}
          initialMarkdown={serverPage.content}
          theme={colorMode}
          onChange={handleEditorChange}
          focusRef={editorFocusRef}
        />
      </div>
    </div>
  );
}
