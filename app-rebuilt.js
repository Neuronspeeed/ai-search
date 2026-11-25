/* ==========================================================================
   Rebuilt widgets (TurboQuant-style: one idea, drag on the chart,
   linked plots on shared scales, chart-kit axes/legends/callouts)
   - DEMO 2.1: Same query, two scorers (TF-IDF vs. BM25) + IDF curve
   - DEMO 3.1: BM25's two knobs (saturation & length) + live corpus
   ========================================================================== */
import { DOCS_CORPUS, BOOST_SCENARIOS, bm25Idf, bm25TfNorm, halfLifeDecay, scoreDocBM25, scoreDocTFIDF, tfidfTermWeight } from "./data.js";
import { makeFrame, axes, legend, refLine, callout, handle, curve, Placer, reserveHint, readout } from "./chart-kit.js";

function escapeHtml(str) {
  return String(str).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function pointer(canvas, e) {
  const r = canvas.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top, w: r.width, h: r.height };
}

/** Wire drag + arrow keys onto a canvas. onDrag(p) gets pointer coords; onKey(dir) gets ±1. */
function makeDraggable(canvas, onDrag, onKey, canStart = () => true) {
  let dragging = false;
  canvas.addEventListener("pointerdown", (e) => {
    const p = pointer(canvas, e);
    if (!canStart(p)) return;
    dragging = true;
    canvas.setPointerCapture(e.pointerId);
    onDrag(p);
  });
  canvas.addEventListener("pointermove", (e) => { if (dragging) onDrag(pointer(canvas, e)); });
  const stop = () => { dragging = false; };
  canvas.addEventListener("pointerup", stop);
  canvas.addEventListener("pointercancel", stop);
  canvas.addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight" || e.key === "ArrowUp") onKey(1);
    else if (e.key === "ArrowLeft" || e.key === "ArrowDown") onKey(-1);
    else return;
    e.preventDefault();
  });
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export function initRebuiltLabs({ getTokens, prepCanvas, redrawCallbacks }) {
  initTfidfLab(getTokens, prepCanvas, redrawCallbacks);
  initBm25Lab(getTokens, prepCanvas, redrawCallbacks);
  initBoostLab(getTokens, prepCanvas, redrawCallbacks);
}

/* ---------------------------- DEMO 2.1 ---------------------------------- */
const SHORT = { d1: "Fixing ECONNRESET", d2: "Keep-Alive Pools", d3: "Retry Patterns", d4: "Changelog", d5: "Stuffed FAQ" };
const TINY = { d1: "Fix ECONNRESET", d2: "Keep-Alive", d3: "Retry Guide", d4: "Changelog", d5: "Stuffed FAQ" };

