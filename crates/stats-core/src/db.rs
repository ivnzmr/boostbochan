use std::path::Path;

use rusqlite::{Connection, params};
use serde::{Deserialize, Serialize};

pub const SOURCE_SOLOQ: &str = "soloq";
pub const SOURCE_PRO: &str = "pro";
/// SoloQ queries only use the most recent N patches collected.
const RECENT_PATCHES: i64 = 2;
/// Pro games are bucketed by month (stored in `patch` as `year * 12 + month - 1`);
/// only the newest N months are used and kept.
pub const PRO_MONTHS: i64 = 3;

/// Monotonic month bucket used as the `patch` of pro games.
pub fn month_index(year: i64, month: i64) -> i64 {
    year * 12 + (month - 1)
}

pub const ROLES: &[&str] = &["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"];

#[derive(Debug, Clone, PartialEq)]
pub struct Participant {
    pub champ: i64,
    pub role: String,
    pub team: i64,
    pub win: bool,
}

/// A game is usable only with 10 players, 5 per team, each role filled once per team.
pub fn is_complete_game(players: &[Participant]) -> bool {
    if players.len() != 10 {
        return false;
    }
    let mut teams: Vec<i64> = players.iter().map(|p| p.team).collect();
    teams.sort_unstable();
    teams.dedup();
    teams.len() == 2
        && teams.iter().all(|team| {
            let mut roles: Vec<&str> = players
                .iter()
                .filter(|p| p.team == *team)
                .map(|p| p.role.as_str())
                .collect();
            roles.sort_unstable();
            roles.len() == 5 && roles.iter().zip(sorted_roles()).all(|(a, b)| *a == b)
        })
}

fn sorted_roles() -> Vec<&'static str> {
    let mut roles = ROLES.to_vec();
    roles.sort_unstable();
    roles
}

/// "16.20.123.456" -> 1620
pub fn parse_patch(game_version: &str) -> Option<i64> {
    let mut parts = game_version.split('.');
    let major: i64 = parts.next()?.parse().ok()?;
    let minor: i64 = parts.next()?.parse().ok()?;
    Some(major * 100 + minor)
}

#[derive(Debug, Clone, PartialEq)]
pub struct MatchupPair<'a> {
    pub role: &'a str,
    pub champ: i64,
    pub enemy: i64,
    pub enemy_role: &'a str,
    pub win: bool,
}

/// Every player vs every enemy (25 pairs per side, 50 per game).
pub fn matchup_pairs(players: &[Participant]) -> Vec<MatchupPair<'_>> {
    players
        .iter()
        .flat_map(|p| {
            players.iter().filter(move |q| q.team != p.team).map(move |q| MatchupPair {
                role: &p.role,
                champ: p.champ,
                enemy: q.champ,
                enemy_role: &q.role,
                win: p.win,
            })
        })
        .collect()
}

pub fn open(path: &Path) -> rusqlite::Result<Connection> {
    let conn = Connection::open(path)?;
    conn.execute_batch(
        "PRAGMA journal_mode = WAL;
         CREATE TABLE IF NOT EXISTS matches (
            match_id TEXT PRIMARY KEY, source TEXT NOT NULL, patch INTEGER NOT NULL,
            collected_at INTEGER NOT NULL DEFAULT (unixepoch()));
         CREATE INDEX IF NOT EXISTS matches_source_patch ON matches(source, patch);
         CREATE TABLE IF NOT EXISTS champ_stats (
            source TEXT, patch INTEGER, role TEXT, champ INTEGER,
            games INTEGER NOT NULL, wins INTEGER NOT NULL,
            PRIMARY KEY (source, patch, role, champ));
         CREATE TABLE IF NOT EXISTS matchups (
            source TEXT, patch INTEGER, role TEXT, champ INTEGER, enemy INTEGER, enemy_role TEXT,
            games INTEGER NOT NULL, wins INTEGER NOT NULL,
            PRIMARY KEY (source, patch, role, champ, enemy, enemy_role));
         CREATE INDEX IF NOT EXISTS matchups_lookup ON matchups(role, enemy);
         CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);",
    )?;
    Ok(conn)
}

