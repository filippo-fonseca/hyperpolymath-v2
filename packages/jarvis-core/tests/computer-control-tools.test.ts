// Computer-control tools test — JSON contract guarantee.
//
// This test suite is the project's core-value guarantee for the three new
// computer-control tools (open_url, open_app, web_search):
//   (a) buildToolDefinitions includes them with correct names + input schemas.
//   (b) Input schemas validate and reject correctly.
//
// The executor result shapes (the { ok, action: { kind, ... } } contract) are
// tested in apps/web/tests/jarvis-executor-computer-control.test.ts because
// createServerExecutor lives in the web app.

import { describe, expect, it } from "vitest";
import {
  buildToolDefinitions,
} from "../src/tools";
import { OpenUrlInputSchema } from "../src/tools/open-url";
import { OpenAppInputSchema } from "../src/tools/open-app";
import { WebSearchInputSchema } from "../src/tools/web-search";

// ---------------------------------------------------------------------------
// Schema validation
// ---------------------------------------------------------------------------

describe("OpenUrlInputSchema", () => {
  it("accepts valid http url", () => {
    expect(OpenUrlInputSchema.safeParse({ url: "http://example.com" }).success).toBe(true);
  });

  it("accepts valid https url with optional label", () => {
    expect(
      OpenUrlInputSchema.safeParse({ url: "https://google.com", label: "Google" }).success,
    ).toBe(true);
  });

  it("rejects non-http/https url", () => {
    expect(OpenUrlInputSchema.safeParse({ url: "ftp://example.com" }).success).toBe(false);
  });

  it("rejects missing url", () => {
    expect(OpenUrlInputSchema.safeParse({}).success).toBe(false);
  });

  it("rejects empty url string", () => {
    expect(OpenUrlInputSchema.safeParse({ url: "" }).success).toBe(false);
  });
});

describe("OpenAppInputSchema", () => {
  it("accepts app name only", () => {
    expect(OpenAppInputSchema.safeParse({ app: "Spotify" }).success).toBe(true);
  });

  it("accepts app name with optional label", () => {
    expect(OpenAppInputSchema.safeParse({ app: "VS Code", label: "the editor" }).success).toBe(true);
  });

  it("rejects missing app", () => {
    expect(OpenAppInputSchema.safeParse({}).success).toBe(false);
  });

  it("rejects empty app string", () => {
    expect(OpenAppInputSchema.safeParse({ app: "" }).success).toBe(false);
  });
});

describe("WebSearchInputSchema", () => {
  it("accepts query only (defaults engine to google)", () => {
    const result = WebSearchInputSchema.safeParse({ query: "how to cook pasta" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.engine).toBe("google");
    }
  });

  it("accepts query with engine: google", () => {
    expect(
      WebSearchInputSchema.safeParse({ query: "typescript generics", engine: "google" }).success,
    ).toBe(true);
  });

  it("accepts query with engine: maps", () => {
    expect(
      WebSearchInputSchema.safeParse({ query: "coffee near me", engine: "maps" }).success,
    ).toBe(true);
  });

  it("rejects invalid engine value", () => {
    expect(
      WebSearchInputSchema.safeParse({ query: "test", engine: "bing" }).success,
    ).toBe(false);
  });

  it("rejects missing query", () => {
    expect(WebSearchInputSchema.safeParse({}).success).toBe(false);
  });

  it("rejects empty query string", () => {
    expect(WebSearchInputSchema.safeParse({ query: "" }).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// buildToolDefinitions — registration + metadata
// ---------------------------------------------------------------------------

describe("buildToolDefinitions — computer-control tools", () => {
  it("includes open_url, open_app, web_search in the tool list", () => {
    const names = buildToolDefinitions().map((t) => t.name);
    expect(names).toContain("open_url");
    expect(names).toContain("open_app");
    expect(names).toContain("web_search");
  });

  it("returns twenty tools total (17 previous + 3 computer-control)", () => {
    expect(buildToolDefinitions()).toHaveLength(20);
  });

  it("computer-control tools are ALL non-strict (grammar budget)", () => {
    const tools = buildToolDefinitions();
    for (const name of ["open_url", "open_app", "web_search"] as const) {
      const t = tools.find((x) => x.name === name)!;
      expect(t.strict, name).toBe(false);
    }
  });

  it("cache_control: ephemeral 1h TTL is now on web_search (new LAST tool)", () => {
    const tools = buildToolDefinitions();
    const cached = tools.filter((t) => t.cache_control);
    expect(cached).toHaveLength(1);
    expect(cached[0]?.name).toBe("web_search");
    expect(cached[0]?.cache_control).toEqual({ type: "ephemeral", ttl: "1h" });
  });

  it("link_people no longer carries cache_control (moved to web_search)", () => {
    const tools = buildToolDefinitions();
    const linkPeople = tools.find((t) => t.name === "link_people")!;
    expect(linkPeople.cache_control).toBeUndefined();
  });

  it("open_url input_schema has required url property", () => {
    const tools = buildToolDefinitions();
    const t = tools.find((x) => x.name === "open_url")!;
    const schema = t.input_schema as {
      properties: Record<string, unknown>;
      required?: string[];
    };
    expect(schema.properties).toHaveProperty("url");
    expect(schema.required).toContain("url");
  });

  it("open_app input_schema has required app property", () => {
    const tools = buildToolDefinitions();
    const t = tools.find((x) => x.name === "open_app")!;
    const schema = t.input_schema as {
      properties: Record<string, unknown>;
      required?: string[];
    };
    expect(schema.properties).toHaveProperty("app");
    expect(schema.required).toContain("app");
  });

  it("web_search input_schema has required query property", () => {
    const tools = buildToolDefinitions();
    const t = tools.find((x) => x.name === "web_search")!;
    const schema = t.input_schema as {
      properties: Record<string, unknown>;
      required?: string[];
    };
    expect(schema.properties).toHaveProperty("query");
    expect(schema.required).toContain("query");
  });

  it("each computer-control tool has additionalProperties: false", () => {
    const tools = buildToolDefinitions();
    for (const name of ["open_url", "open_app", "web_search"] as const) {
      const t = tools.find((x) => x.name === name)!;
      expect(
        (t.input_schema as { additionalProperties?: boolean }).additionalProperties,
        name,
      ).toBe(false);
    }
  });

  it("computer-control tools appear after link_people in the array", () => {
    const names = buildToolDefinitions().map((t) => t.name);
    const linkIdx = names.indexOf("link_people");
    const openUrlIdx = names.indexOf("open_url");
    const openAppIdx = names.indexOf("open_app");
    const webSearchIdx = names.indexOf("web_search");
    expect(openUrlIdx).toBeGreaterThan(linkIdx);
    expect(openAppIdx).toBeGreaterThan(linkIdx);
    expect(webSearchIdx).toBeGreaterThan(linkIdx);
    // web_search is the very last tool
    expect(webSearchIdx).toBe(names.length - 1);
  });
});
