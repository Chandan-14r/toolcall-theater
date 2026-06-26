// App Observability Orchestrator
import { initThreeScene, highlightNode } from "./three-scene.js";

let scenarios = [];
let scenario = null;
let runId = null;
let eventSource = null;
let events = [];
let runStatusText = "ready";
let selectedIndex = null;

// Timer state
let timerInterval = null;
let timerStart = 0;

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => document.querySelectorAll(selector);

const nodes = {
  title: $("#scenario-title"),
  eyebrow: $("#scenario-eyebrow"),
  prompt: $("#scenario-prompt"),
  status: $("#status-text"),
  dot: $("#status-dot"),
  events: $("#metric-events"),
  tools: $("#metric-tools"),
  latency: $("#metric-latency"),
  inspectTitle: $("#inspect-title"),
  inspectCopy: $("#inspect-copy"),
  inspectDetails: $("#inspect-details"),
  play: $("#play"),
  step: $("#step"),
  restart: $("#restart"),
  export: $("#export"),
  timer: $("#elapsed-timer"),
  threeContainer: $("#three-container"),
  traceScrollArea: $("#trace-scroll-area"),
  trace: $("#trace"),
  toggle3d: $("#toggle-3d-btn"),
  toggleList: $("#toggle-list-btn")
};

function esc(value) {
  if (value === undefined || value === null) return "";
  return String(value).replace(/[&<>]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[char]);
}

function elapsed() {
  return events.reduce((sum, event) => sum + (event.ms || 0), 0);
}

// Timer management
function startTimer() {
  stopTimer();
  timerStart = Date.now();
  timerInterval = setInterval(() => {
    const diff = Date.now() - timerStart;
    const mins = Math.floor(diff / 60000).toString().padStart(2, "0");
    const secs = Math.floor((diff % 60000) / 1000).toString().padStart(2, "0");
    const ms = Math.floor((diff % 1000) / 100).toString();
    nodes.timer.textContent = `${mins}:${secs}.${ms}s`;
  }, 100);
}

function stopTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

function resetTimer() {
  stopTimer();
  nodes.timer.textContent = "00:00.0s";
}

async function fetchStats() {
  try {
    const res = await fetch("/api/stats");
    const data = await res.json();
    
    // SQLite relational totals
    $("#stat-sessions").textContent = data.sessions;
    $("#stat-succeeded").textContent = data.runs.find(r => r.status === "succeeded")?.count || 0;
    $("#stat-failed").textContent = data.runs.find(r => r.status === "failed")?.count || 0;
    $("#stat-memories").textContent = data.memories;

    // Tool lists rates
    const toolsList = $("#stat-tools-list");
    if (data.tools && data.tools.length > 0) {
      toolsList.innerHTML = data.tools.map(t => `
        <div class="tool-stat-card">
          <strong>${esc(t.tool_name)}</strong>
          <span>${t.count} executions</span>
          <span>${Math.round(t.avg_duration)}ms avg latency</span>
        </div>
      `).join("");
    } else {
      toolsList.innerHTML = `<p class="empty-dock-text">No tools executed in this session.</p>`;
    }
  } catch (err) {
    console.error("Failed to load platform stats:", err);
  }
}

async function init() {
  // Fetch scenarios from backend
  const res = await fetch("/api/scenarios");
  scenarios = await res.json();
  
  // Try to pre-select "Vendor Brief" scenario if available
  scenario = scenarios.find(s => s.id.includes("vendor")) || scenarios[0];
  
  // Render
  render();
  await fetchStats();

  // Initialize 3D orbital neural node graph
  setTimeout(() => {
    initThreeScene("three-container");
  }, 100);

  // Setup tab buttons listeners
  $$(".nav-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      $$(".nav-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      
      const tabId = btn.dataset.tab;
      $$(".tab-content-pane").forEach(pane => pane.classList.add("hidden"));
      $(`#tab-content-${tabId}`).classList.remove("hidden");
    });
  });

  // Setup View Toggle buttons
  nodes.toggle3d.addEventListener("click", () => {
    nodes.toggle3d.classList.add("active");
    nodes.toggleList.classList.remove("active");
    nodes.threeContainer.classList.remove("hidden");
    nodes.traceScrollArea.classList.add("hidden");
  });

  nodes.toggleList.addEventListener("click", () => {
    nodes.toggleList.classList.add("active");
    nodes.toggle3d.classList.remove("active");
    nodes.traceScrollArea.classList.remove("hidden");
    nodes.threeContainer.classList.add("hidden");
  });
}

