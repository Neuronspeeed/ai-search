/* ==========================================================================
   Gap-fill labs:
   - DEMO 3.2: Field boosts (qf), phrase boosts (pf2) & the explain tree
   - DEMO 5.2: Learning spelling corrections from query logs
   - DEMO 7.2: Prefix vs. semantic autocomplete
   ========================================================================== */
import { DOCS_CORPUS, analyzeText, bm25Idf, bm25TfNorm } from "./data.js";
import { readout, makeFrame, axes, curve, callout, refLine, Placer, legend, handle, bindDrag, reserveHint } from "./chart-kit.js";

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/* --------------------------------------------------------------------------
   DEMO 3.2 — pure scoring
   -------------------------------------------------------------------------- */
const K1 = 1.2;
const B = 0.75;
const N_DOCS = DOCS_CORPUS.length;

export const FIELD_DOCS = DOCS_CORPUS.map((doc) => {
  const titleToks = analyzeText(doc.title).tokens;
  const titleTf = {};
  titleToks.forEach((t) => { titleTf[t] = (titleTf[t] || 0) + 1; });
  return { doc, titleTf, titleLen: titleToks.length, bodySeq: analyzeText(doc.text).tokens };
});
const AVG_TITLE = FIELD_DOCS.reduce((s, f) => s + f.titleLen, 0) / N_DOCS;
const AVG_BODY = DOCS_CORPUS.reduce((s, d) => s + d.length, 0) / N_DOCS;

function fieldTf(fd, term, field) {
  return field === "title" ? fd.titleTf[term] || 0 : fd.doc.tf[term] || 0;
}

function fieldDf(term, field) {
  return FIELD_DOCS.reduce((c, fd) => c + (fieldTf(fd, term, field) > 0 ? 1 : 0), 0);
}

function fieldTerm(fd, term, field) {
  const tf = fieldTf(fd, term, field);
  const df = fieldDf(term, field);
  if (tf <= 0 || df <= 0) return null;
  const dl = field === "title" ? fd.titleLen : fd.doc.length;
  const avgdl = field === "title" ? AVG_TITLE : AVG_BODY;
  const idf = bm25Idf(df, N_DOCS);
  const tfPart = bm25TfNorm(tf, K1, B, dl / avgdl);
  return { term, tf, df, dl, avgdl, idf, tfPart, score: idf * tfPart };
}

function hasBigram(seq, a, b) {
  for (let i = 0; i < seq.length - 1; i += 1) {
    if (seq[i] === a && seq[i + 1] === b) return true;
  }
  return false;
}

export function scoreFields(fd, tokens, wTitle, wBody, wPf2) {
  const title = tokens.map((t) => fieldTerm(fd, t, "title")).filter(Boolean);
  const body = tokens.map((t) => fieldTerm(fd, t, "body")).filter(Boolean);
  const titleRaw = title.reduce((s, x) => s + x.score, 0);
  const bodyRaw = body.reduce((s, x) => s + x.score, 0);
  const phrases = [];
  for (let i = 0; i < tokens.length - 1; i += 1) {
    const [a, b] = [tokens[i], tokens[i + 1]];
    if (hasBigram(fd.bodySeq, a, b)) {
      const idfSum = bm25Idf(fieldDf(a, "body"), N_DOCS) + bm25Idf(fieldDf(b, "body"), N_DOCS);
      phrases.push({ pair: `${a} ${b}`, raw: idfSum });
    }
  }
  const phraseRaw = phrases.reduce((s, p) => s + p.raw, 0);
  const total = wTitle * titleRaw + wBody * bodyRaw + wPf2 * phraseRaw;
  return { total, title, body, titleRaw, bodyRaw, phrases, phraseRaw };
}

/* --------------------------------------------------------------------------
   DEMO 5.2 — pure data & math (distinct users per searched word)
   -------------------------------------------------------------------------- */
export const QUERY_LOG = [
  { word: "econnreset", users: 1840 },
  { word: "timeout", users: 1520 },
  { word: "retry", users: 1310 },
  { word: "socket", users: 700 },
  { word: "keepalive", users: 640 },
  { word: "invoice", users: 590 },
  { word: "webhook", users: 520 },
  { word: "backoff", users: 480 },
  { word: "pool", users: 450 },
  { word: "idempotent", users: 210 },
  { word: "timout", users: 48, fix: "timeout" },
  { word: "pull", users: 30, real: true },
  { word: "econreset", users: 31, fix: "econnreset" },
  { word: "econnrest", users: 22, fix: "econnreset" },
  { word: "idempotant", users: 14, fix: "idempotent" },
  { word: "sockt", users: 13, fix: "socket" },
  { word: "tiemout", users: 12, fix: "timeout" },
  { word: "invoce", users: 11, fix: "invoice" },
  { word: "backof", users: 10, fix: "backoff" },
  { word: "rety", users: 9, fix: "retry" },
  { word: "webhok", users: 8, fix: "webhook" },
  { word: "keepalve", users: 7, fix: "keepalive" },
  { word: "idempontent", users: 6, fix: "idempotent" },
  { word: "keepalivee", users: 5, fix: "keepalive" },
  { word: "retyr", users: 4, fix: "retry" },
];

