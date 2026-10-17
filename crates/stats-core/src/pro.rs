use std::collections::HashMap;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde::Deserialize;

use crate::collector::{Collector, Progress};
use crate::db::{self, Participant, SOURCE_PRO};
use crate::static_data::{self, normalize_name};

const LEAGUEPEDIA_API: &str = "https://lol.fandom.com/api.php";
const USER_AGENT: &str = "BoostBochan/0.1 (LoL companion app; pro matchup stats)";
const PAGE_SIZE: usize = 500;
const MAX_PAGES_PER_RUN: usize = 200;
const LOOKBACK_DAYS: u64 = 90;
const PAGE_DELAY: Duration = Duration::from_secs(5);
const MAX_RATE_LIMIT_RETRIES: u64 = 5;
/// Newest `DateTime_UTC` already downloaded; the next run continues from here.
const CURSOR_KEY: &str = "pro_cursor";

#[derive(Deserialize)]
struct CargoResponse {
    cargoquery: Option<Vec<CargoItem>>,
    error: Option<CargoError>,
}

#[derive(Deserialize)]
struct CargoError {
    code: String,
    info: String,
}

#[derive(Deserialize)]
struct CargoItem {
    title: ProRow,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ProRow {
    #[serde(rename = "Champion")]
    pub champion: String,
    #[serde(rename = "Role")]
    pub role: String,
    #[serde(rename = "PlayerWin")]
    pub player_win: String,
    #[serde(rename = "GameId")]
    pub game_id: String,
    #[serde(rename = "Side")]
    pub side: String,
    /// "2026-10-15 13:20:00"
    #[serde(rename = "DateTime")]
    pub date_time: String,
}

pub fn map_role(role: &str) -> Option<&'static str> {
    match role {
        "Top" => Some("TOP"),
        "Jungle" => Some("JUNGLE"),
        "Mid" => Some("MIDDLE"),
        "Bot" => Some("BOTTOM"),
        "Support" => Some("UTILITY"),
        _ => None,
    }
}

/// "2026-10-15 13:20:00" -> month bucket.
pub fn month_of(date_time: &str) -> Option<i64> {
    let year: i64 = date_time.get(0..4)?.parse().ok()?;
    let month: i64 = date_time.get(5..7)?.parse().ok()?;
    (1..=12).contains(&month).then(|| db::month_index(year, month))
}

/// Converts Leaguepedia rows of one game into participants; `None` if any row can't be mapped.
pub fn to_participants(rows: &[ProRow], champions: &HashMap<String, i64>) -> Option<Vec<Participant>> {
    rows.iter()
        .map(|row| {
            Some(Participant {
                champ: *champions.get(&normalize_name(&row.champion))?,
                role: map_role(&row.role)?.to_string(),
                team: match row.side.as_str() {
                    "1" => 100,
                    "2" => 200,
                    _ => return None,
                },
                win: row.player_win == "Yes",
                details: None,
            })
        })
        .collect()
}

/// Days since epoch -> (year, month, day). Howard Hinnant's civil_from_days.
pub fn civil_from_days(days: i64) -> (i64, u32, u32) {
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let month = if mp < 10 { mp + 3 } else { mp - 9 } as u32;
    let year = yoe + era * 400 + i64::from(month <= 2);
    (year, month, day)
}

fn lookback_start() -> String {
    let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_secs();
    let days = (now / 86_400).saturating_sub(LOOKBACK_DAYS) as i64;
    let (y, m, d) = civil_from_days(days);
    format!("{y:04}-{m:02}-{d:02} 00:00:00")
}

/// Resume from the stored cursor, but never further back than the lookback window.
/// Both are "YYYY-MM-DD HH:MM:SS", so string comparison is chronological.
pub fn start_cursor(stored: Option<String>, lookback: String) -> String {
    stored.filter(|c| *c > lookback).unwrap_or(lookback)
}

