"use client";

import { usePhysicalExtension } from "@/lib/voice/physical-extension/use-physical-extension";
import { usePhysicalExtensionSetting } from "@/lib/voice/physical-extension/use-physical-extension-setting";

export function PhysicalExtensionListener(): null {
  const { enabled } = usePhysicalExtensionSetting();
  usePhysicalExtension(enabled);
  return null;
}
