/**
 * GESTURES.md drift guard.
 *
 * Three of the defects this catalog was written to fix were the same defect: a
 * number moved and its prose did not (resize's arm dwell documented at 300 when
 * armMs was 220; the resize test's deadband comment at 0.15 when it was 0.12;
 * DEFAULT_PINCH_HOLD.holdMs at a value nothing used). A catalog of thresholds
 * with no enforcement becomes the fourth such doc the day someone retunes a knob.
 *
 * So the tables in GESTURES.md are executable. This parses every
 * `Constant | Value | Gates | Source` row and checks it BOTH ways:
 *   - forward:  every documented value equals the live DEFAULT_* value it cites;
 *   - reverse:  every numeric knob in those objects is documented (add a
 *               threshold, document it, or this fails);
 *   - citation: the file each row names really does export the symbol it claims.
 *
 * If this test fails, GESTURES.md is lying. Fix the row, not the test.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { DEFAULT_FIST_SCROLL } from "./fist-scroll-recognizer";
import { DEFAULT_FOUR_FINGER_SCROLL } from "./four-finger-scroll-recognizer";
import { DEFAULT_INDEX_SCROLL } from "./index-scroll-recognizer";
import { DEFAULT_OPEN_PALM_HALT } from "./open-palm-halt-recognizer";
import { DEFAULT_PALM_CLICK } from "./palm-click-recognizer";
import { DEFAULT_PINCH_BLOOM } from "./pinch-bloom-recognizer";
import { DEFAULT_PINCH_DOLLY } from "./pinch-dolly";
import { DEFAULT_PINCH_HOLD } from "./pinch-hold-recognizer";
import { DEFAULT_SWIPE } from "./swipe-recognizer";
import { DEFAULT_THUMB_CONFIRM } from "./thumb-confirm-recognizer";
import { DEFAULT_HAND_GESTURE, DEFAULT_THUMB_GESTURE } from "./hand/gesture-core";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const DOC = readFileSync(`${HERE}GESTURES.md`, "utf8");

/** Every config object the catalog is allowed to cite, by its exported name. */
const LIVE: Record<string, Record<string, unknown>> = {
  DEFAULT_FIST_SCROLL,
  DEFAULT_FOUR_FINGER_SCROLL,
  DEFAULT_HAND_GESTURE,
  DEFAULT_INDEX_SCROLL,
  DEFAULT_OPEN_PALM_HALT,
  DEFAULT_PALM_CLICK,
  DEFAULT_PINCH_BLOOM,
  DEFAULT_PINCH_DOLLY,
  DEFAULT_PINCH_HOLD,
  DEFAULT_SWIPE,
  DEFAULT_THUMB_CONFIRM,
  DEFAULT_THUMB_GESTURE,
};

type Row = { constant: string; value: number; symbol: string; file: string };

/**
 * Parse the threshold rows. A row is a markdown table line whose 1st cell is a
 * backticked identifier, 2nd a backticked number, and 4th a backticked
 * `file.ts:SYMBOL` citation. Prose tables (the coverage table, the signal index)
 * have no such 4th cell and are skipped.
 */
function parseRows(md: string): Row[] {
  const rows: Row[] = [];
  for (const line of md.split("\n")) {
    if (!line.startsWith("|")) continue;
    // Split on UNESCAPED pipes only: a Gates cell may legitimately contain \|
    // (the prose writes |dy|, |openness - baseline|, and so on).
    const cells = line
      .split(/(?<!\\)\|/)
      .slice(1, -1)
      .map((c) => c.replaceAll("\\|", "|").trim());
    if (cells.length !== 4) continue;
    const constant = /^`([A-Za-z_][A-Za-z0-9_]*)`$/.exec(cells[0] ?? "")?.[1];
    const rawValue = /^`(-?[0-9]*\.?[0-9]+)`$/.exec(cells[1] ?? "")?.[1];
    const cite = /^`([\w./-]+\.ts):([A-Z_][A-Z0-9_]*)`$/.exec(cells[3] ?? "");
    if (!constant || rawValue === undefined || !cite) continue;
    rows.push({
      constant,
      value: Number(rawValue),
      file: cite[1]!,
      symbol: cite[2]!,
    });
  }
  return rows;
}

const ROWS = parseRows(DOC);