export function quantile(values, q) {
  const v = [...values].sort((a, b) => a - b);
  const pos = q * (v.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return v[lo] + (v[hi] - v[lo]) * (pos - lo);
}

export function levenshtein(a, b) {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j += 1) dp[0][j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[a.length][b.length];
}

// Length-scaled rule: allowed edits grow with word length
export function goodMatch(len1, len2, dist, rule = "book") {
  if (rule === "flat") return dist >= 1 && dist <= 2;
  const m = Math.min(len1, len2);
  return (m < 8 && dist === 1) || (m >= 8 && m < 11 && dist <= 2) || (m >= 11 && dist <= 3);
}

export function learnCorrections(lowQ, highQ, rule) {
  const counts = QUERY_LOG.map((r) => r.users);
  const lowCut = quantile(counts, lowQ);
  const highCut = quantile(counts, highQ);
  const typos = QUERY_LOG.filter((r) => r.users <= lowCut);
  const fixes = QUERY_LOG.filter((r) => r.users >= highCut);
  const learned = [];
  for (const t of typos) {
    const options = fixes
      .filter((f) => f.word !== t.word && f.word[0] === t.word[0])
      .map((f) => ({ f, dist: levenshtein(t.word, f.word) }))
      .filter(({ f, dist }) => goodMatch(t.word.length, f.word.length, dist, rule))
      .sort((a, b) => b.f.users - a.f.users);
    if (options.length) {
      const best = options[0];
      learned.push({ from: t.word, to: best.f.word, dist: best.dist, ok: t.fix === best.f.word });
    }
  }
  const learnedFrom = new Set(learned.map((l) => l.from));
  const missed = QUERY_LOG.filter((r) => r.fix && !learnedFrom.has(r.word));
  return { lowCut, highCut, typos, fixes, learned, missed };
}

/* --------------------------------------------------------------------------
   DEMO 7.2 — concept vocabulary with toy embeddings
   dims: [conn-reset, timeout, retry/backoff, rate-limit, billing, idempotency, pooling]
   -------------------------------------------------------------------------- */
export const CONCEPTS = [
  { text: "econnreset error", v: [1, 0.1, 0.2, 0, 0, 0, 0.3] },
  { text: "connection reset by peer", v: [0.95, 0.1, 0.1, 0, 0, 0, 0.3] },
  { text: "socket hang up", v: [0.9, 0.3, 0.1, 0, 0, 0, 0.2] },
  { text: "keepalive sockets", v: [0.5, 0.1, 0, 0, 0, 0, 1] },
  { text: "idle connection pool", v: [0.45, 0.15, 0, 0, 0, 0, 0.95] },
  { text: "connect timeout", v: [0.3, 0.9, 0.1, 0, 0, 0, 0.2] },
  { text: "request timeout", v: [0.2, 1, 0.2, 0, 0, 0, 0.1] },
  { text: "read timeout", v: [0.15, 0.95, 0.1, 0, 0, 0, 0.1] },
  { text: "retry with backoff", v: [0.2, 0.2, 1, 0.3, 0, 0.2, 0] },
  { text: "exponential backoff", v: [0.1, 0.1, 0.95, 0.4, 0, 0.1, 0] },
  { text: "rate limit 429", v: [0, 0, 0.4, 1, 0, 0, 0] },
  { text: "too many requests", v: [0, 0.05, 0.3, 0.95, 0, 0, 0] },
  { text: "retry-after header", v: [0, 0, 0.6, 0.8, 0, 0, 0] },
  { text: "idempotent request", v: [0, 0, 0.5, 0, 0.1, 1, 0] },
  { text: "duplicate charges", v: [0, 0, 0.2, 0, 0.6, 0.8, 0] },
  { text: "billing invoice", v: [0, 0, 0, 0, 1, 0, 0] },
  { text: "reset billing password", v: [0.05, 0, 0, 0, 0.9, 0, 0] },
];

export const AUTOCOMPLETE_PRESETS = {
  socket: { typed: "socket hang", v: [0.9, 0.3, 0.1, 0, 0, 0, 0.25] },
  dropped: { typed: "conn dropped", v: [0.85, 0.2, 0.1, 0, 0, 0, 0.5] },
  slow: { typed: "slow api", v: [0.15, 0.9, 0.2, 0.1, 0, 0, 0.1] },
  toomany: { typed: "too many", v: [0, 0.05, 0.3, 0.95, 0, 0, 0] },
  idem: { typed: "idem", v: [0, 0, 0.5, 0, 0.15, 1, 0] },
};

export function cosine(a, b) {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}

export function suggest(presetKey, k = 5) {
  const p = AUTOCOMPLETE_PRESETS[presetKey];
  const typed = p.typed.toLowerCase();
  const prefix = CONCEPTS.filter((c) => c.text.startsWith(typed));
  const semantic = CONCEPTS.map((c) => ({ ...c, sim: cosine(p.v, c.v) }))
    .sort((a, b) => b.sim - a.sim)
    .slice(0, k);
  return { typed: p.typed, prefix, semantic };
}

/* ==========================================================================
   DOM wiring
   ========================================================================== */
/* --------------------------------------------------------------------------
   DEMO 3.3 — business factors (news search for "basketball")
   -------------------------------------------------------------------------- */
export const NEWS_DOCS = [
  { id: "n1", title: "Basketball: The Complete Rules Guide", bm25: 9.2, days: 1460, km: 4000, pop: 300 },
  { id: "n2", title: "Local High School Wins Basketball Final", bm25: 6.1, days: 1, km: 8, pop: 900 },
  { id: "n3", title: "Pro Basketball Trade Deadline Recap", bm25: 7.4, days: 2, km: 1200, pop: 5200 },
  { id: "n4", title: "Downtown Basketball Court Reopens", bm25: 5.0, days: 5, km: 3, pop: 400 },
  { id: "n5", title: "A History of Basketball in Europe", bm25: 8.3, days: 900, km: 7000, pop: 150 },
  { id: "n6", title: "City League Basketball Signups Open", bm25: 5.6, days: 12, km: 5, pop: 250 },
];
const MAX_BM25 = Math.max(...NEWS_DOCS.map((d) => d.bm25));
const MAX_POP = Math.max(...NEWS_DOCS.map((d) => d.pop));

export function newsFeatures(d) {
  return {
    text: d.bm25 / MAX_BM25, // BM25 scaled to 0–1
    fresh: 1 / (1 + d.days / 7), // reciprocal decay: 1 week old ≈ 0.5
    near: 1 / (1 + d.km / 50), // reciprocal distance: 50 km away ≈ 0.5
    pop: Math.log1p(d.pop) / Math.log1p(MAX_POP), // log-scaled clicks
  };
}

export function rankNews(w) {
  return NEWS_DOCS.map((d) => {
    const f = newsFeatures(d);
    const parts = { text: w.text * f.text, fresh: w.fresh * f.fresh, near: w.near * f.near, pop: w.pop * f.pop };
    return { d, f, parts, total: parts.text + parts.fresh + parts.near + parts.pop };
  }).sort((a, b) => b.total - a.total);
}

/* --------------------------------------------------------------------------
   DEMO 4.2 — raw signals log → boosts
   5 fields per event: query_id, signal_time, user, type, target
   -------------------------------------------------------------------------- */
export const SIGNAL_WEIGHTS = { click: 1, copy_code: 10, helpful: 25, not_helpful: -20 };

function q(id, time, user, text, results, actions) {
  const rows = [
    { query_id: id, signal_time: time, user, type: "query", target: text },
    { query_id: id, signal_time: time, user, type: "results", target: results.join(",") },
  ];
  actions.forEach(([type, doc], i) => rows.push({ query_id: id, signal_time: time + i + 1, user, type, target: doc }));
  return rows;
}

export const SIGNALS_LOG = [
  ...q("q1", 100, "u1", "ECONNRESET", ["d5", "d1", "d2"], [["click", "d5"], ["not_helpful", "d5"], ["click", "d1"], ["copy_code", "d1"]]),
  ...q("q2", 200, "u2", "econnreset", ["d5", "d1", "d2"], [["click", "d1"], ["helpful", "d1"]]),
  ...q("q3", 300, "u3", " EconnReset ", ["d5", "d1", "d2"], [["click", "d5"], ["not_helpful", "d5"]]),
  ...q("q4", 400, "u4", "econnreset", ["d5", "d1", "d2"], [["click", "d2"], ["copy_code", "d2"]]),
  ...q("q5", 500, "u5", "Econnreset", ["d5", "d1", "d2"], [["click", "d1"], ["copy_code", "d1"]]),
  // u9 is a bot hammering the stuffed FAQ: one search, 30 clicks
  ...q("q6", 600, "u9", "econnreset", ["d5", "d1", "d2"], Array.from({ length: 30 }, () => ["click", "d5"])),
];

export function normalizeQueryKey(text, on) {
  return on ? text.toLowerCase().trim().replace(/\s+/g, " ") : text;
}

export function aggregateBoosts(lookup, opts) {
  const queryText = {};
  SIGNALS_LOG.filter((r) => r.type === "query").forEach((r) => { queryText[r.query_id] = r.target; });
  const key = normalizeQueryKey(lookup, opts.normalize);
  const seen = new Set();
  const boosts = {};
  let used = 0;
  for (const r of SIGNALS_LOG) {
    if (!(r.type in SIGNAL_WEIGHTS)) continue;
    const w = SIGNAL_WEIGHTS[r.type];
    if (w < 0 && !opts.negatives) continue;
    if (normalizeQueryKey(queryText[r.query_id], opts.normalize) !== key) continue;
    if (opts.onePerUser) {
      const k = `${r.user}|${r.target}|${r.type}`;
      if (seen.has(k)) continue;
      seen.add(k);
    }
    boosts[r.target] = (boosts[r.target] || 0) + w;
    used += 1;
  }
  const ranked = Object.entries(boosts).map(([doc, boost]) => ({ doc, boost })).sort((a, b) => b.boost - a.boost);
  return { key, ranked, used };
}

/* --------------------------------------------------------------------------
   DEMO 6.5 — a tiny LambdaMART-style tree (illustrative)
   -------------------------------------------------------------------------- */
export function treeLeaf(title, overview) {
  if (title > 2) return overview > 2 ? { path: ["t", "t-yes", "o2-yes"], score: 12 } : { path: ["t", "t-yes", "o2-no"], score: 7 };
  return overview > 10 ? { path: ["t", "t-no", "o10-yes"], score: 8 } : { path: ["t", "t-no", "o10-no"], score: 1 };
}

/* --------------------------------------------------------------------------
   DEMO 7.3 — blending two concepts in a toy 2D embedding space
   -------------------------------------------------------------------------- */
export const CONCEPT_POINTS = [
  { id: "puppy", label: "puppy (photo)", x: 1.5, y: 1.6 },
  { id: "kitten", label: "kitten (photo)", x: 0.9, y: 2.7 },
  { id: "vader", label: "Darth Vader (photo)", x: 8.5, y: 4.0 },
  { id: "trooper", label: "stormtrooper helmet", x: 9.1, y: 3.0 },
  { id: "pupvader", label: "puppy in a Darth Vader costume", x: 5.1, y: 2.9, blend: true, below: true },
  { id: "car", label: "sporty car (photo)", x: 2.0, y: 8.4 },
  { id: "racecar", label: "race car on a track", x: 1.2, y: 9.3 },
  { id: "hero", label: "\"superhero\" (text)", x: 8.0, y: 7.1 },
  { id: "flying", label: "superhero flying", x: 8.8, y: 8.1 },
  { id: "herocar", label: "superhero on a sporty car", x: 4.9, y: 7.6, blend: true },
];
export const BLEND_PAIRS = {
  vader: { a: "puppy", b: "vader" },
  car: { a: "car", b: "hero" },
};

export function blendQuery(pairKey, alpha) {
  const p = BLEND_PAIRS[pairKey];
  const A = CONCEPT_POINTS.find((c) => c.id === p.a);
  const Bp = CONCEPT_POINTS.find((c) => c.id === p.b);
  const qx = (1 - alpha) * A.x + alpha * Bp.x;
  const qy = (1 - alpha) * A.y + alpha * Bp.y;
  const ranked = CONCEPT_POINTS.map((c) => ({ ...c, dist: Math.hypot(c.x - qx, c.y - qy) })).sort((x, y) => x.dist - y.dist);
  return { A, B: Bp, qx, qy, ranked };
}

export function initGapLabs() {
  initFieldsLab();
  initSpellLab();
  initAutocompleteLab();
  initNewsLab();
  initSignalsLogLab();
  initTreeLab();
  initConceptLab();
}

export function initGapCanvasLabs({ getTokens, prepCanvas, redrawCallbacks }) {
  initSkgCalcLab(getTokens, prepCanvas, redrawCallbacks);
  initPosBiasLab(getTokens, prepCanvas, redrawCallbacks);
  initChunkLab(getTokens, prepCanvas, redrawCallbacks);
  initCutoffLab(getTokens, prepCanvas, redrawCallbacks);
  initMetricsLab();
}

function setActive(selector, btn) {
  document.querySelectorAll(selector).forEach((b) => b.classList.toggle("active", b === btn));
}

/* ---------------------------- DEMO 3.2 ---------------------------------- */
function initFieldsLab() {
  const list = document.getElementById("fields-doc-list");
  const tree = document.getElementById("fields-explain");
  if (!list || !tree) return;
  const slTitle = document.getElementById("sl-qf-title");
  const slBody = document.getElementById("sl-qf-body");
  const slPf2 = document.getElementById("sl-pf2");
  let query = "connection reset";
  let selectedId = null;

  const PRESETS = {
    body: { title: 0, body: 1, pf2: 0 },
    title: { title: 3, body: 1, pf2: 0 },
    phrase: { title: 3, body: 1, pf2: 2 },
  };

  const f2 = (x) => x.toFixed(2);
  const f3 = (x) => x.toFixed(3);

  function termLines(items, field) {
    return items.map((x) => (
      `    <span class="x-num">${f2(x.score)}</span> = weight(${field}:${escapeHtml(x.term)}) = idf ${f3(x.idf)} × tf ${f3(x.tfPart)}\n` +
      `<span class="x-dim">           idf: n=${x.df}, N=${N_DOCS}   tf: freq=${x.tf}, k1=${K1}, b=${B}, dl=${x.dl}, avgdl=${x.avgdl.toFixed(1)}</span>\n`
    )).join("");
  }

  function render() {
    const wT = Number(slTitle.value);
    const wB = Number(slBody.value);
    const wP = Number(slPf2.value);
    document.getElementById("val-qf-title").textContent = String(wT);
    document.getElementById("val-qf-body").textContent = String(wB);
    document.getElementById("val-pf2").textContent = String(wP);

    const tokens = [...new Set(analyzeText(query).tokens)];
    const rows = FIELD_DOCS.map((fd) => ({ fd, s: scoreFields(fd, tokens, wT, wB, wP) }))
      .filter((r) => r.s.total > 0 || r.s.titleRaw + r.s.bodyRaw + r.s.phraseRaw > 0)
      .sort((a, b) => b.s.total - a.s.total);
    const maxScore = Math.max(0.001, ...rows.map((r) => r.s.total));
    if (!rows.some((r) => r.fd.doc.id === selectedId)) selectedId = rows.length ? rows[0].fd.doc.id : null;

    document.getElementById("fields-top-badge").textContent = rows.length ? `#1: ${rows[0].fd.doc.id}` : "No matches";
    list.innerHTML = rows.map((r, i) => {
      const d = r.fd.doc;
      const cls = ["doc-row", "selectable", i === 0 ? "top-hit" : "", d.id === selectedId ? "selected" : ""].join(" ");
      const pct = Math.round((r.s.total / maxScore) * 100);
      const tags = [
        r.s.title.length ? `<span>title hit</span>` : "",
        r.s.phrases.length ? `<span>phrase hit</span>` : "",
      ].join("");
      return `
        <div class="${cls}" role="button" tabindex="0" data-explain-doc="${d.id}" aria-pressed="${d.id === selectedId}">
          <span class="doc-rank">#${i + 1}</span>
          <div class="doc-info">
            <div class="doc-title">${escapeHtml(d.title)}</div>
            <div class="doc-meta"><span>${d.id}</span>${tags}</div>
            <div class="doc-bar-track"><div class="doc-bar-fill" style="width:${pct}%"></div></div>
          </div>
          <span class="doc-score">${f2(r.s.total)}</span>
        </div>`;
    }).join("");

    const sel = rows.find((r) => r.fd.doc.id === selectedId);
    document.getElementById("fields-explain-doc").textContent = sel ? sel.fd.doc.id : "—";
    if (!sel) {
      tree.textContent = "No document matches this query.";
      return;
    }
    const s = sel.s;
    let out = `<span class="x-num">${f2(s.total)}</span> = sum of:\n`;
    out += `  <span class="x-num x-title">${f2(wT * s.titleRaw)}</span> = title field (BM25 ${f2(s.titleRaw)}) × boost ${wT}\n`;
    out += s.title.length ? termLines(s.title, "title") : `<span class="x-dim">    no query words in title</span>\n`;
    out += `  <span class="x-num x-body">${f2(wB * s.bodyRaw)}</span> = body field (BM25 ${f2(s.bodyRaw)}) × boost ${wB}\n`;
    out += s.body.length ? termLines(s.body, "body") : `<span class="x-dim">    no query words in body</span>\n`;
    out += `  <span class="x-num x-phrase">${f2(wP * s.phraseRaw)}</span> = phrase boost pf2 × ${wP}\n`;
    out += s.phrases.length
      ? s.phrases.map((p) => `    ${f2(p.raw)} = "${escapeHtml(p.pair)}" side by side (IDF sum)\n`).join("")
      : `<span class="x-dim">    no query words side by side</span>\n`;
    tree.innerHTML = out;
  }

  function selectFrom(target) {
    const row = target.closest("[data-explain-doc]");
    if (!row) return;
    selectedId = row.dataset.explainDoc;
    render();
  }
  list.addEventListener("click", (e) => selectFrom(e.target));
  list.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      selectFrom(e.target);
      const again = list.querySelector(`[data-explain-doc="${selectedId}"]`);
      if (again) again.focus();
    }
  });

  [slTitle, slBody, slPf2].forEach((sl) => sl.addEventListener("input", () => {
    document.querySelectorAll("[data-field-preset]").forEach((b) => b.classList.remove("active"));
    render();
  }));
  document.querySelectorAll("[data-field-preset]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const p = PRESETS[btn.dataset.fieldPreset];
      slTitle.value = p.title;
      slBody.value = p.body;
      slPf2.value = p.pf2;
      setActive("[data-field-preset]", btn);
      render();
    });
  });
  document.querySelectorAll("[data-field-query]").forEach((btn) => {
    btn.addEventListener("click", () => {
      query = btn.dataset.fieldQuery;
      selectedId = null;
      setActive("[data-field-query]", btn);
      render();
    });
  });
  render();
}

