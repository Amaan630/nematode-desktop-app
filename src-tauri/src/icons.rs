//! The app's icon, picked in the menu bar. On macOS it changes Finder/Launchpad and the Dock;
//! on Windows the Start menu, desktop and taskbar shortcuts. (The menu bar / tray icon is the character's.)
//! To add a fixed icon: render it in scripts/icon.html (?v=<id>), add <id> to scripts/icons.sh, add a row below.
use tauri::AppHandle;

use crate::picker::{Choice, Picker};
#[cfg(windows)]
use crate::{store, win};

/// Each fixed icon's menu preview, full-size PNG and Windows .ico, all from icons/variants/<id>*.
/// The first row is the default and is baked into the app bundle.
macro_rules! icons {
    ($(($id:literal, $label:literal)),* $(,)?) => {
        pub static PICKER: Picker = Picker::new("icon", "App Icon",
            &[$(crate::choice!("variants", $id, $label)),*]);

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
    ("soft", "Soft Pink"), // the default (Croissant on the site's pink)
    ("pinkblue", "Pink & Blue"),
    ("acid", "Acid"),
    ("halftone", "Halftone"),
    ("purple", "Purple"),
];

/// Switches to `choice` everywhere this platform shows the icon. Re-run at launch (updates replace the app and
/// its shortcuts with the bundled icon).
pub fn apply(app: &AppHandle, choice: &'static Choice) {
    PICKER.select(app, choice);
    let custom = choice.id != PICKER.default().id;
    #[cfg(target_os = "macos")]
    {
        crate::mac::set_app_icon(custom.then(|| png(choice.id))); // Finder/Launchpad; the bundled one drops the override
        crate::mac::set_dock_icon(choice.id); // drawn by our Dock tile plugin
    }
    #[cfg(windows)]
    {
        // Each icon gets its own file, so Windows' icon cache can't show a stale one.
        let file = custom.then(|| store::path(app, &format!("icon-{}.ico", choice.id)));
        let file = file.filter(|p| std::fs::write(p, ico(choice.id)).is_ok());
        win::set_shortcut_icons(file.as_deref());
    }
    #[cfg(not(any(target_os = "macos", windows)))]
    let _ = (app, custom);
}