pub fn has_match(conn: &Connection, match_id: &str) -> rusqlite::Result<bool> {
    conn.query_row("SELECT 1 FROM matches WHERE match_id = ?1", [match_id], |_| Ok(()))
        .map(|_| true)
        .or_else(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => Ok(false),
            other => Err(other),
        })
}

/// Stores one complete game atomically. Returns false if it was already stored or incomplete.
pub fn insert_game(
    conn: &mut Connection,
    source: &str,
    match_id: &str,
    patch: i64,
    players: &[Participant],
) -> rusqlite::Result<bool> {
    if !is_complete_game(players) {
        return Ok(false);
    }
    let tx = conn.transaction()?;
    let inserted = tx.execute(
        "INSERT OR IGNORE INTO matches (match_id, source, patch) VALUES (?1, ?2, ?3)",
        params![match_id, source, patch],
    )?;
    if inserted == 0 {
        return Ok(false);
    }
    {
        let mut champ_stmt = tx.prepare_cached(
            "INSERT INTO champ_stats (source, patch, role, champ, games, wins) VALUES (?1, ?2, ?3, ?4, 1, ?5)
             ON CONFLICT DO UPDATE SET games = games + 1, wins = wins + excluded.wins",
        )?;
        for p in players {
            champ_stmt.execute(params![source, patch, p.role, p.champ, p.win as i64])?;
        }
        let mut pair_stmt = tx.prepare_cached(
            "INSERT INTO matchups (source, patch, role, champ, enemy, enemy_role, games, wins)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, 1, ?7)
             ON CONFLICT DO UPDATE SET games = games + 1, wins = wins + excluded.wins",
        )?;
        for pair in matchup_pairs(players) {
            pair_stmt.execute(params![
                source, patch, pair.role, pair.champ, pair.enemy, pair.enemy_role, pair.win as i64
            ])?;
        }
    }
    tx.commit()?;
    Ok(true)
}

pub fn get_meta(conn: &Connection, key: &str) -> rusqlite::Result<Option<String>> {
    conn.query_row("SELECT value FROM meta WHERE key = ?1", [key], |r| r.get(0))
        .map(Some)
        .or_else(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => Ok(None),
            other => Err(other),
        })
}

pub fn set_meta(conn: &Connection, key: &str, value: &str) -> rusqlite::Result<()> {
    conn.execute(
        "INSERT INTO meta (key, value) VALUES (?1, ?2) ON CONFLICT DO UPDATE SET value = excluded.value",
        [key, value],
    )?;
    Ok(())
}

// Literal 2 = PRO_MONTHS - 1 (three month buckets including the newest).
const RECENT_FILTER: &str = "((source = 'pro' AND patch >= (
    SELECT MAX(patch) FROM matches WHERE source = 'pro') - 2) OR (source = 'soloq' AND patch IN (
    SELECT DISTINCT patch FROM matches WHERE source = 'soloq' ORDER BY patch DESC LIMIT ?1)))";

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChampRow {
    pub source: String,
    pub role: String,
    pub champ: i64,
    pub games: i64,
    pub wins: i64,
}

