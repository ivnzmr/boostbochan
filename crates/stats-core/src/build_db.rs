//! Storage of builds (items, core, runes, spells, skills) and per-role performance
//! benchmarks, aggregated from soloQ games.

use rusqlite::{Connection, Transaction, params};
use serde::{Deserialize, Serialize};

use crate::builds::{KIND_CORE, KIND_ITEM, KIND_RUNE, KIND_SPELL, KIND_SKILL};
use crate::db::{Participant, RECENT_FILTER, RECENT_PATCHES};

/// Bucket value for build kinds that don't depend on the enemy team.
pub const BUCKET_ANY: u8 = 255;

#[derive(Debug, Clone, PartialEq, Default)]
pub struct PlayerDetails {
    /// Enemy team damage profile (see `builds::damage_bucket`).
    pub bucket: u8,
    pub items: Vec<i64>,
    pub core: Option<String>,
    pub runes: Option<String>,
    pub spells: String,
    pub skills: Option<String>,
    pub minutes: f64,
    pub cs: i64,
    pub gold: i64,
    pub vision: i64,
    pub deaths: i64,
    pub damage: i64,
    /// Kill participation, 0..=1.
    pub kp: f64,
}

pub fn create_tables(conn: &Connection) -> rusqlite::Result<()> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS build_stats (
            source TEXT, patch INTEGER, role TEXT, champ INTEGER, kind TEXT, bucket INTEGER, key TEXT,
            games INTEGER NOT NULL, wins INTEGER NOT NULL,
            PRIMARY KEY (source, patch, role, champ, kind, bucket, key));
         CREATE TABLE IF NOT EXISTS bench (
            source TEXT, patch INTEGER, role TEXT, champ INTEGER,
            games INTEGER NOT NULL, minutes REAL NOT NULL, cs INTEGER NOT NULL, gold INTEGER NOT NULL,
            vision INTEGER NOT NULL, deaths INTEGER NOT NULL, damage INTEGER NOT NULL, kp REAL NOT NULL,
            PRIMARY KEY (source, patch, role, champ));",
    )
}

