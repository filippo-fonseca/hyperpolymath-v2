"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import {
  PenLine,
  ListChecks,
  CalendarDays,
  ArrowLeft,
  Github,
  Sparkles,
  User,
  Eye,
  KeyRound,
  Check,
  ExternalLink,
  Loader2,
} from "lucide-react";
import { completeOnboarding } from "@/app/(app)/onboarding/actions";
import { HudCoreBubble } from "@/components/shared/HudCoreBubble";
import {
  BYOK_PROVIDER_IDS,
  BYOK_PROVIDERS,
  type ByokProvider,
} from "@/lib/byok/providers";
import { saveApiKey } from "@/app/actions/api-keys";

interface Props {
  initialDisplayName: string;
  email: string;
}

type Step = "welcome" | "you" | "keys" | "glimpse";

const STEP_ORDER: Step[] = ["welcome", "you", "keys", "glimpse"];
const TOTAL_STEPS = STEP_ORDER.length;
const STEP_INDEX: Record<Step, number> = {
  welcome: 0,
  you: 1,
  keys: 2,
  glimpse: 3,
};

const STEP_META: Record<
  Step,
  { icon: React.ComponentType<{ className?: string; size?: number; strokeWidth?: number; style?: React.CSSProperties }>; label: string }
> = {
  welcome: { icon: Sparkles, label: "Welcome" },
  you: { icon: User, label: "About you" },
  keys: { icon: KeyRound, label: "API keys" },
  glimpse: { icon: Eye, label: "Glimpse" },
};

