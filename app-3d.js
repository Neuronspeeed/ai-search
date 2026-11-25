/* ==========================================================================
   3D labs, drawn on a plain 2D canvas (no 3D library)
   - Embeddings on a sphere (§7): cosine is the angle between two arrows
   - A spike in 3D (§9): rotation spreads one big coordinate over all three
   Shared: a tiny orbit camera. Drag empty space to spin, drag the tip to steer.
   ========================================================================== */
import { readout } from "./chart-kit.js";

const norm3 = (v) => { const n = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / n, v[1] / n, v[2] / n]; };
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const add3 = (a, b, k = 1) => [a[0] + k * b[0], a[1] + k * b[1], a[2] + k * b[2]];
const DEG = 180 / Math.PI;
const SPIKE_SEED = 11;

/* ---------- orbit camera ---------- */
function makeCamera(yaw = 0.75, pitch = 0.42) {
  const cam = { yaw, pitch, cx: 0, cy: 0, s: 1 };
  cam.fit = (w, h, scale = 0.36, dy = 6) => { cam.cx = w / 2; cam.cy = h / 2 + dy; cam.s = Math.min(w, h) * scale; };
  // world: x right, y up, z toward the viewer at yaw = 0
  cam.proj = (p) => {
    const cY = Math.cos(cam.yaw), sY = Math.sin(cam.yaw), cP = Math.cos(cam.pitch), sP = Math.sin(cam.pitch);
    const x1 = p[0] * cY + p[2] * sY;
    const z1 = -p[0] * sY + p[2] * cY;
    const y2 = p[1] * cP - z1 * sP;
    const z2 = p[1] * sP + z1 * cP; // larger = closer to the viewer
    return { x: cam.cx + x1 * cam.s, y: cam.cy - y2 * cam.s, d: z2 };
  };
  // screen point -> point on the unit sphere (front side, or the rim if outside it)
  cam.toSphere = (sx, sy) => {
    let u = (sx - cam.cx) / cam.s, v = (cam.cy - sy) / cam.s;
    const r2 = u * u + v * v;
    let z2 = 0;
    if (r2 <= 1) z2 = Math.sqrt(1 - r2); else { const r = Math.sqrt(r2); u /= r; v /= r; }
    const cY = Math.cos(cam.yaw), sY = Math.sin(cam.yaw), cP = Math.cos(cam.pitch), sP = Math.sin(cam.pitch);
    const y = v * cP + z2 * sP;
    const z1 = -v * sP + z2 * cP;
    return norm3([u * cY - z1 * sY, y, u * sY + z1 * cY]);
  };
  return cam;
}

/** Pointer + keyboard: drag near the tip to steer it, anywhere else to orbit. Arrow keys orbit. */
function bindOrbit(canvas, cam, { tipScreen, onTip, onChange }) {
  let mode = null, lx = 0, ly = 0;
  const pos = (e) => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  canvas.addEventListener("pointerdown", (e) => {
    const p = pos(e);
    const t = tipScreen && tipScreen();
    mode = t && Math.hypot(p.x - t.x, p.y - t.y) < 22 ? "tip" : "orbit";
    lx = p.x; ly = p.y;
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* synthetic events have no capture */ }
    canvas.style.cursor = mode === "tip" ? "grabbing" : "move";
    if (mode === "tip") onTip(cam.toSphere(p.x, p.y));
  });
  canvas.addEventListener("pointermove", (e) => {
    const p = pos(e);
    if (!mode) {
      const t = tipScreen && tipScreen();
      canvas.style.cursor = t && Math.hypot(p.x - t.x, p.y - t.y) < 22 ? "grab" : "move";
      return;
    }
    if (mode === "tip") onTip(cam.toSphere(p.x, p.y));
    else {
      cam.yaw += (p.x - lx) * 0.01;
      cam.pitch = Math.max(-1.35, Math.min(1.35, cam.pitch + (p.y - ly) * 0.01));
      lx = p.x; ly = p.y;
      onChange();
    }
  });
  const stop = () => { mode = null; canvas.style.cursor = "move"; };
  canvas.addEventListener("pointerup", stop);
  canvas.addEventListener("pointercancel", stop);
  canvas.addEventListener("keydown", (e) => {
    const k = e.shiftKey ? 0.2 : 0.06;
    if (e.key === "ArrowLeft") cam.yaw -= k;
    else if (e.key === "ArrowRight") cam.yaw += k;
    else if (e.key === "ArrowUp") cam.pitch = Math.max(-1.35, cam.pitch - k);
    else if (e.key === "ArrowDown") cam.pitch = Math.min(1.35, cam.pitch + k);
    else return;
    e.preventDefault();
    onChange();
  });
}

