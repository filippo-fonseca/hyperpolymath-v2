import CaptureWidget from "./CaptureWidget";
import HabitsWidget from "./HabitsWidget";
import TasksWidget from "./TasksWidget";

/** Side-effect import: registers all WidgetKit kinds with the native runtime. */
export function registerWidgets(): void {
  // Touching the factories keeps Metro from tree-shaking createWidget() calls.
  void TasksWidget;
  void HabitsWidget;
  void CaptureWidget;
}

export { CaptureWidget, HabitsWidget, TasksWidget };