/* ---------------------------- DEMO 5.2 ---------------------------------- */
function initSpellLab() {
  const logEl = document.getElementById("spell-log");
  const outEl = document.getElementById("spell-out");
  if (!logEl || !outEl) return;
  const slLow = document.getElementById("sl-spell-low");
  const slHigh = document.getElementById("sl-spell-high");
  let rule = "book";

  function render() {
    const lowQ = Number(slLow.value);
    const highQ = Number(slHigh.value);
    const r = learnCorrections(lowQ, highQ, rule);
    document.getElementById("val-spell-low").textContent = `${lowQ.toFixed(2)} → ≤ ${Math.round(r.lowCut)} users`;
    document.getElementById("val-spell-high").textContent = `${highQ.toFixed(2)} → ≥ ${Math.round(r.highCut)} users`;

    const typoSet = new Set(r.typos.map((t) => t.word));
    const fixSet = new Set(r.fixes.map((t) => t.word));
    logEl.innerHTML = `
      <table class="postings-table" aria-label="Query log word counts">
        <thead><tr><th>Word</th><th>Users</th><th>Role</th></tr></thead>
        <tbody>${QUERY_LOG.map((w) => {
          const role = typoSet.has(w.word)
            ? `<span class="status-pill filtered">typo candidate</span>`
            : fixSet.has(w.word)
              ? `<span class="status-pill matched">correction</span>`
              : `<span class="spell-dim">—</span>`;
          return `<tr><td>${escapeHtml(w.word)}</td><td>${w.users}</td><td>${role}</td></tr>`;
        }).join("")}</tbody>
      </table>`;

    const wrong = r.learned.filter((l) => !l.ok);
    outEl.innerHTML = r.learned.length
      ? `<table class="postings-table" aria-label="Learned spelling corrections">
          <thead><tr><th>Typo</th><th>→ Fix</th><th>Edits</th><th>Check</th></tr></thead>
          <tbody>${r.learned.map((l) => `
            <tr class="${l.ok ? "" : "spell-bad"}">
              <td>${escapeHtml(l.from)}</td><td>${escapeHtml(l.to)}</td><td>${l.dist}</td>
              <td>${l.ok ? "✓" : "✗ real word"}</td>
            </tr>`).join("")}</tbody>
        </table>`
      : `<p class="spell-dim">No corrections learned. Raise the typo cutoff or lower the correction cutoff.</p>`;
    outEl.innerHTML += r.missed.length
      ? `<p class="spell-missed">Missed typos: ${r.missed.map((m) => `<code>${escapeHtml(m.word)}</code>`).join(" ")}</p>`
      : "";

    document.getElementById("kpi-spell-learned").textContent = String(r.learned.length - wrong.length);
    document.getElementById("kpi-spell-wrong").textContent = String(wrong.length);
    document.getElementById("kpi-spell-missed").textContent = String(r.missed.length);
  }

  [slLow, slHigh].forEach((sl) => sl.addEventListener("input", render));
  document.querySelectorAll("[data-spell-rule]").forEach((btn) => {
    btn.addEventListener("click", () => {
      rule = btn.dataset.spellRule;
      setActive("[data-spell-rule]", btn);
      render();
    });
  });
  render();
}

