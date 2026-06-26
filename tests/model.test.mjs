import test from "node:test";
import assert from "node:assert/strict";
import { scenarios } from "../public/data.js";
import { advanceRun, createRun, isBlocked, runStatus, visibleEvents } from "../public/model.js";

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

test("multiple approval gates block sequentially", () => {
  const multiApprovalScenario = {
    id: "multi",
    events: [
      { kind: "thought" },
      { kind: "approval", title: "First Approval" },
      { kind: "tool" },
      { kind: "approval", title: "Second Approval" },
      { kind: "result" }
    ]
  };

  let run = createRun(multiApprovalScenario);
  
  // Advance to first event (thought)
  run = advanceRun(multiApprovalScenario, run);
  assert.equal(run.cursor, 0);
  assert.equal(isBlocked(multiApprovalScenario, run), true); // blocks at First Approval
  assert.equal(runStatus(multiApprovalScenario, run), "awaiting approval");

  // Approve first
  run = { ...run, approved: true };
  run = advanceRun(multiApprovalScenario, run); // advances to First Approval event
  assert.equal(run.cursor, 1);
  assert.equal(isBlocked(multiApprovalScenario, run), false); // next is tool (no block)

  // Advance to tool event
  run = advanceRun(multiApprovalScenario, run);
  assert.equal(run.cursor, 2);
  assert.equal(isBlocked(multiApprovalScenario, run), true); // blocks at Second Approval
  assert.equal(runStatus(multiApprovalScenario, run), "awaiting approval");

  // Approve second
  run = { ...run, approved: true };
  run = advanceRun(multiApprovalScenario, run); // advances to Second Approval event
  assert.equal(run.cursor, 3);
  assert.equal(isBlocked(multiApprovalScenario, run), false); // next is result (no block)

  // Advance to result event
  run = advanceRun(multiApprovalScenario, run);
  assert.equal(run.cursor, 4);
  assert.equal(runStatus(multiApprovalScenario, run), "complete");
});
test("null/undefined scenario edge cases are handled safely", () => {
  // createRun with null/undefined
  const run1 = createRun(null);
  assert.equal(run1.scenarioId, "");
  assert.equal(run1.cursor, -1);
  assert.equal(run1.approved, false);

  const run2 = createRun({ id: "test" });
  assert.equal(run2.scenarioId, "test");

  // visibleEvents with null/undefined
  assert.deepEqual(visibleEvents(null, run2), []);
  assert.deepEqual(visibleEvents({ id: "test" }, run2), []);

  // isBlocked with null/undefined
  assert.equal(isBlocked(null, run2), false);

  // runStatus with null/undefined
  assert.equal(runStatus(null, run2), "ready");
});

test("runStatus states are accurately reported", () => {
  const customScenario = {
    id: "test",
    events: [
      { kind: "thought" },
      { kind: "tool" }
    ]
  };

  let run = createRun(customScenario);
  assert.equal(runStatus(customScenario, run), "ready");

  run = advanceRun(customScenario, run);
  assert.equal(runStatus(customScenario, run), "running");

  run = advanceRun(customScenario, run);
  assert.equal(runStatus(customScenario, run), "complete");
});
