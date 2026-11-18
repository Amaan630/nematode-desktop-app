// macOS bits: find Chrome's selected tab through the Accessibility API, and juggle app focus.
use core_foundation::{
    array::{CFArray, CFArrayGetTypeID},
    base::{CFGetTypeID, CFType, CFTypeRef, TCFType},
    boolean::CFBoolean,
    dictionary::{CFDictionary, CFDictionaryRef},
    number::CFNumber,
    string::{CFString, CFStringRef},
};
use objc2::{class, msg_send, rc::autoreleasepool, runtime::AnyObject};
use std::{ffi::c_void, ptr::null};

#[link(name = "ApplicationServices", kind = "framework")]
extern "C" {
    fn AXUIElementCreateApplication(pid: i32) -> CFTypeRef;
    fn AXUIElementCopyAttributeValue(e: CFTypeRef, attr: CFStringRef, out: *mut CFTypeRef) -> i32;
    fn AXUIElementSetMessagingTimeout(e: CFTypeRef, seconds: f32) -> i32;
    fn AXValueGetValue(v: CFTypeRef, kind: u32, out: *mut c_void) -> bool;
    fn AXIsProcessTrustedWithOptions(opts: CFDictionaryRef) -> bool;
    static kAXTrustedCheckOptionPrompt: CFStringRef;
}

/// Is Nematode allowed to use Accessibility? `prompt` shows the system dialog if not.
pub fn trusted(prompt: bool) -> bool {
    let key = unsafe { CFString::wrap_under_get_rule(kAXTrustedCheckOptionPrompt) };
    let opts = CFDictionary::from_CFType_pairs(&[(key.as_CFType(), CFBoolean::from(prompt).as_CFType())]);
    unsafe { AXIsProcessTrustedWithOptions(opts.as_concrete_TypeRef()) }
}

fn attr(e: &CFType, name: &str) -> Option<CFType> {
    let mut v: CFTypeRef = null();
    let err = unsafe { AXUIElementCopyAttributeValue(e.as_CFTypeRef(), CFString::new(name).as_concrete_TypeRef(), &mut v) };
    (err == 0 && !v.is_null()).then(|| unsafe { CFType::wrap_under_create_rule(v) })
}
fn text(e: &CFType, name: &str) -> String {
    attr(e, name).and_then(|v| v.downcast::<CFString>()).map(|s| s.to_string()).unwrap_or_default()
}
fn children(e: &CFType) -> Vec<CFType> {
    match attr(e, "AXChildren") {
        Some(v) if unsafe { CFGetTypeID(v.as_CFTypeRef()) == CFArrayGetTypeID() } => {
            let arr: CFArray<CFType> = unsafe { CFArray::wrap_under_get_rule(v.as_CFTypeRef() as _) };
            arr.iter().map(|c| c.clone()).collect()
        }
        _ => vec![],
    }
}
fn selected(e: &CFType) -> bool {
    let on = |v: CFType| v.downcast::<CFNumber>().and_then(|n| n.to_i64()) == Some(1)
        || v.downcast::<CFBoolean>().map(bool::from) == Some(true);
    attr(e, "AXValue").map(on).unwrap_or(false) || attr(e, "AXSelected").map(on).unwrap_or(false)
}
fn frame(e: &CFType) -> Option<(f64, f64, f64, f64)> {
    let (mut p, mut s) = ([0f64; 2], [0f64; 2]);
    let pos = attr(e, "AXPosition")?;
    let size = attr(e, "AXSize")?;
    unsafe {
        (AXValueGetValue(pos.as_CFTypeRef(), 1, p.as_mut_ptr() as _) && AXValueGetValue(size.as_CFTypeRef(), 2, s.as_mut_ptr() as _))
            .then_some((p[0], p[1], s[0], s[1]))
    }
}

pub struct Scan {
    pub tab: Option<(f64, f64, f64, f64)>, // selected tab, screen rect (logical px, top-left origin)
    pub address: Option<String>,          // what the address bar shows, e.g. "claude.ai/new"
}

