"use client";

import { useSyncExternalStore } from "react";

export type StudioPerfTier = "high" | "medium" | "low";
let tier: StudioPerfTier = "high";
const subscribers = new Set<() => void>();

export function getStudioPerfTier(): StudioPerfTier {
  return tier;
}

export function setStudioPerfTier(next: StudioPerfTier): void {
  if (next === tier) return;
  tier = next;
  for (const cb of subscribers) cb();
}

export function useStudioPerfTier(): StudioPerfTier {
  return useSyncExternalStore(
    (cb) => { subscribers.add(cb); return () => subscribers.delete(cb); },
    getStudioPerfTier,
    () => "high",
  );
}
