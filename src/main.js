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
const UP = new THREE.Vector3(0, 1, 0);
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
const renderer = new THREE.WebGLRenderer({ antialias: !lowEnd, alpha: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, isTouch ? 1.6 : 2));
renderer.setSize(innerWidth, innerHeight);
renderer.setClearColor(0x000000, 0);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
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
sun.shadow.mapSize.set(lowEnd ? 1024 : 2048, lowEnd ? 1024 : 2048);
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
    const geo = new THREE.IcosahedronGeometry(R, lowEnd ? 3 : 4);
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
    for (const it of this.items) {
      const def = ITEM_BY_ID[it[0]];
      if (def.walker || this.popping.has(it)) continue;
      itemMatrix(it, m);
      bakeParts(def.build(mulberry(seedOf(it))), m, out);
      if (def.spin) {
        bladeGeo ||= mergeParts(buildPart.windmillBlades());
        const holder = new THREE.Object3D(); itemMatrix(it, holder.matrix); holder.matrixAutoUpdate = false;
        const blades = new THREE.Mesh(bladeGeo, this.mat); blades.position.set(0, 1.95, 0.48); blades.castShadow = true;
        holder.add(blades); this.group.add(holder); this.spinners.push({ holder, blades });
      }
    }
    if (out.solid.length) { this.solid = new THREE.Mesh(mergeGeometries(out.solid), this.mat); this.solid.castShadow = this.solid.receiveShadow = true; this.group.add(this.solid); }
    if (out.glow.length) { this.glow = new THREE.Mesh(mergeGeometries(out.glow), this.glowMat); this.group.add(this.glow); }
    this.detail = true;
  }
  dropDetail(all = true) {
    for (const k of ['solid', 'glow']) if (this[k]) { this.group.remove(this[k]); this[k].geometry.dispose(); this[k] = null; }
    for (const s of this.spinners) this.group.remove(s.holder);
    this.spinners = [];
    if (all) { this.detail = false; this.setWalkers(false); }
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
    const target = Math.min(10, (this.items.length ? 2 : 0) + homes.length);
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
    const mesh = new THREE.Mesh(walkerGeo(type, seed), this.mat); mesh.castShadow = true;
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
    this.hour = peek && this === focus ? 12.5 : localHour(this.tz);
    this.L = lightState(this.hour);
    tintFor(this.L, _tint); this.mat.color.copy(_tint);
    const g = 0.72 + (1 - this.L.dl) * 0.6; this.glowMat.color.setRGB(g, g, g * (this.L.dl > 0.5 ? 0.9 : 1));
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
const SELECT = 'select=id,name,tz,weather,palette,data,hearts,visits,updated_at';
let saveTimer = null, saving = false;
function scheduleSave(delay = 1500) {
  store.set('tp_planet', mine.serialize());
  clearTimeout(saveTimer); saveTimer = setTimeout(savePlanet, delay);
}
async function savePlanet() {
  if (saving) { scheduleSave(800); return; }
  saving = true;
  try {
    await api('rpc/save_planet', { method: 'POST', body: JSON.stringify({ p_id: mine.id, p_secret: me.secret, p_name: mine.name, p_tz: myTz, p_weather: mine.weather || null, p_palette: mine.palette, p_data: mine.items }) });
    if (!me.saved) { me.saved = true; store.set('tp_me', me); }
  } catch (e) { console.warn('save failed', e); }
  saving = false;
}
const bump = (id, kind) => api('rpc/bump_planet', { method: 'POST', body: JSON.stringify({ p_id: id, p_kind: kind }) }).catch(() => {});

function addPlanet(row) {
  const p = new Planet(row); planets.push(p); return p;
}
async function loadUniverse(first) {
  let rows = [];
  try { rows = await api(`planets?${SELECT}&order=updated_at.desc&limit=48`); } catch (e) { console.warn(e); }
  if (sharedId && sharedId !== me.id && !rows.find((r) => r.id === sharedId)) {
    try { const one = await api(`planets?${SELECT}&id=eq.${encodeURIComponent(sharedId)}`); if (one?.length) rows.unshift(one[0]); } catch {}
  }
  let added = false;
  for (const row of rows) {
    if (row.id === me.id) continue;
    const ex = planets.find((p) => p.id === row.id);
    if (ex) {
      if (ex.updated !== row.updated_at) {
        Object.assign(ex, { name: row.name, tz: row.tz || 'UTC', weather: row.weather || '', hearts: row.hearts, visits: row.visits, updated: row.updated_at, items: sanitize(row.data) });
        if (ex.palette !== (row.palette | 0)) { ex.palette = row.palette | 0; ex.buildBase(); }
        if (ex.detail) { ex.buildDetail(); ex.syncWalkers(); }
        ex.label && (ex.label.firstChild.textContent = ex.name);
      }
    } else { const p = addPlanet(row); p.spawnT = now() + Math.random() * 0.6; added = true; }
  }
  const real = planets.filter((p) => !p.npc && !p.mine).length;
  if (first) for (let i = 0; i < Math.max(0, 12 - real); i++) { const p = addPlanet(npcPlanet(i)); p.spawnT = now() + 0.3 + i * 0.07; added = true; }
  if (added || first) layout();
  return rows;
}
function layout() {
  // home planet at origin; shared planet first so it sits close by
  const others = planets.filter((p) => !p.mine);
  others.sort((a, b) => (b.id === sharedId) - (a.id === sharedId) || (a.npc - b.npc));
  others.forEach((p, i) => {
    const a = i * 2.39996 + 0.6, rad = 62 + 26 * Math.sqrt(i);
    p.group.position.set(Math.cos(a) * rad, (((i * 37) % 11) - 5) * 6, Math.sin(a) * rad);
  });
  $('#uniCount').textContent = planets.length;
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
    const m = new THREE.Mesh(mergeParts(parts), cloudMat); m.castShadow = true;
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
const WN = lowEnd ? 160 : 280;
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
  el.firstChild.textContent = p.mine ? 'You · ' + p.name : p.name;
  labelsEl.appendChild(el); p.label = el; return el;
}
const _proj = new THREE.Vector3();
let labelTick = 0;
function updateLabels(t) {
  const updateText = t - labelTick > 2; if (updateText) labelTick = t;
  for (const p of planets) {
    const el = ensureLabel(p);
    const hide = (!introDone && t - introT0 < 3.2) || (mode === 'focus' && p === focus) || p.group.scale.x < 0.3;
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
    if (mode === 'focus') { const d = focusDist(); controls.minDistance = R * 1.5; controls.maxDistance = d * 1.9; }
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
  const maxDetail = lowEnd ? 5 : 9; let built = 0;
  ranked.forEach(({ p, d }, i) => {
    const wantDetail = p === focus || p === mine || (i < maxDetail && d < 420);
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
    b.onclick = () => { setTool(tool === it.id ? 'look' : it.id); };
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
  $('#dock').classList.toggle('hidden', !(mode === 'focus' && p.mine));
  $('#visit').classList.toggle('hidden', !vis);
  $('#universeBar').classList.toggle('hidden', mode !== 'universe');
  $('#btnUniverse').classList.toggle('on', mode === 'universe');
  if (mode === 'universe') { $('#planetName').textContent = 'The Paper Universe'; $('#planetMeta').textContent = `${planets.length} tiny planets`; }
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
$('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal') closeModal(); });

$('#btnUniverse').onclick = () => { if (mode === 'universe') flyTo(mine); else if (mode === 'focus') enterUniverse(); };
$('#btnHome').onclick = $('#btnHome2').onclick = () => flyTo(mine);
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
$('#nameBtn').onclick = () => {
  if (mode !== 'focus' || !focus?.mine) return;
  modal(`<h2>Name your planet</h2><input id="nameInput" maxlength="40" value="" /><div class="row"><button class="chip" id="nameCancel">Cancel</button><button class="chip primary" id="nameOk">Save</button></div>`);
  const inp = $('#nameInput'); inp.value = mine.name; setTimeout(() => inp.select(), 50);
  const ok = () => { const v = inp.value.trim().slice(0, 40); if (v) { mine.name = v; if (mine.label) mine.label.firstChild.textContent = 'You · ' + v; scheduleSave(300); updateUI(); } closeModal(); };
  $('#nameOk').onclick = ok; $('#nameCancel').onclick = closeModal; inp.onkeydown = (e) => e.key === 'Enter' && ok();
};

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
  const url = c.toDataURL('image/png');
  const blob = await new Promise((res) => c.toBlob(res, 'image/png'));
  const file = new File([blob], `tiny-planet-${(p.name || 'postcard').replace(/\W+/g, '-').toLowerCase()}.png`, { type: 'image/png' });
  const canShareFile = navigator.canShare && navigator.canShare({ files: [file] });
  modal(`<h2>Your postcard 📮</h2><img src="${url}" alt="Postcard"/><div class="row"><button class="chip" id="pcClose">Close</button><a class="chip" id="pcSave" download="${file.name}" href="${url}" style="text-decoration:none">⬇️ Save</a>${canShareFile ? '<button class="chip primary" id="pcShare">📤 Share</button>' : ''}</div>`);
  $('#pcClose').onclick = closeModal;
  if (canShareFile) $('#pcShare').onclick = async () => { try { await navigator.share({ files: [file], title: 'Tiny Planets', text: `Greetings from ${p.name} 🪐 ${p.npc ? location.origin : shareUrl(p)}` }); } catch {} };
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
function placeItem(dir) {
  if (mine.items.length >= MAX_ITEMS) { toast('Your planet is full! Remove something first'); return; }
  const def = ITEM_BY_ID[tool];
  let rot = Math.random() * 360; let d = dir.clone();
  if (def.chain && chainPrev && chainPrev.type === tool && chainPrev.dir.angleTo(d) < 0.32 && mine.items.includes(chainPrev.it)) {
    const step = (tool === 'fence' ? 1.55 : 1.6) / R;
    const t = d.clone().addScaledVector(chainPrev.dir, -d.dot(chainPrev.dir)); // heading from prev, tangent at prev
    if (t.lengthSq() > 1e-6) {
      t.normalize();
      d = chainPrev.dir.clone().multiplyScalar(Math.cos(step)).addScaledVector(t, Math.sin(step)).normalize();
      const fwd = d.clone().sub(chainPrev.dir); fwd.addScaledVector(d, -fwd.dot(d)).normalize();
      _q.setFromUnitVectors(UP, d); const f0 = new THREE.Vector3(0, 0, 1).applyQuaternion(_q), r0 = new THREE.Vector3(1, 0, 0).applyQuaternion(_q);
      let a = Math.atan2(fwd.dot(r0), fwd.dot(f0));
      if (tool === 'fence') a += Math.PI / 2;
      rot = ((a * 180) / Math.PI + 360) % 360;
      if (!chainPrev.fixed) { chainPrev.it[4] = Math.round(rot); chainPrev.fixed = true; mine.popping.has(chainPrev.it) || mine.buildDetail(); }
    }
  } else {
    // nudge away from overlapping a big item
    for (const it of mine.items) { const od = itemDir(it); if (ITEM_BY_ID[it[0]].big && od.angleTo(d) < 0.08) { d.addScaledVector(d.clone().sub(od).normalize(), 0.06).normalize(); } }
  }
  const it = toTuple(tool, d, rot);
  mine.items.push(it); undoStack.push(it); if (undoStack.length > 80) undoStack.shift();
  if (def.chain) chainPrev = { type: tool, dir: itemDir(it), it, fixed: chainPrev?.type === tool };
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
el.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, t: now(), id: e.pointerId, multi: !!down }; });
el.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse') { lastMouse = { x: e.clientX, y: e.clientY }; updateGhost(); } });
el.addEventListener('pointerleave', () => { lastMouse = null; updateGhost(); });
el.addEventListener('pointerup', (e) => {
  if (!down) return; const d = down; down = null;
  if (d.multi || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 9 || now() - d.t > 0.45) return;
  onTap(e.clientX, e.clientY);
});
el.addEventListener('pointercancel', () => (down = null));
function onTap(x, y) {
  if (!introDone) { skipIntro(); return; }
  if (fly) return;
  if (mode === 'universe') { const p = hitPlanet(x, y); if (p) flyTo(p); return; }
  const h = hitFocus(x, y);
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
  if (e.key === 'Escape') { closeModal(); setTool('look'); }
});

