"use client";

/**
 * MessagingSection — /settings control for JARVIS over text message
 * (issue #352, decision D6: Twilio Programmable SMS/MMS).
 *
 * Three things, in the order they matter:
 *   1. The channel switch. Off by default and off means OFF: the webhook checks
 *      this flag before spending a turn, so an inbound message while it is
 *      closed costs nothing and gets no reply.
 *   2. The last-reply status line, so a channel that quietly stopped working is
 *      visible here rather than only in the logs.
 *   3. The senders that are allowed to drive it, read from the server so the
 *      user can confirm at a glance which handset the assistant answers.
 *
 * Numbers are configuration, not state: they come from env and are rendered
 * read-only. Credentials never reach the client, and the toggle is the only
 * thing this component can change.
 */

import { useState, useTransition } from "react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { setSmsJarvisEnabled } from "@/app/(app)/settings/messaging-actions";
import type { MessagingSettings, SmsJarvisStatus } from "@/lib/db/queries/messaging";

interface Props {
  settings: MessagingSettings;
  /** E.164 numbers allowed to drive JARVIS, resolved server-side from env. */
  allowedSenders: string[];
  /** The number JARVIS replies from, or null when Twilio is unconfigured. */
  replyFrom: string | null;
  /** False when the Twilio credentials are missing, so replies cannot send. */
  transportConfigured: boolean;
}

const STATUS_META: Record<SmsJarvisStatus, { label: string; dotClass: string }> = {
  done: { label: "Replied", dotClass: "bg-green-500" },
  disabled: { label: "Ignored, channel was off", dotClass: "bg-neutral-400" },
  ignored_sender: { label: "Ignored, sender not allowed", dotClass: "bg-amber-500" },
  error: { label: "Last reply failed", dotClass: "bg-[var(--ink-coral)]" },
};

export function MessagingSection({
  settings,
  allowedSenders,
  replyFrom,
  transportConfigured,
}: Props) {
  const [enabled, setEnabled] = useState(settings.enabled);
  const [pending, startToggle] = useTransition();

  function handleToggle(next: boolean) {
    if (next === enabled) return;
    const previous = enabled;
    setEnabled(next); // optimistic
    startToggle(async () => {
      const r = await setSmsJarvisEnabled(next);
      if (!r.success) {
        setEnabled(previous);
        toast.error(r.error);
        return;
      }
      toast(
        next
          ? "Kiwi will now reply to your text messages."
          : "Kiwi will stop replying to text messages.",
      );
    });
  }

  const meta = settings.lastStatus ? STATUS_META[settings.lastStatus] : null;
  const lastReplyLabel = settings.lastReplyAt
    ? formatDistanceToNow(settings.lastReplyAt, { addSuffix: true })
    : null;

  const toggleOptions: ReadonlyArray<{ value: boolean; label: string }> = [
    { value: true, label: "On" },
    { value: false, label: "Off" },
  ];

  return (
    <div className="space-y-5">
      {/* The channel switch */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <div className="text-sm font-medium text-[var(--sd-ink)]">Reply to text messages</div>
          <div className="text-xs text-[var(--sd-ink-dull)]">
            When this is on, a text to your Kiwi number runs the same assistant you get on the
            web, and the reply comes back as a text. Turning it off stops the turn before it
            starts, so nothing is spent and nothing is sent.
          </div>
        </div>
        <div
          role="radiogroup"
          aria-label="Reply to text messages"
          className="inline-flex shrink-0 rounded-md border border-[var(--sd-line)] bg-[var(--sd-app)] p-0.5"
        >
          {toggleOptions.map((opt) => {
            const selected = opt.value === enabled;
            return (
              <button
                key={String(opt.value)}
                type="button"
                role="radio"
                aria-checked={selected}
                disabled={pending && !selected}
                onClick={() => handleToggle(opt.value)}
                className={`cursor-pointer-always rounded-sm px-3 py-1.5 font-mono text-xs uppercase tracking-[0.08em] transition-colors duration-100 disabled:opacity-50 ${
                  selected
                    ? "bg-[var(--sd-selected)] text-[var(--sd-ink)]"
                    : "text-[var(--sd-ink-dull)] hover:text-[var(--sd-ink)]"
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Last-reply status */}
      <div className="flex flex-col gap-1 border-t border-border pt-4">
        <div className="text-sm font-medium text-[var(--sd-ink)]">Last reply</div>
        {meta && lastReplyLabel ? (
          <div className="flex items-center gap-2 text-xs text-[var(--sd-ink-dull)]">
            <span className={`h-2 w-2 rounded-full ${meta.dotClass}`} aria-hidden />
            <span>
              {meta.label} · {lastReplyLabel}
            </span>
          </div>
        ) : (
          <div className="text-xs text-[var(--sd-ink-dull)]">
            No text message has been handled yet.
          </div>
        )}
        {settings.lastStatus === "error" && settings.lastError ? (
          <div className="text-xs text-[var(--ink-coral)]">{settings.lastError}</div>
        ) : null}
      </div>

      {/* Who may drive it, and where replies come from */}
      <div className="flex flex-col gap-2 border-t border-border pt-4">
        <div className="text-sm font-medium text-[var(--sd-ink)]">Allowed senders</div>
        {allowedSenders.length > 0 ? (
          <ul className="flex flex-wrap gap-2">
            {allowedSenders.map((number) => (
              <li
                key={number}
                className="rounded-md border border-[var(--sd-line)] bg-[var(--sd-input)] px-2.5 py-1 font-mono text-xs text-[var(--sd-ink-dull)]"
              >
                {number}
              </li>
            ))}
          </ul>
        ) : (
          <div className="text-xs text-amber-600">
            No senders are allowed yet, so every inbound message is ignored. Set
            JARVIS_SMS_ALLOWED_SENDERS (or JARVIS_SMS_OWNER_NUMBER) in the environment.
          </div>
        )}
        <div className="text-xs text-[var(--sd-ink-dull)]">
          A text message&rsquo;s sender is easy to forge, so this list is a filter, not a
          password. What actually proves a message came from Twilio is the request signature on
          the webhook.
        </div>
        {transportConfigured && replyFrom ? (
          <div className="text-xs text-[var(--sd-ink-dull)]">
            Replies are sent from <span className="font-mono">{replyFrom}</span>.
          </div>
        ) : transportConfigured ? (
          <div className="text-xs text-[var(--sd-ink-dull)]">
            Replies are sent through your Twilio Messaging Service.
          </div>
        ) : (
          <div className="text-xs text-amber-600">
            Twilio is not configured, so no reply can be sent. Set TWILIO_ACCOUNT_SID,
            TWILIO_AUTH_TOKEN and one of TWILIO_MESSAGING_SERVICE_SID or TWILIO_FROM_NUMBER.
          </div>
        )}
      </div>
    </div>
  );
}
