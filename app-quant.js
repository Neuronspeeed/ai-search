/* ==========================================================================
   Vector compression labs, computed live on a toy index (no made-up numbers)
   - DEMO 11.1: quantize 2,000 vectors (int8 / 4-bit / binary / PQ, MRL prefix),
                measure recall@10 against exact FP32 search, with/without rerank
   - DEMO 11.3: rotation spreads one outlier so a low-bit quantizer works
   ========================================================================== */
import { makeFrame, axes, legend, refLine, Placer, readout } from "./chart-kit.js";

/* ---------- seeded randomness ---------- */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function gaussian(rng) {
  let u = 0;
  while (u === 0) u = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
}
const dot = (a, b, n = a.length) => { let s = 0; for (let i = 0; i < n; i += 1) s += a[i] * b[i]; return s; };
const normalize = (v) => { const n = Math.sqrt(dot(v, v)) || 1; for (let i = 0; i < v.length; i += 1) v[i] /= n; return v; };

/* ---------- the toy index ---------- */
export const D = 64;
export const N = 2000;
export const NQ = 40;
export const K = 10;
export const RERANK_POOL = 50;

/** MRL-style vectors: earlier dimensions carry more of the signal (like an MRL-trained model). */
export function buildIndex(seed = 7) {
  const rng = mulberry32(seed);
  const scale = Array.from({ length: D }, (_, i) => Math.exp(-i / 28));
  const centers = Array.from({ length: 48 }, () => Float64Array.from({ length: D }, (_, i) => gaussian(rng) * scale[i]));
  const vecs = Array.from({ length: N }, () => {
    const c = centers[Math.floor(rng() * centers.length)];
    return normalize(Float64Array.from({ length: D }, (_, i) => c[i] + 0.45 * gaussian(rng) * scale[i]));
  });
  const queries = Array.from({ length: NQ }, () => {
    const base = vecs[Math.floor(rng() * N)];
    return normalize(Float64Array.from({ length: D }, (_, i) => base[i] + 0.25 * gaussian(rng) * scale[i]));
  });
  const exact = queries.map((q) => topK(vecs.map((v) => dot(q, v)), K));
  return { vecs, queries, exact, rng };
}

function topK(scores, k) {
  const idx = Array.from(scores.keys());
  idx.sort((a, b) => scores[b] - scores[a]);
  return idx.slice(0, k);
}

/* ---------- quantizers: each returns a reconstruction (what the first pass "sees") ---------- */
function scalarQuant(vecs, bits) {
  const levels = 2 ** bits - 1;
  const lo = new Float64Array(D).fill(Infinity);
  const hi = new Float64Array(D).fill(-Infinity);
  vecs.forEach((v) => { for (let i = 0; i < D; i += 1) { lo[i] = Math.min(lo[i], v[i]); hi[i] = Math.max(hi[i], v[i]); } });
  return vecs.map((v) => Float64Array.from(v, (x, i) => {
    const step = (hi[i] - lo[i]) / levels || 1;
    return lo[i] + Math.round((x - lo[i]) / step) * step;
  }));
}

function binaryQuant(vecs) {
  // naive 1-bit: sign of each value, scaled by that dimension's average size
  const meanAbs = new Float64Array(D);
  vecs.forEach((v) => { for (let i = 0; i < D; i += 1) meanAbs[i] += Math.abs(v[i]) / vecs.length; });
  return vecs.map((v) => Float64Array.from(v, (x, i) => (x >= 0 ? 1 : -1) * meanAbs[i]));
}

export const PQ_M = 8; // 8 sub-vectors of 8 dims
export const PQ_K = 16; // 16 centroids each → 4 bits per sub-vector → 32 bits per vector = 0.5 bit per dimension

