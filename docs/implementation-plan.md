# ClientFlow Implementation Plan

最后更新：2026-08-24

## 当前 Phase

**Phase 2.5 P1 / Issue #7：Production Security & Abuse Hardening（进行中）**

唯一目标是在不增加业务功能的前提下，加固 Native Session、AI 防刷/并发/额度、usage、日志、生产组合边界、数据库权限和基础安全 CI。

第二个 AI Provider、自动模型路由、正式 Figma UI、支付订阅、性能重构和额外 CRM 功能不在当前范围。

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
- 可切换 Mock/Supabase Screenshot Upload Adapter，以及严格的 `prepare-upload -> signed private upload -> mark-uploaded` 边界。
- 真实 Supabase private Storage smoke：对象存在、规范路径和 owner 匹配、状态为 `uploaded`、未签名 public URL 被拒绝。
- Android 真机截图选择、压缩、上传和 `uploaded` 停止态验收；没有提前触发 AI extraction。
- Supabase Intake Adapter 已将真实 `uploadId` 接入 `request-extraction`、`get-extraction` 和 `confirm-extraction`。
- 服务端 Stub 输出经公共 Zod Schema 校验后进入 `needs_review`，Review 修改后由确认 RPC 原子创建业务实体。
- Supabase Client/Project/Requirement/Task Repository 已提供主链路所需真实读写，Client Detail 读取真实实体图。
- 真实 Supabase Intake smoke 已验证确认幂等和 User A/B 对 upload、extraction、client、project、requirement、task 的隔离。
- Android 真机完整 Intake、Review、确认、跳转和真实客户详情验收通过。
- 项目所有者选择的 `qwen3-vl-plus` 已作为 server-only Provider 接入，Stub 模式继续保留。
- 真实 Qwen smoke、5 组准确率/安全 fixtures、提示注入降级和 Android 真机 Review/编辑/确认验收通过。
- AI 输出在持久化前依次经过公共 Zod Schema、注入输出门禁和元指令降级门禁。

## 当前配置

- 默认 `EXPO_PUBLIC_APP_ADAPTER=mock`，用于离线开发和自动化测试。
- 设置 `EXPO_PUBLIC_APP_ADAPTER=supabase` 后，Auth、截图上传、Intake Edge Functions 和业务 Repository 使用真实 Supabase；AI Provider 由服务端 `AI_PROVIDER=stub|qwen` 选择，App 不参与选择。
- 客户端只读取 `EXPO_PUBLIC_SUPABASE_URL` 和 `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`。
- `EXPO_PUBLIC_*` 会进入客户端 bundle，禁止配置 service-role、`sb_secret_` 或 AI Secret。
- 真实 Provider 的 `DASHSCOPE_API_KEY` 仅存在于 Supabase server secrets。

## 本阶段状态

- Phase 2 P2 / Issue #4 已完成自动化、真实 Supabase 和 Android 真机验收，代码已 push 到 `main`，Issue 已关闭。
- Phase 2 P3 / Issue #5 已完成自动化、真实 Supabase、User A/B 隔离和 Android 真机全链路验收，最终文档已提交，Issue 已关闭。
- Phase 2 P4 / Issue #6 已完成真实 Qwen、准确率/安全 fixtures、User A/B 隔离和 Android 真机验收；最终文档已提交，Issue 可关闭。
- Phase 2.5 P1 / Issue #7 已建立，当前完成现状审计、Threat Model、SecureStore 迁移合同、数据库原子限流设计、usage 最小化和数据保留原则。

## 下一步

1. 将 Native Session 从 AsyncStorage 迁移到支持大 Session 的 SecureStore adapter，并验证恢复、刷新和退出清理。
2. 彻底分离 Mock/Supabase composition，加固 public env 与 development tools production guard。
3. 以新 migration 实现数据库并发锁、滚动额度和 server-only AI usage，再接入 Edge service。
4. 增加 request ID、安全日志、权限攻击测试和基础 Security CI。
5. 部署并完成真实 Supabase、User A/B、额度、重复请求和 Android 真机全链路回归；全部通过后关闭 Issue #7。

## 环境限制

- 真实 Supabase 公共配置和测试账号只存在于 Git 忽略的本地环境文件，不进入仓库或客户端 Secret。
- 本机无 Docker、Android `adb` 或 emulator；PGlite migration/RLS 测试可运行，本阶段已通过局域网 Expo Go 完成 Android 实机验收。
- npm 分发的 Supabase CLI `2.115.0` 在当前 Windows 环境缺少匹配 binary；本阶段使用官方 standalone CLI `2.114.0` 完成 Edge Function 部署。Personal Access Token 仅存于 Git 忽略的本地文件。
- iOS App Store 版 Expo Go 在 SDK 57 过渡期不兼容本项目；后续 iOS 原生验收应使用兼容的 Development Build/TestFlight，不降级项目 SDK。
- 正式 Figma 尚未交付，App 保持基础 Placeholder UI。

## 每阶段完成定义

- 对应 GitHub Issue 范围和验收标准明确。
- 公共合同和文档先于实现变更。
- TypeScript、Lint、Unit Test 和受影响的 executable smoke 全部通过。
- 数据库变更必须从空库执行 migration，并覆盖 RLS/归属约束。
- 不提交 Secret、临时 bundle、截图或本地环境文件。
- 独立 commit 普通 push 到 `main`，并把 hash、测试结果、风险和下一步回写 Issue。
