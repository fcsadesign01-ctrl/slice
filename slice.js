// ---- State -------------------------------------------------
const DEF = {text:'A', useImage:false, shape:'square', size:400, sx:40, sy:40, squeeze:0, comp:0, compX:0, rot:0, cell:80, gap:0, bgMode:'solid', bgA:'#ffffff', bgB:'#8ab4ff', bgType:'linear', bgAngle:45, txMode:'solid', txA:'#000000', txB:'#ff5a36', txType:'linear', txAngle:45, font:'helvetica', lines:false, lineC:'#000000', lineW:1, stagger:0, rm:0, rmSpeed:1, rr:0, loopLen:6, seed:1, ix:false, ixR:200, ixS:100};
const FONTS = {
  helvetica:{n:'Helvetica', css:'Helvetica, Arial, sans-serif', b:true},
  inter:{n:'Inter', css:'"Inter", Helvetica, sans-serif', b:true},
  archivo:{n:'Archivo Black', css:'"Archivo Black", Helvetica, sans-serif', b:false},
  bebas:{n:'Bebas Neue', css:'"Bebas Neue", Impact, sans-serif', b:false},
  playfair:{n:'Playfair Display', css:'"Playfair Display", Georgia, serif', b:true},
  dmserif:{n:'DM Serif Display', css:'"DM Serif Display", Georgia, serif', b:false},
  spacemono:{n:'Space Mono', css:'"Space Mono", "Courier New", monospace', b:true}
};
const SLIDERS = [
  ['size','Size',10,1500,10], ['sx','Grid Shift X',0,200,1], ['sy','Grid Shift Y',0,200,1],
  ['squeeze','Squeeze',-50,50,1], ['comp','Compression Y',0,100,1], ['compX','Compression X',0,100,1], ['rot','Rotation',0,50,1],
  ['cell','Cell size',20,200,1], ['gap','Gap',0,40,1], ['bgAngle','Angle',0,360,1], ['txAngle','Angle',0,360,1], ['lineW','Weight',0.5,8,0.5], ['stagger','Stagger',0,1,0.01], ['rm','Random motion',0,100,1], ['rmSpeed','Motion speed',0,5,0.1], ['rr','Random rotation',0,180,1], ['loopLen','Loop length (s)',2,30,0.5], ['ixR','Radius',40,600,5], ['ixS','Strength (%)',-90,300,5]
];
let P = {...DEF}, img = null, glyph = null, gW = 0, gH = 0, dirty = true;
const $ = id => document.getElementById(id);

// ---- Engine: pure cell math (reused later by SVG/video export) ----
// Every cell is a window onto the same glyph, offset by (-col*shiftX, -row*shiftY).
function cellXform(col, row, p) {
  const dist = Math.hypot(col, row);
  const stretch = Math.max(0, Math.abs(p.squeeze) * 0.02 * (6 - Math.abs(row)) / 6);
  let sy = 1 + (p.squeeze > 0 ? stretch : -stretch);
  if (p.comp > 0) sy *= Math.max(0.1, 1 - dist * p.comp * 0.015);
  return {
    scx: p.compX > 0 ? Math.max(0.1, 1 - dist * p.compX * 0.015) : 1,
    sy: Math.max(0.02, sy),
    ang: p.rot > 0 ? dist * p.rot * 0.8 : 0,
    ox: -col * p.sx,
    oy: -row * p.sy
  };
}

