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
/// `window.scrollBy` contract the caller batches per animation frame. `x`/`y`
/// are the widget-content-relative logical pixel point under the reticle: we
/// hit-test the element there and scroll its NEAREST SCROLLABLE ANCESTOR, so a
/// page whose real scroll container is a custom `overflow:auto` div (not the
/// document) still scrolls, falling back to `window.scrollBy` when nothing under
/// the point is scrollable. Non-finite values are rejected so a landmark pop
/// can't inject `NaN` into the page.
#[tauri::command]
pub fn studio_webview_scroll(
    app: AppHandle,
    label: String,
    dx: f64,
    dy: f64,
    x: Option<f64>,
    y: Option<f64>,
) -> Result<(), String> {
    if !dx.is_finite() || !dy.is_finite() {
        return Err("scroll deltas must be finite".to_string());
    }
    // Point defaults to (0,0) when the caller has none; the ancestor walk then
    // just resolves the document scroller, i.e. the old window.scrollBy behavior.
    let px = x.filter(|v| v.is_finite()).unwrap_or(0.0);
    let py = y.filter(|v| v.is_finite()).unwrap_or(0.0);
    // Find the nearest scrollable ancestor of elementFromPoint and scroll IT;
    // fall back to the window so a document-scrolled page still works. The IIFE
    // keeps every symbol scoped so repeated evals never clash in the page.
    let script = format!(
        "(function(){{\
           var el=document.elementFromPoint({px},{py});\
           var canScroll=function(n){{\
             if(!(n instanceof Element))return false;\
             var s=getComputedStyle(n);\
             var oy=s.overflowY;\
             return (oy==='auto'||oy==='scroll'||oy==='overlay')&&n.scrollHeight>n.clientHeight;\
           }};\
           var node=el;\
           while(node&&node!==document.body&&node!==document.documentElement){{\
             if(canScroll(node)){{node.scrollBy({dx},{dy});return;}}\
             node=node.parentElement;\
           }}\
           window.scrollBy({dx},{dy});\
         }})();"
    );
    webview(&app, &label)?
        .eval(script)
        .map_err(|error| error.to_string())
}

/// Synthesize a click inside a promoted child webview at a widget-content-relative
/// logical pixel point. Mirrors `studio_webview_scroll`: the OS child webview is
/// not in the host DOM, so the hand pointer-synth's DOM click never reaches it —
/// the only way in is to run script inside it. We hit-test `elementFromPoint`,
/// focus it if focusable, and dispatch a full pointerdown/mousedown/pointerup/
/// mouseup/click sequence so both pointer- and mouse-event handlers fire.
///
/// LIMITATION: events dispatched via `dispatchEvent` from script are
/// `isTrusted:false`. Most app handlers (React onClick, link navigation via a
/// click handler, buttons) respond fine, but some native/default behaviors that
/// require a trusted gesture — e.g. starting media playback, opening a file
/// picker, or a raw `<a href>` default navigation triggered purely by trust —
/// may not fire. `x`/`y` are logical (CSS) pixels. Non-finite values are
/// rejected so a landmark pop can't inject `NaN`.
#[tauri::command]
pub fn studio_webview_click(
    app: AppHandle,
    label: String,
    x: f64,
    y: f64,
) -> Result<(), String> {
    if !x.is_finite() || !y.is_finite() {
        return Err("click coordinates must be finite".to_string());
    }
    // One IIFE, all symbols scoped. Dispatch the full sequence on the hit element
    // (and focus it if focusable) so pointer- and mouse-event consumers both see
    // it. Events are isTrusted:false (see the doc-comment limitation above).
    let script = format!(
        "(function(){{\
           var el=document.elementFromPoint({x},{y});\
           if(!el)return;\
           if(typeof el.focus==='function'){{try{{el.focus();}}catch(e){{}}}}\
           var opts={{bubbles:true,cancelable:true,composed:true,clientX:{x},clientY:{y},button:0}};\
           var seq=['pointerdown','mousedown','pointerup','mouseup','click'];\
           for(var i=0;i<seq.length;i++){{\
             var type=seq[i];\
             var Ctor=type.indexOf('pointer')===0?window.PointerEvent:window.MouseEvent;\
             var ev;\
             try{{ev=new Ctor(type,opts);}}catch(e){{ev=new MouseEvent(type,opts);}}\
             el.dispatchEvent(ev);\
           }}\
         }})();"
    );
    webview(&app, &label)?
        .eval(script)
        .map_err(|error| error.to_string())
}
