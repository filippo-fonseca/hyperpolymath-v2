import "server-only";

import { fetchBriefingItems } from "./fetch";
import { briefingModelConfig, synthesizeBriefing } from "./synthesis";
import type { BriefingData } from "./types";

export async function getBriefingData(): Promise<BriefingData> {
  const { items, failedSources } = await fetchBriefingItems();
  const synthesis = await synthesizeBriefing(items);
  return {
    generatedAt: new Date().toISOString(),
    sourceCount: items.reduce((set, item) => set.add(item.sourceId), new Set<string>()).size,
    failedSources,
    items,
    synthesis,
    config: briefingModelConfig(),
  };
}

export type {
  BriefingCategory,
  BriefingData,
  BriefingItem,
  BriefingModelWatch,
  BriefingSection,
  BriefingSynthesis,
} from "./types";
