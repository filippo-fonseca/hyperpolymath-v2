"use client";

import { useEffect, useRef } from "react";
import { ASSETS, type AssetId, type ThemeKey } from "@/lib/branding/svg";

/**
 * Brand asset tile — preview chip + native `<dialog>` fullscreen viewer.
 *
 * Click the preview to expand. ESC, the backdrop, or the explicit Close
 * control all dismiss. Re-uses the same /api/branding/asset URL (no second
 * render); the dialog just shows the SVG at a much larger box.
 */
export function AssetTile({
  id,
  theme,
  label,
}: {
  id: AssetId;
  theme: { key: ThemeKey; label: string };
  label: string;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const { width, height } = ASSETS[id].size;
  const ratio = width / height;
  const src = `/api/branding/asset?id=${id}&theme=${theme.key}&format=svg`;

  function openFullscreen() {
    dialogRef.current?.showModal();
  }
  function closeFullscreen() {
    dialogRef.current?.close();
  }

  // Lock body scroll while the dialog is open (native <dialog> doesn't).
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    function onShow() {
      document.body.style.overflow = "hidden";
    }
    function onClose() {
      document.body.style.overflow = "";
    }
    dialog.addEventListener("close", onClose);
    return () => {
      dialog.removeEventListener("close", onClose);
      document.body.style.overflow = "";
    };
  }, []);

  return (
    <div className="flex flex-col">
      <button
        type="button"
        onClick={openFullscreen}
        aria-label={`Expand ${label} (${theme.label})`}
        className="group block overflow-hidden rounded-[12px] cursor-zoom-in p-0 transition-shadow hover:shadow-[0_8px_24px_-12px_rgba(0,0,0,0.25)]"
        style={{
          border: "1px solid var(--edge)",
          aspectRatio: ratio,
          background: "var(--surface)",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={`${label} — ${theme.label}`}
          className="block h-full w-full transition-transform group-hover:scale-[1.01]"
        />
      </button>
      <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--ink-muted)]">
        {theme.label}
      </p>

      <dialog
        ref={dialogRef}
        onClick={(e) => {
          // Click on backdrop (the dialog element itself, not its content) closes.
          if (e.target === dialogRef.current) closeFullscreen();
        }}
        className="m-0 max-h-none max-w-none border-0 bg-transparent p-0 outline-none backdrop:bg-black/85 backdrop:backdrop-blur-sm"
        style={{ width: "100vw", height: "100vh" }}
      >
        <div
          className="flex h-full w-full flex-col items-center justify-center gap-6 p-6 md:p-12"
          onClick={(e) => {
            // Clicks on the framed image shouldn't close — they should let the
            // user inspect. Clicks on the surrounding flex container close.
            if (e.target === e.currentTarget) closeFullscreen();
          }}
        >
          <div
            className="flex w-full items-start justify-between gap-4 text-white"
            style={{ maxWidth: "min(1600px, 92vw)" }}
          >
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.18em] opacity-60">
                {ASSETS[id].label}
              </p>
              <p className="mt-1 font-serif text-[18px]">{theme.label}</p>
              <p className="font-mono text-[11px] uppercase tracking-[0.16em] opacity-40 mt-1">
                {width}×{height}
              </p>
            </div>
            <button
              type="button"
              onClick={closeFullscreen}
              aria-label="Close"
              className="font-mono text-[12px] uppercase tracking-[0.18em] text-white/80 hover:text-white border border-white/30 hover:border-white/70 rounded-md px-3 py-1.5 transition-colors"
            >
              Close · ESC
            </button>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt={`${label} — ${theme.label} (fullscreen)`}
            className="block rounded-[12px] shadow-[0_24px_64px_-12px_rgba(0,0,0,0.6)]"
            style={{
              aspectRatio: ratio,
              maxWidth: "min(1600px, 92vw)",
              maxHeight: "78vh",
              width: "auto",
              height: "auto",
              objectFit: "contain",
              background: "var(--surface)",
            }}
          />
        </div>
      </dialog>
    </div>
  );
}
