use tauri::AppHandle;

use crate::audio;

/// Start cpal audio capture. Idempotent — calling while already capturing is a no-op.
/// Emits `audio-chunk` events to the webview as 16 kHz mono Float32 samples.
#[tauri::command]
pub fn start_capture(app: AppHandle) -> Result<(), String> {
    audio::send_command_start(&app)
}

/// Stop cpal audio capture and release the OS microphone.
/// The webview's VAD silence detector calls this once end-of-speech is detected.
#[tauri::command]
pub fn stop_capture(app: AppHandle) -> Result<(), String> {
    audio::send_command_stop(&app)
}
