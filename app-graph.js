/* ==========================================================================
   Knowledge graph walk (§4): a semantic knowledge graph computed live
   - A seeded toy forum of 4,000 posts across 5 topics
   - Edge weight = SKG relatedness of a word to the current foreground
     (z-score of "more often than chance", squashed to −1…+1, same as Demo 4.2)
   - Hop 2 narrows the foreground to posts with BOTH words, which is how a
     two-level traversal picks one meaning of an ambiguous word
   ========================================================================== */
import { readout } from "./chart-kit.js";

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export const KG_TOPICS = {
  network: { name: "network errors", tone: "brand", share: 0.3, words: { econnreset: 0.45, socket: 0.4, keepalive: 0.35, timeout: 0.4, retry: 0.35, proxy: 0.2, tcp: 0.3, connection: 0.45, pool: 0.2, node: 0.35, error: 0.5 } },
  database: { name: "databases", tone: "blue", share: 0.25, words: { postgres: 0.5, driver: 0.55, jdbc: 0.3, query: 0.4, index: 0.3, pool: 0.35, connection: 0.4, timeout: 0.25, deadlock: 0.2, migration: 0.2, error: 0.4 } },
  golf: { name: "golf", tone: "amber", share: 0.15, words: { driver: 0.55, swing: 0.45, tee: 0.35, fairway: 0.3, club: 0.45, slice: 0.25, putter: 0.2 } },
  rideshare: { name: "rideshare", tone: "coral", share: 0.15, words: { driver: 0.55, rider: 0.45, fare: 0.35, trip: 0.4, pickup: 0.3, surge: 0.2, rating: 0.25 } },
  billing: { name: "billing", tone: "muted", share: 0.15, words: { invoice: 0.5, refund: 0.4, vat: 0.25, payment: 0.45, receipt: 0.3, subscription: 0.3 } },
};
const COMMON = { the: 0.97, help: 0.3 };
export const KG_N = 4000;
const MIN_OCC = 5;
const THRESH = 0.2;

export function buildForum(seed = 3) {
  const rng = mulberry32(seed);
  const names = Object.keys(KG_TOPICS);
  const posts = [];
  for (let i = 0; i < KG_N; i += 1) {
    let r = rng(), topic = names[names.length - 1];
    for (const t of names) { r -= KG_TOPICS[t].share; if (r < 0) { topic = t; break; } }
    const set = new Set();
    for (const [w, p] of Object.entries(KG_TOPICS[topic].words)) if (rng() < p) set.add(w);
    for (const [w, p] of Object.entries(COMMON)) if (rng() < p) set.add(w);
    posts.push(set);
  }
  const df = new Map();
  posts.forEach((s) => s.forEach((w) => df.set(w, (df.get(w) || 0) + 1)));
  return { posts, df };
}

const squash = (z) => 2 / (1 + Math.exp(-z / 4)) - 1;

/** Relatedness of every word to the foreground = posts containing all `given` words. */
export function related(forum, given, exclude = new Set()) {
  const fg = forum.posts.filter((s) => given.every((g) => s.has(g)));
  const F = fg.length;
  const k = new Map();
  fg.forEach((s) => s.forEach((w) => k.set(w, (k.get(w) || 0) + 1)));
  const out = [];
  forum.df.forEach((n, w) => {
    if (given.includes(w) || exclude.has(w)) return;
    const kw = k.get(w) || 0;
    if (kw < MIN_OCC) return;
    const P = n / KG_N;
    const z = (kw - F * P) / Math.sqrt(F * P * (1 - P) || 1);
    out.push({ w, rel: squash(z), z, k: kw, n, fgSize: F });
  });
  return out.sort((a, b) => b.rel - a.rel);
}

export function topicOf(w) {
  let best = null, bv = -1;
  for (const [t, d] of Object.entries(KG_TOPICS)) {
    const v = (d.words[w] || 0) * d.share;
    if (v > bv) { bv = v; best = t; }
  }
  return bv > 0 ? best : null;
}

