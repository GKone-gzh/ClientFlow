import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AIExtractionResultSchema,
  type AIExtractionResult,
  type EntityId,
} from "@clientflow/contracts";

import { clientKeys } from "@/features/clients/client-queries";
import { taskKeys } from "@/features/tasks/task-queries";
import { appServices } from "@/services/app-services";

export const intakeKeys = {
  detail: (extractionId: EntityId) => ["intake", extractionId] as const,
};

export function useExtractionResultQuery(extractionId: EntityId) {
  return useQuery({
    queryKey: intakeKeys.detail(extractionId),
    queryFn: () => appServices.intake.getValidatedResult(extractionId),
  });
}

export function useConfirmExtractionMutation(extractionId: EntityId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (result: AIExtractionResult) => {
      const validated = AIExtractionResultSchema.parse(result);
      return appServices.intake.confirm({ extractionId, result: validated });
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: clientKeys.all }),
        queryClient.invalidateQueries({ queryKey: taskKeys.all }),
        queryClient.invalidateQueries({ queryKey: intakeKeys.detail(extractionId) }),
      ]);
    },
  });
}