function pqQuant(vecs, rng) {
  const sub = D / PQ_M;
  const out = vecs.map(() => new Float64Array(D));
  for (let m = 0; m < PQ_M; m += 1) {
    const off = m * sub;
    const pts = vecs.map((v) => v.slice(off, off + sub));
    let cents = Array.from({ length: PQ_K }, () => pts[Math.floor(rng() * pts.length)].slice());
    const assign = new Int32Array(pts.length);
    for (let it = 0; it < 10; it += 1) {
      pts.forEach((p, j) => {
        let best = 0; let bd = Infinity;
        cents.forEach((c, ci) => { let d2 = 0; for (let t = 0; t < sub; t += 1) d2 += (p[t] - c[t]) ** 2; if (d2 < bd) { bd = d2; best = ci; } });
        assign[j] = best;
      });
      const sums = cents.map(() => new Float64Array(sub));
      const cnt = new Int32Array(PQ_K);
      pts.forEach((p, j) => { cnt[assign[j]] += 1; for (let t = 0; t < sub; t += 1) sums[assign[j]][t] += p[t]; });
      cents = cents.map((c, ci) => (cnt[ci] ? sums[ci].map((x) => x / cnt[ci]) : c));
    }
    pts.forEach((p, j) => { const c = cents[assign[j]]; for (let t = 0; t < sub; t += 1) out[j][off + t] = c[t]; });
  }
  return out;
}

export const FORMATS = {
  fp32: { label: "FP32", bitsPerDim: 32 },
  int8: { label: "Int8", bitsPerDim: 8 },
  int4: { label: "4-bit", bitsPerDim: 4 },
  binary: { label: "Binary", bitsPerDim: 1 },
  pq: { label: "PQ", bitsPerDim: (PQ_M * Math.log2(PQ_K)) / D },
};

export function buildStores(index) {
  return {
    fp32: index.vecs,
    int8: scalarQuant(index.vecs, 8),
    int4: scalarQuant(index.vecs, 4),
    binary: binaryQuant(index.vecs),
    pq: pqQuant(index.vecs, mulberry32(11)),
  };
}

/** Recall@10 vs exact FP32 search. First pass on `prefix` dims of the stored vectors; optional rerank with full FP32. */
export function measure(index, store, prefix, rerank) {
  let hits = 0;
  index.queries.forEach((q, qi) => {
    // a truncated MRL prefix is re-normalized before cosine search, as real MRL use does
    const first = store.map((v) => (prefix < v.length ? dot(q, v, prefix) / (Math.sqrt(dot(v, v, prefix)) || 1) : dot(q, v, prefix)));
    let found;
    if (rerank) {
      const pool = topK(first, RERANK_POOL);
      found = pool.map((i) => [i, dot(q, index.vecs[i])]).sort((a, b) => b[1] - a[1]).slice(0, K).map((x) => x[0]);
    } else {
      found = topK(first, K);
    }
    const truth = new Set(index.exact[qi]);
    found.forEach((i) => { if (truth.has(i)) hits += 1; });
  });
  return hits / (index.queries.length * K);
}

/** Memory for 1M vectors of 1,536 dims, keeping `prefix/D` of the dimensions. */
export function memoryMB(fmt, prefix) {
  return ((1_000_000 * 1536 * (prefix / D) * FORMATS[fmt].bitsPerDim) / 8) / (1024 * 1024);
}

/* ---------- DEMO 11.3: rotation ---------- */
export const RD = 32;

export function makeSpikeVector(rng) {
  // a "normal" embedding with one outlier dimension
  const v = Float64Array.from({ length: RD }, () => gaussian(rng) * 0.12);
  v[5] = 1.6;
  return v;
}

/** Random orthogonal matrix via Gram–Schmidt on a Gaussian matrix. */
export function randomRotation(rng, n = RD) {
  const rows = [];
  while (rows.length < n) {
    const v = Float64Array.from({ length: n }, () => gaussian(rng));
    rows.forEach((r) => { const p = dot(v, r); for (let i = 0; i < n; i += 1) v[i] -= p * r[i]; });
    const norm = Math.sqrt(dot(v, v));
    if (norm > 1e-6) { for (let i = 0; i < n; i += 1) v[i] /= norm; rows.push(v); }
  }
  return rows;
}
const matVec = (M, v) => Float64Array.from(M, (row) => dot(row, v));
const matTVec = (M, v) => { const out = new Float64Array(v.length); M.forEach((row, i) => { for (let j = 0; j < v.length; j += 1) out[j] += row[j] * v[i]; }); return out; };

