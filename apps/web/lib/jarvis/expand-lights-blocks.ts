/**
 * Expand authored `control_lights` routine blocks (allDevices / devices[]) into
 * one runnable block per target nickname with a valid ControlLights seed
 * `{ type, on, device }`. Called at the start of `runRoutine`.
 */

import type { RoutineBlock } from "@hyperpolymath/jarvis-core";
import { loadUserGoveeDevices } from "@/lib/govee/resolve";
import {
  lightsDirectiveForDevice,
  readLightsParams,
} from "@/lib/jarvis/lights-block-params";

export async function expandLightsBlocks(
  blocks: RoutineBlock[],
  userId: string,
): Promise<RoutineBlock[]> {
  const needsExpand = blocks.some((b) => b.tool === "control_lights");
  if (!needsExpand) return blocks;

  const registered = await loadUserGoveeDevices(userId);
  const registeredNames = registered.map((d) => d.name);

  const out: RoutineBlock[] = [];
  for (const block of blocks) {
    if (block.tool !== "control_lights") {
      out.push(block);
      continue;
    }

    const authored = readLightsParams(block);
    const targets = authored.allDevices
      ? registeredNames
      : authored.devices.filter((name) =>
          registeredNames.some((n) => n.toLowerCase() === name.toLowerCase()),
        );

    // Nothing to fan out — leave as-is so the turn fails with a clear Govee error.
    if (targets.length === 0) {
      out.push({
        ...block,
        params: { type: "power", on: authored.on },
        nlDirective:
          block.nlDirective?.trim() ||
          (authored.on ? "Turn on the default light." : "Turn off the default light."),
      });
      continue;
    }

    for (let i = 0; i < targets.length; i++) {
      const device = targets[i]!;
      out.push({
        ...block,
        id: targets.length === 1 ? block.id : `${block.id}:${i}`,
        params: { type: "power", on: authored.on, device },
        nlDirective:
          block.nlDirective?.trim() || lightsDirectiveForDevice(authored.on, device),
      });
    }
  }
  return out;
}
