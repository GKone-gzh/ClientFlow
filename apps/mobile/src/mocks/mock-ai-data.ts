import type { AIExtraction, AIExtractionResult } from "@clientflow/contracts";

import { MOCK_USER_ID } from "./mock-data";

export const MOCK_AI_COMPLETE_RESULT: AIExtractionResult = {
  schemaVersion: 1,
  client: {
    name: "唐可",
    contactHandle: "tangke_brand",
    contactChannel: "微信",
  },
  project: {
    name: "咖啡品牌官网",
    summary: "根据聊天截图整理品牌官网的设计与开发需求。",
    budgetAmount: 18000,
    budgetCurrency: "CNY",
    dueDate: "2026-10-15",
  },
  requirements: [
    { content: "包含品牌故事、产品和门店三个主要模块。", sortOrder: 0 },
    { content: "适配手机和桌面端。", sortOrder: 1 },
  ],
  suggestedTasks: [
    {
      title: "确认网站内容清单",
      description: null,
      requirementIndex: 0,
      sortOrder: 0,
    },
    {
      title: "提交首页方向稿",
      description: "提供两个基础方向供客户确认。",
      requirementIndex: 1,
      sortOrder: 1,
    },
  ],
  confidence: 0.92,
  warnings: ["域名和部署方式尚未确认。"],
};

export const MOCK_AI_MISSING_INFO_RESULT: AIExtractionResult = {
  schemaVersion: 1,
  client: {
    name: "截图中的新客户",
    contactHandle: null,
    contactChannel: null,
  },
  project: {
    name: "待确认项目",
    summary: "客户希望制作一个业务介绍页面。",
    budgetAmount: null,
    budgetCurrency: null,
    dueDate: null,
  },
  requirements: [{ content: "制作业务介绍页面。", sortOrder: 0 }],
  suggestedTasks: [],
  confidence: 0.58,
  warnings: ["客户联系方式缺失。", "预算缺失。", "截止时间缺失。"],
};

export const MOCK_AI_INVALID_RESULT: unknown = {
  schemaVersion: 1,
  client: { name: "无效输出", contactHandle: null, contactChannel: null },
  project: {
    name: "缺少需求数组",
    summary: null,
    budgetAmount: null,
    budgetCurrency: null,
    dueDate: null,
  },
  requirements: [],
  suggestedTasks: [],
  confidence: 2,
  warnings: [],
};

export const MOCK_FAILED_EXTRACTION: AIExtraction = {
  id: "60000000-0000-4000-8000-000000000003",
  userId: MOCK_USER_ID,
  uploadId: "50000000-0000-4000-8000-000000000003",
  status: "failed",
  schemaVersion: 1,
  provider: "mock",
  model: "mock-v1",
  result: null,
  errorCode: "extraction_failed",
  createdAt: "2026-08-20T08:00:00.000Z",
  updatedAt: "2026-08-20T08:00:01.000Z",
};