export function OnboardingFlow({ initialDisplayName, email }: Props) {
  const [step, setStep] = useState<Step>("welcome");
  const [displayName, setDisplayName] = useState(initialDisplayName);
  const [graduationYear, setGraduationYear] = useState<string>("");
  const [githubUsername, setGithubUsername] = useState<string>("");
  const [timezone, setTimezone] = useState<string>("UTC");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);

  useEffect(() => {
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (tz) setTimezone(tz);
    } catch {
      // Older browsers throw; UTC fallback is fine.
    }
  }, []);

  const canAdvanceFromYou = displayName.trim().length > 0;
  const stepIdx = STEP_INDEX[step];

  function handleSubmit() {
    if (!formRef.current) return;
    const fd = new FormData(formRef.current);
    setError(null);
    // Signal the tour to run after onboarding redirects to /lifeos.
    try {
      localStorage.setItem("hp_tour_pending", "1");
    } catch {
      // storage unavailable; tour simply won't run
    }
    startTransition(async () => {
      try {
        await completeOnboarding(fd);
      } catch (e) {
        if (e instanceof Error && !/NEXT_REDIRECT/.test(e.message)) {
          setError(e.message);
        }
      }
    });
  }

  return (
    <div className="w-full max-w-2xl">
      {/* ── Progress breadcrumbs ── */}
      <div className="flex items-center justify-between mb-8">
        {/* Step breadcrumb dots */}
        <div className="flex items-center gap-2">
          {STEP_ORDER.map((s, i) => {
            const Meta = STEP_META[s];
            const Icon = Meta.icon;
            const isCurrent = s === step;
            const isDone = STEP_INDEX[s] < stepIdx;
            return (
              <div key={s} className="flex items-center gap-2">
                <div
                  className="flex items-center gap-1.5 transition-all duration-300"
                  style={{
                    opacity: isCurrent ? 1 : isDone ? 0.65 : 0.35,
                  }}
                >
                  <span
                    className="inline-flex items-center justify-center rounded-full transition-all duration-300"
                    style={{
                      width: 22,
                      height: 22,
                      background: isCurrent
                        ? "linear-gradient(135deg, var(--ink-violet) 0%, var(--ink-blue) 100%)"
                        : isDone
                          ? "color-mix(in oklch, var(--ink-violet) 22%, transparent)"
                          : "color-mix(in oklch, var(--ink) 8%, transparent)",
                      boxShadow: isCurrent
                        ? "0 0 12px color-mix(in oklch, var(--ink-violet) 35%, transparent), inset 0 1px 0 oklch(100% 0 0 / 0.25)"
                        : "none",
                    }}
                  >
                    <Icon
                      size={10}
                      strokeWidth={2}
                      className="shrink-0"
                      style={{
                        color: isCurrent
                          ? "oklch(100% 0 0)"
                          : isDone
                            ? "var(--ink-violet)"
                            : "var(--ink-muted)",
                      }}
                    />
                  </span>
                  {isCurrent && (
                    <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--ink-muted)]">
                      {Meta.label}
                    </span>
                  )}
                </div>
                {i < TOTAL_STEPS - 1 && (
                  <span
                    className="w-6 h-px transition-colors duration-300"
                    style={{
                      background: isDone
                        ? "linear-gradient(90deg, var(--ink-violet), var(--ink-blue))"
                        : "var(--edge)",
                    }}
                  />
                )}
              </div>
            );
          })}
        </div>

        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--ink-muted)]">
          {String(stepIdx + 1).padStart(2, "0")}&thinsp;/&thinsp;{String(TOTAL_STEPS).padStart(2, "0")}
        </p>
      </div>

      {/* ── Progress bar ── */}
      <div
        className="h-[2px] w-full rounded-full mb-10 relative overflow-hidden"
        style={{ background: "var(--edge)" }}
        aria-hidden="true"
      >
        <span
          className="absolute inset-y-0 left-0 rounded-full transition-all duration-500"
          style={{
            width: `${((stepIdx + 1) / TOTAL_STEPS) * 100}%`,
            background: "linear-gradient(90deg, var(--ink-violet) 0%, var(--ink-blue) 100%)",
            boxShadow: "0 0 8px color-mix(in oklch, var(--ink-violet) 40%, transparent)",
          }}
        />
      </div>

      {/* ── Main card ── */}
      <div
        className="glass-tile rounded-[20px] relative overflow-hidden"
        style={{
          /* Override the default glass-tile glow color toward violet/pink */
          ["--glass-glow-color" as string]: "var(--ink-violet)",
        }}
      >
        {/* Ambient gradient blobs — pink top-left, blue bottom-right */}
        <div
          aria-hidden="true"
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(600px circle at 10% 0%, color-mix(in oklch, var(--ink-violet) 6%, transparent), transparent 55%), radial-gradient(500px circle at 90% 100%, color-mix(in oklch, var(--ink-blue) 5%, transparent), transparent 50%)",
          }}
        />

        <div className="relative px-10 py-10">
          {/* ── Step: Welcome ── */}
          {step === "welcome" && (
            <section className="space-y-10">
              {/* HudCoreBubble as the hero focal point. Sized directly (not via
                  a parent scale transform) so its real layout box clears the
                  "Your life OS is ready" pill below it. */}
              <div className="flex justify-center select-none">
                <HudCoreBubble state="thinking" size={150} />
              </div>

              <div className="space-y-4 text-center">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full font-mono text-[10px] uppercase tracking-[0.18em] mb-2"
                  style={{
                    background: "linear-gradient(135deg, color-mix(in oklch, var(--ink-violet) 12%, transparent), color-mix(in oklch, var(--ink-blue) 10%, transparent))",
                    border: "1px solid color-mix(in oklch, var(--ink-violet) 22%, transparent)",
                    color: "var(--ink-violet)",
                  }}
                >
                  <Sparkles size={9} strokeWidth={2} />
                  Your life OS is ready
                </div>

                <h1
                  className="font-serif font-semibold leading-[1.05] tracking-[-0.02em] text-[var(--ink)]"
                  style={{ fontSize: "clamp(2.25rem, 6vw, 3.5rem)" }}
                >
                  Welcome to
                  <br />
                  <span
                    style={{
                      background: "linear-gradient(135deg, var(--ink-violet) 0%, var(--ink-blue) 100%)",
                      WebkitBackgroundClip: "text",
                      WebkitTextFillColor: "transparent",
                      backgroundClip: "text",
                    }}
                  >
                    Hyperpolymath.
                  </span>
                </h1>

                <p className="font-serif italic text-[var(--ink-muted)] leading-relaxed mx-auto max-w-md"
                  style={{ fontSize: "clamp(1rem, 2.5vw, 1.2rem)" }}
                >
                  One line in. JARVIS routes it to the right place: a task, a capture, or
                  a calendar event.
                </p>
              </div>

              {/* Feature pills */}
              <div className="flex flex-wrap gap-2 justify-center">
                {[
                  { label: "Natural language tasks", color: "var(--ink-violet)" },
                  { label: "AI-powered captures", color: "var(--ink-blue)" },
                  { label: "Google Calendar sync", color: "var(--hud-cyan)" },
                ].map(({ label, color }) => (
                  <span
                    key={label}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full font-mono text-[10px] uppercase tracking-[0.1em]"
                    style={{
                      background: `color-mix(in oklch, ${color} 9%, transparent)`,
                      border: `1px solid color-mix(in oklch, ${color} 20%, transparent)`,
                      color,
                    }}
                  >
                    <span
                      className="inline-block rounded-full"
                      style={{ width: 4, height: 4, background: color }}
                      aria-hidden="true"
                    />
                    {label}
                  </span>
                ))}
              </div>

              <div className="flex justify-center pt-2">
                <GlassAccentButton onClick={() => setStep("you")}>
                  Begin setup
                  <ArrowRight />
                </GlassAccentButton>
              </div>
            </section>
          )}

          {/* ── Step: You ── */}
          {step === "you" && (
            <section className="space-y-8">
              <div className="space-y-2">
                <div
                  className="inline-flex items-center gap-2 px-3 py-1 rounded-full font-mono text-[10px] uppercase tracking-[0.18em] mb-1"
                  style={{
                    background: "color-mix(in oklch, var(--ink-violet) 10%, transparent)",
                    border: "1px solid color-mix(in oklch, var(--ink-violet) 20%, transparent)",
                    color: "var(--ink-violet)",
                  }}
                >
                  <User size={9} strokeWidth={2} />
                  Step 2 of 4
                </div>
                <h2
                  className="font-serif font-semibold leading-[1.1] tracking-[-0.02em] text-[var(--ink)]"
                  style={{ fontSize: "clamp(1.75rem, 5vw, 2.75rem)" }}
                >
                  About you.
                </h2>
                <p className="font-serif italic text-[var(--ink-muted)] text-base leading-relaxed">
                  How JARVIS should address you and understand your context.
                </p>
              </div>

              <div className="space-y-5">
                <GlassField label="Preferred name" htmlFor="display_name" accent="violet">
                  <input
                    id="display_name"
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="e.g. Filippo"
                    autoFocus
                    required
                    maxLength={60}
                    className="w-full h-11 px-4 rounded-xl bg-transparent font-serif text-[1rem] text-[var(--ink)] placeholder:text-[var(--ink-muted)] focus:outline-none"
                    style={{
                      background: "color-mix(in oklch, var(--surface) 80%, transparent)",
                      border: "1px solid color-mix(in oklch, var(--edge) 70%, transparent)",
                      boxShadow: "inset 1px 1px 3px color-mix(in oklch, var(--ink) 4%, transparent)",
                      transition: "border-color 150ms ease-out, box-shadow 150ms ease-out",
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = "color-mix(in oklch, var(--ink-violet) 45%, transparent)";
                      e.currentTarget.style.boxShadow = "inset 1px 1px 3px color-mix(in oklch, var(--ink) 4%, transparent), 0 0 0 2px color-mix(in oklch, var(--ink-violet) 15%, transparent)";
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = "color-mix(in oklch, var(--edge) 70%, transparent)";
                      e.currentTarget.style.boxShadow = "inset 1px 1px 3px color-mix(in oklch, var(--ink) 4%, transparent)";
                    }}
                  />
                </GlassField>

                <GlassField label="Graduation year (optional)" htmlFor="graduation_year" accent="blue">
                  <input
                    id="graduation_year"
                    type="text"
                    inputMode="numeric"
                    pattern="\d{4}"
                    value={graduationYear}
                    onChange={(e) =>
                      setGraduationYear(
                        e.target.value.replace(/\D/g, "").slice(0, 4),
                      )
                    }
                    placeholder="e.g. 2028"
                    maxLength={4}
                    className="w-full h-11 px-4 rounded-xl bg-transparent font-serif text-[1rem] text-[var(--ink)] placeholder:text-[var(--ink-muted)] focus:outline-none"
                    style={{
                      background: "color-mix(in oklch, var(--surface) 80%, transparent)",
                      border: "1px solid color-mix(in oklch, var(--edge) 70%, transparent)",
                      boxShadow: "inset 1px 1px 3px color-mix(in oklch, var(--ink) 4%, transparent)",
                      transition: "border-color 150ms ease-out, box-shadow 150ms ease-out",
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = "color-mix(in oklch, var(--ink-blue) 45%, transparent)";
                      e.currentTarget.style.boxShadow = "inset 1px 1px 3px color-mix(in oklch, var(--ink) 4%, transparent), 0 0 0 2px color-mix(in oklch, var(--ink-blue) 15%, transparent)";
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = "color-mix(in oklch, var(--edge) 70%, transparent)";
                      e.currentTarget.style.boxShadow = "inset 1px 1px 3px color-mix(in oklch, var(--ink) 4%, transparent)";
                    }}
                  />
                </GlassField>

                <GlassField label="GitHub username (optional)" htmlFor="github_username" accent="violet">
                  <div
                    className="flex items-stretch rounded-xl overflow-hidden"
                    style={{
                      background: "color-mix(in oklch, var(--surface) 80%, transparent)",
                      border: "1px solid color-mix(in oklch, var(--edge) 70%, transparent)",
                      boxShadow: "inset 1px 1px 3px color-mix(in oklch, var(--ink) 4%, transparent)",
                    }}
                  >
                    <span
                      className="flex items-center gap-1.5 pl-4 pr-3 shrink-0"
                      style={{
                        borderRight: "1px solid color-mix(in oklch, var(--edge) 60%, transparent)",
                        color: "var(--ink-violet)",
                      }}
                    >
                      <Github className="h-3.5 w-3.5" />
                      <span className="font-mono text-[12px] opacity-60">@</span>
                    </span>
                    <input
                      id="github_username"
                      type="text"
                      value={githubUsername}
                      onChange={(e) =>
                        setGithubUsername(
                          e.target.value.replace(/^@/, "").trim(),
                        )
                      }
                      placeholder="octocat"
                      spellCheck={false}
                      autoCapitalize="off"
                      autoCorrect="off"
                      maxLength={39}
                      className="flex-1 h-11 px-4 bg-transparent font-serif text-base text-[var(--ink)] placeholder:text-[var(--ink-muted)] focus:outline-none"
                    />
                  </div>
                </GlassField>

                <GlassField label="Timezone" accent="blue">
                  <div
                    className="flex h-11 items-center rounded-xl px-4"
                    style={{
                      background: "color-mix(in oklch, var(--surface) 80%, transparent)",
                      border: "1px solid color-mix(in oklch, var(--edge) 70%, transparent)",
                      boxShadow: "inset 1px 1px 3px color-mix(in oklch, var(--ink) 4%, transparent)",
                    }}
                  >
                    <span className="font-serif text-base text-[var(--ink)]">{timezone}</span>
                    <span
                      className="ml-auto font-mono text-[9px] uppercase tracking-[0.1em] px-2 py-0.5 rounded-full"
                      style={{
                        color: "var(--ink-blue)",
                        background: "color-mix(in oklch, var(--ink-blue) 10%, transparent)",
                        border: "1px solid color-mix(in oklch, var(--ink-blue) 18%, transparent)",
                      }}
                    >
                      auto-detected
                    </span>
                  </div>
                </GlassField>

                <p
                  className="font-mono text-[10px] uppercase tracking-[0.1em] px-1"
                  style={{ color: "var(--ink-muted)", opacity: 0.7 }}
                >
                  Signed in as {email}
                </p>
              </div>

              <div className="flex items-center justify-between pt-2">
                <GhostBackButton onClick={() => setStep("welcome")} />
                <GlassAccentButton
                  disabled={!canAdvanceFromYou}
                  onClick={() => setStep("keys")}
                >
                  Continue
                  <ArrowRight />
                </GlassAccentButton>
              </div>
            </section>
          )}

          {/* ── Step: API keys ── */}
          {step === "keys" && (
            <section className="space-y-8">
              <div className="space-y-2">
                <div
                  className="inline-flex items-center gap-2 px-3 py-1 rounded-full font-mono text-[10px] uppercase tracking-[0.18em] mb-1"
                  style={{
                    background: "color-mix(in oklch, var(--ink-violet) 10%, transparent)",
                    border: "1px solid color-mix(in oklch, var(--ink-violet) 20%, transparent)",
                    color: "var(--ink-violet)",
                  }}
                >
                  <KeyRound size={9} strokeWidth={2} />
                  Step 3 of 4
                </div>
                <h2
                  className="font-serif font-semibold leading-[1.1] tracking-[-0.02em] text-[var(--ink)]"
                  style={{ fontSize: "clamp(1.75rem, 5vw, 2.75rem)" }}
                >
                  Bring your keys.
                </h2>
                <p className="font-serif italic text-[var(--ink-muted)] text-base leading-relaxed">
                  JARVIS and the voice features run on your own paid API keys, so
                  your usage is billed to you. Keys are encrypted at rest. You can
                  skip and add them later in Settings.
                </p>
              </div>

              <div className="space-y-3">
                {BYOK_PROVIDER_IDS.map((provider) => (
                  <OnboardingKeyRow key={provider} provider={provider} />
                ))}
              </div>

              <div className="flex items-center justify-between pt-2">
                <GhostBackButton onClick={() => setStep("you")} />
                <GlassAccentButton onClick={() => setStep("glimpse")}>
                  Continue
                  <ArrowRight />
                </GlassAccentButton>
              </div>
            </section>
          )}

          {/* ── Step: Glimpse ── */}
          {step === "glimpse" && (
            <section className="space-y-8">
              <div className="space-y-2">
                <div
                  className="inline-flex items-center gap-2 px-3 py-1 rounded-full font-mono text-[10px] uppercase tracking-[0.18em] mb-1"
                  style={{
                    background: "color-mix(in oklch, var(--ink-blue) 10%, transparent)",
                    border: "1px solid color-mix(in oklch, var(--ink-blue) 22%, transparent)",
                    color: "var(--ink-blue)",
                  }}
                >
                  <Eye size={9} strokeWidth={2} />
                  Step 4 of 4
                </div>
                <h2
                  className="font-serif font-semibold leading-[1.1] tracking-[-0.02em] text-[var(--ink)]"
                  style={{ fontSize: "clamp(1.75rem, 5vw, 2.75rem)" }}
                >
                  Try it now.
                </h2>
                <p className="font-serif italic text-[var(--ink-muted)] text-base leading-relaxed">
                  A few lines to paste into JARVIS on your first session.
                </p>
              </div>

              <ul className="space-y-3">
                <ShowcaseCard
                  icon={PenLine}
                  label="Capture"
                  accentColor="var(--ink-violet)"
                  example={'"i’m tired"'}
                  description="Lands in your capture log, verbatim. JARVIS never paraphrases captures."
                />
                <ShowcaseCard
                  icon={ListChecks}
                  label="Plan"
                  accentColor="var(--ink-blue)"
                  example='"remind me to send the brief friday"'
                  description="A task in the right area, due Friday, at the right priority."
                />
                <ShowcaseCard
                  icon={CalendarDays}
                  label="Schedule"
                  accentColor="var(--hud-cyan)"
                  example='"coffee 4pm saturday with brian"'
                  description="Lands on your default Google Calendar."
                />
              </ul>

              {error && (
                <p
                  className="font-serif text-sm px-4 py-3 rounded-xl"
                  style={{
                    color: "var(--ink-coral)",
                    background: "color-mix(in oklch, var(--ink-coral) 8%, transparent)",
                    border: "1px solid color-mix(in oklch, var(--ink-coral) 18%, transparent)",
                  }}
                >
                  {error}
                </p>
              )}

              <form
                ref={formRef}
                action={completeOnboarding}
                className="flex items-center justify-between pt-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSubmit();
                }}
              >
                <input type="hidden" name="display_name" value={displayName} />
                <input type="hidden" name="timezone" value={timezone} />
                <input type="hidden" name="graduation_year" value={graduationYear} />
                <input type="hidden" name="github_username" value={githubUsername} />
                <GhostBackButton onClick={() => setStep("keys")} disabled={isPending} />
                <GlassAccentButton type="submit" disabled={isPending}>
                  {isPending ? "Saving…" : "Enter Hyperpolymath"}
                  {!isPending && <ArrowRight />}
                </GlassAccentButton>
              </form>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Reusable sub-components ── */

