//! The published statistics file (`stats.json.gz`): built by `stats-builder`
//! in CI, downloaded by every installed app. No API key is needed to read it.

use std::io::{Read, Write};

use flate2::Compression;
use flate2::read::GzDecoder;
use flate2::write::GzEncoder;
use rusqlite::Connection;
use serde::{Deserialize, Serialize};

use crate::db::{self, ChampRow, MatchupRow, ROLES, SOURCE_PRO, SOURCE_SOLOQ};

pub const FORMAT_VERSION: u32 = 1;
/// Refuse absurdly large downloads (protects the app from a corrupted/hostile file).
const MAX_DECOMPRESSED_BYTES: u64 = 200 * 1024 * 1024;
const SOURCES: [&str; 2] = [SOURCE_SOLOQ, SOURCE_PRO];

#[derive(Debug, Clone, PartialEq)]
pub struct Snapshot {
    pub generated_at: i64,
    pub patches: Vec<String>,
    pub soloq_games: i64,
    pub pro_games: i64,
    pub champs: Vec<ChampRow>,
    pub matchups: Vec<MatchupRow>,
}

/// Compact on-disk form: sources and roles as small indexes, rows as arrays.
#[derive(Serialize, Deserialize)]
struct CompactFile {
    v: u32,
    generated_at: i64,
    patches: Vec<String>,
    soloq_games: i64,
    pro_games: i64,
    /// [source, role, champ, games, wins]
    champs: Vec<(u8, u8, i64, i64, i64)>,
    /// [source, role, champ, enemy, enemy_role, games, wins]
    matchups: Vec<(u8, u8, i64, i64, u8, i64, i64)>,
}

fn index_of(list: &[&str], value: &str) -> Result<u8, String> {
    list.iter()
        .position(|v| *v == value)
        .map(|i| i as u8)
        .ok_or_else(|| format!("valor desconocido: {value}"))
}

fn name_at<'a>(list: &[&'a str], index: u8) -> Result<&'a str, String> {
    list.get(index as usize).copied().ok_or_else(|| format!("índice fuera de rango: {index}"))
}

fn check_counts(games: i64, wins: i64) -> Result<(), String> {
    if games < 0 || wins < 0 || wins > games {
        return Err(format!("conteo inválido: {wins}/{games}"));
    }
    Ok(())
}

impl Snapshot {
    pub fn from_db(conn: &Connection, generated_at: i64) -> rusqlite::Result<Self> {
        let summary = db::summary(conn)?;
        Ok(Self {
            generated_at,
            patches: summary.patches,
            soloq_games: summary.soloq_games,
            pro_games: summary.pro_games,
            champs: db::champion_rows(conn)?,
            matchups: db::all_matchup_rows(conn)?,
        })
    }

    pub fn to_gzip(&self) -> Result<Vec<u8>, String> {
        let compact = CompactFile {
            v: FORMAT_VERSION,
            generated_at: self.generated_at,
            patches: self.patches.clone(),
            soloq_games: self.soloq_games,
            pro_games: self.pro_games,
            champs: self
                .champs
                .iter()
                .map(|c| Ok((index_of(&SOURCES, &c.source)?, index_of(ROLES, &c.role)?, c.champ, c.games, c.wins)))
                .collect::<Result<_, String>>()?,
            matchups: self
                .matchups
                .iter()
                .map(|m| {
                    Ok((
                        index_of(&SOURCES, &m.source)?,
                        index_of(ROLES, &m.role)?,
                        m.champ,
                        m.enemy,
                        index_of(ROLES, &m.enemy_role)?,
                        m.games,
                        m.wins,
                    ))
                })
                .collect::<Result<_, String>>()?,
        };
        let json = serde_json::to_vec(&compact).map_err(|e| e.to_string())?;
        let mut encoder = GzEncoder::new(Vec::new(), Compression::best());
        encoder.write_all(&json).map_err(|e| e.to_string())?;
        encoder.finish().map_err(|e| e.to_string())
    }

