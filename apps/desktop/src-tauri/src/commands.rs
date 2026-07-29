use tauri::{AppHandle, Manager};

use crate::audio;

/// Show the floating HUD window WITHOUT focusing it.
///
/// Called from the conversation FSM when JARVIS becomes active (invoke /
/// listening / speaking) so the orb is visible for the turn. We intentionally
/// do NOT `set_focus()` here (RESEARCH Q4 focus rule): the alwaysOnTop +
/// Accessory HUD should float above whatever the user is doing without
/// stealing key focus, especially after opening a URL/app in the same turn.
#[tauri::command]
pub fn show_hud(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        window.show().map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Hide the floating HUD window (tray-driven / FSM sign-off). Accessory model:
/// the app keeps running in the tray while hidden.
#[tauri::command]
pub fn hide_hud(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        window.hide().map_err(|e| e.to_string())?;
    }
    Ok(())
}

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

/// Every microphone cpal can currently see, with the system default flagged.
/// Backs the input-device picker in settings.
#[tauri::command]
pub fn list_input_devices() -> Result<Vec<audio::InputDeviceInfo>, String> {
    audio::list_input_devices()
}

/// The user's explicitly chosen microphone, or `null` when following the system
/// default.
#[tauri::command]
pub fn get_input_device(app: AppHandle) -> Option<String> {
    audio::get_input_device(&app)
}

/// Choose a microphone by name; pass `null` to go back to the system default.
/// Applies to the next capture, never to one already running.
#[tauri::command]
pub fn set_input_device(app: AppHandle, name: Option<String>) -> Result<(), String> {
    audio::set_input_device(&app, name)
}

/// Play a chunk of TTS audio natively via rodio (bypasses the WKWebView, which
/// keeps its AudioContext suspended for hands-free invocations). `bytes` is raw
/// 16-bit signed LE PCM @ 24 kHz mono — exactly what /api/jarvis/tts returns.
/// Chunks play FIFO in the order appended. The audio thread emits `tts-playing`
/// / `tts-idle` events so the frontend drives its state from real playback.
#[tauri::command]
pub fn tts_play_pcm(app: AppHandle, bytes: Vec<u8>) -> Result<(), String> {
    audio::tts_send_play(&app, bytes)
}

/// Stop TTS playback immediately and clear the queue (Stop-speaking button, FSM
/// barge-in). Emits `tts-idle` so the frontend leaves the "speaking" state.
#[tauri::command]
pub fn tts_stop(app: AppHandle) -> Result<(), String> {
    audio::tts_send_stop(&app)
}

/// Alias of `tts_stop` — clear anything queued/playing. Kept as a distinct
/// command so the frontend can express intent ("flush the queue") explicitly.
#[tauri::command]
pub fn tts_clear(app: AppHandle) -> Result<(), String> {
    audio::tts_send_stop(&app)
}
