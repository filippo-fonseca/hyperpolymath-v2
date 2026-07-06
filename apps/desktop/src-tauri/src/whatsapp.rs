// WhatsApp bridge supervisor — daemon-first, sidecar-fallback.
//
// The bridge can run in one of two modes on the fixed port 8080 (the desktop
// send path in confirm-gate.ts POSTs to http://localhost:8080/api/send):
//
//   1. EXTERNAL (daemon) mode — preferred. A persistent launchd agent
//      (tools/whatsapp-bridge/com.hyperpolymath.whatsapp-bridge.plist) already
//      owns :8080 and keeps the WhatsApp connection up 24/7, independent of
//      this app. On startup we PROBE `GET /api/health`; if it answers we ADOPT
//      that daemon: we do NOT reap it, do NOT spawn a child, and skip the whole
//      child supervisor. We only poll `/api/qr` + `/api/health` to synthesize
//      the same `whatsapp-qr` / `whatsapp-ready` HUD events the child path
//      emits, and a user-initiated reconnect bounces the daemon via
//      `launchctl kickstart` rather than killing a child we don't own.
//
//   2. CHILD (sidecar) mode — fallback for dev machines / first run before the
//      daemon is installed. Spawns the bundled `whatsapp-bridge` Tauri sidecar,
//      reaps any genuinely-hung orphan first (a squatter that holds :8080 but
//      does NOT serve HTTP — the 44c15a1 case), reads stdout for structured
//      events, restarts on Terminated with capped backoff (MAX_RESTARTS), and
//      holds the child handle so the app can kill it on exit.
//
// The health-probe-then-adopt ORDERING is load-bearing: it runs BEFORE
// `reap_stale_bridge()`, because the reaper matches any `whatsapp-bridge*`
// process and would otherwise SIGKILL the daemon.

use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;

/// Fixed sidecar HTTP port. Must match the default the TS send path targets
/// (confirm-gate.ts: `http://localhost:8080`).
const BRIDGE_PORT: &str = "8080";
/// launchd label of the persistent daemon (tools/whatsapp-bridge plist). Used to
/// `launchctl kickstart` the daemon on a user-initiated reconnect in external
/// mode, instead of killing a child we don't own.
const DAEMON_LABEL: &str = "com.hyperpolymath.whatsapp-bridge";
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
    /// True when an external daemon (the launchd agent) owns :8080 and we've
    /// adopted it: no child was spawned, no supervisor runs, and reconnect
    /// bounces the daemon via `launchctl kickstart` instead of killing a child.
    /// Set once at `start()` after the startup health probe; never has a child
    /// handle, so `kill()` on exit is a no-op — we don't kill the daemon.
    managed_externally: Arc<AtomicBool>,
}

impl WhatsappBridge {
    /// Kill the running sidecar if any (best-effort; the session persists on
    /// disk so a hard kill loses nothing). In external (daemon) mode there is
    /// no child handle, so this is a no-op — the desktop never kills the
    /// always-on daemon on exit.
    pub fn kill(&self) {
        if let Ok(mut guard) = self.child.lock() {
            if let Some(child) = guard.take() {
                let _ = child.kill();
            }
        }
    }
}

