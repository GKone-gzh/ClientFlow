import { useLocalSearchParams } from "expo-router";
import { Text } from "react-native";

import { PlaceholderScreen } from "@/components/placeholder-screen";

export default function IntakeReviewScreen() {
  const { extractionId } = useLocalSearchParams<{ extractionId: string }>();

  return (
    <PlaceholderScreen title="确认识别结果">
      <Text>识别结果 ID：{extractionId}</Text>
    </PlaceholderScreen>
  );
}
