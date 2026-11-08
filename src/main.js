import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { buildCity as buildCityScene } from './city.js';
import { GAME, PLAYER, WAVES, CIVILIANS, POLICE, HELI, MODELS } from './config.js';

// ---------------------------------------------------------------- utils
const rand = (a, b) => a + Math.random() * (b - a);
const randi = (a, b) => Math.floor(rand(a, b + 1));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const $ = (id) => document.getElementById(id);
const V3 = THREE.Vector3;
const tmpV = new V3(), tmpV2 = new V3(), tmpQ = new THREE.Quaternion();

// ---------------------------------------------------------------- renderer
const canvas = $('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

const scene = new THREE.Scene();
const FOG = 0x161d2b;
scene.background = new THREE.Color(FOG);
scene.fog = new THREE.Fog(FOG, 55, 230);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.35;

const camera = new THREE.PerspectiveCamera(55, 1, 0.5, 400);
let pixelScale = GAME.pixelScale;
try { const q = new URLSearchParams(location.search).get('px'); if (q) pixelScale = clamp(+q, 1, 6); } catch (e) {}
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.5, 0.45, 0.88);
composer.addPass(bloom);
composer.addPass(new OutputPass());
function resize() {
  const w = innerWidth, h = innerHeight;
  if (pixelScale <= 1) { const dpr = Math.min(devicePixelRatio, 1.5); renderer.setPixelRatio(dpr); renderer.setSize(w, h, false); composer.setPixelRatio(dpr); composer.setSize(w, h); }
  else { const cw = Math.max(1, Math.floor(w / pixelScale)), ch = Math.max(1, Math.floor(h / pixelScale)); renderer.setPixelRatio(1); renderer.setSize(cw, ch, false); composer.setPixelRatio(1); composer.setSize(cw, ch); }
  camera.aspect = w / h; camera.updateProjectionMatrix();
}
addEventListener('resize', resize); resize();

// ---------------------------------------------------------------- lights
scene.add(new THREE.HemisphereLight(0x7d8fb5, 0x2a2420, 1.7));
const moon = new THREE.DirectionalLight(0xb0c4ff, 1.7);
moon.castShadow = true;
moon.shadow.mapSize.set(1024, 1024);
Object.assign(moon.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 1, far: 160 });
moon.shadow.bias = -0.0008;
scene.add(moon, moon.target);

// ---------------------------------------------------------------- audio (synth, no files)
const Sfx = (() => {
  let ctx = null, master = null, noiseBuf = null, muted = false, sirenNode = null, heliNode = null;
  function init() {
    if (ctx) return;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain(); master.gain.value = 0.55; master.connect(ctx.destination);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    } catch (e) { ctx = null; }
  }
  function noise(dur, freq, q, vol, type = 'lowpass', sweepTo) {
    if (!ctx || muted) return;
    const s = ctx.createBufferSource(); s.buffer = noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, ctx.currentTime + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(vol, ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    s.connect(f); f.connect(g); g.connect(master); s.start(); s.stop(ctx.currentTime + dur + 0.05);
  }
  function tone(freq, dur, vol, type = 'sine', to) {
    if (!ctx || muted) return;
    const o = ctx.createOscillator(); o.type = type; o.frequency.value = freq;
    if (to) o.frequency.exponentialRampToValueAtTime(to, ctx.currentTime + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(vol, ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    o.connect(g); g.connect(master); o.start(); o.stop(ctx.currentTime + dur + 0.05);
  }
  function loop(kind) {
    if (!ctx) return null;
    const g = ctx.createGain(); g.gain.value = 0; g.connect(master);
    if (kind === 'siren') {
      const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = 700;
      const lfo = ctx.createOscillator(); lfo.frequency.value = 0.9; const lg = ctx.createGain(); lg.gain.value = 180;
      lfo.connect(lg); lg.connect(o.frequency);
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1400;
      o.connect(f); f.connect(g); o.start(); lfo.start();
    } else {
      const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 260;
      const am = ctx.createGain(); am.gain.value = 0.6;
      const lfo = ctx.createOscillator(); lfo.type = 'square'; lfo.frequency.value = 13; const lg = ctx.createGain(); lg.gain.value = 0.4;
      lfo.connect(lg); lg.connect(am.gain);
      s.connect(f); f.connect(am); am.connect(g); s.start(); lfo.start();
    }
    return g;
  }
  return {
    init,
    get muted() { return muted; },
    toggle() { muted = !muted; if (master) master.gain.value = muted ? 0 : 0.55; return muted; },
    eat() { noise(0.35, 900, 6, 0.9, 'lowpass', 120); tone(160, 0.25, 0.35, 'sawtooth', 50); },
    shot(vol = 0.3) { noise(0.12, 2200, 0.8, vol, 'bandpass'); },
    boom() { noise(1.4, 1200, 0.7, 1.4, 'lowpass', 40); tone(70, 0.9, 0.7, 'sine', 25); },
    jump() { tone(140, 0.25, 0.25, 'triangle', 320); },
    hit() { noise(0.08, 500, 2, 0.35, 'bandpass'); },
    bump() { tone(90, 0.18, 0.3, 'square', 60); },
    alert() { tone(520, 0.18, 0.25, 'square'); setTimeout(() => tone(760, 0.3, 0.25, 'square'), 180); },
    setLoops(siren, heli) {
      if (!ctx) return;
      if (!sirenNode) sirenNode = loop('siren');
      if (!heliNode) heliNode = loop('heli');
      const t = ctx.currentTime;
      sirenNode && sirenNode.gain.setTargetAtTime(muted ? 0 : siren * 0.05, t, 0.3);
      heliNode && heliNode.gain.setTargetAtTime(muted ? 0 : heli * 0.5, t, 0.3);
    },
  };
})();

// ---------------------------------------------------------------- models (Hi3D GLB, optional)
const templates = {};
async function loadModels() {
  let ids = [];
  try { const r = await fetch('assets/models/manifest.json', { cache: 'no-store' }); if (r.ok) ids = await r.json(); } catch (e) {}
  const loader = new GLTFLoader(); loader.setMeshoptDecoder(MeshoptDecoder);
  // preview builds embed the GLBs as base64 (src/models-data.js); normal deploys load the .glb files
  let embedded = null;
  try { embedded = (await import('./models-data.js')).default; } catch (e) {}
  const getBuffer = async (id) => {
    if (embedded && embedded[id]) { const bin = atob(embedded[id]); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u.buffer; }
    const r = await fetch(`assets/models/${id}.glb`); if (!r.ok) throw new Error(r.status); return r.arrayBuffer();
  };
  if (embedded) ids = [...new Set([...ids, ...Object.keys(embedded)])];
  await Promise.allSettled(ids.filter((id) => MODELS[id]).map(async (id) => {
    try { const buf = await getBuffer(id); const g = await loader.parseAsync(buf, ''); templates[id] = normalizeModel(g.scene, MODELS[id]); }
    catch (err) { console.warn('model failed', id, err); }
  }));
}
function normalizeModel(root, cfg) {
  const wrap = new THREE.Group();
  wrap.add(root);
  let box = new THREE.Box3().setFromObject(root);
  let size = box.getSize(new V3());
  if (cfg.fit === 'length' && size.z > size.x) { root.rotation.y += Math.PI / 2; }
  root.rotation.y += cfg.rotY || 0;
  root.updateMatrixWorld(true);
  box = new THREE.Box3().setFromObject(root); size = box.getSize(new V3());
  let s = 1;
  if (cfg.fit === 'height') s = cfg.value / size.y;
  else if (cfg.fit === 'length') s = cfg.value / Math.max(size.x, size.z);
  else s = cfg.value / Math.max(size.x, size.y, size.z);
  root.scale.multiplyScalar(s);
  root.updateMatrixWorld(true);
  box = new THREE.Box3().setFromObject(root);
  const c = box.getCenter(new V3());
  root.position.x -= c.x; root.position.z -= c.z;
  root.position.y -= cfg.fit === 'size' ? c.y : box.min.y;
  root.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true; o.receiveShadow = true;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach((m) => { if (m.map) { m.map.magFilter = THREE.NearestFilter; m.map.needsUpdate = true; } });
    }
  });
  return wrap;
}
const fromTemplate = (id) => (templates[id] ? templates[id].clone(true) : null);

