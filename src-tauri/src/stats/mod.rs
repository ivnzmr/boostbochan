//! Statistics in the app: queried online from the published snapshot (no API key,
//! nothing written to disk) and answered from memory.

use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, RwLock};
use std::time::{Duration, Instant};

use serde::Serialize;
use stats_core::build_db::{BenchRow, BuildRow};
use stats_core::db::{ChampRow, MatchupRow, ROLES};
use stats_core::snapshot::Snapshot;
use tauri::{AppHandle, Emitter, Manager, State};

use crate::config::STATS_URL;

pub const UPDATED_EVENT: &str = "stats-updated";
/// While the app is open, check for a newer snapshot this often.
const REFRESH_EVERY: Duration = Duration::from_secs(3 * 60 * 60);
const RETRY_AFTER_ERROR: Duration = Duration::from_secs(5 * 60);
const MAX_DOWNLOAD_BYTES: usize = 150 * 1024 * 1024;

type RoleChamp = (String, i64);

/// Snapshot plus indexes for fast lookups.
struct Loaded {
    snapshot: Snapshot,
    matchups_by_role_enemy: HashMap<RoleChamp, Vec<usize>>,
    builds_by_role_champ: HashMap<RoleChamp, Vec<usize>>,
}

impl Loaded {
    fn new(snapshot: Snapshot) -> Self {
        let mut matchups_by_role_enemy: HashMap<RoleChamp, Vec<usize>> = HashMap::new();
        for (i, m) in snapshot.matchups.iter().enumerate() {
            matchups_by_role_enemy.entry((m.role.clone(), m.enemy)).or_default().push(i);
        }
        let mut builds_by_role_champ: HashMap<RoleChamp, Vec<usize>> = HashMap::new();
        for (i, b) in snapshot.builds.iter().enumerate() {
            builds_by_role_champ.entry((b.role.clone(), b.champ)).or_default().push(i);
        }
        Self { snapshot, matchups_by_role_enemy, builds_by_role_champ }
    }
}

#[derive(Default)]
pub struct StatsState {
    loaded: RwLock<Option<Arc<Loaded>>>,
    syncing: AtomicBool,
    last_error: RwLock<Option<String>>,
}

impl StatsState {
    fn current(&self) -> Option<Arc<Loaded>> {
        self.loaded.read().ok()?.clone()
    }

    fn set_error(&self, error: Option<String>) {
        if let Ok(mut slot) = self.last_error.write() {
            *slot = error;
        }
    }
}

async fn download() -> Result<Vec<u8>, String> {
    let response = reqwest::Client::builder()
        .timeout(Duration::from_secs(90))
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
    let snapshot = Snapshot::from_gzip(&download().await?)?;
    let state = app.state::<StatsState>();
    let is_newer = state.current().is_none_or(|l| snapshot.generated_at > l.snapshot.generated_at);
    if is_newer {
        *state.loaded.write().map_err(|_| "estado bloqueado")? = Some(Arc::new(Loaded::new(snapshot)));
    }
    Ok(())
}

/// Downloads now unless a download is already running. Returns whether it succeeded.
async fn sync_now(app: &AppHandle) -> bool {
    let state = app.state::<StatsState>();
    if state.syncing.swap(true, Ordering::SeqCst) {
        return true;
    }
    let _ = app.emit(UPDATED_EVENT, ());
    let result = sync(app).await;
    let ok = result.is_ok();
    state.set_error(result.err());
    state.syncing.store(false, Ordering::SeqCst);
    let _ = app.emit(UPDATED_EVENT, ());
    ok
}

/// Keeps the in-memory statistics fresh for as long as the app runs.
pub fn spawn_refresher(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        loop {
            let started = Instant::now();
            let wait = if sync_now(&app).await { REFRESH_EVERY } else { RETRY_AFTER_ERROR };
            tokio::time::sleep(wait.saturating_sub(started.elapsed())).await;
        }
    });
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

fn check_role(role: &str) -> Result<(), String> {
    if ROLES.contains(&role) { Ok(()) } else { Err(format!("rol inválido: {role}")) }
}

#[tauri::command]
pub fn stats_champions(state: State<'_, StatsState>) -> Vec<ChampRow> {
    state.current().map(|l| l.snapshot.champs.clone()).unwrap_or_default()
}

#[tauri::command]
pub fn stats_matchups(state: State<'_, StatsState>, role: String, enemies: Vec<i64>) -> Result<Vec<MatchupRow>, String> {
    check_role(&role)?;
    let Some(loaded) = state.current() else {
        return Ok(Vec::new());
    };
    Ok(enemies
        .iter()
        .flat_map(|enemy| loaded.matchups_by_role_enemy.get(&(role.clone(), *enemy)).into_iter().flatten())
        .map(|&i| loaded.snapshot.matchups[i].clone())
        .collect())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BuildData {
    rows: Vec<BuildRow>,
    /// Benchmark of this champion in this role (Challenger/GM averages).
    champ_bench: Option<BenchRow>,
    /// All champions in this role combined.
    role_bench: Option<BenchRow>,
}

fn sum_bench(role: &str, rows: &[&BenchRow]) -> Option<BenchRow> {
    if rows.is_empty() {
        return None;
    }
    Some(rows.iter().fold(
        BenchRow { role: role.to_string(), champ: 0, games: 0, minutes: 0.0, cs: 0, gold: 0, vision: 0, deaths: 0, damage: 0, kp: 0.0 },
        |acc, b| BenchRow {
            games: acc.games + b.games,
            minutes: acc.minutes + b.minutes,
            cs: acc.cs + b.cs,
            gold: acc.gold + b.gold,
            vision: acc.vision + b.vision,
            deaths: acc.deaths + b.deaths,
            damage: acc.damage + b.damage,
            kp: acc.kp + b.kp,
            ..acc
        },
    ))
}

#[tauri::command]
pub fn stats_build(state: State<'_, StatsState>, role: String, champ: i64) -> Result<BuildData, String> {
    check_role(&role)?;
    let Some(loaded) = state.current() else {
        return Ok(BuildData { rows: Vec::new(), champ_bench: None, role_bench: None });
    };
    let rows = loaded
        .builds_by_role_champ
        .get(&(role.clone(), champ))
        .map(|ids| ids.iter().map(|&i| loaded.snapshot.builds[i].clone()).collect())
        .unwrap_or_default();
    let role_rows: Vec<&BenchRow> = loaded.snapshot.bench.iter().filter(|b| b.role == role).collect();
    Ok(BuildData {
        rows,
        champ_bench: role_rows.iter().find(|b| b.champ == champ).map(|b| (*b).clone()),
        role_bench: sum_bench(&role, &role_rows),
    })
}

#[tauri::command]
pub async fn stats_sync(app: AppHandle) {
    sync_now(&app).await;
}
