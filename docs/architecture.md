# ClientFlow 技术架构

## 1. 架构目标

ClientFlow MVP 服务于自由职业者、小型工作室和个体服务商。当前唯一必须闭环的主链路是：

`登录 -> 上传聊天截图 -> Storage -> AI Extraction -> Zod 校验 -> 用户确认/修改 -> 创建 Client/Project/Requirements/Tasks -> 客户详情查看`

架构优先级依次为：用户数据隔离、公共合同一致、主链路可靠、可测试、MVP 范围克制。当前不建设多人团队、复杂 CRM、销售漏斗、支付订阅、平台自动发消息、预测模型或复杂 Agent。

## 2. 总体结构

项目采用 pnpm workspace 单仓库：

```text
clientflow/
├─ apps/
│  └─ mobile/                 # Expo / React Native，窗口3负责
├─ packages/
│  └─ contracts/              # 跨模块公共类型与 Zod Schema，主架构窗口维护
├─ supabase/
│  ├─ migrations/             # 数据库 schema、函数、RLS，窗口2负责
│  ├─ functions/              # Edge Functions 和 AI Provider 实现，窗口2负责
│  └─ tests/                  # 数据库/RLS/函数测试，窗口2负责
└─ docs/                      # 架构、合同、计划与 ADR，主架构窗口维护
```

计划中的 `apps/mobile` 和 `supabase` 目录由对应窗口初始化。本基线不代替它们生成业务代码。

## 3. 模块边界

### 3.1 `packages/contracts`

这是跨模块合同的唯一来源，包含：

- `ClientStatus`、`ProjectStatus`、`TaskStatus`、`UploadStatus`、`AIExtractionStatus`。
- 领域模型与输入/输出 DTO。
- AI Extraction 的版本化 Zod Schema。
- Repository、Service、AI Provider 的 TypeScript 接口。
- 稳定的错误码。

窗口2和窗口3不得复制或重新命名这些状态。公共合同变更必须先修改 `docs/api-contracts.md` 或 `docs/database-design.md`，由主架构窗口协调后再实施。

### 3.2 `apps/mobile`

负责 Expo Router、会话状态、页面骨架、客户端交互、上传体验和 Repository 的客户端适配。移动端只持有 Supabase anon/publishable key 和用户 session，不持有 service role、AI Provider key 或其他服务器 Secret。

当前 UI 仅允许基础占位布局、表单、按钮、加载/错误状态和必要交互。正式视觉必须等待 Figma 稿，不自行引入品牌色、渐变、玻璃拟态、发光、复杂动画或大量卡片装饰。

### 3.3 `supabase`

负责 Auth、Postgres、RLS、private Storage、Migration、数据库函数、Edge Functions、Repository 实现及 AI Provider 适配。所有用户数据访问必须在数据库层校验 `auth.uid()`，不能只依赖客户端查询条件。

### 3.4 依赖方向

```text
apps/mobile ───────> packages/contracts <─────── supabase/functions
     │                                              │
     └──── Supabase public API / Edge Function ─────┘
                                      │
                                      v
                         Postgres + Storage + AI Provider
```

`packages/contracts` 不依赖 App 或 Supabase 实现。App 不直接依赖 Edge Function 内部模块。AI Provider SDK 不进入移动端依赖树。

## 4. 核心数据流

1. App 使用 Supabase Auth 建立用户 session。
2. App 请求创建 `uploads` 记录和受限上传目标；服务端从 session 取 `auth.uid()`，不接受客户端传入 owner。
3. App 使用 `prepare-upload` 返回的短时 token 和规范路径，将截图上传到 private bucket 的 `{user_id}/{upload_id}/source`；客户端不自行拼接路径。
4. App 调用 `mark-uploaded`。Edge Function 按当前 session 验证对象归属、实际大小和 MIME 后，才将 upload 状态从 `pending` 更新为 `uploaded`。
5. App 请求开始提取。Edge Function 再次验证 upload 归属并将状态从 `uploaded` 推进到 `processing`。
6. Edge Function 使用服务器 Secret 读取对象并调用 `AIProvider`。
7. 未信任的模型输出由 `AIExtractionResultSchema` 校验。成功后写入 `ai_extractions.result` 并标记 `needs_review`；失败记录稳定错误码并标记 `failed`。
8. App 展示可编辑结果。用户确认后把完整、已修改的 version 1 payload 提交到安全后端。
9. 后端再次执行 Zod 校验，并通过单个数据库事务或 RPC 原子创建 Client、Project、Requirements、Tasks，同时把 extraction 标记为 `confirmed`。
10. App 使用返回 ID 导航到客户详情并重新查询权威数据。