// ---------------------------------------------------------------- materials
const M = (color, extra = {}) => new THREE.MeshLambertMaterial({ color, flatShading: true, ...extra });
const MAT = {
  skin: [M(0xc99a7a), M(0x8d5d3f), M(0xe2b99a)],
  jacket: [M(0x4a5560), M(0x6b3b2e), M(0x2f4a3a), M(0x5b4a6e), M(0x7a6a50)],
  pants: [M(0x23262d), M(0x2f3a52), M(0x3b3127)],
  police: M(0x18233d), cap: M(0x0e1428),
  carBody: [M(0x3f5a4a), M(0x6a2a26), M(0x2b3a55), M(0x8a7d5c), M(0x4b4b4f)],
  black: M(0x111216), white: M(0xd8d8d2), glass: M(0x1b2633), tire: M(0x0b0b0c),
  red: M(0xff2030, { emissive: 0xff1020, emissiveIntensity: 1 }),
  blue: M(0x2050ff, { emissive: 0x1040ff, emissiveIntensity: 1 }),
  wreck: M(0x1a1716),
  flesh: M(0x8a3a3e), fleshDark: M(0x4e1c22), fleshPale: M(0xc79b8f), tooth: M(0xe8e2cf), maw: M(0x150406),
  heli: M(0x22314f), heliWhite: M(0xc9ccd3),
  lampPost: M(0x2a2d33), bulb: new THREE.MeshBasicMaterial({ color: 0xffd28a }),
};

// ---------------------------------------------------------------- procedural meshes (used until Hi3D models arrive)
function shadowify(g) { g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } }); return g; }
function makePerson(kind) {
  const glb = fromTemplate(kind === 'police' ? 'police' : (kind === 'woman' ? 'civ_woman' : 'civ_man')) || (kind !== 'police' ? fromTemplate('civ_man') : null);
  if (glb) return glb;
  const g = new THREE.Group();
  const isCop = kind === 'police';
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.82, 0.26), isCop ? MAT.police : pick(MAT.pants)); legs.position.y = 0.41;
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.28, 0.66, 6), isCop ? MAT.police : pick(MAT.jacket)); body.position.y = 1.15;
  const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.17, 0), pick(MAT.skin)); head.position.y = 1.62;
  const armGeo = new THREE.BoxGeometry(0.12, 0.6, 0.12);
  const armL = new THREE.Mesh(armGeo, body.material); armL.position.set(-0.34, 1.12, 0); armL.rotation.z = 0.25;
  const armR = armL.clone(); armR.position.x = 0.34; armR.rotation.z = -0.25;
  g.add(legs, body, head, armL, armR);
  if (isCop) { const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.2, 0.12, 6), MAT.cap); cap.position.y = 1.78; g.add(cap); armR.rotation.x = -1.4; armR.position.z = 0.25; }
  return shadowify(g);
}
function makeCar(police) {
  const glb = fromTemplate(police ? 'police_car' : 'car');
  const g = new THREE.Group();
  let lights = null;
  if (glb) g.add(glb);
  else {
    const bodyMat = police ? MAT.black : pick(MAT.carBody);
    const body = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.75, 1.9), bodyMat); body.position.y = 0.72;
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.66, 1.72), police ? MAT.white : bodyMat); cabin.position.set(-0.2, 1.4, 0);
    const glass = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.46, 1.76), MAT.glass); glass.position.set(-0.2, 1.42, 0);
    g.add(body, cabin, glass);
    if (police) { const door = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.7, 1.94), MAT.white); door.position.set(-0.2, 0.75, 0); g.add(door); }
    const wg = new THREE.CylinderGeometry(0.42, 0.42, 0.3, 8); wg.rotateX(Math.PI / 2);
    for (const [x, z] of [[1.45, 0.86], [1.45, -0.86], [-1.45, 0.86], [-1.45, -0.86]]) { const w = new THREE.Mesh(wg, MAT.tire); w.position.set(x, 0.42, z); g.add(w); }
  }
  if (police) {
    const box = new THREE.Box3().setFromObject(g); const top = box.max.y;
    const r = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.18, 0.7), MAT.red.clone()); r.position.set(-0.1, top + 0.02, 0.38);
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.18, 0.7), MAT.blue.clone()); b.position.set(-0.1, top + 0.02, -0.38);
    if (!glb) g.add(r, b); else { r.visible = b.visible = false; g.add(r, b); }
    lights = { r, b };
  }
  shadowify(g);
  return { mesh: g, lights };
}
function makeHeli() {
  const g = new THREE.Group();
  const glb = fromTemplate('helicopter');
  if (glb) g.add(glb);
  else {
    const body = new THREE.Mesh(new THREE.SphereGeometry(1.6, 8, 6), MAT.heli); body.scale.set(1.7, 1, 1);
    const nose = new THREE.Mesh(new THREE.SphereGeometry(1.0, 8, 6), MAT.glass); nose.position.set(2.0, -0.1, 0); nose.scale.set(1, 0.8, 0.9);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.4, 0.4), MAT.heli); tail.position.set(-4.4, 0.3, 0);
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.4, 0.15), MAT.heliWhite); fin.position.set(-6.8, 0.9, 0);
    const skidG = new THREE.BoxGeometry(4, 0.12, 0.12);
    const s1 = new THREE.Mesh(skidG, MAT.black); s1.position.set(0, -1.7, 0.9); const s2 = s1.clone(); s2.position.z = -0.9;
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.3, 3.25), MAT.heliWhite); stripe.position.set(0, -0.2, 0);
    g.add(body, nose, tail, fin, s1, s2, stripe);
  }
  const box = new THREE.Box3().setFromObject(g);
  const rotor = new THREE.Group();
  const blade = new THREE.Mesh(new THREE.BoxGeometry(12, 0.08, 0.5), MAT.black);
  const blade2 = blade.clone(); blade2.rotation.y = Math.PI / 2;
  rotor.add(blade, blade2); rotor.position.y = box.max.y + 0.15;
  g.add(rotor);
  const tailRotor = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.2, 0.06), MAT.black); tailRotor.position.set(box.min.x + 0.3, box.max.y * 0.5, 0.3);
  g.add(tailRotor);
  shadowify(g);
  return { mesh: g, rotor, tailRotor };
}

