mod audio;
mod commands;
mod computer;
mod studio_webview;
mod whatsapp;

use tauri::{
    image::Image,
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager,
};
use tauri_plugin_opener::OpenerExt;

/// Fire an invoke-to-talk turn. Shared by the tray's left-click and the
/// explicit "Talk to JARVIS" menu item so both paths behave identically: the
/// webview's `tray-invoke` listener routes this through the conversation FSM.
/// Deliberately does NOT focus/show the HUD — the mic opens without stealing
/// focus from whatever the user is currently in.
fn invoke_talk(app: &tauri::AppHandle) {
    let _ = app.emit("tray-invoke", ());
}

/// Resolve the web app base URL for the "Open JARVIS Settings" item. Mirrors
/// the JS side (`src/env.ts`), which reads `VITE_API_BASE_URL` and defaults to
/// localhost:3000. On the Rust side we read it from the process environment
/// (exported alongside `tauri dev`) and fall back to the same default.
fn jarvis_settings_url() -> String {
    let base = std::env::var("VITE_API_BASE_URL")
        .unwrap_or_else(|_| "http://localhost:3000".to_string());
    format!("{}/jarvis", base.trim_end_matches('/'))
}

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
            // macOS: run as a Regular app — Dock icon + standard app menu, so
            // Cmd+Q quits and the window is a normal, closable, movable window.
            // This supersedes the earlier Accessory (tray-only, frameless HUD)
            // model for now: the app must be visible, movable, closable, and
            // quittable while we stabilise it. The always-on-top frameless HUD
            // can return later behind a setting.
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Regular);

            // macOS hands-free audio (RESEARCH Q1): a GLOBAL hotkey / tray click
            // is not an in-webview user gesture, so WebKit's autoplay gate keeps
            // the TTS AudioContext suspended and JARVIS stays silent. Lift the
            // gate at the WKWebView level by clearing
            // `mediaTypesRequiringUserActionForPlayback` on the webview's
            // configuration. wry's `with_autoplay(true)` is historically flaky on
            // macOS, so we set the flag directly via the `with_webview` escape
            // hatch. The JS-side eager `resume()` + gesture prime remain as
            // belt-and-braces.
            #[cfg(target_os = "macos")]
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.with_webview(|webview| {
                    // SAFETY: `inner()` returns the live `WKWebView` pointer owned
                    // by wry for this window's lifetime; we only read its
                    // configuration and set a documented property.
                    unsafe {
                        use objc2_web_kit::{WKAudiovisualMediaTypes, WKWebView};
                        let wk = webview.inner() as *mut WKWebView;
                        if let Some(wk) = wk.as_ref() {
                            let config = wk.configuration();
                            config.setMediaTypesRequiringUserActionForPlayback(
                                WKAudiovisualMediaTypes::None,
                            );
                        }
                    }
                });
            }

            // Tray menu: a real menu-bar app feel — Talk, Show/Hide HUD, open
            // web Settings, then a separator and Quit.
            let talk_item =
                MenuItem::with_id(app, "talk", "Talk to JARVIS", true, None::<&str>)?;
            let toggle_item =
                MenuItem::with_id(app, "toggle-hud", "Show / Hide HUD", true, None::<&str>)?;
            let settings_item = MenuItem::with_id(
                app,
                "open-settings",
                "Open JARVIS Settings",
                true,
                None::<&str>,
            )?;
            let separator = PredefinedMenuItem::separator(app)?;
            let quit_item = MenuItem::with_id(app, "quit", "Quit JARVIS", true, None::<&str>)?;
            let menu = Menu::with_items(
                app,
                &[
                    &talk_item,
                    &toggle_item,
                    &settings_item,
                    &separator,
                    &quit_item,
                ],
            )?;

            // macOS menu-bar icon: a monochrome TEMPLATE glyph (black shape on
            // transparent alpha) so macOS auto-tints it for light/dark bars and
            // the highlighted state — not the shrunk full-colour app icon.
            // `include_image!` decodes the PNG at compile time into raw RGBA,
            // so this works identically in `tauri dev` and packaged builds with
            // no runtime path/resource resolution.
            let tray_icon: Image<'static> =
                tauri::include_image!("./icons/tray-icon-template.png");

            let _tray = TrayIconBuilder::with_id("jarvis-tray")
                .icon(tray_icon)
                // macOS: treat the icon as a template so it renders as a tinted
                // menu-bar glyph rather than a literal bitmap.
                .icon_as_template(true)
                .tooltip("JARVIS Desktop")
                .menu(&menu)
                // Left-click INVOKES a turn (invoke-to-talk); the right-click
                // menu owns Talk / Show-Hide HUD / Settings / Quit so
                // visibility toggling is not conflated with invocation.
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "talk" => invoke_talk(app),
                    "toggle-hud" => toggle_hud(app),
                    "open-settings" => {
                        let url = jarvis_settings_url();
                        if let Err(err) = app.opener().open_url(url, None::<&str>) {
                            eprintln!("[tray] failed to open JARVIS Settings: {err}");
                        }
                    }
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
                        invoke_talk(tray.app_handle());
                    }
                })
                .build(app)?;

            // Spawn + supervise the bundled WhatsApp bridge sidecar so the
            // send path (POST localhost:8080/api/send) works with no manual
            // `go run`. Forwards QR/ready events to the HUD; restarts on crash.
            whatsapp::start(app.handle());

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::start_capture,
            commands::stop_capture,
            commands::show_hud,
            commands::hide_hud,
            commands::tts_play_pcm,
            commands::tts_stop,
            commands::tts_clear,
            computer::run_applescript,
            computer::run_jxa,
            computer::run_shortcut,
            computer::type_text,
            computer::press_key,
            computer::mouse_click,
            computer::mouse_move,
            computer::take_screenshot,
            computer::take_screenshot_to_file,
            computer::system_control,
            computer::accessibility_trusted,
            studio_webview::studio_webview_create,
            studio_webview::studio_webview_set_bounds,
            studio_webview::studio_webview_show,
            studio_webview::studio_webview_hide,
            studio_webview::studio_webview_destroy,
            studio_webview::studio_webview_navigate,
            studio_webview::studio_webview_scroll,
            whatsapp::whatsapp_reconnect,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            // Kill the WhatsApp bridge sidecar when the app is quitting so it
            // does not outlive the HUD (the session persists on disk).
            if let tauri::RunEvent::ExitRequested { .. } = event {
                if let Some(bridge) = app.try_state::<whatsapp::WhatsappBridge>() {
                    bridge.kill();
                }
            }
        });
}
