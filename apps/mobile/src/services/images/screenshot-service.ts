import { File } from "expo-file-system";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";

import { validateScreenshot } from "./image-validation";

const MAX_OUTPUT_WIDTH = 1600;

export interface PreparedScreenshot {
  byteSize: number;
  fileName: string;
  height: number;
  mimeType: "image/jpeg";
  uri: string;
  width: number;
}

export class ScreenshotSelectionError extends Error {}

export async function selectAndCompressScreenshot(): Promise<PreparedScreenshot | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    throw new ScreenshotSelectionError("需要相册权限才能选择聊天截图。");
  }

  const selection = await ImagePicker.launchImageLibraryAsync({
    allowsEditing: false,
    allowsMultipleSelection: false,
    mediaTypes: ["images"],
    quality: 1,
  });
  if (selection.canceled) {
    return null;
  }

  const asset = selection.assets[0];
  if (!asset) {
    throw new ScreenshotSelectionError("未读取到所选图片。请重新选择。 ");
  }
  const validationError = validateScreenshot({
    byteSize: asset.fileSize ?? null,
    height: asset.height,
    mimeType: asset.mimeType ?? null,
    width: asset.width,
  });
  if (validationError) {
    throw new ScreenshotSelectionError(validationError);
  }

  const context = ImageManipulator.manipulate(asset.uri);
  if (asset.width > MAX_OUTPUT_WIDTH) {
    context.resize({ width: MAX_OUTPUT_WIDTH, height: null });
  }
  const rendered = await context.renderAsync();
  const saved = await rendered.saveAsync({
    compress: 0.76,
    format: SaveFormat.JPEG,
  });
  const file = new File(saved.uri);
  if (!file.exists || file.size <= 0) {
    throw new ScreenshotSelectionError("图片压缩失败，请重新选择。 ");
  }

  return {
    byteSize: file.size,
    fileName: asset.fileName ?? "chat-screenshot.jpg",
    height: saved.height,
    mimeType: "image/jpeg",
    uri: saved.uri,
    width: saved.width,
  };
}
