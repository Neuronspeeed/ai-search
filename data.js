/* ==========================================================================
   Shared Corpus & Pure IR Math (Tokenization, Inverted Index, TF-IDF, BM25)
   Built around an ECONNRESET developer-docs scenario.
   (pure functions, no DOM)
   ========================================================================== */

export const STOP_WORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "by", "for", "from",
  "in", "is", "it", "of", "on", "or", "that", "the", "to", "with", "your",
]);

/**
 * Simple transparent stemmer/normalizer so readers can see every step.
 */
// "runn" -> "run", "stopp" -> "stop" (keep ll/ss/zz as in "call", "pass")
function undouble(t) {
  return /([^aeioulsz])\1$/.test(t) ? t.slice(0, -1) : t;
}

export function normalizeToken(raw) {
  let t = raw.toLowerCase().replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, "");
  if (t.length > 4) {
    if (t.endsWith("ies")) t = t.slice(0, -3) + "y";
    else if (t.endsWith("ing") && t.length > 5) t = undouble(t.slice(0, -3));
    else if (t.endsWith("ed") && t.length > 4) t = undouble(t.slice(0, -2));
    else if (t.endsWith("s") && !t.endsWith("ss")) t = t.slice(0, -1);
  }
  return t;
}

export function analyzeText(input) {
  const rawParts = input
    .trim()
    .split(/[\s\-_/]+/)
    .filter(Boolean);
  const lowered = rawParts.map((w) => w.toLowerCase().replace(/[^a-z0-9]/g, "")).filter(Boolean);
  const tokens = [];
  const dropped = [];
  for (const w of lowered) {
    if (STOP_WORDS.has(w)) {
      dropped.push(w);
    } else {
      const stemmed = normalizeToken(w);
      if (stemmed) tokens.push(stemmed);
    }
  }
  return { rawParts, lowered, dropped, tokens };
}

/**
 * Realistic 8-page developer docs corpus anchored in Andrei's ECONNRESET scenario.
 */
export const DOCS_CORPUS = [
  {
    id: "d1",
    title: "Fixing ECONNRESET in HTTP Clients",
    category: "docs",
    length: 220,
    isChangelog: false,
    text: "Fix econnreset connection reset errors by enabling keepalive sockets and exponential retry backoff on idle pool drops.",
    tf: { econnreset: 4, connection: 3, reset: 3, retry: 3, timeout: 1, error: 2, keepalive: 2, pool: 2 },
  },
  {
    id: "d2",
    title: "HTTP Keep-Alive & Connection Pools",
    category: "docs",
    length: 310,
    isChangelog: false,
    text: "Stale keepalive sockets cause connection reset and econnreset when load balancers close idle connections before the client pool.",
    tf: { econnreset: 2, connection: 5, reset: 2, retry: 1, timeout: 2, error: 1, keepalive: 5, pool: 4 },
  },
  {
    id: "d3",
    title: "Retry & Backoff Patterns",
    category: "docs",
    length: 260,
    isChangelog: false,
    text: "Use jittered retry backoff for transient network timeout and connection reset errors. Never retry non-idempotent POST requests.",
    tf: { econnreset: 1, connection: 2, reset: 2, retry: 6, timeout: 3, error: 2, keepalive: 0, pool: 1 },
  },
  {
    id: "d4",
    title: "SDK v4.x Release Changelog",
    category: "changelog",
    length: 1400,
    isChangelog: true,
    text: "Release notes covering 80 fixes including econnreset logging, timeout defaults, retry hooks, and connection pool telemetry.",
    tf: { econnreset: 6, connection: 4, reset: 2, retry: 3, timeout: 4, error: 9, keepalive: 1, pool: 2 },
  },
  {
    id: "d5",
    title: "Keyword-Stuffed Troubleshooting FAQ",
    category: "docs",
    length: 340,
    isChangelog: false,
    text: "econnreset econnreset econnreset faq list of error codes: econnreset, timeout, connection reset. See support portal for help.",
    tf: { econnreset: 14, connection: 1, reset: 1, retry: 0, timeout: 1, error: 5, keepalive: 0, pool: 0 },
  },
  {
    id: "d6",
    title: "Request Timeout Configuration",
    category: "docs",
    length: 190,
    isChangelog: false,
    text: "Configure connect timeout and read timeout thresholds to avoid hanging requests and socket errors under load.",
    tf: { econnreset: 0, connection: 2, reset: 0, retry: 1, timeout: 7, error: 3, keepalive: 0, pool: 1 },
  },
  {
    id: "d7",
    title: "Rate Limit (429) Handling",
    category: "docs",
    length: 240,
    isChangelog: false,
    text: "Respect Retry-After headers on 429 rate limit error responses with exponential retry backoff.",
    tf: { econnreset: 0, connection: 0, reset: 0, retry: 5, timeout: 0, error: 4, keepalive: 0, pool: 0 },
  },
  {
    id: "d8",
    title: "Billing & Invoice FAQ",
    category: "billing",
    length: 180,
    isChangelog: false,
    text: "Update credit card billing details, download VAT invoices, and reset billing admin passwords.",
    tf: { econnreset: 0, connection: 0, reset: 1, retry: 0, timeout: 0, error: 1, keepalive: 0, pool: 0 },
  },
];

