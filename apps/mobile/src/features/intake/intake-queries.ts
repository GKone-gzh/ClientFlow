import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AIExtractionResultSchema,
  type AIExtractionResult,
  type EntityId,
} from "@clientflow/contracts";

import { confirmIntakeWorkflow } from "@/features/intake/intake-workflow";
import {
  clientKeys,
  intakeKeys,
  taskKeys,
} from "@/features/query/query-keys";
import { INTAKE_DETAIL_QUERY_POLICY } from "@/features/query/query-policy";
import { useAppServices } from "@/services/app-service-provider";

export function useExtractionResultQuery(extractionId: EntityId) {
  const services = useAppServices();
  return useQuery({
    ...INTAKE_DETAIL_QUERY_POLICY,
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
        queryClient.invalidateQueries({ queryKey: clientKeys.lists() }),
        queryClient.invalidateQueries({ queryKey: taskKeys.lists() }),
        queryClient.invalidateQueries({ queryKey: intakeKeys.detail(extractionId) }),
      ]);
    },
  });
}
