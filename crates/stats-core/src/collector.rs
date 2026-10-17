use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Instant;

use rusqlite::Connection;
use serde::Serialize;

use crate::riot::RiotClient;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Progress {
    pub source: &'static str,
    pub message: String,
    pub done: usize,
    pub total: usize,
    pub new_games: usize,
    pub finished: bool,
    pub error: Option<String>,
}

impl Progress {
    pub fn stage(source: &'static str, message: &str) -> Self {
        Self { source, message: message.to_string(), done: 0, total: 0, new_games: 0, finished: false, error: None }
    }
}

pub type Reporter = Arc<dyn Fn(Progress) + Send + Sync>;

/// Shared context for the collectors. `riot` is optional: pro games need no key.
pub struct Collector {
    pub db: Arc<Mutex<Connection>>,
    pub riot: Option<Arc<RiotClient>>,
    pub cancel: Arc<AtomicBool>,
    pub deadline: Option<Instant>,
    pub reporter: Reporter,
}

impl Collector {
    pub fn report(&self, progress: Progress) {
        (self.reporter)(progress);
    }

    /// True when cancelled or past the time budget.
    pub fn cancelled(&self) -> bool {
        self.cancel.load(Ordering::Relaxed) || self.deadline.is_some_and(|d| Instant::now() >= d)
    }

    pub fn with_db<T>(&self, f: impl FnOnce(&mut Connection) -> rusqlite::Result<T>) -> Option<T> {
        let mut conn = self.db.lock().ok()?;
        f(&mut conn).map_err(|e| eprintln!("[stats] db: {e}")).ok()
    }
}