/**
 * Build an inverted index from DOCS_CORPUS.
 */
export function buildInvertedIndex(docs = DOCS_CORPUS) {
  const index = new Map();
  for (const doc of docs) {
    for (const [term, count] of Object.entries(doc.tf)) {
      if (count <= 0) continue;
      if (!index.has(term)) index.set(term, []);
      index.get(term).push({ docId: doc.id, title: doc.title, tf: count });
    }
  }
  return index;
}

/**
 * Robertson–Sparck Jones / Lucene smoothed IDF:
 *   IDF(t) = ln(1 + (N - df + 0.5) / (df + 0.5))
 */
export function bm25Idf(df, N) {
  return Math.log(1 + (N - df + 0.5) / (df + 0.5));
}

/**
 * Standard TF-IDF (raw tf * smoothed idf)
 */
export function tfidfTermWeight(tf, df, N) {
  if (tf <= 0) return 0;
  return tf * bm25Idf(df, N); // raw tf × the same IDF BM25 uses, so only the TF part differs
}

/**
 * BM25 term TF-norm component (textbook form with (k1 + 1) in numerator):
 *   tf * (k1 + 1) / (tf + k1 * (1 - b + b * (dl / avgdl)))
 */
export function bm25TfNorm(tf, k1, b, lenRatio) {
  if (tf <= 0) return 0;
  return (tf * (k1 + 1)) / (tf + k1 * (1 - b + b * lenRatio));
}

/**
 * Score a document for query tokens under BM25.
 */
export function scoreDocBM25(doc, queryTokens, docs, k1 = 1.2, b = 0.75) {
  const N = docs.length;
  const avgdl = docs.reduce((s, d) => s + d.length, 0) / N;
  const lenRatio = doc.length / avgdl;
  const uniqueTokens = [...new Set(queryTokens)];
  let total = 0;
  const breakdown = [];

  for (const term of uniqueTokens) {
    const tf = doc.tf[term] || 0;
    const df = docs.reduce((c, d) => c + ((d.tf[term] || 0) > 0 ? 1 : 0), 0);
    if (tf > 0 && df > 0) {
      const idf = bm25Idf(df, N);
      const tfPart = bm25TfNorm(tf, k1, b, lenRatio);
      const score = idf * tfPart;
      total += score;
      breakdown.push({ term, tf, df, idf, tfPart, score });
    }
  }

  return { total, lenRatio, breakdown };
}

/**
 * Score a document for query tokens under naive TF-IDF (no saturation, no length norm).
 */
export function scoreDocTFIDF(doc, queryTokens, docs) {
  const N = docs.length;
  const uniqueTokens = [...new Set(queryTokens)];
  let total = 0;
  for (const term of uniqueTokens) {
    const tf = doc.tf[term] || 0;
    const df = docs.reduce((c, d) => c + ((d.tf[term] || 0) > 0 ? 1 : 0), 0);
    if (tf > 0 && df > 0) {
      total += tfidfTermWeight(tf, df, N);
    }
  }
  return total;
}

/* ==========================================================================
   Part 2–4 Data & Pure Math (§4 Signals, §5 SKG/Query Pipeline,
   §6 SDBN Click Models & Beta Prior, §7 Dense/ANN/Quantization,
   §8 Hybrid RRF/RSF, §9 NDCG@k & RAG Abstention)
   ========================================================================== */

