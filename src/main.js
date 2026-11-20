import * as THREE from 'three';
import { OrbitControls } from 'three/addons/OrbitControls.js';
import { mergeGeometries } from 'three/addons/BufferGeometryUtils.js';
import { ITEMS, ITEM_BY_ID, CATS, PAL, bakeParts, mulberry, buildPart } from './items.js';
import { LoFi } from './music.js';

// ---------------------------------------------------------------- config
const R = 8;
const MAX_ITEMS = 600;
const SB_URL = 'https://ycoxfkbgeakwxiqgrvok.supabase.co';
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inljb3hma2JnZWFrd3hpcWdydm9rIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTUxMDY2MzcsImV4cCI6MjExMDY4MjYzN30.FzgDotouST6jUngcnPn3IpTg3S6lBMXDYsI35vTWyto';
const $ = (s) => document.querySelector(s);
const isTouch = matchMedia('(pointer: coarse)').matches;
const lowEnd = isTouch && (navigator.hardwareConcurrency || 4) <= 4;
const mobile = isTouch || Math.min(innerWidth, innerHeight) < 600;
const UP = new THREE.Vector3(0, 1, 0);
// creator credit: one place to change the name or link
const CREATOR = { name: 'Harsha', url: '' };
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const easeIO = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const elastic = (t) => (t >= 1 ? 1 : t <= 0 ? 0 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1);
const now = () => performance.now() / 1000;

const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};
function rid(n) {
  const a = 'abcdefghijkmnpqrstuvwxyz23456789'; let s = '';
  for (const x of crypto.getRandomValues(new Uint8Array(n))) s += a[x % a.length];
  return s;
}
let me = store.get('tp_me', null);
if (!me || !/^[a-z0-9]{6,12}$/.test(me.id || '')) { me = { id: rid(8), secret: rid(32), saved: false }; store.set('tp_me', me); }
const myTz = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { return 'UTC'; } })();

const NAMES_A = ['Sleepy', 'Mango', 'Chai', 'Lotus', 'Monsoon', 'Cozy', 'Little', 'Saffron', 'Paper', 'Sunny', 'Marigold', 'Coconut', 'Jasmine', 'Masala', 'Velvet', 'Mithai'];
const NAMES_B = ['Moon', 'Island', 'Valley', 'Planet', 'Garden', 'Village', 'Nook', 'Haven', 'World', 'Hill', 'Meadow', 'Cove'];
const PALETTES = [
  ['#8cc56e', '#7dbb63', '#9bd07a', '#86c06a', '#a3d482'],
  ['#e2a65b', '#d8964f', '#eab46c', '#c98b4a', '#f0c27e'],
  ['#e9cf98', '#e3c48a', '#f0d9a6', '#d9b77c', '#f3dfb2'],
  ['#f4f6f8', '#e8eef3', '#ffffff', '#dde6ee', '#eef3f7'],
  ['#f3b6c4', '#eea6b7', '#f7c6d1', '#e899ad', '#fad2db'],
  ['#9ed9c4', '#8ccfb8', '#b0e3d1', '#7fc4ad', '#bfe9da'],
  ['#c3b3e6', '#b6a4de', '#d1c4ee', '#a996d4', '#ddd2f3'],
];

// ---------------------------------------------------------------- time of day
const fmtCache = {};
function localHour(tz) {
  try {
    const f = (fmtCache[tz] ||= new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }));
    const p = f.formatToParts(new Date());
    return +p.find((x) => x.type === 'hour').value + +p.find((x) => x.type === 'minute').value / 60;
  } catch { const d = new Date(); return d.getHours() + d.getMinutes() / 60; }
}
const timeLabel = (h) => { const hh = Math.floor(h) % 24, mm = Math.floor((h - Math.floor(h)) * 60); return `${hh % 12 || 12}:${String(mm).padStart(2, '0')} ${hh >= 12 ? 'pm' : 'am'}`; };
function lightState(h) {
  const theta = (h / 24) * Math.PI * 2 - Math.PI / 2;
  const s = Math.sin(theta);
  return { theta, s, dl: smooth(-0.14, 0.3, s), tw: 1 - smooth(0.0, 0.42, Math.abs(s)) };
}
const C_NIGHT = new THREE.Color(0.5, 0.55, 0.86), C_DAY = new THREE.Color(1, 1, 1), C_DUSK = new THREE.Color(1, 0.8, 0.66);
function tintFor(L, out) { out.copy(C_NIGHT).lerp(C_DAY, L.dl).lerp(C_DUSK, L.tw * 0.65); return out; }
const WEATHER_EMOJI = { rain: '🌧️', storm: '⛈️', snow: '❄️', cloud: '☁️', clear: '☀️', '': '' };

// ---------------------------------------------------------------- renderer
const renderer = new THREE.WebGLRenderer({ antialias: !mobile, alpha: true, powerPreference: 'high-performance', stencil: false });
let pixelRatio = Math.min(devicePixelRatio || 1, mobile ? (lowEnd ? 1.25 : 1.5) : 2);
renderer.setPixelRatio(pixelRatio);
renderer.setSize(innerWidth, innerHeight);
renderer.setClearColor(0x000000, 0);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = mobile ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
if (mobile) renderer.shadowMap.autoUpdate = false; // refreshed every few frames in the loop
$('#app').appendChild(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.5, 4000);
camera.position.set(0, 260, 620);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; controls.dampingFactor = 0.08; controls.enablePan = false;
controls.rotateSpeed = 0.55; controls.zoomSpeed = 0.9; controls.minPolarAngle = 0.05; controls.maxPolarAngle = Math.PI - 0.05;
controls.enabled = false;

const hemi = new THREE.HemisphereLight(0xfff4e2, 0xb6a58c, 1.55);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff0d4, 2.1);
sun.castShadow = true;
sun.shadow.mapSize.set(mobile ? 1024 : 2048, mobile ? 1024 : 2048);
Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14, near: 1, far: 90 });
sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.03; sun.shadow.radius = 4;
scene.add(sun, sun.target);

function paperTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d'); const id = g.createImageData(256, 256);
  for (let i = 0; i < id.data.length; i += 4) { const v = 238 + Math.random() * 17; id.data[i] = id.data[i + 1] = id.data[i + 2] = v; id.data[i + 3] = 255; }
  g.putImageData(id, 0, 0);
  g.globalAlpha = 0.08; g.strokeStyle = '#7a6a50'; g.lineWidth = 1;
  for (let i = 0; i < 160; i++) {
    const x = Math.random() * 256, y = Math.random() * 256, a = Math.random() * 6.28, l = 4 + Math.random() * 16;
    g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + Math.cos(a + 0.6) * l / 2, y + Math.sin(a + 0.6) * l / 2, x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
  }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
const paperTex = paperTexture();
const solidMat = () => new THREE.MeshLambertMaterial({ vertexColors: true, map: paperTex, flatShading: true });

function mergeParts(parts) {
  const out = bakeParts(parts, null);
  const all = [...out.solid, ...out.glow];
  return mergeGeometries(all);
}

// ---------------------------------------------------------------- items helpers
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _m = new THREE.Matrix4(), _s = new THREE.Vector3();
const itemDir = (it, out = new THREE.Vector3()) => out.set(it[1], it[2], it[3]).normalize();
const seedOf = (it) => ((it[1] * 73856093) ^ (it[2] * 19349663) ^ (it[3] * 83492791)) >>> 0;
function itemMatrix(it, out) {
  const d = itemDir(it, _v);
  _q.setFromUnitVectors(UP, d); _q2.setFromAxisAngle(UP, ((it[4] || 0) * Math.PI) / 180); _q.multiply(_q2);
  const sc = 0.92 + mulberry(seedOf(it) + 7)() * 0.16;
  return out.compose(_v2.copy(d).multiplyScalar(R - 0.04), _q, _s.set(sc, sc, sc));
}
function sanitize(data) {
  if (!Array.isArray(data)) return [];
  return data.filter((it) => Array.isArray(it) && ITEM_BY_ID[it[0]] && it.length >= 4 && it.slice(1, 4).every((n) => Number.isFinite(n)) && (it[1] || it[2] || it[3])).slice(0, MAX_ITEMS);
}
const walkerGeoCache = {};
function walkerGeo(type, seed) {
  const key = type + ':' + (seed % 8);
  return (walkerGeoCache[key] ||= mergeParts(buildPart[type](mulberry(seed % 8 + 11))));
}
let bladeGeo = null;

// ---------------------------------------------------------------- planets
const planets = [];
let mine = null, focus = null;
const _tint = new THREE.Color();

