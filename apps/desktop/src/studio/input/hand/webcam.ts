/**
 * Webcam helper — wraps `getUserMedia` + a hidden `<video>` element lifecycle.
 *
 * DOM-only; not imported at server module scope by anything that SSRs (the
 * driver calls it lazily inside `start()`). The returned {@link WebcamHandle}
 * owns teardown so the driver can stop tracks deterministically even if `stop()`
 * races an in-flight `start()`.
 */

export type WebcamHandle = {
  /** A playing, muted, off-DOM video element carrying the camera stream. */
  video: HTMLVideoElement;
  /** Stops every media track and detaches the stream. Idempotent. */
  stop(): void;
};

export type AcquireWebcamOptions = {
  width?: number;
  height?: number;
};

/**
 * Requests the user-facing camera and returns a playing video element.
 *
 * Throws whatever `getUserMedia` throws (e.g. `NotAllowedError`,
 * `NotFoundError`); the driver maps those to its status union.
 */
export async function acquireWebcam(
  options: AcquireWebcamOptions = {},
): Promise<WebcamHandle> {
  const width = options.width ?? 640;
  const height = options.height ?? 480;

  const stream = await navigator.mediaDevices.getUserMedia({
    video: { width, height, facingMode: "user" },
    audio: false,
  });

  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.autoplay = true;
  video.srcObject = stream;

  try {
    await video.play();
  } catch {
    // Autoplay can reject in some browsers; frames still flow once decoding
    // starts, and the driver skips frames whose currentTime hasn't advanced.
  }

  let stopped = false;
  return {
    video,
    stop() {
      if (stopped) return;
      stopped = true;
      for (const track of stream.getTracks()) track.stop();
      video.srcObject = null;
    },
  };
}
