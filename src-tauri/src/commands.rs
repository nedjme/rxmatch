use mac_address::get_mac_address as mac_get_mac_address;
use serde::{Deserialize, Serialize};
use std::path::Path;
use tauri::State;

use crate::phone_server::PhoneServerState;

// ── MAC address ───────────────────────────────────────────────────────────────

/// Returns the primary network interface MAC address as a hex string.
/// Returns an empty string if it cannot be determined.
#[tauri::command]
pub fn get_mac_address() -> String {
    match mac_get_mac_address() {
        Ok(Some(ma)) => ma.to_string().to_uppercase(),
        _ => String::new(),
    }
}

// ── Filesystem ────────────────────────────────────────────────────────────────

/// Saves raw image bytes to <base_path>/YYYY/MM/DD/<filename>.
#[tauri::command]
pub async fn save_prescription_original(
    base_path: String,
    date_str: String,
    filename: String,
    data: Vec<u8>,
) -> Result<String, String> {
    let parts: Vec<&str> = date_str.split('-').collect();
    if parts.len() != 3 {
        return Err("invalid date format, expected YYYY-MM-DD".into());
    }
    let (year, month, day) = (parts[0], parts[1], parts[2]);

    let dir = Path::new(&base_path).join(year).join(month).join(day);
    std::fs::create_dir_all(&dir)
        .map_err(|e| format!("failed to create directory: {e}"))?;

    let dest = dir.join(&filename);
    std::fs::write(&dest, &data)
        .map_err(|e| format!("failed to write file: {e}"))?;

    Ok(dest.to_string_lossy().to_string())
}

/// Opens a native OS folder-picker dialog and returns the selected path.
#[tauri::command]
pub async fn pick_folder(app: tauri::AppHandle) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    let path = app.dialog().file().blocking_pick_folder();
    Ok(path.map(|p| p.to_string()))
}

// ── Scanner discovery ─────────────────────────────────────────────────────────

#[derive(Serialize, Deserialize, Clone)]
pub struct ScannerInfo {
    pub id: String,
    pub name: String,
    pub kind: String,
    pub address: Option<String>,
}

#[tauri::command]
pub async fn list_scanners() -> Vec<ScannerInfo> {
    #[cfg(target_os = "macos")]
    {
        list_scanners_macos()
    }
    #[cfg(not(target_os = "macos"))]
    {
        vec![]
    }
}

#[cfg(target_os = "macos")]
fn list_scanners_macos() -> Vec<ScannerInfo> {
    use std::process::Command;

    let output = Command::new("system_profiler")
        .args(["SPCameraDataType", "-json"])
        .output();

    match output {
        Ok(o) if o.status.success() => {
            let text = String::from_utf8_lossy(&o.stdout);
            if let Ok(val) = serde_json::from_str::<serde_json::Value>(&text) {
                if let Some(cameras) = val["SPCameraDataType"].as_array() {
                    return cameras
                        .iter()
                        .filter_map(|c| {
                            let name = c["_name"].as_str()?.to_owned();
                            Some(ScannerInfo {
                                id: name.clone(),
                                name,
                                kind: "hardware".to_owned(),
                                address: None,
                            })
                        })
                        .collect();
                }
            }
            vec![]
        }
        _ => vec![],
    }
}

// ── Phone server commands ─────────────────────────────────────────────────────

#[tauri::command]
pub async fn start_phone_server(
    state: State<'_, PhoneServerState>,
) -> Result<u16, String> {
    state.start().await
}

#[tauri::command]
pub async fn stop_phone_server(state: State<'_, PhoneServerState>) -> Result<(), String> {
    state.stop().await;
    Ok(())
}

#[tauri::command]
pub async fn get_phone_server_port(state: State<'_, PhoneServerState>) -> Result<u16, String> {
    Ok(state.port().await)
}
