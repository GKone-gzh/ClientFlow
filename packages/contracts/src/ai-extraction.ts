import { z } from "zod";

const NonEmptyTextSchema = z.string().trim().min(1);

export const AI_EXTRACTION_SCHEMA_VERSION = 1 as const;

export const AIExtractionResultSchema = z
  .object({
    schemaVersion: z.literal(AI_EXTRACTION_SCHEMA_VERSION),
    client: z
      .object({
        name: NonEmptyTextSchema,
        contactHandle: z.string().trim().min(1).nullable(),
        contactChannel: z.string().trim().min(1).nullable(),
      })
      .strict(),
    project: z
      .object({
        name: NonEmptyTextSchema,
        summary: z.string().trim().min(1).nullable(),
        budgetAmount: z.number().finite().nonnegative().nullable(),
        budgetCurrency: z.string().trim().length(3).toUpperCase().nullable(),
        dueDate: z.string().date().nullable(),
      })
      .strict(),
    requirements: z
      .array(
        z
          .object({
            content: NonEmptyTextSchema,
            sortOrder: z.number().int().nonnegative(),
          })
          .strict(),
      )
      .min(1),
    suggestedTasks: z.array(
      z
        .object({
          title: NonEmptyTextSchema,
          description: z.string().trim().min(1).nullable(),
          requirementIndex: z.number().int().nonnegative().nullable(),
          sortOrder: z.number().int().nonnegative(),
        })
        .strict(),
    ),
    confidence: z.number().finite().min(0).max(1),
    warnings: z.array(NonEmptyTextSchema),
  })
  .strict()
  .superRefine(({ requirements, suggestedTasks }, context) => {
    suggestedTasks.forEach((task, index) => {
      if (
        task.requirementIndex !== null &&
        task.requirementIndex >= requirements.length
      ) {
        context.addIssue({
          code: "custom",
          message: "requirementIndex must reference an existing requirement",
          path: ["suggestedTasks", index, "requirementIndex"],
        });
      }
    });
  });

export type AIExtractionResult = z.infer<typeof AIExtractionResultSchema>;
