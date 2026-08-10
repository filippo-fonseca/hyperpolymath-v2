// Wiki data layer. Tree + page reads through TanStack Query; page patches
// are written through a mutation that keeps the page cache warm (the editor
// debounces its own autosave and calls patch when settled).

import { useMutation, useQuery } from "@tanstack/react-query";

import { localDateString } from "../api/device";
import {
  createWikiPage,
  getDailyPage,
  getWikiPage,
  getWikiTree,
  updateWikiPage,
  type WikiFolder,
  type WikiPage,
  type WikiPageMeta,
  type WikiPagePatch,
  type WikiTree,
} from "../api/wiki";
import { toast } from "../ui/Toast";
import { queryClient } from "./queryClient";
import { queryKeys } from "./queryKeys";

export type { WikiFolder, WikiPage, WikiPageMeta, WikiPagePatch, WikiTree };

export function useWikiTree() {
  return useQuery({
    queryKey: queryKeys.wikiTree,
    queryFn: async () => {
      const tree = await getWikiTree();
      if (tree === null) throw new Error("wiki tree fetch failed");
      return tree;
    },
  });
}

export function useWikiPage(id: string | null) {
  return useQuery({
    queryKey: queryKeys.wikiPage(id ?? "none"),
    enabled: id !== null,
    queryFn: async () => {
      const page = await getWikiPage(id!);
      if (page === null) throw new Error("wiki page fetch failed");
      return page;
    },
  });
}

/** Get-or-create the daily page for a local date (defaults to today). */
export function useDailyPage(dateISO: string = localDateString(0), enabled = true) {
  return useQuery({
    queryKey: queryKeys.wikiDaily(dateISO),
    enabled,
    queryFn: async () => {
      const page = await getDailyPage(dateISO);
      if (page === null) throw new Error("daily page fetch failed");
      // The daily page is a regular page — warm its page cache too.
      queryClient.setQueryData(queryKeys.wikiPage(page.id), page);
      return page;
    },
  });
}

export function useWikiMutations() {
  const create = useMutation({
    mutationFn: async (input?: {
      title?: string;
      folderId?: string | null;
      contentJson?: unknown[];
    }) => {
      const page = await createWikiPage(input);
      if (!page) throw new Error("create page failed");
      queryClient.setQueryData(queryKeys.wikiPage(page.id), page);
      return page;
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.wikiTree }),
  });

  const patch = useMutation({
    mutationFn: async (args: { id: string; patch: WikiPagePatch }) => {
      const page = await updateWikiPage(args.id, args.patch);
      if (!page) throw new Error("patch page failed");
      return page;
    },
    onMutate: async (args) => {
      // Keep the cached page warm so navigating away and back mid-save shows
      // the newest content; the server response reconciles afterwards.
      const key = queryKeys.wikiPage(args.id);
      await queryClient.cancelQueries({ queryKey: key });
      const prev = queryClient.getQueryData<WikiPage>(key);
      if (prev) {
        queryClient.setQueryData<WikiPage>(key, {
          ...prev,
          ...(args.patch.title !== undefined ? { title: args.patch.title } : {}),
          ...(args.patch.emoji !== undefined ? { emoji: args.patch.emoji } : {}),
          ...(args.patch.folderId !== undefined
            ? { folderId: args.patch.folderId }
            : {}),
          ...(args.patch.contentJson !== undefined
            ? { contentJson: args.patch.contentJson }
            : {}),
        });
      }
      return { prev };
    },
    onSuccess: (page) => {
      queryClient.setQueryData(queryKeys.wikiPage(page.id), page);
    },
    onError: (_err, args, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(queryKeys.wikiPage(args.id), ctx.prev);
      toast("Couldn't save the page.");
    },
    onSettled: (_page, _err, args) => {
      // Title/emoji/folder changes surface in the tree.
      if (
        args.patch.title !== undefined ||
        args.patch.emoji !== undefined ||
        args.patch.folderId !== undefined
      ) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.wikiTree });
      }
    },
  });

  return { create, patch };
}
