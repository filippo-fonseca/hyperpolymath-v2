"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { STUDIOLO } from "../materials/tokens";
import { catalogEntries } from "@/lib/studio/windows/catalog";
import { summonWidget } from "@/lib/studio/state/widget-windows";
import { emitStudioCue } from "@/lib/studio/audio/cues";

function normalizeUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

export function WidgetSummonMenu(): React.ReactElement {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const entries = catalogEntries();

  const summon = (kind: Parameters<typeof summonWidget>[0], props = {}): void => {
    const entry = entries.find(([candidate]) => candidate === kind)?.[1];
    summonWidget(kind, props, undefined, {
      defaultSize: entry?.defaultSize,
      singleton: entry?.singleton,
    });
    emitStudioCue("summon");
    setOpen(false);
  };

  const submitUrl = (event: React.FormEvent): void => {
    event.preventDefault();
    const normalized = normalizeUrl(url);
    if (!normalized) return;
    summon("browser", { url: normalized });
    setUrl("");
  };

  return (
    <div className="pointer-events-none absolute bottom-6 left-1/2 z-30 -translate-x-1/2">
      {open ? (
        <div
          className="pointer-events-auto mb-2 w-72 rounded-[10px] border p-2 backdrop-blur-xl"
          style={{
            color: STUDIOLO.parchment,
            background: `color-mix(in srgb, ${STUDIOLO.deepVellum} 92%, transparent)`,
            borderColor: `color-mix(in srgb, ${STUDIOLO.brass} 34%, transparent)`,
            boxShadow: `0 18px 54px color-mix(in srgb, ${STUDIOLO.nightwalnut} 80%, transparent)`,
          }}
        >
          <div className="flex items-center justify-between px-1 pb-2 font-mono text-[9px] uppercase tracking-[0.18em]" style={{ color: STUDIOLO.moonlace }}>
            Summon widget
            <button type="button" aria-label="Close summon menu" onClick={() => setOpen(false)}><X size={13} /></button>
          </div>
          <div className="grid grid-cols-2 gap-1">
            {entries.map(([kind, entry]) => (
              <button
                key={kind}
                type="button"
                onClick={() => summon(kind)}
                className="flex items-center gap-2 rounded-md px-2 py-2 text-left font-mono text-[11px] transition-colors hover:bg-white/5"
              >
                <entry.icon size={14} /> {entry.label}
              </button>
            ))}
          </div>
          <form onSubmit={submitUrl} className="mt-2 flex border-t pt-2" style={{ borderColor: `color-mix(in srgb, ${STUDIOLO.brass} 18%, transparent)` }}>
            <input
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="Pull up a website…"
              aria-label="Website URL"
              className="min-w-0 flex-1 bg-transparent px-2 font-mono text-[11px] outline-none"
              style={{ color: STUDIOLO.parchment }}
            />
            <button type="submit" className="px-2 font-mono text-[10px] uppercase" style={{ color: STUDIOLO.jarvisCyan }}>Open</button>
          </form>
        </div>
      ) : null}
      <button
        type="button"
        aria-label="Summon widget"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="pointer-events-auto flex h-10 items-center gap-2 rounded-full border px-4 font-mono text-[10px] uppercase tracking-[0.14em] backdrop-blur-xl"
        style={{
          color: STUDIOLO.parchment,
          background: `color-mix(in srgb, ${STUDIOLO.nightwalnut} 90%, transparent)`,
          borderColor: `color-mix(in srgb, ${STUDIOLO.brass} 36%, transparent)`,
        }}
      >
        <Plus size={14} aria-hidden /> Widgets
      </button>
    </div>
  );
}
