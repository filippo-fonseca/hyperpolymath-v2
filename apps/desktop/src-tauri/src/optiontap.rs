//! Global Option-key gesture tap for the flowpill voice overlay.
//!
//! Detects three gestures on the *bare* Option key, anywhere in macOS, and
//! emits them to the webview as Tauri events. That is the whole job: this
//! module never records audio, never speaks, and never touches the JARVIS HUD.
//!
//! ## Why a CGEventTap
//!
//! `tauri-plugin-global-shortcut` (and Carbon hotkeys underneath it) cannot
//! express this. A bare modifier with no accompanying key is not a registrable
//! shortcut, and the plugin surfaces neither separate down/up transitions nor
//! double-press timing. A CGEventTap on `kCGEventFlagsChanged` does, which is
//! what Wispr Flow itself uses. We roll it directly on the `core-graphics`
//! crate rather than pulling in `tauri-plugin-macos-input-monitor`: the crate
//! is already in this app's dependency tree, the tap we need is a single
//! listen-only mask, and the gesture timing has to live in our own state
//! machine either way.
//!
//! ## The tap is LISTEN-ONLY, permanently
//!
//! It is created with `kCGEventTapOptionListenOnly`. An active tap that failed
//! to pass an event through would swallow the Option key system-wide and break
//! every Option shortcut on the machine, unrecoverably until the app quits.
//! Listen-only makes that structurally impossible. Do not "optimise" it away.
//!
//! ## What the tap reads
//!
//! Only two things: the modifier bitmask on `FlagsChanged`, and the bare fact
//! that a `KeyDown` happened (used to void a gesture when the user is holding
//! Option to type, e.g. Option+E for an accent). Key codes and characters are
//! never read, logged, or forwarded.
//!
//! ## Timing lives in a pure state machine
//!
//! `GestureMachine` below is side-effect free: `(state, input, timestamp) ->
//! (state, emissions)`. It is unit tested with synthetic timestamps at the
//! bottom of this file. No timing logic lives inside the C callback, where it
//! could not be tested.

use std::sync::atomic::AtomicBool;

/// How long Option must be held before the press is committed as a long press.
/// Long enough that a quick tap (typically well under 200ms) never trips it.
pub const LONG_PRESS_MS: u64 = 300;

/// How long after a short press's release a second press still counts as a
/// double tap. Inside the 300-500ms band the brief calls for.
pub const DOUBLE_TAP_WINDOW_MS: u64 = 400;

/// Upper bound on how long the timer thread parks with no pending deadline.
/// Purely belt-and-braces against a missed wakeup; the condvar is notified on
/// every transition, so in practice this never fires during a gesture.
const IDLE_PARK_MS: u64 = 1_000;

// ---------------------------------------------------------------------------
// Pure gesture state machine
// ---------------------------------------------------------------------------

/// Everything that can drive the machine. `Tick` is the timer thread asking
/// whether a deadline has passed; it carries no information of its own.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Input {
    /// Option went down (and no other modifier was already held).
    Down,
    /// Option went up.
    Up,
    /// The in-flight gesture is void: another modifier joined, or the user
    /// pressed a normal key while holding Option. Ignored once a gesture has
    /// already committed.
    Cancel,
    /// Time passed. Fired by the timer thread when a deadline is due.
    Tick,
}

/// What the machine wants the consumer to hear about.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Emission {
    Down,
    Up,
    LongPressStart,
    LongPressEnd,
    DoubleTap,
}

