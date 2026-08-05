"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { UnsplashPhoto } from "@/lib/pages/unsplash";
import { ImageIcon, Loader2, Search } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

/** The cover the picker hands back: a URL plus optional Unsplash credit. */
export interface CoverSelection {
  url: string;
  /** "Name on Unsplash"-style credit, or null for a plain image-URL cover. */
  attribution: string | null;
  /**
   * Unsplash download-tracking endpoint to ping (API guideline). Present only
   * when the cover was chosen from the Unsplash grid; null for URL covers.
   */
  downloadLocation: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (selection: CoverSelection) => void;
}

interface SearchResponse {
  configured: boolean;
  results: UnsplashPhoto[];
}

/**
 * Notion-style cover picker (issue #28). Two tabs:
 *   - "Unsplash": debounced search against the server proxy; click a tile to set
 *     the cover (with photographer attribution). When UNSPLASH_ACCESS_KEY is
 *     unset the proxy returns { configured: false }, and we show a hint.
 *   - "Image URL": paste any direct image URL.
 *
 * The Unsplash Access Key NEVER touches this client — search goes through
 * /api/integrations/unsplash/search, which holds the key server-side.
 */
export function CoverImagePicker({ open, onOpenChange, onSelect }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<UnsplashPhoto[]>([]);
  const [loading, setLoading] = useState(false);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [urlInput, setUrlInput] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Guards stale responses from overwriting newer ones (race on fast typing).
  const reqIdRef = useRef(0);

  const runSearch = useCallback(async (q: string) => {
    const trimmed = q.trim();
    if (!trimmed) {
      setResults([]);
      setLoading(false);
      return;
    }
    const reqId = ++reqIdRef.current;
    setLoading(true);
    try {
      const res = await fetch(
        `/api/integrations/unsplash/search?query=${encodeURIComponent(trimmed)}`,
      );
      if (!res.ok) {
        if (reqId === reqIdRef.current) setResults([]);
        return;
      }
      const data = (await res.json()) as SearchResponse;
      if (reqId !== reqIdRef.current) return; // a newer search superseded this one
      setConfigured(data.configured);
      setResults(data.results);
    } catch {
      if (reqId === reqIdRef.current) setResults([]);
    } finally {
      if (reqId === reqIdRef.current) setLoading(false);
    }
  }, []);

  // Debounce search-as-you-type by 350ms.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => void runSearch(query), 350);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, runSearch]);

  // Probe configuration once on first open so the empty state can hint about the
  // missing key before the user types anything.
  useEffect(() => {
    if (!open || configured !== null) return;
    void (async () => {
      try {
        const res = await fetch("/api/integrations/unsplash/search");
        if (!res.ok) return;
        const data = (await res.json()) as SearchResponse;
        setConfigured(data.configured);
      } catch {
        /* leave configured unknown; the grid still works once a key exists */
      }
    })();
  }, [open, configured]);

  function handlePickPhoto(photo: UnsplashPhoto) {
    onSelect({
      url: photo.fullUrl,
      attribution: `${photo.authorName} on Unsplash`,
      downloadLocation: photo.downloadLocation,
    });
    onOpenChange(false);
  }

  function handleSubmitUrl() {
    const url = urlInput.trim();
    if (!url) return;
    onSelect({ url, attribution: null, downloadLocation: null });
    setUrlInput("");
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-serif">Add a cover</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="unsplash" className="mt-1">
          <TabsList>
            <TabsTrigger value="unsplash">Unsplash</TabsTrigger>
            <TabsTrigger value="url">Image URL</TabsTrigger>
          </TabsList>

          {/* ── Unsplash tab ─────────────────────────────────────────────── */}
          <TabsContent value="unsplash" className="mt-3 flex flex-col gap-3">
            <div className="relative">
              <Search
                size={14}
                strokeWidth={1.75}
                className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--ink-muted)]"
              />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search Unsplash photos…"
                className="pl-8"
                aria-label="Search Unsplash photos"
              />
            </div>

            {configured === false ? (
              <div className="flex flex-col items-center gap-2 py-10 text-center">
                <ImageIcon size={22} strokeWidth={1.25} className="text-[var(--ink-muted)]" />
                <p className="font-serif text-[13px] text-[var(--ink)]">
                  Unsplash search isn&rsquo;t set up.
                </p>
                <p className="max-w-xs font-mono text-[11px] leading-relaxed text-[var(--ink-muted)]">
                  Set <span className="text-[var(--ink)]">UNSPLASH_ACCESS_KEY</span> on the
                  server to search photos. You can still paste a direct image URL from the
                  &ldquo;Image URL&rdquo; tab.
                </p>
              </div>
            ) : loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 size={18} strokeWidth={1.75} className="animate-spin text-[var(--ink-muted)]" />
              </div>
            ) : results.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-10 text-center">
                <ImageIcon size={22} strokeWidth={1.25} className="text-[var(--ink-muted)]" />
                <p className="font-mono text-[11px] text-[var(--ink-muted)]">
                  {query.trim() ? "No photos found." : "Search for a cover photo."}
                </p>
              </div>
            ) : (
              <div className="grid max-h-[340px] grid-cols-3 gap-2 overflow-y-auto pr-1">
                {results.map((photo) => (
                  <button
                    key={photo.id}
                    type="button"
                    onClick={() => handlePickPhoto(photo)}
                    title={`Photo by ${photo.authorName} on Unsplash`}
                    className="group relative aspect-[3/2] overflow-hidden rounded-sm border border-[var(--edge)] transition-colors hover:border-[var(--accent)] focus:outline-none focus-visible:border-[var(--accent)] cursor-pointer"
                  >
                    {/* Grid thumbnails use a plain img (not next/image) — they're
                        small, ephemeral, and avoid per-thumb optimizer round-trips. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={photo.thumbUrl}
                      alt={photo.alt}
                      loading="lazy"
                      className="h-full w-full object-cover"
                    />
                    <span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/70 to-transparent px-1.5 pb-1 pt-3 text-left text-[9px] font-mono text-white/90 opacity-0 transition-opacity group-hover:opacity-100">
                      {photo.authorName}
                    </span>
                  </button>
                ))}
              </div>
            )}

            <p className="font-mono text-[10px] text-[var(--ink-muted)]">
              Photos from Unsplash. Selecting one credits the photographer.
            </p>
          </TabsContent>

          {/* ── Image URL tab ────────────────────────────────────────────── */}
          <TabsContent value="url" className="mt-3 flex flex-col gap-3">
            <label
              htmlFor="cover-url-input"
              className="font-mono text-[11px] uppercase tracking-wide text-[var(--ink-muted)]"
            >
              Image URL
            </label>
            <Input
              id="cover-url-input"
              type="url"
              inputMode="url"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleSubmitUrl();
                }
              }}
              placeholder="https://example.com/banner.jpg"
            />
            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleSubmitUrl}
                disabled={!urlInput.trim()}
                className="rounded-sm border border-[var(--edge)] px-3 py-1.5 font-serif text-[13px] text-[var(--ink)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
              >
                Set cover
              </button>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