/* ---------- drawing helpers ---------- */
function line3(ctx, cam, a, b, color, width = 1, dash = null, alpha = 1) {
  const p = cam.proj(a), q = cam.proj(b);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color; ctx.lineWidth = width;
  if (dash) ctx.setLineDash(dash);
  ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke();
  ctx.restore();
}

// a great circle (or any circle on the unit sphere) drawn as segments, faded on the back side
function circle3(ctx, cam, fn, color, n = 72) {
  let prev = cam.proj(fn(0));
  for (let i = 1; i <= n; i += 1) {
    const cur = cam.proj(fn((i / n) * 2 * Math.PI));
    ctx.globalAlpha = (prev.d + cur.d) / 2 >= 0 ? 0.55 : 0.18;
    ctx.strokeStyle = color; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(prev.x, prev.y); ctx.lineTo(cur.x, cur.y); ctx.stroke();
    prev = cur;
  }
  ctx.globalAlpha = 1;
}

function arrow3(ctx, cam, to, color, width = 2.5) {
  const o = cam.proj([0, 0, 0]), p = cam.proj(to);
  ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineCap = "round";
  ctx.beginPath(); ctx.moveTo(o.x, o.y); ctx.lineTo(p.x, p.y); ctx.stroke();
  const ang = Math.atan2(p.y - o.y, p.x - o.x), L = Math.min(11, Math.hypot(p.x - o.x, p.y - o.y) * 0.3);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(p.x, p.y);
  ctx.lineTo(p.x - L * Math.cos(ang - 0.4), p.y - L * Math.sin(ang - 0.4));
  ctx.lineTo(p.x - L * Math.cos(ang + 0.4), p.y - L * Math.sin(ang + 0.4));
  ctx.closePath(); ctx.fill();
  return p;
}