/** Quantize with one shared scale set by the largest |value| (the outlier problem). */
export function uniformQuant(v, bits) {
  const levels = 2 ** (bits - 1) - 0.5; // symmetric levels around 0
  const maxAbs = Math.max(...Array.from(v, Math.abs)) || 1;
  const step = maxAbs / levels;
  return Float64Array.from(v, (x) => Math.max(-maxAbs, Math.min(maxAbs, (Math.floor(x / step) + 0.5) * step)));
}

export function rotationRun(v, R, bits) {
  const plainQ = uniformQuant(v, bits);
  const rotated = matVec(R, v);
  const rotQ = uniformQuant(rotated, bits);
  const back = matTVec(R, rotQ); // rotate back to compare in the original space
  const mse = (a, b) => a.reduce((s, x, i) => s + (x - b[i]) ** 2, 0) / a.length;
  const maxAbs = (a) => Math.max(...Array.from(a, Math.abs));
  const len = (a) => Math.sqrt(dot(a, a));
  return {
    v, plainQ, rotated, rotQ, back,
    mseBefore: mse(v, plainQ), mseAfter: mse(v, back),
    maxBefore: maxAbs(v), maxAfter: maxAbs(rotated),
    lenBefore: len(v), lenAfter: len(rotated),
  };
}

/* ==========================================================================
   DOM wiring
   ========================================================================== */
export function initQuantLabs({ getTokens, prepCanvas, redrawCallbacks }) {
  initCompressLab(getTokens, prepCanvas, redrawCallbacks);
  initRotationLab(getTokens, prepCanvas, redrawCallbacks);
  initPqLab(getTokens, prepCanvas, redrawCallbacks);
}

const PREFIXES = [16, 32, 48, 64];
const fmtMB = (mb) => (mb >= 100 ? Math.round(mb).toLocaleString() : mb >= 10 ? mb.toFixed(0) : mb.toFixed(1));