class Planet {
  constructor(d) {
    this.id = d.id; this.name = d.name || 'Tiny Planet'; this.tz = d.tz || 'UTC'; this.weather = d.weather || '';
    this.palette = (d.palette | 0) % PALETTES.length; this.items = sanitize(d.data); this.hearts = d.hearts | 0; this.visits = d.visits | 0;
    this.npc = !!d.npc; this.mine = !!d.mine; this.updated = d.updated_at || '';
    this.rand = mulberry([...this.id].reduce((a, c) => a * 31 + c.charCodeAt(0), 7) >>> 0);
    this.ring = this.rand() < 0.28 && !this.mine;
    this.group = new THREE.Group(); scene.add(this.group);
    this.mat = solidMat(); this.glowMat = new THREE.MeshBasicMaterial({ vertexColors: true });
    this.detail = false; this.walkersOn = false; this.walkers = []; this.spinners = []; this.popping = new Set();
    this.spawnT = 0; this.L = lightState(12); this.hour = 12; this.spin = (this.rand() - 0.5) * 0.06;
    this.buildBase(); this.updateTime();
  }
  buildBase() {
    if (this.sphere) { this.group.remove(this.sphere); this.sphere.geometry.dispose(); }
    const geo = new THREE.IcosahedronGeometry(R, mobile ? 3 : 4);
    const pal = PALETTES[this.palette]; const n = geo.attributes.position.count; const col = new Float32Array(n * 3); const c = new THREE.Color();
    const r = mulberry(this.palette * 97 + 3);
    for (let f = 0; f < n / 3; f++) {
      c.set(pal[Math.floor(r() * pal.length)]);
      for (let k = 0; k < 3; k++) col.set([c.r, c.g, c.b], (f * 3 + k) * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const parts = [geo];
    if (this.ring) {
      const ringCol = ['#e9d8b7', '#f3b6c4', '#c3b3e6', '#9ed9c4'][Math.floor(this.rand() * 4)];
      const ring = bakeParts([{ geo: new THREE.RingGeometry(R * 1.4, R * 1.8, 48, 1), color: ringCol }, { geo: new THREE.RingGeometry(R * 1.4, R * 1.8, 48, 1).rotateX(Math.PI), color: ringCol }], new THREE.Matrix4().makeRotationX(-Math.PI / 2 + 0.35));
      parts.push(...ring.solid);
    }
    this.sphere = new THREE.Mesh(parts.length > 1 ? mergeGeometries(parts) : geo, this.mat);
    this.sphere.receiveShadow = true; this.sphere.userData.planet = this;
    this.group.add(this.sphere);
  }
  buildDetail() {
    this.dropDetail(false);
    const out = { solid: [], glow: [] }; const m = new THREE.Matrix4();
    const list = this.visibleCount == null ? this.items : this.items.slice(0, this.visibleCount);
    this.bake ||= new Map(); const used = new Set();
    for (const it of list) {
      const def = ITEM_BY_ID[it[0]];
      if (def.walker || this.popping.has(it)) continue;
      let baked = this.bake.get(it);
      if (!baked || baked.rot !== it[4]) {
        itemMatrix(it, m); const o = bakeParts(def.build(mulberry(seedOf(it))), m);
        baked = { rot: it[4], solid: o.solid.length ? mergeGeometries(o.solid) : null, glow: o.glow.length ? mergeGeometries(o.glow) : null };
        this.bake.set(it, baked);
      }
      used.add(it); if (baked.solid) out.solid.push(baked.solid); if (baked.glow) out.glow.push(baked.glow);
      if (def.spin) {
        bladeGeo ||= mergeParts(buildPart.windmillBlades());
        const holder = new THREE.Object3D(); itemMatrix(it, holder.matrix); holder.matrixAutoUpdate = false;
        const blades = new THREE.Mesh(bladeGeo, this.mat); blades.position.set(0, 1.95, 0.48); blades.castShadow = true;
        holder.add(blades); this.group.add(holder); this.spinners.push({ holder, blades });
      }
    }
    if (out.solid.length) { this.solid = new THREE.Mesh(mergeGeometries(out.solid), this.mat); this.solid.castShadow = this.solid.receiveShadow = true; this.group.add(this.solid); }
    if (out.glow.length) { this.glow = new THREE.Mesh(mergeGeometries(out.glow), this.glowMat); this.group.add(this.glow); }
    if (this.visibleCount == null) for (const [k, g] of this.bake) if (!used.has(k)) { g.solid?.dispose(); g.glow?.dispose(); this.bake.delete(k); }
    this.detail = true;
  }
  dropDetail(all = true) {
    for (const k of ['solid', 'glow']) if (this[k]) { this.group.remove(this[k]); this[k].geometry.dispose(); this[k] = null; }
    for (const s of this.spinners) this.group.remove(s.holder);
    this.spinners = [];
    if (all) { this.detail = false; this.setWalkers(false); if (this.bake && !this.mine) { for (const g of this.bake.values()) { g.solid?.dispose(); g.glow?.dispose(); } this.bake.clear(); } }
  }
  setWalkers(on) {
    if (!on) { for (const w of this.walkers) this.group.remove(w.mesh); this.walkers = []; this.walkersOn = false; return; }
    this.walkersOn = true; this.syncWalkers();
  }
  syncWalkers() {
    if (!this.walkersOn) return;
    const want = new Set(this.items.filter((it) => ITEM_BY_ID[it[0]].walker));
    this.walkers = this.walkers.filter((w) => { if (w.it && !want.has(w.it)) { this.group.remove(w.mesh); return false; } return true; });
    const have = new Set(this.walkers.map((w) => w.it));
    for (const it of want) if (!have.has(it)) this.addWalker(it[0], itemDir(it), it);
    const homes = this.items.filter((it) => ITEM_BY_ID[it[0]].home || it[0] === 'chai' || it[0] === 'temple');
    const target = Math.min(10, 2 + homes.length);
    let people = this.walkers.filter((w) => !w.it);
    while (people.length < target) {
      const base = homes.length ? itemDir(homes[people.length % homes.length]) : new THREE.Vector3().randomDirection();
      const p = base.clone().add(new THREE.Vector3().randomDirection().multiplyScalar(0.12)).normalize();
      people.push(this.addWalker('person', p, null));
    }
    while (people.length > target) { const w = people.pop(); this.group.remove(w.mesh); this.walkers.splice(this.walkers.indexOf(w), 1); }
  }
  addWalker(type, p, it) {
    const seed = it ? seedOf(it) : Math.floor(Math.random() * 1e6);
    const mesh = new THREE.Mesh(walkerGeo(type, seed), this.mat); mesh.castShadow = !mobile;
    const h = new THREE.Vector3().randomDirection(); h.addScaledVector(p, -h.dot(p)).normalize();
    const w = { type, it, mesh, p: p.clone(), h, home: p.clone(), range: type === 'person' ? 0.5 : 0.28, speed: (ITEM_BY_ID[type].walker || 0.5) * 1.4,
      turn: 0, pause: Math.random() * 2, phase: Math.random() * 6, born: now() };
    this.group.add(mesh); this.walkers.push(w); this.placeWalker(w, 0);
    return w;
  }
  placeWalker(w, bob) {
    w.mesh.position.copy(w.p).multiplyScalar(R - 0.03 + bob);
    _v.crossVectors(w.p, w.h); _m.makeBasis(_v, w.p, w.h); w.mesh.quaternion.setFromRotationMatrix(_m);
    const age = now() - w.born; const sc = age < 0.6 ? elastic(age / 0.6) : 1; w.mesh.scale.setScalar(Math.max(0.001, sc));
  }
  updateWalkers(dt, t) {
    for (const w of this.walkers) {
      w.pause -= dt;
      let moving = w.pause < 0;
      if (w.pause < -4 - Math.random() * 6) w.pause = w.type === 'person' ? Math.random() * 1.5 : 1 + Math.random() * 4;
      if (moving) {
        w.turn = clamp(w.turn + (Math.random() - 0.5) * dt * 3, -0.9, 0.9);
        _q.setFromAxisAngle(w.p, w.turn * dt); w.h.applyQuaternion(_q);
        if (w.p.angleTo(w.home) > w.range) { _v.copy(w.home).addScaledVector(w.p, -w.home.dot(w.p)).normalize(); w.h.lerp(_v, 0.08).normalize(); }
        w.p.addScaledVector(w.h, (w.speed * dt) / R).normalize();
        w.h.addScaledVector(w.p, -w.h.dot(w.p)).normalize();
      }
      this.placeWalker(w, moving ? Math.abs(Math.sin(t * w.speed * 9 + w.phase)) * 0.07 : 0);
    }
    for (const s of this.spinners) s.blades.rotation.z += dt * 1.4;
  }
  updateTime() {
    this.hour = recording && this === recording.p ? recording.hour : cinema && this === focus ? (cinema.h0 + (now() - cinema.t0)) % 24 : peek && this === focus ? 12.5 : localHour(this.tz);
    this.L = lightState(this.hour);
    tintFor(this.L, _tint); this.mat.color.copy(_tint);
    const g = 0.72 + (1 - this.L.dl) * 0.6; this.glowMat.color.setRGB(g, g, g * (this.L.dl > 0.5 ? 0.9 : 1));
  }
  // ---- paper unfold: a small crumpled paper ball blossoms outward, facet by facet, into the globe
  startFold(delay = 0.3, dur = 2.6) {
    const pos = this.sphere.geometry.attributes.position; const a = pos.array; const nTri = pos.count / 3;
    const r = mulberry(7 + this.palette);
    const cen = new Float32Array(nTri * 3), start = new Float32Array(nTri * 3), axis = new Float32Array(nTri * 3), ang = new Float32Array(nTri), dl = new Float32Array(nTri);
    const front = new THREE.Vector3(0.1, 0.5, 1).normalize(); const v = new THREE.Vector3();
    for (let t = 0; t < nTri; t++) {
      const i = t * 9;
      v.set((a[i] + a[i + 3] + a[i + 6]) / 3, (a[i + 1] + a[i + 4] + a[i + 7]) / 3, (a[i + 2] + a[i + 5] + a[i + 8]) / 3);
      cen.set([v.x, v.y, v.z], t * 3);
      const len = v.length() || 1; const rb = R * (0.13 + r() * 0.06); // crumpled ball radius
      start.set([(v.x / len) * rb, (v.y / len) * rb, (v.z / len) * rb], t * 3);
      const ax = new THREE.Vector3(r() - 0.5, r() - 0.5, r() - 0.5).normalize(); axis.set([ax.x, ax.y, ax.z], t * 3);
      ang[t] = (0.6 + r() * 1.2) * Math.PI;
      // blossoms from the side facing you outwards, with a little paper randomness
      dl[t] = clamp((v.normalize().angleTo(front) / Math.PI) * 0.75 + r() * 0.25, 0, 1);
    }
    this.sphere.geometry.computeBoundingSphere(); this.sphere.geometry.computeBoundingBox(); // full-size bounds while it unfolds
    this.fold = { t0: now() + delay, dur, orig: Float32Array.from(a), cen, start, axis, ang, dl };
    this.dropDetail(); this.spawnT = 0; this.group.scale.setScalar(1); this.sphere.frustumCulled = false;
    this.applyFold(0, now());
  }
  applyFold(k, t) {
    const f = this.fold; const a = this.sphere.geometry.attributes.position.array; const nTri = a.length / 9;
    const off = _v2, q = _q2, ax = _s;
    const wobble = k <= 0 ? 1 + Math.sin(t * 9) * 0.06 : 1; // the ball breathes before it opens
    for (let tr = 0; tr < nTri; tr++) {
      const kv = clamp((k - f.dl[tr] * 0.5) / 0.5, 0, 1);
      const e = kv < 1 ? 1 + 2.2 * Math.pow(kv - 1, 3) + 1.2 * Math.pow(kv - 1, 2) : 1; // ease-out with a soft overshoot
      const shrink = 0.18 + 0.82 * clamp(kv * 1.3, 0, 1);
      const c3 = tr * 3;
      const cx = (f.start[c3] + (f.cen[c3] - f.start[c3]) * e) * wobble, cy = (f.start[c3 + 1] + (f.cen[c3 + 1] - f.start[c3 + 1]) * e) * wobble, cz = (f.start[c3 + 2] + (f.cen[c3 + 2] - f.start[c3 + 2]) * e) * wobble;
      q.setFromAxisAngle(ax.set(f.axis[c3], f.axis[c3 + 1], f.axis[c3 + 2]), f.ang[tr] * (1 - clamp(kv * 1.15, 0, 1)));
      for (let k3 = 0; k3 < 3; k3++) {
        const i = tr * 9 + k3 * 3;
        off.set(f.orig[i] - f.cen[c3], f.orig[i + 1] - f.cen[c3 + 1], f.orig[i + 2] - f.cen[c3 + 2]).multiplyScalar(shrink).applyQuaternion(q);
        a[i] = cx + off.x; a[i + 1] = cy + off.y; a[i + 2] = cz + off.z;
      }
    }
    _s.set(1, 1, 1);
    this.sphere.geometry.attributes.position.needsUpdate = true;
    this.group.rotation.y = -1.1 * (1 - easeIO(clamp(k, 0, 1)));
  }
  updateFold(t) {
    const f = this.fold; const k = (t - f.t0) / f.dur;
    if (k < 1) { this.applyFold(Math.max(0, k), t); return; }
    this.sphere.geometry.attributes.position.array.set(f.orig); this.sphere.geometry.attributes.position.needsUpdate = true;
    // the bounding sphere was measured while the planet was a tiny paper ball: re-measure, or taps miss the planet
    this.sphere.geometry.computeBoundingSphere(); this.sphere.geometry.computeBoundingBox();
    this.sphere.frustumCulled = true; this.group.rotation.y = 0; this.fold = null;
    this.buildDetail(); this.setWalkers(true); this.growT = t;
    puff(this.group.position.clone().add(_v.copy(camera.position).sub(this.group.position).normalize().multiplyScalar(R)), _v.clone(), ['#fffaf0', '#f2c14e', '#ec8fa3', '#9ed9c4']);
  }
  updateGrow(t) { // items rise out of the ground after the fold
    const k = (t - this.growT) / 0.9; const sc = k >= 1 ? 1 : 0.72 + 0.28 * elastic(k);
    for (const m of [this.solid, this.glow]) if (m) m.scale.setScalar(sc);
    for (const w of this.walkers) w.born = Math.max(w.born, this.growT);
    if (k >= 1) this.growT = 0;
  }
  serialize() { return { id: this.id, name: this.name, palette: this.palette, data: this.items, weather: this.weather }; }
}

// ---------------------------------------------------------------- starter & NPC planets
function randDirNear(r, center, spread) {
  return center.clone().add(new THREE.Vector3(r() - 0.5, r() - 0.5, r() - 0.5).multiplyScalar(spread)).normalize();
}
const toTuple = (type, d, rot) => [type, Math.round(d.x * 1000), Math.round(d.y * 1000), Math.round(d.z * 1000), Math.round(rot) % 360];
function starterItems(seed) {
  const r = mulberry(seed); const front = new THREE.Vector3(0.05, 1, 0.5).normalize(); const out = [];
  const placed = [];
  const put = (type, spread, minGap = 0.16) => {
    for (let tries = 0; tries < 30; tries++) {
      const d = randDirNear(r, front, spread);
      if (placed.every((p) => p.angleTo(d) > minGap)) { placed.push(d); out.push(toTuple(type, d, r() * 360)); return; }
    }
  };
  put('house', 0.6, 0.25); put('temple', 1.2, 0.3); put('chai', 0.8, 0.22); put('pond', 1.1, 0.3); put('palm', 1.0); put('tree', 1.4); put('pine', 1.6);
  put('tree', 1.8); put('flowers', 1.0); put('rangoli', 0.8, 0.2); put('lamp', 0.7); put('cow', 1.0); put('hut', 1.6, 0.25); put('banyan', 2.2, 0.3);
  put('pine', 2.4); put('flowers', 2.0); put('bush', 1.4); put('peacock', 1.2); put('mountain', 2.6, 0.4); put('diya', 0.7, 0.1);
  return out;
}
const NPC_NAMES = ['Kerala Breeze', 'Masala Moon', 'Monsoon Meadow', 'Jaipur Pink', 'Lotus Lagoon', 'Chai Cove', 'Himalaya Hush', 'Mango Grove', 'Goa Drift', 'Rangoli Ridge', 'Marigold Mesa', 'Sundarbans Snooze', 'Ladakh Lull', 'Mysore Mist'];
const NPC_TZ = ['Asia/Kolkata', 'Europe/London', 'America/New_York', 'Asia/Tokyo', 'Australia/Sydney', 'America/Los_Angeles', 'Asia/Dubai', 'Europe/Berlin', 'Asia/Singapore', 'America/Sao_Paulo'];
function npcPlanet(i) {
  const r = mulberry(1000 + i * 77);
  const items = []; const n = 14 + Math.floor(r() * 26);
  const pool = ['pine', 'tree', 'tree', 'palm', 'flowers', 'bush', 'rock', 'house', 'house', 'hut', 'temple', 'chai', 'pond', 'lotus', 'banyan', 'windmill', 'lighthouse', 'tent', 'cow', 'sheep', 'elephant', 'peacock', 'rangoli', 'diya', 'lamp', 'mountain', 'palace', 'rickshaw', 'well'];
  for (let k = 0; k < n; k++) { const d = new THREE.Vector3(r() - 0.5, r() - 0.5, r() - 0.5).normalize(); items.push(toTuple(pool[Math.floor(r() * pool.length)], d, r() * 360)); }
  return { id: 'npc' + i, name: NPC_NAMES[i % NPC_NAMES.length], tz: NPC_TZ[i % NPC_TZ.length], palette: Math.floor(r() * PALETTES.length), data: items, npc: true, hearts: Math.floor(r() * 40) };
}

// ---------------------------------------------------------------- network
const api = async (path, opts = {}) => {
  const res = await fetch(`${SB_URL}/rest/v1/${path}`, { ...opts, headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json', ...(opts.headers || {}) } });
  if (!res.ok) throw new Error(await res.text());
  const t = await res.text(); return t ? JSON.parse(t) : null;
};
// Cards are tiny (no buildings); a planet's buildings are fetched only when you get close to it.
const CARD = 'select=id,name,tz,weather,palette,item_count,hearts,visits,updated_at';
const FULL = CARD + ',data';
const PAGE = 60, MAX_PLANETS = 180;
const net = { ok: true, warned: false, poll: 30, newest: '', oldest: '', more: true };
let saveTimer = null, saving = false;
function scheduleSave(delay = 1500) {
  store.set('tp_planet', mine.serialize());
  clearTimeout(saveTimer); saveTimer = setTimeout(savePlanet, delay);
}
let saveFails = 0;
async function savePlanet() {
  if (saving) { scheduleSave(800); return; }
  saving = true;
  try {
    await api('rpc/save_planet', { method: 'POST', body: JSON.stringify({ p_id: mine.id, p_secret: me.secret, p_name: mine.name, p_tz: myTz, p_weather: mine.weather || null, p_palette: mine.palette, p_data: mine.items }) });
    if (!me.saved) { me.saved = true; store.set('tp_me', me); }
    saveFails = 0; netUp();
  } catch (e) {
    console.warn('save failed', e); netDown();
    // your planet is always kept on this device; keep retrying gently in the background
    saveFails++; clearTimeout(saveTimer); saveTimer = setTimeout(savePlanet, Math.min(300, 10 * 2 ** saveFails) * 1000);
  }
  saving = false;
}
function netDown() { net.ok = false; if (!net.warned) { net.warned = true; toast('The shared universe is taking a nap 😴 Your planet is safe on this device.', 3800); } }
function netUp() { if (!net.ok && net.warned) toast('Back online 🪐'); net.ok = true; net.warned = false; }
const bump = (id, kind) => api('rpc/bump_planet', { method: 'POST', body: JSON.stringify({ p_id: id, p_kind: kind }) }).catch(() => {});

function addPlanet(row) {
  const p = new Planet(row); planets.push(p); return p;
}
function applyRow(row) {
  if (!row || row.id === me.id || !/^[a-z0-9]{6,12}$/.test(row.id)) return false;
  if (!net.newest || row.updated_at > net.newest) net.newest = row.updated_at;
  if (!net.oldest || row.updated_at < net.oldest) net.oldest = row.updated_at;
  const ex = planets.find((p) => p.id === row.id);
  if (ex) {
    if (ex.updated === row.updated_at) return false;
    Object.assign(ex, { name: row.name, tz: row.tz || 'UTC', weather: row.weather || '', hearts: row.hearts | 0, visits: row.visits | 0, updated: row.updated_at, itemCount: row.item_count | 0 });
    if (ex.palette !== (row.palette | 0)) { ex.palette = row.palette | 0; ex.buildBase(); }
    if (row.data) { ex.items = sanitize(row.data); ex.needsData = false; if (ex.detail) { ex.buildDetail(); ex.syncWalkers(); } }
    else { ex.needsData = true; if (ex.detail) requestData(ex); }
    if (ex.label) ex.label.firstChild.textContent = ex.name;
    return false;
  }
  if (planets.length >= MAX_PLANETS) { // make room: drop a sample planet, else the oldest far-away one
    const victim = planets.find((p) => p.npc && p !== focus) || [...planets].filter((p) => !p.mine && p !== focus).sort((a, b) => (a.updated < b.updated ? -1 : 1))[0];
    if (!victim) return false;
    removePlanet(victim);
  }
  const sample = planets.find((q) => q.npc && q !== focus);
  if (sample && planets.filter((q) => !q.npc && !q.mine).length >= 8) removePlanet(sample);
  const p = addPlanet({ ...row, data: row.data || [] }); p.needsData = !row.data; p.itemCount = row.item_count | 0; p.spawnT = now() + Math.random() * 0.6;
  return true;
}
function removePlanet(p) {
  p.dropDetail(); scene.remove(p.group); p.sphere.geometry.dispose(); p.mat.dispose(); p.glowMat.dispose();
  p.label?.remove(); planets.splice(planets.indexOf(p), 1);
}
// buildings are fetched in small batches, only for planets you are near
const dataQueue = new Set(); let dataTimer = null;
function requestData(p) {
  if (p.npc || p.mine || p.loadingData) return;
  dataQueue.add(p.id); p.loadingData = true;
  clearTimeout(dataTimer); dataTimer = setTimeout(flushData, 60);
}
async function flushData() {
  const ids = [...dataQueue].slice(0, 12); ids.forEach((id) => dataQueue.delete(id));
  if (dataQueue.size) dataTimer = setTimeout(flushData, 200);
  try {
    const rows = await api(`planets?select=id,data,updated_at&id=in.(${ids.join(',')})`);
    for (const row of rows || []) {
      const p = planets.find((q) => q.id === row.id); if (!p) continue;
      p.items = sanitize(row.data); p.needsData = false; p.loadingData = false;
      if (p.detail || p === focus) { p.buildDetail(); p.syncWalkers(); p.growT = now(); }
    }
    netUp();
  } catch (e) { netDown(); }
  for (const id of ids) { const p = planets.find((q) => q.id === id); if (p) p.loadingData = false; }
}
async function loadUniverse(first) {
  let rows = null;
  if (first) {
    // instant start from the last universe we saw on this device, then refresh
    const cached = store.get('tp_universe', null);
    if (cached?.rows?.length) for (const r of cached.rows) applyRow(r);
  }
  try {
    const q = first || !net.newest ? `planets?${CARD}&order=updated_at.desc&limit=${PAGE}` : `planets?${CARD}&updated_at=gt.${encodeURIComponent(net.newest)}&order=updated_at.desc&limit=30`;
    rows = await api(q); netUp(); net.poll = 30;
  } catch (e) { console.warn(e); netDown(); net.poll = Math.min(600, net.poll * 2); }
  if (first && sharedId && sharedId !== me.id && !planets.find((p) => p.id === sharedId)) {
    try { const one = await api(`planets?${FULL}&id=eq.${encodeURIComponent(sharedId)}`); if (one?.length) (rows ||= []).unshift(one[0]); } catch {}
  }
  let added = false;
  for (const row of rows || []) added = applyRow(row) || added;
  if (first && rows) store.set('tp_universe', { at: Date.now(), rows: rows.slice(0, PAGE).map(({ data, ...r }) => r) });
  const real = planets.filter((p) => !p.npc && !p.mine).length;
  if (first) for (let i = 0; i < Math.max(0, 8 - real); i++) { const p = addPlanet(npcPlanet(i)); p.spawnT = now() + 0.3 + i * 0.07; added = true; }
  if (rows && first) net.more = rows.length >= PAGE;
  if (added || first) layout();
  return rows;
}
async function loadMore() {
  if (!net.more || !net.oldest) { toast("You've seen every planet out there 🌌"); return; }
  const btn = $('#btnMore'); btn.disabled = true; btn.textContent = '✨ Finding planets…';
  try {
    const rows = await api(`planets?${CARD}&updated_at=lt.${encodeURIComponent(net.oldest)}&order=updated_at.desc&limit=${PAGE}`);
    let n = 0; for (const r of rows) n += applyRow(r) ? 1 : 0;
    net.more = rows.length >= PAGE; layout();
    toast(n ? `${n} more tiny planets drifted in ✨` : "You've seen every planet out there 🌌");
    if (n && mode === 'universe') enterUniverse();
  } catch { netDown(); }
  btn.disabled = false; btn.textContent = '✨ More planets';
}
function schedulePoll() { setTimeout(async () => { if (!document.hidden) await loadUniverse(false); schedulePoll(); }, net.poll * 1000); }
// count real players' planets (yours included), not the sample planets that keep a new universe from feeling empty
const playerCount = () => planets.filter((p) => !p.npc).length;
function uniMeta() { const n = playerCount(), k = planets.length - n; return `${n} player planet${n === 1 ? '' : 's'}${k ? ` + ${k} sample${k === 1 ? '' : 's'}` : ''}`; }
function layout() {
  // home planet at origin; shared planet first so it sits close by
  // each planet keeps its place in the sky once it has one, so the universe doesn't reshuffle
  const others = planets.filter((p) => !p.mine);
  const taken = new Set(others.filter((p) => p.slot != null).map((p) => p.slot));
  let next = 0;
  others.sort((a, b) => (b.id === sharedId) - (a.id === sharedId) || (a.npc - b.npc));
  for (const p of others) if (p.slot == null) { while (taken.has(next)) next++; p.slot = next; taken.add(next); }
  others.forEach((p) => {
    const i = p.slot;
    const a = i * 2.39996 + 0.6, rad = 62 + 26 * Math.sqrt(i);
    p.group.position.set(Math.cos(a) * rad, (((i * 37) % 11) - 5) * 6, Math.sin(a) * rad);
  });
  $('#uniCount').textContent = playerCount();
  if (mode === 'universe') $('#planetMeta').textContent = uniMeta();
}

// ---------------------------------------------------------------- scenery: sun, moon, clouds, stars, weather
const sunMesh = new THREE.Mesh(mergeParts([
  { geo: new THREE.CylinderGeometry(2.2, 2.2, 0.3, 14).rotateX(Math.PI / 2), color: '#ffd166' },
  ...Array.from({ length: 10 }, (_, i) => ({ geo: new THREE.ConeGeometry(0.6, 1.4, 3).translate(0, 3.1, 0).rotateZ((i / 10) * Math.PI * 2), color: '#ffb347' })),
]), new THREE.MeshBasicMaterial({ vertexColors: true }));
const moonMesh = new THREE.Mesh(mergeParts([
  { geo: new THREE.CylinderGeometry(1.8, 1.8, 0.3, 14).rotateX(Math.PI / 2), color: '#fff3c4' },
  { geo: new THREE.CylinderGeometry(0.35, 0.35, 0.34, 8).rotateX(Math.PI / 2).translate(0.6, 0.5, 0), color: '#efdfa8' },
  { geo: new THREE.CylinderGeometry(0.25, 0.25, 0.34, 8).rotateX(Math.PI / 2).translate(-0.5, -0.6, 0), color: '#efdfa8' },
]), new THREE.MeshBasicMaterial({ vertexColors: true }));
scene.add(sunMesh, moonMesh);

const cloudMat = solidMat();
const clouds = new THREE.Group(); scene.add(clouds);
{
  const r = mulberry(42);
  for (let i = 0; i < 7; i++) {
    const parts = []; const n = 3 + Math.floor(r() * 2);
    for (let k = 0; k < n; k++) parts.push({ geo: new THREE.IcosahedronGeometry(0.6 + r() * 0.5, 1).scale(1, 0.6, 0.8).translate((k - n / 2) * 0.9, r() * 0.3, r() * 0.4), color: '#ffffff' });
    const m = new THREE.Mesh(mergeParts(parts), cloudMat); m.castShadow = !mobile;
    const d = new THREE.Vector3(r() - 0.5, r() * 0.8 - 0.1, r() - 0.5).normalize();
    m.position.copy(d).multiplyScalar(R + 4.5 + r() * 2); m.quaternion.setFromUnitVectors(UP, d);
    m.userData.extra = i >= 4; clouds.add(m);
  }
}
const starGeo = (() => { const s = new THREE.Shape(); for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2 + Math.PI / 2, rr = i % 2 ? 0.42 : 1; i ? s.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : s.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); } return new THREE.ShapeGeometry(s); })();
const starMat = new THREE.MeshBasicMaterial({ color: '#fff6d8', transparent: true, opacity: 0, depthWrite: false });
const stars = new THREE.InstancedMesh(starGeo, starMat, 320);
{
  const o = new THREE.Object3D(); const r = mulberry(9);
  for (let i = 0; i < 320; i++) { o.position.set(r() - 0.5, r() - 0.5, r() - 0.5).normalize().multiplyScalar(1400 + r() * 300); o.lookAt(0, 0, 0); o.rotateZ(r() * 6); o.scale.setScalar(4 + r() * 9); o.updateMatrix(); stars.setMatrixAt(i, o.matrix); }
  stars.frustumCulled = false; scene.add(stars);
}
// weather particles: paper strips (rain) and paper confetti (snow)
const WN = mobile ? 140 : 280;
const weatherMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, transparent: true, opacity: 0.9 }), WN);
weatherMesh.frustumCulled = false; weatherMesh.visible = false; scene.add(weatherMesh);
const wp = Array.from({ length: WN }, () => ({ d: new THREE.Vector3().randomDirection(), r: R + 2 + Math.random() * 9, spin: Math.random() * 6, v: 0.8 + Math.random() * 0.5 }));
let weatherKind = 'none';
function setWeatherKind(kind) {
  const k = kind === 'storm' ? 'rain' : kind;
  if (k === weatherKind) return; weatherKind = k;
  const c = new THREE.Color(); const confetti = ['#ffffff', '#ffffff', '#f3b6c4', '#cfe6ee', '#fff1b8'];
  for (let i = 0; i < WN; i++) { c.set(k === 'snow' ? confetti[i % confetti.length] : i % 3 ? '#cfe9f5' : '#ffffff'); weatherMesh.setColorAt(i, c); }
  weatherMesh.instanceColor && (weatherMesh.instanceColor.needsUpdate = true);
  weatherMesh.visible = k === 'rain' || k === 'snow';
}
const _o = new THREE.Object3D(), _eu = new THREE.Euler();
function updateWeather(dt) {
  if (!weatherMesh.visible || !focus) return;
  const rain = weatherKind === 'rain'; const c = focus.group.position;
  for (let i = 0; i < WN; i++) {
    const p = wp[i]; p.r -= dt * (rain ? 9 : 1.6) * p.v;
    if (p.r < R + 0.1) { p.r = R + 9 + Math.random() * 3; p.d.randomDirection(); }
    _o.position.copy(p.d).multiplyScalar(p.r).add(c);
    if (rain) { _o.quaternion.setFromUnitVectors(UP, p.d); _o.scale.set(0.05, 0.75, 1); }
    else { p.spin += dt * 2; _o.quaternion.setFromEuler(_eu.set(p.spin, p.spin * 0.7, 0)); _o.scale.set(0.2, 0.14, 1); }
    _o.updateMatrix(); weatherMesh.setMatrixAt(i, _o.matrix);
  }
  weatherMesh.instanceMatrix.needsUpdate = true;
}
// paper confetti burst when placing
const burst = [];
const burstGeo = new THREE.PlaneGeometry(0.22, 0.16);
function puff(worldPos, normal, colors) {
  for (let i = 0; i < 9; i++) {
    const m = new THREE.Mesh(burstGeo, new THREE.MeshBasicMaterial({ color: colors[i % colors.length], side: THREE.DoubleSide, transparent: true }));
    m.position.copy(worldPos);
    const v = new THREE.Vector3().randomDirection().multiplyScalar(2.5).addScaledVector(normal, 3.5);
    scene.add(m); burst.push({ m, v, life: 0.8, rot: new THREE.Vector3(Math.random() * 8, Math.random() * 8, 0) });
  }
}
function updateBurst(dt) {
  for (let i = burst.length - 1; i >= 0; i--) {
    const b = burst[i]; b.life -= dt;
    b.m.position.addScaledVector(b.v, dt); b.v.multiplyScalar(0.92);
    b.m.rotation.x += b.rot.x * dt; b.m.rotation.y += b.rot.y * dt; b.m.material.opacity = clamp(b.life / 0.4, 0, 1);
    if (b.life <= 0) { scene.remove(b.m); b.m.material.dispose(); burst.splice(i, 1); }
  }
}