// ---------------------------------------------------------------- city
const N = GAME.mapBlocks, CELL = GAME.cell, ROAD = GAME.road, HALF = (N * CELL) / 2;
const LINES = Array.from({ length: N + 1 }, (_, i) => -HALF + i * CELL);
const buildings = [];
const SPAWN = new V3(LINES[1], 0, LINES[N - 1]); // 住宅区路口（远离市中心高楼）
const cityGroup = new THREE.Group(); scene.add(cityGroup);

const cityCtx = { parkingSpots: [], fireSpots: [], barricadeSpots: [] };
let cityFx = null;
const cityEffects = [];
function buildCity() {
  cityFx = buildCityScene({ scene, cityGroup, buildings, LINES, N, ROAD, HALF, ...cityCtx });
  for (const p of cityCtx.fireSpots) fire(p.clone(), Infinity, cityEffects);
}

// ---------------------------------------------------------------- helpers: streets & collision
function randomStreetPoint(minDistFrom, minDist = 0) {
  for (let tries = 0; tries < 40; tries++) {
    const L = pick(LINES), along = rand(-HALF + 3, HALF - 3), off = rand(-ROAD / 2 - 1.5, ROAD / 2 + 1.5);
    const p = Math.random() < 0.5 ? new V3(L + off, 0, along) : new V3(along, 0, L + off);
    if (insideBuilding(p.x, p.z, 0.6)) continue;
    if (minDistFrom && Math.hypot(p.x - minDistFrom.x, p.z - minDistFrom.z) < minDist) continue;
    return p;
  }
  return new V3(pick(LINES), 0, pick(LINES));
}
function insideBuilding(x, z, pad = 0) {
  for (const b of buildings) if (x > b.minX - pad && x < b.maxX + pad && z > b.minZ - pad && z < b.maxZ + pad) return b;
  return null;
}
// push a circle at (pos.x,pos.z) radius r out of buildings whose top is above `bottom`; returns {nx,nz} of last contact or null
function pushOutOfBuildings(pos, r, bottom) {
  let contact = null;
  for (const b of buildings) {
    if (bottom >= b.top - 0.05) continue;
    const cx = clamp(pos.x, b.minX, b.maxX), cz = clamp(pos.z, b.minZ, b.maxZ);
    let dx = pos.x - cx, dz = pos.z - cz; const d = Math.hypot(dx, dz);
    if (d >= r) continue;
    if (d < 1e-4) { // center inside: push along smallest penetration
      const pens = [[pos.x - b.minX, -1, 0], [b.maxX - pos.x, 1, 0], [pos.z - b.minZ, 0, -1], [b.maxZ - pos.z, 0, 1]].sort((a, c) => a[0] - c[0]);
      dx = pens[0][1]; dz = pens[0][2]; pos.x += dx * (pens[0][0] + r); pos.z += dz * (pens[0][0] + r);
      contact = { nx: dx, nz: dz, b };
    } else { dx /= d; dz /= d; pos.x += dx * (r - d); pos.z += dz * (r - d); contact = { nx: dx, nz: dz, b }; }
  }
  return contact;
}
function groundAt(x, z, bottom) {
  let g = 0;
  for (const b of buildings) if (x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ && b.top <= bottom + 0.7) g = Math.max(g, b.top);
  return g;
}

// ---------------------------------------------------------------- effects
const effects = [];
const sparkTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 16; const x = c.getContext('2d'); const g = x.createRadialGradient(8, 8, 0, 8, 8, 8); g.addColorStop(0, '#fff'); g.addColorStop(0.4, '#ffd27a'); g.addColorStop(1, 'rgba(255,120,30,0)'); x.fillStyle = g; x.fillRect(0, 0, 16, 16); return new THREE.CanvasTexture(c); })();
let activeBoomLights = 0;
function explosion(pos, scale = 1) {
  const n = Math.floor(70 * scale);
  const geo = new THREE.BufferGeometry(); const p = new Float32Array(n * 3), vel = [];
  for (let i = 0; i < n; i++) { p[i * 3] = pos.x; p[i * 3 + 1] = pos.y + 0.5; p[i * 3 + 2] = pos.z; vel.push(new V3(rand(-1, 1), rand(0.2, 1.4), rand(-1, 1)).normalize().multiplyScalar(rand(4, 16) * scale)); }
  geo.setAttribute('position', new THREE.BufferAttribute(p, 3));
  const mat = new THREE.PointsMaterial({ size: 2.2 * scale, map: sparkTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xffa040 });
  const pts = new THREE.Points(geo, mat); scene.add(pts);
  let light = null;
  if (activeBoomLights < 3) { light = new THREE.PointLight(0xff7a2a, 300 * scale, 40 * scale, 1.5); light.position.copy(pos).y += 2; scene.add(light); activeBoomLights++; }
  const debris = [];
  for (let i = 0; i < 8; i++) { const m = new THREE.Mesh(new THREE.BoxGeometry(rand(0.2, 0.6), rand(0.2, 0.5), rand(0.2, 0.6)), MAT.wreck); m.position.copy(pos).y += 1; scene.add(m); debris.push({ m, v: new V3(rand(-8, 8), rand(6, 14), rand(-8, 8)) }); }
  effects.push({ life: 1.3, max: 1.3, update(dt) {
    const a = geo.attributes.position.array;
    for (let i = 0; i < n; i++) { vel[i].multiplyScalar(0.94); vel[i].y -= 6 * dt; a[i * 3] += vel[i].x * dt; a[i * 3 + 1] += vel[i].y * dt; a[i * 3 + 2] += vel[i].z * dt; }
    geo.attributes.position.needsUpdate = true;
    const k = this.life / this.max; mat.opacity = k; mat.color.setHSL(0.07 * k, 1, 0.35 + 0.3 * k);
    if (light) light.intensity = 300 * scale * k * k;
    for (const d of debris) { d.v.y -= 30 * dt; d.m.position.addScaledVector(d.v, dt); d.m.rotation.x += dt * 8; if (d.m.position.y < 0.2) { d.m.position.y = 0.2; d.v.set(0, 0, 0); } }
  }, dispose() { scene.remove(pts); geo.dispose(); mat.dispose(); if (light) { scene.remove(light); activeBoomLights--; } debris.forEach((d) => scene.remove(d.m)); } });
  shake = Math.max(shake, 0.8 * scale);
}
function fire(pos, life = 6, list = effects) {
  const n = 18; const geo = new THREE.BufferGeometry(); const p = new Float32Array(n * 3); const seeds = [];
  for (let i = 0; i < n; i++) seeds.push([rand(-0.8, 0.8), rand(0, 1), rand(-0.8, 0.8)]);
  geo.setAttribute('position', new THREE.BufferAttribute(p, 3));
  const mat = new THREE.PointsMaterial({ size: 1.6, map: sparkTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xff6a20 });
  const pts = new THREE.Points(geo, mat); scene.add(pts);
  list.push({ life, max: life, update(dt) {
    const a = geo.attributes.position.array;
    for (let i = 0; i < n; i++) { seeds[i][1] = (seeds[i][1] + dt * rand(0.8, 1.6)) % 1; a[i * 3] = pos.x + seeds[i][0] * (1 - seeds[i][1]); a[i * 3 + 1] = pos.y + 0.8 + seeds[i][1] * 2.4; a[i * 3 + 2] = pos.z + seeds[i][2] * (1 - seeds[i][1]); }
    geo.attributes.position.needsUpdate = true; mat.opacity = Math.min(1, this.life);
  }, dispose() { scene.remove(pts); geo.dispose(); mat.dispose(); } });
}
const tracerMat = new THREE.LineBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.9 });
function tracer(from, to) {
  const geo = new THREE.BufferGeometry().setFromPoints([from.clone(), to.clone()]);
  const line = new THREE.Line(geo, tracerMat); scene.add(line);
  effects.push({ life: 0.07, update() {}, dispose() { scene.remove(line); geo.dispose(); } });
}
// rain
const RAIN_N = 1400;
const rainGeo = new THREE.BufferGeometry(); const rainPos = new Float32Array(RAIN_N * 6);
for (let i = 0; i < RAIN_N; i++) { const x = rand(-40, 40), y = rand(0, 45), z = rand(-40, 40); rainPos.set([x, y, z, x + 0.15, y - 1.1, z], i * 6); }
rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
const rain = new THREE.LineSegments(rainGeo, new THREE.LineBasicMaterial({ color: 0x8aa0c8, transparent: true, opacity: 0.35 }));
rain.frustumCulled = false; scene.add(rain);

