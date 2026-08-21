import { useLocalSearchParams } from "expo-router";
import { Text } from "react-native";

import { PlaceholderScreen } from "@/components/placeholder-screen";

export default function ClientDetailScreen() {
  const { clientId } = useLocalSearchParams<{ clientId: string }>();

  return (
    <PlaceholderScreen title="客户详情">
      <Text>客户 ID：{clientId}</Text>
    </PlaceholderScreen>
  );
}
