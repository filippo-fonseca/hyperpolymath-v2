import type {
  BriefingData,
  BriefingItem,
  BriefingModelWatch,
  BriefingSection,
} from "@/lib/briefing";
import { cn } from "@/lib/utils";
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  Brain,
  CalendarClock,
  Cpu,
  Dna,
  FlaskConical,
  Gauge,
  Megaphone,
  Newspaper,
  Radio,
  Scale,
  Sparkles,
} from "lucide-react";

const categoryLabels: Record<BriefingItem["category"], string> = {
  frontier_ai: "Frontier",
  research: "Research",
  policy: "Policy",
  labs: "Labs",
  semiconductors: "Chips",
  benchmarks: "Benchmarks",
  bio: "Bio",
  creators: "Creators",
  markets: "Markets",
};

const categoryClass: Record<BriefingItem["category"], string> = {
  frontier_ai: "text-[var(--hud-cyan)]",
  research: "text-emerald-500",
  policy: "text-amber-500",
  labs: "text-sky-500",
  semiconductors: "text-fuchsia-500",
  benchmarks: "text-rose-500",
  bio: "text-lime-500",
  creators: "text-indigo-500",
  markets: "text-orange-500",
};

export function BriefingPage({ data }: { data: BriefingData }) {
  const freshness = formatDateTime(data.generatedAt);
  const synthesis = data.synthesis;

  return (
    <div className="min-h-screen bg-[var(--canvas)] px-6 py-8 md:px-8 md:py-10">
      <main className="mx-auto flex max-w-7xl flex-col gap-7">
        <header className="flex flex-col gap-4 border-b border-[var(--edge)] pb-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--ink-muted)]">
              <Radio size={13} strokeWidth={1.7} />
              <span>Daily Frontier Radar</span>
            </div>
            <h1 className="font-serif text-4xl font-semibold tracking-tight text-[var(--ink)] md:text-5xl">
              Briefing
            </h1>
            <p className="max-w-3xl font-serif text-base leading-7 text-[var(--ink-muted)]">
              Frontier AI, research, policy, top labs, semiconductors, bio, creator discourse, model
              rumors, and benchmark motion from public feeds.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 text-left sm:grid-cols-4 lg:min-w-[520px]">
            <Metric label="Sources" value={String(data.sourceCount)} icon={Newspaper} />
            <Metric label="Items" value={String(data.items.length)} icon={Activity} />
            <Metric
              label="Synthesis"
              value={synthesis.mode === "openai" ? "OpenAI" : "Local"}
              icon={Sparkles}
            />
            <Metric label="Updated" value={freshness.short} icon={CalendarClock} />
          </div>
        </header>

        <section className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
          <Panel title="Signal" icon={Brain} tone="cyan">
            <ul className="space-y-3">
              {synthesis.summary.map((bullet) => (
                <li key={bullet} className="flex gap-3 text-sm leading-6 text-[var(--ink)]">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--hud-cyan)]" />
                  <span>{bullet}</span>
                </li>
              ))}
            </ul>
            <div className="mt-5 flex flex-wrap gap-2">
              <ConfigPill label="Planner" value={data.config.plannerModel} />
              <ConfigPill label="Executor" value={data.config.executorModel} />
              <ConfigPill
                label="OpenAI key"
                value={data.config.openaiConfigured ? "configured" : "missing"}
              />
            </div>
          </Panel>

          <Panel title="Upcoming / Rumored Models" icon={Megaphone} tone="amber">
            {synthesis.upcomingModels.length > 0 ? (
              <div className="space-y-3">
                {synthesis.upcomingModels.map((model) => (
                  <ModelWatch key={`${model.name}-${model.url}`} model={model} />
                ))}
              </div>
            ) : (
              <EmptyLine text="No evidence-backed model rumors or launch signals in the current feed window." />
            )}
          </Panel>
        </section>

        <section className="grid gap-4 xl:grid-cols-3">
          <BriefingSectionPanel section={synthesis.topStories} icon={FlaskConical} tone="cyan" />
          <BriefingSectionPanel section={synthesis.benchmarkWatch} icon={Gauge} tone="rose" />
          <BriefingSectionPanel section={synthesis.creatorPulse} icon={Sparkles} tone="indigo" />
          <BriefingSectionPanel section={synthesis.policyWatch} icon={Scale} tone="amber" />
          <BriefingSectionPanel section={synthesis.semiconductorWatch} icon={Cpu} tone="fuchsia" />
          <BriefingSectionPanel section={synthesis.bioWatch} icon={Dna} tone="emerald" />
        </section>

        <section className="grid gap-4 lg:grid-cols-[1fr_360px]">
          <Panel title="Source Feed" icon={Newspaper} tone="neutral">
            <div className="divide-y divide-[var(--edge)]">
              {data.items.slice(0, 36).map((item) => (
                <SourceRow key={item.id} item={item} />
              ))}
            </div>
          </Panel>

          <div className="space-y-4">
            <Panel title="Blindspots" icon={AlertTriangle} tone="amber">
              <ul className="space-y-2">
                {synthesis.blindspots.map((blindspot) => (
                  <li key={blindspot} className="text-sm leading-6 text-[var(--ink-muted)]">
                    {blindspot}
                  </li>
                ))}
              </ul>
            </Panel>

            <Panel title="Source Health" icon={Activity} tone="neutral">
              {data.failedSources.length > 0 ? (
                <div className="space-y-2">
                  {data.failedSources.map((failure) => (
                    <div
                      key={failure.source}
                      className="rounded-md border border-[var(--edge)] p-3"
                    >
                      <div className="font-serif text-sm text-[var(--ink)]">{failure.source}</div>
                      <div className="mt-1 font-mono text-[11px] text-[var(--ink-muted)]">
                        {failure.error}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyLine text="All configured public sources responded." />
              )}
            </Panel>
          </div>
        </section>
      </main>
    </div>
  );
}

function Metric({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
}) {
  return (
    <div className="rounded-md border border-[var(--edge)] bg-[var(--surface)] px-3 py-2">
      <div className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--ink-muted)]">
        <Icon size={12} strokeWidth={1.7} />
        <span>{label}</span>
      </div>
      <div className="mt-1 truncate font-serif text-lg text-[var(--ink)]">{value}</div>
    </div>
  );
}

