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
 * Chrome: WidgetCard v2 grammar — a `--sd-box` plate on a 14px radius with a
 * `--sd-line` hairline and the dark-only inset top hairline. No serif (logotype
 * rule), no glass, no glow. The save indicator is a functional sd status pill.
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
    <motion.div
      {...fade}
      className={cn(
        "flex flex-col gap-5 rounded-[14px] p-6 md:p-7",
        "border border-[var(--sd-line)] bg-[var(--sd-box)]",
        "dark:border-white/[0.06] dark:[box-shadow:rgba(255,255,255,0.09)_0_1px_0_inset]",
      )}
    >
      {/* Fixed prompt + save-state pill */}
      <div className="flex items-start justify-between gap-4">
        <p className="text-[18px] font-semibold leading-snug tracking-[-0.01em] text-[var(--sd-ink)]">
          {PROMPT}
        </p>
        {/* Save indicator — functional sd status pill, right-aligned. */}
        <span
          className={cn(
            "sd-status-pill shrink-0 font-mono uppercase tracking-[0.05em] transition-opacity duration-200",
            saveState === "idle" ? "opacity-0" : "opacity-100",
          )}
          aria-live="polite"
          aria-atomic="true"
        >
          <span
            className={cn(
              "sd-dot",
              saveState === "saved" ? "sd-dot-synced" : "sd-dot-idle",
            )}
          />
          {saveState === "saving" ? "Saving…" : "Saved"}
        </span>
      </div>

      {/* Main response textarea — Space Grotesk body at a comfortable read size. */}
      <textarea
        className={cn(
          "w-full min-h-[220px] resize-none border-none bg-transparent",
          "text-[16px] leading-[1.7] text-[var(--sd-ink)]",
          "placeholder:text-[var(--sd-ink-faint)] focus:outline-none",
        )}
        placeholder="Write freely…"
        value={mainResponse}
        onChange={handleMainChange}
        aria-label="Journal entry response"
      />

      {/* Divider */}
      <div className="border-t border-[var(--sd-line)]" />

      {/* Notes / Misc section */}
      <div className="flex flex-col gap-2">
        <label className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-[var(--sd-ink-faint)]">
          Notes / Misc
        </label>
        <textarea
          className={cn(
            "w-full min-h-[100px] resize-none border-none bg-transparent",
            "text-[14.5px] leading-[1.6] text-[var(--sd-ink)]",
            "placeholder:text-[var(--sd-ink-faint)] focus:outline-none",
          )}
          placeholder="Anything else on your mind…"
          value={notesSection}
          onChange={handleNotesChange}
          aria-label="Notes and miscellaneous"
        />
      </div>

      {/* Divider */}
      <div className="border-t border-[var(--sd-line)]" />

      {/* Opt-in AI/MCP export toggle. UI is the inverse of the underlying
          no_export column: checked ⇒ include in export ⇒ noExport=false.
          Default off (private) per issue #191. */}
      <div className="flex items-center gap-2.5">
        <Checkbox
          id={`include-in-export-${date}`}
          checked={!noExport}
          onCheckedChange={(checked) =>
            handleNoExportChange(checked !== true)
          }
        />
        <label
          htmlFor={`include-in-export-${date}`}
          className="cursor-pointer select-none font-mono text-[11px] uppercase tracking-[0.06em] text-[var(--sd-ink-dull)]"
        >
          Include in AI export (MCP)
        </label>
      </div>
    </motion.div>
  );
}
