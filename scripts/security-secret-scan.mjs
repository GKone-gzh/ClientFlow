import { Buffer } from "node:buffer";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ALLOWED_PUBLIC_ENV_NAMES = new Set([
  "EXPO_PUBLIC_APP_ADAPTER",
  "EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "EXPO_PUBLIC_SUPABASE_URL",
]);

const REJECTED_PUBLIC_ENV_SENTINELS = new Set([
  "EXPO_PUBLIC_ADMIN_TOKEN",
  "EXPO_PUBLIC_AI_PROVIDER",
  "EXPO_PUBLIC_DASHSCOPE_API_KEY",
  "EXPO_PUBLIC_SUPABASE_SECRET_KEY",
  "EXPO_PUBLIC_SUPABASE_SERVICE_ROLE_KEY",
]);

const PUBLIC_ENV_GUARD_FILE = "apps/mobile/src/services/app-environment.ts";

const SECRET_PATTERNS = [
  {
    label: "private key material",
    pattern: /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/g,
  },
  {
    label: "Supabase secret key",
    pattern: /\bsb_secret_[A-Za-z0-9_-]{16,}\b/g,
  },
  {
    label: "GitHub access token",
    pattern: /\bgh[pousr]_[A-Za-z0-9]{30,}\b/g,
  },
  {
    label: "provider API key",
    pattern: /\bsk-[A-Za-z0-9_-]{24,}\b/g,
  },
  {
    label: "AWS access key",
    pattern: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g,
  },
  {
    label: "Slack token",
    pattern: /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/g,
  },
];

export function scanTrackedFile(fileName, content) {
  const normalized = fileName.replaceAll("\\", "/");
  const findings = [];

  if (isUnapprovedEnvironmentFile(normalized)) {
    findings.push({ line: 1, rule: "tracked environment file" });
  }

  for (const { label, pattern } of SECRET_PATTERNS) {
    pattern.lastIndex = 0;
    for (const match of content.matchAll(pattern)) {
      findings.push({ line: lineAt(content, match.index ?? 0), rule: label });
    }
  }

  for (const match of content.matchAll(/process\.env\.(EXPO_PUBLIC_[A-Z0-9_]+)/gu)) {
    const name = match[1];
    const isApproved = ALLOWED_PUBLIC_ENV_NAMES.has(name);
    const isGuardSentinel =
      normalized === PUBLIC_ENV_GUARD_FILE &&
      REJECTED_PUBLIC_ENV_SENTINELS.has(name);
    if (!isApproved && !isGuardSentinel) {
      findings.push({
        line: lineAt(content, match.index ?? 0),
        rule: "unapproved public environment access",
      });
    }
  }

  for (const match of content.matchAll(
    /\beyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/gu,
  )) {
    if (isPrivilegedSupabaseJwt(match[0])) {
      findings.push({
        line: lineAt(content, match.index ?? 0),
        rule: "Supabase privileged JWT",
      });
    }
  }

  if (normalized.endsWith(".env.example")) {
    for (const [index, line] of content.split(/\r?\n/u).entries()) {
      const match = line.match(/^\s*(EXPO_PUBLIC_[A-Z0-9_]+)\s*=/u);
      if (match && !ALLOWED_PUBLIC_ENV_NAMES.has(match[1])) {
        findings.push({
          line: index + 1,
          rule: "unapproved public environment variable",
        });
      }
    }
  }

  return findings;
}

export function scanRepository(rootDirectory = process.cwd()) {
  const trackedFiles = execFileSync("git", ["ls-files", "-z"], {
    cwd: rootDirectory,
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  })
    .split("\0")
    .filter(Boolean);
  const findings = [];

  for (const fileName of trackedFiles) {
    const content = readFileSync(path.join(rootDirectory, fileName), "utf8");
    for (const finding of scanTrackedFile(fileName, content)) {
      findings.push({ fileName, ...finding });
    }
  }

  return findings;
}

function isUnapprovedEnvironmentFile(fileName) {
  const baseName = path.posix.basename(fileName);
  return baseName.startsWith(".env") && baseName !== ".env.example";
}

function lineAt(content, index) {
  return content.slice(0, index).split("\n").length;
}

function isPrivilegedSupabaseJwt(value) {
  try {
    const payload = JSON.parse(
      Buffer.from(value.split(".")[1], "base64url").toString("utf8"),
    );
    return payload.role === "service_role" || payload.role === "supabase_admin";
  } catch {
    return false;
  }
}

function run() {
  const findings = scanRepository();
  if (findings.length > 0) {
    for (const finding of findings) {
      console.error(`${finding.fileName}:${finding.line} ${finding.rule}`);
    }
    console.error(
      `Security scan failed with ${findings.length} finding(s); values were intentionally redacted.`,
    );
    process.exitCode = 1;
    return;
  }
  console.log("Tracked-file Secret and public environment scan passed.");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) run();
