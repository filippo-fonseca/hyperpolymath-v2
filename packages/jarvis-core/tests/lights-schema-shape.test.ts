import { describe, expect, it } from "vitest";
import { buildToolDefinitions } from "../src/tools";
import { controlLightsTool } from "../src/tools/control-lights";
import { listLightsTool } from "../src/tools/list-lights";

describe("Anthropic input_schema.type required", () => {
  it("every buildToolDefinitions tool has input_schema.type", () => {
    const tools = buildToolDefinitions({ voiceActive: false });
    for (const [i, t] of tools.entries()) {
      expect(t.input_schema?.type, `${i} ${t.name}`).toBeTruthy();
    }
  });

  it("control_lights and list_lights have type object", () => {
    expect(controlLightsTool.input_schema.type).toBe("object");
    expect(listLightsTool.input_schema.type).toBe("object");
    expect(controlLightsTool.input_schema).toHaveProperty("properties");
  });
});