// ---------------------------------------------------------------- intro
let introDone = false; let introT0 = 0;
function startIntro() {
  mode = 'intro'; introT0 = now();
  const target = startPlanet;
  camera.position.set(target.group.position.x + 160, 300, target.group.position.z + 560);
  controls.target.set(0, 0, 0); camera.lookAt(0, 0, 0);
  setFocus(target);
  setTimeout(() => {
    fly = { fromPos: camera.position.clone(), fromT: controls.target.clone(), toT: target.group.position.clone(), toPos: target.group.position.clone().add(new THREE.Vector3(0.1, 0.5, 1).normalize().multiplyScalar(focusDist())), t0: now(), dur: 3.6 };
    mode = 'flyin';
  }, 650);
  setTimeout(() => $('#intro').classList.add('fade'), 2900);
}
function skipIntro() { if (fly) fly.t0 -= fly.dur; }
function finishIntro() {
  introDone = true; mode = 'focus'; setTimeout(() => $('#intro').remove(), 900); $('#intro').classList.add('fade');
  updateUI();
  if (!focus.mine) setTimeout(() => toast(`Welcome to ${focus.name}! Leave a ❤️, then build your own`, 3800), 400);
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
  name: local?.name || NAMES_A[Math.floor(Math.random() * NAMES_A.length)] + ' ' + NAMES_B[Math.floor(Math.random() * NAMES_B.length)],
  palette: local?.palette ?? 0, weather: local?.weather || '',
  data: local?.data || starterItems(parseInt(me.id.slice(0, 6), 36) || 1),
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
  setInterval(() => loadUniverse(false), 45000);
})();

