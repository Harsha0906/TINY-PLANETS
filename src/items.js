// Papercraft item catalog. Every item is a list of low-poly "paper" parts with a
// baked colour, so a whole planet can be merged into one or two draw calls.
import * as THREE from 'three';

export const PAL = {
  cream: '#f4ead5', paper: '#fbf6ea', kraft: '#c9a57a', brown: '#8b5e3c', dark: '#5d3a24',
  leaf: '#6fae5b', leafDark: '#4a8a4c', leafLight: '#a6cf6e', olive: '#7fa04a',
  red: '#d9644a', terracotta: '#c8693f', blue: '#4f7cac', sky: '#7fb8d8', yellow: '#f2c14e',
  saffron: '#f39237', pink: '#ec8fa3', water: '#5fb6d9', waterLight: '#a5dcef', grey: '#9aa0a6',
  stone: '#b8ae9c', ink: '#3b3b46', white: '#fffaf0', gold: '#e0b13e', green: '#3f9b6a',
  teal: '#3aa6a0', purple: '#9b7bc4', glow: '#ffd66b', flame: '#ffab3d', snow: '#ffffff',
  skin1: '#e8b48a', skin2: '#c98d5e', skin3: '#9a6440',
};

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
// transform helper: scale -> rotate -> translate
function T(geo, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  _q.setFromEuler(_e.set(rx, ry, rz));
  _m.compose(new THREE.Vector3(x, y, z), _q, new THREE.Vector3(sx, sy, sz));
  geo.applyMatrix4(_m);
  return geo;
}
const P = (geo, color, glow = false) => ({ geo, color, glow });
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const cyl = (rt, rb, h, s = 7) => new THREE.CylinderGeometry(rt, rb, h, s);
const cone = (r, h, s = 6) => new THREE.ConeGeometry(r, h, s);
const ico = (r, d = 0) => new THREE.IcosahedronGeometry(r, d);
const sph = (r, w = 8, h = 6) => new THREE.SphereGeometry(r, w, h);
const pick = (rand, arr) => arr[Math.floor(rand() * arr.length) % arr.length];

function prismRoof(w, h, d) { // triangular prism, ridge along x
  const g = cyl(1, 1, 1, 3);
  T(g, 0, 0, 0, -Math.PI / 2, 0, Math.PI / 2);
  // after rotating, triangle lies in yz plane; scale to fit
  g.computeBoundingBox();
  const bb = g.boundingBox; const sy = h / (bb.max.y - bb.min.y); const sz = d / (bb.max.z - bb.min.z);
  T(g, 0, -bb.min.y * sy, 0, 0, 0, 0, w, sy, sz);
  return g;
}

// ---------- builders ----------
const B = {};

