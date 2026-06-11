"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { AreaCreateDialog } from "@/components/areas/AreaCreateDialog";

interface Props {
  userId: string;
}

/**
 * Standalone "New Area" affordance for the /areas page.
 *
 * Sized to sit on the breadcrumb row — mono caps, hairline, no filled
 * button chrome — so it reads as a quiet utility next to the breadcrumb
 * rather than a hero call-to-action competing with the centered title.
 */
export function AreasPageHeader({ userId }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <AreaCreateDialog userId={userId} addOptimisticArea={undefined}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="group inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.10em] text-[var(--ink-muted)] hover:text-[var(--ink)] transition-colors duration-150 ease-out cursor-pointer-always"
      >
        <Plus className="h-3 w-3 opacity-70 group-hover:opacity-100 transition-opacity" />
        New area
      </button>
    </AreaCreateDialog>
  );
}