// ---------------------------------------------------------------- floating text & messages
function floatText(worldPos, text, cls = '') {
  tmpV.copy(worldPos).project(camera);
  if (tmpV.z > 1) return;
  const el = document.createElement('div'); el.className = 'float ' + cls; el.textContent = text;
  el.style.left = ((tmpV.x + 1) / 2 * innerWidth) + 'px'; el.style.top = ((1 - tmpV.y) / 2 * innerHeight) + 'px';
  document.body.appendChild(el); setTimeout(() => el.remove(), 900);
}
let msgTimer = null;
function centerMsg(main, sub = '', ms = 2200) {
  const el = $('center-msg'); el.innerHTML = main + (sub ? `<small>${sub}</small>` : ''); el.classList.add('show');
  clearTimeout(msgTimer); msgTimer = setTimeout(() => el.classList.remove('show'), ms);
}
let vignetteT = 0;

// ---------------------------------------------------------------- player (the monster)
const player = {
  root: new THREE.Group(), roll: new THREE.Group(), tentacles: [],
  pos: new V3(), vel: new V3(), r: PLAYER.startRadius, targetR: PLAYER.startRadius,
  hp: PLAYER.maxHp, grounded: true, climbing: false, attached: [],
};
scene.add(player.root); player.root.add(player.roll);
function buildMonsterBody() {
  player.roll.clear();
  const glb = fromTemplate('monster');
  if (glb) { player.roll.add(glb); return; }
  const geo = new THREE.IcosahedronGeometry(1, 2);
  const pa = geo.attributes.position;
  for (let i = 0; i < pa.count; i++) { tmpV.fromBufferAttribute(pa, i); const n = 1 + 0.12 * Math.sin(tmpV.x * 5.1) * Math.cos(tmpV.y * 4.3) + 0.08 * Math.sin(tmpV.z * 7.7 + tmpV.x * 3); tmpV.multiplyScalar(n); pa.setXYZ(i, tmpV.x, tmpV.y, tmpV.z); }
  geo.computeVertexNormals();
  const body = new THREE.Mesh(geo, MAT.flesh); body.castShadow = true; player.roll.add(body);
  // maw
  const maw = new THREE.Mesh(new THREE.SphereGeometry(0.45, 8, 6), MAT.maw); maw.scale.set(0.55, 1.1, 0.45); maw.position.set(0, 0.05, 0.86); player.roll.add(maw);
  for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; const t = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.2, 4), MAT.tooth); t.position.set(Math.cos(a) * 0.22, 0.05 + Math.sin(a) * 0.45, 0.98); t.lookAt(0, 0.05, 0.9); t.rotateX(Math.PI / 2); player.roll.add(t); }
  // pale limbs / boils
  for (let i = 0; i < 14; i++) {
    const dir = new V3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize();
    const isLimb = i < 8;
    const m = isLimb ? new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 0.7, 5), MAT.fleshPale) : new THREE.Mesh(new THREE.IcosahedronGeometry(rand(0.12, 0.25), 0), MAT.fleshDark);
    m.position.copy(dir).multiplyScalar(isLimb ? 1.1 : 0.98);
    m.quaternion.setFromUnitVectors(new V3(0, 1, 0), dir);
    player.roll.add(m);
  }
}
function buildTentacles() {
  player.tentacles.forEach((t) => player.root.remove(t.base));
  player.tentacles = [];
  if (templates.monster) return; // the Hi3D monster already has its own limbs
  for (let i = 0; i < 5; i++) {
    const base = new THREE.Group(); const a = (i / 5) * Math.PI * 2 + 0.4;
    base.position.set(Math.cos(a) * 0.7, 0.2, Math.sin(a) * 0.7);
    base.rotation.y = -a; base.rotation.z = -1.0;
    let parent = base; const segs = [];
    for (let s = 0; s < 5; s++) {
      const len = 0.42 - s * 0.05;
      const seg = new THREE.Group(); seg.position.y = s === 0 ? 0 : 0.42 - (s - 1) * 0.05;
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.11 - s * 0.018, 0.13 - s * 0.018, len, 5), s % 2 ? MAT.fleshDark : MAT.flesh); m.position.y = len / 2; m.castShadow = true;
      seg.add(m); parent.add(seg); parent = seg; segs.push(seg);
    }
    player.root.add(base); player.tentacles.push({ base, segs, phase: rand(0, 6) });
  }
}
function attachVictim(mesh) {
  // embed the eaten person in the monster's surface; keeps its world size
  scene.remove(mesh);
  const dir = new V3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize();
  mesh.position.copy(dir).multiplyScalar(0.72);
  mesh.quaternion.setFromUnitVectors(new V3(0, 1, 0), dir);
  mesh.rotateY(rand(0, 6.28));
  mesh.scale.setScalar(0.9 / player.r);
  player.roll.add(mesh);
  player.attached.push(mesh);
  if (player.attached.length > 70) { const old = player.attached.shift(); player.roll.remove(old); }
}
function grow(vol) { player.targetR = Math.cbrt(player.targetR ** 3 + vol); }

