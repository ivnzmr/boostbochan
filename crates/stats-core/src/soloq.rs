use serde::Deserialize;

use crate::collector::{Collector, Progress};
use crate::db::{self, Participant, SOURCE_SOLOQ};
use crate::riot::{Host, RiotClient, RiotError};

const RANKED_SOLO_QUEUE: i64 = 420;
/// Shorter games are remakes and would add noise.
const MIN_GAME_SECONDS: i64 = 300;
const LEAGUES: &[&str] = &["challengerleagues", "grandmasterleagues"];

#[derive(Deserialize)]
struct League {
    entries: Vec<LeagueEntry>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct LeagueEntry {
    puuid: Option<String>,
    league_points: i64,
}

#[derive(Deserialize)]
struct MatchDto {
    info: MatchInfo,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct MatchInfo {
    game_version: String,
    game_duration: i64,
    queue_id: i64,
    participants: Vec<ParticipantDto>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ParticipantDto {
    champion_id: i64,
    team_position: String,
    team_id: i64,
    win: bool,
}

fn to_participants(info: &MatchInfo) -> Vec<Participant> {
    info.participants
        .iter()
        .map(|p| Participant {
            champ: p.champion_id,
            role: p.team_position.clone(),
            team: p.team_id,
            win: p.win,
        })
        .collect()
}

async fn top_players(riot: &RiotClient, max_players: usize) -> Result<Vec<String>, RiotError> {
    let mut entries = Vec::new();
    for league in LEAGUES {
        let path = format!("/lol/league/v4/{league}/by-queue/RANKED_SOLO_5x5");
        let data: League = riot.get(Host::Platform, &path).await?;
        entries.extend(data.entries);
    }
    entries.sort_by(|a, b| b.league_points.cmp(&a.league_points));
    Ok(entries.into_iter().filter_map(|e| e.puuid).take(max_players).collect())
}

async fn collect_match(c: &Collector, riot: &RiotClient, match_id: &str) -> Result<bool, RiotError> {
    let already = c.with_db(|conn| db::has_match(conn, match_id)).unwrap_or(false);
    if already {
        return Ok(false);
    }
    let m: MatchDto = riot.get(Host::Region, &format!("/lol/match/v5/matches/{match_id}")).await?;
    if m.info.queue_id != RANKED_SOLO_QUEUE || m.info.game_duration < MIN_GAME_SECONDS {
        return Ok(false);
    }
    let Some(patch) = db::parse_patch(&m.info.game_version) else {
        return Ok(false);
    };
    let players = to_participants(&m.info);
    Ok(c
        .with_db(|conn| db::insert_game(conn, SOURCE_SOLOQ, match_id, patch, &players))
        .unwrap_or(false))
}

/// Samples recent ranked games of the top EUW players (Challenger + Grandmaster).
pub async fn collect(c: &Collector, max_players: usize, per_player: usize) -> Result<usize, String> {
    let riot = c.riot.as_deref().ok_or("no hay API key de Riot: se omite soloQ")?;
    c.report(Progress::stage(SOURCE_SOLOQ, "Leyendo Challenger y Grandmaster…"));
    let players = top_players(riot, max_players).await.map_err(|e| e.to_string())?;
    let total = players.len();
    let mut new_games = 0;

    for (index, puuid) in players.iter().enumerate() {
        if c.cancelled() {
            break;
        }
        let path = format!(
            "/lol/match/v5/matches/by-puuid/{puuid}/ids?queue={RANKED_SOLO_QUEUE}&type=ranked&start=0&count={per_player}"
        );
        let ids: Vec<String> = match riot.get(Host::Region, &path).await {
            Ok(ids) => ids,
            Err(RiotError::InvalidKey) => return Err(RiotError::InvalidKey.to_string()),
            Err(_) => continue,
        };
        for id in ids {
            if c.cancelled() {
                break;
            }
            match collect_match(c, riot, &id).await {
                Ok(true) => new_games += 1,
                Ok(false) => {}
                Err(RiotError::InvalidKey) => return Err(RiotError::InvalidKey.to_string()),
                Err(e) => eprintln!("[soloq] {id}: {e}"),
            }
        }
        c.report(Progress {
            done: index + 1,
            total,
            new_games,
            ..Progress::stage(SOURCE_SOLOQ, "Analizando partidas de jugadores top…")
        });
    }
    Ok(new_games)
}
