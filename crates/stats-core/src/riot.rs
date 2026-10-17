use std::time::Duration;

use serde::de::DeserializeOwned;
use thiserror::Error;

use crate::limiter::{DEFAULT_WINDOWS, RateLimiter};

/// Platform routing for summoner/league, regional for match/account (EUW).
pub const PLATFORM: &str = "euw1";
pub const REGION: &str = "europe";
const MAX_RETRIES: u32 = 3;

#[derive(Debug, Error)]
pub enum RiotError {
    #[error("la API key de Riot no es válida o ha caducado")]
    InvalidKey,
    #[error("no encontrado")]
    NotFound,
    #[error("error de la Riot API: {0}")]
    Http(String),
}

pub enum Host {
    Platform,
    Region,
}

impl Host {
    fn base(&self) -> String {
        let route = match self {
            Host::Platform => PLATFORM,
            Host::Region => REGION,
        };
        format!("https://{route}.api.riotgames.com")
    }
}

pub struct RiotClient {
    http: reqwest::Client,
    limiter: RateLimiter,
    key: String,
}

impl RiotClient {
    pub fn new(key: String) -> Self {
        Self {
            http: reqwest::Client::builder()
                .timeout(Duration::from_secs(15))
                .build()
                .expect("failed to build Riot http client"),
            limiter: RateLimiter::new(DEFAULT_WINDOWS),
            key,
        }
    }

    pub async fn get<T: DeserializeOwned>(&self, host: Host, path: &str) -> Result<T, RiotError> {
        let key = &self.key;
        let url = format!("{}{}", host.base(), path);

        for attempt in 0..=MAX_RETRIES {
            self.limiter.acquire().await;
            let response = self
                .http
                .get(&url)
                .header("X-Riot-Token", key)
                .send()
                .await
                .map_err(|e| RiotError::Http(e.to_string()))?;

            match response.status().as_u16() {
                200 => {
                    return response
                        .json::<T>()
                        .await
                        .map_err(|e| RiotError::Http(format!("respuesta inesperada: {e}")));
                }
                401 | 403 => return Err(RiotError::InvalidKey),
                404 => return Err(RiotError::NotFound),
                429 if attempt < MAX_RETRIES => {
                    let retry_after = response
                        .headers()
                        .get("retry-after")
                        .and_then(|v| v.to_str().ok())
                        .and_then(|v| v.parse::<u64>().ok())
                        .unwrap_or(10);
                    tokio::time::sleep(Duration::from_secs(retry_after)).await;
                }
                500..=599 if attempt < MAX_RETRIES => {
                    tokio::time::sleep(Duration::from_secs(2 << attempt)).await;
                }
                status => return Err(RiotError::Http(format!("HTTP {status} en {path}"))),
            }
        }
        Err(RiotError::Http(format!("demasiados reintentos en {path}")))
    }
}
