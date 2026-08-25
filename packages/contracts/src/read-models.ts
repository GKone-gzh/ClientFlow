import { z } from "zod";

import { EntityIdSchema, TaskSchema } from "./inputs.ts";
import type { EntityId, Task } from "./models.ts";

export interface TaskListItem extends Task {
  clientId: EntityId;
  clientName: string;
  projectName: string;
}

export const TaskListItemSchema: z.ZodType<TaskListItem> = TaskSchema.extend({
  clientId: EntityIdSchema,
  clientName: z.string().trim().min(1),
  projectName: z.string().trim().min(1),
}).strict();
