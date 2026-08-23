# ClientFlow 数据库设计

## 1. 设计原则

- Postgres `auth.users.id` 是租户边界，MVP 不引入 organization/team。
- 每张用户业务表都保存非空 `user_id`，便于明确 RLS 和索引。
- 客户端不能写入任意 `user_id`；insert 时必须满足 `user_id = auth.uid()`，推荐由数据库函数填充。
- 子表使用复合外键保证父子记录属于同一用户，避免只检查子表 `user_id` 的横向越权。
- 所有时间使用 `timestamptz` UTC；只表示自然日期的 due date 使用 `date`。
- 删除默认采用受控 hard delete 或状态归档。MVP 不提前建设通用 soft-delete 框架。
- Migration 是 schema 的权威来源；本文件是实施前合同，窗口2落地后需保持同步。

## 2. Postgres 状态类型

数据库 enum 值必须与 `@clientflow/contracts` 完全一致：

| Type | Values |
|---|---|
| `client_status` | `lead`, `active`, `inactive`, `archived` |
| `project_status` | `draft`, `active`, `on_hold`, `completed`, `cancelled`, `archived` |
| `task_status` | `todo`, `in_progress`, `blocked`, `done`, `cancelled` |
| `upload_status` | `pending`, `uploaded`, `processing`, `completed`, `failed` |
| `ai_extraction_status` | `queued`, `processing`, `needs_review`, `confirmed`, `failed` |

禁止创建同义状态，例如 `waiting_quote`/`pending_quote`、`done`/`completed` 混用。增加或重命名值属于公共合同变更。

## 3. 表结构

### 3.1 `profiles`

| Column | Type | Constraints / Notes |
|---|---|---|
| `id` | `uuid` | PK，FK -> `auth.users(id)` on delete cascade |
| `display_name` | `text` | nullable |
| `created_at` | `timestamptz` | not null default `now()` |
| `updated_at` | `timestamptz` | not null default `now()` |

### 3.2 `clients`

| Column | Type | Constraints / Notes |
|---|---|---|
| `id` | `uuid` | PK default `gen_random_uuid()` |
| `user_id` | `uuid` | not null，FK -> `auth.users(id)` on delete cascade |
| `name` | `text` | not null，trim 后非空 |
| `contact_handle` | `text` | nullable |
| `contact_channel` | `text` | nullable；MVP 保持文本，不提前建设渠道 enum |
| `notes` | `text` | nullable |
| `status` | `client_status` | not null default `lead` |
| `created_at` | `timestamptz` | not null default `now()` |
| `updated_at` | `timestamptz` | not null default `now()` |

约束和索引：`unique(id, user_id)`、`index(user_id, status, updated_at desc)`。

### 3.3 `projects`

| Column | Type | Constraints / Notes |
|---|---|---|
| `id` | `uuid` | PK default `gen_random_uuid()` |
| `user_id` | `uuid` | not null |
| `client_id` | `uuid` | not null |
| `name` | `text` | not null，trim 后非空 |
| `summary` | `text` | nullable |
| `budget_amount` | `numeric(14,2)` | nullable，必须 >= 0 |
| `budget_currency` | `text` | nullable，3 位大写 ISO 4217 代码 |
| `due_date` | `date` | nullable |
| `status` | `project_status` | not null default `draft` |
| `created_at` | `timestamptz` | not null default `now()` |
| `updated_at` | `timestamptz` | not null default `now()` |

复合 FK：`(client_id, user_id) -> clients(id, user_id)`。索引：`unique(id, user_id)`、`index(user_id, client_id, updated_at desc)`。

### 3.4 `requirements`

| Column | Type | Constraints / Notes |
|---|---|---|
| `id` | `uuid` | PK default `gen_random_uuid()` |
| `user_id` | `uuid` | not null |
| `project_id` | `uuid` | not null |
| `content` | `text` | not null，trim 后非空 |
| `sort_order` | `integer` | not null default 0，必须 >= 0 |
| `source_extraction_id` | `uuid` | nullable |
| `created_at` | `timestamptz` | not null default `now()` |
| `updated_at` | `timestamptz` | not null default `now()` |

复合 FK：`(project_id, user_id) -> projects(id, user_id)`；source extraction 也必须属于同一用户。索引：`unique(id, project_id, user_id)`、`index(user_id, project_id, sort_order)`。

