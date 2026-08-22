# Supabase Auth 验收

本清单用于 Phase 2 P1 的真实 Supabase 项目和真实设备验收。测试账号应为专用账号，不要使用生产用户账号。

## 1. 获取公共配置

在 Supabase Dashboard 的项目 API 设置中获取：

- Project URL
- Publishable key；旧项目可使用 anon key

禁止使用 service-role、secret key 或任何 AI Provider Secret。

## 2. 配置 App

新建不会被 Git 跟踪的 `apps/mobile/.env.local`：

```dotenv
EXPO_PUBLIC_APP_ADAPTER=supabase
EXPO_PUBLIC_SUPABASE_URL=https://PROJECT_REF.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_REPLACE_ME
```

## 3. 执行远端 Auth Smoke

在当前 PowerShell 会话中设置专用测试账号。变量只保留在当前进程，不写入仓库：

```powershell
$env:EXPO_PUBLIC_SUPABASE_URL = "https://PROJECT_REF.supabase.co"
$env:EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_REPLACE_ME"
$env:CLIENTFLOW_AUTH_TEST_EMAIL = "clientflow-auth-smoke@example.com"
$env:CLIENTFLOW_AUTH_TEST_PASSWORD = "REPLACE_WITH_A_TEST_PASSWORD"
pnpm smoke:auth
```

脚本依次验证真实注册、密码登录、使用同一持久化存储恢复 Session、退出和退出后 Session 清除。脚本不会输出密码、access token 或 refresh token。

如果返回 `email_confirmation_required`，说明注册已到达 Supabase 且项目启用了邮件确认。先打开测试邮箱完成确认，再执行同一条命令。通过结果包含 `"status":"passed"`。

## 4. 执行真实设备验收

1. 使用 `pnpm --filter @clientflow/mobile start --clear` 启动 Expo，并在真实设备打开 App。
2. 新账号注册后，按 Supabase 项目的邮件确认策略完成确认。
3. 使用测试账号登录，确认进入主页且没有短暂进入错误路由。
4. 完全结束 App 进程后重新打开，确认 Session 恢复并直接进入主页。
5. 进入个人页退出，确认返回登录页。
6. 再次完全结束并重启 App，确认仍停留在登录页。

若设备无法打开开发服务，先保证电脑与设备在同一网络；该网络不允许局域网连接时再改用 Expo tunnel。不要将本地 Supabase 的 `127.0.0.1` 地址直接配置给真实设备。

## 5. 验收记录

完成后在对应 GitHub Issue 记录：Supabase 项目环境、设备平台、邮件确认是否启用、smoke 结果、重启恢复结果和退出后重启结果。不得粘贴 key、密码或 Session token。

### 2026-08-23 Phase 2 P1

- 使用真实 Supabase 项目和 publishable key 完成远端验收，未使用 secret 或 service-role key。
- 项目启用邮箱确认；确认链接的最终跳转页不可访问，但验证请求已生效，后续真实登录成功。
- `pnpm smoke:auth` 通过：注册、密码登录、持久化 Session 恢复、退出和退出后 Session 清除全部成功。
- Expo Web 真实 Supabase 模式通过：未登录进入登录页、登录进入 App、刷新恢复 Session、退出返回登录页、退出后刷新保持未登录。
- Android 真实设备通过：登录进入主页、彻底结束并重开后保持登录、退出返回登录页、退出后彻底结束并重开仍保持未登录。
- iOS App Store 版 Expo Go 在 SDK 57 过渡期不兼容本项目；Android 实机已完成本阶段设备验收，未为单次验收降级项目 SDK。
- 本地 `.env.local` 和 `.env.auth-smoke.local` 均由 Git 忽略；验收记录不包含邮箱、密码、key、用户 ID 或 Session token。
