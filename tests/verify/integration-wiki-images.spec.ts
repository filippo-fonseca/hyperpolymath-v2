import { Buffer } from "node:buffer";
import { expect, test } from "@playwright/test";
import { ensureEvidenceDir, settle, shot, writeArtifact } from "./helpers/cockpit";

/**
 * Wave-1 integration: U2's wiki image support, exercised for real.
 *
 * U2 could only argue these at code level. This drives the three paths that
 * matter (slash menu upload, drag-and-drop, rejection) against the actual
 * `page-images` bucket on the local Supabase stack.
 */

// A real 1x1 PNG, so Supabase Storage and the <img> decode path both see a
// genuine image rather than a renamed text file.
const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

test.beforeAll(() => {
  ensureEvidenceDir();
});

/** Open the first seeded wiki page and wait for BlockNote to mount. */
async function openWikiPage(page: import("@playwright/test").Page) {
  await page.goto("/wiki", { waitUntil: "domcontentloaded" });
  await settle(page);
  await page.locator('a[href^="/wiki/"]').first().click();
  await page.waitForURL(/\/wiki\/[0-9a-f-]{36}/, { timeout: 20_000 });
  await page.locator('[contenteditable="true"]').first().waitFor({ timeout: 30_000 });
  await settle(page, 1500);
}

test("U2: the slash menu's Image item opens a file panel with a working Upload tab", async ({
  page,
}) => {
  await openWikiPage(page);

  const editable = page.locator('[contenteditable="true"]').first();
  await editable.click();
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await page.keyboard.type("/image");
  await page.waitForTimeout(1200);

  await shot(page, "u2-slash-menu-image");

  // Choose the Image item from the custom SuggestionMenuController.
  await page.keyboard.press("Enter");
  await page.waitForTimeout(1500);

  const panel = page.locator(".bn-file-panel, [class*='bn-panel']").first();
  await expect(panel, "the BlockNote file panel did not open").toBeVisible({ timeout: 15_000 });

  // The criterion is an actual Upload tab, not just the Embed-URL field that a
  // missing `uploadFile` leaves behind.
  const panelText = await panel.innerText();
  const fileInput = page.locator('.bn-file-panel input[type="file"], input[type="file"]').first();

  writeArtifact("u2-file-panel.json", {
    panelText: panelText.slice(0, 300),
    hasUploadTab: /upload/i.test(panelText),
    fileInputCount: await page.locator('input[type="file"]').count(),
  });

  await shot(page, "u2-file-panel-open");

  expect(/upload/i.test(panelText), "the file panel has no Upload tab").toBe(true);
  await expect(fileInput, "no file input in the file panel").toBeAttached({ timeout: 10_000 });
});

test("U2: uploading through the file panel inserts an image that survives a reload", async ({
  page,
}) => {
  await openWikiPage(page);

  const editable = page.locator('[contenteditable="true"]').first();
  await editable.click();
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await page.keyboard.type("/image");
  await page.waitForTimeout(1200);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(1500);

  const fileInput = page.locator('input[type="file"]').first();
  await fileInput.setInputFiles({
    name: "integration-probe.png",
    mimeType: "image/png",
    buffer: PNG_1X1,
  });

  // Wait for the storage round trip and the block to take its src.
  const img = page.locator('img[src*="page-images"]').first();
  await expect(img, "no <img> pointing at the page-images bucket appeared").toBeVisible({
    timeout: 30_000,
  });

  const src = await img.getAttribute("src");
  await settle(page, 2500); // let the debounced document save land
  await shot(page, "u2-image-uploaded");

  // Reload: the image must come back from the persisted document, not from
  // in-memory editor state.
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator('[contenteditable="true"]').first().waitFor({ timeout: 30_000 });
  await settle(page, 2500);

  const afterReload = await page.locator('img[src*="page-images"]').count();
  const status = src ? await page.evaluate(async (u) => (await fetch(u)).status, src) : null;

  writeArtifact("u2-upload.json", { src, afterReload, publicUrlStatus: status });
  await shot(page, "u2-image-after-reload");

  expect(src, "the image src does not point at Supabase Storage").toContain("/storage/v1/object/");
  expect(status, "the public image URL does not resolve").toBe(200);
  expect(afterReload, "the uploaded image did not survive a reload").toBeGreaterThan(0);
});

test("U2: dropping a PNG on the editor uploads it; dropping an .exe is rejected", async ({
  page,
}) => {
  await openWikiPage(page);

  const before = await page.locator('img[src*="page-images"]').count();

  // Synthesize a real DataTransfer drop on the editor surface. `dispatchEvent`
  // with a constructed DataTransfer is the only way to exercise the app's own
  // onDrop handler rather than Playwright's file-chooser shortcut.
  const dropFile = async (name: string, type: string, base64: string) => {
    const target = page.locator('[contenteditable="true"]').first();
    await target.evaluate(
      (el, f) => {
        const bin = atob(f.base64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        const file = new File([bytes], f.name, { type: f.type });
        const dt = new DataTransfer();
        dt.items.add(file);

        // Coordinates are load-bearing: ProseMirror resolves the drop position
        // with posAtCoords(clientX, clientY), and a bare DragEvent defaults
        // both to 0, which lands outside the editor. The drop is then silently
        // discarded, which looks exactly like a broken feature.
        const r = el.getBoundingClientRect();
        const init: DragEventInit = {
          dataTransfer: dt,
          bubbles: true,
          cancelable: true,
          composed: true,
          clientX: Math.round(r.left + r.width / 2),
          clientY: Math.round(r.top + Math.min(r.height / 2, 80)),
        };
        el.dispatchEvent(new DragEvent("dragenter", init));
        el.dispatchEvent(new DragEvent("dragover", init));
        el.dispatchEvent(new DragEvent("drop", init));
      },
      { name, type, base64 }
    );
  };

  await dropFile("dropped.png", "image/png", PNG_1X1.toString("base64"));
  await page.waitForTimeout(6000);

  const afterPng = await page.locator('img[src*="page-images"]').count();
  await shot(page, "u2-image-dropped");

  // Now the rejection path: a non-image must not insert a block, and must
  // surface a toast rather than failing silently.
  await dropFile("payload.exe", "application/x-msdownload", "TVqQAAMAAAAEAAAA");
  await page.waitForTimeout(2500);

  const afterExe = await page.locator('img[src*="page-images"]').count();
  const toastText = await page
    .locator("[data-sonner-toast], [role='status'], .toast")
    .allInnerTexts()
    .catch(() => [] as string[]);

  writeArtifact("u2-drop.json", {
    imagesBefore: before,
    afterPngDrop: afterPng,
    afterExeDrop: afterExe,
    toasts: toastText,
  });
  await shot(page, "u2-exe-rejected");

  expect(afterPng, "dropping a PNG did not insert an image").toBeGreaterThan(before);
  expect(afterExe, "dropping an .exe inserted an image block").toBe(afterPng);
  expect(
    toastText.join(" ").length,
    "the .exe rejection surfaced no toast (silent no-op)"
  ).toBeGreaterThan(0);
});