/// Detect-and-adopt entry point. Call once from `.setup`.
///
/// Probes `GET http://localhost:8080/api/health` FIRST (before any reap):
///   - If a bridge answers, an external daemon owns :8080 → adopt it. No reap,
///     no child spawn, no supervisor; just poll for QR/ready events.
///   - Otherwise fall through to the child-sidecar supervisor (dev / first run),
///     which reaps a genuinely-hung orphan and spawns the bundled bridge.
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
    let managed_externally = Arc::new(AtomicBool::new(false));
    let state = WhatsappBridge {
        child: Arc::new(Mutex::new(None)),
        store_dir: Mutex::new(Some(store_dir.clone())),
        restarts: restarts.clone(),
        managed_externally: managed_externally.clone(),
    };
    let child_slot = state.child.clone();
    app.manage(state);

    // CRITICAL ORDERING: probe health BEFORE `reap_stale_bridge()`. The reaper
    // matches any `whatsapp-bridge*` process and would kill the daemon. A
    // connection-refused probe means nothing is listening and the child path may
    // safely reap stale orphans. A timeout / 5xx / malformed response means
    // something owns the port, so we fail closed: do NOT reap and do NOT spawn.
    match probe_daemon_health() {
        BridgeProbe::Healthy => {
            eprintln!(
            "[whatsapp] external bridge answered /api/health on :{BRIDGE_PORT} — adopting daemon (no reap, no spawn, no supervisor)"
        );
            managed_externally.store(true, Ordering::SeqCst);
            // No child handle is ever set in this mode, so `kill()` on exit is a
            // no-op and we never take down the always-on daemon.
            spawn_external_poller(app.clone());
            return;
        }
        BridgeProbe::NoListener => {
            eprintln!(
                "[whatsapp] no external bridge on :{BRIDGE_PORT} — starting supervised child sidecar"
            );
        }
        BridgeProbe::Ambiguous(reason) => {
            eprintln!(
                "[whatsapp] :{BRIDGE_PORT} probe was ambiguous ({reason}); refusing to reap/spawn to avoid killing the launchd daemon"
            );
            return;
        }
    };

    spawn_bridge(app.clone(), store_dir, child_slot, restarts);
}

enum BridgeProbe {
    Healthy,
    NoListener,
    Ambiguous(String),
}

/// Blocking health probe used at startup to decide daemon-vs-child.
/// A timeout is NOT "no daemon": it means a process owns the port but did not
/// answer quickly enough, and reaping it could kill the launchd daemon.
fn probe_daemon_health() -> BridgeProbe {
    tauri::async_runtime::block_on(async {
        let client = match reqwest::Client::builder()
            .timeout(Duration::from_millis(3000))
            .build()
        {
            Ok(c) => c,
            Err(err) => return BridgeProbe::Ambiguous(format!("client build failed: {err}")),
        };
        match client
            .get(format!("http://localhost:{BRIDGE_PORT}/api/health"))
            .send()
            .await
        {
            Ok(res) if res.status().is_success() => BridgeProbe::Healthy,
            Ok(res) => BridgeProbe::Ambiguous(format!("HTTP {}", res.status())),
            Err(err) if err.is_connect() => BridgeProbe::NoListener,
            Err(err) => BridgeProbe::Ambiguous(err.to_string()),
        }
    })
}

