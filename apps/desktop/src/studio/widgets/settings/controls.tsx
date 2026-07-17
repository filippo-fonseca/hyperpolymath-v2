/**
 * Settings surface primitives — the card-v2 grammar, hand-rolled.
 *
 * apps/desktop has no Tailwind, so the design-system dialect (`rounded-[14px]`,
 * `.sd-panel`, `bg-[var(--sd-box)]`) does not resolve here and would render as
 * nothing. Per contract §23 inline style is the sanctioned escape hatch; in this
 * app it is the default mechanism. These components are that translation, done
 * once, so {@link ../SettingsWidget} reads as structure rather than styling.
 *
 * The grammar: 14px radius, `--sd-box` surface, 1px `--sd-line`, inset top
 * hairline, one cyan accent, mono eyebrows (11px, uppercase, wide tracking),
 * Space Grotesk everywhere else. Hover moves the BORDER only — no fill change,
 * no lift. Surfaces here are inner CONTENT, so they are solid: the glass lives
 * on the window chrome (sealed D1) and is not this file's business.
 */

import * as React from "react";
import { useState, type CSSProperties, type ReactNode } from "react";

import {
  SD_ACCENT,
  SD_FONT,
  SD_FUNCTIONAL,
  SD_HAIRLINE,
  SD_INK,
  SD_RADIUS,
  SD_SURFACES,
} from "../../tokens";

/** Status tone → ink. `ok`/`warn`/`err` are intent, not decoration, so they are
 *  the only place a non-accent hue is allowed (contract §1 permits intent inks). */
export type Tone = "muted" | "ok" | "warn" | "err" | "accent";

export const TONE_INK: Record<Tone, string> = {
  muted: SD_INK.faint,
  ok: SD_FUNCTIONAL.sage,
  warn: SD_FUNCTIONAL.amber,
  err: SD_FUNCTIONAL.coral,
  accent: SD_ACCENT,
};

const eyebrowStyle: CSSProperties = {
  margin: 0,
  color: SD_INK.faint,
  fontFamily: SD_FONT.mono,
  fontSize: 11,
  letterSpacing: "0.1em",
  textTransform: "uppercase",
};

/** The mono eyebrow/caption face. Used for section headers and micro-labels. */
export function Eyebrow({ children }: { children: ReactNode }): React.ReactElement {
  return <p style={eyebrowStyle}>{children}</p>;
}

/** One card-v2 section: solid --sd-box, hairline border, inset top hairline. */
export function Section({
  title,
  children,
  id,
}: {
  title: string;
  children: ReactNode;
  id?: string;
}): React.ReactElement {
  return (
    <section
      id={id}
      aria-label={title}
      style={{
        // The surface is a scrolling flex column; without this a tall section
        // gets shrunk to fit and its last rows are clipped away.
        flexShrink: 0,
        borderRadius: SD_RADIUS.card,
        border: `1px solid ${SD_SURFACES.line}`,
        background: SD_SURFACES.box,
        boxShadow: SD_HAIRLINE.card,
        overflow: "hidden",
      }}
    >
      <header style={{ padding: "11px 14px 9px" }}>
        <Eyebrow>{title}</Eyebrow>
      </header>
      {children}
    </section>
  );
}

const labelStyle: CSSProperties = {
  margin: 0,
  color: SD_INK.base,
  fontFamily: SD_FONT.sans,
  fontSize: 13,
  letterSpacing: "-0.01em",
};

const hintStyle: CSSProperties = {
  margin: "3px 0 0",
  color: SD_INK.faint,
  fontFamily: SD_FONT.sans,
  fontSize: 11,
  lineHeight: 1.4,
};

/**
 * A labelled row. `control` sits on the right by default; `stack` drops it onto
 * its own full-width line below (token fields, list editors).
 */
export function Row({
  label,
  hint,
  control,
  stack = false,
}: {
  label: string;
  hint?: ReactNode;
  control?: ReactNode;
  stack?: boolean;
}): React.ReactElement {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: stack ? "column" : "row",
        alignItems: stack ? "stretch" : "center",
        justifyContent: "space-between",
        gap: stack ? 8 : 12,
        padding: "10px 14px",
        borderTop: `1px solid ${SD_SURFACES.divider}`,
      }}
    >
      <div style={{ minWidth: 0 }}>
        <p style={labelStyle}>{label}</p>
        {hint ? <p style={hintStyle}>{hint}</p> : null}
      </div>
      {control ? <div style={{ flexShrink: 0 }}>{control}</div> : null}
    </div>
  );
}

/** A read-only value row: the readouts the surface shows but does not control. */
export function StatusRow({
  label,
  value,
  tone = "muted",
}: {
  label: string;
  value: string;
  tone?: Tone;
}): React.ReactElement {
  return (
    <Row
      label={label}
      control={
        <span
          style={{
            color: TONE_INK[tone],
            fontFamily: SD_FONT.mono,
            fontSize: 11,
            letterSpacing: "0.04em",
          }}
        >
          {value}
        </span>
      }
    />
  );
}

