// Native macOS `say` fallback voice.
//
// When ElevenLabs TTS is unavailable the desktop must still speak, in the
// butler register, offline. The prior approach shelled out to `say` through the
// Tauri shell plugin (scoped commands `say-voice` / `say-plain` in
// capabilities/default.json). That scope never registered at runtime — every
// spawn failed with "Scoped command say-voice not found" — so the fallback fell
// through to web SpeechSynthesis, which a global-hotkey invocation can't play
// (the WKWebView AudioContext stays suspended, exactly like the primary TTS
// path). The fix is to own the process directly in Rust, mirroring the audio /
// whatsapp managed-process idiom: a single managed `say` child, tracked in Tauri
// state, killed before each new utterance so barge-in / new-turn interrupts it.
//
// `speak_fallback(text, voice)` spawns `/usr/bin/say -v <voice> <text>` (voice
// optional), first killing any previous `say` child so a new line always
// preempts the old one — the same interrupt semantics the ElevenLabs path has.
// `speak_fallback_stop()` kills the current child so a barge-in / stop silences
// the fallback immediately. Both are no-ops off macOS; the TS side keeps its
// SpeechSynthesis branch for non-macOS / off-Tauri.

use std::process::Child;
use std::sync::Mutex;

/// Absolute path to macOS `say`. Absolute (not bare `say`) so it resolves
/// regardless of the launched app's PATH.
#[cfg(target_os = "macos")]
const SAY_BIN: &str = "/usr/bin/say";

/// Managed handle to the single in-flight `say` child. Tracked in Tauri state
/// (like `WhatsappBridge`) so a new utterance or a stop can kill the previous
/// one for barge-in. `Default` gives an empty slot at startup.
#[derive(Default)]
pub struct SayFallback {
    child: Mutex<Option<Child>>,
}

impl SayFallback {
    /// Kill the currently-tracked `say` child, if any. Best-effort: a failed
    /// kill (child already exited) must never surface an error into the TTS
    /// path. Called before each new utterance and by `speak_fallback_stop`.
    fn kill_current(&self) {
        if let Ok(mut guard) = self.child.lock() {
            if let Some(mut child) = guard.take() {
                let _ = child.kill();
                // Reap so the exited process isn't left a zombie.
                let _ = child.wait();
            }
        }
    }
}

/// Speak one line via native macOS `say`, killing any previous `say` child
/// first so a new turn / barge-in preempts the old utterance. `voice` is the
/// macOS voice name (e.g. "Daniel"); when absent, `say` uses the system default.
///
/// The command RESOLVES WHEN THE UTTERANCE FINISHES (the `say` process exits),
/// not on spawn: the TS `LocalSpeech` drain awaits this so fallback sentences
/// play one at a time, in order — the same contract the old shell-plugin
/// `close` event provided. It is `async` so blocking on the child's exit
/// happens on Tauri's async runtime, never the main thread; meanwhile a
/// concurrent `speak_fallback_stop` (a separate command invocation) can kill
/// the tracked child, which makes this wait return promptly for barge-in.
///
/// A spawn failure returns `Err` so the TS side can fall through to
/// SpeechSynthesis.
#[tauri::command]
pub async fn speak_fallback(
    app: tauri::AppHandle,
    text: String,
    voice: Option<String>,
) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        use tauri::Manager;

        let line = text.trim().to_string();
        if line.is_empty() {
            return Ok(());
        }

        // Spawn on a blocking thread so the child's `wait()` never parks an
        // async-runtime worker. Returns the child's exit status (or spawn error).
        let result = tauri::async_runtime::spawn_blocking(move || {
            let state = app.state::<SayFallback>();

            // Barge-in: kill any previous `say` before starting the new line.
            state.kill_current();

            let mut cmd = std::process::Command::new(SAY_BIN);
            if let Some(v) = voice.as_deref() {
                let v = v.trim();
                if !v.is_empty() {
                    cmd.arg("-v").arg(v);
                }
            }
            cmd.arg(&line);

            let child = cmd
                .spawn()
                .map_err(|err| format!("say spawn failed: {err}"))?;
            eprintln!("[say] speaking fallback line ({} chars)", line.len());

            // Track the child so a concurrent stop / next utterance can kill it.
            if let Ok(mut guard) = state.child.lock() {
                *guard = Some(child);
            }

            // Wait for the utterance to finish by polling the tracked slot: a
            // barge-in (`kill_current`) removes and reaps the child, so once the
            // slot is empty OR the child has exited on its own, the line is done.
            loop {
                let done = {
                    match state.child.lock() {
                        Ok(mut guard) => match guard.as_mut() {
                            // `try_wait` returns Ok(Some(_)) once `say` exits.
                            Some(child) => matches!(child.try_wait(), Ok(Some(_)) | Err(_)),
                            // Slot cleared by a stop / next utterance — superseded.
                            None => true,
                        },
                        Err(_) => true,
                    }
                };
                if done {
                    // Clear our own finished child from the slot (unless a newer
                    // utterance already replaced it — leave that one alone).
                    if let Ok(mut guard) = state.child.lock() {
                        if let Some(child) = guard.as_mut() {
                            if matches!(child.try_wait(), Ok(Some(_)) | Err(_)) {
                                let _ = guard.take();
                            }
                        }
                    }
                    break;
                }
                std::thread::sleep(std::time::Duration::from_millis(40));
            }
            Ok::<(), String>(())
        })
        .await
        .map_err(|err| format!("say task join failed: {err}"))?;

        result
    }

    #[cfg(not(target_os = "macos"))]
    {
        // No native `say` off macOS — the TS side falls through to SpeechSynthesis.
        let _ = (app, text, voice);
        Err("native say fallback is macOS-only".to_string())
    }
}

/// Stop the native `say` fallback immediately (barge-in / new turn / TTS
/// disabled). Kills the tracked child; a no-op when nothing is speaking or off
/// macOS. Never errors — stopping speech must not fail the caller.
#[tauri::command]
pub fn speak_fallback_stop(app: tauri::AppHandle) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        use tauri::Manager;
        app.state::<SayFallback>().kill_current();
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = app;
    }
    Ok(())
}
