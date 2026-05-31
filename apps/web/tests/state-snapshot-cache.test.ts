/**
 * Phase 11 / CACHE-03 (D-02) — state-snapshot-cache.ts behavior tests.
 *
 * Covers the 7 fixture cases from 11-04-PLAN.md Task 1 <behavior>:
 *   1. cold cache builds + stores
 *   2. second call same version reuses byte-for-byte
 *   3. version bump triggers rebuild
 *   4. per-user isolation
 *   5. bigint and number version both work (normalized to bigint)
 *   6. getLastWarmAt/setLastWarmAt round-trip
 *   7. __resetForTests clears both maps
 *
 * renderUserState is mocked via vi.hoisted so we can spy + control its
 * return value (and assert it's NOT called on cache reuse). Each test
 * isolates via __resetForTests() in beforeEach.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { renderUserStateMock } = vi.hoisted(() => ({
  renderUserStateMock: vi.fn(),
}));
vi.mock("@/lib/jarvis/render-user-state", () => ({
  renderUserState: renderUserStateMock,
}));

// Import AFTER the mock is set up so the cache module's internal
// `import { renderUserState }` binds to the spy.
const cacheModule = await import("@/lib/jarvis/state-snapshot-cache");
const { getOrBuild, getLastWarmAt, setLastWarmAt, __resetForTests } =
  cacheModule;

const STUB_INPUTS = {
  areas: [],
  projectsActive: [],
  projectsUpcoming: [],
  recentCaptures: [],
  todayCalendar: [],
  todayDate: "2026-05-28",
  activeTasks: [],
};

beforeEach(() => {
  __resetForTests();
  renderUserStateMock.mockReset();
  renderUserStateMock.mockReturnValue("<user_state>built</user_state>");
});

afterEach(() => {
  __resetForTests();
});

describe("getOrBuild — cold cache rebuild", () => {
  it("builds and stores on first call", () => {
    const result = getOrBuild("u1", 1n, STUB_INPUTS);
    expect(result).toBe("<user_state>built</user_state>");
    expect(renderUserStateMock).toHaveBeenCalledTimes(1);
    expect(renderUserStateMock).toHaveBeenCalledWith(STUB_INPUTS);
  });
});

describe("getOrBuild — reuse on version match", () => {
  it("returns byte-identical string from cache without calling renderUserState again", () => {
    const a = getOrBuild("u1", 1n, STUB_INPUTS);
    // Make renderUserState throw if invoked again — proves cache hit.
    renderUserStateMock.mockImplementation(() => {
      throw new Error("renderUserState should not be called on cache hit");
    });
    const b = getOrBuild("u1", 1n, STUB_INPUTS);
    expect(b).toBe(a);
    expect(renderUserStateMock).toHaveBeenCalledTimes(1);
  });
});

describe("getOrBuild — version bump rebuilds", () => {
  it("calls renderUserState again when version changes", () => {
    renderUserStateMock.mockReturnValueOnce("<v1/>");
    renderUserStateMock.mockReturnValueOnce("<v2/>");

    const v1 = getOrBuild("u1", 1n, STUB_INPUTS);
    const v2 = getOrBuild("u1", 2n, STUB_INPUTS);

    expect(v1).toBe("<v1/>");
    expect(v2).toBe("<v2/>");
    expect(renderUserStateMock).toHaveBeenCalledTimes(2);
  });
});

describe("getOrBuild — per-user isolation", () => {
  it("stores each userId independently and never cross-contaminates", () => {
    renderUserStateMock.mockReturnValueOnce("<userA/>");
    renderUserStateMock.mockReturnValueOnce("<userB/>");

    const a = getOrBuild("userA", 1n, STUB_INPUTS);
    const b = getOrBuild("userB", 1n, STUB_INPUTS);

    expect(a).toBe("<userA/>");
    expect(b).toBe("<userB/>");

    // Make sure userA's lookup hits its own cache, not userB's.
    renderUserStateMock.mockImplementation(() => {
      throw new Error("should not rebuild — userA v1 is cached");
    });
    const aAgain = getOrBuild("userA", 1n, STUB_INPUTS);
    expect(aAgain).toBe("<userA/>");
  });
});

describe("getOrBuild — bigint/number version normalization", () => {
  it("treats number 1 and bigint 1n as the same version", () => {
    const first = getOrBuild("u1", 1, STUB_INPUTS);
    renderUserStateMock.mockImplementation(() => {
      throw new Error("should be a cache hit — versions are equal");
    });
    const second = getOrBuild("u1", 1n, STUB_INPUTS);
    expect(second).toBe(first);
    expect(renderUserStateMock).toHaveBeenCalledTimes(1);
  });
});

describe("getLastWarmAt + setLastWarmAt", () => {
  it("returns null before any setLastWarmAt; returns the stored ts after", () => {
    expect(getLastWarmAt("u1")).toBeNull();
    setLastWarmAt("u1", 12345);
    expect(getLastWarmAt("u1")).toBe(12345);
    // Per-user isolation also holds for lastWarmAt
    expect(getLastWarmAt("u2")).toBeNull();
  });
});

describe("__resetForTests", () => {
  it("clears both the snapshot cache and the lastWarmAt map", () => {
    setLastWarmAt("u1", 999);
    getOrBuild("u1", 1n, STUB_INPUTS);
    expect(getLastWarmAt("u1")).toBe(999);

    __resetForTests();

    expect(getLastWarmAt("u1")).toBeNull();
    // After reset, a fresh getOrBuild call should rebuild (no cache hit).
    renderUserStateMock.mockClear();
    renderUserStateMock.mockReturnValue("<after-reset/>");
    const result = getOrBuild("u1", 1n, STUB_INPUTS);
    expect(result).toBe("<after-reset/>");
    expect(renderUserStateMock).toHaveBeenCalledTimes(1);
  });
});
