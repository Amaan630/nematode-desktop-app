#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
//! Nematode: a desktop buddy who walks over to your Claude tab. The character itself lives in src/ (web);
//! this is the native side. Each module has one job; startup order is below.

mod activity;  // unlocked / recently active, for received gestures
mod autostart;  // Open at Login
mod characters; // Character menu: who's on screen
#[cfg(any(windows, test))]
mod fullscreen; // hide the Windows overlay while a foreground app is fullscreen
mod grab;       // taking the mouse while you hold him, handing focus back after
mod hats;       // a remembered hat for either character
mod icons;      // App Icon menu: Finder/Dock on macOS, tray/shortcuts on Windows
mod locate;     // finding the active claude.ai tab
mod menu;       // the menu-bar / tray menu
mod picker;     // shared: a remembered-choice submenu with previews
mod presence;   // Away / On your tab / Summoned, and the overlay window
mod screen;     // monitor geometry
mod setup;      // the one-time permission window
mod store;      // remembered choices on disk
mod update;     // auto-update from GitHub Releases
#[cfg(target_os = "macos")]
mod mac;
#[cfg(windows)]
mod win;

pub fn desktop_dev() -> bool { cfg!(all(debug_assertions, feature = "desktop-dev")) }

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_autostart::init(tauri_plugin_autostart::MacosLauncher::LaunchAgent, None))
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            activity::user_active,
            update::request_update,
            presence::summon_for_together,
            presence::overlay_ready,
            grab::cursor,
            grab::set_grabbable,
            grab::release,
            characters::get_character,
            characters::set_character_preview,
            hats::get_hat,
            setup::status,
            setup::request_accessibility,
            setup::close_setup,
        ])
        .setup(|app| {
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory); // menu bar only, no Dock icon
            let overlay = presence::init(app)?;
            if !desktop_dev() { autostart::default_on(app.handle()); }
            menu::build(app)?;
            // Re-apply saved choices (updates replace the app, and its icon, with the defaults).
            characters::apply(app.handle(), characters::PICKER.saved(app.handle()));
            hats::apply(app.handle(), hats::PICKER.saved(app.handle()));
            if !desktop_dev() { icons::apply(app.handle(), icons::PICKER.saved(app.handle())); }
            setup::show_if_needed(app.handle());
            if desktop_dev() { presence::toggle_summon(app.handle()); }
            else { update::spawn(app.handle().clone()); }
            presence::spawn(overlay);
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error running Nematode");
}