B.pine = (r) => {
  const c = pick(r, [PAL.leafDark, PAL.green, '#5b9a58']);
  return [
    P(T(cyl(0.12, 0.16, 0.6, 5), 0, 0.3), PAL.brown),
    P(T(cone(0.75, 1.0, 6), 0, 1.0), c),
    P(T(cone(0.58, 0.85, 6), 0, 1.45, 0, 0, 0.5), c),
    P(T(cone(0.4, 0.7, 6), 0, 1.9, 0, 0, 0.2), c),
  ];
};
B.tree = (r) => {
  const c = pick(r, [PAL.leaf, PAL.olive, '#86b95a', '#e39b4f', '#d97a5a']);
  return [
    P(T(cyl(0.1, 0.15, 0.9, 5), 0, 0.45), PAL.brown),
    P(T(ico(0.7, 0), 0, 1.3), c),
    P(T(ico(0.45, 0), 0.35, 1.55, 0.15), PAL.leafLight),
    P(T(ico(0.4, 0), -0.3, 1.15, -0.2), c),
  ];
};
B.palm = () => {
  const parts = [];
  for (let i = 0; i < 5; i++) parts.push(P(T(cyl(0.09, 0.12, 0.45, 5), i * 0.05, 0.22 + i * 0.42, 0, 0, 0, -0.08 * i), PAL.kraft));
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const g = T(box(1.3, 0.03, 0.32), 0.65, 0, 0, 0, 0, -0.35);
    T(g, 0.25, 2.25, 0, 0, a, 0);
    parts.push(P(g, i % 2 ? PAL.leaf : PAL.leafDark));
  }
  parts.push(P(T(ico(0.12, 0), 0.32, 2.12, 0.1), PAL.dark), P(T(ico(0.12, 0), 0.18, 2.1, -0.12), PAL.dark));
  return parts;
};
B.banyan = () => {
  const parts = [P(T(cyl(0.28, 0.42, 1.4, 7), 0, 0.7), PAL.brown)];
  [[0, 1.9, 0, 1.2], [0.9, 1.7, 0.3, 0.85], [-0.9, 1.7, -0.2, 0.9], [0.2, 1.75, -0.9, 0.8], [-0.3, 1.7, 0.9, 0.8]]
    .forEach(([x, y, z, s], i) => parts.push(P(T(ico(s, 0), x, y, z), i % 2 ? PAL.leafDark : PAL.leaf)));
  [[0.9, 0.3], [-0.9, -0.2], [0.3, -0.9], [-0.4, 0.9], [1.3, -0.4]].forEach(([x, z]) => parts.push(P(T(cyl(0.035, 0.035, 1.5, 4), x, 0.75, z), PAL.kraft)));
  return parts;
};
B.flowers = (r) => {
  const parts = [];
  for (let i = 0; i < 7; i++) {
    const a = r() * Math.PI * 2, d = r() * 0.55, x = Math.cos(a) * d, z = Math.sin(a) * d, h = 0.25 + r() * 0.25;
    parts.push(P(T(cyl(0.02, 0.02, h, 3), x, h / 2, z), PAL.leafDark));
    parts.push(P(T(ico(0.1, 0), x, h, z), pick(r, [PAL.pink, PAL.yellow, PAL.white, PAL.saffron, PAL.purple])));
  }
  return parts;
};
B.bush = (r) => [
  P(T(ico(0.45, 0), 0, 0.3), PAL.leaf), P(T(ico(0.32, 0), 0.38, 0.22, 0.1), PAL.leafDark),
  P(T(ico(0.28, 0), -0.3, 0.2, 0.2), PAL.olive), P(T(ico(0.07, 0), 0.1, 0.72, 0.15), r() < 0.5 ? PAL.pink : PAL.red),
];
B.rock = (r) => [P(T(ico(0.45, 0), 0, 0.2, 0, r(), r(), 0, 1, 0.7, 0.9), PAL.stone), P(T(ico(0.25, 0), 0.45, 0.1, 0.1), PAL.grey)];
B.mountain = () => [
  P(T(cone(2.3, 3.4, 7), 0, 1.6), PAL.stone),
  P(T(cone(1.4, 2.3, 6), 1.3, 1.0, 0.6, 0, 0.4), '#a89c87'),
  P(T(cone(0.86, 1.2, 7), 0, 2.72), PAL.snow),
];
B.pond = () => [
  P(T(cyl(1.55, 1.6, 0.06, 12), 0, 0.02), PAL.kraft),
  P(T(cyl(1.35, 1.35, 0.08, 12), 0, 0.05), PAL.water),
  P(T(cyl(0.5, 0.5, 0.085, 10), 0.4, 0.06, -0.3), PAL.waterLight),
];
B.lotus = (r) => {
  const parts = [P(T(cyl(1.25, 1.3, 0.06, 12), 0, 0.02), PAL.stone), P(T(cyl(1.08, 1.08, 0.08, 12), 0, 0.05), PAL.water)];
  for (let i = 0; i < 4; i++) {
    const a = r() * 6.28, d = 0.25 + r() * 0.6, x = Math.cos(a) * d, z = Math.sin(a) * d;
    parts.push(P(T(cyl(0.22, 0.22, 0.02, 8), x, 0.1, z), PAL.leaf));
    if (i % 2 === 0) for (let k = 0; k < 5; k++) parts.push(P(T(cone(0.06, 0.2, 4), x + Math.cos(k * 1.25) * 0.06, 0.2, z + Math.sin(k * 1.25) * 0.06, Math.cos(k * 1.25) * 0.5, 0, -Math.sin(k * 1.25) * 0.5), PAL.pink));
  }
  return parts;
};
B.house = (r) => {
  const wall = pick(r, [PAL.cream, '#f6d6c2', '#e8f0dc', '#fbe7a6', '#d8e6f2']);
  const roof = pick(r, [PAL.red, PAL.blue, PAL.terracotta, PAL.teal]);
  return [
    P(T(box(1.3, 0.95, 1.05), 0, 0.475), wall),
    P(T(prismRoof(1.5, 0.65, 1.3), 0, 0.95), roof),
    P(T(box(0.3, 0.5, 0.04), 0, 0.25, 0.53), PAL.dark),
    P(T(box(0.26, 0.24, 0.04), -0.4, 0.6, 0.53), PAL.glow, true),
    P(T(box(0.26, 0.24, 0.04), 0.4, 0.6, 0.53), PAL.glow, true),
    P(T(box(0.04, 0.24, 0.26), 0.66, 0.55, 0), PAL.glow, true),
    P(T(box(0.18, 0.4, 0.18), 0.4, 1.35, -0.2), PAL.kraft),
  ];
};
B.hut = () => [
  P(T(cyl(0.6, 0.65, 0.7, 8), 0, 0.35), PAL.kraft),
  P(T(cone(0.95, 0.85, 8), 0, 1.12), PAL.yellow),
  P(T(box(0.26, 0.42, 0.04), 0, 0.21, 0.63), PAL.dark),
  P(T(box(0.18, 0.16, 0.04), 0.35, 0.45, 0.5, 0, 0.6, 0), PAL.glow, true),
];
B.temple = () => {
  const parts = [P(T(box(1.9, 0.2, 1.9), 0, 0.1), PAL.stone)];
  const tiers = [[1.5, 0.55, PAL.saffron], [1.22, 0.45, PAL.terracotta], [0.98, 0.42, PAL.saffron], [0.76, 0.38, PAL.terracotta], [0.55, 0.34, PAL.saffron], [0.36, 0.3, PAL.red]];
  let y = 0.2;
  tiers.forEach(([w, h, c]) => { parts.push(P(T(box(w, h, w * 0.8), 0, y + h / 2), c)); y += h; });
  parts.push(P(T(sph(0.14), 0, y + 0.1), PAL.gold), P(T(cone(0.07, 0.25, 5), 0, y + 0.3), PAL.gold));
  parts.push(P(T(box(0.34, 0.45, 0.06), 0, 0.42, 0.62), PAL.dark));
  parts.push(P(T(box(0.02, 0.8, 0.02), 0.2, y + 0.4, 0), PAL.dark), P(T(cone(0.16, 0.3, 3), 0.33, y + 0.66, 0, 0, 0, -Math.PI / 2), PAL.saffron));
  parts.push(P(T(cyl(0.08, 0.05, 0.06, 6), -0.45, 0.24, 0.85), PAL.terracotta), P(T(cone(0.04, 0.12, 4), -0.45, 0.33, 0.85), PAL.flame, true));
  parts.push(P(T(cyl(0.08, 0.05, 0.06, 6), 0.45, 0.24, 0.85), PAL.terracotta), P(T(cone(0.04, 0.12, 4), 0.45, 0.33, 0.85), PAL.flame, true));
  return parts;
};
B.chai = () => {
  const parts = [
    P(T(box(1.3, 0.6, 0.7), 0, 0.55), PAL.kraft),
    P(T(box(1.35, 0.06, 0.75), 0, 0.88), PAL.brown),
    P(T(cyl(0.2, 0.2, 0.08, 8), -0.45, 0.2, 0.38, Math.PI / 2), PAL.ink),
    P(T(cyl(0.2, 0.2, 0.08, 8), 0.45, 0.2, 0.38, Math.PI / 2), PAL.ink),
    P(T(cyl(0.2, 0.2, 0.08, 8), -0.45, 0.2, -0.38, Math.PI / 2), PAL.ink),
    P(T(cyl(0.2, 0.2, 0.08, 8), 0.45, 0.2, -0.38, Math.PI / 2), PAL.ink),
    P(T(box(0.04, 0.8, 0.04), -0.62, 1.3, 0.3), PAL.dark), P(T(box(0.04, 0.8, 0.04), 0.62, 1.3, 0.3), PAL.dark),
    P(T(box(0.04, 0.8, 0.04), -0.62, 1.3, -0.3), PAL.dark), P(T(box(0.04, 0.8, 0.04), 0.62, 1.3, -0.3), PAL.dark),
    P(T(cyl(0.13, 0.16, 0.22, 7), 0.3, 1.02, 0), '#b9c2c9'), P(T(cone(0.05, 0.14, 5), 0.48, 1.08, 0, 0, 0, -1.1), '#b9c2c9'),
    P(T(cyl(0.05, 0.04, 0.09, 6), -0.2, 0.96, 0.15), PAL.white), P(T(cyl(0.05, 0.04, 0.09, 6), -0.35, 0.96, 0.05), PAL.white),
    P(T(box(0.9, 0.22, 0.03), 0, 0.6, 0.37), PAL.yellow),
    P(T(sph(0.08), 0.5, 1.5, 0.32), PAL.glow, true),
    P(T(box(0.9, 0.08, 0.3), 0, 0.3, 0.95), PAL.brown),
  ];
  for (let i = 0; i < 5; i++) parts.push(P(T(box(0.28, 0.04, 0.78), -0.56 + i * 0.28, 1.72, 0, 0.18), i % 2 ? PAL.white : PAL.red));
  return parts;
};
B.rickshaw = () => [
  P(T(box(0.8, 0.45, 1.1), 0, 0.42), PAL.green),
  P(T(box(0.82, 0.08, 1.15), 0, 0.68), PAL.ink),
  P(T(cyl(0.45, 0.45, 1.1, 8, 1), 0, 0.8, -0.05, Math.PI / 2, 0, 0, 1, 1, 1), PAL.yellow),
  P(T(box(0.92, 0.5, 1.15), 0, 0.5, -0.05), PAL.yellow),
  P(T(box(0.7, 0.28, 0.04), 0, 0.88, 0.55), '#cfe8ef'),
  P(T(cyl(0.16, 0.16, 0.1, 8), 0, 0.16, 0.55, 0, 0, Math.PI / 2), PAL.ink),
  P(T(cyl(0.16, 0.16, 0.1, 8), -0.42, 0.16, -0.35, 0, 0, Math.PI / 2), PAL.ink),
  P(T(cyl(0.16, 0.16, 0.1, 8), 0.42, 0.16, -0.35, 0, 0, Math.PI / 2), PAL.ink),
  P(T(sph(0.06), 0, 0.5, 0.64), PAL.glow, true),
];
B.palace = () => {
  const parts = [P(T(box(2.3, 0.18, 2.3), 0, 0.09), PAL.stone), P(T(box(1.5, 1.0, 1.5), 0, 0.68), PAL.white)];
  parts.push(P(T(sph(0.62, 10, 8), 0, 1.25, 0, 0, 0, 0, 1, 1.15, 1), PAL.white), P(T(cyl(0.38, 0.4, 0.2, 10), 0, 1.22), PAL.white));
  parts.push(P(T(cone(0.06, 0.4, 5), 0, 2.15), PAL.gold));
  parts.push(P(T(box(0.4, 0.62, 0.05), 0, 0.5, 0.76), '#d9cfb8'), P(T(box(0.26, 0.45, 0.05), 0, 0.45, 0.78), PAL.glow, true));
  [[-0.95, -0.95], [0.95, -0.95], [-0.95, 0.95], [0.95, 0.95]].forEach(([x, z]) => {
    parts.push(P(T(cyl(0.09, 0.11, 1.6, 6), x, 0.98, z), PAL.white), P(T(sph(0.13, 6, 4), x, 1.82, z), PAL.white));
  });
  return parts;
};
B.diya = () => [
  P(T(cyl(0.22, 0.12, 0.12, 8), 0, 0.06), PAL.terracotta),
  P(T(cone(0.07, 0.24, 5), 0.1, 0.24), PAL.flame, true),
  P(T(cyl(0.1, 0.06, 0.08, 6), -0.3, 0.04, 0.2), PAL.terracotta), P(T(cone(0.05, 0.16, 4), -0.26, 0.16, 0.2), PAL.flame, true),
];
B.rangoli = (r) => {
  const cs = [PAL.pink, PAL.yellow, PAL.saffron, PAL.teal, PAL.purple, PAL.red, PAL.white];
  const off = Math.floor(r() * cs.length);
  const parts = [];
  [1.0, 0.8, 0.6, 0.42, 0.25].forEach((rad, i) => parts.push(P(T(cyl(rad, rad, 0.03, i % 2 ? 12 : 8), 0, 0.015 + i * 0.006), cs[(off + i) % cs.length])));
  for (let i = 0; i < 8; i++) { const a = (i / 8) * 6.283; parts.push(P(T(cone(0.13, 0.35, 3), Math.cos(a) * 0.82, 0.05, Math.sin(a) * 0.82, Math.PI / 2, 0, 0, 1, 0.3, 1), cs[(off + 5) % cs.length])); }
  return parts;
};
B.lamp = () => [
  P(T(cyl(0.05, 0.07, 1.6, 5), 0, 0.8), PAL.ink),
  P(T(box(0.25, 0.05, 0.25), 0, 1.6), PAL.ink),
  P(T(sph(0.13), 0, 1.72), PAL.glow, true),
];
B.windmill = () => [
  P(T(cyl(0.38, 0.65, 2.0, 7), 0, 1.0), PAL.cream),
  P(T(cone(0.5, 0.6, 7), 0, 2.3), PAL.red),
  P(T(box(0.25, 0.4, 0.05), 0, 0.2, 0.6), PAL.dark),
  P(T(box(0.18, 0.18, 0.05), 0, 1.2, 0.5), PAL.glow, true),
];
B.windmillBlades = () => {
  const parts = [P(T(cyl(0.08, 0.08, 0.2, 6), 0, 0, 0, Math.PI / 2), PAL.dark)];
  for (let i = 0; i < 4; i++) parts.push(P(T(T(box(0.24, 1.05, 0.02), 0, 0.58, 0.05), 0, 0, 0, 0, 0, (i * Math.PI) / 2), i % 2 ? PAL.paper : PAL.kraft));
  return parts;
};
B.lighthouse = () => {
  const parts = [P(T(cyl(0.7, 0.8, 0.25, 8), 0, 0.12), PAL.stone)];
  for (let i = 0; i < 4; i++) parts.push(P(T(cyl(0.4 - i * 0.04, 0.44 - i * 0.04, 0.55, 8), 0, 0.52 + i * 0.55), i % 2 ? PAL.white : PAL.red));
  parts.push(P(T(cyl(0.25, 0.25, 0.35, 8), 0, 2.67), PAL.glow, true), P(T(cone(0.34, 0.35, 8), 0, 3.02), PAL.red));
  return parts;
};
B.tent = (r) => [
  P(T(cone(0.85, 1.1, 4), 0, 0.55, 0, 0, Math.PI / 4), pick(r, [PAL.saffron, PAL.teal, PAL.pink, PAL.yellow])),
  P(T(box(0.3, 0.5, 0.04), 0, 0.25, 0.42), PAL.dark),
  P(T(cyl(0.12, 0.15, 0.1, 6), 0.7, 0.05, 0.6), PAL.stone), P(T(cone(0.08, 0.2, 4), 0.7, 0.18, 0.6), PAL.flame, true),
];
B.road = () => [
  P(T(box(1.0, 0.05, 1.7), 0, 0.025), '#6b6a72'),
  P(T(box(0.08, 0.06, 0.55), 0, 0.03, 0.1), PAL.white),
];
B.path = (r) => [0, 1, 2].map((i) => P(T(cyl(0.22 + r() * 0.06, 0.24, 0.06, 6), (r() - 0.5) * 0.2, 0.03, -0.55 + i * 0.55), PAL.stone));
B.fence = () => {
  const parts = [P(T(box(1.6, 0.06, 0.05), 0, 0.3), PAL.paper), P(T(box(1.6, 0.06, 0.05), 0, 0.5), PAL.paper)];
  for (let i = 0; i < 5; i++) parts.push(P(T(box(0.1, 0.65, 0.06), -0.7 + i * 0.35, 0.32), PAL.paper));
  return parts;
};
B.well = () => [
  P(T(cyl(0.45, 0.45, 0.5, 8), 0, 0.25), PAL.stone), P(T(cyl(0.35, 0.35, 0.52, 8), 0, 0.27), PAL.water),
  P(T(box(0.06, 0.8, 0.06), -0.4, 0.8), PAL.brown), P(T(box(0.06, 0.8, 0.06), 0.4, 0.8), PAL.brown),
  P(T(prismRoof(1.0, 0.35, 0.7), 0, 1.15), PAL.red),
];