/**
 * §4 Signals Boosting & Half-Life Time Decay
 */
export function halfLifeDecay(weight, ageDays, halfLifeDays) {
  return weight * Math.pow(0.5, ageDays / Math.max(1, halfLifeDays));
}

export const BOOST_SCENARIOS = {
  rare: {
    label: "Rare query: \"econnreset keepalive\"",
    docs: [
      { id: "d1", title: "Fixing ECONNRESET in HTTP Clients", bm25: 3.2, clicks: 6, ageDays: 12 },
      { id: "d2", title: "HTTP Keep-Alive & Connection Pools", bm25: 2.8, clicks: 10, ageDays: 20 },
      { id: "d6", title: "Getting Started (Home)", bm25: 0.6, clicks: 420, ageDays: 4 },
      { id: "d7", title: "Pricing & Plans", bm25: 0.4, clicks: 310, ageDays: 8 },
    ],
  },
  common: {
    label: "Common query: \"api error\"",
    docs: [
      { id: "d1", title: "Fixing ECONNRESET in HTTP Clients", bm25: 1.9, clicks: 95, ageDays: 10 },
      { id: "d7", title: "Rate Limit (429) Handling", bm25: 1.85, clicks: 260, ageDays: 5 },
      { id: "d3", title: "Retry & Backoff Patterns", bm25: 1.75, clicks: 140, ageDays: 18 },
      { id: "d4", title: "SDK v4.x Release Changelog", bm25: 1.7, clicks: 12, ageDays: 90 },
    ],
  },
};

/**
 * §5 Semantic Query Interpretation & SKG
 */
export const QUERY_PIPELINE_PRESETS = {
  econnreset: {
    raw: "fast econnreset fix in node",
    tokens: [
      { text: "fast", type: "modifier", note: "intent: concise guide" },
      { text: "econnreset", type: "entity", note: "errno: ECONNRESET" },
      { text: "fix", type: "keyword", note: "troubleshooting" },
      { text: "in", type: "stop", note: "dropped" },
      { text: "node", type: "entity", note: "runtime: nodejs" },
    ],
    skgContext: "Context: network_error + nodejs",
    skgNodes: [
      { term: "socket hang up", z: 0.91 },
      { term: "keep-alive timeout", z: 0.84 },
      { term: "http.Agent pool", z: 0.78 },
      { term: "retry backoff", z: 0.62 },
      { term: "billing invoice", z: -0.45 },
    ],
    transformed: 'must:(econnreset OR "socket hang up"^0.8) filter:(runtime:nodejs AND category:docs) boost:(keepalive^1.4)',
  },
  driver_tech: {
    raw: "postgres driver timeout",
    tokens: [
      { text: "postgres", type: "entity", note: "db: postgresql" },
      { text: "driver", type: "entity", note: "sense: software_client" },
      { text: "timeout", type: "entity", note: "errno: ETIMEDOUT" },
    ],
    skgContext: "2-level disambiguation: technology > database",
    skgNodes: [
      { term: "connection pool", z: 0.89 },
      { term: "pgBouncer", z: 0.82 },
      { term: "statement_timeout", z: 0.76 },
      { term: "golf club", z: -0.72 },
      { term: "rideshare taxi", z: -0.81 },
    ],
    transformed: 'must:(driver AND timeout) filter:(domain:databases AND engine:postgres) expand:("connection pool"^0.85)',
  },
  top_near: {
    raw: "top redis cache guide",
    tokens: [
      { text: "top", type: "function", note: "semantic_fn: sort_by_rating" },
      { text: "redis", type: "entity", note: "tech: redis" },
      { text: "cache", type: "keyword", note: "topic: caching" },
      { text: "guide", type: "entity", note: "doc_type: tutorial" },
    ],
    skgContext: "Trigger word 'top' -> function boost",
    skgNodes: [
      { term: "TTL eviction", z: 0.87 },
      { term: "LRU policy", z: 0.79 },
      { term: "cluster sharding", z: 0.68 },
      { term: "pipelining", z: 0.58 },
      { term: "rate limit 429", z: 0.12 },
    ],
    transformed: 'must:(redis AND cache) filter:(doc_type:tutorial) boost:(mul(helpfulness_score, 2.0))',
  },
};

