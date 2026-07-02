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

use enigo::{Button, Coordinate, Direction, Enigo, Key, Keyboard, Mouse, Settings};

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

// ---------------------------------------------------------------------------
// Accessibility gate (research gotcha #1: without the Accessibility TCC
// permission, CGEvent injection SILENTLY does nothing — enigo returns Ok(())
// and the user just sees JARVIS "do nothing". Gate every input command.)
// ---------------------------------------------------------------------------

#[cfg(target_os = "macos")]
#[link(name = "ApplicationServices", kind = "framework")]
extern "C" {
    fn AXIsProcessTrusted() -> bool;
}

#[cfg(target_os = "macos")]
fn is_accessibility_trusted() -> bool {
    unsafe { AXIsProcessTrusted() }
}

#[cfg(not(target_os = "macos"))]
fn is_accessibility_trusted() -> bool {
    true
}

/// Frontend-visible check so the UI can prompt for the permission proactively.
#[tauri::command]
pub fn accessibility_trusted() -> bool {
    is_accessibility_trusted()
}

fn ensure_accessibility() -> Result<(), String> {
    if is_accessibility_trusted() {
        Ok(())
    } else {
        eprintln!("[input] BLOCKED: Accessibility permission not granted");
        Err(
            "Accessibility permission not granted — enable JARVIS in System Settings → \
             Privacy & Security → Accessibility"
                .to_string(),
        )
    }
}

fn new_enigo() -> Result<Enigo, String> {
    Enigo::new(&Settings::default()).map_err(|e| format!("[input] enigo init failed: {e}"))
}

// ---------------------------------------------------------------------------
// Keyboard
// ---------------------------------------------------------------------------

/// Type a string as literal keystrokes into whatever has focus.
#[tauri::command]
pub fn type_text(text: String) -> Result<(), String> {
    ensure_accessibility()?;
    eprintln!("[keyboard] type_text ({} chars)", text.chars().count());
    let mut enigo = new_enigo()?;
    enigo
        .text(&text)
        .map_err(|e| format!("[keyboard] type_text failed: {e}"))
}

fn parse_modifier(s: &str) -> Result<Key, String> {
    match s.to_ascii_lowercase().as_str() {
        // Cmd is Key::Meta in enigo — NOT Key::Control (research gotcha).
        "cmd" | "command" | "meta" | "super" => Ok(Key::Meta),
        "ctrl" | "control" => Ok(Key::Control),
        "alt" | "option" | "opt" => Ok(Key::Alt),
        "shift" => Ok(Key::Shift),
        other => Err(format!("unknown modifier: {other}")),
    }
}

fn parse_key(s: &str) -> Result<Key, String> {
    let lower = s.to_ascii_lowercase();
    // Single characters (letters, digits, punctuation) go through Unicode,
    // which enigo maps to the right virtual keycode on macOS.
    let mut chars = lower.chars();
    if let (Some(c), None) = (chars.next(), chars.next()) {
        return Ok(Key::Unicode(c));
    }
    match lower.as_str() {
        "enter" | "return" => Ok(Key::Return),
        "tab" => Ok(Key::Tab),
        "escape" | "esc" => Ok(Key::Escape),
        "space" => Ok(Key::Space),
        "backspace" | "delete" => Ok(Key::Backspace),
        "up" | "arrowup" => Ok(Key::UpArrow),
        "down" | "arrowdown" => Ok(Key::DownArrow),
        "left" | "arrowleft" => Ok(Key::LeftArrow),
        "right" | "arrowright" => Ok(Key::RightArrow),
        "home" => Ok(Key::Home),
        "end" => Ok(Key::End),
        "pageup" => Ok(Key::PageUp),
        "pagedown" => Ok(Key::PageDown),
        "f1" => Ok(Key::F1),
        "f2" => Ok(Key::F2),
        "f3" => Ok(Key::F3),
        "f4" => Ok(Key::F4),
        "f5" => Ok(Key::F5),
        "f6" => Ok(Key::F6),
        "f7" => Ok(Key::F7),
        "f8" => Ok(Key::F8),
        "f9" => Ok(Key::F9),
        "f10" => Ok(Key::F10),
        "f11" => Ok(Key::F11),
        "f12" => Ok(Key::F12),
        other => Err(format!("unknown key: {other}")),
    }
}

