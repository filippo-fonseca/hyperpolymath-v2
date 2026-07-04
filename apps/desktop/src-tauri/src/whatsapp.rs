// WhatsApp bridge sidecar supervisor.
//
// Spawns the bundled `whatsapp-bridge` Tauri sidecar on app setup, pointed at an
// app-data store dir and a fixed port (8080 — the desktop send path in
// confirm-gate.ts POSTs to http://localhost:8080/api/send). It:
//   - reads the sidecar's stdout and forwards structured events to the HUD:
//       {"event":"qr","code":…}  -> Tauri event "whatsapp-qr" (payload = code)
//       {"event":"ready"}        -> Tauri event "whatsapp-ready"
//   - restarts the child on Terminated with a capped, backed-off retry so a
//     crash-looping sidecar can't spin forever;
//   - holds the child handle in managed state so the app can kill it on exit
//     (the WhatsApp session persists on disk, so a plain kill is fine).

use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::{Arc, Mutex};

use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;

/// Fixed sidecar HTTP port. Must match the default the TS send path targets
/// (confirm-gate.ts: `http://localhost:8080`).
const BRIDGE_PORT: &str = "8080";
/// Stop respawning after this many consecutive terminations to avoid a hot loop
/// (e.g. a permanently broken store). Reset only on a fresh app launch.
const MAX_RESTARTS: u32 = 8;

/// Managed handle to the running sidecar child, so we can kill it on app exit.
#[derive(Default)]
pub struct WhatsappBridge {
    child: Arc<Mutex<Option<CommandChild>>>,
}

impl WhatsappBridge {
    /// Kill the running sidecar if any (best-effort; the session persists on
    /// disk so a hard kill loses nothing).
    pub fn kill(&self) {
        if let Ok(mut guard) = self.child.lock() {
            if let Some(child) = guard.take() {
                let _ = child.kill();
            }
        }
    }
}

/// Spawn the sidecar and start the event pump. Call once from `.setup`.
pub fn start(app: &AppHandle) {
    let store_dir = match app.path().app_data_dir() {
        Ok(dir) => dir.join("whatsapp"),
        Err(err) => {
            eprintln!("[whatsapp] no app_data_dir, sidecar not started: {err}");
            return;
        }
    };
    if let Err(err) = std::fs::create_dir_all(&store_dir) {
        eprintln!("[whatsapp] failed to create store dir {store_dir:?}: {err}");
        return;
    }

    let state: WhatsappBridge = WhatsappBridge::default();
    let child_slot = state.child.clone();
    app.manage(state);

    let restarts = Arc::new(AtomicU32::new(0));
    spawn_bridge(app.clone(), store_dir, child_slot, restarts);
}

fn spawn_bridge(
    app: AppHandle,
    store_dir: std::path::PathBuf,
    child_slot: Arc<Mutex<Option<CommandChild>>>,
    restarts: Arc<AtomicU32>,
) {
    let store_str = store_dir.to_string_lossy().to_string();
    let sidecar = match app.shell().sidecar("whatsapp-bridge") {
        Ok(cmd) => cmd.args(["--store", &store_str, "--port", BRIDGE_PORT]),
        Err(err) => {
            eprintln!("[whatsapp] sidecar unavailable: {err}");
            return;
        }
    };

    let (mut rx, child) = match sidecar.spawn() {
        Ok(pair) => pair,
        Err(err) => {
            eprintln!("[whatsapp] failed to spawn bridge: {err}");
            return;
        }
    };

    // A fresh, healthy spawn resets the restart budget.
    restarts.store(0, Ordering::SeqCst);
    if let Ok(mut guard) = child_slot.lock() {
        *guard = Some(child);
    }

    tauri::async_runtime::spawn(async move {
        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(bytes) => {
                    let line = String::from_utf8_lossy(&bytes);
                    for part in line.split('\n') {
                        forward_event(&app, part.trim());
                    }
                }
                CommandEvent::Stderr(bytes) => {
                    let line = String::from_utf8_lossy(&bytes);
                    let line = line.trim();
                    if !line.is_empty() {
                        eprintln!("[whatsapp-bridge] {line}");
                    }
                }
                CommandEvent::Terminated(payload) => {
                    eprintln!("[whatsapp] bridge terminated: {payload:?}");
                    let n = restarts.fetch_add(1, Ordering::SeqCst) + 1;
                    if n > MAX_RESTARTS {
                        eprintln!(
                            "[whatsapp] bridge exceeded {MAX_RESTARTS} restarts; giving up"
                        );
                        break;
                    }
                    // Linear backoff, capped, so transient failures recover fast
                    // but a broken store doesn't hammer the CPU. Respawn from a
                    // detached std thread (avoids a tokio timer dependency).
                    let backoff = std::cmp::min(n, 5) * 2;
                    let app2 = app.clone();
                    let dir2 = store_dir.clone();
                    let slot2 = child_slot.clone();
                    let restarts2 = restarts.clone();
                    std::thread::spawn(move || {
                        std::thread::sleep(std::time::Duration::from_secs(backoff as u64));
                        spawn_bridge(app2, dir2, slot2, restarts2);
                    });
                    break;
                }
                _ => {}
            }
        }
    });
}

/// Parse one stdout line and forward the structured event to the HUD.
fn forward_event(app: &AppHandle, line: &str) {
    if line.is_empty() || !line.starts_with('{') {
        return;
    }
    let Ok(value) = serde_json::from_str::<serde_json::Value>(line) else {
        return;
    };
    match value.get("event").and_then(|v| v.as_str()) {
        Some("qr") => {
            let code = value.get("code").and_then(|v| v.as_str()).unwrap_or_default();
            let _ = app.emit("whatsapp-qr", code.to_string());
        }
        Some("ready") => {
            let _ = app.emit("whatsapp-ready", ());
        }
        _ => {}
    }
}