// ---------------------------------------------------------------- sky / lighting per focused planet
let peek = false, mode = 'intro';
const SKY = { night: ['#18204a', '#47508f'], day: ['#8fcbe8', '#f6efdc'], dusk: ['#f0998a', '#ffd6a0'], twilight: ['#3f3a7a', '#c6879f'], space: ['#1b1f4a', '#5a4a86'] };
const cA = new THREE.Color(), cB = new THREE.Color(), cC = new THREE.Color();
let skyTop = '#8fcbe8', skyBottom = '#f6efdc';
const SKY_STOPS = [[-0.35, 'night'], [-0.12, 'twilight'], [0.06, 'dusk'], [0.35, 'day']];
function mixSky(L, i) {
  const s = clamp(L.s, -0.35, 0.35);
  for (let k = 0; k < SKY_STOPS.length - 1; k++) {
    const [s0, n0] = SKY_STOPS[k], [s1, n1] = SKY_STOPS[k + 1];
    if (s <= s1) { cA.set(SKY[n0][i]).lerp(cB.set(SKY[n1][i]), smooth(s0, s1, s)); return '#' + cA.getHexString(); }
  }
  return SKY.day[i];
}
let lastSkyKey = '';
function applySky(dt) {
  let top, bottom, starO;
  if (mode === 'universe') { top = SKY.space[0]; bottom = SKY.space[1]; starO = 0.95; }
  else { const L = (focus || mine).L; top = mixSky(L, 0); bottom = mixSky(L, 1); starO = (1 - L.dl) * 0.95; }
  starMat.opacity += (starO - starMat.opacity) * Math.min(1, dt * 3);
  const key = top + bottom;
  if (key !== lastSkyKey) {
    lastSkyKey = key; skyTop = top; skyBottom = bottom;
    document.documentElement.style.setProperty('--sky-top', top); document.documentElement.style.setProperty('--sky-bottom', bottom);
  }
}
function updateSunLight() {
  const p = focus || mine; const c = p.group.position; const L = p.L;
  const dir = new THREE.Vector3(Math.cos(L.theta), Math.sin(L.theta), 0.55).normalize();
  sunMesh.position.copy(dir).multiplyScalar(34).add(c); moonMesh.position.copy(dir).multiplyScalar(-34).add(c);
  sunMesh.lookAt(camera.position); moonMesh.lookAt(camera.position);
  const day = L.s > -0.05;
  const ld = day ? dir : dir.clone().negate();
  sun.position.copy(ld).multiplyScalar(40).add(c); sun.target.position.copy(c);
  sun.intensity = day ? 0.6 + 1.6 * L.dl : 0.9; sun.color.set(day ? (L.tw > 0.5 ? '#ffc89a' : '#fff0d4') : '#b9c8ff');
  hemi.intensity = 0.9 + 0.75 * L.dl;
  const show = mode !== 'universe';
  sunMesh.visible = show && L.s > -0.1; moonMesh.visible = show && L.s < 0.1;
  clouds.position.copy(c);
  const w = p.weather;
  cloudMat.color.copy(tintFor(L, _tint)).multiplyScalar(w === 'rain' || w === 'storm' ? 0.72 : 1);
  clouds.children.forEach((m) => (m.visible = show && (!m.userData.extra || ['rain', 'storm', 'cloud', 'snow'].includes(w))));
  setWeatherKind(show ? w : '');
}

