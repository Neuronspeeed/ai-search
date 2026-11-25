/* ==========================================================================
   Reading & learning UX layer (runs after all labs are built)
   - accessible lab regions, chart names, demo links
   - reading time per chapter, "continue where you left off"
   - "Try it" buttons on walkthrough steps
   - glossary tooltips for recurring terms
   - one check-yourself question per Part
   ========================================================================== */
import { WALK_ACTIONS } from "./app-ux-data.js";

const reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const scrollOpts = (block = "start") => ({ behavior: reduceMotion ? "auto" : "smooth", block });

/* ---------- labs: regions, headings, chart names, copy-link ---------- */
function enhanceLabs() {
  document.querySelectorAll(".lab[id]").forEach((lab) => {
    const name = lab.querySelector(".lab-name");
    if (name) {
      name.id = name.id || `${lab.id}-title`;
      name.setAttribute("role", "heading");
      name.setAttribute("aria-level", "3");
      lab.setAttribute("role", "region");
      lab.setAttribute("aria-labelledby", name.id);
    }
    const ro = lab.querySelector(".readout[id]");
    lab.querySelectorAll("canvas").forEach((c) => {
      if (!c.hasAttribute("role")) c.setAttribute("role", "img");
      if (ro && !c.hasAttribute("aria-describedby")) c.setAttribute("aria-describedby", ro.id);
    });
    const header = lab.querySelector(".lab-header");
    if (header && !header.querySelector(".lab-link")) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "lab-link";
      b.textContent = "Copy link";
      b.setAttribute("aria-label", `Copy a link to this demo${name ? `: ${name.textContent.trim()}` : ""}`);
      b.addEventListener("click", async () => {
        const url = `${location.origin}${location.pathname}#${lab.id}`;
        try { await navigator.clipboard.writeText(url); b.textContent = "Copied ✓"; } catch (e) { b.textContent = "Link in address bar"; history.replaceState(null, "", `#${lab.id}`); }
        setTimeout(() => { b.textContent = "Copy link"; }, 1600);
      });
      header.appendChild(b);
    }
  });
}

/* ---------- reading time per chapter ---------- */
function readingTimes() {
  document.querySelectorAll("section.chapter[id]").forEach((sec) => {
    const words = sec.innerText.split(/\s+/).filter(Boolean).length;
    const min = Math.max(1, Math.round(words / 220));
    const demos = sec.querySelectorAll(".lab").length;
    const meta = `${min} min${demos ? ` · ${demos} demo${demos > 1 ? "s" : ""}` : ""}`;
    const eyebrow = sec.querySelector(".eyebrow");
    if (eyebrow && !eyebrow.querySelector(".read-meta")) {
      const span = document.createElement("span");
      span.className = "read-meta";
      span.textContent = ` · ${meta}`;
      eyebrow.appendChild(span);
    }
    const link = document.querySelector(`nav.toc a[href="#${sec.id}"]`);
    if (link && !link.querySelector(".toc-min")) {
      const span = document.createElement("span");
      span.className = "toc-min";
      span.textContent = `${min}m`;
      span.setAttribute("aria-label", `${min} minute read`);
      link.appendChild(span);
    }
  });
}

/* ---------- continue where you left off ---------- */
function resume() {
  const KEY = "ais-last-section";
  const secs = [...document.querySelectorAll("section.chapter[id]")];
  let t = null;
  window.addEventListener("scroll", () => {
    clearTimeout(t);
    t = setTimeout(() => {
      let cur = null;
      for (const s of secs) if (s.getBoundingClientRect().top <= 160) cur = s;
      if (cur) try { localStorage.setItem(KEY, cur.id); } catch (e) { /* private mode */ }
    }, 400);
  }, { passive: true });
  let saved = null;
  try { saved = localStorage.getItem(KEY); } catch (e) { /* ignore */ }
  const idx = secs.findIndex((s) => s.id === saved);
  if (location.hash || idx < 1) return;
  const sec = secs[idx];
  const title = sec.querySelector("h2")?.firstChild?.textContent?.trim() || sec.id;
  const num = (sec.querySelector(".eyebrow")?.textContent.match(/§\d+/) || [""])[0];
  const bar = document.createElement("div");
  bar.className = "resume-bar";
  bar.setAttribute("role", "region");
  bar.setAttribute("aria-label", "Continue reading");
  bar.innerHTML = `<span>Welcome back. Continue at <b></b>?</span><a class="resume-go" href="#${sec.id}">Continue →</a><button type="button" class="resume-x" aria-label="Dismiss">✕</button>`;
  bar.querySelector("b").textContent = `${num} ${title}`;
  bar.querySelector(".resume-x").addEventListener("click", () => bar.remove());
  bar.querySelector(".resume-go").addEventListener("click", (e) => { e.preventDefault(); sec.scrollIntoView(scrollOpts()); bar.remove(); });
  const hero = document.querySelector(".hero");
  if (hero) hero.prepend(bar);
}

