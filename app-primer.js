/* ==========================================================================
   §0 primer: eight tiny "one idea" demos, each with a live verdict line
   ========================================================================== */
import { makeFrame, axes, refLine, callout, handle, curve, Placer, reserveHint, bindDrag, readout } from "./chart-kit.js";

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const pct = (x) => `${Math.round(x * 100)}%`;

export function initPrimerLabs({ getTokens, prepCanvas, redrawCallbacks }) {
  const ctx = { getTokens, prepCanvas, redrawCallbacks };
  primIndex();
  primSat(ctx);
  primIdf(ctx);
  primPR(ctx);
  primPos(ctx);
  primSmall(ctx);
  primNN(ctx);
  primQuant(ctx);
}

/* ---- §0.a inverted index + AND/OR ---- */
const P_DOCS = [
  { id: "p1", text: "fix connection reset with retry" },
  { id: "p2", text: "retry with backoff after a timeout" },
  { id: "p3", text: "connection reset by peer" },
  { id: "p4", text: "raise the read timeout" },
  { id: "p5", text: "reset billing password" },
];
function primIndex() {
  const docsEl = document.getElementById("prim-index-docs");
  if (!docsEl) return;
  let A = "reset";
  let B = "retry";
  let mode = "and";
  const has = (d, w) => d.text.split(" ").includes(w);
  const render = () => {
    const inA = P_DOCS.filter((d) => has(d, A)).map((d) => d.id);
    const inB = P_DOCS.filter((d) => has(d, B)).map((d) => d.id);
    const hit = P_DOCS.filter((d) => (mode === "and" ? has(d, A) && has(d, B) : has(d, A) || has(d, B))).map((d) => d.id);
    docsEl.innerHTML = P_DOCS.map((d) => {
      const words = d.text.split(" ").map((w) => (w === A ? `<mark class="m-a">${w}</mark>` : w === B ? `<mark class="m-b">${w}</mark>` : w)).join(" ");
      const ok = hit.includes(d.id);
      return `<div class="prim-doc${ok ? " hit" : ""}"><span class="pid">${d.id}</span><span class="ptxt">${words}</span><span class="pstat">${ok ? "match" : "—"}</span></div>`;
    }).join("");
    const set = (xs) => `{${xs.join(", ") || "∅"}}`;
    const verdict = A === B
      ? "Same word twice, so AND and OR give the same list."
      : mode === "and"
        ? `AND keeps only pages in <em>both</em> lists: ${hit.length} page${hit.length === 1 ? "" : "s"}. Precise, but strict.`
        : `OR keeps pages in <em>either</em> list: ${hit.length} pages. More found, but looser.`;
    readout(document.getElementById("prim-index-ro"), [[`"${A}"`, set(inA)], [`"${B}"`, set(inB)], [mode.toUpperCase(), set(hit)]], verdict);
  };
  const wire = (attr, set) => document.querySelectorAll(`[${attr}]`).forEach((b) => b.addEventListener("click", () => {
    document.querySelectorAll(`[${attr}]`).forEach((x) => x.classList.toggle("active", x === b));
    set(b.getAttribute(attr));
    render();
  }));
  wire("data-pa", (v) => { A = v; });
  wire("data-pb", (v) => { B = v; });
  wire("data-pmode", (v) => { mode = v; });
  render();
}

