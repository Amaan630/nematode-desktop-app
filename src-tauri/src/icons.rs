//! The app's icon, picked in the menu bar. On macOS it changes Finder/Launchpad and the Dock;
//! on Windows the Start menu, desktop and taskbar shortcuts. (The menu bar / tray icon is the character's.)
//! "Soft Pink" (the default) shows whichever character is active; its artwork comes from characters.rs.
//! To add a fixed icon: render it in scripts/icon.html (?v=<id>), add <id> to scripts/icons.sh, add a row below.
use tauri::AppHandle;

use crate::{characters, picker::{Choice, Picker}};
#[cfg(windows)]
use crate::{store, win};

/// Each fixed icon's menu preview, full-size PNG and Windows .ico, all from icons/variants/<id>*.
/// Soft Pink comes first, so it's the default.
macro_rules! icons {
    ($(($id:literal, $label:literal)),* $(,)?) => {
        pub static PICKER: Picker = Picker::new("icon", "App Icon",
            &[crate::choice!("variants", "soft", "Soft Pink"), $(crate::choice!("variants", $id, $label)),*]);

        #[cfg_attr(not(target_os = "macos"), allow(dead_code))]
        fn png(id: &str) -> &'static [u8] {
            match id { $($id => include_bytes!(concat!("../icons/variants/", $id, ".png")),)* _ => &[] }
        }

        #[cfg(windows)]
        fn ico(id: &str) -> &'static [u8] {
            match id { $($id => include_bytes!(concat!("../icons/variants/", $id, ".ico")),)* _ => &[] }
        }
    };
}

icons![
    ("pinkblue", "Pink & Blue"),
    ("acid", "Acid"),
    ("halftone", "Halftone"),
    ("purple", "Purple"),
];

/// What's baked into the app bundle: Soft Pink with the default character. Anything else is applied on top.
const BUNDLED: &str = "soft-nematode";

/// Switches to `choice` everywhere this platform shows the icon. Re-run at launch (updates replace the app and
/// its shortcuts with the bundled icon) and whenever the character changes (Soft Pink shows the active one).
pub fn apply(app: &AppHandle, choice: &'static Choice) {
    PICKER.select(app, choice);
    let soft = choice.id == "soft";
    let character = characters::current().id;
    let art = if soft { format!("soft-{character}") } else { choice.id.to_string() };
    if soft {
        PICKER.set_preview(choice.id, characters::soft_icon(character).1); // the menu shows who's on it
    }
    let custom = art != BUNDLED;
    #[cfg(target_os = "macos")]
    {
        let png = if soft { characters::soft_icon(character).0 } else { png(choice.id) };
        crate::mac::set_app_icon(custom.then_some(png)); // Finder/Launchpad; the bundled one drops the override
        crate::mac::set_dock_icon(&art);                 // drawn by our Dock tile plugin
    }
    #[cfg(windows)]
    {
        let ico = if soft { characters::soft_ico(character) } else { ico(choice.id) };
        // Each icon gets its own file, so Windows' icon cache can't show a stale one.
        let file = custom.then(|| store::path(app, &format!("icon-{art}.ico")));
        let file = file.filter(|p| std::fs::write(p, ico).is_ok());
        win::set_shortcut_icons(file.as_deref());
    }
    #[cfg(not(any(target_os = "macos", windows)))]
    let _ = (app, custom);
}
