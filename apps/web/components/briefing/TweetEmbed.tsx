"use client";

import { Tweet } from "react-tweet";

/**
 * Renders a real X/Twitter post inline via react-tweet (Vercel's keyless
 * syndication-API renderer — no widget script, no auth). We theme it to the
 * briefing's dark surface. If the tweet is deleted/unavailable, react-tweet
 * shows its own graceful fallback.
 */
export function TweetEmbed({ id }: { id: string }) {
  return (
    <div className="briefing-tweet mt-3 [&_.react-tweet-theme]:my-0" data-theme="dark">
      <Tweet id={id} />
    </div>
  );
}
