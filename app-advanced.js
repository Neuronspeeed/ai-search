import { legend as ckLegend, readout } from "./chart-kit.js";
import {
  BOOST_SCENARIOS,
  DENSE_QUERIES,
  EMBEDDING_POINTS,
  HYBRID_SCENARIOS,
  IVF_CENTROIDS,
  QUERY_PIPELINE_PRESETS,
  betaAdjustedGrade,
  computeErr,
  computeNdcg,
  fuseHybrid,
  halfLifeDecay,
} from "./data.js";

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

const SHORT_DOC_NAMES = {
  d1: "Fixing ECONNRESET",
  d2: "Keep-Alive Pools",
  d3: "Retry Patterns",
  d4: "SDK Changelog",
  d5: "Stuffed FAQ",
  d6: "Getting Started",
  d7: "Rate Limit (429)",
  d8: "Billing FAQ",
};

function shortName(d) {
  if (d.title.startsWith("Pricing")) return "Pricing & Plans";
  if (d.title.startsWith("Request Timeout") || d.title.startsWith("Timeout")) return "Timeout Config";
  return SHORT_DOC_NAMES[d.id] || d.title;
}

/**
 * Unnormalized Beta PDF shape for crisp visualization on [0, 1]
 */
function betaPdfNorm(x, alpha, beta) {
  if (x <= 0.002 || x >= 0.998) return 0;
  const logVal = (alpha - 1) * Math.log(x) + (beta - 1) * Math.log(1 - x);
  const mode = Math.max(0.01, Math.min(0.99, (alpha - 1) / Math.max(0.01, alpha + beta - 2)));
  const logMode = (alpha - 1) * Math.log(mode) + (beta - 1) * Math.log(1 - mode);
  return Math.exp(logVal - logMode);
}

