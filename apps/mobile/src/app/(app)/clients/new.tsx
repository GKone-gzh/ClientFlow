import { Button, TextInput } from "react-native";

import { PlaceholderScreen } from "@/components/placeholder-screen";

export default function NewClientScreen() {
  return (
    <PlaceholderScreen title="添加客户" description="手动创建客户的占位表单。">
      <TextInput accessibilityLabel="客户姓名" placeholder="客户姓名" />
      <Button title="保存" disabled />
    </PlaceholderScreen>
  );
}
