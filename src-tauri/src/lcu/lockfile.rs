use std::path::{Path, PathBuf};

use base64::Engine;
use serde::Serialize;
use thiserror::Error;

/// Default install locations checked when no custom path is configured.
const DEFAULT_INSTALL_DIRS: &[&str] = &[
    r"C:\Riot Games\League of Legends",
    r"D:\Riot Games\League of Legends",
];

const LOCKFILE_NAME: &str = "lockfile";

#[derive(Debug, Error, PartialEq, Eq)]
pub enum LockfileError {
    #[error("lockfile no encontrado (¿está abierto el cliente de LoL?)")]
    NotFound,
    #[error("lockfile con formato inválido: {0}")]
    Malformed(String),
}

/// Credentials the League client writes to its lockfile on startup.
/// Format: `LeagueClient:<pid>:<port>:<password>:<protocol>`
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct LcuCredentials {
    pub pid: u32,
    pub port: u16,
    #[serde(skip_serializing)]
    pub password: String,
    pub protocol: String,
}

impl LcuCredentials {
    pub fn parse(contents: &str) -> Result<Self, LockfileError> {
        let parts: Vec<&str> = contents.trim().split(':').collect();
        let [_name, pid, port, password, protocol] = parts.as_slice() else {
            return Err(LockfileError::Malformed(format!(
                "se esperaban 5 campos, hay {}",
                parts.len()
            )));
        };

        let pid = pid
            .parse()
            .map_err(|_| LockfileError::Malformed(format!("pid inválido: {pid}")))?;
        let port = port
            .parse()
            .map_err(|_| LockfileError::Malformed(format!("puerto inválido: {port}")))?;
        if password.is_empty() {
            return Err(LockfileError::Malformed("password vacío".into()));
        }

        Ok(Self {
            pid,
            port,
            password: password.to_string(),
            protocol: protocol.to_string(),
        })
    }

    pub fn base_url(&self) -> String {
        format!("{}://127.0.0.1:{}", self.protocol, self.port)
    }

    pub fn ws_url(&self) -> String {
        format!("wss://127.0.0.1:{}", self.port)
    }

    pub fn auth_header(&self) -> String {
        let token = base64::engine::general_purpose::STANDARD
            .encode(format!("riot:{}", self.password));
        format!("Basic {token}")
    }
}

/// The Riot Client records where League is installed (works for any drive/folder).
const RIOT_PRODUCT_SETTINGS: &str =
    r"C:\ProgramData\Riot Games\Metadata\league_of_legends.live\league_of_legends.live.product_settings.yaml";
const INSTALL_PATH_KEY: &str = "product_install_full_path:";

/// Extracts `product_install_full_path: "D:/Games/League of Legends"` from the settings YAML.
pub fn parse_install_dir(yaml: &str) -> Option<PathBuf> {
    yaml.lines()
        .find_map(|line| line.trim().strip_prefix(INSTALL_PATH_KEY))
        .map(|value| value.trim().trim_matches('"').trim_matches('\''))
        .filter(|value| !value.is_empty())
        .map(PathBuf::from)
}

fn riot_install_dir() -> Option<PathBuf> {
    std::fs::read_to_string(RIOT_PRODUCT_SETTINGS)
        .ok()
        .and_then(|yaml| parse_install_dir(&yaml))
}

fn candidate_paths(custom_dir: Option<&Path>) -> Vec<PathBuf> {
    custom_dir
        .map(Path::to_path_buf)
        .or_else(riot_install_dir)
        .map(|dir| dir.join(LOCKFILE_NAME))
        .into_iter()
        .chain(
            DEFAULT_INSTALL_DIRS
                .iter()
                .map(|dir| Path::new(dir).join(LOCKFILE_NAME)),
        )
        .collect()
}

/// Reads credentials from the first lockfile found.
pub fn read_credentials(custom_dir: Option<&Path>) -> Result<LcuCredentials, LockfileError> {
    candidate_paths(custom_dir)
        .iter()
        .find_map(|path| std::fs::read_to_string(path).ok())
        .ok_or(LockfileError::NotFound)
        .and_then(|contents| LcuCredentials::parse(&contents))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_valid_lockfile() {
        let creds = LcuCredentials::parse("LeagueClient:1234:54321:s3cr3t:https").unwrap();
        assert_eq!(creds.pid, 1234);
        assert_eq!(creds.port, 54321);
        assert_eq!(creds.password, "s3cr3t");
        assert_eq!(creds.protocol, "https");
    }

    #[test]
    fn trims_trailing_whitespace() {
        let creds = LcuCredentials::parse("LeagueClient:1:2:pw:https\r\n").unwrap();
        assert_eq!(creds.protocol, "https");
    }

    #[test]
    fn rejects_wrong_field_count() {
        let err = LcuCredentials::parse("LeagueClient:1:2:pw").unwrap_err();
        assert!(matches!(err, LockfileError::Malformed(_)));
    }

    #[test]
    fn rejects_invalid_port() {
        let err = LcuCredentials::parse("LeagueClient:1:notaport:pw:https").unwrap_err();
        assert!(matches!(err, LockfileError::Malformed(_)));
    }

    #[test]
    fn rejects_empty_password() {
        let err = LcuCredentials::parse("LeagueClient:1:2::https").unwrap_err();
        assert!(matches!(err, LockfileError::Malformed(_)));
    }

    #[test]
    fn builds_urls_and_auth() {
        let creds = LcuCredentials::parse("LeagueClient:1:5000:pw:https").unwrap();
        assert_eq!(creds.base_url(), "https://127.0.0.1:5000");
        assert_eq!(creds.ws_url(), "wss://127.0.0.1:5000");
        // base64("riot:pw") == "cmlvdDpwdw=="
        assert_eq!(creds.auth_header(), "Basic cmlvdDpwdw==");
    }

    #[test]
    fn parses_riot_install_dir() {
        let yaml = "product_install_full_path: \"D:/Games/Riot Games/League of Legends\"\nproduct_install_root: \"D:/Games\"";
        assert_eq!(parse_install_dir(yaml), Some(PathBuf::from("D:/Games/Riot Games/League of Legends")));
        assert_eq!(parse_install_dir("  product_install_full_path: ''"), None);
        assert_eq!(parse_install_dir("other: 1"), None);
    }

    #[test]
    fn custom_dir_is_checked_first() {
        let paths = candidate_paths(Some(Path::new(r"E:\Games\LoL")));
        assert_eq!(paths[0], Path::new(r"E:\Games\LoL").join("lockfile"));
        assert_eq!(paths.len(), DEFAULT_INSTALL_DIRS.len() + 1);
    }

    #[test]
    fn missing_lockfile_returns_not_found() {
        let dir = std::env::temp_dir().join("boostbochan-no-lockfile-here");
        // Only meaningful when LoL is not installed in a default dir; otherwise skip.
        if DEFAULT_INSTALL_DIRS
            .iter()
            .any(|d| Path::new(d).join(LOCKFILE_NAME).exists())
        {
            return;
        }
        assert_eq!(read_credentials(Some(&dir)), Err(LockfileError::NotFound));
    }
}
