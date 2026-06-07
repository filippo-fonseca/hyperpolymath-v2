"use client";

/**
 * Voice surface migration (Phase 14 follow-up): the browser is now a
 * read-only feed of JARVIS activity. ALL voice IO — microphone, wake-word,
 * VAD, and TTS playback — lives in the desktop app.
 *
 * This component used to route between JarvisListener (Phase 7 ambient FSM)
 * and PhysicalExtensionRecorder (event-driven wake recorder), gated by a
 * desktopClaimed hard guard. With the migration, there is no browser-side
 * mic at all, so this component renders nothing.
 *
 * JarvisConsole still subscribes to /api/jarvis/physical/events for
 * jarvis-response-* SSE chunks so the browser displays JARVIS's responses
 * as a chat feed — just without ever calling getUserMedia.
 *
 * Typed input (JarvisInput) still works as before via the cookie-auth
 * /api/jarvis route.
 */
export function JarvisListenerMount() {
  return null;
}