function tipHandle(ctx, T, p, color) {
  ctx.fillStyle = T.card; ctx.strokeStyle = color; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(p.x, p.y, 7, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.arc(p.x, p.y, 2.8, 0, 2 * Math.PI); ctx.fill();
}

function chip(ctx, T, x, y, text, color, align = "left") {
  ctx.font = `600 10.5px ${T.mono}`;
  const w = ctx.measureText(text).width + 10;
  const bx = align === "right" ? x - w : align === "center" ? x - w / 2 : x;
  ctx.fillStyle = T.card; ctx.globalAlpha = 0.88;
  ctx.fillRect(bx, y - 9, w, 18);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = color; ctx.lineWidth = 1;
  ctx.strokeRect(bx + 0.5, y - 8.5, w - 1, 17);
  ctx.fillStyle = color; ctx.textAlign = "left"; ctx.textBaseline = "middle";
  ctx.fillText(text, bx + 5, y + 0.5);
}

function axisSet(ctx, cam, T, names, len = 1.18) {
  const dirs = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  dirs.forEach((d, i) => {
    line3(ctx, cam, [0, 0, 0], d.map((x) => x * len), T.muted, 1, [3, 4], 0.7);
    const p = cam.proj(d.map((x) => x * (len + 0.1)));
    ctx.fillStyle = T.muted; ctx.font = `11px ${T.mono}`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(names[i], p.x, p.y);
  });
}

/* ==========================================================================
   §7 · Embeddings on a sphere
   ========================================================================== */
const SPHERE_DOCS = (() => {
  const C = {
    net: { c: [0.9, 0.2, 0.35], tone: "brand", name: "network-error" },
    acct: { c: [-0.25, 0.85, 0.45], tone: "blue", name: "account" },
    bill: { c: [-0.3, -0.35, 0.88], tone: "amber", name: "billing" },
  };
  const raw = [
    ["Fixing ECONNRESET", "net", [0.05, 0.12, -0.18]],
    ["Socket hang up", "net", [-0.15, -0.2, 0.12]],
    ["Keep-alive timeouts", "net", [0.1, -0.3, -0.3]],
    ["Reset your password", "acct", [0.22, 0.02, -0.12]],
    ["Two-factor login", "acct", [-0.2, 0.05, 0.05]],
    ["Locked out", "acct", [0.02, -0.12, 0.25]],
    ["Download an invoice", "bill", [0.12, 0.1, 0.0]],
    ["Refund a payment", "bill", [-0.2, -0.05, -0.08]],
    ["VAT on invoices", "bill", [0.0, -0.25, -0.15]],
  ];
  return { clusters: C, docs: raw.map(([label, k, off]) => ({ label, k, v: norm3(add3(norm3(C[k].c), off)) })) };
})();

const SPHERE_QUERIES = {
  econnreset: norm3([0.95, 0.15, 0.2]),
  password: norm3([-0.05, 0.9, 0.33]),
  reset: norm3(add3(norm3([0.95, 0.15, 0.2]), norm3([-0.05, 0.9, 0.33]))),
  refund: norm3([-0.45, -0.38, 0.8]),
};

function initSphereLab(getTokens, prepCanvas, redrawCallbacks) {
  const cv = document.getElementById("canvas-sphere");
  const cr = document.getElementById("canvas-sphere-rank");
  if (!cv || !cr) return;
  const cam = makeCamera(0.2, 0.32);
  let q = SPHERE_QUERIES.econnreset;
  let tipXY = null;
  const { clusters, docs } = SPHERE_DOCS;

  function ranked() {
    return docs.map((d) => ({ ...d, cos: dot3(q, d.v) })).sort((a, b) => b.cos - a.cos);
  }

  function drawSpace(T, rk) {
    const { ctx, w, h } = prepCanvas(cv);
    ctx.clearRect(0, 0, w, h);
    cam.fit(w, h, 0.4, 10);
    // sphere wireframe: equator, two meridians, two latitude rings
    circle3(ctx, cam, (t) => [Math.cos(t), 0, Math.sin(t)], T.lineStrong);
    circle3(ctx, cam, (t) => [Math.cos(t), Math.sin(t), 0], T.lineStrong);
    circle3(ctx, cam, (t) => [0, Math.sin(t), Math.cos(t)], T.lineStrong);
    [0.5, -0.5].forEach((y) => { const r = Math.sqrt(1 - y * y); circle3(ctx, cam, (t) => [r * Math.cos(t), y, r * Math.sin(t)], T.line); });
    axisSet(ctx, cam, T, ["", "", ""], 1.12);

    const top = rk.slice(0, 3).map((d) => d.label);
    const best = rk[0];
    const ang = Math.acos(Math.max(-1, Math.min(1, best.cos)));
    // angle arc from the query to the best page
    if (ang > 0.02) {
      const perp = norm3(add3(best.v, q, -best.cos));
      ctx.strokeStyle = T.fg; ctx.lineWidth = 1.5; ctx.setLineDash([2, 3]);
      ctx.beginPath();
      for (let i = 0; i <= 24; i += 1) {
        const t = (i / 24) * ang;
        const p = cam.proj(add3(q.map((x) => x * Math.cos(t)), perp.map((x) => x * Math.sin(t))));
        if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
      }
      ctx.stroke(); ctx.setLineDash([]);
    }

    // dots, back to front
    const pts = docs.map((d) => ({ d, p: cam.proj(d.v), rank: top.indexOf(d.label) }));
    for (const { d, p, rank } of [...pts].sort((a, b) => a.p.d - b.p.d)) {
      const col = T[clusters[d.k].tone];
      if (rank >= 0) line3(ctx, cam, [0, 0, 0], d.v, col, 1, [2, 3], 0.55);
      ctx.globalAlpha = p.d >= 0 ? 1 : 0.4;
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.arc(p.x, p.y, rank >= 0 ? 5.5 : 4, 0, 2 * Math.PI); ctx.fill();
      if (rank >= 0) { ctx.strokeStyle = T.fg; ctx.lineWidth = 1.5; ctx.stroke(); }
      ctx.globalAlpha = 1;
    }

    const tp = arrow3(ctx, cam, q, T.brand, 3);
    tipHandle(ctx, T, tp, T.brand);
    tipXY = tp;

    // labels: top 3 first, then the rest front to back; skip a label if it can't find a free spot
    const boxes = [{ x: tp.x - 12, y: tp.y - 12, w: 24, h: 24 }];
    pts.forEach(({ p }) => boxes.push({ x: p.x - 5, y: p.y - 5, w: 10, h: 10 }));
    const hit = (b) => b.x < 4 || b.y < 26 || b.x + b.w > w - 4 || b.y + b.h > h - 26
      || boxes.some((o) => b.x < o.x + o.w && b.x + b.w > o.x && b.y < o.y + o.h && b.y + b.h > o.y);
    const order = [...pts].sort((a, b) => (a.rank < 0) - (b.rank < 0) || a.rank - b.rank || b.p.d - a.p.d);
    for (const { d, p, rank } of order) {
      const isTop = rank >= 0;
      const text = isTop ? `#${rank + 1} ${d.label}` : d.label;
      ctx.font = `${isTop ? "600 " : ""}10.5px ${T.mono}`;
      const tw = ctx.measureText(text).width, th = 13;
      let placed = null;
      for (const dist of [8, 18, 30, 44]) {
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, -1], [0, 1], [1, -1], [-1, -1], [1, 1], [-1, 1]]) {
          const cx = p.x + dx * (dist + (dx > 0 ? 0 : dx < 0 ? tw : tw / 2)) - (dx === 0 ? tw / 2 : 0);
          const cy = p.y + dy * (dist + th / 2) - th / 2;
          const b = { x: cx, y: cy, w: tw, h: th };
          if (!hit(b)) { placed = b; break; }
        }
        if (placed || !isTop) break;
      }
      if (!placed) continue;
      boxes.push(placed);
      if (Math.hypot(placed.x + tw / 2 - p.x, placed.y + th / 2 - p.y) > tw / 2 + 16) {
        ctx.strokeStyle = T.muted; ctx.lineWidth = 1; ctx.globalAlpha = 0.6;
        const ex = Math.max(placed.x, Math.min(p.x, placed.x + tw)), ey = Math.max(placed.y, Math.min(p.y, placed.y + th));
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(ex, ey); ctx.stroke();
      }
      ctx.globalAlpha = isTop ? 1 : p.d >= 0 ? 0.75 : 0.35;
      ctx.fillStyle = isTop ? T.fg : T.muted;
      ctx.textAlign = "left"; ctx.textBaseline = "top";
      ctx.fillText(text, placed.x, placed.y);
      ctx.globalAlpha = 1;
    }
    chip(ctx, T, 8, h - 14, `angle to #1 = ${(ang * DEG).toFixed(0)}° · cos ${best.cos.toFixed(2)}`, T.fg);
  }

  function drawRank(T, rk) {
    const { ctx, w, h } = prepCanvas(cr);
    ctx.clearRect(0, 0, w, h);
    const l = 10, r = 46, top = 8, bottom = 22, rowH = (h - top - bottom) / rk.length;
    const X = (c) => l + ((c + 0.4) / 1.4) * (w - l - r); // domain -0.4 .. 1
    ctx.font = `10px ${T.mono}`; ctx.textAlign = "center"; ctx.textBaseline = "top";
    [0, 0.5, 1].forEach((c) => {
      ctx.strokeStyle = T.line; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(X(c), top); ctx.lineTo(X(c), h - bottom + 2); ctx.stroke();
      ctx.fillStyle = T.muted; ctx.fillText(c.toFixed(1), X(c), h - bottom + 6);
    });
    rk.forEach((d, i) => {
      const y0 = top + i * rowH;
      const col = T[clusters[d.k].tone];
      ctx.textBaseline = "top"; ctx.textAlign = "left";
      ctx.font = `${i < 3 ? "600 " : ""}10.5px ${T.mono}`;
      ctx.fillStyle = i < 3 ? T.fg : T.muted;
      ctx.fillText(`#${i + 1} ${d.label}`, l, y0 + 1);
      const a = X(0), b = X(Math.max(-0.4, d.cos)), by = y0 + 15, bh = Math.max(5, rowH - 19);
      ctx.globalAlpha = i < 3 ? 1 : 0.55;
      ctx.fillStyle = col;
      ctx.fillRect(Math.min(a, b), by, Math.max(2, Math.abs(b - a)), bh);
      ctx.globalAlpha = 1;
      ctx.textBaseline = "middle"; ctx.fillStyle = col; ctx.font = `600 10.5px ${T.mono}`;
      ctx.fillText(d.cos.toFixed(2), Math.max(a, b) + 5, by + bh / 2);
    });
  }

  function render() {
    const T = getTokens();
    const rk = ranked();
    drawSpace(T, rk);
    drawRank(T, rk);
    const best = rk[0], second = rk.find((d) => d.k !== best.k);
    const topK = rk.slice(0, 3);
    const mixed = new Set(topK.map((d) => d.k)).size > 1;
    const far = rk[rk.length - 1];
    let verdict;
    if (mixed) verdict = `The query points between topics, so the top 3 mixes ${[...new Set(topK.map((d) => clusters[d.k].name))].join(" and ")} pages. One arrow can't say which meaning you wanted; filters or a reranker have to decide.`;
    else verdict = `All of the top 3 are ${clusters[best.k].name} pages: the arrow sits inside that cluster. The nearest other topic (${clusters[second.k].name}) scores only ${second.cos.toFixed(2)}, and "${far.label}" sits ${(Math.acos(Math.max(-1, Math.min(1, far.cos))) * DEG).toFixed(0)}° away.`;
    readout(document.getElementById("ro-sphere"), [["#1", `${best.label} (${best.cos.toFixed(2)})`], ["angle", `${(Math.acos(Math.min(1, best.cos)) * DEG).toFixed(0)}°`], ["length", "1.000"]], verdict, mixed ? "warn" : "");
  }

  bindOrbit(cv, cam, {
    tipScreen: () => tipXY,
    onTip: (p) => { q = p; document.querySelectorAll("[data-sphere]").forEach((b) => b.classList.remove("active")); render(); },
    onChange: render,
  });
  document.querySelectorAll("[data-sphere]").forEach((btn) => btn.addEventListener("click", () => {
    q = SPHERE_QUERIES[btn.dataset.sphere];
    document.querySelectorAll("[data-sphere]").forEach((b) => b.classList.toggle("active", b === btn));
    render();
  }));
  redrawCallbacks.push(render);
  render();
}

