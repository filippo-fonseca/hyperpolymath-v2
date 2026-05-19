'use client';

import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';
import { Moon, Sun, Monitor } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Phase 6 Plan 06-01: theme toggle (SET-03, AES-06, D-06).
 *
 * Two variants — same hook, two presentations.
 *   - "header"  : icon-only button. Binary swap (light ↔ dark) based on
 *                 resolvedTheme. 36px square (h-9 w-9) with neumorphic
 *                 shadow tokens (defined in globals.css).
 *   - "settings": three-button segmented control (Light / Dark / System).
 *                 Persists the explicit choice including "system".
 *
 * Mount guard (RESEARCH §1 Pitfall 5): SSR can't know localStorage; the
 * client knows it. Render a same-dimension placeholder before mount to
 * avoid hydration mismatch + wrong-icon flash.
 */
interface Props {
  variant?: 'header' | 'settings';
}

export function ThemeToggle({ variant = 'header' }: Props) {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) {
    if (variant === 'header') return <div className="h-9 w-9" aria-hidden="true" />;
    return <div className="h-9 w-32" aria-hidden="true" />;
  }

  if (variant === 'header') {
    const isDark = resolvedTheme === 'dark';
    return (
      <button
        type="button"
        onClick={() => setTheme(isDark ? 'light' : 'dark')}
        aria-label={`Switch to ${isDark ? 'light' : 'dark'} mode`}
        className="h-9 w-9 inline-flex items-center justify-center rounded-md cursor-pointer transition-shadow"
        style={{
          boxShadow: 'var(--shadow-nm-button)',
        }}
      >
        {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
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
    <div className="inline-flex gap-1 rounded-md p-1" style={{ boxShadow: 'var(--shadow-nm-surface)' }}>
      {options.map(({ value, label, Icon }) => {
        const active = theme === value;
        return (
          <button
            key={value}
            type="button"
            onClick={() => setTheme(value)}
            aria-label={`Use ${label} theme`}
            className={cn(
              'h-9 px-3 inline-flex items-center gap-2 rounded text-xs font-mono cursor-pointer transition-shadow',
              active && 'font-semibold',
            )}
            style={{
              boxShadow: active ? 'var(--shadow-nm-button-active)' : 'var(--shadow-nm-button)',
            }}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        );
      })}
    </div>
  );
}
