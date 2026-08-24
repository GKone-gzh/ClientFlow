import { z } from "zod";

import { EntityIdSchema } from "./inputs.ts";
import { TaskStatusSchema } from "./statuses.ts";

export const CLIENT_PAGE_SIZE = 50;
export const PROJECT_PAGE_SIZE = 25;
export const TASK_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 100;
export const MAX_PROJECT_BATCH_SIZE = 50;

export const CursorPageRequestSchema = z
  .object({
    cursor: z.string().min(1).nullable().optional(),
    limit: z.number().int().min(1).max(MAX_PAGE_SIZE).optional(),
  })
  .strict();

export type CursorPageRequest = z.infer<typeof CursorPageRequestSchema>;

export const ListTasksInputSchema = CursorPageRequestSchema.extend({
  status: TaskStatusSchema.optional(),
}).strict();

export type ListTasksInput = z.infer<typeof ListTasksInputSchema>;

export const ProjectBatchInputSchema = z
  .object({
    projectIds: z
      .array(EntityIdSchema)
      .max(MAX_PROJECT_BATCH_SIZE)
      .refine((ids) => new Set(ids).size === ids.length, {
        message: "projectIds must be unique",
      }),
  })
  .strict();

export type ProjectBatchInput = z.infer<typeof ProjectBatchInputSchema>;

export interface CursorPage<Item> {
  items: Item[];
  nextCursor: string | null;
}

export function createCursorPageSchema<ItemSchema extends z.ZodType>(
  itemSchema: ItemSchema,
) {
  return z
    .object({
      items: z.array(itemSchema),
      nextCursor: z.string().min(1).nullable(),
    })
    .strict();
}

const TimestampCursorPositionSchema = z.object({
  version: z.literal(1),
  timestamp: z.string().datetime({ offset: true }),
  id: EntityIdSchema,
});

export const TimestampPageCursorSchema = z.discriminatedUnion("resource", [
  TimestampCursorPositionSchema.extend({
    resource: z.literal("clients"),
    order: z.literal("updated_at"),
    scope: z.null(),
  }).strict(),
  TimestampCursorPositionSchema.extend({
    resource: z.literal("projects"),
    order: z.literal("updated_at"),
    scope: EntityIdSchema,
  }).strict(),
  TimestampCursorPositionSchema.extend({
    resource: z.literal("tasks"),
    order: z.literal("created_at"),
    scope: TaskStatusSchema.nullable(),
  }).strict(),
]);

export type TimestampPageCursor = z.infer<
  typeof TimestampPageCursorSchema
>;

export function encodeTimestampPageCursor(cursor: TimestampPageCursor): string {
  return encodeURIComponent(
    JSON.stringify(TimestampPageCursorSchema.parse(cursor)),
  );
}

export function decodeTimestampPageCursor(
  cursor: string,
): TimestampPageCursor | null {
  try {
    const parsed = TimestampPageCursorSchema.safeParse(
      JSON.parse(decodeURIComponent(cursor)),
    );
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