// ---- Tilings: each shape gets a layout that interlocks to minimise gaps ----
// Square, hexagon, triangle and octagon (+ diamond fillers) tile perfectly.
// Circle and pentagon cannot, so they use the tightest packing available.
// p = tile pitch (cell + gap). Tiles are drawn shrunk by cell/p, so Gap opens a seam.
const poly = (n, R, a0) => Array.from({length: n}, (_, i) => {
  const a = a0 + i * 2 * Math.PI / n; return [R * Math.cos(a), R * Math.sin(a)];
});
function tiles(shape, p, W, H) {
  const out = [], N = Math.ceil(W / (0.8 * p)) + 3, M = Math.ceil(H / (0.8 * p)) + 3;
  const add = (x, y, o) => { if (Math.abs(x) < W / 2 + p && Math.abs(y) < H / 2 + p) out.push({x, y, ...o}); };
  const S3 = Math.sqrt(3);
  const sq = poly(4, p / Math.SQRT2, Math.PI / 4);
  const hexR = p / 2;
  const L = p, h = L * S3 / 2;
  const triUp = [[0, -2 * h / 3], [L / 2, h / 3], [-L / 2, h / 3]];
  const triDn = [[-L / 2, -h / 3], [L / 2, -h / 3], [0, 2 * h / 3]];
  const pR = p / 1.9, pD = 1.701 * pR, pH = 1.809 * pR;
  const penUp = poly(5, pR, -Math.PI / 2), penDn = penUp.map(([x, y]) => [x, -y]);
  const oct = poly(8, (p / 2) / Math.cos(Math.PI / 8), Math.PI / 8);
  const dia = poly(4, 0.2929 * p, 0);
  for (let i = -N; i <= N; i++) for (let j = -M; j <= M; j++) {
    if (shape === 'square') add(i * p, j * p, {pts: sq});
    else if (shape === 'circle') add(i * p + ((j & 1) ? p / 2 : 0), j * p * 0.866, {r: p / 2});
    else if (shape === 'hexagon') add(i * 1.5 * hexR, j * S3 * hexR + ((i & 1) ? S3 * hexR / 2 : 0), {pts: poly(6, hexR, 0)});
    else if (shape === 'triangle') { const up = ((i + j) & 1) === 0; add(i * L / 2, j * h + (up ? 2 * h / 3 : h / 3), {pts: up ? triUp : triDn}); }
    else if (shape === 'pentagon') add(i * pD, j * pH, {pts: (i & 1) ? penDn : penUp});
    else if (shape === 'octagon') { add(i * p, j * p, {pts: oct}); add((i + 0.5) * p, (j + 0.5) * p, {pts: dia}); }
  }
  return out;
}
function shapePath(ctx, cx, cy, tl, k) {
  ctx.beginPath();
  if (tl.r) { ctx.arc(cx, cy, tl.r * k, 0, Math.PI * 2); return; }
  tl.pts.forEach(([dx, dy], i) => i ? ctx.lineTo(cx + dx * k, cy + dy * k) : ctx.moveTo(cx + dx * k, cy + dy * k));
  ctx.closePath();
}

// ---- Glyph (text or image rendered once, reused in every cell) ----
function buildGlyph(pdo) {
  const useImg = P.useImage && img;
  const lines = (P.text || 'A').split('\n');
  const lead = P.size * 1.15, iw = P.size * 0.8, ih = useImg ? iw * img.height / img.width : 0;
  let w, h;
  if (useImg) { w = iw; h = ih; }
  else {
    const F = FONTS[P.font]; textFont(F.css); textStyle(F.b ? BOLD : NORMAL); textSize(P.size);
    w = Math.max(1, ...lines.map(l => textWidth(l)));
    h = lines.length * lead;
  }
  gW = Math.ceil(w + P.size * 0.2); gH = Math.ceil(h + P.size * 0.2);
  if (glyph) glyph.remove();
  glyph = createGraphics(gW, gH);
  glyph.pixelDensity(Math.min(pdo ? Math.max(pdo, 2) : 2, 6000 / Math.max(gW, gH)));
  glyph.clear();
  glyph.translate(gW / 2, gH / 2);
  if (useImg) glyph.image(img, -iw / 2, -ih / 2, iw, ih);
  else {
    glyph.textFont(FONTS[P.font].css); glyph.textStyle(FONTS[P.font].b ? BOLD : NORMAL); glyph.textAlign(CENTER, CENTER);
    glyph.fill(0); glyph.noStroke(); glyph.textSize(P.size);
    glyph.drawingContext.fillStyle = P.txMode === 'solid' ? P.txA : gradient(glyph.drawingContext, 0, 0, gW, gH, P.txType, P.txAngle, P.txA, P.txB);
    lines.forEach((l, i) => glyph.text(l, 0, (i - (lines.length - 1) / 2) * lead));
  }
}

// ---- p5 ----------------------------------------------------
function setup() {
  const st = $('stage');
  createCanvas(st.clientWidth || 600, st.clientHeight || 400).parent(st);
  noLoop();
  new ResizeObserver(() => { resizeCanvas(st.clientWidth, st.clientHeight); redraw(); expUI(); }).observe(st);
}