/* ==========================================================================
   §9 · A spike in 3D
   ========================================================================== */
// seeded so every visitor sees the same sequence of random rotations
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const spikeRng = mulberry32(SPIKE_SEED);
function gauss() { let u = 0; while (u === 0) u = spikeRng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * spikeRng()); }

function initSpikeLab(getTokens, prepCanvas, redrawCallbacks) {
  const cv = document.getElementById("canvas-spike3d");
  const cb = document.getElementById("canvas-spike-bars");
  if (!cv || !cb) return;
  const cam = makeCamera(0.7, 0.38);
  let r = [1, 0, 0];
  let tipXY = null;
  const EVEN = 1 / Math.sqrt(3);

  function drawGeom(T) {
    const { ctx, w, h } = prepCanvas(cv);
    ctx.clearRect(0, 0, w, h);
    cam.fit(w, h, 0.33, 6);
    // cube [-1, 1]^3
    const c = [-1, 1];
    const corners = [];
    c.forEach((x) => c.forEach((y) => c.forEach((z) => corners.push([x, y, z]))));
    for (let i = 0; i < 8; i += 1) for (let j = i + 1; j < 8; j += 1) {
      const diff = corners[i].reduce((s, v, k) => s + (v !== corners[j][k] ? 1 : 0), 0);
      if (diff === 1) line3(ctx, cam, corners[i], corners[j], T.line, 1, null, 0.9);
    }
    circle3(ctx, cam, (t) => [Math.cos(t), Math.sin(t), 0], T.line);
    circle3(ctx, cam, (t) => [Math.cos(t), 0, Math.sin(t)], T.line);
    axisSet(ctx, cam, T, ["x₁", "x₂", "x₃"], 1.15);

    // ghost spike
    line3(ctx, cam, [0, 0, 0], [1, 0, 0], T.blue, 2, [5, 4], 0.8);
    const gp = cam.proj([1, 0, 0]);
    ctx.fillStyle = T.blue; ctx.font = `600 11px ${T.mono}`; ctx.textAlign = "center"; ctx.textBaseline = "top";
    ctx.fillText("x", gp.x, gp.y + 8);

    // drop lines from the tip to show its three coordinates
    const foot = [r[0], 0, r[2]];
    line3(ctx, cam, r, foot, T.muted, 1, [2, 3], 0.8);
    line3(ctx, cam, foot, [r[0], 0, 0], T.muted, 1, [2, 3], 0.8);
    line3(ctx, cam, foot, [0, 0, r[2]], T.muted, 1, [2, 3], 0.8);

    const tp = arrow3(ctx, cam, r, T.brand, 3);
    tipHandle(ctx, T, tp, T.brand);
    tipXY = tp;
    ctx.fillStyle = T.brand; ctx.font = `600 11px ${T.mono}`; ctx.textAlign = "left"; ctx.textBaseline = "bottom";
    ctx.fillText("Rx", tp.x + 9, tp.y - 6);
    chip(ctx, T, 8, h - 14, `Rx = (${r.map((v) => v.toFixed(2)).join(", ")})`, T.brand);
  }

  function drawBars(T) {
    const { ctx, w, h } = prepCanvas(cb);
    ctx.clearRect(0, 0, w, h);
    const l = 40, rr = 14, t = 24, b = 30;
    const Y = (v) => h - b - v * (h - t - b);
    ctx.font = `10px ${T.mono}`; ctx.textAlign = "right"; ctx.textBaseline = "middle";
    [0, 0.25, 0.5, 0.75, 1].forEach((v) => {
      ctx.strokeStyle = T.line; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(l, Y(v)); ctx.lineTo(w - rr, Y(v)); ctx.stroke();
      ctx.fillStyle = T.muted; ctx.fillText(v.toFixed(2), l - 6, Y(v));
    });
    const bw = (w - l - rr) / 3;
    const mx = Math.max(...r.map(Math.abs));
    r.forEach((v, i) => {
      const a = Math.abs(v), x = l + i * bw + bw * 0.22, bwi = bw * 0.56;
      ctx.fillStyle = a === mx ? T.coral : T.brand; ctx.globalAlpha = 0.9;
      ctx.fillRect(x, Y(a), bwi, Math.max(1, Y(0) - Y(a)));
      ctx.globalAlpha = 1;
      ctx.fillStyle = T.fg; ctx.font = `600 11px ${T.mono}`; ctx.textAlign = "center"; ctx.textBaseline = "bottom";
      ctx.fillText(a.toFixed(2), x + bwi / 2, Y(a) - 4);
      ctx.fillStyle = T.muted; ctx.font = `11px ${T.mono}`; ctx.textBaseline = "top";
      ctx.fillText(`|x${"₁₂₃"[i]}|`, x + bwi / 2, h - b + 8);
    });
    // even-split reference
    ctx.strokeStyle = T.amber; ctx.setLineDash([5, 4]); ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(l, Y(EVEN)); ctx.lineTo(w - rr, Y(EVEN)); ctx.stroke(); ctx.setLineDash([]);
    chip(ctx, T, w - rr - 4, Y(EVEN) + 14, "1/√3 = 0.58", T.amber, "right");
  }

  function render() {
    const T = getTokens();
    drawGeom(T);
    drawBars(T);
    const mx = Math.max(...r.map(Math.abs));
    const len = Math.hypot(...r);
    document.getElementById("kpi-spike-max").innerHTML = `<span class="was">1.00</span><span class="arrow">→</span>${mx.toFixed(2)}`;
    document.getElementById("kpi-spike-len").textContent = len.toFixed(3);
    let verdict, tone;
    if (mx > 0.97) { verdict = "All of the length sits in one coordinate. A low-bit quantizer has to stretch its scale to reach it, and the small coordinates all round to the same level."; tone = "warn"; }
    else if (mx < 0.62) { verdict = `Close to the most even split there is: every coordinate is near 0.58. The largest is ${mx.toFixed(2)} instead of 1, and the length is still ${len.toFixed(3)}, so nothing was lost.`; tone = ""; }
    else { verdict = `The length is now shared: the largest coordinate is ${mx.toFixed(2)} instead of 1.00, so a quantizer can use a tighter scale. The length is still ${len.toFixed(3)}; rotation never loses information.`; tone = ""; }
    readout(document.getElementById("ro-spike"), [["Rx", `(${r.map((v) => v.toFixed(2)).join(", ")})`], ["max |coord|", mx.toFixed(2)], ["length", len.toFixed(3)]], verdict, tone);
  }

  bindOrbit(cv, cam, { tipScreen: () => tipXY, onTip: (p) => { r = p; render(); }, onChange: render });
  document.getElementById("btn-spike-rot").addEventListener("click", () => { r = norm3([gauss(), gauss(), gauss()]); render(); });
  document.getElementById("btn-spike-reset").addEventListener("click", () => { r = [1, 0, 0]; render(); });
  redrawCallbacks.push(render);
  render();
}

export function init3dLabs({ getTokens, prepCanvas, redrawCallbacks }) {
  initSphereLab(getTokens, prepCanvas, redrawCallbacks);
  initSpikeLab(getTokens, prepCanvas, redrawCallbacks);
}
