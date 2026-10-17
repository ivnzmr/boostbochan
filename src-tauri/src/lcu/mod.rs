pub mod client;
pub mod events;
pub mod lockfile;
pub mod websocket;

use std::time::Duration;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};
use tokio::sync::RwLock;

use lockfile::LcuCredentials;

pub const STATUS_EVENT: &str = "lcu-status";
pub const LCU_EVENT: &str = "lcu-event";

/// How often we look for the client when it is not running.
const POLL_INTERVAL: Duration = Duration::from_secs(2);

pub struct LcuState {
    pub creds: RwLock<Option<LcuCredentials>>,
    pub http: reqwest::Client,
}

impl LcuState {
    pub fn new() -> Self {
        Self {
            creds: RwLock::new(None),
            http: client::build_http_client(),
        }
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct LcuStatus {
    pub connected: bool,
    pub port: Option<u16>,
}

impl LcuStatus {
    pub fn from_creds(creds: Option<&LcuCredentials>) -> Self {
        Self {
            connected: creds.is_some(),
            port: creds.map(|c| c.port),
        }
    }
}

async fn set_credentials(app: &AppHandle, creds: Option<LcuCredentials>) {
    let status = LcuStatus::from_creds(creds.as_ref());
    *app.state::<LcuState>().creds.write().await = creds;
    if let Err(e) = app.emit(STATUS_EVENT, status) {
        eprintln!("[lcu] no se pudo emitir el estado: {e}");
    }
}

/// Background loop: waits for the League client, keeps a websocket session
/// open while it runs, and reports connect/disconnect to the frontend.
pub fn spawn_watcher(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        loop {
            if let Ok(creds) = lockfile::read_credentials(None) {
                let (tx, rx) = tokio::sync::oneshot::channel();
                let emitter = app.clone();
                let result = websocket::run_session(
                    &creds,
                    || {
                        let _ = tx.send(());
                    },
                    |event| {
                        if let Err(e) = emitter.emit(LCU_EVENT, event) {
                            eprintln!("[lcu] no se pudo emitir evento: {e}");
                        }
                    },
                );

                // Mark as connected as soon as the subscription succeeds.
                let session = async {
                    tokio::pin!(result);
                    tokio::select! {
                        res = &mut result => res,
                        Ok(()) = rx => {
                            set_credentials(&app, Some(creds.clone())).await;
                            result.await
                        }
                    }
                };

                // An error before connecting usually means the client is still booting.
                match session.await {
                    Ok(()) => eprintln!("[lcu] sesión cerrada por el cliente"),
                    Err(e) => eprintln!("[lcu] {e}"),
                }
                if app.state::<LcuState>().creds.read().await.is_some() {
                    set_credentials(&app, None).await;
                }
            }
            tokio::time::sleep(POLL_INTERVAL).await;
        }
    });
}
