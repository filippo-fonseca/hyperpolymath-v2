/**
 * Pure payload-builder tests. The JarvisInput component now funnels every
 * submission through `buildJarvisInputPayload`, so these tests exercise the
 * same code path the live composer takes — including the FIRST-SUBMIT path
 * that previously dropped the priority hint (B-priority-first-send).
 *
 * TipTap-in-jsdom is fragile (timing-dependent, hard to drive keystrokes),
 * so the component-level smoke test only verifies mount + affordances.
 * Anything parser-related lives here.
 */

import { describe, expect, it } from "vitest";
import { buildJarvisInputPayload } from "@/components/jarvis/jarvis-input-payload";

const TZ = "America/New_York";

describe("buildJarvisInputPayload — priority gate (regression for first-submit bug)", () => {
  it("typing 'buy goat tomorrow p1' on first submit yields parsedPriority='P1'", () => {
    const payload = buildJarvisInputPayload("buy goat tomorrow p1", null, TZ, null);
    expect(payload).not.toBeNull();
    expect(payload!.parsedPriority).toBe("P1");
    expect(payload!.input).toBe("buy goat tomorrow p1");
    expect(payload!.parsedDates.length).toBe(1);
    expect(payload!.parsedDates[0]?.text).toBe("tomorrow");
  });

  it("typing 'buy boat tomorrow p2' yields parsedPriority='P2'", () => {
    const payload = buildJarvisInputPayload("buy boat tomorrow p2", null, TZ, null);
    expect(payload!.parsedPriority).toBe("P2");
  });

  it("typing 'ptop urgent thing' yields parsedPriority='P∞'", () => {
    const payload = buildJarvisInputPayload("ptop urgent thing", null, TZ, null);
    expect(payload!.parsedPriority).toBe("P∞");
  });

  it("no priority token → parsedPriority is null (server lets model default)", () => {
    const payload = buildJarvisInputPayload("pick up groceries tomorrow", null, TZ, null);
    expect(payload!.parsedPriority).toBeNull();
  });

  it("8pm in a time phrase does NOT false-match as priority", () => {
    const payload = buildJarvisInputPayload("lunch sam 8pm sat", null, TZ, null);
    expect(payload!.parsedPriority).toBeNull();
  });

  it("priority adjacent to a date phrase still surfaces", () => {
    const payload = buildJarvisInputPayload("surprise for sam 5/16 p1", null, TZ, null);
    expect(payload!.parsedPriority).toBe("P1");
  });
});

describe("buildJarvisInputPayload — slash commands (Bug 2 + Bug 3)", () => {
  it("'/task pick up groceries' parses slashCommand='task' + body strips prefix", () => {
    const payload = buildJarvisInputPayload("/task pick up groceries", null, TZ, null);
    expect(payload!.slashCommand).toBe("task");
    expect(payload!.input).toBe("pick up groceries");
  });

  it("'/ask what did I file?' parses slashCommand='ask'", () => {
    const payload = buildJarvisInputPayload("/ask what did I file?", null, TZ, null);
    expect(payload!.slashCommand).toBe("ask");
    expect(payload!.input).toBe("what did I file?");
  });

  it("'/help' (no body) drops slashCommand (local-only)", () => {
    const payload = buildJarvisInputPayload("/help", null, TZ, null);
    expect(payload!.slashCommand).toBeNull();
  });

  it("slashCommandOverride='task' with body 'pick up groceries' (pinned via click)", () => {
    // Simulates: user typed `/`, clicked /task from popover (pinned),
    // editor stripped the prefix, user typed body, pressed Enter.
    const payload = buildJarvisInputPayload("pick up groceries", null, TZ, "task");
    expect(payload!.slashCommand).toBe("task");
    expect(payload!.input).toBe("pick up groceries");
  });

  it("override + body with priority + date — all three preserved", () => {
    // First submit after page reload with a pinned slash command — the
    // priority must still surface even on the very first call.
    const payload = buildJarvisInputPayload("buy goat tomorrow p1", null, TZ, "task");
    expect(payload!.slashCommand).toBe("task");
    expect(payload!.parsedPriority).toBe("P1");
    expect(payload!.input).toBe("buy goat tomorrow p1");
    expect(payload!.parsedDates.length).toBe(1);
  });

  it("override='ask' wins over auto-detect", () => {
    // Edge case: user typed `/ask foo`, then pinned `task` via popover.
    // The pinned override beats the auto-detector.
    const payload = buildJarvisInputPayload("/ask foo", null, TZ, "task");
    expect(payload!.slashCommand).toBe("task");
  });
});