// ---- Random motion: seeded and periodic (repeats exactly every Loop length seconds) ----
let mt = 0;
const TAU = Math.PI * 2;
// ---- Pointer magnify: cells near the cursor / finger scale up (eased in and out) ----
const ptr = {x: 0, y: 0, tx: 0, ty: 0, on: false, amt: 0};
let exporting = false, expPD = 0; // expPD: glyph density used while exporting
function syncLoop() { ((P.rm > 0 && P.rmSpeed > 0) || (P.ix && (ptr.on || ptr.amt > 0.002))) ? loop() : noLoop(); }
function magOf(tl) {
  const d = Math.hypot(width / 2 + tl.x - ptr.x, height / 2 + tl.y - ptr.y), f = Math.max(0, 1 - d / P.ixR);
  return 1 + P.ixS / 100 * f * f * (3 - 2 * f) * ptr.amt;
}
function stepAnim() {
  const dt = Math.min(deltaTime, 100);
  if (P.rm > 0 && P.rmSpeed > 0) mt = (mt + dt / 1000) % P.loopLen;
  if (P.ix) {
    const f = dt / 16.7;
    ptr.x += (ptr.tx - ptr.x) * Math.min(1, 0.3 * f); ptr.y += (ptr.ty - ptr.y) * Math.min(1, 0.3 * f);
    ptr.amt += ((ptr.on ? 1 : 0) - ptr.amt) * Math.min(1, 0.15 * f);
    if (!ptr.on && ptr.amt < 0.002) ptr.amt = 0;
  }
}
function hash(seed, a, b, c) { // stable 0..1 value per (seed, cell, channel)
  let h = Math.imul(seed + 1, 374761393) ^ Math.imul(a + 7919, 668265263) ^ Math.imul(b + 104729, 2147483629) ^ Math.imul(c + 31, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
// Stagger blends each cell's random phase into an outward ripple (phase falls with distance from centre).
function phase(tl, p, i) {
  const rnd = hash(P.seed, Math.round(tl.x / p * 4), Math.round(tl.y / p * 4), i);
  const rip = -Math.hypot(tl.x, tl.y) / p * (0.7 + 0.25 * i);
  return TAU * rnd * (1 - P.stagger) + rip * P.stagger;
}
// Whole cycles per loop, so t = Loop length lands exactly back on t = 0.
const cyc = c => Math.max(1, Math.round(0.5 * P.rmSpeed * c * P.loopLen / TAU));
function jitter(tl, p) { // random panning: offsets the glyph inside each cell
  const th = TAU * mt / P.loopLen, a = P.rm, w = (c, i, fn) => fn(cyc(c) * th + phase(tl, p, i));
  return [(w(1.1, 0, Math.sin) * 1.2 + w(2.9, 1, Math.sin) * 0.8 + w(0.5, 2, Math.sin) * 0.6) * a / 2.6,
          (w(1.4, 3, Math.cos) * 0.9 + w(2.2, 4, Math.cos) * 0.7 + w(0.4, 5, Math.cos) * 0.5) * a / 2.1];
}
function jitterRot(tl, p) { // random rotation: degrees, up to +/- Random rotation
  const th = TAU * mt / P.loopLen;
  return (Math.sin(cyc(1.3) * th + phase(tl, p, 6)) * 0.6 + Math.sin(cyc(2.1) * th + phase(tl, p, 7)) * 0.4) * P.rr;
}

// ---- Gradient helper (angle follows CSS: 0 = up, 90 = right), centred on (cx, cy) ----
function gradient(ctx, cx, cy, w, h, type, ang, c1, c2) {
  let g;
  if (type === 'radial') g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.hypot(w, h) / 2);
  else {
    const a = ang * Math.PI / 180, dx = Math.sin(a), dy = -Math.cos(a), L = (Math.abs(w * dx) + Math.abs(h * dy)) / 2;
    g = ctx.createLinearGradient(cx - dx * L, cy - dy * L, cx + dx * L, cy + dy * L);
  }
  g.addColorStop(0, c1); g.addColorStop(1, c2); return g;
}

// ---- Background: solid colour or gradient (angle follows CSS: 0 = up, 90 = right) ----
function paintBg(ctx = drawingContext) {
  const w = width, h = height;
  if (P.bgMode === 'solid') ctx.fillStyle = P.bgA;
  else if (P.bgType === 'radial') {
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.hypot(w, h) / 2);
    g.addColorStop(0, P.bgA); g.addColorStop(1, P.bgB); ctx.fillStyle = g;
  } else {
    const a = P.bgAngle * Math.PI / 180, dx = Math.sin(a), dy = -Math.cos(a);
    const L = (Math.abs(w * dx) + Math.abs(h * dy)) / 2;
    const g = ctx.createLinearGradient(w / 2 - dx * L, h / 2 - dy * L, w / 2 + dx * L, h / 2 + dy * L);
    g.addColorStop(0, P.bgA); g.addColorStop(1, P.bgB); ctx.fillStyle = g;
  }
  ctx.fillRect(0, 0, w, h);
}