pub fn champion_rows(conn: &Connection) -> rusqlite::Result<Vec<ChampRow>> {
    let sql = format!(
        "SELECT source, role, champ, SUM(games), SUM(wins) FROM champ_stats
         WHERE {RECENT_FILTER} GROUP BY source, role, champ"
    );
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map([RECENT_PATCHES], |r| {
        Ok(ChampRow { source: r.get(0)?, role: r.get(1)?, champ: r.get(2)?, games: r.get(3)?, wins: r.get(4)? })
    })?;
    rows.collect()
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MatchupRow {
    pub source: String,
    pub role: String,
    pub champ: i64,
    pub enemy: i64,
    pub enemy_role: String,
    pub games: i64,
    pub wins: i64,
}

/// Every aggregated matchup in the recent window (exported to the published snapshot).
pub fn all_matchup_rows(conn: &Connection) -> rusqlite::Result<Vec<MatchupRow>> {
    let sql = format!(
        "SELECT source, role, champ, enemy, enemy_role, SUM(games), SUM(wins) FROM matchups
         WHERE {RECENT_FILTER} GROUP BY source, role, champ, enemy, enemy_role"
    );
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map([RECENT_PATCHES], |r| {
        Ok(MatchupRow {
            source: r.get(0)?,
            role: r.get(1)?,
            champ: r.get(2)?,
            enemy: r.get(3)?,
            enemy_role: r.get(4)?,
            games: r.get(5)?,
            wins: r.get(6)?,
        })
    })?;
    rows.collect()
}

/// Deletes soloQ data older than the newest `keep` patches, and pro data older than
/// `PRO_MONTHS`, so the database stays small.
pub fn prune_old_patches(conn: &mut Connection, keep: i64) -> rusqlite::Result<usize> {
    let tx = conn.transaction()?;
    let newest_pro: Option<i64> = tx.query_row("SELECT MAX(patch) FROM matches WHERE source = 'pro'", [], |r| r.get(0))?;
    let mut removed = 0;
    if let Some(newest) = newest_pro {
        for table in ["matches", "champ_stats", "matchups"] {
            removed += tx.execute(
                &format!("DELETE FROM {table} WHERE source = 'pro' AND patch < ?1"),
                [newest - (PRO_MONTHS - 1)],
            )?;
        }
    }
    let cutoff: Option<i64> = tx
        .query_row(
            "SELECT patch FROM (SELECT DISTINCT patch FROM matches WHERE source = 'soloq' ORDER BY patch DESC LIMIT ?1)
             ORDER BY patch ASC LIMIT 1",
            [keep],
            |r| r.get(0),
        )
        .or_else(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => Ok(None),
            other => Err(other),
        })?;
    let Some(cutoff) = cutoff else {
        tx.commit()?;
        return Ok(removed);
    };
    for table in ["matches", "champ_stats", "matchups"] {
        removed += tx.execute(&format!("DELETE FROM {table} WHERE source = 'soloq' AND patch < ?1"), [cutoff])?;
    }
    tx.commit()?;
    Ok(removed)
}

#[derive(Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Summary {
    pub soloq_games: i64,
    pub pro_games: i64,
    pub patches: Vec<String>,
}

