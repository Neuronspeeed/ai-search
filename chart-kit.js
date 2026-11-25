/* ==========================================================================
   chart-kit: small shared canvas helpers so every chart looks the same.
   - frame():   plot area + scales
   - axes():    faint grid, tick marks, tick labels, axis titles
   - legend():  boxed legend with swatches, inside the plot
   - refLine(): dashed reference line with a label chip
   - callout(): value box with a leader line that dodges other labels
   All labels register with a Placer so they never sit on top of each other.
   ========================================================================== */

export function makeFrame(w, h, pad = {}, domain = {}) {
  const p = { l: 44, r: 14, t: 14, b: 34, ...pad };
  const d = { x0: 0, x1: 1, y0: 0, y1: 1, ...domain };
  const left = p.l;
  const top = p.t;
  const plotW = Math.max(10, w - p.l - p.r);
  const plotH = Math.max(10, h - p.t - p.b);
  const x = (v) => left + ((v - d.x0) / (d.x1 - d.x0 || 1)) * plotW;
  const y = (v) => top + plotH - ((v - d.y0) / (d.y1 - d.y0 || 1)) * plotH;
  const invX = (px) => d.x0 + ((px - left) / plotW) * (d.x1 - d.x0);
  const invY = (py) => d.y0 + ((top + plotH - py) / plotH) * (d.y1 - d.y0);
  return { w, h, left, top, right: left + plotW, bottom: top + plotH, plotW, plotH, x, y, invX, invY, d };
}

export function ticks(lo, hi, approx = 5) {
  const span = hi - lo || 1;
  const raw = span / approx;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) || raw;
  const out = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-9; v += step) out.push(+v.toFixed(10));
  return out;
}

/** Tracks occupied rectangles so labels never overlap each other. */
export class Placer {
  constructor(frame) {
    this.f = frame;
    this.boxes = [];
  }
  hits(r) {
    return this.boxes.some((b) => r.x < b.x + b.w && r.x + r.w > b.x && r.y < b.y + b.h && r.y + r.h > b.y);
  }
  inside(r) {
    const f = this.f;
    return r.x >= f.left - 1 && r.x + r.w <= f.right + 1 && r.y >= f.top - 1 && r.y + r.h <= f.bottom + 1;
  }
  /** Try candidates in order; take the first that fits. Falls back to the first. */
  pick(cands) {
    const ok = cands.find((c) => this.inside(c) && !this.hits(c)) || cands.find((c) => this.inside(c)) || cands[0];
    this.boxes.push(ok);
    return ok;
  }
  reserve(r) {
    this.boxes.push(r);
  }
}

