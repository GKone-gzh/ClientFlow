# ClientFlow Implementation Plan

最后更新：2026-08-23

## 当前 Phase

**Phase 2：单人 Mainline MVP 主链路联调**

唯一目标是跑通：真实注册/登录 -> 私有截图上传 -> AI Stub -> 结果修改确认 -> 原子创建 Client/Project/Requirements/Tasks -> 真实客户详情读取。

正式 Figma UI、付费 AI、支付订阅和额外 CRM 功能不在当前范围。

## 已完成

- 公共 TypeScript contracts、状态、Zod Schema 和稳定错误合同。
- Postgres 核心表、复合归属约束、RLS、private Storage bucket 和确认 RPC。
- Edge Function 安全边界、AI Stub、上传和确认服务测试。
- Expo Router 页面骨架、Mock Repository、截图 workflow 和集成门禁。
- 可切换 Mock/Supabase Auth Adapter。
- 邮箱密码注册、登录、Session 持久化恢复、Auth 状态监听和退出。
- 未登录/已登录路由守卫，以及恢复 Session 期间的 loading/error 门禁。
- 可执行的真实 Supabase Auth smoke，覆盖注册、登录、持久化 Session 恢复和退出清除。
- 真实 Supabase 远端 Auth、Expo Web 路由和 Android 设备重启/退出验收。

## 当前配置

- 默认 `EXPO_PUBLIC_APP_ADAPTER=mock`，用于离线开发和自动化测试。
- 设置 `EXPO_PUBLIC_APP_ADAPTER=supabase` 后，Auth 使用真实 Supabase；其他业务 Repository 在下一阶段替换。
- 客户端只读取 `EXPO_PUBLIC_SUPABASE_URL` 和 `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`。
- `EXPO_PUBLIC_*` 会进入客户端 bundle，禁止配置 service-role、`sb_secret_` 或 AI Secret。

## 正在进行

- Phase 2 P2 / Issue #4：实现可切换的真实 Supabase private Storage 截图上传 Adapter。
- 本阶段仅推进到 `uploads.status = uploaded`，不调用 AI extraction。
- 上传链路固定为 `prepare-upload -> signed private upload -> mark-uploaded`。

## 下一步

1. 完成 Phase 2 P2 自动化测试和真实 Supabase Storage 验收。
2. 下一轮经确认后将 Intake / AI Stub Extraction / 确认流程切换到真实 Supabase Adapter。
3. 后续再切换 Client/Project/Requirement/Task Repository，并完成端到端用户 A/B 隔离验证。

## 环境限制

- 真实 Supabase 公共配置和测试账号只存在于 Git 忽略的本地环境文件，不进入仓库或客户端 Secret。
- 本机未安装 Supabase CLI、Docker、Android `adb` 或 emulator；PGlite migration/RLS 测试可运行，本阶段已通过局域网 Expo Go 完成 Android 实机验收。
- Phase 2 P2 远端预检确认 `uploads` schema 可访问，但 `prepare-upload` 与 `mark-uploaded` 当前均返回 HTTP 404。代码与 smoke 已就绪；真实验收需先使用 Supabase Personal Access Token 部署这两个 Edge Functions，token 不得写入仓库。
- iOS App Store 版 Expo Go 在 SDK 57 过渡期不兼容本项目；后续 iOS 原生验收应使用兼容的 Development Build/TestFlight，不降级项目 SDK。
- 正式 Figma 尚未交付，App 保持基础 Placeholder UI。

## 每阶段完成定义

- 对应 GitHub Issue 范围和验收标准明确。
- 公共合同和文档先于实现变更。
- TypeScript、Lint、Unit Test 和受影响的 executable smoke 全部通过。
- 数据库变更必须从空库执行 migration，并覆盖 RLS/归属约束。
- 不提交 Secret、临时 bundle、截图或本地环境文件。
- 独立 commit 普通 push 到 `main`，并把 hash、测试结果、风险和下一步回写 Issue。
