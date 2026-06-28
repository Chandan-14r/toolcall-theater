import { initThreeScene, highlightNode } from './three-scene.js';

// ── State ────────────────────────────────────────────────────────────────────
let scenarios = [];
let scenario = null;
let runId = null;
let eventSource = null;
let events = [];
let runStatusText = 'ready';
let selectedIndex = null;
let timerInterval = null;
let timerStart = 0;
let activeTab = 'output';
let prettyPrint = true;
let paused = false;

// ── Helpers ──────────────────────────────────────────────────────────────────

function esc(value) {
  const s = String(value ?? '');
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function elapsed() {
  return events.reduce((sum, e) => sum + (e.ms || 0), 0);
}

function formatTime(ms) {
  if (ms == null) return '—';
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms)}ms`;
}

function getAgentFromEvent(event) {
  if (!event || !event.title) return null;
  const t = event.title.toLowerCase();
  if (t.includes('coordinator')) return 'coordinator';
  if (t.includes('researcher') || t.includes('research')) return 'researcher';
  if (t.includes('programmer') || t.includes('program') || t.includes('coder')) return 'programmer';
  if (t.includes('reviewer') || t.includes('review')) return 'reviewer';
  return null;
}

function copyToClipboard() {
  if (selectedIndex == null || !events[selectedIndex]) return;
  const ev = events[selectedIndex];
  const text = JSON.stringify(ev, null, 2);
  navigator.clipboard.writeText(text).catch(() => {});
}

function downloadJSON() {
  if (selectedIndex == null || !events[selectedIndex]) return;
  const ev = events[selectedIndex];
  const text = JSON.stringify(ev, null, 2);
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `event-${ev.id || selectedIndex}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function exportRun() {
  const payload = { runId, scenario, events, status: runStatusText };
  const text = JSON.stringify(payload, null, 2);
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `run-${runId || 'export'}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function syntaxHighlightJSON(obj) {
  if (!obj) return '';
  const json = JSON.stringify(obj, null, 2);
  return json
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(
      /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*")(\s*:)/g,
      '<span class="json-key">$1</span>$3'
    )
    .replace(
      /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*")/g,
      '<span class="json-string">$1</span>'
    )
    .replace(/\b(true|false|null)\b/g, '<span class="json-null">$1</span>')
    .replace(
      /\b(-?\d+\.?\d*([eE][+-]?\d+)?)\b/g,
      '<span class="json-number">$1</span>'
    );
}

// ── Timer ────────────────────────────────────────────────────────────────────

function startTimer() {
  if (timerInterval) return;
  timerStart = Date.now();
  const el = document.querySelector('#elapsed-timer');
  timerInterval = setInterval(() => {
    const diff = Date.now() - timerStart;
    const totalSec = diff / 1000;
    const mins = Math.floor(totalSec / 60);
    const secs = Math.floor(totalSec % 60);
    const tenths = Math.floor((diff % 1000) / 100);
    if (el) {
      el.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${tenths}s`;
    }
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
  const el = document.querySelector('#elapsed-timer');
  if (el) el.textContent = '00:00.0s';
}

// ── Fetch Stats ──────────────────────────────────────────────────────────────

