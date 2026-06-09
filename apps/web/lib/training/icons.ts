/**
 * Curated lucide-react icon subset for activity types. Stored in the DB as
 * the kebab-case name (e.g. "dumbbell"). The TypeIcon component looks the
 * name up in TRAINING_ICONS to render the right lucide glyph.
 */

import {
  Activity,
  Award,
  Bike,
  Bone,
  Brain,
  Coffee,
  Dumbbell,
  Eye,
  Feather,
  Flame,
  Footprints,
  Heart,
  HeartPulse,
  Leaf,
  type LucideIcon,
  Medal,
  Moon,
  Mountain,
  MountainSnow,
  Music,
  Pause,
  PersonStanding,
  Sailboat,
  Scale,
  Snowflake,
  Sparkles,
  Sun,
  Sunrise,
  Target,
  Tent,
  Timer,
  TreePine,
  Trees,
  Trophy,
  Volleyball,
  Waves,
  Wind,
  Zap,
} from "lucide-react";

export interface TrainingIconEntry {
  id: string;
  label: string;
  Icon: LucideIcon;
}

/**
 * Order is curated — the picker grid renders in this order. Group hint by
 * neighborhood: strength / cardio-run / cardio-bike-water / mind / outdoor /
 * misc. Each id is the lucide kebab-case name so DB rows are human-readable.
 */
export const TRAINING_ICONS: TrainingIconEntry[] = [
  // strength / lift
  { id: "dumbbell", label: "Dumbbell", Icon: Dumbbell },
  { id: "bone", label: "Bone", Icon: Bone },
  { id: "scale", label: "Scale", Icon: Scale },
  { id: "trophy", label: "Trophy", Icon: Trophy },
  { id: "medal", label: "Medal", Icon: Medal },
  { id: "award", label: "Award", Icon: Award },
  // run / walk
  { id: "footprints", label: "Run", Icon: Footprints },
  { id: "person-standing", label: "Stand", Icon: PersonStanding },
  { id: "activity", label: "Pulse", Icon: Activity },
  { id: "heart-pulse", label: "Heart pulse", Icon: HeartPulse },
  { id: "heart", label: "Heart", Icon: Heart },
  { id: "flame", label: "Burn", Icon: Flame },
  // bike / water / wind
  { id: "bike", label: "Bike", Icon: Bike },
  { id: "waves", label: "Swim", Icon: Waves },
  { id: "sailboat", label: "Sail", Icon: Sailboat },
  { id: "wind", label: "Wind", Icon: Wind },
  { id: "snowflake", label: "Cold", Icon: Snowflake },
  { id: "volleyball", label: "Ball", Icon: Volleyball },
  // mind / breath
  { id: "brain", label: "Brain", Icon: Brain },
  { id: "leaf", label: "Calm", Icon: Leaf },
  { id: "feather", label: "Feather", Icon: Feather },
  { id: "moon", label: "Rest", Icon: Moon },
  { id: "pause", label: "Pause", Icon: Pause },
  { id: "eye", label: "Focus", Icon: Eye },
  // outdoor
  { id: "mountain", label: "Mountain", Icon: Mountain },
  { id: "mountain-snow", label: "Alpine", Icon: MountainSnow },
  { id: "tree-pine", label: "Pine", Icon: TreePine },
  { id: "trees", label: "Trail", Icon: Trees },
  { id: "tent", label: "Camp", Icon: Tent },
  { id: "sun", label: "Sun", Icon: Sun },
  { id: "sunrise", label: "Sunrise", Icon: Sunrise },
  // misc
  { id: "music", label: "Music", Icon: Music },
  { id: "coffee", label: "Coffee", Icon: Coffee },
  { id: "timer", label: "Timer", Icon: Timer },
  { id: "target", label: "Target", Icon: Target },
  { id: "zap", label: "Zap", Icon: Zap },
  { id: "sparkles", label: "Sparkle", Icon: Sparkles },
];

const ICON_MAP: Record<string, LucideIcon> = Object.fromEntries(
  TRAINING_ICONS.map((e) => [e.id, e.Icon]),
);

/** Lookup helper — returns null if the id is unknown or null. */
export function getTrainingIcon(id: string | null | undefined): LucideIcon | null {
  if (!id) return null;
  return ICON_MAP[id] ?? null;
}
