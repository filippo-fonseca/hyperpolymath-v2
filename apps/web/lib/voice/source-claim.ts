export const SOURCE_CLAIM_TTL_MS = 30_000;

const g = globalThis as unknown as { __jarvisVoiceSourceLastClaimedAt?: number | null };

function getLast(): number | null {
  return g.__jarvisVoiceSourceLastClaimedAt ?? null;
}

function setLast(v: number | null): void {
  g.__jarvisVoiceSourceLastClaimedAt = v;
}

export function claimVoiceSource(): void {
  setLast(Date.now());
}

export function getVoiceSourceStatus(): { claimed: boolean; expiresIn: number } {
  const last = getLast();
  if (last === null) return { claimed: false, expiresIn: 0 };
  const age = Date.now() - last;
  if (age >= SOURCE_CLAIM_TTL_MS) return { claimed: false, expiresIn: 0 };
  return { claimed: true, expiresIn: SOURCE_CLAIM_TTL_MS - age };
}

export function _resetVoiceSourceForTests(): void {
  setLast(null);
}
