# BoostBochan

Companion app gratuita y ligera para **League of Legends** (Windows). Sin anuncios y sin API key: instálala y funciona.

## Descargar

Descarga el instalador `BoostBochan_x.y.z_x64-setup.exe` de la [última versión](../../releases/latest) y ejecútalo. No necesita permisos de administrador. Las nuevas versiones se instalan desde la propia app.

> Windows SmartScreen puede avisar de que el instalador "no es reconocido", porque aún no está firmado con un certificado comercial. Pulsa **Más información → Ejecutar de todas formas**.

## Funciones

- **Asistente de selección de campeón**: al entrar en selección recomienda los mejores picks para tu rol contra los campeones enemigos visibles, con el winrate de cada emparejamiento. Fuera de partida incluye un simulador. Puede filtrar por los campeones que tienes y mostrar tu maestría.
- **Tier list** por rol (S+ a C), con winrate, pick rate y presencia en partidas profesionales.
- **Aceptar partida automáticamente**, con retardo configurable.
- Cada módulo se activa o desactiva desde **Ajustes**.

## De dónde salen los datos

Cada día, GitHub Actions ([`stats.yml`](.github/workflows/stats.yml)) ejecuta `stats-builder`, que:

1. descarga las partidas recientes de clasificatoria de los jugadores **Challenger y Grandmaster de EUW** (Riot API) y las **partidas profesionales** de los últimos 3 meses ([Leaguepedia](https://lol.fandom.com), CC BY-SA);
2. calcula emparejamientos y estadísticas por campeón y rol; una partida pro cuenta como 3 de soloQ;
3. publica `stats-v2.json.gz` en la release [`data`](../../releases/tag/data).

La app descarga ese archivo; nunca llama a la Riot API ni necesita credenciales.

## Privacidad

BoostBochan se comunica con el cliente de League **solo en tu PC** (LCU) y descarga datos públicos (estadísticas de este repositorio, Data Dragon y CommunityDragon). No recoge, envía ni almacena ningún dato personal.

## Cumplimiento con Riot

Usa únicamente APIs oficiales o permitidas: el cliente local (LCU), la Riot Games API y Data Dragon. **No** lee la memoria del juego, **no** inyecta código, **no** revela los nombres ocultos de la selección de campeón en clasificatoria y **no** muestra temporizadores enemigos que el juego no muestra.

## Desarrollo

Requisitos: Node 22+, Rust estable y las Visual Studio C++ Build Tools.

```bash
npm install
npm run tauri dev        # app en modo desarrollo
npm test                 # tests del frontend
cargo test --manifest-path src-tauri/Cargo.toml
cargo test --manifest-path crates/stats-core/Cargo.toml
```

Generar estadísticas en local:

```bash
RIOT_API_KEY=RGAPI-... cargo run --release --manifest-path crates/stats-core/Cargo.toml \
  --bin stats-builder -- --db data/stats.db --out data/stats-v2.json.gz --minutes 30
```

Publicar una versión: sube la versión en `src-tauri/tauri.conf.json` y `package.json`, y luego `git tag vX.Y.Z && git push --tags`. [`release.yml`](.github/workflows/release.yml) compila, firma y publica el instalador.

Secretos del repositorio:

| Secreto | Uso |
|---|---|
| `RIOT_API_KEY` | Descarga de soloQ en `stats.yml` (production key recomendada) |
| `TAURI_SIGNING_PRIVATE_KEY` | Firma de las actualizaciones automáticas |

## Aviso legal

BoostBochan isn't endorsed by Riot Games and doesn't reflect the views or opinions of Riot Games or anyone officially involved in producing or managing Riot Games properties. Riot Games, and all associated properties are trademarks or registered trademarks of Riot Games, Inc.
