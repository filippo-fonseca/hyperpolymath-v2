// apps/desktop/src/flowpill/audio/preroll.ts
// Fixed-capacity rolling buffer of the most recent PCM samples.
//
// Why this exists: on a push-to-talk gesture the user starts speaking as they
// press, and the key-down to mic-open path costs real milliseconds (gesture
// disambiguation, the Tauri round trip, CoreAudio opening the device). Whatever
// lands in this ring before the caller says "start" is prepended to the
// utterance, so the first syllable survives.

export class PrerollBuffer {
  private readonly capacity: number;
  private readonly ring: Float32Array;
  /** Next write index. */
  private head = 0;
  /** How many valid samples the ring holds, capped at capacity. */
  private size = 0;

  constructor(capacity: number) {
    this.capacity = Math.max(0, Math.floor(capacity));
    this.ring = new Float32Array(this.capacity);
  }

  push(chunk: Float32Array): void {
    if (this.capacity === 0 || chunk.length === 0) return;
    // A chunk longer than the ring can only contribute its own tail.
    const start = chunk.length > this.capacity ? chunk.length - this.capacity : 0;
    for (let i = start; i < chunk.length; i++) {
      this.ring[this.head] = chunk[i] ?? 0;
      this.head = (this.head + 1) % this.capacity;
      if (this.size < this.capacity) this.size += 1;
    }
  }

  /** Sample count currently held. */
  get length(): number {
    return this.size;
  }

  /** Copy the held samples out in chronological order. Does not clear. */
  read(): Float32Array {
    const out = new Float32Array(this.size);
    const start = (this.head - this.size + this.capacity) % (this.capacity || 1);
    for (let i = 0; i < this.size; i++) {
      out[i] = this.ring[(start + i) % this.capacity] ?? 0;
    }
    return out;
  }

  /** Copy the held samples out and empty the ring. */
  drain(): Float32Array {
    const out = this.read();
    this.clear();
    return out;
  }

  clear(): void {
    this.head = 0;
    this.size = 0;
  }
}