export function initGraphLab({ getTokens, prepCanvas, redrawCallbacks }) {
  const cv = document.getElementById("canvas-kg");
  if (!cv) return;
  const forum = buildForum();
  const chkHop2 = document.getElementById("chk-kg-hop2");
  const btnBack = document.getElementById("btn-kg-back");
  const trailEl = document.getElementById("kg-trail");
  let trail = ["econnreset"];
  let nodes = [];
  let pos = new Map();
  let anim = null;
  let hover = null;
  let sel = 0;
  const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function graph() {
    const center = trail[trail.length - 1];
    const hop1 = related(forum, [center]).filter((r) => r.rel >= THRESH).slice(0, 8);
    const list = [{ w: center, depth: 0, rel: 1 }];
    hop1.forEach((r, i) => list.push({ ...r, depth: 1, i, of: hop1.length }));
    if (chkHop2 && chkHop2.checked) {
      const shown = new Set(list.map((n) => n.w));
      // expand up to 3 neighbors, taking the best one from each different topic first
      const parents = [];
      hop1.forEach((p) => { if (parents.length < 3 && !parents.some((q) => topicOf(q.w) === topicOf(p.w))) parents.push(p); });
      hop1.forEach((p) => { if (parents.length < 3 && !parents.includes(p)) parents.push(p); });
      parents.forEach((p, pi) => {
        const kids = related(forum, [center, p.w], shown).filter((r) => r.rel >= THRESH).slice(0, 2);
        kids.forEach((kid, ci) => { shown.add(kid.w); list.push({ ...kid, depth: 2, parent: p.w, pi, ci, nk: kids.length }); });
      });
    }
    return list;
  }

  function layout(list, w, h) {
    const cx = w / 2, cy = h / 2 + 4;
    const rx = Math.min(w * 0.3, 260), ry = Math.min(h * 0.3, 130);
    const targets = new Map();
    const angle = new Map();
    list.forEach((n) => {
      if (n.depth === 0) targets.set(n.w, [cx, cy]);
      else if (n.depth === 1) {
        const a = -Math.PI / 2 + (n.i / n.of) * 2 * Math.PI;
        angle.set(n.w, a);
        targets.set(n.w, [cx + rx * Math.cos(a), cy + ry * Math.sin(a)]);
      }
    });
    list.forEach((n) => {
      if (n.depth !== 2) return;
      const a = angle.get(n.parent) + (n.nk === 1 ? 0 : (n.ci === 0 ? -0.24 : 0.24));
      targets.set(n.w, [cx + rx * 1.62 * Math.cos(a), cy + ry * 1.55 * Math.sin(a)]);
    });
    // keep every node (and its label) inside the canvas
    targets.forEach((p, k) => targets.set(k, [Math.max(40, Math.min(w - 40, p[0])), Math.max(30, Math.min(h - 30, p[1]))]));
    return targets;
  }

  function draw(T, list, P, w, h) {
    const { ctx } = prepCanvas(cv);
    ctx.clearRect(0, 0, w, h);
    const color = (word) => { const t = topicOf(word); return t ? T[KG_TOPICS[t].tone] : T.muted; };
    const center = list[0].w;
    // edges
    list.forEach((n) => {
      if (n.depth === 0) return;
      const from = P.get(n.depth === 1 ? center : n.parent), to = P.get(n.w);
      const hot = hover === n.w;
      ctx.strokeStyle = color(n.w);
      ctx.globalAlpha = hot ? 1 : n.depth === 1 ? 0.75 : 0.5;
      ctx.lineWidth = 1 + 6 * Math.max(0, n.rel);
      if (n.depth === 2) ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.moveTo(from[0], from[1]); ctx.lineTo(to[0], to[1]); ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
      if (n.depth === 1) {
        const mx = from[0] + (to[0] - from[0]) * 0.6, my = from[1] + (to[1] - from[1]) * 0.6;
        ctx.font = `600 11px ${T.mono}`;
        const txt = `+${n.rel.toFixed(2)}`;
        const tw = ctx.measureText(txt).width + 8;
        ctx.fillStyle = T.card; ctx.fillRect(mx - tw / 2, my - 8, tw, 16);
        ctx.strokeStyle = color(n.w); ctx.lineWidth = 1; ctx.strokeRect(mx - tw / 2 + 0.5, my - 7.5, tw - 1, 15);
        ctx.fillStyle = T.fg; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(txt, mx, my + 0.5);
      }
    });
    // nodes
    list.forEach((n, idx) => {
      const [x, y] = P.get(n.w);
      const r = n.depth === 0 ? 11 : n.depth === 1 ? 8 : 6;
      const col = color(n.w);
      ctx.fillStyle = n.depth === 0 ? col : T.card;
      ctx.strokeStyle = col; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(x, y, r, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
      if (hover === n.w || (n.depth === 1 && idx === sel + 1 && document.activeElement === cv)) {
        ctx.strokeStyle = T.fg; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(x, y, r + 4, 0, 2 * Math.PI); ctx.stroke();
      }
      ctx.font = `${n.depth === 0 ? "700 13px" : n.depth === 1 ? "600 11.5px" : "11px"} ${T.mono}`;
      ctx.fillStyle = n.depth === 2 ? T.muted : T.fg;
      ctx.textAlign = "center"; ctx.textBaseline = "top";
      const below = y >= h / 2 + 4 || n.depth === 0;
      ctx.textBaseline = below ? "top" : "bottom";
      const ly = below ? y + r + 4 : y - r - 4, lw = ctx.measureText(n.w).width + 6, lh = n.depth === 0 ? 16 : 14;
      ctx.fillStyle = T.card; ctx.globalAlpha = 0.85;
      ctx.fillRect(x - lw / 2, below ? ly - 1 : ly - lh + 1, lw, lh);
      ctx.globalAlpha = 1;
      ctx.fillStyle = n.depth === 2 ? T.muted : T.fg;
      ctx.fillText(n.w, x, ly);
    });
  }

  function render(animate = false) {
    const T = getTokens();
    const { w, h } = prepCanvas(cv);
    nodes = graph();
    const targets = layout(nodes, w, h);
    const start = new Map();
    nodes.forEach((n) => start.set(n.w, pos.get(n.w) || targets.get(nodes[0].w)));
    if (anim) cancelAnimationFrame(anim);
    if (!animate || reduce) {
      pos = targets;
      draw(T, nodes, pos, w, h);
    } else {
      const t0 = performance.now();
      const step = (now) => {
        const t = Math.min(1, (now - t0) / 380), e = 1 - Math.pow(1 - t, 3);
        const P = new Map();
        nodes.forEach((n) => { const a = start.get(n.w), b = targets.get(n.w); P.set(n.w, [a[0] + (b[0] - a[0]) * e, a[1] + (b[1] - a[1]) * e]); });
        pos = P;
        draw(getTokens(), nodes, P, w, h);
        if (t < 1) anim = requestAnimationFrame(step); else { anim = null; pos = targets; }
      };
      anim = requestAnimationFrame(step);
    }
    updateText();
  }

  function updateText() {
    const center = nodes[0].w;
    const hop1 = nodes.filter((n) => n.depth === 1);
    trailEl.textContent = trail.join(" → ");
    btnBack.disabled = trail.length < 2;
    const topics = [...new Set(hop1.filter((n) => n.rel >= 0.3).map((n) => topicOf(n.w)).filter(Boolean))];
    const top3 = hop1.slice(0, 3).map((n) => `${n.w} (+${n.rel.toFixed(2)})`).join(", ");
    let verdict, tone = "";
    if (!hop1.length) verdict = `Nothing clears the bar for "${center}": it is too common or too rare to have strong neighbors.`;
    else if (trail.length > 1) {
      verdict = `The foreground is now the posts about "${center}". Its strongest neighbors: ${top3}.`;
    } else if (topics.length >= 2) {
      const hop2 = nodes.filter((n) => n.depth === 2);
      if (hop2.length) {
        const branches = [...new Set(hop2.map((n) => n.parent))].map((p) => `${p} → ${hop2.filter((n) => n.parent === p).map((n) => n.w).join(", ")}`).join("; ");
        verdict = `Each dashed branch uses only posts with both words, so it stays inside one meaning: ${branches}.`;
      } else {
        verdict = `"${center}" has more than one meaning: its strong neighbors come from ${topics.map((t) => KG_TOPICS[t].name).join(", ")}. Expanding it blindly would mix them. Turn on hop 2: each branch stays inside one meaning.`;
      }
      tone = "warn";
    } else {
      const the = related(forum, [center]).find((r) => r.w === "the");
      const theTxt = the ? ` (${the.rel >= 0 ? "+" : "−"}${Math.abs(the.rel).toFixed(2)} here, chance noise)` : "";
      verdict = `All of the strongest neighbors of "${center}" come from ${topics.length ? KG_TOPICS[topics[0]].name : "one topic"}: ${top3}. Words like "the" never show up: they appear everywhere, so their relatedness stays near 0${theTxt}.`;
    }
    const fg = forum.posts.filter((p) => p.has(center)).length;
    readout(document.getElementById("ro-kg"), [["center", center], ["posts with it", fg.toLocaleString()], ["neighbors", hop1.length]], verdict, tone);
  }

  function go(word) {
    if (!word || word === trail[trail.length - 1]) return;
    trail.push(word);
    sel = 0;
    render(true);
  }

  function hitTest(x, y) {
    let best = null, bd = 22;
    nodes.forEach((n) => { const p = pos.get(n.w); if (!p) return; const d = Math.hypot(p[0] - x, p[1] - y); if (d < bd) { bd = d; best = n.w; } });
    return best;
  }
  const local = (e) => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  cv.addEventListener("click", (e) => { const w = hitTest(...local(e)); if (w) go(w); });
  cv.addEventListener("pointermove", (e) => {
    const w = hitTest(...local(e));
    cv.style.cursor = w && w !== nodes[0].w ? "pointer" : "default";
    if (w !== hover) { hover = w; if (!anim) draw(getTokens(), nodes, pos, cv.getBoundingClientRect().width, cv.getBoundingClientRect().height); }
  });
  cv.addEventListener("pointerleave", () => { hover = null; if (!anim) draw(getTokens(), nodes, pos, cv.getBoundingClientRect().width, cv.getBoundingClientRect().height); });
  cv.addEventListener("keydown", (e) => {
    const hop1 = nodes.filter((n) => n.depth === 1);
    if (!hop1.length) return;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") sel = (sel + 1) % hop1.length;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") sel = (sel - 1 + hop1.length) % hop1.length;
    else if (e.key === "Enter" || e.key === " ") { go(hop1[sel].w); e.preventDefault(); return; }
    else if (e.key === "Backspace") { btnBack.click(); e.preventDefault(); return; }
    else return;
    e.preventDefault();
    hover = hop1[sel].w;
    const live = document.getElementById("kg-live");
    if (live) live.textContent = `Selected ${hop1[sel].w}, relatedness ${hop1[sel].rel.toFixed(2)}, ${sel + 1} of ${hop1.length}. Press Enter to hop.`;
    draw(getTokens(), nodes, pos, cv.getBoundingClientRect().width, cv.getBoundingClientRect().height);
  });
  document.querySelectorAll("[data-kg-start]").forEach((b) => b.addEventListener("click", () => {
    document.querySelectorAll("[data-kg-start]").forEach((x) => x.classList.toggle("active", x === b));
    trail = [b.dataset.kgStart];
    sel = 0;
    render(true);
  }));
  btnBack.addEventListener("click", () => { if (trail.length > 1) { trail.pop(); render(true); } });
  if (chkHop2) chkHop2.addEventListener("change", () => render(true));
  redrawCallbacks.push(() => render(false));
  render(false);
}
