/* Walkthrough "Try it" actions, keyed by lab id and step index (null = drag/read-only step). */
export const WALK_ACTIONS = {
 "lab-vectors": [
  [
   {
    "click": "[data-vec-preset=\"same-angle\"]"
   },
   {
    "check": "#chk-vec-norm",
    "value": false
   }
  ],
  [
   {
    "click": "[data-vec-preset=\"same-angle\"]"
   },
   {
    "check": "#chk-vec-norm",
    "value": true
   }
  ],
  [
   {
    "click": "[data-vec-preset=\"orthogonal\"]"
   },
   {
    "check": "#chk-vec-norm",
    "value": true
   }
  ]
 ],
 "lab-qcos": [
  [
   {
    "set": "#sl-qcos-d1a",
    "value": "1"
   },
   {
    "set": "#sl-qcos-d1j",
    "value": "1"
   },
   {
    "set": "#sl-qcos-d2a",
    "value": "3"
   },
   {
    "set": "#sl-qcos-d2j",
    "value": "4"
   }
  ],
  [
   {
    "set": "#sl-qcos-d1a",
    "value": "1"
   },
   {
    "set": "#sl-qcos-d1j",
    "value": "1"
   },
   {
    "set": "#sl-qcos-d2a",
    "value": "4"
   },
   {
    "set": "#sl-qcos-d2j",
    "value": "4"
   }
  ],
  [
   {
    "set": "#sl-qcos-d1a",
    "value": "1"
   },
   {
    "set": "#sl-qcos-d1j",
    "value": "1"
   },
   {
    "set": "#sl-qcos-d2a",
    "value": "0"
   },
   {
    "set": "#sl-qcos-d2j",
    "value": "5"
   }
  ]
 ],
 "lab-funnel": [
  [
   {
    "set": "#sl-mm",
    "value": "50"
   },
   {
    "click": "[data-match-mode=\"any\"]"
   },
   {
    "click": "[data-funnel-query=\"econnreset retry\"]"
   },
   {
    "check": "#filter-docs-only",
    "value": true
   }
  ],
  [
   {
    "set": "#sl-mm",
    "value": "50"
   },
   {
    "click": "[data-match-mode=\"all\"]"
   },
   {
    "click": "[data-funnel-query=\"econnreset retry\"]"
   },
   {
    "check": "#filter-docs-only",
    "value": true
   }
  ],
  [
   {
    "set": "#sl-mm",
    "value": "50"
   },
   {
    "click": "[data-match-mode=\"phrase\"]"
   },
   {
    "click": "[data-funnel-query=\"econnreset retry\"]"
   },
   {
    "check": "#filter-docs-only",
    "value": true
   }
  ],
  [
   {
    "click": "[data-funnel-query=\"econnreset retry keepalive timeout\"]"
   },
   {
    "click": "[data-match-mode=\"mm\"]"
   },
   {
    "set": "#sl-mm",
    "value": "50"
   },
   {
    "check": "#filter-docs-only",
    "value": true
   }
  ]
 ],
 "lab-tfidf": [
  [
   {
    "click": "[data-tfidf-preset=\"stuffed\"]"
   }
  ],
  [
   {
    "click": "[data-tfidf-preset=\"stuffed\"]"
   },
   {
    "set": "#sl-stuff-tf",
    "value": "20"
   }
  ],
  [
   {
    "click": "[data-tfidf-preset=\"changelog\"]"
   }
  ],
  null
 ],
 "lab-bm25": [
  [
   {
    "click": "[data-bm25-preset=\"lucene\"]"
   }
  ],
  null,
  null,
  [
   {
    "click": "[data-bm25-preset=\"nolength\"]"
   }
  ],
  [
   {
    "click": "[data-bm25-preset=\"rawtf\"]"
   }
  ]
 ],
 "lab-fields": [
  [
   {
    "click": "[data-field-query=\"connection reset\"]"
   },
   {
    "click": "[data-field-preset=\"body\"]"
   }
  ],
  [
   {
    "click": "[data-field-query=\"connection reset\"]"
   },
   {
    "click": "[data-field-preset=\"title\"]"
   }
  ],
  [
   {
    "click": "[data-field-query=\"connection reset\"]"
   },
   {
    "click": "[data-field-preset=\"phrase\"]"
   }
  ],
  [
   {
    "click": "[data-field-preset=\"phrase\"]"
   },
   {
    "click": "[data-field-query=\"retry timeout\"]"
   }
  ]
 ],
 "lab-news": [
  [
   {
    "click": "[data-news-preset=\"text\"]"
   }
  ],
  [
   {
    "click": "[data-news-preset=\"news\"]"
   }
  ],
  [
   {
    "click": "[data-news-preset=\"trending\"]"
   }
  ],
  [
   {
    "set": "#sl-news-text",
    "value": "1"
   },
   {
    "set": "#sl-news-fresh",
    "value": "0"
   },
   {
    "set": "#sl-news-near",
    "value": "0"
   },
   {
    "set": "#sl-news-pop",
    "value": "0"
   }
  ]
 ],
 "lab-signals": [
  [
   {
    "click": "[data-boost-scenario=\"rare\"]"
   },
   {
    "set": "#sl-boost-w",
    "value": "4"
   },
   {
    "click": "[data-halflife=\"30\"]"
   }
  ],
  [
   {
    "click": "[data-boost-scenario=\"rare\"]"
   },
   {
    "set": "#sl-boost-w",
    "value": "3"
   },
   {
    "click": "[data-halflife=\"30\"]"
   }
  ],
  [
   {
    "click": "[data-boost-scenario=\"common\"]"
   },
   {
    "set": "#sl-boost-w",
    "value": "4"
   },
   {
    "click": "[data-halflife=\"30\"]"
   }
  ],
  [
   {
    "click": "[data-boost-scenario=\"rare\"]"
   },
   {
    "set": "#sl-boost-w",
    "value": "4"
   },
   {
    "click": "[data-halflife=\"1\"]"
   },
   {
    "click": "[data-halflife=\"1920\"]"
   }
  ]
 ],
 "lab-boost2": [
  [
   {
    "set": "#sl-boost2-w",
    "value": "0.5"
   }
  ],
  [
   {
    "set": "#sl-boost2-w",
    "value": "1"
   }
  ],
  null
 ],
 "lab-signals-log": [
  [
   {
    "check": "#chk-sig-user",
    "value": false
   },
   {
    "check": "#chk-sig-norm",
    "value": false
   },
   {
    "check": "#chk-sig-neg",
    "value": false
   }
  ],
  [
   {
    "check": "#chk-sig-user",
    "value": true
   },
   {
    "check": "#chk-sig-norm",
    "value": false
   },
   {
    "check": "#chk-sig-neg",
    "value": false
   }
  ],
  [
   {
    "check": "#chk-sig-user",
    "value": true
   },
   {
    "check": "#chk-sig-norm",
    "value": true
   },
   {
    "check": "#chk-sig-neg",
    "value": false
   }
  ],
  [
   {
    "check": "#chk-sig-user",
    "value": true
   },
   {
    "check": "#chk-sig-norm",
    "value": true
   },
   {
    "check": "#chk-sig-neg",
    "value": true
   }
  ]
 ],
 "lab-pers": [
  [
   {
    "click": "[data-pers-user=\"billing\"]"
   },
   {
    "click": "[data-pers-query=\"econnreset\"]"
   },
   {
    "check": "#chk-pers-guardrail",
    "value": true
   }
  ],
  [
   {
    "click": "[data-pers-user=\"billing\"]"
   },
   {
    "click": "[data-pers-query=\"econnreset\"]"
   },
   {
    "check": "#chk-pers-guardrail",
    "value": false
   }
  ],
  [
   {
    "click": "[data-pers-user=\"billing\"]"
   },
   {
    "click": "[data-pers-query=\"reset\"]"
   },
   {
    "check": "#chk-pers-guardrail",
    "value": false
   }
  ],
  [
   {
    "click": "[data-pers-user=\"cold\"]"
   },
   {
    "click": "[data-pers-query=\"reset\"]"
   },
   {
    "check": "#chk-pers-guardrail",
    "value": false
   }
  ]
 ],
 "lab-skgcalc": [
  [
   {
    "click": "[data-skg-term=\"keepalive\"]"
   },
   {
    "set": "#sl-skg-min",
    "value": "0"
   }
  ],
  [
   {
    "click": "[data-skg-term=\"the\"]"
   },
   {
    "set": "#sl-skg-min",
    "value": "0"
   }
  ],
  [
   {
    "click": "[data-skg-term=\"invoice\"]"
   },
   {
    "set": "#sl-skg-min",
    "value": "0"
   }
  ],
  [
   {
    "click": "[data-skg-term=\"kubeproxy\"]"
   },
   {
    "set": "#sl-skg-min",
    "value": "3"
   }
  ]
 ],
 "lab-kg": [
  [
   {
    "click": "[data-kg-start=\"econnreset\"]"
   },
   {
    "check": "#chk-kg-hop2",
    "value": false
   }
  ],
  [
   {
    "click": "[data-kg-start=\"driver\"]"
   },
   {
    "check": "#chk-kg-hop2",
    "value": false
   }
  ],
  [
   {
    "click": "[data-kg-start=\"driver\"]"
   },
   {
    "check": "#chk-kg-hop2",
    "value": true
   }
  ],
  null
 ],
 "lab-spell": [
  [
   {
    "click": "[data-spell-rule=\"book\"]"
   },
   {
    "set": "#sl-spell-low",
    "value": "0.55"
   },
   {
    "set": "#sl-spell-high",
    "value": "0.65"
   }
  ],
  [
   {
    "click": "[data-spell-rule=\"book\"]"
   },
   {
    "set": "#sl-spell-low",
    "value": "0.55"
   },
   {
    "set": "#sl-spell-high",
    "value": "0.6"
   }
  ],
  [
   {
    "click": "[data-spell-rule=\"flat\"]"
   },
   {
    "set": "#sl-spell-low",
    "value": "0.55"
   },
   {
    "set": "#sl-spell-high",
    "value": "0.6"
   }
  ],
  [
   {
    "click": "[data-spell-rule=\"book\"]"
   },
   {
    "set": "#sl-spell-low",
    "value": "0.6"
   },
   {
    "set": "#sl-spell-high",
    "value": "0.6"
   }
  ]
 ],
 "lab-posbias": [
  [
   {
    "click": "[data-pb-order=\"buried\"]"
   },
   {
    "click": "[data-pb-act=\"1000\"]"
   }
  ],
  null,
  [
   {
    "click": "[data-pb-order=\"top\"]"
   },
   {
    "click": "[data-pb-act=\"1000\"]"
   }
  ]
 ],
 "lab-ltr-train": [
  null,
  null,
  null
 ],
 "lab-sphere": [
  [
   {
    "click": "[data-sphere=\"econnreset\"]"
   }
  ],
  [
   {
    "click": "[data-sphere=\"reset\"]"
   }
  ],
  null,
  [
   {
    "click": "#btn-spin-r-canvas-sphere"
   },
   {
    "click": "#btn-spin-r-canvas-sphere"
   },
   {
    "click": "#btn-spin-r-canvas-sphere"
   }
  ]
 ],
 "lab-chunk": [
  [
   {
    "click": "[data-chunk=\"8\"]"
   }
  ],
  [
   {
    "click": "[data-chunk=\"2\"]"
   }
  ],
  [
   {
    "click": "[data-chunk=\"1\"]"
   }
  ]
 ],
 "lab-autocomplete": [
  [
   {
    "click": "[data-ac-preset=\"socket\"]"
   }
  ],
  [
   {
    "click": "[data-ac-preset=\"dropped\"]"
   }
  ],
  [
   {
    "click": "[data-ac-preset=\"toomany\"]"
   }
  ]
 ],
 "lab-blend": [
  [
   {
    "click": "[data-blend-pair=\"vader\"]"
   },
   {
    "set": "#sl-blend",
    "value": "0.5"
   }
  ],
  [
   {
    "click": "[data-blend-pair=\"vader\"]"
   },
   {
    "set": "#sl-blend",
    "value": "0"
   }
  ],
  [
   {
    "click": "[data-blend-pair=\"car\"]"
   },
   {
    "set": "#sl-blend",
    "value": "0.5"
   }
  ]
 ],
 "lab-hybrid": [
  [
   {
    "click": "[data-hybrid-scenario=\"outlier\"]"
   },
   {
    "set": "#sl-rrf-k",
    "value": "60"
   },
   {
    "set": "#sl-rsf-w",
    "value": "0.5"
   }
  ],
  [
   {
    "click": "[data-hybrid-scenario=\"outlier\"]"
   },
   {
    "set": "#sl-rrf-k",
    "value": "60"
   },
   {
    "set": "#sl-rsf-w",
    "value": "0.25"
   }
  ],
  [
   {
    "click": "[data-hybrid-scenario=\"consensus\"]"
   },
   {
    "set": "#sl-rrf-k",
    "value": "1"
   },
   {
    "set": "#sl-rsf-w",
    "value": "0.5"
   }
  ],
  [
   {
    "click": "[data-hybrid-scenario=\"onelist\"]"
   },
   {
    "set": "#sl-rrf-k",
    "value": "60"
   },
   {
    "set": "#sl-rsf-w",
    "value": "0.5"
   }
  ],
  [
   {
    "click": "[data-hybrid-scenario=\"onelist\"]"
   },
   {
    "set": "#sl-rrf-k",
    "value": "1"
   },
   {
    "set": "#sl-rsf-w",
    "value": "0.5"
   }
  ],
  [
   {
    "click": "[data-hybrid-scenario=\"onelist\"]"
   },
   {
    "set": "#sl-rrf-k",
    "value": "1"
   },
   {
    "set": "#sl-rsf-w",
    "value": "0.1"
   }
  ]
 ],
 "lab-pq": [
  [
   {
    "click": "[data-pq-k=\"16\"]"
   }
  ],
  [
   {
    "click": "[data-pq-k=\"4\"]"
   }
  ],
  [
   {
    "click": "[data-pq-k=\"64\"]"
   }
  ],
  [
   {
    "click": "#btn-pq-next"
   },
   {
    "click": "#btn-pq-next"
   },
   {
    "click": "#btn-pq-next"
   }
  ]
 ],
 "lab-mrl": [
  [
   {
    "click": "[data-quant=\"int8\"]"
   },
   {
    "set": "#sl-mrl-dim",
    "value": "3"
   },
   {
    "check": "#chk-mrl-rescore",
    "value": true
   }
  ],
  [
   {
    "click": "[data-quant=\"binary\"]"
   },
   {
    "set": "#sl-mrl-dim",
    "value": "3"
   },
   {
    "check": "#chk-mrl-rescore",
    "value": true
   }
  ],
  [
   {
    "click": "[data-quant=\"pq\"]"
   },
   {
    "set": "#sl-mrl-dim",
    "value": "3"
   },
   {
    "check": "#chk-mrl-rescore",
    "value": true
   }
  ],
  [
   {
    "click": "[data-quant=\"fp32\"]"
   },
   {
    "set": "#sl-mrl-dim",
    "value": "0"
   },
   {
    "check": "#chk-mrl-rescore",
    "value": true
   }
  ],
  [
   {
    "click": "[data-quant=\"fp32\"]"
   },
   {
    "set": "#sl-mrl-dim",
    "value": "0"
   },
   {
    "check": "#chk-mrl-rescore",
    "value": false
   }
  ]
 ],
 "lab-spike3d": [
  [
   {
    "click": "#btn-spike-reset"
   }
  ],
  [
   {
    "click": "#btn-spike-reset"
   },
   {
    "click": "#btn-spike-rot"
   },
   {
    "click": "#btn-spike-rot"
   },
   {
    "click": "#btn-spike-rot"
   }
  ],
  null,
  [
   {
    "click": "#btn-spin-r-canvas-spike3d"
   },
   {
    "click": "#btn-spin-r-canvas-spike3d"
   },
   {
    "click": "#btn-spin-r-canvas-spike3d"
   }
  ]
 ],
 "lab-rotation": [
  [
   {
    "set": "#sl-rot-bits",
    "value": "3"
   }
  ],
  null,
  [
   {
    "set": "#sl-rot-bits",
    "value": "3"
   },
   {
    "click": "#btn-rot-redraw"
   },
   {
    "click": "#btn-rot-redraw"
   },
   {
    "click": "#btn-rot-redraw"
   }
  ],
  [
   {
    "set": "#sl-rot-bits",
    "value": "6"
   }
  ]
 ],
 "lab-eval": [
  [
   {
    "click": "[data-ndcg-preset=\"buried\"]"
   },
   {
    "click": "[data-gain-mode=\"exp\"]"
   },
   {
    "set": "#sl-ndcg-k",
    "value": "5"
   }
  ],
  null,
  [
   {
    "click": "[data-ndcg-preset=\"buried\"]"
   },
   {
    "click": "[data-gain-mode=\"lin\"]"
   },
   {
    "set": "#sl-ndcg-k",
    "value": "5"
   }
  ]
 ],
 "lab-metrics": [
  [
   {
    "click": "[data-mx-preset=\"human\"]"
   },
   {
    "set": "#sl-mx-k",
    "value": "5"
   }
  ],
  [
   {
    "click": "[data-mx-preset=\"agent\"]"
   },
   {
    "set": "#sl-mx-k",
    "value": "5"
   }
  ],
  [
   {
    "click": "[data-mx-preset=\"late\"]"
   },
   {
    "set": "#sl-mx-k",
    "value": "6"
   }
  ],
  null
 ],
 "lab-cutoff": [
  null,
  null,
  null
 ]
};
