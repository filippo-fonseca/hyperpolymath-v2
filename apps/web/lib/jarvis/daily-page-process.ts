/**
 * Shared marker for the Daily Page "process this page" action.
 *
 * The Daily Page process button (PageDetailClient) sends this exact prompt
 * through the in-document JARVIS route, which persists it as the user turn's
 * `text`. The JARVIS console reads the same constant to recognize those turns
 * and badge them with a "Daily Page" pill instead of echoing the raw
 * instruction. Keeping the string in one place is what makes that match
 * reliable without a dedicated DB column.
 */
export const DAILY_PAGE_PROCESS_PROMPT =
  "Process this daily page: extract tasks, events, and captures and create them.";

/** True when a persisted user turn originated from the Daily Page process button. */
export function isDailyPageProcessText(text: string | null | undefined): boolean {
  return text?.trim() === DAILY_PAGE_PROCESS_PROMPT;
}
