"use client";

import { Sidebar } from "./Sidebar";
import type { SidebarArea } from "@/lib/db/queries/sidebar";

interface Props {
  activeAreas: SidebarArea[];
  allAreas: SidebarArea[];
  graduationYear?: number | null;
  children: React.ReactNode;
}

export function AppShell({ activeAreas, allAreas, graduationYear, children }: Props) {
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground">
      <Sidebar initialActiveAreas={activeAreas} initialAllAreas={allAreas} graduationYear={graduationYear} />
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}
