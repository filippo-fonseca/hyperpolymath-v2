//! Native computer-control primitives for JARVIS (RESEARCH: macos-automation).
//!
//! Everything here shells out to battle-tested macOS tools (`osascript`,
//! `shortcuts`, `screencapture`, `pmset`) or injects input via `enigo`
//! (CGEvent). All commands log diagnostics with a `[prefix]` tag, matching the
//! `[audio]` / `[tts]` style in audio.rs, so failures are visible in the dev
//! console instead of failing silently (research gotcha #1: missing TCC
//! permissions make input injection a silent no-op).

use std::io::Write;
use std::process::{Command, Output, Stdio};
use std::sync::mpsc;
use std::time::Duration;

/// Default hard timeout for shelled-out tools (osascript can hang forever on
/// a blocked Automation permission prompt; never let it wedge a turn).
const DEFAULT_TIMEOUT_MS: u64 = 15_000;

/// Run a `Command` with piped stdio, an optional stdin payload, and a hard
/// timeout. A watcher thread drains stdout/stderr (so a chatty child never
/// deadlocks on a full pipe) and the child is SIGKILLed if the deadline
/// passes.
fn run_with_timeout(
    mut cmd: Command,
    stdin_data: Option<String>,
    timeout: Duration,
    tag: &str,
) -> Result<Output, String> {
    cmd.stdout(Stdio::piped()).stderr(Stdio::piped());
    cmd.stdin(if stdin_data.is_some() {
        Stdio::piped()
    } else {
        Stdio::null()
    });

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("[{tag}] spawn failed: {e}"))?;

    if let Some(data) = stdin_data {
        if let Some(mut stdin) = child.stdin.take() {
            stdin
                .write_all(data.as_bytes())
                .map_err(|e| format!("[{tag}] stdin write failed: {e}"))?;
            // Dropping stdin closes the pipe so the child sees EOF.
        }
    }

    let pid = child.id();
    let (tx, rx) = mpsc::channel();
    std::thread::spawn(move || {
        let _ = tx.send(child.wait_with_output());
    });

    match rx.recv_timeout(timeout) {
        Ok(Ok(output)) => Ok(output),
        Ok(Err(e)) => Err(format!("[{tag}] wait failed: {e}")),
        Err(_) => {
            // Timed out — kill the child; the watcher thread reaps it.
            let _ = Command::new("kill")
                .args(["-9", &pid.to_string()])
                .status();
            Err(format!("[{tag}] timed out after {}ms", timeout.as_millis()))
        }
    }
}

/// Convert a finished process into Ok(stdout) or Err(stderr).
fn output_to_result(output: Output, tag: &str) -> Result<String, String> {
    let stdout = String::from_utf8_lossy(&output.stdout)
        .trim_end()
        .to_string();
    if output.status.success() {
        Ok(stdout)
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr)
            .trim_end()
            .to_string();
        if stderr.is_empty() {
            Err(format!(
                "[{tag}] exited with status {:?}",
                output.status.code()
            ))
        } else {
            Err(stderr)
        }
    }
}

/// Execute an AppleScript snippet via `osascript -e`. `label` is a short
/// human-readable tag for logging (e.g. "send-imessage", "music-play") so the
/// dev console shows WHAT ran without dumping the whole script.
#[tauri::command]
pub fn run_applescript(
    script: String,
    label: String,
    timeout_ms: Option<u32>,
) -> Result<String, String> {
    eprintln!("[applescript] executing: {}", label);
    let timeout = Duration::from_millis(timeout_ms.map(u64::from).unwrap_or(DEFAULT_TIMEOUT_MS));
    let mut cmd = Command::new("osascript");
    cmd.arg("-e").arg(&script);
    run_with_timeout(cmd, None, timeout, "applescript")
        .and_then(|o| output_to_result(o, "applescript"))
        .map_err(|e| {
            eprintln!("[applescript] '{label}' failed: {e}");
            e
        })
}

/// Run a Shortcuts.app shortcut by name via the `shortcuts` CLI (macOS 12+).
/// When `input` is provided it is piped to the shortcut's stdin using
/// `--input-path -`. Research Q4: Focus-mode toggling is only reliable through
/// Shortcuts, so this is also the backend for `system_control("focus", ...)`.
#[tauri::command]
pub fn run_shortcut(name: String, input: Option<String>) -> Result<String, String> {
    eprintln!("[shortcut] running: {name}");
    run_shortcut_inner(&name, input)
}

fn run_shortcut_inner(name: &str, input: Option<String>) -> Result<String, String> {
    let mut cmd = Command::new("shortcuts");
    cmd.arg("run").arg(name);
    if input.is_some() {
        cmd.args(["--input-path", "-"]);
    }
    run_with_timeout(
        cmd,
        input,
        Duration::from_millis(DEFAULT_TIMEOUT_MS),
        "shortcut",
    )
    .and_then(|o| output_to_result(o, "shortcut"))
    .map_err(|e| {
        eprintln!("[shortcut] '{name}' failed: {e}");
        e
    })
}
