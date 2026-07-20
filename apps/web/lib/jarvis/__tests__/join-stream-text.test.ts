import { describe, expect, it } from "vitest";
import { joinStreamTextChunks } from "../join-stream-text";

describe("joinStreamTextChunks", () => {
  it("inserts a space between sentence-end and capital start", () => {
    expect(joinStreamTextChunks("Straightaway, sir.", "Bedroom lights off, sir.")).toBe(
      " Bedroom lights off, sir.",
    );
    expect(
      joinStreamTextChunks(
        "Let me pull up the available lights first, sir.",
        "Turning on the bedroom lights now, sir.",
      ),
    ).toBe(" Turning on the bedroom lights now, sir.");
  });

  it("does not double-space when either side already has whitespace", () => {
    expect(joinStreamTextChunks("sir. ", "Bedroom")).toBe("Bedroom");
    expect(joinStreamTextChunks("sir.", " Bedroom")).toBe(" Bedroom");
  });

  it("leaves mid-sentence token streams alone", () => {
    expect(joinStreamTextChunks("Straight", "away")).toBe("away");
    expect(joinStreamTextChunks("sir.", " bedroom")).toBe(" bedroom");
  });
});