function Panel({
  title,
  icon: Icon,
  tone,
  children,
}: {
  title: string;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
  tone: "cyan" | "amber" | "rose" | "indigo" | "fuchsia" | "emerald" | "neutral";
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-md border border-[var(--edge)] bg-[var(--surface)] p-4 shadow-[0_1px_2px_color-mix(in_oklch,var(--ink)_7%,transparent)]">
      <div className="mb-4 flex items-center gap-2">
        <Icon size={16} strokeWidth={1.7} className={toneClass(tone)} />
        <h2 className="font-serif text-lg font-medium text-[var(--ink)]">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function BriefingSectionPanel({
  section,
  icon,
  tone,
}: {
  section: BriefingSection;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
  tone: "cyan" | "amber" | "rose" | "indigo" | "fuchsia" | "emerald" | "neutral";
}) {
  return (
    <Panel title={section.title} icon={icon} tone={tone}>
      {section.bullets.length > 0 ? (
        <div className="space-y-3">
          {section.bullets.slice(0, 5).map((bullet) => (
            <p key={bullet} className="text-sm leading-6 text-[var(--ink)]">
              {bullet}
            </p>
          ))}
          {section.items.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-2">
              {section.items.slice(0, 3).map((item) => (
                <a
                  key={item.id}
                  href={item.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex max-w-full items-center gap-1 rounded-md border border-[var(--edge)] px-2 py-1 font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--ink-muted)] hover:text-[var(--ink)]"
                >
                  <span className="truncate">{item.source}</span>
                  <ArrowUpRight size={11} strokeWidth={1.8} />
                </a>
              ))}
            </div>
          )}
        </div>
      ) : (
        <EmptyLine text="No strong signal in this category yet." />
      )}
    </Panel>
  );
}

