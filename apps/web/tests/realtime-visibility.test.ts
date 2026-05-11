import { describe, it, expect, beforeEach } from "vitest";
import {
  registerActiveTable,
  unregisterActiveTable,
  getActiveTables,
  notifyVisible,
  __resetForTests,
} from "@/lib/realtime/visibility";

describe("realtime visibility coordinator (RT-03 / D-11)", () => {
  beforeEach(() => __resetForTests());

  it("registers a (table, userId) pair", () => {
    registerActiveTable("tasks", "uid-a");
    expect(getActiveTables()).toEqual([{ table: "tasks", userId: "uid-a" }]);
  });

  it("refcounts duplicate registrations — single unregister leaves entry active", () => {
    registerActiveTable("tasks", "uid-a");
    registerActiveTable("tasks", "uid-a");
    unregisterActiveTable("tasks", "uid-a");
    expect(getActiveTables()).toHaveLength(1);
    unregisterActiveTable("tasks", "uid-a");
    expect(getActiveTables()).toHaveLength(0);
  });

  it("isolates different (table, userId) pairs", () => {
    registerActiveTable("tasks", "uid-a");
    registerActiveTable("captures", "uid-a");
    registerActiveTable("tasks", "uid-b");
    expect(getActiveTables()).toHaveLength(3);
  });

  it("notifyVisible invokes invalidate exactly once per active key (D-11)", () => {
    registerActiveTable("tasks", "uid-a");
    registerActiveTable("tasks", "uid-a"); // duplicate mount
    registerActiveTable("captures", "uid-a");
    const calls: string[] = [];
    notifyVisible((t, u) => calls.push(`${t}:${u}`));
    // duplicate mount must not produce duplicate invalidations
    expect(calls.sort()).toEqual(["captures:uid-a", "tasks:uid-a"]);
  });
});