async function fetchStats() {
  try {
    const res = await fetch('/api/stats');
    if (!res.ok) return;
    const stats = await res.json();

    const set = (sel, val) => {
      const el = document.querySelector(sel);
      if (el) el.textContent = val ?? '—';
    };

    set('#stat-sessions', stats.sessions ?? 0);
    set('#stat-succeeded', stats.succeeded ?? 0);
    set('#stat-failed', stats.failed ?? 0);
    set('#stat-memories', stats.memories ?? 0);

    const totalRuns = (stats.succeeded ?? 0) + (stats.failed ?? 0) + (stats.sessions ?? 0);
    set('#stat-total-runs', totalRuns);

    const successRate = totalRuns > 0 ? (stats.succeeded ?? 0) / totalRuns : 0;
    const failRate = totalRuns > 0 ? (stats.failed ?? 0) / totalRuns : 0;
    set('#stat-success-pct', `${Math.round(successRate * 100)}%`);
    set('#stat-fail-pct', `${Math.round(failRate * 100)}%`);

    // Donut chart
    const circumference = 2 * Math.PI * 35; // ≈ 220
    const donutCircle = document.querySelector('#donut-circle');
    if (donutCircle) {
      const offset = circumference * (1 - successRate);
      donutCircle.style.strokeDasharray = `${circumference}`;
      donutCircle.style.strokeDashoffset = `${offset}`;
    }
    const donutLabel = document.querySelector('#donut-label');
    if (donutLabel) {
      donutLabel.textContent = `${Math.round(successRate * 100)}%`;
    }

    // Tool stats
    const toolsList = document.querySelector('#stat-tools-list');
    if (toolsList && stats.tools) {
      toolsList.innerHTML = '';
      const tools = Array.isArray(stats.tools) ? stats.tools : Object.entries(stats.tools).map(([name, data]) => ({ name, ...data }));
      tools.forEach((tool) => {
        const card = document.createElement('div');
        card.className = 'tool-card';
        card.innerHTML = `
          <span class="tool-card-name">${esc(tool.name)}</span>
          <span class="tool-card-count">${tool.count ?? 0} calls</span>
          <span class="tool-card-avg">${formatTime(tool.avgMs ?? tool.avg_ms ?? 0)}</span>
        `;
        toolsList.appendChild(card);
      });

      // Average response time across all tools
      let totalAvg = 0;
      let toolCount = 0;
      tools.forEach((tool) => {
        const avg = tool.avgMs ?? tool.avg_ms ?? 0;
        if (avg > 0) { totalAvg += avg; toolCount++; }
      });
      set('#stat-avg-time', toolCount > 0 ? formatTime(totalAvg / toolCount) : '—');
    }

    // Token estimate: sum of events * ~150 tokens per event
    const totalEvents = stats.totalEvents ?? events.length;
    const tokens = totalEvents * 150;
    const tokenStr = tokens >= 1000 ? `${(tokens / 1000).toFixed(1)}K` : String(tokens);
    set('#stat-tokens', tokenStr);
  } catch (err) {
    console.warn('Failed to fetch stats:', err);
  }
}

// ── Render ───────────────────────────────────────────────────────────────────

function render() {
  // Scenario info
  const titleEl = document.querySelector('#scenario-title');
  if (titleEl) titleEl.textContent = scenario?.title ?? scenario?.name ?? 'No scenario';
  const eyebrowEl = document.querySelector('#scenario-eyebrow');
  if (eyebrowEl) eyebrowEl.textContent = scenario?.category ?? scenario?.eyebrow ?? 'Scenario';
  const promptEl = document.querySelector('#run-prompt');
  if (promptEl) promptEl.textContent = scenario?.prompt ?? scenario?.description ?? '';

  // Update active scenario buttons
  document.querySelectorAll('.scenario').forEach(btn => {
    const isSel = btn.textContent === scenario?.title;
    btn.classList.toggle('active', isSel);
  });

  // Run ID
  const runIdEl = document.querySelector('#run-id-text');
  if (runIdEl) runIdEl.textContent = runId ?? 'No active run';

  // Status
  const statusText = document.querySelector('#status-text');
  if (statusText) statusText.textContent = runStatusText;
  const statusDot = document.querySelector('#status-dot');
  if (statusDot) {
    statusDot.className = 'status-dot';
    if (runStatusText === 'running') statusDot.classList.add('dot-running');
    else if (runStatusText === 'succeeded') statusDot.classList.add('dot-succeeded');
    else if (runStatusText === 'failed') statusDot.classList.add('dot-failed');
    else statusDot.classList.add('dot-idle');
  }

  // Live badge
  const liveBadge = document.querySelector('#live-badge');
  if (liveBadge) liveBadge.style.display = runStatusText === 'running' ? '' : 'none';

  // Metrics
  const metricEvents = document.querySelector('#metric-events');
  if (metricEvents) metricEvents.textContent = events.length;
  const toolEvents = events.filter((e) => e.kind === 'tool');
  const metricTools = document.querySelector('#metric-tools');
  if (metricTools) metricTools.textContent = toolEvents.length;
  const metricLatency = document.querySelector('#metric-latency');
  if (metricLatency) metricLatency.textContent = formatTime(elapsed());

  // Timer
  if (runStatusText === 'running') {
    startTimer();
  } else if (runStatusText === 'succeeded' || runStatusText === 'failed') {
    stopTimer();
  } else if (runStatusText === 'ready') {
    resetTimer();
  }

  // Agent pipeline
  const latestEvent = events.length > 0 ? events[events.length - 1] : null;
  const activeAgent = getAgentFromEvent(latestEvent);
  document.querySelectorAll('.pipeline-node').forEach((node) => {
    node.classList.remove('active');
    const agentName = node.getAttribute('data-agent') || node.textContent.trim().toLowerCase();
    if (activeAgent && agentName.includes(activeAgent)) {
      node.classList.add('active');
    }
  });

  // Agent chat card
  const chatText = document.querySelector('#agent-chat-text');
  if (chatText) {
    const messages = {
      coordinator: 'Coordinating task delegation across agents...',
      researcher: 'Searching knowledge bases and gathering information...',
      programmer: 'Writing and refining code solutions...',
      reviewer: 'Reviewing output quality and correctness...',
    };
    if (activeAgent && messages[activeAgent]) {
      chatText.textContent = messages[activeAgent];
    } else if (runStatusText === 'running') {
      chatText.textContent = 'Processing...';
    } else if (runStatusText === 'succeeded') {
      chatText.textContent = 'Run completed successfully.';
    } else if (runStatusText === 'failed') {
      chatText.textContent = 'Run encountered an error.';
    } else {
      chatText.textContent = 'Awaiting instructions.';
    }
  }

  // Timeline
  renderTimeline();

  // Inspector
  const selectedEvent = selectedIndex != null ? events[selectedIndex] : null;
  renderInspector(selectedEvent);

  // Button states
  const btnPlay = document.querySelector('#play');
  if (btnPlay) btnPlay.disabled = runStatusText === 'running';
  const btnStopRun = document.querySelector('#btn-stop-run');
  if (btnStopRun) btnStopRun.style.display = runStatusText === 'running' ? '' : 'none';
}