function draw() {
  if (exporting) return;
  stepAnim();
  syncLoop();
  renderView(drawingContext);
}
// Draws the whole artwork into any 2D context, in view coordinates (exports scale the context).
function renderView(ctx) {
  paintBg(ctx);
  if (dirty) { buildGlyph(expPD); dirty = false; }
  const p = P.cell + P.gap, k = P.cell / p;
  const T = tiles(P.shape, p, width, height);
  const mags = new Map(); let TT = T; // magnified cells are drawn last so they sit on top
  if (P.ix && ptr.amt > 0) { T.forEach(tl => mags.set(tl, magOf(tl))); TT = [...T].sort((a, b) => mags.get(a) - mags.get(b)); }
  for (const tl of TT) {
    const cx = width / 2 + tl.x, cy = height / 2 + tl.y;
    const t = cellXform(tl.x / p, tl.y / p, P);
    if (P.rm > 0) { const j = jitter(tl, p); t.ox += j[0]; t.oy += j[1]; if (P.rr > 0) t.ang += jitterRot(tl, p); } // position in pitch units, so offsets stay continuous across layouts
    ctx.save();
    const m = mags.get(tl) || 1;
    shapePath(ctx, cx, cy, tl, k * m); ctx.clip();
    ctx.translate(cx, cy); ctx.rotate(t.ang * Math.PI / 180); ctx.scale(t.scx * m, t.sy * m);
    ctx.drawImage(glyph.elt, t.ox - gW / 2, t.oy - gH / 2, gW, gH);
    ctx.restore();
  }
  if (P.lines) { // grid lines drawn on top, after every tile
    ctx.save(); ctx.lineWidth = P.lineW; ctx.strokeStyle = P.lineC; ctx.lineJoin = 'round';
    for (const tl of T) { shapePath(ctx, width / 2 + tl.x, height / 2 + tl.y, tl, k * (mags.get(tl) || 1)); ctx.stroke(); }
    ctx.restore();
  }
}

// ---- Panel -------------------------------------------------
const GROUP = {size:'g_c', cell:'g_g', gap:'g_g', sx:'g_g', sy:'g_g', squeeze:'g_d', comp:'g_d', compX:'g_d', rot:'g_d', bgAngle:'g_b', txAngle:'g_t', lineW:'g_l', stagger:'g_a', rm:'g_a', rmSpeed:'g_a', rr:'g_a', loopLen:'g_a', ixR:'g_i', ixS:'g_i'};
const rng = {}, num = {};
function apply(k, v, typing) {
  const s = SLIDERS.find(x => x[0] === k);
  v = Math.min(s[3], Math.max(s[2], v));
  P[k] = v; rng[k].value = v;
  if (!typing) num[k].value = v;
  if (k === 'size' || k === 'txAngle') dirty = true;
  if (k === 'rm' || k === 'rmSpeed') { syncLoop(); rrUI(); expUI(); }
  redraw();
}
Object.keys(GROUP).forEach(k => {
  const s = SLIDERS.find(x => x[0] === k);
  const d = document.createElement('div'); d.className = 'row';
  d.innerHTML = `<div class="lab"><span class="nm" id="l_${k}" title="Double-click to reset">${s[1]}</span><input type="number" id="n_${k}" min="${s[2]}" max="${s[3]}" step="${s[4]}" aria-label="${s[1]} value"></div><input type="range" id="s_${k}" min="${s[2]}" max="${s[3]}" step="${s[4]}" aria-label="${s[1]}">`;
  $(GROUP[k]).appendChild(d);
  rng[k] = d.querySelector('input[type=range]'); num[k] = d.querySelector('input[type=number]');
  rng[k].oninput = () => apply(k, +rng[k].value);
  num[k].oninput = () => { if (num[k].value !== '' && !isNaN(+num[k].value)) apply(k, +num[k].value, true); };
  num[k].onchange = () => apply(k, num[k].value === '' ? DEF[k] : +num[k].value);
  let last = 0;
  $('l_' + k).onpointerup = () => { const n = Date.now(); if (n - last < 350) apply(k, DEF[k]); last = n; };
});

