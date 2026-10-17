//! Pure helpers that turn one player's match + timeline data into build keys
//! (runes, spells, skill order, core items) that can be aggregated.

use std::collections::HashSet;

/// Enemy team damage profile, used to recommend items against it.
pub const BUCKET_MIXED: u8 = 0;
pub const BUCKET_AD: u8 = 1;
pub const BUCKET_AP: u8 = 2;

pub const KIND_ITEM: &str = "item";
pub const KIND_CORE: &str = "core";
pub const KIND_RUNE: &str = "rune";
pub const KIND_SPELL: &str = "spell";
pub const KIND_SKILL: &str = "skill";
pub const KINDS: &[&str] = &[KIND_ITEM, KIND_CORE, KIND_RUNE, KIND_SPELL, KIND_SKILL];

pub const CORE_SIZE: usize = 3;
const SKILL_LETTERS: [char; 4] = ['Q', 'W', 'E', 'R'];
/// Skill-ups considered when deciding which basic ability is maxed first.
const SKILL_WINDOW: usize = 13;

/// 3+ magic-damage champions -> AP heavy; 0-1 -> AD heavy; otherwise mixed.
pub fn damage_bucket(enemy_is_ap: &[bool]) -> u8 {
    match enemy_is_ap.iter().filter(|ap| **ap).count() {
        n if n >= 3 => BUCKET_AP,
        0 | 1 => BUCKET_AD,
        _ => BUCKET_MIXED,
    }
}

/// "primary:sub:p1,p2,p3,p4:s1,s2:offense,flex,defense" (LCU selectedPerkIds order).
pub fn rune_key(primary: i64, sub: i64, primary_perks: &[i64], sub_perks: &[i64], shards: [i64; 3]) -> Option<String> {
    if primary_perks.len() != 4 || sub_perks.len() != 2 || shards.contains(&0) {
        return None;
    }
    let join = |ids: &[i64]| ids.iter().map(i64::to_string).collect::<Vec<_>>().join(",");
    Some(format!("{primary}:{sub}:{}:{}:{}", join(primary_perks), join(sub_perks), join(&shards)))
}

/// Order-independent pair, e.g. (14, 4) -> "4,14".
pub fn spell_key(a: i64, b: i64) -> String {
    format!("{},{}", a.min(b), a.max(b))
}

/// Skill slots 1..=4 in level-up order -> "QEW|QWE" (max priority | first three levels).
pub fn skill_key(slots: &[u8]) -> Option<String> {
    let letters: Vec<char> = slots
        .iter()
        .filter_map(|s| SKILL_LETTERS.get(usize::from(*s).checked_sub(1)?).copied())
        .collect();
    if letters.len() < SKILL_WINDOW {
        return None;
    }
    let first3: String = letters.iter().take(3).collect();
    let window = &letters[..SKILL_WINDOW];
    let mut basics: Vec<(char, usize, usize)> = SKILL_LETTERS[..3]
        .iter()
        .map(|&skill| {
            let count = window.iter().filter(|c| **c == skill).count();
            // Tie-break: the ability that reached that count first is prioritized.
            let reached = window
                .iter()
                .enumerate()
                .filter(|(_, c)| **c == skill)
                .nth(count.saturating_sub(1))
                .map_or(usize::MAX, |(i, _)| i);
            (skill, count, reached)
        })
        .collect();
    basics.sort_by(|a, b| b.1.cmp(&a.1).then(a.2.cmp(&b.2)));
    let priority: String = basics.iter().map(|b| b.0).collect();
    Some(format!("{priority}|{first3}"))
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ItemEvent {
    Purchased(i64),
    /// Undo of a purchase of this item.
    Undo(i64),
}

/// First `CORE_SIZE` distinct completed items in purchase order, e.g. "3078-6333-3053".
pub fn core_key(events: &[ItemEvent], completed: &HashSet<i64>) -> Option<String> {
    let mut bought: Vec<i64> = Vec::new();
    for event in events {
        match *event {
            ItemEvent::Purchased(item) if completed.contains(&item) => bought.push(item),
            ItemEvent::Undo(item) => {
                if let Some(pos) = bought.iter().rposition(|b| *b == item) {
                    bought.remove(pos);
                }
            }
            ItemEvent::Purchased(_) => {}
        }
    }
    let mut seen = HashSet::new();
    let core: Vec<String> = bought
        .into_iter()
        .filter(|item| seen.insert(*item))
        .take(CORE_SIZE)
        .map(|i| i.to_string())
        .collect();
    (core.len() == CORE_SIZE).then(|| core.join("-"))
}

/// Final inventory without empty slots and trinkets (slot 6), deduplicated.
pub fn final_items(slots: &[i64]) -> Vec<i64> {
    let mut seen = HashSet::new();
    slots.iter().take(6).copied().filter(|i| *i > 0 && seen.insert(*i)).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn buckets_enemy_damage() {
        assert_eq!(damage_bucket(&[true, true, true, false, false]), BUCKET_AP);
        assert_eq!(damage_bucket(&[true, false, false, false, false]), BUCKET_AD);
        assert_eq!(damage_bucket(&[true, true, false, false, false]), BUCKET_MIXED);
    }

    #[test]
    fn builds_rune_keys() {
        let key = rune_key(8000, 8300, &[8010, 9111, 9104, 8299], &[8304, 8347], [5005, 5008, 5001]).unwrap();
        assert_eq!(key, "8000:8300:8010,9111,9104,8299:8304,8347:5005,5008,5001");
        assert!(rune_key(8000, 8300, &[8010], &[8304, 8347], [5005, 5008, 5001]).is_none());
        assert!(rune_key(8000, 8300, &[1, 2, 3, 4], &[5, 6], [0, 5008, 5001]).is_none());
    }

    #[test]
    fn spell_pairs_are_order_independent() {
        assert_eq!(spell_key(14, 4), "4,14");
        assert_eq!(spell_key(4, 14), "4,14");
    }

    #[test]
    fn derives_skill_priority() {
        // Q W E Q Q R Q E Q E R E E (Q maxed first, then E, then W)
        let slots = [1, 2, 3, 1, 1, 4, 1, 3, 1, 3, 4, 3, 3];
        assert_eq!(skill_key(&slots).unwrap(), "QEW|QWE");
        assert!(skill_key(&slots[..5]).is_none());
    }

    #[test]
    fn core_follows_purchase_order_and_undo() {
        let completed: HashSet<i64> = [3078, 6333, 3053, 3071].into();
        let events = [
            ItemEvent::Purchased(1055), // Doran's: not completed
            ItemEvent::Purchased(3078),
            ItemEvent::Purchased(3071),
            ItemEvent::Undo(3071),
            ItemEvent::Purchased(6333),
            ItemEvent::Purchased(3078), // rebuy ignored
            ItemEvent::Purchased(3053),
        ];
        assert_eq!(core_key(&events, &completed).unwrap(), "3078-6333-3053");
        assert!(core_key(&events[..3], &completed).is_none());
    }

    #[test]
    fn cleans_final_items() {
        assert_eq!(final_items(&[3078, 0, 6333, 3078, 0, 0, 3340]), vec![3078, 6333]);
    }
}
