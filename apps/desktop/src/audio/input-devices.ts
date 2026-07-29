/**
 * input-devices.ts — choosing which microphone the app records from.
 *
 * This exists because of a real failure. On the user's Mac Studio the macOS
 * default input device was `QuickTime Input` (and, at another moment,
 * `BlackHole 16ch`), both silent virtual loopback devices that produce exact
 * zeros forever unless another application deliberately routes audio into them.
 * Every capture came back at `rms=0.0000` and nothing anywhere said which
 * device had been opened.
 *
 * The Rust side (`src-tauri/src/audio.rs`) still follows the system default by
 * default, which is the right behaviour. This is the escape hatch for when the
 * system default is wrong, and the honest reporting for when it turns out to be
 * dead.
 *
 * Nothing here opens the microphone. Setting a device takes effect on the next
 * capture, never on one already running.
 */

import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

/** One selectable microphone, as `list_input_devices` reports it. */
export interface InputDevice {
  name: string;
  channels: number;
  /** The device's own rate. 24000 for Bluetooth headsets, 48000 for most else. */
  sampleRate: number;
  /** True for whichever device macOS currently calls the default input. */
  isDefault: boolean;
}

/** Payload of the `audio-device` event, emitted every time a stream opens. */
export interface OpenedDevice {
  name: string;
  sampleRate: number;
  channels: number;
  /** False when the device came from the system default rather than a choice. */
  explicit: boolean;
}

/** Payload of `audio-input-silent`: the open device is producing nothing. */
export interface SilentDevice {
  name: string;
  channels: number;
  sampleRate: number;
}

interface RawInputDevice {
  name: string;
  channels: number;
  sample_rate: number;
  is_default: boolean;
}

interface RawOpenedDevice {
  name: string;
  sample_rate: number;
  channels: number;
  explicit: boolean;
}

interface RawSilentDevice {
  name: string;
  channels: number;
  sample_rate: number;
}

/** Every microphone cpal can currently see. Empty when there is no Tauri host. */
export async function listInputDevices(): Promise<InputDevice[]> {
  try {
    const raw = await invoke<RawInputDevice[]>("list_input_devices");
    return raw.map((device) => ({
      name: device.name,
      channels: device.channels,
      sampleRate: device.sample_rate,
      isDefault: device.is_default,
    }));
  } catch (error) {
    console.warn("[audio] could not list input devices", error);
    return [];
  }
}

/** The explicitly chosen device, or null while following the system default. */
export async function getInputDevice(): Promise<string | null> {
  try {
    return (await invoke<string | null>("get_input_device")) ?? null;
  } catch (error) {
    console.warn("[audio] could not read the input device preference", error);
    return null;
  }
}

/** Choose a device by name, or pass null to follow the system default again. */
export async function setInputDevice(name: string | null): Promise<void> {
  await invoke("set_input_device", { name });
}

/** Subscribe to which device each capture actually opened. */
export async function onDeviceOpened(
  handler: (device: OpenedDevice) => void,
): Promise<UnlistenFn> {
  return listen<RawOpenedDevice>("audio-device", (event) => {
    handler({
      name: event.payload.name,
      sampleRate: event.payload.sample_rate,
      channels: event.payload.channels,
      explicit: event.payload.explicit,
    });
  });
}

/**
 * Subscribe to "the open device is delivering pure digital silence".
 *
 * Fires at most once per capture, half a second in. It is a statement about the
 * DEVICE, not about the user: a quiet room still carries a noise floor orders
 * of magnitude above the threshold Rust uses, so this only trips on a device
 * that is genuinely producing nothing.
 */
export async function onInputSilent(
  handler: (device: SilentDevice) => void,
): Promise<UnlistenFn> {
  return listen<RawSilentDevice>("audio-input-silent", (event) => {
    handler({
      name: event.payload.name,
      channels: event.payload.channels,
      sampleRate: event.payload.sample_rate,
    });
  });
}

/**
 * One short, honest line for a device that produced nothing.
 *
 * Deliberately names the device. "Didn't catch that" sends the user looking for
 * a problem with their voice; naming `BlackHole 16ch` sends them to the one
 * setting that actually fixes it.
 */
export function silentDeviceCopy(device: SilentDevice): string {
  return `No audio from ${device.name}`;
}