function sync() {
  Object.keys(GROUP).forEach(k => { rng[k].value = P[k]; num[k].value = P[k]; });
  $('txt').value = P.text; $('shape').value = P.shape; $('font').value = P.font; $('seed').value = P.seed;
  $('bText').classList.toggle('on', !P.useImage);
  $('bImg').classList.toggle('on', P.useImage);
  bgUI(); txUI(); lnUI(); fontUI(); rrUI(); ixUI(); expUI();
}

$('txt').oninput = e => { P.text = e.target.value || 'A'; dirty = true; redraw(); };
$('shape').onchange = e => { P.shape = e.target.value; redraw(); };
$('bText').onclick = () => { P.useImage = false; dirty = true; sync(); redraw(); };
$('bImg').onclick = () => {
  if (img && !P.useImage) { P.useImage = true; dirty = true; sync(); redraw(); }
  else $('file').click();
};
$('file').onchange = e => {
  const f = e.target.files[0]; if (!f) return;
  loadImage(URL.createObjectURL(f), im => { img = im; P.useImage = true; dirty = true; sync(); redraw(); });
  e.target.value = '';
};
$('reset').onclick = () => { P = {...DEF}; dirty = true; sync(); syncLoop(); redraw(); };

function bgUI() {
  const g = P.bgMode === 'gradient';
  $('bgS').classList.toggle('on', !g); $('bgG').classList.toggle('on', g);
  $('gradOpts').style.display = g ? '' : 'none';
  $('g_b').style.display = P.bgType === 'linear' ? '' : 'none';
  $('cALab').textContent = g ? 'Color 1' : 'Color';
  $('cA').value = P.bgA; $('cB').value = P.bgB; $('bgType').value = P.bgType;
}
$('bgS').onclick = () => { P.bgMode = 'solid'; bgUI(); redraw(); };
$('bgG').onclick = () => { P.bgMode = 'gradient'; bgUI(); redraw(); };
$('cA').oninput = e => { P.bgA = e.target.value; redraw(); };
$('cB').oninput = e => { P.bgB = e.target.value; redraw(); };
$('bgType').onchange = e => { P.bgType = e.target.value; bgUI(); redraw(); };

function txUI() {
  const g = P.txMode === 'gradient';
  $('txS').classList.toggle('on', !g); $('txG').classList.toggle('on', g);
  $('txOpts').style.display = g ? '' : 'none';
  $('g_t').style.display = P.txType === 'linear' ? '' : 'none';
  $('tALab').textContent = g ? 'Color 1' : 'Color';
  $('tA').value = P.txA; $('tB').value = P.txB; $('txType').value = P.txType;
}
const txSet = (k, v, ui) => { P[k] = v; dirty = true; if (ui) txUI(); redraw(); };
$('txS').onclick = () => txSet('txMode', 'solid', true);
$('txG').onclick = () => txSet('txMode', 'gradient', true);
$('tA').oninput = e => txSet('txA', e.target.value);
$('tB').oninput = e => txSet('txB', e.target.value);
$('txType').onchange = e => txSet('txType', e.target.value, true);

$('font').innerHTML = Object.entries(FONTS).map(([k, f]) => `<option value="${k}">${f.n}</option>`).join('');
$('font').onchange = async e => {
  P.font = e.target.value; const f = FONTS[P.font];
  try { await document.fonts.load(`${f.b ? 700 : 400} 100px ${f.css}`, 'Aa'); } catch { /* font will load later; fall back to the system font */ }
  dirty = true; redraw();
};
function lnUI() {
  $('lnOff').classList.toggle('on', !P.lines); $('lnOn').classList.toggle('on', P.lines);
  $('lnOpts').style.display = P.lines ? '' : 'none'; $('lnC').value = P.lineC;
}
$('lnOff').onclick = () => { P.lines = false; lnUI(); redraw(); };
$('lnOn').onclick = () => { P.lines = true; lnUI(); redraw(); };
$('lnC').oninput = e => { P.lineC = e.target.value; redraw(); };