/* ---------------------------- DEMO 7.2 ---------------------------------- */
function initAutocompleteLab() {
  const prefEl = document.getElementById("ac-prefix");
  const semEl = document.getElementById("ac-semantic");
  if (!prefEl || !semEl) return;
  let key = "socket";

  function row(text, i, extra = "") {
    return `
      <div class="doc-row${i === 0 ? " top-hit" : ""}">
        <span class="doc-rank">${i + 1}</span>
        <div class="doc-info"><div class="doc-title">${escapeHtml(text)}</div>${extra}</div>
      </div>`;
  }

  function render() {
    const r = suggest(key);
    document.getElementById("ac-typed").textContent = `"${r.typed}▌"`;
    prefEl.innerHTML = r.prefix.length
      ? r.prefix.map((c, i) => row(c.text, i)).join("")
      : `<p class="spell-dim">No suggestion starts with "${escapeHtml(r.typed)}".</p>`;
    semEl.innerHTML = r.semantic.map((c, i) => row(
      c.text,
      i,
      `<div class="doc-meta"><span>cosine ${c.sim.toFixed(2)}</span></div>
       <div class="doc-bar-track"><div class="doc-bar-fill" style="width:${Math.max(0, Math.round(c.sim * 100))}%"></div></div>`,
    )).join("");
    document.getElementById("ac-prefix-badge").textContent = `${r.prefix.length} found`;
    document.getElementById("ac-sem-badge").textContent = `top ${r.semantic.length}`;
  }

  document.querySelectorAll("[data-ac-preset]").forEach((btn) => {
    btn.addEventListener("click", () => {
      key = btn.dataset.acPreset;
      setActive("[data-ac-preset]", btn);
      render();
    });
  });
  render();
}

/* ---------------------------- DEMO 3.3 ---------------------------------- */
const FACTOR_META = [
  { key: "text", label: "Text (BM25)", cls: "seg-text" },
  { key: "fresh", label: "Freshness", cls: "seg-fresh" },
  { key: "near", label: "Nearby", cls: "seg-near" },
  { key: "pop", label: "Popularity", cls: "seg-pop" },
];

function initNewsLab() {
  const list = document.getElementById("news-doc-list");
  if (!list) return;
  const sliders = Object.fromEntries(FACTOR_META.map((f) => [f.key, document.getElementById(`sl-news-${f.key}`)]));
  const PRESETS = {
    text: { text: 1, fresh: 0, near: 0, pop: 0 },
    news: { text: 0.25, fresh: 0.25, near: 0.25, pop: 0.25 },
    local: { text: 0.2, fresh: 0.2, near: 0.4, pop: 0.2 },
    trending: { text: 0.2, fresh: 0.4, near: 0, pop: 0.4 },
  };
  const ageLabel = (days) => (days >= 365 ? `${(days / 365).toFixed(1)} yr old` : `${days} d old`);

  function render() {
    const w = Object.fromEntries(FACTOR_META.map((f) => [f.key, Number(sliders[f.key].value)]));
    FACTOR_META.forEach((f) => { document.getElementById(`val-news-${f.key}`).textContent = w[f.key].toFixed(2); });
    const rows = rankNews(w);
    const max = Math.max(0.001, ...rows.map((r) => r.total));
    list.innerHTML = rows.map((r, i) => {
      const segs = FACTOR_META.map((f) => `<span class="${f.cls}" style="width:${(r.parts[f.key] / max) * 100}%" title="${f.label}: ${r.parts[f.key].toFixed(2)}"></span>`).join("");
      return `
        <div class="doc-row${i === 0 ? " top-hit" : ""}">
          <span class="doc-rank">#${i + 1}</span>
          <div class="doc-info">
            <div class="doc-title">${escapeHtml(r.d.title)}</div>
            <div class="doc-meta"><span>${ageLabel(r.d.days)}</span><span>${r.d.km.toLocaleString()} km away</span><span>${r.d.pop.toLocaleString()} clicks</span><span>BM25 ${r.d.bm25}</span></div>
            <div class="stack-bar" aria-hidden="true">${segs}</div>
          </div>
          <span class="doc-score">${r.total.toFixed(2)}</span>
        </div>`;
    }).join("");
    const top = rows[0];
    document.getElementById("news-top-badge").textContent = `#1: ${top.d.id}`;
    document.getElementById("kpi-news-top").textContent = top.d.title.length > 26 ? `${top.d.title.slice(0, 24)}…` : top.d.title;
    document.getElementById("kpi-news-age").textContent = ageLabel(top.d.days);
    document.getElementById("kpi-news-km").textContent = `${top.d.km.toLocaleString()} km`;
    {
      const main = FACTOR_META.map((fm) => ({ ...fm, v: top.parts[fm.key] })).sort((x, y) => y.v - x.v)[0];
      const share = Math.round((main.v / Math.max(1e-6, top.total)) * 100);
      const textOnly = w.fresh + w.near + w.pop === 0;
      const why = textOnly
        ? `Text only: "${top.d.title}" wins on word matches, even though it's ${ageLabel(top.d.days)} and ${top.d.km.toLocaleString()} km away. Great for "basketball", bad for news.`
        : `"${top.d.title}" wins mostly on ${main.label.toLowerCase()} (${share}% of its score). Each factor is scaled to 0–1 first, so no single unit dominates.`;
      readout(document.getElementById("ro-news"), [["#1", top.d.id], ["biggest factor", main.label]], why);
    }
  }

  Object.values(sliders).forEach((sl) => sl.addEventListener("input", () => {
    document.querySelectorAll("[data-news-preset]").forEach((b) => b.classList.remove("active"));
    render();
  }));
  document.querySelectorAll("[data-news-preset]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const p = PRESETS[btn.dataset.newsPreset];
      FACTOR_META.forEach((f) => { sliders[f.key].value = p[f.key]; });
      setActive("[data-news-preset]", btn);
      render();
    });
  });
  render();
}

/* ---------------------------- DEMO 4.2 ---------------------------------- */
function initSignalsLogLab() {
  const logEl = document.getElementById("sig-log");
  const outEl = document.getElementById("sig-boosts");
  if (!logEl || !outEl) return;
  const chk = {
    onePerUser: document.getElementById("chk-sig-user"),
    normalize: document.getElementById("chk-sig-norm"),
    negatives: document.getElementById("chk-sig-neg"),
  };
  const TITLES = Object.fromEntries(DOCS_CORPUS.map((d) => [d.id, d.title]));

  // Collapse runs of identical events so the bot's 30 clicks show as one row
  const grouped = [];
  for (const r of SIGNALS_LOG) {
    const last = grouped[grouped.length - 1];
    if (last && last.query_id === r.query_id && last.user === r.user && last.type === r.type && last.target === r.target) last.n += 1;
    else grouped.push({ ...r, n: 1 });
  }

  function render() {
    const opts = Object.fromEntries(Object.entries(chk).map(([k, el]) => [k, el.checked]));
    const res = aggregateBoosts("econnreset", opts);
    logEl.innerHTML = `
      <table class="postings-table sig-table" aria-label="Raw signals log, five fields per event">
        <thead><tr><th>query_id</th><th>signal_time</th><th>user</th><th>type</th><th>target</th></tr></thead>
        <tbody>${grouped.map((r) => {
          const w = SIGNAL_WEIGHTS[r.type];
          const cls = w === undefined ? "sig-ctx" : w < 0 ? "sig-neg" : "";
          const tgt = r.type === "query" ? `"${escapeHtml(r.target)}"` : escapeHtml(r.target);
          return `<tr class="${cls}"><td>${r.query_id}</td><td>${r.signal_time}</td><td>${r.user}</td><td>${r.type}${r.n > 1 ? ` ×${r.n}` : ""}</td><td>${tgt}</td></tr>`;
        }).join("")}</tbody>
      </table>`;
    const max = Math.max(1, ...res.ranked.map((x) => Math.abs(x.boost)));
    outEl.innerHTML = res.ranked.map((x, i) => `
      <div class="doc-row${i === 0 && x.boost > 0 ? " top-hit" : ""}">
        <span class="doc-rank">#${i + 1}</span>
        <div class="doc-info">
          <div class="doc-title">${escapeHtml(TITLES[x.doc] || x.doc)}</div>
          <div class="doc-meta"><span>${x.doc}</span></div>
          <div class="doc-bar-track"><div class="doc-bar-fill${x.boost < 0 ? " neg" : ""}" style="width:${(Math.abs(x.boost) / max) * 100}%"></div></div>
        </div>
        <span class="doc-score${x.boost < 0 ? " neg" : ""}">${x.boost > 0 ? "+" : ""}${x.boost}</span>
      </div>`).join("");
    document.getElementById("sig-key-badge").textContent = `key: "${res.key}"`;
    document.getElementById("kpi-sig-used").textContent = String(res.used);
    const top = res.ranked[0];
    {
      const off = [];
      if (!opts.onePerUser) off.push("one vote per user");
      if (!opts.normalize) off.push("normalizing");
      if (!opts.negatives) off.push("negative signals");
      const topDoc = res.ranked[0];
      const why = topDoc && topDoc.doc === "d5"
        ? "A bot (u9) clicked the junk FAQ 30 times, so it gets the top boost. Turn on \"One vote per user\" to count the bot once."
        : !opts.normalize ? `The real fix leads. But searches typed as "ECONNRESET" or " EconnReset " still don't count toward "econnreset". Turn on normalizing.`
        : !opts.negatives ? "Variants are merged now. Two users marked the FAQ \"not helpful\", but that isn't counted yet. Turn on negative signals."
        : "All three fixes are on: one bot can't outvote people, spelling variants count together, and unhelpful pages are pushed down.";
      readout(document.getElementById("ro-sig"), [["events counted", res.used], ["fixes off", off.length ? off.join(", ") : "none"]], why, topDoc && topDoc.doc === "d5" ? "warn" : "");
    }
    const anyFix = Object.values(opts).some(Boolean);
    document.getElementById("kpi-sig-top").innerHTML = top
      ? (anyFix && top.doc !== "d5" ? `<span class="was">d5</span><span class="arrow">→</span>${top.doc}` : top.doc)
      : "—";
    document.getElementById("kpi-sig-top").className = `kpi-val ${top && top.doc === "d5" ? "coral" : "brand"}`;
  }
  Object.values(chk).forEach((el) => el.addEventListener("change", render));
  render();
}

