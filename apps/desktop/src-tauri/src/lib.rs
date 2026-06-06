mod audio;
mod commands;

use tauri::tray::TrayIconBuilder;
#[cfg(target_os = "macos")]
use tauri::ActivationPolicy;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_http::init())
        .invoke_handler(tauri::generate_handler![commands::start_capture])
        .setup(|app| {
            #[cfg(target_os = "macos")]
            app.set_activation_policy(ActivationPolicy::Accessory);

            let icon = app
                .default_window_icon()
                .cloned()
                .ok_or("no default_window_icon — bundle.icon must list at least one PNG")?;
            TrayIconBuilder::with_id("jarvis-tray")
                .icon(icon)
                .icon_as_template(true)
                .tooltip("JARVIS Desktop")
                .build(app)?;
            eprintln!("[jarvis-desktop] tray icon created");

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
