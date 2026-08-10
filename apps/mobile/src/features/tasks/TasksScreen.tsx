import React from "react";

import { EmptyState, Screen, ScreenHeader } from "@/ui";

/** Placeholder — the tasks lane replaces this file wholesale. */
export default function TasksScreen() {
  return (
    <Screen>
      <ScreenHeader title="Tasks" />
      <EmptyState title="Coming together…" caption="Your task list lands here." />
    </Screen>
  );
}
