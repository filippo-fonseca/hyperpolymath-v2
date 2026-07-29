import type { ExplorerItem } from "@/components/wiki/explorer-types";
import { ExplorerGridView } from "@/components/wiki/explorer-views/ExplorerGridView";
import type { PageWithProjects } from "@/lib/db/queries/pages";
import type { FolderRow } from "@/lib/pages/folder-projects";
import { DndContext } from "@dnd-kit/core";
import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The explorer grid's tile-geometry contract (FIX-D4), asserted rather than
 * trusted. The folder-band alignment was proved once by a browser verifier and
 * then had no guard, so the identical defect recurred on the files band.
 *
 * The disease was content-driven geometry: a <button> is a form control whose
 * auto width is shrink-to-fit even as a flex container, so without `w-full`
 * each tile sized to its own label and the `aspect-square w-full` media
 * backplate turned that text width into a text-driven height ("Another page"
 * sat ~32px below "Test"). jsdom has no real layout, so these assertions pin
 * the classes that carry the geometry: the browser-measured result (top,
 * height and width spread all 0 within a row) follows from them.
 */

function mockMatchMedia() {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }))
  );
}

function folderItem(id: string, name: string, itemCount = 0): ExplorerItem {
  const folder = { id, parentId: null, name, orderIndex: 0 } as FolderRow;
  return { kind: "folder", id, folder, itemCount };
}

function pageItem(id: string, title: string, extra: Partial<PageWithProjects> = {}): ExplorerItem {
  const page = {
    id,
    title,
    content: "",
    contentJson: null,
    emoji: null,
    url: null,
    pinned: false,
    coverImageUrl: null,
    coverImageAttribution: null,
    noExport: false,
    folderId: null,
    folderName: null,
    positionKey: "a0",
    dailyDate: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    projects: [],
    fields: [],
    ...extra,
  } as PageWithProjects;
  return { kind: "page", id, page };
}

/** A deliberately hostile mix: wide and narrow labels across both bands. */
const ITEMS: ExplorerItem[] = [
  folderItem("f1", "A"),
  folderItem("f2", "An extremely long folder name that would stretch a shrink-to-fit tile", 3),
  pageItem("p1", "Test"),
  pageItem("p2", "Another page", { content: "# Another page\n\nContent.\n" }),
  pageItem("p3", "A very long page title that would certainly wrap onto multiple lines"),
  pageItem("p4", "Emoji page", { emoji: "🍀" }),
];

function renderGrid() {
  return render(
    <DndContext>
      <ExplorerGridView
        items={ITEMS}
        isSelected={() => false}
        onItemClick={() => {}}
        onItemOpen={() => {}}
      />
    </DndContext>
  );
}

describe("explorer grid tile geometry", () => {
  beforeEach(() => {
    mockMatchMedia();
  });

  it("renders every tile, folder and page alike, with cell-filling width", () => {
    const { container } = renderGrid();
    const tiles = [...container.querySelectorAll<HTMLElement>("[data-explorer-id]")];
    expect(tiles).toHaveLength(ITEMS.length);
    for (const tile of tiles) {
      // Without w-full a button shrink-wraps its label and geometry becomes
      // content-driven; this is the exact class whose absence caused FIX-D4.
      expect(tile.className).toContain("w-full");
    }
  });

  it("gives every tile the same fixed-square media backplate", () => {
    const { container } = renderGrid();
    const tiles = [...container.querySelectorAll<HTMLElement>("[data-explorer-id]")];
    for (const tile of tiles) {
      const backplate = tile.querySelector(".aspect-square");
      expect(backplate).not.toBeNull();
      // w-full + the 110px cap is what makes the square the same size in every
      // cell regardless of what the tile shows or how long its label is.
      expect(backplate?.className).toContain("w-full");
      expect(backplate?.className).toContain("max-w-[110px]");
    }
  });

  it("keeps both bands on the shared equal-column track", () => {
    const { container } = renderGrid();
    const tracks = [
      ...container.querySelectorAll<HTMLElement>("[data-view='grid'] div[class*='grid-cols-']"),
    ];
    expect(tracks).toHaveLength(2); // Folders band + Files band
    for (const track of tracks) {
      expect(track.className).toContain("grid-cols-[repeat(auto-fill,minmax(118px,1fr))]");
    }
  });

  it("never puts a transform on a tile or its entry wrapper (opacity-only motion)", () => {
    const { container } = renderGrid();
    for (const tile of container.querySelectorAll<HTMLElement>("[data-explorer-id]")) {
      let el: HTMLElement | null = tile;
      // Walk from the button up to the band track: no node on that chain may
      // carry a transform. An interrupted y-entry settling at translateY(4px)
      // was the original drooping-tile bug (§2.7 bans layout + y outright).
      while (el && !el.className.includes("grid-cols-")) {
        const transform = el.style.transform;
        expect(transform === "" || transform === "none").toBe(true);
        el = el.parentElement;
      }
    }
  });
});
