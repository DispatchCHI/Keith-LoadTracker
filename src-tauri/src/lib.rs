mod cloud_fetch;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![cloud_fetch::cloud_fetch,])
        .run(tauri::generate_context!())
        .expect("error while running Load Tracker");
}