// ---------------------------------------------------------------- entities
let civilians = [], cops = [], cars = [], helis = [];
function spawnPerson(kind, near) {
  const mesh = makePerson(kind);
  const p = near ? near.clone().add(new V3(rand(-3, 3), 0, rand(-3, 3))) : randomStreetPoint(player.pos, kind === 'police' ? 45 : 25);
  mesh.position.copy(p); scene.add(mesh);
  const e = { kind, mesh, pos: mesh.position, dir: new V3(rand(-1, 1), 0, rand(-1, 1)).normalize(), t: rand(0, 3), fireT: rand(0.5, POLICE.fireInterval), alive: true, bob: rand(0, 6) };
  (kind === 'police' ? cops : civilians).push(e);
  return e;
}
function spawnParkedCars() {
  for (let i = 0; i < 14; i++) {
    const L = pick(LINES), along = rand(-HALF + 6, HALF - 6), side = Math.random() < 0.5 ? -3.3 : 3.3;
    const horizontal = Math.random() < 0.5;
    const pos = horizontal ? new V3(along, 0, L + side) : new V3(L + side, 0, along);
    if (Math.hypot(pos.x - SPAWN.x, pos.z - SPAWN.z) < 12) continue;
    const { mesh } = makeCar(false); mesh.position.copy(pos); mesh.rotation.y = horizontal ? (Math.random() < 0.5 ? 0 : Math.PI) : Math.PI / 2 * (Math.random() < 0.5 ? 1 : -1);
    scene.add(mesh); cars.push({ mesh, pos: mesh.position, police: false, state: 'parked', vy: 0, spin: 0 });
  }
  for (const p of cityCtx.parkingSpots) { const { mesh } = makeCar(false); mesh.position.copy(p); mesh.rotation.y = Math.PI / 2; scene.add(mesh); cars.push({ mesh, pos: mesh.position, police: false, state: 'parked', vy: 0, spin: 0 }); }
}
function spawnPoliceCar() {
  // start at an intersection far away
  let ix, iz, tries = 0;
  do { ix = randi(0, N); iz = randi(0, N); tries++; } while (Math.hypot(LINES[ix] - player.pos.x, LINES[iz] - player.pos.z) < 60 && tries < 30);
  const { mesh, lights } = makeCar(true); mesh.position.set(LINES[ix], 0, LINES[iz]); scene.add(mesh);
  const c = { mesh, pos: mesh.position, police: true, lights, state: 'drive', ix, iz, tx: ix, tz: iz, deployed: false, vy: 0, spin: 0, flash: rand(0, 1) };
  cars.push(c); return c;
}
function spawnHeli() {
  const { mesh, rotor, tailRotor } = makeHeli();
  const a = rand(0, Math.PI * 2);
  mesh.position.set(player.pos.x + Math.cos(a) * 90, 30, player.pos.z + Math.sin(a) * 90);
  scene.add(mesh);
  const spot = new THREE.SpotLight(0xe8f0ff, 900, 70, 0.32, 0.5, 1.4); spot.position.set(0, -1, 0); mesh.add(spot); mesh.add(spot.target);
  const h = { mesh, rotor, tailRotor, spot, pos: mesh.position, angle: a, alt: rand(HELI.altitudeMin, HELI.altitudeMax), fireT: 1.5, state: 'fly', vy: 0, life: 0 };
  helis.push(h); return h;
}

// ---------------------------------------------------------------- game state
const state = { running: false, over: false, t: 0, wave: 0, eaten: 0, carsCrushed: 0, helisDown: 0, crushReady: false, toldClimb: false, spawnT: { cop: 0, car: 0, heli: 0 }, slowmo: 1 };
let shake = 0;

function resetGame() {
  for (const e of [...civilians, ...cops]) scene.remove(e.mesh);
  for (const c of cars) scene.remove(c.mesh);
  for (const h of helis) scene.remove(h.mesh);
  civilians = []; cops = []; cars = []; helis = [];
  effects.splice(0).forEach((e) => e.dispose());
  player.attached = [];
  Object.assign(player, { r: PLAYER.startRadius, targetR: PLAYER.startRadius, hp: PLAYER.maxHp, grounded: true, climbing: false });
  player.pos.set(SPAWN.x, PLAYER.startRadius, SPAWN.z); player.vel.set(0, 0, 0);
  buildMonsterBody(); buildTentacles();
  Object.assign(state, { running: true, over: false, t: 0, wave: 0, eaten: 0, carsCrushed: 0, helisDown: 0, crushReady: false, toldClimb: false, spawnT: { cop: 5, car: 0, heli: 0 }, slowmo: 1 });
  for (let i = 0; i < CIVILIANS.count; i++) { const e = spawnPerson(Math.random() < 0.5 ? 'man' : 'woman'); if (i < 14) { const p = randomStreetPoint(null); for (let k = 0; k < 30 && Math.hypot(p.x - SPAWN.x, p.z - SPAWN.z) > 26; k++) p.copy(randomStreetPoint(null)); if (Math.hypot(p.x - SPAWN.x, p.z - SPAWN.z) > 6) e.pos.copy(p); } }
  spawnParkedCars();
  camera.position.set(SPAWN.x, 20, SPAWN.z + 22);
  centerMsg('吞下路人！', '吃人会变大，还能回血');
}

// ---------------------------------------------------------------- input
const keys = new Set();
addEventListener('keydown', (e) => {
  keys.add(e.code);
  if (e.code === 'Space') { e.preventDefault(); wantJump = true; }
  if (e.code === 'KeyP') { pixelScale = pixelScale >= 4 ? 1 : pixelScale + 1; resize(); centerMsg(`像素化 ×${pixelScale}`, '', 900); }
  if (e.code === 'KeyM') toggleMute();
});
addEventListener('keyup', (e) => keys.delete(e.code));
let wantJump = false;
const stick = { active: false, id: null, sx: 0, sy: 0, dx: 0, dy: 0 };
canvas.addEventListener('pointerdown', (e) => { stick.active = true; stick.id = e.pointerId; stick.sx = e.clientX; stick.sy = e.clientY; stick.dx = stick.dy = 0;
  const s = $('stick'); s.style.display = 'block'; s.style.left = (e.clientX - 55) + 'px'; s.style.top = (e.clientY - 55) + 'px'; s.firstElementChild.style.transform = ''; });
addEventListener('pointermove', (e) => { if (!stick.active || e.pointerId !== stick.id) return; let dx = e.clientX - stick.sx, dy = e.clientY - stick.sy; const d = Math.hypot(dx, dy), m = 50; if (d > m) { dx *= m / d; dy *= m / d; } stick.dx = dx / m; stick.dy = dy / m; $('stick').firstElementChild.style.transform = `translate(${dx}px,${dy}px)`; });
const endStick = (e) => { if (e.pointerId !== stick.id) return; stick.active = false; stick.dx = stick.dy = 0; $('stick').style.display = 'none'; };
addEventListener('pointerup', endStick); addEventListener('pointercancel', endStick);
$('touch-jump').addEventListener('pointerdown', (e) => { e.stopPropagation(); wantJump = true; });
function toggleMute() { const m = Sfx.toggle(); $('mute').textContent = m ? '🔇' : '🔊'; }
$('mute').addEventListener('click', toggleMute);

function inputDir() {
  let x = 0, z = 0;
  if (keys.has('KeyW') || keys.has('ArrowUp')) z -= 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) z += 1;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) x -= 1;
  if (keys.has('KeyD') || keys.has('ArrowRight')) x += 1;
  if (stick.active) { x += stick.dx; z += stick.dy; }
  const l = Math.hypot(x, z); if (l > 1) { x /= l; z /= l; }
  return { x, z, mag: Math.min(1, l) };
}

