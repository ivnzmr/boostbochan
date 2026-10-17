//! In-game data (Riot's official Live Client Data API on localhost:2999) and the
//! overlay window that shows it on top of the game.

use std::time::Duration;

use serde_json::Value;
use tauri::{AppHandle, Manager, PhysicalPosition, WebviewUrl, WebviewWindowBuilder};

const LIVE_URL: &str = "https://127.0.0.1:2999/liveclientdata/allgamedata";
const OVERLAY_LABEL: &str = "overlay";
const OVERLAY_SIZE: (f64, f64) = (300.0, 210.0);
const OVERLAY_MARGIN: i32 = 24;
const OVERLAY_TOP: i32 = 140;

pub struct LiveState {
    http: reqwest::Client,
}

impl LiveState {
    pub fn new() -> Self {
        Self {
            // The game serves a self-signed certificate on localhost only.
            http: reqwest::Client::builder()
                .danger_accept_invalid_certs(true)
                .timeout(Duration::from_secs(2))
                .build()
                .expect("failed to build live client"),
        }
    }
}

/// Full live game snapshot, or null when no game is running.
#[tauri::command]
pub async fn live_game_data(state: tauri::State<'_, LiveState>) -> Result<Value, String> {
    match state.http.get(LIVE_URL).send().await {
        Ok(response) if response.status().is_success() => {
            response.json().await.map_err(|e| format!("datos de partida inválidos: {e}"))
        }
        // Loading screen (404) or no game process: not an error for the UI.
        Ok(_) | Err(_) => Ok(Value::Null),
    }
}

fn create_overlay(app: &AppHandle) -> Result<tauri::WebviewWindow, String> {
    let window = WebviewWindowBuilder::new(app, OVERLAY_LABEL, WebviewUrl::App("index.html#overlay".into()))
        .title("BoostBochan Overlay")
        .inner_size(OVERLAY_SIZE.0, OVERLAY_SIZE.1)
        .transparent(true)
        .decorations(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .focused(false)
        .shadow(false)
        .visible(false)
        .build()
        .map_err(|e| format!("no se pudo crear el overlay: {e}"))?;

    if let Ok(Some(monitor)) = window.primary_monitor() {
        let scale = monitor.scale_factor();
        let x = monitor.size().width as i32 - (OVERLAY_SIZE.0 * scale) as i32 - OVERLAY_MARGIN;
        let _ = window.set_position(PhysicalPosition::new(x.max(0), OVERLAY_TOP));
    }
    // Clicks go through to the game.
    window.set_ignore_cursor_events(true).map_err(|e| e.to_string())?;
    Ok(window)
}

#[tauri::command]
pub fn overlay_set_visible(app: AppHandle, visible: bool) -> Result<(), String> {
    let existing = app.get_webview_window(OVERLAY_LABEL);
    match (existing, visible) {
        (Some(window), true) => window.show().map_err(|e| e.to_string()),
        (Some(window), false) => window.hide().map_err(|e| e.to_string()),
        (None, true) => create_overlay(&app)?.show().map_err(|e| e.to_string()),
        (None, false) => Ok(()),
    }
}
