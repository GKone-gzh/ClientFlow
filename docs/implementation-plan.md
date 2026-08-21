# ClientFlow Implementation Plan

最后更新：2026-08-21

## 当前 Phase

**Phase 0 已完成，Phase 1 可开始：Backend Core / App Core**

目标是建立公共合同、安全边界、数据库设计、模块所有权和独立 worktree。此阶段不开发正式 UI，也不代替窗口2/窗口3实现大块业务。

## 已完成

- 明确 MVP 主链路和禁止提前建设的范围。
- 确定 pnpm workspace 单仓库结构。
- 确定 `packages/contracts` 为唯一公共 Type/Enum/Schema/Interface 来源。
- 确定数据库核心表、复合归属约束、RLS 和 private Storage 原则。
- 确定 AI 必须经 Edge Function、安全 Secret 和 Zod validation。
- 建立架构、数据库、API 合同和 ADR 文档。
- 建立最小 TypeScript contracts 基线。
- 建立 `main`、`feature/backend-core`、`feature/app-core` 和对应独立 worktree。
- 通过基线 TypeScript、ESLint 和 contracts 单元测试。

## 正在进行

- 等待窗口2和窗口3在各自 worktree 启动 Phase 1 实现。

## 下一步

### 窗口2：Phase 1 Backend Core

- 在 `feature/backend-core` 初始化本地 Supabase 目录。
- 按 `database-design.md` 编写第一版 migration、索引、触发器和 RLS。
- 添加用户 A/用户 B/anonymous 的 RLS 自动化测试。
- 实现 Auth/session adapter、private Storage upload adapter 和基础 Repository。
- 实现 AI Provider stub 与 Edge Function 边界，不在第一步绑定复杂模型逻辑。
- 提交独立 commit，并报告 hash、diff 摘要、测试结果和风险。

### 窗口3：Phase 1 App Core

- 在 `feature/app-core` 初始化 Expo + TypeScript + Expo Router。
- 使用基础 placeholder UI 建立 auth、client list/detail、intake upload/review 页面骨架。
- 通过 `@clientflow/contracts` 实现 Mock Repository，不复制状态或 DTO。
- 建立 loading/empty/error 状态和截图选择/上传交互边界。
- 不实现正式视觉，等待 Figma。
- 提交独立 commit，并报告 hash、diff 摘要、测试结果和风险。

### 主架构窗口：Phase 1 Integration

- Review 两侧 diff、接口一致性、依赖方向和安全边界。
- 先合并公共合同兼容的最小提交，再处理实现提交。
- 运行 root typecheck/lint/test、App 启动 smoke test、migration reset 和 RLS test。
- 冲突或公共接口调整先更新文档和 ADR，再协调两侧。

## Phase 2：主链路联调

- 替换 App Mock Repository 为真实 Supabase adapter。
- 打通登录、截图上传、提取、review/修改、confirm transaction 和客户详情刷新。
- 对超时、重复 confirm、上传失败、非法模型输出和跨用户访问做端到端测试。

## Phase 3：Figma UI 与稳定化

- Figma 正式稿到位后由窗口3按稿替换 placeholder UI。
- 保持业务 hooks/Repository 不与视觉组件耦合。
- 做移动端尺寸、可访问性、启动性能和错误恢复验收。

## 阻塞项

- 尚未选择并配置 Supabase project/local CLI；不影响先写 migration，但影响远端联调。
- 尚未确定 AI Provider 和服务器 Secret；应先以接口/stub 推进。
- 正式 Figma 设计尚未交付；App 只能实现 placeholder UI。

## 集成完成定义

- 公共合同无重复定义，状态值完全一致。
- TypeScript、Lint、Unit Test 全部通过。
- Expo App 可启动并完成 smoke test。
- Supabase migration 可从空库 reset，RLS 测试覆盖跨用户隔离。
- 核心流程成功路径和关键失败路径有测试或明确人工验收记录。
- 未能运行的检查必须写明具体原因，不能使用“应该没问题”。
