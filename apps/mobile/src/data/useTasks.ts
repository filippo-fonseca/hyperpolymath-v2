// Tasks data layer. Reads through TanStack Query, writes through optimistic
// mutations mirroring web semantics: 'lesno' is the done state and sets
// completedAt; leaving it clears completedAt. The device POST mints the id,
// so optimistic creates use a temp id swapped on success.

import { useMutation, useQuery } from "@tanstack/react-query";

import {
  createTask,
  deleteTask,
  getTasks,
  updateTask,
  type Task,
  type TaskCreateInput,
  type TaskStatus,
  type TaskUpdateInput,
} from "../api/device";
import { queryClient } from "./queryClient";
import { queryKeys } from "./queryKeys";

export type { Task, TaskCreateInput, TaskStatus, TaskUpdateInput };

function tempId(): string {
  return `temp-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

async function fetchTasks(): Promise<Task[]> {
  const tasks = await getTasks();
  if (tasks === null) throw new Error("tasks fetch failed");
  return tasks;
}

export function useTasks() {
  return useQuery({ queryKey: queryKeys.tasks, queryFn: fetchTasks });
}

function snapshot(): Task[] | undefined {
  return queryClient.getQueryData<Task[]>(queryKeys.tasks);
}

function setTasks(updater: (prev: Task[]) => Task[]): void {
  queryClient.setQueryData<Task[]>(queryKeys.tasks, (prev) => updater(prev ?? []));
}

export function useTaskMutations() {
  const create = useMutation({
    mutationFn: async (input: TaskCreateInput) => {
      const id = await createTask(input);
      if (!id) throw new Error("create task failed");
      return id;
    },
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.tasks });
      const prev = snapshot();
      const optimistic: Task = {
        id: tempId(),
        title: input.title,
        notes: input.notes ?? null,
        priority: input.priority ?? "P3",
        status: input.status ?? "not started",
        dueDate: input.dueDate ?? null,
        completedAt: null,
        createdAt: new Date().toISOString(),
        projects: [],
      };
      setTasks((tasks) => [optimistic, ...tasks]);
      return { prev, tempId: optimistic.id };
    },
    onSuccess: (id, _input, ctx) => {
      // Swap the temp id for the server id so row taps/edits work pre-refetch.
      setTasks((tasks) => tasks.map((t) => (t.id === ctx.tempId ? { ...t, id } : t)));
    },
    onError: (_err, _input, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(queryKeys.tasks, ctx.prev);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.tasks }),
  });

  const update = useMutation({
    mutationFn: async (input: TaskUpdateInput) => {
      const ok = await updateTask(input);
      if (!ok) throw new Error("update task failed");
    },
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.tasks });
      const prev = snapshot();
      setTasks((tasks) =>
        tasks.map((t) => {
          if (t.id !== input.id) return t;
          const next: Task = {
            ...t,
            ...("title" in input && input.title !== undefined ? { title: input.title } : {}),
            ...("notes" in input ? { notes: input.notes ?? null } : {}),
            ...("priority" in input && input.priority ? { priority: input.priority } : {}),
            ...("dueDate" in input ? { dueDate: input.dueDate ?? null } : {}),
          };
          if (input.status && input.status !== t.status) {
            next.status = input.status;
            next.completedAt =
              input.status === "lesno" ? new Date().toISOString() : null;
          }
          return next;
        }),
      );
      return { prev };
    },
    onError: (_err, _input, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(queryKeys.tasks, ctx.prev);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.tasks }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const ok = await deleteTask(id);
      if (!ok) throw new Error("delete task failed");
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.tasks });
      const prev = snapshot();
      setTasks((tasks) => tasks.filter((t) => t.id !== id));
      return { prev };
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(queryKeys.tasks, ctx.prev);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.tasks }),
  });

  return {
    create,
    update,
    remove,
    /** Convenience: status-only change with the lesno/completedAt rule. */
    updateStatus: (id: string, status: TaskStatus) => update.mutate({ id, status }),
  };
}
