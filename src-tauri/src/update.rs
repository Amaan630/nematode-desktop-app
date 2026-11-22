//! Auto-update from GitHub Releases: checks at launch, daily, and on release hints; installs a signed update,
//! and relaunches with the previous summon state.
use std::{time::{Duration, Instant}, sync::{mpsc, OnceLock}};
use tauri::AppHandle;
use tauri_plugin_updater::UpdaterExt;

use crate::{presence, store};

static WAKE: OnceLock<mpsc::SyncSender<()>> = OnceLock::new();

pub fn spawn(app: AppHandle) {
    let (sender, receiver) = mpsc::sync_channel(1);
    let _ = WAKE.set(sender);
    std::thread::spawn(move || loop {
        let checked = Instant::now();
        let delay = match tauri::async_runtime::block_on(check(&app)) {
            Ok(()) => Duration::from_secs(24 * 60 * 60),
            Err(e) => { eprintln!("update check failed: {e}"); Duration::from_secs(60) }
        };
        if receiver.recv_timeout(delay).is_ok() {
            // Coalesce hints and rate-limit checks; the signed updater remains the authority.
            std::thread::sleep(Duration::from_secs(60).saturating_sub(checked.elapsed()));
            while receiver.try_recv().is_ok() {}
        }
    });
}

#[tauri::command]
pub fn request_update(app: AppHandle, version: String) {
    if crate::desktop_dev() || version == app.package_info().version.to_string() { return; }
    if let Some(sender) = WAKE.get() { let _ = sender.try_send(()); }
}

async fn check(app: &AppHandle) -> tauri_plugin_updater::Result<()> {
    let Some(update) = app.updater()?.check().await? else { return Ok(()) };
    let bytes = update.download(|_, _| {}, || {}).await?;
    let path = store::path(app, "update-summoned");
    if let Some(parent) = path.parent() { std::fs::create_dir_all(parent)?; }
    // Windows exits inside install(), so save the state before handing off to its installer.
    std::fs::write(&path, if presence::is_summoned() { "true" } else { "false" })?;
    if let Err(error) = update.install(bytes) {
        let _ = std::fs::remove_file(&path);
        return Err(error);
    }
    app.restart();
}

/// Only an updater restart restores summoning; ordinary launches keep their usual behavior.
pub fn restore_summoned(app: &AppHandle) -> bool {
    take_summoned(&store::path(app, "update-summoned"))
}

fn take_summoned(path: &std::path::Path) -> bool {
    let summoned = std::fs::read_to_string(path).ok().as_deref() == Some("true");
    std::fs::remove_file(path).is_ok() && summoned
}

#[cfg(test)]
mod tests {
    #[test]
    fn update_summon_state_is_consumed_once() {
        let path = std::env::temp_dir().join(format!("nematode-update-summoned-{}", std::process::id()));
        for (value, expected) in [("true", true), ("false", false)] {
            std::fs::write(&path, value).unwrap();
            assert_eq!(super::take_summoned(&path), expected);
            assert!(!super::take_summoned(&path));
        }
    }
}
