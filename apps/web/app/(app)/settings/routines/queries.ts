"use client";

/**
 * TanStack Query wiring for the routines editor.
 *
 * Reads: useRoutinesQuery pulls the list via the listRoutines server action.
 *
 * Realtime NOTE (DEP-1 fork): the `routines` table is NOT registered in the
 * app's RealtimeTable union (lib/realtime/query-keys.ts), so we do NOT use
 * useTableSubscription here. Instead every mutation invalidates the list on
 * onSettled — the plan's documented fallback. Reads stay fresh via optimistic
 * cache writes + post-mutation refetch.
 *
 * Mutations: create / update / toggle / delete, each optimistic where it helps
 * felt-quality (toggle + delete feel instant). Run-now POSTs to the block-engine
 * endpoint by URL — that route is built in a parallel unit and may not exist in
 * this branch yet, so the call is guarded and degrades to a friendly toast.
 */

import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";
import type { Routine } from "@hyperpolymath/jarvis-core";
import {
  createRoutine,
  deleteRoutine,
  listRoutines,
  toggleRoutine,
  updateRoutine,
  type CreateRoutineInput,
  type UpdateRoutineInput,
} from "@/app/actions/routines";

// Local query key — routines is not a realtime table, so it lives outside the
// tableKey() convention on purpose.
export function routinesKey(userId: string): readonly ["routines", string] {
  return ["routines", userId] as const;
}

export function useRoutinesQuery(userId: string, initialData: Routine[]) {
  return useQuery({
    queryKey: routinesKey(userId),
    queryFn: async () => {
      const res = await listRoutines();
      if (!res.success) throw new Error(res.error);
      return res.data;
    },
    initialData,
    staleTime: 30_000,
  });
}

function invalidate(qc: QueryClient, userId: string) {
  return qc.invalidateQueries({ queryKey: routinesKey(userId) });
}

export function useCreateRoutine(userId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateRoutineInput) => {
      const res = await createRoutine(input);
      if (!res.success) throw new Error(res.error);
      return res.data;
    },
    onSuccess: () => toast.success("Routine created."),
    onError: (err: Error) => toast.error(err.message),
    onSettled: () => invalidate(qc, userId),
  });
}

export function useUpdateRoutine(userId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpdateRoutineInput) => {
      const res = await updateRoutine(input);
      if (!res.success) throw new Error(res.error);
      return res.data;
    },
    onSuccess: () => toast.success("Routine saved."),
    onError: (err: Error) => toast.error(err.message),
    onSettled: () => invalidate(qc, userId),
  });
}

export function useToggleRoutine(userId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; enabled: boolean }) => {
      const res = await toggleRoutine(input);
      if (!res.success) throw new Error(res.error);
      return res.data;
    },
    // Optimistic — a toggle must feel instant.
    onMutate: async ({ id, enabled }) => {
      await qc.cancelQueries({ queryKey: routinesKey(userId) });
      const prev = qc.getQueryData<Routine[]>(routinesKey(userId));
      qc.setQueryData<Routine[]>(routinesKey(userId), (old) =>
        (old ?? []).map((r) => (r.id === id ? { ...r, enabled } : r)),
      );
      return { prev };
    },
    onError: (err: Error, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(routinesKey(userId), ctx.prev);
      toast.error(err.message);
    },
    onSettled: () => invalidate(qc, userId),
  });
}

export function useDeleteRoutine(userId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await deleteRoutine({ id });
      if (!res.success) throw new Error(res.error);
      return res.data;
    },
    // Optimistic removal — the row disappears immediately.
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: routinesKey(userId) });
      const prev = qc.getQueryData<Routine[]>(routinesKey(userId));
      qc.setQueryData<Routine[]>(routinesKey(userId), (old) =>
        (old ?? []).filter((r) => r.id !== id),
      );
      return { prev };
    },
    onSuccess: () => toast.success("Routine deleted."),
    onError: (err: Error, _id, ctx) => {
      if (ctx?.prev) qc.setQueryData(routinesKey(userId), ctx.prev);
      toast.error(err.message);
    },
    onSettled: () => invalidate(qc, userId),
  });
}

/**
 * Run a routine now via the block-engine endpoint. The route
 * (POST /api/jarvis/routines/run) is built in a parallel unit and may not be
 * present in this branch yet — a 404 (or any non-OK) degrades to a friendly
 * toast rather than an error. Wire it by URL so it "just works" once merged.
 */
export function useRunRoutine() {
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch("/api/jarvis/routines/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (res.status === 404) {
        throw new Error("Run engine not connected yet.");
      }
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `Run failed (${res.status}).`);
      }
      return (await res.json().catch(() => ({}))) as unknown;
    },
    onSuccess: () => toast.success("Routine is running."),
    onError: (err: Error) => toast.error(err.message),
  });
}
