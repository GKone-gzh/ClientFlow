# ClientFlow API Contracts

## 1. 权威来源

运行时公共合同位于 `packages/contracts/src`，通过 `@clientflow/contracts` 导入。本文件解释语义和安全边界；代码中的精确签名与 Zod Schema 是编译和运行时权威。

合同变更流程：先更新本文或 `database-design.md`，主架构窗口确认并通知另一侧，再修改 contracts 和实现。后端或 App 不得独立新增同义 DTO、enum、错误码或路由名。

## 2. 命名与序列化

- TypeScript 使用 `camelCase`，Postgres 使用 `snake_case`；映射只存在于 Repository/adapter 边界。
- ID 是 UUID 字符串，时间是 UTC ISO 8601 字符串，自然日期是 `YYYY-MM-DD`。
- 金额输入输出 MVP 使用 number，数据库使用 `numeric(14,2)`；不得使用浮点运算计算复杂财务结果。
- `null` 表示明确无值，optional 字段仅用于 partial update。
- 所有 owner 从认证 session 获取。任何 create/update input 都不包含 `userId`。

## 3. 公共状态

| Type | Values |
|---|---|
| `ClientStatus` | `lead`, `active`, `inactive`, `archived` |
| `ProjectStatus` | `draft`, `active`, `on_hold`, `completed`, `cancelled`, `archived` |
| `TaskStatus` | `todo`, `in_progress`, `blocked`, `done`, `cancelled` |
| `UploadStatus` | `pending`, `uploaded`, `processing`, `completed`, `failed` |
| `AIExtractionStatus` | `queued`, `processing`, `needs_review`, `confirmed`, `failed` |

## 4. Auth 接口

App 通过 `AuthService` 使用认证能力，页面和路由不得直接依赖 Supabase SDK。该端口定义在 App 的中立 service 层，因为服务端继续以 bearer token 和 `auth.uid()` 作为认证边界，不共享客户端 Session 对象。

```ts
interface AuthService {
  getSession(): Promise<AuthSession | null>;
  onSessionChange(listener: (session: AuthSession | null) => void): () => void;
  signInWithPassword(credentials: AuthCredentials): Promise<AuthSession>;
  signUpWithPassword(credentials: AuthCredentials): Promise<AuthSignUpResult>;
  signOut(): Promise<void>;
  startAutoRefresh(): void;
  stopAutoRefresh(): void;
}
```

- `AuthSession` 只向 UI 暴露路由需要的用户标识和邮箱，不暴露 refresh token。
- Supabase Adapter 必须持久化 Session，并在原生 App 前后台切换时启停 token refresh。
- Native Supabase Adapter 使用系统安全凭据存储；历史 AsyncStorage Session 只允许一次性迁移，迁移或退出后必须删除旧值。Web 使用独立 Web storage adapter。
- Mock Adapter 必须实现相同端口，用于无后端测试和开发。
- 客户端配置只允许 Supabase URL 与 anon/publishable key；service-role、`sb_secret_` 和 AI Secret 禁止进入 `EXPO_PUBLIC_*`。
- 注册启用邮件确认时可以返回用户但不返回 Session；UI 必须留在认证区并提示检查邮箱。
- Session 恢复完成前不作登录区或 App 区重定向，避免短暂暴露错误页面。

## 5. Repository 接口

公共接口定义在 `interfaces.ts`。职责如下：

- `ClientRepository`：当前用户的 cursor page/get/create/update。
- `ProjectRepository`：按 client cursor page、get/create/update。
- `RequirementRepository`：按单个或一组 project ID 有序读取 requirements。
- `TaskRepository`：当前用户 cursor page，以及按单个或一组 project ID 有序读取 tasks。
- `UploadRepository`：准备受限上传、读取 upload、上传完成确认。
- `AIExtractionRepository`：读取 extraction、对已上传文件请求提取。

Repository 必须满足：

- 返回领域模型，不把 Supabase row、HTTP response 或 SDK error 泄漏给 UI。
- 找不到数据返回 `null`，授权失败返回标准错误，不能用空结果掩盖所有错误。
- App Mock 和 Supabase 实现遵守相同接口和状态语义。
- Client、Project 和当前用户 Task 列表统一返回 `CursorPage<T>`；Mock、Supabase 和 Feature 不得定义第二套分页 DTO。
- Cursor 是不透明字符串，当前版本包含版本号、排序列、时间戳和 UUID secondary key。Client/Project 使用 `(updated_at desc, id desc)`；Task 使用 `(created_at desc, id desc)`。
- 默认页大小集中在 contracts：Client 50、Project 25、Task 50；公共上限为 100。Repository 使用 `limit + 1` 判断 `nextCursor`，不能依赖静默 `.limit(200)` 表示完整结果。
- Task page 可使用公共 `TaskStatus` 过滤；owner 仍由 Session 与 RLS 决定，分页输入不接受 `userId`。
- Requirements/Tasks 批量 project ID 查询单次最多 50 个 ID，Feature 只对当前 Project page 执行批量读取。

## 6. Service 接口

`IntakeService` 负责核心截图接单用例：

```ts
interface IntakeService {
  requestExtraction(uploadId: EntityId): Promise<AIExtraction>;
  getValidatedResult(extractionId: EntityId): Promise<AIExtractionResult | null>;
  confirm(input: ConfirmExtractionInput): Promise<ConfirmExtractionResult>;
}
```

`confirm` 必须在服务端再次校验 payload，并通过原子事务创建 Client、Project、Requirements、Tasks。返回的四组 ID 是导航和刷新提示，不替代后续权威查询。

