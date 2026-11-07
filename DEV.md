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
  `AppState { pool, http, send_lock, cancel_flags, last_usage, config }`；setup 依次建目录 →
  `db::connect` + `migrate` → 读 `settings.server_url` → `app.manage(state)` → 建系统托盘。
- **系统托盘**（C40）：菜单「显示主窗口 / 退出」，左键单击托盘也唤回窗口；
  `CloseRequested` 里先 `api.prevent_close()` 再 `window.hide()`（顺序不能反，坑 #16），
  关闭窗口只是最小化到托盘，真正退出走菜单。托盘需要 `tauri` 的 `tray-icon` feature。
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
  `format_single_history` 把消息转成 `Vec<ChatMessage>`：第一条固定 system，
  summary 移到 system 之后（物理 id 最大但语义在开头），narration 转 `user` + `【旁白】`，
  单人 user/assistant 都不加名字前缀，跳过 `summarized = 1`。
  `ChatMessage` 实际定义在 prompt.rs（C11 先于 C12），provider.rs 会重导出。
- `provider.rs`：`build_request_body` 只产出 `model` / `messages` / `stream` /
  `stream_options.include_usage` 四个字段（铁律二，单测逐项断言无采样参数）；
  `fetch_model_name` 从 `/v1/models` 取首个 id；`fetch_ctx_len` 从 `/props` 取 `n_ctx`
  （优先 `default_generation_settings.n_ctx`，兼容顶层；0 / 负数视为无效）；`chat_stream` 逐行消费 SSE，
  HTTP chunk 边界不等于行边界，故先缓冲再解析。
- `stream.rs`：`SseEvent` = Delta / Usage / Done；`parse_sse_line` 对非标准帧返回 None 不 panic，
  **先取 usage 再取 delta**（坑 #19 的 `choices: []` 帧）；`process_sse_line` 每个 Delta
  后检查 cancel，抽成纯函数以便不启 server 就能测取消。
- 群聊数据层（C33）：`group_sessions` / `group_members` / `group_messages` 三表。
  建群与写成员**同一事务**（否则可能留下没有成员的群）；成员展示用的 `name` / `avatar_color`
  通过 JOIN `characters` 取，不冗余存储；`group_messages` 同样按 `version_group, id` 排序。
- `export.rs`：单角色 JSON 的编解码纯函数 + 文件读写；`encode_character` /
  `decode_character` 不碰文件系统，便于验证格式与一致性。
  **整体备份**（C43）：`collect_backup` 读全部表组装 `BackupData`，`encode_backup` 打包成
  `zip(data.json + README.txt)`；导入是覆盖模式，`replace_all_data` 在**一个事务**里按
  `子表 → 父表` 清空再按原 id 插回（保住外键），导入前自动写 `<path>.before.zip` 备份当前数据，
  自动备份失败就取消导入。`BackupGroupMember` 只存 DB 真实列，`GroupMember` 的展示字段是 JOIN 出来的。
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
| `get_sessions` | `character_id` | `Vec<Session>` | 按 id 升序列出该角色的会话 |
| `get_session` | `id` | `Session` | 聊天页取标题 / 场景 / 分身 |
| `create_session` | `input` | `Session` | 新增后回读 |
| `delete_session` | `id` | `()` | 外键级联删除其消息 |
| `get_messages` | `session_id` | `Vec<Message>` | 只取 `is_active = 1`，按 id 升序 |
| `send_user_message` | `session_id, content` | `Message` | **只落库，不触发模型** |
| `send_narration` | `session_id, content` | `Message` | 旁白，`role = "narration"`，同样不触发模型 |
| `generate_reply` | `session_id, onChunk` | `Message` | 抢全局 send_lock → 构造 prompt → 流式 → 落库 |
| `cancel_generation` | `session_id` | `()` | 置 `s:<id>` 的 AtomicBool，流式循环逐 Delta 检查 |
| `update_message` | `id, content` | `()` | 原地改内容，并把之后的消息标 `deprecated = 1` |
| `delete_message` | `id` | `()` | 物理删除，并把之后的消息标 `deprecated = 1` |

