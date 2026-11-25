/* ==========================================================================
   Two small ranking labs
   - §0: rank two documents for the query "apple juice": cosine vs dot product
   - §3: the same two pages under two searches: added vs multiplied boost
   ========================================================================== */
import { makeFrame, axes, legend, refLine, Placer, handle, bindDrag, readout, reserveHint } from "./chart-kit.js";

/* ---------------- §0 · cosine vs dot for a real query ---------------- */
const Q = [1, 1]; // "apple juice": one of each word

export function cosDot(d) {
  const dot = Q[0] * d[0] + Q[1] * d[1];
  const n = Math.hypot(d[0], d[1]);
  return { dot, cos: n ? dot / (Math.hypot(Q[0], Q[1]) * n) : 0 };
}

function initQueryCosLab(getTokens, prepCanvas, redrawCallbacks) {
  const cPlot = document.getElementById("canvas-qcos");
  const cRank = document.getElementById("canvas-qcos-rank");
  if (!cPlot || !cRank) return;
  const ids = ["d1a", "d1j", "d2a", "d2j"];
  const sl = Object.fromEntries(ids.map((k) => [k, document.getElementById(`sl-qcos-${k}`)]));
  const docs = () => [[Number(sl.d1a.value), Number(sl.d1j.value)], [Number(sl.d2a.value), Number(sl.d2j.value)]];

  function render() {
    const T = getTokens();
    const [d1, d2] = docs();
    ids.forEach((k) => { document.getElementById(`val-qcos-${k}`).textContent = `${sl[k].value}×`; });
    const r1 = cosDot(d1), r2 = cosDot(d2);
    const colors = [T.blue, T.amber];

    // left: the term space
    {
      const { ctx, w, h } = prepCanvas(cPlot);
      ctx.clearRect(0, 0, w, h);
      const f = makeFrame(w, h, { l: 40, r: 14, t: 14, b: 34 }, { x0: 0, x1: 6, y0: 0, y1: 6 });
      const P = new Placer(f);
      axes(ctx, T, f, { xTicks: [0, 2, 4, 6], yTicks: [0, 2, 4, 6], xTitle: "apple (count)", yTitle: "juice" });
      const arrow = (v, col, width, dash) => {
        const x0 = f.x(0), y0 = f.y(0), x1 = f.x(v[0]), y1 = f.y(v[1]);
        ctx.strokeStyle = col; ctx.lineWidth = width; ctx.setLineDash(dash || []);
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); ctx.setLineDash([]);
        const a = Math.atan2(y1 - y0, x1 - x0), L = 9;
        if (Math.hypot(x1 - x0, y1 - y0) > 4) {
          ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(x1, y1);
          ctx.lineTo(x1 - L * Math.cos(a - 0.4), y1 - L * Math.sin(a - 0.4)); ctx.lineTo(x1 - L * Math.cos(a + 0.4), y1 - L * Math.sin(a + 0.4)); ctx.closePath(); ctx.fill();
        }
        return [x1, y1];
      };
      // query direction, extended so the angle is easy to see
      ctx.strokeStyle = T.brand; ctx.globalAlpha = 0.35; ctx.setLineDash([3, 4]); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(f.x(0), f.y(0)); ctx.lineTo(f.x(6), f.y(6)); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
      const tips = [arrow(d1, colors[0], 2.5), arrow(d2, colors[1], 2.5)];
      const qt = arrow(Q, T.brand, 3);
      ctx.font = `600 11px ${T.mono}`; ctx.textBaseline = "middle"; ctx.textAlign = "left";
      [["query", qt, T.brand], ["Doc 1", tips[0], colors[0]], ["Doc 2", tips[1], colors[1]]].forEach(([lab, p, col]) => {
        const tw = ctx.measureText(lab).width;
        const b = P.pick([{ x: p[0] + 8, y: p[1] - 17, w: tw, h: 14 }, { x: p[0] - 8 - tw, y: p[1] - 17, w: tw, h: 14 }, { x: p[0] + 8, y: p[1] + 3, w: tw, h: 14 }, { x: p[0] - 8 - tw, y: p[1] + 3, w: tw, h: 14 }]);
        ctx.fillStyle = col; ctx.fillText(lab, b.x, b.y + 7);
      });
    }

    // right: the two rankings
    {
      const { ctx, w, h } = prepCanvas(cRank);
      ctx.clearRect(0, 0, w, h);
      const groups = [
        { name: "Cosine (direction)", vals: [r1.cos, r2.cos], max: 1, fmt: (v) => v.toFixed(2) },
        { name: "Dot product (direction × length)", vals: [r1.dot, r2.dot], max: Math.max(2, r1.dot, r2.dot), fmt: (v) => v.toFixed(0) },
      ];
      const l = 64, rr = 84, gh = (h - 16) / 2;
      groups.forEach((g, gi) => {
        const y0 = 8 + gi * gh;
        ctx.font = `600 11px ${T.mono}`; ctx.fillStyle = T.fg; ctx.textAlign = "left"; ctx.textBaseline = "top";
        ctx.fillText(g.name, 8, y0);
        const winner = Math.abs(g.vals[0] - g.vals[1]) < 1e-9 ? -1 : g.vals[0] > g.vals[1] ? 0 : 1; // float-safe tie
        g.vals.forEach((v, i) => {
          const y = y0 + 24 + i * 30, bw = Math.max(2, ((w - l - rr) * v) / g.max);
          ctx.fillStyle = T.muted; ctx.font = `11px ${T.mono}`; ctx.textBaseline = "middle";
          ctx.fillText(`Doc ${i + 1}`, 8, y + 9);
          ctx.fillStyle = colors[i]; ctx.globalAlpha = winner === i || winner === -1 ? 1 : 0.45;
          ctx.fillRect(l, y, bw, 18); ctx.globalAlpha = 1;
          ctx.fillStyle = T.fg; ctx.font = `600 11px ${T.mono}`;
          ctx.fillText(`${g.fmt(v)}${winner === i ? "  ← #1" : ""}`, l + bw + 6, y + 9);
        });
      });
    }

    const first = (a, b) => (Math.abs(a - b) < 1e-9 ? "a tie" : a > b ? "Doc 1" : "Doc 2");
    const cosWin = first(r1.cos, r2.cos), dotWin = first(r1.dot, r2.dot);
    const agree = cosWin === dotWin;
    readout(document.getElementById("ro-qcos"),
      [["Doc 1", `cos ${r1.cos.toFixed(2)} · dot ${r1.dot}`], ["Doc 2", `cos ${r2.cos.toFixed(2)} · dot ${r2.dot}`]],
      agree ? (cosWin === "a tie" ? "Both measures call it a tie." : `Both measures rank ${cosWin} first.`)
        : cosWin === "a tie" ? `Cosine calls it a tie (both sit at the same angle to the query), but the dot product ranks ${dotWin} first because it repeats the words more.`
        : `They disagree: cosine ranks ${cosWin} first (closest to the query's direction), the dot product ranks ${dotWin} first (more repeats). Repetition winning is the same problem BM25 caps with k₁.`,
      agree ? "" : "warn");
  }

  ids.forEach((k) => sl[k].addEventListener("input", render));
  redrawCallbacks.push(render);
  render();
}

