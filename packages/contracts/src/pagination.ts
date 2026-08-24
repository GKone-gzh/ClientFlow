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

export interface CursorPage<Item> {
  items: Item[];
  nextCursor: string | null;
}

export const TIMESTAMP_CURSOR_SORTS = ["created_at", "updated_at"] as const;

export const TimestampPageCursorSchema = z
  .object({
    version: z.literal(1),
    sort: z.enum(TIMESTAMP_CURSOR_SORTS),
    timestamp: z.string().datetime({ offset: true }),
    id: EntityIdSchema,
  })
  .strict();

export type TimestampPageCursor = z.infer<
  typeof TimestampPageCursorSchema
>;

export function encodeTimestampPageCursor(cursor: TimestampPageCursor): string {
  return encodeURIComponent(JSON.stringify(TimestampPageCursorSchema.parse(cursor)));
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
