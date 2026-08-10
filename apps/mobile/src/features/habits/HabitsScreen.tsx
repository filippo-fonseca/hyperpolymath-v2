import React from "react";

import { EmptyState, Screen, ScreenHeader } from "@/ui";

/** Placeholder — the habits lane replaces this file wholesale. */
export default function HabitsScreen() {
  return (
    <Screen>
      <ScreenHeader title="Habits" />
      <EmptyState title="Coming together…" caption="Today's habits land here." />
    </Screen>
  );
}
