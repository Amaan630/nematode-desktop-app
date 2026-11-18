#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
#[cfg(target_os = "macos")]
mod mac;
#[cfg(windows)]
mod win;

use std::{sync::Mutex, time::Duration};
use tauri::{
    image::Image,
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    AppHandle, LogicalPosition, LogicalSize, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder,
};

type Rect = (f64, f64, f64, f64); // logical x, y, w, h

struct State {
    screen: Rect,              // monitor the overlay currently covers
    sent: Option<(f64, f64)>,  // last spot told to the overlay; None = he's away
    focus_pid: i32,            // app to hand focus back to after a throw
}
static STATE: Mutex<State> = Mutex::new(State { screen: (0.0, 0.0, 0.0, 0.0), sent: None, focus_pid: 0 });

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![cursor, set_grabbable, release, status, request_accessibility, close_setup])
        .setup(|app| {
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory); // no dock icon
            let win = app.get_webview_window("main").unwrap();
            win.set_ignore_cursor_events(true)?;
            #[cfg(target_os = "macos")]
            mac::float_above_menu_bar(win.ns_window()?);
            let screen = monitor_at(&win, 0.0, 0.0);
            place(&win, screen);
            STATE.lock().unwrap().screen = screen;
            win.show()?;

            let quit = MenuItem::with_id(app, "quit", "Quit Nematode", true, None::<&str>)?;
            TrayIconBuilder::new()
                .icon(Image::from_bytes(include_bytes!("../icons/tray.png"))?)
                .tooltip("Nematode")
                .menu(&Menu::with_items(app, &[&quit])?)
                .on_menu_event(|app, e| if e.id == "quit" { app.exit(0) })
                .build(app)?;

            #[cfg(target_os = "macos")]
            if !mac::trusted(false) {
                setup_window(app.handle());
            }

            std::thread::spawn(move || loop {
                std::thread::sleep(Duration::from_millis(250));
                if let Some(spot) = locate() {
                    push(&win, spot);
                }
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error running Nematode");
}

/// Where the active claude.ai tab is. Some(None) = not on Claude (he leaves). None = can't tell, change nothing.
#[cfg(target_os = "macos")]
fn locate() -> Option<Option<(f64, f64)>> {
    let (pid, bundle) = mac::frontmost();
    if pid == std::process::id() as i32 {
        return None; // you're holding him or using setup: stay put
    }
    if !bundle.starts_with("com.google.Chrome") {
        return Some(None);
    }
    let scan = mac::scan(pid);
    if !on_claude(scan.address) {
        return Some(None);
    }
    scan.tab.map(|(x, y, w, h)| Some((x + w / 2.0, y + h - 2.0))) // stand on the tab's bottom edge
}

#[cfg(windows)]
fn locate() -> Option<Option<(f64, f64)>> {
    let (hwnd, pid, exe) = win::foreground();
    if pid == std::process::id() {
        return None; // you're holding him: stay put
    }
    if exe != "chrome.exe" {
        return Some(None);
    }
    let scan = win::scan(hwnd);
    if !on_claude(scan.address) {
        return Some(None);
    }
    scan.tab.map(|(x, y, w, h)| Some((x + w / 2.0, y + h - 2.0))) // stand on the tab's bottom edge
}

#[cfg(not(any(target_os = "macos", windows)))]
fn locate() -> Option<Option<(f64, f64)>> {
    None
}

#[cfg(any(target_os = "macos", windows))]
fn on_claude(address: Option<String>) -> bool {
    let address = address.unwrap_or_default().to_lowercase();
    let host = address.trim_start_matches("https://").trim_start_matches("http://").trim_start_matches("www.");
    host.starts_with("claude.ai")
}

fn push(win: &WebviewWindow, spot: Option<(f64, f64)>) {
    let mut s = STATE.lock().unwrap();
    if spot == s.sent {
        return;
    }
    s.sent = spot;
    let js = match spot {
        Some((x, y)) => {
            let r = monitor_at(win, x, y);
            let reset = r != s.screen;
            if reset {
                place(win, r);
                s.screen = r;
            }
            format!("nema({{reset:{reset},show:true,x:{},y:{}}})", x - r.0, y - r.1)
        }
        None => "nema({show:false})".into(),
    };
    drop(s);
    let _ = win.eval(&js);
}

fn monitor_at(win: &WebviewWindow, x: f64, y: f64) -> Rect {
    let rect = |m: &tauri::Monitor| {
        let (p, z) = (m.position().to_logical::<f64>(m.scale_factor()), m.size().to_logical::<f64>(m.scale_factor()));
        (p.x, p.y, z.width, z.height)
    };
    let all: Vec<Rect> = win.available_monitors().unwrap_or_default().iter().map(rect).collect();
    all.iter()
        .copied()
        .find(|r| x >= r.0 && x < r.0 + r.2 && y >= r.1 && y < r.1 + r.3)
        .or_else(|| win.primary_monitor().ok().flatten().map(|m| rect(&m)))
        .unwrap_or((0.0, 0.0, 1440.0, 900.0))
}

fn place(win: &WebviewWindow, r: Rect) {
    let _ = win.set_position(LogicalPosition::new(r.0, r.1));
    let _ = win.set_size(LogicalSize::new(r.2, r.3));
}

// --- Grabbing: the overlay asks for the cursor each frame and takes the mouse only while it's over him.

#[tauri::command]
fn cursor(app: AppHandle) -> (f64, f64) {
    let p = app.cursor_position().unwrap_or_default();
    let scale = app.primary_monitor().ok().flatten().map(|m| m.scale_factor()).unwrap_or(1.0);
    let s = STATE.lock().unwrap().screen;
    (p.x / scale - s.0, p.y / scale - s.1)
}

#[tauri::command]
fn set_grabbable(app: AppHandle, on: bool) {
    #[cfg(target_os = "macos")]
    if on {
        let (pid, _) = mac::frontmost();
        if pid != std::process::id() as i32 {
            STATE.lock().unwrap().focus_pid = pid; // remember Chrome before a click activates us
        }
    }
    #[cfg(windows)]
    if on {
        win::remember();
    }
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.set_ignore_cursor_events(!on);
    }
}

#[tauri::command]
fn release() {
    #[cfg(target_os = "macos")]
    {
        let pid = STATE.lock().unwrap().focus_pid;
        if pid > 0 {
            mac::activate(pid);
        }
    }
    #[cfg(windows)]
    win::restore();
}

// --- Setup: one permission, shown only while it's missing.

fn setup_window(app: &AppHandle) {
    let b = WebviewWindowBuilder::new(app, "setup", WebviewUrl::App("setup.html".into()))
        .title("Nematode")
        .inner_size(340.0, 300.0)
        .resizable(false)
        .minimizable(false)
        .maximizable(false)
        .center();
    #[cfg(target_os = "macos")]
    let b = b.title_bar_style(tauri::TitleBarStyle::Overlay).hidden_title(true);
    if let Ok(w) = b.build() {
        let _ = w.set_focus();
    }
}

#[tauri::command]
fn status() -> bool {
    #[cfg(target_os = "macos")]
    return mac::trusted(false);
    #[cfg(not(target_os = "macos"))]
    true
}

/// First ask shows macOS's own prompt; after that, jump straight to the right Settings pane.
#[tauri::command]
fn request_accessibility(settings: bool) {
    #[cfg(target_os = "macos")]
    if settings {
        let _ = std::process::Command::new("open")
            .arg("x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility")
            .spawn();
    } else {
        mac::trusted(true);
    }
}

#[tauri::command]
fn close_setup(app: AppHandle) {
    if let Some(w) = app.get_webview_window("setup") {
        let _ = w.close();
    }
}
