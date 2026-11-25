import {
  DOCS_CORPUS,
  analyzeText,
  buildInvertedIndex,
  bm25Idf,
  bm25TfNorm,
  scoreDocBM25,
  scoreDocTFIDF,
} from "./data.js";
import { initAdvancedLabs } from "./app-advanced.js";
import { initExtraLabs } from "./app-extra.js";
import { initModernLabs } from "./app-modern.js";
import { initGapLabs, initGapCanvasLabs } from "./app-gaps.js";
import { initRebuiltLabs } from "./app-rebuilt.js";
import { initQuantLabs } from "./app-quant.js";
import { init3dLabs } from "./app-3d.js";
import { initGraphLab } from "./app-graph.js";
import { initPrimerLabs } from "./app-primer.js";
import { readout } from "./chart-kit.js";

/* ==========================================================================
   Helpers: Theme-aware CSS token reader + HiDPI Canvas setup
   ========================================================================== */
function getTokens() {
  const cs = getComputedStyle(document.documentElement);
  const v = (name) => cs.getPropertyValue(name).trim();
  return {
    bg: v("--bg-deep") || "#090909",
    card: v("--card") || "#0b0b0b",
    fg: v("--fg") || "#ededed",
    reading: v("--reading") || "#d4d4d4",
    muted: v("--muted") || "#9a9a9a",
    line: v("--line") || "#242424",
    lineStrong: v("--line-strong") || "#343434",
    brand: v("--sem-primary") || "#00c853",
    blue: v("--sem-secondary") || "#60a5fa",
    amber: v("--sem-amber") || "#f59e0b",
    coral: v("--sem-coral") || "#fb7185",
    mono: v("--font-mono") || "monospace",
  };
}

function prepCanvas(canvas) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const rect = canvas.getBoundingClientRect();
  const w = Math.max(200, Math.round(rect.width));
  const h = Math.max(180, Math.round(rect.height));
  if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
    canvas.width = w * dpr;
    canvas.height = h * dpr;
  }
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w, h };
}

/* ==========================================================================
   Theme Toggle, Reading Progress, & Scrollspy TOC
   ========================================================================== */
const redrawCallbacks = [];

function updateThemeLabels() {
  const isLight = document.documentElement.dataset.theme === "light";
  document.querySelectorAll("[data-theme-label]").forEach((el) => {
    el.textContent = isLight ? "DARK MODE" : "LIGHT MODE";
  });
}

document.querySelectorAll("[data-theme-toggle]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const next = document.documentElement.dataset.theme === "light" ? "dark" : "light";
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem("search-theme", next); } catch (e) {}
    updateThemeLabels();
    redrawCallbacks.forEach((fn) => fn());
  });
});
updateThemeLabels();

// Reading progress bar
const progressBar = document.getElementById("progress-bar");
function updateProgress() {
  const scrollTop = window.scrollY;
  const max = document.documentElement.scrollHeight - window.innerHeight;
  const pct = max > 0 ? Math.min(100, Math.max(0, (scrollTop / max) * 100)) : 0;
  if (progressBar) progressBar.style.width = `${pct}%`;
}
window.addEventListener("scroll", updateProgress, { passive: true });
updateProgress();

// Scrollspy for left TOC (single active item at a time)
const sections = [
  "promise", "primer", "matching", "bm25",
  "signals", "semantic-query", "clicks", "ltr",
  "dense", "hybrid", "vector-opt", "late-interaction",
  "eval", "rag", "agentic",
]
  .map((id) => document.getElementById(id))
  .filter(Boolean);
const tocLinks = new Map();
document.querySelectorAll("nav.toc a[href^='#']").forEach((a) => {
  tocLinks.set(a.getAttribute("href").slice(1), a);
});

