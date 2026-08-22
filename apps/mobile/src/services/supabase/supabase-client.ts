import { createClient, processLock } from "@supabase/supabase-js";

import { authStorage } from "./session-storage";
import "./url-polyfill";

export interface SupabasePublicConfiguration {
  supabasePublishableKey: string;
  supabaseUrl: string;
}

export function createSupabaseClient(
  configuration: SupabasePublicConfiguration,
) {
  return createClient(
    configuration.supabaseUrl,
    configuration.supabasePublishableKey,
    {
      auth: {
        autoRefreshToken: true,
        detectSessionInUrl: false,
        lock: processLock,
        persistSession: true,
        storage: authStorage,
      },
    },
  );
}