function initTfidfLab(getTokens, prepCanvas, redrawCallbacks) {
  const cTf = document.getElementById("canvas-tfidf-compare");
  const cBm = document.getElementById("canvas-bm25-compare");
  const cIdf = document.getElementById("canvas-idf");
  if (!cTf || !cBm || !cIdf) return;
  const slStuff = document.getElementById("sl-stuff-tf");
  const slLen = document.getElementById("sl-changelog-len");
  let idfDf = 4;
  let tfFrame = null;
  let idfFrame = null;

  function rowsNow() {
    const stuffTf = Number(slStuff.value);
    const changelogLen = Number(slLen.value);
    const docs = DOCS_CORPUS.map((d) => {
      if (d.id === "d5") return { ...d, tf: { ...d.tf, econnreset: stuffTf } };
      // a longer changelog also mentions every term more often (6 and 3 mentions at 1,400 words)
      if (d.id === "d4") {
        const k = changelogLen / 1400;
        return { ...d, length: changelogLen, tf: { ...d.tf, econnreset: Math.max(1, Math.round(6 * k)), retry: Math.max(1, Math.round(3 * k)) } };
      }
      return d;
    });
    const q = ["econnreset", "retry"];
    const rows = docs.filter((d) => (d.tf.econnreset || 0) > 0).map((doc) => ({
      doc,
      tfidf: scoreDocTFIDF(doc, q, docs),
      bm25: scoreDocBM25(doc, q, docs, 1.2, 0.75).total,
    }));
    const df = docs.filter((d) => (d.tf.econnreset || 0) > 0).length;
    return { rows, perMention: tfidfTermWeight(1, df, docs.length) };
  }

  function drawBars(canvas, rows, key, color, T, withHandle) {
    const { ctx, w, h } = prepCanvas(canvas);
    ctx.clearRect(0, 0, w, h);
    const compact = w < 420;
    const max = Math.max(...rows.map((r) => r[key])) * 1.12;
    const f = makeFrame(w, h, { l: compact ? 100 : 124, r: 16, t: 32, b: 28 }, { x0: 0, x1: max, y0: 0, y1: 1 });
    axes(ctx, T, f, { yTicks: [], xCount: 4, xFmt: (v) => v.toFixed(v < 10 ? 1 : 0), grid: false });
    const winner = [...rows].sort((a, b) => b[key] - a[key])[0];
    const wrong = winner.doc.id !== "d1";
    const band = f.plotH / rows.length;
    rows.forEach((r, i) => {
      const cy = f.top + band * i + band / 2;
      const isWin = r.doc.id === winner.doc.id;
      // labels
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      ctx.fillStyle = r.doc.id === "d1" ? T.fg : T.reading;
      ctx.font = `${r.doc.id === "d1" ? "600 " : ""}${compact ? 10 : 11}px ${T.mono}`;
      ctx.fillText(compact ? TINY[r.doc.id] : SHORT[r.doc.id], f.left - 8, cy - 6);
      ctx.fillStyle = T.muted;
      ctx.font = `10.5px ${T.mono}`;
      ctx.fillText(`${r.doc.tf.econnreset}× · ${r.doc.length}w`, f.left - 8, cy + 7);
      // bar
      const bh = Math.min(14, band * 0.42);
      ctx.globalAlpha = isWin ? 1 : 0.42;
      ctx.fillStyle = isWin && wrong ? T.coral : color;
      ctx.fillRect(f.x(0), cy - bh / 2, f.x(r[key]) - f.x(0), bh);
      ctx.globalAlpha = 1;
      // value + crown
      ctx.textAlign = "left";
      ctx.font = `${isWin ? "600 " : ""}11.5px ${T.mono}`;
      ctx.fillStyle = isWin ? (wrong ? T.coral : color) : T.muted;
      const label = `${r[key].toFixed(2)}${isWin ? "  #1" : ""}`;
      const lx = f.x(r[key]) + (withHandle && r.doc.id === "d5" ? 14 : 6);
      const tw = ctx.measureText(label).width;
      ctx.fillText(label, Math.min(lx, f.right - tw), cy);
      if (withHandle && r.doc.id === "d5") handle(ctx, T, f.x(r[key]), cy, T.coral, 6);
    });
    return { f, winner, wrong, rows };
  }

  function render() {
    const T = getTokens();
    document.getElementById("val-stuff-tf").textContent = slStuff.value;
    document.getElementById("val-changelog-len").textContent = `${slLen.value}w`;
    const { rows, perMention } = rowsNow();
    const left = drawBars(cTf, rows, "tfidf", T.coral, T, true);
    const right = drawBars(cBm, rows, "bm25", T.brand, T, false);
    tfFrame = { ...left.f, perMention, rows };

    const tw = document.getElementById("kpi-tfidf-win");
    tw.textContent = SHORT[left.winner.doc.id];
    tw.className = `kpi-val ${left.wrong ? "coral" : "brand"}`;
    document.getElementById("kpi-tfidf-sub").textContent = left.wrong ? "Wrong page crowned #1" : "Matches the real fix";
    const bw = document.getElementById("kpi-bm25-win");
    bw.textContent = SHORT[right.winner.doc.id];
    bw.className = `kpi-val ${right.wrong ? "amber" : "brand"}`;
    document.getElementById("kpi-bm25-sub").textContent = right.wrong ? "Even BM25 slips here" : "Saturation + length norm hold";
    {
      const tw0 = left.winner.doc;
      const why = !left.wrong
        ? "Both scorers agree on the real fix. Nothing here is inflated enough to fool raw counting."
        : tw0.id === "d5"
          ? `TF-IDF crowns the Stuffed FAQ: each of its ${tw0.tf.econnreset} mentions counts in full, so repetition beats relevance, even though it never says "retry". BM25 caps repeats, so "${SHORT[right.winner.doc.id]}", which has both words, wins.`
          : `TF-IDF crowns the ${tw0.length.toLocaleString()}-word changelog: being long, it mentions both words more, and TF-IDF never checks length. BM25 divides by length, so "${SHORT[right.winner.doc.id]}" wins.`;
      readout(document.getElementById("ro-tfidf"), [["TF-IDF #1", SHORT[left.winner.doc.id]], ["BM25 #1", SHORT[right.winner.doc.id]]], why, left.wrong ? "warn" : "");
    }

    // IDF plot
    const { ctx, w, h } = prepCanvas(cIdf);
    ctx.clearRect(0, 0, w, h);
    const f = makeFrame(w, h, { l: 40, r: 14, t: 12, b: 34 }, { x0: 1, x1: 8, y0: 0, y1: 2 });
    idfFrame = f;
    const P = new Placer(f);
    reserveHint(P, cIdf);
    axes(ctx, T, f, { xTicks: [1, 2, 3, 4, 5, 6, 7, 8], yTicks: [0, 0.5, 1, 1.5, 2], yFmt: (v) => v.toFixed(1), xTitle: "pages containing the word (df)" });
    curve(ctx, f, (x) => bm25Idf(x, 8), T.blue, { width: 2.25 });
    const idf = bm25Idf(idfDf, 8);
    ctx.save();
    ctx.setLineDash([3, 3]);
    ctx.strokeStyle = T.lineStrong;
    ctx.beginPath(); ctx.moveTo(f.x(idfDf), f.bottom); ctx.lineTo(f.x(idfDf), f.y(idf)); ctx.stroke();
    ctx.restore();
    handle(ctx, T, f.x(idfDf), f.y(idf), T.blue);
    callout(ctx, T, f.x(idfDf), f.y(idf), `df ${idfDf} → IDF ${idf.toFixed(2)}`, T.blue, P);
    document.getElementById("kpi-idf-val").textContent = idf.toFixed(3);
    document.getElementById("kpi-idf-sub").textContent = `df = ${idfDf} of 8 pages`;
  }

  const clearPresets = () => document.querySelectorAll("[data-tfidf-preset]").forEach((b) => b.classList.remove("active"));
  [slStuff, slLen].forEach((sl) => sl.addEventListener("input", () => { clearPresets(); render(); }));

  makeDraggable(cTf, (p) => {
    if (!tfFrame) return;
    const v = tfFrame.invX(p.x);
    slStuff.value = String(clamp(Math.round(v / tfFrame.perMention), 1, 20));
    clearPresets();
    render();
  }, (dir) => {
    slStuff.value = String(clamp(Number(slStuff.value) + dir, 1, 20));
    clearPresets();
    render();
  }, (p) => {
    // only start dragging on the FAQ's row
    if (!tfFrame) return false;
    const i = tfFrame.rows.findIndex((r) => r.doc.id === "d5");
    const band = tfFrame.plotH / tfFrame.rows.length;
    const cy = tfFrame.top + band * i + band / 2;
    return Math.abs(p.y - cy) < band / 2 + 4;
  });

  makeDraggable(cIdf, (p) => {
    if (!idfFrame) return;
    idfDf = clamp(Math.round(idfFrame.invX(p.x)), 1, 8);
    render();
  }, (dir) => { idfDf = clamp(idfDf + dir, 1, 8); render(); });

  document.querySelectorAll("[data-tfidf-preset]").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("[data-tfidf-preset]").forEach((b) => b.classList.toggle("active", b === btn));
      const kind = btn.dataset.tfidfPreset;
      if (kind === "stuffed") { slStuff.value = 14; slLen.value = 1400; }
      else if (kind === "changelog") { slStuff.value = 3; slLen.value = 2000; }
      else { slStuff.value = 2; slLen.value = 300; }
      render();
    });
  });
  redrawCallbacks.push(render);
}