    /// Parses and validates an untrusted downloaded file.
    pub fn from_gzip(bytes: &[u8]) -> Result<Self, String> {
        let mut json = Vec::new();
        GzDecoder::new(bytes)
            .take(MAX_DECOMPRESSED_BYTES)
            .read_to_end(&mut json)
            .map_err(|e| format!("archivo de estadísticas corrupto: {e}"))?;
        let file: CompactFile =
            serde_json::from_slice(&json).map_err(|e| format!("formato de estadísticas inválido: {e}"))?;
        if file.v != FORMAT_VERSION {
            return Err(format!("versión de estadísticas no soportada: {} (actualiza la app)", file.v));
        }

        let champs = file
            .champs
            .into_iter()
            .map(|(s, r, champ, games, wins)| {
                check_counts(games, wins)?;
                Ok(ChampRow {
                    source: name_at(&SOURCES, s)?.to_string(),
                    role: name_at(ROLES, r)?.to_string(),
                    champ,
                    games,
                    wins,
                })
            })
            .collect::<Result<_, String>>()?;
        let matchups = file
            .matchups
            .into_iter()
            .map(|(s, r, champ, enemy, er, games, wins)| {
                check_counts(games, wins)?;
                Ok(MatchupRow {
                    source: name_at(&SOURCES, s)?.to_string(),
                    role: name_at(ROLES, r)?.to_string(),
                    champ,
                    enemy,
                    enemy_role: name_at(ROLES, er)?.to_string(),
                    games,
                    wins,
                })
            })
            .collect::<Result<_, String>>()?;

        Ok(Self {
            generated_at: file.generated_at,
            patches: file.patches,
            soloq_games: file.soloq_games.max(0),
            pro_games: file.pro_games.max(0),
            champs,
            matchups,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample() -> Snapshot {
        Snapshot {
            generated_at: 1_760_000_000,
            patches: vec!["16.20".into()],
            soloq_games: 10,
            pro_games: 2,
            champs: vec![ChampRow { source: "soloq".into(), role: "TOP".into(), champ: 122, games: 10, wins: 6 }],
            matchups: vec![MatchupRow {
                source: "pro".into(),
                role: "MIDDLE".into(),
                champ: 103,
                enemy: 7,
                enemy_role: "MIDDLE".into(),
                games: 2,
                wins: 1,
            }],
        }
    }

    #[test]
    fn round_trips_through_gzip() {
        let snapshot = sample();
        let bytes = snapshot.to_gzip().unwrap();
        assert_eq!(Snapshot::from_gzip(&bytes).unwrap(), snapshot);
    }

    #[test]
    fn rejects_garbage_and_wrong_versions() {
        assert!(Snapshot::from_gzip(b"not gzip").is_err());

        let json = br#"{"v":99,"generated_at":0,"patches":[],"soloq_games":0,"pro_games":0,"champs":[],"matchups":[]}"#;
        let mut enc = GzEncoder::new(Vec::new(), Compression::fast());
        enc.write_all(json).unwrap();
        let err = Snapshot::from_gzip(&enc.finish().unwrap()).unwrap_err();
        assert!(err.contains("versión"));
    }

    #[test]
    fn rejects_invalid_rows() {
        let json = br#"{"v":1,"generated_at":0,"patches":[],"soloq_games":0,"pro_games":0,"champs":[[0,9,1,1,1]],"matchups":[]}"#;
        let mut enc = GzEncoder::new(Vec::new(), Compression::fast());
        enc.write_all(json).unwrap();
        assert!(Snapshot::from_gzip(&enc.finish().unwrap()).is_err());

        let json = br#"{"v":1,"generated_at":0,"patches":[],"soloq_games":0,"pro_games":0,"champs":[[0,0,1,1,5]],"matchups":[]}"#;
        let mut enc = GzEncoder::new(Vec::new(), Compression::fast());
        enc.write_all(json).unwrap();
        assert!(Snapshot::from_gzip(&enc.finish().unwrap()).is_err(), "wins > games");
    }
}
