import { act, cleanup, render, screen } from "@testing-library/react";
import { createRef, type RefObject } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  EntityMentionList,
  type EntityMentionListHandle,
} from "@/components/references/EntityMentionList";
import {
  flattenMentionGroups,
  mentionRows,
  optionToRef,
  type EntityMentionOption,
} from "@/lib/references/mention-list";

afterEach(cleanup);

const opt = (
  kind: EntityMentionOption["kind"],
  id: string,
  label: string,
): EntityMentionOption => ({ kind, id, label });

const ITEMS: EntityMentionOption[] = [
  opt("capture", "c1", "Capture one"),
  opt("task", "t1", "Task one"),
  opt("task", "t2", "Task two"),
];

function key(k: string): KeyboardEvent {
  return { key: k } as KeyboardEvent;
}

/**
 * Drive the imperative handle the way ProseMirror does, and flush the state
 * update it causes.
 *
 * The act() wrapper is the test harness's problem, not the component's: in the
 * real editor ProseMirror calls onKeyDown from a native event handler and React
 * batches the resulting render itself. Returns what the handle returned, since
 * "did you claim this key" is half the contract.
 */
function press(ref: RefObject<EntityMentionListHandle | null>, k: string): boolean {
  let handled = false;
  act(() => {
    handled = ref.current?.onKeyDown({ event: key(k) }) ?? false;
  });
  return handled;
}

/**
 * The keyboard contract is the part of this feature most likely to regress
 * silently — it is driven imperatively by ProseMirror, never by a real focus,
 * so nothing in the DOM would look wrong if it broke.
 */
