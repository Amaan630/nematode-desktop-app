//! The setup window: one permission (macOS Accessibility), shown only while it's missing.
use tauri::{AppHandle, Manager};
#[cfg(target_os = "macos")]
use tauri::{WebviewUrl, WebviewWindowBuilder};

const WINDOW: &str = "setup";

#[cfg(target_os = "macos")]
pub fn show_if_needed(app: &AppHandle) {
    if crate::mac::trusted(false) {
        return;
    }
    let b = WebviewWindowBuilder::new(app, WINDOW, WebviewUrl::App("setup.html".into()))
        .title("Nematode")
        .inner_size(340.0, 300.0)
        .resizable(false)
        .minimizable(false)
        .maximizable(false)
        .center()
        .title_bar_style(tauri::TitleBarStyle::Overlay)
        .hidden_title(true);
    if let Ok(w) = b.build() {
        let _ = w.set_focus();
    }
}

#[cfg(not(target_os = "macos"))]
pub fn show_if_needed(_: &AppHandle) {} // nothing to grant on Windows

#[tauri::command]
pub fn status() -> bool {
    #[cfg(target_os = "macos")]
    return crate::mac::trusted(false);
    #[cfg(not(target_os = "macos"))]
    true
}

/// First ask shows macOS's own prompt; after that, jump straight to the right Settings pane.
#[tauri::command]
pub fn request_accessibility(settings: bool) {
    #[cfg(target_os = "macos")]
    if settings {
        let _ = std::process::Command::new("open")
            .arg("x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility")
            .spawn();
    } else {
        crate::mac::trusted(true);
    }
    #[cfg(not(target_os = "macos"))]
    let _ = settings;
}

#[tauri::command]
pub fn close_setup(app: AppHandle) {
    if let Some(w) = app.get_webview_window(WINDOW) {
        let _ = w.close();
    }
}
