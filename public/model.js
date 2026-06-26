export function createRun(scenario) {
  return { scenarioId: scenario?.id || "", cursor: -1, approved: false, startedAt: new Date().toISOString() };
}

export function nextEvent(scenario, run) {
  if (!scenario || !scenario.events) return null;
  const event = scenario.events[run.cursor + 1];
  if (!event || (event.kind === "approval" && !run.approved)) return null;
  return event;
}

export function advanceRun(scenario, run) {
  const event = nextEvent(scenario, run);
  return event ? { ...run, cursor: run.cursor + 1, approved: false } : run;
}

export function isBlocked(scenario, run) {
  if (!scenario || !scenario.events) return false;
  const event = scenario.events[run.cursor + 1];
  return Boolean(event && event.kind === "approval" && !run.approved);
}

export function runStatus(scenario, run) {
  if (!scenario || !scenario.events) return "ready";
  if (run.cursor === scenario.events.length - 1) return "complete";
  if (isBlocked(scenario, run)) return "awaiting approval";
  if (run.cursor < 0) return "ready";
  return "running";
}

export function visibleEvents(scenario, run) {
  if (!scenario || !scenario.events) return [];
  return scenario.events.slice(0, run.cursor + 1);
}

