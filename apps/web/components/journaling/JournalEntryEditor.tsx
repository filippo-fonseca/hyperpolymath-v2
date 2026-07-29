"use client";

import { motion, useReducedMotion } from "motion/react";
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
 * JournalEntryEditor — two-textarea editor for a single journal entry (sd register).
 *
 * Fields:
 *   - mainResponse: large Space Grotesk body, answers the fixed PROMPT.
 *   - notesSection: smaller textarea for miscellaneous notes.
 *   - noExport: privacy gate for the MCP export. The UI presents this as an
 *     opt-IN toggle labeled "Include in AI export (MCP)"; checked ⇒ !noExport.
 *     Defaults to unchecked (no_export=true) so journal entries stay private
 *     unless the user actively opts in (issue #191).
 *
 * Chrome (jul-29 craft restyle): the composer is a raised white `craft-card` on
 * the large-panel radius — the page's one sheet of paper. Colour stays off the
 * fill and lives on the small accents: a butter plate behind the prompt, a
 * pastel dot in the save pill. No glass, no glow.
 *
 * Autosave: debounced at 800ms. Skips write if both text fields are empty
 * (avoids creating empty rows on first visit). Save indicator cycles:
 *   idle → "Saving…" → "Saved" (reverts to idle after 2s).
 */
export function JournalEntryEditor({ date, entry }: Props) {
  const reduced = useReducedMotion();
  const [mainResponse, setMainResponse] = useState(entry?.mainResponse ?? "");
  const [notesSection, setNotesSection] = useState(entry?.notesSection ?? "");
  // Default opts OUT of export (no_export=true) so journal entries are private
  // by default — matches the DB column default set in migration 0045.
  const [noExport, setNoExport] = useState(entry?.noExport ?? true);
  const [saveState, setSaveState] = useState<SaveState>("idle");

  // When the query resolves and brings in a real entry (id appears for the
  // first time), fill the fields. The parent passes key={date} so this
  // component remounts on every date change — initial state already resets.
  // This effect only needs to handle the null→entry transition (slow query).
  useEffect(() => {
    if (entry) {
      setMainResponse(entry.mainResponse ?? "");
      setNotesSection(entry.notesSection ?? "");
      setNoExport(entry.noExport ?? true);
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

  // A gentle 140ms opacity fade on day switch (the parent remounts this via
  // key={date}). Opacity-only, no layout shift; collapses under reduced motion.
  const fade = reduced
    ? {}
    : {
        initial: { opacity: 0 },
        animate: { opacity: 1 },
        transition: { duration: 0.14, ease: [0.25, 1, 0.5, 1] as const },
      };

  return (
    <motion.div {...fade} className="craft-card flex flex-col gap-5 rounded-2xl p-6 md:p-7">
      {/* Fixed prompt on its butter plate + save-state pill. The plate is the
          one tinted element in the composer: it marks the question as given,
          not typed. */}
      <div className="flex items-start justify-between gap-4">
        <p
          className={cn(
            "tint-butter min-w-0 rounded-xl border px-3 py-2 text-subtitle font-medium leading-snug",
            "border-[color-mix(in_srgb,var(--tint-edge)_45%,transparent)] bg-[var(--tint-bg)] text-[var(--tint-ink)]"
          )}
        >
          {PROMPT}
        </p>
        {/* Save indicator — a pastel pill; sage once the write has landed. */}
        <span
          className={cn(
            saveState === "saved" ? "tint-sage" : "tint-sky",
            "inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-micro font-medium",
            "border-[color-mix(in_srgb,var(--tint-edge)_45%,transparent)] bg-[var(--tint-bg)] text-[var(--tint-ink)]",
            "transition-opacity duration-[160ms] ease-out motion-reduce:transition-none",
            saveState === "idle" ? "opacity-0" : "opacity-100"
          )}
          aria-live="polite"
          aria-atomic="true"
        >
          <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-[var(--tint-edge)]" />
          {saveState === "saving" ? "Saving…" : "Saved"}
        </span>
      </div>

      {/* Main response textarea — body copy at a comfortable read size. */}
      <textarea
        className={cn(
          "min-h-[220px] w-full resize-none border-none bg-transparent",
          "text-[16px] leading-[1.7] text-[var(--ink)]",
          "placeholder:text-[var(--ink-faint)] focus:outline-none"
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
        <label className="text-meta font-medium text-[var(--ink-muted)]">Notes / Misc</label>
        <textarea
          className={cn(
            "min-h-[100px] w-full resize-none border-none bg-transparent",
            "text-body text-[var(--ink)]",
            "placeholder:text-[var(--ink-faint)] focus:outline-none"
          )}
          placeholder="Anything else on your mind…"
          value={notesSection}
          onChange={handleNotesChange}
          aria-label="Notes and miscellaneous"
        />
      </div>

      {/* Divider */}
      <div className="border-t border-[var(--edge)]" />

      {/* Opt-in AI/MCP export toggle. UI is the inverse of the underlying
          no_export column: checked ⇒ include in export ⇒ noExport=false.
          Default off (private) per issue #191. */}
      <div className="flex items-center gap-2.5">
        <Checkbox
          id={`include-in-export-${date}`}
          checked={!noExport}
          onCheckedChange={(checked) => handleNoExportChange(checked !== true)}
        />
        <label
          htmlFor={`include-in-export-${date}`}
          className="cursor-pointer select-none text-meta text-[var(--ink-muted)]"
        >
          Include in AI export (MCP)
        </label>
      </div>
    </motion.div>
  );
}
