# RoleBox 开发文档（公开）

> 随仓库入库。设计依据：`E:\rolebox\DESIGN.md` v1.0（仓库外，不入库）。
> 私有操作手册：`E:\rolebox\.agents\dev.md`（仓库外，不入库）。
> 改架构 / Schema / 命令语义时同步更新本文对应章节（dev.md 工作流第 6 步）。

## 1. 与设计文档的差异（实测登记）

| 项 | DESIGN.md | 仓库实际 | 处理 |
|---|---|---|---|
| Rust edition | 2021 | 2024 | 保持现状不改，避免无谓改动 |
| pnpm | 「最新稳定版」 | 12.5.1 | `pnpm-workspace.yaml` 的 `allowBuilds`（坑 #8）在 v12 仍有效 |
| 单角色 JSON 格式 | 引用「DESIGN 3.1.4」，正文未给出 | 无 | C09 按 5.8 备份格式自定，见第 5 节 |
| Input / Update 输入类型 | 5.6 只出现在函数签名，未给字段 | 无 | C03 按表结构补全，见第 4 节 |
| 额外依赖 | 未列 | `tauri-plugin-dialog`（C09）、`zip`（C44） | 命令签名收 `path: String` 与整体备份 zip 所必需 |

## 2. 目录结构

（待 C02 起按模块回填）

## 3. 数据库 Schema

（待 C02 回填：8 张表、5 个索引、外键级联、WAL、幂等 `migrate()`）

## 4. Rust 模块与数据模型

（待 C02 / C03 回填）

## 5. Tauri 命令语义

（待 C04 起逐个命令回填。全部命令必须在 `lib.rs` 的 `invoke_handler` 注册，坑 #15）

## 6. 前端模块

（待 C07 起回填）

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