确认操作必须幂等：同一个 extraction 只能生成一组业务实体。网络重试不得产生重复客户或项目。

## 5. AI 调用架构

`AIProvider` 是服务端端口，具体模型供应商是可替换适配器。Provider 返回值始终视为 `unknown`，只有通过公共 Zod Schema 后才能进入数据库和业务流程。

MVP 不持久化未通过校验的完整 Provider raw output，也不在日志中记录它。`ai_extractions.result` 只能保存 `AIExtractionResultSchema` 校验成功的结构化结果。校验失败时只记录稳定 `error_code`、provider/model/schema version 和不包含用户内容的诊断元数据。

模型调用应具备：

- 服务端 Secret 管理。
- 超时、有限重试和稳定错误码。
- `schemaVersion`、provider、model 记录，便于定位兼容性问题。
- 输入文件大小和 MIME 类型限制。
- 日志脱敏，不记录截图内容、完整模型输出或认证令牌。
- 用户确认前不创建正式 Client/Project/Task 数据。
- Provider 调用前由数据库原子检查用户级并发与滚动时间窗额度，不能使用 Edge Function 进程内计数。
- 同一 upload 只能对应一个权威 extraction；一旦进入 `processing` 且无法证明 Provider 未调用，不得自动再次发起付费请求。
- 每次已接受调用保存不含用户内容的 usage 元数据，供防刷和成本控制使用。

首个真实实现由项目所有者选择阿里云百炼 `qwen3-vl-plus`。服务端以非思考模式请求 JSON Object，并继续把返回内容视为不可信 `unknown`。`AI_PROVIDER=stub|qwen` 是 Edge Function 的 server-only 运行时开关；Qwen API Key 只能配置为 Supabase Secret `DASHSCOPE_API_KEY`。客户端不能选择 Provider、模型、endpoint 或请求参数。

Edge Intake 在下载并复核图片后调用 service-role-only reservation RPC。只有返回 `should_invoke_provider=true` 才能执行 Provider。成功后 complete RPC 原子写入已校验 result 和 usage；失败后 fail RPC 原子结束三个状态。若 Provider 已成功但 complete RPC 的结果不确定，记录保持 `processing`，客户端重试不得自动再次调用 Provider，需要后续受控恢复流程处理。

## 6. 前后端关系

客户端 Repository 实现可封装 Supabase SDK，但调用者只依赖 `@clientflow/contracts` 中的接口。服务端负责授权、归属、状态转换和事务；客户端负责输入、呈现和交互状态。

Mock Repository 仅用于 App 独立开发，必须实现相同公共接口。Mock 数据不能定义第二套 DTO 或状态。接入真实后端时应替换实现，而不是改页面业务合同。

Supabase production composition 与 Mock composition 必须在创建阶段分离。Supabase 路径不得初始化 Mock Repository、Mock AI scenario 或 development tools；`developmentTools` 在 Supabase 模式始终为 `null`。Native Auth Session 使用平台安全凭据存储，Web 使用独立 Web storage adapter，二者保持相同 Supabase storage 接口。

## 7. 状态转换

允许的核心转换如下，服务端必须拒绝非法跳转：

- Upload：`pending -> uploaded -> processing -> completed`，任一处理阶段可到 `failed`；失败后重新上传创建新 upload。
- AI Extraction：`queued -> processing -> needs_review -> confirmed`，处理阶段可到 `failed`。
- Client：`lead -> active -> inactive -> archived`，MVP 允许从 inactive 恢复 active。
- Project：`draft -> active -> on_hold/completed/cancelled -> archived`，on_hold 可恢复 active。
- Task：`todo -> in_progress/blocked/done/cancelled`，blocked 可恢复 todo 或 in_progress。

## 8. 集成门禁

每个功能分支在提交前至少运行对应的 TypeScript、Lint、Unit Test，并报告 App 启动或 Migration/RLS 测试结果。主架构窗口在合并前检查公共合同、依赖方向、安全隔离、重复逻辑、测试和迁移可逆性。

## 9. 生产安全边界

- 所有高价值 Edge Function 必须验证 Supabase Session；CORS 不是身份验证或授权边界。
- Request correlation ID 只接受安全格式，否则由服务端生成；响应和结构化日志使用同一 ID。
- 日志采用字段白名单，不序列化请求 headers/body、Provider raw response、SDK error 或 Secret。
- Public env 只能包含明确允许的 Supabase public configuration 与 App adapter selector；疑似 service-role、AI Secret 或 admin token 必须在构建前失败。
- 详细攻击面、额度规则和数据保留原则见 `docs/threat-model.md`。