/* ---- §0.b saturation ---- */
function primSat({ getTokens, prepCanvas, redrawCallbacks }) {
  const c = document.getElementById("prim-sat-canvas");
  if (!c) return;
  const K = 1.2;
  const sat = (t) => (t * (K + 1)) / (t + K);
  let tf = 3;
  let f = null;
  const render = () => {
    const T = getTokens();
    const { ctx, w, h } = prepCanvas(c);
    ctx.clearRect(0, 0, w, h);
    f = makeFrame(w, h, { l: 30, r: 10, t: 10, b: 30 }, { x0: 0, x1: 20, y0: 0, y1: 6 });
    const P = new Placer(f);
    reserveHint(P, c);
    axes(ctx, T, f, { xTicks: [0, 5, 10, 15, 20], yTicks: [0, 2, 4, 6], xTitle: "mentions" });
    curve(ctx, f, (x) => x, T.coral, { dash: [4, 3], width: 1.5 });
    curve(ctx, f, sat, T.brand, { width: 2.25 });
    refLine(ctx, T, f, { y: K + 1, label: `cap ${(K + 1).toFixed(1)}`, color: T.amber }, P);
    handle(ctx, T, f.x(tf), f.y(sat(tf)), T.brand, 6);
    callout(ctx, T, f.x(tf), f.y(sat(tf)), `${tf} → ${sat(tf).toFixed(2)}`, T.brand, P);
    const add = sat(tf + 1) - sat(tf);
    readout(document.getElementById("prim-sat-ro"), [["mentions", tf], ["raw count", tf], ["saturated", sat(tf).toFixed(2)], ["next adds", `+${add.toFixed(3)}`]],
      tf === 0 ? `No mentions, no credit. The first mention is worth the most: +${add.toFixed(2)}.` : tf <= 2 ? "Early mentions still earn real credit." : `One more mention would add only +${add.toFixed(2)}, while raw counting adds +1. Spam stops paying.`);
  };
  bindDrag(c, (p) => { if (f) { tf = clamp(Math.round(f.invX(p.x)), 0, 20); render(); } }, (d) => { tf = clamp(tf + d, 0, 20); render(); });
  redrawCallbacks.push(render);
}

