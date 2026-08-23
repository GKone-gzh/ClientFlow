# ClientFlow Architecture Decision Records

## ADR-001：使用 Supabase 作为 MVP 后端平台

- 状态：Accepted
- 日期：2026-08-21
- 决策：使用 Supabase Auth、Postgres、RLS、Storage 和 Edge Functions。
- 原因：MVP 需要认证、关系数据、文件上传、服务端逻辑和强制用户隔离。Supabase 在保持标准 Postgres 和 SQL migration 的同时减少基础设施工作。
- 后果：RLS 和 migration 成为发布门禁；不能把 Supabase 客户端查询条件当作授权；Provider 特有代码必须封装在 adapter/Repository 边界。

## ADR-002：App 使用 Expo 与 Expo Router

- 状态：Accepted
- 日期：2026-08-21
- 决策：移动端使用 Expo、React Native、TypeScript 和 Expo Router。
- 原因：满足 iOS/Android MVP 的开发效率，并以文件路由清晰表达 auth、client 和 intake 流程。
- 后果：窗口3负责初始化 `apps/mobile`；路由名称是公共合同，变更需协调；需要确认 workspace/Metro 对 `@clientflow/contracts` 源码包的解析。

## ADR-003：AI API 不放在移动端

- 状态：Accepted
- 日期：2026-08-21
- 决策：所有 AI Provider 调用通过 Supabase Edge Function 或等价安全后端执行。
- 原因：移动端包和网络请求无法保守 Secret，也无法可靠执行模型输出校验、限流、日志脱敏和用户数据授权。
- 后果：App 只调用自有安全接口；AI key/service role 只存在于服务器 Secret；Provider 返回值在服务端按 versioned Zod Schema 校验。

## ADR-004：公共合同集中在 `@clientflow/contracts`

- 状态：Accepted
- 日期：2026-08-21
- 决策：状态、领域 DTO、AI Schema、Repository/Service/Provider 接口和错误码只在 `packages/contracts` 定义。
- 原因：防止后端和 App 对同一概念产生不同命名或数据形状，并使 Mock/真实实现可替换。
- 后果：公共修改需要主架构窗口协调；数据库 snake_case 只在 adapter 中映射为 camelCase；禁止复制 enum。

## ADR-005：采用明确且有限的 MVP 状态集合

- 状态：Accepted
- 日期：2026-08-21
- 决策：采用 contracts 中五组状态，不加入报价漏斗、销售评分、团队分配或自动消息状态。
- 原因：这些状态足以表达当前核心链路，并避免同义词和未来功能污染 MVP。
- 后果：例如任务完成统一使用 `done`，项目完成统一使用 `completed`；状态变更必须同时更新数据库设计、API 合同、contracts、migration 和两侧测试。

## ADR-006：单仓库配合独立 Git worktree

- 状态：Superseded by ADR-010
- 日期：2026-08-21
- 决策：主工作区使用 `main`，窗口2使用 `feature/backend-core`，窗口3使用 `feature/app-core`，各自对应独立目录。
- 原因：单仓库便于原子更新公共合同和执行集成检查，worktree 避免多个窗口在同一 working tree 切分支或覆盖文件。
- 后果：功能窗口不得在主工作区开发；提交必须包含 hash、测试和风险报告；主架构窗口 review 后才合并。

## ADR-007：模型输出必须经版本化 Zod Schema

- 状态：Accepted
- 日期：2026-08-21
- 决策：AI Provider 返回 `unknown`，服务端使用 `AIExtractionResultSchema` 校验，当前 `schemaVersion = 1`。
- 原因：模型输出不可信且可能漂移，静态 TypeScript 类型不能提供运行时保证。
- 后果：无效结果不能创建业务实体；Schema 破坏性变更必须升版本；用户确认提交仍需服务端再次校验。

## ADR-008：正式 UI 等待 Figma

- 状态：Accepted
- 日期：2026-08-21
- 决策：当前 App 仅实现无品牌化 placeholder UI 和必要交互。
- 原因：正式 UI 在独立 Figma 流程中设计，提前创造视觉系统会造成返工和风格冲突。
- 后果：禁止自行引入渐变、玻璃拟态、发光、复杂动画、大量装饰卡片或任意品牌色；业务逻辑应与展示组件解耦，便于后续按稿替换。

## ADR-009：MVP 不持久化 AI Provider Raw Output

