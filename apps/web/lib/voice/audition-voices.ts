/**
 * Phase 7 Plan 07-02 — audition voice shortlist.
 *
 * Shared between EnableVoiceModal (initial pick) and VoiceIdPicker
 * (settings change after first enable). Posh is the front-runner for
 * canon-fit per RESEARCH §D-03; final pick deferred to live audition.
 */

export interface AuditionVoice {
  id: string;
  name: string;
  desc: string;
}

export const AUDITION_VOICES: AuditionVoice[] = [
  {
    id: "EXAVITQu4vr4xnSDxMaL",
    name: "Posh",
    desc: "Theatrical butler — canon-fit (front-runner)",
  },
  {
    id: "JBFqnCBsd6RMkjVDRZzb",
    name: "George",
    desc: "Warm, articulate British male",
  },
  {
    id: "ThT5KcBeYPX3keUQqHPh",
    name: "Dorothy",
    desc: "Wild-card option — distinctive register",
  },
];

/** Sample line used for audition playback (short; representative of JARVIS register). */
export const AUDITION_LINE = "Very good, sir. Shall we proceed?";