/// Press a key with optional modifiers, e.g. key="s", modifiers=["cmd"].
/// Modifiers are held (Press), the key is clicked, then modifiers are
/// released in reverse order — always released, even on failure, so keys
/// never stick down.
#[tauri::command]
pub fn press_key(key: String, modifiers: Vec<String>) -> Result<(), String> {
    ensure_accessibility()?;
    let combo = if modifiers.is_empty() {
        key.clone()
    } else {
        format!("{}+{}", modifiers.join("+"), key)
    };
    eprintln!("[keyboard] press_key {combo}");

    let mods: Vec<Key> = modifiers
        .iter()
        .map(|m| parse_modifier(m))
        .collect::<Result<_, _>>()?;
    let main = parse_key(&key)?;

    let mut enigo = new_enigo()?;
    for m in &mods {
        enigo
            .key(*m, Direction::Press)
            .map_err(|e| format!("[keyboard] modifier press failed: {e}"))?;
    }
    let result = enigo
        .key(main, Direction::Click)
        .map_err(|e| format!("[keyboard] key click failed: {e}"));
    for m in mods.iter().rev() {
        let _ = enigo.key(*m, Direction::Release);
    }
    result
}

// ---------------------------------------------------------------------------
// Mouse
// ---------------------------------------------------------------------------

/// Move to (x, y) in absolute screen coordinates (points, not retina pixels)
/// and click the given button ("left" | "right" | "middle").
#[tauri::command]
pub fn mouse_click(x: f64, y: f64, button: String) -> Result<(), String> {
    ensure_accessibility()?;
    eprintln!("[mouse] click {x},{y} {button}");
    let btn = match button.to_ascii_lowercase().as_str() {
        "left" => Button::Left,
        "right" => Button::Right,
        "middle" => Button::Middle,
        other => return Err(format!("unknown mouse button: {other}")),
    };
    let mut enigo = new_enigo()?;
    enigo
        .move_mouse(x as i32, y as i32, Coordinate::Abs)
        .map_err(|e| format!("[mouse] move failed: {e}"))?;
    enigo
        .button(btn, Direction::Click)
        .map_err(|e| format!("[mouse] click failed: {e}"))
}

/// Move the cursor to (x, y) in absolute screen coordinates without clicking.
#[tauri::command]
pub fn mouse_move(x: f64, y: f64) -> Result<(), String> {
    ensure_accessibility()?;
    eprintln!("[mouse] move {x},{y}");
    let mut enigo = new_enigo()?;
    enigo
        .move_mouse(x as i32, y as i32, Coordinate::Abs)
        .map_err(|e| format!("[mouse] move failed: {e}"))
}

// ---------------------------------------------------------------------------
// Screenshot
// ---------------------------------------------------------------------------

/// Capture the screen via `screencapture -x` (silent) to a temp PNG, return
/// the bytes, and delete the file. `region` is "x,y,w,h" (passed straight to
/// `-R`). RESEARCH Q8: screencapture cannot stream to stdout, so temp file +
/// read is the supported path. A tiny/blank PNG usually means the Screen
/// Recording TCC permission is missing — we warn but still return the bytes.
#[tauri::command]
pub fn take_screenshot(region: Option<String>) -> Result<Vec<u8>, String> {
    let path = std::env::temp_dir().join(format!(
        "jarvis-screenshot-{}-{}.png",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis())
            .unwrap_or(0)
    ));

    let mut cmd = Command::new("screencapture");
    cmd.arg("-x"); // silent — no shutter sound
    if let Some(r) = &region {
        cmd.arg("-R").arg(r);
    }
    cmd.arg(&path);

    if let Err(e) = run_with_timeout(
        cmd,
        None,
        Duration::from_millis(DEFAULT_TIMEOUT_MS),
        "screenshot",
    )
    .and_then(|o| output_to_result(o, "screenshot"))
    {
        let _ = std::fs::remove_file(&path);
        eprintln!("[screenshot] failed: {e}");
        return Err(e);
    }

    let bytes = std::fs::read(&path);
    let _ = std::fs::remove_file(&path);
    let bytes = bytes.map_err(|e| format!("[screenshot] read failed: {e}"))?;

    eprintln!("[screenshot] captured ({} bytes)", bytes.len());
    if bytes.len() < 20_000 {
        eprintln!(
            "[screenshot] WARNING: output is suspiciously small ({} bytes) — likely a blank \
             capture; check Screen Recording permission (System Settings → Privacy & Security → \
             Screen Recording)",
            bytes.len()
        );
    }
    Ok(bytes)
}

