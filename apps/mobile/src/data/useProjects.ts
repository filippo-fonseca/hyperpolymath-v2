// Projects data layer (read-only in v2 — projects are managed on web).
// Areas with nested projects, used for task project assignment.

import { useQuery } from "@tanstack/react-query";

import { getProjects, type DeviceArea, type DeviceProject } from "../api/device";
import { queryKeys } from "./queryKeys";

export type { DeviceArea, DeviceProject };

async function fetchProjects(): Promise<DeviceArea[]> {
  const areas = await getProjects();
  if (areas === null) throw new Error("projects fetch failed");
  return areas;
}

export function useProjects() {
  return useQuery({ queryKey: queryKeys.projects, queryFn: fetchProjects });
}
