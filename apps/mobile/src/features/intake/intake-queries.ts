import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AIExtractionResultSchema,
  type AIExtractionResult,
  type EntityId,
} from "@clientflow/contracts";

import { clientKeys } from "@/features/clients/client-queries";
import { confirmIntakeWorkflow } from "@/features/intake/intake-workflow";
import { taskKeys } from "@/features/tasks/task-queries";
import { useAppServices } from "@/services/app-service-provider";

export const intakeKeys = {
  detail: (extractionId: EntityId) => ["intake", extractionId] as const,
};

export function useExtractionResultQuery(extractionId: EntityId) {
  const services = useAppServices();
  return useQuery({
    queryKey: intakeKeys.detail(extractionId),
    queryFn: () => services.intake.getValidatedResult(extractionId),
  });
}

export function useConfirmExtractionMutation(extractionId: EntityId) {
  const services = useAppServices();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (result: AIExtractionResult) => {
      const validated = AIExtractionResultSchema.parse(result);
      return confirmIntakeWorkflow({ services, extractionId, result: validated });
    },
    onSuccess: async (state) => {
      if (state.status !== "confirmed") return;
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: clientKeys.all }),
        queryClient.invalidateQueries({ queryKey: taskKeys.all }),
        queryClient.invalidateQueries({ queryKey: intakeKeys.detail(extractionId) }),
      ]);
    },
  });
}
