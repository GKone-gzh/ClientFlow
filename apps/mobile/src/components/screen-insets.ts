export type ScreenInsetMode = "fullscreen" | "native-header" | "tabs";

export const SCREEN_INSET_EDGES = {
  fullscreen: ["top", "right", "bottom", "left"],
  "native-header": ["right", "bottom", "left"],
  tabs: ["top", "right", "left"],
} as const;