### 3.5 `tasks`

| Column | Type | Constraints / Notes |
|---|---|---|
| `id` | `uuid` | PK default `gen_random_uuid()` |
| `user_id` | `uuid` | not null |
| `project_id` | `uuid` | not null |
| `requirement_id` | `uuid` | nullable |
| `title` | `text` | not null，trim 后非空 |
| `description` | `text` | nullable |
| `due_at` | `timestamptz` | nullable |
| `sort_order` | `integer` | not null default 0，必须 >= 0 |
| `status` | `task_status` | not null default `todo` |
| `created_at` | `timestamptz` | not null default `now()` |
| `updated_at` | `timestamptz` | not null default `now()` |

复合 FK 保证 project 和 requirement 同属当前 user/project。索引：`index(user_id, project_id, status, sort_order)`。

### 3.6 `uploads`

| Column | Type | Constraints / Notes |
|---|---|---|
| `id` | `uuid` | PK default `gen_random_uuid()` |
| `user_id` | `uuid` | not null |
| `storage_path` | `text` | not null unique，严格等于 `{user_id}/{id}/source` |
| `mime_type` | `text` | not null，MVP 仅允许 `image/jpeg`、`image/png`、`image/webp` |
| `byte_size` | `bigint` | not null，必须 > 0 且不超过 10 MiB（`10485760` bytes） |
| `status` | `upload_status` | not null default `pending` |
| `error_code` | `text` | nullable，不保存 Secret 或图片内容 |
| `created_at` | `timestamptz` | not null default `now()` |
| `updated_at` | `timestamptz` | not null default `now()` |

索引：`unique(id, user_id)`、`index(user_id, created_at desc)`。

### 3.7 `ai_extractions`

| Column | Type | Constraints / Notes |
|---|---|---|
| `id` | `uuid` | PK default `gen_random_uuid()` |
| `user_id` | `uuid` | not null |
| `upload_id` | `uuid` | not null unique；一个 upload 只产生一个权威 extraction |
| `status` | `ai_extraction_status` | not null default `queued` |
| `schema_version` | `integer` | not null default 1，必须 > 0 |
| `provider` | `text` | nullable，服务端写入 |
| `model` | `text` | nullable，服务端写入 |
| `result` | `jsonb` | nullable，通过 Zod 后写入 |
| `error_code` | `text` | nullable，使用稳定错误码 |
| `confirmed_at` | `timestamptz` | nullable |
| `confirmed_client_id` | `uuid` | nullable |
| `confirmed_project_id` | `uuid` | nullable |
| `created_at` | `timestamptz` | not null default `now()` |
| `updated_at` | `timestamptz` | not null default `now()` |

复合 FK：`(upload_id, user_id) -> uploads(id, user_id)`。确认后的实体 ID 用于实现幂等响应，且必须属于同一 user。索引：`unique(id, user_id)`、`index(user_id, status, created_at desc)`。

MVP 首个 schema **不创建 `raw_result` 列**。`result` 只允许保存通过当前版本 `AIExtractionResultSchema` 校验的结构化数据；未通过校验的完整 Provider 输出不得写入数据库或日志。失败记录仅保留稳定 `error_code` 和不含聊天内容的必要诊断元数据。

未来若调试需求确实要求持久化 raw output，必须先通过新的架构决策，至少明确字段级加密、仅服务端访问、最短保留期限、自动清理任务、日志脱敏、用户删除传播和安全测试，并通过独立 migration 引入，不得直接修改首个 migration。

### 3.8 `private.ai_usage`

服务端专用用量表，不在 `public` schema 暴露给 App。建议字段：`id`、`user_id`、`extraction_id`、`request_id`、`provider`、`model`、`started_at`、`completed_at`、`status`、`duration_ms`、`attempt_count`、nullable `input_tokens`、nullable `output_tokens`、nullable `error_code`。`extraction_id` 与 `request_id` 唯一；账号删除级联清理。

该表禁止保存截图、base64、聊天正文、结构化 extraction result、raw Provider response、Token 或 Secret。Token usage 仅在 Provider 返回可靠数据时写入，不能估算为账单数据。`private` schema、表和内部函数均撤销 `public`、`anon`、`authenticated` 权限。