// ── Timeline Rendering ──────────────────────────────────────────────────────

function renderTimeline() {
  const container = document.querySelector('#timeline-list');
  if (!container) return;
  container.innerHTML = '';

  events.forEach((event, index) => {
    const card = document.createElement('div');
    card.className = 'timeline-card event';
    card.setAttribute('data-kind', event.kind);
    if (index === selectedIndex) card.classList.add('active');

    // Kind-based styling
    const kindColors = { thought: '#a78bfa', tool: '#38bdf8', result: '#34d399', approval: '#fbbf24' };
    const kindIcons = { thought: '✦', tool: '⚡', result: '✓', approval: '⚠' };
    const accentColor = kindColors[event.kind] || '#64748b';
    const icon = kindIcons[event.kind] || '●';

    // Timestamp
    const ts = event.timestamp ? new Date(event.timestamp) : null;
    const timeStr = ts
      ? `${String(ts.getHours()).padStart(2, '0')}:${String(ts.getMinutes()).padStart(2, '0')}:${String(ts.getSeconds()).padStart(2, '0')}`
      : '';

    // Determine if latest running event
    const isLatest = runStatusText === 'running' && index === events.length - 1;

    // Agent name
    const agentName = getAgentFromEvent(event) || event.agent || 'Agent';
    const agentLabel = agentName.charAt(0).toUpperCase() + agentName.slice(1);

    // Description
    const fullDetail = event.detail || event.title || '';
    const isSelected = index === selectedIndex;
    const truncated = !isSelected && fullDetail.length > 120
      ? fullDetail.slice(0, 120) + '…'
      : fullDetail;

    // Build inner HTML
    let html = `
      <div class="card-accent-line" style="background:${accentColor}"></div>
      <div class="card-icon" style="color:${accentColor}">${icon}</div>
      <div class="card-content">
        <div class="card-title-row">
          <strong>${esc(agentLabel)}</strong>
          ${isLatest ? '<span class="card-live-badge">LIVE</span>' : ''}
          <span class="card-timestamp">${esc(timeStr)}</span>
        </div>
        <p class="card-description">${esc(truncated)}</p>
    `;

    // Tool badge
    if (event.kind === 'tool' && event.tool) {
      html += `<span class="card-tool-badge">${esc(event.tool)}</span>`;
    }

    // Nested search results
    if (event.kind === 'tool' && event.output && Array.isArray(event.output)) {
      const results = event.output;
      html += `<div class="card-nested">`;
      html += `<div class="search-results-header">${results.length} result${results.length !== 1 ? 's' : ''}</div>`;
      results.forEach((item) => {
        const title = item.title || item.name || 'Result';
        const domain = item.domain || item.url || '';
        const score = item.score ?? item.relevance ?? 0.5;
        const firstLetter = title.charAt(0).toUpperCase();
        html += `
          <div class="search-result-item">
            <div class="result-favicon">${esc(firstLetter)}</div>
            <div class="result-info">
              <div class="result-title">${esc(title)}</div>
              <div class="result-domain">${esc(domain)}</div>
              <div class="relevance-bar">
                <div class="relevance-fill" style="width:${Math.round(score * 100)}%"></div>
              </div>
            </div>
          </div>
        `;
      });
      html += `</div>`;
    }

    html += `</div>`; // close .card-content

    card.innerHTML = html;
    card.addEventListener('click', () => {
      selectedIndex = index;
      render();
    });
    container.appendChild(card);
  });

  // Auto-scroll to bottom on new events
  const scrollEl = document.querySelector('#timeline-scroll') || container;
  scrollEl.scrollTop = scrollEl.scrollHeight;
}

