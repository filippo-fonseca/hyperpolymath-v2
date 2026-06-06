use tauri::AppHandle;

use crate::audio;

#[tauri::command]
pub fn start_capture(app: AppHandle) -> Result<(), String> {
    audio::start(app)
}
