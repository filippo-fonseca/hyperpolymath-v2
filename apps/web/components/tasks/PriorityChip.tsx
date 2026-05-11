"use client";

type Priority = "P∞" | "P1" | "P2" | "P3";

const COLORS: Record<Priority, { bg: string; fg: string }> = {
  "P∞": { bg: "hsl(38, 55%, 90%)", fg: "hsl(38, 72%, 35%)" },
  P1: { bg: "hsl(0, 45%, 92%)", fg: "hsl(0, 60%, 35%)" },
  P2: { bg: "hsl(25, 55%, 92%)", fg: "hsl(25, 70%, 35%)" },
  P3: {
    bg: "var(--color-secondary, hsl(40, 10%, 90%))",
    fg: "var(--color-muted-foreground, hsl(30, 5%, 45%))",
  },
};

export function PriorityChip({ priority }: { priority: Priority }) {
  const c = COLORS[priority];
  return (
    <span
      className="inline-flex items-center font-sans text-[13px] px-1.5 py-0.5 rounded"
      style={{ backgroundColor: c.bg, color: c.fg }}
    >
      {priority}
    </span>
  );
}
