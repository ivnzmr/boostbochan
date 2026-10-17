//! Runs in GitHub Actions once a day:
//!   1. opens the persistent database (downloaded from the previous run),
//!   2. collects pro games (Leaguepedia) and, if RIOT_API_KEY is set, high-elo soloQ games,
//!   3. prunes old patches and writes the published `stats.json.gz`.
//!
//! Usage: stats-builder --db data/stats.db --out data/stats-v2.json.gz [--minutes 300] [--skip-soloq] [--skip-pro]

use std::path::PathBuf;
use std::sync::atomic::AtomicBool;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use stats_core::collector::{Collector, Progress};
use stats_core::riot::RiotClient;
use stats_core::snapshot::Snapshot;
use stats_core::{db, key, pro, soloq};

const SOLOQ_MAX_PLAYERS: usize = 2000;
const SOLOQ_MATCHES_PER_PLAYER: usize = 20;
const KEEP_PATCHES: i64 = 3;

struct Args {
    db: PathBuf,
    out: PathBuf,
    minutes: u64,
    skip_soloq: bool,
    skip_pro: bool,
}

fn parse_args() -> Result<Args, String> {
    let mut args = Args {
        db: PathBuf::from("data/stats.db"),
        out: PathBuf::from("data/stats-v2.json.gz"),
        minutes: 300,
        skip_soloq: false,
        skip_pro: false,
    };
    let mut it = std::env::args().skip(1);
    while let Some(flag) = it.next() {
        match flag.as_str() {
            "--db" => args.db = it.next().ok_or("--db necesita una ruta")?.into(),
            "--out" => args.out = it.next().ok_or("--out necesita una ruta")?.into(),
            "--minutes" => {
                args.minutes = it.next().ok_or("--minutes necesita un número")?.parse().map_err(|_| "--minutes inválido")?
            }
            "--skip-soloq" => args.skip_soloq = true,
            "--skip-pro" => args.skip_pro = true,
            other => return Err(format!("argumento desconocido: {other}")),
        }
    }
    Ok(args)
}

fn riot_client_from_env() -> Option<Arc<RiotClient>> {
    match std::env::var("RIOT_API_KEY") {
        Ok(k) if key::is_valid_format(k.trim()) => Some(Arc::new(RiotClient::new(k.trim().to_string()))),
        Ok(_) => {
            eprintln!("RIOT_API_KEY con formato inválido: se omite soloQ");
            None
        }
        Err(_) => {
            eprintln!("RIOT_API_KEY no definida: se omite soloQ");
            None
        }
    }
}

#[tokio::main]
async fn main() {
    if let Err(e) = run().await {
        eprintln!("ERROR: {e}");
        std::process::exit(1);
    }
}

async fn run() -> Result<(), String> {
    let args = parse_args()?;
    if let Some(dir) = args.db.parent() {
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    let conn = db::open(&args.db).map_err(|e| format!("base de datos: {e}"))?;
    let collector = Collector {
        db: Arc::new(Mutex::new(conn)),
        riot: riot_client_from_env(),
        cancel: Arc::new(AtomicBool::new(false)),
        deadline: Some(Instant::now() + Duration::from_secs(args.minutes * 60)),
        reporter: Arc::new(|p: Progress| {
            if p.total == 0 || p.done % 25 == 0 || p.done == p.total {
                println!("[{}] {} ({}/{}, nuevas: {})", p.source, p.message, p.done, p.total, p.new_games);
            }
        }),
    };

    // Pro first: fast and needs no key. A failure here must not block soloQ.
    if !args.skip_pro {
        match pro::collect(&collector).await {
            Ok(n) => println!("pro: {n} partidas nuevas"),
            Err(e) => eprintln!("pro: {e}"),
        }
    }
    if !args.skip_soloq && collector.riot.is_some() {
        match soloq::collect(&collector, SOLOQ_MAX_PLAYERS, SOLOQ_MATCHES_PER_PLAYER).await {
            Ok(n) => println!("soloq: {n} partidas nuevas"),
            Err(e) => eprintln!("soloq: {e}"),
        }
    }

    let now = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs() as i64).unwrap_or(0);
    let bytes = {
        let mut conn = collector.db.lock().map_err(|_| "base de datos bloqueada")?;
        let pruned = db::prune_old_patches(&mut conn, KEEP_PATCHES).map_err(|e| e.to_string())?;
        if pruned > 0 {
            conn.execute_batch("VACUUM").map_err(|e| e.to_string())?;
        }
        let snapshot = Snapshot::from_db(&conn, now).map_err(|e| e.to_string())?;
        println!(
            "snapshot: {} soloQ, {} pro, parches {:?}, {} filas de campeón, {} emparejamientos",
            snapshot.soloq_games,
            snapshot.pro_games,
            snapshot.patches,
            snapshot.champs.len(),
            snapshot.matchups.len()
        );
        if snapshot.soloq_games + snapshot.pro_games == 0 {
            return Err("no hay partidas: no se publica un snapshot vacío".into());
        }
        snapshot.to_gzip()?
    };
    if let Some(dir) = args.out.parent() {
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    std::fs::write(&args.out, &bytes).map_err(|e| e.to_string())?;
    println!("escrito {} ({} KB)", args.out.display(), bytes.len() / 1024);
    Ok(())
}
