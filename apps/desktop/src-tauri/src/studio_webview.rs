use tauri::{
    webview::WebviewBuilder, AppHandle, Manager, PhysicalPosition, PhysicalSize, Rect, Size,
    WebviewUrl,
};

fn external_url(value: &str) -> Result<tauri::Url, String> {
    let url = value
        .parse::<tauri::Url>()
        .map_err(|error| format!("invalid webview URL: {error}"))?;
    if !matches!(url.scheme(), "http" | "https") {
        return Err("webview URL must use http or https".to_string());
    }
    Ok(url)
}

fn bounds(x: i32, y: i32, w: u32, h: u32) -> Result<Rect, String> {
    if w == 0 || h == 0 {
        return Err("webview width and height must be greater than zero".to_string());
    }
    Ok(Rect {
        position: PhysicalPosition::new(x, y).into(),
        size: Size::Physical(PhysicalSize::new(w, h)),
    })
}

fn webview(app: &AppHandle, label: &str) -> Result<tauri::Webview, String> {
    app.get_webview(label)
        .ok_or_else(|| format!("studio webview not found: {label}"))
}

#[tauri::command]
pub async fn studio_webview_create(
    app: AppHandle,
    label: String,
    url: String,
    x: i32,
    y: i32,
    w: u32,
    h: u32,
) -> Result<(), String> {
    eprintln!(
        "[studio_webview_create] label={label} url={url} x={x} y={y} w={w} h={h}"
    );
    let url = external_url(&url).map_err(|e| {
        eprintln!("[studio_webview_create] url reject: {e}");
        e
    })?;
    let bounds = bounds(x, y, w, h).map_err(|e| {
        eprintln!("[studio_webview_create] bounds reject: {e}");
        e
    })?;

    if let Some(existing) = app.get_webview(&label) {
        eprintln!("[studio_webview_create] reusing existing webview label={label}");
        existing.navigate(url).map_err(|error| {
            eprintln!("[studio_webview_create] navigate err: {error}");
            error.to_string()
        })?;
        existing.set_bounds(bounds).map_err(|error| {
            eprintln!("[studio_webview_create] set_bounds err: {error}");
            error.to_string()
        })?;
        return existing.show().map_err(|error| {
            eprintln!("[studio_webview_create] show err: {error}");
            error.to_string()
        });
    }

    let window = app
        .get_window("main")
        .ok_or_else(|| "main window not found".to_string())?;
    let builder = WebviewBuilder::new(&label, WebviewUrl::External(url));
    let child = window
        .add_child(builder, bounds.position, bounds.size)
        .map_err(|error| {
            eprintln!("[studio_webview_create] add_child err: {error}");
            error.to_string()
        })?;
    // A freshly built child webview is not guaranteed visible or on top of the
    // host webview on macOS; force it visible so the promoted page is not left
    // rendering behind the main window's transparent surface.
    if let Err(error) = child.show() {
        eprintln!("[studio_webview_create] post-build show err: {error}");
    }
    eprintln!("[studio_webview_create] created label={label}");
    Ok(())
}

#[tauri::command]
pub fn studio_webview_set_bounds(
    app: AppHandle,
    label: String,
    x: i32,
    y: i32,
    w: u32,
    h: u32,
) -> Result<(), String> {
    webview(&app, &label)
        .map_err(|e| {
            eprintln!("[studio_webview_set_bounds] {label}: {e}");
            e
        })?
        .set_bounds(bounds(x, y, w, h)?)
        .map_err(|error| {
            eprintln!("[studio_webview_set_bounds] {label} err: {error}");
            error.to_string()
        })
}

#[tauri::command]
pub fn studio_webview_show(app: AppHandle, label: String) -> Result<(), String> {
    webview(&app, &label)?
        .show()
        .map_err(|error| {
            eprintln!("[studio_webview_show] {label} err: {error}");
            error.to_string()
        })
}

#[tauri::command]
pub fn studio_webview_hide(app: AppHandle, label: String) -> Result<(), String> {
    webview(&app, &label)?
        .hide()
        .map_err(|error| {
            eprintln!("[studio_webview_hide] {label} err: {error}");
            error.to_string()
        })
}

#[tauri::command]
pub fn studio_webview_destroy(app: AppHandle, label: String) -> Result<(), String> {
    eprintln!("[studio_webview_destroy] label={label}");
    match app.get_webview(&label) {
        Some(webview) => webview.close().map_err(|error| {
            eprintln!("[studio_webview_destroy] {label} err: {error}");
            error.to_string()
        }),
        None => Ok(()),
    }
}

#[tauri::command]
pub fn studio_webview_navigate(app: AppHandle, label: String, url: String) -> Result<(), String> {
    eprintln!("[studio_webview_navigate] label={label} url={url}");
    webview(&app, &label)?
        .navigate(external_url(&url)?)
        .map_err(|error| {
            eprintln!("[studio_webview_navigate] {label} err: {error}");
            error.to_string()
        })
}

/// Scroll a promoted child webview by an in-page pixel delta. The native child
/// webview is a separate OS webview NOT in the host DOM, so a synthesized
/// `WheelEvent` from the hand pointer-synth can never reach it — the only way in
/// is to run script inside it. `dx`/`dy` are logical (CSS) pixels, matching the
/// `window.scrollBy` contract the caller batches per animation frame. Non-finite
/// deltas are rejected so a landmark pop can't inject `NaN` into the page.
#[tauri::command]
pub fn studio_webview_scroll(
    app: AppHandle,
    label: String,
    dx: f64,
    dy: f64,
) -> Result<(), String> {
    if !dx.is_finite() || !dy.is_finite() {
        return Err("scroll deltas must be finite".to_string());
    }
    webview(&app, &label)?
        .eval(format!("window.scrollBy({dx}, {dy});"))
        .map_err(|error| error.to_string())
}