/**
 * §6 SDBN Click Model & Beta Prior
 */
export function betaAdjustedGrade(clicks, examines, priorGrade = 0.25, priorWeight = 50) {
  const alphaPrior = priorGrade * priorWeight;
  const betaPrior = (1 - priorGrade) * priorWeight;
  const alphaPost = alphaPrior + clicks;
  const betaPost = betaPrior + Math.max(0, examines - clicks);
  return alphaPost / (alphaPost + betaPost);
}

/**
 * §7 Dense Embeddings, IVF Clusters & Quantization
 */
export const EMBEDDING_POINTS = [
  { id: "d1", label: "Fixing ECONNRESET", cluster: 0, x: 0.78, y: 0.76, lexMatch: { socket: false, rate: false, card: false } },
  { id: "d2", label: "Keep-Alive Pools", cluster: 0, x: 0.70, y: 0.68, lexMatch: { socket: true, rate: false, card: false } },
  { id: "d3", label: "Retry & Backoff", cluster: 0, x: 0.62, y: 0.54, lexMatch: { socket: false, rate: false, card: false } },
  { id: "d6", label: "Timeout Config", cluster: 1, x: 0.48, y: 0.78, lexMatch: { socket: true, rate: false, card: false } },
  { id: "d7", label: "Rate Limit (429)", cluster: 1, x: 0.30, y: 0.64, lexMatch: { socket: false, rate: true, card: false } },
  { id: "d4", label: "SDK Changelog", cluster: 2, x: 0.44, y: 0.32, lexMatch: { socket: false, rate: false, card: false } },
  { id: "d5", label: "Stuffed FAQ", cluster: 2, x: 0.66, y: 0.28, lexMatch: { socket: false, rate: false, card: false } },
  { id: "d8", label: "Billing & Invoices", cluster: 3, x: 0.18, y: 0.22, lexMatch: { socket: false, rate: false, card: true } },
];

export const IVF_CENTROIDS = [
  { id: 0, label: "C0: Network", x: 0.70, y: 0.66 },
  { id: 1, label: "C1: Throttling", x: 0.39, y: 0.71 },
  { id: 2, label: "C2: General", x: 0.55, y: 0.30 },
  { id: 3, label: "C3: Billing", x: 0.18, y: 0.22 },
];

export const DENSE_QUERIES = {
  socket: { text: "socket hang up on idle server", x: 0.76, y: 0.73, key: "socket" },
  rate: { text: "too many requests error", x: 0.32, y: 0.66, key: "rate" },
  card: { text: "credit card payment failed", x: 0.21, y: 0.25, key: "card" },
};

/**
 * §8 Hybrid Search: RRF vs RSF
 */
export const HYBRID_SCENARIOS = {
  outlier: {
    label: "Outlier score spike breaks RSF",
    docs: [
      { id: "d5", title: "Stuffed FAQ (BM25 spike)", bm25: 14.2, vec: 0.76 },
      { id: "d1", title: "Fixing ECONNRESET Guide", bm25: 5.4, vec: 0.91 },
      { id: "d2", title: "Keep-Alive & Pools", bm25: 4.9, vec: 0.87 },
      { id: "d3", title: "Retry & Backoff Patterns", bm25: 3.2, vec: 0.82 },
      { id: "d6", title: "Timeout Configuration", bm25: 1.8, vec: 0.48 },
    ],
  },
  consensus: {
    label: "Consensus win in RRF",
    docs: [
      { id: "d1", title: "Fixing ECONNRESET Guide", bm25: 6.1, vec: 0.88 },
      { id: "d2", title: "Keep-Alive & Pools", bm25: 6.8, vec: 0.62 },
      { id: "d3", title: "Retry & Backoff Patterns", bm25: 3.1, vec: 0.92 },
      { id: "d6", title: "Timeout Configuration", bm25: 4.5, vec: 0.74 },
      { id: "d4", title: "SDK v4.x Changelog", bm25: 5.2, vec: 0.48 },
    ],
  },
  onelist: {
    label: "A page only one list finds",
    // bm25: null = BM25 never retrieved it (the page doesn't contain the word)
    docs: [
      { id: "e1", title: "Error Code List", bm25: 14.2, vec: 0.86 },
      { id: "e2", title: "Changelog 2.4", bm25: 9.8, vec: 0.7 },
      { id: "e3", title: "Socket Errors", bm25: 8.1, vec: 0.9 },
      { id: "e4", title: "Retry Policy", bm25: 6.0, vec: 0.84 },
      { id: "e5", title: "Proxy Setup", bm25: 4.2, vec: 0.6 },
      { id: "e6", title: "Connection Resets", bm25: null, vec: 0.93 },
      { id: "e7", title: "Timeouts", bm25: null, vec: 0.66 },
      { id: "e8", title: "Load Balancer FAQ", bm25: null, vec: 0.55 },
    ],
  },
};

