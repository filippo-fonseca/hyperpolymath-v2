use std::sync::{mpsc, Mutex, OnceLock};
use std::thread;

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use serde::Serialize;
use tauri::{AppHandle, Emitter};

const TARGET_SAMPLE_RATE: u32 = 16_000;

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
                let stream_result = device.build_input_stream(
                    &config.clone().into(),
                    move |data: &[f32], _: &cpal::InputCallbackInfo| {
                        // 1. Downmix interleaved channels to mono by averaging.
                        let mono: Vec<f32> = data
                            .chunks(channels)
                            .map(|frame| frame.iter().sum::<f32>() / channels as f32)
                            .collect();
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
    let cell = ensure_controller(app);
    let guard = cell.lock().map_err(|e| e.to_string())?;
    let ctrl = guard.as_ref().ok_or("audio controller not initialized")?;
    ctrl.sender
        .send(AudioCommand::Stop)
        .map_err(|e| e.to_string())
}