impl Emission {
    /// The Tauri event name. Unit u4 codes against these exact strings.
    pub const fn event_name(self) -> &'static str {
        match self {
            Emission::Down => "optiontap://down",
            Emission::Up => "optiontap://up",
            Emission::LongPressStart => "optiontap://long-press-start",
            Emission::LongPressEnd => "optiontap://long-press-end",
            Emission::DoubleTap => "optiontap://double-tap",
        }
    }

    /// The `kind` discriminator carried inside every payload, so a consumer
    /// that subscribes to several names can switch on one field.
    pub const fn kind(self) -> &'static str {
        match self {
            Emission::Down => "down",
            Emission::Up => "up",
            Emission::LongPressStart => "long_press_start",
            Emission::LongPressEnd => "long_press_end",
            Emission::DoubleTap => "double_tap",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Phase {
    /// Option is up and nothing is pending.
    Idle,
    /// Option is down, the long-press threshold has not been crossed, and this
    /// press could still turn out to be the first half of a double tap.
    Pressed { since: u64 },
    /// Option is down and held past the threshold. `long-press-start` has been
    /// emitted, so this press is committed as a long press and can never be
    /// reinterpreted.
    LongPress,
    /// Option is down but the gesture has been voided. Waiting for the release
    /// so the raw down/up pair stays balanced.
    Cancelled,
    /// Option is up after a short press. A press before `expires` is a double
    /// tap.
    AwaitingSecondPress { expires: u64 },
    /// Option is down as the second half of a double tap. `double-tap` has
    /// already been emitted and the long press must never fire for this press.
    DoubleTapHeld,
}

/// The gesture recogniser. Deliberately free of clocks, threads, and I/O:
/// every timestamp arrives as an argument.
#[derive(Debug, Clone)]
pub struct GestureMachine {
    phase: Phase,
    long_press_ms: u64,
    double_tap_window_ms: u64,
}

impl Default for GestureMachine {
    fn default() -> Self {
        Self::new()
    }
}

impl GestureMachine {
    pub const fn new() -> Self {
        Self {
            phase: Phase::Idle,
            long_press_ms: LONG_PRESS_MS,
            double_tap_window_ms: DOUBLE_TAP_WINDOW_MS,
        }
    }

    /// Same machine with explicit timings. Used by the tests to keep synthetic
    /// timestamps readable.
    #[cfg(test)]
    const fn with_timings(long_press_ms: u64, double_tap_window_ms: u64) -> Self {
        Self {
            phase: Phase::Idle,
            long_press_ms,
            double_tap_window_ms,
        }
    }

    /// Advance the machine. `now` is a monotonic millisecond timestamp.
    pub fn step(&mut self, input: Input, now: u64) -> Vec<Emission> {
        match (self.phase, input) {
            // --- from Idle -------------------------------------------------
            (Phase::Idle, Input::Down) => {
                self.phase = Phase::Pressed { since: now };
                vec![Emission::Down]
            }

            // --- while pressed, gesture still undecided ---------------------
            (Phase::Pressed { since }, Input::Tick) => {
                if now.saturating_sub(since) >= self.long_press_ms {
                    self.phase = Phase::LongPress;
                    vec![Emission::LongPressStart]
                } else {
                    vec![]
                }
            }
            (Phase::Pressed { since }, Input::Up) => {
                // A release can outrun the timer thread. If the hold already
                // qualified, commit the long press here rather than silently
                // downgrading it to a tap, so the machine's behaviour does not
                // depend on tick granularity.
                if now.saturating_sub(since) >= self.long_press_ms {
                    self.phase = Phase::Idle;
                    vec![
                        Emission::LongPressStart,
                        Emission::Up,
                        Emission::LongPressEnd,
                    ]
                } else {
                    self.phase = Phase::AwaitingSecondPress {
                        expires: now.saturating_add(self.double_tap_window_ms),
                    };
                    vec![Emission::Up]
                }
            }
            (Phase::Pressed { .. }, Input::Cancel) => {
                self.phase = Phase::Cancelled;
                vec![]
            }

            // --- long press committed --------------------------------------
            (Phase::LongPress, Input::Up) => {
                self.phase = Phase::Idle;
                vec![Emission::Up, Emission::LongPressEnd]
            }

            // --- gesture voided, key still down ----------------------------
            (Phase::Cancelled, Input::Up) => {
                self.phase = Phase::Idle;
                vec![Emission::Up]
            }

            // --- short press released, second press still possible ----------
            (Phase::AwaitingSecondPress { expires }, Input::Down) => {
                if now < expires {
                    self.phase = Phase::DoubleTapHeld;
                    vec![Emission::Down, Emission::DoubleTap]
                } else {
                    // The window lapsed without a tick reaching us. Treat this
                    // as a fresh first press.
                    self.phase = Phase::Pressed { since: now };
                    vec![Emission::Down]
                }
            }
            (Phase::AwaitingSecondPress { expires }, Input::Tick) => {
                if now >= expires {
                    self.phase = Phase::Idle;
                }
                vec![]
            }
            (Phase::AwaitingSecondPress { .. }, Input::Cancel) => {
                self.phase = Phase::Idle;
                vec![]
            }

            // --- double tap committed, key still down ----------------------
            (Phase::DoubleTapHeld, Input::Up) => {
                self.phase = Phase::Idle;
                vec![Emission::Up]
            }

            // Everything else is a no-op: a repeat Down while already down, an
            // Up with no matching Down (the tap can install mid-hold), a Cancel
            // against an already-committed gesture, or a Tick with no deadline.
            _ => vec![],
        }
    }

    /// Milliseconds until the machine next needs a `Tick`, or `None` when no
    /// deadline is pending. The timer thread parks on this.
    pub fn next_deadline_in(&self, now: u64) -> Option<u64> {
        match self.phase {
            Phase::Pressed { since } => Some(since.saturating_add(self.long_press_ms).saturating_sub(now)),
            Phase::AwaitingSecondPress { expires } => Some(expires.saturating_sub(now)),
            _ => None,
        }
    }
}

// ---------------------------------------------------------------------------
// Event payload
// ---------------------------------------------------------------------------

/// Payload attached to every `optiontap://*` event.
///
/// `atMs` is milliseconds on a process-monotonic clock (not wall time), so the
/// consumer can order emissions and measure gaps without worrying about clock
/// adjustments.
#[derive(Debug, Clone, serde::Serialize)]
pub struct GesturePayload {
    pub kind: &'static str,
    #[serde(rename = "atMs")]
    pub at_ms: u64,
}

/// Payload for `optiontap://unavailable`, emitted when the tap cannot run.
#[derive(Debug, Clone, serde::Serialize)]
pub struct UnavailablePayload {
    /// `permission_denied` | `tap_create_failed` | `unsupported_platform`
    pub reason: &'static str,
}

/// Snapshot of the tap's health, for honest UI guidance.
#[derive(Debug, Clone, serde::Serialize)]
pub struct OptionTapStatus {
    /// False on any platform without a CGEventTap.
    pub supported: bool,
    /// `granted` | `denied`
    pub permission: &'static str,
    /// True once the tap thread is installed and listening.
    pub listening: bool,
}

/// Set once the tap thread is up. Also the idempotency guard for `start`.
#[allow(dead_code)]
static LISTENING: AtomicBool = AtomicBool::new(false);

// ---------------------------------------------------------------------------
// macOS implementation
// ---------------------------------------------------------------------------

#[cfg(target_os = "macos")]
mod imp {
    use std::ffi::c_void;
    use std::sync::atomic::{AtomicBool, AtomicPtr, Ordering};
    use std::sync::mpsc::{self, Sender};
    use std::sync::{Arc, Condvar, Mutex};
    use std::time::{Duration, Instant};

    use core_foundation::base::TCFType;
    use core_foundation::mach_port::CFMachPortRef;
    use core_foundation::runloop::{kCFRunLoopCommonModes, CFRunLoop};
    use core_graphics::event::{
        CGEventFlags, CGEventTap, CGEventTapLocation, CGEventTapOptions, CGEventTapPlacement,
        CGEventType, CallbackResult,
    };
    use tauri::{AppHandle, Emitter};

    use super::{
        Emission, GestureMachine, GesturePayload, Input, UnavailablePayload, IDLE_PARK_MS,
        LISTENING,
    };

    #[link(name = "CoreGraphics", kind = "framework")]
    extern "C" {
        /// Input Monitoring (TCC) status for this process. Does not prompt.
        fn CGPreflightListenEventAccess() -> bool;
        /// Prompts for Input Monitoring once per process, then returns the
        /// status. Subsequent calls just open System Settings.
        fn CGRequestListenEventAccess() -> bool;
        /// Re-arm a tap the system disabled. `core-graphics` only exposes this
        /// through `CGEventTap::enable`, which we cannot reach from inside the
        /// callback, so we bind it ourselves.
        fn CGEventTapEnable(tap: CFMachPortRef, enable: bool);
    }

    /// Modifiers that, when held alongside Option, mean the user is driving a
    /// normal shortcut rather than reaching for the overlay. Caps Lock, the
    /// numeric-pad bit, and the non-coalesced bit are deliberately excluded:
    /// none of them signal intent.
    fn contaminating(flags: CGEventFlags) -> bool {
        flags.intersects(
            CGEventFlags::CGEventFlagShift
                | CGEventFlags::CGEventFlagControl
                | CGEventFlags::CGEventFlagCommand
                | CGEventFlags::CGEventFlagSecondaryFn,
        )
    }

    /// Process-monotonic milliseconds. Never wall time: the payload timestamps
    /// are for ordering and gap measurement only.
    fn monotonic_ms() -> u64 {
        use std::sync::OnceLock;
        static BASE: OnceLock<Instant> = OnceLock::new();
        BASE.get_or_init(Instant::now).elapsed().as_millis() as u64
    }

    struct Shared {
        machine: Mutex<GestureMachine>,
        wake: Condvar,
    }

    impl Shared {
        fn lock(&self) -> std::sync::MutexGuard<'_, GestureMachine> {
            // A poisoned machine is still a perfectly usable enum. Recovering
            // beats taking the app down over it.
            self.machine.lock().unwrap_or_else(|e| e.into_inner())
        }
    }

    /// Push one input through the machine and queue whatever it emits.
    fn feed(shared: &Shared, tx: &Sender<(Emission, u64)>, input: Input) {
        let now = monotonic_ms();
        let emissions = shared.lock().step(input, now);
        for emission in emissions {
            let _ = tx.send((emission, now));
        }
        shared.wake.notify_all();
    }

    pub fn permission_granted() -> bool {
        unsafe { CGPreflightListenEventAccess() }
    }

    /// Ask for Input Monitoring. macOS itself shows the prompt at most once per
    /// process; after that this only reveals the System Settings pane, so it
    /// must stay bound to an explicit user action rather than app startup.
    pub fn request_permission() -> bool {
        unsafe { CGRequestListenEventAccess() }
    }

    pub fn listening() -> bool {
        LISTENING.load(Ordering::Acquire)
    }

    /// Install the tap if it is not already running and the permission is
    /// present. Returns whether the tap is listening afterwards.
    ///
    /// Never prompts. Never panics. With the permission absent this is a
    /// cheap no-op that leaves the rest of the app untouched, which is the
    /// required degradation: the overlay is simply unavailable.
    pub fn ensure_started(app: &AppHandle) -> bool {
        if LISTENING.load(Ordering::Acquire) {
            return true;
        }
        if !permission_granted() {
            let _ = app.emit(
                "optiontap://unavailable",
                UnavailablePayload {
                    reason: "permission_denied",
                },
            );
            return false;
        }
        if LISTENING.swap(true, Ordering::AcqRel) {
            // Lost the race; another caller already spawned the threads.
            return true;
        }

        let shared = Arc::new(Shared {
            machine: Mutex::new(GestureMachine::new()),
            wake: Condvar::new(),
        });
        let (tx, rx) = mpsc::channel::<(Emission, u64)>();

        spawn_emitter(app.clone(), rx);
        spawn_timer(Arc::clone(&shared), tx.clone());
        spawn_tap(app.clone(), shared, tx);

        true
    }

    /// Drains queued emissions onto the webview. Kept off the tap thread so the
    /// HID callback stays as short as possible; a slow tap callback is what
    /// gets a tap disabled by timeout.
    fn spawn_emitter(app: AppHandle, rx: mpsc::Receiver<(Emission, u64)>) {
        std::thread::Builder::new()
            .name("optiontap-emit".into())
            .spawn(move || {
                for (emission, at_ms) in rx {
                    let _ = app.emit(
                        emission.event_name(),
                        GesturePayload {
                            kind: emission.kind(),
                            at_ms,
                        },
                    );
                }
            })
            .ok();
    }

    /// Drives the machine's deadlines (the long-press threshold and the
    /// double-tap window). Parks on a condvar rather than polling, and
    /// recomputes the deadline under the lock immediately before waiting so a
    /// transition that lands mid-iteration cannot be missed.
    fn spawn_timer(shared: Arc<Shared>, tx: Sender<(Emission, u64)>) {
        std::thread::Builder::new()
            .name("optiontap-timer".into())
            .spawn(move || loop {
                let now = monotonic_ms();
                let emissions = shared.lock().step(Input::Tick, now);
                for emission in emissions {
                    if tx.send((emission, now)).is_err() {
                        return; // emitter gone; app is shutting down
                    }
                }

                let guard = shared.lock();
                let wait = guard
                    .next_deadline_in(monotonic_ms())
                    .unwrap_or(IDLE_PARK_MS)
                    .max(1);
                let _ = shared.wake.wait_timeout(guard, Duration::from_millis(wait));
            })
            .ok();
    }

    /// Owns the CGEventTap and its run loop. Runs for the app's lifetime.
    fn spawn_tap(app: AppHandle, shared: Arc<Shared>, tx: Sender<(Emission, u64)>) {
        std::thread::Builder::new()
            .name("optiontap-tap".into())
            .spawn(move || {
                // Filled in after the tap exists so the callback can re-arm a
                // tap the system disables. AtomicPtr because the callback is
                // `Fn`, not `FnMut`.
                let port: Arc<AtomicPtr<c_void>> = Arc::new(AtomicPtr::new(std::ptr::null_mut()));
                // Last seen Option state, for deriving down/up from the
                // absolute flag bitmask that FlagsChanged carries.
                let alt_down = Arc::new(AtomicBool::new(false));

                let cb_port = Arc::clone(&port);
                let cb_alt = Arc::clone(&alt_down);
                let cb_shared = Arc::clone(&shared);
                let cb_tx = tx.clone();

                let tap = CGEventTap::new(
                    CGEventTapLocation::HID,
                    CGEventTapPlacement::HeadInsertEventTap,
                    // Non-negotiable. See the module docs.
                    CGEventTapOptions::ListenOnly,
                    vec![CGEventType::FlagsChanged, CGEventType::KeyDown],
                    move |_proxy, etype, event| {
                        match etype {
                            CGEventType::FlagsChanged => {
                                let flags = event.get_flags();
                                let now_alt =
                                    flags.contains(CGEventFlags::CGEventFlagAlternate);
                                let was_alt = cb_alt.swap(now_alt, Ordering::AcqRel);

                                if now_alt && !was_alt {
                                    feed(&cb_shared, &cb_tx, Input::Down);
                                    if contaminating(flags) {
                                        // Option joined an existing chord.
                                        feed(&cb_shared, &cb_tx, Input::Cancel);
                                    }
                                } else if !now_alt && was_alt {
                                    feed(&cb_shared, &cb_tx, Input::Up);
                                } else if now_alt && contaminating(flags) {
                                    // Another modifier joined mid-hold.
                                    feed(&cb_shared, &cb_tx, Input::Cancel);
                                }
                            }
                            CGEventType::KeyDown => {
                                // Holding Option to type (Option+E and friends)
                                // is not a gesture. We look only at the event
                                // type; the key code is never read.
                                if cb_alt.load(Ordering::Acquire) {
                                    feed(&cb_shared, &cb_tx, Input::Cancel);
                                }
                            }
                            CGEventType::TapDisabledByTimeout
                            | CGEventType::TapDisabledByUserInput => {
                                let raw = cb_port.load(Ordering::Acquire);
                                if !raw.is_null() {
                                    unsafe { CGEventTapEnable(raw as CFMachPortRef, true) };
                                }
                                eprintln!("[optiontap] tap disabled by system; re-armed");
                            }
                            _ => {}
                        }
                        // Listen-only taps ignore this, but returning Keep
                        // documents the intent: never swallow an event.
                        CallbackResult::Keep
                    },
                );

                let tap = match tap {
                    Ok(tap) => tap,
                    Err(()) => {
                        // Permission can be revoked between the preflight and
                        // the create. Degrade quietly: no panic, no retry loop.
                        eprintln!(
                            "[optiontap] CGEventTapCreate failed; Option gestures are unavailable"
                        );
                        LISTENING.store(false, Ordering::Release);
                        let _ = app.emit(
                            "optiontap://unavailable",
                            UnavailablePayload {
                                reason: "tap_create_failed",
                            },
                        );
                        return;
                    }
                };

                port.store(
                    tap.mach_port().as_concrete_TypeRef() as *mut c_void,
                    Ordering::Release,
                );

                let source = match tap.mach_port().create_runloop_source(0) {
                    Ok(source) => source,
                    Err(()) => {
                        eprintln!("[optiontap] run loop source creation failed");
                        LISTENING.store(false, Ordering::Release);
                        let _ = app.emit(
                            "optiontap://unavailable",
                            UnavailablePayload {
                                reason: "tap_create_failed",
                            },
                        );
                        return;
                    }
                };

                CFRunLoop::get_current().add_source(&source, unsafe { kCFRunLoopCommonModes });
                tap.enable();
                eprintln!("[optiontap] listening for Option gestures (listen-only tap)");

                // Blocks for the app's lifetime. `tap` stays alive in scope;
                // dropping it would invalidate the mach port.
                CFRunLoop::run_current();

                LISTENING.store(false, Ordering::Release);
                drop(tap);
            })
            .ok();
    }
}

