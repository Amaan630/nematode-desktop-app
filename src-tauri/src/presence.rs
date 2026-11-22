//! Where he is and why: the Away / On your tab / Summoned state machine, and the overlay window he lives in.
//! A poll thread watches for your Claude tab; the menu's Summon/Dismiss flips `summoned`. Both the overlay
//! and the menu are derived from the state, so they can't disagree.
//!
//! Locking rule: never call into Tauri (monitors, window, menu, eval) while holding STATE. Those calls hop
//! to the main thread, and the main thread may itself be waiting for STATE (menu clicks).
use std::{sync::Mutex, sync::OnceLock, time::Duration};
use tauri::{menu::MenuItem, App, AppHandle, Manager, WebviewWindow, Wry};

use crate::{characters, locate::locate, screen::{self, Rect}};

/// The overlay window (src/index.html): transparent, click-through, covering one monitor.
pub const OVERLAY: &str = "main";

#[derive(Clone, Copy, PartialEq)]
enum Mode {
    Away,     // off screen: "Summon" enabled
    OnTab,    // stomping on your active claude.ai tab: "Summon" grayed out
    Summoned, // out because you asked: roams, still visits your Claude tab: "Dismiss"
}

struct State {
    screen: Rect,             // monitor the overlay currently covers
    spot: Option<(f64, f64)>, // where the active claude.ai tab is, if any
    summoned: bool,
    snoozed: bool,            // dismissed while on Claude: ignore the tab until you leave it
    sent: String,             // last message to the overlay
}
static STATE: Mutex<State> =
    Mutex::new(State { screen: (0.0, 0.0, 0.0, 0.0), spot: None, summoned: false, snoozed: false, sent: String::new() });
static SUMMON: OnceLock<MenuItem<Wry>> = OnceLock::new();

fn mode(s: &State) -> Mode {
    match (s.summoned, s.spot.is_some() && !s.snoozed) {
        (true, _) => Mode::Summoned,
        (false, true) => Mode::OnTab,
        (false, false) => Mode::Away,
    }
}

/// Sets up the overlay window: click-through, floating above the menu bar, covering the primary monitor.
pub fn init(app: &App) -> tauri::Result<WebviewWindow> {
    let win = app.get_webview_window(OVERLAY).expect("overlay window is declared in tauri.conf.json");
    win.set_ignore_cursor_events(true)?;
    #[cfg(target_os = "macos")]
    crate::mac::float_above_menu_bar(win.ns_window()?);
    let (r, _) = screen::monitor_at(&win, 0.0, 0.0);
    screen::place(&win, r);
    let summoned = crate::update::restore_summoned(app.handle());
    {
        let mut s = STATE.lock().unwrap();
        s.screen = r;
        s.summoned = summoned;
    }
    win.show()?;
    Ok(win)
}

/// Watches for your Claude tab four times a second.
pub fn spawn(win: WebviewWindow) {
    std::thread::spawn(move || {
        #[cfg(windows)]
        let mut hidden = false;
        loop {
            std::thread::sleep(Duration::from_millis(250));
            if let Some(spot) = locate() {
                let mut s = STATE.lock().unwrap();
                s.spot = spot;
                if spot.is_none() {
                    s.snoozed = false; // you left Claude: next visit brings him back
                }
            }
            #[cfg(windows)]
            {
                let fullscreen = crate::fullscreen::active();
                if fullscreen != hidden {
                    let result = if fullscreen { win.hide() } else { win.show() };
                    if result.is_ok() { hidden = fullscreen; }
                }
            }
            sync(&win);
        }
    });
}

pub fn set_summon_item(item: MenuItem<Wry>) {
    let _ = SUMMON.set(item);
}

/// The overlay's monitor (logical px), for converting the cursor into overlay coordinates.
pub fn screen() -> Rect {
    STATE.lock().unwrap().screen
}

pub fn is_summoned() -> bool {
    STATE.lock().unwrap().summoned
}

pub fn is_away() -> bool {
    mode(&STATE.lock().unwrap()) == Mode::Away
}

/// Menu: Summon <-> Dismiss.
pub fn toggle_summon(app: &AppHandle) {
    let Some(win) = app.get_webview_window(OVERLAY) else { return };
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
        let (r, _) = screen::monitor_at(&win, c.x / scale, c.y / scale);
        let moved = {
            let mut s = STATE.lock().unwrap();
            let moved = r != s.screen;
            s.screen = r;
            s.sent.clear();
            moved
        };
        if moved {
            screen::place(&win, r);
            let _ = win.eval("nema({reset:true,mode:'away'})");
        }
    }
    sync(&win);
}

/// Tells the overlay and the menu about the current state, if it changed.
fn sync(win: &WebviewWindow) {
    let (m, spot, current) = {
        let s = STATE.lock().unwrap();
        (mode(&s), s.spot, s.screen)
    };
    let (js, r) = match (m, spot) {
        (Mode::Away, _) => ("nema({mode:'away'})".to_string(), current),
        (_, Some((x, y))) => {
            let (r, floor) = screen::monitor_at(win, x, y);
            let reset = r != current;
            (format!("nema({{reset:{reset},mode:'tab',x:{},y:{},floor:{floor}}})", x - r.0, y - r.1), r)
        }
        (_, None) => {
            let (_, floor) = screen::monitor_at(win, current.0 + 1.0, current.1 + 1.0);
            (format!("nema({{mode:'free',floor:{floor}}})"), current)
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
    if r != current {
        screen::place(win, r);
    }
    let _ = win.eval(&js);
    refresh_menu();
}

/// "Summon <name>" / "Dismiss <name>", grayed out while he's on your tab.
pub fn refresh_menu() {
    let m = mode(&STATE.lock().unwrap());
    if let Some(item) = SUMMON.get() {
        let verb = if m == Mode::Summoned { "Dismiss" } else { "Summon" };
        let _ = item.set_text(format!("{verb} {}", characters::current().label));
        let _ = item.set_enabled(m != Mode::OnTab);
    }
}

/// A newly received Together state brings a dismissed resident out, once per state change.
#[tauri::command]
pub fn summon_for_together(app: AppHandle) {
    if is_away() { toggle_summon(&app); }
}

/// Reloaded UI asks for the native state again; the previous page's sent cache is no longer valid.
#[tauri::command]
pub fn overlay_ready(app: AppHandle) {
    STATE.lock().unwrap().sent.clear();
    if let Some(win) = app.get_webview_window(OVERLAY) { sync(&win); }
}
