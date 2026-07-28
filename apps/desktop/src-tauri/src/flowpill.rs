//! The flowpill overlay window: native plumbing only.
//!
//! `flowpill` is a second webview window (declared in `tauri.conf.json`) that
//! hosts the Wispr-Flow-style voice pill. It is 440x300, fully transparent,
//! shadowless, undecorated, always-on-top, and hidden until the user holds the
//! Option key. Only the bottom ~70px of that surface is painted; the empty
//! space above gives the pill room to grow upward.
//!
//! This module owns the WINDOW, not its contents. The pill's markup, animation,
//! and state machine live in the TypeScript entry point (`flowpill.html`).
//!
//! # Why non-activating is the whole feature
//!
//! The user dictates *next to* another app: they are in Xcode, or Slack, or a
//! browser, and they hold Option to talk. If showing the pill stole keyboard
//! focus, their caret would leave the app they were typing in and the feature
//! would be worse than useless. Three mechanisms combine to prevent that:
//!
//! 1. **`focusable: false` in the window config.** tao maps that flag onto its
//!    `TaoWindow` subclass's `focusable` ivar, and that ivar is what
//!    `canBecomeKeyWindow` and `canBecomeMainWindow` return
//!    (`tao/src/platform_impl/macos/window.rs`). A window that answers NO to
//!    `canBecomeKeyWindow` cannot be made key by AppKit, so it cannot take key
//!    status from the frontmost app. `assert_non_activating` reads the property
//!    back off the live `NSWindow` and screams if it is ever YES.
//! 2. **`orderFront:` instead of `makeKeyAndOrderFront:`.** Tauri's
//!    `Window::show()` calls `makeKeyAndOrderFront:`. With (1) in place that
//!    call cannot make the window key, but we do not rely on that alone:
//!    `flowpill_show` reaches through to the `NSWindow` and orders it front
//!    directly, so no key-window request is ever issued in the first place.
//! 3. **A floating level plus panel-ish collection behaviour**, so the pill
//!    sits above ordinary windows, follows the user across Spaces, and appears
//!    over full-screen apps rather than being trapped on one desktop.
//!
//! The one thing this does NOT buy is a click that leaves the other app active.
//! Clicking inside a non-activating *panel* keeps the previous app frontmost;
//! clicking inside a plain `NSWindow` activates its app, even a non-key one.
//! Getting true panel semantics would mean `object_setClass`-ing tao's window
//! into an `NSPanel` subclass at runtime, which risks a hard crash on any tao
//! change. So the pill's primary controls are keyboard driven (release Option
//! to send, Escape to cancel, both delivered by the global event tap) and a
//! mouse click on Cancel/Done is the secondary path that does briefly activate
//! JARVIS. See the report for the manual confirmation steps.

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, PhysicalPosition, Runtime, WebviewWindow};
use tauri_plugin_store::StoreExt;

/// Window label. Must match the `label` in `tauri.conf.json`.
pub const FLOWPILL_LABEL: &str = "flowpill";

/// Store file holding the user's chosen corner, so it survives a restart.
const STORE_FILE: &str = "flowpill.json";
const CORNER_KEY: &str = "corner";

/// Gap between the pill's window and the two screen edges it hugs, in logical
/// points. Scaled by the monitor's DPI factor before use.
const MARGIN: f64 = 24.0;

/// Which screen corner the pill parks in. The user asked for a corner rather
/// than Wispr's bottom-centre, and bottom-right is the default.
#[derive(Copy, Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum Corner {
    TopLeft,
    TopRight,
    BottomLeft,
    #[default]
    BottomRight,
}

impl Corner {
    /// The wire form used by the TypeScript side and by the store.
    pub fn as_str(self) -> &'static str {
        match self {
            Corner::TopLeft => "top-left",
            Corner::TopRight => "top-right",
            Corner::BottomLeft => "bottom-left",
            Corner::BottomRight => "bottom-right",
        }
    }

    /// Parse the wire form. Accepts the four kebab-case corners and nothing
    /// else, so a typo from the frontend is a loud error rather than a silent
    /// snap back to the default.
    pub fn parse(value: &str) -> Option<Self> {
        match value {
            "top-left" => Some(Corner::TopLeft),
            "top-right" => Some(Corner::TopRight),
            "bottom-left" => Some(Corner::BottomLeft),
            "bottom-right" => Some(Corner::BottomRight),
            _ => None,
        }
    }

    fn is_top(self) -> bool {
        matches!(self, Corner::TopLeft | Corner::TopRight)
    }

    fn is_left(self) -> bool {
        matches!(self, Corner::TopLeft | Corner::BottomLeft)
    }
}

