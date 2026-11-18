//! Finds the active claude.ai tab in Chrome, through the OS accessibility APIs (mac.rs / win.rs).
//! locate() returns Some(Some(spot)) = stand here, Some(None) = not on Claude, None = can't tell (change nothing).

/// Where he stands: the middle of the tab's bottom edge.
#[cfg(any(target_os = "macos", windows))]
fn spot((x, y, w, h): (f64, f64, f64, f64)) -> (f64, f64) {
    (x + w / 2.0, y + h - 2.0)
}

#[cfg(any(target_os = "macos", windows))]
fn on_claude(address: Option<String>) -> bool {
    let address = address.unwrap_or_default().to_lowercase();
    let host = address.trim_start_matches("https://").trim_start_matches("http://").trim_start_matches("www.");
    host.starts_with("claude.ai")
}

#[cfg(target_os = "macos")]
pub fn locate() -> Option<Option<(f64, f64)>> {
    use crate::mac;
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
    scan.tab.map(|t| Some(spot(t)))
}

#[cfg(windows)]
pub fn locate() -> Option<Option<(f64, f64)>> {
    use crate::win;
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
    scan.tab.map(|t| Some(spot(t)))
}

#[cfg(not(any(target_os = "macos", windows)))]
pub fn locate() -> Option<Option<(f64, f64)>> {
    None
}
