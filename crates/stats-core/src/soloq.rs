use std::collections::HashMap;

use serde::Deserialize;

use crate::build_db::PlayerDetails;
use crate::builds::{self, ItemEvent};
use crate::collector::{Collector, Progress};
use crate::db::{self, Participant, SOURCE_SOLOQ};
use crate::riot::{Host, RiotClient, RiotError};
use crate::static_data::{self, StaticData};

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

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
struct StatPerks {
    defense: i64,
    flex: i64,
    offense: i64,
}

#[derive(Deserialize)]
struct Selection {
    perk: i64,
}

#[derive(Deserialize)]
struct Style {
    description: String,
    style: i64,
    selections: Vec<Selection>,
}

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
struct Perks {
    stat_perks: StatPerks,
    styles: Vec<Style>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ParticipantDto {
    participant_id: i64,
    champion_id: i64,
    team_position: String,
    team_id: i64,
    win: bool,
    #[serde(default)]
    perks: Perks,
    summoner1_id: i64,
    summoner2_id: i64,
    item0: i64,
    item1: i64,
    item2: i64,
    item3: i64,
    item4: i64,
    item5: i64,
    total_minions_killed: i64,
    neutral_minions_killed: i64,
    gold_earned: i64,
    vision_score: i64,
    kills: i64,
    deaths: i64,
    assists: i64,
    total_damage_dealt_to_champions: i64,
}

#[derive(Deserialize)]
struct TimelineDto {
    info: TimelineInfo,
}

#[derive(Deserialize)]
struct TimelineInfo {
    frames: Vec<Frame>,
}

#[derive(Deserialize)]
struct Frame {
    events: Vec<TimelineEvent>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct TimelineEvent {
    #[serde(rename = "type")]
    kind: String,
    participant_id: Option<i64>,
    item_id: Option<i64>,
    before_id: Option<i64>,
    skill_slot: Option<u8>,
    level_up_type: Option<String>,
}

/// Per participant: item purchase/undo events and skill-up slots, in order.
#[derive(Default)]
struct TimelineSummary {
    items: HashMap<i64, Vec<ItemEvent>>,
    skills: HashMap<i64, Vec<u8>>,
}

fn summarize_timeline(timeline: &TimelineDto) -> TimelineSummary {
    let mut summary = TimelineSummary::default();
    for event in timeline.info.frames.iter().flat_map(|f| &f.events) {
        let Some(pid) = event.participant_id else { continue };
        match event.kind.as_str() {
            "ITEM_PURCHASED" => {
                if let Some(item) = event.item_id {
                    summary.items.entry(pid).or_default().push(ItemEvent::Purchased(item));
                }
            }
            "ITEM_UNDO" => {
                if let Some(item) = event.before_id.filter(|id| *id > 0) {
                    summary.items.entry(pid).or_default().push(ItemEvent::Undo(item));
                }
            }
            "SKILL_LEVEL_UP" if event.level_up_type.as_deref() == Some("NORMAL") => {
                if let Some(slot) = event.skill_slot {
                    summary.skills.entry(pid).or_default().push(slot);
                }
            }
            _ => {}
        }
    }
    summary
}

fn rune_key(perks: &Perks) -> Option<String> {
    let style = |name: &str| perks.styles.iter().find(|s| s.description == name);
    let primary = style("primaryStyle")?;
    let sub = style("subStyle")?;
    let ids = |s: &Style| s.selections.iter().map(|x| x.perk).collect::<Vec<_>>();
    let shards = [perks.stat_perks.offense, perks.stat_perks.flex, perks.stat_perks.defense];
    builds::rune_key(primary.style, sub.style, &ids(primary), &ids(sub), shards)
}

fn to_participants(info: &MatchInfo, timeline: Option<&TimelineSummary>, data: &StaticData) -> Vec<Participant> {
    let minutes = info.game_duration as f64 / 60.0;
    let team_kills = |team: i64| -> i64 { info.participants.iter().filter(|p| p.team_id == team).map(|p| p.kills).sum() };

    info.participants
        .iter()
        .map(|p| {
            let enemies_ap: Vec<bool> = info
                .participants
                .iter()
                .filter(|q| q.team_id != p.team_id)
                .map(|q| data.is_ap.get(&q.champion_id).copied().unwrap_or(false))
                .collect();
            let kills = team_kills(p.team_id);
            let details = PlayerDetails {
                bucket: builds::damage_bucket(&enemies_ap),
                items: builds::final_items(&[p.item0, p.item1, p.item2, p.item3, p.item4, p.item5]),
                core: timeline
                    .and_then(|t| t.items.get(&p.participant_id))
                    .and_then(|events| builds::core_key(events, &data.completed_items)),
                runes: rune_key(&p.perks),
                spells: builds::spell_key(p.summoner1_id, p.summoner2_id),
                skills: timeline
                    .and_then(|t| t.skills.get(&p.participant_id))
                    .and_then(|slots| builds::skill_key(slots)),
                minutes,
                cs: p.total_minions_killed + p.neutral_minions_killed,
                gold: p.gold_earned,
                vision: p.vision_score,
                deaths: p.deaths,
                damage: p.total_damage_dealt_to_champions,
                kp: if kills > 0 { (p.kills + p.assists) as f64 / kills as f64 } else { 0.0 },
            };
            Participant {
                champ: p.champion_id,
                role: p.team_position.clone(),
                team: p.team_id,
                win: p.win,
                details: Some(details),
            }
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

async fn collect_match(c: &Collector, riot: &RiotClient, data: &StaticData, match_id: &str) -> Result<bool, RiotError> {
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
    // The timeline adds skill order and item purchase order; the game is still useful without it.
    let timeline = match riot.get::<TimelineDto>(Host::Region, &format!("/lol/match/v5/matches/{match_id}/timeline")).await {
        Ok(t) => Some(summarize_timeline(&t)),
        Err(RiotError::InvalidKey) => return Err(RiotError::InvalidKey),
        Err(e) => {
            eprintln!("[soloq] timeline {match_id}: {e}");
            None
        }
    };
    let players = to_participants(&m.info, timeline.as_ref(), data);
    Ok(c
        .with_db(|conn| db::insert_game(conn, SOURCE_SOLOQ, match_id, patch, &players))
        .unwrap_or(false))
}

/// Samples recent ranked games of the top EUW players (Challenger + Grandmaster).
pub async fn collect(c: &Collector, max_players: usize, per_player: usize) -> Result<usize, String> {
    let riot = c.riot.as_deref().ok_or("no hay API key de Riot: se omite soloQ")?;
    c.report(Progress::stage(SOURCE_SOLOQ, "Cargando datos estáticos…"));
    let data = static_data::load().await?;
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
            match collect_match(c, riot, &data, &id).await {
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn summarizes_timeline_events() {
        let json = r#"{"info":{"frames":[{"events":[
            {"type":"ITEM_PURCHASED","participantId":1,"itemId":1055},
            {"type":"SKILL_LEVEL_UP","participantId":1,"skillSlot":1,"levelUpType":"NORMAL"},
            {"type":"SKILL_LEVEL_UP","participantId":1,"skillSlot":4,"levelUpType":"EVOLVE"},
            {"type":"ITEM_UNDO","participantId":1,"beforeId":1055,"afterId":0},
            {"type":"WARD_PLACED","participantId":1}
        ]}]}}"#;
        let timeline: TimelineDto = serde_json::from_str(json).unwrap();
        let summary = summarize_timeline(&timeline);
        assert_eq!(summary.items[&1], vec![ItemEvent::Purchased(1055), ItemEvent::Undo(1055)]);
        assert_eq!(summary.skills[&1], vec![1], "EVOLVE level-ups are ignored");
    }

    #[test]
    fn parses_rune_page_from_match() {
        let json = r#"{"statPerks":{"defense":5001,"flex":5008,"offense":5005},"styles":[
            {"description":"primaryStyle","style":8000,"selections":[{"perk":8010},{"perk":9111},{"perk":9104},{"perk":8299}]},
            {"description":"subStyle","style":8300,"selections":[{"perk":8304},{"perk":8347}]}]}"#;
        let perks: Perks = serde_json::from_str(json).unwrap();
        assert_eq!(rune_key(&perks).unwrap(), "8000:8300:8010,9111,9104,8299:8304,8347:5005,5008,5001");
    }
}