/* ---- §0.c IDF ---- */
function primIdf({ getTokens, prepCanvas, redrawCallbacks }) {
  const c = document.getElementById("prim-idf-canvas");
  if (!c) return;
  const N = 1000;
  const WORDS = [{ w: "the", df: 980 }, { w: "error", df: 400 }, { w: "timeout", df: 60 }, { w: "econnreset", df: 3 }];
  const idf = (df) => Math.log(N / df);
  let sel = 3;
  let f = null;
  const render = () => {
    const T = getTokens();
    const { ctx, w, h } = prepCanvas(c);
    ctx.clearRect(0, 0, w, h);
    f = makeFrame(w, h, { l: 30, r: 10, t: 26, b: 30 }, { x0: 0, x1: WORDS.length, y0: 0, y1: 6.5 });
    axes(ctx, T, f, { xTicks: [], yTicks: [0, 2, 4, 6] });
    const bw = f.plotW / WORDS.length;
    WORDS.forEach((o, i) => {
      const x = f.left + i * bw;
      const v = idf(o.df);
      ctx.fillStyle = i === sel ? T.blue : T.lineStrong;
      ctx.fillRect(x + bw * 0.2, f.y(v), bw * 0.6, Math.max(1, f.y(0) - f.y(v)));
      ctx.fillStyle = i === sel ? T.fg : T.muted;
      ctx.font = `${i === sel ? "600 " : ""}11px ${T.mono}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillText(o.w, x + bw / 2, f.bottom + 6);
      ctx.textBaseline = "bottom";
      ctx.fillText(v.toFixed(2), x + bw / 2, f.y(v) - 3);
    });
    const o = WORDS[sel];
    const ratio = idf(o.df) / idf(WORDS[0].df);
    readout(document.getElementById("prim-idf-ro"), [["word", `"${o.w}"`], ["on pages", `${o.df.toLocaleString()} of 1,000`], ["IDF", idf(o.df).toFixed(2)]],
      sel === 0 ? `"the" is on almost every page, so finding it tells you almost nothing.` : `"${o.w}" carries ${Math.round(ratio)}× the weight of "the". The rarer the word, the stronger the clue.`);
  };
  bindDrag(c, (p) => { if (f) { sel = clamp(Math.floor((p.x - f.left) / (f.plotW / WORDS.length)), 0, WORDS.length - 1); render(); } }, (d) => { sel = clamp(sel + Math.sign(d), 0, WORDS.length - 1); render(); });
  redrawCallbacks.push(render);
}

/* ---- §0.d precision vs recall ---- */
function primPR({ getTokens, prepCanvas, redrawCallbacks }) {
  const c = document.getElementById("prim-pr-canvas");
  if (!c) return;
  const REL = [1, 1, 0, 1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0];
  const total = REL.reduce((a, b) => a + b, 0);
  let k = 5;
  let f = null;
  const render = () => {
    const T = getTokens();
    const { ctx, w, h } = prepCanvas(c);
    ctx.clearRect(0, 0, w, h);
    f = makeFrame(w, h, { l: 14, r: 14, t: 30, b: 34 }, { x0: 0, x1: REL.length, y0: 0, y1: 1 });
    const bw = f.plotW / REL.length;
    REL.forEach((r, i) => {
      const x = f.left + i * bw;
      const shown = i < k;
      ctx.globalAlpha = shown ? 1 : 0.35;
      ctx.fillStyle = r ? T.brand : T.lineStrong;
      ctx.fillRect(x + 2, f.top + 18, bw - 4, f.plotH - 36);
      ctx.globalAlpha = 1;
      if (i % 5 === 0 || i === REL.length - 1) {
        ctx.fillStyle = T.muted; ctx.font = `10.5px ${T.mono}`; ctx.textAlign = "center"; ctx.textBaseline = "top";
        ctx.fillText(`#${i + 1}`, x + bw / 2, f.bottom + 6);
      }
    });
    const cx = f.left + k * bw;
    ctx.strokeStyle = T.amber; ctx.lineWidth = 2; ctx.setLineDash([4, 3]);
    ctx.beginPath(); ctx.moveTo(cx, f.top + 4); ctx.lineTo(cx, f.bottom); ctx.stroke(); ctx.setLineDash([]);
    handle(ctx, T, cx, f.top + 8, T.amber, 6);
    ctx.fillStyle = T.muted; ctx.font = `11px ${T.mono}`; ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
    ctx.fillText("shown ←", Math.max(f.left, cx - 58), f.top + 2);
    const found = REL.slice(0, k).reduce((a, b) => a + b, 0);
    const P = found / k;
    const R = found / total;
    readout(document.getElementById("prim-pr-ro"), [["shown", `top ${k}`], ["precision", pct(P)], ["recall", pct(R)]],
      k <= 2 ? "Showing very little: everything shown is right, but you miss most good pages." :
      R === 1 ? `All ${total} good pages found, but only ${pct(P)} of what you show is good.` :
      `Showing ${k}: ${found} of ${total} good pages found. Move the line right to find more, and watch precision fall.`);
  };
  bindDrag(c, (p) => { if (f) { k = clamp(Math.round((p.x - f.left) / (f.plotW / REL.length)), 1, REL.length); render(); } }, (d) => { k = clamp(k + Math.sign(d), 1, REL.length); render(); });
  redrawCallbacks.push(render);
}