// ---------------------------------------------------------------- update: player
function updatePlayer(dt) {
  const r = (player.r += (player.targetR - player.r) * Math.min(1, dt * 3));
  const inp = inputDir();
  const speed = PLAYER.baseSpeed + r * PLAYER.speedPerRadius;
  const k = Math.min(1, dt * (player.grounded ? 7 : 2.5));
  player.vel.x += (inp.x * speed - player.vel.x) * k;
  player.vel.z += (inp.z * speed - player.vel.z) * k;

  const bottom = player.pos.y - r;
  player.climbing = false;
  const contact = pushOutOfBuildings(player.pos, r * 0.92, bottom);
  if (contact) {
    const vn = player.vel.x * contact.nx + player.vel.z * contact.nz;
    if (vn < 0) { player.vel.x -= vn * contact.nx; player.vel.z -= vn * contact.nz; }
    if (inp.mag > 0.2 && (inp.x * contact.nx + inp.z * contact.nz) < -0.35) {
      player.climbing = true;
      if (!state.toldClimb) { state.toldClimb = true; centerMsg('爬墙中…', '一直往前推就能爬上楼顶', 1500); }
    }
  }
  if (player.climbing) player.vel.y = PLAYER.climbSpeed + r * 0.6;
  else player.vel.y -= PLAYER.gravity * dt;

  if (wantJump && (player.grounded || player.climbing)) {
    player.vel.y = PLAYER.jumpSpeed + r * PLAYER.jumpPerRadius;
    if (player.climbing && contact) { player.vel.x += contact.nx * 6; player.vel.z += contact.nz * 6; }
    Sfx.jump();
  }
  wantJump = false;

  player.pos.addScaledVector(player.vel, dt);
  player.pos.x = clamp(player.pos.x, -HALF - 8, HALF + 8); player.pos.z = clamp(player.pos.z, -HALF - 8, HALF + 8);
  const g = groundAt(player.pos.x, player.pos.z, player.pos.y - r);
  const wasAir = !player.grounded;
  player.grounded = false;
  if (player.pos.y - r <= g) {
    if (wasAir && player.vel.y < -18) { shake = Math.max(shake, 0.35); Sfx.bump(); }
    player.pos.y = g + r; if (player.vel.y < 0) player.vel.y = 0; player.grounded = true;
  }

  // visuals: roll + scale
  player.root.position.copy(player.pos);
  player.roll.scale.setScalar(r);
  const hv = Math.hypot(player.vel.x, player.vel.z);
  if (hv > 0.05) {
    tmpV.set(player.vel.z, 0, -player.vel.x).normalize();
    tmpQ.setFromAxisAngle(tmpV, (hv * dt) / r);
    player.roll.quaternion.premultiply(tmpQ);
  }
  // tentacles: non-rolling, wriggle
  const tt = state.t;
  player.tentacles.forEach((T, i) => {
    T.base.scale.setScalar(r * 1.1);
    T.base.position.y = 0;
    T.segs.forEach((s, j) => { s.rotation.z = Math.sin(tt * 4 + T.phase + j * 0.8) * 0.35; s.rotation.x = Math.cos(tt * 3.2 + T.phase + j) * 0.3; });
    T.base.rotation.z = -1.1 + Math.sin(tt * 2 + i) * 0.2 - Math.min(0.5, hv * 0.03);
  });
}

// ---------------------------------------------------------------- update: people
function updatePeople(dt, list, isCop) {
  const pr = player.r, pp = player.pos;
  for (let i = list.length - 1; i >= 0; i--) {
    const e = list[i];
    const dx = e.pos.x - pp.x, dz = e.pos.z - pp.z, d = Math.hypot(dx, dz);
    // eaten?
    if (d < pr + 0.45 && pp.y - pr < 1.6) {
      list.splice(i, 1);
      state.eaten++;
      grow(PLAYER.personVolume);
      const heal = Math.min(PLAYER.healPerPerson, PLAYER.maxHp - player.hp); player.hp += heal;
      attachVictim(e.mesh);
      Sfx.eat();
      floatText(tmpV2.copy(pp).setY(pp.y + pr + 0.5), heal > 0 ? `+${Math.round(heal)} ❤` : '吞噬!', heal > 0 ? 'heal' : '');
      if (!isCop) setTimeout(() => { if (state.running) spawnPerson(Math.random() < 0.5 ? 'man' : 'woman'); }, 1500);
      continue;
    }
    e.t -= dt;
    let speed;
    if (isCop) {
      if (d > POLICE.keepDistance + 2) { e.dir.set(-dx, 0, -dz).normalize(); speed = POLICE.speed; }
      else if (d < POLICE.keepDistance - 3) { e.dir.set(dx, 0, dz).normalize(); speed = POLICE.speed * 0.8; }
      else { if (e.t < 0) { e.t = rand(1, 2); e.dir.set(-dz, 0, dx).normalize().multiplyScalar(Math.random() < 0.5 ? 1 : -1); } speed = 2; }
      e.fireT -= dt;
      if (e.fireT <= 0 && d < POLICE.range && !state.over) {
        e.fireT = POLICE.fireInterval * rand(0.8, 1.3);
        const muzzle = tmpV.copy(e.pos).setY(1.3);
        const hit = Math.random() < POLICE.hitChance;
        const target = tmpV2.copy(pp).add(new V3(rand(-1, 1), rand(-0.5, 1), rand(-1, 1)).multiplyScalar(hit ? pr * 0.5 : pr * 2.2));
        tracer(muzzle, target); Sfx.shot(clamp(0.5 - d / 80, 0.05, 0.4));
        if (hit) damage(POLICE.damage);
      }
      e.mesh.rotation.y = Math.atan2(-dx, -dz);
    } else {
      if (d < CIVILIANS.fleeRadius) { e.dir.set(dx + rand(-2, 2), 0, dz + rand(-2, 2)).normalize(); speed = CIVILIANS.runSpeed; }
      else { if (e.t < 0) { e.t = rand(2, 5); e.dir.set(rand(-1, 1), 0, rand(-1, 1)).normalize(); } speed = CIVILIANS.walkSpeed; }
      e.mesh.rotation.y = Math.atan2(e.dir.x, e.dir.z);
    }
    e.pos.x += e.dir.x * speed * dt; e.pos.z += e.dir.z * speed * dt;
    if (pushOutOfBuildings(e.pos, 0.4, 0)) { e.dir.set(-e.dir.z, 0, e.dir.x); }
    if (Math.abs(e.pos.x) > HALF + 4 || Math.abs(e.pos.z) > HALF + 4) { e.dir.set(-Math.sign(e.pos.x) * 0.7, 0, -Math.sign(e.pos.z) * 0.7).normalize(); e.pos.x = clamp(e.pos.x, -HALF - 4, HALF + 4); e.pos.z = clamp(e.pos.z, -HALF - 4, HALF + 4); }
    e.bob += dt * speed * 2.2;
    e.pos.y = Math.abs(Math.sin(e.bob)) * 0.12;
  }
}