// ---------------------------------------------------------------- labels & bubbles
const labelsEl = $('#labels');
function ensureLabel(p) {
  if (p.label) return p.label;
  const el = document.createElement('div'); el.className = 'plabel' + (p.mine ? ' me' : '');
  el.innerHTML = '<span></span> <small></small>';
  el.firstChild.textContent = p.mine ? 'You · ' + p.name : p.npc ? p.name + ' (sample)' : p.name;
  labelsEl.appendChild(el); p.label = el; return el;
}
const _proj = new THREE.Vector3();
let labelTick = 0;
function updateLabels(t) {
  const updateText = t - labelTick > 2; if (updateText) labelTick = t;
  for (const p of planets) {
    const el = ensureLabel(p);
    const hide = (!introDone && t - introT0 < 3.2) || ((mode === 'focus' || !introDone) && p === focus) || p.group.scale.x < 0.3;
    _proj.copy(p.group.position); _proj.y += R * 1.25;
    const dist = camera.position.distanceTo(p.group.position);
    _proj.project(camera);
    if (hide || _proj.z > 1 || Math.abs(_proj.x) > 1.1 || Math.abs(_proj.y) > 1.1 || dist > 900) { el.style.display = 'none'; continue; }
    el.style.display = '';
    el.style.transform = `translate(${((_proj.x + 1) / 2) * innerWidth}px, ${((1 - _proj.y) / 2) * innerHeight}px) translate(-50%, -100%)`;
    if (updateText) { el.firstChild.textContent = (p.mine ? 'You · ' : '') + p.name; el.lastChild.textContent = `${p.L.dl > 0.5 ? '☀️' : '🌙'} ${timeLabel(p.hour)}`; }
  }
}
const bubbleEl = $('#bubble');
let bubble = null, nextChatter = now() + 9;
const LINES = {
  temple: ['Jai ho! 🙏', 'So peaceful here'], chai: ['Ek cutting chai! ☕', 'Chai pe charcha?'], rickshaw: ['Bhaiya, meter se? 🛺'],
  house: ['New neighbours! 🏡', 'Housewarming party?'], hut: ['Cozy little hut 🛖'], tree: ['Fresh air ✨', 'Shade at last 🌳'], pine: ['Smells like hills 🌲'],
  palm: ['Nariyal paani? 🥥'], banyan: ['Swing time! 🌳'], flowers: ['Smells lovely 🌸'], pond: ['Splash! 💦'], lotus: ['Kamal ke phool 🪷'],
  cow: ['Moo 🐄'], elephant: ['Ganpati vibes 🐘'], peacock: ['Dance, mor! 🦚'], dog: ['Good boy! 🐕'], sheep: ['Baa 🐑'], person: ['Hello, friend! 👋'],
  diya: ['Roshni! ✨'], rangoli: ['So colourful! 🎨'], mountain: ['Trek this weekend? ⛰️'], palace: ['Wah, so grand! 🤍'], lamp: ['Now I can see 💡'],
  windmill: ['Wheee 🌬️'], lighthouse: ['Ships ahoy ⚓'], road: ['Road trip! 🚗'], path: ['Nice stroll 🚶'], tent: ['Camping! ⛺'], well: ['Fresh water 💧'], fence: ['Neat and tidy'],
};
const IDLE = {
  day: ['What a lovely day ☀️', 'Kitna sundar! 💛', 'Garam chai, anyone?', 'I love this planet', 'Build me a temple? 🛕'],
  night: ['Goodnight stars 🌙', 'So sleepy… 😴', 'Look, the moon!', 'Chai before bed?'],
  rain: ['Baarish! ☔', 'Pakode time 🌧️'], snow: ['Brrr ❄️', 'Snowball fight!'], visit: ['Welcome, traveller! 👋', 'Visiting? Namaste! 🙏', 'Like our planet?'],
};
function say(w, text, dur = 2.8) {
  bubble = { w, until: now() + dur, planet: focus }; bubbleEl.textContent = text;
  bubbleEl.classList.remove('hidden'); bubbleEl.style.animation = 'none'; void bubbleEl.offsetWidth; bubbleEl.style.animation = '';
}
function updateBubble(t) {
  if (bubble && (t > bubble.until || mode !== 'focus' || bubble.planet !== focus || !focus.walkers.includes(bubble.w))) { bubble = null; bubbleEl.classList.add('hidden'); }
  if (bubble) {
    bubble.w.mesh.getWorldPosition(_proj); _proj.addScaledVector(_v.copy(bubble.w.p), 1.0); _proj.project(camera);
    const bw = bubbleEl.offsetWidth / 2 + 8;
    bubbleEl.style.transform = `translate(${clamp(((_proj.x + 1) / 2) * innerWidth, bw, innerWidth - bw)}px, ${((1 - _proj.y) / 2) * innerHeight}px) translate(-50%, -100%)`;
  }
  if (mode === 'focus' && focus && t > nextChatter && !fly) {
    nextChatter = t + 11 + Math.random() * 9;
    const people = visibleWalkers().filter((w) => w.type === 'person');
    if (people.length) {
      const w = people[Math.floor(Math.random() * people.length)];
      const pool = !focus.mine ? IDLE.visit : focus.weather === 'rain' || focus.weather === 'storm' ? IDLE.rain : focus.weather === 'snow' ? IDLE.snow : focus.L.dl > 0.5 ? IDLE.day : IDLE.night;
      say(w, pool[Math.floor(Math.random() * pool.length)]);
    }
  }
}
function visibleWalkers() {
  const camDir = _v2.copy(camera.position).sub(focus.group.position).normalize();
  return focus.walkers.filter((w) => w.mesh.getWorldPosition(_v).sub(focus.group.position).normalize().dot(camDir) > 0.35);
}

// ---------------------------------------------------------------- camera flights & modes
let fly = null;
function focusDist() { const a = camera.aspect; return (R / 10) * (a >= 1 ? 38 : clamp(31 / a, 38, 78)); }
function flyTo(planet, dur = 1.7, fromFar = false) {
  setFocus(planet);
  const toT = planet.group.position.clone();
  let dir = camera.position.clone().sub(toT).normalize();
  if (fromFar || dir.y < 0.15 || dir.y > 0.75) { dir = camera.position.clone().sub(toT).setY(0).normalize(); dir.y = 0.42; dir.normalize(); }
  if (!isFinite(dir.x)) dir.set(0, 0.42, 1).normalize();
  fly = { fromPos: camera.position.clone(), fromT: controls.target.clone(), toT, toPos: toT.clone().add(dir.multiplyScalar(focusDist())), t0: now(), dur };
  mode = 'focus'; controls.enabled = false; updateUI();
}
function enterUniverse() {
  mode = 'universe'; updateUI(); hideHint();
  const c = new THREE.Vector3(); planets.forEach((p) => c.add(p.group.position)); c.divideScalar(planets.length);
  let ext = 0; planets.forEach((p) => (ext = Math.max(ext, p.group.position.distanceTo(c))));
  const dist = clamp(ext * 2.1 / Math.min(1, camera.aspect * 1.2), 160, 1100);
  const dir = camera.position.clone().sub(controls.target).normalize(); dir.y = Math.max(dir.y, 0.5); dir.normalize();
  fly = { fromPos: camera.position.clone(), fromT: controls.target.clone(), toT: c, toPos: c.clone().add(dir.multiplyScalar(dist)), t0: now(), dur: 1.6 };
  controls.enabled = false;
}
function updateFly(t) {
  if (!fly) return;
  const k = clamp((t - fly.t0) / fly.dur, 0, 1); const e = easeIO(k);
  controls.target.lerpVectors(fly.fromT, fly.toT, e);
  camera.position.lerpVectors(fly.fromPos, fly.toPos, e);
  camera.position.y += Math.sin(Math.PI * k) * fly.fromPos.distanceTo(fly.toPos) * 0.12;
  camera.lookAt(controls.target);
  if (k >= 1) {
    fly = null; controls.enabled = true;
    if (introDone === false) finishIntro();
    if (mode === 'focus') { const d = focusDist(); controls.minDistance = R * 1.5; controls.maxDistance = d * 1.9; if (introDone && focus === mine && needsName()) askName(true); }
    else { controls.minDistance = 40; controls.maxDistance = 1600; }
  }
}
const visited = new Set();
function setFocus(p) {
  if (focus && focus !== p) focus.updateTime();
  focus = p;
  if (!p.mine && !p.npc && !visited.has(p.id)) { visited.add(p.id); bump(p.id, 'visit'); }
  p.updateTime(); lod(true); updateUI();
}

