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

use std::path::PathBuf;
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

/// Managed handle to the running sidecar child, so we can kill it on app exit
/// and hand a user-initiated reconnect a way to force respawn from scratch.
#[derive(Default)]
pub struct WhatsappBridge {
    child: Arc<Mutex<Option<CommandChild>>>,
    /// Store directory captured at `start()` — needed so `whatsapp_reconnect`
    /// can call `spawn_bridge` directly when the supervisor pump has already
    /// given up (restart budget exceeded).
    store_dir: Mutex<Option<PathBuf>>,
    /// Shared restart budget used by the supervisor pump. Reset to 0 on a
    /// user-initiated reconnect so a fresh attempt gets the full budget.
    restarts: Arc<AtomicU32>,
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

    let restarts = Arc::new(AtomicU32::new(0));
    let state = WhatsappBridge {
        child: Arc::new(Mutex::new(None)),
        store_dir: Mutex::new(Some(store_dir.clone())),
        restarts: restarts.clone(),
    };
    let child_slot = state.child.clone();
    app.manage(state);

    spawn_bridge(app.clone(), store_dir, child_slot, restarts);
}

/// Free the fixed bridge port before spawning.
///
/// When the desktop is restarted or force-killed, the sidecar child it was
/// supervising can be orphaned and keep running, squatting :8080. The next
/// supervised bridge then fails to bind (`listen tcp :8080: bind: address
/// already in use`) and crash-loops. This reaps any such squatter so the new
/// child binds cleanly.
///
/// Safety: we only ever kill a process we've positively identified as the
/// `whatsapp-bridge` binary. We ask `lsof` for the PIDs *listening* on tcp:8080,
/// then for each PID confirm via `ps -o comm=` that its executable basename
/// starts with `whatsapp-bridge` before sending SIGKILL. (Tauri runs the sidecar
/// as bare `whatsapp-bridge` in dev but `whatsapp-bridge-<target-triple>` when
/// bundled, so we prefix-match to cover both.) A random unrelated process that
/// happens to hold :8080 is left untouched. When :8080 is free (the normal
/// single-instance happy path) `lsof` returns nothing and this is a no-op.
fn reap_stale_bridge() {
    // PIDs currently LISTENING on tcp:8080. `-t` gives bare PIDs, one per line.
    let output = match std::process::Command::new("lsof")
        .args(["-ti", "tcp:8080", "-sTCP:LISTEN"])
        .output()
    {
        Ok(o) => o,
        // lsof missing / unusable — can't reap, but the spawn below still tries.
        Err(_) => return,
    };

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut reaped_any = false;
    for pid in stdout.split_whitespace().filter_map(|s| s.trim().parse::<u32>().ok()) {
        // Verify the PID is actually our bridge before killing it. `ps -o comm=`
        // prints the executable's command name; we require its basename to be
        // `whatsapp-bridge` so we never kill an unrelated :8080 holder.
        let comm = match std::process::Command::new("ps")
            .args(["-p", &pid.to_string(), "-o", "comm="])
            .output()
        {
            Ok(o) => String::from_utf8_lossy(&o.stdout).trim().to_string(),
            Err(_) => continue,
        };
        let basename = comm.rsplit('/').next().unwrap_or(&comm);
        if !basename.starts_with("whatsapp-bridge") {
            eprintln!(
                "[whatsapp] :8080 held by non-bridge process pid {pid} ({basename}); not reaping"
            );
            continue;
        }

        match std::process::Command::new("kill")
            .args(["-9", &pid.to_string()])
            .status()
        {
            Ok(_) => {
                eprintln!("[whatsapp] reaped stale bridge pid {pid} on :8080 before spawn");
                reaped_any = true;
            }
            Err(err) => eprintln!("[whatsapp] failed to kill stale bridge pid {pid}: {err}"),
        }
    }

    // Give the socket a beat to be released before the next bind attempt, so the
    // immediately-following spawn doesn't race the kernel freeing the port.
    if reaped_any {
        std::thread::sleep(std::time::Duration::from_millis(400));
    }
}

