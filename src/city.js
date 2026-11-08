// =============================================================
//  灰岭市：程序化城市（纯 Three.js 代码）
//  分区：市中心玻璃高楼 / 霓虹商业街 / 红砖住宅区 / 着火废墟
// =============================================================
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const rand = (a, b) => a + Math.random() * (b - a);
const randi = (a, b) => Math.floor(rand(a, b + 1));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

const FLOOR = 3.2, WIN = 2.2;
const TILE_W = WIN * 8, TILE_H = FLOOR * 8;

// ---------------------------------------------------------------- canvas textures
function canvasTex(c, { repeat = true, srgb = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.LinearMipmapLinearFilter;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
const STYLES = {
  brick:    { wall: '#7b3f31', line: '#5e2c22', frame: '#d8cbb4', glass: '#1b232c', lit: 0.22, cornice: 0x4a2a22, roof: 0x3a3634 },
  tan:      { wall: '#a88e6a', line: '#8d7552', frame: '#efe6d2', glass: '#1d252d', lit: 0.25, cornice: 0x6e5d45, roof: 0x4a4540 },
  concrete: { wall: '#7d7a74', line: '#66635e', frame: '#a9a59c', glass: '#161d26', lit: 0.3, cornice: 0x4d4b48, roof: 0x3d3d40 },
  glass:    { wall: '#24384d', line: '#1a2836', frame: '#5d7389', glass: '#0f1a26', lit: 0.28, cornice: 0x1b2532, roof: 0x2a2f36 },
  teal:     { wall: '#3f6664', line: '#2f4f4d', frame: '#cfd8cf', glass: '#18222a', lit: 0.2, cornice: 0x27403e, roof: 0x353a3a },
};
const LIT_COLORS = ['#ffd38a', '#ffe7b0', '#ffc070', '#bfe3ff', '#ff9b6b'];
function facadeTextures(style) {
  const S = STYLES[style];
  const W = 128, H = 128, cw = W / 8, ch = H / 8;
  const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d');
  const e = document.createElement('canvas'); e.width = W; e.height = H; const ex = e.getContext('2d');
  x.fillStyle = S.wall; x.fillRect(0, 0, W, H); ex.fillStyle = '#000'; ex.fillRect(0, 0, W, H);
  if (style === 'brick' || style === 'tan') {
    x.fillStyle = S.line;
    for (let yy = 0; yy < H; yy += 3) { x.fillRect(0, yy, W, 1); for (let xx = (yy / 3) % 2 ? 0 : 3; xx < W; xx += 6) x.fillRect(xx, yy, 1, 3); }
  }
  if (style === 'concrete') { x.fillStyle = S.line; for (let yy = 0; yy < H; yy += ch) x.fillRect(0, yy + ch - 2, W, 2); }
  // grime
  for (let i = 0; i < 220; i++) { x.fillStyle = `rgba(0,0,0,${Math.random() * 0.18})`; x.fillRect(randi(0, W), randi(0, H), randi(1, 4), randi(2, 10)); }
  for (let fy = 0; fy < 8; fy++) for (let fx = 0; fx < 8; fx++) {
    const wx = fx * cw, wy = fy * ch;
    if (style === 'glass') {
      x.fillStyle = S.glass; x.fillRect(wx + 1, wy + 1, cw - 1, ch - 2);
      x.fillStyle = S.frame; x.fillRect(wx, wy, 1, ch); x.fillRect(wx, wy + ch - 1, cw, 1);
    } else {
      x.fillStyle = S.frame; x.fillRect(wx + 3, wy + 3, cw - 6, ch - 5);
      x.fillStyle = S.glass; x.fillRect(wx + 4, wy + 4, cw - 8, ch - 7);
      x.fillStyle = 'rgba(0,0,0,0.35)'; x.fillRect(wx + 3, wy + ch - 2, cw - 6, 1);
    }
    const r = Math.random();
    const inset = style === 'glass' ? [wx + 1, wy + 1, cw - 1, ch - 2] : [wx + 4, wy + 4, cw - 8, ch - 7];
    if (r < S.lit) {
      const col = pick(LIT_COLORS);
      x.fillStyle = col; x.fillRect(...inset); ex.fillStyle = col; ex.fillRect(...inset);
      // curtains / silhouettes
      if (Math.random() < 0.5) { x.fillStyle = 'rgba(40,20,10,0.55)'; x.fillRect(inset[0], inset[1], inset[2] * rand(0.2, 0.5), inset[3]); ex.fillStyle = '#000'; ex.fillRect(inset[0], inset[1], inset[2] * 0.3, inset[3]); }
    } else if (r > 0.93 && style !== 'glass') {
      x.fillStyle = '#050505'; x.fillRect(...inset); // broken
      x.strokeStyle = '#8fa3b5'; x.beginPath(); x.moveTo(inset[0], inset[1]); x.lineTo(inset[0] + inset[2], inset[1] + inset[3]); x.stroke();
    } else if (Math.random() < 0.4) { x.fillStyle = 'rgba(120,150,180,0.18)'; x.fillRect(inset[0], inset[1], inset[2] / 2, inset[3] / 3); }
  }
  return { map: canvasTex(c), emissive: canvasTex(e) };
}
const FACADES = {};
for (const s of Object.keys(STYLES)) FACADES[s] = [facadeTextures(s), facadeTextures(s)];

function storefrontTex() {
  const c = document.createElement('canvas'); c.width = 64; c.height = 32; const x = c.getContext('2d');
  const e = document.createElement('canvas'); e.width = 64; e.height = 32; const ex = e.getContext('2d');
  x.fillStyle = '#2a2622'; x.fillRect(0, 0, 64, 32); ex.fillStyle = '#000'; ex.fillRect(0, 0, 64, 32);
  const lit = Math.random() < 0.7, col = pick(['#ffd28a', '#ffefc8', '#9ee6ff', '#ffb0d0']);
  x.fillStyle = '#5b5148'; x.fillRect(2, 6, 60, 24);
  for (const [px, pw] of [[4, 22], [38, 22]]) { x.fillStyle = lit ? col : '#141a20'; x.fillRect(px, 9, pw, 19); if (lit) { ex.fillStyle = col; ex.fillRect(px, 9, pw, 19); } x.fillStyle = 'rgba(0,0,0,0.4)'; x.fillRect(px + pw / 2, 9, 1, 19); }
  x.fillStyle = '#1a1512'; x.fillRect(28, 12, 8, 18);
  if (Math.random() < 0.35) { x.fillStyle = '#3a3a3e'; for (let yy = 9; yy < 28; yy += 2) x.fillRect(4, yy, 56, 1); } // roll shutter
  return { map: canvasTex(c), emissive: canvasTex(e) };
}
const STOREFRONTS = Array.from({ length: 5 }, storefrontTex);

const signCache = new Map();
function signTex(text, color, vertical = false) {
  const key = text + color + vertical;
  if (signCache.has(key)) return signCache.get(key);
  const c = document.createElement('canvas');
  if (vertical) { c.width = 32; c.height = 32 * text.length; } else { c.width = Math.max(96, text.length * 22); c.height = 32; }
  const x = c.getContext('2d');
  x.fillStyle = '#0d0b0e'; x.fillRect(0, 0, c.width, c.height);
  x.strokeStyle = color; x.lineWidth = 2; x.strokeRect(2, 2, c.width - 4, c.height - 4);
  x.fillStyle = color; x.font = 'bold 22px "Arial Black", Impact, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
  if (vertical) [...text].forEach((ch, i) => x.fillText(ch, 16, 16 + i * 32)); else x.fillText(text, c.width / 2, 17);
  const t = canvasTex(c, { repeat: false }); t.minFilter = THREE.LinearFilter;
  const res = { tex: t, aspect: c.width / c.height }; signCache.set(key, res); return res;
}
const NEON = ['#ff3a8c', '#33e1ff', '#ffcf3a', '#7dff6a', '#b06bff', '#ff5a3a'];
const SHOP_NAMES = ['DINER', 'LIQUOR', 'PAWN', 'PHARMACY', 'BAR', 'LAUNDRY', '24 HR', 'DONUTS', 'PIZZA', 'MOTEL', 'GUNS', 'TATTOO', 'BOWLING', 'CINEMA'];
const VERT_NAMES = ['HOTEL', 'BAR', 'PAWN', 'OPEN', 'EATS', 'CLUB'];
const BILLBOARDS = [['EVACUATE NOW', '#ff4a3a'], ['GRIZZLY COLA', '#ffcf3a'], ['STAY INDOORS', '#33e1ff'], ['UMBRA PHARMA', '#7dff6a'], ['灰岭电台 FM98', '#ff3a8c']];

function awningTex(color) {
  const c = document.createElement('canvas'); c.width = 32; c.height = 8; const x = c.getContext('2d');
  for (let i = 0; i < 8; i++) { x.fillStyle = i % 2 ? '#e9e2d0' : color; x.fillRect(i * 4, 0, 4, 8); }
  x.fillStyle = 'rgba(0,0,0,0.25)'; x.fillRect(0, 6, 32, 2);
  return canvasTex(c);
}
function roofTex() {
  const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
  x.fillStyle = '#5a5751'; x.fillRect(0, 0, 64, 64);
  for (let i = 0; i < 500; i++) { x.fillStyle = `rgba(${Math.random() < 0.5 ? '20,20,20' : '140,135,125'},${Math.random() * 0.35})`; x.fillRect(randi(0, 63), randi(0, 63), 1, 1); }
  for (let i = 0; i < 6; i++) { x.fillStyle = 'rgba(25,25,28,0.45)'; x.fillRect(randi(0, 50), randi(0, 50), randi(6, 18), randi(4, 14)); }
  x.strokeStyle = 'rgba(30,30,30,0.5)'; for (let i = 0; i < 64; i += 16) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, 64); x.stroke(); }
  return canvasTex(c);
}
const ROOF_TEX = roofTex();
const AWNINGS = ['#b3262c', '#1f6a4a', '#23508c', '#c07a18', '#6b2a6e'].map(awningTex);

