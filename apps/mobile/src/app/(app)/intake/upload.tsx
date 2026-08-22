import { Button, Image, Text } from "react-native";

import { PlaceholderScreen } from "@/components/placeholder-screen";
import { useIntakeWorkflow } from "@/features/intake/use-intake-workflow";

const STAGE_LABELS = {
  idle: null,
  selecting: "正在选择图片...",
  compressing: "正在验证并压缩图片...",
  uploading: "正在上传截图...",
  uploaded: "截图已安全上传。",
  extracting: "AI 正在识别...",
  awaiting_review: "识别完成，正在进入确认页面...",
  confirming: "正在确认...",
  confirmed: "创建完成...",
  success: "识别完成，正在进入确认页面...",
  failed: null,
} as const;

export default function IntakeUploadScreen() {
  const workflow = useIntakeWorkflow();
  const isBusy = ["selecting", "compressing", "uploading", "extracting"].includes(
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
      {workflow.screenshot &&
      !isBusy &&
      !["success", "uploaded"].includes(workflow.stage) ? (
        <>
          <Button
            title={workflow.uploadOnly ? "上传截图" : "开始识别"}
            onPress={() => void workflow.processScreenshot()}
          />
          {workflow.developmentScenarios
            .filter((scenario) => scenario.id !== "complete")
            .map((scenario) => (
              <Button
                key={scenario.id}
                title={scenario.label}
                onPress={() =>
                  void workflow.processDevelopmentScenario(scenario.id)
                }
              />
            ))}
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
