import type { PropsWithChildren } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

interface PlaceholderScreenProps extends PropsWithChildren {
  title: string;
  description?: string;
}

export function PlaceholderScreen({
  children,
  description,
  title,
}: PlaceholderScreenProps) {
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text accessibilityRole="header" style={styles.title}>
        {title}
      </Text>
      {description ? <Text style={styles.description}>{description}</Text> : null}
      <View style={styles.body}>{children}</View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body: {
    gap: 12,
  },
  content: {
    gap: 12,
    padding: 20,
  },
  description: {
    color: "#555555",
    fontSize: 16,
    lineHeight: 22,
  },
  title: {
    color: "#111111",
    fontSize: 28,
    fontWeight: "600",
  },
});