// ---- walkers (animals & people) built facing +z ----
B.cow = (r) => {
  const c = pick(r, [PAL.white, '#f3e6d0', '#d8b48a']);
  return [
    P(T(box(0.45, 0.38, 0.8), 0, 0.5), c), P(T(box(0.3, 0.3, 0.32), 0, 0.68, 0.5), c),
    P(T(box(0.22, 0.14, 0.12), 0, 0.6, 0.68), PAL.pink),
    P(T(cone(0.04, 0.15, 4), -0.12, 0.88, 0.5, 0, 0, 0.5), PAL.kraft), P(T(cone(0.04, 0.15, 4), 0.12, 0.88, 0.5, 0, 0, -0.5), PAL.kraft),
    P(T(box(0.25, 0.14, 0.2), 0, 0.73, 0.22), c),
    ...[[-0.15, 0.3], [0.15, 0.3], [-0.15, -0.3], [0.15, -0.3]].map(([x, z]) => P(T(box(0.09, 0.32, 0.09), x, 0.16, z), c)),
    P(T(box(0.2, 0.12, 0.02), 0.1, 0.55, 0.15, 0, 0, 0), PAL.dark),
  ];
};
B.sheep = () => [
  P(T(ico(0.33, 0), 0, 0.42), PAL.white), P(T(ico(0.24, 0), 0.05, 0.55, -0.2), PAL.paper),
  P(T(box(0.18, 0.2, 0.2), 0, 0.5, 0.33), PAL.ink),
  ...[[-0.12, 0.12], [0.12, 0.12], [-0.12, -0.12], [0.12, -0.12]].map(([x, z]) => P(T(box(0.06, 0.25, 0.06), x, 0.12, z), PAL.ink)),
];
B.elephant = () => [
  P(T(box(0.8, 0.7, 1.15), 0, 0.85), '#9ea3ad'), P(T(box(0.55, 0.55, 0.45), 0, 1.05, 0.72), '#9ea3ad'),
  P(T(box(0.06, 0.5, 0.45), -0.32, 1.05, 0.6, 0, 0.4), '#8c919b'), P(T(box(0.06, 0.5, 0.45), 0.32, 1.05, 0.6, 0, -0.4), '#8c919b'),
  P(T(cyl(0.07, 0.11, 0.65, 5), 0, 0.62, 1.02, 0.25), '#9ea3ad'),
  P(T(cone(0.04, 0.25, 4), -0.18, 0.85, 0.98, 1.3), PAL.white), P(T(cone(0.04, 0.25, 4), 0.18, 0.85, 0.98, 1.3), PAL.white),
  P(T(box(0.6, 0.06, 0.7), 0, 1.22, 0), PAL.red), P(T(box(0.4, 0.04, 0.5), 0, 1.26, 0), PAL.gold),
  ...[[-0.25, 0.4], [0.25, 0.4], [-0.25, -0.4], [0.25, -0.4]].map(([x, z]) => P(T(cyl(0.13, 0.13, 0.55, 6), x, 0.27, z), '#9ea3ad')),
];
B.dog = () => [
  P(T(box(0.22, 0.2, 0.45), 0, 0.3), PAL.kraft), P(T(box(0.2, 0.2, 0.2), 0, 0.42, 0.28), PAL.kraft),
  P(T(box(0.06, 0.12, 0.06), -0.07, 0.56, 0.26), PAL.brown), P(T(box(0.06, 0.12, 0.06), 0.07, 0.56, 0.26), PAL.brown),
  P(T(box(0.04, 0.04, 0.22), 0, 0.42, -0.3, -0.6), PAL.brown),
  ...[[-0.07, 0.15], [0.07, 0.15], [-0.07, -0.15], [0.07, -0.15]].map(([x, z]) => P(T(box(0.05, 0.2, 0.05), x, 0.1, z), PAL.kraft)),
];
B.peacock = () => {
  const parts = [
    P(T(ico(0.18, 0), 0, 0.42, 0.05, 0, 0, 0, 1, 1.3, 1), '#2f6fb3'),
    P(T(cyl(0.04, 0.06, 0.3, 5), 0, 0.68, 0.12), '#2f6fb3'), P(T(sph(0.07, 6, 4), 0, 0.85, 0.14), '#2f6fb3'),
    P(T(cone(0.02, 0.1, 3), 0, 0.84, 0.24, Math.PI / 2), PAL.yellow),
    P(T(box(0.02, 0.28, 0.02), -0.06, 0.15, 0), PAL.kraft), P(T(box(0.02, 0.28, 0.02), 0.06, 0.15, 0), PAL.kraft),
  ];
  for (let i = 0; i < 9; i++) {
    const a = -1.2 + (i / 8) * 2.4;
    const g = T(cone(0.09, 0.85, 3), 0, 0.42, 0, 0, 0, 0, 1, 1, 0.3);
    T(g, 0, 0, 0, 0, 0, a); T(g, 0, 0.3, -0.15, -0.35, 0, 0);
    parts.push(P(g, i % 2 ? PAL.green : PAL.teal));
    parts.push(P(T(sph(0.045, 5, 3), Math.sin(-a) * -0.8, 0.3 + Math.cos(a) * 0.78, -0.42), '#2f6fb3'));
  }
  return parts;
};
const CLOTH = [PAL.saffron, PAL.pink, PAL.teal, PAL.red, PAL.purple, PAL.yellow, PAL.blue, PAL.green];
B.person = (r) => {
  const cloth = pick(r, CLOTH), skin = pick(r, [PAL.skin1, PAL.skin2, PAL.skin3]);
  const parts = [
    P(T(cone(0.17, 0.5, 6), 0, 0.25), cloth),
    P(T(sph(0.12, 7, 5), 0, 0.6), skin),
    P(T(sph(0.125, 7, 4, 0), 0, 0.64, -0.02, 0, 0, 0, 1, 0.75, 1), PAL.ink),
  ];
  if (r() < 0.5) parts.push(P(T(box(0.32, 0.04, 0.16), 0, 0.42, 0, 0, 0, 0.6), pick(r, CLOTH))); // dupatta / scarf
  return parts;
};
B.kite = (r) => [P(T(box(0.32, 0.32, 0.02), 0, 0, 0, 0, 0, Math.PI / 4), pick(r, [PAL.pink, PAL.saffron, PAL.teal, PAL.yellow])), P(T(box(0.02, 0.4, 0.01), 0, -0.35), PAL.red)];