/* ---------- Try it ---------- */
function labFor(ol) {
  let el = ol.previousElementSibling;
  while (el && !el.classList.contains("lab")) el = el.previousElementSibling;
  return el;
}
function runActions(actions) {
  for (const a of actions) {
    if (a.click) { const el = document.querySelector(a.click); if (el) el.click(); }
    else if (a.set) {
      const el = document.querySelector(a.set);
      if (el) { el.value = a.value; el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); }
    } else if (a.check) {
      const el = document.querySelector(a.check);
      if (el && el.checked !== a.value) { el.checked = a.value; el.dispatchEvent(new Event("change", { bubbles: true })); el.dispatchEvent(new Event("input", { bubbles: true })); }
    }
  }
}
function tryIt() {
  let added = 0;
  document.querySelectorAll("ol.walkthrough").forEach((ol) => {
    const lab = labFor(ol);
    if (!lab) return;
    const steps = WALK_ACTIONS[lab.id];
    if (!steps) return;
    [...ol.children].forEach((li, i) => {
      const acts = steps[i];
      if (!acts || !acts.length || li.querySelector(".try-btn")) return;
      const b = document.createElement("button");
      b.type = "button";
      b.className = "try-btn";
      b.textContent = "▸ Try it";
      b.setAttribute("aria-label", `Try step ${i + 1} in the demo above`);
      b.addEventListener("click", () => {
        runActions(acts);
        ol.querySelectorAll("li.step-on").forEach((x) => x.classList.remove("step-on"));
        li.classList.add("step-on");
        lab.scrollIntoView(scrollOpts("center"));
        lab.classList.remove("flash"); void lab.offsetWidth; lab.classList.add("flash");
      });
      li.appendChild(b);
      added += 1;
    });
  });
  return added;
}

