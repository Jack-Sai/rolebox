// 全部 #[tauri::command] 集中在此。
// 坑 #15：命令漏注册时编译全绿、前端 invoke 才在运行时炸，
// 因此 lib.rs 的 command_registry_tests 会静态扫描本文件核对注册列表。

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
pub fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}
