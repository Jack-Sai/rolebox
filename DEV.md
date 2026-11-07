# RoleBox 开发文档（公开）

> 随仓库入库。设计依据：`E:\rolebox\DESIGN.md` v1.0（仓库外，不入库）。
> 私有操作手册：`E:\rolebox\.agents\dev.md`（仓库外，不入库）。
> 改架构 / Schema / 命令语义时同步更新本文对应章节（dev.md 工作流第 6 步）。

## 1. 与设计文档的差异（实测登记）

| 项 | DESIGN.md | 仓库实际 | 处理 |
|---|---|---|---|
| Rust edition | 2021 | 2024 | 保持现状不改，避免无谓改动 |
| pnpm | 「最新稳定版」 | 12.5.1 | `pnpm-workspace.yaml` 的 `allowBuilds`（坑 #8）在 v12 仍有效 |
| 单角色 JSON 格式 | 引用「DESIGN 3.1.4」，正文未给出 | 已自定 | 按 5.8 备份格式 `version` / `type` / `exported_at` / `character`，见第 5 节 |
| Input / Update 输入类型 | 5.6 只出现在函数签名，未给字段 | 无 | C03 按表结构补全，见第 4 节 |
| 额外依赖 | 未列 | `tauri-plugin-dialog`（C09）、`zip`（C44） | 命令签名收 `path: String` 与整体备份 zip 所必需 |
| sqlx features | `runtime-tokio, sqlite, macros` | 未启用 `macros` | 代码一律用运行时 `query()`；干净环境无 `DATABASE_URL`，启用宏会让 `query!` 编译失败 |
| 建表函数名 | 5.1 写 `db::init` | 实际为 `db::migrate()` | 统一用 `migrate()`，语义与坑 #7 一致 |

## 2. 目录结构

（待 C02 起按模块回填）

## 3. 数据库 Schema

位置 `app_data_dir()/rolebox.db`（Windows `%APPDATA%\RoleBox\rolebox.db`）。
`db::connect()` 配置 WAL、`foreign_keys = ON`、连接池 max 5；启动即执行 `db::migrate()`。

8 张表（完整 DDL 见 `src-tauri/src/db.rs` 的 `SCHEMA_STATEMENTS`，逐字对应 DESIGN.md 4.1）：

| 表 | 用途 | 关键约束 |
|---|---|---|
| `characters` | 角色 | 6 列 |
| `user_personas` | 用户分身 | 4 列 |
| `sessions` | 单人会话 | `character_id` CASCADE、`user_persona_id` SET NULL |
| `messages` | 单人消息 | `role` CHECK 四值；`version_group` / `is_active` / `deprecated` / `summarized` |
| `group_sessions` | 群聊 | `user_persona_id` SET NULL |
| `group_members` | 群聊成员 | `UNIQUE(group_id, character_id)`，创建后不可增删 |
| `group_messages` | 群聊消息 | `character_id` SET NULL |
| `settings` | 全局设置 | key-value |

5 个索引：`idx_sessions_character`、`idx_messages_session`、`idx_messages_group`、
`idx_group_members_group`、`idx_group_messages_group`。

**幂等**：所有建表/建索引语句都带 `IF NOT EXISTS`（坑 #7）。`column_exists()` 用
`pragma_table_info` 判断列，`ensure_column()` 供后续版本补列；Phase 1 只有第一版 schema，
**不做版本链**。覆盖安装只替换程序目录，数据库不受影响（坑 #32）。

## 4. Rust 模块与数据模型

- `lib.rs`：`AppConfig { server_url }`、`DEFAULT_SERVER_URL`、
  `AppState { pool, http, send_lock, cancel_flags, config }`；setup 依次建目录 →
  `db::connect` + `migrate` → 读 `settings.server_url` → `app.manage(state)`。
- `db.rs`：`connect` / `migrate` / `column_exists` / `ensure_column` / `get_setting` /
  `list_characters` / `get_character` / `create_character` / `update_character` /
  `delete_character` / `list_personas` / `create_persona` / `update_persona` /
  `delete_persona`，纯函数收 `&SqlitePool`，统一 `Result<_, String>`。
  行映射手写，不用 `FromRow` derive（未启用 sqlx `macros` feature）。
- `models.rs`：7 个对外结构（`Character` / `UserPersona` / `Session` / `Message` /
  `GroupSession` / `GroupMember` / `GroupMessage`）、4 个输入类型
  （`CharacterInput` / `UserPersonaInput` / `SessionInput` / `SessionUpdate`，DESIGN 5.6 未给字段，
  按表「除 id / 时间戳外的列」补全）、`StreamEvent` 6 变体、`ContextInfo`。
  群聊输入类型、`ConnectionInfo`、`ImportStats` 留到各自首次使用处定义。
- `prompt.rs`：**最关键模块**（铁律一）。`build_single_system_prompt` 按 DESIGN 5.5.1
  模板一次定稿，空值用固定占位、不注入时间/随机/记忆；与前端 `lib/prompt.ts` 逐字一致，
  两边单测共用同一份期望字符串防止漂移。
- `export.rs`：单角色 JSON 的编解码纯函数 + 文件读写；`encode_character` /
  `decode_character` 不碰文件系统，便于验证格式与一致性。
- 布尔字段：DB 为 `INTEGER`，跨层契约统一为 `bool`，映射在 `db.rs` 查询里完成。

## 5. Tauri 命令语义

已注册命令（全部在 `lib.rs` 的 `invoke_handler` 中，坑 #15）：

