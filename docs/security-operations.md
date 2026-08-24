# Security Operations

最后更新：2026-08-24

## 自动门禁

- `pnpm verify` 执行 TypeScript、Lint、合同/数据库/Edge/App 测试和 tracked-file Secret 扫描。
- `pnpm security:secrets` 只扫描 Git tracked files；发现时仅输出文件、行号和规则名，不输出疑似 Secret 值。
- `pnpm security:audit` 使用官方 npm registry 审计 production dependencies，并在 high/critical finding 时失败。
- GitHub CI 将 Secret/public env 扫描与 production dependency audit 作为独立 job。
- Dependabot 每周检查 pnpm workspace 和 GitHub Actions；安全更新按 production dependencies 分组。
- `supabase/config.toml` 对五个客户端 Edge Function 显式设置 `verify_jwt = true`，安全测试拒绝任何 `verify_jwt = false`；函数内部仍会先调用 Supabase Auth 验证 Session，再解析业务 payload，CORS 不参与身份授权。

本地 `.env.local`、Supabase PAT、测试账号密码和 server secrets 必须保持 Git ignored。App 只允许 `EXPO_PUBLIC_APP_ADAPTER`、`EXPO_PUBLIC_SUPABASE_URL`、`EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` 三个 public env 名称。任何 `EXPO_PUBLIC_*` 值都视为可从客户端 bundle 读取。

## 依赖审计例外

截至 2026-08-24，Expo SDK 57 的 Metro 传递依赖 `image-size@1.2.1` 命中以下两个 high severity build-time denial-of-service advisories：

- `GHSA-w3rx-r6r6-pgpr`
- `GHSA-5p2g-fcmc-qvqq`

Registry advisory 要求 `image-size >=2.0.3`，但该版本尚未发布，因此当前无法升级到已修复版本。例外只适用于上述两个 GHSA，不降低其他 high/critical finding 的门禁。

风险边界与临时缓解：

- 受影响解析器在 Metro 构建阶段处理仓库资产，不处理运行时上传的聊天截图。
- App 上传入口只接受 JPEG、PNG、WebP，并在客户端及服务端复核 MIME、magic bytes 和大小；ICNS、JXL、HEIF 不进入业务 Storage/AI 流程。
- 仓库写权限保持最小化，未知二进制资产进入仓库前必须 Review；CI job 有超时限制。
- Dependabot 每周追踪修复版本。最迟于 2026-09-07 复审；补丁发布后立即删除两个 `audit.ignore` 条目并更新 lockfile。

`ansi-regex` 的 high severity ReDoS finding 已通过范围 override 固定到 `4.1.1`，不属于例外。

## GitHub 平台设置

仓库内已配置 CI 与 Dependabot。2026-08-24 已通过 GitHub REST API 启用并复核 Dependency graph/Dependabot alerts 与 Dependabot security updates；`dependabot.yml` 位于默认分支并负责版本更新计划。

当前私有仓库的 CodeQL/default setup API 返回 `403`，repository security analysis 中 Secret scanning 与 push protection 状态不可用。它们取决于账户或组织的 GitHub Code Security/Secret Protection 授权，因此本阶段未启用且不得报告为已启用。项目所有者以后购买或获得相应授权后，应在 GitHub `Settings -> Advanced Security` 启用 CodeQL/default setup、Secret scanning 与 push protection；本地扫描和 CI 不能替代 GitHub 原生历史扫描与 push protection。

## 事件处理

发现疑似 Secret 时不得在 Issue、日志或聊天中粘贴原值。立即停止使用并在对应 Provider/Supabase/GitHub 控制台轮换，再清理 Git 历史、检查访问日志和受影响数据范围。仅记录 Secret 类型、暴露时间窗、轮换完成时间与不含凭据的证据。