/// Top-left origin, in physical pixels, for a `win_w` x `win_h` window parked
/// in `corner` of a work area at `(area_x, area_y)` sized `area_w` x `area_h`.
///
/// Everything is physical pixels in the global desktop coordinate space that
/// Tauri reports, which is why `area_x` / `area_y` can be negative (a display
/// to the left of or above the primary one). Keeping this a pure function is
/// deliberate: it is the one piece of this module that can be proven headlessly,
/// and the tests at the bottom of this file cover all four corners, both
/// multi-monitor offsets, and the degenerate case where the window is larger
/// than the display.
///
/// The result is clamped to the work area, so a window wider or taller than the
/// screen is pinned to the top-left of that screen instead of being pushed
/// off-screen. macOS also refuses to place a window flush above the top edge;
/// `work_area` already excludes the menu bar, and `margin` adds more slack, so
/// the top corners land in a legal position.
fn corner_origin(
    area_x: i32,
    area_y: i32,
    area_w: u32,
    area_h: u32,
    win_w: u32,
    win_h: u32,
    margin: i32,
    corner: Corner,
) -> (i32, i32) {
    let area_w = area_w as i64;
    let area_h = area_h as i64;
    let win_w = win_w as i64;
    let win_h = win_h as i64;
    let margin = margin as i64;

    let x = if corner.is_left() {
        area_x as i64 + margin
    } else {
        area_x as i64 + area_w - win_w - margin
    };
    let y = if corner.is_top() {
        area_y as i64 + margin
    } else {
        area_y as i64 + area_h - win_h - margin
    };

    // Clamp into the work area. `max` of the low bound runs last so a window
    // bigger than the display resolves to the area origin rather than a
    // negative offset that would strand it off-screen.
    let x = x.min(area_x as i64 + area_w - win_w).max(area_x as i64);
    let y = y.min(area_y as i64 + area_h - win_h).max(area_y as i64);

    (x as i32, y as i32)
}

/// Read the persisted corner, defaulting to bottom-right when the store is
/// absent, empty, or holds something unparseable.
fn load_corner<R: Runtime>(app: &AppHandle<R>) -> Corner {
    let store = match app.store(STORE_FILE) {
        Ok(store) => store,
        Err(error) => {
            eprintln!("[flowpill] store open failed, using default corner: {error}");
            return Corner::default();
        }
    };
    store
        .get(CORNER_KEY)
        .and_then(|value| value.as_str().and_then(Corner::parse))
        .unwrap_or_default()
}

fn save_corner<R: Runtime>(app: &AppHandle<R>, corner: Corner) -> Result<(), String> {
    let store = app
        .store(STORE_FILE)
        .map_err(|error| format!("flowpill store open failed: {error}"))?;
    store.set(CORNER_KEY, corner.as_str());
    store
        .save()
        .map_err(|error| format!("flowpill store save failed: {error}"))
}

fn flowpill_window<R: Runtime>(app: &AppHandle<R>) -> Result<WebviewWindow<R>, String> {
    app.get_webview_window(FLOWPILL_LABEL)
        .ok_or_else(|| format!("window not found: {FLOWPILL_LABEL}"))
}

/// Move the window to `corner` of whichever display it currently sits on.
///
/// Multi-monitor: `current_monitor()` reports the display the window is on, so
/// the pill parks on that screen's corner rather than always the primary one.
/// It falls back to the primary display (a window that has never been shown can
/// report no current monitor), and when neither is available it leaves the
/// window where it is instead of guessing at coordinates and risking an
/// off-screen placement.
fn reposition<R: Runtime>(window: &WebviewWindow<R>, corner: Corner) -> Result<(), String> {
    let monitor = match window.current_monitor() {
        Ok(Some(monitor)) => Some(monitor),
        Ok(None) | Err(_) => window.primary_monitor().ok().flatten(),
    };
    let Some(monitor) = monitor else {
        eprintln!("[flowpill] no monitor reported; leaving position untouched");
        return Ok(());
    };

    // `work_area` excludes the menu bar and the Dock, so the pill never hides
    // under either and the top corners stay in a position macOS will accept.
    let area = monitor.work_area();
    let size = window
        .outer_size()
        .map_err(|error| format!("flowpill outer_size failed: {error}"))?;
    let margin = (MARGIN * monitor.scale_factor()).round() as i32;

    let (x, y) = corner_origin(
        area.position.x,
        area.position.y,
        area.size.width,
        area.size.height,
        size.width,
        size.height,
        margin,
        corner,
    );
    window
        .set_position(PhysicalPosition::new(x, y))
        .map_err(|error| format!("flowpill set_position failed: {error}"))
}