function renderInspector(event) {
  if (!event) {
    nodes.inspectTitle.textContent = "Telemetry Inspector";
    nodes.inspectCopy.textContent = "Select any event from the timeline or start a run to inspect agent reasoning, tool data, and outputs.";
    nodes.inspectDetails.innerHTML = "";
    return;
  }

  nodes.inspectTitle.textContent = event.title;
  nodes.inspectCopy.textContent = event.detail || (event.kind === "tool" ? `Executed tool: ${event.tool}` : "Reasoning thought.");

  const sections = [];

  // If there's tool info, format nicely
  if (event.tool) {
    sections.push(`
      <div class="inspect-section">
        <span class="inspect-label">Tool Used</span>
        <code style="font-family: var(--font-mono); color: var(--accent-cyan); font-size: 14px; font-weight: bold;">${esc(event.tool)}</code>
      </div>
    `);
  }

  // Display input/outputs inside clean code blocks
  if (event.input) {
    sections.push(`
      <div class="inspect-section">
        <span class="inspect-label">Parameters (Input)</span>
        <pre class="inspect-code-container">${esc(JSON.stringify(event.input, null, 2))}</pre>
      </div>
    `);
  }

  if (event.output) {
    sections.push(`
      <div class="inspect-section">
        <span class="inspect-label">Response (Output)</span>
        <pre class="inspect-code-container" style="color: var(--success);">${esc(JSON.stringify(event.output, null, 2))}</pre>
      </div>
    `);
  }

  if (event.error) {
    sections.push(`
      <div class="inspect-section">
        <span class="inspect-label" style="color: var(--error);">Execution Error</span>
        <pre class="inspect-code-container" style="color: var(--error); border-color: rgba(239,68,68,0.3); background: rgba(239,68,68,0.05);">${esc(event.error)}</pre>
      </div>
    `);
  }

  if (event.evidence) {
    sections.push(`
      <div class="inspect-section">
        <span class="inspect-label">Retrieved Evidence</span>
        <div style="display: flex; flex-direction: column; gap: 6px; margin-top: 4px;">
          ${event.evidence.map(item => `<div style="background: rgba(255,255,255,0.03); border: 1px solid var(--border-light); padding: 8px 12px; border-radius: 8px; font-size: 12px;">↗ ${esc(item)}</div>`).join("")}
        </div>
      </div>
    `);
  }

  // Handle Playwright browser screenshot embeds if available
  if (event.tool === "browser" && event.output && event.output.screenshotPath) {
    sections.push(`
      <div class="inspect-section">
        <span class="inspect-label">Browser Viewport Screenshot</span>
        <img class="screenshot-preview" src="${esc(event.output.screenshotPath)}" alt="Playwright Viewport Capture" />
      </div>
    `);
  }

  nodes.inspectDetails.innerHTML = sections.join("");
}