// ---------------------------------------------------------------- geometry helpers
function box(w, h, d, x = 0, y = 0, z = 0, ry = 0) {
  const g = new THREE.BoxGeometry(w, h, d); if (ry) g.rotateY(ry); g.translate(x, y, z); return g;
}
function cyl(rt, rb, h, seg, x = 0, y = 0, z = 0) { const g = new THREE.CylinderGeometry(rt, rb, h, seg); g.translate(x, y, z); return g; }
function merged(geos, mat) { const m = new THREE.Mesh(mergeGeometries(geos.map((g) => g.index ? g : g)), mat); m.castShadow = true; m.receiveShadow = true; return m; }
const L = (color, extra = {}) => new THREE.MeshLambertMaterial({ color, ...extra });

// ---------------------------------------------------------------- main builder
export function buildCity(ctx) {
  const { scene, cityGroup, buildings, LINES, N, ROAD, HALF } = ctx;
  const animated = []; // {update(dt,t)}
  let lightBudget = 12;
  const addLight = (color, intensity, dist, x, y, z, flicker = 0) => {
    if (lightBudget <= 0) return null; lightBudget--;
    const p = new THREE.PointLight(color, intensity, dist, 1.4); p.position.set(x, y, z); cityGroup.add(p);
    if (flicker) { const base = intensity; animated.push({ update(dt, t) { p.intensity = base * (0.75 + 0.25 * Math.sin(t * 13 + x) * Math.sin(t * 7.3 + z)); } }); }
    return p;
  };

  // ---------- sky dome (city glow at horizon)
  const sky = new THREE.Mesh(new THREE.SphereGeometry(380, 24, 12), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color(0x05070d) }, mid: { value: new THREE.Color(0x141c2c) }, glow: { value: new THREE.Color(0x4a2a2a) } },
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform vec3 top; uniform vec3 mid; uniform vec3 glow; varying vec3 vP; void main(){ float h = normalize(vP).y; vec3 c = mix(glow, mid, smoothstep(-0.02, 0.12, h)); c = mix(c, top, smoothstep(0.12, 0.6, h)); gl_FragColor = vec4(c,1.0); }',
  }));
  scene.add(sky);

  // ---------- ground: roads (wet) + sidewalks
  const S = 1024, span = HALF * 2 + 40, k = S / span;
  const tc = (v) => (v + HALF + 20) * k;
  const rc = document.createElement('canvas'); rc.width = rc.height = S; const r = rc.getContext('2d');
  const rough = document.createElement('canvas'); rough.width = rough.height = 256; const rr = rough.getContext('2d');
  r.fillStyle = '#26272b'; r.fillRect(0, 0, S, S);
  for (let i = 0; i < 9000; i++) { r.fillStyle = `rgba(${Math.random() < 0.5 ? '0,0,0' : '120,115,105'},${Math.random() * 0.12})`; r.fillRect(Math.random() * S, Math.random() * S, randi(1, 3), randi(1, 3)); }
  // lane markings
  for (const Lx of LINES) for (let p = -HALF - 20; p < HALF + 20; p += 5) {
    r.fillStyle = '#c9a43a'; r.fillRect(tc(Lx) - 1.5, tc(p), 3, 2.4 * k); r.fillRect(tc(p), tc(Lx) - 1.5, 2.4 * k, 3);
  }
  // crosswalks
  // clear lane lines inside intersections, then zebra stripes on the four arms
  for (const a of LINES) for (const b of LINES) { r.fillStyle = '#26272b'; r.fillRect(tc(a - ROAD / 2), tc(b - ROAD / 2), ROAD * k, ROAD * k); }
  r.fillStyle = 'rgba(205,205,198,0.85)';
  for (const a of LINES) for (const b of LINES) for (const s of [-1, 1]) {
    for (let i = -ROAD / 2 + 0.5; i < ROAD / 2 - 0.3; i += 1.1) {
      r.fillRect(tc(a + i), tc(b + s * (ROAD / 2 + 0.3) - (s < 0 ? 2 : 0)), 0.55 * k, 2 * k);   // across vertical road
      r.fillRect(tc(b + s * (ROAD / 2 + 0.3) - (s < 0 ? 2 : 0)), tc(a + i), 2 * k, 0.55 * k);   // across horizontal road
    }
  }
  // cracks & patches
  for (let i = 0; i < 80; i++) { r.strokeStyle = 'rgba(10,10,10,0.6)'; r.lineWidth = 1; r.beginPath(); let px = Math.random() * S, py = Math.random() * S; r.moveTo(px, py); for (let j = 0; j < 5; j++) { px += rand(-12, 12); py += rand(-12, 12); r.lineTo(px, py); } r.stroke(); }
  for (let i = 0; i < 30; i++) { r.fillStyle = 'rgba(20,20,22,0.7)'; r.fillRect(Math.random() * S, Math.random() * S, rand(10, 40), rand(8, 30)); }
  // roughness: wet with puddles (low = glossy)
  rr.fillStyle = '#7a7a7a'; rr.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 70; i++) { rr.fillStyle = '#121212'; rr.beginPath(); rr.ellipse(Math.random() * 256, Math.random() * 256, rand(3, 12), rand(2, 6), rand(0, 3), 0, 7); rr.fill(); }
  const roadMat = new THREE.MeshStandardMaterial({ map: canvasTex(rc, { repeat: false }), roughnessMap: canvasTex(rough, { repeat: false, srgb: false }), roughness: 1, metalness: 0.15, envMapIntensity: 1.4 });
  const roads = new THREE.Mesh(new THREE.PlaneGeometry(span, span), roadMat); roads.rotation.x = -Math.PI / 2; roads.receiveShadow = true; cityGroup.add(roads);
  const outer = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), L(0x101216)); outer.rotation.x = -Math.PI / 2; outer.position.y = -0.05; cityGroup.add(outer);

  // sidewalk tile texture
  const sw = document.createElement('canvas'); sw.width = sw.height = 32; const s2 = sw.getContext('2d');
  s2.fillStyle = '#5c5b58'; s2.fillRect(0, 0, 32, 32); s2.fillStyle = '#4a4946'; s2.fillRect(0, 15, 32, 1); s2.fillRect(15, 0, 1, 32);
  for (let i = 0; i < 40; i++) { s2.fillStyle = `rgba(0,0,0,${Math.random() * 0.2})`; s2.fillRect(randi(0, 31), randi(0, 31), 2, 2); }
  const swTex = canvasTex(sw);
  const curbMat = L(0x7a7873);

  // ---------- districts
  const centerIdx = (N - 1) / 2;
  const commercialRow = Math.floor(N / 2); // a neon strip along this road line
  const ruinsBlock = [N - 1, 0];
  const zoneOf = (i, j) => {
    if (i === ruinsBlock[0] && j === ruinsBlock[1]) return 'ruins';
    const d = Math.max(Math.abs(i - centerIdx), Math.abs(j - centerIdx));
    if (d < 1.1) return 'downtown';
    if (j === commercialRow || j === commercialRow - 1) return 'commercial';
    return 'residential';
  };

  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    const bx0 = LINES[i] + ROAD / 2, bx1 = LINES[i + 1] - ROAD / 2;
    const bz0 = LINES[j] + ROAD / 2, bz1 = LINES[j + 1] - ROAD / 2;
    const t = swTex.clone(); t.needsUpdate = true; t.repeat.set((bx1 - bx0) / 3, (bz1 - bz0) / 3);
    const slab = new THREE.Mesh(new THREE.BoxGeometry(bx1 - bx0, 0.18, bz1 - bz0), [curbMat, curbMat, new THREE.MeshLambertMaterial({ map: t }), curbMat, curbMat, curbMat]);
    slab.position.set((bx0 + bx1) / 2, 0.09, (bz0 + bz1) / 2); slab.receiveShadow = true; cityGroup.add(slab);
    const zone = zoneOf(i, j);
    const x0 = bx0 + 2.2, x1 = bx1 - 2.2, z0 = bz0 + 2.2, z1 = bz1 - 2.2;
    const midx = (x0 + x1) / 2, midz = (z0 + z1) / 2;
    if (zone === 'ruins') { buildRuins(x0, x1, z0, z1); continue; }
    const centerDist = Math.hypot(midx, midz);
    if (zone !== 'downtown' && Math.random() < 0.1 && centerDist > 25) { parkingLot(x0, x1, z0, z1); continue; }
    const lots = [];
    const layout = Math.random();
    if (zone === 'downtown') {
      if (layout < 0.5) lots.push([x0, x1, z0, z1]); else { lots.push([x0, midx - 0.5, z0, z1], [midx + 0.5, x1, z0, z1]); }
    } else if (layout < 0.25) lots.push([x0, x1, z0, z1]);
    else if (layout < 0.55) lots.push([x0, midx - 0.5, z0, z1], [midx + 0.5, x1, z0, z1]);
    else lots.push([x0, midx - 0.5, z0, midz - 0.5], [midx + 0.5, x1, z0, midz - 0.5], [x0, midx - 0.5, midz + 0.5, z1], [midx + 0.5, x1, midz + 0.5, z1]);
    for (const [a0, a1, c0, c1] of lots) {
      if (zone === 'downtown') {
        const style = pick(['glass', 'glass', 'concrete']);
        const h1 = rand(20, 32);
        addBuilding(a0, a1, c0, c1, 0, h1, style, { storefront: style === 'concrete', antenna: false });
        if (Math.random() < 0.75) { const ins = 2.2; const h2 = rand(8, 16); addBuilding(a0 + ins, a1 - ins, c0 + ins, c1 - ins, h1, h2, style, { antenna: true, helipad: Math.random() < 0.4 }); }
      } else if (zone === 'commercial') {
        addBuilding(a0, a1, c0, c1, 0, rand(8, 15), pick(['tan', 'brick', 'teal', 'concrete']), { storefront: true, neon: true, billboard: Math.random() < 0.35 });
      } else {
        const style = pick(['brick', 'brick', 'tan', 'teal']);
        addBuilding(a0, a1, c0, c1, 0, rand(10, 22), style, { storefront: Math.random() < 0.45, fireEscape: style === 'brick', waterTower: Math.random() < 0.5, neon: Math.random() < 0.2 });
      }
    }
  }

  // ---------------------------------------------------------------- building
  function addBuilding(x0, x1, z0, z1, base, h, style, o = {}) {
    const w = x1 - x0, d = z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const S = STYLES[style];
    const group = new THREE.Group(); group.position.set(cx, base, cz); cityGroup.add(group);
    const mats = [];
    const fac = pick(FACADES[style]);
    const mk = (rx) => { const m = fac.map.clone(), e = fac.emissive.clone(); m.needsUpdate = e.needsUpdate = true;
      const ox = Math.random(); m.repeat.set(rx, h / TILE_H); e.repeat.copy(m.repeat); m.offset.set(ox, 0); e.offset.copy(m.offset);
      const mat = new THREE.MeshLambertMaterial({ map: m, emissiveMap: e, emissive: 0xffffff, emissiveIntensity: 0.75, transparent: true }); mats.push(mat); return mat; };
    const mX = mk(d / TILE_W), mZ = mk(w / TILE_W);
    const rt = ROOF_TEX.clone(); rt.needsUpdate = true; rt.repeat.set(w / 8, d / 8);
    const roofM = new THREE.MeshLambertMaterial({ map: rt, color: new THREE.Color(S.roof).multiplyScalar(2.4), transparent: true }); mats.push(roofM);
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [mX, mX, roofM, roofM, mZ, mZ]);
    body.position.y = h / 2; body.castShadow = body.receiveShadow = true; group.add(body);
    // cornice + parapet + rooftop clutter (merged)
    const trim = []; const trimM = L(new THREE.Color(S.cornice).multiplyScalar(1.5), { transparent: true }); mats.push(trimM);
    trim.push(box(w + 0.7, 0.6, d + 0.7, 0, h - 0.3, 0));
    trim.push(box(w + 0.3, 0.9, 0.3, 0, h + 0.45, d / 2), box(w + 0.3, 0.9, 0.3, 0, h + 0.45, -d / 2), box(0.3, 0.9, d, w / 2, h + 0.45, 0), box(0.3, 0.9, d, -w / 2, h + 0.45, 0));
    if (style !== 'glass') for (let f = 1; f < h / FLOOR - 1; f += 3) trim.push(box(w + 0.25, 0.18, d + 0.25, 0, f * FLOOR, 0));
    const acCount = randi(1, 3);
    for (let a = 0; a < acCount; a++) { const aw = rand(1.4, 2.6); trim.push(box(aw, rand(0.8, 1.3), aw * 0.8, rand(-w / 3, w / 3), h + 0.6, rand(-d / 3, d / 3))); }
    if (Math.random() < 0.5) trim.push(box(1.6, 2.2, 1.6, rand(-w / 4, w / 4), h + 1.1, rand(-d / 4, d / 4))); // stair hut
    group.add(merged(trim, trimM));
    // metal bits: water tower, fire escape, antenna
    const metal = []; const metalM = L(0x24262a, { transparent: true }); mats.push(metalM);
    if (o.waterTower) {
      const wx = rand(-w / 4, w / 4), wz = rand(-d / 4, d / 4);
      for (const [lx, lz] of [[-0.9, -0.9], [0.9, -0.9], [-0.9, 0.9], [0.9, 0.9]]) metal.push(box(0.15, 2.6, 0.15, wx + lx, h + 1.3, wz + lz));
      const tank = new THREE.Mesh(cyl(1.5, 1.5, 2.6, 10, wx, h + 3.9, wz), L(0x6b4a33, { transparent: true })); mats.push(tank.material);
      const cap = new THREE.Mesh(new THREE.ConeGeometry(1.7, 1.1, 10).translate(wx, h + 5.75, wz), L(0x3b2d24, { transparent: true })); mats.push(cap.material);
      tank.castShadow = cap.castShadow = true; group.add(tank, cap);
    }
    if (o.fireEscape) {
      const side = Math.random() < 0.5 ? 1 : -1; const fz = side * (d / 2 + 0.55); const fw = Math.min(w * 0.45, 6);
      const fx = rand(-w / 4, w / 4);
      for (let f = 1; f < Math.floor(h / FLOOR); f++) {
        const y = f * FLOOR;
        metal.push(box(fw, 0.1, 1.0, fx, y, fz), box(fw, 0.6, 0.05, fx, y + 0.35, fz + side * 0.5));
        const st = new THREE.BoxGeometry(0.7, 0.08, Math.hypot(FLOOR, fw * 0.6)); st.rotateX(Math.atan2(FLOOR, fw * 0.6) * (f % 2 ? 1 : -1)); st.rotateY(Math.PI / 2); st.translate(fx, y + FLOOR / 2, fz); metal.push(st);
      }
    }
    if (o.antenna) {
      const ax = rand(-w / 5, w / 5), az = rand(-d / 5, d / 5), ah = rand(6, 12);
      metal.push(cyl(0.12, 0.2, ah, 5, ax, h + ah / 2, az), box(2, 0.1, 0.1, ax, h + ah * 0.7, az));
      const bl = new THREE.Mesh(new THREE.SphereGeometry(0.28, 6, 4), new THREE.MeshBasicMaterial({ color: 0xff2020 })); bl.position.set(ax, h + ah + 0.2, az); group.add(bl);
      const ph = Math.random() * 6; animated.push({ update(dt, t) { bl.visible = Math.sin(t * 3 + ph) > 0.2; } });
    }
    if (metal.length) group.add(merged(metal, metalM));
    if (o.helipad) {
      const hp = new THREE.Mesh(new THREE.CylinderGeometry(Math.min(w, d) * 0.32, Math.min(w, d) * 0.32, 0.12, 20), L(0x3a3d44)); hp.position.y = h + 0.06; group.add(hp);
      const hc = document.createElement('canvas'); hc.width = hc.height = 64; const hx = hc.getContext('2d'); hx.fillStyle = '#e8e2c8'; hx.font = 'bold 44px Arial'; hx.textAlign = 'center'; hx.textBaseline = 'middle'; hx.fillText('H', 32, 34); hx.strokeStyle = '#e8e2c8'; hx.lineWidth = 3; hx.beginPath(); hx.arc(32, 32, 28, 0, 7); hx.stroke();
      const hm = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(w, d) * 0.55, Math.min(w, d) * 0.55), new THREE.MeshBasicMaterial({ map: canvasTex(hc, { repeat: false }), transparent: true })); hm.rotation.x = -Math.PI / 2; hm.position.y = h + 0.14; group.add(hm);
    }
    // storefront band + awning + sign on the two street-facing sides
    if (o.storefront) {
      const sf = pick(STOREFRONTS);
      const mkS = (len) => { const m = sf.map.clone(), e = sf.emissive.clone(); m.needsUpdate = e.needsUpdate = true; m.repeat.set(Math.max(1, Math.round(len / 7)), 1); e.repeat.copy(m.repeat); const mat = new THREE.MeshLambertMaterial({ map: m, emissiveMap: e, emissive: 0xffffff, emissiveIntensity: 1.0, transparent: true }); mats.push(mat); return mat; };
      const sX = mkS(d), sZ = mkS(w), top = L(0x2a2522, { transparent: true }); mats.push(top);
      const band = new THREE.Mesh(new THREE.BoxGeometry(w + 0.3, 3.6, d + 0.3), [sX, sX, top, top, sZ, sZ]); band.position.y = 1.8; band.receiveShadow = true; group.add(band);
      const sides = [[0, d / 2, 0, w], [0, -d / 2, Math.PI, w], [w / 2, 0, Math.PI / 2, d], [-w / 2, 0, -Math.PI / 2, d]].sort(() => Math.random() - 0.5).slice(0, 2);
      for (const [sx, sz, ry, len] of sides) {
        const aw = new THREE.Mesh(new THREE.BoxGeometry(len * 0.8, 0.12, 1.6), new THREE.MeshLambertMaterial({ map: pick(AWNINGS), transparent: true })); mats.push(aw.material);
        aw.material.map = aw.material.map.clone(); aw.material.map.needsUpdate = true; aw.material.map.repeat.set(len / 3, 1);
        const nx = Math.sin(ry), nz = Math.cos(ry);
        aw.position.set(sx + nx * 0.95, 3.75, sz + nz * 0.95); aw.rotation.y = ry; aw.rotateX(0.32); aw.castShadow = true; group.add(aw);
        const name = pick(SHOP_NAMES), col = pick(NEON); const { tex, aspect } = signTex(name, col);
        const sh = 1.1, swd = Math.min(len * 0.7, sh * aspect);
        const sign = new THREE.Mesh(new THREE.PlaneGeometry(swd, sh), new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
        sign.material.color.setScalar(1.15); mats.push(sign.material);
        sign.position.set(sx + nx * 0.2, 4.7, sz + nz * 0.2); sign.rotation.y = ry; group.add(sign);
      }
    }
    if (o.neon) {
      const side = pick([[w / 2, 0, Math.PI / 2], [-w / 2, 0, -Math.PI / 2], [0, d / 2, 0], [0, -d / 2, Math.PI]]);
      const name = pick(VERT_NAMES), col = pick(NEON); const { tex } = signTex(name, col, true);
      const vh = Math.min(h - 4, name.length * 1.4);
      const nx = Math.sin(side[2]), nz = Math.cos(side[2]);
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.3, vh, vh / name.length), new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
      blade.material.color.setScalar(1.25); mats.push(blade.material);
      blade.position.set(side[0] + nx * 0.9 + (nz ? rand(-w / 3, w / 3) : 0), 5 + vh / 2, side[1] + nz * 0.9 + (nx ? rand(-d / 3, d / 3) : 0)); blade.rotation.y = side[2] + Math.PI / 2; group.add(blade);
      addLight(new THREE.Color(col), 60, 18, cx + blade.position.x + nx * 2, base + blade.position.y, cz + blade.position.z + nz * 2, Math.random() < 0.3 ? 1 : 0);
      if (Math.random() < 0.3) animated.push({ update(dt, t) { blade.visible = !(Math.sin(t * 9) > 0.92); } });
    }
    if (o.billboard) {
      const [txt, col] = pick(BILLBOARDS); const { tex, aspect } = signTex(txt, col);
      const bw = Math.min(w * 0.9, 10), bh = bw / aspect * 1.6;
      const bb = new THREE.Mesh(new THREE.PlaneGeometry(bw, bh), new THREE.MeshBasicMaterial({ map: tex, transparent: true })); bb.material.color.setScalar(1.1); mats.push(bb.material);
      bb.position.set(0, h + 2.2 + bh / 2, 0); bb.rotation.y = Math.random() < 0.5 ? 0 : Math.PI / 2; group.add(bb);
      const legs = merged([box(0.2, 2.2 + bh, 0.2, -bw / 3, h + (2.2 + bh) / 2, 0), box(0.2, 2.2 + bh, 0.2, bw / 3, h + (2.2 + bh) / 2, 0)].map((g) => { if (bb.rotation.y) g.rotateY(0); return g; }), metalM);
      legs.rotation.y = bb.rotation.y; legs.position.y = -base * 0; group.add(legs);
    }
    buildings.push({ minX: x0, maxX: x1, minZ: z0, maxZ: z1, top: base + h, base, mesh: group, mats, fade: 1 });
  }

  // ---------------------------------------------------------------- special lots
  function parkingLot(x0, x1, z0, z1) {
    const lot = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), L(0x2b2c30)); lot.rotation.x = -Math.PI / 2; lot.position.set((x0 + x1) / 2, 0.19, (z0 + z1) / 2); cityGroup.add(lot);
    const lines = []; for (let x = x0 + 1; x < x1 - 1; x += 3) lines.push(box(0.12, 0.02, 4, x, 0.2, z0 + 2.5), box(0.12, 0.02, 4, x, 0.2, z1 - 2.5));
    cityGroup.add(merged(lines, L(0xbdbab0)));
    ctx.parkingSpots.push(...Array.from({ length: 4 }, () => new THREE.Vector3(rand(x0 + 2, x1 - 2), 0, Math.random() < 0.5 ? z0 + 2.5 : z1 - 2.5)));
  }
  function buildRuins(x0, x1, z0, z1) {
    const rubbleM = L(0x4b4642), charM = L(0x1c1a19);
    const parts = [];
    for (let i = 0; i < 40; i++) { const g = new THREE.BoxGeometry(rand(0.8, 3), rand(0.5, 2), rand(0.8, 3)); g.rotateY(rand(0, 3)); g.rotateX(rand(-0.4, 0.4)); g.translate(rand(x0, x1), rand(0.2, 1), rand(z0, z1)); parts.push(g); }
    cityGroup.add(merged(parts, rubbleM));
    // broken shells of buildings (climbable, low)
    const shells = [[x0, x0 + 7, z0, z0 + 9, 9], [x1 - 8, x1, z1 - 7, z1, 6]];
    for (const [a0, a1, c0, c1, h] of shells) addBuilding(a0, a1, c0, c1, 0, h, 'concrete', { });
    const steel = []; for (let i = 0; i < 8; i++) { const g = new THREE.BoxGeometry(0.3, rand(3, 7), 0.3); g.rotateZ(rand(-0.6, 0.6)); g.translate(rand(x0, x1), 2, rand(z0, z1)); steel.push(g); }
    cityGroup.add(merged(steel, charM));
    for (let i = 0; i < 4; i++) { const p = new THREE.Vector3(rand(x0 + 2, x1 - 2), 0, rand(z0 + 2, z1 - 2)); ctx.fireSpots.push(p); }
    // police barricade line around the ruins
    ctx.barricadeSpots.push(new THREE.Vector3((x0 + x1) / 2, 0, z1 + 4), new THREE.Vector3(x0 - 4, 0, (z0 + z1) / 2));
  }

  // ---------------------------------------------------------------- street furniture
  const postGeos = [], headGeos = [], coneGeos = [], tlGeos = [], hydrantGeos = [], benchGeos = [], binGeos = [];
  const lampPositions = [];
  for (let i = 0; i < LINES.length; i++) for (let j = 0; j < N; j++) {
    for (let p = 0.25; p < 1; p += 0.5) {
      const along = LINES[j] + ROAD / 2 + 1 + p * (LINES[j + 1] - LINES[j] - ROAD - 2);
      for (const side of [-1, 1]) {
        if (Math.random() < 0.35) continue;
        const off = LINES[i] + side * (ROAD / 2 + 0.7);
        const vertical = Math.random() < 0.5;
        const [x, z] = vertical ? [off, along] : [along, off];
        if (Math.abs(x) > HALF + 1 || Math.abs(z) > HALF + 1) continue;
        const ax = vertical ? -side : 0, az = vertical ? 0 : -side;
        postGeos.push(cyl(0.1, 0.16, 6.5, 5, x, 3.25, z), box(Math.abs(ax) * 1.6 + 0.12, 0.12, Math.abs(az) * 1.6 + 0.12, x + ax * 0.8, 6.4, z + az * 0.8));
        headGeos.push(box(0.7, 0.18, 0.4, x + ax * 1.5, 6.3, z + az * 1.5));
        const cg = new THREE.PlaneGeometry(7, 7); cg.rotateX(-Math.PI / 2); cg.translate(x + ax * 1.5, 0.22, z + az * 1.5); coneGeos.push(cg);
        lampPositions.push(new THREE.Vector3(x + ax * 1.5, 6, z + az * 1.5));
        if (Math.random() < 0.15) hydrantGeos.push(cyl(0.22, 0.25, 0.8, 6, x + az * 2, 0.55, z + ax * 2), cyl(0.28, 0.28, 0.12, 6, x + az * 2, 0.95, z + ax * 2));
        if (Math.random() < 0.12) binGeos.push(cyl(0.35, 0.3, 1.0, 7, x + az * 3, 0.68, z + ax * 3));
        if (Math.random() < 0.1) { const g = box(vertical ? 0.5 : 2, 0.12, vertical ? 2 : 0.5, x + az * 4, 0.65, z + ax * 4); benchGeos.push(g, box(vertical ? 0.1 : 2, 0.6, vertical ? 2 : 0.1, x + az * 4 - (vertical ? side * 0.25 : 0), 0.95, z + ax * 4 - (vertical ? 0 : side * 0.25))); }
      }
    }
  }
  if (postGeos.length) cityGroup.add(merged(postGeos, L(0x2b2e33)));
  const headM = new THREE.MeshBasicMaterial({ color: 0xffd9a0 }); headM.color.multiplyScalar(1.4);
  if (headGeos.length) cityGroup.add(new THREE.Mesh(mergeGeometries(headGeos), headM));
  if (coneGeos.length) {
    const pc = document.createElement('canvas'); pc.width = pc.height = 64; const px = pc.getContext('2d'); const gr = px.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,190,120,0.55)'); gr.addColorStop(0.5, 'rgba(255,160,90,0.18)'); gr.addColorStop(1, 'rgba(255,140,80,0)'); px.fillStyle = gr; px.fillRect(0, 0, 64, 64);
    const cone = new THREE.Mesh(mergeGeometries(coneGeos), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(pc), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    cityGroup.add(cone);
  }
  if (hydrantGeos.length) cityGroup.add(merged(hydrantGeos, L(0xb3261e)));
  if (binGeos.length) cityGroup.add(merged(binGeos, L(0x2f4a35)));
  if (benchGeos.length) cityGroup.add(merged(benchGeos, L(0x5a4330)));
  // a few real lights near the middle, the rest is glow
  lampPositions.sort((a, b) => a.length() - b.length()).slice(0, 7).forEach((p) => addLight(0xffb070, 80, 26, p.x, p.y - 0.4, p.z));

  // traffic lights at intersections
  const tlMats = [new THREE.MeshBasicMaterial({ color: 0xff2a2a }), new THREE.MeshBasicMaterial({ color: 0xffc22a }), new THREE.MeshBasicMaterial({ color: 0x2aff6a })];
  const tlBulbs = [[], [], []];
  for (let i = 0; i < LINES.length; i++) for (let j = 0; j < LINES.length; j++) {
    if (Math.random() < 0.4) continue;
    const x = LINES[i] + ROAD / 2 + 0.6, z = LINES[j] - ROAD / 2 - 0.6;
    if (Math.abs(x) > HALF || Math.abs(z) > HALF) continue;
    tlGeos.push(cyl(0.12, 0.14, 5.5, 5, x, 2.75, z), box(0.12, 0.12, 3.4, x, 5.4, z + 1.7), box(0.5, 1.5, 0.45, x, 4.8, z + 3.3));
    for (let k = 0; k < 3; k++) { const g = new THREE.SphereGeometry(0.16, 6, 4); g.translate(x - 0.26, 5.3 - k * 0.45, z + 3.3); tlBulbs[k].push(g); }
  }
  if (tlGeos.length) cityGroup.add(merged(tlGeos, L(0x1e2024)));
  const tlMeshes = tlBulbs.map((gs, k) => { if (!gs.length) return null; const m = new THREE.Mesh(mergeGeometries(gs), tlMats[k]); cityGroup.add(m); return m; });
  animated.push({ update(dt, t) { const phase = Math.floor(t / 3) % 3; tlMeshes.forEach((m, k) => { if (m) m.material.color.setScalar(0).add(new THREE.Color([0xff2a2a, 0xffc22a, 0x2aff6a][k]).multiplyScalar(k === [0, 2, 1][phase] ? 2.5 : 0.12)); }); } });

  // ---------- distant skyline silhouettes
  const skyGeos = [];
  for (let i = 0; i < 70; i++) {
    const a = (i / 70) * Math.PI * 2 + rand(-0.03, 0.03), rad = rand(HALF + 45, HALF + 120), w = rand(8, 18), h = rand(18, 75);
    skyGeos.push(box(w, h, w, Math.cos(a) * rad, h / 2, Math.sin(a) * rad));
  }
  const skyFac = FACADES.glass[0];
  const skyMat = new THREE.MeshLambertMaterial({ color: 0x3a4250, map: skyFac.map.clone(), emissiveMap: skyFac.emissive.clone(), emissive: 0xffffff, emissiveIntensity: 0.5 });
  skyMat.map.needsUpdate = skyMat.emissiveMap.needsUpdate = true; skyMat.map.repeat.set(0.6, 2.5); skyMat.emissiveMap.repeat.copy(skyMat.map.repeat);
  cityGroup.add(new THREE.Mesh(mergeGeometries(skyGeos), skyMat));

  // ---------- smoke columns (from ruins + some rooftops)
  const smokeTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 32; const x = c.getContext('2d'); const g = x.createRadialGradient(16, 16, 0, 16, 16, 16); g.addColorStop(0, 'rgba(60,60,64,0.9)'); g.addColorStop(1, 'rgba(40,40,44,0)'); x.fillStyle = g; x.fillRect(0, 0, 32, 32); return new THREE.CanvasTexture(c); })();
  function smokeColumn(pos, scale = 1) {
    const n = 26, geo = new THREE.BufferGeometry(), arr = new Float32Array(n * 3), seed = Array.from({ length: n }, () => [Math.random(), rand(-1, 1), rand(-1, 1)]);
    geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ map: smokeTex, size: 7 * scale, transparent: true, depthWrite: false, opacity: 0.55, color: 0x707078 }));
    pts.frustumCulled = false; cityGroup.add(pts);
    animated.push({ update(dt) { for (let i = 0; i < n; i++) { const s = seed[i]; s[0] = (s[0] + dt * 0.06) % 1; const y = s[0] * 40 * scale; arr[i * 3] = pos.x + s[1] * (1 + y * 0.25) + y * 0.35; arr[i * 3 + 1] = pos.y + y; arr[i * 3 + 2] = pos.z + s[2] * (1 + y * 0.25); } geo.attributes.position.needsUpdate = true; } });
  }
  ctx.fireSpots.forEach((p, i) => { if (i < 2) smokeColumn(p, 1.2); addLight(0xff6a20, 120, 22, p.x, 2.5, p.z, 1); });
  // a burning window floor in a couple of residential buildings
  const burnCandidates = buildings.filter((b) => b.base === 0 && b.top > 12 && b.top < 26).sort(() => Math.random() - 0.5).slice(0, 2);
  for (const b of burnCandidates) {
    const p = new THREE.Vector3((b.minX + b.maxX) / 2, b.top, (b.minZ + b.maxZ) / 2);
    ctx.fireSpots.push(p.clone()); smokeColumn(p, 1); addLight(0xff5a1a, 140, 28, p.x, p.y + 2, p.z, 1);
  }

  return { update(dt, t) { for (const a of animated) a.update(dt, t); } };
}
