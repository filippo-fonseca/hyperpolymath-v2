"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface Props {
  placeholder?: string;
  autoFocus?: boolean;
  onSubmit: (text: string) => void;
  onCancel?: () => void;
  className?: string;
  /** Fires on every value change — lets a host drive a live search dropdown. */
  onValueChange?: (value: string) => void;
  /**
   * Optional keydown pre-handler. Runs before the composer's own key logic;
   * return true to signal the event was fully handled (composer then bails,
   * preserving the host's Arrow/Enter/Escape control for an attached dropdown).
   * Cmd/Ctrl+Enter (send to JARVIS) is never offered to the interceptor.
   */
  keyboardInterceptor?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => boolean;
}

const MAX_ROWS = 8;

/**
 * LiteJarvisComposer — a plain-textarea composer used by both LifeOsQuickSend
 * (inline on /lifeos) and GlobalJarvisDialog (Cmd+K dialog on other routes).
 *
 * Deliberately lighter than JarvisInput.tsx (TipTap + dual mention extensions +
 * slash popover + ignite state machine). This is purely a text capture surface;
 * the actual JARVIS turn fires after a sessionStorage handoff into the full
 * JarvisConsole flow on /today.
 *
 * Keys:
 *   - Cmd/Ctrl+Enter → onSubmit(trimmed). Clears value on success.
 *   - Escape         → onCancel?.()
 *
 * Visual register: serif body font (matches JarvisInput placeholder), surface-
 * raised background, edge-hud border. Focus state is the ONE new sanctioned
 * cyan use per the aesthetic budget: 1px hud-cyan border + 4px low-alpha cyan
 * ring. No glow, no scale, no shimmer.
 */
export function LiteJarvisComposer({
  placeholder = "Tell JARVIS what's on your mind…",
  autoFocus = false,
  onSubmit,
  onCancel,
  className,
  onValueChange,
  keyboardInterceptor,
}: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [value, setValue] = useState("");
  const lineHeightRef = useRef<number | null>(null);

  // Compute line-height once on mount so the auto-grow logic has a stable
  // multiplier to cap height against. Falls back to 24px if computed style
  // doesn't report a numeric line-height (e.g. 'normal').
  useLayoutEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    const cs = getComputedStyle(ta);
    const parsed = parseFloat(cs.lineHeight);
    lineHeightRef.current = Number.isFinite(parsed) ? parsed : 24;
  }, []);

  // Autogrow: reset height to recompute, then snap to scrollHeight capped at
  // MAX_ROWS lines so we never push the dialog off-screen.
  useLayoutEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    const lh = lineHeightRef.current ?? 24;
    const max = lh * MAX_ROWS;
    ta.style.height = `${Math.min(ta.scrollHeight, max)}px`;
  }, [value]);

  useEffect(() => {
    if (autoFocus && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [autoFocus]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Cmd/Ctrl+Enter always sends to JARVIS — never intercepted.
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      const trimmed = value.trim();
      if (!trimmed) return;
      onSubmit(trimmed);
      setValue("");
      onValueChange?.("");
      return;
    }
    // Let the host claim Arrow/Enter/Escape for an attached dropdown.
    if (keyboardInterceptor?.(e)) return;
    if (e.key === "Escape") {
      e.preventDefault();
      onCancel?.();
    }
  }

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setValue(e.target.value);
    onValueChange?.(e.target.value);
  }

  return (
    <div
      className={cn(
        "agent-mode-scope group/composer rounded-xl border border-[var(--edge)] bg-[var(--surface-raised)]",
        "px-4 py-3",
        "transition-[border-color,box-shadow,background-color] duration-150 ease-out",
        "hover:border-[var(--edge-hud)]",
        "focus-within:border-[var(--hud-cyan)]",
        "focus-within:shadow-[0_0_0_3px_color-mix(in_oklch,var(--hud-cyan)_10%,transparent)]",
        className
      )}
    >
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        rows={1}
        placeholder={placeholder}
        spellCheck
        className={cn(
          "block w-full resize-none bg-transparent outline-none",
          "font-serif text-[15px] leading-[1.5] text-[var(--ink)]",
          "placeholder:text-[var(--ink-muted)] placeholder:italic"
        )}
      />
      <div className="mt-2 flex items-center justify-end">
        <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--ink-muted)]">
          ⌘⏎ to send · ⎋ to cancel
        </span>
      </div>
    </div>
  );
}

export default LiteJarvisComposer;