function ArrowRight() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      aria-hidden="true"
      className="shrink-0"
    >
      <path
        d="M2 7h10M8 3l4 4-4 4"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function GlassAccentButton({
  children,
  onClick,
  disabled,
  type = "button",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  type?: "button" | "submit";
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className="glass-button inline-flex items-center gap-2 px-6 py-2.5 rounded-xl font-serif text-[0.95rem] font-medium text-[var(--ink)] transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
      style={{ ["--glass-glow-color" as string]: "var(--hud-cyan)" }}
    >
      {children}
    </button>
  );
}

function GhostBackButton({
  onClick,
  disabled,
}: {
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.1em] transition-colors disabled:opacity-40"
      style={{ color: "var(--ink-muted)" }}
      onMouseEnter={(e) => {
        e.currentTarget.style.color = "var(--ink)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.color = "var(--ink-muted)";
      }}
    >
      <ArrowLeft className="w-3.5 h-3.5" />
      Back
    </button>
  );
}

function GlassField({
  label,
  htmlFor,
  accent = "violet",
  children,
}: {
  label: string;
  htmlFor?: string;
  accent?: "violet" | "blue";
  children: React.ReactNode;
}) {
  const accentColor = accent === "violet" ? "var(--ink-violet)" : "var(--ink-blue)";
  return (
    <div className="space-y-1.5">
      <label
        htmlFor={htmlFor}
        className="font-mono text-[10px] uppercase tracking-[0.1em] block"
        style={{ color: accentColor }}
      >
        {label}
      </label>
      {children}
    </div>
  );
}

