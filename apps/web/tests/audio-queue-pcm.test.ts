/**
 * AudioQueue PCM (LAT-01) — byte-order + invariant sanity tests.
 *
 * Phase 10 Plan 10-03 Task 2.
 *
 * Verifies the LAT-01 contract for lib/voice/audio-queue.ts:
 *   1. Int16 LE bytes → Float32 within [-1.0, 1.0] (byte-order sanity).
 *   2. Odd-byte runt retained for next chunk (PCM frame alignment).
 *   3. audio_first_play_at fires once per AudioQueue lifecycle (Phase 9 TEL-01).
 *   4. stopAll() resets the leftoverByte spill (barge-in defense).
 *   5. AudioBuffer constructed at (1 channel, N samples, 24000 Hz).
 *   6. scheduledEnd chains gaplessly across two enqueue calls (Phase 7).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mocks — collectStage is spied so we can assert one-shot semantics.
// ---------------------------------------------------------------------------

const collectStageMock = vi.fn();
vi.mock("@/lib/voice/voice-stage-collector", () => ({
  collectStage: (...args: unknown[]) => collectStageMock(...args),
}));

// ---------------------------------------------------------------------------
// Fake AudioContext — jsdom has no Web Audio. We expose just enough surface
// for AudioQueue.enqueue() + stopAll() to exercise, and capture every call
// site for assertion.
// ---------------------------------------------------------------------------

interface FakeBuffer {
  numberOfChannels: number;
  length: number;
  sampleRate: number;
  duration: number;
  copyToChannel: ReturnType<typeof vi.fn>;
  capturedFloat32: Float32Array | null;
}

interface FakeSourceNode {
  buffer: FakeBuffer | null;
  connect: ReturnType<typeof vi.fn>;
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
  onended: (() => void) | null;
  startAt: number | null;
}

interface FakeCtx {
  currentTime: number;
  destination: object;
  createBuffer: ReturnType<typeof vi.fn>;
  createBufferSource: ReturnType<typeof vi.fn>;
  createAnalyser: ReturnType<typeof vi.fn>;
  // Test handles
  buffers: FakeBuffer[];
  sources: FakeSourceNode[];
}

function makeFakeCtx(): FakeCtx {
  const buffers: FakeBuffer[] = [];
  const sources: FakeSourceNode[] = [];
  const destination = { __destination: true };

  const ctx: FakeCtx = {
    currentTime: 0,
    destination,
    buffers,
    sources,
    createBuffer: vi.fn(
      (channels: number, length: number, sampleRate: number): FakeBuffer => {
        const buf: FakeBuffer = {
          numberOfChannels: channels,
          length,
          sampleRate,
          duration: length / sampleRate,
          capturedFloat32: null,
          copyToChannel: vi.fn(),
        };
        buf.copyToChannel.mockImplementation((data: Float32Array) => {
          // Copy by value so later overwrites by the impl don't mutate the
          // captured reference (Int16Array views share buffer with bytes).
          buf.capturedFloat32 = new Float32Array(data);
        });
        buffers.push(buf);
        return buf;
      },
    ),
    createBufferSource: vi.fn((): FakeSourceNode => {
      const node: FakeSourceNode = {
        buffer: null,
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
        onended: null,
        startAt: null,
      };
      node.start.mockImplementation((t: number) => {
        node.startAt = t;
      });
      sources.push(node);
      return node;
    }),
    createAnalyser: vi.fn(() => ({
      fftSize: 256,
      connect: vi.fn(),
    })),
  };
  return ctx;
}

// Build a known Int16 LE byte buffer from a list of signed 16-bit ints.
function int16LeBytes(samples: number[]): ArrayBuffer {
  const buf = new ArrayBuffer(samples.length * 2);
  const view = new DataView(buf);
  for (let i = 0; i < samples.length; i++) {
    view.setInt16(i * 2, samples[i], /* littleEndian */ true);
  }
  return buf;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("AudioQueue PCM (LAT-01)", () => {
  beforeEach(() => {
    collectStageMock.mockReset();
  });

  it("converts Int16 LE bytes to Float32 within [-1.0, 1.0]", async () => {
    const { AudioQueue } = await import("@/lib/voice/audio-queue");
    const ctx = makeFakeCtx();
    const q = new AudioQueue(ctx as unknown as AudioContext);

    // Known samples: 0, +0.5, -0.5, ~+1.0 (-eps), -1.0
    const bytes = int16LeBytes([0, 16384, -16384, 32767, -32768]);
    await q.enqueue(bytes);

    expect(ctx.buffers).toHaveLength(1);
    const captured = ctx.buffers[0].capturedFloat32;
    expect(captured).not.toBeNull();
    expect(captured!.length).toBe(5);

    expect(captured![0]).toBeCloseTo(0.0, 4);
    expect(captured![1]).toBeCloseTo(0.5, 4);
    expect(captured![2]).toBeCloseTo(-0.5, 4);
    // 32767 / 32768 ≈ 0.999969482421875 — exact under the literal-32768.0
    // divisor. Assert exact equality so the test pins the conversion idiom.
    expect(captured![3]).toBe(32767 / 32768.0);
    expect(captured![4]).toBeCloseTo(-1.0, 4);
    // Equivalently, -32768 / 32768 must be exactly -1.0.
    expect(captured![4]).toBe(-1.0);
  });

  it("retains odd-byte runt for next chunk", async () => {
    const { AudioQueue } = await import("@/lib/voice/audio-queue");
    const ctx = makeFakeCtx();
    const q = new AudioQueue(ctx as unknown as AudioContext);

    // 5 bytes = 2 full samples + 1 leftover byte.
    // Use distinct byte values so we can identify the spill in the next chunk.
    const chunk1 = new Uint8Array([0x10, 0x20, 0x30, 0x40, 0xab]).buffer;
    await q.enqueue(chunk1);

    // First enqueue: should have processed exactly 2 samples (4 bytes),
    // retaining the 5th byte (0xab).
    expect(ctx.buffers).toHaveLength(1);
    expect(ctx.buffers[0].length).toBe(2);

    // Second chunk: 3 bytes. With the 0xab spill prepended, we have 4 bytes
    // total = 2 full samples, 0 leftover.
    const chunk2 = new Uint8Array([0xcd, 0x50, 0x60]).buffer;
    await q.enqueue(chunk2);

    expect(ctx.buffers).toHaveLength(2);
    expect(ctx.buffers[1].length).toBe(2);

    // Sample 0 of chunk2's buffer must be Int16LE(0xab, 0xcd) = -13141 / 32768
    // = ~-0.4010 — the spilled 0xab landed in the low byte, 0xcd in the high.
    const captured2 = ctx.buffers[1].capturedFloat32!;
    const expectedSample0 = new DataView(
      new Uint8Array([0xab, 0xcd]).buffer,
    ).getInt16(0, true) / 32768.0;
    expect(captured2[0]).toBeCloseTo(expectedSample0, 4);
  });

  it("fires audio_first_play_at on first enqueue, NOT on second", async () => {
    const { AudioQueue } = await import("@/lib/voice/audio-queue");
    const ctx = makeFakeCtx();
    const q = new AudioQueue(ctx as unknown as AudioContext);

    const bytes1 = int16LeBytes([0, 1000, -1000, 2000]);
    const bytes2 = int16LeBytes([500, -500, 1500, -1500]);

    await q.enqueue(bytes1);
    await q.enqueue(bytes2);

    // Exactly one collectStage call, with stage='audio_first_play_at'.
    const audioFirstPlayCalls = collectStageMock.mock.calls.filter(
      (args) => args[0] === "audio_first_play_at",
    );
    expect(audioFirstPlayCalls).toHaveLength(1);
    expect(audioFirstPlayCalls[0][1]).toBeInstanceOf(Date);
  });

  it("stopAll resets leftoverByte", async () => {
    const { AudioQueue } = await import("@/lib/voice/audio-queue");
    const ctx = makeFakeCtx();
    const q = new AudioQueue(ctx as unknown as AudioContext);

    // Odd-length chunk → leaves a runt.
    const oddChunk = new Uint8Array([0x10, 0x20, 0x30]).buffer; // 3 bytes
    await q.enqueue(oddChunk);
    // 3 bytes → 1 sample processed, 1 leftover byte.
    expect(ctx.buffers).toHaveLength(1);
    expect(ctx.buffers[0].length).toBe(1);

    // Barge-in: stopAll should clear the runt.
    q.stopAll();

    // Next enqueue: even-length 2 bytes (1 sample). If the runt had NOT been
    // cleared, we'd see (1 leftover + 2 new) = 3 bytes → 1 sample + spill,
    // which would still be 1 sample but with a wrong byte ordering. To make
    // this assertion sharp we use 4 bytes (2 full samples) for chunk 2; if
    // the runt survived stopAll, we'd see 5 bytes = 2 samples + 1 leftover,
    // and the FIRST sample of buffer 2 would have the stale 0x30 as low byte.
    const cleanChunk = int16LeBytes([0x1234, 0x5678]);
    await q.enqueue(cleanChunk);
    expect(ctx.buffers).toHaveLength(2);
    expect(ctx.buffers[1].length).toBe(2);

    const captured = ctx.buffers[1].capturedFloat32!;
    // Sample 0 must equal 0x1234 / 32768, NOT some Int16(0x30, 0x34).
    expect(captured[0]).toBeCloseTo(0x1234 / 32768.0, 4);
    expect(captured[1]).toBeCloseTo(0x5678 / 32768.0, 4);
  });

  it("AudioBuffer constructed at (1 channel, N samples, 24000 Hz)", async () => {
    const { AudioQueue } = await import("@/lib/voice/audio-queue");
    const ctx = makeFakeCtx();
    const q = new AudioQueue(ctx as unknown as AudioContext);

    const bytes = int16LeBytes([10, 20, 30, 40, 50, 60]); // 6 samples = 12 bytes
    await q.enqueue(bytes);

    expect(ctx.createBuffer).toHaveBeenCalledTimes(1);
    expect(ctx.createBuffer).toHaveBeenCalledWith(1, 6, 24000);
  });

  it("scheduledEnd chains gaplessly across two enqueue calls", async () => {
    const { AudioQueue } = await import("@/lib/voice/audio-queue");
    const ctx = makeFakeCtx();
    // Pin currentTime BELOW any reachable scheduledEnd so the second
    // start() must clamp to scheduledEnd, not currentTime.
    ctx.currentTime = 0;
    const q = new AudioQueue(ctx as unknown as AudioContext);

    // Buffer 1: 240 samples @ 24000 Hz = 0.01s duration.
    // Use a Uint16Array of 240 zero samples for simplicity.
    const chunk1 = new ArrayBuffer(240 * 2);
    await q.enqueue(chunk1);

    const node1 = ctx.sources[0];
    expect(node1.startAt).toBe(0); // scheduledEnd was 0; currentTime 0 → starts at 0
    const expectedScheduledEndAfterFirst = 240 / 24000; // 0.01s

    // Buffer 2: another 240 samples. currentTime still 0 (test-controlled).
    // Must start at scheduledEnd (0.01), NOT currentTime (0).
    const chunk2 = new ArrayBuffer(240 * 2);
    await q.enqueue(chunk2);

    const node2 = ctx.sources[1];
    expect(node2.startAt).toBeCloseTo(expectedScheduledEndAfterFirst, 6);
  });
});