// ---------------------------------------------------------------- update: cars
function nextIntersection(c) {
  const ix = c.tx, iz = c.tz;
  const opts = [[ix + 1, iz], [ix - 1, iz], [ix, iz + 1], [ix, iz - 1]].filter(([a, b]) => a >= 0 && a <= N && b >= 0 && b <= N && !(a === c.ix && b === c.iz));
  opts.sort((A, B) => Math.hypot(LINES[A[0]] - player.pos.x, LINES[A[1]] - player.pos.z) - Math.hypot(LINES[B[0]] - player.pos.x, LINES[B[1]] - player.pos.z));
  const choice = Math.random() < 0.85 ? opts[0] : pick(opts);
  c.ix = ix; c.iz = iz; c.tx = choice[0]; c.tz = choice[1];
}
function updateCars(dt) {
  const pr = player.r, pp = player.pos;
  for (let i = cars.length - 1; i >= 0; i--) {
    const c = cars[i];
    if (c.state === 'flying') {
      c.vy -= PLAYER.gravity * dt; c.pos.y += c.vy * dt; c.mesh.rotation.x += c.spin * dt; c.mesh.rotation.z += c.spin * 0.6 * dt;
      if (c.pos.y <= 0) { c.pos.y = 0; c.state = 'wreck'; c.mesh.rotation.x = Math.round(c.mesh.rotation.x / Math.PI) * Math.PI; c.mesh.rotation.z = 0; }
      continue;
    }
    if (c.state === 'wreck') continue;
    // police driving
    if (c.police) {
      c.flash += dt * 6;
      const on = Math.sin(c.flash * 3) > 0;
      c.lights.r.material.emissiveIntensity = on ? 2.5 : 0.1; c.lights.b.material.emissiveIntensity = on ? 0.1 : 2.5;
      const dToP = Math.hypot(c.pos.x - pp.x, c.pos.z - pp.z);
      if (c.state === 'drive') {
        const tx = LINES[c.tx], tz = LINES[c.tz];
        const dx = tx - c.pos.x, dz = tz - c.pos.z, d = Math.hypot(dx, dz);
        if (d < 0.6) nextIntersection(c);
        else { const sp = 16; c.pos.x += (dx / d) * Math.min(d, sp * dt); c.pos.z += (dz / d) * Math.min(d, sp * dt); c.mesh.rotation.y = Math.atan2(-dz, dx); }
        if (dToP < 20) { c.state = 'stop'; if (!c.deployed) { c.deployed = true; for (let k = 0; k < 2; k++) spawnPerson('police', c.pos); } }
      } else if (c.state === 'stop' && dToP > 40) { c.state = 'drive'; }
    }
    // collision with monster
    const d = Math.hypot(c.pos.x - pp.x, c.pos.z - pp.z);
    if (d < pr + 1.9 && pp.y - pr < 2.0) {
      if (pr >= PLAYER.crushRadius) crushCar(c);
      else {
        const nx = (pp.x - c.pos.x) / (d || 1), nz = (pp.z - c.pos.z) / (d || 1);
        pp.x = c.pos.x + nx * (pr + 1.9); pp.z = c.pos.z + nz * (pr + 1.9);
        player.vel.x = nx * 8; player.vel.z = nz * 8;
        if (!c.bumpT || state.t - c.bumpT > 1) { c.bumpT = state.t; Sfx.bump(); floatText(tmpV2.copy(c.pos).setY(2.5), '太小了，压不动！', 'dmg'); }
      }
    }
  }
}
function crushCar(c) {
  c.state = 'flying'; c.vy = 12; c.spin = rand(3, 6) * (Math.random() < 0.5 ? 1 : -1);
  c.mesh.traverse((o) => { if (o.isMesh) o.material = MAT.wreck; });
  explosion(tmpV.copy(c.pos), 1); fire(c.pos.clone(), 8); Sfx.boom();
  state.carsCrushed++; grow(PLAYER.carVolume);
  floatText(tmpV2.copy(c.pos).setY(3), c.police ? '警车 轰！' : '轰！', 'boom');
  // blast kills nearby cops
  for (let i = cops.length - 1; i >= 0; i--) { const e = cops[i]; if (e.pos.distanceTo(c.pos) < 6) { scene.remove(e.mesh); cops.splice(i, 1); } }
}

// ---------------------------------------------------------------- update: helicopters
function updateHelis(dt) {
  const pp = player.pos, pr = player.r;
  for (let i = helis.length - 1; i >= 0; i--) {
    const h = helis[i];
    h.rotor.rotation.y += dt * 30; h.tailRotor.rotation.z += dt * 40;
    if (h.state === 'falling') {
      h.vy -= 22 * dt; h.pos.y += h.vy * dt; h.mesh.rotation.y += dt * 6; h.mesh.rotation.z += dt * 1.5;
      if (h.pos.y < 1.5) { explosion(h.pos.clone().setY(1), 1.8); fire(h.pos.clone().setY(0), 10); Sfx.boom(); scene.remove(h.mesh); helis.splice(i, 1); }
      continue;
    }
    h.angle += dt * 0.35;
    h.alt += Math.sin(state.t * 0.5 + i) * dt * 2;
    h.alt = clamp(h.alt, HELI.altitudeMin, HELI.altitudeMax);
    const tx = pp.x + Math.cos(h.angle) * HELI.orbitRadius, tz = pp.z + Math.sin(h.angle) * HELI.orbitRadius;
    h.pos.x += (tx - h.pos.x) * Math.min(1, dt * 0.8); h.pos.z += (tz - h.pos.z) * Math.min(1, dt * 0.8); h.pos.y += (h.alt - h.pos.y) * Math.min(1, dt);
    h.mesh.rotation.y = Math.atan2(-(pp.z - h.pos.z), pp.x - h.pos.x);
    h.mesh.rotation.z = -0.12;
    h.spot.target.position.copy(tmpV.copy(pp).sub(h.pos).applyQuaternion(tmpQ.copy(h.mesh.quaternion).invert()));
    h.fireT -= dt;
    const d3 = h.pos.distanceTo(pp);
    if (h.fireT <= 0 && d3 < 60 && !state.over) {
      h.fireT = HELI.fireInterval * rand(0.7, 1.4);
      const hit = Math.random() < HELI.hitChance;
      tracer(tmpV.copy(h.pos).setY(h.pos.y - 1.5), tmpV2.copy(pp).add(new V3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).multiplyScalar(hit ? pr * 0.5 : pr * 2.5)));
      Sfx.shot(0.18); if (hit) damage(HELI.damage);
    }
    // monster hits heli
    if (d3 < pr + 3.6) {
      h.state = 'falling'; h.vy = 4; state.helisDown++; grow(PLAYER.heliVolume);
      explosion(h.pos.clone(), 1.2); Sfx.boom(); shake = 1.2;
      floatText(tmpV2.copy(h.pos).setY(h.pos.y + 2), '击落直升机！', 'boom');
      centerMsg('直升机坠毁！');
      h.spot.intensity = 0;
    }
  }
}

// ---------------------------------------------------------------- waves & spawning
function updateWaves(dt) {
  let w = 0; for (let i = 0; i < WAVES.length; i++) if (state.t >= WAVES[i].t) w = i;
  if (w !== state.wave) { state.wave = w; const W = WAVES[w]; centerMsg('★'.repeat(W.stars) + ' ' + W.label, w >= 3 ? '爬上楼顶，跳起来撞毁直升机！' : '警方正在赶来', 2600); Sfx.alert(); }
  const W = WAVES[state.wave];
  const policeCars = cars.filter((c) => c.police && c.state !== 'wreck' && c.state !== 'flying').length;
  state.spawnT.cop -= dt; state.spawnT.car -= dt; state.spawnT.heli -= dt;
  if (cops.length < W.cops && state.spawnT.cop <= 0) { spawnPerson('police'); state.spawnT.cop = 1.4; }
  if (policeCars < W.cars && state.spawnT.car <= 0) { spawnPoliceCar(); state.spawnT.car = 5; }
  if (helis.filter((h) => h.state !== 'falling').length < W.helis && state.spawnT.heli <= 0) { spawnHeli(); state.spawnT.heli = 8; }
  Sfx.setLoops(policeCars > 0 ? 1 : 0, helis.length > 0 ? 1 : 0);
}

