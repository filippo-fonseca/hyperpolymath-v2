"use client";

import type { Editor } from "@/components/pages/PageBlockEditor";
import { createClient } from "@/lib/supabase/client";
import type { PartialBlock } from "@blocknote/core";
import { useCallback, useMemo } from "react";
import { toast } from "sonner";

/**
 * Wiki page image uploads (issue #349).
 *
 * BlockNote already ships the whole insertion surface — the `/` slash menu's
 * Image item, the file panel, the ProseMirror drop plugin and the clipboard
 * file path — but every one of them is gated on the editor being given an
 * `uploadFile` option. Without it the file panel renders an "Embed URL" field
 * and nothing else, and a dropped file is ignored. This module supplies that
 * seam plus the guards BlockNote does not have an opinion about: a size limit,
 * a MIME allow-list, and a visible rejection instead of a silent no-op.
 *
 * Storage follows the avatars pattern (components/settings/ProfileSection.tsx):
 * a client-side upload straight to Supabase Storage, then the public URL. The
 * bucket and its owner-scoped RLS policies live in
 * drizzle/0039_page_images_bucket.sql.
 */

/** Supabase Storage bucket created by 0039_page_images_bucket.sql. */
export const PAGE_IMAGE_BUCKET = "page-images";

/** Matches the bucket's `file_size_limit`, so a reject here mirrors the server. */
export const MAX_PAGE_IMAGE_BYTES = 10 * 1024 * 1024;

/**
 * Matches the bucket's `allowed_mime_types`. SVG is deliberately absent: the
 * bucket is public-read and Supabase serves SVG inline, which makes it a
 * script-carrying format rather than an image one.
 */
export const ACCEPTED_PAGE_IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
] as const;

/** `accept` attribute value for any file input that feeds this uploader. */
export const PAGE_IMAGE_ACCEPT = ACCEPTED_PAGE_IMAGE_MIME_TYPES.join(",");

const MIME_EXTENSION: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
};

/**
 * Why this file cannot be uploaded, or null if it can. The message is written
 * to be shown to the user verbatim.
 */
export function pageImageRejection(file: File): string | null {
  if (!(ACCEPTED_PAGE_IMAGE_MIME_TYPES as readonly string[]).includes(file.type)) {
    return `"${file.name}" is not a supported image. Use JPEG, PNG, WebP, GIF, or AVIF.`;
  }
  if (file.size > MAX_PAGE_IMAGE_BYTES) {
    return `"${file.name}" is larger than ${MAX_PAGE_IMAGE_BYTES / (1024 * 1024)}MB.`;
  }
  return null;
}

/** The files carried by a drag or a clipboard event, or null if there are none. */
function transferredFiles(transfer: DataTransfer | null): File[] | null {
  if (!transfer) return null;
  // `types` is the reliable signal: a plain text or HTML drag can still expose
  // an empty `files` list, and a rich-text paste from another editor carries
  // both "Files" and "text/html". Only treat it as a file gesture when the
  // browser says so, which is the same check BlockNote's own drop plugin makes.
  if (!Array.from(transfer.types).includes("Files")) return null;
  const files = Array.from(transfer.files);
  return files.length > 0 ? files : null;
}

/**
 * Build the `uploadFile` option for `useCreateBlockNote`. Rejections surface a
 * toast and then throw, which is what BlockNote's file panel expects: it
 * catches the rejection and shows its own inline error state.
 */