// ---------------------------------------------------------------- LOD
let lodT = 0;
function lod(force) {
  const t = now(); if (!force && t - lodT < 0.5) return; lodT = t;
  const ranked = planets.map((p) => ({ p, d: camera.position.distanceTo(p.group.position) })).sort((a, b) => a.d - b.d);
  const maxDetail = mobile ? 4 : 9; let built = 0;
  ranked.forEach(({ p, d }, i) => {
    if (p.fold) return;
    const wantDetail = p === focus || p === mine || (i < maxDetail && d < 420);
    if (wantDetail && p.needsData) requestData(p);
    if (wantDetail && !p.detail && (built < 2 || p === focus || force)) { p.buildDetail(); built++; }
    else if (!wantDetail && p.detail && d > 520) p.dropDetail();
    const wantWalk = p.detail && (p === focus || d < 70);
    if (wantWalk !== p.walkersOn) p.setWalkers(wantWalk);
  });
}

// ---------------------------------------------------------------- UI
let tool = 'tree', cat = 'nature';
const undoStack = [];
const catsEl = $('#cats'), itemsEl = $('#items');
function renderCats() {
  catsEl.innerHTML = '';
  for (const c of CATS) {
    const b = document.createElement('button'); b.className = 'chip' + (c.id === cat ? ' on' : ''); b.textContent = `${c.emoji} ${c.name}`;
    b.onclick = () => { cat = c.id; renderCats(); renderItems(); itemsEl.scrollLeft = 0; };
    catsEl.appendChild(b);
  }
}
function renderItems() {
  itemsEl.innerHTML = '';
  for (const it of ITEMS.filter((i) => i.cat === cat)) {
    const b = document.createElement('button'); b.className = 'item' + (tool === it.id ? ' on' : '');
    b.innerHTML = `<span class="e">${it.emoji}</span><span class="n">${it.name}</span>`;
    b.onclick = () => { setTool(it.id); };
    itemsEl.appendChild(b);
  }
  document.querySelectorAll('.tool').forEach((b) => b.classList.toggle('on', b.dataset.tool === tool));
}
function setTool(t) { tool = t; chainPrev = null; renderItems(); updateGhost(); hideHint(); }
document.querySelectorAll('.tool').forEach((b) => (b.onclick = () => setTool(b.dataset.tool)));
$('#btnUndo').onclick = () => {
  while (undoStack.length) { const it = undoStack.pop(); const i = mine.items.indexOf(it); if (i >= 0) { removeItem(mine, i); return; } }
  toast('Nothing to undo');
};
function updateUI() {
  const p = focus || mine; const vis = mode === 'focus' && p && !p.mine;
  document.body.classList.toggle('visiting', vis || mode === 'universe');
  $('#top').classList.toggle('hidden', !introDone);
  $('#side').classList.toggle('hidden', !introDone);
  $('#btnMusic').classList.toggle('hidden', !introDone);
  $('#credit').classList.toggle('hidden', !introDone);
  $('#dock').classList.toggle('hidden', !(mode === 'focus' && p.mine));
  $('#visit').classList.toggle('hidden', !vis);
  $('#universeBar').classList.toggle('hidden', mode !== 'universe');
  $('#btnUniverse').classList.toggle('on', mode === 'universe');
  $('#btnUniverse').innerHTML = mode === 'universe' ? '<i>🏠</i><span>Home</span>' : '<i>🌌</i><span>Explore</span>';
  if (mode === 'universe') { $('#planetName').textContent = 'The Paper Universe'; $('#planetMeta').textContent = uniMeta(); }
  else if (p) { $('#planetName').textContent = p.name; updateMeta(); }
  if (vis) { $('#visitName').textContent = p.name; $('#heartCount').textContent = p.hearts; }
  $('#btnPeek').classList.toggle('on', peek);
  $('#btnWeather').classList.toggle('on', !!store.get('tp_weather_on', false));
  updateGhost();
}
function updateMeta() {
  if (mode !== 'focus' || !focus) return;
  const p = focus;
  $('#planetMeta').textContent = `${p.L.dl > 0.5 ? '☀️' : '🌙'} ${peek ? 'peeking at noon' : timeLabel(p.hour) + (p.mine ? ' your time' : ' there')}${p.weather ? ' · ' + WEATHER_EMOJI[p.weather] : ''}${p.mine ? ' · ✏️' : ''}`;
}
let toastT;
function toast(msg, ms = 2200) { const t = $('#toast'); t.textContent = msg; t.classList.remove('hidden'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.add('hidden'), ms); }
function hint(msg) { const h = $('#hint'); h.textContent = msg; h.classList.remove('hidden'); }
function hideHint() { $('#hint').classList.add('hidden'); }
function modal(html) { $('#modalBody').innerHTML = html; $('#modal').classList.remove('hidden'); }
function closeModal() { $('#modal').classList.add('hidden'); }
let modalLocked = false;
$('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal' && !recording && !modalLocked) closeModal(); });

$('#btnUniverse').onclick = () => { if (mode === 'universe') flyTo(mine); else if (mode === 'focus') enterUniverse(); };
$('#btnHome').onclick = $('#btnHome2').onclick = () => flyTo(mine);
$('#btnMore').onclick = loadMore;
$('#btnPeek').onclick = () => { peek = !peek; focus?.updateTime(); updateUI(); toast(peek ? 'Peeking at daytime ☀️' : `Back to real time ${focus.L.dl > 0.5 ? '☀️' : '🌙'}`); };
$('#btnPalette').onclick = () => { mine.palette = (mine.palette + 1) % PALETTES.length; mine.buildBase(); scheduleSave(); };
$('#btnHeart').onclick = () => {
  const p = focus; if (!p || p.mine) return;
  const hearted = store.get('tp_hearts', {});
  if (hearted[p.id]) { toast('You already sent love 💛'); return; }
  hearted[p.id] = 1; store.set('tp_hearts', hearted); p.hearts++; updateUI(); toast(`Sent love to ${p.name} ❤️`);
  if (!p.npc) bump(p.id, 'heart');
  const wp2 = p.group.position.clone().add(_v.copy(camera.position).sub(p.group.position).normalize().multiplyScalar(R + 1));
  puff(wp2, _v.clone(), ['#ec8fa3', '#d9644a', '#ffffff', '#f3b6c4']);
};
function randomName() { return NAMES_A[Math.floor(Math.random() * NAMES_A.length)] + ' ' + NAMES_B[Math.floor(Math.random() * NAMES_B.length)]; }
function askName(first) {
  if (!$('#modal').classList.contains('hidden')) return;
  const hasStuff = mine.items.length > 0;
  modal(`<h2>${first ? 'Name your tiny planet 🪐' : 'Rename your planet'}</h2>
    ${first ? `<p class="sub">${hasStuff ? 'Keep what is here, or wipe it and build from scratch.' : 'It starts empty. Everything on it is up to you.'}</p>` : ''}
    <div class="namerow"><input id="nameInput" type="text" maxlength="40" placeholder="My planet's name" autocomplete="off" autocapitalize="words" enterkeyhint="done" /><button class="chip" id="nameDice" title="Random name">🎲</button></div>
    <div class="row">${hasStuff ? '<button class="chip" id="nameFresh">🧹 Start fresh</button>' : ''}${first ? '' : '<button class="chip" id="nameCancel">Cancel</button>'}<button class="chip primary" id="nameOk">${first ? "Let's build ✨" : 'Save'}</button></div>`);
  const inp = $('#nameInput'); inp.value = first ? '' : mine.name; inp.placeholder = mine.name;
  modalLocked = first; // the first-time card only closes through its button
  if (!isTouch) setTimeout(() => { inp.focus(); inp.select(); }, 60);
  $('#nameDice').onclick = (e) => { e.preventDefault(); inp.value = randomName(); };
  const ok = () => {
    const v = inp.value.trim().slice(0, 40) || mine.name;
    mine.name = v; if (mine.label) mine.label.firstChild.textContent = 'You · ' + v;
    store.set('tp_named', true); scheduleSave(300);
    modalLocked = false; inp.blur(); updateUI(); closeModal(); toast(`Welcome to ${v} 🪐`);
    if (first && !store.get('tp_tour', false)) { setTimeout(startTour, 500); return; }
    if (first && !store.get('tp_built', false)) hint(mine.items.length ? 'Pick something below, then tap your planet to place it ✨' : 'Your planet is empty. Pick something below, then tap the planet ✨');
  };
  $('#nameOk').onclick = ok; inp.onkeydown = (e) => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); ok(); } };
  if ($('#nameCancel')) $('#nameCancel').onclick = closeModal;
  const fresh = $('#nameFresh');
  if (fresh) fresh.onclick = () => {
    if (!fresh.dataset.sure) { fresh.dataset.sure = 1; fresh.textContent = 'Tap again to clear everything'; return; }
    mine.items.length = 0; undoStack.length = 0; mine.buildDetail(); mine.syncWalkers();
    puff(mine.group.position.clone().add(new THREE.Vector3(0, R, 0)), UP.clone(), ['#fffaf0', '#c9a57a', '#f2c14e']);
    fresh.remove(); scheduleSave(300); toast('A blank planet, all yours 🌱');
  };
}
$('#nameBtn').onclick = () => { if (mode === 'focus' && focus?.mine && !recording) askName(!store.get('tp_named', false)); };
const needsName = () => !store.get('tp_named', false);

// music
const music = new LoFi();
let musicOn = store.get('tp_music', true);
const setMusicIcon = () => { $('#btnMusic').textContent = musicOn ? '🔊' : '🔈'; $('#btnMusic').classList.toggle('on', musicOn); };
setMusicIcon();
$('#btnMusic').onclick = () => { musicOn = !musicOn; store.set('tp_music', musicOn); setMusicIcon(); if (musicOn) { music.start(); music.setMuted(false); } else music.setMuted(true); };
let audioPrimed = false;
function primeAudio() { if (audioPrimed) return; audioPrimed = true; if (musicOn) { music.start(); music.setMuted(false); } }
addEventListener('pointerdown', primeAudio, { once: false });
addEventListener('keydown', primeAudio);

