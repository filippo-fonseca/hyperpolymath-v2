"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AreaCreateDialog } from "@/components/areas/AreaCreateDialog";

interface Props {
  userId: string;
}

/**
 * Standalone "New Area" button for the /areas page.
 *
 * Does NOT use the sidebar's optimistic dispatcher — relies on router.refresh()
 * inside AreaCreateDialog (when addOptimisticArea is absent) so the SSR page
 * re-fetches after a successful create.
 */
export function AreasPageHeader({ userId }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex justify-end">
      <AreaCreateDialog userId={userId} addOptimisticArea={undefined}>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setOpen(!open)}
          className="font-mono text-[11px] uppercase tracking-[0.10em] h-8 px-3 gap-1.5"
        >
          <Plus className="h-3.5 w-3.5" />
          New Area
        </Button>
      </AreaCreateDialog>
    </div>
  );
}
