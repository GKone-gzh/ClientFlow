import { useEffect } from "react";
import NetInfo from "@react-native-community/netinfo";
import { focusManager, onlineManager } from "@tanstack/react-query";
import { AppState, Platform } from "react-native";

import {
  isAppFocused,
  isNetworkOnline,
} from "@/features/query/query-lifecycle-state";

export function QueryLifecycle() {
  useEffect(() => {
    onlineManager.setEventListener((setOnline) =>
      NetInfo.addEventListener((state) => setOnline(isNetworkOnline(state))),
    );

    return () => {
      onlineManager.setEventListener(() => () => undefined);
    };
  }, []);

  useEffect(() => {
    if (Platform.OS === "web") return;

    focusManager.setFocused(isAppFocused(AppState.currentState));
    const subscription = AppState.addEventListener("change", (state) => {
      focusManager.setFocused(isAppFocused(state));
    });

    return () => {
      subscription.remove();
      focusManager.setFocused(undefined);
    };
  }, []);

  return null;
}
