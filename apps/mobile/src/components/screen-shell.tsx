import type { ReactNode } from "react";
import {
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type FlatListProps,
  type ScrollViewProps,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  SCREEN_INSET_EDGES,
  type ScreenInsetMode,
} from "@/components/screen-insets";

interface ScreenHeadingProps {
  description?: string;
  title: string;
}

interface ScrollableScreenProps
  extends Omit<ScrollViewProps, "contentContainerStyle">,
    ScreenHeadingProps {
  bodyStyle?: StyleProp<ViewStyle>;
  children?: ReactNode;
  contentContainerStyle?: StyleProp<ViewStyle>;
  insetMode?: ScreenInsetMode;
}

interface VirtualizedListScreenProps<ItemT>
  extends Omit<
      FlatListProps<ItemT>,
      "contentContainerStyle" | "ListHeaderComponent"
    >,
    ScreenHeadingProps {
  contentContainerStyle?: StyleProp<ViewStyle>;
  header?: ReactNode;
  insetMode?: ScreenInsetMode;
}

function ScreenHeading({ description, title }: ScreenHeadingProps) {
  return (
    <View style={styles.heading}>
      <Text accessibilityRole="header" style={styles.title}>
        {title}
      </Text>
      {description ? <Text style={styles.description}>{description}</Text> : null}
    </View>
  );
}

export function ScrollableScreen({
  bodyStyle,
  children,
  contentContainerStyle,
  description,
  insetMode = "native-header",
  title,
  ...scrollViewProps
}: ScrollableScreenProps) {
  return (
    <SafeAreaView edges={SCREEN_INSET_EDGES[insetMode]} style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={[styles.scrollContent, contentContainerStyle]}
        keyboardShouldPersistTaps="handled"
        {...scrollViewProps}
      >
        <ScreenHeading description={description} title={title} />
        <View style={[styles.body, bodyStyle]}>{children}</View>
      </ScrollView>
    </SafeAreaView>
  );
}

export function VirtualizedListScreen<ItemT>({
  contentContainerStyle,
  description,
  header,
  insetMode = "tabs",
  title,
  ...flatListProps
}: VirtualizedListScreenProps<ItemT>) {
  return (
    <SafeAreaView edges={SCREEN_INSET_EDGES[insetMode]} style={styles.safeArea}>
      <FlatList
        contentContainerStyle={[styles.listContent, contentContainerStyle]}
        ListHeaderComponent={
          <View style={styles.listHeader}>
            <ScreenHeading description={description} title={title} />
            {header ? <View style={styles.body}>{header}</View> : null}
          </View>
        }
        {...flatListProps}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  body: {
    gap: 12,
  },
  description: {
    color: "#555555",
    fontSize: 16,
    lineHeight: 22,
  },
  heading: {
    gap: 12,
  },
  listContent: {
    padding: 20,
  },
  listHeader: {
    gap: 12,
    marginBottom: 12,
  },
  safeArea: {
    flex: 1,
  },
  scrollContent: {
    gap: 12,
    padding: 20,
  },
  title: {
    color: "#111111",
    fontSize: 28,
    fontWeight: "600",
  },
});
