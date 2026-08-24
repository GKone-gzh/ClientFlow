import { useState } from "react";
import { router } from "expo-router";
import { Button, Text, TextInput } from "react-native";

import { PlaceholderScreen } from "@/components/placeholder-screen";
import { useCreateClientMutation } from "@/features/clients/client-queries";
import { resolveMutationScreenState } from "@/features/screen-state/screen-state";

export default function NewClientScreen() {
  const [name, setName] = useState("");
  const createClient = useCreateClientMutation();
  const screenState = resolveMutationScreenState({
    isError: createClient.isError,
    isPending: createClient.isPending,
    isSuccess: createClient.isSuccess,
  });

  return (
    <PlaceholderScreen title="添加客户" description="手动创建客户的占位表单。">
      <TextInput
        accessibilityLabel="客户姓名"
        onChangeText={setName}
        placeholder="客户姓名"
        value={name}
      />
      {screenState === "error" ? (
        <Text accessibilityRole="alert">保存失败，请重试。</Text>
      ) : null}
      <Button
        title={screenState === "submitting" ? "保存中..." : "保存"}
        disabled={name.trim().length === 0 || screenState === "submitting"}
        onPress={() => {
          createClient.mutate(
            {
              name: name.trim(),
              contactHandle: null,
              contactChannel: null,
              notes: null,
              status: "lead",
            },
            {
              onSuccess: (client) => router.replace(`/(app)/clients/${client.id}`),
            },
          );
        }}
      />
    </PlaceholderScreen>
  );
}
