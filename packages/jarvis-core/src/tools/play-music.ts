// Computer-control tool: play_music
//
// Server validates input and returns a structured action for the desktop
// client to execute (AppleScript against Music / Spotify). No side effects
// on the server side.
//
// NON-strict (grammar budget): server-side Zod validation covers this.

import { z } from "zod";
import { toJsonSchema } from "./_schema-utils";

export const PlayMusicInputSchema = z
  .object({
    app: z
      .enum(["music", "spotify"])
      .optional()
      .describe("Which player to control. Defaults to 'music' (Apple Music)."),
    query: z
      .string()
      .optional()
      .describe(
        "Song, artist, album, or playlist to play. Omit to simply resume playback.",
      ),
  })
  .strict();

export type PlayMusicInput = z.infer<typeof PlayMusicInputSchema>;

export const playMusicTool = {
  name: "play_music" as const,
  description:
    "Play music on the user's Mac via Apple Music (default) or Spotify. Provide `query` to play a specific song/artist/playlist, or omit it to resume playback. ALWAYS use this for music — never open_app or run_applescript for playing music.",
  input_schema: toJsonSchema(PlayMusicInputSchema),
};