/* ---- §0.e position discount ---- */
function primPos({ getTokens, prepCanvas, redrawCallbacks }) {
  const c = document.getElementById("prim-pos-canvas");
  if (!c) return;
  const disc = (r) => 1 / Math.log2(r + 1);
  let rank = 1;
  let f = null;
  const render = () => {
    const T = getTokens();
    const { ctx, w, h } = prepCanvas(c);
    ctx.clearRect(0, 0, w, h);
    f = makeFrame(w, h, { l: 34, r: 10, t: 12, b: 30 }, { x0: 0.5, x1: 10.5, y0: 0, y1: 1.12 });
    const P = new Placer(f);
    reserveHint(P, c);
    axes(ctx, T, f, { xTicks: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], xFmt: (v) => `#${v}`, yTicks: [0, 0.5, 1], yFmt: (v) => pct(v) });
    const bw = f.plotW / 10;
    for (let r = 1; r <= 10; r += 1) {
      ctx.fillStyle = r === rank ? T.brand : T.lineStrong;
      ctx.fillRect(f.x(r) - bw * 0.3, f.y(disc(r)), bw * 0.6, f.y(0) - f.y(disc(r)));
    }
    handle(ctx, T, f.x(rank), f.y(disc(rank)), T.brand, 6);
    callout(ctx, T, f.x(rank), f.y(disc(rank)), `#${rank} counts ${pct(disc(rank))}`, T.brand, P);
    readout(document.getElementById("prim-pos-ro"), [["rank", `#${rank}`], ["weight", pct(disc(rank))]],
      rank === 1 ? "At #1 the good result counts in full." : `Dropping it from #1 to #${rank} throws away ${pct(1 - disc(rank))} of its value. That's why order at the top matters most.`);
  };
  bindDrag(c, (p) => { if (f) { rank = clamp(Math.round(f.invX(p.x)), 1, 10); render(); } }, (d) => { rank = clamp(rank + Math.sign(d), 1, 10); render(); });
  redrawCallbacks.push(render);
}

/* ---- §0.f small numbers lie (Beta smoothing) ---- */
function primSmall({ getTokens, prepCanvas, redrawCallbacks }) {
  const c = document.getElementById("prim-small-canvas");
  if (!c) return;
  const TRUE = 0.4;
  const A0 = 5; // prior 25% with weight 20
  const B0 = 15;
  // fixed, seeded sequence of clicks (1) and no-clicks (0) with a 40% true rate
  let s = 12345;
  const rnd = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
  const seq = Array.from({ length: 200 }, () => (rnd() < TRUE ? 1 : 0));
  seq[0] = 1; seq[1] = 0; seq[2] = 1; // 2 clicks in the first 3 views
  const cum = seq.reduce((acc, x, i) => { acc.push((acc[i - 1] || 0) + x); return acc; }, []);
  let n = 3;
  let f = null;
  const raw = (m) => cum[m - 1] / m;
  const smooth = (m) => (A0 + cum[m - 1]) / (A0 + B0 + m);
  const render = () => {
    const T = getTokens();
    const { ctx, w, h } = prepCanvas(c);
    ctx.clearRect(0, 0, w, h);
    f = makeFrame(w, h, { l: 34, r: 10, t: 12, b: 30 }, { x0: 1, x1: 200, y0: 0, y1: 1 });
    const P = new Placer(f);
    reserveHint(P, c);
    axes(ctx, T, f, { xTicks: [1, 50, 100, 150, 200], yTicks: [0, 0.5, 1], yFmt: pct, xTitle: "views" });
    refLine(ctx, T, f, { y: TRUE, label: "true 40%", color: T.muted, dash: [2, 4] }, P);
    curve(ctx, f, (x) => raw(Math.max(1, Math.round(x))), T.coral, { width: 1.5, samples: 199 });
    curve(ctx, f, (x) => smooth(Math.max(1, Math.round(x))), T.brand, { width: 2.25, samples: 199 });
    ctx.strokeStyle = T.lineStrong; ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.moveTo(f.x(n), f.top); ctx.lineTo(f.x(n), f.bottom); ctx.stroke(); ctx.setLineDash([]);
    handle(ctx, T, f.x(n), f.y(raw(n)), T.coral, 5);
    handle(ctx, T, f.x(n), f.y(smooth(n)), T.brand, 5);
    readout(document.getElementById("prim-small-ro"), [["views", n], ["clicks", cum[n - 1]], ["raw rate", pct(raw(n))], ["smoothed", pct(smooth(n))]],
      n < 15 ? `With ${n} view${n === 1 ? "" : "s"} the raw rate says ${pct(raw(n))}. The smoothed guess stays near the 25% prior until more evidence arrives.` :
      n < 100 ? "Evidence is piling up: the smoothed guess is moving toward the truth while the raw rate still wobbles." :
      "Plenty of views: both lines converge toward the true 40%. Smoothing only matters when data is thin.");
  };
  bindDrag(c, (p) => { if (f) { n = clamp(Math.round(f.invX(p.x)), 1, 200); render(); } }, (d) => { n = clamp(n + d, 1, 200); render(); });
  redrawCallbacks.push(render);
}

