"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { PenLine, ListChecks, CalendarDays, ArrowLeft } from "lucide-react";
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

  useEffect(() => {
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (tz) setTimezone(tz);
    } catch {
      // Older browsers throw; UTC fallback is fine.
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
        if (e instanceof Error && !/NEXT_REDIRECT/.test(e.message)) {
          setError(e.message);
        }
      }
    });
  }

  return (
    <div className="w-full max-w-2xl">
      {/* Eyebrow + step counter, mono caption so it reads as system chrome. */}
      <div className="flex items-center justify-between mb-6">
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--ink-muted)]">
          § Onboarding
        </p>
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--ink-muted)]">
          {String(STEP_INDEX[step] + 1).padStart(2, "0")} / {String(TOTAL_STEPS).padStart(2, "0")}
        </p>
      </div>

      {/* Progress bar */}
      <div
        className="h-px w-full bg-[var(--edge)] mb-10 relative"
        aria-hidden="true"
      >
        <span
          className="absolute inset-y-0 left-0 bg-[var(--ink-amber)] transition-all duration-300"
          style={{ width: `${((STEP_INDEX[step] + 1) / TOTAL_STEPS) * 100}%` }}
        />
      </div>

      <div className="rounded-lg border border-[var(--edge)] bg-[var(--surface)] p-10">
        {step === "welcome" && (
          <section className="space-y-8">
            <div className="space-y-3">
              <h1 className="font-serif text-4xl text-[var(--ink)]">
                Welcome to Hyperpolymath.
              </h1>
              <p className="font-serif text-lg text-[var(--ink-muted)] leading-relaxed">
                One line in. It lands in the right place: a task, a capture, or
                a calendar event.
              </p>
            </div>
            <Button size="lg" className="px-10" onClick={() => setStep("you")}>
              Begin
            </Button>
          </section>
        )}

        {step === "you" && (
          <section className="space-y-8">
            <div className="space-y-2">
              <h2 className="font-serif text-3xl text-[var(--ink)]">
                About you.
              </h2>
              <p className="font-serif text-sm text-[var(--ink-muted)]">
                How JARVIS should address you.
              </p>
            </div>

            <div className="space-y-5">
              <Field
                label="Preferred name"
                htmlFor="display_name"
              >
                <Input
                  id="display_name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="e.g. Filippo"
                  autoFocus
                  required
                  maxLength={60}
                />
              </Field>

              <Field
                label="Graduation year (optional)"
                htmlFor="graduation_year"
              >
                <Input
                  id="graduation_year"
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
                />
              </Field>

              <Field label="Timezone">
                <div className="flex h-9 items-center rounded-md border border-[var(--edge)] bg-[var(--canvas)] px-3 font-serif text-base text-[var(--ink)]">
                  {timezone}
                  <span className="ml-auto font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--ink-muted)]">
                    auto-detected
                  </span>
                </div>
              </Field>

              <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--ink-muted)]">
                Signed in as {email}
              </p>
            </div>

            <div className="flex items-center justify-between pt-2">
              <BackButton onClick={() => setStep("welcome")} />
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
            <div className="space-y-2">
              <h2 className="font-serif text-3xl text-[var(--ink)]">
                Examples.
              </h2>
              <p className="font-serif text-sm text-[var(--ink-muted)]">
                A few lines to try first.
              </p>
            </div>

            <ul className="space-y-3">
              <Showcase
                icon={PenLine}
                label="Capture"
                example='"i&rsquo;m tired"'
                description="Lands in your capture log, verbatim. JARVIS never paraphrases captures."
              />
              <Showcase
                icon={ListChecks}
                label="Plan"
                example='"remind me to send the brief friday"'
                description="A task in the right area, due Friday, at the right priority."
              />
              <Showcase
                icon={CalendarDays}
                label="Schedule"
                example='"coffee 4pm saturday with brian"'
                description="Lands on your default Google Calendar."
              />
            </ul>

            {error && (
              <p className="font-serif text-sm text-[var(--ink-coral)]">
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
              <input
                type="hidden"
                name="graduation_year"
                value={graduationYear}
              />
              <BackButton
                onClick={() => setStep("you")}
                disabled={isPending}
              />
              <Button type="submit" size="lg" disabled={isPending}>
                {isPending ? "Saving" : "Begin"}
              </Button>
            </form>
          </section>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label
        htmlFor={htmlFor}
        className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--ink-muted)] block"
      >
        {label}
      </label>
      {children}
    </div>
  );
}

function BackButton({
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
      className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--ink-muted)] hover:text-[var(--ink)] disabled:opacity-40 transition-colors"
    >
      <ArrowLeft className="w-3.5 h-3.5" />
      Back
    </button>
  );
}

function Showcase({
  icon: Icon,
  label,
  example,
  description,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  example: string;
  description: string;
}) {
  return (
    <li className="flex items-start gap-4 rounded-md border border-[var(--edge)] bg-[var(--canvas)] p-4">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-[var(--edge)] bg-[var(--surface)] text-[var(--ink-amber)]">
        <Icon className="w-4 h-4" />
      </div>
      <div className="min-w-0 space-y-1">
        <div className="flex items-baseline gap-3 flex-wrap">
          <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--ink-muted)]">
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
      </div>
    </li>
  );
}
