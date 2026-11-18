//! Who's on screen. Each character is drawn and animated by src/characters/<id>.js; this is the menu side.
//! To add one: write src/characters/<id>.js, load it in src/index.html, run `npm run icons` (renders its
//! menu preview and menu bar icon), and add a row below.
use std::sync::Mutex;
use tauri::{image::Image, AppHandle, Manager};

use crate::{menu, picker::{Choice, Picker}, presence};

/// Each character's menu preview and menu bar icon, from icons/characters/<id>-{menu,tray}.png.
macro_rules! characters {
    ($(($id:literal, $label:literal)),* $(,)?) => {
        pub static PICKER: Picker = Picker::new("character", "Character", &[$(crate::choice!("characters", $id, $label)),*]);

        /// The menu bar icon for a character.
        pub fn tray_icon(id: &str) -> &'static [u8] {
            match id { $($id => include_bytes!(concat!("../icons/characters/", $id, "-tray.png")),)* _ => &[] }
        }
    };
}

characters![
    ("nematode", "Nematode"), // the default
    ("croissant", "Croissant"),
];

static CURRENT: Mutex<Option<&'static Choice>> = Mutex::new(None);

pub fn current() -> &'static Choice {
    CURRENT.lock().unwrap().unwrap_or(PICKER.default())
}

/// Swaps who's out: remembers it, ticks it, renames Summon/Dismiss, swaps the menu bar icon,
/// and tells the overlay.
pub fn apply(app: &AppHandle, choice: &'static Choice) {
    PICKER.select(app, choice);
    *CURRENT.lock().unwrap() = Some(choice);
    presence::refresh_menu();
    if let (Some(tray), Ok(icon)) = (app.tray_by_id(menu::TRAY), Image::from_bytes(tray_icon(choice.id))) {
        let _ = tray.set_icon(Some(icon));
    }
    if let Some(w) = app.get_webview_window(presence::OVERLAY) {
        let _ = w.eval(&format!("setCharacter('{}')", choice.id));
    }
}

/// Asked by the overlay when it loads.
#[tauri::command]
pub fn get_character() -> String {
    current().id.to_string()
}
