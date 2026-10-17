//! Statistics in the app: downloads the published snapshot (no API key needed),
//! caches it on disk and answers queries from memory.

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, RwLock};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde::Serialize;
use stats_core::db::{ChampRow, MatchupRow, ROLES};
use stats_core::snapshot::Snapshot;
use tauri::{AppHandle, Emitter, Manager, State};

use crate::config::STATS_URL;

pub const UPDATED_EVENT: &str = "stats-updated";
const CACHE_FILE: &str = "stats.json.gz";
/// Re-download when the cached snapshot is older than this.
const MAX_AGE: Duration = Duration::from_secs(6 * 60 * 60);
const MAX_DOWNLOAD_BYTES: usize = 100 * 1024 * 1024;

/// Snapshot plus an index of matchup rows by (role, enemy) for fast lookups.
struct Loaded {
    snapshot: Snapshot,
    by_role_enemy: HashMap<(String, i64), Vec<usize>>,
}

impl Loaded {
    fn new(snapshot: Snapshot) -> Self {
        let mut by_role_enemy: HashMap<(String, i64), Vec<usize>> = HashMap::new();
        for (i, m) in snapshot.matchups.iter().enumerate() {
            by_role_enemy.entry((m.role.clone(), m.enemy)).or_default().push(i);
        }
        Self { snapshot, by_role_enemy }
    }
}

pub struct StatsState {
    cache_path: PathBuf,
    loaded: RwLock<Option<Arc<Loaded>>>,
    syncing: AtomicBool,
    last_error: RwLock<Option<String>>,
}

impl StatsState {
    pub fn new(data_dir: PathBuf) -> Self {
        let cache_path = data_dir.join(CACHE_FILE);
        let loaded = std::fs::read(&cache_path)
            .ok()
            .and_then(|bytes| Snapshot::from_gzip(&bytes).map_err(|e| eprintln!("[stats] caché inválida: {e}")).ok())
            .map(|s| Arc::new(Loaded::new(s)));
        Self {
            cache_path,
            loaded: RwLock::new(loaded),
            syncing: AtomicBool::new(false),
            last_error: RwLock::new(None),
        }
    }

    fn current(&self) -> Option<Arc<Loaded>> {
        self.loaded.read().ok()?.clone()
    }

    fn is_stale(&self) -> bool {
        let now = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs() as i64).unwrap_or(0);
        self.current()
            .is_none_or(|l| now - l.snapshot.generated_at > MAX_AGE.as_secs() as i64)
    }

    fn set_error(&self, error: Option<String>) {
        if let Ok(mut slot) = self.last_error.write() {
            *slot = error;
        }
    }
}

async fn download() -> Result<Vec<u8>, String> {
    let response = reqwest::Client::builder()
        .timeout(Duration::from_secs(60))
        .user_agent(concat!("BoostBochan/", env!("CARGO_PKG_VERSION")))
        .build()
        .map_err(|e| e.to_string())?
        .get(STATS_URL)
        .send()
        .await
        .map_err(|e| format!("sin conexión con el servidor de estadísticas: {e}"))?;
    match response.status().as_u16() {
        200 => {}
        404 => return Err("todavía no hay estadísticas publicadas".into()),
        status => return Err(format!("el servidor de estadísticas respondió {status}")),
    }
    let bytes = response.bytes().await.map_err(|e| format!("descarga interrumpida: {e}"))?;
    if bytes.len() > MAX_DOWNLOAD_BYTES {
        return Err("archivo de estadísticas demasiado grande".into());
    }
    Ok(bytes.to_vec())
}

async fn sync(app: &AppHandle) -> Result<(), String> {
    let bytes = download().await?;
    let snapshot = Snapshot::from_gzip(&bytes)?;
    let state = app.state::<StatsState>();
    let is_newer = state.current().is_none_or(|l| snapshot.generated_at > l.snapshot.generated_at);
    if is_newer {
        if let Err(e) = std::fs::write(&state.cache_path, &bytes) {
            eprintln!("[stats] no se pudo guardar la caché: {e}");
        }
        *state.loaded.write().map_err(|_| "estado bloqueado")? = Some(Arc::new(Loaded::new(snapshot)));
    }
    Ok(())
}

/// Starts a background download unless one is already running.
pub fn spawn_sync(app: AppHandle) {
    let state = app.state::<StatsState>();
    if state.syncing.swap(true, Ordering::SeqCst) {
        return;
    }
    let _ = app.emit(UPDATED_EVENT, ());
    tauri::async_runtime::spawn(async move {
        let result = sync(&app).await;
        let state = app.state::<StatsState>();
        state.set_error(result.err());
        state.syncing.store(false, Ordering::SeqCst);
        let _ = app.emit(UPDATED_EVENT, ());
    });
}

/// Called on startup: refresh only when the cached data is old or missing.
pub fn sync_if_stale(app: AppHandle) {
    if app.state::<StatsState>().is_stale() {
        spawn_sync(app);
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SummaryDto {
    soloq_games: i64,
    pro_games: i64,
    patches: Vec<String>,
    generated_at: Option<i64>,
    syncing: bool,
    last_error: Option<String>,
}

#[tauri::command]
pub fn stats_summary(state: State<'_, StatsState>) -> SummaryDto {
    let loaded = state.current();
    let snapshot = loaded.as_ref().map(|l| &l.snapshot);
    SummaryDto {
        soloq_games: snapshot.map_or(0, |s| s.soloq_games),
        pro_games: snapshot.map_or(0, |s| s.pro_games),
        patches: snapshot.map(|s| s.patches.clone()).unwrap_or_default(),
        generated_at: snapshot.map(|s| s.generated_at),
        syncing: state.syncing.load(Ordering::SeqCst),
        last_error: state.last_error.read().ok().and_then(|e| e.clone()),
    }
}

#[tauri::command]
pub fn stats_champions(state: State<'_, StatsState>) -> Vec<ChampRow> {
    state.current().map(|l| l.snapshot.champs.clone()).unwrap_or_default()
}

#[tauri::command]
pub fn stats_matchups(state: State<'_, StatsState>, role: String, enemies: Vec<i64>) -> Result<Vec<MatchupRow>, String> {
    if !ROLES.contains(&role.as_str()) {
        return Err(format!("rol inválido: {role}"));
    }
    let Some(loaded) = state.current() else {
        return Ok(Vec::new());
    };
    Ok(enemies
        .iter()
        .flat_map(|enemy| loaded.by_role_enemy.get(&(role.clone(), *enemy)).into_iter().flatten())
        .map(|&i| loaded.snapshot.matchups[i].clone())
        .collect())
}

#[tauri::command]
pub fn stats_sync(app: AppHandle) {
    spawn_sync(app);
}
