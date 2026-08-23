import assert from "node:assert/strict";
import test from "node:test";

import {
  AccuracySmokeError,
  evaluateAccuracyCase,
} from "./supabase-qwen-accuracy";

const completeResult = {
  schemaVersion: 1,
  client: { name: "测试客户", contactHandle: null, contactChannel: null },
  project: {
    name: "测试项目",
    summary: null,
    budgetAmount: 5000,
    budgetCurrency: "CNY",
    dueDate: "2026-09-01",
  },
  requirements: [
    { content: "需求一", sortOrder: 0 },
    { content: "需求二", sortOrder: 1 },
  ],
  suggestedTasks: [],
  confidence: 0.9,
  warnings: [],
};

test("accuracy checks cover complete, missing, dated, multiple, and ambiguous cases", () => {
  assert.equal(evaluateAccuracyCase("complete", completeResult).schemaValid, true);
  assert.equal(
    evaluateAccuracyCase("missing_name", {
      ...completeResult,
      client: { ...completeResult.client, name: "待确认客户" },
      warnings: ["截图中未显示客户姓名"],
    }).placeholderClient,
    true,
  );
  assert.equal(
    evaluateAccuracyCase("amount_and_date", completeResult).hasBudget,
    true,
  );
  assert.equal(
    evaluateAccuracyCase("multiple_requirements", completeResult)
      .requirementCount,
    2,
  );
  assert.equal(
    evaluateAccuracyCase("ambiguous", {
      ...completeResult,
      warnings: ["预算信息存在冲突"],
    }).warningCount,
    1,
  );
});

test("accuracy checks reject schema drift and hallucinated missing names", () => {
  assert.throws(
    () => evaluateAccuracyCase("complete", { privateChat: "must not print" }),
    (error) =>
      error instanceof AccuracySmokeError && error.code === "schema_invalid",
  );
  assert.throws(
    () => evaluateAccuracyCase("missing_name", completeResult),
    (error) =>
      error instanceof AccuracySmokeError &&
      error.code === "accuracy_expectation_failed" &&
      !error.message.includes("测试客户"),
  );
});
