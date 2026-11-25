/* ==========================================================================
   Advanced modules (§10–§12):
   - DEMO 10.1: Late Interaction (ColBERT MaxSim Matrix)
   - DEMO 10.2: Sparse Lexical Expansion (SPLADE)
   - DEMO 11.1: Matryoshka (MRL) + Binary/Scalar/PQ Quantization Trade-off
   - DEMO 11.2: Wormhole Vectors & Disjoint Vector Space Traversal
   - DEMO 12.1: Semantic Caching Simulator
   - DEMO 12.2: Agentic Search Multi-Hop Tool-Call Loop (Humans vs. Agents)
   ========================================================================== */

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function initModernLabs({ getTokens, prepCanvas, redrawCallbacks }) {
  /* ========================================================================
     DEMO 10.1 — ColBERT Late Interaction (MaxSim Matrix)
     ======================================================================== */
  const maxsimGridEl = document.getElementById("maxsim-grid");
  let maxsimDoc = "good";

  const Q_TOKS = ["fix", "econnreset", "node", "pool"];
  const DOC_SIMS = {
    good: {
      label: "Doc A: Fixing ECONNRESET in Node HTTP Pool",
      dToks: ["enable", "keep-alive", "econnreset", "node", "socket", "pool"],
      // rows = Q_TOKS, cols = dToks
      mat: [
        [0.82, 0.41, 0.35, 0.18, 0.28, 0.22],
        [0.24, 0.62, 0.98, 0.31, 0.74, 0.39],
        [0.15, 0.22, 0.29, 0.97, 0.44, 0.33],
        [0.20, 0.71, 0.31, 0.28, 0.66, 0.96],
      ],
    },
    noisy: {
      label: "Doc B: Node Pool Party (Off-Topic Lexical Trap)",
      dToks: ["swimming", "pool", "node", "graph", "event", "notes"],
      mat: [
        [0.12, 0.14, 0.18, 0.21, 0.19, 0.25],
        [0.08, 0.11, 0.15, 0.14, 0.12, 0.10],
        [0.14, 0.19, 0.91, 0.62, 0.22, 0.18],
        [0.74, 0.89, 0.21, 0.16, 0.15, 0.11],
      ],
    },
  };

  function renderMaxSim() {
    if (!maxsimGridEl) return;
    const data = DOC_SIMS[maxsimDoc];
    let totalMaxSim = 0;

    const rowsHtml = Q_TOKS.map((qt, r) => {
      const row = data.mat[r];
      const maxVal = Math.max(...row);
      const maxCol = row.indexOf(maxVal);
      totalMaxSim += maxVal;
      const cells = row
        .map((v, c) => {
          const isMax = c === maxCol;
          return `<td class="${isMax ? "ms-max" : ""}">${v.toFixed(2)}</td>`;
        })
        .join("");
      return `<tr><th>${qt}</th>${cells}<td class="ms-sum">${maxVal.toFixed(2)}</td></tr>`;
    }).join("");

    maxsimGridEl.innerHTML = `
      <table class="postings-table ms-table" aria-label="ColBERT MaxSim token similarity matrix">
        <thead>
          <tr>
            <th>Q \\ Doc</th>
            ${data.dToks.map((t) => `<th>${escapeHtml(t)}</th>`).join("")}
            <th>MaxSim</th>
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    `;

    const kpiScore = document.getElementById("kpi-maxsim-score");
    if (kpiScore) {
      kpiScore.textContent = totalMaxSim.toFixed(2);
      kpiScore.className = `kpi-val ${totalMaxSim > 3.0 ? "brand" : "coral"}`;
    }
    const badge = document.getElementById("maxsim-doc-badge");
    if (badge) badge.textContent = data.label;
  }

  document.querySelectorAll("[data-maxsim-doc]").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("[data-maxsim-doc]").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      maxsimDoc = btn.dataset.maxsimDoc;
      renderMaxSim();
    });
  });
  redrawCallbacks.push(renderMaxSim);

  /* ========================================================================
     DEMO 10.2 — Sparse Lexical Expansion (SPLADE)
     ======================================================================== */
  const canvasSplade = document.getElementById("canvas-splade");
  let spladeQuery = "socket";

  const SPLADE_DATA = {
    socket: {
      raw: "socket hang up",
      terms: [
        { term: "socket", w: 2.15, orig: true },
        { term: "hang", w: 1.45, orig: true },
        { term: "econnreset", w: 1.92, orig: false },
        { term: "keepalive", w: 1.54, orig: false },
        { term: "tcp", w: 1.31, orig: false },
        { term: "timeout", w: 1.12, orig: false },
        { term: "retry", w: 0.88, orig: false },
      ],
    },
    rate: {
      raw: "too many requests",
      terms: [
        { term: "requests", w: 1.95, orig: true },
        { term: "429", w: 2.10, orig: false },
        { term: "ratelimit", w: 1.84, orig: false },
        { term: "throttle", w: 1.48, orig: false },
        { term: "backoff", w: 1.26, orig: false },
        { term: "quota", w: 0.94, orig: false },
        { term: "retry-after", w: 0.82, orig: false },
      ],
    },
  };

  function renderSplade() {
    if (!canvasSplade) return;
    const data = SPLADE_DATA[spladeQuery];
    const T = getTokens();
    const { ctx, w, h } = prepCanvas(canvasSplade);
    ctx.clearRect(0, 0, w, h);

    const pad = { left: 96, right: 42, top: 28, bottom: 18 };
    const plotW = w - pad.left - pad.right;
    const rowH = (h - pad.top - pad.bottom) / data.terms.length;
    const maxW = 2.4;

    const compactSp = w < 360;
    ctx.font = `600 10px ${T.mono}`;
    ctx.textAlign = "left";
    const legX = compactSp ? 8 : pad.left;
    ctx.fillStyle = T.blue;
    ctx.fillRect(legX, 8, 9, 9);
    ctx.fillStyle = T.muted;
    ctx.fillText(compactSp ? "Original" : "Original query term", legX + 14, 16);
    ctx.fillStyle = T.brand;
    ctx.fillRect(legX + (compactSp ? 92 : 150), 8, 9, 9);
    ctx.fillStyle = T.muted;
    ctx.fillText(compactSp ? "SPLADE expanded" : "SPLADE expanded term", legX + (compactSp ? 106 : 164), 16);

    data.terms.forEach((t, i) => {
      const y = pad.top + i * rowH + 4;
      const bh = Math.min(16, rowH * 0.62);
      const bw = (t.w / maxW) * plotW;

      ctx.fillStyle = t.orig ? T.blue : T.fg;
      ctx.font = `10.5px ${T.mono}`;
      ctx.textAlign = "right";
      ctx.fillText(t.term, pad.left - 8, y + bh * 0.75);

      ctx.fillStyle = t.orig ? T.blue : T.brand;
      ctx.fillRect(pad.left, y, bw, bh);

      ctx.fillStyle = T.muted;
      ctx.textAlign = "left";
      ctx.fillText(t.w.toFixed(2), pad.left + bw + 6, y + bh * 0.75);
    });
  }

  document.querySelectorAll("[data-splade-q]").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("[data-splade-q]").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      spladeQuery = btn.dataset.spladeQ;
      renderSplade();
    });
  });
  redrawCallbacks.push(renderSplade);

  /* ========================================================================
     DEMO 11.2 — Wormhole Vectors (Traversing Disjoint Vector Spaces)
     ======================================================================== */
  const wormholeOutEl = document.getElementById("wormhole-out");
  let wormholeStep = "semantic";

  const WORMHOLE_STEPS = {
    semantic: {
      title: "1. Enter in Dense Semantic Space",
      desc: "Query \"socket hang up\" lands near ECONNRESET docs in text-embedding space, but has zero behavioral click neighbors yet.",
      bridge: "Anchor docs: [d1: Fixing ECONNRESET, d2: Keep-Alive Pools]",
    },
    wormhole: {
      title: "2. Jump via Wormhole Vector (Shared Doc Anchors)",
      desc: "Pool the behavioral embeddings of the top-k anchor docs (weighted average) to teleport straight into Behavioral Click Space without needing a joint model.",
      bridge: "v_wormhole = 0.65·v_beh(d1) + 0.35·v_beh(d2)",
    },
    behavioral: {
      title: "3. Retrieve in Behavioral Space",
      desc: "Nearest neighbors in behavioral space surface docs users actually solved this issue with next (e.g., \"ALB Idle Timeout 60s Guide\"), even with zero keyword or semantic overlap.",
      bridge: "Discovered: [ALB 60s Idle Timeout, Node http.Agent maxSockets]",
    },
  };

  function renderWormhole() {
    if (!wormholeOutEl) return;
    const s = WORMHOLE_STEPS[wormholeStep];
    wormholeOutEl.innerHTML = `
      <div class="transform-box" style="border-left-color:var(--brand)">
        <strong>${escapeHtml(s.title)}</strong><br/>
        <span style="color:var(--reading)">${escapeHtml(s.desc)}</span><br/>
        <span style="color:var(--brand);display:inline-block;margin-top:6px">${escapeHtml(s.bridge)}</span>
      </div>
    `;
  }

  document.querySelectorAll("[data-wormhole]").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("[data-wormhole]").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      wormholeStep = btn.dataset.wormhole;
      renderWormhole();
    });
  });
  redrawCallbacks.push(renderWormhole);

  /* ========================================================================
     DEMO 12.1 — Semantic Caching Simulator
     ======================================================================== */
  const slCacheTau = document.getElementById("sl-cache-tau");
  const cacheOutEl = document.getElementById("cache-out");
  let cacheQuery = "paraphrase";

  const CACHE_QUERIES = {
    paraphrase: { text: "node socket hang up error fix", sim: 0.91, rightMatch: true },
    related: { text: "configure request timeout in node", sim: 0.78, rightMatch: false },
    unrelated: { text: "download vat billing invoice", sim: 0.22, rightMatch: false },
  };

  function renderCacheLab() {
    if (!slCacheTau || !cacheOutEl) return;
    const tau = Number(slCacheTau.value);
    const q = CACHE_QUERIES[cacheQuery];
    document.getElementById("val-cache-tau").textContent = tau.toFixed(2);

    const isHit = q.sim >= tau;
    const falsePositive = isHit && !q.rightMatch;
    cacheOutEl.className = `rag-status ${falsePositive ? "abstain" : ""}`;

    if (falsePositive) {
      cacheOutEl.innerHTML = `<strong>FALSE POSITIVE CACHE HIT (sim ${q.sim.toFixed(2)} ≥ τ ${tau.toFixed(2)}):</strong> Served the cached ECONNRESET answer for a timeout question! Raise τ_cache above ${q.sim.toFixed(2)} (this pair's similarity).`;
    } else if (isHit) {
      cacheOutEl.innerHTML = `<strong>CACHE HIT (sim ${q.sim.toFixed(2)} ≥ τ ${tau.toFixed(2)}):</strong> Matched cached query "fix econnreset in node". Returned in 3 ms with $0 LLM cost.`;
    } else {
      cacheOutEl.innerHTML = `<strong>CACHE MISS (sim ${q.sim.toFixed(2)} &lt; τ ${tau.toFixed(2)}):</strong> Bypassed cache. Running full hybrid search + LLM generation (~1–3 s) and caching the new result.`;
    }
  }

  if (slCacheTau) slCacheTau.addEventListener("input", renderCacheLab);
  document.querySelectorAll("[data-cache-q]").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("[data-cache-q]").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      cacheQuery = btn.dataset.cacheQ;
      renderCacheLab();
    });
  });
  redrawCallbacks.push(renderCacheLab);

  /* ========================================================================
     DEMO 12.2 — Agentic Search Multi-Hop Tool-Call Loop
     ======================================================================== */
  const agentLogEl = document.getElementById("agent-log");
  let agentStepIdx = 1;

  const AGENT_TRACE = [
    { step: "1. Plan", detail: "User asks: 'Why does my Node service throw ECONNRESET only behind AWS ALB?' Decompose into 2 sub-queries." },
    { step: "2. Tool Call (BM25)", detail: "search_lexical('ECONNRESET Node') -> returns [d1: Fixing ECONNRESET, d2: Keep-Alive Pools]. Missing ALB timeout numbers." },
    { step: "3. Self-Critique", detail: "Gap detected: docs mention load balancer idle timeout, but do not state AWS ALB's 60s default. Issue targeted vector query." },
    { step: "4. Tool Call (Dense)", detail: "search_dense('load balancer closes idle keepalive before client') -> retrieves 'ALB 60s Idle Timeout vs Node 5s/65s Keep-Alive'." },
    { step: "5. Synthesize + Cite", detail: "Answer grounded in [d1] + [ALB Guide]: set Node keepAliveTimeout > ALB idle timeout (e.g., 65s vs 60s) and enable idempotent retries." },
  ];

  function renderAgentLoop() {
    if (!agentLogEl) return;
    agentLogEl.innerHTML = AGENT_TRACE.slice(0, agentStepIdx)
      .map(
        (t, i) => `
        <div class="doc-row ${i === agentStepIdx - 1 ? "top-hit" : ""}">
          <span class="doc-rank">${i + 1}</span>
          <div class="doc-info">
            <div class="doc-title">${escapeHtml(t.step)}</div>
            <div class="doc-meta" style="white-space:normal">${escapeHtml(t.detail)}</div>
          </div>
          <span class="status-pill matched">done</span>
        </div>
      `
      )
      .join("");
  }

  document.querySelectorAll("[data-agent-act]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const act = btn.dataset.agentAct;
      if (act === "reset") agentStepIdx = 1;
      else if (act === "step") agentStepIdx = Math.min(AGENT_TRACE.length, agentStepIdx + 1);
      else if (act === "run") agentStepIdx = AGENT_TRACE.length;
      renderAgentLoop();
    });
  });
  redrawCallbacks.push(renderAgentLoop);
}