// ---------- catalog ----------
export const CATS = [
  { id: 'nature', name: 'Nature', emoji: '🌳' },
  { id: 'homes', name: 'Homes', emoji: '🏡' },
  { id: 'india', name: 'Desi', emoji: '🪔' },
  { id: 'animals', name: 'Animals', emoji: '🐄' },
  { id: 'paths', name: 'Paths', emoji: '🛤️' },
];
export const ITEMS = [
  { id: 'pine', name: 'Pine', emoji: '🌲', cat: 'nature' },
  { id: 'tree', name: 'Tree', emoji: '🌳', cat: 'nature' },
  { id: 'palm', name: 'Coconut palm', emoji: '🌴', cat: 'nature' },
  { id: 'flowers', name: 'Flowers', emoji: '🌸', cat: 'nature' },
  { id: 'bush', name: 'Bush', emoji: '🌿', cat: 'nature' },
  { id: 'rock', name: 'Rock', emoji: '🪨', cat: 'nature' },
  { id: 'mountain', name: 'Mountain', emoji: '🏔️', cat: 'nature', big: true },
  { id: 'pond', name: 'Pond', emoji: '💧', cat: 'nature', flat: true, big: true },
  { id: 'house', name: 'House', emoji: '🏠', cat: 'homes', home: true },
  { id: 'hut', name: 'Hut', emoji: '🛖', cat: 'homes', home: true },
  { id: 'tent', name: 'Tent', emoji: '⛺', cat: 'homes' },
  { id: 'windmill', name: 'Windmill', emoji: '🌬️', cat: 'homes', spin: true },
  { id: 'lighthouse', name: 'Lighthouse', emoji: '🗼', cat: 'homes' },
  { id: 'well', name: 'Well', emoji: '🪣', cat: 'homes' },
  { id: 'lamp', name: 'Street lamp', emoji: '💡', cat: 'homes' },
  { id: 'temple', name: 'Temple', emoji: '🛕', cat: 'india', big: true },
  { id: 'chai', name: 'Chai stall', emoji: '☕', cat: 'india' },
  { id: 'rickshaw', name: 'Auto rickshaw', emoji: '🛺', cat: 'india' },
  { id: 'palace', name: 'Marble palace', emoji: '🕌', cat: 'india', big: true },
  { id: 'banyan', name: 'Banyan tree', emoji: '🌳', cat: 'india', big: true },
  { id: 'lotus', name: 'Lotus pond', emoji: '🪷', cat: 'india', flat: true, big: true },
  { id: 'diya', name: 'Diyas', emoji: '🪔', cat: 'india' },
  { id: 'rangoli', name: 'Rangoli', emoji: '🎨', cat: 'india', flat: true },
  { id: 'cow', name: 'Cow', emoji: '🐄', cat: 'animals', walker: 0.35 },
  { id: 'sheep', name: 'Sheep', emoji: '🐑', cat: 'animals', walker: 0.3 },
  { id: 'elephant', name: 'Elephant', emoji: '🐘', cat: 'animals', walker: 0.25 },
  { id: 'peacock', name: 'Peacock', emoji: '🦚', cat: 'animals', walker: 0.3 },
  { id: 'dog', name: 'Dog', emoji: '🐕', cat: 'animals', walker: 0.7 },
  { id: 'person', name: 'Paper friend', emoji: '🧍', cat: 'animals', walker: 0.5 },
  { id: 'road', name: 'Road', emoji: '🛣️', cat: 'paths', flat: true, chain: true },
  { id: 'path', name: 'Stone path', emoji: '🪨', cat: 'paths', flat: true, chain: true },
  { id: 'fence', name: 'Fence', emoji: '🚧', cat: 'paths', chain: true },
];
export const ITEM_BY_ID = Object.fromEntries(ITEMS.map((i) => [i.id, i]));
ITEMS.forEach((it) => { it.build = B[it.id]; });
export const buildPart = B;

export function mulberry(seed) {
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// Bake parts into one non-indexed geometry with vertex colours (+ optional transform)
const _col = new THREE.Color();
export function bakeParts(parts, matrix, out = { solid: [], glow: [] }) {
  for (const p of parts) {
    let g = p.geo.index ? p.geo.toNonIndexed() : p.geo;
    if (matrix) g.applyMatrix4(matrix);
    _col.set(p.color);
    const n = g.attributes.position.count;
    const arr = new Float32Array(n * 3);
    // tiny per-part tint variation so paper pieces read as separate sheets
    const v = 0.96 + ((n * 7919) % 9) / 100;
    for (let i = 0; i < n; i++) { arr[i * 3] = _col.r * v; arr[i * 3 + 1] = _col.g * v; arr[i * 3 + 2] = _col.b * v; }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) g.deleteAttribute(k);
    (p.glow ? out.glow : out.solid).push(g);
  }
  return out;
}
