import { notFound } from "next/navigation";
import { PagePreviewCard } from "@/components/wiki/preview/PagePreviewCard";
import { PagePreviewThumb } from "@/components/wiki/preview/PagePreviewThumb";

const COVER_IMAGE =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1200 420'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' y1='0' x2='1' y2='1'%3E%3Cstop stop-color='%230a2f3a'/%3E%3Cstop offset='.52' stop-color='%230f766e'/%3E%3Cstop offset='1' stop-color='%23f59e0b'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='1200' height='420' fill='url(%23g)'/%3E%3Ccircle cx='930' cy='100' r='190' fill='%23ffffff' fill-opacity='.16'/%3E%3Cpath d='M0 305c220-90 365-85 540-18s333 69 660-38v171H0z' fill='%23ffffff' fill-opacity='.2'/%3E%3C/svg%3E";

const pages = [
  {
    title: "Heading-rich exploration",
    emoji: "📚",
    updatedAt: "2026-07-09T14:20:00.000Z",
    coverImageUrl: null,
    projects: [
      { id: "wiki", name: "Wiki" },
      { id: "design", name: "Design" },
    ],
    content: "",
    contentJson: [
      block("heading", "Wiki Renaissance", { level: 1 }),
      block(
        "paragraph",
        "Explorer previews should feel like miniature documents, not anonymous gray placeholders."
      ),
      block("heading", "Preview contract", { level: 2 }),
      block(
        "paragraph",
        "Each row already carries contentJson and markdown, so the card never needs another fetch."
      ),
      block("quote", "Real text is the Drive magic."),
      block("bulletListItem", "Pure extraction"),
      block("bulletListItem", "Server-safe rendering"),
      block("bulletListItem", "No screenshot pipeline"),
    ],
  },
  {
    title: "Todo stack",
    emoji: "✅",
    updatedAt: "2026-07-08T09:15:00.000Z",
    coverImageUrl: null,
    projects: [{ id: "ops", name: "Ops" }],
    content: "",
    contentJson: [
      block("heading", "Release checklist", { level: 2 }),
      block("checkListItem", "Extractor tests green", { checked: true }),
      block("checkListItem", "Preview card states", { checked: true }),
      block("checkListItem", "Gallery route verified", { checked: false }),
      block("paragraph", "Keep hover motion limited to border and shadow changes."),
    ],
  },
  {
    title: "Code-heavy note",
    emoji: null,
    updatedAt: "2026-07-07T18:45:00.000Z",
    coverImageUrl: null,
    projects: [],
    content: "",
    contentJson: [
      block("heading", "Extractor sketch", { level: 2 }),
      block(
        "paragraph",
        "The parser accepts unknown input and degrades unknown blocks into paragraphs."
      ),
      block(
        "codeBlock",
        "const model = extractPreviewModel(contentJson, markdown);\nreturn model.blocks.slice(0, 12);",
        { language: "ts" }
      ),
      { id: "divider-1", type: "divider", children: [] },
      block("paragraph", "A table becomes a compact table hint instead of rendering every cell."),
    ],
  },
  {
    title: "Cover-image page",
    emoji: "🗺️",
    updatedAt: "2026-07-06T11:05:00.000Z",
    coverImageUrl: COVER_IMAGE,
    projects: [
      { id: "atlas", name: "Atlas" },
      { id: "research", name: "Research" },
      { id: "field", name: "Field Notes" },
      { id: "archive", name: "Archive" },
    ],
    content: "",
    contentJson: [
      block("heading", "Route observations", { level: 1 }),
      block(
        "paragraph",
        "The cover image remains a top band while the miniature page still carries readable content below it."
      ),
      {
        id: "image-1",
        type: "image",
        props: { caption: "Reference frame" },
        children: [],
      },
    ],
  },
  {
    title: "Markdown fallback",
    emoji: "✍️",
    updatedAt: "2026-07-05T16:35:00.000Z",
    coverImageUrl: null,
    projects: [{ id: "legacy", name: "Legacy" }],
    contentJson: null,
    content: [
      "# Imported note",
      "A legacy markdown mirror still becomes a preview.",
      "- First parsed bullet",
      "- [x] Completed fallback",
      "> Quotes remain visible.",
      "```ts",
      "const source = 'markdown';",
      "```",
    ].join("\n"),
  },
  {
    title: "Empty page",
    emoji: null,
    updatedAt: "2026-07-04T10:00:00.000Z",
    coverImageUrl: null,
    projects: [],
    content: "",
    contentJson: [],
  },
];

export default function WikiPreviewGalleryPage() {
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <main className="min-h-screen bg-[var(--canvas)] px-6 py-8 text-[var(--ink)]">
      <div className="mx-auto max-w-[1400px] space-y-8">
        <header className="flex flex-wrap items-end justify-between gap-4 border-b border-[var(--edge)] pb-5">
          <div>
            <p className="font-mono text-[0.7rem] uppercase text-[var(--ink-muted)]">Dev gallery</p>
            <h1 className="mt-1 font-serif text-[2rem] leading-tight">Wiki Preview Engine</h1>
          </div>
          <p className="max-w-[520px] text-right text-[0.8rem] leading-relaxed text-[var(--ink-muted)]">
            Static fixtures for miniature page thumbnails, card chrome, cover bands, project chips,
            empty states, and selected/drop-target states.
          </p>
        </header>

        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {pages.map((page, index) => (
            <PagePreviewCard
              key={page.title}
              page={page}
              selected={index === 1}
              dropTarget={index === 3}
            />
          ))}
        </section>

        <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div>
            <h2 className="mb-3 font-mono text-[0.7rem] uppercase text-[var(--ink-muted)]">
              Inspector scale
            </h2>
            <PagePreviewThumb page={pages[0]} size="inspector" className="rounded-[8px]" />
          </div>
          <div>
            <h2 className="mb-3 font-mono text-[0.7rem] uppercase text-[var(--ink-muted)]">
              Empty inspector
            </h2>
            <PagePreviewThumb page={pages[5]} size="inspector" className="rounded-[8px]" />
          </div>
        </section>
      </div>
    </main>
  );
}

function block(type: string, value: string, props: Record<string, unknown> = {}) {
  return {
    id: `${type}-${value.slice(0, 10)}`,
    type,
    props,
    content: [{ type: "text", text: value, styles: {} }],
    children: [],
  };
}