export function fuseHybrid(docs, mode = "rrf", k = 60, bm25Weight = 0.5) {
  // a page missing from a list (score null) gets no RRF vote and 0 in RSF from that list
  const inB = docs.filter((d) => d.bm25 != null), inV = docs.filter((d) => d.vec != null);
  const byBm25 = [...inB].sort((a, b) => b.bm25 - a.bm25);
  const byVec = [...inV].sort((a, b) => b.vec - a.vec);
  const rankBm25 = new Map(byBm25.map((d, i) => [d.id, i + 1]));
  const rankVec = new Map(byVec.map((d, i) => [d.id, i + 1]));

  const minB = Math.min(...inB.map((d) => d.bm25));
  const maxB = Math.max(...inB.map((d) => d.bm25));
  const minV = Math.min(...inV.map((d) => d.vec));
  const maxV = Math.max(...inV.map((d) => d.vec));

  return docs
    .map((d) => {
      const rB = rankBm25.get(d.id) ?? null;
      const rV = rankVec.get(d.id) ?? null;
      const rrfB = rB ? 1 / (k + rB) : 0;
      const rrfV = rV ? 1 / (k + rV) : 0;
      const normB = rB == null ? 0 : maxB > minB ? (d.bm25 - minB) / (maxB - minB) : 1;
      const normV = rV == null ? 0 : maxV > minV ? (d.vec - minV) / (maxV - minV) : 1;
      const rsfB = bm25Weight * normB;
      const rsfV = (1 - bm25Weight) * normV;
      const fused = mode === "rrf" ? rrfB + rrfV : rsfB + rsfV;
      return {
        ...d,
        rB,
        rV,
        partB: mode === "rrf" ? rrfB : rsfB,
        partV: mode === "rrf" ? rrfV : rsfV,
        fused,
      };
    })
    .sort((a, b) => b.fused - a.fused);
}

/**
 * §9 Relevance Evaluation: DCG, IDCG, NDCG@k
 */
export function computeNdcg(items, k = 5, gainMode = "exp") {
  const gain = (rel) => (gainMode === "exp" ? Math.pow(2, rel) - 1 : rel);
  const cutoff = Math.min(k, items.length);
  const dcgSteps = [];
  let dcg = 0;
  for (let i = 0; i < cutoff; i++) {
    const discount = Math.log2(i + 2);
    const contrib = gain(items[i].rel) / discount;
    dcg += contrib;
    dcgSteps.push({ rank: i + 1, rel: items[i].rel, discount, contrib, cumDcg: dcg });
  }

  const ideal = [...items].sort((a, b) => b.rel - a.rel);
  const idcgSteps = [];
  let idcg = 0;
  for (let i = 0; i < cutoff; i++) {
    const discount = Math.log2(i + 2);
    idcg += gain(ideal[i].rel) / discount;
    idcgSteps.push(idcg);
  }

  return {
    dcg,
    idcg,
    ndcg: idcg > 0 ? dcg / idcg : 0,
    dcgSteps,
    idcgSteps,
  };
}

/**
 * §9 Expected Reciprocal Rank (ERR@k) — Cascade stopping model
 */
export function computeErr(items, k = 5, maxGrade = 3) {
  const cutoff = Math.min(k, items.length);
  let err = 0;
  let pContinue = 1.0;
  const denom = Math.pow(2, maxGrade);
  for (let i = 0; i < cutoff; i++) {
    const r = (Math.pow(2, items[i].rel) - 1) / denom;
    err += (pContinue * r) / (i + 1);
    pContinue *= 1 - r;
  }
  return err;
}