export function axes(ctx, T, f, o = {}) {
  const xt = o.xTicks || ticks(f.d.x0, f.d.x1, o.xCount || 5);
  const yt = o.yTicks || ticks(f.d.y0, f.d.y1, o.yCount || 4);
  const xFmt = o.xFmt || ((v) => String(v));
  const yFmt = o.yFmt || ((v) => String(v));
  ctx.save();
  ctx.lineWidth = 1;
  // faint grid
  if (o.grid !== false) {
    ctx.strokeStyle = T.line;
    ctx.globalAlpha = 0.7;
    yt.forEach((v) => { const yy = Math.round(f.y(v)) + 0.5; ctx.beginPath(); ctx.moveTo(f.left, yy); ctx.lineTo(f.right, yy); ctx.stroke(); });
    if (o.xGrid) xt.forEach((v) => { const xx = Math.round(f.x(v)) + 0.5; ctx.beginPath(); ctx.moveTo(xx, f.top); ctx.lineTo(xx, f.bottom); ctx.stroke(); });
    ctx.globalAlpha = 1;
  }
  // axis lines
  ctx.strokeStyle = T.lineStrong;
  ctx.beginPath();
  ctx.moveTo(f.left + 0.5, f.top);
  ctx.lineTo(f.left + 0.5, f.bottom + 0.5);
  ctx.lineTo(f.right, f.bottom + 0.5);
  ctx.stroke();
  // ticks + labels
  ctx.fillStyle = T.muted;
  ctx.font = `11px ${T.mono}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  xt.forEach((v) => {
    const xx = Math.round(f.x(v)) + 0.5;
    ctx.beginPath(); ctx.moveTo(xx, f.bottom); ctx.lineTo(xx, f.bottom + 4); ctx.stroke();
    ctx.fillText(xFmt(v), xx, f.bottom + 6);
  });
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  yt.forEach((v) => {
    const yy = Math.round(f.y(v)) + 0.5;
    ctx.beginPath(); ctx.moveTo(f.left - 4, yy); ctx.lineTo(f.left, yy); ctx.stroke();
    ctx.fillText(yFmt(v), f.left - 7, yy);
  });
  // titles
  ctx.font = `11px ${T.mono}`;
  if (o.xTitle) {
    ctx.textAlign = "right";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(o.xTitle, f.right, f.h - 2);
  }
  if (o.yTitle) {
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText(o.yTitle, f.left + 6, 2);
  }
  ctx.restore();
}

function chip(ctx, T, x, y, text, color, o = {}) {
  ctx.save();
  ctx.font = `${o.bold ? "600 " : ""}${o.size || 10.5}px ${T.mono}`;
  const tw = ctx.measureText(text).width;
  const w = tw + 12;
  const h = (o.size || 10.5) + 8;
  ctx.restore();
  return { w, h, draw(bx, by) {
    ctx.save();
    ctx.font = `${o.bold ? "600 " : ""}${o.size || 10.5}px ${T.mono}`;
    ctx.fillStyle = T.bg;
    ctx.globalAlpha = 0.92;
    ctx.fillRect(bx, by, w, h);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.strokeRect(bx + 0.5, by + 0.5, w - 1, h - 1);
    ctx.fillStyle = o.textColor || color;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(text, bx + 6, by + h / 2 + 0.5);
    ctx.restore();
  } };
}

/** items: [{label, color, kind: "line"|"dash"|"dot"|"bar"}] */
export function legend(ctx, T, f, items, placer, corner = "tr") {
  ctx.save();
  ctx.font = `11px ${T.mono}`;
  const rowH = 15;
  const sw = 16;
  const w = Math.max(...items.map((i) => ctx.measureText(i.label).width)) + sw + 22;
  const h = items.length * rowH + 8;
  const cands = {
    tr: { x: f.right - w - 6, y: f.top + 6 },
    tl: { x: f.left + 6, y: f.top + 6 },
    br: { x: f.right - w - 6, y: f.bottom - h - 6 },
    bl: { x: f.left + 6, y: f.bottom - h - 6 },
  };
  const order = [corner, ...["tr", "tl", "br", "bl"].filter((c) => c !== corner)];
  const box = placer ? placer.pick(order.map((c) => ({ ...cands[c], w, h }))) : { ...cands[corner], w, h };
  ctx.fillStyle = T.bg;
  ctx.globalAlpha = 0.9;
  ctx.fillRect(box.x, box.y, w, h);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = T.line;
  ctx.strokeRect(box.x + 0.5, box.y + 0.5, w - 1, h - 1);
  items.forEach((it, i) => {
    const cy = box.y + 4 + i * rowH + rowH / 2;
    const sx = box.x + 7;
    ctx.strokeStyle = it.color;
    ctx.fillStyle = it.color;
    ctx.lineWidth = 2;
    if (it.kind === "bar") ctx.fillRect(sx, cy - 4, sw, 8);
    else if (it.kind === "dot") { ctx.beginPath(); ctx.arc(sx + sw / 2, cy, 3.5, 0, Math.PI * 2); ctx.fill(); }
    else {
      ctx.setLineDash(it.kind === "dash" ? [4, 3] : []);
      ctx.beginPath(); ctx.moveTo(sx, cy); ctx.lineTo(sx + sw, cy); ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.fillStyle = T.reading;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(it.label, sx + sw + 7, cy + 0.5);
  });
  ctx.restore();
  return box;
}

/** Horizontal (y) or vertical (x) dashed reference line with a label chip. */
export function refLine(ctx, T, f, o, placer) {
  const color = o.color || T.amber;
  ctx.save();
  ctx.setLineDash(o.dash || [5, 4]);
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.25;
  ctx.beginPath();
  if (o.y !== undefined) { const yy = f.y(o.y); ctx.moveTo(f.left, yy); ctx.lineTo(f.right, yy); }
  else { const xx = f.x(o.x); ctx.moveTo(xx, f.top); ctx.lineTo(xx, f.bottom); }
  ctx.stroke();
  ctx.restore();
  if (!o.label) return;
  const c = chip(ctx, T, 0, 0, o.label, color, { size: 10 });
  let cands;
  if (o.y !== undefined) {
    const yy = f.y(o.y);
    cands = [
      { x: f.right - c.w - 4, y: yy - c.h - 3 }, { x: f.right - c.w - 4, y: yy + 3 },
      { x: f.left + 6, y: yy - c.h - 3 }, { x: f.left + 6, y: yy + 3 },
    ];
  } else {
    const xx = f.x(o.x);
    cands = [
      { x: xx + 4, y: f.top + 4 }, { x: xx - c.w - 4, y: f.top + 4 },
      { x: xx + 4, y: f.bottom - c.h - 4 }, { x: xx - c.w - 4, y: f.bottom - c.h - 4 },
    ];
  }
  const box = placer ? placer.pick(cands.map((p) => ({ ...p, w: c.w, h: c.h }))) : { ...cands[0], w: c.w, h: c.h };
  c.draw(box.x, box.y);
}

/** Value box with a short leader line to (px, py). Dodges other labels. */
export function callout(ctx, T, px, py, text, color, placer, o = {}) {
  const c = chip(ctx, T, 0, 0, text, color, { bold: true, size: 11, textColor: o.textColor || T.fg });
  const g = 14;
  const cands = [
    { x: px + g, y: py - c.h - g }, { x: px + g, y: py + g },
    { x: px - c.w - g, y: py - c.h - g }, { x: px - c.w - g, y: py + g },
    { x: px - c.w / 2, y: py - c.h - g - 6 }, { x: px - c.w / 2, y: py + g + 6 },
  ].map((p) => ({ ...p, w: c.w, h: c.h }));
  const box = placer ? placer.pick(cands) : cands[0];
  // leader line from the point to the nearest box edge
  const ex = Math.max(box.x, Math.min(px, box.x + box.w));
  const ey = Math.max(box.y, Math.min(py, box.y + box.h));
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(ex, ey); ctx.stroke();
  ctx.restore();
  c.draw(box.x, box.y);
  return box;
}

/** Draggable handle: ring + dot, like a grab point. */
export function handle(ctx, T, x, y, color, r = 7) {
  ctx.save();
  ctx.beginPath(); ctx.arc(x, y, r + 4, 0, Math.PI * 2);
  ctx.fillStyle = color; ctx.globalAlpha = 0.12; ctx.fill(); ctx.globalAlpha = 1;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = T.bg; ctx.fill();
  ctx.lineWidth = 2.25; ctx.strokeStyle = color; ctx.stroke();
  ctx.beginPath(); ctx.arc(x, y, 2.5, 0, Math.PI * 2);
  ctx.fillStyle = color; ctx.fill();
  ctx.restore();
}

/** Plot a function y = fn(x) across the frame's x-domain. */
export function curve(ctx, f, fn, color, o = {}) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = o.width || 2;
  if (o.dash) ctx.setLineDash(o.dash);
  ctx.beginPath();
  const n = o.samples || 160;
  for (let i = 0; i <= n; i += 1) {
    const xv = f.d.x0 + ((f.d.x1 - f.d.x0) * i) / n;
    const yv = Math.max(f.d.y0, Math.min(f.d.y1, fn(xv)));
    const X = f.x(xv);
    const Y = f.y(yv);
    if (i === 0) ctx.moveTo(X, Y); else ctx.lineTo(X, Y);
  }
  ctx.stroke();
  ctx.restore();
}

/** Keep chart labels out from under an HTML .plot-hint chip sitting over the canvas. */
export function reserveHint(placer, canvas) {
  const hint = canvas.parentElement && canvas.parentElement.querySelector(".plot-hint");
  if (!hint) return;
  const cr = canvas.getBoundingClientRect();
  const hr = hint.getBoundingClientRect();
  if (!hr.width) return;
  placer.reserve({ x: hr.left - cr.left - 4, y: hr.top - cr.top - 4, w: hr.width + 8, h: hr.height + 8 });
}

/** Drag + arrow keys on a canvas. onDrag(p) gets {x, y, w, h}; onKey(dir) gets ±1 (Shift = ±5). */
export function bindDrag(canvas, onDrag, onKey, canStart = () => true) {
  let dragging = false;
  const pos = (e) => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top, w: r.width, h: r.height }; };
  canvas.addEventListener("pointerdown", (e) => {
    const p = pos(e);
    if (!canStart(p)) return;
    dragging = true;
    canvas.setPointerCapture(e.pointerId);
    onDrag(p);
  });
  canvas.addEventListener("pointermove", (e) => { if (dragging) onDrag(pos(e)); });
  const stop = () => { dragging = false; };
  canvas.addEventListener("pointerup", stop);
  canvas.addEventListener("pointercancel", stop);
  if (onKey) canvas.addEventListener("keydown", (e) => {
    const step = e.shiftKey ? 5 : 1;
    if (e.key === "ArrowRight" || e.key === "ArrowUp") onKey(step, e.key);
    else if (e.key === "ArrowLeft" || e.key === "ArrowDown") onKey(-step, e.key);
    else return;
    e.preventDefault();
  });
}

/** Fill a .readout element: pairs of [label, value] plus one plain-words verdict. */
export function readout(el, pairs, verdict, tone = "") {
  if (!el) return;
  const html = pairs.map(([k, v]) => `<span class="ro"><b>${k}</b>${v}</span>`).join("")
    + (verdict ? `<span class="ro-verdict ${tone}">${verdict}</span>` : "");
  // skip identical rewrites so screen readers don't re-announce on theme change or resize
  if (el.dataset.last === html) return;
  el.dataset.last = html;
  el.innerHTML = html;
}