// ── Inspector Rendering ──────────────────────────────────────────────────────

function renderInspector(event) {
  const inspectTitle = document.querySelector('#inspect-title');
  const inspectBody = document.querySelector('#inspect-body') || document.querySelector('.inspector-body');
  const resultHeader = document.querySelector('.inspector-result-header');

  if (!event) {
    if (inspectTitle) inspectTitle.textContent = 'No event selected';
    if (resultHeader) resultHeader.innerHTML = '<span class="inspector-empty">Select an event from the timeline</span>';
    if (inspectBody) inspectBody.innerHTML = '<div class="inspector-empty-state"><p>Select an event from the timeline to inspect its details.</p></div>';
    return;
  }

  if (inspectTitle) inspectTitle.textContent = event.title || 'Event';

  // Result header with success/error badge
  if (resultHeader) {
    const isError = event.error || event.kind === 'approval';
    const badgeClass = isError ? 'badge-error' : 'badge-success';
    const badgeText = isError ? 'Error' : 'Success';
    resultHeader.innerHTML = `
      <span>${esc(event.title || 'Event')}</span>
      <span class="inspector-badge ${badgeClass}">${badgeText}</span>
    `;
  }

  if (!inspectBody) return;

  let content = '';

  switch (activeTab) {
    case 'input': {
      if (event.input && typeof event.input === 'object' && Object.keys(event.input).length > 0) {
        content = `<pre class="json-display">${syntaxHighlightJSON(event.input)}</pre>`;
      } else if (event.input && typeof event.input === 'string') {
        content = `<pre class="json-display">${esc(event.input)}</pre>`;
      } else {
        content = '<div class="inspector-empty-state"><p>No input data for this event.</p></div>';
      }
      break;
    }
    case 'output': {
      if (event.output && typeof event.output === 'object') {
        content = `<pre class="json-display">${syntaxHighlightJSON(event.output)}</pre>`;
      } else if (event.output) {
        content = `<pre class="json-display">${esc(String(event.output))}</pre>`;
      } else if (event.detail) {
        content = `<pre class="json-display">${esc(event.detail)}</pre>`;
      } else {
        content = '<div class="inspector-empty-state"><p>No output data for this event.</p></div>';
      }
      break;
    }
    case 'tool': {
      const toolName = event.tool || '—';
      const duration = event.ms != null ? formatTime(event.ms) : '—';
      content = `
        <div class="inspector-detail-grid">
          <div class="detail-row"><span class="detail-label">Tool</span><span class="detail-value">${esc(toolName)}</span></div>
          <div class="detail-row"><span class="detail-label">Duration</span><span class="detail-value">${duration}</span></div>
          <div class="detail-row"><span class="detail-label">Permissions</span><span class="detail-value">${event.permissions || 'standard'}</span></div>
          <div class="detail-row"><span class="detail-label">Kind</span><span class="detail-value">${esc(event.kind || '—')}</span></div>
        </div>
      `;
      break;
    }
    case 'metadata': {
      content = `
        <div class="inspector-detail-grid">
          <div class="detail-row"><span class="detail-label">Event ID</span><span class="detail-value">${esc(event.id ?? '—')}</span></div>
          <div class="detail-row"><span class="detail-label">Run ID</span><span class="detail-value">${esc(event.runId ?? runId ?? '—')}</span></div>
          <div class="detail-row"><span class="detail-label">Kind</span><span class="detail-value">${esc(event.kind ?? '—')}</span></div>
          <div class="detail-row"><span class="detail-label">Timestamp</span><span class="detail-value">${event.timestamp ? new Date(event.timestamp).toLocaleString() : '—'}</span></div>
          <div class="detail-row"><span class="detail-label">Agent</span><span class="detail-value">${esc(getAgentFromEvent(event) || event.agent || '—')}</span></div>
        </div>
      `;
      break;
    }
    default:
      content = '<div class="inspector-empty-state"><p>Unknown tab.</p></div>';
  }

  inspectBody.innerHTML = content;
}

