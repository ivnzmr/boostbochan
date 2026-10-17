use serde_json::Value;
use tauri::State;

use crate::lcu::{LcuState, LcuStatus, client};

#[tauri::command]
pub async fn lcu_status(state: State<'_, LcuState>) -> Result<LcuStatus, String> {
    Ok(LcuStatus::from_creds(state.creds.read().await.as_ref()))
}

#[tauri::command]
pub async fn lcu_request(
    state: State<'_, LcuState>,
    method: String,
    path: String,
    body: Option<Value>,
) -> Result<Value, String> {
    let creds = state
        .creds
        .read()
        .await
        .clone()
        .ok_or_else(|| "el cliente de LoL no está conectado".to_string())?;
    client::request(&state.http, &creds, &method, &path, body).await
}
