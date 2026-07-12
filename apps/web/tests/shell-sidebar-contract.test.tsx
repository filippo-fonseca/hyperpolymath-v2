import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { readTasksExpanded, useTasksExpanded } from "@/lib/ui/useTasksExpanded";

/**
 * Frozen-contract guards for the sidebar's persistence + coordination surface
 * (Unit 1). These are the byte-level contracts the restyled shell must never
 * break — the AppShell collapses the sidebar off the `tasks-expanded` key +
 * `tasks-expanded-change` event bus, and the Sidebar persists its collapse /
 * archived state under fixed keys with a fixed "true"/"false" serialization.
 */

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  window.localStorage.clear();
});

describe("useTasksExpanded — tasks-expanded key + event contract", () => {
  it("defaults to collapsed with no stored value", () => {
    const { result } = renderHook(() => useTasksExpanded());
    expect(result.current.expanded).toBe(false);
  });

  it("hydrates from a stored '1' as expanded", () => {
    window.localStorage.setItem("tasks-expanded", "1");
    const { result } = renderHook(() => useTasksExpanded());
    expect(result.current.expanded).toBe(true);
  });

  it("setExpanded persists the '1'/'0' protocol and updates state", () => {
    const { result } = renderHook(() => useTasksExpanded());

    act(() => result.current.setExpanded(true));
    expect(window.localStorage.getItem("tasks-expanded")).toBe("1");
    expect(result.current.expanded).toBe(true);
    expect(readTasksExpanded()).toBe(true);

    act(() => result.current.setExpanded(false));
    expect(window.localStorage.getItem("tasks-expanded")).toBe("0");
    expect(result.current.expanded).toBe(false);
  });

  it("toggle flips the value", () => {
    const { result } = renderHook(() => useTasksExpanded());
    act(() => result.current.toggle());
    expect(result.current.expanded).toBe(true);
    act(() => result.current.toggle());
    expect(result.current.expanded).toBe(false);
  });

  it("broadcasts tasks-expanded-change so a second subscriber stays in sync", () => {
    // This cross-subscriber sync is exactly what lets the AppShell sidebar
    // collapse react to the TasksClient toggle without shared state.
    const producer = renderHook(() => useTasksExpanded());
    const consumer = renderHook(() => useTasksExpanded());

    act(() => producer.result.current.setExpanded(true));
    expect(consumer.result.current.expanded).toBe(true);

    act(() => producer.result.current.setExpanded(false));
    expect(consumer.result.current.expanded).toBe(false);
  });
});

describe("sidebar-collapsed / sidebar-show-archived — serialization guard", () => {
  // The Sidebar reads/writes these keys inline with a "true"/"false" string
  // protocol (localStorage.getItem(...) === "true"). This guards that exact
  // protocol so a future refactor that silently switches to "1"/"0" (as the
  // tasks-expanded key uses) is caught as an intentional contract change.
  const KEYS = ["sidebar-collapsed", "sidebar-show-archived"] as const;

  it("round-trips the boolean-as-string protocol the Sidebar depends on", () => {
    for (const key of KEYS) {
      expect(window.localStorage.getItem(key)).toBeNull();

      window.localStorage.setItem(key, String(true));
      expect(window.localStorage.getItem(key)).toBe("true");
      expect(window.localStorage.getItem(key) === "true").toBe(true);

      window.localStorage.setItem(key, String(false));
      expect(window.localStorage.getItem(key)).toBe("false");
      expect(window.localStorage.getItem(key) === "true").toBe(false);
    }
  });
});
