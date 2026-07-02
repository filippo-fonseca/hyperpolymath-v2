use std::sync::{mpsc, Mutex, OnceLock};
use std::thread;
use std::time::Duration;

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use serde::Serialize;
use tauri::{AppHandle, Emitter};

const TARGET_SAMPLE_RATE: u32 = 16_000;
/// TTS playback sample rate — matches the server PCM output (pcm_24000, mono).
const TTS_SAMPLE_RATE: u32 = 24_000;

#[derive(Debug)]
enum AudioCommand {
    Start,
    Stop,
}

/// Emitted to the webview on every cpal callback. Samples are already
/// downsampled to 16 kHz mono — the TS side does NOT need to resample.
#[derive(Serialize, Clone)]
pub struct AudioChunk {
    pub samples: Vec<f32>,
    /// Always TARGET_SAMPLE_RATE (16_000). Field is included in the payload
    /// so the TS side can assert correctness and future-proof against rate changes.
    pub sample_rate: u32,
}

struct AudioController {
    sender: mpsc::Sender<AudioCommand>,
}

/// One-time global: the mpsc sender to the audio thread.
/// Initialised on first call to ensure_controller; never reset.
static CONTROLLER: OnceLock<Mutex<Option<AudioController>>> = OnceLock::new();

fn ensure_controller(app: &AppHandle) -> &'static Mutex<Option<AudioController>> {
    CONTROLLER.get_or_init(|| {
        let (tx, rx) = mpsc::channel::<AudioCommand>();
        let app = app.clone();
        thread::spawn(move || audio_thread_main(app, rx));
        Mutex::new(Some(AudioController { sender: tx }))
    })
}

/// Long-lived audio thread. Owns the cpal::Stream for its lifetime so
/// CoreAudio's thread-affinity requirement (Pitfall 2) is satisfied.
fn audio_thread_main(app: AppHandle, rx: mpsc::Receiver<AudioCommand>) {
    let host = cpal::default_host();
    let device = match host.default_input_device() {
        Some(d) => d,
        None => {
            eprintln!("[audio] no default input device");
            return;
        }
    };
    let config = match device.default_input_config() {
        Ok(c) => c,
        Err(e) => {
            eprintln!("[audio] default_input_config: {e}");
            return;
        }
    };
    let input_sample_rate = config.sample_rate().0;
    let input_channels = config.channels() as usize;

    // active_stream is Some while capturing, None while idle.
    let mut active_stream: Option<cpal::Stream> = None;

    while let Ok(cmd) = rx.recv() {
        match cmd {
            AudioCommand::Start => {
                if active_stream.is_some() {
                    // Already running — idempotent.
                    continue;
                }
                let app_clone = app.clone();
                let channels = input_channels;
                let in_rate = input_sample_rate;
                let mut cb: u32 = 0;
                eprintln!("[audio] opening input stream: in_rate={in_rate} channels={channels}");
                let stream_result = device.build_input_stream(
                    &config.clone().into(),
                    move |data: &[f32], _: &cpal::InputCallbackInfo| {
                        // 1. Downmix interleaved channels to mono by averaging.
                        let mono: Vec<f32> = data
                            .chunks(channels)
                            .map(|frame| frame.iter().sum::<f32>() / channels as f32)
                            .collect();
                        cb = cb.wrapping_add(1);
                        if cb % 25 == 0 && !mono.is_empty() {
                            let rms = (mono.iter().map(|x| x * x).sum::<f32>()
                                / mono.len() as f32)
                                .sqrt();
                            eprintln!("[audio] mic chunk#{cb} n={} rms={rms:.4}", mono.len());
                        }
                        // 2. Linear-interpolation resample to TARGET_SAMPLE_RATE (16 kHz).
                        let resampled = resample_linear(&mono, in_rate, TARGET_SAMPLE_RATE);
                        let _ = app_clone.emit(
                            "audio-chunk",
                            AudioChunk {
                                samples: resampled,
                                sample_rate: TARGET_SAMPLE_RATE,
                            },
                        );
                    },
                    |err| eprintln!("[audio] stream error: {err}"),
                    None,
                );
                match stream_result {
                    Ok(stream) => {
                        if let Err(e) = stream.play() {
                            eprintln!("[audio] stream.play failed: {e}");
                            continue;
                        }
                        active_stream = Some(stream);
                    }
                    Err(e) => eprintln!("[audio] build_input_stream failed: {e}"),
                }
            }
            AudioCommand::Stop => {
                // Drop the stream — this signals CoreAudio to stop the session
                // and releases the OS microphone indicator.
                if let Some(stream) = active_stream.take() {
                    drop(stream);
                }
            }
        }
    }
}