// Random rotation only works on top of random motion; font options only apply to text.
function rrUI() {
  const on = P.rm > 0;
  ['rr', 'stagger', 'loopLen'].forEach(k => { rng[k].disabled = num[k].disabled = !on; rng[k].closest('.row').style.opacity = on ? '' : '0.4'; });
  $('seed').disabled = $('shuffle').disabled = !on; $('seedRow').style.opacity = on ? '' : '0.4';
}
function fontUI() { ['fontOpts', 'fontColor'].forEach(id => { $(id).disabled = P.useImage; }); }

$('seed').oninput = e => { P.seed = Math.max(0, Math.floor(+e.target.value) || 0); redraw(); };
$('seed').onchange = e => { e.target.value = P.seed; };
$('shuffle').onclick = () => { P.seed = 1 + Math.floor(Math.random() * 99999); $('seed').value = P.seed; redraw(); };

function ixUI() {
  $('ixOff').classList.toggle('on', !P.ix); $('ixOn').classList.toggle('on', P.ix);
  $('ixOpts').style.display = P.ix ? '' : 'none';
}
$('ixOn').onclick = () => { P.ix = true; ixUI(); redraw(); };
$('ixOff').onclick = () => { P.ix = false; ptr.on = false; ptr.amt = 0; ixUI(); syncLoop(); redraw(); };
const stg = $('stage');
function ptrMove(e) {
  if (!P.ix) return;
  const r = stg.getBoundingClientRect();
  ptr.tx = e.clientX - r.left; ptr.ty = e.clientY - r.top;
  if (!ptr.on) { if (ptr.amt < 0.002) { ptr.x = ptr.tx; ptr.y = ptr.ty; } ptr.on = true; }
  syncLoop(); redraw();
}
const ptrOff = () => { ptr.on = false; syncLoop(); };
stg.addEventListener('pointermove', ptrMove);
stg.addEventListener('pointerdown', ptrMove);
stg.addEventListener('pointerleave', ptrOff);
stg.addEventListener('pointercancel', ptrOff);
stg.addEventListener('pointerup', e => { if (e.pointerType !== 'mouse') ptrOff(); });