fn build_entries(d: &PlayerDetails) -> Vec<(&'static str, u8, String)> {
    let mut entries: Vec<(&'static str, u8, String)> =
        d.items.iter().map(|item| (KIND_ITEM, d.bucket, item.to_string())).collect();
    if let Some(core) = &d.core {
        entries.push((KIND_CORE, d.bucket, core.clone()));
    }
    if let Some(runes) = &d.runes {
        entries.push((KIND_RUNE, BUCKET_ANY, runes.clone()));
    }
    if !d.spells.is_empty() {
        entries.push((KIND_SPELL, BUCKET_ANY, d.spells.clone()));
    }
    if let Some(skills) = &d.skills {
        entries.push((KIND_SKILL, BUCKET_ANY, skills.clone()));
    }
    entries
}

pub fn insert_details(tx: &Transaction, source: &str, patch: i64, players: &[Participant]) -> rusqlite::Result<()> {
    let mut build_stmt = tx.prepare_cached(
        "INSERT INTO build_stats (source, patch, role, champ, kind, bucket, key, games, wins)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 1, ?8)
         ON CONFLICT DO UPDATE SET games = games + 1, wins = wins + excluded.wins",
    )?;
    let mut bench_stmt = tx.prepare_cached(
        "INSERT INTO bench (source, patch, role, champ, games, minutes, cs, gold, vision, deaths, damage, kp)
         VALUES (?1, ?2, ?3, ?4, 1, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
         ON CONFLICT DO UPDATE SET games = games + 1, minutes = minutes + excluded.minutes,
            cs = cs + excluded.cs, gold = gold + excluded.gold, vision = vision + excluded.vision,
            deaths = deaths + excluded.deaths, damage = damage + excluded.damage, kp = kp + excluded.kp",
    )?;
    for p in players {
        let Some(d) = &p.details else { continue };
        for (kind, bucket, key) in build_entries(d) {
            build_stmt.execute(params![source, patch, p.role, p.champ, kind, bucket, key, p.win as i64])?;
        }
        bench_stmt.execute(params![
            source, patch, p.role, p.champ, d.minutes, d.cs, d.gold, d.vision, d.deaths, d.damage, d.kp
        ])?;
    }
    Ok(())
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BuildRow {
    pub source: String,
    pub role: String,
    pub champ: i64,
    pub kind: String,
    pub bucket: u8,
    pub key: String,
    pub games: i64,
    pub wins: i64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BenchRow {
    pub role: String,
    pub champ: i64,
    pub games: i64,
    pub minutes: f64,
    pub cs: i64,
    pub gold: i64,
    pub vision: i64,
    pub deaths: i64,
    pub damage: i64,
    pub kp: f64,
}

/// Keys seen fewer times than this are dropped from the export (noise, file size).
const MIN_EXPORT_GAMES: i64 = 2;

pub fn build_rows(conn: &Connection) -> rusqlite::Result<Vec<BuildRow>> {
    let sql = format!(
        "SELECT source, role, champ, kind, bucket, key, SUM(games) AS g, SUM(wins) FROM build_stats
         WHERE {RECENT_FILTER} GROUP BY source, role, champ, kind, bucket, key HAVING g >= {MIN_EXPORT_GAMES}"
    );
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map([RECENT_PATCHES], |r| {
        Ok(BuildRow {
            source: r.get(0)?,
            role: r.get(1)?,
            champ: r.get(2)?,
            kind: r.get(3)?,
            bucket: r.get(4)?,
            key: r.get(5)?,
            games: r.get(6)?,
            wins: r.get(7)?,
        })
    })?;
    rows.collect()
}

pub fn bench_rows(conn: &Connection) -> rusqlite::Result<Vec<BenchRow>> {
    let sql = format!(
        "SELECT role, champ, SUM(games), SUM(minutes), SUM(cs), SUM(gold), SUM(vision), SUM(deaths), SUM(damage), SUM(kp)
         FROM bench WHERE {RECENT_FILTER} GROUP BY role, champ HAVING SUM(games) >= {MIN_EXPORT_GAMES}"
    );
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map([RECENT_PATCHES], |r| {
        Ok(BenchRow {
            role: r.get(0)?,
            champ: r.get(1)?,
            games: r.get(2)?,
            minutes: r.get(3)?,
            cs: r.get(4)?,
            gold: r.get(5)?,
            vision: r.get(6)?,
            deaths: r.get(7)?,
            damage: r.get(8)?,
            kp: r.get(9)?,
        })
    })?;
    rows.collect()
}

#[cfg(test)]
mod tests {
    use std::path::Path;

    use super::*;
    use crate::db::{self, ROLES, SOURCE_SOLOQ};

    fn details(win_item: i64) -> PlayerDetails {
        PlayerDetails {
            bucket: 1,
            items: vec![win_item, 3047],
            core: Some("3078-6333-3053".into()),
            runes: Some("8000:8300:1,2,3,4:5,6:5005,5008,5001".into()),
            spells: "4,14".into(),
            skills: Some("QEW|QWE".into()),
            minutes: 30.0,
            cs: 240,
            gold: 12000,
            vision: 25,
            deaths: 3,
            damage: 20000,
            kp: 0.5,
        }
    }

    fn game(match_seed: i64) -> Vec<Participant> {
        ROLES
            .iter()
            .enumerate()
            .flat_map(|(i, role)| {
                [100, 200].map(|team| Participant {
                    champ: team + i as i64,
                    role: role.to_string(),
                    team,
                    win: team == 100,
                    details: Some(details(3000 + match_seed)),
                })
            })
            .collect()
    }

    #[test]
    fn aggregates_builds_and_benchmarks() {
        let mut conn = db::open(Path::new(":memory:")).unwrap();
        db::insert_game(&mut conn, SOURCE_SOLOQ, "m1", 1620, &game(1)).unwrap();
        db::insert_game(&mut conn, SOURCE_SOLOQ, "m2", 1620, &game(1)).unwrap();
        db::insert_game(&mut conn, SOURCE_SOLOQ, "m3", 1620, &game(2)).unwrap();

        let rows = build_rows(&conn).unwrap();
        let top = |kind: &str| rows.iter().filter(|r| r.champ == 100 && r.kind == kind).collect::<Vec<_>>();
        let spells = top(KIND_SPELL);
        assert_eq!((spells[0].key.as_str(), spells[0].games, spells[0].wins, spells[0].bucket), ("4,14", 3, 3, BUCKET_ANY));
        let items = top(KIND_ITEM);
        assert!(items.iter().any(|r| r.key == "3001" && r.games == 2 && r.bucket == 1));
        assert!(!items.iter().any(|r| r.key == "3002"), "single-game keys are not exported");
        assert_eq!(top(KIND_CORE)[0].games, 3);

        let bench = bench_rows(&conn).unwrap();
        let b = bench.iter().find(|b| b.champ == 100).unwrap();
        assert_eq!((b.games, b.cs, b.minutes), (3, 720, 90.0));
    }

    #[test]
    fn players_without_details_store_nothing() {
        let mut conn = db::open(Path::new(":memory:")).unwrap();
        let players: Vec<Participant> = game(1).into_iter().map(|p| Participant { details: None, ..p }).collect();
        db::insert_game(&mut conn, SOURCE_SOLOQ, "m1", 1620, &players).unwrap();
        assert!(build_rows(&conn).unwrap().is_empty());
        assert!(bench_rows(&conn).unwrap().is_empty());
    }
}