pub fn summary(conn: &Connection) -> rusqlite::Result<Summary> {
    let count = |source: &str| -> rusqlite::Result<i64> {
        let sql = format!("SELECT COUNT(*) FROM matches WHERE source = ?2 AND {RECENT_FILTER}");
        conn.query_row(&sql, params![RECENT_PATCHES, source], |r| r.get(0))
    };
    let mut stmt = conn.prepare(
        "SELECT DISTINCT patch FROM matches WHERE source = 'soloq' ORDER BY patch DESC LIMIT ?1",
    )?;
    let patches = stmt
        .query_map([RECENT_PATCHES], |r| r.get::<_, i64>(0))?
        .map(|p| p.map(|p| format!("{}.{}", p / 100, p % 100)))
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(Summary { soloq_games: count(SOURCE_SOLOQ)?, pro_games: count(SOURCE_PRO)?, patches })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn game(blue_win: bool) -> Vec<Participant> {
        ROLES
            .iter()
            .enumerate()
            .flat_map(|(i, role)| {
                [
                    Participant { champ: 1 + i as i64, role: role.to_string(), team: 100, win: blue_win },
                    Participant { champ: 101 + i as i64, role: role.to_string(), team: 200, win: !blue_win },
                ]
            })
            .collect()
    }

    #[test]
    fn parses_patches() {
        assert_eq!(parse_patch("16.20.712.1234"), Some(1620));
        assert_eq!(parse_patch("16.9.1"), Some(1609));
        assert_eq!(parse_patch("garbage"), None);
    }

    #[test]
    fn detects_complete_games() {
        assert!(is_complete_game(&game(true)));
        let mut missing_role = game(true);
        missing_role[0].role = "JUNGLE".into();
        assert!(!is_complete_game(&missing_role));
        assert!(!is_complete_game(&game(true)[..9]));
    }

    #[test]
    fn builds_fifty_pairs() {
        let players = game(true);
        let pairs = matchup_pairs(&players);
        assert_eq!(pairs.len(), 50);
        let lane = pairs.iter().find(|p| p.champ == 1 && p.enemy == 101).unwrap();
        assert_eq!(lane.role, "TOP");
        assert_eq!(lane.enemy_role, "TOP");
        assert!(lane.win);
    }

    #[test]
    fn inserts_and_queries() {
        let mut conn = open(Path::new(":memory:")).unwrap();
        assert!(insert_game(&mut conn, SOURCE_SOLOQ, "EUW1_1", 1620, &game(true)).unwrap());
        assert!(insert_game(&mut conn, SOURCE_SOLOQ, "EUW1_2", 1620, &game(false)).unwrap());
        // Duplicate is ignored.
        assert!(!insert_game(&mut conn, SOURCE_SOLOQ, "EUW1_1", 1620, &game(true)).unwrap());
        assert!(has_match(&conn, "EUW1_1").unwrap());
        assert!(!has_match(&conn, "EUW1_3").unwrap());

        let champs = champion_rows(&conn).unwrap();
        let top = champs.iter().find(|c| c.champ == 1).unwrap();
        assert_eq!((top.games, top.wins), (2, 1));

        let rows = all_matchup_rows(&conn).unwrap();
        let vs = rows.iter().find(|r| r.role == "TOP" && r.champ == 1 && r.enemy == 101 && r.enemy_role == "TOP").unwrap();
        assert_eq!((vs.games, vs.wins), (2, 1));

        let s = summary(&conn).unwrap();
        assert_eq!(s.soloq_games, 2);
        assert_eq!(s.patches, vec!["16.20"]);
    }

    #[test]
    fn prunes_patches_beyond_keep() {
        let mut conn = open(Path::new(":memory:")).unwrap();
        insert_game(&mut conn, SOURCE_SOLOQ, "a", 1618, &game(true)).unwrap();
        insert_game(&mut conn, SOURCE_SOLOQ, "b", 1619, &game(true)).unwrap();
        insert_game(&mut conn, SOURCE_PRO, "p", month_index(2026, 10), &game(true)).unwrap();
        assert!(prune_old_patches(&mut conn, 1).unwrap() > 0);
        assert!(!has_match(&conn, "a").unwrap());
        assert!(has_match(&conn, "b").unwrap());
        assert!(has_match(&conn, "p").unwrap(), "recent pro games are kept");
        assert_eq!(prune_old_patches(&mut conn, 5).unwrap(), 0);
    }

    #[test]
    fn pro_games_older_than_three_months_are_pruned_and_hidden() {
        let mut conn = open(Path::new(":memory:")).unwrap();
        // December 2025 -> March 2026 crosses a year boundary.
        insert_game(&mut conn, SOURCE_PRO, "dec", month_index(2025, 12), &game(true)).unwrap();
        insert_game(&mut conn, SOURCE_PRO, "jan", month_index(2026, 1), &game(true)).unwrap();
        insert_game(&mut conn, SOURCE_PRO, "mar", month_index(2026, 3), &game(true)).unwrap();
        assert_eq!(summary(&conn).unwrap().pro_games, 2, "only Jan..Mar are recent");
        prune_old_patches(&mut conn, 2).unwrap();
        assert!(!has_match(&conn, "dec").unwrap());
        assert!(has_match(&conn, "jan").unwrap());
    }

    #[test]
    fn stores_meta_values() {
        let conn = open(Path::new(":memory:")).unwrap();
        assert_eq!(get_meta(&conn, "k").unwrap(), None);
        set_meta(&conn, "k", "1").unwrap();
        set_meta(&conn, "k", "2").unwrap();
        assert_eq!(get_meta(&conn, "k").unwrap().as_deref(), Some("2"));
    }

    #[test]
    fn old_patches_are_excluded() {
        let mut conn = open(Path::new(":memory:")).unwrap();
        insert_game(&mut conn, SOURCE_SOLOQ, "a", 1618, &game(true)).unwrap();
        insert_game(&mut conn, SOURCE_SOLOQ, "b", 1619, &game(true)).unwrap();
        insert_game(&mut conn, SOURCE_SOLOQ, "c", 1620, &game(true)).unwrap();
        let top = champion_rows(&conn).unwrap().into_iter().find(|c| c.champ == 1).unwrap();
        assert_eq!(top.games, 2);
    }
}