/// External (daemon) mode event poller. The stdout pump only works for a child
/// we spawned; when we've adopted a daemon there is no stdout to read, so we
/// poll the same HTTP endpoints the child would emit events from and synthesize
/// the identical `whatsapp-qr` / `whatsapp-ready` Tauri events, so `whatsapp-qr.ts`
/// and `whatsapp-settings.ts` work unchanged.
///
///   - `GET /api/qr` → 200 with a text/plain code while unpaired → `whatsapp-qr`.
///     (204/empty means already paired / no code yet — nothing to emit.)
///   - `GET /api/health` `{loggedIn:true}` → `whatsapp-ready` (once per edge).
///
/// De-duped so we only emit on transitions, matching the child path's cadence.
fn spawn_external_poller(app: AppHandle) {
    // A dedicated OS thread that drives each HTTP round-trip via `block_on` and
    // sleeps between ticks with `std::thread::sleep`. This deliberately avoids a
    // direct `tokio` timer dependency (same rationale as the respawn thread) and
    // never blocks the shared async runtime.
    std::thread::spawn(move || {
        let client = match reqwest::Client::builder()
            .timeout(Duration::from_secs(3))
            .build()
        {
            Ok(c) => c,
            Err(err) => {
                eprintln!("[whatsapp] external poller: reqwest build failed: {err}");
                return;
            }
        };
        let base = format!("http://localhost:{BRIDGE_PORT}");
        let mut last_qr: Option<String> = None;
        let mut was_ready = false;
        loop {
            tauri::async_runtime::block_on(async {
                // /api/qr: 200 + body = a fresh code to scan; 204 = paired/none.
                if let Ok(res) = client.get(format!("{base}/api/qr")).send().await {
                    if res.status().is_success() {
                        if let Ok(code) = res.text().await {
                            let code = code.trim().to_string();
                            if !code.is_empty() && last_qr.as_deref() != Some(code.as_str()) {
                                let _ = app.emit("whatsapp-qr", code.clone());
                                last_qr = Some(code);
                            }
                        }
                    }
                }

                // /api/health: loggedIn rising edge = ready. Also clears the
                // cached QR so a later re-pair re-emits.
                if let Ok(res) = client.get(format!("{base}/api/health")).send().await {
                    if let Ok(val) = res.json::<serde_json::Value>().await {
                        let logged_in = val
                            .get("loggedIn")
                            .and_then(|v| v.as_bool())
                            .unwrap_or(false);
                        if logged_in && !was_ready {
                            let _ = app.emit("whatsapp-ready", ());
                            last_qr = None;
                        }
                        was_ready = logged_in;
                    }
                }
            });

            std::thread::sleep(Duration::from_secs(2));
        }
    });
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
    for pid in stdout
        .split_whitespace()
        .filter_map(|s| s.trim().parse::<u32>().ok())
    {
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
                        eprintln!("[whatsapp] bridge exceeded {MAX_RESTARTS} restarts; giving up");
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
///
/// EXTERNAL (daemon) mode: we do NOT own the bridge process, so there is no
/// child to kill/respawn. The primary `POST /api/logout` still works (the
/// daemon logs out and `os.Exit(0)`s; launchd's KeepAlive relaunches it into
/// the QR branch and the external poller emits the QR event). If logout is
/// unreachable or non-2xx, the fallback is `launchctl kickstart -k` to bounce
/// the daemon rather than spawning a child — see `kickstart_daemon`.
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

    let external = app
        .try_state::<WhatsappBridge>()
        .map(|b| b.managed_externally.load(Ordering::SeqCst))
        .unwrap_or(false);

    // A user gesture — give the pump the full restart budget again. (No-op in
    // external mode, but harmless.)
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
            // Bridge answered but with a non-2xx. In external mode bounce the
            // daemon; otherwise fall through to the child kill/respawn fallback
            // rather than surface a raw HTTP code.
            eprintln!(
                "[whatsapp] /api/logout returned HTTP {} — bouncing bridge",
                res.status()
            );
            if external {
                kickstart_daemon()
            } else {
                fallback_respawn(&app)
            }
        }
        Err(err) => {
            // Bridge unreachable. In external mode bounce the daemon; otherwise
            // fall back to the child kill/respawn.
            eprintln!("[whatsapp] /api/logout unreachable ({err}) — bouncing bridge");
            if external {
                kickstart_daemon()
            } else {
                fallback_respawn(&app)
            }
        }
    }
}

/// External-mode reconnect: bounce the persistent daemon via
/// `launchctl kickstart -k gui/$UID/<label>`. We do NOT own the process (no
/// child handle to kill), so this is the blunt-but-correct way to force a fresh
/// connect without depending on any new bridge endpoint. launchd's `-k` kills
/// the current instance and immediately restarts it.
fn kickstart_daemon() -> Result<String, String> {
    let uid = unsafe { libc_getuid() };
    let target = format!("gui/{uid}/{DAEMON_LABEL}");
    match std::process::Command::new("launchctl")
        .args(["kickstart", "-k", &target])
        .status()
    {
        Ok(status) if status.success() => {
            Ok("daemon bounced — reconnecting; scan the QR if it appears".to_string())
        }
        Ok(status) => Err(format!("launchctl kickstart exited with {status}")),
        Err(err) => Err(format!("launchctl kickstart failed: {err}")),
    }
}

// Current real user id, for building the `gui/<uid>/…` launchd domain target.
// Uses `getuid(2)` directly to avoid pulling in an extra crate.
extern "C" {
    #[link_name = "getuid"]
    fn libc_getuid() -> u32;
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
    spawn_bridge(
        app.clone(),
        dir,
        bridge.child.clone(),
        bridge.restarts.clone(),
    );
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
            let code = value
                .get("code")
                .and_then(|v| v.as_str())
                .unwrap_or_default();
            let _ = app.emit("whatsapp-qr", code.to_string());
        }
        Some("ready") => {
            let _ = app.emit("whatsapp-ready", ());
        }
        _ => {}
    }
}
