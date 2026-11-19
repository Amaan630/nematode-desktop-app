//! Hats are drawn by src/hats.js and attached to each character's actual head pose.
use std::sync::Mutex;
use tauri::{AppHandle, Manager};
use crate::{picker::{Choice, Picker}, presence};
pub static PICKER: Picker = Picker::new("hat", "Hat", &[
    Choice { id: "none", label: "No hat", preview: &[] },
    crate::choice!("hats", "beret", "Pink beret"),
    crate::choice!("hats", "cap", "Blue baseball cap"),
    crate::choice!("hats", "beanie", "Cloud beanie"),
    crate::choice!("hats", "sunhat", "Ribbon sun hat"),
]);
static CURRENT: Mutex<&str> = Mutex::new("none");
pub fn apply(app: &AppHandle, choice: &'static Choice) {
    PICKER.select(app, choice);
    *CURRENT.lock().unwrap() = choice.id;
    if let Some(w) = app.get_webview_window(presence::OVERLAY) {
        let _ = w.eval(&format!("setHat('{}')", choice.id));
    }
}
#[tauri::command]
pub fn get_hat() -> String { CURRENT.lock().unwrap().to_string() }
