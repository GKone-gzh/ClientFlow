import { Button } from "react-native";

import { PlaceholderScreen } from "@/components/placeholder-screen";

export default function IntakeUploadScreen() {
  return (
    <PlaceholderScreen title="从聊天添加客户" description="截图导入流程将在后续阶段接入。">
      <Button title="选择截图" disabled />
    </PlaceholderScreen>
  );
}