/* ---------- glossary ---------- */
const GLOSSARY = [
  ["inverted index", "A lookup table from each word to the list of pages that contain it.", "primer"],
  ["TF-IDF", "Term frequency × inverse document frequency: how often a word appears on a page, times how rare it is overall.", "bm25"],
  ["IDF", "Inverse document frequency: a rarity weight. Words on few pages count more than words on every page.", "bm25"],
  ["BM25", "The standard keyword ranking formula: TF-IDF with saturation (k₁) and a length penalty (b).", "bm25"],
  ["k₁", "BM25's saturation knob: how quickly repeats stop adding score. The TF weight can never pass k₁ + 1.", "bm25"],
  ["min match", "Require a page to contain at least some of the query words (e.g. 2 of 3), between AND and OR.", "matching"],
  ["half-life", "Time decay: a click's weight halves every λ days, so old popularity fades.", "signals"],
  ["knowledge graph", "A graph of related words and entities. Here it is computed on the fly from which words appear together.", "semantic-query"],
  ["relatedness", "How much more often a word appears with another than chance predicts, squashed to −1…+1.", "semantic-query"],
  ["position bias", "People click higher results more, whatever their quality, so raw clicks overrate top positions.", "clicks"],
  ["click model", "A model that turns raw clicks into fair relevance labels by accounting for what users actually saw.", "clicks"],
  ["SDBN", "Simplified Dynamic Bayesian Network: a click model that counts a result as seen only if it is at or above the last click.", "clicks"],
  ["learning to rank", "Training a model on features (BM25, freshness, popularity…) to order results, instead of hand-tuning weights.", "ltr"],
  ["LambdaMART", "A gradient-boosted tree ranker whose training targets NDCG. The most common learning-to-rank model in production.", "ltr"],
  ["embedding", "A list of numbers that places text in a space where similar meanings sit close together.", "dense"],
  ["cosine", "Cosine similarity: compares the direction of two vectors and ignores their length (1 = same direction).", "primer"],
  ["bi-encoder", "A model that encodes query and document separately, so documents can be embedded ahead of time. Fast.", "dense"],
  ["cross-encoder", "A model that reads query and document together. More accurate but slow, so it reranks only the top results.", "dense"],
  ["RRF", "Reciprocal Rank Fusion: merge result lists using only positions, 1 / (k + rank) per list.", "hybrid"],
  ["RSF", "Relative Score Fusion: rescale each list's scores to 0–1, then take a weighted average.", "hybrid"],
  ["HNSW", "A graph index for vectors: hop greedily toward the query through layers of neighbors.", "vector-opt"],
  ["IVF", "A cluster index for vectors: only search the few clusters nearest the query.", "vector-opt"],
  ["quantization", "Storing each number with fewer bits to save memory, at some cost in accuracy.", "vector-opt"],
  ["ColBERT", "Late interaction: one vector per token; each query token takes its best match in the document (MaxSim).", "late-interaction"],
  ["SPLADE", "A model that predicts weighted expansion words for text, so it can run in a normal inverted index.", "late-interaction"],
  ["NDCG", "Normalized Discounted Cumulative Gain: rewards graded relevant results near the top; 1 = perfect order.", "eval"],
  ["MRR", "Mean Reciprocal Rank: 1 ÷ the rank of the first right answer, averaged over queries.", "eval"],
  ["RAG", "Retrieval-augmented generation: retrieve passages, then let an LLM answer using only them.", "rag"],
  ["semantic cache", "Reuse a stored answer when a new query is close enough in meaning to an old one.", "agentic"],
];
function glossary() {
  const tip = document.createElement("div");
  tip.id = "gloss-tip";
  tip.className = "gloss-tip";
  tip.setAttribute("role", "tooltip");
  tip.hidden = true;
  document.body.appendChild(tip);
  let current = null;
  const show = (btn) => {
    const [term, def, sec] = GLOSSARY[Number(btn.dataset.g)];
    const num = (document.querySelector(`#${sec} .eyebrow`)?.textContent.match(/§\d+/) || [""])[0];
    tip.innerHTML = `<b></b><span></span>${num ? `<em>Explained in ${num}</em>` : ""}`;
    tip.querySelector("b").textContent = term;
    tip.querySelector("span").textContent = def;
    tip.hidden = false;
    const r = btn.getBoundingClientRect();
    const tw = Math.min(300, window.innerWidth - 24);
    tip.style.width = `${tw}px`;
    tip.style.left = `${Math.max(12, Math.min(window.innerWidth - tw - 12, r.left + r.width / 2 - tw / 2))}px`;
    const below = r.bottom + 10 + tip.offsetHeight < window.innerHeight;
    tip.style.top = `${below ? r.bottom + 8 : r.top - tip.offsetHeight - 8}px`;
    btn.setAttribute("aria-describedby", "gloss-tip");
    btn.setAttribute("aria-expanded", "true");
    current = btn;
  };
  const hide = () => {
    tip.hidden = true;
    if (current) { current.removeAttribute("aria-describedby"); current.setAttribute("aria-expanded", "false"); }
    current = null;
  };
  const SKIP = "code, a, button, .lab, h1, h2, h3, .eq-strip, summary, .eyebrow, .takeaway-tag, .roadmap-card, .quiz, script, style, .katex, nav, .walkthrough, label";
  let wrapped = 0;
  document.querySelectorAll("section.chapter[id]").forEach((sec) => {
    const used = new Set();
    const walker = document.createTreeWalker(sec, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => (n.parentElement && !n.parentElement.closest(SKIP) && n.nodeValue.trim().length > 2 ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT),
    });
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    for (const node of nodes) {
      for (let gi = 0; gi < GLOSSARY.length; gi += 1) {
        if (used.has(gi)) continue;
        const term = GLOSSARY[gi][0];
        const re = new RegExp(`(^|[^\\w-])(${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})(?![\\w-])`);
        const m = node.nodeValue.match(re);
        if (!m) continue;
        const start = m.index + m[1].length;
        const after = node.splitText(start);
        after.splitText(m[2].length);
        const b = document.createElement("button");
        b.type = "button";
        b.className = "gloss";
        b.dataset.g = String(gi);
        b.setAttribute("aria-expanded", "false");
        b.textContent = m[2];
        after.parentNode.replaceChild(b, after);
        used.add(gi);
        wrapped += 1;
        break; // one term per text node keeps it light
      }
    }
  });
  document.addEventListener("mouseover", (e) => { const b = e.target.closest?.(".gloss"); if (b) show(b); });
  document.addEventListener("mouseout", (e) => { if (e.target.closest?.(".gloss")) hide(); });
  document.addEventListener("focusin", (e) => { const b = e.target.closest?.(".gloss"); if (b) show(b); });
  document.addEventListener("focusout", (e) => { if (e.target.closest?.(".gloss")) hide(); });
  document.addEventListener("click", (e) => {
    const b = e.target.closest?.(".gloss");
    if (b) { if (current === b && !tip.hidden) hide(); else show(b); }
    else if (!e.target.closest?.("#gloss-tip")) hide();
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") hide(); });
  window.addEventListener("scroll", () => { if (!tip.hidden) hide(); }, { passive: true });
  return wrapped;
}

/* ---------- check yourself ---------- */
const QUIZZES = {
  p1: {
    q: "A 5,000-word FAQ mentions \"econnreset\" 40 times. Why doesn't BM25 put it first?",
    options: [
      "IDF ignores words that repeat",
      "k₁ caps what repeats are worth, and b penalizes the very long page",
      "BM25 only counts each word once per page",
      "\"econnreset\" is a stop word",
    ],
    answer: 1,
    why: "Repeats saturate (the TF weight can't pass k₁ + 1) and the length penalty b shrinks pages much longer than average. IDF is about rarity across pages, not repeats.",
  },
  p2: {
    q: "Raw click rate says page B at #2 beats page D at #4. What's the catch?",
    options: [
      "Clicks are always noise, so ignore them",
      "Far fewer people ever look at #4, so D's clicks are undercounted; correct for position first",
      "Page B must be better, because it got more clicks",
      "Click rate only works for multiplied boosts",
    ],
    answer: 1,
    why: "Position bias: users look at #2 far more than #4. Divide clicks by how often each position is actually seen (or use a click model like SDBN) before comparing.",
  },
  p3: {
    q: "A page about \"connection reset\" never contains the word \"ECONNRESET\". Which setup finds it for the query \"ECONNRESET\"?",
    options: ["BM25 alone", "A stricter min match", "Hybrid search: BM25 plus vectors, merged (e.g. with RRF)", "A higher k₁"],
    answer: 2,
    why: "BM25 can only match words that are there. The vector search finds the same meaning in other words, and fusion brings that page into the merged list.",
  },
  p4: {
    q: "An LLM reads your top 20 results to write one answer. Which metric matters most?",
    options: ["MRR", "Precision@1", "Recall@20", "NDCG@3"],
    answer: 2,
    why: "The LLM reads the whole set, so what matters is whether the right passages are in it at all. Order inside the top 20 matters much less than for a person scanning a list.",
  },
  p5: {
    q: "Your RAG system blocks any chunk with cosine below a fixed τ = 0.70. What goes wrong?",
    options: [
      "Nothing; 0.70 is a standard cutoff",
      "Vague queries score lower overall, so their relevant chunks get blocked while specific queries pass",
      "Specific queries always fail",
      "Cosine can't be used for RAG",
    ],
    answer: 1,
    why: "Similarity scores mean different things for different queries. Decide eligibility with filters and query understanding, or put the threshold on a reranker's score.",
  },
};
function quizzes() {
  document.querySelectorAll(".quiz[data-quiz]").forEach((box) => {
    const Q = QUIZZES[box.dataset.quiz];
    if (!Q || box.childElementCount) return;
    const name = `quiz-${box.dataset.quiz}`;
    box.innerHTML = `<div class="quiz-tag">Check yourself</div><p class="quiz-q"></p><div class="quiz-opts" role="radiogroup"></div><p class="quiz-why" aria-live="polite"></p>`;
    box.querySelector(".quiz-q").textContent = Q.q;
    box.querySelector(".quiz-opts").setAttribute("aria-label", Q.q);
    const opts = box.querySelector(".quiz-opts");
    Q.options.forEach((text, i) => {
      const lab = document.createElement("label");
      lab.className = "quiz-opt";
      lab.innerHTML = `<input type="radio" name="${name}" value="${i}" /><span></span>`;
      lab.querySelector("span").textContent = text;
      opts.appendChild(lab);
    });
    opts.addEventListener("change", (e) => {
      const i = Number(e.target.value);
      opts.querySelectorAll(".quiz-opt").forEach((l, j) => {
        l.classList.toggle("right", j === Q.answer);
        l.classList.toggle("wrong", j === i && i !== Q.answer);
      });
      box.querySelector(".quiz-why").textContent = `${i === Q.answer ? "Right." : "Not quite."} ${Q.why}`;
    });
  });
}

export function initUx() {
  enhanceLabs();
  readingTimes();
  resume();
  const tries = tryIt();
  quizzes();
  const terms = glossary();
  return { tries, terms };
}
