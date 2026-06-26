import { scenarios } from "./data.js";
import { advanceRun, createRun, isBlocked, runStatus, visibleEvents } from "./model.js";

let scenario = scenarios[0];
let run = createRun(scenario);
let selectedIndex = null;
let timer = null;

const $ = (selector) => document.querySelector(selector);
const nodes = { list: $("#scenario-list"), trace: $("#trace"), title: $("#scenario-title"), eyebrow: $("#scenario-eyebrow"), prompt: $("#scenario-prompt"), status: $("#status-text"), dot: $("#status-dot"), count: $("#trace-count"), events: $("#metric-events"), tools: $("#metric-tools"), latency: $("#metric-latency"), inspectTitle: $("#inspect-title"), inspectCopy: $("#inspect-copy"), inspectDetails: $("#inspect-details"), play: $("#play"), step: $("#step"), restart: $("#restart"), export: $("#export") };

function elapsed() { return visibleEvents(scenario, run).reduce((sum, event) => sum + event.ms, 0); }
function esc(value) { return String(value).replace(/[&<>]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[char]); }

function renderScenarios() {
  nodes.list.innerHTML = scenarios.map(item => `<button class="scenario ${item.id === scenario.id ? "active" : ""}" data-id="${item.id}"><span class="scenario-dot ${item.accent}"></span><span><small>${item.eyebrow}</small><b>${item.title}</b></span></button>`).join("");
  nodes.list.querySelectorAll("button").forEach(button => button.addEventListener("click", () => selectScenario(button.dataset.id)));
}

function renderInspector(event) {
  if (!event) { nodes.inspectTitle.textContent = "Waiting for the first event"; nodes.inspectCopy.textContent = "Play the trace or step through it to inspect what the agent saw and did."; nodes.inspectDetails.innerHTML = ""; return; }
  nodes.inspectTitle.textContent = event.title;
  nodes.inspectCopy.textContent = event.detail || (event.kind === "tool" ? `Executed ${event.tool}.` : "This is a trace event.");
  const sections = [];
  if (event.tool) sections.push(`<section><p>Tool</p><code>${esc(event.tool)}</code></section>`);
  if (event.input) sections.push(`<section><p>Input</p><pre>${esc(JSON.stringify(event.input, null, 2))}</pre></section>`);
  if (event.output) sections.push(`<section><p>Output</p><pre>${esc(JSON.stringify(event.output, null, 2))}</pre></section>`);
  if (event.evidence) sections.push(`<section><p>Evidence</p>${event.evidence.map(item => `<span class="chip">↗ ${esc(item)}</span>`).join("")}</section>`);
  nodes.inspectDetails.innerHTML = sections.join("");
}

function render() {
  const events = visibleEvents(scenario, run);
  const status = runStatus(scenario, run);
  nodes.title.textContent = scenario.title; nodes.eyebrow.textContent = scenario.eyebrow; nodes.prompt.textContent = scenario.prompt;
  nodes.status.textContent = status; nodes.dot.className = status.replaceAll(" ", "-");
  nodes.count.textContent = `${events.length} / ${scenario.events.length}`; nodes.events.textContent = events.length;
  nodes.tools.textContent = events.filter(event => event.kind === "tool").length; nodes.latency.textContent = `${elapsed()}ms`;
  nodes.trace.innerHTML = "";
  events.forEach((event, index) => {
    const fragment = $("#event-template").content.cloneNode(true); const button = fragment.querySelector("button");
    button.classList.add(event.kind); if (index === selectedIndex) button.classList.add("selected");
    button.querySelector(".event-icon").textContent = { thought: "✦", tool: "⌘", approval: "!", result: "✓" }[event.kind];
    button.querySelector("strong").textContent = event.title; button.querySelector("small").textContent = event.detail || event.tool;
    button.querySelector(".event-kind").textContent = event.kind;
    button.addEventListener("click", () => { selectedIndex = index; render(); }); nodes.trace.append(fragment);
  });
  if (isBlocked(scenario, run)) {
    const gate = document.createElement("div"); gate.className = "approval-gate"; gate.innerHTML = `<div><span>Human checkpoint</span><b>${scenario.events[run.cursor + 1].title}</b><p>${scenario.events[run.cursor + 1].detail}</p></div><button class="button approve">Approve action</button>`;
    gate.querySelector("button").addEventListener("click", approve); nodes.trace.append(gate);
  }
  const selected = selectedIndex === null ? events.at(-1) : events[selectedIndex]; renderInspector(selected);
  nodes.play.disabled = status === "complete" || status === "awaiting approval"; nodes.step.disabled = nodes.play.disabled;
  nodes.play.textContent = timer ? "Pause trace" : status === "ready" ? "Play trace →" : "Resume trace →";
  renderScenarios();
}

function advance() { const before = run.cursor; run = advanceRun(scenario, run); if (run.cursor !== before) selectedIndex = run.cursor; render(); return run.cursor !== before; }
function stop() { clearTimeout(timer); timer = null; }
function play() { if (timer) { stop(); render(); return; } const tick = () => { if (!advance()) { stop(); render(); return; } timer = setTimeout(tick, scenario.events[run.cursor].ms || 500); }; tick(); }
function approve() { run = { ...run, approved: true }; selectedIndex = run.cursor + 1; advance(); }
function selectScenario(id) { stop(); scenario = scenarios.find(item => item.id === id); run = createRun(scenario); selectedIndex = null; render(); }
function restart() { stop(); run = createRun(scenario); selectedIndex = null; render(); }
function exportRun() { const payload = { exportedAt: new Date().toISOString(), scenario: scenario.title, status: runStatus(scenario, run), events: visibleEvents(scenario, run) }; const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" })); const link = Object.assign(document.createElement("a"), { href: url, download: `${scenario.id}-trace.json` }); link.click(); URL.revokeObjectURL(url); }

nodes.play.addEventListener("click", play); nodes.step.addEventListener("click", advance); nodes.restart.addEventListener("click", restart); nodes.export.addEventListener("click", exportRun); render();
