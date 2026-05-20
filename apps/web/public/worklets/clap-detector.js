// public/worklets/clap-detector.js
// AudioWorklet processor for two-clap activation (VOICE-03).
// Inter-clap window: 250-650ms. Posts { type: 'double-clap' } on detection.
// Served as static asset; loaded via audioContext.audioWorklet.addModule('/worklets/clap-detector.js').

class ClapDetectorProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._lastTransientAt = null;
    this._ENERGY_THRESHOLD = 0.15;
    this._MIN_INTER_CLAP_MS = 250;
    this._MAX_INTER_CLAP_MS = 650;
    this._MAX_DURATION_FRAMES = Math.floor(sampleRate * 0.08); // 80ms max clap
    this._frameCount = 0;
  }

  process(inputs) {
    const input = inputs[0]?.[0];
    if (!input) return true;
    const rms = Math.sqrt(input.reduce((s, v) => s + v * v, 0) / input.length);
    const now = currentTime * 1000;
    if (rms > this._ENERGY_THRESHOLD) {
      if (this._lastTransientAt !== null) {
        const gap = now - this._lastTransientAt;
        if (gap >= this._MIN_INTER_CLAP_MS && gap <= this._MAX_INTER_CLAP_MS) {
          this.port.postMessage({ type: 'double-clap' });
          this._lastTransientAt = null;
          return true;
        }
      }
      this._lastTransientAt = now;
    }
    return true;
  }
}

registerProcessor('clap-detector-processor', ClapDetectorProcessor);