| `regenerate_message` | `message_id, onChunk` | `Message` | 重新生成：旧版本下线 → 用目标消息之前的历史生成 → 新版本沿用同 group |
| `get_message_versions` | `message_id` | `Vec<Message>` | 返回该版本组全部版本，按 id 升序 |
| `activate_message_version` | `message_id` | `()` | 事务内整组清 0 再置目标为 1 |
| `get_context_info` | `session_id` | `ContextInfo` | `used` 优先用上次请求的真实 `prompt_tokens`，否则按字符估算 |
| `compress_context` | `session_id` | `()` | 保留最近 4 条，其余生成摘要并原子落库；也抢 `send_lock` |
| `get_settings` | — | `AppConfig` | 内存里的当前配置 |
| `set_server_url` | `url` | `()` | 去空白与结尾斜杠后同时写 DB 与内存；空地址拒绝 |
| `test_connection` | — | `ConnectionInfo` | `/health` 通即成功，再尽力补模型名与 `n_ctx` |
| `get_group_sessions` | — | `Vec<GroupSession>` | 按 id 升序 |
| `create_group_session` | `input` | `GroupSession` | 建群与写成员同一事务；至少要一个角色 |
| `delete_group_session` | `id` | `()` | 级联删除成员与消息 |
| `get_group_members` | `group_id` | `Vec<GroupMember>` | JOIN `characters` 取名字与头像色 |
| `get_group_messages` | `group_id` | `Vec<GroupMessage>` | 只取激活版本，按 `version_group, id` 排序 |
| `send_group_user_message` | `group_id, content` | `GroupMessage` | 只落库，不触发模型 |
| `send_group_narration` | `group_id, content` | `GroupMessage` | 同上，`role = "narration"` |
| `generate_group_reply` | `group_id, characterId, onChunk` | `GroupMessage` | 指定发言人，抢 `send_lock`，落库前清掉自加前缀 |
| `cancel_group_generation` | `group_id` | `()` | `g:<id>` 取消键 |

**群聊流式**：`StreamEvent` 新增 `DoneGroup` 变体，载荷是 `GroupMessage`（带 `character_id`）。
DESIGN 8.1 只定义了单人版 `Done { message: Message }`，两种消息类型无法共用同一个字段。
`g:<id>` 与 `s:<id>` 前缀区分，避免单人 / 群聊取消串键。
群聊 prompt 里 `assistant` 与 `user` 都加 `[名字]:` 前缀，当前轮发言指示只用 `append_turn_instruction`
加在末尾、不落库。

`ContextInfo.isAccurate`：`used` 来自真实 usage 时为 `true`；按字符估算时为 `false`。
`limit` 取 `/props` 的 `n_ctx`，拿不到回落 4096。真实 usage 在 `stream_chat` 的 on_usage 里
写进 `AppState.last_usage`（内存缓存，重启后回到估算值）。

**摘要落库**：`atomic_summarize` 在**一个事务**里插入 summary 消息（并回填 `version_group = id`）
和标记 `id < before_id` 的旧消息 `summarized = 1`。分成两步做会出现「有摘要但旧消息没标记
（上下文重复）」或「旧消息被吃掉但没摘要（上下文丢失）」；`role != 'summary'` 保证摘要本身永不被标记。

`deprecated` 只是 UI 提示「这些消息生成时上下文已变」，**不参与上下文过滤**（DESIGN 4.2）。
编辑 / 删除会破坏 KV cache 前缀，这是用户主动触发的破坏，可接受。

**重新生成**（DESIGN 9.2）：先 `deactivate_group` 让旧版本下线，再用**目标消息之前**的历史构造 prompt
（目标消息本身及其后都不参与），新消息 `version_group` 沿用旧值、`is_active = 1`，
然后把目标消息之后的消息标 `deprecated`。若一个字都没生成出来，恢复原版本为 active，
避免整组没有 `is_active`。切换版本只改 `is_active`，不改历史（DESIGN 9.3）。

