"use client";

import { Calendar, FileText, ListTodo, NotebookPen, PencilLine } from "lucide-react";

import {
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@/components/ui/command";
import { useQuickCreateActions } from "@/components/shell/useQuickCreateActions";

interface Props {
  /** Live text typed into the palette's CommandInput (controlled upstream). */
  search: string;
  /** Close the palette after a command runs. */
  onRun: () => void;
  /** Switch the palette into the full capture-composer mode. */
  onCompose: () => void;
}

/**
 * Contents of the Cmd+Shift+K command palette (issue #161).
 *
 * A cmdk-filtered command list: typing "new", "page", "wiki", "task", "qc", …
 * narrows to the matching create action via each item's `keywords`. Selecting a
 * command opens/navigates to that feature. Free text additionally surfaces a
 * "Capture …" item so a thought (with inline #hashtags) can be written straight
 * from the palette without leaving for /captures first.
 *
 * The create logic (createPage, createCapture, route navigations) is sourced
 * from the shared useQuickCreateActions hook so this palette and the Cmd+K
 * JARVIS dialog stay in lockstep. The cmdk markup (value strings, keywords,
 * shortcuts, the compose path, the free-text Capture item) is unchanged.
 */
export function CommandMenuContent({ search, onRun, onCompose }: Props) {
  const trimmed = search.trim();
  // onCompose wires "New quick capture" to this palette's composer mode.
  const { actions, captureText } = useQuickCreateActions({ onCompose });

  const byId = (id: string) => actions.find((a) => a.id === id);

  // Wrap a create action so the palette closes first (the compose path keeps the
  // palette open, so it is wired to onCompose directly below instead).
  function runAndClose(id: string) {
    return () => {
      onRun();
      void byId(id)?.run();
    };
  }

  function runCaptureText() {
    const ct = captureText(trimmed);
    if (!ct) return;
    onRun();
    void ct.run();
  }

  return (
    <CommandList>
      <CommandEmpty>No matching command — keep typing to capture a thought.</CommandEmpty>

      {/* Create commands first so a keyword match (e.g. "task") is the default
          selection; the free-text Capture item sits below as the fallback. */}
      <CommandGroup heading="Create">
        <CommandItem
          value="new quick capture qc note thought jot"
          keywords={["qc", "capture", "note", "thought", "jot", "quick"]}
          onSelect={onCompose}
        >
          <NotebookPen />
          <span>New quick capture</span>
          <CommandShortcut>⌃⌥C</CommandShortcut>
        </CommandItem>
        <CommandItem
          value="new task todo to-do"
          keywords={["task", "todo", "to-do"]}
          onSelect={runAndClose("new-task")}
        >
          <ListTodo />
          <span>New task</span>
          <CommandShortcut>⌃⌥T</CommandShortcut>
        </CommandItem>
        <CommandItem
          value="new page wiki doc document"
          keywords={["page", "wiki", "doc", "document"]}
          onSelect={runAndClose("new-page")}
        >
          <FileText />
          <span>New page</span>
          <CommandShortcut>⌃⌥P</CommandShortcut>
        </CommandItem>
        <CommandItem
          value="new event calendar meeting"
          keywords={["event", "calendar", "meeting", "cal"]}
          onSelect={runAndClose("new-event")}
        >
          <Calendar />
          <span>New event</span>
          <CommandShortcut>⌃⌥E</CommandShortcut>
        </CommandItem>
      </CommandGroup>

      {trimmed.length > 0 && (
        <CommandGroup heading="Capture">
          <CommandItem value={`__capture__ ${trimmed}`} forceMount onSelect={runCaptureText}>
            <PencilLine />
            <span>
              Capture <span className="italic">“{trimmed}”</span>
            </span>
            <CommandShortcut>⏎</CommandShortcut>
          </CommandItem>
        </CommandGroup>
      )}
    </CommandList>
  );
}
