use futures_util::{SinkExt, StreamExt};
use tokio_tungstenite::{
    Connector, connect_async_tls_with_config,
    tungstenite::{Message, client::IntoClientRequest, http::HeaderValue},
};

use super::events::{LcuEvent, parse_frame};
use super::lockfile::LcuCredentials;

/// WAMP subscribe (opcode 5) to every JSON API event.
const SUBSCRIBE_ALL: &str = r#"[5, "OnJsonApiEvent"]"#;

/// Connects to the LCU websocket and pumps events until the client closes it.
/// `on_connected` fires once the subscription is sent.
pub async fn run_session<C, E>(
    creds: &LcuCredentials,
    on_connected: C,
    on_event: E,
) -> Result<(), String>
where
    C: FnOnce(),
    E: Fn(LcuEvent),
{
    let tls = native_tls::TlsConnector::builder()
        .danger_accept_invalid_certs(true)
        .build()
        .map_err(|e| format!("TLS: {e}"))?;

    let mut request = creds
        .ws_url()
        .into_client_request()
        .map_err(|e| format!("petición websocket inválida: {e}"))?;
    let auth = HeaderValue::from_str(&creds.auth_header()).map_err(|e| e.to_string())?;
    request.headers_mut().insert("Authorization", auth);

    let (mut ws, _) =
        connect_async_tls_with_config(request, None, false, Some(Connector::NativeTls(tls)))
            .await
            .map_err(|e| format!("no se pudo conectar al websocket de la LCU: {e}"))?;

    ws.send(Message::text(SUBSCRIBE_ALL))
        .await
        .map_err(|e| format!("no se pudo suscribir a eventos: {e}"))?;
    on_connected();

    while let Some(message) = ws.next().await {
        match message {
            Ok(Message::Text(text)) => {
                if let Some(event) = parse_frame(&text) {
                    on_event(event);
                }
            }
            Ok(Message::Close(_)) => break,
            Ok(_) => {}
            Err(e) => return Err(format!("websocket LCU cerrado: {e}")),
        }
    }
    Ok(())
}