function initCompressLab(getTokens, prepCanvas, redrawCallbacks) {
  const cVec = document.getElementById("canvas-quant-vec");
  const cPareto = document.getElementById("canvas-mrl");
  if (!cVec || !cPareto) return;
  const slPrefix = document.getElementById("sl-mrl-dim");
  const chkRerank = document.getElementById("chk-mrl-rescore");
  let fmt = "int8";
  let index = null;
  let stores = null;
  const cache = new Map();
  const recall = (f, prefix, rr) => {
    const key = `${f}|${prefix}|${rr}`;
    if (!cache.has(key)) cache.set(key, measure(index, stores[f], prefix, rr));
    return cache.get(key);
  };

  function ensure() {
    if (index) return;
    index = buildIndex();
    stores = buildStores(index);
  }

  function render() {
    ensure();
    const T = getTokens();
    const prefix = PREFIXES[Number(slPrefix.value)] || 64;
    const rr = chkRerank.checked;
    document.getElementById("val-mrl-dim").textContent = `${prefix} of ${D} dims`;

    // ---- plot A: one vector, stored vs original (first 32 dims)
    {
      const { ctx, w, h } = prepCanvas(cVec);
      ctx.clearRect(0, 0, w, h);
      const show = 32;
      const v = index.vecs[3];
      const s = stores[fmt][3];
      const lim = Math.max(...Array.from(v.slice(0, show), Math.abs)) * 1.15;
      const f = makeFrame(w, h, { l: 40, r: 10, t: 12, b: 32 }, { x0: 0, x1: show, y0: -lim, y1: lim });
      const P = new Placer(f);
      axes(ctx, T, f, { xTicks: [0, 8, 16, 24, 32], yCount: 4, yFmt: (y) => y.toFixed(2), xTitle: "dimension" });
      const bw = f.plotW / show;
      for (let i = 0; i < show; i += 1) {
        const cut = i >= prefix;
        const x = f.left + i * bw;
        ctx.globalAlpha = cut ? 0.25 : 1;
        ctx.fillStyle = T.blue;
        ctx.fillRect(x + bw * 0.12, Math.min(f.y(0), f.y(v[i])), bw * 0.36, Math.abs(f.y(v[i]) - f.y(0)));
        ctx.fillStyle = T.amber;
        ctx.fillRect(x + bw * 0.52, Math.min(f.y(0), f.y(s[i])), bw * 0.36, Math.abs(f.y(s[i]) - f.y(0)));
        ctx.globalAlpha = 1;
      }
      if (prefix < show) refLine(ctx, T, f, { x: prefix, label: "MRL cut", color: T.coral }, P);
      legend(ctx, T, f, [
        { label: "original FP32", color: T.blue, kind: "bar" },
        { label: `stored as ${FORMATS[fmt].label}`, color: T.amber, kind: "bar" },
      ], P, "tr");
    }

    // ---- plot B: recall vs memory for every format (live)
    {
      const { ctx, w, h } = prepCanvas(cPareto);
      ctx.clearRect(0, 0, w, h);
      const lx = (mb) => Math.log10(mb);
      const f = makeFrame(w, h, { l: 44, r: 14, t: 12, b: 34 }, { x0: lx(15), x1: lx(9000), y0: 0, y1: 1.08 });
      const P = new Placer(f);
      axes(ctx, T, f, {
        xTicks: [lx(30), lx(100), lx(300), lx(1000), lx(3000)],
        xGrid: true,
        xFmt: (v) => `${Math.round(10 ** v).toLocaleString()}`,
        yTicks: [0, 0.25, 0.5, 0.75, 1], yFmt: (v) => `${Math.round(v * 100)}%`,
        xTitle: "MB for 1M × 1,536-dim vectors (log)",
      });
      Object.keys(FORMATS).forEach((k) => {
        const mb = memoryMB(k, prefix);
        const r0 = recall(k, prefix, false);
        const r1 = recall(k, prefix, true);
        const X = f.x(lx(mb));
        const active = k === fmt;
        ctx.strokeStyle = active ? T.brand : T.lineStrong;
        ctx.lineWidth = 1.25;
        ctx.setLineDash([3, 3]);
        ctx.beginPath(); ctx.moveTo(X, f.y(r0)); ctx.lineTo(X, f.y(r1)); ctx.stroke();
        ctx.setLineDash([]);
        ctx.beginPath(); ctx.arc(X, f.y(r0), 4, 0, Math.PI * 2);
        ctx.strokeStyle = active ? T.coral : T.muted; ctx.lineWidth = 1.5; ctx.stroke();
        ctx.beginPath(); ctx.arc(X, f.y(r1), 4, 0, Math.PI * 2);
        ctx.fillStyle = active ? T.brand : T.muted; ctx.fill();
        ctx.fillStyle = active ? T.fg : T.muted;
        ctx.font = `${active ? "600 " : ""}11px ${T.mono}`;
        ctx.textBaseline = "middle";
        const nearRight = X > f.right - 50;
        ctx.textAlign = nearRight ? "right" : "left";
        ctx.fillText(FORMATS[k].label, nearRight ? X - 8 : X + 8, f.y(r1));
      });
      legend(ctx, T, f, [
        { label: "first pass (compressed)", color: T.coral, kind: "dot" },
        { label: `after rerank (top ${RERANK_POOL} → FP32)`, color: T.brand, kind: "dot" },
      ], P, "bl");
    }

    // ---- tiles
    const mb = memoryMB(fmt, prefix);
    const full = memoryMB("fp32", D);
    const r0 = recall(fmt, prefix, false);
    const r1 = recall(fmt, prefix, true);
    document.getElementById("kpi-mrl-mem").innerHTML = `<span class="was">${fmtMB(full)}</span><span class="arrow">→</span>${fmtMB(mb)} MB`;
    document.getElementById("kpi-mrl-comp").textContent = `${(full / mb).toFixed(full / mb < 10 ? 1 : 0)}× smaller`;
    document.getElementById("kpi-mrl-recall").innerHTML = rr
      ? `<span class="was">${Math.round(r0 * 100)}%</span><span class="arrow">→</span>${Math.round(r1 * 100)}%`
      : `${Math.round(r0 * 100)}%`;
    document.getElementById("kpi-mrl-recall-sub").textContent = rr ? "First pass → after rerank" : "First pass only (no rerank)";
    {
      const bits = FORMATS[fmt].bitsPerDim;
      const what = fmt === "fp32" ? "full 32-bit floats" : fmt === "pq" ? "one codebook ID per 8 numbers (½ bit each)" : `${bits} bit${bits === 1 ? "" : "s"} per number`;
      const mrlTxt = prefix < D ? ` MRL keeps only the first ${prefix} of ${D} dims.` : "";
      const rrTxt = rr
        ? (r1 - r0 > 0.15 ? ` Reranking the top ${RERANK_POOL} with full vectors from disk wins back ${r1 - r0 >= 0.5 * (1 - r0) ? "most" : "part"} of the loss (${Math.round(r0 * 100)}% → ${Math.round(r1 * 100)}%).` : ` Reranking adds little here: the first pass is already good.`)
        : " Turn on reranking to see how much a second pass with full vectors recovers.";
      readout(document.getElementById("ro-mrl"), [["stored as", FORMATS[fmt].label], ["memory", `${(full / mb).toFixed(full / mb < 10 ? 1 : 0)}× smaller`], ["first pass", `${Math.round(r0 * 100)}%`]],
        `Each vector is stored as ${what}.${mrlTxt} The fast first pass still finds ${Math.round(r0 * 100)}% of the exact top-10.${rrTxt}`, r0 < 0.6 && !rr ? "warn" : "");
    }
  }

  slPrefix.addEventListener("input", render);
  chkRerank.addEventListener("change", render);
  document.querySelectorAll("[data-quant]").forEach((btn) => btn.addEventListener("click", () => {
    document.querySelectorAll("[data-quant]").forEach((b) => b.classList.toggle("active", b === btn));
    fmt = btn.dataset.quant;
    render();
  }));
  redrawCallbacks.push(render);
}