/* ---------------------------- DEMO 6.5 ---------------------------------- */
function initTreeLab() {
  const tree = document.getElementById("tree-view");
  if (!tree) return;
  const slT = document.getElementById("sl-tree-title");
  const slO = document.getElementById("sl-tree-over");
  function render() {
    const t = Number(slT.value);
    const o = Number(slO.value);
    document.getElementById("val-tree-title").textContent = t.toFixed(1);
    document.getElementById("val-tree-over").textContent = o.toFixed(1);
    const leaf = treeLeaf(t, o);
    tree.querySelectorAll("[data-node]").forEach((el) => el.classList.toggle("on-path", leaf.path.includes(el.dataset.node)));
    document.getElementById("kpi-tree-score").textContent = String(leaf.score);
    {
      const why = t > 2
        ? (o > 2 ? `title_bm25 ${t.toFixed(1)} > 2 and overview_bm25 ${o.toFixed(1)} > 2: title and overview agree, so this tree gives its top score, 12.` : `Title matches (${t.toFixed(1)} > 2) but the overview doesn't back it up (${o.toFixed(1)} ≤ 2), so only 7.`)
        : (o > 10 ? `Weak title (${t.toFixed(1)} ≤ 2), but a very strong overview (${o.toFixed(1)} > 10) still earns 8.` : `Weak title and weak overview: 1, pushed to the bottom.`);
      readout(document.getElementById("ro-tree"), [["path", leaf.path.slice(1).join(" → ")], ["leaf", leaf.score]], `${why} A tree learns these "if" rules, which is how it captures combinations a single weight can't.`);
    }
  }
  [slT, slO].forEach((sl) => sl.addEventListener("input", render));
  render();
}

/* ---------------------------- DEMO 7.3 ---------------------------------- */
function initConceptLab() {
  const svg = document.getElementById("blend-svg");
  const list = document.getElementById("blend-list");
  if (!svg || !list) return;
  const sl = document.getElementById("sl-blend");
  let pair = "vader";
  const S = 30; // px per unit, 10×10 space → 300px + padding
  const P = 16;
  const px = (x) => P + x * S;
  const py = (y) => P + (10 - y) * S;

  function render() {
    const a = Number(sl.value);
    document.getElementById("val-blend").textContent = a.toFixed(2);
    const r = blendQuery(pair, a);
    const nearestId = r.ranked[0].id;
    const dots = CONCEPT_POINTS.map((c) => {
      const role = c.id === r.A.id || c.id === r.B.id ? "end" : c.id === nearestId ? "hit" : c.blend ? "blend" : "";
      return `<g class="bl-pt ${role}"><circle cx="${px(c.x)}" cy="${py(c.y)}" r="${role ? 6 : 4.5}"></circle>
        <text x="${c.below ? px(c.x) : c.x > 5.5 ? px(c.x) - 8 : px(c.x) + 8}" y="${c.below ? py(c.y) + 20 : py(c.y) + 4}" text-anchor="${c.below ? "middle" : c.x > 5.5 ? "end" : "start"}">${escapeHtml(c.label)}</text></g>`;
    }).join("");
    svg.innerHTML = `
      <rect class="bl-frame" x="${P}" y="${P}" width="${10 * S}" height="${10 * S}"></rect>
      <line class="bl-seg" x1="${px(r.A.x)}" y1="${py(r.A.y)}" x2="${px(r.B.x)}" y2="${py(r.B.y)}"></line>
      ${dots}
      <g class="bl-q"><path d="M ${px(r.qx)} ${py(r.qy) - 8} L ${px(r.qx) + 8} ${py(r.qy)} L ${px(r.qx)} ${py(r.qy) + 8} L ${px(r.qx) - 8} ${py(r.qy)} Z"></path></g>`;
    list.innerHTML = r.ranked.slice(0, 4).map((c, i) => `
      <div class="doc-row${i === 0 ? " top-hit" : ""}">
        <span class="doc-rank">#${i + 1}</span>
        <div class="doc-info"><div class="doc-title">${escapeHtml(c.label)}</div>
          <div class="doc-meta"><span>distance ${c.dist.toFixed(2)}</span></div></div>
      </div>`).join("");
    document.getElementById("blend-formula").textContent = `query = ${(1 - a).toFixed(2)} × [${r.A.label}] + ${a.toFixed(2)} × [${r.B.label}]`;
    {
      const near = r.ranked[0];
      const why = a <= 0.15 ? `Almost all "${r.A.label}", so the nearest item is just that.`
        : a >= 0.85 ? `Almost all "${r.B.label}", so the nearest item is just that.`
        : near.blend ? `Halfway between the two, the nearest item is "${near.label}": it shares traits of both, which neither word finds on its own.`
        : `The query is between the two, but closest to "${near.label}". Slide toward 0.5 to reach the blend.`;
      readout(document.getElementById("ro-blend"), [["mix α", a.toFixed(2)], ["nearest", near.label]], why);
    }
  }
  sl.addEventListener("input", render);
  document.querySelectorAll("[data-blend-pair]").forEach((btn) => {
    btn.addEventListener("click", () => {
      pair = btn.dataset.blendPair;
      setActive("[data-blend-pair]", btn);
      render();
    });
  });
  render();
}

/* ---------------------------- DEMO 5.3 ---------------------------------- */
export const SKG_BG = 10000;
export const SKG_FG = 400;
export const SKG_TERMS = {
  keepalive: { n: 600, k: 150 },
  retry: { n: 2000, k: 140 },
  error: { n: 4000, k: 200 },
  the: { n: 9800, k: 392 },
  invoice: { n: 1500, k: 4 },
  kubeproxy: { n: 3, k: 2 },
};
export function skgZ({ n, k }) {
  const P = n / SKG_BG;
  return (k - SKG_FG * P) / Math.sqrt(SKG_FG * P * (1 - P));
}
export const skgSquash = (z) => 2 / (1 + Math.exp(-z / 4)) - 1;

