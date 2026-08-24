import assert from "node:assert/strict";
import test from "node:test";

import type { AIExtraction } from "@clientflow/contracts";

import { AppServiceError } from "../src/services/service-error";
import {
  AbuseSmokeError,
  summarizeConcurrentOutcomes,
} from "./supabase-abuse-smoke";

const extraction = {
  id: "00000000-0000-4000-8000-000000000001",
} as AIExtraction;

test("security smoke accepts one User A success, one User B success, and two conflicts", () => {
  const summary = summarizeConcurrentOutcomes([
    {
      status: "fulfilled",
      value: { actor: "A", extraction, uploadSlot: "a1" },
    },
    {
      status: "rejected",
      reason: new AppServiceError("conflict", "busy", true),
    },
    {
      status: "rejected",
      reason: new AppServiceError("conflict", "busy", true),
    },
    {
      status: "fulfilled",
      value: { actor: "B", extraction, uploadSlot: "b1" },
    },
  ]);

  assert.equal(summary.stableConcurrencyRejections, 2);
  assert.equal(summary.userASuccess.actor, "A");
  assert.equal(summary.userBSuccess.actor, "B");
});

test("security smoke rejects extra successes or unstable provider errors", () => {
  assert.throws(
    () =>
      summarizeConcurrentOutcomes([
        {
          status: "fulfilled",
          value: { actor: "A", extraction, uploadSlot: "a1" },
        },
        {
          status: "fulfilled",
          value: { actor: "A", extraction, uploadSlot: "a1" },
        },
        {
          status: "rejected",
          reason: new AppServiceError("extraction_failed", "provider", true),
        },
        {
          status: "fulfilled",
          value: { actor: "B", extraction, uploadSlot: "b1" },
        },
      ]),
    (error) =>
      error instanceof AbuseSmokeError &&
      error.code === "concurrency_gate_failed",
  );
});