/* ---------------------------- DEMO 3.1 ---------------------------------- */
function initBm25Lab(getTokens, prepCanvas, redrawCallbacks) {
  const cTf = document.getElementById("canvas-bm25");
  const cLen = document.getElementById("canvas-bm25-len");
  const list = document.getElementById("bm25-doc-list");
  if (!cTf || !cLen || !list) return;
  const slK1 = document.getElementById("sl-k1");
  const slB = document.getElementById("sl-b");
  const TF_MAX = 20;
  let tf = 5;
  let lenRatio = 2.0;
  let fTf = null;
  let fLen = null;

  function render() {
    const T = getTokens();
    const k1 = Number(slK1.value);
    const b = Number(slB.value);
    document.getElementById("val-k1").textContent = k1.toFixed(1);
    document.getElementById("val-b").textContent = b.toFixed(2);
    const wThis = bm25TfNorm(tf, k1, b, lenRatio);
    const wAvg = bm25TfNorm(tf, k1, b, 1.0);
    const ceil = k1 + 1;
    const diffPct = Math.round((wThis / Math.max(1e-4, wAvg) - 1) * 100);
    const yMax = Math.max(2.6, ceil * 1.15);

    // ---- plot 1: weight vs tf
    {
      const { ctx, w, h } = prepCanvas(cTf);
      ctx.clearRect(0, 0, w, h);
      const f = makeFrame(w, h, { l: 36, r: 12, t: 12, b: 34 }, { x0: 0, x1: TF_MAX, y0: 0, y1: yMax });
      fTf = f;
      const P = new Placer(f);
      reserveHint(P, cTf);
      axes(ctx, T, f, { xTicks: [0, 5, 10, 15, 20], yFmt: (v) => (v % 1 ? v.toFixed(1) : String(v)), xTitle: "mentions (tf)" });
      curve(ctx, f, (x) => x, T.muted, { dash: [3, 4], width: 1.25 });
      curve(ctx, f, (x) => bm25TfNorm(x, k1, b, 1.0), T.brand, { width: 2 });
      curve(ctx, f, (x) => bm25TfNorm(x, k1, b, lenRatio), T.fg, { width: 2.5 });
      legend(ctx, T, f, [
        { label: "raw tf (TF-IDF)", color: T.muted, kind: "dash" },
        { label: "average-length page", color: T.brand, kind: "line" },
        { label: `this page (${lenRatio.toFixed(2)}×)`, color: T.fg, kind: "line" },
      ], P, "br");
      if (ceil <= yMax) refLine(ctx, T, f, { y: ceil, label: `ceiling k₁+1 = ${ceil.toFixed(1)}`, color: T.amber }, P);
      ctx.save();
      ctx.setLineDash([3, 3]);
      ctx.strokeStyle = T.lineStrong;
      ctx.beginPath(); ctx.moveTo(f.x(tf), f.bottom); ctx.lineTo(f.x(tf), f.y(wThis)); ctx.stroke();
      ctx.restore();
      handle(ctx, T, f.x(tf), f.y(wThis), T.brand);
      callout(ctx, T, f.x(tf), f.y(wThis), `tf ${tf} → ${wThis.toFixed(2)}`, T.brand, P);
    }

    // ---- plot 2: weight vs length (same y scale → both dots at the same height)
    {
      const { ctx, w, h } = prepCanvas(cLen);
      ctx.clearRect(0, 0, w, h);
      const f = makeFrame(w, h, { l: 36, r: 12, t: 12, b: 34 }, { x0: 0.25, x1: 4, y0: 0, y1: yMax });
      fLen = f;
      const P = new Placer(f);
      reserveHint(P, cLen);
      axes(ctx, T, f, { xTicks: [0.5, 1, 2, 3, 4], xFmt: (v) => `${v}×`, yFmt: (v) => (v % 1 ? v.toFixed(1) : String(v)), xTitle: "page length ÷ average" });
      refLine(ctx, T, f, { x: 1, label: "average", color: T.muted, dash: [2, 4] }, P);
      curve(ctx, f, () => bm25TfNorm(tf, k1, 0, 1), T.muted, { dash: [3, 4], width: 1.25 });
      curve(ctx, f, (x) => bm25TfNorm(tf, k1, b, x), T.amber, { width: 2.25 });
      legend(ctx, T, f, [
        { label: `b = ${b.toFixed(2)}`, color: T.amber, kind: "line" },
        { label: "b = 0 (ignore length)", color: T.muted, kind: "dash" },
      ], P, "tr");
      handle(ctx, T, f.x(lenRatio), f.y(wThis), T.amber);
      callout(ctx, T, f.x(lenRatio), f.y(wThis), `${lenRatio.toFixed(2)}× → ${wThis.toFixed(2)}`, T.amber, P);
    }

    const lenFactor = (1 - b + b * lenRatio).toFixed(2);
    document.getElementById("bm25-live-eq").textContent =
      `weight = tf·(k₁+1) / (tf + k₁·(1 − b + b·len)) = ${tf}·${ceil.toFixed(1)} / (${tf} + ${k1.toFixed(1)}·${lenFactor}) = ${wThis.toFixed(2)}`;
    document.getElementById("kpi-bm25-w").innerHTML = `<span class="was">${tf}</span><span class="arrow">→</span>${wThis.toFixed(2)}`;
    document.getElementById("kpi-bm25-ceil").textContent = ceil.toFixed(2);
    document.getElementById("kpi-bm25-diff").textContent = `${diffPct >= 0 ? "+" : ""}${diffPct}%`;
    {
      const sat = wThis / ceil;
      const satTxt = sat > 0.85 ? `It's already at ${Math.round(sat * 100)}% of the ceiling, so more mentions barely help.` : sat > 0.6 ? `It's at ${Math.round(sat * 100)}% of the ceiling: extra mentions still help, but less each time.` : "It's still low on the curve, so each extra mention adds a lot.";
      const lenTxt = b === 0 ? "Length is ignored (b = 0)." : Math.abs(lenRatio - 1) < 0.03 ? "At average length there's no length penalty." : lenRatio > 1 ? `Being ${lenRatio.toFixed(2)}× longer than average costs ${Math.abs(diffPct)}%.` : `Being shorter than average adds ${diffPct}%.`;
      readout(document.getElementById("ro-bm25"), [["tf", tf], ["length", `${lenRatio.toFixed(2)}×`], ["weight", wThis.toFixed(2)], ["ceiling", ceil.toFixed(1)]], `${tf} mentions → ${wThis.toFixed(2)}, not ${tf}. ${satTxt} ${lenTxt}`);
    }

    // ---- live corpus list
    const query = ["econnreset", "retry"];
    const ranked = DOCS_CORPUS.map((doc) => ({ doc, ...scoreDocBM25(doc, query, DOCS_CORPUS, k1, b) }))
      .filter((r) => r.total > 0)
      .sort((x, y) => y.total - x.total);
    const maxScore = Math.max(0.001, ...ranked.map((r) => r.total));
    document.getElementById("bm25-leader-badge").textContent = ranked.length ? `#1: ${ranked[0].doc.id}` : "—";
    list.innerHTML = ranked.map((r, i) => `
      <div class="doc-row${i === 0 ? " top-hit" : ""}">
        <span class="doc-rank">#${i + 1}</span>
        <div class="doc-info">
          <div class="doc-title">${escapeHtml(r.doc.title)}</div>
          <div class="doc-meta"><span>${r.doc.length}w (${r.lenRatio.toFixed(2)}× avg)</span><span>${r.breakdown.map((x) => `${x.term}:${x.tf}`).join(" · ")}</span></div>
          <div class="doc-bar-track"><div class="doc-bar-fill" style="width:${Math.round((r.total / maxScore) * 100)}%"></div></div>
        </div>
        <span class="doc-score">${r.total.toFixed(2)}</span>
      </div>`).join("");
  }

  const clearPresets = () => document.querySelectorAll("[data-bm25-preset]").forEach((x) => x.classList.remove("active"));
  [slK1, slB].forEach((sl) => sl.addEventListener("input", () => { clearPresets(); render(); }));

  makeDraggable(cTf, (p) => {
    if (!fTf) return;
    tf = clamp(Math.round(fTf.invX(p.x)), 1, TF_MAX);
    render();
  }, (dir) => { tf = clamp(tf + dir, 1, TF_MAX); render(); });

  makeDraggable(cLen, (p) => {
    if (!fLen) return;
    lenRatio = clamp(Math.round(fLen.invX(p.x) * 20) / 20, 0.25, 4);
    render();
  }, (dir) => { lenRatio = clamp(Math.round((lenRatio + dir * 0.05) * 20) / 20, 0.25, 4); render(); });

  document.querySelectorAll("[data-bm25-preset]").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("[data-bm25-preset]").forEach((x) => x.classList.toggle("active", x === btn));
      const kind = btn.dataset.bm25Preset;
      if (kind === "lucene") { slK1.value = 1.2; slB.value = 0.75; }
      else if (kind === "nolength") { slK1.value = 1.2; slB.value = 0; }
      else if (kind === "rawtf") { slK1.value = 5.0; slB.value = 0; }
      render();
    });
  });
  redrawCallbacks.push(render);
}