/// Linear-interpolation resample. Intentionally simple — Whisper tolerates
/// mild high-frequency roll-off from linear resampling. See SUMMARY.md for
/// the accuracy trade-off rationale.
fn resample_linear(samples: &[f32], in_rate: u32, out_rate: u32) -> Vec<f32> {
    if in_rate == out_rate || samples.is_empty() {
        return samples.to_vec();
    }
    let ratio = in_rate as f64 / out_rate as f64;
    let out_len = ((samples.len() as f64) / ratio).floor() as usize;
    let mut out = Vec::with_capacity(out_len);
    for i in 0..out_len {
        let src_pos = i as f64 * ratio;
        let lo = src_pos.floor() as usize;
        let hi = (lo + 1).min(samples.len() - 1);
        let frac = (src_pos - lo as f64) as f32;
        let a = samples[lo];
        let b = samples[hi];
        out.push(a + (b - a) * frac);
    }
    out
}

/// Send `Start` to the audio thread, opening the cpal stream.
/// Called from the `start_capture` Tauri command.
pub fn send_command_start(app: &AppHandle) -> Result<(), String> {
    eprintln!("[audio] start_capture invoked");
    let cell = ensure_controller(app);
    let guard = cell.lock().map_err(|e| e.to_string())?;
    let ctrl = guard.as_ref().ok_or("audio controller not initialized")?;
    ctrl.sender
        .send(AudioCommand::Start)
        .map_err(|e| e.to_string())
}

/// Send `Stop` to the audio thread, dropping the cpal stream + releasing mic.
/// Called from the `stop_capture` Tauri command.
pub fn send_command_stop(app: &AppHandle) -> Result<(), String> {
    eprintln!("[audio] stop_capture invoked");
    let cell = ensure_controller(app);
    let guard = cell.lock().map_err(|e| e.to_string())?;
    let ctrl = guard.as_ref().ok_or("audio controller not initialized")?;
    ctrl.sender
        .send(AudioCommand::Stop)
        .map_err(|e| e.to_string())
}

// ─────────────────────────────────────────────────────────────────────────────
// TTS output (rodio) — the definitive fix for hands-free silence + the FSM
// freeze. A GLOBAL hotkey gives no in-webview user gesture, so the WKWebView
// AudioContext stays suspended: no sound, and `source.onended` never fires so
// the per-sentence promise never resolves → the queue is stuck "playing" → the
// FSM is stuck "speaking". Playing in Rust via rodio bypasses the webview
// entirely; a poll loop emits `tts-playing` / `tts-idle` so the frontend drives
// state from the REAL playback state (single source of truth).
// ─────────────────────────────────────────────────────────────────────────────

enum TtsCommand {
    /// Append 16-bit signed LE PCM bytes (24 kHz mono) to the sink queue.
    Play(Vec<u8>),
    /// Stop playback immediately and clear everything queued.
    Stop,
}

struct TtsController {
    sender: mpsc::Sender<TtsCommand>,
}

/// One-time global: the mpsc sender to the TTS output thread.
static TTS_CONTROLLER: OnceLock<Mutex<Option<TtsController>>> = OnceLock::new();

fn ensure_tts_controller(app: &AppHandle) -> &'static Mutex<Option<TtsController>> {
    TTS_CONTROLLER.get_or_init(|| {
        let (tx, rx) = mpsc::channel::<TtsCommand>();
        let app = app.clone();
        thread::spawn(move || tts_thread_main(app, rx));
        Mutex::new(Some(TtsController { sender: tx }))
    })
}

