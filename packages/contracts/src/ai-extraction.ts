import { z } from "zod";

const NonEmptyTextSchema = z.string().trim().min(1);

export const AI_EXTRACTION_SCHEMA_VERSION = 1 as const;

export const AIExtractionResultSchema = z.object({
  schemaVersion: z.literal(AI_EXTRACTION_SCHEMA_VERSION),
  client: z.object({
    name: NonEmptyTextSchema,
    contactHandle: z.string().trim().min(1).nullable(),
    contactChannel: z.string().trim().min(1).nullable(),
  }),
  project: z.object({
    name: NonEmptyTextSchema,
    summary: z.string().trim().min(1).nullable(),
    budgetAmount: z.number().nonnegative().nullable(),
    budgetCurrency: z.string().trim().length(3).toUpperCase().nullable(),
    dueDate: z.string().date().nullable(),
  }),
  requirements: z
    .array(
      z.object({
        content: NonEmptyTextSchema,
        sortOrder: z.number().int().nonnegative(),
      }),
    )
    .min(1),
  suggestedTasks: z.array(
    z.object({
      title: NonEmptyTextSchema,
      description: z.string().trim().min(1).nullable(),
      requirementIndex: z.number().int().nonnegative().nullable(),
      sortOrder: z.number().int().nonnegative(),
    }),
  ),
  confidence: z.number().min(0).max(1),
  warnings: z.array(NonEmptyTextSchema),
});

export type AIExtractionResult = z.infer<typeof AIExtractionResultSchema>;