/// Apply the macOS-only window attributes that make the overlay behave like a
/// floating panel. Idempotent, so it is safe to re-run on every show.
///
/// Runs on the main thread: `#[tauri::command]` bodies execute off the main
/// thread, and touching `NSWindow` from another thread is undefined behaviour.
#[cfg(target_os = "macos")]
fn apply_native_behaviour<R: Runtime>(window: &WebviewWindow<R>) {
    // Belt and braces with `focusable: false` in tauri.conf.json. If that config
    // key is ever dropped, this keeps `canBecomeKeyWindow` answering NO. Safe to
    // call while the window is hidden; the tao caveat about being unable to
    // unfocus an ALREADY-focused window does not apply here.
    if let Err(error) = window.set_focusable(false) {
        eprintln!("[flowpill] set_focusable(false) failed: {error}");
    }

    let handle = window.clone();
    if let Err(error) = window.run_on_main_thread(move || {
        use objc2_app_kit::{NSWindow, NSWindowCollectionBehavior, NSStatusWindowLevel};

        let ptr = match handle.ns_window() {
            Ok(ptr) => ptr as *mut NSWindow,
            Err(error) => {
                eprintln!("[flowpill] ns_window() failed: {error}");
                return;
            }
        };
        if ptr.is_null() {
            eprintln!("[flowpill] ns_window() returned null");
            return;
        }
        // SAFETY: `ns_window()` hands back the live `NSWindow` owned by tao for
        // this window's lifetime, and this closure runs on the main thread, which
        // is the only thread allowed to touch it. We only set documented
        // properties and read one back.
        let ns_window = unsafe { &*ptr };

        // Above ordinary and floating windows. `NSStatusWindowLevel` (25) is the
        // documented level for menu-bar-adjacent helper UI; the pill has to win
        // against other apps' always-on-top panels, which sit at
        // `NSFloatingWindowLevel` (3). Tauri's `alwaysOnTop: true` only gets us
        // to 3, so this deliberately overrides it. Drop to
        // `NSFloatingWindowLevel` if the pill ever needs to yield to something.
        ns_window.setLevel(NSStatusWindowLevel);

        // Panel-ish collection behaviour:
        // - CanJoinAllSpaces: follow the user across Spaces instead of being
        //   stranded on the desktop that happened to be active at launch.
        // - FullScreenAuxiliary: appear ON TOP of a full-screen app rather than
        //   forcing a Space switch. Without it, holding Option inside a
        //   full-screen editor shows nothing.
        // - Stationary: Mission Control / Expose leaves the pill alone.
        // - IgnoresCycle: keep it out of Cmd+` window cycling.
        // This replaces the whole mask, so CanJoinAllSpaces is re-stated here to
        // preserve what `visibleOnAllWorkspaces: true` set at creation.
        ns_window.setCollectionBehavior(
            NSWindowCollectionBehavior::CanJoinAllSpaces
                | NSWindowCollectionBehavior::FullScreenAuxiliary
                | NSWindowCollectionBehavior::Stationary
                | NSWindowCollectionBehavior::IgnoresCycle,
        );

        // Stay on screen when JARVIS is not the active app. That is the normal
        // case for this window: the user is always in some other app.
        ns_window.setHidesOnDeactivate(false);

        // Runtime assertion. `canBecomeKeyWindow` is the single property that
        // decides whether showing this window can steal the caret, so read it
        // back off the real object rather than trusting the config round-trip.
        if ns_window.canBecomeKeyWindow() {
            eprintln!(
                "[flowpill] FATAL-ISH: canBecomeKeyWindow is YES. Showing the pill will steal \
                 focus from the frontmost app. Check that `focusable: false` is still set on the \
                 flowpill window in tauri.conf.json."
            );
        } else {
            eprintln!("[flowpill] non-activating OK: canBecomeKeyWindow=NO, level=status, spaces=all");
        }
    }) {
        eprintln!("[flowpill] run_on_main_thread failed: {error}");
    }
}