- 状态：Accepted
- 日期：2026-08-21
- 决策：首个 schema 不创建 `ai_extractions.raw_result`。`result` 只保存通过当前版本 Zod Schema 校验的结构化数据；无效完整输出不进入数据库或日志。
- 原因：Provider 输出来自聊天截图，可能包含客户姓名、联系方式、预算和私密对话。当前没有字段级加密、受限调试权限、TTL 和自动清理机制，长期保存仅为调试便利不符合数据最小化原则。
- 后果：失败诊断依赖稳定 `error_code`、provider、model、schema version、correlation ID 和不含用户内容的结构化指标。未来若确需 raw output，必须先定义加密、仅服务端访问、最短保留期限、自动清理、用户删除传播和安全测试，再通过独立 migration 引入。

## ADR-010：改为单人 Mainline 分阶段开发

- 状态：Accepted
- 日期：2026-08-22
- 决策：后续开发只从最新 `main` 开始，由单一负责人按 GitHub Issue 分阶段实现、验证、提交和集成；旧 backend/app 并行分支冻结，不再作为持续开发线。
- 原因：基础架构、App 骨架和安全后端已经进入 `main`，继续维护平行实现会增加接口漂移、重复工作和合并风险。当前优先级是尽快跑通一个真实 MVP 闭环。
- 后果：不推翻现有模块边界或公共合同；每个可运行阶段都必须独立测试、commit、普通 push，并回写对应 Issue。旧分支只保留历史证据，不 cherry-pick 未经重新审查的批量实现。

## ADR-011：Edge Function 显式解析共享合同并由服务端验证用户 Token

- 状态：Accepted
- 日期：2026-08-23
- 决策：`@clientflow/contracts` 内部相对模块使用显式 `.ts` 扩展，使同一源码可由 Expo/TypeScript 和 Supabase Deno bundler 解析。Edge Function 使用 server-only Supabase verifier 对 bearer token 执行 `auth.getUser(token)`，验证成功后才创建携带该用户 Authorization 的 RLS client。
- 原因：远端 Deno bundler 不接受共享包的无扩展名相对导入；同时托管函数环境中的自动 public key 与当前项目用户 token 验证不一致。服务端已有 secret key，适合作为 Auth API 的可信调用凭据，但用户身份仍必须来自并绑定到已验证 token。
- 后果：`allowImportingTsExtensions` 是 workspace 编译门禁；App 不获得任何 server key；无效 token 不创建用户 client；admin client 仅用于 token 验证、私有 Storage 和显式 owner 约束的数据操作，用户 RPC 继续携带已验证用户 Authorization 以执行 RLS。

## ADR-012：首个真实视觉 Provider 使用 Qwen3-VL-Plus

- 状态：Accepted
- 日期：2026-08-23
- 决策：由项目所有者明确选择阿里云百炼 `qwen3-vl-plus` 作为首个且唯一的真实视觉模型。运行时通过 server-only `AI_PROVIDER=stub|qwen` 切换；`qwen` 使用华北 2（北京）OpenAI-compatible endpoint 和 `DASHSCOPE_API_KEY`，模型名固定为 `qwen3-vl-plus`。
- 原因：当前任务需要中文聊天截图理解、图片输入和结构化 JSON 输出；Qwen3-VL-Plus 官方支持这些能力。使用非思考模式和 JSON Object 约束可减少输出解析失败，但不能替代服务端 Zod 校验。
- 后果：`ConfiguredStubAIProvider` 继续用于自动化测试和本地开发；App 不知道 Provider 选择且不持有 AI Secret；服务端只发送 private Storage 下载并复核后的图片字节；Provider 输出仍按 `unknown` 处理，只有 `AIExtractionResultSchema` 校验成功的数据可以持久化。不得在本阶段增加第二个 Provider、自动 fallback 或任意模型名覆盖。

## ADR-013：Native SecureStore 与数据库原子 AI 用量门禁

- 状态：Accepted
- 日期：2026-08-24
- 决策：Android/iOS Supabase Session 使用系统安全凭据存储，并以版本化分块 adapter 兼容大 Session；Web 保持平台独立 storage。AI 限流不使用 Edge 内存，而由 Postgres 在 Provider 调用前以用户级事务锁、usage 预约、同 upload 唯一约束和集中额度配置原子裁决。
- 原因：移动端普通 AsyncStorage 不适合保存 refresh token；Edge Function 可水平扩展，进程内 rate limit 无法阻止并发绕过。同一请求在 Provider 成功后写库失败时也必须保守避免自动二次计费。
- 后果：迁移完成后 Native AsyncStorage 不再保存 Auth Session；每用户默认并发 1，滚动 1 分钟/1 小时/24 小时额度为 5/30/100；所有已接受请求都先建立 server-only usage 记录。Supabase production composition 不初始化 Mock services，日志只使用安全字段白名单和 request ID。完整威胁模型见 `docs/threat-model.md`。
