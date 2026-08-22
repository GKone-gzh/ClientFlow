import { Redirect } from "expo-router";

import { useAuthSession } from "@/features/auth/auth-session-provider";
import { resolveAuthDestination } from "@/features/auth/auth-routing";

export default function IndexScreen() {
  const { isRestoring, session } = useAuthSession();
  const destination = resolveAuthDestination({ isRestoring, session });
  return destination ? <Redirect href={destination} /> : null;
}
