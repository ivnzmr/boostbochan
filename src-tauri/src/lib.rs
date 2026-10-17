mod commands;
mod config;
mod lcu;
mod live;
mod stats;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(lcu::LcuState::new())
        .manage(stats::StatsState::default())
        .manage(live::LiveState::new())
        .setup(|app| {
            lcu::spawn_watcher(app.handle().clone());
            stats::spawn_refresher(app.handle().clone());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::lcu_status,
            commands::lcu_request,
            stats::stats_summary,
            stats::stats_champions,
            stats::stats_matchups,
            stats::stats_build,
            stats::stats_sync,
            live::live_game_data,
            live::overlay_set_visible
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
