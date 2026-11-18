//! Open at Login: on by default the first time, then whatever you choose in the menu.
use tauri::AppHandle;
use tauri_plugin_autostart::ManagerExt;

use crate::store;

pub fn default_on(app: &AppHandle) {
    if store::read(app, "login-default-set").is_none() {
        let _ = app.autolaunch().enable();
        store::write(app, "login-default-set", "");
    }
}

pub fn enabled(app: &AppHandle) -> bool {
    app.autolaunch().is_enabled().unwrap_or(false)
}

/// Flips it and returns the new state.
pub fn toggle(app: &AppHandle) -> bool {
    let a = app.autolaunch();
    let on = !enabled(app);
    let _ = if on { a.enable() } else { a.disable() };
    enabled(app)
}
