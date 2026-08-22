import type { AuthCredentials } from "@/services/app-services";

export type AuthCredentialsValidation =
  | { success: true; data: AuthCredentials }
  | { success: false; message: string };

export function validateAuthCredentials(
  emailInput: string,
  password: string,
): AuthCredentialsValidation {
  const email = emailInput.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { success: false, message: "请输入有效邮箱。" };
  }
  if (password.length < 6) {
    return { success: false, message: "密码至少需要 6 位。" };
  }
  return { success: true, data: { email, password } };
}