// ---------------------------------------------------------------------------
// System control
// ---------------------------------------------------------------------------

/// The `brightness` CLI lives in Homebrew's prefix, which is NOT on the
/// minimal PATH a GUI-launched .app gets. Check the known install locations
/// first, then fall back to a PATH lookup (dev shells).
fn find_brightness_cli() -> Option<std::path::PathBuf> {
    for candidate in ["/opt/homebrew/bin/brightness", "/usr/local/bin/brightness"] {
        let p = std::path::Path::new(candidate);
        if p.exists() {
            return Some(p.to_path_buf());
        }
    }
    let on_path = Command::new("which")
        .arg("brightness")
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false);
    if on_path {
        Some(std::path::PathBuf::from("brightness"))
    } else {
        None
    }
}

/// Dispatch a system-level control action (RESEARCH Q4):
/// - "volume":     value = 0-100 → `osascript -e 'set volume output volume N'`
/// - "brightness": value = 0.0-1.0 (or 0-100) → `brightness` CLI (brew)
/// - "sleep":      `pmset displaysleepnow`
/// - "focus":      value = Shortcuts shortcut name (Focus toggling is only
///                 reliable via Shortcuts.app)
#[tauri::command]
pub fn system_control(action: String, value: Option<String>) -> Result<String, String> {
    eprintln!("[system] {} {}", action, value.as_deref().unwrap_or(""));
    match action.as_str() {
        "volume" => {
            let raw = value
                .as_deref()
                .ok_or_else(|| "volume requires a value (0-100)".to_string())?;
            let n = raw
                .trim()
                .parse::<f64>()
                .map_err(|_| format!("invalid volume value: {raw}"))?;
            let n = n.clamp(0.0, 100.0).round() as i64;
            let mut cmd = Command::new("osascript");
            cmd.arg("-e")
                .arg(format!("set volume output volume {n}"));
            run_with_timeout(cmd, None, Duration::from_millis(DEFAULT_TIMEOUT_MS), "system")
                .and_then(|o| output_to_result(o, "system"))
                .map(|_| format!("volume set to {n}"))
                .map_err(|e| {
                    eprintln!("[system] volume failed: {e}");
                    e
                })
        }
        "brightness" => {
            let raw = value
                .as_deref()
                .ok_or_else(|| "brightness requires a value (0.0-1.0 or 0-100)".to_string())?;
            let n = raw
                .trim()
                .parse::<f64>()
                .map_err(|_| format!("invalid brightness value: {raw}"))?;
            // Accept both 0.75 and 75 (percent) forms.
            let n = (if n > 1.0 { n / 100.0 } else { n }).clamp(0.0, 1.0);
            let Some(cli) = find_brightness_cli() else {
                let msg =
                    "brightness CLI not installed — brew install brightness".to_string();
                eprintln!("[system] {msg}");
                return Err(msg);
            };
            let mut cmd = Command::new(cli);
            cmd.arg(format!("{n:.2}"));
            run_with_timeout(cmd, None, Duration::from_millis(DEFAULT_TIMEOUT_MS), "system")
                .and_then(|o| output_to_result(o, "system"))
                .map(|_| format!("brightness set to {:.0}%", n * 100.0))
                .map_err(|e| {
                    eprintln!("[system] brightness failed: {e}");
                    e
                })
        }
        "sleep" => {
            let mut cmd = Command::new("pmset");
            cmd.arg("displaysleepnow");
            run_with_timeout(cmd, None, Duration::from_millis(DEFAULT_TIMEOUT_MS), "system")
                .and_then(|o| output_to_result(o, "system"))
                .map(|_| "display sleeping".to_string())
                .map_err(|e| {
                    eprintln!("[system] sleep failed: {e}");
                    e
                })
        }
        "focus" => {
            let name = value
                .as_deref()
                .ok_or_else(|| "focus requires a Shortcuts shortcut name as value".to_string())?;
            run_shortcut_inner(name, None).map(|out| {
                if out.is_empty() {
                    format!("focus shortcut '{name}' ran")
                } else {
                    out
                }
            })
        }
        other => Err(format!(
            "unknown system_control action: {other} (expected volume | brightness | sleep | focus)"
        )),
    }
}
