mod commands;
mod config;
mod lcu;
mod stats;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(lcu::LcuState::new())
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&data_dir)?;
            app.manage(stats::StatsState::new(data_dir));

            lcu::spawn_watcher(app.handle().clone());
            stats::sync_if_stale(app.handle().clone());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::lcu_status,
            commands::lcu_request,
            stats::stats_summary,
            stats::stats_champions,
            stats::stats_matchups,
            stats::stats_sync
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
