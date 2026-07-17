import { describe, expect, it } from "vitest";
import { buildJarvisInputPayload } from "@/components/jarvis/jarvis-input-payload";
import {
  collectEntityMentionRefs,
  entityMentionAttrsToRef,
  refToEntityMentionNode,
  segmentTextForSeeding,
  serializeEntityMentionNode,
} from "@/lib/references/tiptap-tokens";

const TASK_ID = "aaaaaaaa-0000-4000-8000-000000000001";
const PERSON_ID = "bbbbbbbb-0000-4000-8000-000000000002";

function entityNode(type: string, id: string, label: string) {
  return { type: "entityMention", attrs: { refType: type, refId: id, label } };
}

function doc(...inline: unknown[]) {
  return { type: "doc", content: [{ type: "paragraph", content: inline }] };
}

describe("serializeEntityMentionNode", () => {
  it("emits the canonical token", () => {
    expect(serializeEntityMentionNode(entityNode("task", TASK_ID, "Ship it"))).toBe(
      `@[Ship it](ref://task/${TASK_ID})`,
    );
  });

  it("is null for other node types, so walkers can fall through", () => {
    expect(serializeEntityMentionNode({ type: "text", text: "hi" })).toBeNull();
    expect(serializeEntityMentionNode({ type: "mention", attrs: { label: "x" } })).toBeNull();
  });

  it("is null for a node with unusable attrs rather than throwing", () => {
    // A corrupt node must not take down a whole save.
    expect(serializeEntityMentionNode(entityNode("nonsense", TASK_ID, "x"))).toBeNull();
    expect(serializeEntityMentionNode(entityNode("task", "", "x"))).toBeNull();
  });
});

describe("entityMentionAttrsToRef", () => {
  it("rejects a refType outside the sealed set", () => {
    expect(entityMentionAttrsToRef({ refType: "event", refId: TASK_ID, label: "x" })).toBeNull();
  });

  it("tolerates a missing label — the id is the durable half", () => {
    expect(entityMentionAttrsToRef({ refType: "task", refId: TASK_ID })).toEqual({
      type: "task",
      id: TASK_ID,
      label: "",
    });
  });
});

describe("segmentTextForSeeding", () => {
  it("splits prose around complete tokens", () => {
    expect(segmentTextForSeeding(`see @[Ship it](ref://task/${TASK_ID}) today`)).toEqual([
      { kind: "text", text: "see " },
      { kind: "ref", ref: { type: "task", id: TASK_ID, label: "Ship it" } },
      { kind: "text", text: " today" },
    ]);
  });

  it("leaves an incomplete token as plain text — no half-chipping", () => {
    const partial = "see @[Ship it](ref://ta";
    expect(segmentTextForSeeding(partial)).toEqual([{ kind: "text", text: partial }]);
  });

  it("keeps a # inside a label out of the tokenizer's reach", () => {
    // The seeding path runs this BEFORE tokenizeContent precisely so the `#3`
    // inside the label is never chipped as a hashtag.
    const segments = segmentTextForSeeding(`@[Ship #3](ref://task/${TASK_ID})`);
    expect(segments).toEqual([
      { kind: "ref", ref: { type: "task", id: TASK_ID, label: "Ship #3" } },
    ]);
  });

  it("round-trips: seed a token, serialize the node, get the token back", () => {
    const token = `@[Ship it](ref://task/${TASK_ID})`;
    const [segment] = segmentTextForSeeding(token);
    if (segment?.kind !== "ref") throw new Error("expected a ref segment");
    expect(serializeEntityMentionNode(refToEntityMentionNode(segment.ref))).toBe(token);
  });
});

describe("collectEntityMentionRefs", () => {
  it("finds refs at any depth and keeps document order", () => {
    const refs = collectEntityMentionRefs(
      doc(
        entityNode("task", TASK_ID, "Ship it"),
        { type: "text", text: " with " },
        entityNode("person", PERSON_ID, "Ada"),
      ),
    );
    expect(refs).toEqual([
      { type: "task", id: TASK_ID, label: "Ship it" },
      { type: "person", id: PERSON_ID, label: "Ada" },
    ]);
  });

  it("skips malformed nodes instead of failing the walk", () => {
    expect(collectEntityMentionRefs(doc(entityNode("task", "not-a-uuid-but-truthy", "x")))).toEqual([
      { type: "task", id: "not-a-uuid-but-truthy", label: "x" },
    ]);
    expect(collectEntityMentionRefs(doc(entityNode("event", TASK_ID, "x")))).toEqual([]);
  });
});

/**
 * The regression this whole module exists for: a chip is invisible to
 * doc.textContent, so if the JSON walk misses it, the reference the user
 * inserted disappears from the sent message with no error anywhere.
 */
describe("buildJarvisInputPayload — entityMention serialization", () => {
  const TZ = "America/New_York";

  it("emits the S1 token into the sent input", () => {
    const payload = buildJarvisInputPayload(
      "",
      doc({ type: "text", text: "add a note to " }, entityNode("task", TASK_ID, "Ship it")),
      TZ,
      null,
    );
    expect(payload?.input).toBe(`add a note to @[Ship it](ref://task/${TASK_ID})`);
  });

  it("does not lose the chip when doc.textContent is empty", () => {
    // rawText is what doc.textContent would give for a doc of nothing but a
    // chip: the empty string. The payload must still carry the reference.
    const payload = buildJarvisInputPayload("", doc(entityNode("task", TASK_ID, "Ship it")), TZ, null);
    expect(payload).not.toBeNull();
    expect(payload?.input).toBe(`@[Ship it](ref://task/${TASK_ID})`);
  });

  it("keeps feeding the people sidecar from a person reference", () => {
    // Guards the regression from replacing the person-only @: linkedPeople is
    // built from this, not from the token.
    const payload = buildJarvisInputPayload("", doc(entityNode("person", PERSON_ID, "Ada")), TZ, null);
    expect(payload?.people).toEqual([{ id: PERSON_ID, name: "Ada" }]);
  });

  it("does not fold a referenced project into projectIds — that is $'s meaning", () => {
    const projectId = "cccccccc-0000-4000-8000-000000000003";
    const payload = buildJarvisInputPayload(
      "",
      doc(entityNode("project", projectId, "Marathon")),
      TZ,
      null,
    );
    expect(payload?.projectIds).toEqual([]);
  });

  it("still serializes the #/$ chips it always did", () => {
    const payload = buildJarvisInputPayload(
      "",
      doc(
        { type: "mention", attrs: { label: "idea" } },
        { type: "text", text: " for " },
        { type: "projectMention", attrs: { id: "p1", label: "Marathon" } },
      ),
      TZ,
      null,
    );
    expect(payload?.input).toBe("#idea for $Marathon");
    expect(payload?.hashtags).toEqual(["idea"]);
    expect(payload?.projectIds).toEqual(["p1"]);
  });
});
