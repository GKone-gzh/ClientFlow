import { z } from "zod";

export const CLIENT_STATUSES = [
  "lead",
  "active",
  "inactive",
  "archived",
] as const;
export const ClientStatusSchema = z.enum(CLIENT_STATUSES);
export type ClientStatus = z.infer<typeof ClientStatusSchema>;

export const PROJECT_STATUSES = [
  "draft",
  "active",
  "on_hold",
  "completed",
  "cancelled",
  "archived",
] as const;
export const ProjectStatusSchema = z.enum(PROJECT_STATUSES);
export type ProjectStatus = z.infer<typeof ProjectStatusSchema>;

export const TASK_STATUSES = [
  "todo",
  "in_progress",
  "blocked",
  "done",
  "cancelled",
] as const;
export const TaskStatusSchema = z.enum(TASK_STATUSES);
export type TaskStatus = z.infer<typeof TaskStatusSchema>;

export const UPLOAD_STATUSES = [
  "pending",
  "uploaded",
  "processing",
  "completed",
  "failed",
] as const;
export const UploadStatusSchema = z.enum(UPLOAD_STATUSES);
export type UploadStatus = z.infer<typeof UploadStatusSchema>;

export const AI_EXTRACTION_STATUSES = [
  "queued",
  "processing",
  "needs_review",
  "confirmed",
  "failed",
] as const;
export const AIExtractionStatusSchema = z.enum(AI_EXTRACTION_STATUSES);
export type AIExtractionStatus = z.infer<typeof AIExtractionStatusSchema>;
