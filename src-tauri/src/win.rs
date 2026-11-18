// Windows bits: find Chrome's selected tab through UI Automation, and hand focus back after a throw.
use std::sync::atomic::{AtomicIsize, Ordering};
use windows::{
    core::PWSTR,
    Win32::{
        Foundation::{CloseHandle, HWND, POINT},
        Graphics::Gdi::{MonitorFromPoint, MONITOR_DEFAULTTONEAREST},
        System::{
            Com::{CoCreateInstance, CoInitializeEx, CLSCTX_INPROC_SERVER, COINIT_MULTITHREADED},
            Threading::{OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION},
        },
        UI::{
            Accessibility::*,
            HiDpi::{GetDpiForMonitor, MDT_EFFECTIVE_DPI},
            WindowsAndMessaging::{GetForegroundWindow, GetWindowThreadProcessId, SetForegroundWindow},
        },
    },
};

/// The window you're using right now: handle, pid, and lowercase exe name (e.g. "chrome.exe").
pub fn foreground() -> (HWND, u32, String) {
    unsafe {
        let hwnd = GetForegroundWindow();
        let mut pid = 0;
        GetWindowThreadProcessId(hwnd, Some(&mut pid));
        let mut exe = String::new();
        if let Ok(h) = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid) {
            let (mut buf, mut len) = ([0u16; 1024], 1024u32);
            if QueryFullProcessImageNameW(h, PROCESS_NAME_WIN32, PWSTR(buf.as_mut_ptr()), &mut len).is_ok() {
                let path = String::from_utf16_lossy(&buf[..len as usize]);
                exe = path.rsplit('\\').next().unwrap_or_default().to_lowercase();
            }
            let _ = CloseHandle(h);
        }
        (hwnd, pid, exe)
    }
}

thread_local! {
    // ponytail: one COM apartment per polling thread, never torn down; fine for a thread that lives forever.
    static UIA: Option<(IUIAutomation, IUIAutomationTreeWalker)> = unsafe {
        let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
        let uia: Option<IUIAutomation> = CoCreateInstance(&CUIAutomation, None, CLSCTX_INPROC_SERVER).ok();
        uia.and_then(|u| u.ControlViewWalker().ok().map(|w| (u, w)))
    };
}

pub struct Scan {
    pub tab: Option<(f64, f64, f64, f64)>, // selected tab, screen rect (logical px, top-left origin)
    pub address: Option<String>,          // what the address bar shows, e.g. "claude.ai/new"
}

/// Reads a Chrome window: the selected tab's rect and the address bar text.
pub fn scan(hwnd: HWND) -> Scan {
    UIA.with(|u| u.as_ref().and_then(|(uia, walker)| unsafe { walk(uia, walker, hwnd) }))
        .unwrap_or(Scan { tab: None, address: None })
}

unsafe fn walk(uia: &IUIAutomation, walker: &IUIAutomationTreeWalker, hwnd: HWND) -> Option<Scan> {
    let mut out = Scan { tab: None, address: None };
    let root = uia.ElementFromHandle(hwnd).ok()?;
    // ponytail: walks the window's UI tree every poll (skipping page content); cache the nodes if it gets slow.
    let (mut stack, mut budget, mut omnibox) = (vec![(root, 0)], 4000, false);
    while let Some((e, depth)) = stack.pop() {
        budget -= 1;
        if budget == 0 || (out.tab.is_some() && omnibox) { break }
        let kind = e.CurrentControlType().unwrap_or_default();
        if kind == UIA_DocumentControlTypeId { continue } // the web page itself
        if kind == UIA_TabItemControlTypeId && out.tab.is_none() && selected(&e) {
            out.tab = rect(&e);
        }
        if kind == UIA_EditControlTypeId && !omnibox {
            // "Address and search bar" in English; other languages fall back to the first edit in the toolbar.
            omnibox = e.CurrentName().map(|n| n.to_string().to_lowercase().contains("address")).unwrap_or(false);
            if omnibox || out.address.is_none() {
                out.address = e.GetCurrentPatternAs::<IUIAutomationValuePattern>(UIA_ValuePatternId)
                    .and_then(|p| p.CurrentValue()).ok().map(|v| v.to_string());
            }
        }
        if depth < 30 {
            let mut kids = vec![];
            let mut c = walker.GetFirstChildElement(&e).ok();
            while let Some(k) = c {
                c = walker.GetNextSiblingElement(&k).ok();
                kids.push(k);
            }
            stack.extend(kids.into_iter().rev().map(|k| (k, depth + 1))); // pop in tree order
        }
    }
    Some(out)
}

unsafe fn selected(e: &IUIAutomationElement) -> bool {
    e.GetCurrentPatternAs::<IUIAutomationSelectionItemPattern>(UIA_SelectionItemPatternId)
        .and_then(|p| p.CurrentIsSelected())
        .map(|b| b.as_bool())
        .unwrap_or(false)
}

/// UIA gives physical pixels; Tauri's logical space divides each monitor by its own scale.
unsafe fn rect(e: &IUIAutomationElement) -> Option<(f64, f64, f64, f64)> {
    let r = e.CurrentBoundingRectangle().ok()?;
    if r.right <= r.left || r.bottom <= r.top { return None }
    let mon = MonitorFromPoint(POINT { x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 }, MONITOR_DEFAULTTONEAREST);
    let (mut dx, mut dy) = (96, 96);
    let _ = GetDpiForMonitor(mon, MDT_EFFECTIVE_DPI, &mut dx, &mut dy);
    let s = dx as f64 / 96.0;
    Some((r.left as f64 / s, r.top as f64 / s, (r.right - r.left) as f64 / s, (r.bottom - r.top) as f64 / s))
}

// The overlay is WS_EX_NOACTIVATE (focusable: false), so clicks shouldn't take focus; this is the fallback if one does.
static PREV: AtomicIsize = AtomicIsize::new(0);

pub fn remember() {
    let (hwnd, pid, _) = foreground();
    if pid != std::process::id() {
        PREV.store(hwnd.0 as isize, Ordering::Relaxed);
    }
}

pub fn restore() {
    let h = PREV.load(Ordering::Relaxed);
    if h != 0 && foreground().1 == std::process::id() {
        let _ = unsafe { SetForegroundWindow(HWND(h as _)) };
    }
}
