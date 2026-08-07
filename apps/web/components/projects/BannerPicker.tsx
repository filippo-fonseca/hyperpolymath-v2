"use client";

import { CoverImagePicker, type CoverSelection } from "@/components/pages/CoverImagePicker";
import { coverBackground, parseCover } from "@/lib/ui/cover";
import { cn } from "@/lib/utils";
import { type ReactNode, useState } from "react";

interface Props {
  value: string | null;
  onChange: (bannerValue: string | null) => void;
  /**
   * Optional custom trigger (used with `asChild`-style forwarding). When
   * omitted, the default swatch button renders. ProjectHeader passes a ghost
   * "Add banner" button for banner-less projects.
   */
  renderTrigger?: ReactNode;
}

/**
 * Project banner picker.
 *
 * It used to be a popover of sixteen colour swatches and nothing else, while
 * wiki pages had an Unsplash search and a URL field and no colours. Both now
 * open the SAME dialog (`CoverImagePicker`) with all three tabs — Colour,
 * Unsplash, Image URL — so the two surfaces cannot drift again, and a project
 * and a page painted "Verdigris" are the same green.
 *
 * The stored value keeps its historical encoding (`solid:` / `gradient:` for
 * colours, a bare URL for images), so no migration was needed: see
 * `lib/ui/cover.ts`.
 */
export function BannerPicker({ value, onChange, renderTrigger }: Props) {
  const [open, setOpen] = useState(false);
  // Mount the dialog only once it has been opened, then keep it mounted so the
  // close animation still runs. Overlapping always-mounted Radix modal layers
  // are how `pointer-events: none` gets stranded on <body>.
  const [everOpened, setEverOpened] = useState(false);

  const openPicker = () => {
    setEverOpened(true);
    setOpen(true);
  };

  const handleSelect = (selection: CoverSelection) => {
    onChange(selection.url);
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
  };

  const cover = parseCover(value);

  return (
    <>
      {renderTrigger ? (
        // The caller's element, wrapped so it still fires the dialog without
        // needing Radix's asChild plumbing.
        <span className="contents" onClickCapture={openPicker}>
          {renderTrigger}
        </span>
      ) : (
        <button
          type="button"
          onClick={openPicker}
          aria-label="Change banner"
          className={cn(
            "h-9 w-20 cursor-pointer overflow-hidden rounded-lg border border-[var(--edge)]",
            "transition-opacity duration-[160ms] ease-out hover:opacity-90"
          )}
          style={
            cover?.kind === "image"
              ? { backgroundImage: `url(${cover.url})`, backgroundSize: "cover" }
              : { background: coverBackground(value) }
          }
        />
      )}

      {everOpened ? (
        <CoverImagePicker
          open={open}
          onOpenChange={setOpen}
          onSelect={handleSelect}
          currentValue={value}
          defaultTab="color"
          title="Project banner"
        />
      ) : null}
    </>
  );
}