/// No-op off macOS. The overlay is a macOS feature (it is driven by a
/// CGEventTap on the Option key), so there is nothing to translate.
#[cfg(not(target_os = "macos"))]
fn apply_native_behaviour<R: Runtime>(_window: &WebviewWindow<R>) {}

/// Order the window front WITHOUT any key-window request.
///
/// Tauri's `show()` routes to `makeKeyAndOrderFront:`. `canBecomeKeyWindow` is
/// NO so that cannot actually take focus, but issuing a key request at all is
/// pointless risk, so on macOS we call `orderFront:` directly. Tauri reads
/// visibility straight off `NSWindow.isVisible`, so bypassing `show()` leaves no
/// stale bookkeeping behind.
#[cfg(target_os = "macos")]
fn order_front<R: Runtime>(window: &WebviewWindow<R>) -> Result<(), String> {
    let handle = window.clone();
    window
        .run_on_main_thread(move || {
            use objc2_app_kit::NSWindow;

            let ptr = match handle.ns_window() {
                Ok(ptr) => ptr as *mut NSWindow,
                Err(error) => {
                    eprintln!("[flowpill] ns_window() failed on show: {error}");
                    return;
                }
            };
            if ptr.is_null() {
                eprintln!("[flowpill] ns_window() returned null on show");
                return;
            }
            // SAFETY: as in `apply_native_behaviour` — live pointer, main thread.
            let ns_window = unsafe { &*ptr };
            ns_window.orderFront(None);
        })
        .map_err(|error| format!("flowpill orderFront failed: {error}"))
}

#[cfg(not(target_os = "macos"))]
fn order_front<R: Runtime>(window: &WebviewWindow<R>) -> Result<(), String> {
    window
        .show()
        .map_err(|error| format!("flowpill show failed: {error}"))
}

/// Called once from `lib.rs`'s `setup`. Applies the native attributes and parks
/// the window in the persisted corner while it is still hidden, so its first
/// appearance is already in the right place with no visible jump.
pub fn init<R: Runtime>(app: &AppHandle<R>) {
    let window = match flowpill_window(app) {
        Ok(window) => window,
        Err(error) => {
            eprintln!("[flowpill] init skipped: {error}");
            return;
        }
    };
    apply_native_behaviour(&window);
    let corner = load_corner(app);
    if let Err(error) = reposition(&window, corner) {
        eprintln!("[flowpill] init reposition failed: {error}");
    }
}

/// Show the pill. Repositions first so it lands in the right corner of whatever
/// display is currently in play, re-asserts the native attributes (cheap and
/// idempotent), then orders it front without requesting key status.
#[tauri::command]
pub fn flowpill_show<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
    let window = flowpill_window(&app)?;
    let corner = load_corner(&app);
    if let Err(error) = reposition(&window, corner) {
        // A positioning failure must not block the pill from appearing; the user
        // pressing Option needs feedback more than it needs a perfect corner.
        eprintln!("[flowpill] show reposition failed: {error}");
    }
    apply_native_behaviour(&window);
    order_front(&window)
}

#[tauri::command]
pub fn flowpill_hide<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
    flowpill_window(&app)?
        .hide()
        .map_err(|error| format!("flowpill hide failed: {error}"))
}

/// Park the pill in a different corner, persist the choice, and move it now if
/// it happens to be on screen.
#[tauri::command]
pub fn flowpill_set_corner<R: Runtime>(app: AppHandle<R>, corner: String) -> Result<(), String> {
    let parsed = Corner::parse(&corner).ok_or_else(|| {
        format!("unknown corner {corner:?}; expected top-left, top-right, bottom-left or bottom-right")
    })?;
    let window = flowpill_window(&app)?;
    reposition(&window, parsed)?;
    save_corner(&app, parsed)
}

