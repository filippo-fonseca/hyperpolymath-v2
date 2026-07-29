use std::sync::{mpsc, Mutex, OnceLock};
use std::thread;
use std::time::Duration;

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use serde::Serialize;
use tauri::{AppHandle, Emitter};
use tauri_plugin_store::StoreExt;

const TARGET_SAMPLE_RATE: u32 = 16_000;
/// TTS playback sample rate — matches the server PCM output (pcm_24000, mono).
const TTS_SAMPLE_RATE: u32 = 24_000;

/// The settings file the TypeScript side already writes (`src/settings.ts`).
/// Read from Rust so device selection needs no boot-time wiring in either
/// webview: whoever opens the stream reads the user's choice at that moment.
const SETTINGS_STORE: &str = "jarvis-desktop-settings.json";
/// Store key holding the user's explicitly chosen input device NAME, or absent
/// / null to follow whatever macOS reports as the system default.
const INPUT_DEVICE_KEY: &str = "audio.inputDevice";

/// How much audio has to arrive as pure digital silence before the device is
/// reported as producing nothing. Half a second: long enough that it is not
/// tripped by the leading gap before someone starts speaking, short enough to
/// beat the shortest realistic utterance.
const SILENT_DEVICE_WINDOW_MS: u32 = 500;

/// What counts as "not silence". A real microphone never delivers exact zeros:
/// even a muted room carries a noise floor two or three orders of magnitude
/// above this. A loopback device with nothing routed into it delivers exactly
/// 0.0 forever. That gap is the whole discriminator, which is why the threshold
/// is this low rather than an RMS gate: this test answers "is the device dead",
/// not "is the user speaking".
const DIGITAL_SILENCE_EPSILON: f32 = 1e-7;

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

/// One selectable microphone, as reported by cpal.
#[derive(Serialize, Clone, Debug)]
pub struct InputDeviceInfo {
    pub name: String,
    pub channels: u16,
    pub sample_rate: u32,
    /// True for whichever device cpal resolves as the system default right now.
    pub is_default: bool,
}

/// Emitted on `audio-device` every time a capture stream opens, so the frontend
/// can show which microphone is actually live rather than guessing.
#[derive(Serialize, Clone, Debug)]
pub struct OpenedDevice {
    pub name: String,
    pub sample_rate: u32,
    pub channels: u16,
    /// True when the user picked this device explicitly rather than inheriting
    /// the system default.
    pub explicit: bool,
}

