/**
 * Wiki loading placeholders. Every dimension mirrors the real surface
 * (PageScaffold §2.9 plus each route's own className) so the content lands on
 * top of the skeleton with no reflow, the same contract as the area route's
 * loading boundary. Server-safe: no hooks, no client directive.
 */

const bar = "rounded bg-[var(--hover)]";

/** Body lines for the BlockNote editor while its client-only chunk loads. */
export function WikiEditorSkeleton() {
  return (
    <div aria-hidden className="flex flex-col gap-3 pt-2">
      <div className={`h-4 w-[92%] ${bar}`} />
      <div className={`h-4 w-[84%] ${bar}`} />
      <div className={`h-4 w-[88%] ${bar}`} />
      <div className={`h-4 w-[46%] ${bar}`} />
      <div className="h-3" />
      <div className={`h-4 w-[90%] ${bar}`} />
      <div className={`h-4 w-[72%] ${bar}`} />
    </div>
  );
}

/** /wiki/[pageId]: breadcrumb, icon + title, meta, properties, body. */
export function WikiPageSkeleton() {
  return (
    <div className="mx-auto w-full max-w-[784px] px-8 pt-10 pb-24">
      <output aria-label="Loading page" className="block animate-pulse motion-reduce:animate-none">
        {/* Breadcrumb */}
        <div className={`mb-2 h-4 w-40 ${bar}`} />
        {/* Icon + title, header actions right */}
        <div className="flex items-start gap-3">
          <div className="size-8 shrink-0 rounded-lg bg-[var(--hover)]" />
          <div className="mt-1 h-7 w-72 rounded-lg bg-[var(--hover)]" />
          <div className="ml-auto flex shrink-0 items-center gap-1">
            <div className="size-7 rounded-lg bg-[var(--hover)]" />
            <div className="size-7 rounded-lg bg-[var(--hover)]" />
            <div className="size-7 rounded-lg bg-[var(--hover)]" />
          </div>
        </div>
        {/* Meta row */}
        <div className={`mt-3 h-4 w-36 ${bar}`} />
        <div className="mt-4 flex flex-col gap-4">
          {/* Project chips */}
          <div className="flex gap-2">
            <div className="h-5 w-24 rounded-full bg-[var(--hover)]" />
            <div className="h-5 w-16 rounded-full bg-[var(--hover)]" />
          </div>
          <div className="min-h-[400px]">
            <WikiEditorSkeleton />
          </div>
        </div>
      </output>
    </div>
  );
}

/** /wiki: header, journal rail, explorer toolbar and a grid of page cards. */
export function WikiHomeSkeleton() {
  return (
    <div className="mx-auto flex h-full min-h-0 w-full max-w-[1120px] flex-col gap-6 overflow-hidden px-8 pt-10 pb-6">
      <output
        aria-label="Loading wiki"
        className="flex min-h-0 flex-col gap-6 animate-pulse motion-reduce:animate-none"
      >
        {/* Title row, two ghost actions right */}
        <div className="flex items-start gap-3">
          <div className="mt-1 h-7 w-24 rounded-lg bg-[var(--hover)]" />
          <div className="ml-auto flex shrink-0 items-center gap-2">
            <div className="h-8 w-24 rounded-lg bg-[var(--hover)]" />
            <div className="h-8 w-24 rounded-lg bg-[var(--hover)]" />
          </div>
        </div>
        {/* Journal rail */}
        <div className="flex gap-3 overflow-hidden">
          <div className="h-36 w-64 shrink-0 rounded-xl border border-[var(--edge)] bg-[var(--surface-raised)]" />
          {Array.from({ length: 5 }, (_, i) => (
            <div
              // biome-ignore lint/suspicious/noArrayIndexKey: static placeholder list
              key={i}
              className="h-36 w-40 shrink-0 rounded-xl border border-[var(--edge)] bg-[var(--surface-raised)]"
            />
          ))}
        </div>
        {/* Explorer toolbar + grid */}
        <div className="flex min-h-0 flex-col gap-4 rounded-xl border border-[var(--edge)] p-4">
          <div className="flex items-center gap-2">
            <div className={`h-6 w-32 ${bar}`} />
            <div className="ml-auto h-7 w-48 rounded-lg bg-[var(--hover)]" />
          </div>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3">
            {Array.from({ length: 10 }, (_, i) => (
              <div
                // biome-ignore lint/suspicious/noArrayIndexKey: static placeholder list
                key={i}
                className="flex flex-col gap-2"
              >
                <div className="aspect-[4/5] rounded-lg bg-[var(--hover)]" />
                <div className={`h-3 w-3/4 ${bar}`} />
              </div>
            ))}
          </div>
        </div>
      </output>
    </div>
  );
}
