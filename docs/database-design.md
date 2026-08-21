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
| `storage_path` | `text` | not null unique，必须位于该用户路径前缀 |
| `mime_type` | `text` | not null，MVP 仅允许批准的图片 MIME |
| `byte_size` | `bigint` | not null，必须 > 0 且不超过服务端限制 |
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

## 4. RLS 原则

所有业务表必须 `enable row level security`，生产迁移建议同时 `force row level security`。基本策略为：

- Select：`auth.uid() = user_id`。
- Insert：`auth.uid() = user_id`，或只开放不接受 `user_id` 的 security invoker RPC。
- Update/Delete：同时使用 `using (auth.uid() = user_id)` 和 `with check (auth.uid() = user_id)`。
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