/// Emitted once per stream on `audio-input-silent` when the open device has
/// delivered nothing but exact zeros for {@link SILENT_DEVICE_WINDOW_MS}.
///
/// This exists because of a real failure on the user's machine: the macOS
/// default input was BlackHole / QuickTime Input, both silent virtual loopback
/// devices, so every capture produced `rms=0.0000` and the pill had no way to
/// tell that apart from a user who simply had not spoken yet.
#[derive(Serialize, Clone, Debug)]
pub struct SilentDevice {
    pub name: String,
    pub channels: u16,
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

/// The user's explicitly chosen input device name, or `None` to follow the
/// system default. Read fresh from the settings store on every stream open.
fn preferred_input_name(app: &AppHandle) -> Option<String> {
    let store = app.store(SETTINGS_STORE).ok()?;
    let value = store.get(INPUT_DEVICE_KEY)?;
    let name = value.as_str()?.trim().to_string();
    if name.is_empty() {
        None
    } else {
        Some(name)
    }
}

/// Which microphone to open, resolved at the moment of opening.
///
/// Resolving here rather than once at thread start is the fix for the live
/// failure: the audio thread outlives every capture, so a device chosen when
/// the process booted was still being used hours later, long after the user had
/// connected the headset they were actually speaking into.
///
/// An explicit choice that no longer enumerates (the headset is unplugged) falls
/// back to the system default rather than refusing to record, because a pill
/// that silently does nothing is the worse failure.
fn resolve_input_device(
    app: &AppHandle,
    host: &cpal::Host,
) -> Option<(cpal::Device, cpal::SupportedStreamConfig, String, bool)> {
    let preferred = preferred_input_name(app);

    if let Some(wanted) = preferred.as_deref() {
        match host.input_devices() {
            Ok(devices) => {
                for device in devices {
                    if device.name().ok().as_deref() != Some(wanted) {
                        continue;
                    }
                    match device.default_input_config() {
                        Ok(config) => return Some((device, config, wanted.to_string(), true)),
                        Err(error) => {
                            eprintln!(
                                "[audio] chosen input device {wanted:?} has no usable config \
                                 ({error}); falling back to the system default"
                            );
                        }
                    }
                    break;
                }
                eprintln!(
                    "[audio] chosen input device {wanted:?} is not connected; \
                     falling back to the system default"
                );
            }
            Err(error) => eprintln!("[audio] input_devices() failed: {error}"),
        }
    }

    let device = match host.default_input_device() {
        Some(device) => device,
        None => {
            eprintln!("[audio] no default input device");
            return None;
        }
    };
    let name = device.name().unwrap_or_else(|_| "<unnamed>".to_string());
    let config = match device.default_input_config() {
        Ok(config) => config,
        Err(error) => {
            eprintln!("[audio] default_input_config for {name:?}: {error}");
            return None;
        }
    };
    Some((device, config, name, false))
}

/// Long-lived audio thread. Owns the cpal::Stream for its lifetime so
/// CoreAudio's thread-affinity requirement (Pitfall 2) is satisfied.
fn audio_thread_main(app: AppHandle, rx: mpsc::Receiver<AudioCommand>) {
    let host = cpal::default_host();

    // active_stream is Some while capturing, None while idle.
    let mut active_stream: Option<cpal::Stream> = None;

    while let Ok(cmd) = rx.recv() {
        match cmd {
            AudioCommand::Start => {
                if active_stream.is_some() {
                    // Already running — idempotent.
                    continue;
                }
                let Some((device, config, device_name, explicit)) =
                    resolve_input_device(&app, &host)
                else {
                    continue;
                };
                let in_rate = config.sample_rate().0;
                let channel_count = config.channels();
                let channels = channel_count as usize;

                // The device NAME is the load-bearing part of this line. Without
                // it a silent virtual loopback device is indistinguishable in the
                // log from a real microphone in a quiet room, which is exactly
                // how this bug survived until a live session.
                eprintln!(
                    "[audio] opening input stream: device={device_name:?} in_rate={in_rate} \
                     channels={channels} format={:?} source={}",
                    config.sample_format(),
                    if explicit { "chosen" } else { "system-default" }
                );
                let _ = app.emit(
                    "audio-device",
                    OpenedDevice {
                        name: device_name.clone(),
                        sample_rate: in_rate,
                        channels: channel_count,
                        explicit,
                    },
                );

                let app_clone = app.clone();
                let mut cb: u32 = 0;
                let mut resampler = LinearResampler::new(in_rate, TARGET_SAMPLE_RATE);
                let mut silence = SilenceWatch::new(in_rate);
                let silent_name = device_name.clone();
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
                        // 2. Is this device producing anything at all?
                        if silence.observe(&mono) {
                            eprintln!(
                                "[audio] {silent_name:?} has delivered {SILENT_DEVICE_WINDOW_MS}ms \
                                 of pure digital silence — it is almost certainly a virtual \
                                 loopback device with nothing routed into it"
                            );
                            let _ = app_clone.emit(
                                "audio-input-silent",
                                SilentDevice {
                                    name: silent_name.clone(),
                                    channels: channel_count,
                                    sample_rate: in_rate,
                                },
                            );
                        }
                        // 3. Resample to TARGET_SAMPLE_RATE (16 kHz), carrying
                        //    position across callbacks so chunk boundaries do
                        //    not drop samples or click.
                        let resampled = resampler.process(&mono);
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
                    Err(e) => {
                        eprintln!("[audio] build_input_stream failed for {device_name:?}: {e}")
                    }
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

/// Watches a stream for pure digital silence and fires exactly once.
struct SilenceWatch {
    /// Samples of silence still to observe before reporting. Zero means the
    /// watch has already fired or has been stood down by real signal.
    remaining: i64,
    fired: bool,
}

impl SilenceWatch {
    fn new(in_rate: u32) -> Self {
        Self {
            remaining: (in_rate as i64 * SILENT_DEVICE_WINDOW_MS as i64) / 1000,
            fired: false,
        }
    }

    /// Feed one mono buffer. Returns true on the single callback where the
    /// silence window completes, and never again for this stream.
    fn observe(&mut self, mono: &[f32]) -> bool {
        if self.fired {
            return false;
        }
        if mono.iter().any(|s| s.abs() > DIGITAL_SILENCE_EPSILON) {
            // Real signal. Stand the watch down permanently: a device that has
            // ever produced audio is not a dead device, and re-arming would
            // report every natural pause in speech.
            self.fired = true;
            return false;
        }
        self.remaining -= mono.len() as i64;
        if self.remaining > 0 {
            return false;
        }
        self.fired = true;
        true
    }
}

/// Linear-interpolation resampler that carries its read position across
/// callbacks.
///
/// Intentionally simple filtering-wise: Whisper tolerates the mild
/// high-frequency roll-off linear interpolation causes. What it does NOT
/// tolerate is a resampler that restarts at position zero on every buffer, as
/// the previous stateless version did. That drops the fractional remainder of
/// each callback (about 0.4% of the audio at 48 kHz, plus a phase step at every
/// boundary), and the artefact grows as the rate ratio moves away from a whole
/// number: at 24 kHz, the rate the user's Bluetooth headset actually runs at,
/// the ratio is 1.5 and every other buffer lands mid-sample.
///
/// The read position lives in a virtual index space where -1 addresses the last
/// sample of the PREVIOUS buffer, which is what makes interpolation continuous
/// across the seam.
struct LinearResampler {
    in_rate: u32,
    out_rate: u32,
    /// Next position to read, in the current buffer's index space. Always
    /// greater than -1.
    pos: f64,
    /// Final sample of the previous buffer, addressed as index -1.
    last: f32,
}

impl LinearResampler {
    fn new(in_rate: u32, out_rate: u32) -> Self {
        Self {
            in_rate,
            out_rate,
            pos: 0.0,
            last: 0.0,
        }
    }

    fn sample(&self, input: &[f32], index: i64) -> f32 {
        if index < 0 {
            self.last
        } else {
            let clamped = (index as usize).min(input.len() - 1);
            input[clamped]
        }
    }

    fn process(&mut self, input: &[f32]) -> Vec<f32> {
        if input.is_empty() {
            return Vec::new();
        }
        let last_in = input[input.len() - 1];
        if self.in_rate == self.out_rate {
            self.last = last_in;
            return input.to_vec();
        }

        let ratio = self.in_rate as f64 / self.out_rate as f64;
        let limit = (input.len() - 1) as f64;
        let mut out = Vec::with_capacity((input.len() as f64 / ratio).ceil() as usize + 1);
        while self.pos <= limit {
            let lo = self.pos.floor() as i64;
            let frac = (self.pos - lo as f64) as f32;
            let a = self.sample(input, lo);
            let b = self.sample(input, lo + 1);
            out.push(a + (b - a) * frac);
            self.pos += ratio;
        }
        // Rebase into the next buffer's index space. `pos` was left in
        // (len-1, len-1+ratio], so this leaves it in (-1, ratio-1].
        self.pos -= input.len() as f64;
        self.last = last_in;
        out
    }
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

/// Every input device cpal can see right now, with the one it resolves as the
/// system default flagged. Backs the microphone picker in settings.
pub fn list_input_devices() -> Result<Vec<InputDeviceInfo>, String> {
    let host = cpal::default_host();
    let default_name = host
        .default_input_device()
        .and_then(|device| device.name().ok());
    let devices = host
        .input_devices()
        .map_err(|error| format!("input_devices() failed: {error}"))?;

    let mut out = Vec::new();
    for device in devices {
        let Ok(name) = device.name() else { continue };
        let Ok(config) = device.default_input_config() else {
            continue;
        };
        let is_default = default_name.as_deref() == Some(name.as_str());
        out.push(InputDeviceInfo {
            name,
            channels: config.channels(),
            sample_rate: config.sample_rate().0,
            is_default,
        });
    }
    Ok(out)
}

/// The user's chosen input device, or `None` when following the system default.
pub fn get_input_device(app: &AppHandle) -> Option<String> {
    preferred_input_name(app)
}

/// Choose an input device by name, or pass `None` to follow the system default
/// again. Takes effect on the next capture; the running stream is left alone so
/// changing this mid-utterance cannot truncate what the user is saying.
pub fn set_input_device(app: &AppHandle, name: Option<String>) -> Result<(), String> {
    let store = app
        .store(SETTINGS_STORE)
        .map_err(|error| format!("settings store open failed: {error}"))?;
    match name.map(|n| n.trim().to_string()).filter(|n| !n.is_empty()) {
        Some(name) => {
            eprintln!("[audio] input device preference set to {name:?}");
            store.set(INPUT_DEVICE_KEY, name);
        }
        None => {
            eprintln!("[audio] input device preference cleared (following the system default)");
            store.set(INPUT_DEVICE_KEY, serde_json::Value::Null);
        }
    }
    store
        .save()
        .map_err(|error| format!("settings store save failed: {error}"))
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

#[cfg(test)]
mod tests {
    use super::*;

    /// Resample a whole signal in fixed-size callbacks, exactly as the cpal
    /// callback does. Chunking is the point: the previous stateless resampler
    /// passed a single-buffer test and still lost audio on a real stream.
    fn resample_chunked(signal: &[f32], in_rate: u32, out_rate: u32, chunk: usize) -> Vec<f32> {
        let mut resampler = LinearResampler::new(in_rate, out_rate);
        let mut out = Vec::new();
        for block in signal.chunks(chunk) {
            out.extend(resampler.process(block));
        }
        out
    }

    fn tone(freq: f64, rate: u32, samples: usize) -> Vec<f32> {
        (0..samples)
            .map(|i| {
                (2.0 * std::f64::consts::PI * freq * i as f64 / rate as f64).sin() as f32
            })
            .collect()
    }

    /// Goertzel magnitude for `freq` in `signal`. Used to prove a tone survives
    /// resampling at the frequency it went in at, which is the failure the
    /// brief cares about: a wrong ratio pitch-shifts rather than erroring, and
    /// a transcriber turns pitch-shifted speech into confident nonsense.
    fn magnitude_at(signal: &[f32], rate: u32, freq: f64) -> f64 {
        let k = 2.0 * std::f64::consts::PI * freq / rate as f64;
        let coeff = 2.0 * k.cos();
        let (mut s1, mut s2) = (0.0f64, 0.0f64);
        for sample in signal {
            let s0 = *sample as f64 + coeff * s1 - s2;
            s2 = s1;
            s1 = s0;
        }
        (s1 * s1 + s2 * s2 - coeff * s1 * s2).sqrt() / signal.len() as f64
    }

    #[test]
    fn a_matched_rate_passes_every_sample_through_untouched() {
        let signal = tone(440.0, 16_000, 4_000);
        let out = resample_chunked(&signal, 16_000, 16_000, 512);
        assert_eq!(out.len(), signal.len());
        assert_eq!(out, signal);
    }

    #[test]
    fn every_realistic_input_rate_produces_the_right_number_of_samples() {
        // 48000 is what every desktop device reports; 44100 is the classic
        // non-integer ratio; 24000 is what the user's Bluetooth headset
        // actually runs at; 16000 is already the target.
        for in_rate in [48_000u32, 44_100, 24_000, 16_000] {
            let seconds = 2.0;
            let n = (in_rate as f64 * seconds) as usize;
            let signal = tone(440.0, in_rate, n);
            let out = resample_chunked(&signal, in_rate, TARGET_SAMPLE_RATE, 512);
            let expected = n as f64 * TARGET_SAMPLE_RATE as f64 / in_rate as f64;
            let drift = (out.len() as f64 - expected).abs();
            assert!(
                drift <= 1.0,
                "{in_rate} Hz: produced {} samples, expected about {expected:.1}",
                out.len()
            );
        }
    }

    #[test]
    fn the_chunk_size_never_changes_the_output_length() {
        // The stateless version dropped the fractional remainder of every
        // callback, so its output shrank as the callbacks got smaller. This is
        // the regression test for that.
        for in_rate in [48_000u32, 44_100, 24_000] {
            let signal = tone(300.0, in_rate, in_rate as usize);
            let lengths: Vec<usize> = [64usize, 128, 480, 512, 1024]
                .iter()
                .map(|chunk| resample_chunked(&signal, in_rate, TARGET_SAMPLE_RATE, *chunk).len())
                .collect();
            let first = lengths[0];
            assert!(
                lengths.iter().all(|len| len.abs_diff(first) <= 1),
                "{in_rate} Hz: output length varied with chunk size: {lengths:?}"
            );
        }
    }

    #[test]
    fn a_tone_keeps_its_frequency_through_every_rate() {
        // The important assertion in this file. A wrong ratio does not fail
        // loudly; it shifts pitch and speed, and the transcript comes back as
        // fluent nonsense, which reads as success.
        for in_rate in [48_000u32, 44_100, 24_000, 16_000] {
            let freq = 440.0;
            let signal = tone(freq, in_rate, in_rate as usize * 2);
            let out = resample_chunked(&signal, in_rate, TARGET_SAMPLE_RATE, 512);

            let on_pitch = magnitude_at(&out, TARGET_SAMPLE_RATE, freq);
            // A ratio error shows up as energy at a scaled frequency. Check the
            // two neighbours a wrong ratio would land on.
            let flat = magnitude_at(&out, TARGET_SAMPLE_RATE, freq * in_rate as f64 / 16_000.0);
            let sharp = magnitude_at(&out, TARGET_SAMPLE_RATE, freq * 16_000.0 / in_rate as f64);

            assert!(
                on_pitch > 0.3,
                "{in_rate} Hz: the 440 Hz tone did not survive (magnitude {on_pitch:.4})"
            );
            if in_rate != TARGET_SAMPLE_RATE {
                assert!(
                    on_pitch > flat * 10.0 && on_pitch > sharp * 10.0,
                    "{in_rate} Hz: pitch shifted (on {on_pitch:.4}, flat {flat:.4}, sharp {sharp:.4})"
                );
            }
        }
    }

    #[test]
    fn the_seam_between_callbacks_stays_smooth() {
        // A resampler that restarts at position zero every buffer puts a step
        // discontinuity at each boundary. On a slow tone the true sample-to-
        // sample delta is tiny, so any step stands out.
        let in_rate = 24_000u32;
        let signal = tone(100.0, in_rate, in_rate as usize);
        let out = resample_chunked(&signal, in_rate, TARGET_SAMPLE_RATE, 512);
        let expected_step = (2.0 * std::f64::consts::PI * 100.0 / 16_000.0) as f32;
        let worst = out
            .windows(2)
            .map(|w| (w[1] - w[0]).abs())
            .fold(0.0f32, f32::max);
        assert!(
            worst < expected_step * 1.5,
            "found a {worst:.5} step between neighbouring output samples, expected about {expected_step:.5}"
        );
    }

    /// The resampler this unit replaced, kept verbatim so the defect it had is
    /// pinned rather than described. It restarted at position zero on every
    /// call, which is correct for one buffer and wrong for a stream.
    fn stateless_resample_linear(samples: &[f32], in_rate: u32, out_rate: u32) -> Vec<f32> {
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

    #[test]
    fn the_replaced_resampler_really_did_lose_audio_per_callback() {
        // Guards against anyone "simplifying" the stateful resampler back to the
        // stateless one. At 48 kHz a 512-sample callback yields 170 output
        // samples where 170.67 are owed, so a second of audio comes back
        // short, and the shortfall grows as the callbacks get smaller.
        let in_rate = 48_000u32;
        let signal = tone(300.0, in_rate, in_rate as usize);
        let old_512: usize = signal
            .chunks(512)
            .map(|c| stateless_resample_linear(c, in_rate, TARGET_SAMPLE_RATE).len())
            .sum();
        let old_64: usize = signal
            .chunks(64)
            .map(|c| stateless_resample_linear(c, in_rate, TARGET_SAMPLE_RATE).len())
            .sum();
        let new_512 = resample_chunked(&signal, in_rate, TARGET_SAMPLE_RATE, 512).len();

        assert_eq!(new_512, 16_000, "the new resampler should be exact");
        assert!(
            old_512 < 16_000 && old_64 < old_512,
            "expected the old resampler to lose audio and to lose more of it with \
             smaller callbacks (512 -> {old_512}, 64 -> {old_64})"
        );
    }

    #[test]
    fn silence_is_reported_once_and_only_after_the_full_window() {
        let rate = 48_000u32;
        let mut watch = SilenceWatch::new(rate);
        let quiet = vec![0.0f32; 512];
        // 500ms at 48 kHz is 24000 samples, so 46 buffers of 512 is short and
        // the 47th crosses.
        let mut fired_at = None;
        for i in 0..80 {
            if watch.observe(&quiet) {
                fired_at = Some(i);
                break;
            }
        }
        assert_eq!(fired_at, Some(46), "the window fired at the wrong buffer");
        // Never twice.
        for _ in 0..80 {
            assert!(!watch.observe(&quiet));
        }
    }

    #[test]
    fn a_device_that_ever_produces_signal_is_never_reported_silent() {
        let mut watch = SilenceWatch::new(48_000);
        let quiet = vec![0.0f32; 512];
        for _ in 0..10 {
            assert!(!watch.observe(&quiet));
        }
        let mut speech = vec![0.0f32; 512];
        speech[100] = 0.02;
        assert!(!watch.observe(&speech));
        // Long pauses in speech must not trip it later.
        for _ in 0..500 {
            assert!(!watch.observe(&quiet));
        }
    }

    #[test]
    fn a_noise_floor_counts_as_signal_but_exact_zeros_do_not() {
        // The discriminator between a quiet room and a dead loopback device.
        let mut watch = SilenceWatch::new(16_000);
        let floor = vec![1e-4f32; 320];
        assert!(!watch.observe(&floor));
        for _ in 0..200 {
            assert!(!watch.observe(&vec![0.0f32; 320]));
        }

        let mut dead = SilenceWatch::new(16_000);
        let mut fired = false;
        for _ in 0..200 {
            if dead.observe(&vec![0.0f32; 320]) {
                fired = true;
                break;
            }
        }
        assert!(fired, "a device delivering exact zeros was never reported");
    }
}