function damage(n) {
  if (state.over) return;
  player.hp -= n; vignetteT = 0.25; Sfx.hit();
  if (player.hp <= 0) { player.hp = 0; gameOver(); }
}
function gameOver() {
  state.over = true; state.slowmo = 0.25;
  explosion(player.pos.clone(), 1.4);
  setTimeout(() => {
    state.running = false;
    const t = Math.floor(state.t), score = state.eaten * 10 + state.carsCrushed * 60 + state.helisDown * 250 + t * 2;
    let best = 0; try { best = +localStorage.getItem('greyridge-best') || 0; if (score > best) { localStorage.setItem('greyridge-best', score); } } catch (e) {}
    $('result-stats').innerHTML = `存活 <b>${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}</b><br>吞噬 <b>${state.eaten}</b> 人 · 压爆 <b>${state.carsCrushed}</b> 辆车 · 击落 <b>${state.helisDown}</b> 架直升机<br>得分 <b>${score}</b>${score > best ? ' · 新纪录！' : (best ? ` · 最高 ${best}` : '')}`;
    $('result-screen').classList.remove('hidden');
  }, 1600);
}

// ---------------------------------------------------------------- camera & building fade
function segHitsBox(ax, az, bx, bz, b) {
  let t0 = 0, t1 = 1; const dx = bx - ax, dz = bz - az;
  for (const [p, d, mn, mx] of [[ax, dx, b.minX, b.maxX], [az, dz, b.minZ, b.maxZ]]) {
    if (Math.abs(d) < 1e-6) { if (p < mn || p > mx) return false; }
    else { let ta = (mn - p) / d, tb = (mx - p) / d; if (ta > tb) [ta, tb] = [tb, ta]; t0 = Math.max(t0, ta); t1 = Math.min(t1, tb); if (t0 > t1) return false; }
  }
  return true;
}
function updateCamera(dt) {
  const r = player.r;
  const back = 8 + r * 2.4, up = 22 + r * 4.6;
  const target = tmpV.set(player.pos.x, player.pos.y + up, player.pos.z + back);
  camera.position.lerp(target, Math.min(1, dt * 4));
  if (shake > 0) { camera.position.x += rand(-1, 1) * shake; camera.position.y += rand(-1, 1) * shake; shake = Math.max(0, shake - dt * 2.5); }
  camera.lookAt(player.pos.x, player.pos.y + r * 0.3, player.pos.z);
  moon.position.set(player.pos.x + 30, 70, player.pos.z + 20); moon.target.position.copy(player.pos);
  for (const b of buildings) {
    const hit = b.top > player.pos.y - r + 1 && segHitsBox(camera.position.x, camera.position.z, player.pos.x, player.pos.z + r, { minX: b.minX - 2.5, maxX: b.maxX + 2.5, minZ: b.minZ - 2.5, maxZ: b.maxZ + 2.5 });
    const want = hit ? 0.22 : 1;
    if (Math.abs(b.fade - want) > 0.01) { b.fade += (want - b.fade) * Math.min(1, dt * 8); b.mats.forEach((m) => { m.opacity = b.fade; m.depthWrite = b.fade > 0.95; }); }
  }
  const ra = rainGeo.attributes.position.array, cx = player.pos.x, cz = player.pos.z;
  for (let i = 0; i < RAIN_N; i++) {
    const o = i * 6; let y = ra[o + 1] - dt * 38;
    let x = ra[o], z = ra[o + 2];
    if (y < 0) { y += 45; x = cx + rand(-40, 40); z = cz + rand(-40, 40); }
    ra[o] = x; ra[o + 1] = y; ra[o + 2] = z; ra[o + 3] = x + 0.15; ra[o + 4] = y - 1.1; ra[o + 5] = z;
  }
  rainGeo.attributes.position.needsUpdate = true;
}

// ---------------------------------------------------------------- HUD
let hudT = 0;
function updateHUD(dt) {
  hudT -= dt; vignetteT = Math.max(0, vignetteT - dt);
  $('vignette').style.boxShadow = `inset 0 0 160px 40px rgba(200,0,0,${Math.min(0.75, vignetteT * 3 + (player.hp < 30 ? 0.25 + 0.15 * Math.sin(state.t * 8) : 0))})`;
  if (hudT > 0) return; hudT = 0.1;
  $('hp-bar').firstElementChild.style.width = (player.hp / PLAYER.maxHp * 100) + '%';
  const prog = clamp((player.r - PLAYER.startRadius) / (PLAYER.crushRadius - PLAYER.startRadius), 0, 1);
  $('size-bar').firstElementChild.style.width = (prog * 100) + '%';
  if (prog >= 1 && !state.crushReady) { state.crushReady = true; $('size-bar').classList.add('ready'); $('size-label').textContent = `体积 ${player.r.toFixed(1)} · 可以压爆车辆！`; centerMsg('体积足够了！', '撞向汽车和警车，把它们压爆', 2600); }
  if (state.crushReady) $('size-label').textContent = `体积 ${player.r.toFixed(1)} · 可以压爆车辆！`;
  const t = Math.floor(state.t); $('timer').textContent = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
  const W = WAVES[state.wave]; $('stars').innerHTML = '<b>' + '★'.repeat(W.stars) + '</b>' + '★'.repeat(5 - W.stars); $('wave-label').textContent = W.label;
  $('stat-eaten').textContent = state.eaten; $('stat-cars').textContent = state.carsCrushed; $('stat-helis').textContent = state.helisDown;
}

// ---------------------------------------------------------------- main loop
const clock = new THREE.Clock();
let cityT = 0;
function frame() {
  requestAnimationFrame(frame);
  let dt = Math.min(clock.getDelta(), 1 / 20);
  if (state.running) {
    dt *= state.slowmo;
    state.t += dt;
    if (!state.over) { updatePlayer(dt); updateWaves(dt); }
    updatePeople(dt, civilians, false);
    updatePeople(dt, cops, true);
    updateCars(dt);
    updateHelis(dt);
    updateHUD(dt);
  }
  for (let i = effects.length - 1; i >= 0; i--) { const e = effects[i]; e.life -= dt; e.update(dt); if (e.life <= 0) { e.dispose(); effects.splice(i, 1); } }
  for (const e of cityEffects) e.update(dt);
  cityT += dt; if (cityFx) cityFx.update(dt, cityT);
  updateCamera(dt);
  composer.render();
}

// ---------------------------------------------------------------- boot
(async function boot() {
  await loadModels();
  buildCity();
  player.pos.set(SPAWN.x, PLAYER.startRadius, SPAWN.z); buildMonsterBody(); buildTentacles();
  camera.position.set(SPAWN.x, 20, SPAWN.z + 22);
  $('loading').textContent = Object.keys(templates).length ? `已载入 Hi3D 模型 ${Object.keys(templates).length} 个` : '模型由 Hi3D 生成 · 占位模型显示中';
  frame();
  const start = () => { Sfx.init(); $('start-screen').classList.add('hidden'); $('result-screen').classList.add('hidden'); resetGame(); };
  $('start-btn').addEventListener('click', start);
  $('restart-btn').addEventListener('click', start);
  window.__game = { state, player, start, get civilians() { return civilians; }, get cops() { return cops; }, get cars() { return cars; }, get helis() { return helis; }, stick };
})();
