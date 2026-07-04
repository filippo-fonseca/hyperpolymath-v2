// sourceLabelForTool — human source labels for routine progress / HUD.
// Explicit map hits stay stable copy; unmapped tools fall back to a
// prefix-stripped Title Case derivation.

import { describe, expect, it } from "vitest";
import { sourceLabelForTool } from "../src/routines";

describe("sourceLabelForTool", () => {
  it("uses explicit labels for the gather-ish tools", () => {
    expect(sourceLabelForTool("get_weather")).toBe("Weather");
    expect(sourceLabelForTool("read_gmail")).toBe("Email");
    expect(sourceLabelForTool("get_news")).toBe("News");
    expect(sourceLabelForTool("read_whatsapp")).toBe("WhatsApp");
    expect(sourceLabelForTool("find_events")).toBe("Calendar");
    expect(sourceLabelForTool("find_tasks")).toBe("Tasks");
  });

  it("falls back to prefix-stripped Title Case for unmapped tools", () => {
    expect(sourceLabelForTool("run_applescript")).toBe("Run Applescript");
    expect(sourceLabelForTool("read_foo_bar")).toBe("Foo Bar");
    expect(sourceLabelForTool("totally_fake")).toBe("Totally Fake");
  });
});
