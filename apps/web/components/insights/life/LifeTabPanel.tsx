import type { Result } from '@/lib/integrations/result';
import type { StravaData } from '@/lib/integrations/strava/types';
import type { Session } from '@/lib/integrations/flow/sessions';
import { GithubHeatmapPanel } from './GithubHeatmapPanel';
import { StravaPanel } from './StravaPanel';
import { FlowPanel } from './FlowPanel';

/**
 * LifeTabPanel composes the life panels (260607-h2k, Task 13).
 *
 * GitHub is NOT in the prop bag — react-github-calendar self-fetches client-side
 * from the jogruber proxy. The remaining integrations fetch server-side in
 * page.tsx's Promise.all and pass their Results down.
 *
 * 260616-g0y: the Claude Code daily panel moved to the owner-only DEVELOPMENT
 * tab, so LIFE no longer renders it. GitHub, Strava, and Flow re-flow full-width
 * cleanly without it.
 */

interface Props {
  strava: Result<StravaData>;
  flow: Result<Session[]>;
  githubUsername: string | null;
}

export function LifeTabPanel({ strava, flow, githubUsername }: Props) {
  return (
    <div className="flex flex-col gap-6">
      <GithubHeatmapPanel username={githubUsername} />
      <StravaPanel result={strava} />
      <FlowPanel result={flow} />
    </div>
  );
}
