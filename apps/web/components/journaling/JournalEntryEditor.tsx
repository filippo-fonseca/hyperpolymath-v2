"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { upsertJournalEntry } from "@/app/actions/journal";
import type { JournalEntry } from "@/app/actions/journal";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

/** Fixed daily prompt — every journal entry answers this same question. */
const PROMPT = "What was the most storyworthy moment from today?";

const DEBOUNCE_MS = 800;
const SAVED_RESET_MS = 2000;

type SaveState = "idle" | "saving" | "saved";

interface Props {
  date: string;
  /** Initial entry for this date, or null when no entry exists yet. */
  entry: JournalEntry | null;
}

/**
 * JournalEntryEditor — two-textarea editor for a single journal entry.
 *
 * Fields:
 *   - mainResponse: large EB Garamond serif body, answers the fixed PROMPT.
 *   - notesSection: smaller textarea for miscellaneous notes.
 *   - noExport: checkbox to exclude entry from AI context graph export.
 *
 * Autosave: debounced at 800ms. Skips write if both text fields are empty
 * (avoids creating empty rows on first visit). Save indicator cycles:
 *   idle → "Saving…" → "Saved" (reverts to idle after 2s).
 */
export function JournalEntryEditor({ date, entry }: Props) {
  const [mainResponse, setMainResponse] = useState(entry?.mainResponse ?? "");
  const [notesSection, setNotesSection] = useState(entry?.notesSection ?? "");
  const [noExport, setNoExport] = useState(entry?.noExport ?? false);
  const [saveState, setSaveState] = useState<SaveState>("idle");

  // When the query resolves and brings in a real entry (id appears for the
  // first time), fill the fields. The parent passes key={date} so this
  // component remounts on every date change — initial state already resets.
  // This effect only needs to handle the null→entry transition (slow query).
  useEffect(() => {
    if (entry) {
      setMainResponse(entry.mainResponse ?? "");
      setNotesSection(entry.notesSection ?? "");
      setNoExport(entry.noExport ?? false);
      setSaveState("idle");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry?.id]);

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleAutosave = useCallback(
    (newMain: string, newNotes: string, newNoExport: boolean) => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (savedTimer.current) clearTimeout(savedTimer.current);

      // Skip writing empty entries — avoids creating ghost rows on first visit.
      if (!newMain.trim() && !newNotes.trim()) return;

      saveTimer.current = setTimeout(async () => {
        setSaveState("saving");
        await upsertJournalEntry({
          date,
          mainResponse: newMain,
          notesSection: newNotes,
          noExport: newNoExport,
        });
        setSaveState("saved");
        savedTimer.current = setTimeout(() => setSaveState("idle"), SAVED_RESET_MS);
      }, DEBOUNCE_MS);
    },
    [date],
  );

  // Clean up timers on unmount / date change.
  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (savedTimer.current) clearTimeout(savedTimer.current);
    };
  }, [date]);

  function handleMainChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const val = e.target.value;
    setMainResponse(val);
    scheduleAutosave(val, notesSection, noExport);
  }

  function handleNotesChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const val = e.target.value;
    setNotesSection(val);
    scheduleAutosave(mainResponse, val, noExport);
  }

  function handleNoExportChange(checked: boolean) {
    setNoExport(checked);
    // Trigger an immediate (debounced) save for the toggle — the text may be
    // empty but the noExport change itself is meaningful and should persist.
    if (saveTimer.current) clearTimeout(saveTimer.current);
    if (savedTimer.current) clearTimeout(savedTimer.current);
    saveTimer.current = setTimeout(async () => {
      setSaveState("saving");
      await upsertJournalEntry({
        date,
        mainResponse,
        notesSection,
        noExport: checked,
      });
      setSaveState("saved");
      savedTimer.current = setTimeout(() => setSaveState("idle"), SAVED_RESET_MS);
    }, DEBOUNCE_MS);
  }

  return (
    <div className="glass-tile rounded-2xl p-6 flex flex-col gap-5">
      {/* Fixed prompt */}
      <div className="flex items-start justify-between gap-4">
        <p className="font-serif text-[18px] leading-snug text-[var(--ink)] font-semibold">
          {PROMPT}
        </p>
        {/* Save indicator — mono micro-text, right-aligned */}
        <span
          className={cn(
            "shrink-0 font-mono text-[10.5px] tracking-[0.04em] uppercase transition-opacity duration-200",
            saveState === "idle" && "opacity-0",
            saveState === "saving" && "opacity-60 text-[var(--ink-muted)]",
            saveState === "saved" && "opacity-80 text-[var(--hud-cyan)]",
          )}
          aria-live="polite"
          aria-atomic="true"
        >
          {saveState === "saving" ? "Saving…" : "Saved"}
        </span>
      </div>

      {/* Main response textarea — large serif body */}
      <textarea
        className={cn(
          "w-full min-h-[200px] resize-none bg-transparent",
          "font-serif text-[17px] leading-[1.65] text-[var(--ink)]",
          "placeholder:text-[var(--ink-muted)] placeholder:italic",
          "focus:outline-none",
          "border-none",
        )}
        placeholder="Write freely…"
        value={mainResponse}
        onChange={handleMainChange}
        aria-label="Journal entry response"
      />

      {/* Divider */}
      <div className="border-t border-[var(--edge)]" />

      {/* Notes / Misc section */}
      <div className="flex flex-col gap-2">
        <label className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-[var(--ink-muted)]">
          Notes / Misc
        </label>
        <textarea
          className={cn(
            "w-full min-h-[100px] resize-none bg-transparent",
            "font-serif text-[15px] leading-[1.6] text-[var(--ink)]",
            "placeholder:text-[var(--ink-muted)] placeholder:italic",
            "focus:outline-none",
            "border-none",
          )}
          placeholder="Anything else on your mind…"
          value={notesSection}
          onChange={handleNotesChange}
          aria-label="Notes and miscellaneous"
        />
      </div>

      {/* Divider */}
      <div className="border-t border-[var(--edge)]" />

      {/* no_export toggle */}
      <div className="flex items-center gap-2.5">
        <Checkbox
          id={`no-export-${date}`}
          checked={noExport}
          onCheckedChange={(checked) =>
            handleNoExportChange(checked === true)
          }
        />
        <label
          htmlFor={`no-export-${date}`}
          className="font-mono text-[11px] uppercase tracking-[0.06em] text-[var(--ink-muted)] cursor-pointer select-none"
        >
          Exclude from AI export
        </label>
      </div>
    </div>
  );
}