/// Rows at or after `cursor`, oldest first. `>=` re-fetches the boundary game so a
/// game split across two pages is always completed (inserts are deduplicated).
async fn fetch_page(http: &reqwest::Client, cursor: &str) -> Result<Vec<ProRow>, String> {
    let where_clause = format!("SP.DateTime_UTC >= '{cursor}'");
    let limit = PAGE_SIZE.to_string();
    let query = [
        ("action", "cargoquery"),
        ("format", "json"),
        ("tables", "ScoreboardPlayers=SP"),
        (
            "fields",
            "SP.Champion=Champion,SP.Role=Role,SP.PlayerWin=PlayerWin,SP.GameId=GameId,SP.Side=Side,SP.DateTime_UTC=DateTime",
        ),
        ("where", where_clause.as_str()),
        ("order_by", "SP.DateTime_UTC ASC,SP.GameId"),
        ("limit", limit.as_str()),
    ];

    for attempt in 1..=MAX_RATE_LIMIT_RETRIES {
        let response: CargoResponse = http
            .get(LEAGUEPEDIA_API)
            .query(&query)
            .send().await.map_err(|e| format!("Leaguepedia: {e}"))?
            .json().await.map_err(|e| format!("Leaguepedia respuesta inválida: {e}"))?;
        match (response.cargoquery, response.error) {
            (Some(items), _) => return Ok(items.into_iter().map(|i| i.title).collect()),
            (None, Some(err)) if err.code == "ratelimited" => {
                tokio::time::sleep(Duration::from_secs(45 * attempt)).await;
            }
            (None, Some(err)) => return Err(format!("Leaguepedia: {}", err.info)),
            (None, None) => return Ok(Vec::new()),
        }
    }
    Err("Leaguepedia sigue limitando peticiones; se continuará en la próxima ejecución".into())
}

/// Stores every complete game; returns how many were new.
fn store_games(c: &Collector, games: &HashMap<String, Vec<ProRow>>, champions: &HashMap<String, i64>) -> usize {
    games
        .iter()
        .filter_map(|(id, rows)| {
            let month = month_of(&rows.first()?.date_time)?;
            Some((id, month, to_participants(rows, champions)?))
        })
        .filter(|(id, month, players)| {
            c.with_db(|conn| db::insert_game(conn, SOURCE_PRO, &format!("pro:{id}"), *month, players))
                .unwrap_or(false)
        })
        .count()
}