/* ---- §0.g nearest neighbors ---- */
const NN_PTS = [
  { t: "econnreset", g: "connection resets", x: 1.6, y: 7.9 }, { t: "socket hang up", g: "connection resets", x: 2.6, y: 8.6 }, { t: "reset by peer", g: "connection resets", x: 1.2, y: 6.9 },
  { t: "read timeout", g: "timeouts", x: 7.4, y: 7.6 }, { t: "slow response", g: "timeouts", x: 8.5, y: 8.4 }, { t: "request timed out", g: "timeouts", x: 8.2, y: 6.6 },
  { t: "invoice", g: "billing", x: 5.0, y: 1.6 }, { t: "refund", g: "billing", x: 6.1, y: 2.4 }, { t: "card declined", g: "billing", x: 4.0, y: 2.5 },
];
function primNN({ getTokens, prepCanvas, redrawCallbacks }) {
  const c = document.getElementById("prim-nn-canvas");
  if (!c) return;
  let q = { x: 6.8, y: 7.0 };
  let f = null;
  const render = () => {
    const T = getTokens();
    const { ctx, w, h } = prepCanvas(c);
    ctx.clearRect(0, 0, w, h);
    f = makeFrame(w, h, { l: 10, r: 10, t: 10, b: 10 }, { x0: 0, x1: 10, y0: 0, y1: 10 });
    const ranked = NN_PTS.map((p) => ({ ...p, d: Math.hypot(p.x - q.x, p.y - q.y) })).sort((a, b) => a.d - b.d);
    const top = ranked.slice(0, 3);
    top.forEach((p) => { ctx.strokeStyle = T.brand; ctx.globalAlpha = 0.5; ctx.beginPath(); ctx.moveTo(f.x(q.x), f.y(q.y)); ctx.lineTo(f.x(p.x), f.y(p.y)); ctx.stroke(); ctx.globalAlpha = 1; });
    NN_PTS.forEach((p) => {
      const hit = top.includes(p) || top.some((t) => t.t === p.t);
      ctx.beginPath(); ctx.arc(f.x(p.x), f.y(p.y), hit ? 5 : 4, 0, Math.PI * 2);
      ctx.fillStyle = hit ? T.brand : p.g === "billing" ? T.amber : p.g === "timeouts" ? T.blue : T.coral;
      ctx.globalAlpha = hit ? 1 : 0.7; ctx.fill(); ctx.globalAlpha = 1;
      ctx.fillStyle = hit ? T.fg : T.muted; ctx.font = `${hit ? "600 " : ""}${hit ? 10.5 : 9.5}px ${T.mono}`;
      const right = p.x > 6.5;
      ctx.textAlign = right ? "right" : "left"; ctx.textBaseline = "middle";
      ctx.fillText(p.t, f.x(p.x) + (right ? -8 : 8), f.y(p.y));
    });
    ctx.save(); ctx.translate(f.x(q.x), f.y(q.y)); ctx.rotate(Math.PI / 4);
    ctx.fillStyle = T.amber; ctx.fillRect(-6, -6, 12, 12); ctx.strokeStyle = T.fg; ctx.strokeRect(-6, -6, 12, 12); ctx.restore();
    const group = top[0].g;
    const sameGroup = top.every((p) => p.g === group);
    readout(document.getElementById("prim-nn-ro"), [["nearest", `"${top[0].t}"`], ["neighborhood", group]],
      sameGroup ? `All 3 nearest phrases are about ${group}, even ones that share no words with each other.` : "You're between neighborhoods, so the nearest phrases mix topics. A real query would be pulled toward one meaning.");
  };
  bindDrag(c, (p) => { if (f) { q = { x: clamp(f.invX(p.x), 0, 10), y: clamp(f.invY(p.y), 0, 10) }; render(); } }, (d, key) => { const vert = key === "ArrowUp" || key === "ArrowDown"; q = vert ? { x: q.x, y: clamp(q.y + d * 0.4, 0, 10) } : { x: clamp(q.x + d * 0.4, 0, 10), y: q.y }; render(); });
  redrawCallbacks.push(render);
}

