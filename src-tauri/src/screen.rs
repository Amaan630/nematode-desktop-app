//! Monitor geometry, in logical px with a top-left origin.
use tauri::{LogicalPosition, LogicalSize, WebviewWindow};

pub type Rect = (f64, f64, f64, f64); // x, y, w, h

/// The monitor containing (x, y), and the y of its usable floor (above the Dock/taskbar), relative to its top.
pub fn monitor_at(win: &WebviewWindow, x: f64, y: f64) -> (Rect, f64) {
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

/// Makes the window cover `r` exactly.
pub fn place(win: &WebviewWindow, r: Rect) {
    let _ = win.set_position(LogicalPosition::new(r.0, r.1));
    let _ = win.set_size(LogicalSize::new(r.2, r.3));
}
