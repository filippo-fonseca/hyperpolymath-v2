// apps/desktop/src/actions/png.ts
// Shared PNG helpers for screenshot flows (dispatcher describe flow + the
// computer-use loop). Extracted from dispatcher.ts so the computer-use client
// can reuse the downscale path AND read the dimensions it needs for
// coordinate scaling.

/** Chunked bytes→base64 (avoids call-stack limits on multi-MB screenshots). */
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

export interface DownscaledPng {
  /** PNG bytes after downscale (original bytes when no downscale needed). */
  bytes: Uint8Array;
  /** Dimensions of `bytes` in pixels. */
  width: number;
  height: number;
  /** Dimensions of the SOURCE png in pixels (retina capture pixels). */
  srcWidth: number;
  srcHeight: number;
}

/**
 * Downscale a PNG in the webview (createImageBitmap + canvas) so its long
 * edge is ≤ maxDim, reporting both source and output dimensions. THROWS on
 * decode/encode failure — callers that want best-effort behavior (the
 * describe flow) catch and fall back to the original bytes; the computer-use
 * loop treats failure as fatal because the dimensions are load-bearing for
 * coordinate scaling.
 */
export async function downscalePngWithInfo(
  png: Uint8Array,
  maxDim: number,
): Promise<DownscaledPng> {
  const blob = new Blob([png as unknown as BlobPart], { type: "image/png" });
  const bmp = await createImageBitmap(blob);
  const srcWidth = bmp.width;
  const srcHeight = bmp.height;
  const scale = Math.min(1, maxDim / Math.max(srcWidth, srcHeight));
  if (scale >= 1) {
    bmp.close();
    return { bytes: png, width: srcWidth, height: srcHeight, srcWidth, srcHeight };
  }
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(srcWidth * scale);
  canvas.height = Math.round(srcHeight * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bmp.close();
    throw new Error("canvas 2d context unavailable");
  }
  ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close();
  const out = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!out) throw new Error("canvas.toBlob returned null");
  const scaled = new Uint8Array(await out.arrayBuffer());
  return {
    bytes: scaled,
    width: canvas.width,
    height: canvas.height,
    srcWidth,
    srcHeight,
  };
}

/** Crop rectangle in SOURCE-pixel space (retina capture pixels). */
export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Crop `rect` (source-pixel space) out of a PNG, then downscale the crop so
 * its long edge is ≤ maxDim. Used by the computer-use loop's `zoom` action.
 * `srcWidth`/`srcHeight` report the FULL source png dimensions (not the
 * crop's) so callers can keep deriving full-frame scale factors, while
 * `width`/`height` are the emitted crop's dimensions. The rect is clamped
 * inside the bitmap; a degenerate rect collapses to a 1px sliver rather than
 * throwing. THROWS on decode/encode failure (same contract as
 * downscalePngWithInfo — dimensions are load-bearing for callers).
 */
export async function cropAndDownscalePng(
  png: Uint8Array,
  rect: CropRect,
  maxDim: number,
): Promise<DownscaledPng> {
  const blob = new Blob([png as unknown as BlobPart], { type: "image/png" });
  const bmp = await createImageBitmap(blob);
  const srcWidth = bmp.width;
  const srcHeight = bmp.height;
  const x = Math.min(Math.max(0, Math.round(rect.x)), srcWidth - 1);
  const y = Math.min(Math.max(0, Math.round(rect.y)), srcHeight - 1);
  const w = Math.max(1, Math.min(Math.round(rect.width), srcWidth - x));
  const h = Math.max(1, Math.min(Math.round(rect.height), srcHeight - y));
  const scale = Math.min(1, maxDim / Math.max(w, h));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(w * scale));
  canvas.height = Math.max(1, Math.round(h * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bmp.close();
    throw new Error("canvas 2d context unavailable");
  }
  ctx.drawImage(bmp, x, y, w, h, 0, 0, canvas.width, canvas.height);
  bmp.close();
  const out = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!out) throw new Error("canvas.toBlob returned null");
  return {
    bytes: new Uint8Array(await out.arrayBuffer()),
    width: canvas.width,
    height: canvas.height,
    srcWidth,
    srcHeight,
  };
}
