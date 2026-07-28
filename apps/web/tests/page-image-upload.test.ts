import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock sonner so the rejection path can be asserted rather than inferred.
const toastErrorMock = vi.fn();
vi.mock("sonner", () => ({
  toast: Object.assign(() => undefined, {
    error: (...args: unknown[]) => toastErrorMock(...args),
  }),
}));

// Mock the browser Supabase client. The upload path is asserted by the args it
// hands storage, not by talking to a real bucket.
const uploadMock = vi.fn();
const getPublicUrlMock = vi.fn();
const fromMock = vi.fn(() => ({ upload: uploadMock, getPublicUrl: getPublicUrlMock }));
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ storage: { from: fromMock } }),
}));

import {
  ACCEPTED_PAGE_IMAGE_MIME_TYPES,
  MAX_PAGE_IMAGE_BYTES,
  PAGE_IMAGE_BUCKET,
  pageImageRejection,
  usePageImageDrop,
  usePageImageUploader,
} from "@/components/pages/page-image-upload";
import type { Editor } from "@/components/pages/PageBlockEditor";

/** A File of a given type and byte length, without allocating the bytes. */
function fakeFile(name: string, type: string, size = 1024): File {
  const file = new File(["x"], name, { type });
  Object.defineProperty(file, "size", { value: size });
  return file;
}

/** The minimum of a DataTransfer that the drop handlers actually read. */
function transfer(files: File[], types: string[] = ["Files"]) {
  return { types, files } as unknown as DataTransfer;
}

function dragEvent(files: File[], types?: string[]) {
  return {
    dataTransfer: transfer(files, types),
    defaultPrevented: false,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  };
}

function clipboardEvent(files: File[], types?: string[]) {
  return {
    clipboardData: transfer(files, types),
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  };
}

const PNG = () => fakeFile("shot.png", "image/png");
const EXE = () => fakeFile("payload.exe", "application/x-msdownload");

describe("pageImageRejection", () => {
  it("accepts every MIME type the bucket allows", () => {
    for (const type of ACCEPTED_PAGE_IMAGE_MIME_TYPES) {
      expect(pageImageRejection(fakeFile(`a.${type.split("/")[1]}`, type))).toBeNull();
    }
  });

  it("rejects a non-image by MIME type, naming the file", () => {
    const rejection = pageImageRejection(EXE());
    expect(rejection).toContain("payload.exe");
    expect(rejection).toContain("not a supported image");
  });

  it("rejects SVG, which the public bucket must not serve inline", () => {
    expect(pageImageRejection(fakeFile("x.svg", "image/svg+xml"))).not.toBeNull();
  });

  it("rejects an image over the size limit but accepts one exactly at it", () => {
    expect(pageImageRejection(fakeFile("big.png", "image/png", MAX_PAGE_IMAGE_BYTES + 1))).toContain(
      "larger than"
    );
    expect(pageImageRejection(fakeFile("edge.png", "image/png", MAX_PAGE_IMAGE_BYTES))).toBeNull();
  });
});

describe("usePageImageUploader", () => {
  beforeEach(() => {
    toastErrorMock.mockReset();
    uploadMock.mockReset();
    getPublicUrlMock.mockReset();
    fromMock.mockClear();
  });

  it("uploads under the owner-scoped path and returns the public URL", async () => {
    uploadMock.mockResolvedValue({ error: null });
    getPublicUrlMock.mockReturnValue({
      data: { publicUrl: "https://ref.supabase.co/storage/v1/object/public/page-images/x.png" },
    });

    const { result } = renderHook(() => usePageImageUploader("user-1", "page-9"));
    const url = await result.current(PNG());

    expect(fromMock).toHaveBeenCalledWith(PAGE_IMAGE_BUCKET);
    const [path, , options] = uploadMock.mock.calls[0];
    // The bucket's RLS policies key on the first path segment being the uid.
    expect(path).toMatch(/^user-1\/page-9\/[0-9a-f-]{36}\.png$/);
    expect(options).toMatchObject({ upsert: false, contentType: "image/png" });
    expect(url).toBe("https://ref.supabase.co/storage/v1/object/public/page-images/x.png");
  });

  it("toasts and throws on a disallowed file without touching storage", async () => {
    const { result } = renderHook(() => usePageImageUploader("user-1", "page-9"));
    await expect(result.current(EXE())).rejects.toThrow(/not a supported image/);
    expect(uploadMock).not.toHaveBeenCalled();
    expect(toastErrorMock).toHaveBeenCalledTimes(1);
  });

  it("toasts and throws when storage rejects the upload", async () => {
    uploadMock.mockResolvedValue({ error: { message: "Bucket not found" } });
    const { result } = renderHook(() => usePageImageUploader("user-1", "page-9"));
    await expect(result.current(PNG())).rejects.toBeTruthy();
    expect(toastErrorMock).toHaveBeenCalledWith(expect.stringContaining("Bucket not found"));
  });
});