fn spawn_bridge(
    app: AppHandle,
    store_dir: std::path::PathBuf,
    child_slot: Arc<Mutex<Option<CommandChild>>>,
    restarts: Arc<AtomicU32>,
) {
    // Clear any orphaned bridge squatting :8080 before we try to bind. Runs on
    // first spawn, on every supervisor respawn (this fn is the respawn target),
    // and on the reconnect fallback's direct spawn.
    reap_stale_bridge();

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

/// User-initiated WhatsApp re-pairing. Wired to the "Reconnect" button in the
/// desktop Settings drawer. Primary path is `POST <bridge>/api/logout`: the Go
/// bridge clears its whatsmeow Store.ID and `os.Exit(0)`s after 300ms; the
/// supervisor pump's Terminated arm respawns the sidecar into the QR branch,
/// and the existing stdout → `whatsapp-qr` event → HUD overlay pipeline
/// lights up on its own. Zero new event plumbing.
///
/// Fallbacks (in order) for when the bridge is unreachable / already dead:
///   1. If a child handle is present, `kill()` it → pump's Terminated arm
///      respawns after backoff.
///   2. Otherwise (the pump previously gave up after MAX_RESTARTS crashes, or
///      never started), respawn directly from the stored `store_dir`.
/// In every path the restart budget is reset first so a user gesture gets a
/// fresh chance; a broken store can no longer permanently poison the pump.
#[tauri::command]
pub async fn whatsapp_reconnect(
    app: AppHandle,
    bridge_url: Option<String>,
) -> Result<String, String> {
    let base = bridge_url
        .as_deref()
        .map(|s| s.trim_end_matches('/'))
        .unwrap_or("http://localhost:8080")
        .to_string();
    let logout_url = format!("{base}/api/logout");

    // A user gesture — give the pump the full restart budget again.
    if let Some(bridge) = app.try_state::<WhatsappBridge>() {
        bridge.restarts.store(0, Ordering::SeqCst);
    }

    // Primary path: ask the bridge to log out. It replies then exits itself.
    let client = match reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(20))
        .build()
    {
        Ok(c) => c,
        Err(err) => return Err(format!("reqwest client build failed: {err}")),
    };
    match client.post(&logout_url).send().await {
        Ok(res) if res.status().is_success() => {
            Ok("logout ok — re-pairing, QR incoming".to_string())
        }
        Ok(res) => {
            // Bridge answered but with a non-2xx. Fall through to the
            // kill/respawn fallback rather than surface a raw HTTP code.
            eprintln!(
                "[whatsapp] /api/logout returned HTTP {} — falling back to kill+respawn",
                res.status()
            );
            fallback_respawn(&app)
        }
        Err(err) => {
            // Bridge unreachable — fall back to kill/respawn.
            eprintln!("[whatsapp] /api/logout unreachable ({err}) — falling back to kill+respawn");
            fallback_respawn(&app)
        }
    }
}

/// Restart the sidecar when the bridge won't answer HTTP. Either kills the
/// existing child (the pump's Terminated arm will respawn after backoff) or,
/// if no child is present, spawns a fresh one directly from the stored dir.
fn fallback_respawn(app: &AppHandle) -> Result<String, String> {
    let bridge = app
        .try_state::<WhatsappBridge>()
        .ok_or_else(|| "whatsapp bridge state unavailable".to_string())?;

    // Try to kill the running child. If we killed one, the supervisor pump's
    // Terminated arm handles the respawn — no direct spawn needed.
    let killed = {
        match bridge.child.lock() {
            Ok(mut guard) => guard.take().map(|c| c.kill().ok()).is_some(),
            Err(_) => false,
        }
    };
    if killed {
        return Ok("bridge killed — respawning; scan the QR once it appears".to_string());
    }

    // No child — the pump either gave up or never started. Respawn directly.
    let store_dir = match bridge.store_dir.lock() {
        Ok(guard) => guard.clone(),
        Err(_) => None,
    };
    let Some(dir) = store_dir else {
        return Err("no stored WhatsApp dir — restart the app to recover".to_string());
    };
    spawn_bridge(app.clone(), dir, bridge.child.clone(), bridge.restarts.clone());
    Ok("bridge restarted — scan the QR once it appears".to_string())
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
