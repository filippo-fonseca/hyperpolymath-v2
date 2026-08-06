import CaptureWidget from "./CaptureWidget";
import NewTaskWidget from "./NewTaskWidget";
import TalkWidget from "./TalkWidget";
import TodayWidget from "./TodayWidget";

/** Side-effect import: registers all WidgetKit kinds with the native runtime. */
export function registerWidgets(): void {
  // Touching the factories keeps Metro from tree-shaking createWidget() calls.
  void TodayWidget;
  void TalkWidget;
  void NewTaskWidget;
  void CaptureWidget;
}

export { CaptureWidget, NewTaskWidget, TalkWidget, TodayWidget };
