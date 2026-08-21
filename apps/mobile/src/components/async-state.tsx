import { Button, Text } from "react-native";

export function LoadingState({ label = "加载中..." }: { label?: string }) {
  return <Text accessibilityRole="progressbar">{label}</Text>;
}

export function EmptyState({ label }: { label: string }) {
  return <Text>{label}</Text>;
}

export function ErrorState({
  label = "加载失败，请重试。",
  onRetry,
}: {
  label?: string;
  onRetry: () => void;
}) {
  return (
    <>
      <Text accessibilityRole="alert">{label}</Text>
      <Button title="重试" onPress={onRetry} />
    </>
  );
}
