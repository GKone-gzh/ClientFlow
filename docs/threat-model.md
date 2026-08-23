# ClientFlow Threat Model

最后更新：2026-08-24

## 1. 范围与资产

本威胁模型覆盖 Phase 2.5 P1 的生产安全加固，不扩展业务功能。重点保护：Supabase Session、用户聊天截图、结构化 AI 结果、Client/Project/Requirement/Task 数据、AI Provider Secret 与付费调用额度。

ClientFlow 不信任移动客户端。APK、JavaScript bundle、网络请求参数、公开 Supabase URL 和 publishable key 都视为攻击者可获得或可修改。真正的安全边界必须位于 Supabase Auth、Edge Functions、数据库权限、RLS、private Storage、服务器 Secret、Provider 输出校验和数据库并发控制。

## 2. 攻击者能力

攻击者可能：

1. 反编译 APK 或检查 JavaScript bundle。
2. 获取 Supabase URL 与 publishable key。
3. 注册普通账号并取得自己的合法 Session。
4. 绕过 App，直接脚本调用 Edge Function 或 Supabase REST。
5. 快速、并发或重复触发付费 AI 调用。
6. 修改 `uploadId`、owner、Storage 路径或其他客户端参数。
7. 尝试读取或修改其他用户的数据。
8. 上传超大文件、伪造 MIME 或异常图片。
9. 在截图中嵌入 Prompt Injection 或要求模型泄露系统指令。
10. 从客户端、Edge Function、Smoke、CI 或 Provider 错误日志中寻找 Secret、Token 和聊天内容。

## 3. 关键威胁与控制

| 威胁 | 强制控制 | 验证方式 |
|---|---|---|
| APK 中提取服务端 Secret | App 只允许 Supabase URL 与 publishable key；AI/service-role Secret 仅存于服务器 | Public env 扫描与组合测试 |
| 设备存储中窃取 Session | Native 使用 SecureStore；Web 保持平台适配；兼容迁移后删除 AsyncStorage 旧值 | Storage adapter、恢复与退出测试；Android 验收 |
| 脚本匿名调用高价值函数 | 每个高价值 Edge Function 验证 bearer Session；owner 仅来自验证后的用户 | handler 与真实 Supabase 匿名测试 |
| 修改 owner/path/status | DTO 不接受 owner/path；RLS、列权限、复合外键与受控 RPC 再校验 | PGlite、pgTAP、恶意 REST 测试 |
| 重复或并发烧 AI | 数据库事务锁、同 upload 唯一约束、每用户并发 1、滚动时间窗额度 | 并发、顺序重试与 Provider 调用次数测试 |
| Edge 实例水平扩展绕过限流 | 所有限流事件与判断由 Postgres 原子执行，不使用进程内计数 | 并发数据库测试 |
| Provider 成功但后续写库失败后再次付费 | 调用前持久化 processing/usage 预约；不确定是否已调用时禁止自动重跑 | 网络重试与写库失败测试 |
| Prompt Injection 污染结果 | Provider 输出始终为不可信 `unknown`；Zod、注入门禁与用户确认 | Provider 安全 fixtures |
| 日志泄露内容或凭据 | 结构化白名单日志；禁止记录 headers/body/图片/raw response/Token/Secret | 日志 redaction 测试与静态扫描 |

## 4. AI 限流与额度

Phase 2.5 P1 采用集中配置的 MVP 默认值：

- 每用户同时最多 `1` 个有效 extraction。
- 滚动 `1 minute` 最多 `5` 次已接受请求。
- 滚动 `1 hour` 最多 `30` 次已接受请求。
- 滚动 `24 hours` 最多 `100` 次已接受请求。

额度在 Provider 调用之前由数据库事务检查并预约。usage 中的 processing、completed、failed 均计入时间窗，因为它们都可能已经产生费用。不同用户独立计数。并发占位采用有限租约避免 Edge 崩溃永久阻塞其他 upload；但同一 upload 一旦进入 processing，不自动重新调用 Provider，优先避免重复计费。

稳定错误语义：分钟/小时限制返回 `rate_limited`；滚动 24 小时额度返回 `quota_exceeded`；并发占用或不安全重试返回 `conflict`。客户端不得自行判断或覆盖额度。

## 5. 日志与数据最小化

允许记录：安全格式的 `requestId`、`extractionId`、固定 provider/model、`durationMs`、attempt count、状态、稳定 `errorCode` 和限流决定。

禁止记录：access/refresh token、Authorization header、signed upload token、API key、service-role secret、截图 bytes/base64、聊天正文、完整 AI raw response、完整 Supabase 错误响应或内部 stack trace。

`ai_usage` 只保存成本控制所需元数据。只有 Provider 明确返回可靠 token usage 时才记录 input/output token；不得估算为真实账单数据。

## 6. 数据保留基础

Storage 原图是敏感数据。当前阶段不自动删除正式数据，但后续应提供可配置的 `7` 或 `30` 天策略，并允许 confirmed 后进入清理队列。账号删除必须级联删除用户业务记录、usage 元数据和 Storage 对象；对象清理需要单独的可靠任务验证，不能只依赖数据库级联。

结构化 extraction result 仍可能包含个人信息，必须继续受 owner RLS 保护。未校验 raw Provider 输出不持久化。

## 7. 已知非目标

本阶段不实现 SSL Pinning、Root/Jailbreak 检测、Play Integrity/App Attest、R8/ProGuard、复杂 WAF/Redis、付费订阅、第二 Provider、完整 SIEM 或自动数据清理任务。这些限制不改变服务器端 Auth、RLS、Secret 与数据库限流是强制边界。
