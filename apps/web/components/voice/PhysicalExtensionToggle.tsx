"use client";

import { usePhysicalExtensionSetting } from "@/lib/voice/physical-extension/use-physical-extension-setting";

export function PhysicalExtensionToggle(): React.ReactElement {
  const { enabled, setEnabled } = usePhysicalExtensionSetting();

  return (
    <label className="flex items-start gap-3 cursor-pointer">
      <input
        type="checkbox"
        checked={enabled}
        onChange={(e) => setEnabled(e.target.checked)}
        className="mt-1"
      />
      <span className="flex flex-col gap-1">
        <span className="text-sm font-medium">Physical Extension Mode</span>
        <span className="text-xs text-muted-foreground">
          Use a hardware wake-word device (e.g., Arduino + DF2301Q) as the trigger.
          When on, the browser does not listen ambiently — the mic only acquires
          when the physical device fires. Cmd+Shift+J still works.
        </span>
      </span>
    </label>
  );
}
