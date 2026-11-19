//! A menu-bar submenu for picking one of a few options (each with a small preview image),
//! remembered between launches. Used for Character and App Icon.
use std::sync::OnceLock;
use tauri::{
    image::Image,
    menu::{IconMenuItem, IsMenuItem, Submenu},
    AppHandle, Wry,
};

use crate::store;

pub struct Choice {
    pub id: &'static str,
    pub label: &'static str,
    pub preview: &'static [u8], // PNG shown next to the label (rendered at 18pt)
}

/// One option: `choice!("characters", "croissant", "Croissant")` uses icons/characters/croissant-menu.png.
#[macro_export]
macro_rules! choice {
    ($dir:literal, $id:literal, $label:literal) => {
        $crate::picker::Choice {
            id: $id,
            label: $label,
            preview: include_bytes!(concat!("../icons/", $dir, "/", $id, "-menu.png")),
        }
    };
}

pub struct Picker {
    key: &'static str,   // menu ids are "<key>:<id>"; the choice is stored in a file named <key>
    title: &'static str,
    choices: &'static [Choice], // the first is the default
    items: OnceLock<Vec<IconMenuItem<Wry>>>,
}

impl Picker {
    pub const fn new(key: &'static str, title: &'static str, choices: &'static [Choice]) -> Self {
        Self { key, title, choices, items: OnceLock::new() }
    }

    pub fn submenu(&self, app: &AppHandle) -> tauri::Result<Submenu<Wry>> {
        let items = self
            .choices
            .iter()
            .map(|c| {
                let id = format!("{}:{}", self.key, c.id);
                IconMenuItem::with_id(app, id, c.label, true, if c.preview.is_empty() { None } else { Some(Image::from_bytes(c.preview)?) }, None::<&str>)
            })
            .collect::<tauri::Result<Vec<_>>>()?;
        let refs: Vec<&dyn IsMenuItem<Wry>> = items.iter().map(|i| i as _).collect();
        let submenu = Submenu::with_items(app, self.title, true, &refs)?;
        let _ = self.items.set(items);
        Ok(submenu)
    }

    /// The choice a menu event refers to, if it's one of ours.
    pub fn from_event(&self, event_id: &str) -> Option<&'static Choice> {
        self.find(event_id.strip_prefix(self.key)?.strip_prefix(':')?)
    }

    /// What was picked last time (or the default).
    pub fn saved(&self, app: &AppHandle) -> &'static Choice {
        store::read(app, self.key).and_then(|id| self.find(&id)).unwrap_or(self.default())
    }

    /// Remembers the choice and ticks it in the menu.
    pub fn select(&self, app: &AppHandle, choice: &Choice) {
        store::write(app, self.key, choice.id);
        for (item, c) in self.items.get().into_iter().flatten().zip(self.choices) {
            let _ = item.set_text(if c.id == choice.id { format!("{}  ✓", c.label) } else { c.label.to_string() });
        }
    }

    pub fn default(&self) -> &'static Choice {
        &self.choices[0]
    }

    fn find(&self, id: &str) -> Option<&'static Choice> {
        self.choices.iter().find(|c| c.id == id)
    }
}