describe("usePageImageDrop", () => {
  const editor = {} as Editor;
  const uploader = vi.fn(async () => "https://ref.supabase.co/x.png");

  beforeEach(() => {
    toastErrorMock.mockReset();
    uploader.mockClear();
  });

  it("vetoes a drop carrying a disallowed file, before BlockNote can insert a block", () => {
    const { result } = renderHook(() => usePageImageDrop(editor, uploader));
    const e = dragEvent([EXE()]);
    act(() => result.current.onDropCapture(e as never));

    // stopPropagation is what keeps the event from reaching BlockNote's own
    // ProseMirror drop listener on the descendant node.
    expect(e.preventDefault).toHaveBeenCalled();
    expect(e.stopPropagation).toHaveBeenCalled();
    expect(toastErrorMock).toHaveBeenCalledWith(expect.stringContaining("payload.exe"));
  });

  it("stands aside for a drop where every file is an allowed image", () => {
    const { result } = renderHook(() => usePageImageDrop(editor, uploader));
    const e = dragEvent([PNG()]);
    act(() => result.current.onDropCapture(e as never));

    expect(e.preventDefault).not.toHaveBeenCalled();
    expect(e.stopPropagation).not.toHaveBeenCalled();
    expect(toastErrorMock).not.toHaveBeenCalled();
  });

  it("vetoes the whole drop when one file among several is disallowed", () => {
    const { result } = renderHook(() => usePageImageDrop(editor, uploader));
    const e = dragEvent([PNG(), EXE()]);
    act(() => result.current.onDropCapture(e as never));

    expect(e.stopPropagation).toHaveBeenCalled();
    expect(toastErrorMock).toHaveBeenCalledTimes(1);
  });

  it("ignores a drag that carries no files, leaving block reordering alone", () => {
    const { result } = renderHook(() => usePageImageDrop(editor, uploader));
    const e = dragEvent([], ["text/plain"]);
    act(() => result.current.onDropCapture(e as never));

    expect(e.preventDefault).not.toHaveBeenCalled();
    expect(e.stopPropagation).not.toHaveBeenCalled();
  });

  it("vetoes a paste carrying a disallowed file", () => {
    const { result } = renderHook(() => usePageImageDrop(editor, uploader));
    const e = clipboardEvent([EXE()]);
    act(() => result.current.onPasteCapture(e as never));

    expect(e.preventDefault).toHaveBeenCalled();
    expect(e.stopPropagation).toHaveBeenCalled();
  });

  it("ignores a text paste so the link-embed unfurl still runs", () => {
    const { result } = renderHook(() => usePageImageDrop(editor, uploader));
    const e = clipboardEvent([], ["text/plain"]);
    act(() => result.current.onPasteCapture(e as never));

    expect(e.preventDefault).not.toHaveBeenCalled();
    expect(e.stopPropagation).not.toHaveBeenCalled();
  });

  it("only claims dragover for file drags, so text drags keep their own behaviour", () => {
    const { result } = renderHook(() => usePageImageDrop(editor, uploader));

    const withFiles = dragEvent([PNG()]);
    act(() => result.current.onDragOver(withFiles as never));
    expect(withFiles.preventDefault).toHaveBeenCalled();

    const withoutFiles = dragEvent([], ["text/plain"]);
    act(() => result.current.onDragOver(withoutFiles as never));
    expect(withoutFiles.preventDefault).not.toHaveBeenCalled();
  });

  it("skips the wrapper fallback once BlockNote has already handled the drop", () => {
    const { result } = renderHook(() => usePageImageDrop(editor, uploader));
    const e = { ...dragEvent([PNG()]), defaultPrevented: true };
    act(() => result.current.onDrop(e as never));

    expect(e.preventDefault).not.toHaveBeenCalled();
    expect(uploader).not.toHaveBeenCalled();
  });
});
