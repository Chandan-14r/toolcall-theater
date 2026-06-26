import test from "node:test";
import assert from "node:assert/strict";
import { scenarios } from "../data.js";
import { advanceRun, createRun, isBlocked, runStatus, visibleEvents } from "../model.js";

const scenario = scenarios[0];

test("a new run is ready and has no visible events", () => {
  const run = createRun(scenario);
  assert.equal(runStatus(scenario, run), "ready");
  assert.equal(visibleEvents(scenario, run).length, 0);
});

test("the trace blocks at the approval gate", () => {
  let run = createRun(scenario);
  run = advanceRun(scenario, run);
  run = advanceRun(scenario, run);
  run = advanceRun(scenario, run);
  assert.equal(isBlocked(scenario, run), true);
  assert.equal(runStatus(scenario, run), "awaiting approval");
});

test("approval lets the trace complete", () => {
  let run = createRun(scenario);
  for (let index = 0; index < 3; index += 1) run = advanceRun(scenario, run);
  run = { ...run, approved: true };
  while (runStatus(scenario, run) !== "complete") run = advanceRun(scenario, run);
  assert.equal(visibleEvents(scenario, run).at(-1).kind, "result");
});