function initSkgCalcLab(getTokens, prepCanvas, redrawCallbacks) {
  const c = document.getElementById("canvas-skgcalc");
  const barsEl = document.getElementById("skg-bars");
  if (!c || !barsEl) return;
  const slMin = document.getElementById("sl-skg-min");
  let term = "keepalive";
  const pctTxt = (x) => (x > 0 && x < 0.001 ? "<0.1%" : `${x < 0.1 && x > 0 ? (x * 100).toFixed(1) : Math.round(x * 100)}%`);

  function render() {
    const T = getTokens();
    const minOcc = Number(slMin.value);
    document.getElementById("val-skg-min").textContent = String(minOcc);
    const t = SKG_TERMS[term];
    const P = t.n / SKG_BG;
    const obs = t.k / SKG_FG;
    const z = skgZ(t);
    const rel = skgSquash(z);
    const filtered = t.k < minOcc;

    barsEl.innerHTML = `
      <div class="skg-row"><div class="skg-lbl">all 10,000 posts</div>
        <div class="skg-track"><div class="skg-fill bg" style="width:${Math.max(0.6, P * 100)}%"></div></div><div class="skg-val">${pctTxt(P)}</div></div>
      <div class="skg-row"><div class="skg-lbl">400 "econnreset" posts</div>
        <div class="skg-track"><div class="skg-fill fg" style="width:${Math.max(0.6, obs * 100)}%"></div><div class="skg-chance" style="left:${P * 100}%" title="expected by chance"></div></div><div class="skg-val">${pctTxt(obs)}</div></div>
      <div class="skg-note">▏= what chance predicts in the foreground (${Math.round(SKG_FG * P * 10) / 10} posts) · seen: ${t.k} posts</div>`;

    const { ctx, w, h } = prepCanvas(c);
    ctx.clearRect(0, 0, w, h);
    const f = makeFrame(w, h, { l: 36, r: 12, t: 12, b: 32 }, { x0: -15, x1: 30, y0: -1.1, y1: 1.1 });
    const Pl = new Placer(f);
    axes(ctx, T, f, { xTicks: [-10, 0, 10, 20, 30], yTicks: [-1, 0, 1], xTitle: "z-score" });
    refLine(ctx, T, f, { y: 0, color: T.muted, dash: [2, 4] });
    curve(ctx, f, skgSquash, T.brand, { width: 2 });
    Object.entries(SKG_TERMS).forEach(([name, o]) => {
      const zz = Math.max(-15, Math.min(30, skgZ(o)));
      const out = o.k < minOcc;
      ctx.beginPath();
      ctx.arc(f.x(zz), f.y(skgSquash(skgZ(o))), name === term ? 6 : 4, 0, Math.PI * 2);
      ctx.fillStyle = out ? T.lineStrong : name === term ? T.amber : T.blue;
      ctx.fill();
      if (name !== term) {
        ctx.fillStyle = out ? T.lineStrong : T.muted;
        ctx.font = `10.5px ${T.mono}`;
        ctx.textBaseline = "middle";
        // hand-placed so neighbors on the curve don't collide
        const place = { kubeproxy: ["right", -7, -9], error: ["left", 7, 10], retry: ["left", 7, -9] }[name] || ["left", 7, -8];
        ctx.textAlign = place[0];
        ctx.fillText(name, Math.min(f.right - 50, f.x(zz) + place[1]), f.y(skgSquash(skgZ(o))) + place[2]);
      }
    });
    callout(ctx, T, f.x(Math.max(-15, Math.min(30, z))), f.y(rel), filtered ? `${term}: filtered out` : `${term}: z ${z.toFixed(1)} → ${rel.toFixed(2)}`, filtered ? T.muted : T.amber, Pl);

    const ratio = obs / Math.max(1e-9, P);
    let why;
    if (filtered) why = `"${term}" appears in only ${t.k} foreground post${t.k === 1 ? "" : "s"}, below the noise floor of ${minOcc}, so it isn't scored at all.`;
    else if (term === "kubeproxy") why = `Seen in just ${t.k} posts, but chance predicted almost 0, so z jumps to ${z.toFixed(1)}. That's luck, not meaning. Raise min_occurrences to filter it.`;
    else if (Math.abs(z) < 1.5) why = `"${term}" is in ${pctTxt(obs)} of econnreset posts and ${pctTxt(P)} of all posts: exactly what chance predicts. Lots of co-occurrence, zero information.`;
    else if (z > 0) why = `"${term}" is in ${pctTxt(obs)} of econnreset posts vs. ${pctTxt(P)} of all posts: ${ratio.toFixed(1)}× more than chance. z = ${z.toFixed(1)} → relatedness ${rel.toFixed(2)}.`;
    else why = `"${term}" is in only ${pctTxt(obs)} of econnreset posts vs. ${pctTxt(P)} overall: it avoids this topic. z = ${z.toFixed(1)} → relatedness ${rel.toFixed(2)} (a different domain).`;
    readout(document.getElementById("ro-skgcalc"), [["word", `"${term}"`], ["expected", (SKG_FG * P).toFixed(1)], ["seen", t.k], ["relatedness", filtered ? "—" : rel.toFixed(2)]], why, term === "kubeproxy" && !filtered ? "warn" : "");
  }
  slMin.addEventListener("input", render);
  document.querySelectorAll("[data-skg-term]").forEach((b) => b.addEventListener("click", () => {
    document.querySelectorAll("[data-skg-term]").forEach((x) => x.classList.toggle("active", x === b));
    term = b.dataset.skgTerm;
    render();
  }));
  redrawCallbacks.push(render);
}

/* ---------------------------- DEMO 6.0 ---------------------------------- */
export const PB_EXAM = [1.0, 0.62, 0.45, 0.34, 0.27]; // chance a user looks at each rank
export const PB_PAGES = { A: 0.3, B: 0.55, C: 0.45, D: 0.8, E: 0.35 }; // true quality = click chance if seen
export const PB_ORDERS = { buried: ["A", "B", "C", "D", "E"], top: ["D", "B", "C", "A", "E"] };

export function pbSimulate(order, users, rng) {
  const stats = Object.fromEntries(order.map((p) => [p, { shown: 0, seen: 0, clicks: 0 }]));
  for (let u = 0; u < users; u += 1) {
    order.forEach((p, i) => {
      stats[p].shown += 1;
      if (rng() < PB_EXAM[i]) {
        stats[p].seen += 1;
        if (rng() < PB_PAGES[p]) stats[p].clicks += 1;
      }
    });
  }
  return stats;
}

function initPosBiasLab(getTokens, prepCanvas, redrawCallbacks) {
  const c = document.getElementById("canvas-posbias");
  if (!c) return;
  let seed = 99;
  const rng = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
  let orderKey = "buried";
  let stats = null;
  let users = 0;
  const reset = () => { stats = Object.fromEntries(PB_ORDERS[orderKey].map((p) => [p, { shown: 0, seen: 0, clicks: 0 }])); users = 0; };
  const add = (n) => {
    const s2 = pbSimulate(PB_ORDERS[orderKey], n, rng);
    Object.entries(s2).forEach(([p, v]) => { stats[p].shown += v.shown; stats[p].seen += v.seen; stats[p].clicks += v.clicks; });
    users += n;
  };

  function render() {
    const T = getTokens();
    const order = PB_ORDERS[orderKey];
    const { ctx, w, h } = prepCanvas(c);
    ctx.clearRect(0, 0, w, h);
    const f = makeFrame(w, h, { l: 40, r: 12, t: 14, b: 40 }, { x0: 0, x1: order.length, y0: 0, y1: 1.05 });
    axes(ctx, T, f, { xTicks: [], yTicks: [0, 0.25, 0.5, 0.75, 1], yFmt: (v) => `${Math.round(v * 100)}%` });
    const band = f.plotW / order.length;
    const rows = order.map((p, i) => {
      const st = stats[p];
      return { p, i, q: PB_PAGES[p], raw: st.shown ? st.clicks / st.shown : null, cor: st.seen ? st.clicks / st.seen : null };
    });
    rows.forEach((r) => {
      const x0 = f.left + r.i * band;
      const bw = band * 0.22;
      // true quality: outline
      ctx.strokeStyle = T.muted; ctx.lineWidth = 1.5; ctx.setLineDash([3, 2]);
      ctx.strokeRect(x0 + band * 0.12, f.y(r.q), bw, f.y(0) - f.y(r.q)); ctx.setLineDash([]);
      if (r.raw !== null) { ctx.fillStyle = T.coral; ctx.fillRect(x0 + band * 0.39, f.y(r.raw), bw, f.y(0) - f.y(r.raw)); }
      if (r.cor !== null) { ctx.fillStyle = T.brand; ctx.fillRect(x0 + band * 0.66, f.y(r.cor), bw, f.y(0) - f.y(r.cor)); }
      ctx.fillStyle = r.p === "D" ? T.fg : T.muted;
      ctx.font = `${r.p === "D" ? "600 " : ""}11.5px ${T.mono}`;
      ctx.textAlign = "center"; ctx.textBaseline = "top";
      ctx.fillText(`#${r.i + 1} · page ${r.p}`, x0 + band / 2, f.bottom + 6);
      ctx.fillStyle = T.muted; ctx.font = `10.5px ${T.mono}`;
      ctx.fillText(`seen ${Math.round(PB_EXAM[r.i] * 100)}%`, x0 + band / 2, f.bottom + 20);
    });
    legend(ctx, T, f, [
      { label: "true quality", color: T.muted, kind: "dash" },
      { label: "raw CTR", color: T.coral, kind: "bar" },
      { label: "position-corrected", color: T.brand, kind: "bar" },
    ], null, "tl");

    const fmt = (v) => (v === null ? "—" : `${Math.round(v * 100)}%`);
    const byRaw = [...rows].filter((r) => r.raw !== null).sort((a, b) => b.raw - a.raw)[0];
    const byCor = [...rows].filter((r) => r.cor !== null).sort((a, b) => b.cor - a.cor)[0];
    const d = rows.find((r) => r.p === "D");
    let why;
    if (!users) why = "No users yet. Click “+1,000 users” to simulate people scanning this results page.";
    else if (users < 300) why = `Only ${users} users so far: the bars are still noisy. Add more to see the pattern settle.`;
    else if (orderKey === "buried") why = `Page D is the best (80%), but at #4 only ${Math.round(PB_EXAM[3] * 100)}% of users look, so its raw CTR is ${fmt(d.raw)}. Raw CTR crowns page ${byRaw.p}. Corrected for position, D is back on top at ${fmt(d.cor)}.`;
    else why = `Same pages, but D now sits at #1 where everyone looks, so its raw CTR jumps to ${fmt(d.raw)}. Raw CTR rewards position as much as quality. That's how a ranker keeps confirming its own choices.`;
    readout(document.getElementById("ro-posbias"), [["users", users.toLocaleString()], ["raw CTR picks", byRaw ? `page ${byRaw.p}` : "—"], ["corrected picks", byCor ? `page ${byCor.p}` : "—"]], why, users >= 300 && orderKey === "buried" ? "warn" : "");
  }

  document.querySelectorAll("[data-pb-act]").forEach((b) => b.addEventListener("click", () => {
    const a = b.dataset.pbAct;
    if (a === "reset") reset(); else add(Number(a));
    render();
  }));
  document.querySelectorAll("[data-pb-order]").forEach((b) => b.addEventListener("click", () => {
    document.querySelectorAll("[data-pb-order]").forEach((x) => x.classList.toggle("active", x === b));
    orderKey = b.dataset.pbOrder;
    reset();
    render();
  }));
  reset();
  redrawCallbacks.push(render);
}

