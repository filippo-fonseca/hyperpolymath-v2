import { afterEach, describe, expect, it } from "vitest";
import {
  CUE_SPECS,
  type CueName,
  cueDurationMs,
  isSfxEnabled,
  setSfxEnabled,
} from "@/lib/ui/sfx";

const CUE_NAMES: CueName[] = [
  "sidebarCollapse",
  "sidebarExpand",
  "viewToggle",
  "taskComplete",
  "captureSent",
  "habitCheck",
  "dialogOpen",
  "error",
];

describe("sfx core pack — cue table", () => {
  it("ships exactly the eight named cues", () => {
    expect(Object.keys(CUE_SPECS).sort()).toEqual([...CUE_NAMES].sort());
  });

  it.each(CUE_NAMES)("cue %s is shorter than 180ms", (name) => {
    const dur = cueDurationMs(name);
    expect(dur).toBeGreaterThan(0);
    expect(dur).toBeLessThan(180);
  });

  it.each(CUE_NAMES)("cue %s stays quiet (relative gain <= 1)", (name) => {
    for (const p of CUE_SPECS[name]) {
      expect(p.gain).toBeGreaterThan(0);
      expect(p.gain).toBeLessThanOrEqual(1);
    }
  });

  it("keeps the family pitch-coherent within a two-octave window of the center", () => {
    // Every partial is an interval of the single tonal center; a coherent
    // "one instrument" family sits inside +/- 24 semitones (two octaves).
    for (const name of CUE_NAMES) {
      for (const p of CUE_SPECS[name]) {
        expect(Math.abs(p.semitones)).toBeLessThanOrEqual(24);
      }
    }
  });
});

describe("sfx core pack — ui:sfx mute flag", () => {
  afterEach(() => {
    window.localStorage.clear();
  });

  it("defaults to ON when unset", () => {
    window.localStorage.removeItem("ui:sfx");
    expect(isSfxEnabled()).toBe(true);
  });

  it("persists an explicit disable and re-enable", () => {
    setSfxEnabled(false);
    expect(window.localStorage.getItem("ui:sfx")).toBe("0");
    expect(isSfxEnabled()).toBe(false);

    setSfxEnabled(true);
    expect(window.localStorage.getItem("ui:sfx")).toBe("1");
    expect(isSfxEnabled()).toBe(true);
  });
});
