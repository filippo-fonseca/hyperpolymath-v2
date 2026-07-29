"use client";

import { type CoverSelection, CoverImagePicker } from "./CoverImagePicker";
import { ImagePlus, RefreshCw, Trash2 } from "lucide-react";
import Image from "next/image";
import { useState } from "react";

interface Props {
  /** The current cover URL, or null when the page has no banner. */
  coverUrl: string | null;
  /** Unsplash photographer credit ("Name on Unsplash"), or null. */
  attribution: string | null;
  /**
   * Persist a new cover. `attribution` is the Unsplash credit (null for a plain
   * image-URL cover); null `url` removes the banner. The parent decides how to
   * persist (autosave) and may fire the Unsplash download-tracking ping.
   */
  onChange: (next: CoverSelection | { url: null; attribution: null; downloadLocation: null }) => void;
}

const UNSPLASH_HOST = "images.unsplash.com";

/**
 * Notion-style page banner (issue #28). Renders across the top of the page.
 *
 * - No cover: shows a slim "Add cover" affordance.
 * - With cover: renders the image full-bleed across the editor column, with
 *   hover controls to change or remove it, and an Unsplash attribution credit
 *   pinned bottom-right when present.
 *
 * Unsplash-hosted covers go through next/image's optimizer (the host is
 * allow-listed in next.config). Arbitrary pasted URLs use `unoptimized` so the
 * optimizer never has to fetch an un-allow-listed remote host.
 */
export function PageCoverImage({ coverUrl, attribution, onChange }: Props) {
  const [pickerOpen, setPickerOpen] = useState(false);
  // The picker's Radix Dialog used to be mounted on every page view, open or
  // not, so every wiki page carried a live modal layer it almost never needed.
  // Overlapping Radix modal layers are how `pointer-events: none` gets stranded
  // on <body>, which kills every click on the page. Mount it on first open and
  // keep it mounted after that, so the close animation still runs.
  const [everOpened, setEverOpened] = useState(false);
  const openPicker = () => {
    setEverOpened(true);
    setPickerOpen(true);
  };

  function handleSelect(selection: CoverSelection) {
    onChange(selection);
    // Fire-and-forget the Unsplash download-tracking ping (API guideline).
    if (selection.downloadLocation) {
      void fetch("/api/integrations/unsplash/track-download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ downloadLocation: selection.downloadLocation }),
      }).catch(() => {
        /* courtesy ping — ignore failures */
      });
    }
  }

  function handleRemove() {
    onChange({ url: null, attribution: null, downloadLocation: null });
  }

  // No cover yet: slim add affordance.
  if (!coverUrl) {
    return (
      <>
        <button
          type="button"
          onClick={openPicker}
          className="group inline-flex w-fit cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1 text-micro text-[var(--ink-muted)] transition-colors hover:bg-[var(--surface)] hover:text-[var(--ink)]"
        >
          <ImagePlus size={13} strokeWidth={1.5} />
          Add cover
        </button>
        {everOpened ? (
          <CoverImagePicker open={pickerOpen} onOpenChange={setPickerOpen} onSelect={handleSelect} />
        ) : null}
      </>
    );
  }

  let isUnsplash = false;
  try {
    isUnsplash = new URL(coverUrl).hostname === UNSPLASH_HOST;
  } catch {
    isUnsplash = false;
  }

  return (
    <>
      {/* Flush, edge to edge above the PageScaffold (SDC-1 §2.9) — the caller
          renders this outside the page measure when a cover is set. */}
      <div className="group relative h-44 w-full overflow-hidden border-b border-[var(--edge)] sm:h-52">
        <Image
          src={coverUrl}
          alt={attribution ? `Cover photo — ${attribution}` : "Page cover"}
          fill
          priority
          sizes="(max-width: 768px) 100vw, 768px"
          unoptimized={!isUnsplash}
          className="object-cover object-center"
        />

        {/* Hover controls, top-right. */}
        <div className="absolute right-2 top-2 flex items-center gap-1 opacity-0 transition-opacity duration-150 group-hover:opacity-100 focus-within:opacity-100">
          <button
            type="button"
            onClick={openPicker}
            title="Change cover"
            className="inline-flex cursor-pointer items-center gap-1 rounded bg-black/55 px-2 py-1 text-micro text-white/90 backdrop-blur-sm transition-colors hover:bg-black/70"
          >
            <RefreshCw size={11} strokeWidth={1.75} />
            Change cover
          </button>
          <button
            type="button"
            onClick={handleRemove}
            title="Remove cover"
            aria-label="Remove cover"
            className="inline-flex cursor-pointer items-center rounded bg-black/55 px-1.5 py-1 text-white/90 backdrop-blur-sm transition-colors hover:bg-black/70 hover:text-[var(--ink-coral)]"
          >
            <Trash2 size={12} strokeWidth={1.75} />
          </button>
        </div>

        {/* Unsplash attribution credit, bottom-right. Required by the Unsplash
            API Guidelines when a photo is displayed. */}
        {attribution && (
          <span className="absolute bottom-1.5 right-2 rounded bg-black/45 px-1.5 py-0.5 text-micro text-white/85 backdrop-blur-sm">
            {attribution}
          </span>
        )}
      </div>

      {everOpened ? (
        <CoverImagePicker open={pickerOpen} onOpenChange={setPickerOpen} onSelect={handleSelect} />
      ) : null}
    </>
  );
}
