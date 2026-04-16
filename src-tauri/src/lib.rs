mod commands;
mod phone_server;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            commands::get_mac_address,
            commands::save_prescription_original,
            commands::pick_folder,
            commands::list_scanners,
            commands::start_phone_server,
            commands::stop_phone_server,
            commands::get_phone_server_port,
        ])
        .setup(|app| {
            // Store the phone server state (port + stop flag)
            app.manage(phone_server::PhoneServerState::default());
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running rx-match");
}
