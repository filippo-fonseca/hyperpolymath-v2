import { describe, expect, it } from "vitest";
import { parseReferences } from "@/lib/references/token";
import {
  captureRefToken,
  personRefToken,
  taskRefToken,
} from "@/lib/jarvis/reference-tokens";

const TASK = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";
const CAPTURE = "a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d";
const PERSON = "99999999-8888-4777-8666-555544443333";

describe("executor reference tokens", () => {
  it("builds a canonical, re-parseable task token", () => {
    const token = taskRefToken(TASK, "Ship the release");
    expect(token).toBe(`@[Ship the release](ref://task/${TASK})`);
    const [parsed] = parseReferences(token);
    expect(parsed).toMatchObject({ type: "task", id: TASK, label: "Ship the release" });
  });

  it("labels a capture token with its synthesized first line, not the whole body", () => {
    const body = "Buy oat milk and eggs\nsecond line that should be dropped";
    const token = captureRefToken(CAPTURE, body);
    const [parsed] = parseReferences(token);
    expect(parsed.type).toBe("capture");
    expect(parsed.id).toBe(CAPTURE);
    expect(parsed.label).toBe("Buy oat milk and eggs");
  });

  it("builds a canonical person token", () => {
    const token = personRefToken(PERSON, "Alex Rivera");
    expect(token).toBe(`@[Alex Rivera](ref://person/${PERSON})`);
    expect(parseReferences(token)).toHaveLength(1);
  });

  it("survives labels containing ] by stripping it (so the token stays parseable)", () => {
    const token = taskRefToken(TASK, "weird ] label");
    expect(parseReferences(token)).toHaveLength(1);
  });
});
