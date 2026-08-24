# Phase 2.5 P2 Integration Plan

最后更新：2026-08-24

GitHub Issue：[#16](https://github.com/GKone-gzh/ClientFlow/issues/16)

阶段：Data Performance & Mobile Foundation

## 1. 目标与非目标

在正式 Figma UI 接入前稳定 Backend Data Access、Pagination、Navigation、Safe Area、React Query、List Architecture 与 Screen State。本阶段只建设可复用的数据和移动端基础，不设计正式视觉 UI。

禁止在本阶段实现正式 Figma UI、视觉 Design Token、新 CRM、支付、Subscription、第二 AI Provider、App Integrity、R8/ProGuard 或其他无关功能。

## 2. 分支与工作区

| 责任 | Branch | Worktree |
|---|---|---|
| 总控 / Integration | `main` | `C:\Users\Administrator\Documents\ChatGPT\ai接单app开发` |
| 后端性能 | `codex/backend-performance` | `C:\Users\Administrator\Documents\ChatGPT\clientflow-backend-performance` |
| Mobile Foundation | `codex/mobile-foundation` | `C:\Users\Administrator\Documents\ChatGPT\clientflow-mobile-foundation` |

两个实现窗口不得直接修改或 push `main`，不得 force push，也不得在同一个 working tree 中切换分支。历史 worktree 不属于本阶段，不删除、不复用。

## 3. 公共 Contract 所有权

本阶段以下公共合同由后端性能窗口提出和实现：

- Repository pagination DTO
- Cursor DTO 与排序稳定性语义
- Task Read Model
- Batch Requirement/Task Repository Contract
- Mock/Supabase Repository parity 所需的公共输入输出

后端必须先在 Issue #16 说明 App 数据需求如何映射为公共合同，并同步更新 `docs/api-contracts.md`。总控 Review 后才能进入第一批合并。Mobile 窗口可以提出字段、分页和 loading 需求，但不得在 App 层另建同义 DTO、cursor 或 read model。

公共合同要求：

- Cursor 不暴露 Supabase/PostgREST SDK 类型。
- 分页排序必须包含确定性 tie-breaker，不能只按非唯一时间字段。
- Cursor 必须运行时校验，畸形或跨查询 cursor 稳定失败。
- owner 只能来自 Session/RLS，分页输入不接受 `userId`。
- Mock 与 Supabase 必须遵守相同页大小、顺序、`nextCursor` 和空页语义。
- Batch API 必须保留 project/client 归属，不能用前端分组掩盖跨用户数据。

## 4. 第一批文件边界

### 后端性能窗口独占

- `packages/contracts/src/**`
- `docs/api-contracts.md`
- `docs/database-design.md`
- `apps/mobile/src/services/supabase/supabase-business-repositories.ts`
- `apps/mobile/src/services/supabase/supabase-business-repositories.test.ts`
- `apps/mobile/src/mocks/mock-repositories.ts`
- `apps/mobile/src/mocks/mock-repositories.test.ts`
- `apps/mobile/src/features/clients/client-detail.ts`
- `supabase/migrations/**`
- `supabase/tests/**`

第一批只提交 Contract、schema、parity test 和必要设计说明，不提前提交真实 Supabase query/batch 实现或 migration。

### Mobile Foundation 窗口独占

- `apps/mobile/src/app/**`
- `apps/mobile/src/components/**`
- `apps/mobile/src/features/clients/client-queries.ts`
- `apps/mobile/src/features/tasks/task-queries.ts`
- 新增的 `apps/mobile/src/features/**` query-key、screen-state、navigation source 模块与测试
- `apps/mobile/src/services/query-client.ts`

第一批只实现 Navigation、Safe Area、neutral Screen Shell、Query Key/policy、screen state 和 list virtualization foundation。不得消费尚未合并的新 pagination/batch DTO。

### 协调文件

以下文件默认只由总控修改；任一实现窗口确需改动时，必须先在 Issue #16 说明原因和影响：

- `docs/implementation-plan.md`
- `docs/phase-2.5-p2-integration-plan.md`
- `apps/mobile/src/services/app-services.ts`
- `apps/mobile/src/services/compose-app-services.ts`
- `apps/mobile/src/services/compose-mock-app-services.ts`
- `apps/mobile/src/services/compose-supabase-app-services.ts`
- `package.json`
- `pnpm-lock.yaml`

如果发现必须跨越独占边界，先停在设计和测试需求，不直接编辑对方文件。

## 5. 两批交付与合并顺序

### Batch 1

后端提交 Repository/Pagination/Batch 合同和 parity tests；Mobile 同时提交不依赖新 DTO 的 Navigation/Safe Area/Screen/List foundation。

总控分别 Review：

- 公共类型是否唯一且运行时可校验。
- 分页是否定义确定性顺序、page-size cap 与 cursor 失效行为。
- Mobile foundation 是否保持 Placeholder UI、没有复制 DTO、没有把 Supabase SDK 放进页面。
- 两边是否只修改各自文件边界。

优先集成无冲突的 Mobile foundation，再集成后端公共 Contract；如果 Contract diff 会影响现有 App 编译，则先合并 Contract 及兼容实现，再合并 Mobile。最终顺序由实际 diff 决定，不机械按提交时间。

### Batch 2

Batch 1 集成后，两窗口必须从最新 `origin/main` 同步自己的分支，普通 push，不 force push。

后端实现真实 Supabase pagination、batch query、排序、N+1 消除、Mock parity 和索引验证。只有 `EXPLAIN`/查询形状或测试证明现有索引不足时才增加 additive migration。

Mobile 只消费已经进入 `main` 的公共合同，实现 React Query、FlatList/SectionList、cached-first/progressive loading 以及 Loading/Empty/Error/Retry states。

## 6. Review 与提交门禁

每个可运行批次必须：

1. 运行受影响的 TypeScript、Lint 和测试。
2. 检查 `git diff`、`git diff --check` 和文件边界。
3. 创建独立 commit。
4. 普通 push 到自己的 branch 并设置 upstream。
5. 在 Issue #16 汇报 commit SHA、修改内容、测试结果、风险与需要另一侧确认的合同变化。

总控只在 Review 通过后集成。发现公共合同漂移、安全/RLS 回归、重复 DTO、非确定性排序、无上限列表或页面直接依赖 Supabase SDK时必须 Changes Requested。

## 7. 阶段验收

- Task list 与 Client Detail 不再产生按 project 逐条请求的 N+1。
- Pagination cursor 运行时可校验、顺序确定、页大小有上限，User A/B 继续隔离。
- Requirements/Tasks 支持 batch read，并保持稳定排序和 owner 归属。
- Mock/Supabase Repository contract、顺序、分页和空结果一致。
- Home 和 Clients 进入 Client Detail 后返回原来源；Intake confirm 的导航行为有明确来源策略。
- Android Safe Area 正常，Screen Shell 不包含正式视觉设计。
- 列表使用 FlatList/SectionList，不以无上限 ScrollView `.map()` 渲染业务集合。
- Query Key 集中且结构稳定；retry/stale policy 对 Auth、业务读和 mutation 有清晰差异。
- Loading、Empty、Error、Retry、cached-first 和 progressive loading 有自动化覆盖。
- 最终 `pnpm verify`、`pnpm build`、GitHub CI 和 Android 集成验收通过。

阶段完成后立即停止，不进入正式 UI 或其他非目标。
