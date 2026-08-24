import { Button, Text } from "react-native";

export function LoadingState({ label = "加载中..." }: { label?: string }) {
  return <Text accessibilityRole="progressbar">{label}</Text>;
}

export function EmptyState({ label }: { label: string }) {
  return <Text>{label}</Text>;
}

export function RefreshingState({
  label = "正在刷新...",
}: {
  label?: string;
}) {
  return <Text accessibilityRole="progressbar">{label}</Text>;
}

export function MessageState({
  label,
  role,
}: {
  label: string;
  role?: "alert";
}) {
  return <Text accessibilityRole={role}>{label}</Text>;
}

export function LoadMoreState({
  error,
  isLoading,
  onRetry,
}: {
  error: boolean;
  isLoading: boolean;
  onRetry: () => void;
}) {
  if (isLoading) return <LoadingState label="正在加载更多..." />;
  if (error) return <ErrorState label="加载更多失败。" onRetry={onRetry} />;
  return null;
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
