use reqwest::Method;
use serde_json::Value;

use super::lockfile::LcuCredentials;

const ALLOWED_METHODS: &[&str] = &["GET", "POST", "PUT", "PATCH", "DELETE"];

/// The LCU serves a self-signed certificate on localhost, so certificate
/// validation must be disabled. This client is never used for remote hosts.
pub fn build_http_client() -> reqwest::Client {
    reqwest::Client::builder()
        .danger_accept_invalid_certs(true)
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .expect("failed to build LCU http client")
}

pub fn validate_request(method: &str, path: &str) -> Result<Method, String> {
    let upper = method.to_ascii_uppercase();
    if !ALLOWED_METHODS.contains(&upper.as_str()) {
        return Err(format!("método no permitido: {method}"));
    }
    if !path.starts_with('/') || path.contains("://") || path.contains("..") {
        return Err(format!("ruta LCU inválida: {path}"));
    }
    Method::from_bytes(upper.as_bytes()).map_err(|e| e.to_string())
}

pub async fn request(
    http: &reqwest::Client,
    creds: &LcuCredentials,
    method: &str,
    path: &str,
    body: Option<Value>,
) -> Result<Value, String> {
    let method = validate_request(method, path)?;
    let url = format!("{}{}", creds.base_url(), path);

    let builder = http
        .request(method, &url)
        .header("Authorization", creds.auth_header());
    let builder = match body {
        Some(json) => builder.json(&json),
        None => builder,
    };

    let response = builder
        .send()
        .await
        .map_err(|e| format!("error de conexión con el cliente: {e}"))?;
    let status = response.status();
    let text = response
        .text()
        .await
        .map_err(|e| format!("error leyendo respuesta: {e}"))?;

    if !status.is_success() {
        return Err(format!("LCU {status} en {path}: {text}"));
    }
    if text.trim().is_empty() {
        return Ok(Value::Null);
    }
    serde_json::from_str(&text).or(Ok(Value::String(text)))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_valid_requests() {
        assert_eq!(validate_request("get", "/lol-summoner/v1/current-summoner").unwrap(), Method::GET);
        assert_eq!(validate_request("POST", "/lol-matchmaking/v1/ready-check/accept").unwrap(), Method::POST);
    }

    #[test]
    fn rejects_unknown_methods() {
        assert!(validate_request("TRACE", "/x").is_err());
    }

    #[test]
    fn rejects_suspicious_paths() {
        assert!(validate_request("GET", "lol-summoner").is_err());
        assert!(validate_request("GET", "/../etc").is_err());
        assert!(validate_request("GET", "/http://evil.com").is_err());
    }
}