命令层只做转发（生成命令除外），统一 `Result<T, String>`。

**`generate_reply` 生命周期**（DESIGN 8.2）：抢全局 `send_lock` → 注册 `s:<id>` 取消标志 →
从 character / scenario / user_persona 重建 system prompt → `list_messages` + `format_single_history`
→ `Start { message_id: 0 }` → 逐 Delta 转发并累积文本 → 落库 assistant 消息 →
`Done { message }`（含真实 id）。取消发 `Cancelled` 并落库已生成部分；
错误由命令返回 `Err` 且发一次 `Error`。锁是**全局一把**，不是 per-session。

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
- `pages/SessionListPage.tsx`：按角色筛选会话、删除会话；`SessionCreatePage.tsx`：标题 / 场景 /
  用户分身表单；`ChatPage.tsx`：消息列表 + 发送用户消息 + 生成回复。
- `components/chat/`：`MessageBubble` 用 `React.memo`，内容渲染器是**模块级函数**且父级传稳定回调
  （坑 #12 / #13）；`MessageList` 的 `switch (message.role)` 保留 default 兜底（坑 #4）；
  `InputArea` 基础输入框，流式停止与旁白模式留到 C15 / C24。
- 追加消息用 `[...previous, message]`，不重建历史对象，否则 memo 恒失效。
- 版本切换（C22）：`VersionSwitcher` 显示 `← 2/3 →`，只有一个版本时不渲染；
  `ChatPage` 只对激活的 assistant 消息查询所属组，切换前若有后续消息先确认。
  重新生成入口在气泡操作区，完成后重新加载（当前不逐字显示）。
  **注意**：`list_messages` 必须 `ORDER BY version_group, id`——重生成的新版本 id 更大，
  按 id 排会甩到会话末尾，既排错位置也会让上下文顺序错乱。
- 消息操作（C18）：`MessageBubble` 内部管编辑态，改名/删除通过 `onEdit` / `onDelete` 稳定回调上抛，
  确认弹窗与重新加载留在 `ChatPage`；临时消息（id < 0）不显示编辑/删除；复制走 `navigator.clipboard`。
- `components/chat/ContextBar.tsx`：上下文进度条，≥70% 转琥珀、≥90% 转红；`limit = 0` 时退回 0%，
  不产生 NaN；`isAccurate = false` 时在文字后标「（估算）」。`ChatPage` 在加载消息与生成结束后各刷新一次。
- `components/chat/MemberBar.tsx`（C37）：成员头像条，点谁让谁说；生成期间只有当前成员亮着、
  其余置灰（`opacity-40`），整体 `disabled` 防重复触发。
- 群聊页面（C36）：`GroupListPage` / `GroupCreatePage` / `GroupChatPage`。群聊消息用 `asMessage` 适配后
  复用 `MessageBubble` / `NarrationLine` / `SummaryCard`，assistant 消息上方单独标发言人名字。
  生成按成员逐个触发（`generateGroupReply`），`StreamEvent` 的 `done_group` 由 handler 的
  `onDoneGroup` 接管；`never` 穷尽检查会强制在新增变体时补 case。
- `lib/shortcuts.ts`（C41）：`matchShortcut` 纯函数，Ctrl/Cmd+Enter 发送、Esc 停止；
  普通 Enter 必须留给换行，所以 send 一定要求修饰键。
- `lib/stream.ts`：`createStreamHandler` 分发七种 StreamEvent（含 `done_group`，default 用 `never` 做穷尽检查）；
  `mergeText` 只在末尾是文本块时合并，`flushBuffer` 在插入非文本块前排空缓冲（坑 #5）。
  ChatPage 用 `id = -1` 的临时消息逐字追加，`Done` 换成真实 id；`Cancelled` 保留已生成内容，
  并用命令返回值补齐后端落库后的真实 id。流式期间 InputArea 的发送按钮变「停止」，调 `cancel_generation`。
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
