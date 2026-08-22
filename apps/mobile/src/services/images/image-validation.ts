export const MAX_SCREENSHOT_BYTES = 10 * 1024 * 1024;
export const ALLOWED_SCREENSHOT_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
] as const;

export interface ScreenshotCandidate {
  byteSize: number | null;
  height: number;
  mimeType: string | null;
  width: number;
}

export function validateScreenshot(candidate: ScreenshotCandidate) {
  if (!candidate.mimeType || !ALLOWED_SCREENSHOT_MIME_TYPES.includes(
    candidate.mimeType as (typeof ALLOWED_SCREENSHOT_MIME_TYPES)[number],
  )) {
    return "请选择 JPG、PNG、WebP 或 HEIC 图片。";
  }
  if (candidate.byteSize === null || candidate.byteSize <= 0) {
    return "无法读取图片大小，请重新选择。";
  }
  if (candidate.byteSize > MAX_SCREENSHOT_BYTES) {
    return "单张图片不能超过 10 MB。";
  }
  if (candidate.width <= 0 || candidate.height <= 0) {
    return "无法读取图片尺寸，请重新选择。";
  }
  return null;
}
