import { type PreviewBlock, type PreviewModel, extractPreviewModel } from "@/lib/pages/preview";
import { cn } from "@/lib/utils";

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
        "relative overflow-hidden rounded-t-[8px] border border-[var(--sd-line,var(--edge))] bg-[var(--surface-raised)]",
        size === "card" ? "aspect-[16/10]" : "aspect-[4/3]",
        className
      )}
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
          size === "card" ? "px-3 py-2" : "px-5 py-4"
        )}
      >
        {preview.isEmpty ? (
          <EmptyPreview size={size} />
        ) : (
          <div className={cn("space-y-1", size === "inspector" ? "space-y-2" : undefined)}>
            {preview.blocks.map((block, index) => (
              <PreviewLine key={`${block.kind}:${index}`} block={block} size={size} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/*
 * The lines below are a miniature facsimile of the document, not UI text, so
 * they keep sub-ladder font sizes; everything else (colour, radius, borders)
 * rides the tokens.
 */
function PreviewLine({ block, size }: { block: PreviewBlock; size: "card" | "inspector" }) {
 const textClass = size ==="card" ?"text-[8px] leading-[1.35]" :"text-micro leading-[1.45]";

  switch (block.kind) {
    case "heading":
      return (
        <p
          className={cn(
            "line-clamp-1 font-sans font-semibold text-[var(--ink)]",
 size ==="card" && block.level === 1 ?"text-micro" : textClass,
 size ==="inspector" && block.level === 1 ?"text-body" : undefined
          )}
        >
          {block.text}
        </p>
      );
    case "paragraph":
      return (
        <p className={cn("line-clamp-2 text-[var(--ink-muted)]", textClass)}>{block.text}</p>
      );
    case "bullet":
      return (
        <p
          className={cn("flex min-w-0 gap-1 text-[var(--ink-muted)]", textClass)}
          style={{ paddingLeft: `${(block.depth ?? 0) * 8}px` }}
        >
          <span className="mt-[0.45em] size-[3px] flex-shrink-0 rounded-full bg-[var(--ink-faint)]" />
          <span className="line-clamp-1">{block.text}</span>
        </p>
      );
    case "numbered":
      return (
        <p
          className={cn("flex min-w-0 gap-1 text-[var(--ink-muted)]", textClass)}
          style={{ paddingLeft: `${(block.depth ?? 0) * 8}px` }}
        >
          <span className="flex-shrink-0 font-mono text-[var(--ink-faint)]">1.</span>
          <span className="line-clamp-1">{block.text}</span>
        </p>
      );
    case "todo":
      return (
        <p className={cn("flex min-w-0 items-start gap-1 text-[var(--ink-muted)]", textClass)}>
          <span
            className={cn(
              "mt-[0.25em] grid size-[7px] flex-shrink-0 place-items-center border border-[var(--edge-strong)]",
              block.checked ? "border-[var(--ink-muted)] bg-[var(--ink-muted)]" : undefined
            )}
          >
            {block.checked ? (
              <span className="block size-[3px] rounded-full bg-[var(--surface-raised)]" />
            ) : null}
          </span>
          <span
            className={cn(
              "line-clamp-1",
              block.checked ? "text-[var(--ink-faint)] line-through" : undefined
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
            "line-clamp-2 border-l-2 border-[var(--edge-strong)] pl-1.5 italic text-[var(--ink-muted)]",
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
            "max-h-12 overflow-hidden rounded-[4px] bg-[var(--hover)] px-1.5 py-1 font-mono text-[var(--ink-muted)]",
 size ==="card" ?"text-[7px] leading-[1.35]" :"text-micro leading-[1.45]"
          )}
        >
          {block.text}
        </pre>
      );
    case "image":
      return (
        <div className="overflow-hidden rounded-[4px] bg-[var(--hover)]">
          {block.url ? (
            <img
              src={block.url}
              alt=""
              className={cn("w-full object-cover", size === "card" ? "h-8" : "h-16")}
              loading="lazy"
              decoding="async"
            />
          ) : (
            <div className={cn("bg-[var(--hover)]", size === "card" ? "h-8" : "h-16")} />
          )}
          {block.caption ? (
            <p
              className={cn(
                "truncate px-1 py-0.5 text-[var(--ink-faint)]",
 size ==="card" ?"text-[7px]" :"text-micro"
              )}
            >
              {block.caption}
            </p>
          ) : null}
        </div>
      );
    case "divider":
      return <div className="my-1 h-px bg-[var(--edge)]" />;
    case "table-hint":
      return (
        <div className="grid grid-cols-3 gap-[2px] rounded-[4px] bg-[var(--hover)] p-1">
          {Array.from({
            length: Math.min(6, Math.max(1, block.rows * Math.max(1, block.cols))),
          }).map((_, index) => (
            <span key={index} className="h-1.5 bg-[var(--edge-strong)]" />
          ))}
        </div>
      );
  }
}

function EmptyPreview({ size }: { size: "card" | "inspector" }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-1 text-[var(--ink-faint)]">
      <MiniPageIcon className={size === "card" ? "h-7 w-6" : "h-12 w-10"} />
 <span className={cn("font-sans", size ==="card" ?"text-[8px]" :"text-micro")}>Empty</span>
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
