use serde::{Deserialize, Serialize};
use serde_json::Value;

/// WAMP opcode for an event message pushed by the LCU websocket.
const WAMP_EVENT: u64 = 8;

/// Only these endpoints are forwarded to the frontend; the LCU emits
/// hundreds of events per second and most are irrelevant to us.
const FORWARDED_PREFIXES: &[&str] = &[
    "/lol-gameflow/v1/gameflow-phase",
    "/lol-matchmaking/v1/ready-check",
    "/lol-champ-select/v1/session",
    "/lol-end-of-game/v1/eog-stats-block",
    "/lol-summoner/v1/current-summoner",
];

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LcuEvent {
    pub uri: String,
    pub event_type: String,
    pub data: Value,
}

/// Parses a raw websocket frame like
/// `[8,"OnJsonApiEvent",{"uri":"...","eventType":"Update","data":{...}}]`.
/// Returns `None` for frames that are not events or are not forwarded.
pub fn parse_frame(raw: &str) -> Option<LcuEvent> {
    let frame: Value = serde_json::from_str(raw).ok()?;
    let items = frame.as_array()?;
    if items.first()?.as_u64()? != WAMP_EVENT {
        return None;
    }
    let event: LcuEvent = serde_json::from_value(items.get(2)?.clone()).ok()?;
    is_forwarded(&event.uri).then_some(event)
}

fn is_forwarded(uri: &str) -> bool {
    FORWARDED_PREFIXES.iter().any(|prefix| uri.starts_with(prefix))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn parses_ready_check_event() {
        let raw = r#"[8,"OnJsonApiEvent",{"uri":"/lol-matchmaking/v1/ready-check","eventType":"Update","data":{"state":"InProgress","playerResponse":"None"}}]"#;
        let event = parse_frame(raw).unwrap();
        assert_eq!(event.uri, "/lol-matchmaking/v1/ready-check");
        assert_eq!(event.event_type, "Update");
        assert_eq!(event.data, json!({"state":"InProgress","playerResponse":"None"}));
    }

    #[test]
    fn ignores_unlisted_uris() {
        let raw = r#"[8,"OnJsonApiEvent",{"uri":"/lol-chat/v1/friends","eventType":"Update","data":{}}]"#;
        assert!(parse_frame(raw).is_none());
    }

    #[test]
    fn ignores_non_event_opcodes() {
        assert!(parse_frame(r#"[0,"session","1"]"#).is_none());
    }

    #[test]
    fn ignores_garbage() {
        assert!(parse_frame("not json").is_none());
        assert!(parse_frame("{}").is_none());
        assert!(parse_frame("[]").is_none());
        assert!(parse_frame(r#"[8,"OnJsonApiEvent"]"#).is_none());
    }

    #[test]
    fn delete_events_have_null_data() {
        let raw = r#"[8,"OnJsonApiEvent",{"uri":"/lol-champ-select/v1/session","eventType":"Delete","data":null}]"#;
        let event = parse_frame(raw).unwrap();
        assert_eq!(event.event_type, "Delete");
        assert!(event.data.is_null());
    }
}
