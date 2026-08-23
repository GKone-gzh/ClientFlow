# Phase 2 P3 Real Intake Acceptance

验收日期：2026-08-23

## 范围

本验收覆盖 ClientFlow 首个真实 MVP Intake 闭环：

`真实登录 -> 选择截图 -> private Storage -> request-extraction -> Server AI Stub -> needs_review -> Review/修改 -> confirm-extraction -> 原子创建 Client/Project/Requirements/Tasks -> 真实 Client Detail`

唯一测试替身是运行在 Supabase Edge Function 服务端边界内的 `ConfiguredStubAIProvider`。本阶段没有接入真实付费 AI、AI Key、正式 Figma UI、支付或订阅。

## 部署

- `request-extraction`、`get-extraction`、`confirm-extraction` 已部署到真实 Supabase 项目。
- `AI_PROVIDER_STUB_RESULT_JSON` 作为 server-only Supabase Secret 配置，只包含固定测试数据。
- App 继续只使用 Project URL、publishable key 和用户 Session。
- Edge Function 使用服务端 token verifier 验证用户，再以已验证的用户 Authorization 执行 RLS-bound RPC/查询。

## 自动化验收

`pnpm smoke:intake` 在真实 Supabase 项目中通过，安全输出为：

```json
{"check":"supabase-intake","aiProvider":"stub","clientDetailRead":true,"confirmed":true,"crossUserRejected":true,"idempotent":true,"projectCount":1,"requirementCount":2,"status":"passed","taskCount":2,"uploadFinalStatus":"completed"}
```

该 smoke 实际验证：

- User A 使用真实 Session 创建并上传 private Storage 对象。
- `request-extraction` 使用刚创建的真实 `uploadId`。
- 服务端重新下载并校验对象，Stub 返回值经 `AIExtractionResultSchema` 校验后进入 `needs_review`。
- App Adapter 通过 `get-extraction` 获取结构化结果。
- 修改后的 payload 再经公共 Schema 和服务端校验。
- `confirm-extraction` 创建 1 个 Client、1 个 Project、2 条 Requirements、2 条 Tasks。
- 同一 extraction 第二次确认返回完全相同的 ID 集合，没有重复实体。
- extraction 最终为 `confirmed`；upload 按既有状态机在提取完成后为 `completed`。
- Client Detail 通过真实 Repository 读取确认返回的完整实体图。
- User B 对 User A 的 upload、extraction、client、project、requirements、tasks 均不可见。
- User B 请求处理或确认 User A 的资源被服务端拒绝。

## Android 真机验收

Android Expo Go 局域网真机验收通过：

- 真实账号进入 App。
- 从首页进入聊天截图 Intake。
- 选择并处理真实截图。
- private Storage 上传与服务端 Stub 提取成功。
- Review 页面展示客户、项目、2 条需求、2 个建议任务、confidence 和 warning。
- 用户确认后成功跳转客户详情。
- 客户详情从真实数据库显示 Client、Project、2 条 Requirements 和2条 Tasks。
- 真机运行期间未出现影响流程的运行时错误；观察到一次 Auth lock contention warning，但 Session、查询和确认均成功，保留为后续观察项。

## 安全结论

- AI Stub 只运行在服务端，移动端没有 AI Provider Secret。
- 客户端请求不接受 owner/userId/storagePath 注入。
- Storage bucket 延续 P2 验收结果，保持 private，未签名公开访问被拒绝。
- 管理员凭据、access token、refresh token、signed upload token 和图片内容未写入日志、Issue 或 Git。
- 无效 Provider output 不进入 `result` 或 raw_result；失败只记录稳定错误码。
- PGlite 与真实 User A/B 验收共同确认 RLS 是最终数据隔离边界。

## 自动化门禁

- `pnpm verify`：通过。
- Contract/database parity：5/5。
- PGlite Migration/RLS：6/6。
- Contracts：7/7。
- Edge Functions：15/15。
- Mobile：54/54。
- `pnpm build`：通过。
- Expo Web：37 个静态路由导出，Web smoke 通过。

## 提交

- `824bbc9e6d1e6a97dcebd2b9bccb06f6af523d02`：Supabase Intake、业务 Repository、Review 和 Client Detail 接线。
- `6a2b508e501944e17ca1c50762f8ac1068485073`：真实 Supabase Intake E2E 与 A/B 隔离 smoke。

## 已知限制

- Stub 返回固定结构化测试结果，不读取截图语义；这是本阶段唯一允许的假实现。
- E2E smoke 会在真实项目保留明确的测试 Client/Project/Requirement/Task 数据；当前未引入超出 MVP 范围的管理员清理接口。
- 正式 Figma UI 尚未交付，页面继续使用基础 Placeholder UI。