#[cfg(not(target_os = "macos"))]
mod imp {
    use tauri::AppHandle;

    pub fn permission_granted() -> bool {
        false
    }
    pub fn request_permission() -> bool {
        false
    }
    pub fn listening() -> bool {
        false
    }
    pub fn ensure_started(_app: &AppHandle) -> bool {
        false
    }
}

// ---------------------------------------------------------------------------
// Public surface
// ---------------------------------------------------------------------------

/// Install the tap at app startup. Safe to call when the Input Monitoring
/// permission is missing: it becomes a no-op and the app runs on unaffected.
pub fn start(app: &tauri::AppHandle) {
    imp::ensure_started(app);
}

/// Current tap health. The TypeScript side calls this to decide whether to
/// show onboarding guidance for Input Monitoring.
#[tauri::command]
pub fn optiontap_status() -> OptionTapStatus {
    OptionTapStatus {
        supported: cfg!(target_os = "macos"),
        permission: if imp::permission_granted() {
            "granted"
        } else {
            "denied"
        },
        listening: imp::listening(),
    }
}

/// Prompt for Input Monitoring, then try to install the tap. Must be driven by
/// an explicit user action: macOS shows the prompt only once per process, and
/// nagging on every launch is exactly what the brief rules out.
#[tauri::command]
pub fn optiontap_request_permission(app: tauri::AppHandle) -> OptionTapStatus {
    imp::request_permission();
    imp::ensure_started(&app);
    optiontap_status()
}

