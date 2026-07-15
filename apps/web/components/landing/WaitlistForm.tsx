"use client";

import { joinWaitlist } from "@/app/actions/waitlist";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { AnimatePresence, motion } from "motion/react";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

/**
 * Waitlist form — Phase 8 (LAND-WAITLIST-UI / D-12 / D-13 / UI-SPEC §5e Door 1).
 *
 * Three states (idle → submitting → success | error):
 *   - idle: email input + "Join the waitlist" button + honeypot (hidden) + sign-in escape
 *   - submitting: button disabled, label changes
 *   - success: form swaps to success message + optional follow-up "what do you do?" + sign-in escape
 *   - error: inline error message in --ink-coral italic Caption 14 below form, stays in idle
 *
 * Per UI-SPEC §5e:
 *   - Input: shadcn <Input> type=email 44px tall, --surface bg, --edge border, serif Body 18,
 *     placeholder "your@email.com" in --ink-muted italic
 *   - Submit button: shadcn <Button> recolored via className to bg-[var(--sd-ink)] text-[var(--sd-app)]
 *     hover:bg-[var(--sd-ink-faint)] text-[18px] font-medium px-6 py-3 rounded-[4px]
 *     LABEL: "Join the waitlist" (verb-noun, title case, no exclamation, no emoji)
 *   - Success swap: 200ms cross-fade per UI-SPEC §6
 *   - Follow-up: serif Caption 14 input "what do you do? (optional)" + mono [submit] Caption 14
 *   - Sign-in escape (D-13): "Already have an account? <a>Sign in →</a>" Caption 14 serif --ink-muted
 */

const FormSchema = z.object({
  email: z.string().trim().toLowerCase().email("Please enter a valid email.").max(320),
  // Honeypot — real users never see this. Kept permissive so a bot that fills
  // it still passes client validation and submits; the Server Action detects
  // the filled field and returns a silent success. A `.max(0)` here would block
  // submit with a confusing field error instead.
  website: z.string().max(320).optional(),
});

type FormValues = z.input<typeof FormSchema>;

const FollowUpSchema = z.object({
  note: z.string().trim().max(280),
});
type FollowUpValues = z.input<typeof FollowUpSchema>;

export function WaitlistForm() {
  const [submittedEmail, setSubmittedEmail] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [followUpSubmitted, setFollowUpSubmitted] = useState(false);
  const [isPending, startTransition] = useTransition();

  const form = useForm<FormValues>({
    resolver: standardSchemaResolver(FormSchema),
    defaultValues: { email: "", website: "" },
  });

  const followUpForm = useForm<FollowUpValues>({
    resolver: standardSchemaResolver(FollowUpSchema),
    defaultValues: { note: "" },
  });

  function onSubmit(values: FormValues) {
    setSubmitError(null);
    startTransition(async () => {
      const result = await joinWaitlist(values);
      if (result.success) {
        setSubmittedEmail(values.email);
      } else {
        setSubmitError(result.error);
      }
    });
  }

  function onFollowUp(values: FollowUpValues) {
    if (!submittedEmail) return;
    startTransition(async () => {
      await joinWaitlist({ email: submittedEmail, note: values.note });
      setFollowUpSubmitted(true);
    });
  }

  return (
    <div className="space-y-4">
      <AnimatePresence mode="wait">
        {!submittedEmail ? (
          <motion.form
            key="form"
            onSubmit={form.handleSubmit(onSubmit)}
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.25, 1, 0.5, 1] }}
            className="space-y-3"
          >
            {/* Honeypot — invisible to humans, bots fill */}
            <input
              type="text"
              tabIndex={-1}
              autoComplete="off"
              aria-hidden="true"
              style={{
                position: "absolute",
                left: "-9999px",
                height: 0,
                width: 0,
                opacity: 0,
              }}
              {...form.register("website")}
            />

            <div className="flex flex-col sm:flex-row gap-3">
              <Input
                type="email"
                placeholder="your@email.com"
                aria-label="Email address"
                autoComplete="email"
                className="h-11 flex-1 rounded-[8px] bg-[var(--sd-input)] border-[var(--sd-line)] text-[16px] text-[var(--sd-ink)] placeholder:text-[var(--sd-ink-faint)] placeholder:italic focus-visible:border-[var(--sd-accent)]"
                {...form.register("email")}
              />
              <Button
                type="submit"
                disabled={isPending}
                className="h-11 rounded-full border-0 px-6 text-[14px] font-semibold bg-[var(--sd-accent)] text-[var(--sd-app)] shadow-none hover:bg-[var(--sd-accent-faint)] transition-colors duration-150"
              >
                {isPending ? "Submitting..." : "Join the waitlist"}
              </Button>
            </div>

            {form.formState.errors.email && (
              <p className="italic text-[14px] text-[var(--ink-coral)]">
                {form.formState.errors.email.message}
              </p>
            )}
            {submitError && (
              <p className="italic text-[14px] text-[var(--ink-coral)]">{submitError}</p>
            )}
          </motion.form>
        ) : (
          <motion.div
            key="success"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.2, ease: [0.25, 1, 0.5, 1] }}
            className="space-y-4"
          >
            <p className="italic text-[18px] text-[var(--sd-ink-faint)]">
              You&rsquo;re in. I&rsquo;ll write when there&rsquo;s something to log into.
            </p>
            {!followUpSubmitted ? (
              <form
                onSubmit={followUpForm.handleSubmit(onFollowUp)}
                className="flex flex-col sm:flex-row gap-3"
              >
                <Input
                  type="text"
                  placeholder="what do you do? (optional)"
                  aria-label="What do you do (optional)"
                  className="h-10 flex-1 rounded-[8px] bg-[var(--sd-input)] border-[var(--sd-line)] text-[14px] text-[var(--sd-ink)] placeholder:text-[var(--sd-ink-faint)] placeholder:italic"
                  {...followUpForm.register("note")}
                />
                <button
                  type="submit"
                  disabled={isPending}
                  className="font-mono text-[14px] font-medium text-[var(--sd-ink-faint)] hover:text-[var(--sd-ink)] transition-colors px-2"
                >
                  [submit]
                </button>
              </form>
            ) : (
              <p className="italic text-[14px] text-[var(--sd-ink-faint)]">
                Got it. Thanks.
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Sign-in escape — D-13 (UI-SPEC §5e: appears under the form area in both states) */}
      <p className="text-[14px] text-[var(--sd-ink-faint)]">
        Already have an account?{" "}
        <a
          href="/sign-in"
          className="underline underline-offset-4 hover:text-[var(--sd-ink)] transition-colors"
        >
          Sign in →
        </a>
      </p>
    </div>
  );
}