export function usePageImageUploader(userId: string, pageId: string) {
  return useMemo(
    () =>
      async function uploadPageImage(file: File): Promise<string> {
        const rejection = pageImageRejection(file);
        if (rejection) {
          toast.error(rejection);
          throw new Error(rejection);
        }

        const supabase = createClient();
        // One object per upload, so images are immutable and their public URLs
        // need no cache-buster. The leading userId segment is what the bucket's
        // RLS policies check.
        const ext = MIME_EXTENSION[file.type] ?? "bin";
        const path = `${userId}/${pageId}/${crypto.randomUUID()}.${ext}`;

        const { error } = await supabase.storage.from(PAGE_IMAGE_BUCKET).upload(path, file, {
          upsert: false,
          contentType: file.type,
          cacheControl: "3600",
        });
        if (error) {
          toast.error(`Image upload failed. ${error.message}`);
          throw error;
        }

        const { data } = supabase.storage.from(PAGE_IMAGE_BUCKET).getPublicUrl(path);
        return data.publicUrl;
      },
    [pageId, userId]
  );
}

type Uploader = ReturnType<typeof usePageImageUploader>;

/**
 * Drop and paste handlers for the editor wrapper.
 *
 * The capture-phase handlers run before BlockNote's own ProseMirror listeners
 * (which sit on a descendant node), so they are the only place a disallowed
 * file can be vetoed before an empty block is inserted for it. When every file
 * passes, they stand aside and let BlockNote insert at the drop position and
 * call `uploadFile` itself.
 *
 * The bubble-phase `onDrop` is the fallback for a drop that lands on the
 * wrapper's own padding rather than on the ProseMirror surface: BlockNote never
 * sees that event, so we append the images at the end of the document instead
 * of dropping the gesture on the floor.
 */
export function usePageImageDrop(editor: Editor, uploadFile: Uploader) {
  const veto = useCallback((files: File[]): boolean => {
    const rejection = files.map(pageImageRejection).find(Boolean);
    if (!rejection) return false;
    toast.error(rejection);
    return true;
  }, []);

  const onDropCapture = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      const files = transferredFiles(e.dataTransfer);
      if (!files) return;
      if (!veto(files)) return;
      e.preventDefault();
      e.stopPropagation();
    },
    [veto]
  );

  const onPasteCapture = useCallback(
    (e: React.ClipboardEvent<HTMLDivElement>) => {
      const files = transferredFiles(e.clipboardData);
      if (!files) return;
      if (!veto(files)) return;
      e.preventDefault();
      e.stopPropagation();
    },
    [veto]
  );

  const onDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    // Without this the browser refuses to fire `drop` anywhere on the wrapper
    // outside the contenteditable surface, so the fallback below never runs.
    if (transferredFiles(e.dataTransfer)) e.preventDefault();
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      // Already handled: either BlockNote's drop plugin took it, or the capture
      // handler above vetoed it.
      if (e.defaultPrevented) return;
      const files = transferredFiles(e.dataTransfer);
      if (!files || files.some(pageImageRejection)) return;
      e.preventDefault();
      void appendImageBlocks(editor, files, uploadFile);
    },
    [editor, uploadFile]
  );

  return { onDropCapture, onPasteCapture, onDragOver, onDrop };
}

/**
 * Append one image block per file at the end of the document, uploading each
 * in turn and filling in its url. A failed upload removes its placeholder so
 * the page is not left holding an empty image block.
 */
async function appendImageBlocks(editor: Editor, files: File[], uploadFile: Uploader) {
  for (const file of files) {
    const doc = editor.document;
    const last = doc[doc.length - 1];
    if (!last) return;

    const placeholder = { type: "image", props: { name: file.name } } as PartialBlock;
    // Reuse a trailing empty paragraph rather than leaving it stranded above
    // the image, which is what BlockNote's own insertion path does.
    const isEmptyParagraph =
      last.type === "paragraph" && Array.isArray(last.content) && last.content.length === 0;
    const blockId = isEmptyParagraph
      ? editor.updateBlock(last, placeholder).id
      : editor.insertBlocks([placeholder], last, "after")[0].id;

    try {
      const url = await uploadFile(file);
      editor.updateBlock(blockId, { props: { url } } as PartialBlock);
    } catch {
      // The uploader has already toasted the reason.
      editor.removeBlocks([blockId]);
    }
  }
}
