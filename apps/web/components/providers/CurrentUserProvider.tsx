"use client";

import { createContext, useContext } from "react";

/**
 * The signed-in user's id, available to any client component.
 *
 * The app resolves the user server-side (lib/auth/get-user.ts) and threads
 * `userId` down as a prop — fine for the page-level clients that were written
 * against it, unworkable for a leaf that can appear anywhere. An entity pill
 * renders inside a capture body, a task title, a JARVIS bubble: prop-drilling
 * userId to all of those to satisfy one cache key would touch half the tree.
 *
 * The layout already holds the id, so it publishes it here once.
 */
const CurrentUserContext = createContext<string | null>(null);

export function CurrentUserProvider({
  userId,
  children,
}: {
  userId: string;
  children: React.ReactNode;
}) {
  return (
    <CurrentUserContext.Provider value={userId}>
      {children}
    </CurrentUserContext.Provider>
  );
}

/**
 * The current user's id, or null outside the provider.
 *
 * Null rather than a throw: this is read by leaf components that also render in
 * unauthenticated shells and in tests, and a missing id only ever costs a cache
 * partition, never correctness — every server action re-derives the user from
 * its own claims regardless of what the client believes.
 */
export function useCurrentUserId(): string | null {
  return useContext(CurrentUserContext);
}