/* ---------------- §3 · one boost, two searches ---------------- */
export const BOOST_PAGES = {
  E: { name: "Error Code List", pop: 0.2, bm25: { rare: 12.0, common: 1.2 } },
  G: { name: "Troubleshooting Guide", pop: 0.9, bm25: { rare: 9.0, common: 0.9 } },
};
export const boostScore = (page, q, w, mode) => (mode === "plus" ? page.bm25[q] + w * page.pop : page.bm25[q] * (1 + w * page.pop));

function initTwoSearchLab(getTokens, prepCanvas, redrawCallbacks) {
  const c = document.getElementById("canvas-boost2");
  const sl = document.getElementById("sl-boost2-w");
  if (!c || !sl) return;
  let f = null;
  const { E, G } = BOOST_PAGES;
  // lead of the Error Code List, as a share of the bigger score (0 = tie)
  const lead = (q, w, mode) => { const a = boostScore(E, q, w, mode), b = boostScore(G, q, w, mode); return (a - b) / Math.max(a, b); };

  function render() {
    const T = getTokens();
    const w = Number(sl.value);
    document.getElementById("val-boost2-w").textContent = w.toFixed(2);
    const { ctx, w: W, h } = prepCanvas(c);
    ctx.clearRect(0, 0, W, h);
    f = makeFrame(W, h, { l: 52, r: 14, t: 16, b: 36 }, { x0: 0, x1: 3, y0: -0.6, y1: 0.8 });
    const P = new Placer(f);
    reserveHint(P, c);
    axes(ctx, T, f, { xTicks: [0, 0.5, 1, 1.5, 2, 2.5, 3], yTicks: [-0.6, -0.4, -0.2, 0, 0.2, 0.4, 0.6, 0.8], yFmt: (v) => `${Math.round(v * 100)}%`, xTitle: "boost weight w", yTitle: "Error Code List lead" });
    refLine(ctx, T, f, { y: 0, label: "tie", color: T.muted, dash: [4, 4] }, P);
    const line = (q, mode, color, dash, width) => {
      ctx.strokeStyle = color; ctx.lineWidth = width; ctx.setLineDash(dash || []);
      ctx.beginPath();
      for (let i = 0; i <= 120; i += 1) { const x = (i / 120) * 3, y = lead(q, x, mode); if (i === 0) ctx.moveTo(f.x(x), f.y(y)); else ctx.lineTo(f.x(x), f.y(y)); }
      ctx.stroke(); ctx.setLineDash([]);
    };
    line("rare", "plus", T.coral, null, 2);
    line("common", "plus", T.coral, [6, 4], 2);
    line("rare", "times", T.brand, null, 4);
    line("common", "times", T.fg, [3, 5], 1.5); // sits exactly on top of the solid green line
    ctx.strokeStyle = T.amber; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(f.x(w), f.top); ctx.lineTo(f.x(w), f.bottom); ctx.stroke();
    handle(ctx, T, f.x(w), f.bottom - 8, T.amber);
    legend(ctx, T, f, [
      { label: "plus · ECONNRESET", color: T.coral, kind: "line" },
      { label: "plus · connection", color: T.coral, kind: "dash" },
      { label: "times · both searches (same line)", color: T.brand, kind: "line" },
    ], P, "tr");

    const cell = (q, mode) => {
      const a = boostScore(E, q, w, mode), b = boostScore(G, q, w, mode);
      const win = Math.abs(a - b) < 1e-9 ? "tie" : a > b ? E.name : G.name;
      const el = document.getElementById(`boost2-${mode}-${q}`);
      el.innerHTML = `<b>${win}</b><span>${a.toFixed(2)} vs ${b.toFixed(2)}</span>`;
      el.className = `b2-cell ${win === E.name ? "e" : win === G.name ? "g" : ""}`;
      return win;
    };
    const pr = cell("rare", "plus"), pc = cell("common", "plus"), tr = cell("rare", "times"), tc = cell("common", "times");
    const plusAgree = pr === pc, timesAgree = tr === tc;
    readout(document.getElementById("ro-boost2"), [["w", w.toFixed(2)], ["plus", plusAgree ? "searches agree" : "searches disagree"], ["times", timesAgree ? "searches agree" : "searches disagree"]],
      !plusAgree
        ? `Same two pages, same boost, but "plus" picks ${pr} for ECONNRESET and ${pc} for connection. The added ${(w * 0.9).toFixed(2)} points are small next to ECONNRESET's big scores and huge next to connection's tiny ones. "Times" scales with each search, so both searches agree.`
        : `Both modes agree at this weight. Drag w past about 0.43 and watch the dashed red line (plus · connection) cross the tie line, while the solid one (plus · ECONNRESET) stays above it.`,
      plusAgree ? "" : "warn");
  }

  sl.addEventListener("input", render);
  bindDrag(c, (p) => { if (!f) return; sl.value = String(Math.max(0, Math.min(3, Math.round(f.invX(p.x) * 20) / 20))); render(); },
    (d) => { sl.value = String(Math.max(0, Math.min(3, Number(sl.value) + d * 0.05))); render(); });
  redrawCallbacks.push(render);
  render();
}

export function initRankingLabs({ getTokens, prepCanvas, redrawCallbacks }) {
  initQueryCosLab(getTokens, prepCanvas, redrawCallbacks);
  initTwoSearchLab(getTokens, prepCanvas, redrawCallbacks);
}
