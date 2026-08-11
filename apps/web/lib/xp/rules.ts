/**
 * The XP vocabulary: what kinds of events exist and how each one is presented.
 *
 * Deliberately NOT the place where amounts live. Writes reach the database from
 * server actions, `app/api/device/*`, the JARVIS executor and the email ingest,
 * so awards are handed out by Postgres triggers rather than by application code
 * (see migration 0044). That makes the `xp_rules` table the single source of
 * truth for how much anything is worth; duplicating those numbers here would
 * only give them a chance to drift. Screens that want to show the going rate
 * read `xp_rules` and pass it down.
 */

export type XpCategory = 'tasks' | 'habits' | 'notes' | 'planning' | 'calendar' | 'jarvis' | 'health';

export const XP_KINDS = [
  'task.completed',
  'habit.completed',
  'habit.streak',
  'capture.created',
  'page.created',
  'page.edited',
  'project.created',
  'project.completed',
  'area.created',
  'event.created',
  'jarvis.command',
  'training.logged',
  'nutrition.logged',
  'daily.review',
  'streak.day',
] as const;

export type XpKind = (typeof XP_KINDS)[number];

export type XpKindMeta = {
  category: XpCategory;
  /** Past-tense phrase for the activity feed, e.g. "Completed a task". */
  label: string;
  /** Lucide icon name rendered beside the feed row. */
  icon: string;
  /** One line for the "how XP works" table. */
  hint: string;
};

export const XP_KIND_META: Record<XpKind, XpKindMeta> = {
  'task.completed': {
    category: 'tasks',
    label: 'Completed a task',
    icon: 'CircleCheck',
    hint: 'More for P∞ and P1, plus a bonus for beating the due time.',
  },
  'habit.completed': {
    category: 'habits',
    label: 'Completed a habit',
    icon: 'Flame',
    hint: 'Scales with the current streak, up to double.',
  },
  'habit.streak': {
    category: 'habits',
    label: 'Hit a streak milestone',
    icon: 'Zap',
    hint: 'At 3, 7, 14, 30, 60, 100, 180 and 365 days. Each one pays more.',
  },
  'capture.created': {
    category: 'notes',
    label: 'Captured a thought',
    icon: 'Inbox',
    hint: 'Getting it out of your head counts.',
  },
  'page.created': {
    category: 'notes',
    label: 'Wrote a new doc',
    icon: 'FileText',
    hint: 'Auto-opened daily pages do not count.',
  },
  'page.edited': {
    category: 'notes',
    label: 'Revised a doc',
    icon: 'PenLine',
    hint: 'Once per doc per day, however many times you save.',
  },
  'project.created': {
    category: 'planning',
    label: 'Started a project',
    icon: 'FolderPlus',
    hint: 'Scoping the work is work.',
  },
  'project.completed': {
    category: 'planning',
    label: 'Shipped a project',
    icon: 'Trophy',
    hint: 'The single biggest award in the app.',
  },
  'area.created': {
    category: 'planning',
    label: 'Defined an area',
    icon: 'Compass',
    hint: 'Naming a part of your life you intend to tend.',
  },
  'event.created': {
    category: 'calendar',
    label: 'Scheduled an event',
    icon: 'CalendarPlus',
    hint: 'Anything you put on the calendar, by hand or through Jarvis.',
  },
  'jarvis.command': {
    category: 'jarvis',
    label: 'Asked Jarvis',
    icon: 'Sparkles',
    hint: 'Small, and capped, but it adds up.',
  },
  'training.logged': {
    category: 'health',
    label: 'Logged a workout',
    icon: 'Dumbbell',
    hint: 'Marking a training activity done.',
  },
  'nutrition.logged': {
    category: 'health',
    label: 'Logged a meal',
    icon: 'Apple',
    hint: 'Every meal you actually record.',
  },
  'daily.review': {
    category: 'planning',
    label: 'Closed out the day',
    icon: 'BookOpenCheck',
    hint: 'Writing into your daily page.',
  },
  'streak.day': {
    category: 'habits',
    label: 'Kept the streak alive',
    icon: 'CalendarCheck',
    hint: 'Awarded once on the first thing you do each day.',
  },
};

export const XP_CATEGORY_META: Record<XpCategory, { label: string; hue: number; color: string }> = {
  tasks: { label: 'Tasks', hue: 210, color: '#38bdf8' },
  habits: { label: 'Habits', hue: 22, color: '#fb923c' },
  notes: { label: 'Notes & wiki', hue: 165, color: '#2dd4bf' },
  planning: { label: 'Planning', hue: 285, color: '#c084fc' },
  calendar: { label: 'Calendar', hue: 330, color: '#f472b6' },
  jarvis: { label: 'Jarvis', hue: 250, color: '#818cf8' },
  health: { label: 'Health', hue: 95, color: '#a3e635' },
};

export const XP_CATEGORIES = Object.keys(XP_CATEGORY_META) as XpCategory[];

const FALLBACK_META: XpKindMeta = {
  category: 'planning',
  label: 'Earned XP',
  icon: 'Sparkles',
  hint: '',
};

/** Never throws: an unknown kind from a newer migration still renders sensibly. */
export function metaForKind(kind: string): XpKindMeta {
  return XP_KIND_META[kind as XpKind] ?? FALLBACK_META;
}

export function categoryForKind(kind: string): XpCategory {
  return metaForKind(kind).category;
}

/** Streak lengths that earn a `habit.streak` bonus. Mirrors migration 0044. */
export const STREAK_MILESTONES = [3, 7, 14, 30, 60, 100, 180, 365] as const;
