mod audio;
mod commands;

use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager,
};

/// Toggle the floating HUD window between shown+focused and hidden.
/// Called from the tray's left-click and the "Show/Hide HUD" menu item.
fn toggle_hud(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        match window.is_visible() {
            Ok(true) => {
                let _ = window.hide();
            }
            _ => {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            // macOS: run as an Accessory app — no Dock icon, no menu bar.
            // The app lives entirely in the tray + floating HUD.
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            // Tray menu: Show/Hide HUD + Quit.
            let toggle_item =
                MenuItem::with_id(app, "toggle-hud", "Show / Hide HUD", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "Quit JARVIS", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&toggle_item, &quit_item])?;

            let _tray = TrayIconBuilder::with_id("jarvis-tray")
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("JARVIS Desktop")
                .menu(&menu)
                // Left-click INVOKES a turn (invoke-to-talk); the right-click
                // menu owns Show/Hide HUD + Quit so visibility toggling is not
                // conflated with invocation.
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "toggle-hud" => toggle_hud(app),
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        ..
                    } = event
                    {
                        // Fire an invocation. The webview's `tray-invoke`
                        // listener routes this through the conversation FSM.
                        // Do NOT set_focus on the HUD here — let the mic open
                        // without stealing focus from whatever the user is in.
                        let _ = tray.app_handle().emit("tray-invoke", ());
                    }
                })
                .build(app)?;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::start_capture,
            commands::stop_capture,
            commands::show_hud,
            commands::hide_hud,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