function OnboardingKeyRow({ provider }: { provider: ByokProvider }) {
  const meta = BYOK_PROVIDERS[provider];
  const accentColor = meta.required ? "var(--ink-violet)" : "var(--ink-blue)";
  const [value, setValue] = useState("");
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSave() {
    setError(null);
    const key = value.trim();
    if (!key) {
      setError("Enter a key first.");
      return;
    }
    startTransition(async () => {
      const res = await saveApiKey(provider, key);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSaved(res.last4);
      setValue("");
    });
  }

  return (
    <div
      className="space-y-2.5 rounded-2xl p-4"
      style={{
        background: `color-mix(in oklch, ${accentColor} 5%, var(--surface))`,
        border: `1px solid color-mix(in oklch, ${accentColor} 18%, transparent)`,
      }}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="font-serif text-base font-semibold text-[var(--ink)]">
            {meta.label}
          </span>
          <span
            className="font-mono text-[9px] uppercase tracking-[0.1em] px-2 py-0.5 rounded-full"
            style={{
              color: accentColor,
              background: `color-mix(in oklch, ${accentColor} 10%, transparent)`,
              border: `1px solid color-mix(in oklch, ${accentColor} 18%, transparent)`,
            }}
          >
            {meta.required ? "Required" : "Optional"}
          </span>
        </div>
        <a
          href={meta.consoleUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.06em] text-[var(--ink-muted)] transition-colors hover:text-[var(--ink)]"
        >
          Get your key
          <ExternalLink className="h-3 w-3" />
        </a>
      </div>

      <p className="font-serif text-sm text-[var(--ink-muted)] leading-relaxed">
        {meta.powers}
      </p>

      {saved ? (
        <div className="flex items-center gap-2 pt-0.5">
          <Check className="h-3.5 w-3.5" style={{ color: accentColor }} />
          <span className="font-mono text-sm tabular-nums text-[var(--ink)]">
            Saved •••• {saved}
          </span>
        </div>
      ) : (
        <div className="flex items-stretch gap-2 pt-0.5">
          <input
            type="password"
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              if (error) setError(null);
            }}
            placeholder={meta.keyPrefix ? `${meta.keyPrefix}…` : "Paste your API key"}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            autoComplete="off"
            className="flex-1 h-10 px-3 rounded-xl bg-transparent font-mono text-sm text-[var(--ink)] placeholder:text-[var(--ink-muted)] focus:outline-none"
            style={{
              background: "color-mix(in oklch, var(--surface) 80%, transparent)",
              border: "1px solid color-mix(in oklch, var(--edge) 70%, transparent)",
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSave();
            }}
          />
          <button
            type="button"
            onClick={handleSave}
            disabled={pending}
            className="inline-flex items-center justify-center gap-1.5 px-4 rounded-xl font-serif text-sm font-medium transition-all disabled:opacity-40"
            style={{
              background: `color-mix(in oklch, ${accentColor} 14%, transparent)`,
              border: `1px solid color-mix(in oklch, ${accentColor} 28%, transparent)`,
              color: accentColor,
            }}
          >
            {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save"}
          </button>
        </div>
      )}

      {error ? (
        <p className="font-serif text-xs text-[var(--ink-coral)]">{error}</p>
      ) : null}
    </div>
  );
}

