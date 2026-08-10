import React from "react";

import { EmptyState, Screen, ScreenHeader } from "@/ui";

/** Placeholder — the wiki lane replaces this file wholesale. */
export default function WikiScreen() {
  return (
    <Screen>
      <ScreenHeader title="Wiki" />
      <EmptyState title="Coming together…" caption="Folders and pages land here." />
    </Screen>
  );
}
