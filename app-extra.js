/* ==========================================================================
   Additional interactive labs:
   - DEMO 6.2: Personalized Search & Category Guardrails
   - DEMO 6.3: Pairwise Learning to Rank (LTR) Trainer
   - DEMO 6.4: Presentation Bias & Active Learning
   - DEMO 9.3: Extractive QA Span Selection P_start x P_end
   ========================================================================== */

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function initExtraLabs({ getTokens, prepCanvas, redrawCallbacks }) {
  /* ========================================================================
     DEMO 6.2 — Personalized Search & Category Guardrails
     ======================================================================== */
  const persListEl = document.getElementById("pers-doc-list");
  const chkGuardrail = document.getElementById("chk-pers-guardrail");
  let persUser = "node";
  let persQuery = "reset";

  const USER_PROFILES = {
    node: { label: "Backend Node Eng", vec: { network: 0.95, billing: 0.08, auth: 0.25 }, cold: false },
    billing: { label: "Billing Admin", vec: { network: 0.10, billing: 0.96, auth: 0.45 }, cold: false },
    cold: { label: "New User (Cold Start)", vec: { network: 0.0, billing: 0.0, auth: 0.0 }, cold: true },
  };

  const PERS_DOCS = [
    { id: "d1", title: "Fixing ECONNRESET in HTTP Clients", cat: "network", bm25: { reset: 3.2, econnreset: 3.6 }, vec: { network: 0.95, billing: 0.05, auth: 0.1 } },
    { id: "d8", title: "Reset Billing Admin Password", cat: "billing", bm25: { reset: 3.1, econnreset: 0.4 }, vec: { network: 0.05, billing: 0.95, auth: 0.7 } },
    { id: "d2", title: "HTTP Keep-Alive & Connection Pools", cat: "network", bm25: { reset: 2.8, econnreset: 3.0 }, vec: { network: 0.88, billing: 0.05, auth: 0.1 } },
    { id: "d9", title: "SSO & Account Password Reset", cat: "auth", bm25: { reset: 3.0, econnreset: 0.1 }, vec: { network: 0.05, billing: 0.35, auth: 0.95 } },
  ];

  function renderPersonalizationLab() {
    if (!persListEl || !chkGuardrail) return;
    const profile = USER_PROFILES[persUser];
    const guardrailOn = chkGuardrail.checked;
    const queryCat = persQuery === "econnreset" ? "network" : null;

    const scored = PERS_DOCS.map((d) => {
      const base = d.bm25[persQuery];
      const rawAffinity =
        profile.vec.network * d.vec.network +
        profile.vec.billing * d.vec.billing +
        profile.vec.auth * d.vec.auth;
      const blockedByGuard = guardrailOn && queryCat && d.cat !== queryCat;
      const persBoost = profile.cold || blockedByGuard ? 0 : rawAffinity * 3.5;
      return { ...d, base, rawAffinity, persBoost, blockedByGuard, total: base + persBoost };
    }).sort((a, b) => b.total - a.total);

    const maxS = Math.max(0.01, ...scored.map((s) => s.total));
    const kpiTop = document.getElementById("kpi-pers-top");
    const hijacked = persQuery === "econnreset" && scored[0].cat !== "network";
    if (kpiTop) {
      kpiTop.textContent = scored[0].id === "d1" ? "Fixing ECONNRESET" : scored[0].id === "d8" ? "Reset Billing Pass" : scored[0].id === "d9" ? "SSO Password Reset" : "Keep-Alive Pools";
      kpiTop.className = `kpi-val ${hijacked ? "coral" : "brand"}`;
    }
    const kpiMode = document.getElementById("kpi-pers-mode");
    if (kpiMode) {
      kpiMode.textContent = profile.cold ? "BM25 Fallback" : guardrailOn ? "Guarded CF" : "Unguarded CF";
      const sub = kpiMode.nextElementSibling;
      if (sub) sub.textContent = profile.cold ? "No history to use yet" : guardrailOn ? "Protects specific queries" : "History can hijack any query";
    }

    persListEl.innerHTML = scored
      .map((d, idx) => {
        const pct = Math.round((d.total / maxS) * 100);
        const isBad = persQuery === "econnreset" && idx === 0 && d.cat !== "network";
        return `
          <div class="doc-row ${idx === 0 ? "top-hit" : ""}" style="${
            isBad ? "border-color:var(--sem-coral);background:rgba(251,113,133,0.1)" : ""
          }">
            <span class="doc-rank">#${idx + 1}</span>
            <div class="doc-info">
              <div class="doc-title">${escapeHtml(d.title)}</div>
              <div class="doc-meta">
                <span>BM25:${d.base.toFixed(1)}</span>
                <span>U·Vᵀ:+${d.persBoost.toFixed(2)}</span>
                <span>${d.blockedByGuard ? "guardrail blocked" : `cat:${d.cat}`}</span>
              </div>
              <div class="doc-bar-track"><div class="doc-bar-fill" style="width:${pct}%;${
                isBad ? "background:var(--sem-coral)" : ""
              }"></div></div>
            </div>
            <span class="doc-score">${d.total.toFixed(2)}</span>
          </div>
        `;
      })
      .join("");
  }

  if (chkGuardrail) chkGuardrail.addEventListener("change", renderPersonalizationLab);
  document.querySelectorAll("[data-pers-user]").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("[data-pers-user]").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      persUser = btn.dataset.persUser;
      renderPersonalizationLab();
    });
  });
  document.querySelectorAll("[data-pers-query]").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("[data-pers-query]").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      persQuery = btn.dataset.persQuery;
      renderPersonalizationLab();
    });
  });
  redrawCallbacks.push(renderPersonalizationLab);

  /* ========================================================================
     DEMO 6.3 — Pairwise Learning to Rank (LTR) Feature Trainer
     ======================================================================== */
  const slLtrTitle = document.getElementById("sl-ltr-title");
  const slLtrBody = document.getElementById("sl-ltr-body");
  const slLtrPop = document.getElementById("sl-ltr-pop");
  const slLtrFresh = document.getElementById("sl-ltr-fresh");
  const ltrListEl = document.getElementById("ltr-doc-list");

  const LTR_DOCS = [
    { id: "d1", title: "Fixing ECONNRESET in HTTP Clients", rel: 3, f: [0.95, 0.72, 0.85, 0.90] },
    { id: "d2", title: "HTTP Keep-Alive & Connection Pools", rel: 2, f: [0.70, 0.65, 0.75, 0.80] },
    { id: "d3", title: "Retry & Backoff Patterns", rel: 2, f: [0.55, 0.60, 0.70, 0.85] },
    { id: "d5", title: "Stuffed FAQ (High Body TF)", rel: 0, f: [0.20, 0.98, 0.15, 0.25] },
    { id: "d4", title: "Old SDK v2 Changelog", rel: 1, f: [0.30, 0.80, 0.20, 0.10] },
  ];

  function getLtrWeights() {
    return [
      Number(slLtrTitle?.value || 0.2),
      Number(slLtrBody?.value || 0.9),
      Number(slLtrPop?.value || 0.1),
      Number(slLtrFresh?.value || 0.1),
    ];
  }

  function setLtrWeights(w) {
    if (!slLtrTitle) return;
    slLtrTitle.value = Math.max(0, Math.min(2, w[0])).toFixed(2);
    slLtrBody.value = Math.max(0, Math.min(2, w[1])).toFixed(2);
    slLtrPop.value = Math.max(0, Math.min(2, w[2])).toFixed(2);
    slLtrFresh.value = Math.max(0, Math.min(2, w[3])).toFixed(2);
  }

  function trainPairwiseStep() {
    const w = getLtrWeights();
    const lr = 0.25;
    for (let i = 0; i < LTR_DOCS.length; i++) {
      for (let j = 0; j < LTR_DOCS.length; j++) {
        if (LTR_DOCS[i].rel > LTR_DOCS[j].rel) {
          const si = w.reduce((s, wi, k) => s + wi * LTR_DOCS[i].f[k], 0);
          const sj = w.reduce((s, wi, k) => s + wi * LTR_DOCS[j].f[k], 0);
          if (si <= sj + 0.15) {
            for (let k = 0; k < 4; k++) {
              w[k] += lr * (LTR_DOCS[i].f[k] - LTR_DOCS[j].f[k]);
            }
          }
        }
      }
    }
    setLtrWeights(w);
  }

  function ltrInversions(w) {
    const sc = LTR_DOCS.map((d) => ({ rel: d.rel, s: w.reduce((t, wi, k) => t + wi * d.f[k], 0) }));
    let n = 0;
    for (const a of sc) for (const b of sc) if (a.rel > b.rel && a.s <= b.s) n++;
    return n;
  }

  function renderLtrLab() {
    if (!ltrListEl || !slLtrTitle) return;
    const w = getLtrWeights();
    document.getElementById("val-ltr-title").textContent = w[0].toFixed(2);
    document.getElementById("val-ltr-body").textContent = w[1].toFixed(2);
    document.getElementById("val-ltr-pop").textContent = w[2].toFixed(2);
    document.getElementById("val-ltr-fresh").textContent = w[3].toFixed(2);

    const ranked = LTR_DOCS.map((d) => ({
      ...d,
      score: w.reduce((s, wi, k) => s + wi * d.f[k], 0),
    })).sort((a, b) => b.score - a.score);

    // Count pairwise inversions (lower rel ranked above higher rel)
    let inversions = 0;
    for (let i = 0; i < ranked.length; i++) {
      for (let j = i + 1; j < ranked.length; j++) {
        if (ranked[i].rel < ranked[j].rel) inversions++;
      }
    }

    const maxS = Math.max(0.01, ...ranked.map((r) => r.score));
    const kpiInv = document.getElementById("kpi-ltr-inv");
    if (kpiInv) {
      kpiInv.textContent = String(inversions);
      kpiInv.className = `kpi-val ${inversions === 0 ? "brand" : "coral"}`;
    }
    const kpiTop = document.getElementById("kpi-ltr-top");
    if (kpiTop) {
      kpiTop.textContent = ranked[0].rel === 3 ? "Fixing ECONNRESET" : ranked[0].id === "d5" ? "Stuffed FAQ" : ranked[0].title.slice(0, 18);
      kpiTop.className = `kpi-val ${ranked[0].rel === 3 ? "brand" : "coral"}`;
    }

    ltrListEl.innerHTML = ranked
      .map((d, idx) => {
        const pct = Math.round((d.score / maxS) * 100);
        return `
          <div class="doc-row ${idx === 0 && d.rel === 3 ? "top-hit" : ""}">
            <span class="doc-rank">#${idx + 1}</span>
            <div class="doc-info">
              <div class="doc-title">${escapeHtml(d.title)}</div>
              <div class="doc-meta">
                <span>true rel:${d.rel}</span>
                <span>title:${d.f[0]} body:${d.f[1]} pop:${d.f[2]} fresh:${d.f[3]}</span>
              </div>
              <div class="doc-bar-track"><div class="doc-bar-fill" style="width:${pct}%"></div></div>
            </div>
            <span class="doc-score">${d.score.toFixed(2)}</span>
          </div>
        `;
      })
      .join("");
  }

  [slLtrTitle, slLtrBody, slLtrPop, slLtrFresh].forEach((sl) => sl && sl.addEventListener("input", renderLtrLab));
  document.querySelectorAll("[data-ltr-act]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const act = btn.dataset.ltrAct;
      if (act === "reset") setLtrWeights([0.15, 1.4, 0.1, 0.1]);
      else if (act === "step") trainPairwiseStep();
      else if (act === "converge") {
        // at least 16 steps, then keep going until no pair is misordered (capped)
        for (let t = 0; t < 80; t++) {
          trainPairwiseStep();
          if (t >= 15 && ltrInversions(getLtrWeights()) === 0) break;
        }
      }
      renderLtrLab();
    });
  });
  redrawCallbacks.push(renderLtrLab);

  /* ========================================================================
     DEMO 6.4 — Presentation Bias & Active Learning Explorer
     ======================================================================== */
  const activeListEl = document.getElementById("active-doc-list");
  let activeState = [];

  function resetActiveLearning() {
    activeState = [
      { id: "d2", title: "Legacy Keep-Alive Guide", trueRel: 0.52, clicks: 42, imps: 80 },
      { id: "d3", title: "Retry & Backoff Patterns", trueRel: 0.48, clicks: 28, imps: 60 },
      { id: "d5", title: "Old Troubleshooting FAQ", trueRel: 0.22, clicks: 8, imps: 40 },
      { id: "d9", title: "NEW: HTTP/2 ECONNRESET Fix (Unseen)", trueRel: 0.90, clicks: 0, imps: 0 },
    ];
  }
  resetActiveLearning();

  function runActiveBatch(explore) {
    for (let q = 0; q < 20; q++) {
      const scored = activeState.map((d) => {
        const mean = (d.clicks + 1) / (d.imps + 4);
        const uncertainty = explore ? Math.sqrt(1.8 / (d.imps + 1)) : 0;
        return { d, score: mean + uncertainty };
      }).sort((a, b) => b.score - a.score);

      // Top 2 get impressions (position bias: #1 seen 100%, #2 seen 60%, #3-4 unseen)
      scored.slice(0, 2).forEach((entry, rank) => {
        const seenProb = rank === 0 ? 1.0 : 0.6;
        if (Math.random() <= seenProb) {
          entry.d.imps += 1;
          if (Math.random() <= entry.d.trueRel) entry.d.clicks += 1;
        }
      });
    }
    renderActiveLab();
  }

  function renderActiveLab() {
    if (!activeListEl) return;
    const ranked = [...activeState]
      .map((d) => ({
        ...d,
        est: (d.clicks + 1) / (d.imps + 4),
        unc: Math.sqrt(1.8 / (d.imps + 1)),
      }))
      .sort((a, b) => b.est - a.est);

    const newDoc = ranked.find((d) => d.id === "d9");
    const newRank = ranked.findIndex((d) => d.id === "d9") + 1;
    const kpiRank = document.getElementById("kpi-active-rank");
    if (kpiRank) {
      kpiRank.textContent = `#${newRank}`;
      kpiRank.className = `kpi-val ${newRank === 1 ? "brand" : "coral"}`;
    }
    const kpiImps = document.getElementById("kpi-active-imps");
    if (kpiImps) kpiImps.textContent = String(newDoc.imps);

    activeListEl.innerHTML = ranked
      .map((d, idx) => {
        const isNew = d.id === "d9";
        return `
          <div class="doc-row ${idx === 0 && isNew ? "top-hit" : ""}">
            <span class="doc-rank">#${idx + 1}</span>
            <div class="doc-info">
              <div class="doc-title">${escapeHtml(d.title)}</div>
              <div class="doc-meta">
                <span>clicks:${d.clicks}/${d.imps}</span>
                <span>est:${Math.round(d.est * 100)}%</span>
                <span>explore bonus: +${d.unc.toFixed(2)}</span>
              </div>
              <div class="doc-bar-track"><div class="doc-bar-fill" style="width:${Math.round(d.est * 100)}%;${
                isNew ? "background:var(--sem-amber)" : ""
              }"></div></div>
            </div>
            <span class="doc-score">${Math.round(d.est * 100)}%</span>
          </div>
        `;
      })
      .join("");
  }

  document.querySelectorAll("[data-active-act]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const act = btn.dataset.activeAct;
      if (act === "reset") { resetActiveLearning(); renderActiveLab(); }
      else if (act === "exploit") runActiveBatch(false);
      else if (act === "explore") runActiveBatch(true);
    });
  });
  redrawCallbacks.push(renderActiveLab);

  /* ========================================================================
     DEMO 9.3 — Extractive QA Span Selection (P_start x P_end & [CLS])
     ======================================================================== */
  const qaTokensEl = document.getElementById("qa-tokens");
  const qaAnswerEl = document.getElementById("qa-answer");
  const slQaCls = document.getElementById("sl-qa-cls");
  let qaPreset = "answerable";

  const QA_PASSAGE = [
    "To", "fix", "ECONNRESET", "in", "Node,", "enable", "keep-alive", "sockets", "and", "exponential", "backoff", "retries", "on", "idle", "pools."
  ];

  const QA_PROBS = {
    answerable: {
      query: "How do you fix ECONNRESET in Node?",
      start: [0.02, 0.03, 0.04, 0.01, 0.02, 0.74, 0.08, 0.02, 0.01, 0.01, 0.01, 0.01, 0.0, 0.0, 0.0],
      end:   [0.0,  0.01, 0.02, 0.0,  0.01, 0.02, 0.05, 0.14, 0.02, 0.04, 0.06, 0.61, 0.01, 0.01, 0.0],
      clsDefault: 0.12,
    },
    unanswerable: {
      query: "What is the SLA refund percentage?",
      start: [0.04, 0.04, 0.05, 0.02, 0.02, 0.05, 0.04, 0.04, 0.02, 0.03, 0.03, 0.04, 0.02, 0.02, 0.02],
      end:   [0.02, 0.03, 0.04, 0.02, 0.02, 0.04, 0.04, 0.05, 0.02, 0.03, 0.04, 0.05, 0.02, 0.02, 0.02],
      clsDefault: 0.84,
    },
  };

  function renderQaLab() {
    if (!qaTokensEl || !slQaCls) return;
    const data = QA_PROBS[qaPreset];
    const clsProb = Number(slQaCls.value);
    document.getElementById("val-qa-cls").textContent = clsProb.toFixed(2);

    // [CLS] sits at position 0 of BOTH the start and end softmaxes (SQuAD 2.0 style):
    // it takes clsProb of each, and the passage tokens share the rest.
    const sumS = data.start.reduce((a, b) => a + b, 0), sumE = data.end.reduce((a, b) => a + b, 0);
    const pS = data.start.map((x) => (x / sumS) * (1 - clsProb));
    const pE = data.end.map((x) => (x / sumE) * (1 - clsProb));
    // Best span (i <= j) maximizing P_start(i) * P_end(j)
    let bestI = 0, bestJ = 0, bestScore = 0;
    for (let i = 0; i < QA_PASSAGE.length; i++) {
      for (let j = i; j < QA_PASSAGE.length; j++) {
        const sc = pS[i] * pE[j];
        if (sc > bestScore) { bestScore = sc; bestI = i; bestJ = j; }
      }
    }
    const nullScore = clsProb * clsProb; // P_start([CLS]) × P_end([CLS])
    const abstain = nullScore > bestScore;
    qaTokensEl.innerHTML = QA_PASSAGE.map((tok, idx) => {
      const inSpan = !abstain && idx >= bestI && idx <= bestJ;
      const isStart = !abstain && idx === bestI;
      const isEnd = !abstain && idx === bestJ;
      return `
        <span class="qa-tok ${inSpan ? "in-span" : ""}">
          <span class="qa-word">${escapeHtml(tok)}</span>
          <span class="qa-probs">${isStart ? `S:${pS[idx].toFixed(2)}` : isEnd ? `E:${pE[idx].toFixed(2)}` : ""}</span>
        </span>
      `;
    }).join("");

    qaAnswerEl.className = `rag-status ${abstain ? "abstain" : ""}`;
    // small scores need more digits, or a real span score would print as 0.00
    const fmtP = (v) => (v > 0 && v < 0.01 ? v.toFixed(4) : v.toFixed(2));
    if (abstain) {
      const why = qaPreset === "answerable"
        ? "The passage does answer this question, but the null probability is set so high that [CLS] wins anyway."
        : "The passage does not answer this question, so no span beats [CLS].";
      qaAnswerEl.innerHTML = `<strong>[CLS] ABSTAIN (null score ${fmtP(nullScore)} &gt; best span ${fmtP(bestScore)}):</strong> The model answers "not found" for "${escapeHtml(data.query)}". ${why}`;
    } else {
      const spanText = QA_PASSAGE.slice(bestI, bestJ + 1).join(" ");
      const warn = qaPreset === "unanswerable"
        ? " Wrong answer: with the null probability this low, even a weak span beats [CLS], so the model answers a question the passage cannot answer."
        : "";
      qaAnswerEl.innerHTML = `<strong>EXTRACTED SPAN (P_start × P_end = ${fmtP(bestScore)} ≥ null score ${fmtP(nullScore)}):</strong> "${escapeHtml(spanText)}"${warn}`;
    }
  }

  if (slQaCls) slQaCls.addEventListener("input", renderQaLab);
  document.querySelectorAll("[data-qa-preset]").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("[data-qa-preset]").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      qaPreset = btn.dataset.qaPreset;
      slQaCls.value = String(QA_PROBS[qaPreset].clsDefault);
      renderQaLab();
    });
  });
  redrawCallbacks.push(renderQaLab);
}