describe("GESTURES.md is not drifting from the constants", () => {
  it("parses a threshold table at all (guards the parser itself)", () => {
    // If a formatting change silently stops matching rows, every other check in
    // this file would vacuously pass. Pin a floor instead.
    expect(ROWS.length).toBeGreaterThanOrEqual(55);
  });

  it("cites only known config objects", () => {
    const unknown = [...new Set(ROWS.map((r) => r.symbol))].filter((s) => !(s in LIVE));
    expect(unknown).toEqual([]);
  });

  it.each(ROWS.map((r) => [`${r.symbol}.${r.constant}`, r] as const))(
    "%s matches its documented value",
    (_name, { constant, value, symbol }) => {
      const live = LIVE[symbol]!;
      expect(live, `${symbol} is not a registered config object`).toBeDefined();
      expect(
        Object.hasOwn(live, constant),
        `GESTURES.md documents ${symbol}.${constant}, which does not exist`,
      ).toBe(true);
      expect(live[constant], `${symbol}.${constant} drifted from GESTURES.md`).toBe(
        value,
      );
    },
  );

  it("cites source files that really export the symbol", () => {
    const wrong: string[] = [];
    for (const { file, symbol } of ROWS) {
      const src = readFileSync(`${HERE}${file}`, "utf8");
      if (!src.includes(`export const ${symbol}`)) wrong.push(`${file}:${symbol}`);
    }
    expect([...new Set(wrong)]).toEqual([]);
  });

  it("documents every numeric knob of every config object", () => {
    const documented = new Set(ROWS.map((r) => `${r.symbol}.${r.constant}`));
    const missing: string[] = [];
    for (const [symbol, obj] of Object.entries(LIVE)) {
      for (const [key, value] of Object.entries(obj)) {
        // Nested configs (one-euro, thumbGesture) are documented under their own
        // symbol or in prose; only scalar knobs are table rows.
        if (typeof value !== "number") continue;
        if (!documented.has(`${symbol}.${key}`)) missing.push(`${symbol}.${key}`);
      }
    }
    expect(missing, "these live thresholds are undocumented in GESTURES.md").toEqual(
      [],
    );
  });
});

describe("GESTURES.md invariants the prose asserts", () => {
  it("pinch-bloom and pinch-hold really do share one threshold (tap vs grab)", () => {
    // The catalog's central arbitration claim: one number, exact exclusion.
    expect(DEFAULT_PINCH_BLOOM.holdMs).toBe(DEFAULT_HAND_GESTURE.grabHoldMs);
    expect(DEFAULT_PINCH_HOLD.holdMs).toBe(DEFAULT_HAND_GESTURE.grabHoldMs);
  });

  it("gesture-core's halt mirrors are the recognizer's own defaults", () => {
    expect(DEFAULT_HAND_GESTURE.haltHoldMs).toBe(DEFAULT_OPEN_PALM_HALT.holdMs);
    expect(DEFAULT_HAND_GESTURE.haltMaxDriftNx).toBe(DEFAULT_OPEN_PALM_HALT.maxDriftNx);
    expect(DEFAULT_HAND_GESTURE.haltPushRatio).toBe(DEFAULT_OPEN_PALM_HALT.pushRatio);
  });

  it("gesture-core's palm-click mirrors match the recognizer's defaults", () => {
    expect(DEFAULT_HAND_GESTURE.palmClickReopenWindowMs).toBe(
      DEFAULT_PALM_CLICK.reopenWindowMs,
    );
    expect(DEFAULT_HAND_GESTURE.palmClickCancelMs).toBe(DEFAULT_PALM_CLICK.cancelMs);
  });

  it("palm-click's cancel dwell outlasts collapse's hold (so collapseFired can gate it)", () => {
    // If this inverts, a fist could fire collapse AND a click on release.
    expect(DEFAULT_PALM_CLICK.cancelMs).toBeGreaterThan(DEFAULT_HAND_GESTURE.holdMs);
  });

  it("a reopen always wins before the cancel dwell elapses", () => {
    expect(DEFAULT_PALM_CLICK.reopenWindowMs).toBeLessThan(DEFAULT_PALM_CLICK.cancelMs);
  });

  it("the four-finger scroll band sits between the closed band and a held-open hand", () => {
    expect(DEFAULT_HAND_GESTURE.palmClickOpennessThreshold).toBeLessThan(
      DEFAULT_HAND_GESTURE.scrollArmOpennessCeil,
    );
  });

  it("the dolly's exit deadzone is inside its arm deadzone (hysteresis, not chatter)", () => {
    expect(DEFAULT_PINCH_DOLLY.exitDeadzone).toBeLessThan(DEFAULT_PINCH_DOLLY.deadzone);
  });

  it("pinch hysteresis is ordered: engage tighter than release", () => {
    expect(DEFAULT_HAND_GESTURE.pinchOnRatio).toBeLessThan(
      DEFAULT_HAND_GESTURE.pinchOffRatio,
    );
  });

  it("a held pinch survives a dropout no longer than the cursor does", () => {
    // Documented in §13: kept ≤ lostGraceMs so the cursor never de-activates first.
    expect(DEFAULT_HAND_GESTURE.pinchLostGraceMs).toBeLessThanOrEqual(
      DEFAULT_HAND_GESTURE.lostGraceMs,
    );
  });

  it("the curl band is ordered: a finger extends above where it curls", () => {
    expect(DEFAULT_HAND_GESTURE.curlThreshold).toBeLessThan(
      DEFAULT_HAND_GESTURE.extendThreshold,
    );
  });

  it("both aim leads fit inside the cursor history they read from", () => {
    expect(DEFAULT_HAND_GESTURE.pinchAnchorLeadMs).toBeLessThanOrEqual(
      DEFAULT_HAND_GESTURE.cursorHistoryMs,
    );
    expect(DEFAULT_HAND_GESTURE.palmClickAimLeadMs).toBeLessThanOrEqual(
      DEFAULT_HAND_GESTURE.cursorHistoryMs,
    );
  });

  it("documents the known conflicts rather than quietly carrying them", () => {
    // Known conflicts must stay NAMED: an undocumented known bug is how it gets
    // rediscovered from scratch.
    expect(DOC).toContain("Known conflicts");
  });
});
