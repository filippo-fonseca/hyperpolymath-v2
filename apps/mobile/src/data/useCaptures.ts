// Captures data layer. Reverse-chronological list with instant optimistic
// inserts at the head — the capture composer must feel like it never waits
// on the network.

import { useMutation, useQuery } from "@tanstack/react-query";

import {
  createCapture,
  deleteCapture,
  getCaptures,
  updateCapture,
  type Capture,
} from "../api/device";
import { queryClient } from "./queryClient";
import { queryKeys } from "./queryKeys";

export type { Capture };

function tempId(): string {
  return `temp-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

async function fetchCaptures(): Promise<Capture[]> {
  const captures = await getCaptures();
  if (captures === null) throw new Error("captures fetch failed");
  return captures;
}

export function useCaptures() {
  return useQuery({ queryKey: queryKeys.captures, queryFn: fetchCaptures });
}

function snapshot(): Capture[] | undefined {
  return queryClient.getQueryData<Capture[]>(queryKeys.captures);
}

function setCaptures(updater: (prev: Capture[]) => Capture[]): void {
  queryClient.setQueryData<Capture[]>(queryKeys.captures, (prev) =>
    updater(prev ?? []),
  );
}

export function useCaptureMutations() {
  const create = useMutation({
    mutationFn: async (input: { content: string; hashtagNames?: string[] }) => {
      const id = await createCapture(input);
      if (!id) throw new Error("create capture failed");
      return id;
    },
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.captures });
      const prev = snapshot();
      const now = new Date().toISOString();
      const optimistic: Capture = {
        id: tempId(),
        content: input.content,
        createdAt: now,
        updatedAt: now,
        createdVia: null,
        sourceDevice: "Mobile",
        sourceInput: "text",
        favorite: false,
        hashtags: (input.hashtagNames ?? []).map((name) => ({
          id: `temp-tag-${name}`,
          name,
          displayName: name,
        })),
        projects: [],
      };
      setCaptures((captures) => [optimistic, ...captures]);
      return { prev, tempId: optimistic.id };
    },
    onSuccess: (id, _input, ctx) => {
      setCaptures((captures) =>
        captures.map((c) => (c.id === ctx.tempId ? { ...c, id } : c)),
      );
    },
    onError: (_err, _input, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(queryKeys.captures, ctx.prev);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.captures }),
  });

  const update = useMutation({
    mutationFn: async (input: {
      id: string;
      content?: string;
      hashtagNames?: string[];
    }) => {
      const ok = await updateCapture(input);
      if (!ok) throw new Error("update capture failed");
    },
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.captures });
      const prev = snapshot();
      setCaptures((captures) =>
        captures.map((c) =>
          c.id === input.id
            ? {
                ...c,
                content: input.content ?? c.content,
                updatedAt: new Date().toISOString(),
              }
            : c,
        ),
      );
      return { prev };
    },
    onError: (_err, _input, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(queryKeys.captures, ctx.prev);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.captures }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const ok = await deleteCapture(id);
      if (!ok) throw new Error("delete capture failed");
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.captures });
      const prev = snapshot();
      setCaptures((captures) => captures.filter((c) => c.id !== id));
      return { prev };
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(queryKeys.captures, ctx.prev);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.captures }),
  });

  return { create, update, remove };
}