// weather
const mapCode = (c) => (c >= 95 ? 'storm' : (c >= 51 && c <= 67) || (c >= 80 && c <= 82) ? 'rain' : (c >= 71 && c <= 77) || c === 85 || c === 86 ? 'snow' : c >= 1 ? 'cloud' : 'clear');
async function syncWeather(silent) {
  if (!navigator.geolocation) { if (!silent) toast('No location on this device'); return; }
  navigator.geolocation.getCurrentPosition(async (pos) => {
    try {
      const lat = pos.coords.latitude.toFixed(1), lon = pos.coords.longitude.toFixed(1); // coarse, never stored
      const j = await (await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=weather_code`)).json();
      const w = mapCode(j.current.weather_code);
      store.set('tp_weather_on', true);
      if (w !== mine.weather) { mine.weather = w; if (me.saved || mine.items.length) scheduleSave(500); }
      updateUI(); updateMeta(); if (!silent) toast(`Weather synced: ${WEATHER_EMOJI[w]} ${w}`);
    } catch { if (!silent) toast("Couldn't fetch the weather right now"); }
  }, () => { if (!silent) toast("No location, no weather. That's okay! ☀️"); }, { timeout: 10000, maximumAge: 1800e3 });
}
$('#btnWeather').onclick = () => {
  if (store.get('tp_weather_on', false)) { store.set('tp_weather_on', false); mine.weather = ''; scheduleSave(500); updateUI(); updateMeta(); toast('Weather off ☀️'); }
  else { toast('Asking for your rough location…'); syncWeather(false); }
};

// share
function shareUrl(p) { return `${location.origin}/?p=${p.id}`; }
$('#btnShare').onclick = async () => {
  const p = mode === 'focus' && focus && !focus.npc ? focus : mine;
  if (p.mine && !me.saved) { clearTimeout(saveTimer); await savePlanet(); }
  const url = shareUrl(p); const text = p.mine ? `Come visit my tiny planet "${p.name}" 🪐` : `Look at this tiny planet "${p.name}" 🪐`;
  if (navigator.share) { try { await navigator.share({ title: 'Tiny Planets', text, url }); return; } catch (e) { if (e.name === 'AbortError') return; } }
  try { await navigator.clipboard.writeText(url); toast('Link copied! Send it to a friend 🔗'); } catch { modal(`<h2>Share your planet</h2><input value="${url}" readonly onclick="this.select()"/><div class="row"><button class="chip" onclick="document.getElementById('modal').classList.add('hidden')">Done</button></div>`); }
};

// postcard
$('#btnPostcard').onclick = () => makePostcard();
let cinema = null;
function startCinema() {
  closeModal(); if (mode !== 'focus' || fly) return;
  cinema = { t0: now(), h0: focus.hour }; document.body.classList.add('cinema'); hideHint();
  controls.autoRotate = true; controls.autoRotateSpeed = 1.1; toast('🌗 A whole day in 24 seconds · tap to stop', 2600);
}
function stopCinema() { cinema = null; document.body.classList.remove('cinema'); controls.autoRotate = false; focus.updateTime(); updateMeta(); }
$('#btnCinema').onclick = () => {
  if (mode !== 'focus') { toast('Fly to a planet first 🪐'); return; }
  modal(`<h2>Time-lapse 🎬</h2><p class="sub">Made for Reels and Shorts.</p>
    <div class="choices"><button class="choice" id="tlVideo"><b>🎞️ Make a 10-second video</b><span>${focus.mine ? 'Your planet' : focus.name} growing from empty, through a whole day, with music</span></button>
    <button class="choice" id="tlLive"><b>🌗 Watch a day go by</b><span>Sun to stars in 24 seconds, no buttons on screen, perfect for screen recording</span></button></div>
    <div class="row"><button class="chip" id="tlClose">Close</button></div>`);
  $('#tlVideo').onclick = makeVideo; $('#tlLive').onclick = startCinema; $('#tlClose').onclick = closeModal;
};
async function makePostcard() {
  const p = mode === 'focus' && focus ? focus : mine;
  if (p.mine && !me.saved && p.items.length) { clearTimeout(saveTimer); savePlanet(); }
  bubbleEl.classList.add('hidden');
  try { await document.fonts.load('700 64px Caveat'); await document.fonts.load('800 20px Nunito'); } catch {}
  renderer.render(scene, camera);
  const shot = renderer.domElement;
  if (!CanvasRenderingContext2D.prototype.roundRect) CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h) { this.rect(x, y, w, h); };
  const W = 1200, H = 1500, c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
  // card paper
  g.fillStyle = '#fbf4e4'; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 9000; i++) { g.fillStyle = `rgba(120,95,60,${Math.random() * 0.05})`; g.fillRect(Math.random() * W, Math.random() * H, 2, 2); }
  // photo
  const px = 70, py = 70, pw = W - 140, ph = 1060;
  const grad = g.createLinearGradient(0, py, 0, py + ph); grad.addColorStop(0, mode === 'universe' ? SKY.space[0] : skyTop); grad.addColorStop(1, mode === 'universe' ? SKY.space[1] : skyBottom);
  g.save(); g.beginPath(); g.roundRect(px, py, pw, ph, 10); g.clip();
  g.fillStyle = grad; g.fillRect(px, py, pw, ph);
  const sw = shot.width, sh = shot.height, scale = Math.max(pw / sw, ph / sh), dw = sw * scale, dh = sh * scale;
  g.drawImage(shot, px + (pw - dw) / 2, py + (ph - dh) / 2, dw, dh);
  g.restore();
  g.strokeStyle = 'rgba(80,60,40,.18)'; g.lineWidth = 3; g.beginPath(); g.roundRect(px, py, pw, ph, 10); g.stroke();
  // stamp
  const sx = W - 300, sy = 110, s = 170;
  g.save(); g.translate(sx + s / 2, sy + s / 2); g.rotate(0.08);
  g.fillStyle = '#fff'; g.fillRect(-s / 2, -s / 2, s, s * 1.15);
  g.fillStyle = '#fbf4e4'; for (let i = 0; i <= 10; i++) { [[-s / 2 + i * s / 10, -s / 2], [-s / 2 + i * s / 10, s * 0.65]].forEach(([x, y]) => { g.beginPath(); g.arc(x, y, 6, 0, 7); g.fill(); }); }
  for (let i = 0; i <= 11; i++) { [[-s / 2, -s / 2 + i * s * 1.15 / 11], [s / 2, -s / 2 + i * s * 1.15 / 11]].forEach(([x, y]) => { g.beginPath(); g.arc(x, y, 6, 0, 7); g.fill(); }); }
  g.fillStyle = '#f39237'; g.fillRect(-s / 2 + 14, -s / 2 + 14, s - 28, s * 1.15 - 28);
  g.font = '84px serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('🪐', 0, -6);
  g.fillStyle = '#fff'; g.font = '900 17px Nunito'; g.fillText('TINY PLANETS', 0, s * 0.42);
  g.restore();
  // postmark
  g.save(); g.translate(sx - 60, sy + 120); g.rotate(-0.2); g.strokeStyle = 'rgba(59,51,70,.45)'; g.lineWidth = 4;
  g.beginPath(); g.arc(0, 0, 70, 0, 7); g.stroke(); g.beginPath(); g.arc(0, 0, 56, 0, 7); g.stroke();
  g.fillStyle = 'rgba(59,51,70,.55)'; g.font = '900 15px Nunito'; g.textAlign = 'center';
  g.fillText(new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }).toUpperCase(), 0, -6); g.fillText(new Date().getFullYear(), 0, 16);
  for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(80, -24 + i * 16); for (let x = 80; x < 240; x += 20) g.quadraticCurveTo(x + 5, -32 + i * 16, x + 10, -24 + i * 16), g.quadraticCurveTo(x + 15, -16 + i * 16, x + 20, -24 + i * 16); g.stroke(); }
  g.restore();
  // caption
  g.fillStyle = '#3b3346'; g.textAlign = 'left'; g.textBaseline = 'alphabetic';
  g.font = '700 46px Caveat'; g.fillStyle = '#8a7d6d';
  g.fillText(mode === 'universe' ? 'Greetings from' : p.mine ? 'Greetings from my tiny planet' : 'Greetings from', 80, 1205);
  g.font = '700 104px Caveat'; g.fillStyle = '#3b3346';
  let title = mode === 'universe' ? 'the Paper Universe' : p.name; let fs = 104;
  while (g.measureText(title).width > W - 160 && fs > 50) { fs -= 6; g.font = `700 ${fs}px Caveat`; }
  g.fillText(title, 76, 1300);
  g.font = '800 26px Nunito'; g.fillStyle = '#8a7d6d';
  const L = p.L; const meta = mode === 'universe' ? `${planets.length} little worlds, all made of paper` : `${L.dl > 0.5 ? '☀️' : '🌙'} ${timeLabel(p.hour)} there${p.weather ? '  ·  ' + WEATHER_EMOJI[p.weather] : ''}  ·  ${p.items.length} things built`;
  g.fillText(meta, 80, 1360);
  g.font = '900 24px Nunito'; g.fillStyle = '#f39237';
  g.fillText(`✈ visit: ${location.host}${p.npc || mode === 'universe' ? '' : '/?p=' + p.id}`, 80, 1420);
  g.font = '700 34px Caveat'; g.fillStyle = '#a3967f'; g.textAlign = 'right'; g.fillText(`Tiny Planets by ${CREATOR.name}`, W - 80, 1420); g.textAlign = 'left';
  const url = c.toDataURL('image/png');
  const blob = await new Promise((res) => c.toBlob(res, 'image/png'));
  const file = new File([blob], `tiny-planet-${(p.name || 'postcard').replace(/\W+/g, '-').toLowerCase()}.png`, { type: 'image/png' });
  const canShareFile = navigator.canShare && navigator.canShare({ files: [file] });
  modal(`<h2>Your postcard 📮</h2><img src="${url}" alt="Postcard"/><div class="row"><button class="chip" id="pcClose">Close</button><a class="chip" id="pcSave" download="${file.name}" href="${url}" style="text-decoration:none">⬇️ Save</a>${canShareFile ? '<button class="chip primary" id="pcShare">📤 Share</button>' : ''}</div>`);
  $('#pcClose').onclick = closeModal;
  if (canShareFile) $('#pcShare').onclick = async () => { try { await navigator.share({ files: [file], title: 'Tiny Planets', text: `Greetings from ${p.name} 🪐 ${p.npc ? location.origin : shareUrl(p)}` }); } catch {} };
}

// ---------------------------------------------------------------- growing time-lapse video (9:16, for Reels/Shorts)
let recording = null;
async function makeVideo() {
  const p = focus;
  if (!p || mode !== 'focus') { toast('Fly to a planet first 🪐'); return; }
  if (!p.items.length) { closeModal(); toast('Build a few things first, then make your video 🎬'); return; }
  const canvasProto = HTMLCanvasElement.prototype;
  if (!window.MediaRecorder || !canvasProto.captureStream) { closeModal(); toast("This browser can't record video. Try a postcard 📮"); return; }
  const W = 720, H = 1280;
  const r2 = new THREE.WebGLRenderer({ antialias: true, alpha: true }); r2.setPixelRatio(1); r2.setSize(W, H, false);
  r2.shadowMap.enabled = true; r2.shadowMap.type = THREE.PCFSoftShadowMap; r2.setClearColor(0, 0);
  const cam2 = new THREE.PerspectiveCamera(40, W / H, 0.5, 4000);
  const out = document.createElement('canvas'); out.width = W; out.height = H; out.className = 'rec'; const g = out.getContext('2d');
  modal(`<h2>Recording… 🎬</h2><div id="recWrap"></div><div class="progress"><i id="recBar"></i></div><div class="row"><button class="chip" id="recCancel">Cancel</button></div>`);
  $('#recWrap').appendChild(out);
  try { await document.fonts.load('700 64px Caveat'); await document.fonts.load('900 20px Nunito'); } catch {}
  const stream = out.captureStream(30);
  if (!music.ctx) { music.muted = !musicOn; music.start(); }
  const audio = music.recordStream(); if (audio) audio.getAudioTracks().forEach((tr) => stream.addTrack(tr));
  const mime = ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'].find((m) => MediaRecorder.isTypeSupported(m)) || '';
  let rec;
  try { rec = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 6e6 } : {}); } catch { rec = new MediaRecorder(stream); }
  const chunks = []; rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const done = new Promise((res) => (recording = { p, r2, cam2, g, out, t0: now() + 0.3, dur: 10, n: p.items.length, shown: -1, lastBuild: 0, ang: 0.3, h0: 6.5, hour: 6.5, done: res, cancelled: false }));
  $('#recCancel').onclick = () => { recording.cancelled = true; recording.done(); };
  controls.enabled = false;
  p.visibleCount = 0; p.buildDetail();
  rec.start(250);
  await done;
  const cancelled = recording.cancelled;
  await new Promise((res) => { rec.onstop = res; rec.stop(); });
  stream.getVideoTracks().forEach((tr) => tr.stop());
  recording = null; p.visibleCount = null; p.buildDetail(); p.updateTime(); controls.enabled = true;
  r2.dispose(); r2.forceContextLoss();
  if (cancelled) { closeModal(); return; }
  const type = rec.mimeType || mime || 'video/webm'; const blob = new Blob(chunks, { type: type.split(';')[0] });
  const ext = blob.type.includes('mp4') ? 'mp4' : 'webm';
  const url = URL.createObjectURL(blob);
  const file = new File([blob], `tiny-planet-${(p.name || 'timelapse').replace(/\W+/g, '-').toLowerCase()}.${ext}`, { type: blob.type });
  const canShareFile = navigator.canShare && navigator.canShare({ files: [file] });
  modal(`<h2>Your time-lapse 🎞️</h2><video src="${url}" autoplay loop playsinline controls></video>
    <p class="sub">10 seconds, vertical, with music. Ready for Reels, Shorts and Stories.</p>
    <div class="row"><button class="chip" id="vClose">Close</button><a class="chip" download="${file.name}" href="${url}" style="text-decoration:none">⬇️ Save</a>${canShareFile ? '<button class="chip primary" id="vShare">📤 Share</button>' : ''}</div>`);
  $('#vClose').onclick = () => { closeModal(); URL.revokeObjectURL(url); };
  if (canShareFile) $('#vShare').onclick = async () => { try { await navigator.share({ files: [file], title: 'Tiny Planets', text: `Watch ${p.name} grow 🪐 ${p.npc ? location.origin : shareUrl(p)}` }); } catch {} };
}
function wrapText(g, text, x, y, maxW) { let fs = parseInt(g.font.match(/(\d+)px/)[1], 10); while (g.measureText(text).width > maxW && fs > 20) { fs -= 4; g.font = g.font.replace(/\d+px/, fs + 'px'); } g.fillText(text, x, y); }
function recordFrame(t) {
  const r = recording; const W = r.out.width, H = r.out.height; const g = r.g; const p = r.p;
  const k = clamp((t - r.t0) / r.dur, 0, 1);
  // items appear one after another, in the order they were built
  const want = Math.round(r.n * easeIO(clamp((k - 0.1) / 0.68, 0, 1)));
  if (want !== r.shown && (t - r.lastBuild > 0.1 || want === r.n)) {
    p.visibleCount = want; p.buildDetail(); r.shown = want; r.lastBuild = t;
    const it = p.items[want - 1];
    if (it) puff(p.group.localToWorld(itemDir(it).multiplyScalar(R + 0.3)), itemDir(it).applyQuaternion(p.group.quaternion), ['#fffaf0', '#f2c14e', '#ec8fa3', '#9ed9c4']);
  }
  const ang = r.ang + k * 2.2, el = 0.5 - 0.12 * Math.sin(k * Math.PI), dist = (R / 10) * 62 * (1.08 - 0.12 * easeIO(k));
  r.cam2.position.set(Math.sin(ang) * Math.cos(el), Math.sin(el), Math.cos(ang) * Math.cos(el)).multiplyScalar(dist).add(p.group.position);
  r.cam2.lookAt(p.group.position); r.cam2.setViewOffset(W, H, 0, Math.round(H * 0.05), W, H);
  sunMesh.lookAt(r.cam2.position); moonMesh.lookAt(r.cam2.position);
  r.r2.render(scene, r.cam2);
  // compose: sky, 3D, captions
  const grad = g.createLinearGradient(0, 0, 0, H); grad.addColorStop(0, skyTop); grad.addColorStop(1, skyBottom);
  g.fillStyle = grad; g.fillRect(0, 0, W, H);
  g.drawImage(r.r2.domElement, 0, 0, W, H);
  g.textAlign = 'center'; g.shadowColor = 'rgba(40,30,60,.45)'; g.shadowBlur = 14; g.fillStyle = '#fffaf0';
  g.font = '700 84px Caveat'; wrapText(g, p.name, W / 2, 150, W - 80);
  g.font = '900 30px Nunito';
  const cap = k < 0.12 ? 'Day 1 · an empty planet' : k < 0.82 ? `🌱 ${Math.max(1, r.shown)} things built` : `${r.n} things, all made of paper`;
  g.fillText(cap, W / 2, 205);
  g.font = '700 46px Caveat'; g.fillText(`${(p.L.dl > 0.5 ? '☀️ ' : '🌙 ')}${timeLabel(p.hour)}`, W / 2, H - 150);
  g.font = '900 26px Nunito'; g.fillText(k > 0.82 ? `✈ come visit: ${location.host}` : '🪐 Tiny Planets', W / 2, H - 92);
  g.font = '700 30px Caveat'; g.globalAlpha = 0.85; g.fillText(`Tiny Planets by ${CREATOR.name}`, W / 2, H - 48); g.globalAlpha = 1;
  g.shadowBlur = 0;
  const bar = $('#recBar'); if (bar) bar.style.width = (k * 100).toFixed(1) + '%';
  if (k >= 1 && t - r.t0 > r.dur + 0.4) r.done();
}

// ---------------------------------------------------------------- building
let chainPrev = null;
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
function rayAt(x, y) { ndc.set((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1); raycaster.setFromCamera(ndc, camera); return raycaster; }
function hitFocus(x, y) {
  if (!focus) return null;
  const objs = [focus.sphere]; if (focus.solid) objs.unshift(focus.solid);
  const h = rayAt(x, y).intersectObjects(objs, false)[0];
  if (!h) return null;
  const local = focus.group.worldToLocal(h.point.clone());
  if (local.length() > R * 1.35) return null; // ring hit
  return { point: h.point, dir: local.normalize() };
}
function hitPlanet(x, y) {
  const h = rayAt(x, y).intersectObjects(planets.map((p) => p.sphere), false)[0];
  return h ? h.object.userData.planet : null;
}
// rotation (degrees) that points an item's local +z from `from` towards `to`, for an item standing at `at`
function headingRot(from, to, at) {
  const fwd = to.clone().sub(from); fwd.addScaledVector(at, -fwd.dot(at)).normalize();
  _q.setFromUnitVectors(UP, at); const f0 = new THREE.Vector3(0, 0, 1).applyQuaternion(_q), r0 = new THREE.Vector3(1, 0, 0).applyQuaternion(_q);
  let a = Math.atan2(fwd.dot(r0), fwd.dot(f0)); if (tool === 'fence') a += Math.PI / 2;
  return ((a * 180) / Math.PI + 360) % 360;
}
function placeItem(dir) {
  if (mine.items.length >= MAX_ITEMS) { toast('Your planet is full! Remove something first'); return false; }
  const def = ITEM_BY_ID[tool];
  let rot = Math.random() * 360; let d = dir.clone();
  if (def.chain) {
    const step = (tool === 'fence' ? 1.55 : 1.6) / R;
    // never stack two pieces on the same spot (matters when painting)
    if (mine.items.some((o) => o[0] === tool && itemDir(o).angleTo(d) < step * 0.55)) return false;
    let anchor = null, best = 0.45;
    for (const o of mine.items) if (o[0] === tool) { const a = itemDir(o).angleTo(d); if (a < best) { best = a; anchor = o; } }
    if (chainPrev && chainPrev.type === tool && mine.items.includes(chainPrev.it) && chainPrev.dir.angleTo(d) < 0.45) anchor = chainPrev.it;
    if (anchor) {
      const ad = itemDir(anchor);
      const t = d.clone().addScaledVector(ad, -d.dot(ad));
      if (t.lengthSq() > 1e-8) {
        t.normalize();
        d = ad.clone().multiplyScalar(Math.cos(step)).addScaledVector(t, Math.sin(step)).normalize();
        if (mine.items.some((o) => o[0] === tool && itemDir(o).angleTo(d) < step * 0.55)) return false;
        rot = headingRot(ad, d, d);
        const lonely = !mine.items.some((o) => o !== anchor && o[0] === tool && itemDir(o).angleTo(ad) < step * 1.4);
        if (lonely) { anchor[4] = Math.round(headingRot(ad, d, ad)); if (!mine.popping.has(anchor)) mine.buildDetail(); }
      }
    }
  } else {
    // nudge away from overlapping a big item
    for (const it of mine.items) { const od = itemDir(it); if (ITEM_BY_ID[it[0]].big && od.angleTo(d) < 0.08) { d.addScaledVector(d.clone().sub(od).normalize(), 0.06).normalize(); } }
  }
  const it = toTuple(tool, d, rot);
  mine.items.push(it); undoStack.push(it); if (undoStack.length > 80) undoStack.shift();
  if (def.chain) chainPrev = { type: tool, dir: itemDir(it), it };
  const wpos = mine.group.localToWorld(d.clone().multiplyScalar(R));
  const nworld = d.clone().applyQuaternion(mine.group.quaternion);
  puff(wpos, nworld, ['#fffaf0', '#f2c14e', '#ec8fa3', '#9ed9c4']);
  if (def.walker) { if (mine.walkersOn) mine.syncWalkers(); }
  else {
    mine.popping.add(it);
    const m = new THREE.Mesh(mergeParts(def.build(mulberry(seedOf(it)))), mine.mat); m.castShadow = true;
    const holder = new THREE.Object3D(); itemMatrix(it, holder.matrix); holder.matrixAutoUpdate = false; holder.add(m); mine.group.add(holder);
    pops.push({ holder, m, it, t0: now() });
    if (def.home || it[0] === 'chai' || it[0] === 'temple') setTimeout(() => mine.syncWalkers(), 500);
  }
  scheduleSave();
  // a nearby paper person reacts (sometimes)
  if (Math.random() < 0.7 && (!bubble || now() > bubble.until - 1)) {
    const near = mine.walkers.filter((w) => w.type === 'person').sort((a, b) => a.p.angleTo(d) - b.p.angleTo(d))[0];
    const lines = LINES[it[0]]; if (near && lines) say(near, lines[Math.floor(Math.random() * lines.length)]);
  }
  if (!store.get('tp_built', false)) { store.set('tp_built', true); setTimeout(() => hint('Zoom out (pinch or scroll) to see everyone\'s planets 🌌'), 1500); setTimeout(hideHint, 6500); }
  return true;
}
const pops = [];
function updatePops(t) {
  for (let i = pops.length - 1; i >= 0; i--) {
    const p = pops[i]; const k = (t - p.t0) / 0.55;
    p.m.scale.set(elastic(k * 1.1), elastic(k), elastic(k * 1.1));
    if (k >= 1) { mine.group.remove(p.holder); p.m.geometry.dispose(); pops.splice(i, 1); mine.popping.delete(p.it); if (!pops.length) mine.buildDetail(); }
  }
}
function removeItem(planet, idx) {
  const it = planet.items[idx]; planet.items.splice(idx, 1);
  const d = itemDir(it);
  puff(planet.group.localToWorld(d.clone().multiplyScalar(R + 0.5)), d.clone(), ['#c9a57a', '#fffaf0', '#9aa0a6']);
  if (ITEM_BY_ID[it[0]].walker) planet.syncWalkers(); else { planet.buildDetail(); planet.syncWalkers(); }
  scheduleSave();
}
function eraseAt(dir) {
  let best = -1, bestA = 0.13;
  mine.items.forEach((it, i) => {
    let d = itemDir(it);
    if (ITEM_BY_ID[it[0]].walker) { const w = mine.walkers.find((w) => w.it === it); if (w) d = w.p; }
    const a = d.angleTo(dir) - (ITEM_BY_ID[it[0]].big ? 0.08 : 0);
    if (a < bestA) { bestA = a; best = i; }
  });
  if (best >= 0) removeItem(mine, best); else toast('Tap right on something to remove it');
}

// ghost preview (mouse)
let ghost = null, ghostType = null;
const ghostMat = new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.55, depthWrite: false });
let lastMouse = null;
function updateGhost() {
  const show = !isTouch && mode === 'focus' && focus?.mine && ITEM_BY_ID[tool] && lastMouse && !fly;
  if (!show) { if (ghost) ghost.visible = false; return; }
  if (ghostType !== tool) {
    if (ghost) { ghost.parent?.remove(ghost); ghost.geometry.dispose(); }
    ghost = new THREE.Mesh(mergeParts(ITEM_BY_ID[tool].build(mulberry(5))), ghostMat); ghost.matrixAutoUpdate = false; ghostType = tool;
  }
  if (ghost.parent !== mine.group) mine.group.add(ghost);
  const h = hitFocus(lastMouse.x, lastMouse.y);
  if (!h) { ghost.visible = false; return; }
  ghost.visible = true; itemMatrix(toTuple(tool, h.dir, 0), ghost.matrix);
}

// pointer handling: tap vs drag
let down = null;
const el = renderer.domElement;
let painting = false;
el.addEventListener('pointerdown', (e) => {
  const multi = !!down || painting;
  down = { x: e.clientX, y: e.clientY, t: now(), id: e.pointerId, multi, hit: !multi && introDone && mode === 'focus' ? hitFocus(e.clientX, e.clientY) : null };
  if (multi) { if (painting) { painting = false; controls.enabled = true; } return; }
  // roads, paths and fences: press and drag to paint them
  if (introDone && !fly && !cinema && !recording && mode === 'focus' && focus?.mine && ITEM_BY_ID[tool]?.chain) {
    const h = hitFocus(e.clientX, e.clientY);
    if (h) { painting = true; controls.enabled = false; down = null; placeItem(h.dir); hideHint(); }
  }
});
el.addEventListener('pointermove', (e) => {
  if (painting) {
    const h = hitFocus(e.clientX, e.clientY);
    const step = (tool === 'fence' ? 1.55 : 1.6) / R;
    for (let i = 0; h && i < 3 && chainPrev && chainPrev.dir.angleTo(h.dir) > step * 0.95; i++) if (!placeItem(h.dir)) break;
    return;
  }
  if (e.pointerType === 'mouse') { lastMouse = { x: e.clientX, y: e.clientY }; updateGhost(); }
});
const endPaint = () => { if (painting) { painting = false; controls.enabled = true; } };
el.addEventListener('pointerup', endPaint);
el.addEventListener('pointercancel', endPaint);
el.addEventListener('pointerleave', () => { lastMouse = null; updateGhost(); });
el.addEventListener('pointerup', (e) => {
  if (!down) return; const d = down; down = null;
  if (d.multi || Math.hypot(e.clientX - d.x, e.clientY - d.y) > (e.pointerType === 'mouse' ? 8 : 16) || now() - d.t > 0.6) return;
  onTap(d.x, d.y, d.hit);
});
el.addEventListener('pointercancel', () => (down = null));
function onTap(x, y, pre) {
  if (!introDone) { skipIntro(); return; }
  if (cinema) { stopCinema(); return; }
  if (recording) return;
  if (fly) return;
  if (mode === 'universe') { const p = hitPlanet(x, y); if (p) flyTo(p); return; }
  const h = pre || hitFocus(x, y);
  if (h && focus.mine) {
    if (tool === 'erase') eraseAt(h.dir);
    else if (ITEM_BY_ID[tool]) { placeItem(h.dir); hideHint(); }
    else pokePerson(h.dir);
    return;
  }
  if (h) { pokePerson(h.dir); return; }
  const p = hitPlanet(x, y); if (p && p !== focus) flyTo(p);
}
function pokePerson(dir) {
  const w = focus.walkers.filter((w) => w.p.angleTo(dir) < 0.12)[0];
  if (w) { const pool = w.type === 'person' ? ['Namaste! 🙏', 'Hi hi! 👋', 'Hehe, that tickles', 'Chai? ☕'] : LINES[w.type] || ['✨']; say(w, pool[Math.floor(Math.random() * pool.length)], 2.2); w.pause = 1.2; }
}
addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;
  if ((e.metaKey || e.ctrlKey) && e.key === 'z') $('#btnUndo').click();
  if (e.key === 'Escape' && !modalLocked) { closeModal(); setTool('look'); }
});

// ---------------------------------------------------------------- intro
let introDone = false; let introT0 = 0;
function startIntro() {
  mode = 'intro'; introT0 = now();
  const target = startPlanet;
  setFocus(target);
  const c = target.group.position;
  camera.position.copy(c).add(new THREE.Vector3(0.05, 0.3, 1).normalize().multiplyScalar(focusDist() * 1.25));
  controls.target.copy(c); camera.lookAt(c);
  target.startFold(0.55, 2.6);
  setTimeout(() => {
    fly = { fromPos: camera.position.clone(), fromT: controls.target.clone(), toT: c.clone(), toPos: c.clone().add(new THREE.Vector3(0.1, 0.5, 1).normalize().multiplyScalar(focusDist())), t0: now(), dur: 2.7 };
    mode = 'flyin';
  }, 900);
  setTimeout(() => $('#intro').classList.add('fade'), 2500);
}
function skipIntro() { if (fly) fly.t0 -= fly.dur; if (startPlanet.fold) startPlanet.fold.t0 -= startPlanet.fold.dur; }
// ---------------------------------------------------------------- first-time tour + gentle nudges
const TOUR = [
  { el: '#items', t: '<b>Build</b>Pick anything here, then tap your planet to put it there 🌳' },
  { el: '#btnUniverse', t: '<b>Explore</b>Zoom out to see everyone\'s planets and fly over to visit them 🌌' },
  { el: '#btnShare', t: '<b>Share</b>Send your planet to friends. The link drops them right onto it 🔗' },
  { el: '#btnCinema', t: '<b>Video</b>Make a 10-second day-to-night time-lapse for your status or reels 🎬' },
];
let tourI = -1;
function startTour() {
  if (mode !== 'focus' || !focus?.mine || recording) return;
  hideHint(); tourI = 0; $('#coach').classList.remove('hidden'); showTourStep();
}
function showTourStep() {
  const st = TOUR[tourI]; const el = $(st.el);
  if (!el || !el.offsetParent) { nextTour(); return; }
  const r = el.getBoundingClientRect(); const pad = 6; const vw = innerWidth, vh = innerHeight;
  Object.assign($('#coach .spot').style, { left: r.left - pad + 'px', top: r.top - pad + 'px', width: r.width + pad * 2 + 'px', height: r.height + pad * 2 + 'px' });
  $('#coach .ctext').innerHTML = st.t; $('#coach .cstep').textContent = `${tourI + 1} / ${TOUR.length}`;
  $('#coachNext').textContent = tourI === TOUR.length - 1 ? "Got it ✨" : 'Next';
  const card = $('#coach .ccard'); const cw = card.offsetWidth, ch = card.offsetHeight;
  const below = r.top + r.height / 2 < vh / 2;
  let top = below ? r.bottom + 16 : r.top - ch - 16;
  let left = clamp(r.left + r.width / 2 - cw / 2, 16, vw - cw - 16);
  if (vw > 520 && r.left > vw * 0.7) { left = r.left - cw - 20; top = r.top + r.height / 2 - ch / 2; } // side column: sit beside it
  Object.assign(card.style, { top: clamp(top, 12, vh - ch - 12) + 'px', left: left + 'px' });
}
function nextTour() { tourI++; if (tourI >= TOUR.length) endTour(); else showTourStep(); }
function endTour() {
  tourI = -1; $('#coach').classList.add('hidden'); store.set('tp_tour', true);
  if (!store.get('tp_built', false)) hint(mine.items.length ? 'Pick something below, then tap your planet to place it ✨' : 'Your planet is empty. Pick something below, then tap the planet ✨');
  setTimeout(nudge, 45000);
}
$('#coachNext').onclick = (e) => { e.stopPropagation(); nextTour(); };
$('#coachSkip').onclick = (e) => { e.stopPropagation(); endTour(); };
$('#coach').onclick = () => nextTour();
addEventListener('resize', () => { if (tourI >= 0) showTourStep(); });
// a soft pulsing ring on the next feature you haven't tried yet
const NUDGE = ['btnShare', 'btnUniverse', 'btnCinema', 'btnPostcard'];
const used = new Set(store.get('tp_used', []));
function nudge() {
  document.querySelectorAll('.pulse').forEach((b) => b.classList.remove('pulse'));
  if (!store.get('tp_tour', false) || tourI >= 0) return;
  const id = NUDGE.find((n) => !used.has(n)); if (id) $('#' + id).classList.add('pulse');
}
for (const id of NUDGE) $('#' + id).addEventListener('click', () => {
  if (used.has(id)) return; used.add(id); store.set('tp_used', [...used]);
  $('#' + id).classList.remove('pulse'); setTimeout(nudge, 30000);
});
if (store.get('tp_tour', false)) setTimeout(nudge, 20000);

function finishIntro() {
  introDone = true; mode = 'focus'; setTimeout(() => $('#intro').remove(), 900); $('#intro').classList.add('fade');
  updateUI();
  if (!focus.mine) setTimeout(() => toast(`Welcome to ${focus.name}! Leave a ❤️, then build your own`, 3800), 400);
  else if (needsName()) setTimeout(() => askName(true), 900);
  else if (!store.get('tp_tour', false)) setTimeout(startTour, 1200);
  else if (!store.get('tp_built', false)) hint('Pick something below, then tap your planet to place it ✨');
  setTimeout(() => {
    const vis = visibleWalkers().filter((w) => w.type === 'person');
    if (vis.length) say(vis[0], focus.mine ? 'Welcome home! 🏡' : 'Welcome, traveller! 👋', 3);
  }, 700);
}

// ---------------------------------------------------------------- boot
const sharedId = new URLSearchParams(location.search).get('p');
const local = store.get('tp_planet', null);
mine = addPlanet({
  id: me.id, mine: true, tz: myTz,
  name: local?.name || randomName(),
  palette: local?.palette ?? 0, weather: local?.weather || '',
  data: local?.data || [],
});
if (!local) store.set('tp_planet', mine.serialize());
mine.spawnT = now();
let startPlanet = mine;
renderCats(); renderItems();

(async () => {
  const wait = loadUniverse(true);
  if (sharedId && sharedId !== me.id) { await Promise.race([wait, new Promise((r) => setTimeout(r, 2500))]); startPlanet = planets.find((p) => p.id === sharedId) || mine; }
  else { layout(); }
  if (sharedId && startPlanet === mine && sharedId !== me.id) toast("Couldn't find that planet, here's yours!");
  history.replaceState(null, '', location.pathname);
  startIntro();
  if (store.get('tp_weather_on', false)) syncWeather(true);
  schedulePoll();
})();

// ---------------------------------------------------------------- loop
let last = now(), timeTick = 0, frameNo = 0;
const perf = { n: 0, acc: 0, level: 0 };
function watchPerf(dt) {
  if (dt > 0.5) return; // tab switch etc.
  perf.acc += dt; perf.n++;
  if (perf.n < 120) return;
  const fps = perf.n / perf.acc; perf.n = 0; perf.acc = 0;
  if (fps < 40 && perf.level < 3) {
    perf.level++;
    if (perf.level === 1) { pixelRatio = Math.max(1, pixelRatio - 0.25); renderer.setPixelRatio(pixelRatio); }
    if (perf.level === 2) { pixelRatio = 1; renderer.setPixelRatio(1); sun.shadow.mapSize.set(512, 512); sun.shadow.map?.dispose(); sun.shadow.map = null; }
    if (perf.level === 3) { sun.castShadow = false; clouds.visible = false; }
  }
}
function tick() {
  requestAnimationFrame(tick);
  const t = now(); const rawDt = t - last; const dt = Math.min(0.05, rawDt); last = t;
  frameNo++;
  if (mobile && (frameNo % 3 === 0 || fly)) renderer.shadowMap.needsUpdate = true;
  if (introDone && !recording && !document.hidden) watchPerf(rawDt);
  if (t - timeTick > 5) { timeTick = t; planets.forEach((p) => p.updateTime()); updateMeta(); }
  if (cinema) focus.updateTime();
  updateFly(t);
  if (!fly && controls.enabled) {
    controls.update();
    if (mode === 'focus' && controls.getDistance() > controls.maxDistance - 2 && wheelOut) enterUniverse();
  }
  wheelOut = false;
  for (const p of planets) {
    if (p.spawnT) { const k = (t - p.spawnT) / 0.9; const s = k <= 0 ? 0.001 : elastic(k); p.group.scale.setScalar(Math.max(0.001, s)); if (k >= 1) { p.spawnT = 0; p.group.scale.setScalar(1); } }
    if (p !== focus) p.group.rotation.y += p.spin * dt;
    if (p.fold) p.updateFold(t); else if (p.growT) p.updateGrow(t);
    if (p.walkersOn) p.updateWalkers(dt, t);
  }
  clouds.rotation.y += dt * 0.02;
  lod(false); updatePops(t); updateBurst(dt); updateWeather(dt);
  if (recording) recording.hour = (recording.h0 + clamp((t - recording.t0) / recording.dur, 0, 1) * 24) % 24, recording.p.updateTime();
  applySky(dt); updateSunLight(); updateLabels(t); updateBubble(t);
  if (recording) recordFrame(t); else renderer.render(scene, camera);
}
// detect "zooming out past the planet" intent
let wheelOut = false;
el.addEventListener('wheel', (e) => { if (e.deltaY > 0) wheelOut = true; }, { passive: true });
let pinchD = 0;
el.addEventListener('touchmove', (e) => { if (e.touches.length === 2) { const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY); if (pinchD && d < pinchD - 2) wheelOut = true; pinchD = d; } }, { passive: true });
el.addEventListener('touchend', () => (pinchD = 0));
tick();

function setView() {
  camera.aspect = innerWidth / innerHeight;
  // lift the scene above the build dock on tall screens
  const off = innerHeight > innerWidth ? Math.round(innerHeight * 0.07) : Math.round(innerHeight * 0.05);
  camera.setViewOffset(innerWidth, innerHeight, 0, off, innerWidth, innerHeight);
  camera.updateProjectionMatrix();
}
setView();
addEventListener('resize', () => {
  setView(); renderer.setSize(innerWidth, innerHeight);
  if (mode === 'focus') controls.maxDistance = focusDist() * 1.9;
});
document.addEventListener('visibilitychange', () => { if (!music.ctx) return; document.hidden ? music.ctx.suspend() : musicOn && music.ctx.resume(); });
const OWN = new Set(['app', 'labels', 'bubble', 'intro', 'top', 'side', 'dock', 'visit', 'universeBar', 'hint', 'toast', 'modal', 'watermark', 'credit', 'coach', 'btnMusic']);
function killBadge() {
  for (const n of [...document.body.children]) {
    if (OWN.has(n.id) || n.tagName === 'SCRIPT') continue;
    const head = (n.outerHTML || '').slice(0, 600);
    if (/netlify/i.test(head) || /netlify/i.test(n.textContent || '') || n.tagName.includes('-')) n.remove();
  }
}
killBadge(); new MutationObserver(killBadge).observe(document.body, { childList: true });
{ const c = $('#credit'); c.querySelector('b').textContent = CREATOR.name; if (CREATOR.url) c.href = CREATOR.url; else c.removeAttribute('href'); }
window.__tp = { dbg: () => { const s = mine.sphere; const g = s.geometry; return { bs: g.boundingSphere && g.boundingSphere.radius, a0: Array.from(g.attributes.position.array.slice(0, 3)), solid: !!mine.solid, gpos: mine.group.position.toArray(), scale: mine.group.scale.x, cam: camera.position.toArray(), focusIsMine: focus === mine }; }, hit: (x, y) => { const h = hitFocus(x, y); return h && h.dir.toArray(); }, st: () => ({ tool, introDone, fly: !!fly, cinema: !!cinema, rec: !!recording, down, painting }), project: (it) => { const v = mine.group.localToWorld(itemDir(it).multiplyScalar(R)); v.project(camera); return [Math.round((v.x + 1) / 2 * innerWidth), Math.round((1 - v.y) / 2 * innerHeight)]; }, perf, makeVideo: () => makeVideo(),  cam: () => [camera.position.toArray().map(v=>+v.toFixed(1)), controls.target.toArray()], placeAt: (type, x, y, z) => { setTool(type); placeItem(new THREE.Vector3(x, y, z).normalize()); }, planets, get focus() { return focus; }, get mode() { return mode; }, flyTo, enterUniverse, setTool, placeItem: (d) => placeItem(d), makePostcard, mine: () => mine };
