import { cn } from "@/lib/utils";
import { extractPreviewModel, type PreviewBlock, type PreviewModel } from "@/lib/pages/preview";

export interface PagePreviewThumbPage {
  title?: string | null;
  content?: string | null;
  contentJson?: unknown;
  coverImageUrl?: string | null;
}

export interface PagePreviewThumbProps {
  page: PagePreviewThumbPage;
  model?: PreviewModel;
  size?: "card" | "inspector";
  className?: string;
}

export function PagePreviewThumb({ page, model, size = "card", className }: PagePreviewThumbProps) {
  const preview = model ?? extractPreviewModel(page.contentJson, page.content);
  const coverImageUrl = page.coverImageUrl;

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-t-[8px] border border-[var(--edge)] bg-white shadow-[0_10px_24px_hsl(235_15%_0%_/_0.14)] dark:bg-[var(--sd-dark-box,#20222c)]",
        size === "card" ? "aspect-[16/10]" : "aspect-[4/3]",
        className
      )}
      style={{ borderColor: "var(--sd-line, var(--edge))" }}
    >
      {coverImageUrl ? (
        <div className={cn("relative overflow-hidden", size === "card" ? "h-[24%]" : "h-[28%]")}>
          <img
            src={coverImageUrl}
            alt=""
            className="h-full w-full object-cover"
            loading="lazy"
            decoding="async"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-black/0 to-black/10" />
        </div>
      ) : null}

      <div
        className={cn(
          "absolute inset-x-0 bottom-0 overflow-hidden",
          coverImageUrl ? "top-[24%]" : "top-0",
          coverImageUrl && size === "inspector" ? "top-[28%]" : undefined,
          size === "card" ? "px-3 py-2.5" : "px-5 py-4"
        )}
      >
        {preview.isEmpty ? (
          <EmptyPreview size={size} />
        ) : (
          <div className={cn("space-y-1.5", size === "inspector" ? "space-y-2" : undefined)}>
            {preview.blocks.map((block, index) => (
              <PreviewLine key={`${block.kind}:${index}`} block={block} size={size} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function PreviewLine({ block, size }: { block: PreviewBlock; size: "card" | "inspector" }) {
  const textClass = size === "card" ? "text-[8px] leading-[1.35]" : "text-[11px] leading-[1.45]";

  switch (block.kind) {
    case "heading":
      return (
        <p
          className={cn(
            "line-clamp-1 font-semibold text-slate-950 dark:text-slate-100",
            block.level === 1 ? "font-serif" : "font-sans",
            size === "card" && block.level === 1 ? "text-[10px]" : textClass,
            size === "inspector" && block.level === 1 ? "text-[15px]" : undefined
          )}
        >
          {block.text}
        </p>
      );
    case "paragraph":
      return (
        <p className={cn("line-clamp-2 text-slate-700 dark:text-slate-300", textClass)}>
          {block.text}
        </p>
      );
    case "bullet":
      return (
        <p
          className={cn("flex min-w-0 gap-1 text-slate-700 dark:text-slate-300", textClass)}
          style={{ paddingLeft: `${(block.depth ?? 0) * 8}px` }}
        >
          <span className="mt-[0.45em] size-[3px] flex-shrink-0 rounded-full bg-slate-400 dark:bg-slate-500" />
          <span className="line-clamp-1">{block.text}</span>
        </p>
      );
    case "numbered":
      return (
        <p
          className={cn("flex min-w-0 gap-1 text-slate-700 dark:text-slate-300", textClass)}
          style={{ paddingLeft: `${(block.depth ?? 0) * 8}px` }}
        >
          <span className="flex-shrink-0 font-mono text-slate-400 dark:text-slate-500">1.</span>
          <span className="line-clamp-1">{block.text}</span>
        </p>
      );
    case "todo":
      return (
        <p
          className={cn(
            "flex min-w-0 items-start gap-1 text-slate-700 dark:text-slate-300",
            textClass
          )}
        >
          <span
            className={cn(
              "mt-[0.25em] grid size-[7px] flex-shrink-0 place-items-center rounded-[2px] border border-slate-300 dark:border-slate-500",
              block.checked ? "bg-[var(--hud-cyan)] border-[var(--hud-cyan)]" : undefined
            )}
          >
            {block.checked ? <span className="block size-[3px] rounded-full bg-slate-950" /> : null}
          </span>
          <span
            className={cn(
              "line-clamp-1",
              block.checked ? "text-slate-500 line-through dark:text-slate-400" : undefined
            )}
          >
            {block.text}
          </span>
        </p>
      );
    case "quote":
      return (
        <p
          className={cn(
            "line-clamp-2 border-l-2 border-slate-300 pl-1.5 italic text-slate-600 dark:border-slate-600 dark:text-slate-300",
            textClass
          )}
        >
          {block.text}
        </p>
      );
    case "code":
      return (
        <pre
          className={cn(
            "max-h-12 overflow-hidden rounded-[4px] bg-slate-100 px-1.5 py-1 font-mono text-slate-700 dark:bg-slate-950/45 dark:text-slate-300",
            size === "card" ? "text-[7px] leading-[1.35]" : "text-[10px] leading-[1.45]"
          )}
        >
          {block.text}
        </pre>
      );
    case "image":
      return (
        <div className="overflow-hidden rounded-[5px] border border-slate-200 bg-slate-100 dark:border-slate-700 dark:bg-slate-800">
          {block.url ? (
            <img
              src={block.url}
              alt=""
              className={cn("w-full object-cover", size === "card" ? "h-8" : "h-16")}
              loading="lazy"
              decoding="async"
            />
          ) : (
            <div
              className={cn(
                "bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-700",
                size === "card" ? "h-8" : "h-16"
              )}
            />
          )}
          {block.caption ? (
            <p
              className={cn(
                "truncate px-1 py-0.5 text-slate-500 dark:text-slate-400",
                size === "card" ? "text-[7px]" : "text-[10px]"
              )}
            >
              {block.caption}
            </p>
          ) : null}
        </div>
      );
    case "divider":
      return <div className="my-1 h-px bg-slate-200 dark:bg-slate-700" />;
    case "table-hint":
      return (
        <div className="grid grid-cols-3 gap-[2px] rounded-[4px] border border-slate-200 bg-slate-100 p-1 dark:border-slate-700 dark:bg-slate-900/55">
          {Array.from({
            length: Math.min(6, Math.max(1, block.rows * Math.max(1, block.cols))),
          }).map((_, index) => (
            <span
              key={index}
              className="h-1.5 rounded-[1px] bg-slate-300/80 dark:bg-slate-600/80"
            />
          ))}
        </div>
      );
  }
}

function EmptyPreview({ size }: { size: "card" | "inspector" }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-1.5 text-slate-400 dark:text-slate-500">
      <MiniPageIcon className={size === "card" ? "h-7 w-6" : "h-12 w-10"} />
      <span className={cn("font-mono uppercase", size === "card" ? "text-[8px]" : "text-[10px]")}>
        Empty
      </span>
    </div>
  );
}

function MiniPageIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 36 44" aria-hidden="true" className={className} fill="none">
      <path d="M7 2.5h15.5L29 9v32.5H7V2.5Z" fill="currentColor" opacity="0.1" />
      <path d="M7 2.5h15.5L29 9v32.5H7V2.5Z" stroke="currentColor" strokeWidth="1.5" />
      <path d="M22.5 2.5V9H29" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M11 17h14M11 23h12M11 29h9"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity="0.45"
      />
    </svg>
  );
}
