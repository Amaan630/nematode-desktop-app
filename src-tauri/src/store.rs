//! Small text files in the app's data folder that remember choices between launches.
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

pub fn path(app: &AppHandle, name: &str) -> PathBuf {
    app.path().app_data_dir().unwrap_or_default().join(name)
}

pub fn read(app: &AppHandle, name: &str) -> Option<String> {
    std::fs::read_to_string(path(app, name)).ok()
}

pub fn write(app: &AppHandle, name: &str, value: &str) {
    let p = path(app, name);
    let _ = std::fs::create_dir_all(p.parent().unwrap_or(&p));
    let _ = std::fs::write(p, value);
}