const mobileSelect = document.getElementById("mobile-chapter-select");
if (mobileSelect) {
  mobileSelect.addEventListener("change", () => {
    const target = document.getElementById(mobileSelect.value);
    if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

function updateScrollspy() {
  const offset = 140;
  let current = sections[0]?.id;
  for (const sec of sections) {
    if (sec.getBoundingClientRect().top <= offset) {
      current = sec.id;
    }
  }
  tocLinks.forEach((a, id) => {
    a.classList.toggle("active", id === current);
  });
  if (mobileSelect && current && mobileSelect.value !== current) {
    mobileSelect.value = current;
  }
}
window.addEventListener("scroll", updateScrollspy, { passive: true });
updateScrollspy();

// Global a11y enhancer: sync aria-pressed on all pill buttons, aria-expanded on details, and # anchors on h2s
function syncAllAriaPressed() {
  document.querySelectorAll(".pill-btn").forEach((btn) => {
    btn.setAttribute("aria-pressed", btn.classList.contains("active") ? "true" : "false");
  });
}
document.addEventListener("click", (e) => {
  if (e.target && e.target.closest && e.target.closest(".pill-btn")) {
    setTimeout(syncAllAriaPressed, 0);
  }
});
document.querySelectorAll("details.deriv").forEach((det) => {
  const sum = det.querySelector("summary");
  if (!sum) return;
  const sync = () => sum.setAttribute("aria-expanded", det.open ? "true" : "false");
  det.addEventListener("toggle", sync);
  sync();
});
document.querySelectorAll("section.chapter[id] > h2").forEach((h2) => {
  const secId = h2.parentElement.id;
  const a = document.createElement("a");
  a.className = "heading-anchor";
  a.href = `#${secId}`;
  a.textContent = "#";
  a.setAttribute("aria-label", `Link to section ${h2.textContent.trim()}`);
  a.addEventListener("click", () => {
    try {
      const url = `${window.location.origin}${window.location.pathname}#${secId}`;
      navigator.clipboard?.writeText(url);
    } catch (e) {}
  });
  h2.appendChild(a);
});
syncAllAriaPressed();

// Finish the 4-corner bracket frame on every lab card (CSS ::before/::after draw the other two)
document.querySelectorAll(".lab").forEach((lab) => {
  ["tr", "bl"].forEach((pos) => {
    const i = document.createElement("i");
    i.className = `cbr ${pos}`;
    i.setAttribute("aria-hidden", "true");
    lab.appendChild(i);
  });
});

/* ==========================================================================
   DEMO 0.1 — Live Analyzer & Inverted Index
   ========================================================================== */
const INVERTED_INDEX = buildInvertedIndex(DOCS_CORPUS);
const FEATURED_TERMS = ["econnreset", "connection", "reset", "retry", "timeout", "keepalive", "pool", "error"];

const tokInput = document.getElementById("tok-input");
const tokFlow = document.getElementById("tok-flow");
const postingsBody = document.getElementById("postings-body");
const tokCountBadge = document.getElementById("tok-count-badge");
const tokHitsBadge = document.getElementById("tok-hits-badge");

function renderTokenizer() {
  const { rawParts, dropped, tokens } = analyzeText(tokInput.value);
  const tokenSet = new Set(tokens);

  tokCountBadge.textContent = `${tokens.length} index term${tokens.length === 1 ? "" : "s"}`;

  tokFlow.innerHTML = `
    <div class="token-step">
      <span class="token-step-label">1. Raw whitespace / hyphen split</span>
      <div class="token-chips">
        ${rawParts.length ? rawParts.map((w) => `<span class="t-chip">${escapeHtml(w)}</span>`).join("") : `<span class="t-chip stop">empty</span>`}
      </div>
    </div>
    <div class="token-step">
      <span class="token-step-label">2. Stop words dropped</span>
      <div class="token-chips">
        ${dropped.length ? dropped.map((w) => `<span class="t-chip stop">${escapeHtml(w)}</span>`).join("") : `<span class="t-chip" style="opacity:0.5">none</span>`}
      </div>
    </div>
    <div class="token-step">
      <span class="token-step-label">3. Normalized lookup terms</span>
      <div class="token-chips">
        ${tokens.length ? tokens.map((t) => `<span class="t-chip ${INVERTED_INDEX.has(t) ? "hit" : ""}">${escapeHtml(t)}</span>`).join("") : `<span class="t-chip stop">none</span>`}
      </div>
    </div>
  `;

  let hitCount = 0;
  postingsBody.innerHTML = FEATURED_TERMS.map((term) => {
    const postings = INVERTED_INDEX.get(term) || [];
    const isHit = tokenSet.has(term);
    if (isHit) hitCount += postings.length;
    const postingStr = postings.map((p) => `${p.docId}:${p.tf}`).join(", ");
    return `
      <tr class="${isHit ? "row-hit" : ""}">
        <td>${term}</td>
        <td>${postings.length}</td>
        <td>[${postingStr}]</td>
      </tr>
    `;
  }).join("");

  tokHitsBadge.textContent = `${hitCount} posting${hitCount === 1 ? "" : "s"} hit`;
}

tokInput.addEventListener("input", () => {
  document.querySelectorAll("[data-tok-preset]").forEach((b) => b.classList.remove("active"));
  renderTokenizer();
});

document.querySelectorAll("[data-tok-preset]").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll("[data-tok-preset]").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    tokInput.value = btn.dataset.tokPreset;
    renderTokenizer();
  });
});
renderTokenizer();

