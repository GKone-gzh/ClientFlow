export function isAppFocused(state: string) {
  return state === "active";
}

export function isNetworkOnline(state: {
  isConnected: boolean | null;
  isInternetReachable: boolean | null;
}) {
  return state.isConnected === true && state.isInternetReachable !== false;
}