/* ---------------------------- DEMO 7.0 ---------------------------------- */
export const CHUNK_Q_DEG = 20;
export const CHUNK_SENTS = [
  { t: "SDK v4 release notes", deg: 90, on: false },
  { t: "New dashboard theme", deg: 105, on: false },
  { t: "Fixed ECONNRESET on idle sockets", deg: 22, on: true },
  { t: "Enable keepalive to avoid resets", deg: 32, on: true },
  { t: "Invoice PDF export", deg: 120, on: false },
  { t: "Card update flow", deg: 130, on: false },
  { t: "Deprecated v3 auth", deg: 85, on: false },
  { t: "Faster cold starts", deg: 68, on: false },
];
const rad = (d) => (d * Math.PI) / 180;
export function chunkVectors(size) {
  const out = [];
  for (let i = 0; i < CHUNK_SENTS.length; i += size) {
    const part = CHUNK_SENTS.slice(i, i + size);
    const x = part.reduce((s, p) => s + Math.cos(rad(p.deg)), 0) / part.length;
    const y = part.reduce((s, p) => s + Math.sin(rad(p.deg)), 0) / part.length;
    const len = Math.hypot(x, y) || 1e-9;
    const cos = (x * Math.cos(rad(CHUNK_Q_DEG)) + y * Math.sin(rad(CHUNK_Q_DEG))) / len;
    out.push({ from: i, part, x, y, len, cos });
  }
  return out;
}

function initChunkLab(getTokens, prepCanvas, redrawCallbacks) {
  const c = document.getElementById("canvas-chunk");
  const list = document.getElementById("chunk-list");
  if (!c || !list) return;
  let size = 8;
  function render() {
    const T = getTokens();
    const chunks = chunkVectors(size);
    const best = [...chunks].sort((a, b) => b.cos - a.cos)[0];
    const { ctx, w, h } = prepCanvas(c);
    ctx.clearRect(0, 0, w, h);
    const R = Math.min(w, h) / 2 - 18;
    const cx = w / 2;
    const cy = h / 2;
    ctx.strokeStyle = T.line;
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();
    const arrow = (dx, dy, color, width, len = 1) => {
      const ex = cx + dx * R * len;
      const ey = cy - dy * R * len;
      ctx.strokeStyle = color; ctx.lineWidth = width;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(ex, ey); ctx.stroke();
      return [ex, ey];
    };
    CHUNK_SENTS.forEach((sn) => {
      ctx.globalAlpha = 0.45;
      arrow(Math.cos(rad(sn.deg)), Math.sin(rad(sn.deg)), sn.on ? T.brand : T.muted, 1.25);
      ctx.globalAlpha = 1;
    });
    chunks.forEach((ch) => {
      const isBest = ch === best;
      const [ex, ey] = arrow(ch.x, ch.y, isBest ? T.blue : T.lineStrong, isBest ? 3.5 : 2.5);
      ctx.beginPath(); ctx.arc(ex, ey, 3.5, 0, Math.PI * 2); ctx.fillStyle = isBest ? T.blue : T.lineStrong; ctx.fill();
    });
    // query direction as a diamond on the circle
    const qx = cx + Math.cos(rad(CHUNK_Q_DEG)) * R;
    const qy = cy - Math.sin(rad(CHUNK_Q_DEG)) * R;
    ctx.save(); ctx.translate(qx, qy); ctx.rotate(Math.PI / 4); ctx.fillStyle = T.amber; ctx.fillRect(-6, -6, 12, 12); ctx.restore();
    ctx.fillStyle = T.muted; ctx.font = `10.5px ${T.mono}`; ctx.textAlign = "left"; ctx.textBaseline = "top";
    ctx.fillText("thin = sentence · thick = stored chunk", 6, 6);

    const maxCos = Math.max(...chunks.map((ch) => Math.max(0, ch.cos)));
    list.innerHTML = chunks.map((ch) => {
      const isBest = ch === best;
      const label = ch.part.length === 1 ? ch.part[0].t : `sentences ${ch.from + 1}–${ch.from + ch.part.length}`;
      const onCount = ch.part.filter((p) => p.on).length;
      return `
        <div class="doc-row${isBest ? " top-hit" : ""}">
          <span class="doc-rank">${isBest ? "best" : ""}</span>
          <div class="doc-info">
            <div class="doc-title">${escapeHtml(label)}</div>
            <div class="doc-meta"><span>${onCount} of ${ch.part.length} on-topic</span></div>
            <div class="doc-bar-track"><div class="doc-bar-fill" style="width:${Math.max(0, Math.round((ch.cos / Math.max(0.001, maxCos)) * 100))}%"></div></div>
          </div>
          <span class="doc-score">${ch.cos.toFixed(2)}</span>
        </div>`;
    }).join("");
    const why = size === 8
      ? `The whole page is one average of 8 sentences, and only 2 are about resets. The average points somewhere in between, so its cosine to the query is just ${best.cos.toFixed(2)}. The answer is in there, but hard to find.`
      : size === 1
        ? `Each sentence stands alone. The best one scores ${best.cos.toFixed(2)}, but it no longer carries its page context ("SDK v4 release notes"). Late chunking keeps both.`
        : `The best ${size}-sentence chunk scores ${best.cos.toFixed(2)}. ${best.part.filter((p) => p.on).length === best.part.length ? "It holds only on-topic sentences, so its meaning stays sharp." : "It mixes topics, so the average drifts away from the query."}`;
    readout(document.getElementById("ro-chunk"), [["chunk size", size === 8 ? "whole page" : size], ["chunks stored", chunks.length], ["best cosine", best.cos.toFixed(2)]], why, size === 8 ? "warn" : "");
  }
  document.querySelectorAll("[data-chunk]").forEach((b) => b.addEventListener("click", () => {
    document.querySelectorAll("[data-chunk]").forEach((x) => x.classList.toggle("active", x === b));
    size = Number(b.dataset.chunk);
    render();
  }));
  redrawCallbacks.push(render);
}

/* ---------------------------- DEMO 9.4 ---------------------------------- */
export const CUTOFF_QUERIES = [
  { q: "fix econnreset in node", kind: "specific", rel: [0.91, 0.88, 0.84, 0.79, 0.76], irr: [0.66, 0.62, 0.58, 0.55, 0.51, 0.47] },
  { q: "why does my app feel slow?", kind: "vague", rel: [0.67, 0.64, 0.61, 0.6], irr: [0.58, 0.55, 0.53, 0.5, 0.48, 0.44] },
];
export function cutoffStats(qo, tau) {
  const relPass = qo.rel.filter((v) => v >= tau).length;
  const irrPass = qo.irr.filter((v) => v >= tau).length;
  const shown = relPass + irrPass;
  return { relPass, irrPass, precision: shown ? relPass / shown : null, recall: relPass / qo.rel.length };
}