/// Downloads professional games newer than the stored cursor (first run: last 90 days).
/// Safe to interrupt: progress is saved after every page.
pub async fn collect(c: &Collector) -> Result<usize, String> {
    let http = reqwest::Client::builder()
        .user_agent(USER_AGENT)
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|e| e.to_string())?;

    c.report(Progress::stage(SOURCE_PRO, "Cargando campeones…"));
    let champions = static_data::load().await?.champion_ids;
    let stored = c.with_db(|conn| db::get_meta(conn, CURSOR_KEY)).flatten();
    let mut cursor = start_cursor(stored, lookback_start());
    let mut new_games = 0;

    for page in 0..MAX_PAGES_PER_RUN {
        if c.cancelled() {
            break;
        }
        let rows = match fetch_page(&http, &cursor).await {
            Ok(rows) => rows,
            Err(e) if new_games > 0 => {
                eprintln!("[pro] descarga parcial ({new_games} partidas nuevas): {e}");
                break;
            }
            Err(e) => return Err(e),
        };
        let last_page = rows.len() < PAGE_SIZE;
        let Some(next_cursor) = rows.iter().map(|r| r.date_time.clone()).max() else {
            break;
        };

        let mut games: HashMap<String, Vec<ProRow>> = HashMap::new();
        for row in rows {
            games.entry(row.game_id.clone()).or_default().push(row);
        }
        new_games += store_games(c, &games, &champions);

        // A full page that doesn't move the cursor would loop forever.
        if next_cursor == cursor && !last_page {
            eprintln!("[pro] demasiadas filas con la misma fecha ({cursor}); se detiene");
            break;
        }
        cursor = next_cursor;
        c.with_db(|conn| db::set_meta(conn, CURSOR_KEY, &cursor));
        c.report(Progress {
            done: page + 1,
            total: MAX_PAGES_PER_RUN,
            new_games,
            ..Progress::stage(SOURCE_PRO, &format!("Partidas pro hasta {cursor}"))
        });
        if last_page {
            break;
        }
        tokio::time::sleep(PAGE_DELAY).await;
    }
    Ok(new_games)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn row(champion: &str, role: &str, side: &str, win: &str) -> ProRow {
        ProRow {
            champion: champion.into(),
            role: role.into(),
            player_win: win.into(),
            game_id: "G1".into(),
            side: side.into(),
            date_time: "2026-10-15 13:20:00".into(),
        }
    }

    #[test]
    fn normalizes_names() {
        assert_eq!(normalize_name("Kai'Sa"), "kaisa");
        assert_eq!(normalize_name("Nunu & Willump"), "nunuwillump");
        assert_eq!(normalize_name("Dr. Mundo"), "drmundo");
    }

    #[test]
    fn maps_roles() {
        assert_eq!(map_role("Mid"), Some("MIDDLE"));
        assert_eq!(map_role("Support"), Some("UTILITY"));
        assert_eq!(map_role("Coach"), None);
    }

    #[test]
    fn parses_month_buckets() {
        assert_eq!(month_of("2026-10-15 13:20:00"), Some(db::month_index(2026, 10)));
        assert_eq!(month_of("2026-13-01 00:00:00"), None);
        assert_eq!(month_of("bad"), None);
        assert_eq!(db::month_index(2026, 1) - db::month_index(2025, 12), 1);
    }

    #[test]
    fn cursor_never_goes_before_lookback() {
        let lookback = "2026-07-19 00:00:00".to_string();
        assert_eq!(start_cursor(None, lookback.clone()), lookback);
        assert_eq!(start_cursor(Some("2026-01-01 00:00:00".into()), lookback.clone()), lookback);
        assert_eq!(start_cursor(Some("2026-10-01 10:00:00".into()), lookback), "2026-10-01 10:00:00");
    }

    #[test]
    fn converts_rows() {
        let champions = HashMap::from([("kaisa".to_string(), 145), ("ahri".to_string(), 103)]);
        let players = to_participants(
            &[row("Kai'Sa", "Bot", "1", "Yes"), row("Ahri", "Mid", "2", "No")],
            &champions,
        )
        .unwrap();
        assert_eq!(players[0], Participant { champ: 145, role: "BOTTOM".into(), team: 100, win: true, details: None });
        assert_eq!(players[1].team, 200);
        assert!(!players[1].win);
    }

    #[test]
    fn unknown_champion_rejects_game() {
        let champions = HashMap::new();
        assert!(to_participants(&[row("Nobody", "Top", "1", "Yes")], &champions).is_none());
    }

    /// Hits Leaguepedia and Data Dragon. Run with `cargo test -- --ignored live_`.
    #[tokio::test]
    #[ignore]
    async fn live_leaguepedia_page_maps_to_games() {
        let http = reqwest::Client::builder().user_agent(USER_AGENT).build().unwrap();
        let champions = static_data::load().await.unwrap().champion_ids;
        let rows = fetch_page(&http, &lookback_start()).await.unwrap();
        let mut games: HashMap<String, Vec<ProRow>> = HashMap::new();
        for row in rows.iter().cloned() {
            games.entry(row.game_id.clone()).or_default().push(row);
        }
        let usable = games
            .values()
            .filter_map(|r| to_participants(r, &champions))
            .filter(|p| db::is_complete_game(p))
            .count();
        println!("rows={} games={} usable={}", rows.len(), games.len(), usable);
        assert!(usable > 0);
    }

    #[test]
    fn computes_civil_dates() {
        assert_eq!(civil_from_days(0), (1970, 1, 1));
        assert_eq!(civil_from_days(20_743), (2026, 10, 17));
        assert_eq!(civil_from_days(11_016), (2000, 2, 29));
    }
}