/* ---------------------------- DEMO 4.1 ---------------------------------- */
const BOOST_SHORT = { d1: "Fixing ECONNRESET", d2: "Keep-Alive Pools", d6: "Getting Started", d7: "Pricing & Plans", d3: "Retry & Backoff", d4: "SDK Changelog" };
const BOOST_TINY = { d1: "Fix ECONNRESET", d2: "Keep-Alive", d6: "Getting Started", d7: "Pricing", d3: "Retry", d4: "Changelog" };

function initBoostLab(getTokens, prepCanvas, redrawCallbacks) {
  const cAdd = document.getElementById("canvas-boost-add");
  const cMul = document.getElementById("canvas-boost-mul");
  const cDecay = document.getElementById("canvas-decay");
  if (!cAdd || !cMul || !cDecay) return;
  const slW = document.getElementById("sl-boost-w");
  let scenario = "rare";
  let halfLife = 30;
  let fDecay = null;
  const AGE_MAX = 180;
  const nameOf = (d) => BOOST_SHORT[d.id] || d.title;
  // the rare scenario's d7 is "Pricing & Plans", the common one's is "Rate Limit (429)"
  const label = (d, tiny = false) => (scenario === "common" && d.id === "d7" ? (tiny ? "Rate Limit 429" : "Rate Limit (429)") : tiny ? BOOST_TINY[d.id] || nameOf(d) : nameOf(d));

  function rows() {
    const w = Number(slW.value);
    return BOOST_SCENARIOS[scenario].docs.map((d) => {
      const decayed = halfLifeDecay(d.clicks, d.ageDays, halfLife);
      const pop = Math.log1p(decayed) / Math.log1p(450);
      return { d, decayed, pop, add: d.bm25 + w * pop, mul: d.bm25 * (1 + w * pop), bonusAdd: w * pop, bonusMul: d.bm25 * w * pop };
    }).sort((a, b) => b.d.bm25 - a.d.bm25);
  }

  function drawStack(canvas, list, key, bonusKey, xMax, T) {
    const { ctx, w, h } = prepCanvas(canvas);
    ctx.clearRect(0, 0, w, h);
    const compact = w < 420;
    const f = makeFrame(w, h, { l: compact ? 104 : 124, r: 14, t: 8, b: 26 }, { x0: 0, x1: xMax, y0: 0, y1: 1 });
    axes(ctx, T, f, { yTicks: [], xCount: 4, grid: false, xFmt: (v) => v.toFixed(0) });
    const winner = [...list].sort((a, b) => b[key] - a[key])[0];
    const hijack = scenario === "rare" && winner.d.bm25 < 1;
    const band = f.plotH / list.length;
    list.forEach((r, i) => {
      const cy = f.top + band * i + band / 2;
      const bh = Math.min(15, band * 0.46);
      ctx.textAlign = "right"; ctx.textBaseline = "middle";
      ctx.fillStyle = r === winner ? T.fg : T.reading;
      ctx.font = `${r === winner ? "600 " : ""}${compact ? 10 : 11}px ${T.mono}`;
      ctx.fillText(label(r.d, compact), f.left - 8, cy - 6);
      ctx.fillStyle = T.muted; ctx.font = `10.5px ${T.mono}`;
      ctx.fillText(`${r.d.bm25.toFixed(1)} · ${Math.round(r.decayed)} clk`, f.left - 8, cy + 7);
      const x0 = f.x(0), xb = f.x(r.d.bm25), xt = f.x(r[key]);
      ctx.fillStyle = T.blue; ctx.globalAlpha = 0.85; ctx.fillRect(x0, cy - bh / 2, xb - x0, bh);
      ctx.fillStyle = r === winner && hijack ? T.coral : T.amber; ctx.globalAlpha = 0.85; ctx.fillRect(xb, cy - bh / 2, xt - xb, bh);
      ctx.globalAlpha = 1;
      ctx.textAlign = "left"; ctx.font = `${r === winner ? "600 " : ""}11.5px ${T.mono}`;
      ctx.fillStyle = r === winner ? (hijack ? T.coral : T.fg) : T.muted;
      const txt = `${r[key].toFixed(2)}${r === winner ? "  #1" : ""}`;
      const tw = ctx.measureText(txt).width;
      ctx.fillText(txt, Math.min(xt + 6, f.right - tw), cy);
    });
    return { winner, hijack };
  }

  function render() {
    const T = getTokens();
    document.getElementById("val-boost-w").textContent = Number(slW.value).toFixed(1);
    const list = rows();
    const xMax = Math.max(...list.map((r) => Math.max(r.add, r.mul))) * 1.15; // one shared scale
    const A = drawStack(cAdd, list, "add", "bonusAdd", xMax, T);
    const M = drawStack(cMul, list, "mul", "bonusMul", xMax, T);
    const ka = document.getElementById("kpi-boost-add");
    ka.textContent = label(A.winner.d); ka.className = `kpi-val ${A.hijack ? "coral" : "brand"}`;
    const km = document.getElementById("kpi-boost-mul");
    km.textContent = label(M.winner.d); km.className = `kpi-val ${M.hijack ? "coral" : "brand"}`;
    {
      const w0 = Number(slW.value);
      const why = w0 === 0 ? "Boost is 0, so both charts are pure text relevance (blue)."
        : A.hijack && !M.hijack ? `With +, "${label(A.winner.d)}" gets the same flat bonus whatever its text score, so popularity beats relevance. With ×, its bonus is a share of a tiny text score (${A.winner.d.bm25}), so it can't win.`
        : A.hijack && M.hijack ? "The boost is so large that even × lets a barely-matching page win. Turn w down."
        : scenario === "common" ? "Text scores are close, so popularity breaks the tie in both models. That's when a boost helps."
        : "The text match is strong enough that the bonus doesn't flip the order in either model. Raise w to see + break first.";
      readout(document.getElementById("ro-boost"), [["w", w0.toFixed(1)], ["+ winner", label(A.winner.d)], ["× winner", label(M.winner.d)]], why, A.hijack ? "warn" : "");
    }

    // decay plot
    const { ctx, w, h } = prepCanvas(cDecay);
    ctx.clearRect(0, 0, w, h);
    const f = makeFrame(w, h, { l: 42, r: 14, t: 12, b: 34 }, { x0: 0, x1: AGE_MAX, y0: 0, y1: 1 });
    fDecay = f;
    const P = new Placer(f);
    reserveHint(P, cDecay);
    axes(ctx, T, f, { xTicks: [0, 30, 60, 90, 120, 150, 180], xFmt: (v) => `${v}d`, yTicks: [0, 0.25, 0.5, 0.75, 1], yFmt: (v) => `${Math.round(v * 100)}%`, xTitle: "age of the click (days)" });
    refLine(ctx, T, f, { y: 0.5, label: "half weight", color: T.muted, dash: [2, 4] }, P);
    curve(ctx, f, (x) => halfLifeDecay(1, x, halfLife), T.brand, { width: 2.25, samples: 240 });
    list.forEach((r) => {
      const yv = halfLifeDecay(1, r.d.ageDays, halfLife);
      ctx.beginPath(); ctx.arc(f.x(r.d.ageDays), f.y(yv), 4, 0, Math.PI * 2);
      ctx.fillStyle = T.blue; ctx.fill();
    });
    const onChart = halfLife <= AGE_MAX;
    const hx = f.x(Math.min(halfLife, AGE_MAX));
    const hy = onChart ? f.y(0.5) : f.y(halfLifeDecay(1, AGE_MAX, halfLife));
    handle(ctx, T, hx, hy, T.amber);
    callout(ctx, T, hx, hy, onChart ? `half-life ${halfLife}d` : `half-life ${halfLife.toLocaleString()}d →`, T.amber, P);
    const left6m = halfLifeDecay(100, 180, halfLife);
    document.getElementById("kpi-decay-30").innerHTML = `<span class="was">100%</span><span class="arrow">→</span>${left6m < 1 ? left6m.toFixed(1) : Math.round(left6m)}%`;
    document.getElementById("kpi-decay-sub").textContent = `Half-life ${halfLife.toLocaleString()} days`;
  }

  slW.addEventListener("input", render);
  const setHalfLife = (v) => {
    halfLife = clamp(Math.round(v), 1, 1920);
    document.querySelectorAll("[data-halflife]").forEach((b) => b.classList.toggle("active", Number(b.dataset.halflife) === halfLife));
    render();
  };
  makeDraggable(cDecay, (p) => { if (fDecay) setHalfLife(clamp(fDecay.invX(p.x), 1, AGE_MAX)); }, (dir) => setHalfLife(halfLife + dir));
  document.querySelectorAll("[data-halflife]").forEach((btn) => btn.addEventListener("click", () => setHalfLife(Number(btn.dataset.halflife))));
  document.querySelectorAll("[data-boost-scenario]").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("[data-boost-scenario]").forEach((b) => b.classList.toggle("active", b === btn));
      scenario = btn.dataset.boostScenario;
      render();
    });
  });
  redrawCallbacks.push(render);
}