#[tauri::command]
pub fn flowpill_get_corner<R: Runtime>(app: AppHandle<R>) -> String {
    load_corner(&app).as_str().to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    // A 1512x945 laptop display with the menu bar and Dock carved out, at 2x.
    const AREA_X: i32 = 0;
    const AREA_Y: i32 = 50;
    const AREA_W: u32 = 3024;
    const AREA_H: u32 = 1790;
    const WIN_W: u32 = 880;
    const WIN_H: u32 = 600;
    const MARGIN_PX: i32 = 48;

    fn origin(corner: Corner) -> (i32, i32) {
        corner_origin(
            AREA_X, AREA_Y, AREA_W, AREA_H, WIN_W, WIN_H, MARGIN_PX, corner,
        )
    }

    #[test]
    fn bottom_right_is_the_default_corner() {
        assert_eq!(Corner::default(), Corner::BottomRight);
        assert_eq!(Corner::default().as_str(), "bottom-right");
    }

    #[test]
    fn every_corner_round_trips_through_its_wire_form() {
        for corner in [
            Corner::TopLeft,
            Corner::TopRight,
            Corner::BottomLeft,
            Corner::BottomRight,
        ] {
            assert_eq!(Corner::parse(corner.as_str()), Some(corner));
        }
        assert_eq!(Corner::parse("middle"), None);
        assert_eq!(Corner::parse("BottomRight"), None);
        assert_eq!(Corner::parse(""), None);
    }

    #[test]
    fn corners_hug_the_two_edges_they_name() {
        // top-left: margin in from both the left and the top of the work area.
        assert_eq!(origin(Corner::TopLeft), (48, 98));
        // top-right: right edge minus the window minus the margin.
        assert_eq!(origin(Corner::TopRight), (3024 - 880 - 48, 98));
        // bottom-left.
        assert_eq!(origin(Corner::BottomLeft), (48, 50 + 1790 - 600 - 48));
        // bottom-right, the default.
        assert_eq!(
            origin(Corner::BottomRight),
            (3024 - 880 - 48, 50 + 1790 - 600 - 48)
        );
    }

    #[test]
    fn every_corner_lands_fully_inside_the_work_area() {
        for corner in [
            Corner::TopLeft,
            Corner::TopRight,
            Corner::BottomLeft,
            Corner::BottomRight,
        ] {
            let (x, y) = origin(corner);
            assert!(x >= AREA_X, "{corner:?} x={x} left of the work area");
            assert!(y >= AREA_Y, "{corner:?} y={y} above the work area");
            assert!(
                x + WIN_W as i32 <= AREA_X + AREA_W as i32,
                "{corner:?} overflows the right edge"
            );
            assert!(
                y + WIN_H as i32 <= AREA_Y + AREA_H as i32,
                "{corner:?} overflows the bottom edge"
            );
        }
    }

    #[test]
    fn a_secondary_display_to_the_left_keeps_negative_coordinates() {
        // A 1920x1080 display sitting to the LEFT of the primary one, so its
        // origin is negative in the global desktop space. The pill must land on
        // THAT display, not snap back to x >= 0.
        let (x, y) = corner_origin(-1920, 0, 1920, 1080, 440, 300, 24, Corner::BottomRight);
        assert_eq!((x, y), (-1920 + 1920 - 440 - 24, 1080 - 300 - 24));
        assert!(x < 0, "expected a negative x on the left-hand display");
    }

    #[test]
    fn a_secondary_display_above_keeps_negative_y() {
        let (x, y) = corner_origin(0, -1080, 1920, 1080, 440, 300, 24, Corner::TopLeft);
        assert_eq!((x, y), (24, -1080 + 24));
    }

    #[test]
    fn a_window_larger_than_the_display_is_clamped_not_pushed_off_screen() {
        // Degenerate case: a tiny external display smaller than the overlay.
        // Every corner has to collapse to the work-area origin rather than
        // producing a negative offset that would strand the pill off-screen.
        for corner in [
            Corner::TopLeft,
            Corner::TopRight,
            Corner::BottomLeft,
            Corner::BottomRight,
        ] {
            let (x, y) = corner_origin(100, 200, 320, 240, 440, 300, 24, corner);
            assert_eq!((x, y), (100, 200), "{corner:?} was not clamped");
        }
    }

    #[test]
    fn a_zero_margin_puts_the_window_flush_against_the_edges() {
        let (x, y) = corner_origin(0, 0, 1920, 1080, 440, 300, 0, Corner::BottomRight);
        assert_eq!((x, y), (1920 - 440, 1080 - 300));
    }
}
