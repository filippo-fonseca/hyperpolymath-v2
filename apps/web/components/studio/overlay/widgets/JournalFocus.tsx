"use client";

import { JournalEntryEditor } from "@/components/journaling/JournalEntryEditor";
import { useStudioJournal } from "@/components/studio/data/hooks";

/**
 * JournalFocus — reuse of the real `JournalEntryEditor` verbatim.
 *
 * The editor is already overlay-ready: props-fed (`date`, `entry`) with its own
 * debounced autosave. We pass today's ymd and today's entry from the studio
 * journal slice; typing in the overlay persists exactly as it does on /journal.
 */
export function JournalFocus(): React.ReactElement {
  const { journal, todayYmd } = useStudioJournal();
  return <JournalEntryEditor date={todayYmd} entry={journal.entry} />;
}

export default JournalFocus;
