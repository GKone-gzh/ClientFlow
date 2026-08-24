import { Fragment, useEffect } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { router, useLocalSearchParams } from "expo-router";
import { Controller, useForm } from "react-hook-form";
import { Button, Text, TextInput } from "react-native";
import {
  AIExtractionResultSchema,
  type AIExtractionResult,
} from "@clientflow/contracts";

import { EmptyState, ErrorState, LoadingState } from "@/components/async-state";
import { PlaceholderScreen } from "@/components/placeholder-screen";
import {
  useConfirmExtractionMutation,
  useExtractionResultQuery,
} from "@/features/intake/intake-queries";
import { completeIntakeNavigation } from "@/features/navigation/client-navigation";
import { resolveReviewScreenState } from "@/features/screen-state/screen-state";
import { useIntakeFlowStore } from "@/store/intake-flow-store";

const EMPTY_RESULT: AIExtractionResult = {
  schemaVersion: 1,
  client: { name: "", contactHandle: null, contactChannel: null },
  project: {
    name: "",
    summary: null,
    budgetAmount: null,
    budgetCurrency: null,
    dueDate: null,
  },
  requirements: [{ content: "", sortOrder: 0 }],
  suggestedTasks: [],
  confidence: 0,
  warnings: [],
};

export default function IntakeReviewScreen() {
  const { extractionId } = useLocalSearchParams<{ extractionId: string }>();
  const resultQuery = useExtractionResultQuery(extractionId);
  const confirmMutation = useConfirmExtractionMutation(extractionId);
  const resetIntake = useIntakeFlowStore((state) => state.reset);
  const { control, formState, handleSubmit, reset } = useForm<AIExtractionResult>({
    defaultValues: EMPTY_RESULT,
    resolver: zodResolver(AIExtractionResultSchema),
  });
  const screenState = resolveReviewScreenState({
    confirmError:
      confirmMutation.isError || confirmMutation.data?.status === "failed",
    hasResult: Boolean(resultQuery.data),
    isConfirmed: confirmMutation.data?.status === "confirmed",
    isConfirming: confirmMutation.isPending,
    isResultError: resultQuery.isError,
    resultIsNull: resultQuery.data === null,
  });

  useEffect(() => {
    if (resultQuery.data) {
      reset(resultQuery.data);
    }
  }, [reset, resultQuery.data]);

  const submit = handleSubmit((result) => {
    confirmMutation.mutate(result, {
      onSuccess: (state) => {
        if (state.status !== "confirmed" || !state.confirmation) return;
        resetIntake();
        completeIntakeNavigation(router, state.confirmation.clientId);
      },
    });
  });

  return (
    <PlaceholderScreen
      title="确认识别结果"
      description="提交前请检查并修改识别内容。"
    >
      {screenState === "initial-loading" ? (
        <LoadingState label="正在加载识别结果..." />
      ) : null}
      {screenState === "error" ? (
        <ErrorState onRetry={() => void resultQuery.refetch()} />
      ) : null}
      {screenState === "not-found" ? (
        <EmptyState label="识别结果不存在或已失效。" />
      ) : null}
      {resultQuery.data ? (
        <>
          <Text>客户姓名</Text>
          <Controller
            control={control}
            name="client.name"
            render={({ field }) => (
              <TextInput
                accessibilityLabel="客户姓名"
                onBlur={field.onBlur}
                onChangeText={field.onChange}
                value={field.value}
              />
            )}
          />
          <Text>联系方式</Text>
          <Controller
            control={control}
            name="client.contactHandle"
            render={({ field }) => (
              <TextInput
                accessibilityLabel="客户联系方式"
                onBlur={field.onBlur}
                onChangeText={(value) => field.onChange(value || null)}
                value={field.value ?? ""}
              />
            )}
          />
          <Text>联系渠道</Text>
          <Controller
            control={control}
            name="client.contactChannel"
            render={({ field }) => (
              <TextInput
                accessibilityLabel="客户联系渠道"
                onBlur={field.onBlur}
                onChangeText={(value) => field.onChange(value || null)}
                value={field.value ?? ""}
              />
            )}
          />
          <Text>项目名称</Text>
          <Controller
            control={control}
            name="project.name"
            render={({ field }) => (
              <TextInput
                accessibilityLabel="项目名称"
                onBlur={field.onBlur}
                onChangeText={field.onChange}
                value={field.value}
              />
            )}
          />
          <Text>项目说明</Text>
          <Controller
            control={control}
            name="project.summary"
            render={({ field }) => (
              <TextInput
                accessibilityLabel="项目说明"
                multiline
                onBlur={field.onBlur}
                onChangeText={(value) => field.onChange(value.trim().length ? value : null)}
                value={field.value ?? ""}
              />
            )}
          />
          <Text>预算金额</Text>
          <Controller
            control={control}
            name="project.budgetAmount"
            render={({ field }) => (
              <TextInput
                accessibilityLabel="预算金额"
                keyboardType="decimal-pad"
                onBlur={field.onBlur}
                onChangeText={(value) => field.onChange(value ? Number(value) : null)}
                value={field.value === null ? "" : String(field.value)}
              />
            )}
          />
          <Text>币种</Text>
          <Controller
            control={control}
            name="project.budgetCurrency"
            render={({ field }) => (
              <TextInput
                accessibilityLabel="预算币种"
                autoCapitalize="characters"
                onBlur={field.onBlur}
                onChangeText={(value) => field.onChange(value ? value.toUpperCase() : null)}
                placeholder="CNY"
                value={field.value ?? ""}
              />
            )}
          />
          <Text>截止日期</Text>
          <Controller
            control={control}
            name="project.dueDate"
            render={({ field }) => (
              <TextInput
                accessibilityLabel="截止日期"
                onBlur={field.onBlur}
                onChangeText={(value) => field.onChange(value || null)}
                placeholder="YYYY-MM-DD"
                value={field.value ?? ""}
              />
            )}
          />
          {resultQuery.data.requirements.map((requirement, index) => (
            <Controller
              key={`${requirement.sortOrder}-${index}`}
              control={control}
              name={`requirements.${index}.content`}
              render={({ field }) => (
                <>
                  <Text>需求 {index + 1}</Text>
                  <TextInput
                    accessibilityLabel={`需求 ${index + 1}`}
                    multiline
                    onBlur={field.onBlur}
                    onChangeText={field.onChange}
                    value={field.value}
                  />
                </>
              )}
            />
          ))}
          {resultQuery.data.suggestedTasks.map((task, index) => (
            <Fragment key={`${task.sortOrder}-${index}`}>
              <Text>建议任务 {index + 1}</Text>
              <Controller
                control={control}
                name={`suggestedTasks.${index}.title`}
                render={({ field }) => (
                  <TextInput
                    accessibilityLabel={`建议任务 ${index + 1}`}
                    onBlur={field.onBlur}
                    onChangeText={field.onChange}
                    value={field.value}
                  />
                )}
              />
              <Controller
                control={control}
                name={`suggestedTasks.${index}.description`}
                render={({ field }) => (
                  <TextInput
                    accessibilityLabel={`建议任务 ${index + 1}说明`}
                    multiline
                    onBlur={field.onBlur}
                    onChangeText={(value) => field.onChange(value || null)}
                    value={field.value ?? ""}
                  />
                )}
              />
            </Fragment>
          ))}
          <Text>
            识别置信度：{Math.round(resultQuery.data.confidence * 100)}%
          </Text>
          <Text>待确认项（每行一项）</Text>
          <Controller
            control={control}
            name="warnings"
            render={({ field }) => (
              <TextInput
                accessibilityLabel="待确认项"
                multiline
                onBlur={field.onBlur}
                onChangeText={(value) =>
                  field.onChange(
                    value
                      .split("\n")
                      .map((item) => item.trim())
                      .filter(Boolean),
                  )
                }
                value={field.value.join("\n")}
              />
            )}
          />
          {Object.keys(formState.errors).length > 0 ? (
            <Text accessibilityRole="alert">请修正表单中的无效内容。</Text>
          ) : null}
          {screenState === "confirm-error" ? (
            <Text accessibilityRole="alert">
              {confirmMutation.data?.failure?.error.message ?? "创建客户失败，请重试。"}
            </Text>
          ) : null}
          <Button
            title={screenState === "confirming" ? "创建中..." : "确认并创建客户"}
            disabled={screenState === "confirming"}
            onPress={() => void submit()}
          />
          <Button
            title="取消"
            disabled={screenState === "confirming"}
            onPress={router.back}
          />
        </>
      ) : null}
    </PlaceholderScreen>
  );
}
