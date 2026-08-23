# Supabase Private Storage 验收

本清单用于 Phase 2 P2 / Issue #4。验收只推进到 `uploads.status = uploaded`，不触发 AI extraction。

## 1. 前置条件

- `apps/mobile/.env.local` 使用 `EXPO_PUBLIC_APP_ADAPTER=supabase`，并只包含 Project URL 与 publishable/anon key。
- 真实项目已应用仓库 migration，`chat-screenshots` bucket 的 `public` 为 `false`。
- `prepare-upload` 与 `mark-uploaded` Edge Functions 已部署，且没有使用 `--no-verify-jwt`。
- 使用专用测试账号，不在命令输出、Issue 或提交中记录密码、access token、refresh token 或 signed upload token。

## 2. 自动化 Smoke

在当前 PowerShell 会话设置测试账号和测试图片路径后执行：

```powershell
$env:CLIENTFLOW_AUTH_TEST_EMAIL = "clientflow-storage-smoke@example.com"
$env:CLIENTFLOW_AUTH_TEST_PASSWORD = "REPLACE_WITH_A_TEST_PASSWORD"
$env:CLIENTFLOW_STORAGE_TEST_IMAGE = "C:\path\to\test-screenshot.jpg"
pnpm smoke:storage
```

脚本使用真实账号登录，依次调用 `prepare-upload`、signed private upload 和 `mark-uploaded`，再以当前用户读取 upload 记录。通过条件包括：记录归属当前 session、路径为 `{user_id}/{upload_id}/source`、状态为 `uploaded`，且未签名 public URL 无法读取对象。脚本只输出布尔验收项、bucket 名、字节数和状态。

## 3. Dashboard 复核

1. Storage 中 `chat-screenshots` bucket 仍为 private。
2. 对象位于 smoke 返回记录对应的规范路径，不存在客户端自定义 owner 路径。
3. `public.uploads` 中对应记录的 `user_id` 是测试账号，`status` 为 `uploaded`，MIME 和字节数与图片一致。

## 4. Android 真机

1. 以 Supabase 模式启动 Expo，并用已确认的测试账号登录。
2. 打开“从聊天截图添加客户”，选择一张 JPEG、PNG 或 WebP 图片。
3. 点击“上传截图”，确认页面显示“截图已安全上传”，且不会开始 AI 识别。
4. 在 Dashboard 按上一节复核对象和 upload 记录。

## 5. 失败验收

- 退出登录后不能上传。
- 超过 10 MiB 或不支持的 MIME 在上传前失败。
- `prepare-upload`、Storage 或 `mark-uploaded` 任一步失败时，页面不得显示上传完成。
- App 日志、Issue 和测试输出不得包含图片内容、用户 token、signed upload token 或 secret/service-role key。

## 6. 2026-08-23 验收记录

- `prepare-upload` 与 `mark-uploaded` 已部署到真实 Supabase 项目；未部署 AI 相关函数。
- `pnpm smoke:storage` 使用真实测试账号和 JPEG 截图通过：293,316 bytes，owner 与当前 Session 匹配，路径为服务端规范路径，记录状态为 `uploaded`。
- smoke 通过 `mark-uploaded` 的服务端对象下载验证确认对象存在、大小和 MIME 正确；未签名 public URL 访问被拒绝，bucket 保持 private。
- Android Expo Go 真机通过：选择截图、压缩、上传并显示“截图已安全上传”；流程没有进入 AI 识别。
- 本地环境文件、Personal Access Token、测试账号密码和所有 Session/signed token 均未提交或写入 Issue。