export function initAdvancedLabs({ getTokens, prepCanvas, redrawCallbacks }) {
  /* ========================================================================
     DEMO 5.1 — 4-Phase Semantic Query Pipeline & SKG Relatedness
     ======================================================================== */
  const queryTreeEl = document.getElementById("query-tree");
  const transformOutEl = document.getElementById("transform-out");
  const skgContextBadge = document.getElementById("skg-context-badge");
  const canvasSkg = document.getElementById("canvas-skg");
  let activePipePreset = "econnreset";

  function renderQueryPipeline() {
    if (!queryTreeEl || !canvasSkg) return;
    const preset = QUERY_PIPELINE_PRESETS[activePipePreset];
    skgContextBadge.textContent = preset.skgContext;

    queryTreeEl.innerHTML = preset.tokens
      .map(
        (t) => `
        <div class="qt-node ${t.type}">
          <span class="qt-word">${escapeHtml(t.text)}</span>
          <span class="qt-type">${escapeHtml(t.type)} · ${escapeHtml(t.note)}</span>
        </div>
      `
      )
      .join("");

    transformOutEl.textContent = preset.transformed;

    const T = getTokens();
    const { ctx, w, h } = prepCanvas(canvasSkg);
    ctx.clearRect(0, 0, w, h);

    const compactSkg = w < 340;
    const skgFont = `${compactSkg ? "10px" : "11px"} ${T.mono}`;
    ctx.font = skgFont;
    const widestTerm = Math.max(...preset.skgNodes.map((n) => ctx.measureText(n.term).width));
    const pad = {
      left: Math.min(Math.round(w * 0.52), Math.ceil(widestTerm) + 14),
      right: 38,
      top: 20,
      bottom: 28,
    };
    const plotW = w - pad.left - pad.right;
    const plotH = h - pad.top - pad.bottom;
    const zeroX = pad.left + plotW * 0.5;
    const rowH = plotH / preset.skgNodes.length;
    const scale = plotW * 0.42;

    ctx.strokeStyle = T.lineStrong;
    ctx.lineWidth = 1.25;
    ctx.beginPath();
    ctx.moveTo(zeroX, pad.top);
    ctx.lineTo(zeroX, pad.top + plotH);
    ctx.stroke();

    preset.skgNodes.forEach((n, idx) => {
      const y = pad.top + idx * rowH + rowH * 0.22;
      const barH = Math.min(18, rowH * 0.52);
      const bw = Math.abs(n.z) * scale;
      const x = n.z >= 0 ? zeroX : zeroX - bw;

      ctx.fillStyle = T.fg;
      ctx.font = skgFont;
      ctx.textAlign = "right";
      ctx.fillText(n.term, pad.left - 8, y + barH * 0.72);

      ctx.fillStyle = n.z >= 0.5 ? T.brand : n.z >= 0 ? T.blue : T.coral;
      ctx.fillRect(x, y, bw, barH);

      ctx.fillStyle = n.z >= 0 ? T.fg : T.coral;
      ctx.font = `600 11.5px ${T.mono}`;
      ctx.textAlign = "left";
      if (n.z >= 0) {
        ctx.fillText(`+${n.z.toFixed(2)}`, x + bw + 6, y + barH * 0.72);
      } else {
        ctx.fillText(n.z.toFixed(2), zeroX + 6, y + barH * 0.72);
      }
    });

    ctx.fillStyle = T.muted;
    ctx.font = `11px ${T.mono}`;
    ctx.textAlign = "center";
    ctx.fillText("-1.0", pad.left + 12, h - 6);
    ctx.fillText("0.0", zeroX, h - 6);
    ctx.fillText("+1.0", w - pad.right - 12, h - 6);
  }

  document.querySelectorAll("[data-pipe-preset]").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("[data-pipe-preset]").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      activePipePreset = btn.dataset.pipePreset;
      renderQueryPipeline();
    });
  });
  redrawCallbacks.push(renderQueryPipeline);

  /* ========================================================================
     DEMO 6.1 — SDBN Click Model + Live Beta(α, β) Density Curve & Simulator
     ======================================================================== */
  const serpListEl = document.getElementById("sdbn-serp");
  const slBetaClicks = document.getElementById("sl-beta-clicks");
  const slBetaExamines = document.getElementById("sl-beta-examines");
  const slBetaW = document.getElementById("sl-beta-w");
  const canvasBeta = document.getElementById("canvas-beta");

  const serpDocs = [
    { id: "d5", title: "Stuffed FAQ (Rank #1)" },
    { id: "d4", title: "SDK Changelog (Rank #2)" },
    { id: "d1", title: "Fixing ECONNRESET (Rank #3)" },
    { id: "d2", title: "Keep-Alive Pools (Rank #4)" },
    { id: "d3", title: "Retry Patterns (Rank #5)" },
  ];
  const clickedSet = new Set(["d1"]);

  function renderSdbnBeta() {
    if (!serpListEl || !canvasBeta) return;
    let lastClickedIdx = -1;
    serpDocs.forEach((d, idx) => {
      if (clickedSet.has(d.id)) lastClickedIdx = idx;
    });

    serpListEl.innerHTML = serpDocs
      .map((d, idx) => {
        const isClicked = clickedSet.has(d.id);
        const examined = idx <= lastClickedIdx;
        const status = isClicked
          ? `<span class="status-pill matched">E=1 · Click (+)</span>`
          : examined
            ? `<span class="status-pill filtered">E=1 · Skip (-)</span>`
            : `<span class="status-pill missed">E=0 · Unseen</span>`;
        const rowCls = isClicked ? "serp-row clicked" : examined ? "serp-row skipped" : "serp-row";
        return `
          <div class="${rowCls}">
            <span class="doc-rank">#${idx + 1}</span>
            <div class="doc-title">${escapeHtml(d.title)}</div>
            ${status}
            <button type="button" class="mini-btn" data-serp-toggle="${d.id}">${
              isClicked ? "Unclick" : "Click"
            }</button>
          </div>
        `;
      })
      .join("");

    serpListEl.querySelectorAll("[data-serp-toggle]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.serpToggle;
        if (clickedSet.has(id)) clickedSet.delete(id);
        else clickedSet.add(id);
        renderSdbnBeta();
      });
    });

    let clicks = Number(slBetaClicks.value);
    const examines = Math.max(1, Number(slBetaExamines.value));
    if (clicks > examines) {
      clicks = examines;
      slBetaClicks.value = String(clicks);
    }
    const priorW = Number(slBetaW.value);
    const priorGrade = 0.25;
    const alpha0 = priorGrade * priorW;
    const beta0 = (1 - priorGrade) * priorW;
    const alphaPost = alpha0 + clicks;
    const betaPost = beta0 + (examines - clicks);
    const rawCtr = clicks / examines;
    const adjusted = betaAdjustedGrade(clicks, examines, priorGrade, priorW);

    document.getElementById("val-beta-clicks").textContent = String(clicks);
    document.getElementById("val-beta-examines").textContent = String(examines);
    document.getElementById("val-beta-w").textContent = String(priorW);

    document.getElementById("kpi-sdbn-last").textContent =
      lastClickedIdx >= 0 ? `Rank #${lastClickedIdx + 1}` : "None";
    document.getElementById("kpi-raw-ctr").textContent = `${Math.round(rawCtr * 100)}%`;
    document.getElementById("kpi-beta-grade").innerHTML = `<span class="was">${Math.round(rawCtr * 100)}%</span><span class="arrow">→</span>${Math.round(adjusted * 100)}%`;
    {
      const gap = Math.abs(rawCtr - adjusted);
      const why = examines < priorW / 4
        ? `Only ${examines} examine${examines === 1 ? "" : "s"}: raw CTR says ${Math.round(rawCtr * 100)}%, but the prior (25%, weight ${priorW}) still outweighs the evidence, so the grade stays at ${Math.round(adjusted * 100)}%.`
        : gap < 0.05
          ? `${examines} examines is plenty of evidence: raw CTR and the smoothed grade agree (${Math.round(adjusted * 100)}%).`
          : `${examines} examines: the grade has moved from 25% toward the raw ${Math.round(rawCtr * 100)}%, but hasn't fully trusted it yet (${Math.round(adjusted * 100)}%).`;
      readout(document.getElementById("ro-beta"), [["clicks", clicks], ["examines", examines], ["prior weight", priorW]], why);
    }

    // Real Beta(α, β) posterior density curve vs. prior curve
    const T = getTokens();
    const { ctx, w, h } = prepCanvas(canvasBeta);
    ctx.clearRect(0, 0, w, h);

    const pad = { left: 24, right: 20, top: 30, bottom: 34 };
    const plotW = w - pad.left - pad.right;
    const plotH = h - pad.top - pad.bottom;
    const toX = (p) => pad.left + p * plotW;
    const toY = (v) => pad.top + plotH - v * plotH * 0.88;

    // Baseline axis
    ctx.strokeStyle = T.lineStrong;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pad.left, pad.top + plotH);
    ctx.lineTo(w - pad.right, pad.top + plotH);
    ctx.stroke();

    // Prior Beta(α0, β0) dashed amber curve
    ctx.save();
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = T.amber;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    for (let i = 1; i <= 99; i++) {
      const p = i / 100;
      const y = toY(betaPdfNorm(p, Math.max(1.2, alpha0), Math.max(1.2, beta0)));
      if (i === 1) ctx.moveTo(toX(p), y);
      else ctx.lineTo(toX(p), y);
    }
    ctx.stroke();
    ctx.restore();

    // Posterior Beta(α_post, β_post) filled emerald curve
    ctx.beginPath();
    ctx.moveTo(toX(0.01), pad.top + plotH);
    for (let i = 1; i <= 99; i++) {
      const p = i / 100;
      const y = toY(betaPdfNorm(p, Math.max(1.2, alphaPost), Math.max(1.2, betaPost)));
      ctx.lineTo(toX(p), y);
    }
    ctx.lineTo(toX(0.99), pad.top + plotH);
    ctx.closePath();
    ctx.fillStyle = "rgba(0,200,83,0.16)";
    ctx.fill();

    ctx.beginPath();
    for (let i = 1; i <= 99; i++) {
      const p = i / 100;
      const y = toY(betaPdfNorm(p, Math.max(1.2, alphaPost), Math.max(1.2, betaPost)));
      if (i === 1) ctx.moveTo(toX(p), y);
      else ctx.lineTo(toX(p), y);
    }
    ctx.strokeStyle = T.brand;
    ctx.lineWidth = 2.4;
    ctx.stroke();

    // Vertical marker for Raw CTR (coral dashed)
    const xRaw = toX(rawCtr);
    ctx.save();
    ctx.setLineDash([3, 3]);
    ctx.strokeStyle = T.coral;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(xRaw, pad.top + 8);
    ctx.lineTo(xRaw, pad.top + plotH);
    ctx.stroke();
    ctx.restore();

    // Vertical marker for Posterior Mean (emerald)
    const xPost = toX(adjusted);
    ctx.strokeStyle = T.brand;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(xPost, pad.top + 8);
    ctx.lineTo(xPost, pad.top + plotH);
    ctx.stroke();

    // Boxed legend inside the plot (chart-kit)
    ckLegend(ctx, T, { left: pad.left, right: w - pad.right, top: pad.top, bottom: pad.top + plotH }, [
      { label: "prior 25%", color: T.amber, kind: "dash" },
      { label: `posterior ${(adjusted * 100).toFixed(0)}%`, color: T.brand, kind: "line" },
      { label: `raw CTR ${(rawCtr * 100).toFixed(0)}%`, color: T.coral, kind: "line" },
    ], null, "tr");

    // X-axis ticks
    ctx.fillStyle = T.muted;
    ctx.font = `11px ${T.mono}`;
    ctx.textAlign = "center";
    for (let p = 0; p <= 100; p += 25) {
      ctx.fillText(`${p}%`, toX(p / 100), pad.top + plotH + 15);
    }
    ctx.fillText("Estimated true click attractiveness", pad.left + plotW / 2, h - 3);
  }

  // Simulator buttons (+10 sessions, +100 sessions at true CTR=72%, Reset to 1/1)
  document.querySelectorAll("[data-beta-sim]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const mode = btn.dataset.betaSim;
      if (mode === "reset") {
        slBetaClicks.value = "1";
        slBetaExamines.value = "1";
      } else {
        const addN = mode === "10" ? 10 : 50;
        const addClicks = Math.round(addN * 0.72);
        const curE = Number(slBetaExamines.value);
        const curC = Number(slBetaClicks.value);
        const newE = Math.min(100, curE + addN);
        const realAdd = newE - curE; // stop adding clicks once examines hits its cap
        slBetaExamines.value = String(newE);
        slBetaClicks.value = String(Math.min(newE, curC + Math.round((addClicks / addN) * realAdd)));
      }
      renderSdbnBeta();
    });
  });

  [slBetaClicks, slBetaExamines, slBetaW].forEach((sl) => sl && sl.addEventListener("input", renderSdbnBeta));
  redrawCallbacks.push(renderSdbnBeta);

  /* ========================================================================
     DEMO 7.1 — Pixel-Exact Voronoi Cells + Step-Through Greedy ANN Routing
     ======================================================================== */
  const canvasDense = document.getElementById("canvas-dense");
  const denseListEl = document.getElementById("dense-doc-list");
  const slNprobe = document.getElementById("sl-nprobe");
  const chkInt8 = document.getElementById("chk-int8");
  const chkCross = document.getElementById("chk-cross");
  let activeDenseQuery = "socket";
  let customDensePos = { ...DENSE_QUERIES.socket };
  let draggingDense = false;

  // Graph edges between docs for HNSW-style greedy hop-by-hop routing
  const GRAPH_EDGES = {
    d8: ["d4", "d7"],
    d4: ["d8", "d5", "d3", "d7"],
    d5: ["d4", "d3", "d2"],
    d7: ["d8", "d4", "d6", "d3"],
    d6: ["d7", "d2", "d3"],
    d3: ["d4", "d5", "d6", "d2"],
    d2: ["d3", "d5", "d6", "d1"],
    d1: ["d2", "d6"],
  };
  const BY_ID = new Map(EMBEDDING_POINTS.map((p) => [p.id, p]));
  let hopPath = ["d8"]; // start greedy walk from entry node d8

  function nextGreedyHop() {
    const curId = hopPath[hopPath.length - 1];
    const cur = BY_ID.get(curId);
    const curDist = Math.hypot(cur.x - customDensePos.x, cur.y - customDensePos.y);
    let bestId = null;
    let bestDist = curDist;
    for (const nbId of GRAPH_EDGES[curId] || []) {
      const nb = BY_ID.get(nbId);
      const d = Math.hypot(nb.x - customDensePos.x, nb.y - customDensePos.y);
      if (d < bestDist - 0.001) {
        bestDist = d;
        bestId = nbId;
      }
    }
    if (bestId && !hopPath.includes(bestId)) {
      hopPath.push(bestId);
      return true;
    }
    return false;
  }

  function renderDenseLab() {
    if (!canvasDense || !slNprobe) return;
    const q = customDensePos;
    const nprobe = Number(slNprobe.value);
    const useInt8 = chkInt8.checked;
    const useCross = chkCross.checked;

    document.getElementById("val-nprobe").textContent = `${nprobe} / 4 clusters`;

    const sortedCentroids = IVF_CENTROIDS.map((c) => ({
      ...c,
      dist: Math.hypot(c.x - q.x, c.y - q.y),
    })).sort((a, b) => a.dist - b.dist);
    const probedSet = new Set(sortedCentroids.slice(0, nprobe).map((c) => c.id));

    const allScored = EMBEDDING_POINTS.map((p, idx) => {
      const dist = Math.hypot(p.x - q.x, p.y - q.y);
      const exactSim = Math.max(0.05, 1 - dist * 1.15);
      const qNoise = useInt8 ? ((idx % 2 === 0 ? -1 : 1) * 0.004) : 0; // int8 rounding is tiny
      const annSim = Math.min(0.99, Math.max(0.05, exactSim + qNoise)); // stage 1: the vector (ANN) score
      // stage 2 (toy cross-encoder): reads query + doc together, so it replaces the vector score
      const crossBoost = useCross ? (p.cluster === sortedCentroids[0].id ? 0.06 : -0.04) : 0;
      const sim = useCross ? Math.min(0.99, Math.max(0.05, exactSim + crossBoost)) : annSim;
      return { ...p, exactSim, annSim, sim, probed: probedSet.has(p.cluster) };
    });

    const exactTop3 = new Set(
      [...allScored].sort((a, b) => b.exactSim - a.exactSim).slice(0, 3).map((d) => d.id)
    );
    const probedRanked = allScored.filter((d) => d.probed).sort((a, b) => b.sim - a.sim);
    const retrievedTop3 = probedRanked.slice(0, 3);
    // ANN recall is measured on the vector stage, before any rerank: a reranker reorders, it can't fix what IVF missed
    const annTop3 = allScored.filter((d) => d.probed).sort((a, b) => b.annSim - a.annSim).slice(0, 3);
    const recallHits = annTop3.filter((d) => exactTop3.has(d.id)).length;
    const recallPct = Math.round((recallHits / 3) * 100);

    const baseLatency = nprobe * 4 + (useInt8 ? 2 : 6) + (useCross ? 42 : 0);

    document.getElementById("kpi-dense-recall").textContent = `${recallPct}%`;
    document.getElementById("kpi-dense-mem").innerHTML = useInt8 ? `<span class="was">100%</span><span class="arrow">→</span>25%` : "100%";
    document.getElementById("kpi-dense-lat").textContent = `${baseLatency} ms`;
    document.getElementById("dense-query-badge").textContent = `${hopPath.length - 1} hops · ${q.text}`;

    denseListEl.innerHTML = probedRanked
      .slice(0, 5)
      .map((d, idx) => {
        const lex = q.key ? d.lexMatch[q.key] : false;
        return `
          <div class="doc-row ${idx === 0 ? "top-hit" : ""}">
            <span class="doc-rank">#${idx + 1}</span>
            <div class="doc-info">
              <div class="doc-title">${escapeHtml(d.label)}</div>
              <div class="doc-meta">
                <span>cluster C${d.cluster}</span>
                <span>${lex ? "lexical match" : "0 shared keywords"}</span>
              </div>
              <div class="doc-bar-track"><div class="doc-bar-fill" style="width:${Math.round(
                d.sim * 100
              )}%;background:var(--sem-secondary)"></div></div>
            </div>
            <span class="doc-score">${d.sim.toFixed(2)}</span>
          </div>
        `;
      })
      .join("");

    // Left canvas: Pixel-exact Voronoi regions + HNSW graph edges + greedy hop trace + top-3 distance beams
    const T = getTokens();
    const { ctx, w, h } = prepCanvas(canvasDense);
    ctx.clearRect(0, 0, w, h);

    const pad = 26;
    const plotW = w - pad * 2;
    const plotH = h - pad * 2;
    const toX = (v) => pad + v * plotW;
    const toY = (v) => pad + (1 - v) * plotH;

    // 1. Voronoi cell shading & boundaries (coarse 6px grid for 60fps smoothness)
    const step = 6;
    const cols = Math.ceil(plotW / step);
    const rows = Math.ceil(plotH / step);
    const owner = new Int8Array(cols * rows);
    for (let gy = 0; gy < rows; gy++) {
      const ny = 1 - ((gy + 0.5) * step) / plotH;
      for (let gx = 0; gx < cols; gx++) {
        const nx = ((gx + 0.5) * step) / plotW;
        let bestC = 0;
        let bestD = Infinity;
        for (const c of IVF_CENTROIDS) {
          const d = (c.x - nx) ** 2 + (c.y - ny) ** 2;
          if (d < bestD) { bestD = d; bestC = c.id; }
        }
        owner[gy * cols + gx] = bestC;
        if (probedSet.has(bestC)) {
          ctx.fillStyle = "rgba(0,200,83,0.065)";
          ctx.fillRect(pad + gx * step, pad + gy * step, step, step);
        }
      }
    }
    // Voronoi cell border dots where owner changes
    ctx.fillStyle = T.lineStrong;
    for (let gy = 0; gy < rows - 1; gy++) {
      for (let gx = 0; gx < cols - 1; gx++) {
        const cur = owner[gy * cols + gx];
        if (cur !== owner[gy * cols + gx + 1] || cur !== owner[(gy + 1) * cols + gx]) {
          ctx.fillRect(pad + gx * step, pad + gy * step, 1.5, 1.5);
        }
      }
    }

    // 2. Subtle HNSW graph edges
    ctx.strokeStyle = T.line;
    ctx.lineWidth = 1;
    for (const [fromId, nbs] of Object.entries(GRAPH_EDGES)) {
      const a = BY_ID.get(fromId);
      for (const toId of nbs) {
        if (fromId < toId) {
          const b = BY_ID.get(toId);
          ctx.beginPath();
          ctx.moveTo(toX(a.x), toY(a.y));
          ctx.lineTo(toX(b.x), toY(b.y));
          ctx.stroke();
        }
      }
    }

    // 3. Distance beams from QUERY to top-3 probed neighbors
    const qx = toX(q.x);
    const qy = toY(q.y);
    ctx.save();
    ctx.setLineDash([3, 3]);
    ctx.strokeStyle = "rgba(96,165,250,0.45)";
    ctx.lineWidth = 1.2;
    retrievedTop3.forEach((d) => {
      ctx.beginPath();
      ctx.moveTo(qx, qy);
      ctx.lineTo(toX(d.x), toY(d.y));
      ctx.stroke();
    });
    ctx.restore();

    // 4. Active greedy HNSW hop path (amber bold line)
    if (hopPath.length > 1) {
      ctx.strokeStyle = T.amber;
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      hopPath.forEach((id, i) => {
        const p = BY_ID.get(id);
        if (i === 0) ctx.moveTo(toX(p.x), toY(p.y));
        else ctx.lineTo(toX(p.x), toY(p.y));
      });
      ctx.stroke();
    }

    // 5. Centroid crosses & cluster labels
    IVF_CENTROIDS.forEach((c) => {
      const cx = toX(c.x);
      const cy = toY(c.y);
      const isProbed = probedSet.has(c.id);
      ctx.strokeStyle = isProbed ? T.brand : T.muted;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(cx - 4, cy); ctx.lineTo(cx + 4, cy);
      ctx.moveTo(cx, cy - 4); ctx.lineTo(cx, cy + 4);
      ctx.stroke();

      ctx.fillStyle = isProbed ? T.brand : T.muted;
      ctx.font = `600 10.5px ${T.mono}`;
      const ly = c.y < 0.5 ? h - 7 : 12;
      if (w < 360) {
        const isLeft = c.id === 1 || c.id === 3;
        ctx.textAlign = isLeft ? "left" : "right";
        ctx.fillText(c.label, isLeft ? 6 : w - 6, ly);
      } else {
        ctx.textAlign = "center";
        const tw = ctx.measureText(c.label).width;
        ctx.fillText(c.label, Math.max(tw / 2 + 6, Math.min(w - tw / 2 - 6, cx)), ly);
      }
    });

    // 6. Doc points
    allScored.forEach((p) => {
      const px = toX(p.x);
      const py = toY(p.y);
      const inPath = hopPath.includes(p.id);
      ctx.beginPath();
      ctx.arc(px, py, inPath ? 6 : p.probed ? 5 : 4, 0, Math.PI * 2);
      ctx.fillStyle = inPath ? T.amber : p.probed ? T.blue : T.muted;
      ctx.fill();

      ctx.fillStyle = p.probed || inPath ? T.fg : T.muted;
      ctx.font = `11px ${T.mono}`;
      ctx.textAlign = "left";
      ctx.fillText(p.id, px + 7, py + 3);
    });

    // 7. Draggable query diamond
    ctx.save();
    ctx.translate(qx, qy);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = T.amber;
    ctx.fillRect(-6, -6, 12, 12);
    ctx.strokeStyle = T.bg;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(-6, -6, 12, 12);
    ctx.restore();

    ctx.fillStyle = T.amber;
    ctx.font = `700 11.5px ${T.mono}`;
    ctx.textAlign = q.x > 0.65 ? "right" : "left";
    ctx.fillText("QUERY", q.x > 0.65 ? qx - 12 : qx + 12, q.y > 0.85 ? qy + 16 : qy + 4);
  }

  function updateDenseFromPointer(e) {
    const rect = canvasDense.getBoundingClientRect();
    const pad = 26;
    const plotW = Math.max(1, rect.width - pad * 2);
    const plotH = Math.max(1, rect.height - pad * 2);
    const nx = Math.max(0.05, Math.min(0.95, (e.clientX - rect.left - pad) / plotW));
    const ny = Math.max(0.05, Math.min(0.95, 1 - (e.clientY - rect.top - pad) / plotH));
    customDensePos = { text: `custom (${nx.toFixed(2)}, ${ny.toFixed(2)})`, x: nx, y: ny, key: null };
    hopPath = ["d8"];
    document.querySelectorAll("[data-dense-query]").forEach((b) => {
      b.classList.remove("active");
      b.setAttribute("aria-pressed", "false");
    });
    renderDenseLab();
  }

  if (canvasDense) {
    canvasDense.addEventListener("pointerdown", (e) => {
      draggingDense = true;
      canvasDense.setPointerCapture(e.pointerId);
      updateDenseFromPointer(e);
    });
    canvasDense.addEventListener("pointermove", (e) => {
      if (!draggingDense) return;
      updateDenseFromPointer(e);
    });
    canvasDense.addEventListener("pointerup", () => { draggingDense = false; });
    canvasDense.addEventListener("keydown", (e) => {
      const step = 0.05;
      let { x, y } = customDensePos;
      if (e.key === "ArrowRight") x = Math.min(0.95, x + step);
      else if (e.key === "ArrowLeft") x = Math.max(0.05, x - step);
      else if (e.key === "ArrowUp") y = Math.min(0.95, y + step);
      else if (e.key === "ArrowDown") y = Math.max(0.05, y - step);
      else return;
      e.preventDefault();
      customDensePos = { text: `custom (${x.toFixed(2)}, ${y.toFixed(2)})`, x, y, key: null };
      hopPath = ["d8"];
      renderDenseLab();
    });
  }

  document.querySelectorAll("[data-hnsw-act]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const act = btn.dataset.hnswAct;
      if (act === "reset") {
        hopPath = ["d8"];
      } else if (act === "step") {
        nextGreedyHop();
      } else if (act === "run") {
        let guard = 0;
        while (nextGreedyHop() && guard++ < 10) {}
      }
      renderDenseLab();
    });
  });

  [slNprobe, chkInt8, chkCross].forEach((el) => el && el.addEventListener("change", renderDenseLab));
  if (slNprobe) slNprobe.addEventListener("input", renderDenseLab);
  document.querySelectorAll("[data-dense-query]").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("[data-dense-query]").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      activeDenseQuery = btn.dataset.denseQuery;
      customDensePos = { ...DENSE_QUERIES[activeDenseQuery] };
      hopPath = ["d8"];
      renderDenseLab();
    });
  });
  redrawCallbacks.push(renderDenseLab);

  /* ========================================================================
     DEMO 8.1 — Side-by-Side Hybrid Search: RRF vs. RSF Simultaneously
     ======================================================================== */
  const rrfListEl = document.getElementById("hybrid-rrf-list");
  const rsfListEl = document.getElementById("hybrid-rsf-list");
  const slRrfK = document.getElementById("sl-rrf-k");
  const slRsfW = document.getElementById("sl-rsf-w");
  let hybridScenario = "outlier";

  function renderHybridLab() {
    if (!rrfListEl || !rsfListEl || !slRrfK) return;
    const kVal = Number(slRrfK.value);
    const wVal = Number(slRsfW.value);
    document.getElementById("val-rrf-k").textContent = String(kVal);
    document.getElementById("val-rsf-w").textContent = `${Math.round(wVal * 100)}% BM25`;

    const docs = HYBRID_SCENARIOS[hybridScenario].docs;
    const rrfRes = fuseHybrid(docs, "rrf", kVal, wVal);
    const rsfRes = fuseHybrid(docs, "rsf", kVal, wVal);

    const renderFusedList = (el, list, isRrf) => {
      const maxF = Math.max(0.0001, ...list.map((d) => d.fused));
      el.innerHTML = list
        .map((d, idx) => {
          const wB = (d.partB / maxF) * 100;
          const wV = (d.partV / maxF) * 100;
          const isTrap = !isRrf && hybridScenario === "outlier" && idx === 0 && d.id === "d5";
          const formulaStr = isRrf
            ? `${d.rB ? `1/(${kVal}+${d.rB})` : "0"} + ${d.rV ? `1/(${kVal}+${d.rV})` : "0"}`
            : `${wVal.toFixed(2)}·${d.bm25 == null ? "0" : `norm(${d.bm25})`} + ${(1 - wVal).toFixed(2)}·${d.vec == null ? "0" : `norm(${d.vec})`}`;
          return `
            <div class="doc-row ${idx === 0 ? "top-hit" : ""}" style="${
              isTrap ? "border-color:var(--sem-coral);background:rgba(251,113,133,0.1)" : ""
            }">
              <span class="doc-rank">#${idx + 1}</span>
              <div class="doc-info">
                <div class="doc-title">${escapeHtml(d.title)}</div>
                <div class="doc-meta">
                  <span>BM25 ${d.rB ? `#${d.rB}` : "not found"}</span>
                  <span>Vec ${d.rV ? `#${d.rV}` : "not found"}</span>
                  <span>${formulaStr}</span>
                </div>
                <div class="dual-bar">
                  <div class="dual-bar-b" style="width:${wB}%"></div>
                  <div class="dual-bar-v" style="width:${wV}%"></div>
                </div>
              </div>
              <span class="doc-score">${d.fused.toFixed(3)}</span>
            </div>
          `;
        })
        .join("");
    };

    renderFusedList(rrfListEl, rrfRes, true);
    renderFusedList(rsfListEl, rsfRes, false);

    const rrfTrap = hybridScenario === "outlier" && rrfRes[0].id === "d5";
    const rsfTrap = hybridScenario === "outlier" && rsfRes[0].id === "d5";
    const kpiRrf = document.getElementById("kpi-hybrid-rrf");
    const kpiRsf = document.getElementById("kpi-hybrid-rsf");
    const kpiAgree = document.getElementById("kpi-hybrid-agree");

    if (kpiRrf) {
      kpiRrf.textContent = shortName(rrfRes[0]);
      kpiRrf.className = `kpi-val ${rrfTrap ? "coral" : "brand"}`;
    }
    if (kpiRsf) {
      kpiRsf.textContent = shortName(rsfRes[0]);
      kpiRsf.className = `kpi-val ${rsfTrap ? "coral" : "brand"}`;
    }
    if (kpiAgree) {
      const same = rrfRes[0].id === rsfRes[0].id;
      kpiAgree.textContent = same ? "Agree" : "Disagree";
      kpiAgree.className = `kpi-val ${same ? "brand" : "amber"}`;
    }
    {
      const r = rrfRes[0];
      const f = rsfRes[0];
      const same = r.id === f.id;
      const why = same
        ? `Both agree on "${r.title}". When no list has an extreme score, rank-based and score-based fusion pick the same winner.`
        : (() => {
          const bm = docs.map((d) => d.bm25).filter((x) => x != null).sort((a, b) => b - a);
          const place = (x) => (x ? `#${x}` : "not found");
          const outsized = f.bm25 === bm[0] && bm[0] >= 1.8 * bm[1];
          const firstPlace = r.rB === 1 ? "BM25" : r.rV === 1 ? "vector" : null;
          const rrfWhy = kVal < 10 && firstPlace
            ? `At k = ${kVal}, a first place counts far more than a second, so "${r.title}" (#1 in ${firstPlace}, ${place(firstPlace === "BM25" ? r.rV : r.rB)} in the other list) wins RRF.`
            : `RRF only looks at positions: "${r.title}" is ${place(r.rB)} in BM25 and ${place(r.rV)} in vectors, the best combined placing.`;
          const rsfWhy = outsized
            ? `RSF rescales raw scores, so "${f.title}" wins on one outsized BM25 score (${f.bm25} vs ${bm[1]})${wVal > 0.5 ? ", helped by BM25's bigger weight" : ""}.`
            : f.bm25 == null
              ? `RSF follows the scores: with BM25 weighted only ${Math.round(wVal * 100)}%, "${f.title}" wins on its top vector score (${f.vec}) even though BM25 never found it.`
              : f.rB <= 2 && f.rV <= 2
                ? `RSF keeps score margins, so "${f.title}", strong in both lists (BM25 ${f.bm25}, vector ${f.vec}), has the best weighted sum.`
                : f.partV >= f.partB
                  ? `RSF follows the scores: with BM25 weighted ${Math.round(wVal * 100)}%, "${f.title}" wins mostly on its vector score (${f.vec}), though it is only ${place(f.rB)} in BM25.`
                  : `RSF follows the scores: with BM25 weighted ${Math.round(wVal * 100)}%, "${f.title}" wins mostly on its BM25 score (${f.bm25}), though it is only ${place(f.rV)} in vectors.`;
          return `${rrfWhy} ${rsfWhy}`;
        })();
      readout(document.getElementById("ro-hybrid"), [["RRF k", kVal], ["RSF BM25 weight", `${Math.round(wVal * 100)}%`]], why, same ? "" : "warn");
    }
  }

  [slRrfK, slRsfW].forEach((sl) => sl && sl.addEventListener("input", renderHybridLab));
  document.querySelectorAll("[data-hybrid-scenario]").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("[data-hybrid-scenario]").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      hybridScenario = btn.dataset.hybridScenario;
      renderHybridLab();
    });
  });
  redrawCallbacks.push(renderHybridLab);

  /* ========================================================================
     DEMO 9.1 — Drag-and-Drop NDCG@k + DEMO 9.2 Draggable τ RAG Chart
     ======================================================================== */
  const ndcgListEl = document.getElementById("ndcg-list");
  const canvasNdcg = document.getElementById("canvas-ndcg");
  const slNdcgK = document.getElementById("sl-ndcg-k");
  const slRagTau = document.getElementById("sl-rag-tau");
  const canvasRag = document.getElementById("canvas-rag");
  const ragStatusEl = document.getElementById("rag-status");

  let ndcgGainMode = "exp";
  let ndcgItems = [
    { id: "d1", title: "Fixing ECONNRESET in HTTP Clients", rel: 3 },
    { id: "d2", title: "HTTP Keep-Alive & Connection Pools", rel: 2 },
    { id: "d3", title: "Retry & Backoff Patterns", rel: 2 },
    { id: "d6", title: "Request Timeout Configuration", rel: 1 },
    { id: "d5", title: "Keyword-Stuffed Troubleshooting FAQ", rel: 0 },
    { id: "d8", title: "Billing & Invoice FAQ", rel: 0 },
  ];
  let dragIdx = null;

  function renderNdcgLab() {
    if (!ndcgListEl || !canvasNdcg) return;
    const k = Number(slNdcgK.value);
    document.getElementById("val-ndcg-k").textContent = `@${k}`;

    const res = computeNdcg(ndcgItems, k, ndcgGainMode);
    const errVal = computeErr(ndcgItems, k, 3);
    document.getElementById("kpi-ndcg-val").textContent = res.ndcg.toFixed(3);
    const errEl = document.getElementById("kpi-err-val");
    if (errEl) errEl.textContent = errVal.toFixed(3);
    document.getElementById("kpi-dcg-val").textContent = res.dcg.toFixed(2);
    document.getElementById("kpi-idcg-val").textContent = res.idcg.toFixed(2);
    {
      const best = Math.max(...ndcgItems.map((x) => x.rel));
      const pos = ndcgItems.findIndex((x) => x.rel === best) + 1;
      const disc = 1 / Math.log2(pos + 1);
      const why = res.ndcg > 0.999
        ? "Perfect order: the best pages are on top, so DCG equals the ideal (IDCG) and NDCG is 1.000."
        : pos > k
          ? `The best page (grade ${best}) sits at #${pos}, outside the top ${k}, so it adds nothing. NDCG ${res.ndcg.toFixed(2)} = this order is worth ${Math.round(res.ndcg * 100)}% of the best possible order.`
          : `The best page (grade ${best}) sits at #${pos}, where it counts ${Math.round(disc * 100)}%. NDCG ${res.ndcg.toFixed(2)} = this order is worth ${Math.round(res.ndcg * 100)}% of the best possible order.`;
      readout(document.getElementById("ro-ndcg"), [["k", k], ["best page at", `#${pos}`], ["NDCG", res.ndcg.toFixed(3)]], why);
    }
    document.getElementById("ndcg-badge").textContent = `NDCG@${k} = ${res.ndcg.toFixed(3)} · ERR = ${errVal.toFixed(3)}`;

    ndcgListEl.innerHTML = ndcgItems
      .map((item, idx) => {
        const outside = idx >= k;
        const step = res.dcgSteps[idx];
        const contribStr = step ? `+${step.contrib.toFixed(2)}` : "past @k";
        return `
          <div class="ndcg-row ${outside ? "outside-k" : ""}" draggable="true" data-ndcg-idx="${idx}">
            <span class="drag-grip" aria-hidden="true">⋮⋮</span>
            <span class="doc-rank">#${idx + 1}</span>
            <div class="doc-info">
              <div class="doc-title">${escapeHtml(item.title)}</div>
              <div class="doc-meta">
                <span>${outside ? `outside top ${k}: adds 0` : `gain ${ndcgGainMode === "exp" ? 2 ** item.rel - 1 : item.rel} × ${(1 / Math.log2(idx + 2)).toFixed(2)} = ${step.contrib.toFixed(2)}`}</span>
              </div>
            </div>
            <span class="grade-badge grade-${item.rel}">rel ${item.rel}</span>
            <span class="move-btns">
              <button type="button" class="mini-btn" data-move="up" data-idx="${idx}" ${idx === 0 ? "disabled" : ""} aria-label="Move ${escapeHtml(item.title)} up">↑</button>
              <button type="button" class="mini-btn" data-move="down" data-idx="${idx}" ${idx === ndcgItems.length - 1 ? "disabled" : ""} aria-label="Move ${escapeHtml(item.title)} down">↓</button>
            </span>
          </div>
        `;
      })
      .join("");

    ndcgListEl.querySelectorAll("[data-move]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const i = Number(btn.dataset.idx);
        const j = btn.dataset.move === "up" ? i - 1 : i + 1;
        if (j >= 0 && j < ndcgItems.length) {
          const dir = btn.dataset.move;
          [ndcgItems[i], ndcgItems[j]] = [ndcgItems[j], ndcgItems[i]];
          renderNdcgLab();
          // keep keyboard focus on the moved row (the list was rebuilt)
          const again = ndcgListEl.querySelector(`[data-move="${dir}"][data-idx="${j}"]:not([disabled])`)
            || ndcgListEl.querySelector(`[data-move="${dir === "up" ? "down" : "up"}"][data-idx="${j}"]`);
          if (again) again.focus();
          const live = document.getElementById("ndcg-move-live");
          if (live) live.textContent = `${ndcgItems[j].title} moved to #${j + 1}`;
        }
      });
    });

    ndcgListEl.querySelectorAll(".ndcg-row").forEach((row) => {
      row.addEventListener("dragstart", () => { dragIdx = Number(row.dataset.ndcgIdx); });
      row.addEventListener("dragover", (e) => { e.preventDefault(); row.classList.add("drag-over"); });
      row.addEventListener("dragleave", () => row.classList.remove("drag-over"));
      row.addEventListener("drop", (e) => {
        e.preventDefault();
        row.classList.remove("drag-over");
        const dropIdx = Number(row.dataset.ndcgIdx);
        if (dragIdx !== null && dragIdx !== dropIdx) {
          const [moved] = ndcgItems.splice(dragIdx, 1);
          ndcgItems.splice(dropIdx, 0, moved);
          dragIdx = null;
          renderNdcgLab();
        }
      });
    });

    const T = getTokens();
    const { ctx, w, h } = prepCanvas(canvasNdcg);
    ctx.clearRect(0, 0, w, h);

    const pad = { left: 42, right: 20, top: 26, bottom: 36 };
    const plotW = w - pad.left - pad.right;
    const plotH = h - pad.top - pad.bottom;
    const maxY = Math.max(1, res.idcg * 1.15);

    ctx.strokeStyle = T.line;
    ctx.fillStyle = T.muted;
    ctx.font = `11.5px ${T.mono}`;
    ctx.textAlign = "right";
    for (let i = 0; i <= 4; i++) {
      const v = (maxY * i) / 4;
      const y = pad.top + plotH - (v / maxY) * plotH;
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(w - pad.right, y);
      ctx.stroke();
      ctx.fillText(v.toFixed(1), pad.left - 6, y + 3);
    }

    const toX = (rank) => pad.left + ((rank - 1) / Math.max(1, k - 1)) * plotW;
    const toY = (val) => pad.top + plotH - (val / maxY) * plotH;

    ctx.save();
    ctx.setLineDash([5, 4]);
    ctx.strokeStyle = T.amber;
    ctx.lineWidth = 2;
    ctx.beginPath();
    res.idcgSteps.forEach((v, i) => {
      const x = k === 1 ? pad.left + plotW / 2 : toX(i + 1);
      const y = toY(v);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.restore();

    ctx.strokeStyle = T.brand;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    res.dcgSteps.forEach((s, i) => {
      const x = k === 1 ? pad.left + plotW / 2 : toX(s.rank);
      const y = toY(s.cumDcg);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    res.dcgSteps.forEach((s) => {
      const x = k === 1 ? pad.left + plotW / 2 : toX(s.rank);
      const y = toY(s.cumDcg);
      ctx.beginPath();
      ctx.arc(x, y, 4.5, 0, Math.PI * 2);
      ctx.fillStyle = T.brand;
      ctx.fill();

      ctx.fillStyle = T.muted;
      ctx.textAlign = "center";
      ctx.fillText(`#${s.rank}`, x, pad.top + plotH + 16);
    });

    ckLegend(ctx, T, { left: pad.left, right: pad.left + plotW, top: pad.top, bottom: pad.top + plotH }, [
      { label: `ideal IDCG@${k} ${res.idcg.toFixed(2)}`, color: T.amber, kind: "dash" },
      { label: `actual DCG@${k} ${res.dcg.toFixed(2)}`, color: T.brand, kind: "line" },
    ], null, "tl");

    ctx.fillStyle = T.muted;
    ctx.textAlign = "center";
    ctx.fillText("Result Rank Position", pad.left + plotW / 2, h - 4);
  }

  // DEMO 9.2: Visual RAG Chunk Similarity Bars + Draggable τ Cutoff Line
  const RAG_CHUNKS = [
    { id: "d1", label: "d1: ECONNRESET", sim: 0.86 },
    { id: "d2", label: "d2: Keep-Alive", sim: 0.74 },
    { id: "d3", label: "d3: Retry", sim: 0.61 },
    { id: "d6", label: "d6: Timeout", sim: 0.44 },
    { id: "d8", label: "d8: Billing", sim: 0.19 },
  ];
  let draggingTau = false;

  function renderRagGate() {
    if (!slRagTau || !ragStatusEl || !canvasRag) return;
    const tau = Number(slRagTau.value);
    document.getElementById("val-rag-tau").textContent = tau.toFixed(2);

    const passed = RAG_CHUNKS.filter((c) => c.sim >= tau);
    const abstain = passed.length === 0;
    ragStatusEl.className = `rag-status ${abstain ? "abstain" : ""}`;
    if (abstain) {
      ragStatusEl.innerHTML = `<strong>ABSTAIN (0 chunks ≥ τ ${tau.toFixed(2)}):</strong> No retrieved passage clears the cutoff. Return "not covered in the docs" instead of letting the LLM guess.`;
    } else {
      const cites = passed.map((c) => `[${c.id}]`).join(" ");
      ragStatusEl.innerHTML = `<strong>GROUNDED ANSWER (${passed.length} chunks ≥ τ ${tau.toFixed(2)}):</strong> Prompt receives ${cites}. The answer may use only these passages and must cite them.`;
    }

    const T = getTokens();
    const { ctx, w, h } = prepCanvas(canvasRag);
    ctx.clearRect(0, 0, w, h);

    const pad = { left: 38, right: 16, top: 22, bottom: 32 };
    const plotW = w - pad.left - pad.right;
    const plotH = h - pad.top - pad.bottom;

    ctx.strokeStyle = T.line;
    ctx.fillStyle = T.muted;
    ctx.font = `11px ${T.mono}`;
    ctx.textAlign = "right";
    for (let v = 0; v <= 1.001; v += 0.25) {
      const y = pad.top + plotH - v * plotH;
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(w - pad.right, y);
      ctx.stroke();
      ctx.fillText(v.toFixed(2), pad.left - 6, y + 3);
    }

    const colW = plotW / RAG_CHUNKS.length;
    const barW = Math.min(44, colW * 0.56);
    RAG_CHUNKS.forEach((c, i) => {
      const cx = pad.left + i * colW + colW / 2;
      const bh = c.sim * plotH;
      const ok = c.sim >= tau;
      ctx.fillStyle = ok ? T.brand : T.lineStrong;
      ctx.fillRect(cx - barW / 2, pad.top + plotH - bh, barW, bh);

      ctx.fillStyle = ok ? T.brand : T.muted;
      ctx.font = `600 11.5px ${T.mono}`;
      ctx.textAlign = "center";
      ctx.fillText(c.sim.toFixed(2), cx, pad.top + plotH - bh - 6);

      ctx.fillStyle = T.muted;
      ctx.font = `11px ${T.mono}`;
      ctx.fillText(c.id, cx, pad.top + plotH + 16);
    });

    // Draggable horizontal τ threshold line
    const yTau = pad.top + plotH - tau * plotH;
    ctx.save();
    ctx.setLineDash([5, 4]);
    ctx.strokeStyle = abstain ? T.coral : T.amber;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(pad.left, yTau);
    ctx.lineTo(w - pad.right, yTau);
    ctx.stroke();
    ctx.restore();

    // τ label as a chip with its own background, so it stays readable over bar values
    const tauTxt = `↕ τ = ${tau.toFixed(2)}`;
    ctx.font = `700 11.5px ${T.mono}`;
    const tauW = ctx.measureText(tauTxt).width + 10;
    const tauY = Math.max(4, yTau - 20);
    ctx.fillStyle = T.bg;
    ctx.fillRect(w - pad.right - tauW - 2, tauY, tauW, 16);
    ctx.strokeStyle = abstain ? T.coral : T.amber;
    ctx.lineWidth = 1;
    ctx.strokeRect(w - pad.right - tauW - 1.5, tauY + 0.5, tauW - 1, 15);
    ctx.fillStyle = abstain ? T.coral : T.amber;
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.fillText(tauTxt, w - pad.right - 7, tauY + 8.5);
    ctx.textBaseline = "alphabetic";
  }

  function updateTauFromPointer(e) {
    const rect = canvasRag.getBoundingClientRect();
    const padTop = 22;
    const plotH = Math.max(1, rect.height - 54);
    const val = Math.max(0.15, Math.min(0.95, 1 - (e.clientY - rect.top - padTop) / plotH));
    slRagTau.value = val.toFixed(2);
    renderRagGate();
  }

  if (canvasRag) {
    canvasRag.addEventListener("pointerdown", (e) => {
      draggingTau = true;
      canvasRag.setPointerCapture(e.pointerId);
      updateTauFromPointer(e);
    });
    canvasRag.addEventListener("pointermove", (e) => {
      if (!draggingTau) return;
      updateTauFromPointer(e);
    });
    canvasRag.addEventListener("pointerup", () => { draggingTau = false; });
    canvasRag.addEventListener("keydown", (e) => {
      const cur = Number(slRagTau.value);
      if (e.key === "ArrowUp") slRagTau.value = Math.min(0.95, cur + 0.05).toFixed(2);
      else if (e.key === "ArrowDown") slRagTau.value = Math.max(0.15, cur - 0.05).toFixed(2);
      else return;
      e.preventDefault();
      renderRagGate();
    });
  }

  if (slNdcgK) slNdcgK.addEventListener("input", renderNdcgLab);
  if (slRagTau) slRagTau.addEventListener("input", renderRagGate);
  document.querySelectorAll("[data-gain-mode]").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("[data-gain-mode]").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      ndcgGainMode = btn.dataset.gainMode;
      renderNdcgLab();
    });
  });
  document.querySelectorAll("[data-ndcg-preset]").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("[data-ndcg-preset]").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      const kind = btn.dataset.ndcgPreset;
      if (kind === "ideal") {
        ndcgItems.sort((a, b) => b.rel - a.rel);
      } else if (kind === "buried") {
        ndcgItems.sort((a, b) => b.rel - a.rel);
        const best = ndcgItems.shift();
        ndcgItems.splice(4, 0, best);
      } else {
        ndcgItems.sort((a, b) => a.rel - b.rel);
      }
      renderNdcgLab();
    });
  });

  redrawCallbacks.push(renderNdcgLab);
  redrawCallbacks.push(renderRagGate);
}
