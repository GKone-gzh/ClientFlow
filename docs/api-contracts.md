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

## 4. Repository 接口

公共接口定义在 `interfaces.ts`。职责如下：

- `ClientRepository`：当前用户的 client list/get/create/update。
- `ProjectRepository`：按 client list、get/create/update。
- `RequirementRepository`：按 project 有序读取 requirements。
- `TaskRepository`：按 project 有序读取 tasks。
- `UploadRepository`：准备受限上传、读取 upload、上传完成确认。
- `AIExtractionRepository`：读取 extraction、对已上传文件请求提取。

Repository 必须满足：

- 返回领域模型，不把 Supabase row、HTTP response 或 SDK error 泄漏给 UI。
- 找不到数据返回 `null`，授权失败返回标准错误，不能用空结果掩盖所有错误。
- App Mock 和 Supabase 实现遵守相同接口和状态语义。
- 列表 MVP 可先返回有上限的数组；引入分页前必须统一增加公共分页合同。

## 5. Service 接口

`IntakeService` 负责核心截图接单用例：

```ts
interface IntakeService {
  requestExtraction(uploadId: EntityId): Promise<AIExtraction>;
  getValidatedResult(extractionId: EntityId): Promise<AIExtractionResult | null>;
  confirm(input: ConfirmExtractionInput): Promise<ConfirmExtractionResult>;
}
```

`confirm` 必须在服务端再次校验 payload，并通过原子事务创建 Client、Project、Requirements、Tasks。返回的四组 ID 是导航和刷新提示，不替代后续权威查询。

## 6. AI Provider 接口

```ts
interface AIProvider {
  extractScreenshot(input: {
    mimeType: string;
    imageBytes: Uint8Array;
  }): Promise<unknown>;
}
```

Provider 只能在 Edge Function/安全后端实现和调用。返回 `unknown` 是刻意设计：调用方必须使用 `AIExtractionResultSchema.safeParse`，不能对模型输出做类型断言。

当前 extraction schema version 为 `1`，包含：client candidate、project candidate、至少一个 requirement、suggested tasks、confidence 和 warnings。修改必填字段或语义时必须提升版本并保留兼容读取策略。

## 7. 上传合同

`PrepareUploadInput` 只接受 `mimeType`、`byteSize`、`originalFileName`。服务端验证后返回 `uploadId`、规范化 `storagePath` 和短时 `signedUploadToken`。原始文件名仅用于日志友好的元信息且需要清洗，不参与路径授权。

上传成功后客户端调用 `markUploaded(uploadId)`。服务端必须实际确认对象存在、路径归属、大小和 MIME 合法，不能仅相信客户端回调。

## 8. 错误合同

跨边界错误统一映射为：

```ts
interface ContractErrorShape {
  code: ContractErrorCode;
  message: string;
  retryable: boolean;
  details?: Record<string, unknown>;
}
```

稳定 code：`unauthenticated`、`forbidden`、`not_found`、`validation_failed`、`conflict`、`upload_failed`、`extraction_failed`、`rate_limited`、`internal_error`。UI 根据 code/retryable 决定行为，不解析 message 文本。服务端日志可保存内部 correlation ID，但不能将 Secret、SQL 或 Provider 原始错误直接返回客户端。

## 9. 建议路由命名

Expo Router 页面命名由窗口3按以下稳定业务语义落地，视觉层不影响路由合同：

- `/(auth)/sign-in`
- `/(app)/clients`
- `/(app)/clients/[clientId]`
- `/(app)/intake/upload`
- `/(app)/intake/[extractionId]/review`

Edge Function 名称由窗口2使用：

- `prepare-upload`
- `request-extraction`
- `get-extraction`
- `confirm-extraction`

任何重命名必须先更新本文件并同步两侧。
