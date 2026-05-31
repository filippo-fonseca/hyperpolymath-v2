// Phase 12 Plan 12-01 — AudioWorklet that taps mic into 80ms 16kHz frames.
// Matches placement convention of /worklets/clap-detector.js.
//
// Naive linear downsample (acceptable per 12-RESEARCH §"Don't hand-roll" —
// wake-word is robust to high-frequency artifacts; quality matters less
// than latency). For a 48 kHz mic input, ratio = 48000/16000 = 3, so we
// keep every 3rd sample.
//
// Emits 80ms frames: 1280 samples @ 16 kHz, posted to the main thread as
// transferable Float32Array. The downstream Web Worker runs the 3-stage
// ONNX pipeline; this worklet only does the mic tap + downsample.
class WakeWordTap extends AudioWorkletProcessor {
  constructor() {
    super();
    // sampleRate is a global injected by the AudioWorklet runtime.
    this.ratio = sampleRate / 16000;
    this.frameBuf = new Float32Array(1280);
    this.frameIdx = 0;
    this.subSampleCounter = 0;
  }

  process(inputs) {
    const input = inputs[0]?.[0];
    if (!input) return true;
    for (let i = 0; i < input.length; i++) {
      // Decimation: accumulate sample-by-sample, emit at every ratio-th step.
      this.subSampleCounter += 1;
      if (this.subSampleCounter < this.ratio) continue;
      this.subSampleCounter -= this.ratio;
      this.frameBuf[this.frameIdx++] = input[i];
      if (this.frameIdx === 1280) {
        const out = this.frameBuf.slice();
        this.port.postMessage({ type: "frame", pcm: out }, [out.buffer]);
        this.frameIdx = 0;
      }
    }
    return true;
  }
}

registerProcessor("wake-word-tap", WakeWordTap);
