import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";

import { createSecureSessionStorage } from "./secure-session-storage";

export const authStorage = createSecureSessionStorage(
  {
    deleteItemAsync: (key) => SecureStore.deleteItemAsync(key),
    getItemAsync: (key) => SecureStore.getItemAsync(key),
    setItemAsync: (key, value, options) =>
      SecureStore.setItemAsync(
        key,
        value,
        options as SecureStore.SecureStoreOptions,
      ),
  },
  AsyncStorage,
  {
    secureStoreOptions: {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    } satisfies SecureStore.SecureStoreOptions,
  },
);