/// Long-lived TTS output thread. Owns the `rodio::OutputStream` + `Sink` for the
/// app's lifetime. `OutputStream` is NOT `Send`, so it MUST live on this thread
/// and never cross a thread boundary — that is exactly why we drive it via an
/// mpsc channel rather than a shared handle. Dropping the stream would silence
/// output, so it is held for as long as the thread runs.
fn tts_thread_main(app: AppHandle, rx: mpsc::Receiver<TtsCommand>) {
    // Try to open the default output device. If this fails (headless / no
    // device), we still drain the channel so senders never block and the
    // frontend still receives `tts-idle` for every play request (see below),
    // guaranteeing the queue/FSM can never wedge.
    let stream = rodio::OutputStream::try_default();
    let (sink, _stream_keepalive) = match stream {
        Ok((os, handle)) => match rodio::Sink::try_new(&handle) {
            Ok(sink) => {
                eprintln!("[tts] rodio output device opened OK");
                (Some(sink), Some(os))
            }
            Err(e) => {
                eprintln!("[tts] rodio Sink::try_new failed: {e}");
                (None, Some(os))
            }
        },
        Err(e) => {
            eprintln!("[tts] no output device ({e}) — playback disabled, state still advances");
            (None, None)
        }
    };

    // `was_playing` tracks the last emitted state so we only emit on edges.
    let mut was_playing = false;

    loop {
        // Poll the channel with a short timeout so we can also poll the sink's
        // drain state and emit tts-playing / tts-idle edges.
        match rx.recv_timeout(Duration::from_millis(60)) {
            Ok(TtsCommand::Play(bytes)) => {
                let samples = pcm_le_to_i16(&bytes);
                if let Some(sink) = sink.as_ref() {
                    if !samples.is_empty() {
                        let buf =
                            rodio::buffer::SamplesBuffer::new(1, TTS_SAMPLE_RATE, samples);
                        // FIFO: sentences play in the order appended.
                        sink.append(buf);
                        if !was_playing {
                            was_playing = true;
                            let _ = app.emit("tts-playing", ());
                        }
                    }
                } else {
                    // No sink — nothing will ever go "playing", so make sure the
                    // frontend still sees an idle tick and advances the queue.
                    let _ = app.emit("tts-idle", ());
                }
            }
            Ok(TtsCommand::Stop) => {
                if let Some(sink) = sink.as_ref() {
                    sink.stop(); // stop + clear the queue
                }
                if was_playing {
                    was_playing = false;
                    let _ = app.emit("tts-idle", ());
                }
            }
            Err(mpsc::RecvTimeoutError::Timeout) => {
                // No command — reconcile emitted state with the real sink state.
                if let Some(sink) = sink.as_ref() {
                    let empty = sink.empty();
                    if was_playing && empty {
                        was_playing = false;
                        let _ = app.emit("tts-idle", ());
                    } else if !was_playing && !empty {
                        was_playing = true;
                        let _ = app.emit("tts-playing", ());
                    }
                }
            }
            Err(mpsc::RecvTimeoutError::Disconnected) => break,
        }
    }
}

/// Convert 16-bit signed little-endian PCM bytes to `Vec<i16>`. A trailing odd
/// byte (should never happen for well-formed PCM) is dropped.
fn pcm_le_to_i16(bytes: &[u8]) -> Vec<i16> {
    bytes
        .chunks_exact(2)
        .map(|c| i16::from_le_bytes([c[0], c[1]]))
        .collect()
}

/// Append raw PCM to the TTS sink (FIFO). Called from `tts_play_pcm`.
pub fn tts_send_play(app: &AppHandle, bytes: Vec<u8>) -> Result<(), String> {
    eprintln!("[tts] play_pcm invoked ({} bytes)", bytes.len());
    let cell = ensure_tts_controller(app);
    let guard = cell.lock().map_err(|e| e.to_string())?;
    let ctrl = guard.as_ref().ok_or("tts controller not initialized")?;
    ctrl.sender
        .send(TtsCommand::Play(bytes))
        .map_err(|e| e.to_string())
}

/// Stop + clear TTS playback. Called from `tts_stop` / `tts_clear`.
pub fn tts_send_stop(app: &AppHandle) -> Result<(), String> {
    let cell = ensure_tts_controller(app);
    let guard = cell.lock().map_err(|e| e.to_string())?;
    let ctrl = guard.as_ref().ok_or("tts controller not initialized")?;
    ctrl.sender
        .send(TtsCommand::Stop)
        .map_err(|e| e.to_string())
}