function initRotationLab(getTokens, prepCanvas, redrawCallbacks) {
  const cBefore = document.getElementById("canvas-rot-before");
  const cAfter = document.getElementById("canvas-rot-after");
  if (!cBefore || !cAfter) return;
  const slBits = document.getElementById("sl-rot-bits");
  const rng = mulberry32(21);
  const v = makeSpikeVector(rng);
  let R = randomRotation(rng);

  function bars(canvas, values, quant, color, T, title, lim) {
    const { ctx, w, h } = prepCanvas(canvas);
    ctx.clearRect(0, 0, w, h);
    const f = makeFrame(w, h, { l: 40, r: 10, t: 12, b: 30 }, { x0: 0, x1: RD, y0: -lim, y1: lim });
    const P = new Placer(f);
    axes(ctx, T, f, { xTicks: [0, 8, 16, 24, 32], yCount: 4, yFmt: (y) => y.toFixed(1), xTitle: title });
    const bw = f.plotW / RD;
    for (let i = 0; i < RD; i += 1) {
      const x = f.left + i * bw;
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.85;
      ctx.fillRect(x + bw * 0.15, Math.min(f.y(0), f.y(values[i])), bw * 0.7, Math.max(1, Math.abs(f.y(values[i]) - f.y(0))));
      ctx.globalAlpha = 1;
      // quantized level as a tick
      ctx.strokeStyle = T.amber;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x + bw * 0.05, f.y(quant[i])); ctx.lineTo(x + bw * 0.95, f.y(quant[i])); ctx.stroke();
    }
    const maxAbs = Math.max(...Array.from(values, Math.abs));
    refLine(ctx, T, f, { y: maxAbs, label: `max |x| = ${maxAbs.toFixed(2)}`, color: T.coral }, P);
    return { f, P };
  }

  function render() {
    const T = getTokens();
    const bits = Number(slBits.value);
    document.getElementById("val-rot-bits").textContent = `${bits} bits`;
    const r = rotationRun(v, R, bits);
    const lim = Math.max(r.maxBefore, r.maxAfter) * 1.12;
    bars(cBefore, r.v, r.plainQ, T.blue, T, "before: coordinates of x", lim);
    bars(cAfter, r.rotated, r.rotQ, T.brand, T, "after: coordinates of Rx", lim);
    document.getElementById("kpi-rot-max").innerHTML = `<span class="was">${r.maxBefore.toFixed(2)}</span><span class="arrow">→</span>${r.maxAfter.toFixed(2)}`;
    document.getElementById("kpi-rot-len").innerHTML = `<span class="was">${r.lenBefore.toFixed(3)}</span><span class="arrow">→</span>${r.lenAfter.toFixed(3)}`;
    document.getElementById("kpi-rot-err").innerHTML = `<span class="was">${r.mseBefore.toExponential(1)}</span><span class="arrow">→</span>${r.mseAfter.toExponential(1)}`;
    const ratio = r.mseBefore / Math.max(1e-12, r.mseAfter);
    const spikeAt = Array.from(r.v, Math.abs).indexOf(r.maxBefore);
    const smallLevels = new Set(Array.from(r.plainQ).filter((_, i) => i !== spikeAt).map((x) => x.toFixed(6))).size;
    document.getElementById("kpi-rot-err-sub").textContent = ratio >= 1 ? `${ratio.toFixed(1)}× less error after rotating` : "Rotation didn't help this draw";
    readout(document.getElementById("ro-rot"), [["bits", bits], ["levels", 2 ** bits], ["max |x|", `${r.maxBefore.toFixed(2)} → ${r.maxAfter.toFixed(2)}`]],
      `Before rotating, the outlier (${r.maxBefore.toFixed(2)}) sets the scale, so ${2 ** bits} levels are spread far apart and the other ${RD - 1} values share just ${smallLevels} of them. After rotating, the biggest value is ${r.maxAfter.toFixed(2)}, the levels sit ${(r.maxBefore / r.maxAfter).toFixed(1)}× closer together, and the error ${ratio >= 1 ? `falls ${ratio.toFixed(1)}×` : "does not fall on this draw"}. Rotation itself loses nothing: the length didn't change.`);
  }

  slBits.addEventListener("input", render);
  document.getElementById("btn-rot-redraw").addEventListener("click", () => { R = randomRotation(rng); render(); });
  redrawCallbacks.push(render);
}