/* ---- §0.h quantization in 1D ---- */
function primQuant({ getTokens, prepCanvas, redrawCallbacks }) {
  const c = document.getElementById("prim-q-canvas");
  if (!c) return;
  const VALS = [-0.83, -0.41, -0.12, 0.07, 0.33, 0.58, 0.9];
  let bits = 2;
  const render = () => {
    const T = getTokens();
    const { ctx, w, h } = prepCanvas(c);
    ctx.clearRect(0, 0, w, h);
    const f = makeFrame(w, h, { l: 16, r: 16, t: 10, b: 28 }, { x0: -1, x1: 1, y0: 0, y1: 1 });
    const L = 2 ** bits;
    const step = 2 / L;
    const levels = Array.from({ length: L }, (_, i) => -1 + step * (i + 0.5));
    const snap = (v) => levels.reduce((b, l) => (Math.abs(l - v) < Math.abs(b - v) ? l : b), levels[0]);
    const yLine = f.top + f.plotH * 0.62;
    ctx.strokeStyle = T.lineStrong; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(f.left, yLine); ctx.lineTo(f.right, yLine); ctx.stroke();
    levels.forEach((l) => { ctx.fillStyle = T.amber; ctx.fillRect(f.x(l) - 1.5, yLine - 9, 3, 18); });
    let maxErr = 0;
    VALS.forEach((v) => {
      const s = snap(v);
      maxErr = Math.max(maxErr, Math.abs(v - s));
      ctx.strokeStyle = T.blue; ctx.globalAlpha = 0.7;
      ctx.beginPath(); ctx.moveTo(f.x(v), f.top + 8); ctx.quadraticCurveTo((f.x(v) + f.x(s)) / 2, f.top + 18, f.x(s), yLine - 10); ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.beginPath(); ctx.arc(f.x(v), f.top + 8, 3.5, 0, Math.PI * 2); ctx.fillStyle = T.blue; ctx.fill();
    });
    ctx.fillStyle = T.muted; ctx.font = `10.5px ${T.mono}`; ctx.textAlign = "center"; ctx.textBaseline = "top";
    [-1, -0.5, 0, 0.5, 1].forEach((t) => ctx.fillText(String(t), f.x(t), f.bottom + 6));
    readout(document.getElementById("prim-q-ro"), [["bits", bits], ["levels", L], ["gap", step.toFixed(2)], ["max possible error", (step / 2).toFixed(2)], ["worst of these 7", maxErr.toFixed(2)]],
      bits === 1 ? "1 bit = 2 levels: every number becomes just + or −. Tiny, but crude." : `${bits} bits = ${L} levels. Going from ${bits - 1} to ${bits} bits halved the gap from ${(step * 2).toFixed(2)} to ${step.toFixed(2)}.`);
  };
  document.querySelectorAll("[data-pbits]").forEach((b) => b.addEventListener("click", () => {
    document.querySelectorAll("[data-pbits]").forEach((x) => x.classList.toggle("active", x === b));
    bits = Number(b.dataset.pbits);
    render();
  }));
  redrawCallbacks.push(render);
}
