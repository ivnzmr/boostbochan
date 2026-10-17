//! Data Dragon static data needed while collecting: champion ids/names, whether a
//! champion deals mostly magic damage, and which items are "completed" items.

use std::collections::{HashMap, HashSet};
use std::time::Duration;

use serde::Deserialize;

const DDRAGON: &str = "https://ddragon.leagueoflegends.com";
/// Items cheaper than this are components/starters, not build items.
const MIN_COMPLETED_GOLD: i64 = 1600;
const SUMMONERS_RIFT: &str = "11";

pub struct StaticData {
    /// Normalized champion name or id ("kaisa", "monkeyking") -> numeric key.
    pub champion_ids: HashMap<String, i64>,
    pub is_ap: HashMap<i64, bool>,
    pub completed_items: HashSet<i64>,
}

pub fn normalize_name(name: &str) -> String {
    name.chars().filter(|c| c.is_ascii_alphanumeric()).collect::<String>().to_ascii_lowercase()
}

#[derive(Deserialize)]
struct ChampionInfo {
    attack: i64,
    magic: i64,
}

#[derive(Deserialize)]
struct DdChampion {
    id: String,
    key: String,
    name: String,
    info: ChampionInfo,
}

#[derive(Deserialize)]
struct DdList<T> {
    data: HashMap<String, T>,
}

#[derive(Deserialize)]
struct ItemGold {
    total: i64,
    purchasable: bool,
}

#[derive(Deserialize)]
pub struct DdItem {
    gold: ItemGold,
    #[serde(default)]
    into: Vec<String>,
    #[serde(default)]
    tags: Vec<String>,
    #[serde(default)]
    maps: HashMap<String, bool>,
}

/// A finished, purchasable Summoner's Rift item that isn't boots/consumable/trinket.
pub fn is_completed_item(item: &DdItem) -> bool {
    let excluded = ["Boots", "Consumable", "Trinket"];
    item.gold.purchasable
        && item.gold.total >= MIN_COMPLETED_GOLD
        && item.into.is_empty()
        && item.maps.get(SUMMONERS_RIFT).copied().unwrap_or(false)
        && !item.tags.iter().any(|t| excluded.contains(&t.as_str()))
}

async fn get_json<T: serde::de::DeserializeOwned>(http: &reqwest::Client, url: &str) -> Result<T, String> {
    http.get(url)
        .send()
        .await
        .map_err(|e| format!("Data Dragon: {e}"))?
        .json()
        .await
        .map_err(|e| format!("Data Dragon respuesta inválida: {e}"))
}

pub async fn load() -> Result<StaticData, String> {
    let http = reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|e| e.to_string())?;
    let versions: Vec<String> = get_json(&http, &format!("{DDRAGON}/api/versions.json")).await?;
    let version = versions.first().ok_or("Data Dragon sin versiones")?;

    let champions: DdList<DdChampion> =
        get_json(&http, &format!("{DDRAGON}/cdn/{version}/data/en_US/champion.json")).await?;
    let items: DdList<DdItem> = get_json(&http, &format!("{DDRAGON}/cdn/{version}/data/en_US/item.json")).await?;

    let parsed: Vec<(i64, &DdChampion)> = champions
        .data
        .values()
        .filter_map(|c| c.key.parse::<i64>().ok().map(|key| (key, c)))
        .collect();

    Ok(StaticData {
        champion_ids: parsed
            .iter()
            .flat_map(|(key, c)| [(normalize_name(&c.name), *key), (normalize_name(&c.id), *key)])
            .collect(),
        is_ap: parsed.iter().map(|(key, c)| (*key, c.info.magic > c.info.attack)).collect(),
        completed_items: items
            .data
            .iter()
            .filter(|(_, item)| is_completed_item(item))
            .filter_map(|(id, _)| id.parse().ok())
            .collect(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn item(total: i64, into: &[&str], tags: &[&str]) -> DdItem {
        DdItem {
            gold: ItemGold { total, purchasable: true },
            into: into.iter().map(|s| s.to_string()).collect(),
            tags: tags.iter().map(|s| s.to_string()).collect(),
            maps: HashMap::from([("11".to_string(), true)]),
        }
    }

    #[test]
    fn classifies_completed_items() {
        assert!(is_completed_item(&item(3300, &[], &["Damage"])));
        assert!(!is_completed_item(&item(1300, &["3078"], &["Damage"])), "component");
        assert!(!is_completed_item(&item(450, &[], &[])), "starter");
        assert!(!is_completed_item(&item(1100, &[], &["Boots"])), "boots");
        let mut aram_only = item(3000, &[], &[]);
        aram_only.maps = HashMap::from([("12".to_string(), true)]);
        assert!(!is_completed_item(&aram_only));
    }

    #[test]
    fn normalizes_names() {
        assert_eq!(normalize_name("Kai'Sa"), "kaisa");
        assert_eq!(normalize_name("Nunu & Willump"), "nunuwillump");
    }
}
