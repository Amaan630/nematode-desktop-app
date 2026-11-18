#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
#[cfg(target_os = "macos")]
mod mac;
#[cfg(windows)]
mod win;

use std::{sync::Mutex, sync::OnceLock, time::Duration};
use tauri::{
    image::Image,
    menu::{CheckMenuItem, IconMenuItem, Menu, MenuItem, PredefinedMenuItem, Submenu},
    tray::TrayIconBuilder,
    AppHandle, LogicalPosition, LogicalSize, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder, Wry,
};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt};
use tauri_plugin_updater::UpdaterExt;

type Rect = (f64, f64, f64, f64); // logical x, y, w, h

/// What he's doing. Exactly one at a time; the menu and the overlay are both derived from it.
#[derive(Clone, Copy, PartialEq)]
enum Mode {
    Away,     // off screen: "Summon" enabled
    OnTab,    // stomping on your active claude.ai tab: "Summon" grayed out
    Summoned, // out because you asked: roams, still visits your Claude tab: "Dismiss"
}

struct State {
    screen: Rect,                // monitor the overlay currently covers
    spot: Option<(f64, f64)>,    // where the active claude.ai tab is, if any
    summoned: bool,
    snoozed: bool,               // dismissed while on Claude: ignore the tab until you leave it
    sent: String,                // last message to the overlay
    focus_pid: i32,              // app to hand focus back to after a throw (macOS)
}
static STATE: Mutex<State> = Mutex::new(State {
    screen: (0.0, 0.0, 0.0, 0.0), spot: None, summoned: false, snoozed: false, sent: String::new(), focus_pid: 0,
});
static SUMMON: OnceLock<MenuItem<Wry>> = OnceLock::new();
static ICON_ITEMS: OnceLock<Vec<IconMenuItem<Wry>>> = OnceLock::new();