/// Idempotently install the tap. Call after the user grants the permission in
/// System Settings so the overlay starts working without an app restart.
#[tauri::command]
pub fn optiontap_ensure_started(app: tauri::AppHandle) -> OptionTapStatus {
    imp::ensure_started(&app);
    optiontap_status()
}

// ---------------------------------------------------------------------------
// Tests — the whole point of keeping the timing out of the C callback
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    const LONG: u64 = 300;
    const WINDOW: u64 = 400;

    fn machine() -> GestureMachine {
        GestureMachine::with_timings(LONG, WINDOW)
    }

    /// Replay a script of (input, timestamp) pairs and collect every emission
    /// in order.
    fn run(script: &[(Input, u64)]) -> Vec<Emission> {
        let mut m = machine();
        let mut out = Vec::new();
        for &(input, at) in script {
            out.extend(m.step(input, at));
        }
        out
    }

    #[test]
    fn single_tap_emits_only_raw_transitions() {
        // Down, up 80ms later, then the double-tap window lapses untouched.
        let out = run(&[(Input::Down, 0), (Input::Up, 80), (Input::Tick, 500)]);
        assert_eq!(out, vec![Emission::Down, Emission::Up]);
    }

    #[test]
    fn single_tap_returns_to_idle_after_the_window() {
        let mut m = machine();
        m.step(Input::Down, 0);
        m.step(Input::Up, 80);
        assert_eq!(m.next_deadline_in(80), Some(400));
        m.step(Input::Tick, 480);
        assert_eq!(m.next_deadline_in(480), None);
    }

    #[test]
    fn double_tap_fires_on_the_second_press() {
        let out = run(&[
            (Input::Down, 0),
            (Input::Up, 80),
            (Input::Down, 200),
            (Input::Up, 260),
        ]);
        assert_eq!(
            out,
            vec![
                Emission::Down,
                Emission::Up,
                Emission::Down,
                Emission::DoubleTap,
                Emission::Up,
            ]
        );
    }

    #[test]
    fn double_tap_never_also_fires_a_long_press() {
        // The second press of a double tap is held well past the long-press
        // threshold. It must stay a double tap.
        let mut m = machine();
        let mut out = Vec::new();
        out.extend(m.step(Input::Down, 0));
        out.extend(m.step(Input::Up, 80));
        out.extend(m.step(Input::Down, 200));
        out.extend(m.step(Input::Tick, 900));
        out.extend(m.step(Input::Tick, 2_000));
        out.extend(m.step(Input::Up, 3_000));

        assert!(!out.contains(&Emission::LongPressStart));
        assert_eq!(out.iter().filter(|e| **e == Emission::DoubleTap).count(), 1);
        assert_eq!(out.last(), Some(&Emission::Up));
    }

    #[test]
    fn long_press_starts_at_the_threshold_and_ends_on_release() {
        let out = run(&[
            (Input::Down, 0),
            (Input::Tick, 100), // too early
            (Input::Tick, 300), // threshold
            (Input::Up, 1_500),
        ]);
        assert_eq!(
            out,
            vec![
                Emission::Down,
                Emission::LongPressStart,
                Emission::Up,
                Emission::LongPressEnd,
            ]
        );
    }

    #[test]
    fn long_press_commits_even_when_the_release_outruns_the_timer() {
        // No Tick ever lands between down and up. The hold still qualified, so
        // the machine must not silently downgrade it to a tap.
        let out = run(&[(Input::Down, 0), (Input::Up, 900)]);
        assert_eq!(
            out,
            vec![
                Emission::Down,
                Emission::LongPressStart,
                Emission::Up,
                Emission::LongPressEnd,
            ]
        );
    }

    #[test]
    fn a_committed_long_press_is_never_reinterpreted_as_a_double_tap() {
        // Long press, release, then a fast second press. The second press
        // starts a fresh gesture; it does not retroactively pair with the
        // long press.
        let out = run(&[
            (Input::Down, 0),
            (Input::Tick, 300),
            (Input::Up, 500),
            (Input::Down, 560),
            (Input::Up, 620),
        ]);
        assert!(!out.contains(&Emission::DoubleTap));
        assert_eq!(
            out,
            vec![
                Emission::Down,
                Emission::LongPressStart,
                Emission::Up,
                Emission::LongPressEnd,
                Emission::Down,
                Emission::Up,
            ]
        );
    }

    #[test]
    fn slow_second_press_degrades_to_two_single_taps() {
        let out = run(&[
            (Input::Down, 0),
            (Input::Up, 80),
            (Input::Tick, 480), // window lapses
            (Input::Down, 600),
            (Input::Up, 680),
            (Input::Tick, 1_100),
        ]);
        assert!(!out.contains(&Emission::DoubleTap));
        assert_eq!(
            out,
            vec![
                Emission::Down,
                Emission::Up,
                Emission::Down,
                Emission::Up
            ]
        );
    }

    #[test]
    fn slow_second_press_degrades_even_with_no_intervening_tick() {
        // The timer thread never ran. The Down itself must notice the lapsed
        // window rather than firing a stale double tap.
        let out = run(&[
            (Input::Down, 0),
            (Input::Up, 80),
            (Input::Down, 600),
            (Input::Up, 680),
        ]);
        assert!(!out.contains(&Emission::DoubleTap));
    }

    #[test]
    fn second_press_exactly_at_the_window_edge_is_not_a_double_tap() {
        // expires = 80 + 400 = 480. A press at 480 is outside.
        let out = run(&[(Input::Down, 0), (Input::Up, 80), (Input::Down, 480)]);
        assert!(!out.contains(&Emission::DoubleTap));

        let out = run(&[(Input::Down, 0), (Input::Up, 80), (Input::Down, 479)]);
        assert!(out.contains(&Emission::DoubleTap));
    }

    #[test]
    fn triple_tap_yields_exactly_one_double_tap_plus_a_trailing_tap() {
        let out = run(&[
            (Input::Down, 0),
            (Input::Up, 60),
            (Input::Down, 160),
            (Input::Up, 220),
            (Input::Down, 320),
            (Input::Up, 380),
            (Input::Tick, 900),
        ]);
        assert_eq!(out.iter().filter(|e| **e == Emission::DoubleTap).count(), 1);
        assert_eq!(
            out,
            vec![
                Emission::Down,
                Emission::Up,
                Emission::Down,
                Emission::DoubleTap,
                Emission::Up,
                Emission::Down,
                Emission::Up,
            ]
        );
    }

    #[test]
    fn long_press_immediately_after_a_tap_outside_the_window() {
        let out = run(&[
            (Input::Down, 0),
            (Input::Up, 80),
            (Input::Tick, 480),
            (Input::Down, 600),
            (Input::Tick, 900), // threshold crossed at 900
            (Input::Up, 2_000),
        ]);
        assert_eq!(
            out,
            vec![
                Emission::Down,
                Emission::Up,
                Emission::Down,
                Emission::LongPressStart,
                Emission::Up,
                Emission::LongPressEnd,
            ]
        );
    }

    #[test]
    fn a_chord_cancels_a_pending_long_press() {
        // Option joins Command, then is held past the threshold. No gesture.
        let out = run(&[
            (Input::Down, 0),
            (Input::Cancel, 0),
            (Input::Tick, 1_000),
            (Input::Up, 1_200),
        ]);
        assert_eq!(out, vec![Emission::Down, Emission::Up]);
    }

    #[test]
    fn typing_while_holding_option_cancels_the_gesture() {
        let out = run(&[
            (Input::Down, 0),
            (Input::Cancel, 120), // a KeyDown arrived
            (Input::Tick, 400),
            (Input::Up, 500),
        ]);
        assert!(!out.contains(&Emission::LongPressStart));
        assert_eq!(out, vec![Emission::Down, Emission::Up]);
    }

    #[test]
    fn a_cancel_between_taps_prevents_a_double_tap() {
        let out = run(&[
            (Input::Down, 0),
            (Input::Up, 60),
            (Input::Cancel, 100),
            (Input::Down, 160),
            (Input::Up, 220),
        ]);
        assert!(!out.contains(&Emission::DoubleTap));
    }

    #[test]
    fn a_cancel_does_not_abort_an_already_committed_long_press() {
        // Once recording is live, an incidental keystroke must not silently
        // drop the utterance. Release still ends it cleanly.
        let out = run(&[
            (Input::Down, 0),
            (Input::Tick, 300),
            (Input::Cancel, 700),
            (Input::Up, 1_100),
        ]);
        assert_eq!(
            out,
            vec![
                Emission::Down,
                Emission::LongPressStart,
                Emission::Up,
                Emission::LongPressEnd,
            ]
        );
    }

    #[test]
    fn an_unmatched_up_is_ignored() {
        // The tap can install while Option is already held; the first thing it
        // sees may be a release with no matching press.
        let out = run(&[(Input::Up, 0), (Input::Tick, 100)]);
        assert!(out.is_empty());
    }

    #[test]
    fn a_repeated_down_does_not_double_emit() {
        let out = run(&[(Input::Down, 0), (Input::Down, 50), (Input::Up, 100)]);
        assert_eq!(out, vec![Emission::Down, Emission::Up]);
    }

    #[test]
    fn deadlines_track_the_pending_gesture() {
        let mut m = machine();
        assert_eq!(m.next_deadline_in(0), None);

        m.step(Input::Down, 0);
        assert_eq!(m.next_deadline_in(0), Some(300));
        assert_eq!(m.next_deadline_in(250), Some(50));
        // Overdue clamps to zero rather than underflowing.
        assert_eq!(m.next_deadline_in(999), Some(0));

        m.step(Input::Tick, 300);
        assert_eq!(m.next_deadline_in(300), None); // long press, nothing pending

        m.step(Input::Up, 400);
        assert_eq!(m.next_deadline_in(400), None); // committed, straight to idle
    }

    #[test]
    fn every_emission_has_a_distinct_stable_event_name() {
        let all = [
            Emission::Down,
            Emission::Up,
            Emission::LongPressStart,
            Emission::LongPressEnd,
            Emission::DoubleTap,
        ];
        let names: Vec<&str> = all.iter().map(|e| e.event_name()).collect();
        assert_eq!(
            names,
            vec![
                "optiontap://down",
                "optiontap://up",
                "optiontap://long-press-start",
                "optiontap://long-press-end",
                "optiontap://double-tap",
            ]
        );
        // Tauri rejects event names outside this character set.
        for name in &names {
            assert!(name
                .chars()
                .all(|c| c.is_alphanumeric() || c == '-' || c == '/' || c == ':' || c == '_'));
        }
    }
}
