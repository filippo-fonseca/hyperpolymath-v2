use std::sync::mpsc;
use std::thread;

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use tauri::{AppHandle, Emitter};

/// Start audio capture on a dedicated thread.
/// The cpal::Stream stays on the creating thread (CoreAudio requirement);
/// PCM chunks are emitted to the webview via Tauri's `audio-chunk` event.
pub fn start(app: AppHandle) -> Result<(), String> {
    let (ready_tx, ready_rx) = mpsc::channel::<Result<(), String>>();

    thread::spawn(move || {
        let host = cpal::default_host();
        let device = match host.default_input_device() {
            Some(d) => d,
            None => {
                let _ = ready_tx.send(Err("no input device".into()));
                return;
            }
        };
        let config = match device.default_input_config() {
            Ok(c) => c,
            Err(e) => {
                let _ = ready_tx.send(Err(e.to_string()));
                return;
            }
        };

        let stream_result = device.build_input_stream(
            &config.into(),
            move |data: &[f32], _: &cpal::InputCallbackInfo| {
                let chunk: Vec<f32> = data.to_vec();
                let _ = app.emit("audio-chunk", chunk);
            },
            |err| eprintln!("[audio] stream error: {err}"),
            None,
        );

        let stream = match stream_result {
            Ok(s) => s,
            Err(e) => {
                let _ = ready_tx.send(Err(e.to_string()));
                return;
            }
        };

        if let Err(e) = stream.play() {
            let _ = ready_tx.send(Err(e.to_string()));
            return;
        }

        let _ = ready_tx.send(Ok(()));

        // Park the thread forever — the stream must outlive this scope.
        // Subsequent plans will replace this with a command-channel loop.
        thread::park();
    });

    ready_rx
        .recv()
        .map_err(|e| format!("audio thread did not signal ready: {e}"))?
}
