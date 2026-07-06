// Issue #221 — shared types for the link-preview subsystem. Single-sourced here
// and imported type-only by the Drizzle schema (linkPreviews.providerData) so the
// jsonb column is typed without a circular import.
import { z } from "zod";

export type LinkPreviewMediaType = "generic" | "youtube" | "twitter";

export type LinkPreviewStatus = "pending" | "ok" | "error";

// Media-specific extras persisted alongside the generic OG fields. Every field is
// optional so partial fetches still store what they could resolve.
export interface LinkPreviewProviderData {
  // YouTube
  youtubeVideoId?: string;
  youtubeChannel?: string;
  youtubeThumbnailUrl?: string;
  // X / Twitter — persisted so the tweet survives deletion/going private.
  tweetText?: string;
  tweetAuthor?: string;
  tweetAuthorHandle?: string;
  // Generic oEmbed provider name, when discovered.
  oembedProvider?: string;
}

// The normalized result of a fetch, independent of persistence. `null`-ish fields
// mean "could not resolve"; the caller degrades gracefully.
export interface LinkPreviewResult {
  url: string;
  status: LinkPreviewStatus;
  mediaType: LinkPreviewMediaType;
  title: string | null;
  description: string | null;
  imageUrl: string | null;
  faviconUrl: string | null;
  siteName: string | null;
  providerData: LinkPreviewProviderData | null;
  error: string | null;
}

// Wire schema for the API route response (one preview record the client renders).
export const zLinkPreviewRecord = z.object({
  url: z.string(),
  status: z.enum(["pending", "ok", "error"]),
  mediaType: z.enum(["generic", "youtube", "twitter"]).nullable(),
  title: z.string().nullable(),
  description: z.string().nullable(),
  imageUrl: z.string().nullable(),
  faviconUrl: z.string().nullable(),
  siteName: z.string().nullable(),
  providerData: z
    .object({
      youtubeVideoId: z.string().optional(),
      youtubeChannel: z.string().optional(),
      youtubeThumbnailUrl: z.string().optional(),
      tweetText: z.string().optional(),
      tweetAuthor: z.string().optional(),
      tweetAuthorHandle: z.string().optional(),
      oembedProvider: z.string().optional(),
    })
    .nullable(),
});

export type LinkPreviewRecord = z.infer<typeof zLinkPreviewRecord>;
