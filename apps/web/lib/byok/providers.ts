/**
 * BYOK provider registry — the single source of truth for which third-party
 * paid services each user must supply their own API key for.
 *
 * Going public, the owner no longer ships these keys for everyone (that billed
 * the owner's accounts for every user's usage). Each user enters their own key
 * in Settings; the server resolves it per-request.
 *
 * Pure data only (no node:crypto / DB imports) so this is safe to import from
 * client components (Settings panel, onboarding step) as well as the server.
 */

export type ByokProvider = "anthropic" | "groq" | "elevenlabs";

export interface ByokProviderMeta {
  id: ByokProvider;
  /** Human label for the Settings/onboarding UI. */
  label: string;
  /** One-line description of what this key powers. */
  powers: string;
  /** Where the user goes to create the key. */
  consoleUrl: string;
  /** Expected key prefix for light client-side validation (empty = no fixed prefix). */
  keyPrefix: string;
  /** Whether the feature set is unusable without this key (vs. optional). */
  required: boolean;
}

export const BYOK_PROVIDERS: Record<ByokProvider, ByokProviderMeta> = {
  anthropic: {
    id: "anthropic",
    label: "Anthropic",
    powers: "JARVIS — the natural-language agent at the core of the app",
    consoleUrl: "https://console.anthropic.com/settings/keys",
    keyPrefix: "sk-ant-",
    required: true,
  },
  groq: {
    id: "groq",
    label: "Groq",
    powers: "Speech-to-text — transcribing your voice into JARVIS turns",
    consoleUrl: "https://console.groq.com/keys",
    keyPrefix: "gsk_",
    required: false,
  },
  elevenlabs: {
    id: "elevenlabs",
    label: "ElevenLabs",
    powers: "Text-to-speech — JARVIS speaking responses back to you",
    consoleUrl: "https://elevenlabs.io/app/settings/api-keys",
    keyPrefix: "",
    required: false,
  },
};

export const BYOK_PROVIDER_IDS = Object.keys(BYOK_PROVIDERS) as ByokProvider[];

export function isByokProvider(value: unknown): value is ByokProvider {
  return typeof value === "string" && value in BYOK_PROVIDERS;
}

/** last-4 fingerprint shown in the UI so a user can recognize which key is saved. */
export function keyLast4(plaintext: string): string {
  return plaintext.slice(-4);
}