describe("buildJarvisInputPayload — mentions + hashtags", () => {
  it("extracts hashtag from editor JSON mention node", () => {
    const json = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "random thought " },
            { type: "mention", attrs: { id: "idea", label: "idea" } },
          ],
        },
      ],
    };
    const payload = buildJarvisInputPayload("random thought #idea", json, TZ, null);
    expect(payload!.hashtags).toEqual(["idea"]);
  });

  it("extracts project ID from editor JSON projectMention node", () => {
    const projectId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const json = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "projectMention",
              attrs: { id: projectId, label: "running" },
            },
            { type: "text", text: " deadline" },
          ],
        },
      ],
    };
    const payload = buildJarvisInputPayload("running deadline", json, TZ, null);
    expect(payload!.projectIds).toEqual([projectId]);
  });

  it("reconstructs #hashtag into input even when rawText (doc.textContent) dropped the mention node", () => {
    // Regression: `doc.textContent` omits Mention leaf nodes, so the committed
    // `#idea` chip was vanishing from the sent message. The JSON still carries
    // it, so `input` must be rebuilt to include `#idea`.
    const json = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "random thought " },
            { type: "mention", attrs: { id: "idea", label: "idea" } },
          ],
        },
      ],
    };
    const payload = buildJarvisInputPayload(
      "random thought ", // mention dropped by textContent
      json,
      TZ,
      null,
    );
    expect(payload!.input).toBe("random thought #idea");
    expect(payload!.hashtags).toEqual(["idea"]);
  });

  it("reconstructs $project chip into input from a projectMention node", () => {
    const projectId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const json = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "projectMention",
              attrs: { id: projectId, label: "running" },
            },
            { type: "text", text: " deadline friday" },
          ],
        },
      ],
    };
    const payload = buildJarvisInputPayload(" deadline friday", json, TZ, null);
    expect(payload!.input).toBe("$running deadline friday");
    expect(payload!.projectIds).toEqual([projectId]);
  });

  it("reconstructs #hashtag into input even when rawText (doc.textContent) dropped the mention node", () => {
    // Regression: `doc.textContent` omits Mention leaf nodes, so the committed
    // `#idea` chip was vanishing from the sent message. The JSON still carries
    // it, so `input` must be rebuilt to include `#idea`.
    const json = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "random thought " },
            { type: "mention", attrs: { id: "idea", label: "idea" } },
          ],
        },
      ],
    };
    const payload = buildJarvisInputPayload(
      "random thought ", // mention dropped by textContent
      json,
      TZ,
      null,
    );
    expect(payload!.input).toBe("random thought #idea");
    expect(payload!.hashtags).toEqual(["idea"]);
  });

  it("reconstructs $project chip into input from a projectMention node", () => {
    const projectId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const json = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "projectMention",
              attrs: { id: projectId, label: "running" },
            },
            { type: "text", text: " deadline friday" },
          ],
        },
      ],
    };
    const payload = buildJarvisInputPayload(" deadline friday", json, TZ, null);
    expect(payload!.input).toBe("$running deadline friday");
    expect(payload!.projectIds).toEqual([projectId]);
  });

  it("permissive #hashtag regex catches typed-but-not-popped hashtags", () => {
    const payload = buildJarvisInputPayload("random thought #journal", null, TZ, null);
    expect(payload!.hashtags).toEqual(["journal"]);
  });

  it("extracts person { id, name } from editor JSON personMention node", () => {
    const personId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    const json = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "remind " },
            {
              type: "personMention",
              attrs: { id: personId, label: "Ada Lovelace" },
            },
            { type: "text", text: " about the deck" },
          ],
        },
      ],
    };
    const payload = buildJarvisInputPayload("remind Ada Lovelace about the deck", json, TZ, null);
    expect(payload!.people).toEqual([{ id: personId, name: "Ada Lovelace" }]);
  });

  it("de-duplicates repeated person mentions by id", () => {
    const personId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    const node = {
      type: "personMention",
      attrs: { id: personId, label: "Grace" },
    };
    const json = {
      type: "doc",
      content: [{ type: "paragraph", content: [node, { type: "text", text: " " }, node] }],
    };
    const payload = buildJarvisInputPayload("Grace Grace", json, TZ, null);
    expect(payload!.people).toEqual([{ id: personId, name: "Grace" }]);
  });
});

describe("buildJarvisInputPayload — empty input", () => {
  it("returns null for empty string", () => {
    expect(buildJarvisInputPayload("", null, TZ, null)).toBeNull();
  });

  it("returns null for whitespace only", () => {
    expect(buildJarvisInputPayload("   \n  ", null, TZ, null)).toBeNull();
  });
});
