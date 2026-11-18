//! Who's on screen. Each character is drawn and animated by src/characters/<id>.js; this is the menu side.
//! To add one: write src/characters/<id>.js, load it in src/index.html, run `npm run icons` (renders its
//! menu preview, menu bar icon and Soft Pink app icon), and add a row below.
use std::sync::Mutex;
use tauri::{image::Image, AppHandle, Manager};

use crate::{icons, menu, picker::{Choice, Picker}, presence};

/// Each character's menu preview and menu bar icon (icons/characters/<id>-{menu,tray}.png) and its
/// Soft Pink app icon (icons/variants/soft-<id>.{png,ico} and -menu.png).
macro_rules! characters {
    ($(($id:literal, $label:literal)),* $(,)?) => {
        pub static PICKER: Picker = Picker::new("character", "Character", &[$(crate::choice!("characters", $id, $label)),*]);

        /// The menu bar icon for a character.
        pub fn tray_icon(id: &str) -> &'static [u8] {
            match id { $($id => include_bytes!(concat!("../icons/characters/", $id, "-tray.png")),)* _ => &[] }
        }

        /// The Soft Pink app icon with this character on it: (full-size PNG, menu preview).
        pub fn soft_icon(id: &str) -> (&'static [u8], &'static [u8]) {
            match id {
                $($id => (include_bytes!(concat!("../icons/variants/soft-", $id, ".png")),
                          include_bytes!(concat!("../icons/variants/soft-", $id, "-menu.png"))),)*
                _ => (&[], &[]),
            }
        }

        #[cfg(windows)]
        pub fn soft_ico(id: &str) -> &'static [u8] {
            match id { $($id => include_bytes!(concat!("../icons/variants/soft-", $id, ".ico")),)* _ => &[] }
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

/// Swaps who's out: remembers it, ticks it, renames Summon/Dismiss, swaps the menu bar icon, re-applies the
/// app icon (Soft Pink shows the active character), and tells the overlay.
pub fn apply(app: &AppHandle, choice: &'static Choice) {
    PICKER.select(app, choice);
    *CURRENT.lock().unwrap() = Some(choice);
    presence::refresh_menu();
    if let (Some(tray), Ok(icon)) = (app.tray_by_id(menu::TRAY), Image::from_bytes(tray_icon(choice.id))) {
        let _ = tray.set_icon(Some(icon));
    }
    icons::apply(app, icons::PICKER.saved(app));
    if let Some(w) = app.get_webview_window(presence::OVERLAY) {
        let _ = w.eval(&format!("setCharacter('{}')", choice.id));
    }
}

/// Asked by the overlay when it loads.
#[tauri::command]
pub fn get_character() -> String {
    current().id.to_string()
}
