"use client";

import { AreaCardMenu } from "@/components/areas/AreaCardMenu";
import { AreasPageHeader } from "@/components/areas/AreasPageHeader";
import { AreasTree } from "@/components/areas/AreasTree";
import { Breadcrumbs } from "@/components/shell/Breadcrumbs";
import type { SidebarArea } from "@/lib/db/queries/sidebar";
import { useEffect, useState } from "react";

interface Props {
  initialAreas: SidebarArea[];
  userId: string;
  rootAvatarUrl: string | null;
  rootInitial: string;
  rootLabel: string;
}

export function AreasPageClient({
  initialAreas,
  userId,
  rootAvatarUrl,
  rootInitial,
  rootLabel,
}: Props) {
  const [areas, setAreas] = useState(initialAreas);

  useEffect(() => {
    setAreas(initialAreas);
  }, [initialAreas]);

  function handleCreated(area: SidebarArea) {
    setAreas((prev) => (prev.some((a) => a.id === area.id) ? prev : [...prev, area]));
  }

  function handleCreateFailed(id: string) {
    setAreas((prev) => prev.filter((area) => area.id !== id));
  }

  const isSentinel = (a: { name: string; emoji: string | null }) =>
    a.name === "No Area" && a.emoji === null;

  return (
    <>
      <div className="mb-6 flex items-center justify-between gap-4">
        <Breadcrumbs items={[{ label: "Areas" }]} />
        <AreasPageHeader
          userId={userId}
          currentAreaCount={areas.length}
          onCreated={handleCreated}
          onCreateFailed={handleCreateFailed}
        />
      </div>

      <header className="mb-4 text-center space-y-1">
        <h1 className="text-3xl font-semibold tracking-tight text-[var(--ink)]">
          Areas
        </h1>
        <p className="text-[14px] text-[var(--ink-muted)]">
          "Energy is the currency of productivity." — Ali Abdaal
        </p>
      </header>

      <AreasTree
        areas={areas}
        rootAvatarUrl={rootAvatarUrl}
        rootInitial={rootInitial}
        rootLabel={rootLabel}
      />

      {areas.length > 0 && (
        <section className="mt-10">
          <div className="flex items-baseline gap-3 mb-3">
            <h2 className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--ink-muted)]">
              Manage areas
            </h2>
            <span className="font-mono text-[11px] tabular-nums text-[var(--ink-muted)]">
              ({areas.length})
            </span>
          </div>
          <ul className="flex flex-col divide-y divide-[var(--edge)]">
            {areas.map((area) => (
              <li key={area.id} className="group/area-row flex items-center gap-3 py-2.5 px-1">
                {area.emoji ? (
                  <span className="text-base leading-none shrink-0" aria-hidden="true">
                    {area.emoji}
                  </span>
                ) : (
                  <span className="w-5 shrink-0" aria-hidden="true" />
                )}
                <span className="text-[15px] text-[var(--ink)] flex-1 leading-snug">
                  {area.name}
                  {isSentinel(area) && (
                    <em className="font-mono text-[10px] not-italic text-[var(--ink-muted)] ml-2 tracking-[0.06em]">
                      (auto-created bucket)
                    </em>
                  )}
                </span>
                <span className="font-mono text-[10px] tabular-nums text-[var(--ink-muted)] shrink-0">
                  {area.projects.length} project
                  {area.projects.length === 1 ? "" : "s"}
                </span>
                <AreaCardMenu areaId={area.id} areaName={area.name} areaEmoji={area.emoji} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
