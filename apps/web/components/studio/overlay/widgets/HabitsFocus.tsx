"use client";

import { TodayHabitsWidget } from "@/components/lifeos/TodayHabitsWidget";
import { useStudioData } from "@/components/studio/data/useStudioData";
import { useStudioHabits } from "@/components/studio/data/hooks";

/**
 * HabitsFocus — reuse of the real `TodayHabitsWidget`.
 *
 * The studio habits slice already carries a trailing completion window keyed
 * exactly like the 2D `/habits` client; the widget filters to today itself, so
 * we hand it the window verbatim (its `{ habitId, completedDate }` shape matches
 * the widget's `initialCompletions` contract) and let its own queries stay live.
 */
export function HabitsFocus(): React.ReactElement {
  const { userId } = useStudioData();
  const { habits, todayYmd } = useStudioHabits();
  return (
    <TodayHabitsWidget
      userId={userId}
      initialHabits={habits.habits}
      initialCompletions={habits.completions}
      todayISO={todayYmd}
    />
  );
}

export default HabitsFocus;
