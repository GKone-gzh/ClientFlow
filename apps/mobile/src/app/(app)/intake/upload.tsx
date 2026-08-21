import { Button, Image, Text } from "react-native";

import { PlaceholderScreen } from "@/components/placeholder-screen";
import { useIntakeWorkflow } from "@/features/intake/use-intake-workflow";

const STAGE_LABELS = {
  idle: null,
  selecting: "正在选择图片...",
  compressing: "正在验证并压缩图片...",
  uploading: "正在上传截图...",
  processing: "AI 正在识别...",
  success: "识别完成，正在进入确认页面...",
  failed: null,
} as const;

export default function IntakeUploadScreen() {
  const workflow = useIntakeWorkflow();
  const isBusy = ["selecting", "compressing", "uploading", "processing"].includes(
    workflow.stage,
  );

  return (
    <PlaceholderScreen
      title="从聊天添加客户"
      description="当前公共合同先支持单张截图。图片会在本地验证并压缩。"
    >
      <Button
        title={workflow.screenshot ? "重新选择截图" : "选择截图"}
        disabled={isBusy}
        onPress={() => void workflow.selectScreenshot()}
      />
      {workflow.screenshot ? (
        <>
          <Image
            accessibilityLabel="已选择的聊天截图"
            resizeMode="contain"
            source={{ uri: workflow.screenshot.uri }}
            style={{ height: 240, width: "100%" }}
          />
          <Text>文件：{workflow.screenshot.fileName}</Text>
          <Text>压缩后：{Math.ceil(workflow.screenshot.byteSize / 1024)} KB</Text>
        </>
      ) : null}
      {STAGE_LABELS[workflow.stage] ? (
        <Text accessibilityRole="progressbar">{STAGE_LABELS[workflow.stage]}</Text>
      ) : null}
      {workflow.screenshot && !isBusy && workflow.stage !== "success" ? (
        <>
          <Button
            title="开始识别"
            onPress={() => void workflow.processScreenshot("complete")}
          />
          <Button
            title="测试缺失信息结果"
            onPress={() => void workflow.processScreenshot("missing")}
          />
          <Button
            title="测试 AI 失败"
            onPress={() => void workflow.processScreenshot("failure")}
          />
          <Button
            title="测试无效 AI 数据"
            onPress={() => void workflow.processScreenshot("invalid")}
          />
        </>
      ) : null}
      {workflow.error ? (
        <>
          <Text accessibilityRole="alert">{workflow.error.message}</Text>
          {workflow.error.retryable ? (
            <Button title="重试" onPress={() => void workflow.retry()} />
          ) : null}
          <Button title="重新上传" onPress={() => void workflow.selectScreenshot()} />
        </>
      ) : null}
      <Button title="取消" disabled={isBusy} onPress={workflow.cancel} />
    </PlaceholderScreen>
  );
}
