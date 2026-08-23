import type { AppServiceComposition } from "@/services/app-services";
import { SupabaseAuthService } from "@/services/supabase/supabase-auth-service";
import { createSupabaseBusinessRepositories } from "@/services/supabase/supabase-business-repositories";
import { createSupabaseClient } from "@/services/supabase/supabase-client";
import { SupabaseIntakeAdapter } from "@/services/supabase/supabase-intake-adapter";
import { createSupabaseUploadAdapter } from "@/services/supabase/supabase-upload-adapter";

export interface SupabaseAppServiceConfiguration {
  adapter: "supabase";
  enableDevelopmentTools: boolean;
  supabasePublishableKey: string;
  supabaseUrl: string;
}

export function composeSupabaseAppServices(
  configuration: SupabaseAppServiceConfiguration,
): AppServiceComposition {
  const supabaseClient = createSupabaseClient(configuration);
  const intake = new SupabaseIntakeAdapter(supabaseClient);

  return {
    capabilities: { extraction: true },
    services: {
      ...createSupabaseBusinessRepositories(supabaseClient),
      ...createSupabaseUploadAdapter(supabaseClient),
      auth: new SupabaseAuthService(supabaseClient),
      extractions: intake,
      intake,
    },
    developmentTools: null,
  };
}