### 3.9 `private.ai_rate_limit_config`

服务端专用集中配置表。MVP 默认：每用户并发 `1`，滚动 1 分钟 `5`，滚动 1 小时 `30`，滚动 24 小时 `100`。配置只由 migration 或受控管理员流程修改，不接受客户端参数。

开始 extraction 的数据库入口必须在单个事务中对当前用户获取 transaction-scoped advisory lock，检查时间窗 usage 和有效 processing 租约，锁定 upload/extraction，创建 usage 预约并推进状态。owner 始终由 `auth.uid()` 派生。Provider 完成/失败入口只允许受控服务端调用，并原子更新 extraction、upload 和 usage。

## 4. RLS 原则

所有业务表必须 `enable row level security`，生产迁移建议同时 `force row level security`。基本策略为：

- Select：`auth.uid() = user_id`。
- Insert：`auth.uid() = user_id`，或只开放不接受 `user_id` 的 security invoker RPC。
- 已开放的 Update/Delete：同时使用 `using (auth.uid() = user_id)` 和 `with check (auth.uid() = user_id)`。
- RLS owner 条件不能代替操作权限控制；只允许公共 Repository 合同需要的表操作，服务端状态必须通过受控 RPC、Edge Function 或 service role 写入。
- 子记录归属不仅靠 RLS，还必须由复合外键或数据库函数验证。
- service role 只在受控 Edge Function 使用，绝不进入 App。
- 所有 RLS 测试至少覆盖用户 A 可访问自己的数据、用户 A 无法 select/insert/update/delete 用户 B 数据、匿名用户无法访问。

若未来增加 `conversations`，必须按相同原则建 `user_id`、复合外键和完整 RLS；MVP 当前不提前创建该表。

## 5. Storage

- Bucket：`chat-screenshots`，必须 private。
- 对象路径：`{auth.uid()}/{upload_id}/source`，不使用用户提供的原始文件名作为路径。
- Insert/Select/Delete policy 校验首个 path segment 等于 `auth.uid()`，并校验对应 `uploads` 记录归属。
- 限制 MIME、单文件大小和单次上传数量；不信任客户端声明，Edge Function 读取时再次校验。
- AI Provider 仅通过短时读取或服务器下载访问文件，不生成公开永久 URL。

## 6. 原子确认

窗口2应实现一个受测试的事务函数/RPC，用于 `ConfirmExtractionInput`：锁定 extraction、验证 owner/status/schema、检查是否已确认、创建全部业务实体、写回确认 ID 并返回结果。任何一步失败必须整体回滚；重复请求返回第一次创建的 ID，不得重复插入。

## 7. Migration 实施状态

- 初始 Schema migration：`20260821000100_initial_schema.sql`；权限收紧 migration：`20260822000100_restrict_authenticated_permissions.sql`。
- Auth 用户删除级联删除其 profile 和全部业务数据。
- Client 删除级联删除其 projects；Project 删除级联删除 requirements 和 tasks；Upload 删除级联删除尚未被业务来源关系保护的 extraction。
- Requirement 到 source extraction、Task 到 requirement、Extraction 到 confirmed client/project 使用受限删除，避免静默丢失来源或幂等确认关系。
- 7 张 MVP 表均启用并强制 RLS，所有权表达式使用缓存式 `(select auth.uid())`；`anon` 不具备表权限。
- `authenticated` 权限矩阵：profiles 为 select 和 `display_name` 列 update；clients 为 select 及公共 Create/Update DTO 列写入；projects 为 select 及公共 Create/Update DTO 列写入，其中 `client_id` 只允许 insert；requirements、tasks、uploads、ai_extractions 为 owner select-only。ID、owner、创建时间及 Upload/Extraction 状态、Provider、模型结果和确认字段只能由数据库默认值或后续受控服务端入口写入。
- Schema 与 RLS 验证位于 `supabase/tests/database`；无 Docker 环境的 migration/RLS 回归测试位于 `supabase/tests/migration.test.mjs`。
- Phase 2.5 只通过新 migration 增加 AI usage、集中额度配置和原子入口；不得修改已发布 migration。时间窗使用接受请求的 usage 记录计数，processing/completed/failed 均计入，因为它们都可能已产生 Provider 成本。