`PrepareUploadInputSchema`、`MarkUploadedInputSchema`、`RequestExtractionInputSchema`、`GetExtractionInputSchema` 和 `ConfirmExtractionInputSchema` 是对应服务端入口的运行时校验器。`PrepareUploadResultSchema`、`UploadSchema`、`AIExtractionSchema`、`ConfirmExtractionResultSchema` 以及 Client/Project/Requirement/Task 的领域 Schema 用于 App 校验跨 Edge Function 或数据库边界的响应。它们不改变 Repository/Service 的现有方法签名；App 继续通过 Repository/Service 接口调用，服务端与 App 都必须在各自信任边界解析未经信任的 payload。

截图接单的上传、处理中、失败和成功阶段属于 App 本地 workflow 状态，不是持久化领域状态，不加入公共 contracts。测试场景和 Mock Provider 类型同样只允许存在于 App 测试替身边界。

## 7. AI Provider 接口

```ts
interface AIProvider {
  extractScreenshot(input: {
    mimeType: string;
    imageBytes: Uint8Array;
  }): Promise<unknown>;
}
```

Provider 只能在 Edge Function/安全后端实现和调用。返回 `unknown` 是刻意设计：调用方必须使用 `AIExtractionResultSchema.safeParse`，不能对模型输出做类型断言。

服务端内部 `ServerAIProvider` 在该公共端口外包装为 `{ result, usage }`。`result` 仍是 `unknown`；`usage` 只包含实际 attempt count 以及 Provider 明确返回的 nullable input/output token。不得从图片大小或文本长度估算 token 并冒充账单数据。

当前 extraction schema version 为 `1`，包含：client candidate、project candidate、至少一个 requirement、suggested tasks、confidence 和 warnings。修改必填字段或语义时必须提升版本并保留兼容读取策略。

服务端 Provider 配置合同：

- `AI_PROVIDER=stub` 使用 `ConfiguredStubAIProvider` 和 `AI_PROVIDER_STUB_RESULT_JSON`。
- `AI_PROVIDER=qwen` 使用固定模型 `qwen3-vl-plus`、华北 2（北京）endpoint 和 Supabase Secret `DASHSCOPE_API_KEY`。
- 未配置、未知 Provider 或缺少相应 Secret 必须安全失败，不能自动切换到付费模型或第二个 Provider。
- Provider 配置、模型名和 endpoint 不属于 App DTO，不能通过客户端请求覆盖。
- Qwen JSON Object 只提供 JSON 语法约束；服务端仍必须解析为 `unknown` 并执行 `AIExtractionResultSchema.safeParse`。

## 8. 上传合同

`PrepareUploadInput` 只接受 `mimeType`、`byteSize`、`originalFileName`。服务端验证后返回 `uploadId`、规范化 `storagePath` 和短时 `signedUploadToken`。原始文件名仅用于日志友好的元信息且需要清洗，不参与路径授权。

上传成功后客户端以 `{ uploadId }` 调用 `mark-uploaded`；`UploadRepository.markUploaded(uploadId)` 封装该调用。服务端必须实际确认对象存在、路径归属、大小和 MIME 合法，不能仅相信客户端回调。成功响应为公共 `Upload` 模型且 `status` 必须为 `uploaded`。客户端不能提交 owner、userId 或 storagePath。

## 9. 错误合同

跨边界错误统一映射为：

```ts
interface ContractErrorShape {
  code: ContractErrorCode;
  message: string;
  retryable: boolean;
  details?: Record<string, unknown>;
}
```

稳定 code：`unauthenticated`、`forbidden`、`not_found`、`validation_failed`、`conflict`、`upload_failed`、`extraction_failed`、`rate_limited`、`quota_exceeded`、`internal_error`。UI 根据 code/retryable 决定行为，不解析 message 文本。`rate_limited` 表示短时间窗限制，`quota_exceeded` 表示滚动 24 小时技术额度耗尽。错误 `details.requestId` 可返回安全 correlation ID，但不能将 Secret、SQL、stack trace 或 Provider 原始错误返回客户端。

`request-extraction` 的幂等与额度语义：

- owner 只取自验证后的 Session，输入只接受 `uploadId`。
- 同一 user/upload 的顺序重试返回已有 extraction，`needs_review` 或 `confirmed` 不再次调用 Provider。
- 同一 upload 已处于 `processing` 时安全返回或拒绝，不自动再次付费调用。
- 每用户同时最多一个有效 extraction；滚动 1 分钟/1 小时/24 小时默认额度分别为 5/30/100。
- 数据库必须在 Provider 调用前原子完成额度检查、processing 状态与 usage 预约。
- App 仍只提交 `uploadId`。Edge 验证 Session 后，通过 server-only client 把已验证 user ID、固定 provider/model 和 request ID 传给 service-role-only reservation RPC；客户端不能直接执行 AI 状态 RPC。
- Edge 响应携带 `x-request-id`；若客户端提供的 ID 不符合安全格式，服务端重新生成。

## 10. 建议路由命名

Expo Router 页面命名由窗口3按以下稳定业务语义落地，视觉层不影响路由合同：

- `/(auth)/sign-in`
- `/(app)/clients`
- `/(app)/clients/[clientId]`
- `/(app)/intake/upload`
- `/(app)/intake/[extractionId]/review`

Edge Function 名称：

- `prepare-upload`
- `mark-uploaded`
- `request-extraction`
- `get-extraction`
- `confirm-extraction`

任何重命名必须先更新本文件并同步两侧。
