import type { Result } from '@/lib/integrations/result';
import type { DailyUsage } from '@/lib/integrations/claude-code/usage';
import type {
  Activity,
  WeeklyStats,
} from '@/lib/integrations/strava/activities';
import type { Session } from '@/lib/integrations/flow/sessions';
import { GithubHeatmapPanel } from './GithubHeatmapPanel';
import { ClaudeCodePanel } from './ClaudeCodePanel';
import { StravaPanel } from './StravaPanel';
import { FlowPanel } from './FlowPanel';

/**
 * LifeTabPanel composes the four life panels (260607-h2k, Task 13).
 *
 * GitHub is NOT in the prop bag — react-github-calendar self-fetches client-side
 * from the jogruber proxy. The other three integrations fetch server-side in
 * page.tsx's Promise.all and pass their Results down.
 */

interface Props {
  claudeCode: Result<DailyUsage[]>;
  strava: Result<{ activities: Activity[]; weeklyStats: WeeklyStats[] }>;
  flow: Result<Session[]>;
  githubUsername: string | null;
}

export function LifeTabPanel({
  claudeCode,
  strava,
  flow,
  githubUsername,
}: Props) {
  return (
    <div className="flex flex-col gap-6 lg:grid lg:grid-cols-2">
      <div className="lg:col-span-2">
        <GithubHeatmapPanel username={githubUsername} />
      </div>
      <ClaudeCodePanel result={claudeCode} />
      <StravaPanel result={strava} />
      <div className="lg:col-span-2">
        <FlowPanel result={flow} />
      </div>
    </div>
  );
}
