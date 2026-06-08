"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { completeOnboarding } from "@/app/(app)/onboarding/actions";

interface Props {
  initialDisplayName: string;
  email: string;
}

type Step = "welcome" | "you" | "glimpse";

const TOTAL_STEPS = 3;
const STEP_INDEX: Record<Step, number> = { welcome: 0, you: 1, glimpse: 2 };

export function OnboardingFlow({ initialDisplayName, email }: Props) {
  const [step, setStep] = useState<Step>("welcome");
  const [displayName, setDisplayName] = useState(initialDisplayName);
  const [graduationYear, setGraduationYear] = useState<string>("");
  const [timezone, setTimezone] = useState<string>("UTC");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);

  // Detect timezone on mount — Intl resolution runs once client-side.
  useEffect(() => {
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (tz) setTimezone(tz);
    } catch {
      // Some older browsers throw; UTC fallback is fine.
    }
  }, []);

  const canAdvanceFromYou = displayName.trim().length > 0;

  function handleSubmit() {
    if (!formRef.current) return;
    const fd = new FormData(formRef.current);
    setError(null);
    startTransition(async () => {
      try {
        await completeOnboarding(fd);
      } catch (e) {
        // redirect() throws NEXT_REDIRECT — surface only real errors.
        if (e instanceof Error && !/NEXT_REDIRECT/.test(e.message)) {
          setError(e.message);
        }
      }
    });
  }

  return (
    <div className="w-full max-w-xl space-y-10">
      {/* Progress dots */}
      <div
        className="flex items-center justify-center gap-2"
        aria-label={`Step ${STEP_INDEX[step] + 1} of ${TOTAL_STEPS}`}
      >
        {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
          <span
            key={i}
            className={
              i <= STEP_INDEX[step]
                ? "h-1.5 w-6 rounded-full bg-[var(--ink-amber)] transition-colors"
                : "h-1.5 w-6 rounded-full bg-[var(--edge)] transition-colors"
            }
          />
        ))}
      </div>

      {step === "welcome" && (
        <section className="space-y-8 text-center">
          <div className="space-y-3">
            <h1 className="font-serif text-4xl text-[var(--ink)]">
              Welcome to Hyperpolymath.
            </h1>
            <p className="font-serif text-lg text-[var(--ink-muted)] leading-relaxed">
              A single sentence into JARVIS routes to the right place — task,
              capture, or calendar. Let&rsquo;s get you set up.
            </p>
          </div>
          <Button
            size="lg"
            className="px-10"
            onClick={() => setStep("you")}
          >
            Begin
          </Button>
        </section>
      )}

      {step === "you" && (
        <section className="space-y-8">
          <div className="space-y-2 text-center">
            <h2 className="font-serif text-3xl text-[var(--ink)]">
              About you.
            </h2>
            <p className="font-serif text-sm text-[var(--ink-muted)]">
              How JARVIS should address you, and a few details so things land
              in your timezone.
            </p>
          </div>

          <div className="space-y-5">
            <div className="space-y-1.5">
              <label
                htmlFor="display_name"
                className="font-serif text-sm text-[var(--ink-muted)]"
              >
                Preferred name
              </label>
              <Input
                id="display_name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="e.g. Filippo"
                autoFocus
                required
                maxLength={60}
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="graduation_year"
                className="font-serif text-sm text-[var(--ink-muted)]"
              >
                Graduation year{" "}
                <span className="text-[var(--ink-muted)] italic">
                  &mdash; optional
                </span>
              </label>
              <Input
                id="graduation_year"
                inputMode="numeric"
                pattern="\d{4}"
                value={graduationYear}
                onChange={(e) =>
                  setGraduationYear(e.target.value.replace(/\D/g, "").slice(0, 4))
                }
                placeholder="e.g. 2028"
                maxLength={4}
              />
            </div>

            <div className="space-y-1.5">
              <label className="font-serif text-sm text-[var(--ink-muted)]">
                Timezone
              </label>
              <div className="flex h-9 items-center rounded-md border border-[var(--edge)] bg-[var(--surface)] px-3 font-serif text-base text-[var(--ink)]">
                {timezone}
                <span className="ml-auto font-mono text-xs text-[var(--ink-muted)]">
                  auto-detected
                </span>
              </div>
            </div>

            <p className="font-serif text-xs text-[var(--ink-muted)] italic">
              Signed in as {email}.
            </p>
          </div>

          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setStep("welcome")}
              className="font-serif text-sm text-[var(--ink-muted)] hover:text-[var(--ink)]"
            >
              ← Back
            </button>
            <Button
              size="lg"
              disabled={!canAdvanceFromYou}
              onClick={() => setStep("glimpse")}
            >
              Continue
            </Button>
          </div>
        </section>
      )}

      {step === "glimpse" && (
        <section className="space-y-8">
          <div className="space-y-2 text-center">
            <h2 className="font-serif text-3xl text-[var(--ink)]">
              What you can do.
            </h2>
            <p className="font-serif text-sm text-[var(--ink-muted)]">
              Three things to try once you&rsquo;re in.
            </p>
          </div>

          <ul className="space-y-4">
            <Showcase
              label="Capture"
              example='"i&rsquo;m tired"'
              description="Anything ambiguous lands in your capture log — verbatim, never paraphrased."
            />
            <Showcase
              label="Plan"
              example='"remind me to buy flowers friday"'
              description="A new task in the right area, due Friday, with the right priority."
            />
            <Showcase
              label="Schedule"
              example='"dinner 8pm saturday with anna"'
              description="Goes straight onto your Google Calendar on your default calendar."
            />
          </ul>

          {error && (
            <p className="font-serif text-sm text-[var(--ink-coral)] text-center">
              {error}
            </p>
          )}

          <form
            ref={formRef}
            action={completeOnboarding}
            className="flex items-center justify-between"
            onSubmit={(e) => {
              // Use the transition path so isPending reflects the action call.
              e.preventDefault();
              handleSubmit();
            }}
          >
            <input type="hidden" name="display_name" value={displayName} />
            <input type="hidden" name="timezone" value={timezone} />
            <input
              type="hidden"
              name="graduation_year"
              value={graduationYear}
            />
            <button
              type="button"
              onClick={() => setStep("you")}
              className="font-serif text-sm text-[var(--ink-muted)] hover:text-[var(--ink)]"
              disabled={isPending}
            >
              ← Back
            </button>
            <Button type="submit" size="lg" disabled={isPending}>
              {isPending ? "Setting up…" : "Begin"}
            </Button>
          </form>
        </section>
      )}
    </div>
  );
}

function Showcase({
  label,
  example,
  description,
}: {
  label: string;
  example: string;
  description: string;
}) {
  return (
    <li className="rounded-md border border-[var(--edge)] bg-[var(--surface)] p-4 space-y-1">
      <div className="flex items-baseline gap-3">
        <span className="font-mono text-xs uppercase tracking-wider text-[var(--ink-amber)]">
          {label}
        </span>
        <span
          className="font-serif italic text-[var(--ink)]"
          dangerouslySetInnerHTML={{ __html: example }}
        />
      </div>
      <p className="font-serif text-sm text-[var(--ink-muted)] leading-relaxed">
        {description}
      </p>
    </li>
  );
}
