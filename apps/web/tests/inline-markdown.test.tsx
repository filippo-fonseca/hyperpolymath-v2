/**
 * Transcript renderer tests — verify that sent JARVIS messages show `#hashtag`
 * / `$project` as inline chips (the bug: pills vanished / rendered as raw text
 * after sending), while leaving ordinary user text verbatim.
 */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  renderInlineMarkdown,
  renderUserText,
} from "@/lib/jarvis/inline-markdown";
import type { ReactNode } from "react";

const html = (nodes: ReactNode[]): string =>
  renderToStaticMarkup(<div>{nodes}</div>);

describe("renderUserText — user bubble chips", () => {
  it("renders a #hashtag as a chip span", () => {
    const out = html(renderUserText("random thought #idea"));
    expect(out).toContain('class="hashtag-chip-inline"');
    expect(out).toContain('data-hashtag="idea"');
    expect(out).toContain("#idea");
    expect(out).toContain("random thought ");
  });

  it("renders a $project as a chip span", () => {
    const out = html(renderUserText("ping $running now"));
    expect(out).toContain('class="project-chip-inline"');
    expect(out).toContain('data-project="running"');
    expect(out).toContain("$running");
  });

  it("does NOT treat a dollar price like $5 as a project chip", () => {
    const out = html(renderUserText("it costs $5 today"));
    expect(out).not.toContain("project-chip-inline");
    expect(out).toContain("$5");
  });

  it("leaves markdown-ish punctuation in user text verbatim (chips only)", () => {
    const out = html(renderUserText("email the 5*5 grid _now_"));
    expect(out).not.toContain("<em>");
    expect(out).not.toContain("<strong>");
    expect(out).toContain("5*5");
    expect(out).toContain("_now_");
  });

  it("does not chip a bare # with no label", () => {
    const out = html(renderUserText("the # symbol"));
    expect(out).not.toContain("hashtag-chip-inline");
    expect(out).toContain("the # symbol");
  });
});

describe("renderInlineMarkdown — assistant prose chips + markdown", () => {
  it("renders a #hashtag chip alongside markdown", () => {
    const out = html(renderInlineMarkdown("filed under **#idea**"));
    expect(out).toContain("<strong>");
    // bold wraps the chip
    const plain = html(renderInlineMarkdown("filed under #idea"));
    expect(plain).toContain('class="hashtag-chip-inline"');
    expect(plain).toContain("#idea");
  });
});
