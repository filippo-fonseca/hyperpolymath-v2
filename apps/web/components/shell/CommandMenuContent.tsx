"use client";

import { Calendar, FileText, ListTodo, NotebookPen, PencilLine } from "lucide-react";
import { useRouter } from "next/navigation";

import { createCapture } from "@/app/actions/captures";
import { createPage } from "@/app/actions/pages";
import {
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@/components/ui/command";

interface Props {
  /** Live text typed into the palette's CommandInput (controlled upstream). */
  search: string;
  /** Close the palette after a command runs. */
  onRun: () => void;
  /** Switch the palette into the full capture-composer mode. */
  onCompose: () => void;
}

// Pull #hashtags out of free text so a quick capture typed straight into the
// palette links its tags, mirroring how the /captures composer extracts them.
function extractHashtags(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(/#([\p{L}\p{N}_-]+)/gu)) {
    out.add(m[1].toLowerCase());
  }
  return Array.from(out);
}

/**
 * Contents of the Cmd+Shift+K command palette (issue #161).
 *
 * A cmdk-filtered command list: typing "new", "page", "wiki", "task", "qc", …
 * narrows to the matching create action via each item's `keywords`. Selecting a
 * command opens/navigates to that feature. Free text additionally surfaces a
 * "Capture …" item so a thought (with inline #hashtags) can be written straight
 * from the palette without leaving for /captures first.
 */
export function CommandMenuContent({ search, onRun, onCompose }: Props) {
  const router = useRouter();
  const trimmed = search.trim();

  function go(href: string) {
    onRun();
    router.push(href);
  }

  async function newPage() {
    onRun();
    const r = await createPage({ id: crypto.randomUUID(), title: "", content: "" });
    if (r.success) router.push(`/wiki/${r.data.id}`);
  }

  async function captureText() {
    if (!trimmed) return;
    onRun();
    await createCapture({
      id: crypto.randomUUID(),
      content: trimmed,
      hashtagNames: extractHashtags(trimmed),
    });
    router.push("/captures");
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
          onSelect={() => go("/tasks?create=now")}
        >
          <ListTodo />
          <span>New task</span>
          <CommandShortcut>⌃⌥T</CommandShortcut>
        </CommandItem>
        <CommandItem
          value="new page wiki doc document"
          keywords={["page", "wiki", "doc", "document"]}
          onSelect={newPage}
        >
          <FileText />
          <span>New page</span>
          <CommandShortcut>⌃⌥P</CommandShortcut>
        </CommandItem>
        <CommandItem
          value="new event calendar meeting"
          keywords={["event", "calendar", "meeting", "cal"]}
          onSelect={() => go("/calendar?create=now")}
        >
          <Calendar />
          <span>New event</span>
          <CommandShortcut>⌃⌥E</CommandShortcut>
        </CommandItem>
      </CommandGroup>

      {trimmed.length > 0 && (
        <CommandGroup heading="Capture">
          <CommandItem value={`__capture__ ${trimmed}`} forceMount onSelect={captureText}>
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
