"use client";

import { usePhysicalExtension } from "@/lib/voice/physical-extension/use-physical-extension";

/**
 * Always-on subscriber to the JARVIS physical-extension SSE stream.
 *
 * Before the voice-everywhere migration, this hook double-purposed: it
 * activated the BROWSER mic on wake triggers AND forwarded JARVIS response
 * chunks to the scrollback. The mic activation was gated by a localStorage
 * flag (jarvis-physical-extension-enabled, default false), so the SSE feed
 * only connected when the user had opted into browser-side voice.
 *
 * Post-migration the browser never opens its mic — desktop owns audio I/O
 * end-to-end. But the SSE channel is the ONLY way browser tabs see
 * desktop-initiated transcripts + streaming assistant responses + tool-
 * call receipts in real time. Gating it on the legacy mic flag means a
 * fresh user (or anyone who never toggled the setting) silently misses
 * every desktop-spoken turn in the browser.
 *
 * We always mount the listener now. handleTrigger inside the hook already
 * guards against activating the (defunct) browser mic when desktop owns
 * the voice-source claim, so always-on is safe.
 */
export function PhysicalExtensionListener(): null {
  usePhysicalExtension(true);
  return null;
}