// ── Live Run ─────────────────────────────────────────────────────────────────

async function startLiveRun() {
  // Close existing stream
  if (eventSource) {
    eventSource.close();
    eventSource = null;
  }

  // Reset
  events = [];
  selectedIndex = null;
  runStatusText = 'running';
  paused = false;

  // Show timeline view, hide 3D
  const threeContainer = document.querySelector('#three-container');
  const timelineScroll = document.querySelector('#timeline-scroll');
  if (threeContainer) threeContainer.style.display = 'none';
  if (timelineScroll) timelineScroll.style.display = '';

  render();

  try {
    const res = await fetch('/api/runs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scenarioId: scenario?.id }),
    });
    const data = await res.json();
    runId = data.runId || data.id;
    render();

    // Connect SSE
    eventSource = new EventSource(`/api/runs/${runId}/stream`);

    eventSource.onmessage = (msg) => {
      let payload;
      try {
        payload = JSON.parse(msg.data);
      } catch {
        return;
      }

      if (payload.type === 'status_changed' || payload.kind === 'status_changed') {
        runStatusText = payload.status || payload.runStatus || runStatusText;
        render();
        // Close on terminal states
        if (runStatusText === 'succeeded' || runStatusText === 'failed') {
          eventSource.close();
          eventSource = null;
          fetchStats();
        }
      } else if (payload.type === 'step_added' || payload.kind !== 'status_changed') {
        const event = payload.event || payload;
        events.push(event);
        selectedIndex = events.length - 1;

        // Highlight 3D node
        const agent = getAgentFromEvent(event);
        if (agent) {
          try { highlightNode(agent); } catch { /* 3D may not be ready */ }
        }

        render();
      }
    };

    eventSource.onerror = () => {
      if (eventSource) {
        eventSource.close();
        eventSource = null;
      }
      if (runStatusText === 'running') {
        runStatusText = 'failed';
      }
      render();
      fetchStats();
    };
  } catch (err) {
    console.error('Failed to start run:', err);
    runStatusText = 'failed';
    render();
    fetchStats();
  }
}

function restartRun() {
  if (eventSource) {
    eventSource.close();
    eventSource = null;
  }
  events = [];
  selectedIndex = null;
  runId = null;
  runStatusText = 'ready';
  paused = false;
  resetTimer();
  render();
}

// ── Initialization ───────────────────────────────────────────────────────────