// ---------------------------------------------------------------- loop
let last = now(), timeTick = 0;
function tick() {
  requestAnimationFrame(tick);
  const t = now(); const dt = Math.min(0.05, t - last); last = t;
  if (t - timeTick > 5) { timeTick = t; planets.forEach((p) => p.updateTime()); updateMeta(); }
  updateFly(t);
  if (!fly && controls.enabled) {
    controls.update();
    if (mode === 'focus' && controls.getDistance() > controls.maxDistance - 2 && wheelOut) enterUniverse();
  }
  wheelOut = false;
  for (const p of planets) {
    if (p.spawnT) { const k = (t - p.spawnT) / 0.9; const s = k <= 0 ? 0.001 : elastic(k); p.group.scale.setScalar(Math.max(0.001, s)); if (k >= 1) { p.spawnT = 0; p.group.scale.setScalar(1); } }
    if (p !== focus) p.group.rotation.y += p.spin * dt;
    if (p.walkersOn) p.updateWalkers(dt, t);
  }
  clouds.rotation.y += dt * 0.02;
  lod(false); updatePops(t); updateBurst(dt); updateWeather(dt);
  applySky(dt); updateSunLight(); updateLabels(t); updateBubble(t);
  renderer.render(scene, camera);
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
window.__tp = { cam: () => [camera.position.toArray().map(v=>+v.toFixed(1)), controls.target.toArray()], placeAt: (type, x, y, z) => { setTool(type); placeItem(new THREE.Vector3(x, y, z).normalize()); }, planets, get focus() { return focus; }, get mode() { return mode; }, flyTo, enterUniverse, setTool, placeItem: (d) => placeItem(d), makePostcard, mine: () => mine };