/* ==========================================================================
   DEMO 0.2 — Draggable 2D Vector Canvas (Cosine vs. Dot Product)
   ========================================================================== */
const canvasVec = document.getElementById("canvas-vec");
const canvasVecBars = document.getElementById("canvas-vec-bars");

const vecState = {
  a: { x: 2.0, y: 1.0 },
  b: { x: 6.0, y: 3.0 },
  dragging: null,
  unitNorm: false,
};

const chkVecNorm = document.getElementById("chk-vec-norm");
if (chkVecNorm) {
  chkVecNorm.addEventListener("change", () => {
    vecState.unitNorm = chkVecNorm.checked;
    renderVectors();
  });
}

const VEC_MAX = 8;

function vecToPx(vx, vy, pad, size) {
  return {
    px: pad.left + (vx / VEC_MAX) * size,
    py: pad.top + size - (vy / VEC_MAX) * size,
  };
}

function pxToVec(px, py, pad, size) {
  const vx = Math.max(0.2, Math.min(VEC_MAX, ((px - pad.left) / size) * VEC_MAX));
  const vy = Math.max(0.2, Math.min(VEC_MAX, ((pad.top + size - py) / size) * VEC_MAX));
  return { x: Math.round(vx * 4) / 4, y: Math.round(vy * 4) / 4 };
}

function getVecLayout(w, h) {
  const pad = { left: 42, top: 20, right: 20, bottom: 34 };
  const size = Math.min(w - pad.left - pad.right, h - pad.top - pad.bottom);
  pad.left = Math.round((w - size) / 2) + 8;
  return { pad, size };
}

