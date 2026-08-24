# Production Security Acceptance

最后更新：2026-08-24

## 1. 范围

本记录对应 Phase 2.5 P1 / Issue #7，只验收 Native Session、AI 防刷/额度、重复调用保护、安全日志、生产组合隔离、数据库最小权限和 Security CI。正式 UI、性能优化、支付、第二 AI Provider 与发布加固不在本阶段。

## 2. 自动化门禁

- `pnpm verify` 通过：Contracts/数据库一致性 `5/5`、Security `6/6`、PGlite Migration/RLS/限流 `8/8`、Contracts `7/7`、Edge Function `41/41`、Mobile `67/67`。
- tracked-file Secret/public env 扫描通过，没有提交本地环境文件、测试账号、Session Token、Supabase 管理凭据或 DashScope Secret。
- `pnpm build` 与 Mobile Web smoke 通过，Supabase production composition 不初始化 Mock services，`developmentTools === null`。
- GitHub CI 包含 Secret/public env scan 与 production dependency audit；Dependabot alerts 和 security updates 已启用。

## 3. 真实 Supabase 部署

- Migration `20260824000100_ai_abuse_controls.sql` 已存在于远端，`private.ai_rate_limit_config` 与 `private.ai_usage` 可用。
- 生产默认值已核验并保持：每用户并发 `1`、滚动 `1 minute` 为 `5`、滚动 `1 hour` 为 `30`、滚动 `24 hours` 为 `100`、processing lease 为 `600` 秒。
- `prepare-upload`、`mark-uploaded`、`request-extraction`、`get-extraction` 与 `confirm-extraction` 已重新部署，远端均为 active 且 JWT verification 开启。
- 五个函数使用 public project key 但不携带用户 Authorization 的畸形 POST 请求均返回 `401`。函数内部先验证 Session，再解析 payload，不泄露业务参数校验结果。

## 4. 真实 Qwen 与滥用控制

- `pnpm smoke:qwen` 使用 `qwen3-vl-plus` 通过真实上传、提取、Zod 校验、Review、确认、Client Detail、确认幂等、提取幂等和 User A/B 隔离。
- `pnpm smoke:abuse` 同时发起四个真实请求：User A 对两个 upload 发起三个请求，其中包含同 upload 重复；User B 同时发起一个独立请求。
- User A 只有一个请求进入 Provider，另外两个返回稳定 `conflict`；User B 同时成功，证明用户级并发锁彼此独立。
- User A 成功 upload 的顺序重试返回原 extraction，没有产生第二份 extraction；User B 不能读取 User A 的 upload 或 extraction。
- 受控额度验收将 User A 的测试 usage 临时补至日限额，真实 `request-extraction` 返回 `quota_exceeded`，前后 usage 数量不变，证明 Provider reservation 之前已经拒绝。
- 额度验收使用的测试台账与孤立 upload 已清理，生产默认日限额恢复为 `100`，远端残留测试台账为 `0`。

## 5. Usage 与权限

远端 `private.ai_usage` 只包含：

- `id`、`user_id`、`extraction_id`、`request_id`
- `provider`、`model`
- `started_at`、`completed_at`、`status`
- `duration_ms`、`attempt_count`
- Provider 明确返回时的 `input_tokens`、`output_tokens`
- 稳定 `error_code`

不包含截图 bytes/base64、聊天正文、Storage signed token、Authorization、access/refresh token、API key、service-role Secret 或 Provider raw response。`input_tokens` 与 `output_tokens` 是数量字段，不是认证 Token。远端 `authenticated` 角色对该 private 表没有读写权限，也不能执行 reservation/complete/fail 管理 RPC。

## 6. Native Session

- Android/iOS Session 使用 Expo SecureStore 版本化分块 adapter；不自行实现加密算法。
- 首次读取旧版本 Session 时从 AsyncStorage 迁移到 SecureStore，并删除 AsyncStorage 明文副本。
- logout 同时清理 SecureStore 分块、manifest 与任何遗留 AsyncStorage 值。
- Web 保持独立 storage adapter，不加载 Native SecureStore。
- 自动化已覆盖大 Session 分块、恢复、迁移、写失败回滚、缺块 fail closed、logout 清理和 Web/Native 边界。

## 7. 日志与已知限制

- Edge 日志只允许 operation、requestId、status 和稳定 errorCode；Provider/usage 日志使用安全字段白名单。
- 错误响应只返回合同字段和安全 requestId，不返回 stack、SQL、完整 SDK 错误或 Provider response。
- 当前 GitHub 私有仓库授权不提供 CodeQL/default setup、Secret scanning 和 push protection；本地扫描与 CI 已启用，但不能替代这些 GitHub 原生能力。
- Expo SDK 57 的 Metro 传递依赖仍有两个无已发布修复版本的 `image-size` build-time DoS advisories；范围、缓解和复审时间见 `docs/security-operations.md`。
- 自动 Storage 数据保留、Play Integrity/App Attest、SSL Pinning、R8/ProGuard 和 EAS Release 不在本阶段。

## 8. Android 关闭门禁

2026-08-24 Android Expo Go 真机回归全部通过：

1. 登录并彻底重启 App 后，Session 从 SecureStore 正常恢复并直接进入主页。
2. 选择聊天截图后，真实 `qwen3-vl-plus` extraction 正常完成。
3. 在“开始识别”入口快速连续点击，只产生一份识别结果，没有多份 extraction 或重复流程。
4. Review、confirm 与真实 Client Detail 正常。
5. logout 后彻底重启 App，保持未登录状态并进入登录页。

自动化、真实 Supabase、真实 Qwen、滥用控制和 Android 关闭门禁均已完成，Issue #7 可以关闭。
