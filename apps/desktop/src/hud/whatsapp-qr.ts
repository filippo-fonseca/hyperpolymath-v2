// WhatsApp first-run pairing overlay.
//
// The bundled whatsapp-bridge sidecar (supervised in Rust) emits a QR code
// whenever the WhatsApp Web session needs (re)pairing. Rust forwards that raw
// QR string to the frontend as a `whatsapp-qr` Tauri event, and a `whatsapp-ready`
// event once the phone has scanned it. This module renders the QR into the
// overlay canvas so the user can scan it, and hides the overlay on ready.

import { listen } from "@tauri-apps/api/event";
import QRCode from "qrcode";

/** Wire the QR overlay to the sidecar's Tauri events. Call once from boot(). */
export async function startWhatsappQrOverlay(): Promise<void> {
  const overlay = document.getElementById("wa-qr-overlay");
  const canvas = document.getElementById("wa-qr-canvas");
  if (!(overlay instanceof HTMLElement) || !(canvas instanceof HTMLCanvasElement)) {
    // eslint-disable-next-line no-console
    console.warn("[whatsapp-qr] overlay elements missing; skipping QR wiring");
    return;
  }

  const show = (): void => {
    overlay.hidden = false;
  };
  const hide = (): void => {
    overlay.hidden = true;
  };

  await listen<string>("whatsapp-qr", (event) => {
    const code = event.payload;
    if (!code) return;
    QRCode.toCanvas(canvas, code, { width: 240, margin: 1 })
      .then(() => {
        show();
      })
      .catch((err: unknown) => {
        // eslint-disable-next-line no-console
        console.warn("[whatsapp-qr] failed to render QR", err);
      });
  });

  await listen("whatsapp-ready", () => {
    hide();
    // eslint-disable-next-line no-console
    console.log("[whatsapp-qr] WhatsApp linked — overlay dismissed");
  });

  // eslint-disable-next-line no-console
  console.log("[whatsapp-qr] pairing overlay armed");
}