/// Switchable app icons: id, menu label, the icon itself, its menu preview. The first is the bundle's default.
const ICONS: [(&str, &str, &[u8], &[u8]); 4] = [
    ("pinkblue", "Pink & Blue", include_bytes!("../icons/variants/pinkblue.png"), include_bytes!("../icons/variants/pinkblue-menu.png")),
    ("acid", "Acid", include_bytes!("../icons/variants/acid.png"), include_bytes!("../icons/variants/acid-menu.png")),
    ("halftone", "Halftone", include_bytes!("../icons/variants/halftone.png"), include_bytes!("../icons/variants/halftone-menu.png")),
    ("purple", "Purple", include_bytes!("../icons/variants/purple.png"), include_bytes!("../icons/variants/purple-menu.png")),
];

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, None))
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![cursor, set_grabbable, release, status, request_accessibility, close_setup])
        .setup(|app| {
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory); // no dock icon
            let win = app.get_webview_window("main").unwrap();
            win.set_ignore_cursor_events(true)?;
            #[cfg(target_os = "macos")]
            mac::float_above_menu_bar(win.ns_window()?);
            let (screen, _) = monitor_at(&win, 0.0, 0.0);
            place(&win, screen);
            STATE.lock().unwrap().screen = screen;
            win.show()?;

            // Open at Login: on by default the first time, then whatever you choose.
            let autostart = app.autolaunch();
            let first_run = app.path().app_data_dir()?.join("login-default-set");
            if !first_run.exists() {
                let _ = autostart.enable();
                let _ = std::fs::create_dir_all(first_run.parent().unwrap());
                let _ = std::fs::write(&first_run, "");
            }

            let summon = MenuItem::with_id(app, "summon", "Summon Nematode", true, None::<&str>)?;
            let login = CheckMenuItem::with_id(app, "login", "Open at Login", true, autostart.is_enabled().unwrap_or(false), None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit Nematode", true, None::<&str>)?;
            let sep = PredefinedMenuItem::separator(app)?;
            let chosen = std::fs::read_to_string(icon_choice_file(app.handle())).unwrap_or_default();
            let chosen = ICONS.iter().find(|i| i.0 == chosen).map_or(ICONS[0].0, |i| i.0);
            let mut icon_items = vec![];
            for (id, label, _, preview) in ICONS {
                icon_items.push(IconMenuItem::with_id(app, format!("icon:{id}"), label, true, Some(Image::from_bytes(preview)?), None::<&str>)?);
            }
            let refs: Vec<&dyn tauri::menu::IsMenuItem<Wry>> = icon_items.iter().map(|i| i as _).collect();
            let icons = Submenu::with_items(app, "App Icon", true, &refs)?;
            let sep2 = PredefinedMenuItem::separator(app)?;
            let menu = Menu::with_items(app, &[&summon, &sep, &icons, &login, &sep2, &quit])?;
            let _ = SUMMON.set(summon);
            let _ = ICON_ITEMS.set(icon_items);
            TrayIconBuilder::with_id("tray")
                .icon(Image::from_bytes(include_bytes!("../icons/tray.png"))?)
                .tooltip("Nematode")
                .menu(&menu)
                .show_menu_on_left_click(true)
                .on_menu_event(move |app, e| match e.id.as_ref() {
                    "summon" => toggle_summon(app),
                    "login" => {
                        let a = app.autolaunch();
                        let on = !a.is_enabled().unwrap_or(false);
                        let _ = if on { a.enable() } else { a.disable() };
                        let _ = login.set_checked(a.is_enabled().unwrap_or(on));
                    }
                    "quit" => app.exit(0),
                    id if id.starts_with("icon:") => set_icon(app, &id[5..]),
                    _ => {}
                })
                .build(app)?;

            set_icon(app.handle(), chosen); // re-applies after updates, which replace the bundle

            #[cfg(target_os = "macos")]
            if !mac::trusted(false) {
                setup_window(app.handle());
            }

            let handle = app.handle().clone();
            std::thread::spawn(move || loop {
                // Check GitHub for a newer release at launch, then once a day.
                if let Err(e) = tauri::async_runtime::block_on(update(&handle)) {
                    eprintln!("update check failed: {e}");
                }
                std::thread::sleep(Duration::from_secs(24 * 60 * 60));
            });

            std::thread::spawn(move || loop {
                std::thread::sleep(Duration::from_millis(250));
                if let Some(spot) = locate() {
                    let mut s = STATE.lock().unwrap();
                    s.spot = spot;
                    if spot.is_none() {
                        s.snoozed = false; // you left Claude: next visit brings him back
                    }
                }
                sync(&win);
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error running Nematode");
}

/// Downloads and installs a newer release if there is one, then relaunches once he's off screen.
async fn update(app: &AppHandle) -> tauri_plugin_updater::Result<()> {
    let Some(update) = app.updater()?.check().await? else { return Ok(()) };
    update.download_and_install(|_, _| {}, || {}).await?;
    while mode(&STATE.lock().unwrap()) != Mode::Away {
        std::thread::sleep(Duration::from_secs(30)); // don't yank him off screen mid-stomp
    }
    app.restart();
}

fn icon_choice_file(app: &AppHandle) -> std::path::PathBuf {
    app.path().app_data_dir().unwrap_or_default().join("icon")
}

/// Switches the app icon: on macOS in Finder/Launchpad and the Dock, on Windows the tray icon
/// (the only icon Nematode shows there). Remembers the choice and ticks it in the menu.
fn set_icon(app: &AppHandle, id: &str) {
    let Some(&(id, _, full, preview)) = ICONS.iter().find(|i| i.0 == id) else { return };
    let file = icon_choice_file(app);
    let _ = std::fs::create_dir_all(file.parent().unwrap());
    let _ = std::fs::write(file, id);
    #[cfg(target_os = "macos")]
    {
        let _ = preview;
        mac::set_app_icon((id != ICONS[0].0).then_some(full)); // Finder/Launchpad; default drops the override
        mac::set_dock_icon(id); // Dock tile, drawn by our Dock tile plugin
    }
    #[cfg(windows)]
    {
        let _ = full;
        if let (Some(tray), Ok(img)) = (app.tray_by_id("tray"), Image::from_bytes(preview)) {
            let _ = tray.set_icon(Some(img));
        }
    }
    if let Some(items) = ICON_ITEMS.get() {
        for (item, (iid, label, _, _)) in items.iter().zip(ICONS) {
            let _ = item.set_text(if iid == id { format!("{label}  ✓") } else { label.to_string() });
        }
    }
}

// Locking rule: never call into Tauri (monitors, window, menu, eval) while holding STATE.
// Those calls hop to the main thread, and the main thread may itself be waiting for STATE (menu clicks).

fn toggle_summon(app: &AppHandle) {
    let Some(win) = app.get_webview_window("main") else { return };
    let summoning = {
        let mut s = STATE.lock().unwrap();
        match mode(&s) {
            Mode::Summoned => {
                s.summoned = false;
                s.snoozed = s.spot.is_some(); // dismiss means leave, even from your Claude tab
                false
            }
            Mode::Away => {
                s.summoned = true;
                true
            }
            Mode::OnTab => return, // grayed out
        }
    };
    if summoning {
        // Come out on the screen you're looking at.
        let c = app.cursor_position().unwrap_or_default();
        let scale = app.primary_monitor().ok().flatten().map(|m| m.scale_factor()).unwrap_or(1.0);
        let (r, _) = monitor_at(&win, c.x / scale, c.y / scale);
        let moved = {
            let mut s = STATE.lock().unwrap();
            let moved = r != s.screen;
            s.screen = r;
            s.sent.clear();
            moved
        };
        if moved {
            place(&win, r);
            let _ = win.eval("nema({reset:true,mode:'away'})");
        }
    }
    sync(&win);
}

fn mode(s: &State) -> Mode {
    match (s.summoned, s.spot.is_some() && !s.snoozed) {
        (true, _) => Mode::Summoned,
        (false, true) => Mode::OnTab,
        (false, false) => Mode::Away,
    }
}

/// Tells the overlay and the menu about the current state, if it changed.
fn sync(win: &WebviewWindow) {
    let (m, spot, screen) = {
        let s = STATE.lock().unwrap();
        (mode(&s), s.spot, s.screen)
    };
    let (js, r) = match (m, spot) {
        (Mode::Away, _) => ("nema({mode:'away'})".to_string(), screen),
        (_, Some((x, y))) => {
            let (r, floor) = monitor_at(win, x, y);
            let reset = r != screen;
            (format!("nema({{reset:{reset},mode:'tab',x:{},y:{},floor:{floor}}})", x - r.0, y - r.1), r)
        }
        (_, None) => {
            let (_, floor) = monitor_at(win, screen.0 + 1.0, screen.1 + 1.0);
            (format!("nema({{mode:'free',floor:{floor}}})"), screen)
        }
    };
    {
        let mut s = STATE.lock().unwrap();
        if js == s.sent {
            return;
        }
        s.sent = js.clone();
        s.screen = r;
    }
    if r != screen {
        place(win, r);
    }
    let _ = win.eval(&js);
    if let Some(item) = SUMMON.get() {
        let _ = item.set_text(if m == Mode::Summoned { "Dismiss Nematode" } else { "Summon Nematode" });
        let _ = item.set_enabled(m != Mode::OnTab);
    }
}

/// Where the active claude.ai tab is. Some(None) = not on Claude (he leaves). None = can't tell, change nothing.
#[cfg(target_os = "macos")]
fn locate() -> Option<Option<(f64, f64)>> {
    let (pid, bundle) = mac::frontmost();
    if pid == std::process::id() as i32 {
        return None; // you're holding him or using setup: stay put
    }
    if !bundle.starts_with("com.google.Chrome") {
        return Some(None);
    }
    let scan = mac::scan(pid);
    if !on_claude(scan.address) {
        return Some(None);
    }
    scan.tab.map(|(x, y, w, h)| Some((x + w / 2.0, y + h - 2.0))) // stand on the tab's bottom edge
}

#[cfg(windows)]
fn locate() -> Option<Option<(f64, f64)>> {
    let (hwnd, pid, exe) = win::foreground();
    if pid == std::process::id() {
        return None; // you're holding him: stay put
    }
    if exe != "chrome.exe" {
        return Some(None);
    }
    let scan = win::scan(hwnd);
    if !on_claude(scan.address) {
        return Some(None);
    }
    scan.tab.map(|(x, y, w, h)| Some((x + w / 2.0, y + h - 2.0))) // stand on the tab's bottom edge
}

#[cfg(not(any(target_os = "macos", windows)))]
fn locate() -> Option<Option<(f64, f64)>> {
    None
}

#[cfg(any(target_os = "macos", windows))]
fn on_claude(address: Option<String>) -> bool {
    let address = address.unwrap_or_default().to_lowercase();
    let host = address.trim_start_matches("https://").trim_start_matches("http://").trim_start_matches("www.");
    host.starts_with("claude.ai")
}

/// The monitor containing (x, y), and the y of its usable floor (above the Dock/taskbar), relative to its top.
fn monitor_at(win: &WebviewWindow, x: f64, y: f64) -> (Rect, f64) {
    let info = |m: &tauri::Monitor| {
        let k = m.scale_factor();
        let (p, z) = (m.position().to_logical::<f64>(k), m.size().to_logical::<f64>(k));
        let w = m.work_area();
        let floor = (w.position.y as f64 + w.size.height as f64) / k - p.y;
        ((p.x, p.y, z.width, z.height), floor)
    };
    let all: Vec<(Rect, f64)> = win.available_monitors().unwrap_or_default().iter().map(info).collect();
    all.iter()
        .copied()
        .find(|(r, _)| x >= r.0 && x < r.0 + r.2 && y >= r.1 && y < r.1 + r.3)
        .or_else(|| win.primary_monitor().ok().flatten().map(|m| info(&m)))
        .unwrap_or(((0.0, 0.0, 1440.0, 900.0), 900.0))
}

fn place(win: &WebviewWindow, r: Rect) {
    let _ = win.set_position(LogicalPosition::new(r.0, r.1));
    let _ = win.set_size(LogicalSize::new(r.2, r.3));
}

// --- Grabbing: the overlay asks for the cursor each frame and takes the mouse only while it's over him.

#[tauri::command]
fn cursor(app: AppHandle) -> (f64, f64) {
    let p = app.cursor_position().unwrap_or_default();
    let scale = app.primary_monitor().ok().flatten().map(|m| m.scale_factor()).unwrap_or(1.0);
    let s = STATE.lock().unwrap().screen;
    (p.x / scale - s.0, p.y / scale - s.1)
}

#[tauri::command]
fn set_grabbable(app: AppHandle, on: bool) {
    #[cfg(target_os = "macos")]
    if on {
        let (pid, _) = mac::frontmost();
        if pid != std::process::id() as i32 {
            STATE.lock().unwrap().focus_pid = pid; // remember Chrome before a click activates us
        }
    }
    #[cfg(windows)]
    if on {
        win::remember();
    }
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.set_ignore_cursor_events(!on);
    }
}

#[tauri::command]
fn release() {
    #[cfg(target_os = "macos")]
    {
        let pid = STATE.lock().unwrap().focus_pid;
        if pid > 0 {
            mac::activate(pid);
        }
    }
    #[cfg(windows)]
    win::restore();
}

// --- Setup: one permission, shown only while it's missing.

fn setup_window(app: &AppHandle) {
    let b = WebviewWindowBuilder::new(app, "setup", WebviewUrl::App("setup.html".into()))
        .title("Nematode")
        .inner_size(340.0, 300.0)
        .resizable(false)
        .minimizable(false)
        .maximizable(false)
        .center();
    #[cfg(target_os = "macos")]
    let b = b.title_bar_style(tauri::TitleBarStyle::Overlay).hidden_title(true);
    if let Ok(w) = b.build() {
        let _ = w.set_focus();
    }
}

#[tauri::command]
fn status() -> bool {
    #[cfg(target_os = "macos")]
    return mac::trusted(false);
    #[cfg(not(target_os = "macos"))]
    true
}

/// First ask shows macOS's own prompt; after that, jump straight to the right Settings pane.
#[tauri::command]
fn request_accessibility(settings: bool) {
    #[cfg(target_os = "macos")]
    if settings {
        let _ = std::process::Command::new("open")
            .arg("x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility")
            .spawn();
    } else {
        mac::trusted(true);
    }
}

#[tauri::command]
fn close_setup(app: AppHandle) {
    if let Some(w) = app.get_webview_window("setup") {
        let _ = w.close();
    }
}
