//! Grabbing: the overlay ignores the mouse so clicks reach your apps. It asks for the cursor each frame
//! and takes the mouse only while the cursor is over him; after a throw, focus goes back where it was.
use tauri::{AppHandle, Manager};

use crate::presence;

#[tauri::command]
pub fn cursor(app: AppHandle) -> (f64, f64) {
    let p = app.cursor_position().unwrap_or_default();
    let scale = app.primary_monitor().ok().flatten().map(|m| m.scale_factor()).unwrap_or(1.0);
    let s = presence::screen();
    (p.x / scale - s.0, p.y / scale - s.1)
}

#[cfg(target_os = "macos")]
static FOCUS_PID: std::sync::atomic::AtomicI32 = std::sync::atomic::AtomicI32::new(0);

#[tauri::command]
pub fn set_grabbable(app: AppHandle, on: bool) {
    if on {
        #[cfg(target_os = "macos")]
        {
            let (pid, _) = crate::mac::frontmost();
            if pid != std::process::id() as i32 {
                FOCUS_PID.store(pid, std::sync::atomic::Ordering::Relaxed); // before a click activates us
            }
        }
        #[cfg(windows)]
        crate::win::remember();
    }
    if let Some(w) = app.get_webview_window(presence::OVERLAY) {
        let _ = w.set_ignore_cursor_events(!on);
    }
}

#[tauri::command]
pub fn release() {
    #[cfg(target_os = "macos")]
    {
        let pid = FOCUS_PID.load(std::sync::atomic::Ordering::Relaxed);
        if pid > 0 {
            crate::mac::activate(pid);
        }
    }
    #[cfg(windows)]
    crate::win::restore();
}
