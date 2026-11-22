//! Windows fullscreen suppression; compare client pixels so ordinary maximized windows stay visible.
#[cfg(windows)]
pub fn active() -> bool {
    use windows::Win32::{
        Foundation::{POINT, RECT},
        Graphics::Gdi::{ClientToScreen, GetMonitorInfoW, MonitorFromWindow, MONITORINFO, MONITOR_DEFAULTTONEAREST},
        UI::WindowsAndMessaging::{GetClientRect, GetDesktopWindow, GetForegroundWindow, GetShellWindow,
            GetWindowThreadProcessId, IsIconic, IsWindowVisible},
    };
    unsafe {
        let hwnd = GetForegroundWindow();
        let mut pid = 0;
        GetWindowThreadProcessId(hwnd, Some(&mut pid));
        if hwnd.is_invalid() || hwnd == GetDesktopWindow() || hwnd == GetShellWindow()
            || pid == std::process::id() || IsIconic(hwnd).as_bool() || !IsWindowVisible(hwnd).as_bool() {
            return false;
        }
        let mut client = RECT::default();
        let mut origin = POINT::default();
        let mut monitor = MONITORINFO { cbSize: std::mem::size_of::<MONITORINFO>() as u32, ..Default::default() };
        if GetClientRect(hwnd, &mut client).is_err() || !ClientToScreen(hwnd, &mut origin).as_bool()
            || !GetMonitorInfoW(MonitorFromWindow(hwnd, MONITOR_DEFAULTTONEAREST), &mut monitor).as_bool() {
            return false;
        }
        let m = monitor.rcMonitor;
        covers((origin.x, origin.y, origin.x + client.right, origin.y + client.bottom),
            (m.left, m.top, m.right, m.bottom))
    }
}

fn covers(window: (i32, i32, i32, i32), monitor: (i32, i32, i32, i32)) -> bool {
    window.0 <= monitor.0 && window.1 <= monitor.1 && window.2 >= monitor.2 && window.3 >= monitor.3
}

#[cfg(test)]
mod tests {
    use super::covers;
    #[test]
    fn fullscreen_requires_the_whole_monitor_not_its_work_area() {
        let monitor = (0, 0, 1920, 1080);
        assert!(covers(monitor, monitor));
        assert!(covers((-1, -1, 1921, 1081), monitor));
        assert!(!covers((0, 30, 1920, 1040), monitor)); // title bar and taskbar
        assert!(!covers((0, 30, 1920, 1080), monitor)); // maximized, auto-hidden taskbar
        assert!(!covers((0, 0, 960, 1080), monitor)); // snapped
        assert!(covers((-2560, -200, 0, 1240), (-2560, -200, 0, 1240)));
        assert!(!covers((0, 0, 1920, 1080), (-2560, -200, 0, 1240)));
    }
}
