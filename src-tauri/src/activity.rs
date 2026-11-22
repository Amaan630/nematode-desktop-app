//! Deliver gestures only while the user is at an unlocked computer, without taking focus.
#[tauri::command]
pub fn user_active() -> bool {
    #[cfg(target_os = "macos")]
    {
        use core_foundation::{base::{CFType, TCFType}, boolean::CFBoolean, dictionary::{CFDictionary, CFDictionaryRef}, string::CFString};
        #[link(name = "CoreGraphics", kind = "framework")]
        extern "C" {
            fn CGEventSourceSecondsSinceLastEventType(state: i32, event: u32) -> f64;
            fn CGSessionCopyCurrentDictionary() -> CFDictionaryRef;
        }
        unsafe {
            let session = CGSessionCopyCurrentDictionary();
            if session.is_null() { return false; }
            let session: CFDictionary<CFString, CFType> = CFDictionary::wrap_under_create_rule(session);
            let flag = |key: &str| session.find(&CFString::new(key)).and_then(|v| v.downcast::<CFBoolean>()).map(bool::from);
            return flag("kCGSSessionOnConsoleKey") == Some(true)
                && flag("CGSSessionScreenIsLocked") != Some(true)
                && CGEventSourceSecondsSinceLastEventType(0, u32::MAX) < 60.0;
        }
    }
    #[cfg(windows)]
    {
        if crate::fullscreen::active() { return false; }
        use windows::Win32::{Foundation::HANDLE, System::{StationsAndDesktops::*, SystemInformation::GetTickCount},
            UI::Input::KeyboardAndMouse::{GetLastInputInfo, LASTINPUTINFO}};
        unsafe {
            let Ok(desktop) = OpenInputDesktop(DESKTOP_CONTROL_FLAGS(0), false, DESKTOP_READOBJECTS) else { return false; };
            let mut name = [0u16; 128];
            let unlocked = GetUserObjectInformationW(HANDLE(desktop.0), UOI_NAME, Some(name.as_mut_ptr().cast()),
                std::mem::size_of_val(&name) as u32, None).is_ok()
                && String::from_utf16_lossy(&name[..name.iter().position(|&c| c == 0).unwrap_or(name.len())]) == "Default";
            let _ = CloseDesktop(desktop);
            let mut input = LASTINPUTINFO { cbSize: std::mem::size_of::<LASTINPUTINFO>() as u32, dwTime: 0 };
            return unlocked && GetLastInputInfo(&mut input).as_bool() && GetTickCount().wrapping_sub(input.dwTime) < 60_000;
        }
    }
    #[cfg(not(any(target_os = "macos", windows)))]
    false
}