function renderVectors() {
  const T = getTokens();
  const rawA = vecState.a;
  const rawB = vecState.b;
  const rawNormA = Math.hypot(rawA.x, rawA.y);
  const rawNormB = Math.hypot(rawB.x, rawB.y);
  const a = vecState.unitNorm ? { x: (rawA.x / rawNormA) * 5, y: (rawA.y / rawNormA) * 5 } : rawA;
  const b = vecState.unitNorm ? { x: (rawB.x / rawNormB) * 5, y: (rawB.y / rawNormB) * 5 } : rawB;

  const evalA = vecState.unitNorm ? { x: rawA.x / rawNormA, y: rawA.y / rawNormA } : rawA;
  const evalB = vecState.unitNorm ? { x: rawB.x / rawNormB, y: rawB.y / rawNormB } : rawB;
  const dot = evalA.x * evalB.x + evalA.y * evalB.y;
  const normA = Math.hypot(evalA.x, evalA.y);
  const normB = Math.hypot(evalB.x, evalB.y);
  const cos = Math.min(1, Math.max(-1, dot / (normA * normB)));
  const angleDeg = (Math.acos(cos) * 180) / Math.PI;

  // Update KPIs
  document.getElementById("kpi-cos").textContent = cos.toFixed(3);
  document.getElementById("kpi-dot").textContent = vecState.unitNorm ? dot.toFixed(3) : dot.toFixed(1);
  document.getElementById("kpi-angle").textContent = `${angleDeg.toFixed(1)}°`;
  {
    const ratio = Math.max(normA, normB) / Math.max(1e-6, Math.min(normA, normB));
    const longer = normA >= normB ? "A" : "B";
    let why;
    if (vecState.unitNorm) why = "Both arrows are cut to length 1, so the dot product and cosine are the same number. Only the angle matters now.";
    else if (angleDeg < 4 && ratio > 1.4) why = `Same direction, so cosine is 1.00. But ${longer} is ${ratio.toFixed(1)}× longer, so the dot product is ${ratio.toFixed(1)}× what it would be at equal length. Cosine ignores length, dot product rewards it.`;
    else if (angleDeg < 4) why = "Same direction and similar length: both measures say these two are a match.";
    else if (angleDeg > 89.5) why = "90° apart: the documents share no words, so cosine and the dot product are both 0.";
    else if (angleDeg > 75) why = `About ${Math.round(angleDeg)}° apart: the documents share almost no words, so both measures drop toward 0.`;
    else why = `${Math.round(angleDeg)}° apart: they share some words in different amounts. Cosine ${cos.toFixed(2)} says "partly the same topic".`;
    readout(document.getElementById("ro-vec"), [["angle", `${angleDeg.toFixed(0)}°`], ["|A|", normA.toFixed(1)], ["|B|", normB.toFixed(1)]], why);
  }
  const verdict = vecState.unitNorm
    ? "Unit-norm: dot === cosine"
    : angleDeg < 4 ? "Identical direction" : angleDeg < 28 ? "Close topic" : angleDeg > 89.5 ? "Orthogonal" : angleDeg > 75 ? "Nearly orthogonal" : "Partial overlap";
  document.getElementById("vec-verdict-badge").textContent = verdict;

  // Left canvas: 2D geometry
  {
    const { ctx, w, h } = prepCanvas(canvasVec);
    const { pad, size } = getVecLayout(w, h);
    ctx.clearRect(0, 0, w, h);

    // Grid
    ctx.strokeStyle = T.line;
    ctx.lineWidth = 1;
    for (let i = 0; i <= VEC_MAX; i += 2) {
      const p = vecToPx(i, i, pad, size);
      ctx.beginPath();
      ctx.moveTo(p.px, pad.top);
      ctx.lineTo(p.px, pad.top + size);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(pad.left, p.py);
      ctx.lineTo(pad.left + size, p.py);
      ctx.stroke();
    }

    // Axes
    const origin = vecToPx(0, 0, pad, size);
    ctx.strokeStyle = T.lineStrong;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(origin.px, pad.top);
    ctx.lineTo(origin.px, origin.py);
    ctx.lineTo(pad.left + size, origin.py);
    ctx.stroke();

    // Unit circle guide when normalized
    if (vecState.unitNorm) {
      const rUnit = (5 / VEC_MAX) * size;
      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = T.amber;
      ctx.lineWidth = 1.25;
      ctx.beginPath();
      ctx.arc(origin.px, origin.py, rUnit, -Math.PI / 2, 0);
      ctx.stroke();
      ctx.restore();
    }

    // Axis labels
    ctx.fillStyle = T.muted;
    ctx.font = `11px ${T.mono}`;
    ctx.textAlign = "center";
    ctx.fillText("apple (tf) →", pad.left + size / 2, h - 8);
    ctx.save();
    ctx.translate(14, pad.top + size / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText("juice (tf) →", 0, 0);
    ctx.restore();

    // Geometric projection shadow of Doc A onto Doc B
    const bLenSq = b.x * b.x + b.y * b.y;
    if (bLenSq > 0.001) {
      const projScalar = (a.x * b.x + a.y * b.y) / bLenSq;
      const projPt = vecToPx(b.x * projScalar, b.y * projScalar, pad, size);
      const tipA = vecToPx(a.x, a.y, pad, size);
      ctx.save();
      ctx.setLineDash([3, 3]);
      ctx.strokeStyle = T.amber;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(tipA.px, tipA.py);
      ctx.lineTo(projPt.px, projPt.py);
      ctx.stroke();
      ctx.restore();
    }

    // Dashed axis projections for Doc A (arkaung-style coordinate drops)
    {
      const tipA = vecToPx(a.x, a.y, pad, size);
      ctx.save();
      ctx.setLineDash([2, 3]);
      ctx.strokeStyle = "rgba(0,200,83,0.45)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(tipA.px, tipA.py);
      ctx.lineTo(tipA.px, origin.py);
      ctx.moveTo(tipA.px, tipA.py);
      ctx.lineTo(origin.px, tipA.py);
      ctx.stroke();
      ctx.restore();
    }

    // Angle arc
    const angA = Math.atan2(-a.y, a.x);
    const angB = Math.atan2(-b.y, b.x);
    const startA = Math.min(angA, angB);
    const endA = Math.max(angA, angB);
    if (Math.abs(endA - startA) > 0.01) {
      ctx.beginPath();
      ctx.strokeStyle = T.amber;
      ctx.lineWidth = 2;
      ctx.arc(origin.px, origin.py, Math.min(46, size * 0.22), startA, endA);
      ctx.stroke();
    }

    // Draw vector helper
    const drawVec = (vec, dispVec, color, label) => {
      const tip = vecToPx(vec.x, vec.y, pad, size);
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(origin.px, origin.py);
      ctx.lineTo(tip.px, tip.py);
      ctx.stroke();

      // Handle circle
      ctx.beginPath();
      ctx.arc(tip.px, tip.py, 7, 0, Math.PI * 2);
      ctx.fillStyle = T.bg;
      ctx.fill();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = color;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(tip.px, tip.py, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();

      // Label (clamped strictly inside canvas bounds so it never clips on desktop or mobile)
      ctx.fillStyle = color;
      ctx.font = `600 11px ${T.mono}`;
      const labelTxt = `${label} (${dispVec.x.toFixed(vecState.unitNorm ? 2 : 1)}, ${dispVec.y.toFixed(vecState.unitNorm ? 2 : 1)})`;
      const textW = ctx.measureText(labelTxt).width;
      ctx.textAlign = "left";
      const lx = Math.max(pad.left + 4, Math.min(w - textW - 8, tip.px + 10));
      const ly = Math.max(16, tip.py - 10);
      ctx.fillText(labelTxt, lx, ly);
    };

    drawVec(b, evalB, T.blue, "Doc B");
    drawVec(a, evalA, T.brand, "Doc A");
  }

  // Right canvas: Term counts & norm bars
  {
    const { ctx, w, h } = prepCanvas(canvasVecBars);
    ctx.clearRect(0, 0, w, h);

    const pad = { left: 40, right: 16, top: 24, bottom: 36 };
    const plotW = w - pad.left - pad.right;
    const plotH = h - pad.top - pad.bottom;
    const maxVal = vecState.unitNorm ? 1.2 : 10;

    // Horizontal grid
    ctx.strokeStyle = T.line;
    ctx.fillStyle = T.muted;
    ctx.font = `10.5px ${T.mono}`;
    ctx.textAlign = "right";
    const step = vecState.unitNorm ? 0.3 : 2;
    for (let v = 0; v <= maxVal + 0.001; v += step) {
      const y = pad.top + plotH - (v / maxVal) * plotH;
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(w - pad.right, y);
      ctx.stroke();
      ctx.fillText(vecState.unitNorm ? v.toFixed(1) : String(Math.round(v)), pad.left - 8, y + 3);
    }

    const groups = [
      { label: "apple", va: evalA.x, vb: evalB.x },
      { label: "juice", va: evalA.y, vb: evalB.y },
      { label: "‖length‖", va: normA, vb: normB },
    ];

    const groupW = plotW / groups.length;
    const barW = Math.min(34, groupW * 0.3);

    groups.forEach((g, idx) => {
      const cx = pad.left + idx * groupW + groupW / 2;
      const ha = (Math.min(maxVal, g.va) / maxVal) * plotH;
      const hb = (Math.min(maxVal, g.vb) / maxVal) * plotH;

      // Doc A bar
      ctx.fillStyle = T.brand;
      ctx.fillRect(cx - barW - 3, pad.top + plotH - ha, barW, ha);
      ctx.fillStyle = T.brand;
      ctx.textAlign = "center";
      ctx.font = `600 10.5px ${T.mono}`;
      ctx.fillText(g.va.toFixed(vecState.unitNorm ? 2 : 1), cx - barW / 2 - 3, pad.top + plotH - ha - 5);

      // Doc B bar
      ctx.fillStyle = T.blue;
      ctx.fillRect(cx + 3, pad.top + plotH - hb, barW, hb);
      ctx.fillText(g.vb.toFixed(vecState.unitNorm ? 2 : 1), cx + barW / 2 + 3, pad.top + plotH - hb - 5);

      // Group label
      ctx.fillStyle = T.muted;
      ctx.font = `11px ${T.mono}`;
      ctx.fillText(g.label, cx, h - 12);
    });
  }
}

function getPointerPos(canvas, evt) {
  const rect = canvas.getBoundingClientRect();
  return { x: evt.clientX - rect.left, y: evt.clientY - rect.top, w: rect.width, h: rect.height };
}

canvasVec.addEventListener("pointerdown", (e) => {
  const p = getPointerPos(canvasVec, e);
  const { pad, size } = getVecLayout(p.w, p.h);
  const pa = vecToPx(vecState.a.x, vecState.a.y, pad, size);
  const pb = vecToPx(vecState.b.x, vecState.b.y, pad, size);
  const da = Math.hypot(p.x - pa.px, p.y - pa.py);
  const db = Math.hypot(p.x - pb.px, p.y - pb.py);
  if (Math.min(da, db) < 30) {
    vecState.dragging = da <= db ? "a" : "b";
    canvasVec.setPointerCapture(e.pointerId);
    document.querySelectorAll("[data-vec-preset]").forEach((b) => b.classList.remove("active"));
  }
});

canvasVec.addEventListener("pointermove", (e) => {
  if (!vecState.dragging) return;
  const p = getPointerPos(canvasVec, e);
  const { pad, size } = getVecLayout(p.w, p.h);
  vecState[vecState.dragging] = pxToVec(p.x, p.y, pad, size);
  renderVectors();
});

canvasVec.addEventListener("pointerup", () => {
  vecState.dragging = null;
});

canvasVec.addEventListener("keydown", (e) => {
  const step = 0.5;
  const target = e.shiftKey ? vecState.b : vecState.a;
  if (e.key === "ArrowRight") target.x = Math.min(VEC_MAX, target.x + step);
  else if (e.key === "ArrowLeft") target.x = Math.max(0.25, target.x - step);
  else if (e.key === "ArrowUp") target.y = Math.min(VEC_MAX, target.y + step);
  else if (e.key === "ArrowDown") target.y = Math.max(0.25, target.y - step);
  else return;
  e.preventDefault();
  document.querySelectorAll("[data-vec-preset]").forEach((b) => b.classList.remove("active"));
  syncAllAriaPressed();
  renderVectors();
});

document.querySelectorAll("[data-vec-preset]").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll("[data-vec-preset]").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    const kind = btn.dataset.vecPreset;
    if (kind === "same-angle") {
      vecState.a = { x: 2.0, y: 1.0 };
      vecState.b = { x: 6.0, y: 3.0 };
    } else if (kind === "close") {
      vecState.a = { x: 5.5, y: 2.5 };
      vecState.b = { x: 4.5, y: 4.0 };
    } else {
      vecState.a = { x: 6.5, y: 0 };
      vecState.b = { x: 0, y: 6.5 };
    }
    renderVectors();
  });
});