// ---- Export: PNG still, or MP4 of one seamless loop, at 1080p / 2K / 4K ----
const FPS = 30;
const say = t => { $('expMsg').textContent = t; };
function expDims() { // keeps the view's aspect ratio; the resolution sets the long edge
  const vw = typeof width === 'number' ? width : innerWidth, vh = typeof height === 'number' ? height : innerHeight;
  const long = +$('expRes').value, a = vw / vh;
  const w = a >= 1 ? long : Math.round(long * a), h = a >= 1 ? Math.round(long / a) : long;
  return [w - (w % 2), h - (h % 2)]; // H.264 needs even sizes
}
function expUI() {
  const [w, h] = expDims(), motion = P.rm > 0 && P.rmSpeed > 0;
  $('expInfo').textContent = `${w} × ${h} px, same framing as your view.` + (motion ? ` MP4 is one ${P.loopLen}s loop.` : ' MP4 needs Random motion and Motion speed above 0.');
  $('expMp4').disabled = !exporting && !motion;
  $('expPng').disabled = exporting;
}
$('expRes').onchange = expUI;
const mkCanvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
function frameInto(c, ctx) { ctx.setTransform(c.width / width, 0, 0, c.height / height, 0, 0); renderView(ctx); }
async function saveFile(name, data) {
  const dl = (window.claude && window.claude.use) ? await claude.use('downloads') : null;
  if (dl) { // inside Claude: uses its save prompt
    try { await dl.save({filename: name, data}); say(`Saved ${name}.`); }
    catch (e) { say(e && e.code === 'declined' ? 'Save cancelled.' : `Could not save (${(e && (e.code || e.message)) || 'unknown error'}).`); }
    return;
  }
  const a = document.createElement('a'); // normal browser download (GitHub Pages, local file)
  a.href = URL.createObjectURL(data); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  say(`Saved ${name}.`);
}
function endExport(keepMt, keepAmt) {
  mt = keepMt; ptr.amt = keepAmt; expPD = 0; dirty = true; exporting = false;
  $('expMp4').textContent = 'Save MP4'; $('expProg').hidden = true;
  syncLoop(); redraw(); expUI();
}
$('expPng').onclick = async () => {
  if (exporting) return;
  const [w, h] = expDims(), keepMt = mt, keepAmt = ptr.amt;
  exporting = true; noLoop(); ptr.amt = 0; say('Rendering…'); expUI();
  try {
    expPD = w / width; dirty = true;
    const c = mkCanvas(w, h); frameInto(c, c.getContext('2d'));
    const blob = await new Promise(r => c.toBlob(r, 'image/png'));
    if (!blob) throw new Error('could not create the image');
    await saveFile('slice.png', blob);
  } catch (e) { say('Export failed: ' + (e.message || e)); }
  endExport(keepMt, keepAmt);
};
let expCancel = false;
$('expMp4').onclick = async () => {
  if (exporting) { expCancel = true; return; }
  if (typeof VideoEncoder === 'undefined' || !window.Mp4Muxer) { say('MP4 export needs a browser with WebCodecs (recent Chrome, Edge or Safari).'); return; }
  const [w, h] = expDims(), N = Math.round(P.loopLen * FPS);
  let cfg = null;
  for (const codec of ['avc1.640033', 'avc1.64002A', 'avc1.640028', 'avc1.4d0028']) {
    try { const r = await VideoEncoder.isConfigSupported({codec, width: w, height: h, bitrate: Math.round(w * h * FPS * 0.1), framerate: FPS}); if (r.supported) { cfg = r.config; break; } } catch { /* try the next codec */ }
  }
  if (!cfg) { say(`This browser cannot encode ${w} × ${h} H.264. Try a lower resolution.`); return; }
  const keepMt = mt, keepAmt = ptr.amt;
  exporting = true; expCancel = false; noLoop(); ptr.amt = 0;
  $('expMp4').textContent = 'Cancel'; $('expProg').hidden = false; $('expProg').value = 0; expUI();
  let enc = null, err = null;
  try {
    const muxer = new Mp4Muxer.Muxer({target: new Mp4Muxer.ArrayBufferTarget(), video: {codec: 'avc', width: w, height: h}, fastStart: 'in-memory'});
    enc = new VideoEncoder({output: (ch, meta) => muxer.addVideoChunk(ch, meta), error: e => { err = e; }});
    enc.configure(cfg);
    expPD = w / width; dirty = true;
    const c = mkCanvas(w, h), ctx = c.getContext('2d');
    for (let i = 0; i < N && !expCancel && !err; i++) {
      mt = i / FPS; // frame i of the loop; frame N would equal frame 0
      frameInto(c, ctx);
      const vf = new VideoFrame(c, {timestamp: Math.round(i * 1e6 / FPS), duration: Math.round(1e6 / FPS)});
      enc.encode(vf, {keyFrame: i % FPS === 0}); vf.close();
      while (enc.encodeQueueSize > 6) await new Promise(r => setTimeout(r, 4));
      $('expProg').value = (i + 1) / N; say(`Rendering frame ${i + 1} of ${N}`);
      await new Promise(r => setTimeout(r));
    }
    if (expCancel) { say('Export cancelled.'); }
    else if (err) { throw err; }
    else {
      say('Finishing…'); await enc.flush(); if (err) throw err; muxer.finalize();
      await saveFile('slice.mp4', new Blob([muxer.target.buffer], {type: 'video/mp4'}));
    }
  } catch (e) { say('Export failed: ' + (e.message || e)); }
  try { if (enc && enc.state !== 'closed') enc.close(); } catch { /* already closed */ }
  expCancel = false; endExport(keepMt, keepAmt);
};

// Collapse / expand (button, or H key)
const panel = $('panel');
function showPanel(on) { panel.classList.toggle('hidden', !on); $('open').classList.toggle('show', !on); }
$('hide').onclick = () => showPanel(false);
$('open').onclick = () => showPanel(true);
addEventListener('keydown', e => {
  if (/INPUT|TEXTAREA|SELECT/.test(e.target.tagName) || e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key === 'h' || e.key === 'H') showPanel(panel.classList.contains('hidden'));
});
sync();