function ShowcaseCard({
  icon: Icon,
  label,
  accentColor,
  example,
  description,
}: {
  icon: React.ComponentType<{ className?: string; size?: number; strokeWidth?: number }>;
  label: string;
  accentColor: string;
  example: string;
  description: string;
}) {
  return (
    <li
      className="flex items-start gap-4 rounded-2xl p-4 transition-all duration-200"
      style={{
        background: `color-mix(in oklch, ${accentColor} 5%, var(--surface))`,
        border: `1px solid color-mix(in oklch, ${accentColor} 18%, transparent)`,
        boxShadow: `inset 0 1px 0 oklch(100% 0 0 / 0.06), 0 1px 3px color-mix(in oklch, var(--ink) 6%, transparent)`,
      }}
    >
      <div
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
        style={{
          background: `color-mix(in oklch, ${accentColor} 12%, transparent)`,
          border: `1px solid color-mix(in oklch, ${accentColor} 22%, transparent)`,
          boxShadow: `0 0 12px color-mix(in oklch, ${accentColor} 15%, transparent)`,
          color: accentColor,
        }}
      >
        <Icon size={16} strokeWidth={1.75} />
      </div>
      <div className="min-w-0 space-y-1">
        <div className="flex items-baseline gap-3 flex-wrap">
          <span
            className="font-mono text-[9px] uppercase tracking-[0.16em] px-2 py-0.5 rounded-full"
            style={{
              color: accentColor,
              background: `color-mix(in oklch, ${accentColor} 10%, transparent)`,
              border: `1px solid color-mix(in oklch, ${accentColor} 18%, transparent)`,
            }}
          >
            {label}
          </span>
          <span className="font-serif italic text-[var(--ink)] text-sm">
            {example}
          </span>
        </div>
        <p className="font-serif text-sm text-[var(--ink-muted)] leading-relaxed">
          {description}
        </p>
      </div>
    </li>
  );
}
