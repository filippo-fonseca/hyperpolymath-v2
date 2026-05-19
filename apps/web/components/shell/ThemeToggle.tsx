'use client';

import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';
import { Moon, Sun, Monitor } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Phase 6.1 Plan 06.1-01: theme toggle (SET-03, AES-06).
 *
 * Two variants — same hook, two presentations.
 *   - "header"  : icon-only button. Binary swap (light ↔ dark) based on
 *                 resolvedTheme. 36px square (h-9 w-9). Transparent
 *                 border at rest, 1px --edge border on hover (UI-SPEC §9k).
 *   - "settings": three-button segmented control (Light / Dark / System).
 *                 1px --edge container border; active button gets an
 *                 inset 1px ring + --surface-raised bg (UI-SPEC §9k).
 *
 * Lucide icons use stroke-width 1.5px per UI-SPEC §8a.
 *
 * Mount guard (carry-forward from Phase 6): SSR can't know localStorage;
 * the client knows it. Render a same-dimension placeholder before mount
 * to avoid hydration mismatch + wrong-icon flash. The placeholder uses
 * the at-rest border (transparent) to match post-mount visual.
 */
interface Props {
  variant?: 'header' | 'settings';
}

export function ThemeToggle({ variant = 'header' }: Props) {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) {
    if (variant === 'header') {
      return (
        <div
          className="h-9 w-9 rounded-md border border-transparent"
          aria-hidden="true"
        />
      );
    }
    return (
      <div
        className="h-9 w-32 rounded-md border border-[var(--edge)] bg-[var(--surface)]"
        aria-hidden="true"
      />
    );
  }

  if (variant === 'header') {
    const isDark = resolvedTheme === 'dark';
    const nextTheme = isDark ? 'light' : 'dark';
    return (
      <button
        type="button"
        onClick={() => setTheme(nextTheme)}
        aria-label={`Switch to ${nextTheme} mode`}
        className="h-9 w-9 inline-flex items-center justify-center rounded-md border border-transparent hover:border-[var(--edge)] transition-colors duration-150 ease-out cursor-pointer-always"
      >
        {isDark ? (
          <Sun size={16} strokeWidth={1.5} />
        ) : (
          <Moon size={16} strokeWidth={1.5} />
        )}
      </button>
    );
  }

  // Settings variant — segmented control with 3 options
  const options: Array<{ value: 'light' | 'dark' | 'system'; label: string; Icon: typeof Sun }> = [
    { value: 'light', label: 'Light', Icon: Sun },
    { value: 'dark', label: 'Dark', Icon: Moon },
    { value: 'system', label: 'System', Icon: Monitor },
  ];
  return (
    <div
      className="inline-flex items-center gap-0.5 rounded-md border border-[var(--edge)] bg-[var(--surface)] p-0.5"
      role="radiogroup"
      aria-label="Theme"
    >
      {options.map(({ value, label, Icon }) => {
        const active = theme === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => setTheme(value)}
            aria-label={`Use ${label} theme`}
            className={cn(
              'h-8 px-3 inline-flex items-center gap-2 rounded text-xs font-mono transition-all duration-150 ease-out cursor-pointer-always',
              active
                ? 'bg-[var(--surface-raised)] text-[var(--ink)] shadow-[inset_0_0_0_1px_var(--edge)] font-semibold'
                : 'text-[var(--ink-muted)] hover:text-[var(--ink)]',
            )}
          >
            <Icon size={14} strokeWidth={1.5} />
            {label}
          </button>
        );
      })}
    </div>
  );
}