/// Reads Chrome's front window: the selected tab's frame and the address bar text.
/// Works for horizontal and vertical tabs: both are tab buttons in the accessibility tree.
pub fn scan(pid: i32) -> Scan {
    let mut out = Scan { tab: None, address: None };
    let app = unsafe { CFType::wrap_under_create_rule(AXUIElementCreateApplication(pid)) };
    unsafe { AXUIElementSetMessagingTimeout(app.as_CFTypeRef(), 0.2) };
    let Some(win) = attr(&app, "AXFocusedWindow").or_else(|| attr(&app, "AXMainWindow")) else { return out };
    // ponytail: walks the window's UI tree every poll (skipping page content); cache the nodes if it gets slow.
    let (mut stack, mut budget, mut omnibox) = (vec![(win, 0, false)], 4000, false);
    while let Some((e, depth, in_tabs)) = stack.pop() {
        budget -= 1;
        if budget == 0 || (out.tab.is_some() && omnibox) { break }
        let role = text(&e, "AXRole");
        match role.as_str() {
            "AXWebArea" => continue,
            "AXRadioButton" if out.tab.is_none() && (in_tabs || text(&e, "AXSubrole") == "AXTabButton") && selected(&e) => {
                out.tab = frame(&e);
            }
            "AXTextField" | "AXComboBox" if !omnibox => {
                omnibox = text(&e, "AXDescription").to_lowercase().contains("address");
                if omnibox || out.address.is_none() {
                    out.address = Some(text(&e, "AXValue"));
                }
            }
            _ => {}
        }
        if depth < 30 {
            let tabs = role == "AXTabGroup";
            stack.extend(children(&e).into_iter().map(|c| (c, depth + 1, tabs)));
        }
    }
    out
}

/// pid and bundle id of the app you're using right now.
pub fn frontmost() -> (i32, String) {
    autoreleasepool(|_| unsafe {
        let ws: *mut AnyObject = msg_send![class!(NSWorkspace), sharedWorkspace];
        let app: *mut AnyObject = msg_send![ws, frontmostApplication];
        if app.is_null() { return (0, String::new()) }
        let pid: i32 = msg_send![app, processIdentifier];
        let id: *mut AnyObject = msg_send![app, bundleIdentifier];
        let c: *const std::ffi::c_char = if id.is_null() { null() } else { msg_send![id, UTF8String] };
        let bundle = if c.is_null() { String::new() } else { std::ffi::CStr::from_ptr(c).to_string_lossy().into_owned() };
        (pid, bundle)
    })
}

pub fn activate(pid: i32) {
    autoreleasepool(|_| unsafe {
        let app: *mut AnyObject = msg_send![class!(NSRunningApplication), runningApplicationWithProcessIdentifier: pid];
        if !app.is_null() {
            let _: bool = msg_send![app, activateWithOptions: 0usize];
        }
    })
}

// Default always-on-top sits under the menu bar; status level floats above it, on every Space.
pub fn float_above_menu_bar(ns_window: *mut c_void) {
    let ns = ns_window as *mut AnyObject;
    let behavior: usize = 1 | 16 | 64 | 256; // canJoinAllSpaces | stationary | ignoresCycle | fullScreenAuxiliary
    unsafe {
        let _: () = msg_send![ns, setLevel: 25isize];
        let _: () = msg_send![ns, setCollectionBehavior: behavior];
    }
}

/// Sets (Some png) or clears (None) the custom Finder/Launchpad icon on this app's bundle.
/// The code signature still validates and Accessibility stays granted (checked on a real install).
pub fn set_app_icon(png: Option<&[u8]>) {
    let bundle = std::env::current_exe().ok().and_then(|p| p.ancestors().nth(3).map(|b| b.to_path_buf()));
    let Some(bundle) = bundle.filter(|b| b.extension().is_some_and(|e| e == "app")) else { return }; // dev builds: no bundle
    let path = CFString::new(&bundle.to_string_lossy());
    autoreleasepool(|_| unsafe {
        let ws: *mut AnyObject = msg_send![class!(NSWorkspace), sharedWorkspace];
        let mut img: *mut AnyObject = std::ptr::null_mut();
        if let Some(b) = png {
            let data: *mut AnyObject = msg_send![class!(NSData), dataWithBytes: b.as_ptr() as *const c_void, length: b.len()];
            let alloc: *mut AnyObject = msg_send![class!(NSImage), alloc];
            img = msg_send![alloc, initWithData: data];
        }
        let _: bool = msg_send![ws, setIcon: img, forFile: path.as_concrete_TypeRef() as *mut AnyObject, options: 0usize];
        if !img.is_null() {
            let _: () = msg_send![img, release];
        }
    })
}
