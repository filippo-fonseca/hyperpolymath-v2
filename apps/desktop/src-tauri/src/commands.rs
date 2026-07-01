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