function ModelWatch({ model }: { model: BriefingModelWatch }) {
  return (
    <a
      href={model.url}
      target="_blank"
      rel="noreferrer"
      className="block rounded-md border border-[var(--edge)] p-3 transition-colors hover:border-[var(--edge-hud)]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate font-serif text-base text-[var(--ink)]">{model.name}</div>
          <div className="mt-1 text-sm leading-5 text-[var(--ink-muted)]">{model.evidence}</div>
        </div>
        <span className="shrink-0 rounded-md border border-[var(--edge)] px-2 py-1 font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--ink-muted)]">
          {model.status}
        </span>
      </div>
      <div className="mt-2 flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--ink-muted)]">
        <span>{model.source}</span>
        <ArrowUpRight size={11} strokeWidth={1.8} />
      </div>
    </a>
  );
}

function SourceRow({ item }: { item: BriefingItem }) {
  const date = formatDateTime(item.publishedAt);
  return (
    <article className="grid gap-3 py-4 md:grid-cols-[140px_1fr]">
      <div className="space-y-1">
        <div
          className={cn(
            "font-mono text-[10px] uppercase tracking-[0.1em]",
            categoryClass[item.category]
          )}
        >
          {categoryLabels[item.category]}
        </div>
        <div className="font-mono text-[11px] text-[var(--ink-muted)]">{date.long}</div>
      </div>
      <div className="min-w-0">
        <a
          href={item.url}
          target="_blank"
          rel="noreferrer"
          className="group inline-flex max-w-full items-start gap-2 font-serif text-base leading-6 text-[var(--ink)] hover:text-[var(--hud-cyan)]"
        >
          <span>{item.title}</span>
          <ArrowUpRight
            size={13}
            strokeWidth={1.8}
            className="mt-1 shrink-0 opacity-45 group-hover:opacity-100"
          />
        </a>
        {item.summary && (
          <p className="mt-1 line-clamp-2 text-sm leading-6 text-[var(--ink-muted)]">
            {item.summary}
          </p>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--ink-muted)]">
            {item.source}
          </span>
          {item.tags.slice(0, 4).map((tag) => (
            <span
              key={tag}
              className="rounded-md border border-[var(--edge)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--ink-muted)]"
            >
              {tag}
            </span>
          ))}
        </div>
      </div>
    </article>
  );
}

function ConfigPill({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-[var(--edge)] px-2 py-1 font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--ink-muted)]">
      <span>{label}</span>
      <span className="truncate text-[var(--ink)]">{value}</span>
    </span>
  );
}

function EmptyLine({ text }: { text: string }) {
  return <p className="text-sm leading-6 text-[var(--ink-muted)]">{text}</p>;
}

function toneClass(tone: "cyan" | "amber" | "rose" | "indigo" | "fuchsia" | "emerald" | "neutral") {
  switch (tone) {
    case "cyan":
      return "text-[var(--hud-cyan)]";
    case "amber":
      return "text-amber-500";
    case "rose":
      return "text-rose-500";
    case "indigo":
      return "text-indigo-500";
    case "fuchsia":
      return "text-fuchsia-500";
    case "emerald":
      return "text-emerald-500";
    default:
      return "text-[var(--ink-muted)]";
  }
}

function formatDateTime(value: string | null): { short: string; long: string } {
  if (!value) return { short: "unknown", long: "unknown" };
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return { short: "unknown", long: "unknown" };

  return {
    short: new Intl.DateTimeFormat("en", {
      month: "short",
      day: "numeric",
      hour: "numeric",
    }).format(date),
    long: new Intl.DateTimeFormat("en", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(date),
  };
}
