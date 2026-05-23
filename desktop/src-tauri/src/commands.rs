use std::sync::Arc;

use tauri::State;

use crate::sidecar::{SidecarInfo, SidecarState};

#[tauri::command]
pub fn get_sidecar_info(state: State<'_, Arc<SidecarState>>) -> SidecarInfo {
    state.info()
}
