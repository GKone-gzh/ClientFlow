# Phase 2 P4 Real Qwen Vision Acceptance

验收日期：2026-08-23

## 范围

本验收覆盖 ClientFlow 首个真实视觉 AI Provider 闭环：

`真实登录 -> private Storage 截图 -> request-extraction -> qwen3-vl-plus -> Zod 校验 -> needs_review -> 用户修改 -> 原子确认 -> 真实 Client Detail`

本阶段只接入项目所有者选择的阿里云百炼 `qwen3-vl-plus`。没有接入第二个模型、自动模型路由、正式 Figma UI、支付或订阅。

## 部署与 Secret

- `AI_PROVIDER=qwen` 和 `DASHSCOPE_API_KEY` 只配置为 Supabase server secrets。
- Qwen 调用只发生在 Supabase Edge Function；App 不包含 Provider endpoint、model selector、prompt、AI Key 或管理员凭据。
- App 继续只使用 Supabase Project URL、publishable key 和当前用户 Session。
- `request-extraction` 以用户身份读取其 private Storage 对象，校验对象路径、大小、MIME metadata 和真实图片 magic bytes 后才调用 Provider。
- Provider 原始响应、图片内容、access token、refresh token、signed upload token 和 Secret 不进入日志、Issue 或 Git。

## Provider 保护

- 固定模型 `qwen3-vl-plus` 和北京区 OpenAI-compatible endpoint，客户端不能覆盖。
- 单次输出上限 2048 tokens，Provider response 上限 128 KiB。
- 请求超时 30 秒；超时不自动重复付费调用。
- 429 和 5xx 最多重试一次，`Retry-After` 最长等待 1 秒；认证错误不重试。
- Provider 错误只映射为稳定的 `extraction_failed` 或 `rate_limited` 合同，不返回原始响应。
- 结果必须先通过共享 `AIExtractionResultSchema`，再经过提示注入和元指令输出门禁，最后才能持久化。
- 可疑文字仅出现在 warnings 时会被替换为通用安全警告；进入业务字段时整份业务文本被丢弃并降级为低置信度人工 Review 占位结果。

当前没有实现用户级付费额度或云端预算硬上限。成本保护依赖显式用户操作、固定模型、输出上限、30 秒超时和最多两次 HTTP 尝试；正式商业化前仍需增加服务端用量计量和预算告警。

## 真实自动化验收

`pnpm smoke:qwen` 在真实 Supabase 和真实 Qwen 中通过：

```json
{"aiModel":"qwen3-vl-plus","aiProvider":"qwen","clientDetailRead":true,"confirmed":true,"crossUserRejected":true,"idempotent":true,"extractionDurationMs":10695,"projectCount":1,"requirementCount":2,"status":"passed","taskCount":3,"uploadFinalStatus":"completed"}
```

该 smoke 验证：

- User A 上传 private Storage 截图并获得真实 uploadId。
- Edge Function 从 private Storage 读取并验证图片，再调用 Qwen。
- Qwen 输出经共享 Zod Schema 和安全门禁进入 `needs_review`。
- 修改后的结果确认成功，并创建真实 Client、Project、Requirements 和 Tasks。
- 同一 extraction 重复确认返回相同实体，不重复写入。
- Client Detail 通过真实 Repository 读取完整实体图。
- User B 无法读取或操作 User A 的 upload、extraction 和业务实体。

## 准确率与安全 Fixtures

`pnpm smoke:qwen:accuracy` 使用 5 张完全虚构的本地截图并通过 5/5：

- 完整客户请求：姓名、预算、绝对日期、需求和任务可用。
- 缺失姓名：返回 `待确认客户` 和明确 warning，不虚构姓名。
- 金额与日期：正确返回金额和 ISO 日期。
- 多需求：拆分出多条可执行 Requirements。
- 模糊和提示注入：返回占位客户/项目、1 条待确认需求、0 个任务和1条通用安全警告；持久化结果不包含注入关键词。

已知模型局限：一次虚构 fixture 中，两字聊天标题未稳定识别，系统安全回退为 `待确认客户` 并要求人工确认。P4 不声明 100% OCR 或语义准确率，Review 仍是强制业务步骤。

## Android 真机验收

Android Expo Go 局域网验收通过：

- 真实账号选择截图并完成 private Storage 上传。
- 第一次使用包含通用 AI 回答协议的截图时，模型曾把“已知/未知、合理假设、最小实验”等元指令误建为 Requirements；该结果不计为通过。
- `d6f568f` 增加 Provider 提示和确定性元指令降级门禁，错误测试数据未被擅自删除。
- 使用完全虚构的微信测试图复验时，Qwen 正确识别客户名、项目名、`6800 CNY`、`2026-10-30`、3 条 Requirements 和5条 Tasks，置信度为 95%。
- “等待确认后再开发”没有被误建为项目需求。
- 用户在 Review 页面把项目名修改为“摄影工作室官网测试版”，确认成功。
- Client Detail 从真实数据库显示修改后的项目名、3 条 Requirements 和5条 Tasks。

## 自动化门禁

- `pnpm verify`：通过。
- TypeScript、ESLint、Expo lint 和模块边界：通过。
- Contract/database parity：5/5。
- PGlite Migration/RLS：6/6。
- Contracts：7/7。
- Edge Functions：34/34。
- Mobile：58/58。
- `pnpm build`：通过。
- Expo Web：37 个静态路由导出，Mobile Web smoke 通过。

## 安全结论

- AI Key、service-role key 和管理员凭据均不在 React Native 客户端。
- Storage bucket 保持 private；P2 的未签名 public URL 拒绝验收仍然成立。
- Owner 由服务端验证的 Session 和 RLS 决定，客户端不能注入 userId 或 storagePath。
- Provider 输出在 Zod 和安全门禁前不会写入 `result`，不保存 `raw_result`。
- 提示注入内容不能触发工具、数据库写入、消息发送或 Secret 读取；Provider 没有这些能力。
- User A/B 真实 smoke 与数据库 RLS 测试共同验证数据隔离。

## 主要提交

- `1fb1942`：记录项目所有者选择 `qwen3-vl-plus`。
- `5e89cf7`：实现 server-only Qwen Provider 和安全边界。
- `2f9471c`：增加真实 Qwen smoke 与准确率 fixtures。
- `652ec82`：收紧业务语义提取规则。
- `aad33ad`、`9ac47fc`：增加注入输出门禁和安全 Review 降级。
- `b5f39b4`：修复完整 Qwen smoke fixture 配置。
- `d6f568f`：排除 AI 回答协议类元指令。

## 验收结论

Phase 2 P4 的真实 Qwen 主链路、Schema 校验、人工 Review、确认持久化、Client Detail、提示注入降级、User A/B 隔离和 Android 真机流程均通过。Issue #6 可以关闭。