| 命令 | 参数 | 返回 | 语义 |
|---|---|---|---|
| `greet` | `name` | `String` | 脚手架示例，保留作注册完整性测试的扫描样本 |
| `get_characters` | — | `Vec<Character>` | 按 id 升序列出角色 |
| `create_character` | `input` | `Character` | 新增后回读整行 |
| `update_character` | `id, input` | `()` | 覆盖 name / tagline / persona / avatar_color |
| `delete_character` | `id` | `()` | 外键级联删除其 sessions / messages / group_members |
| `get_personas` | — | `Vec<UserPersona>` | 按 id 升序列出分身 |
| `create_persona` | `input` | `UserPersona` | 新增后回读 |
| `update_persona` | `id, input` | `()` | 覆盖 name / persona |
| `delete_persona` | `id` | `()` | 关联会话 `user_persona_id` 置 NULL |

| `export_character` | `id, path` | `()` | 读角色 → 写单角色 JSON 文件 |
| `import_character` | `path, mode` | `Character` | 读 JSON → 新建角色 |

命令层只做转发，不做业务判断；统一 `Result<T, String>`。

**单角色 JSON**（DESIGN 11.1 引用 3.1.4 但正文缺失，按 5.8 备份格式自定）：

```json
{
  "version": 1,
  "type": "rolebox.character",
  "exported_at": "2026-11-07T08:00:00+08:00",
  "character": { "name": "...", "tagline": "...", "persona": "...", "avatar_color": "..." }
}
```

导入校验 `type` 与 `version`；`mode` 目前只接受 `new`（总是新建角色），覆盖 / 合并模式明确不做。
文件路径由前端 `tauri-plugin-dialog` 选择，后端只收字符串。

**命令注册完整性**（坑 #15）：`lib.rs` 的 `command_registry_tests::every_tauri_command_is_registered`
用 `include_str!` 扫描 `handlers.rs` 中所有 `#[tauri::command]` 函数名，
与 `invoke_handler(tauri::generate_handler![...])` 的注册列表逐项核对。
新增命令必须同步加到注册列表，否则该单测失败。

**跨层命名契约**：命令参数由 Tauri 自动把前端 camelCase 映射到 Rust snake_case；
命令**返回值**由 serde 直接序列化，不会自动转换，因此 `types.ts` 的主数据模型字段保持 snake_case；
嵌套 `input` 对象的字段同理用 snake_case（如 `avatar_color`），Tauri 只对顶层参数名做 camelCase 映射。
例外是 `StreamEvent`（`tag = "type"`、变体 `snake_case`、字段 `rename_all_fields = "camelCase"`）
与 `ContextInfo`（`rename_all = "camelCase"`），二者按 DESIGN 6.1 的前端定义输出
`messageId` / `promptTokens` / `completionTokens` / `isAccurate`。
`StreamEvent` 不用 `rename_all = "lowercase"`，它会把多词变体拼成一个词（坑 #6）。

## 6. 前端模块

- `App.tsx`：HashRouter + 路由表（当前仅 `/characters`、`/characters/new`、
  `/characters/:id/edit`），Sidebar / Toaster 常驻。其余页签暂为禁用占位。
- `lib/api.ts`：唯一直接调用 `invoke` 的薄封装；组件测试只 mock `@tauri-apps/api/core`。
- `lib/avatar.ts`（姓名 → 稳定颜色）、`lib/utils.ts`（`cn` / `truncate`）、
  `lib/prompt.ts`（system prompt 只读预览，必须与后端 `prompt.rs` 逐字一致）
  均为纯逻辑并配单测。
- `pages/CharacterListPage.tsx`：列表 / 删除 / 空状态 / 角色 JSON 导入导出
  （用 `@tauri-apps/plugin-dialog` 选路径）；删除会级联清掉会话，故二次确认。
- `pages/CharacterEditPage.tsx`：新建 / 编辑表单 + 右侧预览；后端没有单角色查询命令，
  编辑时复用 `get_characters` 按 id 取回。
- `store/toast.ts`：Zustand 全局提示；`components/ui/` 为自写基础组件，图标一律 lucide-react。
- `pages/SettingsPage.tsx`：本期只实现「我的分身」子页签（分身 CRUD）；
  外观、llama-server、数据页签为禁用占位，分别留到 C40 / C46。
- 样式：Tailwind v4 由 `@tailwindcss/vite` 插件加载，`src/index.css` 定义 CSS 变量。
- `src/test/setup.ts` 显式注册 `afterEach(cleanup)`：vitest 未开 `globals`，
  RTL 不会自动清理，否则多个组件测试的 DOM 会叠加（坑 #9 同源）。

## 7. 测试与验证

三条全绿才可提交：

- `cargo test --lib --manifest-path src-tauri/Cargo.toml`
- `pnpm test`
- `pnpm build`（内含 `tsc && vite build`）

前端测试：vitest + jsdom + @testing-library/react，配置在 `vite.config.ts` 的 `test` 段，
setup 在 `src/test/setup.ts`（mock 掉 Tauri 的 invoke / listen）。**不 mock store**，只 mock 底层模块。
新测试必须临时破坏实现确认它变红（dev.md:314）；断言抓语义不抓措辞。

## 8. 构建与发版

（待 C47 起回填 Inno Setup 流程）

## 9. 已知约束与不做的事

三条铁律：

1. KV Cache 生命线：会话内 prompt 前缀字节级不变、只末尾追加。
2. 参数主权归 server：请求体只 `model` / `messages` / `stream`(+`stream_options`)，不发采样参数。
3. 单一目标够用即止：只服务 llama.cpp 单实例单模型。

明确不做：多供应商 / 云端 API / API Key 加密、自动更新、跨平台、语音、多模态、
消息全文搜索、虚拟滚动、E2E 测试、真实 llama-server 集成测试。
