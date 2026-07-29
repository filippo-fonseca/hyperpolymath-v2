"use client";

import { AreaCreateDialog } from "@/components/areas/AreaCreateDialog";
import { Button } from "@/components/ui/button";
import type { SidebarArea } from "@/lib/db/queries/sidebar";
import { Plus } from "lucide-react";

interface Props {
  userId: string;
  currentAreaCount?: number;
  onCreated?: (area: SidebarArea) => void;
  onCreateFailed?: (id: string) => void;
}

/**
 * "New area" affordance for the /areas page header: the page's one primary
 * button (creating an area is the page's main action), wrapping
 * AreaCreateDialog as its trigger.
 */
export function AreasPageHeader({ userId, currentAreaCount, onCreated, onCreateFailed }: Props) {
  return (
    <AreaCreateDialog
      userId={userId}
      addOptimisticArea={undefined}
      currentAreaCount={currentAreaCount}
      onCreated={onCreated}
      onCreateFailed={onCreateFailed}
    >
      <Button size="sm" className="rounded-lg">
        <Plus className="size-4" />
        New area
      </Button>
    </AreaCreateDialog>
  );
}