function initCutoffLab(getTokens, prepCanvas, redrawCallbacks) {
  const c = document.getElementById("canvas-cutoff");
  if (!c) return;
  let tau = 0.7;
  let f = null;
  function render() {
    const T = getTokens();
    const { ctx, w, h } = prepCanvas(c);
    ctx.clearRect(0, 0, w, h);
    f = makeFrame(w, h, { l: 14, r: 14, t: 18, b: 30 }, { x0: 0.4, x1: 1.0, y0: 0, y1: 2 });
    const P = new Placer(f);
    reserveHint(P, c);
    axes(ctx, T, f, { xTicks: [0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0], xFmt: (v) => v.toFixed(1), yTicks: [], grid: false, xTitle: "cosine similarity" });
    // shade the "passes" side
    ctx.fillStyle = T.brand; ctx.globalAlpha = 0.06;
    ctx.fillRect(f.x(tau), f.top, f.right - f.x(tau), f.plotH); ctx.globalAlpha = 1;
    CUTOFF_QUERIES.forEach((qo, i) => {
      const yMid = f.top + f.plotH * (i === 0 ? 0.3 : 0.75);
      ctx.fillStyle = T.reading; ctx.font = `600 11.5px ${T.mono}`; ctx.textAlign = "left"; ctx.textBaseline = "bottom";
      const rowLabel = `${qo.kind}: "${qo.q}"`;
      ctx.fillText(rowLabel, f.left + 4, yMid - 14);
      P.reserve({ x: f.left + 2, y: yMid - 28, w: ctx.measureText(rowLabel).width + 6, h: 16 });
      ctx.strokeStyle = T.line; ctx.beginPath(); ctx.moveTo(f.left, yMid); ctx.lineTo(f.right, yMid); ctx.stroke();
      const dot = (v, col, off) => {
        ctx.beginPath(); ctx.arc(f.x(v), yMid + off, 5, 0, Math.PI * 2);
        ctx.fillStyle = col; ctx.globalAlpha = v >= tau ? 1 : 0.35; ctx.fill(); ctx.globalAlpha = 1;
      };
      qo.irr.forEach((v) => dot(v, T.coral, 5));
      qo.rel.forEach((v) => dot(v, T.brand, -5));
    });
    ctx.strokeStyle = T.amber; ctx.lineWidth = 2; ctx.setLineDash([5, 3]);
    ctx.beginPath(); ctx.moveTo(f.x(tau), f.top); ctx.lineTo(f.x(tau), f.bottom); ctx.stroke(); ctx.setLineDash([]);
    handle(ctx, T, f.x(tau), f.top + 6, T.amber, 6);
    callout(ctx, T, f.x(tau), f.top + f.plotH * 0.52, `τ = ${tau.toFixed(2)} · right side passes`, T.amber, P);

    const [A, B] = CUTOFF_QUERIES.map((qo) => cutoffStats(qo, tau));
    const pr = (s) => `P ${s.precision === null ? "—" : `${Math.round(s.precision * 100)}%`} · R ${Math.round(s.recall * 100)}%`;
    const aGood = A.recall === 1 && A.irrPass === 0;
    const bGood = B.recall === 1 && B.irrPass === 0;
    let why;
    if (aGood && B.relPass === 0) why = "Perfect for the specific query, but the vague query's relevant chunks all score below τ, so it returns nothing and the system abstains on a question it could answer.";
    else if (B.recall === 1 && A.irrPass > 0) why = `The vague query now gets all its answers, but the specific query lets in ${A.irrPass} junk chunk${A.irrPass === 1 ? "" : "s"}. Lowering τ for one query hurts the other.`;
    else if (aGood && bGood) why = "Both perfect.";
    else why = `Specific query: ${A.relPass}/5 relevant pass, ${A.irrPass} junk. Vague query: ${B.relPass}/4 relevant pass, ${B.irrPass} junk. No single τ gets both right: scores mean different things for different queries.`;
    readout(document.getElementById("ro-cutoff"), [["τ", tau.toFixed(2)], ["specific", pr(A)], ["vague", pr(B)]], why, aGood && bGood ? "" : "warn");
  }
  bindDrag(c, (p) => { if (f) { tau = Math.round(clampV(f.invX(p.x), 0.4, 1.0) * 100) / 100; render(); } }, (d) => { tau = Math.round(clampV(tau + d * 0.01, 0.4, 1.0) * 100) / 100; render(); });
  redrawCallbacks.push(render);
}
const clampV = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/* ---------------------------- DEMO 9.5 ---------------------------------- */
export const MX_TOTAL_GOOD = 5;
export const MX_PRESETS = {
  human: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  agent: [0, 1, 1, 0, 1, 0, 1, 0, 0, 0],
  late: [0, 0, 0, 0, 0, 1, 0, 0, 0, 0],
};
export function mxMetrics(rel, k) {
  const top = rel.slice(0, k);
  const good = top.reduce((a, b) => a + b, 0);
  const first = rel.findIndex((r) => r === 1);
  const rr = first !== -1 && first < k ? 1 / (first + 1) : 0;
  const dcg = top.reduce((sum, r, i) => sum + r / Math.log2(i + 2), 0);
  let idcg = 0;
  // if you mark more rows good than the collection has, they become part of the collection too
  const totalGood = Math.max(MX_TOTAL_GOOD, rel.reduce((a, b) => a + b, 0));
  for (let i = 0; i < Math.min(totalGood, k); i += 1) idcg += 1 / Math.log2(i + 2);
  return { precision: good / k, recall: good / totalGood, mrr: rr, ndcg: idcg ? dcg / idcg : 0, good, first: first === -1 ? null : first + 1 };
}

function initMetricsLab() {
  const listEl = document.getElementById("mx-list");
  const barsEl = document.getElementById("mx-bars");
  if (!listEl || !barsEl) return;
  const slK = document.getElementById("sl-mx-k");
  let rel = [...MX_PRESETS.human];
  function render() {
    const k = Number(slK.value);
    document.getElementById("val-mx-k").textContent = String(k);
    listEl.innerHTML = rel.map((r, i) => `
      <button type="button" class="mx-row${r ? " good" : ""}${i >= k ? " past" : ""}" data-mx-i="${i}" aria-pressed="${r === 1}">
        <span class="mx-rank">#${i + 1}</span><span class="mx-name">result ${String.fromCharCode(65 + i)}</span><span class="mx-tag">${r ? "good" : "not good"}</span>
      </button>`).join("");
    const m = mxMetrics(rel, k);
    const rows = [
      ["Precision@" + k, m.precision, "of the shown results, share that are good"],
      ["Recall@" + k, m.recall, "of all 5 good pages, share that are shown"],
      ["MRR", m.mrr, "1 ÷ rank of the first good result (0 if past k)"],
      ["NDCG@" + k, m.ndcg, "good results, discounted by position"],
    ];
    barsEl.innerHTML = rows.map(([name, v, hint]) => `
      <div class="mx-bar">
        <div class="mx-bar-top"><span>${name}</span><b>${v.toFixed(2)}</b></div>
        <div class="doc-bar-track"><div class="doc-bar-fill" style="width:${Math.round(v * 100)}%"></div></div>
        <div class="mx-hint">${hint}</div>
      </div>`).join("");
    let why;
    if (m.good === 0) why = m.first ? `The first good result is at #${m.first}, past the cutoff k = ${k}, so every metric reads 0. Raise k to ${m.first} and they all wake up.` : "Nothing is marked good, so every metric is 0.";
    else if (m.mrr === 1 && m.recall < 0.5) why = "The first result is good, so MRR is a perfect 1.0. But recall is low: most good pages never made the list. A one-answer search would be happy, an agent wouldn't.";
    else if (m.recall >= 0.6 && m.mrr < 1) why = `Recall is high (${Math.round(m.recall * 100)}%), which is what an agent reading the whole list needs. MRR is only ${m.mrr.toFixed(2)} because the first good result is at #${m.first}. Same list, different verdicts.`;
    else why = `${m.good} good result${m.good === 1 ? "" : "s"} in the top ${k}. MRR only looks at the first good one (#${m.first}); NDCG also cares where the others sit.`;
    readout(document.getElementById("ro-metrics"), [["k", k], ["good in top k", m.good], ["first good at", m.first ? `#${m.first}` : "—"]], why);
  }
  listEl.addEventListener("click", (e) => {
    const b = e.target.closest("[data-mx-i]");
    if (!b) return;
    const i = Number(b.dataset.mxI);
    rel[i] = rel[i] ? 0 : 1;
    document.querySelectorAll("[data-mx-preset]").forEach((x) => x.classList.remove("active"));
    render();
    const again = listEl.querySelector(`[data-mx-i="${i}"]`);
    if (again) again.focus();
  });
  slK.addEventListener("input", render);
  document.querySelectorAll("[data-mx-preset]").forEach((b) => b.addEventListener("click", () => {
    document.querySelectorAll("[data-mx-preset]").forEach((x) => x.classList.toggle("active", x === b));
    rel = [...MX_PRESETS[b.dataset.mxPreset]];
    render();
  }));
  render();
}
