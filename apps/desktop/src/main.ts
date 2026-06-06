import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

async function boot(): Promise<void> {
  await listen<number[]>("audio-chunk", ({ payload }) => {
    // Smoke test: log size of first few chunks to prove cpal → IPC plumbing works.
    // Subsequent plans replace this with VAD + buffering.
    // eslint-disable-next-line no-console
    console.log(`[audio-chunk] ${payload.length} samples`);
  });
  await invoke("start_capture");
}

boot().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("[boot]", err);
});
