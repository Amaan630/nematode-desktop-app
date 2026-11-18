//! Auto-update from GitHub Releases: checks at launch and once a day, installs a signed update,
//! and relaunches once he's off screen.
use std::time::Duration;
use tauri::AppHandle;
use tauri_plugin_updater::UpdaterExt;

use crate::presence;

pub fn spawn(app: AppHandle) {
    std::thread::spawn(move || loop {
        if let Err(e) = tauri::async_runtime::block_on(check(&app)) {
            eprintln!("update check failed: {e}");
        }
        std::thread::sleep(Duration::from_secs(24 * 60 * 60));
    });
}

async fn check(app: &AppHandle) -> tauri_plugin_updater::Result<()> {
    let Some(update) = app.updater()?.check().await? else { return Ok(()) };
    update.download_and_install(|_, _| {}, || {}).await?;
    while !presence::is_away() {
        std::thread::sleep(Duration::from_secs(30)); // don't yank him off screen mid-stomp
    }
    app.restart();
}
