//! The menu-bar (macOS) / system-tray (Windows) menu, and where its clicks go.
use tauri::{
    image::Image,
    menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem},
    tray::TrayIconBuilder,
    App,
};

use crate::{autostart, characters, icons, presence};

pub const TRAY: &str = "tray";

pub fn build(app: &App) -> tauri::Result<()> {
    let handle = app.handle();
    let summon = MenuItem::with_id(app, "summon", "Summon", true, None::<&str>)?;
    let characters_menu = characters::PICKER.submenu(handle)?;
    let icons_menu = icons::PICKER.submenu(handle)?;
    let login = CheckMenuItem::with_id(app, "login", "Open at Login", true, autostart::enabled(handle), None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit Nematode", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[
        &summon,
        &PredefinedMenuItem::separator(app)?,
        &characters_menu,
        &icons_menu,
        &login,
        &PredefinedMenuItem::separator(app)?,
        &quit,
    ])?;
    presence::set_summon_item(summon);

    TrayIconBuilder::with_id(TRAY)
        .icon(Image::from_bytes(characters::tray_icon(characters::PICKER.default().id))?) // then the saved character's
        .tooltip("Nematode")
        .menu(&menu)
        .show_menu_on_left_click(true)
        .on_menu_event(move |app, e| {
            let id = e.id.as_ref();
            match id {
                "summon" => presence::toggle_summon(app),
                "login" => { let _ = login.set_checked(autostart::toggle(app)); }
                "quit" => app.exit(0),
                _ => {
                    if let Some(c) = characters::PICKER.from_event(id) {
                        characters::apply(app, c);
                    } else if let Some(c) = icons::PICKER.from_event(id) {
                        icons::apply(app, c);
                    }
                }
            }
        })
        .build(app)?;
    Ok(())
}