/* ---------- DEMO 11.0: build a PQ code ---------- */
export const PQD = 16;
export const PQM = 4;
const PQSUB = PQD / PQM;

export function pqToyData(seed = 5) {
  const rng = mulberry32(seed);
  const centers = Array.from({ length: 12 }, () => Float64Array.from({ length: PQD }, () => gaussian(rng) * 0.6));
  const draw = () => { const c = centers[Math.floor(rng() * centers.length)]; return Float64Array.from({ length: PQD }, (_, i) => c[i] + gaussian(rng) * 0.35); };
  return { train: Array.from({ length: 2000 }, draw), test: Array.from({ length: 30 }, draw) };
}

export function pqTrain(train, K, seed = 9) {
  const rng = mulberry32(seed + K);
  const books = [];
  for (let m = 0; m < PQM; m += 1) {
    const off = m * PQSUB;
    const pts = train.map((v) => v.slice(off, off + PQSUB));
    let cents = Array.from({ length: K }, () => pts[Math.floor(rng() * pts.length)].slice());
    const assign = new Int32Array(pts.length);
    for (let it = 0; it < 12; it += 1) {
      pts.forEach((p, j) => {
        let best = 0; let bd = Infinity;
        cents.forEach((c, ci) => { let d2 = 0; for (let t = 0; t < PQSUB; t += 1) d2 += (p[t] - c[t]) ** 2; if (d2 < bd) { bd = d2; best = ci; } });
        assign[j] = best;
      });
      const sums = cents.map(() => new Float64Array(PQSUB));
      const cnt = new Int32Array(K);
      pts.forEach((p, j) => { cnt[assign[j]] += 1; for (let t = 0; t < PQSUB; t += 1) sums[assign[j]][t] += p[t]; });
      cents = cents.map((c, ci) => (cnt[ci] ? sums[ci].map((x) => x / cnt[ci]) : c));
    }
    books.push(cents);
  }
  return books;
}

