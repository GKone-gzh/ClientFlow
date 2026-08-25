import type { PropsWithChildren } from "react";

import { ScrollableScreen } from "@/components/screen-shell";
import type { ScreenInsetMode } from "@/components/screen-insets";

interface PlaceholderScreenProps extends PropsWithChildren {
  title: string;
  description?: string;
  insetMode?: ScreenInsetMode;
}

export function PlaceholderScreen({
  children,
  description,
  insetMode,
  title,
}: PlaceholderScreenProps) {
  return (
    <ScrollableScreen
      description={description}
      insetMode={insetMode}
      title={title}
    >
      {children}
    </ScrollableScreen>
  );
}