redrawCallbacks.push(renderVectors);

/* ==========================================================================
   DEMO 1.1 — Matching vs. Ranking Candidate Funnel
   ========================================================================== */
const funnelQuery = document.getElementById("funnel-query");
const filterDocsOnly = document.getElementById("filter-docs-only");
const canvasFunnel = document.getElementById("canvas-funnel");
const funnelDocList = document.getElementById("funnel-doc-list");
let funnelMatchMode = "any";
const slMm = document.getElementById("sl-mm");

// Solr/Lucene-style percentage min-match: floor(n × pct), but never fewer than 1 term
function mmRequired(nTerms) {
  const pct = Number(slMm.value) / 100;
  return Math.max(1, Math.floor(nTerms * pct + 1e-9));
}

function evalFunnel() {
  const rawQuery = funnelQuery.value.trim().toLowerCase();
  const { tokens: rawTokens } = analyzeText(rawQuery);
  const tokens = [...new Set(rawTokens)];
  const requireDocs = filterDocsOnly.checked;
  const mmNeed = mmRequired(tokens.length);
  document.getElementById("val-mm").textContent = tokens.length
    ? `${slMm.value}% → ${mmNeed} of ${tokens.length}`
    : `${slMm.value}%`;

  const evaluated = DOCS_CORPUS.map((doc) => {
    const scoreObj = scoreDocBM25(doc, tokens, DOCS_CORPUS, 1.2, 0.75);
    const matchedTerms = tokens.filter((t) => (doc.tf[t] || 0) > 0);
    let textMatch = false;
    if (tokens.length > 0) {
      if (funnelMatchMode === "any") textMatch = matchedTerms.length > 0;
      else if (funnelMatchMode === "all") textMatch = matchedTerms.length === tokens.length;
      else if (funnelMatchMode === "mm") textMatch = matchedTerms.length >= mmNeed;
      else textMatch = doc.text.toLowerCase().includes(rawQuery);
    }
    const passesFilter = !requireDocs || doc.category === "docs";
    const status = !textMatch ? "missed" : !passesFilter ? "filtered" : "matched";
    return { doc, score: scoreObj.total, status, hits: matchedTerms.length };
  });

  // Sort: matched (by score desc), then filtered, then missed
  const rankOrder = { matched: 0, filtered: 1, missed: 2 };
  evaluated.sort((a, b) => {
    if (rankOrder[a.status] !== rankOrder[b.status]) return rankOrder[a.status] - rankOrder[b.status];
    return b.score - a.score;
  });

  const matched = evaluated.filter((e) => e.status === "matched");
  const filtered = evaluated.filter((e) => e.status === "filtered");
  const maxScore = Math.max(0.001, ...matched.map((e) => e.score));

  document.getElementById("kpi-funnel-total").textContent = String(DOCS_CORPUS.length);
  document.getElementById("kpi-funnel-matched").textContent = String(matched.length);
  document.getElementById("kpi-funnel-filtered").textContent = String(filtered.length);
  document.getElementById("funnel-stage-badge").textContent = `${matched.length} / ${DOCS_CORPUS.length} survive`;
  document.getElementById("funnel-top-badge").textContent = matched.length ? `#1: ${matched[0].doc.id}` : "No matches";
  {
    const n = matched.length + filtered.length; // pages that matched the text, before the filter
    const ruleTxt = {
      any: `OR lets in any page with at least one of your words: ${n} page${n === 1 ? "" : "s"}. Loose matching, and the ranking step sorts out the weak ones.`,
      all: `AND needs every word: ${n} page${n === 1 ? "" : "s"}. A page missing even one word is gone, even if it's relevant.`,
      mm: `Min match needs ${mmNeed} of ${tokens.length} words: ${n} page${n === 1 ? "" : "s"}. The middle ground between AND and OR.`,
      phrase: n === 0 ? "No page has these words in this exact order, so a strict phrase rule returns nothing. That's why phrases work better as a boost." : `Only ${n} page${n === 1 ? "" : "s"} have the exact phrase.`,
    }[funnelMatchMode];
    const filt = filtered.length ? ` The category filter then removed ${filtered.length} matching page${filtered.length === 1 ? "" : "s"} without touching any score.` : "";
    readout(document.getElementById("ro-funnel"), [["rule", funnelMatchMode === "mm" ? `mm ≥ ${mmNeed}` : funnelMatchMode.toUpperCase()], ["text matches", n], ["after filter", matched.length]], ruleTxt + filt);
  }

  // Render live doc list
  let rankNum = 0;
  funnelDocList.innerHTML = evaluated.map((item) => {
    const isMatched = item.status === "matched";
    if (isMatched) rankNum += 1;
    const isTop = isMatched && rankNum === 1;
    const pct = isMatched ? Math.round((item.score / maxScore) * 100) : 0;
    const rowCls = isTop ? "doc-row top-hit" : item.status === "filtered" ? "doc-row filtered-out" : item.status === "missed" ? "doc-row missed" : "doc-row";
    const pill = isMatched
      ? `<span class="doc-score">${item.score.toFixed(2)}</span>`
      : item.status === "filtered"
        ? `<span class="status-pill filtered">filtered</span>`
        : `<span class="status-pill missed">no match</span>`;
    return `
      <div class="${rowCls}">
        <span class="doc-rank">${isMatched ? `#${rankNum}` : "—"}</span>
        <div class="doc-info">
          <div class="doc-title">${escapeHtml(item.doc.title)}</div>
          <div class="doc-meta">
            <span>${item.doc.id}</span>
            <span>cat:${item.doc.category}</span>
            <span>${item.doc.length}w</span>
            ${tokens.length ? `<span>${item.hits}/${tokens.length} words</span>` : ""}
          </div>
          ${isMatched ? `<div class="doc-bar-track"><div class="doc-bar-fill" style="width:${pct}%"></div></div>` : ""}
        </div>
        ${pill}
      </div>
    `;
  }).join("");

  // Draw visual funnel on canvas
  const T = getTokens();
  const { ctx, w, h } = prepCanvas(canvasFunnel);
  ctx.clearRect(0, 0, w, h);

  const textMatchedCount = matched.length + filtered.length;
  const compact = w < 360;
  const modeLabel = funnelMatchMode === "mm" ? `MM ≥${mmNeed}` : funnelMatchMode.toUpperCase();
  const stages = [
    { label: compact ? "1. INDEXED" : "1. INDEXED CORPUS", sub: "All pages in index", count: DOCS_CORPUS.length, color: T.muted },
    { label: compact ? `2. MATCH (${modeLabel})` : `2. TEXT MATCH (${modeLabel})`, sub: funnelMatchMode === "all" ? "Postings intersection" : funnelMatchMode === "phrase" ? "Postings + positions" : "Postings lookup", count: textMatchedCount, color: T.blue },
    { label: compact ? (requireDocs ? "3. FILTER (docs)" : "3. FILTER (OFF)") : (requireDocs ? "3. HARD FILTER (cat=docs)" : "3. HARD FILTER (OFF)"), sub: "Cached bitset gate", count: matched.length, color: T.amber },
    { label: "4. BM25 RANKED", sub: "Continuous score order", count: matched.length, color: T.brand },
  ];

  const padY = 22;
  const stageH = (h - padY * 2) / stages.length;
  const maxBarW = w - (compact ? 16 : 44);
  const minRatio = compact ? 0.68 : 0.42;

  stages.forEach((st, i) => {
    const y = padY + i * stageH;
    const ratio = Math.max(minRatio, st.count / DOCS_CORPUS.length);
    const barW = maxBarW * ratio;
    const x = (w - barW) / 2;
    const boxH = stageH - 18;

    // Connecting trapezoid to next stage
    if (i < stages.length - 1) {
      const nextRatio = Math.max(minRatio, stages[i + 1].count / DOCS_CORPUS.length);
      const nextW = maxBarW * nextRatio;
      const nextX = (w - nextW) / 2;
      ctx.fillStyle = T.line;
      ctx.beginPath();
      ctx.moveTo(x, y + boxH);
      ctx.lineTo(x + barW, y + boxH);
      ctx.lineTo(nextX + nextW, y + stageH);
      ctx.lineTo(nextX, y + stageH);
      ctx.closePath();
      ctx.fill();
    }

    // Stage bar
    ctx.fillStyle = T.card;
    ctx.strokeStyle = st.color;
    ctx.lineWidth = 1.75;
    ctx.fillRect(x, y, barW, boxH);
    ctx.strokeRect(x, y, barW, boxH);

    // Stage text
    ctx.fillStyle = T.fg;
    ctx.font = `600 11px ${T.mono}`;
    ctx.textAlign = "center";
    ctx.fillText(`${st.label} · ${st.count}`, w / 2, y + boxH / 2 - 2);

    ctx.fillStyle = T.muted;
    ctx.font = `10px ${T.mono}`;
    ctx.fillText(st.sub, w / 2, y + boxH / 2 + 13);
  });
}

funnelQuery.addEventListener("input", evalFunnel);
filterDocsOnly.addEventListener("change", evalFunnel);
document.querySelectorAll("[data-match-mode]").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll("[data-match-mode]").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    funnelMatchMode = btn.dataset.matchMode;
    evalFunnel();
  });
});
function setFunnelMode(mode) {
  funnelMatchMode = mode;
  document.querySelectorAll("[data-match-mode]").forEach((b) => b.classList.toggle("active", b.dataset.matchMode === mode));
}
// Dragging the mm slider switches the funnel into min-match mode
slMm.addEventListener("input", () => {
  if (funnelMatchMode !== "mm") {
    setFunnelMode("mm");
    syncAllAriaPressed();
  }
  evalFunnel();
});
document.querySelectorAll("[data-funnel-query]").forEach((btn) => {
  btn.addEventListener("click", () => {
    funnelQuery.value = btn.dataset.funnelQuery;
    document.querySelectorAll("[data-funnel-query]").forEach((b) => b.classList.toggle("active", b === btn));
    evalFunnel();
  });
});
redrawCallbacks.push(evalFunnel);

/* ==========================================================================
   Utility & Initial Boot
   ========================================================================== */
function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function redrawAll() {
  redrawCallbacks.forEach((fn) => fn());
}

window.addEventListener("resize", () => {
  requestAnimationFrame(redrawAll);
});

// Initialize Part 2-4 interactive labs (§4–§9) + Ch 9, 10, 12, 14 labs
initAdvancedLabs({ getTokens, prepCanvas, redrawCallbacks });
initExtraLabs({ getTokens, prepCanvas, redrawCallbacks });
initModernLabs({ getTokens, prepCanvas, redrawCallbacks });
initGapLabs();
initRebuiltLabs({ getTokens, prepCanvas, redrawCallbacks });
initQuantLabs({ getTokens, prepCanvas, redrawCallbacks });
initPrimerLabs({ getTokens, prepCanvas, redrawCallbacks });
initGapCanvasLabs({ getTokens, prepCanvas, redrawCallbacks });
init3dLabs({ getTokens, prepCanvas, redrawCallbacks });
initGraphLab({ getTokens, prepCanvas, redrawCallbacks });
syncAllAriaPressed();

// Trigger KaTeX auto-render once deferred script loads
window.addEventListener("DOMContentLoaded", () => {
  redrawAll();
  const tryKatex = () => {
    if (window.renderMathInElement) {
      window.renderMathInElement(document.body, {
        delimiters: [
          { left: "$$", right: "$$", display: true },
          { left: "$", right: "$", display: false },
        ],
        throwOnError: false,
      });
    } else {
      setTimeout(tryKatex, 120);
    }
  };
  tryKatex();
});