async function init() {
  // 1. Fetch scenarios
  try {
    const res = await fetch('/api/scenarios');
    scenarios = await res.json();
  } catch (err) {
    console.warn('Failed to fetch scenarios:', err);
    scenarios = [];
  }

  // 2. Pick default scenario
  scenario = scenarios.find((s) => (s.id || '').includes('research')) || scenarios[0] || null;

  // Render scenario selection buttons dynamically
  const scenarioList = document.querySelector('#scenario-buttons-list');
  if (scenarioList) {
    scenarioList.innerHTML = '';
    scenarios.forEach((s) => {
      const btn = document.createElement('button');
      btn.className = `scenario ${scenario?.id === s.id ? 'active' : ''}`;
      btn.textContent = s.title;
      btn.addEventListener('click', () => {
        scenario = s;
        render();
      });
      scenarioList.appendChild(btn);
    });
  }

  // 3. Render
  render();

  // 4. Fetch stats
  fetchStats();

  // 5. Init Three.js scene
  setTimeout(() => {
    try {
      initThreeScene('three-container');
    } catch (err) {
      console.warn('Three.js init failed:', err);
    }
  }, 100);

  // 6. Sidebar navigation
  document.querySelectorAll('.sidebar-link').forEach((link) => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      document.querySelectorAll('.sidebar-link').forEach((l) => l.classList.remove('active'));
      link.classList.add('active');

      const tab = link.getAttribute('data-tab') || link.getAttribute('href')?.replace('#', '') || 'live';
      const allPanes = ['tab-content-live', 'tab-content-agents', 'tab-content-tools', 'tab-content-memory', 'tab-content-settings'];
      allPanes.forEach((id) => {
        const pane = document.querySelector(`#${id}`);
        if (pane) pane.style.display = 'none';
      });
      const activePane = document.querySelector(`#tab-content-${tab}`);
      if (activePane) activePane.style.display = '';
    });
  });

  // 7. View toggle (3D vs list)
  const btn3D = document.querySelector('#toggle-3d-btn');
  const btnList = document.querySelector('#toggle-list-btn');
  const threeContainer = document.querySelector('#three-container');
  const timelineScroll = document.querySelector('#timeline-scroll');

  if (btn3D) {
    btn3D.addEventListener('click', () => {
      if (threeContainer) threeContainer.style.display = '';
      if (timelineScroll) timelineScroll.style.display = 'none';
      btn3D.classList.add('active');
      if (btnList) btnList.classList.remove('active');
    });
  }
  if (btnList) {
    btnList.addEventListener('click', () => {
      if (threeContainer) threeContainer.style.display = 'none';
      if (timelineScroll) timelineScroll.style.display = '';
      btnList.classList.add('active');
      if (btn3D) btn3D.classList.remove('active');
    });
  }

  // 8. Inspector tabs
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      activeTab = btn.getAttribute('data-tab') || btn.textContent.trim().toLowerCase();
      const selectedEvent = selectedIndex != null ? events[selectedIndex] : null;
      renderInspector(selectedEvent);
    });
  });

  // 9. Inspector action buttons
  const btnCopy = document.querySelector('#btn-copy');
  if (btnCopy) btnCopy.addEventListener('click', copyToClipboard);

  const btnDownload = document.querySelector('#btn-download');
  if (btnDownload) btnDownload.addEventListener('click', downloadJSON);

  const btnPrettyPrint = document.querySelector('#btn-pretty-print');
  if (btnPrettyPrint) {
    btnPrettyPrint.addEventListener('click', () => {
      prettyPrint = !prettyPrint;
      btnPrettyPrint.classList.toggle('active', prettyPrint);
      const selectedEvent = selectedIndex != null ? events[selectedIndex] : null;
      renderInspector(selectedEvent);
    });
  }

  // 10. Pause and stop buttons
  const btnPause = document.querySelector('#btn-pause');
  if (btnPause) {
    btnPause.addEventListener('click', () => {
      paused = !paused;
      btnPause.classList.toggle('active', paused);
      btnPause.textContent = paused ? 'Resume' : 'Pause';
    });
  }

  const btnStopRun = document.querySelector('#btn-stop-run');
  if (btnStopRun) {
    btnStopRun.addEventListener('click', () => {
      if (eventSource) {
        eventSource.close();
        eventSource = null;
      }
      runStatusText = 'failed';
      render();
      fetchStats();
    });
  }

  // Event listeners for main action buttons
  const btnPlay = document.querySelector('#play');
  if (btnPlay) btnPlay.addEventListener('click', startLiveRun);

  const btnRestart = document.querySelector('#restart');
  if (btnRestart) btnRestart.addEventListener('click', restartRun);

  const btnExport = document.querySelector('#export');
  if (btnExport) btnExport.addEventListener('click', exportRun);
}

// ── Boot ─────────────────────────────────────────────────────────────────────
init();