describe("EntityMentionList — keyboard contract", () => {
  function setup(items = ITEMS, onEscape?: () => void) {
    const ref = createRef<EntityMentionListHandle>();
    const command = vi.fn();
    render(
      <EntityMentionList ref={ref} items={items} command={command} onEscape={onEscape} />,
    );
    return { ref, command };
  }

  const selected = () =>
    screen.getAllByRole("option").findIndex((el) => el.getAttribute("aria-selected") === "true");

  it("starts on the first item", () => {
    setup();
    expect(selected()).toBe(0);
  });

  it("returns true for keys it handles and false for keys it does not", () => {
    const { ref } = setup();
    expect(press(ref, "ArrowDown")).toBe(true);
    expect(press(ref, "ArrowUp")).toBe(true);
    expect(press(ref, "Enter")).toBe(true);
    expect(press(ref, "Tab")).toBe(true);
    // Anything else must fall through to the editor, or typing breaks.
    expect(press(ref, "a")).toBe(false);
    expect(press(ref, "ArrowLeft")).toBe(false);
  });

  it("moves down and wraps past the end", () => {
    const { ref } = setup();
    press(ref, "ArrowDown");
    expect(selected()).toBe(1);
    press(ref, "ArrowDown");
    expect(selected()).toBe(2);
    press(ref, "ArrowDown");
    expect(selected()).toBe(0);
  });

  it("wraps backwards from the first item to the last", () => {
    const { ref } = setup();
    press(ref, "ArrowUp");
    expect(selected()).toBe(ITEMS.length - 1);
  });

  it("accepts on Enter AND on Tab", () => {
    const { ref, command } = setup();
    press(ref, "ArrowDown");
    press(ref, "Enter");
    expect(command).toHaveBeenCalledWith(ITEMS[1]);

    press(ref, "Tab");
    expect(command).toHaveBeenLastCalledWith(ITEMS[1]);
    expect(command).toHaveBeenCalledTimes(2);
  });

  it("closes on Escape and claims the key", () => {
    const onEscape = vi.fn();
    const { ref } = setup(ITEMS, onEscape);
    expect(press(ref, "Escape")).toBe(true);
    expect(onEscape).toHaveBeenCalledOnce();
  });

  it("still claims Escape when there is nothing to show", () => {
    const onEscape = vi.fn();
    const { ref } = setup([], onEscape);
    expect(press(ref, "Escape")).toBe(true);
    expect(onEscape).toHaveBeenCalledOnce();
  });

  it("hands every other key back when the list is empty", () => {
    const { ref, command } = setup([]);
    expect(press(ref, "Enter")).toBe(false);
    expect(press(ref, "ArrowDown")).toBe(false);
    expect(command).not.toHaveBeenCalled();
  });

  it("resets the highlight when the results change under it", () => {
    // Otherwise the highlight strands itself past the end of a shorter list.
    const ref = createRef<EntityMentionListHandle>();
    const command = vi.fn();
    const { rerender } = render(
      <EntityMentionList ref={ref} items={ITEMS} command={command} />,
    );
    press(ref, "ArrowDown");
    press(ref, "ArrowDown");
    expect(selected()).toBe(2);

    rerender(<EntityMentionList ref={ref} items={[opt("task", "t9", "Only")]} command={command} />);
    expect(selected()).toBe(0);
    press(ref, "Enter");
    expect(command).toHaveBeenCalledWith(opt("task", "t9", "Only"));
  });

  it("selects on mousedown, not click, so the pick lands before the editor blurs", () => {
    const { command } = setup();
    const rows = screen.getAllByRole("option");
    const target = rows[1];
    if (!target) throw new Error("expected a second row");

    act(() => {
      target.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(command).not.toHaveBeenCalled();

    act(() => {
      target.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    });
    expect(command).toHaveBeenCalledWith(ITEMS[1]);
  });

  it("tags itself for the shipped suggestion-open test hook", () => {
    setup();
    expect(document.querySelector('[data-mention-suggestion-active="entity"]')).not.toBeNull();
  });

  it("renders group headers that are not selectable rows", () => {
    setup();
    // Three items across two kinds → two headers, but still only three options.
    expect(screen.getAllByRole("option")).toHaveLength(3);
    expect(screen.getByText("Captures")).toBeDefined();
    expect(screen.getByText("Tasks")).toBeDefined();
  });

  it("shows a loading state before results arrive, and an empty state after", () => {
    const { rerender } = render(<EntityMentionList items={[]} command={vi.fn()} loading />);
    expect(screen.getByText("Searching…")).toBeDefined();
    rerender(<EntityMentionList items={[]} command={vi.fn()} loading={false} />);
    expect(screen.getByText("No matches")).toBeDefined();
  });
});

describe("flattenMentionGroups", () => {
  const groups = [
    { kind: "task" as const, items: [opt("task", "t1", "Task one")] },
    { kind: "person" as const, items: [opt("person", "p1", "Ada")] },
  ];

  it("flattens in group order", () => {
    expect(flattenMentionGroups(groups).map((o) => o.id)).toEqual(["t1", "p1"]);
  });

  it("appends the create sentinel after the people", () => {
    const flat = flattenMentionGroups(groups, { createPersonName: "Grace" });
    expect(flat.map((o) => o.id)).toEqual(["t1", "p1", "__create_person__"]);
    expect(flat.at(-1)?.isCreatePerson).toBe(true);
  });

  it("offers the sentinel even when no person matched — the case that matters", () => {
    const flat = flattenMentionGroups([groups[0]!], { createPersonName: "Grace" });
    expect(flat.at(-1)).toMatchObject({ kind: "person", label: "Grace", isCreatePerson: true });
  });

  it("suppresses the sentinel when the name already exists — no second Ada", () => {
    expect(flattenMentionGroups(groups, { createPersonName: "ada" }).map((o) => o.id)).toEqual([
      "t1",
      "p1",
    ]);
  });

  it("suppresses the sentinel for a blank or whitespace name", () => {
    expect(flattenMentionGroups(groups, { createPersonName: "   " })).toHaveLength(2);
    expect(flattenMentionGroups(groups, {})).toHaveLength(2);
  });

  it("never gives the sentinel a ref to insert", () => {
    const sentinel = flattenMentionGroups(groups, { createPersonName: "Grace" }).at(-1)!;
    expect(optionToRef(sentinel)).toBeNull();
    expect(optionToRef(opt("task", "t1", "Task one"))).toEqual({
      type: "task",
      id: "t1",
      label: "Task one",
    });
  });
});

describe("mentionRows", () => {
  it("emits one header per kind change and indexes options into the flat list", () => {
    expect(mentionRows(ITEMS)).toEqual([
      // semantic:false on every exact header (U7): the field is present because
      // headers now carry the semantic vs "Related" distinction.
      { type: "header", kind: "capture", semantic: false },
      { type: "option", option: ITEMS[0], index: 0 },
      { type: "header", kind: "task", semantic: false },
      { type: "option", option: ITEMS[1], index: 1 },
      { type: "option", option: ITEMS[2], index: 2 },
    ]);
  });

  it("indexes rows so the keyboard's order and the rendered order cannot drift", () => {
    const rows = mentionRows(ITEMS).filter((r) => r.type === "option");
    expect(rows.map((r) => (r.type === "option" ? r.index : -1))).toEqual([0, 1, 2]);
  });
});
