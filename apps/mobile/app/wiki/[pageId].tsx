import { useLocalSearchParams } from "expo-router";
import React from "react";

import { EmptyState, Screen } from "@/ui";

/** Placeholder — the wiki lane replaces this with the reader/editor. */
export default function WikiPageScreen() {
  const { pageId } = useLocalSearchParams<{ pageId: string }>();
  return (
    <Screen>
      <EmptyState title="Coming together…" caption={`Page ${pageId ?? ""} opens here.`} />
    </Screen>
  );
}