/** An explanatory note under a row. Prose, sans, never a control. */
export function Note({ children }: { children: ReactNode }): React.ReactElement {
  return (
    <p
      style={{
        margin: 0,
        padding: "0 14px 11px",
        color: SD_INK.faint,
        fontFamily: SD_FONT.sans,
        fontSize: 11,
        lineHeight: 1.45,
      }}
    >
      {children}
    </p>
  );
}

export function Toggle({
  on,
  onChange,
  label,
}: {
  on: boolean;
  onChange: (next: boolean) => void;
  label: string;
}): React.ReactElement {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className="studio-chrome-btn"
      style={{
        position: "relative",
        width: 40,
        height: 22,
        flexShrink: 0,
        padding: 0,
        border: `1px solid ${on ? SD_ACCENT : SD_SURFACES.line}`,
        borderRadius: SD_RADIUS.full,
        background: on ? `color-mix(in srgb, ${SD_ACCENT} 22%, transparent)` : "transparent",
        cursor: "pointer",
      }}
    >
      <span
        aria-hidden
        style={{
          position: "absolute",
          top: 2,
          left: on ? 20 : 2,
          width: 16,
          height: 16,
          borderRadius: "50%",
          background: on ? SD_ACCENT : SD_INK.faint,
          transition: "left 160ms cubic-bezier(0.25, 1, 0.5, 1)",
        }}
      />
    </button>
  );
}

/** A segmented radio group — the register's answer to a 2-4 option select. */
export function Segments<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: ReadonlyArray<{ value: T; label: string }>;
  onChange: (next: T) => void;
  label: string;
}): React.ReactElement {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      style={{
        display: "flex",
        gap: 2,
        padding: 2,
        border: `1px solid ${SD_SURFACES.line}`,
        borderRadius: SD_RADIUS.chrome,
      }}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option.value)}
            className="studio-chrome-btn"
            style={{
              padding: "4px 9px",
              border: 0,
              borderRadius: SD_RADIUS.chip,
              color: active ? SD_ACCENT : SD_INK.faint,
              background: active
                ? `color-mix(in srgb, ${SD_ACCENT} 16%, transparent)`
                : "transparent",
              fontFamily: SD_FONT.mono,
              fontSize: 9,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export const inputStyle: CSSProperties = {
  minWidth: 0,
  padding: "6px 9px",
  border: `1px solid ${SD_SURFACES.line}`,
  borderRadius: SD_RADIUS.chrome,
  background: SD_SURFACES.input,
  color: SD_INK.base,
  fontFamily: SD_FONT.mono,
  fontSize: 11,
  outline: "none",
};

/** A text input that commits on blur or Enter — never on every keystroke, so a
 *  half-typed value never reaches the store (matches the old drawer's
 *  `change`-event contract). */
export function TextField({
  value,
  onCommit,
  placeholder,
  label,
  type = "text",
  flex = true,
}: {
  value: string;
  onCommit: (next: string) => void;
  placeholder?: string;
  label: string;
  type?: "text" | "password";
  flex?: boolean;
}): React.ReactElement {
  const [draft, setDraft] = useState(value);
  const [focused, setFocused] = useState(false);

  // Track the store while the user is not editing; never clobber a live edit.
  React.useEffect(() => {
    if (!focused) setDraft(value);
  }, [value, focused]);

  return (
    <input
      type={type}
      value={draft}
      aria-label={label}
      placeholder={placeholder}
      onChange={(e) => setDraft(e.target.value)}
      onFocus={() => setFocused(true)}
      onBlur={() => {
        setFocused(false);
        if (draft !== value) onCommit(draft);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          e.currentTarget.blur();
        }
      }}
      style={{
        ...inputStyle,
        ...(flex ? { flex: 1 } : {}),
        borderColor: focused ? SD_ACCENT : SD_SURFACES.line,
      }}
    />
  );
}

export function Select<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: ReadonlyArray<{ value: T; label: string }>;
  onChange: (next: T) => void;
  label: string;
}): React.ReactElement {
  return (
    <select
      value={value}
      aria-label={label}
      onChange={(e) => onChange(e.target.value as T)}
      style={{ ...inputStyle, cursor: "pointer" }}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

/** A small chrome button. `tone` tints the label for destructive/primary intent. */
export function Button({
  children,
  onClick,
  disabled = false,
  tone = "muted",
  label,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  tone?: Tone;
  label?: string;
}): React.ReactElement {
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="studio-chrome-btn"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        padding: "5px 10px",
        // Hover moves the BORDER only: no fill change, no lift.
        border: `1px solid ${hover && !disabled ? SD_ACCENT : SD_SURFACES.line}`,
        borderRadius: SD_RADIUS.chrome,
        background: "transparent",
        color: disabled ? SD_INK.faint : TONE_INK[tone === "muted" ? "accent" : tone],
        fontFamily: SD_FONT.mono,
        fontSize: 10,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.55 : 1,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </button>
  );
}