export function pqEncode(v, books) {
  const ids = [];
  const rebuilt = new Float64Array(PQD);
  books.forEach((cents, m) => {
    const off = m * PQSUB;
    let best = 0; let bd = Infinity;
    cents.forEach((c, ci) => { let d2 = 0; for (let t = 0; t < PQSUB; t += 1) d2 += (v[off + t] - c[t]) ** 2; if (d2 < bd) { bd = d2; best = ci; } });
    ids.push(best);
    for (let t = 0; t < PQSUB; t += 1) rebuilt[off + t] = cents[best][t];
  });
  const mse = v.reduce((s, x, i) => s + (x - rebuilt[i]) ** 2, 0) / PQD;
  return { ids, rebuilt, mse };
}

function initPqLab(getTokens, prepCanvas, redrawCallbacks) {
  const c = document.getElementById("canvas-pq");
  if (!c) return;
  let K = 16;
  let idx = 0;
  let data = null;
  const books = new Map();
  const getBooks = (k) => { if (!books.has(k)) books.set(k, pqTrain(data.train, k)); return books.get(k); };

  function render() {
    if (!data) data = pqToyData();
    const T = getTokens();
    const v = data.test[idx];
    const enc = pqEncode(v, getBooks(K));
    const { ctx, w, h } = prepCanvas(c);
    ctx.clearRect(0, 0, w, h);
    const lim = Math.max(...Array.from(v, Math.abs), ...Array.from(enc.rebuilt, Math.abs)) * 1.15;
    const f = makeFrame(w, h, { l: 40, r: 10, t: 30, b: 28 }, { x0: 0, x1: PQD, y0: -lim, y1: lim });
    axes(ctx, T, f, { xTicks: [0, 4, 8, 12, 16], yCount: 4, yFmt: (y) => y.toFixed(1), xTitle: "dimension" });
    const bw = f.plotW / PQD;
    for (let i = 0; i < PQD; i += 1) {
      const x = f.left + i * bw;
      ctx.fillStyle = T.blue;
      ctx.fillRect(x + bw * 0.1, Math.min(f.y(0), f.y(v[i])), bw * 0.38, Math.abs(f.y(v[i]) - f.y(0)));
      ctx.fillStyle = T.amber;
      ctx.fillRect(x + bw * 0.52, Math.min(f.y(0), f.y(enc.rebuilt[i])), bw * 0.38, Math.abs(f.y(enc.rebuilt[i]) - f.y(0)));
    }
    for (let m = 0; m < PQM; m += 1) {
      const x0 = f.left + m * PQSUB * bw;
      if (m > 0) { ctx.strokeStyle = T.lineStrong; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(x0, f.top - 6); ctx.lineTo(x0, f.bottom); ctx.stroke(); ctx.setLineDash([]); }
      ctx.fillStyle = T.fg; ctx.font = `600 11.5px ${T.mono}`; ctx.textAlign = "center"; ctx.textBaseline = "bottom";
      const pieceW = PQSUB * bw;
      ctx.fillText(pieceW > 120 ? `piece ${m + 1} → ID ${enc.ids[m]}` : `ID ${enc.ids[m]}`, x0 + pieceW / 2, f.top - 8);
    }
    const bitsPer = Math.log2(K);
    const bytes = (PQM * bitsPer) / 8;
    const full = PQD * 4;
    readout(document.getElementById("ro-pq"), [["stored", `IDs [${enc.ids.join(", ")}]`], ["size", `${full} → ${bytes} byte${bytes === 1 ? "" : "s"}`], ["error (MSE)", enc.mse.toFixed(3)]],
      `Each of the 4 pieces picked the closest of its ${K} codebook entries. Storing only those 4 IDs (${bitsPer} bits each) shrinks the vector ${Math.round(full / bytes)}×. The gap between blue and amber bars is the price.${K === 4 ? " With only 4 choices per piece, the fit is rough." : K === 64 ? " With 64 choices per piece, the fit is much closer." : ""}`);
  }

  document.querySelectorAll("[data-pq-k]").forEach((b) => b.addEventListener("click", () => {
    document.querySelectorAll("[data-pq-k]").forEach((x) => x.classList.toggle("active", x === b));
    K = Number(b.dataset.pqK);
    render();
  }));
  document.getElementById("btn-pq-next").addEventListener("click", () => { idx = (idx + 1) % 30; render(); });
  redrawCallbacks.push(render);
}