function render() {
  nodes.title.textContent = scenario?.title || "Ready to Launch";
  nodes.eyebrow.textContent = scenario?.eyebrow || "Task Deployment";
  nodes.prompt.textContent = scenario?.prompt || "Select an agent scenario to start execution.";
  nodes.status.textContent = runStatusText;
  
  // Status dot indicators
  nodes.dot.className = "";
  if (runStatusText === "running") {
    nodes.dot.classList.add("dot-running");
    startTimer();
  } else if (runStatusText === "succeeded") {
    nodes.dot.classList.add("dot-succeeded");
    stopTimer();
  } else if (runStatusText === "failed") {
    nodes.dot.classList.add("dot-failed");
    stopTimer();
  } else {
    nodes.dot.classList.add("dot-idle");
    resetTimer();
  }

  // Update hero stats
  nodes.events.textContent = events.length;
  nodes.tools.textContent = events.filter(e => e.kind === "tool").length;
  nodes.latency.textContent = `${elapsed()}ms`;

  // Render events in list timeline view
  nodes.trace.innerHTML = "";
  events.forEach((event, index) => {
    const fragment = $("#event-template").content.cloneNode(true);
    const button = fragment.querySelector("button");
    
    button.setAttribute("data-kind", event.error ? "failed" : event.kind);
    if (index === selectedIndex) button.classList.add("active");

    // Assign text content
    button.querySelector(".event-icon").textContent = { thought: "✦", tool: "⚡", result: "✓", failed: "✕" }[event.kind] || "✦";
    button.querySelector(".event-title").textContent = event.title;
    button.querySelector(".event-detail").textContent = event.detail || event.tool || "";
    
    // Elapsed step timer
    if (event.ms) {
      button.querySelector(".event-time").textContent = `${event.ms}ms`;
    }

    button.addEventListener("click", () => {
      selectedIndex = index;
      render();
    });
    
    nodes.trace.append(button);
  });

  const selected = selectedIndex === null ? events.at(-1) : events[selectedIndex];
  renderInspector(selected);

  // Active avatars styling highlight based on who is acting
  $$(".agent-avatar-card").forEach(c => c.classList.remove("active"));
  if (selected) {
    const titleLower = selected.title.toLowerCase();
    if (titleLower.includes("coordinator")) {
      $("#avatar-coordinator").classList.add("active");
    } else if (titleLower.includes("researcher") || titleLower.includes("alice") || titleLower.includes("websearch") || titleLower.includes("browser")) {
      $("#avatar-researcher").classList.add("active");
    } else if (titleLower.includes("programmer") || titleLower.includes("bob") || titleLower.includes("python") || titleLower.includes("shell") || titleLower.includes("filesystem")) {
      $("#avatar-programmer").classList.add("active");
    } else if (titleLower.includes("reviewer") || titleLower.includes("charlie")) {
      $("#avatar-reviewer").classList.add("active");
    }
  }

  // Disable controls while running
  const isRunning = runStatusText === "running";
  nodes.play.disabled = isRunning || !scenario;
  nodes.step.disabled = true; // Autonomous streaming execution
  nodes.restart.disabled = isRunning;
  nodes.export.disabled = events.length === 0;

  nodes.play.textContent = runStatusText === "ready" ? "Launch Run →" : "Launch New Run →";
}

async function startLiveRun() {
  if (eventSource) {
    eventSource.close();
  }
  events = [];
  selectedIndex = null;
  runStatusText = "running";
  render();

  // Create a new run session on backend
  const res = await fetch("/api/runs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ scenarioId: scenario.id })
  });
  const data = await res.json();
  runId = data.runId;

  // Connect to SSE stream
  eventSource = new EventSource(`/api/runs/${runId}/stream`);

  eventSource.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.type === "status_changed") {
      runStatusText = msg.status;
      render();
      if (msg.status === "complete" || msg.status === "failed" || msg.status === "succeeded") {
        eventSource.close();
        stopTimer();
        fetchStats();
      }
    } else if (msg.type === "step_added") {
      events.push(msg.event);
      
      // Auto-highlight corresponding 3D node
      let targetNode = "";
      if (msg.event.tool) {
        targetNode = msg.event.tool;
      } else {
        const titleLower = msg.event.title.toLowerCase();
        if (titleLower.includes("coordinator")) targetNode = "Coordinator";
        else if (titleLower.includes("researcher") || titleLower.includes("alice")) targetNode = "Researcher";
        else if (titleLower.includes("programmer") || titleLower.includes("bob")) targetNode = "Programmer";
        else if (titleLower.includes("reviewer") || titleLower.includes("charlie")) targetNode = "Reviewer";
      }

      if (targetNode) {
        highlightNode(targetNode);
      }

      render();
      
      // Auto scroll timeline if list view is active
      nodes.traceScrollArea.scrollTop = nodes.traceScrollArea.scrollHeight;
    }
  };

  eventSource.onerror = (err) => {
    console.error("SSE stream error:", err);
    eventSource.close();
    runStatusText = "failed";
    stopTimer();
    render();
    fetchStats();
  };
}

function restart() {
  if (eventSource) {
    eventSource.close();
  }
  events = [];
  runId = null;
  runStatusText = "ready";
  selectedIndex = null;
  resetTimer();
  render();
}

function exportRun() {
  const payload = {
    exportedAt: new Date().toISOString(),
    scenario: scenario?.title || "",
    runId,
    status: runStatusText,
    events
  };
  const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
  const link = Object.assign(document.createElement("a"), { href: url, download: `${scenario?.id || "live"}-run-trace.json` });
  link.click();
  URL.revokeObjectURL(url);
}

nodes.play.addEventListener("click", startLiveRun);
nodes.restart.addEventListener("click", restart);
nodes.export.addEventListener("click", exportRun);

// Kickstart app
init();
