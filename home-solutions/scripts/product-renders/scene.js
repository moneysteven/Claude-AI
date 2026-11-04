// Browser-side renderer for scripts/render-products.mjs (bundled with esbuild,
// run in headless Chromium). Every product is modelled parametrically from
// mitred extruded profiles, glazing beads, gaskets and hardware, lit with a
// RoomEnvironment + soft key light, and rendered on a transparent background
// (the Node side crops, centres and flattens onto pure white).
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

const S = 2048;
const canvas = document.createElement("canvas");
document.body.appendChild(canvas);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(S, S, false);
renderer.setClearColor(0x000000, 0);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const pmrem = new THREE.PMREMGenerator(renderer);
const envTex = pmrem.fromScene(new RoomEnvironment(), 0.03).texture;

function rng(seed) { let s = seed; return () => ((s = (s * 16807) % 2147483647) / 2147483647); }

// ---------------------------------------------------------------- materials
const phys = (o) => new THREE.MeshPhysicalMaterial(o);
const M = {
  upvc: phys({ color: 0xeff0ee, roughness: 0.36, clearcoat: 0.35, clearcoatRoughness: 0.25 }),
  aluW: phys({ color: 0xedeff0, roughness: 0.3, metalness: 0.04, clearcoat: 0.2, clearcoatRoughness: 0.3 }),
  steelW: phys({ color: 0xeeeeea, roughness: 0.4, clearcoat: 0.25, clearcoatRoughness: 0.35 }),
  silver: phys({ color: 0xd2d6da, metalness: 0.9, roughness: 0.3 }),
  satin: phys({ color: 0xc9ccd0, metalness: 1, roughness: 0.22 }),
  chrome: phys({ color: 0xf2f3f5, metalness: 1, roughness: 0.05 }),
  bronze: phys({ color: 0x6f5639, metalness: 0.6, roughness: 0.34, clearcoat: 0.35, clearcoatRoughness: 0.3, envMapIntensity: 1.3 }),
  gasket: phys({ color: 0x232527, roughness: 0.65 }),
  shade: phys({ color: 0x9a9fa3, roughness: 0.8 }),
  greyDk: phys({ color: 0x8c9196, roughness: 0.5 }),
  fabric: null, // built lazily (texture)
  // grey-tinted glazing (matches the AI reference renders): mostly opaque on the
  // white backdrop so the pane reads as glass, with a diagonal reflection map
  glass: phys({ color: 0xffffff, map: null, roughness: 0.04, transparent: true, opacity: 0.92, envMapIntensity: 0.7, depthWrite: false }),
  glassTint: phys({ color: 0x7f8d95, roughness: 0.03, transparent: true, opacity: 0.6, envMapIntensity: 2.2, depthWrite: false }),
  glassEdge: phys({ color: 0x9ccbb9, roughness: 0.1, transparent: true, opacity: 0.85, depthWrite: false }),
  frost: phys({ color: 0xd9e2e7, roughness: 0.5, transparent: true, opacity: 0.96, envMapIntensity: 0.8, depthWrite: false }),
  reflect: phys({ color: 0x5f7886, roughness: 0.04, metalness: 0.35, transparent: true, opacity: 0.78, envMapIntensity: 2.6, depthWrite: false }),
  spandrel: phys({ color: 0x3c4a54, roughness: 0.08, metalness: 0.4, envMapIntensity: 2.2 }),
};

// clear glass: soft diagonal sky/studio gradient so it reads as glass on white
{
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const x = c.getContext("2d");
  // grey-blue body, lighter towards the top-left, plus a soft diagonal sheen band
  const g = x.createLinearGradient(0, 0, 256, 256);
  g.addColorStop(0, "#8794a0"); g.addColorStop(0.3, "#717e8a"); g.addColorStop(0.62, "#5c6874"); g.addColorStop(1, "#4f5b67");
  x.fillStyle = g; x.fillRect(0, 0, 256, 256);
  const sh = x.createLinearGradient(40, 0, 216, 256);
  sh.addColorStop(0, "rgba(255,255,255,0)"); sh.addColorStop(0.36, "rgba(255,255,255,0)"); sh.addColorStop(0.44, "rgba(255,255,255,0.13)");
  sh.addColorStop(0.5, "rgba(255,255,255,0.06)"); sh.addColorStop(0.56, "rgba(255,255,255,0.1)"); sh.addColorStop(0.64, "rgba(255,255,255,0)"); sh.addColorStop(1, "rgba(255,255,255,0)");
  x.fillStyle = sh; x.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  M.glass.map = t;
  M.glass.needsUpdate = true;
  // tinted reflective (curtain wall): sky reflection gradient
  const c2 = document.createElement("canvas");
  c2.width = c2.height = 256;
  const x2 = c2.getContext("2d");
  const g2 = x2.createLinearGradient(0, 0, 90, 256);
  g2.addColorStop(0, "#c5d9e6"); g2.addColorStop(0.45, "#8fb0c4"); g2.addColorStop(0.55, "#7d9cb1"); g2.addColorStop(1, "#5f7c90");
  x2.fillStyle = g2; x2.fillRect(0, 0, 256, 256);
  const t2 = new THREE.CanvasTexture(c2);
  t2.colorSpace = THREE.SRGBColorSpace;
  M.reflect.map = t2; M.reflect.color.set(0xffffff); M.reflect.needsUpdate = true;
  // frosted (acid-etched / satin): light grey-blue with a visible mottle + grain
  const c3 = document.createElement("canvas");
  c3.width = c3.height = 512;
  const x3 = c3.getContext("2d");
  const g3 = x3.createLinearGradient(0, 0, 512, 512);
  g3.addColorStop(0, "#e2e8ec"); g3.addColorStop(0.5, "#cfd8de"); g3.addColorStop(1, "#b9c5cd");
  x3.fillStyle = g3; x3.fillRect(0, 0, 512, 512);
  const R = rng(3);
  x3.filter = "blur(5px)";
  for (let i = 0; i < 900; i++) { x3.fillStyle = `rgba(${R() > 0.5 ? "255,255,255" : "120,138,150"},${0.08 + R() * 0.12})`; x3.beginPath(); x3.arc(R() * 512, R() * 512, 4 + R() * 14, 0, 7); x3.fill(); }
  x3.filter = "none";
  for (let i = 0; i < 60000; i++) { x3.fillStyle = `rgba(${R() > 0.5 ? "255,255,255" : "105,120,132"},${R() * 0.35})`; x3.fillRect(R() * 512, R() * 512, 1.5, 1.5); }
  const t3 = new THREE.CanvasTexture(c3);
  t3.colorSpace = THREE.SRGBColorSpace;
  t3.wrapS = t3.wrapT = THREE.RepeatWrapping; t3.repeat.set(2, 2);
  M.frost.map = t3; M.frost.color.set(0xffffff); M.frost.needsUpdate = true;
}

// ---------------------------------------------------------------- helpers
const IN = 0.0254;
function mesh(geo, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  return m;
}
function box(w, h, d, mat, x = 0, y = 0, z = 0, r = 0.003) {
  r = Math.min(r, w * 0.45, h * 0.45, d * 0.45);
  const g = r > 0.0004 ? new RoundedBoxGeometry(w, h, d, 3, r) : new THREE.BoxGeometry(w, h, d);
  return mesh(g, mat, x, y, z);
}
function cyl(r, len, mat, axis = "z", x = 0, y = 0, z = 0, seg = 40) {
  const m = mesh(new THREE.CylinderGeometry(r, r, len, seg), mat, x, y, z);
  if (axis === "z") m.rotation.x = Math.PI / 2;
  if (axis === "x") m.rotation.z = Math.PI / 2;
  return m;
}
// a rod between two points
function rod(a, b, r, mat) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
  const len = A.distanceTo(B);
  const m = mesh(new THREE.CylinderGeometry(r, r, len, 24), mat);
  m.position.copy(A).add(B).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize());
  return m;
}
// extruded polygon (XY), depth along z centred on z, with a rounded bevel on the faces
function extrude(points, d, mat, bevel = 0.0018) {
  const sh = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
  const bt = Math.min(bevel, d * 0.3);
  const g = new THREE.ExtrudeGeometry(sh, { depth: Math.max(d - 2 * bt, 0.0005), bevelEnabled: bevel > 0, bevelThickness: bt, bevelSize: bevel, bevelSegments: 3, curveSegments: 48 });
  g.translate(0, 0, -d / 2 + bt);
  return mesh(g, mat);
}
function extrudeShape(shape, d, mat, bevel = 0.002, bevelSize = bevel) {
  const bt = Math.min(bevel, d * 0.45);
  const g = new THREE.ExtrudeGeometry(shape, { depth: Math.max(d - 2 * bt, 0.0005), bevelEnabled: bevel > 0, bevelThickness: bt, bevelSize, bevelSegments: 4, curveSegments: 96 });
  g.translate(0, 0, -d / 2 + bt);
  return mesh(g, mat);
}
// Rectangular frame of four mitred members. w,h outer size, bars t/b/l/r, depth d.
function rect(p, o) {
  const { w, h, d, mat } = o;
  const bw = o.bw;
  const t = o.t ?? bw, b = o.b ?? bw, l = o.l ?? bw, r = o.r ?? bw;
  const g = new THREE.Group();
  g.position.set(o.x || 0, o.y || 0, o.z || 0);
  const X = w / 2, Y = h / 2, bev = o.bevel ?? 0.0018;
  if (t) g.add(extrude([[-X, Y], [X, Y], [X - r, Y - t], [-X + l, Y - t]], d, mat, bev));
  if (b) g.add(extrude([[-X, -Y], [-X + l, -Y + b], [X - r, -Y + b], [X, -Y]], d, mat, bev));
  // when there is no bottom bar the stiles run square to the floor
  g.add(extrude([[-X, Y], [-X + l, Y - t], [-X + l, -Y + b], [-X, b ? -Y : -Y]], d, mat, bev));
  g.add(extrude([[X, Y], [X, -Y], [X - r, -Y + b], [X - r, Y - t]], d, mat, bev));
  p.add(g);
  return g;
}
// glass in an opening (w,h) centred at x,y; with black gaskets front and back
function glazing(p, w, h, x, y, z, mat = M.glass, gasket = true, thick = 0.006) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  const gl = box(w + 0.012, h + 0.012, thick, mat, 0, 0, 0, 0);
  gl.renderOrder = 2;
  g.add(gl);
  if (gasket) {
    rect(g, { w: w + 0.002, h: h + 0.002, bw: 0.0055, d: 0.0035, mat: M.gasket, z: thick / 2 + 0.0015, bevel: 0.0008 });
    rect(g, { w: w + 0.002, h: h + 0.002, bw: 0.0055, d: 0.0035, mat: M.gasket, z: -thick / 2 - 0.0015, bevel: 0.0008 });
  }
  p.add(g);
  return g;
}
// glazed sash/leaf: frame + front glazing bead + gasketed glass
function sash(p, o) {
  const g = new THREE.Group();
  g.position.set(o.x || 0, o.y || 0, o.z || 0);
  const { w, h, d, mat } = o;
  const bw = o.bw, t = o.t ?? bw, b = o.b ?? bw, l = o.l ?? bw, r = o.r ?? bw;
  rect(g, { w, h, d, mat, bw, t, b, l, r, bevel: o.bevel });
  const ow = w - l - r, oh = h - t - b, ox = (l - r) / 2, oy = (b - t) / 2;
  const bead = o.bead ?? 0.014;
  if (bead) {
    const bg = rect(g, { w: ow + 0.002, h: oh + 0.002, bw: bead, d: d * 0.42, mat, bevel: 0.0022 });
    bg.position.set(ox, oy, d * 0.08);
  }
  glazing(g, ow - 2 * bead, oh - 2 * bead, ox, oy, -d * 0.12, o.glass || M.glass, true);
  p.add(g);
  return g;
}
function normalizeUV(geo) {
  geo.computeBoundingBox();
  const bb = geo.boundingBox, uv = geo.attributes.uv, pos = geo.attributes.position;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (pos.getX(i) - bb.min.x) / (bb.max.x - bb.min.x), (pos.getY(i) - bb.min.y) / (bb.max.y - bb.min.y));
  uv.needsUpdate = true;
  return geo;
}
function canvasTex(w, h, draw, repeat) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); }
  return t;
}

// ---------------------------------------------------------------- hardware
function lever(p, x, y, z, dir = -1, mat = M.satin) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.add(box(0.034, 0.17, 0.01, mat, 0, -0.02, 0.005, 0.004));
  g.add(cyl(0.011, 0.045, mat, "z", 0, 0, 0.03));
  const arm = box(0.125, 0.018, 0.02, mat, dir * 0.055, 0, 0.055, 0.007);
  g.add(arm);
  g.add(box(0.012, 0.02, 0.006, M.gasket, 0, -0.075, 0.0105, 0.001)); // keyhole
  p.add(g);
  return g;
}
function deadbolt(p, x, y, z, mat = M.satin) {
  p.add(cyl(0.028, 0.012, mat, "z", x, y, z + 0.006));
  p.add(cyl(0.016, 0.012, mat, "z", x, y, z + 0.016));
  p.add(box(0.004, 0.014, 0.004, M.gasket, x, y, z + 0.022, 0.0005));
}
function knob(p, x, y, z, mat = M.satin) {
  const pts = [[0, 0], [0.033, 0], [0.033, 0.004], [0.012, 0.012], [0.011, 0.035], [0.026, 0.05], [0.029, 0.064], [0.022, 0.074], [0, 0.077]].map(([a, b]) => new THREE.Vector2(a, b));
  const m = mesh(new THREE.LatheGeometry(pts, 64), mat, x, y, z);
  m.rotation.x = Math.PI / 2;
  p.add(m);
}
function hinges(p, x, z, ys, mat = M.satin, w = 0.025) {
  for (const y of ys) {
    p.add(box(w, 0.1, 0.006, mat, x, y, z, 0.002));
    p.add(cyl(0.007, 0.1, mat, "y", x, y, z + 0.004, 24));
  }
}

// ---------------------------------------------------------------- textures
let _fabric;
function fabricMat() {
  if (_fabric) return _fabric;
  const R = rng(7);
  const t = canvasTex(512, 512, (c, w, h) => {
    c.fillStyle = "#adafad"; c.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 2) { c.fillStyle = `rgba(255,255,255,${0.05 + R() * 0.07})`; c.fillRect(0, y, w, 1); }
    for (let x = 0; x < w; x += 2) { c.fillStyle = `rgba(90,90,88,${0.03 + R() * 0.05})`; c.fillRect(x, 0, 1, h); }
    for (let i = 0; i < 4000; i++) { c.fillStyle = `rgba(${R() > 0.5 ? "255,255,255" : "60,60,60"},${R() * 0.06})`; c.fillRect(R() * w, R() * h, 2, 1); }
  }, [4, 4]);
  _fabric = phys({ map: t, roughness: 0.95, sheen: 0.6, sheenColor: new THREE.Color(0xffffff), sheenRoughness: 0.8, side: THREE.DoubleSide });
  return _fabric;
}
function meshMat(w, h) {
  const t = canvasTex(256, 256, (c, W, H) => {
    c.clearRect(0, 0, W, H);
    c.strokeStyle = "rgba(55,58,62,0.9)"; c.lineWidth = 1.2;
    for (let i = 0; i <= W; i += 4) { c.beginPath(); c.moveTo(i + 0.5, 0); c.lineTo(i + 0.5, H); c.stroke(); c.beginPath(); c.moveTo(0, i + 0.5); c.lineTo(W, i + 0.5); c.stroke(); }
  }, [w / 0.12, h / 0.12]);
  return phys({ map: t, transparent: true, roughness: 0.6, metalness: 0.3, color: 0x9a9fa4, depthWrite: false, side: THREE.DoubleSide, opacity: 0.95 });
}
function cathedralMat() {
  const t = canvasTex(1024, 640, (c, w, h) => {
    const R = rng(11);
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "rgba(236,240,240,0.86)"); g.addColorStop(1, "rgba(214,224,226,0.86)");
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 9000; i++) { c.fillStyle = `rgba(${R() > 0.5 ? "255,255,255" : "150,165,170"},${R() * 0.25})`; c.beginPath(); c.arc(R() * w, R() * h, 1 + R() * 3, 0, 7); c.fill(); }
    const cx = w / 2, cy = h;
    // clear bevelled sunburst rays + caming
    c.strokeStyle = "rgba(150,140,110,1)"; c.lineWidth = 7;
    c.fillStyle = "rgba(205,222,230,0.35)";
    c.beginPath(); c.arc(cx, cy, h * 0.33, Math.PI, 0); c.closePath(); c.fill(); c.stroke();
    for (let k = 1; k < 8; k++) { const a = Math.PI + (k * Math.PI) / 8; c.beginPath(); c.moveTo(cx + Math.cos(a) * h * 0.33, cy + Math.sin(a) * h * 0.33); c.lineTo(cx + Math.cos(a) * w, cy + Math.sin(a) * w); c.stroke(); }
    c.beginPath(); c.arc(cx, cy, h * 0.72, Math.PI, 0); c.stroke();
  });
  return phys({ map: t, transparent: true, roughness: 0.25, envMapIntensity: 1.8, depthWrite: false });
}
function ovalGlassMat() {
  const t = canvasTex(512, 1400, (c, w, h) => {
    const R = rng(5);
    c.fillStyle = "rgba(232,238,240,0.9)"; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 16000; i++) { c.fillStyle = `rgba(${R() > 0.5 ? "255,255,255" : "160,170,175"},${R() * 0.2})`; c.fillRect(R() * w, R() * h, 2, 2); }
    // clear bevel jewels
    const cx = w / 2;
    c.lineWidth = 6; c.strokeStyle = "rgba(170,172,170,1)";
    const clear = "rgba(190,212,222,0.28)";
    const diamond = (x, y, rw, rh) => { c.beginPath(); c.moveTo(x, y - rh); c.lineTo(x + rw, y); c.lineTo(x, y + rh); c.lineTo(x - rw, y); c.closePath(); c.fillStyle = clear; c.fill(); c.stroke(); };
    c.beginPath(); c.ellipse(cx, h / 2, w * 0.36, h * 0.4, 0, 0, 7); c.fillStyle = clear; c.fill(); c.stroke();
    diamond(cx, h / 2, w * 0.2, h * 0.17);
    diamond(cx, h * 0.24, w * 0.09, h * 0.07);
    diamond(cx, h * 0.76, w * 0.09, h * 0.07);
    for (const s of [-1, 1]) { c.beginPath(); c.ellipse(cx + s * w * 0.2, h / 2, w * 0.06, h * 0.11, 0, 0, 7); c.fillStyle = "rgba(240,244,245,0.7)"; c.fill(); c.stroke(); }
    c.beginPath(); c.moveTo(cx, h * 0.1); c.lineTo(cx, h * 0.17); c.moveTo(cx, h * 0.83); c.lineTo(cx, h * 0.9); c.moveTo(cx, h * 0.31); c.lineTo(cx, h * 0.33); c.moveTo(cx, h * 0.67); c.lineTo(cx, h * 0.69); c.stroke();
  });
  return phys({ map: t, transparent: true, roughness: 0.2, envMapIntensity: 1.8, depthWrite: false });
}

// ---------------------------------------------------------------- products
const P = {};
const opening = (W, H, bw) => [W - 2 * bw, H - 2 * bw];

function slider(g, { W, H, bw, d, mat, n, sbw, sd, open, upvc, il, heavy }) {
  rect(g, { w: W, h: H, bw, d, mat, bevel: upvc ? 0.004 : 0.0018 });
  const [w0, h0] = opening(W, H, bw);
  il = il ?? sbw; // meeting-stile (interlock) width
  // sill tracks
  const tr = heavy ? 0.02 : 0.012;
  for (const z of [-sd * 0.6, sd * 0.6]) g.add(box(w0, tr, heavy ? 0.007 : 0.004, mat, 0, -h0 / 2 + tr / 2, z, 0.0015));
  g.add(box(w0, 0.012, 0.004, mat, 0, h0 / 2 - 0.006, sd * 1.25, 0.0015));
  if (heavy) {
    // heavy 3" section: projecting sloped sill + deep head/jamb returns
    g.add(box(W + 0.03, 0.034, d + 0.036, mat, 0, -H / 2 + 0.017, 0.018, 0.003));
    g.add(box(W, 0.016, d + 0.012, mat, 0, H / 2 - 0.008, 0.006, 0.003));
  }
  const sw = w0 / n + (heavy ? 0.04 : 0.024), sh = h0 - 0.006;
  const panels = [];
  if (n === 2) {
    panels.push({ x: w0 / 2 - sw / 2, z: -sd * 0.6, latch: "l", l: il });
    panels.push({ x: -w0 / 2 + sw / 2 + open * sw, z: sd * 0.6, latch: "r", r: il });
  } else {
    // fixed centre lite (inner track), the two outer panels slide over it (outer track)
    panels.push({ x: 0, z: -sd * 0.6, l: il, r: il });
    panels.push({ x: -w0 / 2 + sw / 2 + open * sw, z: sd * 0.6, latch: "r", r: il });
    panels.push({ x: w0 / 2 - sw / 2, z: sd * 0.6, latch: "l", l: il });
  }
  for (const pnl of panels) {
    const s = sash(g, { w: sw, h: sh, bw: sbw, l: pnl.l, r: pnl.r, d: sd, mat, x: pnl.x, y: 0, z: pnl.z, bead: upvc ? 0.016 : heavy ? 0.014 : 0.01, bevel: upvc ? 0.004 : 0.0016 });
    if (heavy && (pnl.l || pnl.r)) {
      // raised interlock fins on the meeting stiles
      for (const side of ["l", "r"]) if (pnl[side]) s.add(box(0.012, sh - 0.02, 0.014, mat, (side === "r" ? 1 : -1) * (sw / 2 - 0.008), 0, (pnl.z > 0 ? -1 : 1) * (sd / 2 + 0.006), 0.002));
    }
    if (pnl.latch) {
      const lx = (pnl.latch === "r" ? 1 : -1) * (sw / 2 - (pnl.latch === "r" ? pnl.r : pnl.l) / 2);
      if (upvc) s.add(box(0.022, 0.13, 0.016, mat, lx, 0, sd / 2 + 0.008, 0.007));
      else s.add(box(heavy ? 0.02 : 0.016, heavy ? 0.075 : 0.05, 0.014, M.satin, lx, 0, sd / 2 + 0.007, 0.003));
    }
  }
}

P["alu-slider"] = (g) => slider(g, { W: 1.22, H: 0.92, bw: 0.034, d: 0.064, mat: M.aluW, n: 2, sbw: 0.03, sd: 0.022, open: 0.32 });
P["alu-lseries"] = (g) => slider(g, { W: 1.8, H: 1.05, bw: 0.078, d: 0.0762, mat: M.aluW, n: 3, sbw: 0.058, il: 0.075, sd: 0.036, open: 0.55, heavy: true });
P["upvc-slider75"] = (g) => slider(g, { W: 1.22, H: 1.0, bw: 0.064, d: 0.075, mat: M.upvc, n: 2, sbw: 0.07, sd: 0.032, open: 0.3, upvc: true });

P["upvc-awning"] = (g) => {
  const W = 0.86, H = 0.76, bw = 0.058, d = 0.07;
  rect(g, { w: W, h: H, bw, d, mat: M.upvc, bevel: 0.004 });
  const [w0, h0] = opening(W, H, bw);
  const piv = new THREE.Group();
  const th = 0.48;
  piv.position.set(0, h0 / 2, d / 2 - 0.02);
  piv.rotation.x = -th;
  g.add(piv);
  const sh = h0 - 0.004, sw = w0 - 0.004;
  const s = sash(piv, { w: sw, h: sh, bw: 0.07, d: 0.055, mat: M.upvc, y: -sh / 2, z: 0, bead: 0.016, bevel: 0.004 });
  s.add(box(0.11, 0.022, 0.024, M.upvc, 0, -sh / 2 + 0.035, 0.04, 0.008));
  s.add(box(0.03, 0.03, 0.012, M.upvc, 0, -sh / 2 + 0.035, 0.03, 0.006));
  // friction stays on both sides
  for (const sx of [-1, 1]) {
    const x = sx * (w0 / 2 - 0.012);
    const a = [x, h0 / 2 - 0.58 * h0, d / 2 - 0.02];
    const sl = 0.5 * sh;
    const b = [x, h0 / 2 - sl * Math.cos(th), d / 2 - 0.02 + sl * Math.sin(th) - 0.01];
    g.add(rod(a, b, 0.0055, M.satin));
    g.add(box(0.012, 0.18, 0.006, M.satin, x, h0 / 2 - 0.5 * h0, d / 2 - 0.023, 0.002));
  }
};

P["upvc-picture"] = (g) => {
  sash(g, { w: 1.1, h: 1.1, bw: 0.072, d: 0.075, mat: M.upvc, bead: 0.02, bevel: 0.004 });
};

P["upvc-casement"] = (g) => {
  const W = 0.68, H = 1.18, bw = 0.058, d = 0.07;
  rect(g, { w: W, h: H, bw, d, mat: M.upvc, bevel: 0.004 });
  const [w0, h0] = opening(W, H, bw);
  // outward-opening sash hinged on the LEFT jamb; pivot on the frame's front edge
  const th = THREE.MathUtils.degToRad(40), sd = 0.058;
  const px = -w0 / 2 + 0.002, pz = d / 2;
  const piv = new THREE.Group();
  piv.position.set(px, 0, pz);
  piv.rotation.y = -th;
  g.add(piv);
  const sw = w0 - 0.006, sh = h0 - 0.006;
  const s = sash(piv, { w: sw, h: sh, bw: 0.072, d: sd, mat: M.upvc, x: sw / 2, z: -sd / 2, bead: 0.016, bevel: 0.004 });
  // handle on the free (lock) stile
  const hx = sw / 2 - 0.036;
  s.add(box(0.03, 0.075, 0.012, M.upvc, hx, 0, sd / 2 + 0.006, 0.006));
  s.add(box(0.022, 0.12, 0.018, M.upvc, hx, -0.055, sd / 2 + 0.024, 0.008));
  // butt hinges on the hinge jamb (knuckles on the pivot line)
  for (const y of [h0 / 2 - 0.16, -h0 / 2 + 0.16]) {
    g.add(box(0.03, 0.09, 0.006, M.satin, px - 0.016, y, pz - 0.002, 0.002));
    g.add(cyl(0.0075, 0.1, M.satin, "y", px, y, pz + 0.004, 24));
    piv.add(box(0.03, 0.09, 0.006, M.satin, 0.018, y, 0.002, 0.002));
  }
  // friction stays at head and sill: track on the frame + arm to the sash
  const dir = [Math.cos(th), Math.sin(th)];
  for (const sy of [-1, 1]) {
    const y = sy * (h0 / 2 - 0.012);
    g.add(box(0.3, 0.008, 0.016, M.satin, px + 0.17, y, pz - 0.01, 0.002));
    const shoe = [px + 0.3, y, pz - 0.004];
    const onSash = [px + 0.2 * dir[0], y, pz + 0.2 * dir[1]];
    g.add(rod(shoe, onSash, 0.0055, M.satin));
    g.add(rod([px + 0.1, y, pz - 0.004], [px + 0.1 * dir[0], y, pz + 0.1 * dir[1]], 0.0045, M.satin));
  }
};

P["upvc-louver"] = (g) => {
  const W = 0.62, H = 1.02, bw = 0.05, d = 0.07;
  rect(g, { w: W, h: H, bw, d, mat: M.upvc, bevel: 0.004 });
  const [w0, h0] = opening(W, H, bw);
  for (const sx of [-1, 1]) g.add(box(0.016, h0, 0.03, M.silver, sx * (w0 / 2 - 0.008), 0, 0, 0.002));
  const n = 10, pitch = h0 / n, bh = pitch + 0.012, th = 1.0;
  const bl = w0 - 0.024;
  for (let i = 0; i < n; i++) {
    const y = -h0 / 2 + pitch * (i + 0.5);
    const blade = new THREE.Group();
    blade.position.set(0, y, 0);
    blade.rotation.x = -th;
    const gl = box(bl, bh, 0.005, M.glass, 0, 0, 0, 0.0015);
    gl.renderOrder = 2;
    blade.add(gl);
    blade.add(box(bl, 0.004, 0.0052, M.glassEdge, 0, bh / 2 - 0.002, 0, 0.001));
    for (const sx of [-1, 1]) blade.add(box(0.03, bh * 0.9, 0.011, M.silver, sx * (bl / 2 - 0.006), 0, 0, 0.002));
    g.add(blade);
  }
  // operator + crank
  g.add(box(0.045, 0.07, 0.022, M.silver, w0 / 2 - 0.03, -h0 / 2 + 0.03, d / 2 + 0.008, 0.006));
  g.add(cyl(0.005, 0.04, M.silver, "z", w0 / 2 - 0.03, -h0 / 2 + 0.03, d / 2 + 0.03));
  g.add(box(0.075, 0.012, 0.008, M.silver, w0 / 2 - 0.06, -h0 / 2 + 0.03, d / 2 + 0.048, 0.003));
  g.add(cyl(0.007, 0.03, M.gasket, "z", w0 / 2 - 0.093, -h0 / 2 + 0.03, d / 2 + 0.065));
};

P["upvc-singlehung"] = (g) => {
  const W = 0.8, H = 1.36, bw = 0.06, d = 0.075;
  rect(g, { w: W, h: H, bw, d, mat: M.upvc, bevel: 0.004 });
  const [w0, h0] = opening(W, H, bw);
  const sh = h0 / 2 + 0.02, sw = w0 - 0.004, lift = 0.15;
  sash(g, { w: sw, h: sh, bw: 0.062, b: 0.045, d: 0.034, mat: M.upvc, y: h0 / 2 - sh / 2, z: -0.017, bead: 0.016, bevel: 0.004 });
  const lo = sash(g, { w: sw, h: sh, bw: 0.062, t: 0.05, b: 0.075, d: 0.04, mat: M.upvc, y: -h0 / 2 + sh / 2 + lift, z: 0.017, bead: 0.016, bevel: 0.004 });
  lo.add(box(0.06, 0.016, 0.02, M.upvc, 0, -sh / 2 + 0.035, 0.03, 0.006)); // lift rail
  lo.add(box(0.07, 0.02, 0.014, M.upvc, 0, sh / 2 - 0.025, 0.026, 0.005)); // sash lock
  g.add(box(w0, 0.012, 0.005, M.upvc, 0, -h0 / 2 + 0.006, 0.017, 0.002));
};

function doorFrame(g, W, H, bw, d, mat, sill = M.silver) {
  rect(g, { w: W, h: H, bw, b: 0, d, mat, bevel: 0.003 });
  // shadowed rebate/door stop seen through the gap around the leaf
  g.add(box(W - 2 * bw + 0.004, H - bw - 0.02, 0.006, M.shade, 0, -bw / 2 + 0.01, -d / 2 + 0.01, 0));
  g.add(box(W, 0.026, d + 0.03, sill, 0, -H / 2 + 0.013, 0.015, 0.003));
  return [W - 2 * bw, H - bw - 0.026];
}

P["upvc-heavy"] = (g) => {
  const W = 0.98, H = 2.12, d = 0.09;
  const [w0, h0] = doorFrame(g, W, H, 0.068, d, M.upvc);
  const lw = w0 - 0.006, lh = h0 - 0.006, ld = 0.07;
  const leaf = new THREE.Group();
  leaf.position.set(0, -H / 2 + 0.026 + lh / 2 + 0.003, 0.008);
  g.add(leaf);
  const st = 0.115, tr = 0.115, br = 0.2, midY = -lh / 2 + 0.98, mr = 0.14;
  rect(leaf, { w: lw, h: lh, bw: st, t: tr, b: br, d: ld, mat: M.upvc, bevel: 0.004 });
  leaf.add(box(lw - 2 * st + 0.004, mr, ld, M.upvc, 0, midY, 0, 0.004));
  // lower solid infill panel (recessed, with bead)
  const pw = lw - 2 * st, ph = midY - mr / 2 - (-lh / 2 + br);
  const py = -lh / 2 + br + ph / 2;
  leaf.add(box(pw + 0.01, ph + 0.01, 0.028, M.upvc, 0, py, -0.008, 0.003));
  rect(leaf, { w: pw + 0.002, h: ph + 0.002, bw: 0.02, d: 0.03, mat: M.upvc, y: py, z: 0.012, bevel: 0.003 });
  // upper frosted glass
  const gh = lh / 2 - tr - (midY + mr / 2);
  const gy = midY + mr / 2 + gh / 2;
  rect(leaf, { w: pw + 0.002, h: gh + 0.002, bw: 0.02, d: 0.03, mat: M.upvc, y: gy, z: 0.012, bevel: 0.003 });
  glazing(leaf, pw - 0.04, gh - 0.04, 0, gy, -0.004, M.frost);
  lever(leaf, lw / 2 - st / 2, -lh / 2 + 1.0, ld / 2, -1);
  deadbolt(leaf, lw / 2 - st / 2, -lh / 2 + 1.16, ld / 2);
  hinges(leaf, -lw / 2 - 0.004, ld / 2, [-lh / 2 + 0.25, 0, lh / 2 - 0.25], M.upvc, 0.03);
};

P["upvc-light"] = (g) => {
  const W = 0.9, H = 2.08, d = 0.08;
  const [w0, h0] = doorFrame(g, W, H, 0.056, d, M.upvc, M.upvc);
  const lw = w0 - 0.006, lh = h0 - 0.006;
  const leaf = new THREE.Group();
  leaf.position.set(0, -H / 2 + 0.026 + lh / 2 + 0.003, 0.006);
  g.add(leaf);
  leaf.add(box(lw, lh, 0.045, M.upvc, 0, 0, 0, 0.006));
  // faint routed lines typical of extruded uPVC interior doors
  for (const y of [-lh / 2 + 0.16, lh / 2 - 0.16]) leaf.add(box(lw - 0.2, 0.004, 0.002, M.greyDk, 0, y, 0.0226, 0.0008));
  lever(leaf, lw / 2 - 0.065, -lh / 2 + 1.0, 0.0225, -1);
  hinges(leaf, -lw / 2 - 0.004, 0.0225, [-lh / 2 + 0.22, lh / 2 - 0.22], M.satin, 0.022);
};

P["upvc-slide80"] = (g) => {
  const W = 1.85, H = 2.12, bw = 0.072, d = 0.1;
  rect(g, { w: W, h: H, bw, d, mat: M.upvc, bevel: 0.004 });
  const [w0, h0] = opening(W, H, bw);
  for (const z of [-0.022, 0.022]) g.add(box(w0, 0.014, 0.006, M.upvc, 0, -h0 / 2 + 0.007, z, 0.002));
  const sw = w0 / 2 + 0.04, sh = h0 - 0.008;
  sash(g, { w: sw, h: sh, bw: 0.09, b: 0.11, d: 0.04, mat: M.upvc, x: -w0 / 2 + sw / 2, z: -0.024, bead: 0.018, bevel: 0.004 });
  const mv = sash(g, { w: sw, h: sh, bw: 0.09, b: 0.11, d: 0.04, mat: M.upvc, x: w0 / 2 - sw / 2 - 0.33 * sw, z: 0.024, bead: 0.018, bevel: 0.004 });
  // D pull handle on the moving panel
  const hx = sw / 2 - 0.045, hy = -sh / 2 + 1.0;
  mv.add(box(0.024, 0.32, 0.02, M.satin, hx, hy, 0.055, 0.009));
  for (const s of [-1, 1]) mv.add(box(0.02, 0.028, 0.03, M.satin, hx, hy + s * 0.13, 0.035, 0.006));
};

P["upvc-screen"] = (g) => {
  const W = 0.9, H = 2.08, d = 0.07;
  const [w0, h0] = doorFrame(g, W, H, 0.05, d, M.upvc, M.upvc);
  const lw = w0 - 0.006, lh = h0 - 0.006, ld = 0.032;
  const leaf = new THREE.Group();
  leaf.position.set(0, -H / 2 + 0.026 + lh / 2 + 0.003, d / 2 - ld / 2 + 0.004);
  g.add(leaf);
  const st = 0.065, tr = 0.075, br = 0.16, mr = 0.09, midY = -lh / 2 + 0.95;
  rect(leaf, { w: lw, h: lh, bw: st, t: tr, b: br, d: ld, mat: M.upvc, bevel: 0.003 });
  leaf.add(box(lw - 2 * st + 0.004, mr, ld, M.upvc, 0, midY, 0, 0.003));
  const pw = lw - 2 * st;
  const lowH = midY - mr / 2 - (-lh / 2 + br), upH = lh / 2 - tr - (midY + mr / 2);
  const m1 = mesh(new THREE.PlaneGeometry(pw + 0.006, lowH + 0.006), meshMat(pw, lowH), 0, -lh / 2 + br + lowH / 2, 0);
  const m2 = mesh(new THREE.PlaneGeometry(pw + 0.006, upH + 0.006), meshMat(pw, upH), 0, lh / 2 - tr - upH / 2, 0);
  leaf.add(m1, m2);
  // spline strip
  rect(leaf, { w: pw + 0.002, h: lowH + 0.002, bw: 0.006, d: 0.012, mat: M.greyDk, y: -lh / 2 + br + lowH / 2, z: 0.004, bevel: 0.001 });
  rect(leaf, { w: pw + 0.002, h: upH + 0.002, bw: 0.006, d: 0.012, mat: M.greyDk, y: lh / 2 - tr - upH / 2, z: 0.004, bevel: 0.001 });
  // small handle + latch
  const hx = lw / 2 - st / 2, hy = midY;
  leaf.add(box(0.03, 0.11, 0.008, M.satin, hx, hy, ld / 2 + 0.004, 0.003));
  leaf.add(box(0.016, 0.09, 0.022, M.satin, hx, hy - 0.005, ld / 2 + 0.016, 0.007));
  hinges(leaf, -lw / 2 - 0.004, ld / 2, [-lh / 2 + 0.2, lh / 2 - 0.2], M.satin, 0.02);
};

function raised(p, w, h, x, y, z, mat, r = 0.012) {
  const s = new THREE.Shape();
  const X = w / 2, Y = h / 2;
  s.moveTo(-X + r, -Y); s.lineTo(X - r, -Y); s.quadraticCurveTo(X, -Y, X, -Y + r); s.lineTo(X, Y - r); s.quadraticCurveTo(X, Y, X - r, Y); s.lineTo(-X + r, Y); s.quadraticCurveTo(-X, Y, -X, Y - r); s.lineTo(-X, -Y + r); s.quadraticCurveTo(-X, -Y, -X + r, -Y);
  const m = extrudeShape(s, 0.012, mat, 0.006, 0.018);
  m.position.set(x, y, z);
  p.add(m);
}
function steelDoor(g, decorate) {
  const W = 1.0, H = 2.12, d = 0.12;
  const [w0, h0] = doorFrame(g, W, H, 0.06, d, M.steelW, M.silver);
  const lw = w0 - 0.006, lh = h0 - 0.006;
  const leaf = new THREE.Group();
  leaf.position.set(0, -H / 2 + 0.026 + lh / 2 + 0.003, 0.02);
  g.add(leaf);
  leaf.add(box(lw, lh, 0.044, M.steelW, 0, 0, 0, 0.004));
  decorate(leaf, lw, lh, 0.022);
  knob(leaf, lw / 2 - 0.07, -lh / 2 + 0.92, 0.022);
  leaf.add(cyl(0.032, 0.006, M.satin, "z", lw / 2 - 0.07, -lh / 2 + 0.92, 0.025));
  deadbolt(leaf, lw / 2 - 0.07, -lh / 2 + 1.07, 0.022);
  hinges(leaf, -lw / 2 - 0.004, 0.022, [-lh / 2 + 0.25, 0, lh / 2 - 0.25], M.satin, 0.024);
}
P["steel-fanlight"] = (g) => steelDoor(g, (leaf, lw, lh, z) => {
  // half-round fanlight at the top
  const fw = lw - 0.26, fh = 0.4, fy = lh / 2 - 0.13 - fh;
  const R = fw / 2;
  const s = new THREE.Shape();
  s.moveTo(-R, fy); s.lineTo(R, fy); s.lineTo(R, fy + fh - R); s.absarc(0, fy + fh - R, R, 0, Math.PI, false); s.lineTo(-R, fy);
  const glassGeo = normalizeUV(new THREE.ShapeGeometry(s, 96));
  const gm = mesh(glassGeo, cathedralMat(), 0, 0, z + 0.002);
  gm.renderOrder = 2;
  leaf.add(gm);
  // moulded frame around it
  const outer = new THREE.Shape();
  const R2 = R + 0.035;
  outer.moveTo(-R2, fy - 0.035); outer.lineTo(R2, fy - 0.035); outer.lineTo(R2, fy + fh - R); outer.absarc(0, fy + fh - R, R2, 0, Math.PI, false); outer.lineTo(-R2, fy - 0.035);
  const hole = new THREE.Path();
  hole.moveTo(-R, fy); hole.lineTo(-R, fy + fh - R); hole.absarc(0, fy + fh - R, R, Math.PI, 0, true); hole.lineTo(R, fy); hole.lineTo(-R, fy);
  outer.holes.push(hole);
  const trim = extrudeShape(outer, 0.016, M.steelW, 0.006, 0.006);
  trim.position.z = z + 0.006;
  leaf.add(trim);
  // raised panels below
  const pw = (lw - 0.26 - 0.1) / 2, gx = pw / 2 + 0.05;
  const midTop = fy - 0.13, midH = 0.36;
  for (const sx of [-1, 1]) {
    raised(leaf, pw, midH, sx * gx, midTop - midH / 2, z, M.steelW);
    const lowTop = midTop - midH - 0.12, lowH = lowTop - (-lh / 2 + 0.16);
    raised(leaf, pw, lowH, sx * gx, lowTop - lowH / 2, z, M.steelW);
  }
});
P["steel-oval"] = (g) => steelDoor(g, (leaf, lw, lh, z) => {
  const ow = 0.5, oh = 1.42, oy = 0.18;
  const s = new THREE.Shape();
  s.absellipse(0, oy, ow / 2, oh / 2, 0, Math.PI * 2, false);
  const gm = mesh(normalizeUV(new THREE.ShapeGeometry(s, 128)), ovalGlassMat(), 0, 0, z + 0.002);
  gm.renderOrder = 2;
  leaf.add(gm);
  const ring = new THREE.Shape();
  ring.absellipse(0, oy, ow / 2 + 0.045, oh / 2 + 0.045, 0, Math.PI * 2, false);
  const hole = new THREE.Path();
  hole.absellipse(0, oy, ow / 2, oh / 2, 0, Math.PI * 2, true);
  ring.holes.push(hole);
  const trim = extrudeShape(ring, 0.02, M.steelW, 0.008, 0.008);
  trim.position.z = z + 0.008;
  leaf.add(trim);
  // panel below the lite
  raised(leaf, lw - 0.3, 0.3, 0, -lh / 2 + 0.31, z, M.steelW);
});

P["shower-screen"] = (g) => {
  const W = 0.92, H = 1.85, t = 0.01;
  const gl = box(W, H, t, M.glass, 0, H / 2 + 0.006, 0, 0.002);
  gl.renderOrder = 2;
  g.add(gl);
  // polished green edges
  g.add(box(W, 0.0035, t, M.glassEdge, 0, H + 0.004, 0, 0.001));
  g.add(box(0.0035, H, t, M.glassEdge, W / 2 - 0.0018, H / 2 + 0.006, 0, 0.001));
  // chrome U-channel on floor + wall
  const uc = (len, axis) => {
    const c = new THREE.Group();
    for (const s of [-1, 1]) c.add(box(axis === "x" ? len : 0.003, axis === "x" ? 0.026 : len, 0.003, M.chrome, 0, 0, s * (t / 2 + 0.0055), 0.001));
    c.add(box(axis === "x" ? len : 0.026, axis === "x" ? 0.003 : len, 0.014, M.chrome, axis === "x" ? 0 : -0.012, axis === "x" ? -0.012 : 0, 0, 0.001));
    return c;
  };
  const b = uc(W + 0.02, "x"); b.position.set(0.01, 0.013, 0); g.add(b);
  const w = uc(H, "y"); w.position.set(-W / 2 + 0.006, H / 2 + 0.006, 0); g.add(w);
};

P["upvc-shower"] = (g) => {
  const W = 1.22, H = 1.92, bw = 0.042, d = 0.065;
  rect(g, { w: W, h: H, bw, d, mat: M.upvc, bevel: 0.003 });
  const [w0, h0] = opening(W, H, bw);
  const sw = w0 / 2 + 0.03, sh = h0 - 0.008;
  sash(g, { w: sw, h: sh, bw: 0.04, d: 0.024, mat: M.upvc, x: w0 / 2 - sw / 2, z: -0.016, glass: M.frost, bead: 0.008, bevel: 0.003 });
  const mv = sash(g, { w: sw, h: sh, bw: 0.04, d: 0.024, mat: M.upvc, x: -w0 / 2 + sw / 2 + 0.22 * sw, z: 0.016, glass: M.frost, bead: 0.008, bevel: 0.003 });
  mv.add(box(0.02, 0.16, 0.022, M.chrome, -sw / 2 + 0.02, 0.05, 0.022, 0.008));
};

function shadeWindow(g, motor) {
  const W = 1.02, H = 1.26, bw = 0.062, d = 0.08;
  rect(g, { w: W, h: H, bw, d, mat: M.upvc, bevel: 0.004 });
  const [w0, h0] = opening(W, H, bw);
  glazing(g, w0, h0, 0, 0, -0.02, M.glass);
  rect(g, { w: w0 + 0.002, h: h0 + 0.002, bw: 0.018, d: 0.03, mat: M.upvc, z: -0.0, bevel: 0.003 });
  // cassette
  const cw = w0 - 0.01, ch = motor ? 0.07 : 0.085, cz = d / 2 - 0.005;
  const cas = box(cw, ch, ch * 0.95, M.upvc, 0, h0 / 2 - ch / 2, cz, motor ? 0.012 : 0.025);
  g.add(cas);
  for (const sx of [-1, 1]) g.add(box(0.012, ch + 0.004, ch, motor && sx > 0 ? M.greyDk : M.upvc, sx * (cw / 2 + 0.005), h0 / 2 - ch / 2, cz, 0.004));
  // fabric
  const drop = h0 * 0.58, fw = cw - 0.03;
  const fab = mesh(new THREE.PlaneGeometry(fw, drop, 1, 1), fabricMat(), 0, h0 / 2 - ch - drop / 2 + 0.01, cz - ch * 0.1);
  fabricMat().map.repeat.set(fw / 0.25, drop / 0.25);
  g.add(fab);
  const by = h0 / 2 - ch - drop + 0.01;
  g.add(box(fw + 0.006, 0.026, 0.016, M.silver, 0, by, cz - ch * 0.1, 0.006));
  for (const sx of [-1, 1]) g.add(box(0.01, 0.03, 0.02, M.upvc, sx * (fw / 2 + 0.006), by, cz - ch * 0.1, 0.004));
  if (!motor) {
    // beaded chain loop on the right
    const n = 150, spc = 0.0072;
    const inst = new THREE.InstancedMesh(new THREE.SphereGeometry(0.0028, 10, 8), M.satin, n * 2);
    const m4 = new THREE.Matrix4();
    let k = 0;
    for (const dx of [-0.007, 0.007]) for (let i = 0; i < n; i++) { m4.makeTranslation(cw / 2 - 0.015 + dx, h0 / 2 - ch / 2 - i * spc, cz + ch * 0.5 + 0.004); inst.setMatrixAt(k++, m4); }
    g.add(inst);
    g.add(box(0.012, 0.022, 0.012, M.upvc, cw / 2 - 0.015, h0 / 2 - ch / 2 - n * spc - 0.008, cz + ch * 0.5 + 0.004, 0.005));
  } else {
    // wall remote beside the window
    const rx = W / 2 + 0.11, ry = 0.05;
    g.add(box(0.075, 0.13, 0.012, M.upvc, rx, ry, d / 2 - 0.01, 0.006));
    g.add(box(0.05, 0.11, 0.012, M.upvc, rx, ry, d / 2 + 0.002, 0.008));
    for (const [yy, mt] of [[0.03, M.greyDk], [0, M.gasket], [-0.03, M.greyDk]]) g.add(box(0.026, 0.016, 0.006, mt, rx, ry + yy, d / 2 + 0.009, 0.003));
    g.add(cyl(0.0025, 0.004, phys({ color: 0x3fd07a, emissive: 0x2a9a55, emissiveIntensity: 1 }), "z", rx, ry + 0.047, d / 2 + 0.009, 16));
  }
}
P["roller-shades"] = (g) => shadeWindow(g, false);
P["motor-shades"] = (g) => shadeWindow(g, true);

P["storefront"] = (g) => {
  const W = 1.05, H = 2.6, bw = 0.045, d = 0.1;
  rect(g, { w: W, h: H, bw, b: 0, d, mat: M.bronze, bevel: 0.0015 });
  const doorH = 2.13;
  // transom bar + transom glass
  const ty = -H / 2 + doorH + 0.022;
  g.add(box(W - 2 * bw + 0.002, 0.045, d, M.bronze, 0, ty, 0, 0.0015));
  const trH = H / 2 - bw - (ty + 0.0225);
  glazing(g, W - 2 * bw, trH, 0, ty + 0.0225 + trH / 2, 0, M.glass);
  // threshold
  g.add(box(W + 0.03, 0.02, d + 0.06, M.silver, 0, -H / 2 + 0.01, 0.01, 0.004));
  const lw = W - 2 * bw - 0.006, lh = doorH - 0.02 - 0.006;
  const leaf = sash(g, { w: lw, h: lh, bw: 0.06, t: 0.06, b: 0.25, d: 0.045, mat: M.bronze, y: -H / 2 + 0.02 + lh / 2 + 0.003, z: 0.01, bead: 0.008, bevel: 0.0015 });
  // long pull handle
  const hx = lw / 2 - 0.03, hy = -lh / 2 + 1.05;
  leaf.add(cyl(0.0135, 0.95, M.satin, "y", hx - 0.01, hy, 0.085, 40));
  for (const s of [-1, 1]) { leaf.add(cyl(0.008, 0.065, M.satin, "z", hx - 0.01, hy + s * 0.37, 0.05)); leaf.add(cyl(0.0135, 0.0035, M.satin, "y", hx - 0.01, hy + s * 0.475, 0.085)); }
  leaf.add(cyl(0.014, 0.008, M.satin, "z", hx, -lh / 2 + 0.36, 0.026));
  hinges(leaf, -lw / 2 + 0.008, 0.024, [lh / 2 - 0.03, -lh / 2 + 0.03], M.bronze, 0.04);
};

P["curtain-wall"] = (g) => {
  const cols = [0.82, 0.82, 0.82], rows = [0.55, 1.05, 1.05];
  const mw = 0.064, md = 0.18;
  const W = cols.reduce((a, b) => a + b) + mw * (cols.length + 1);
  const H = rows.reduce((a, b) => a + b) + mw * (rows.length + 1);
  let x = -W / 2;
  for (let i = 0; i <= cols.length; i++) {
    g.add(box(mw, H, md, M.silver, x + mw / 2, 0, -md / 2 + 0.03, 0.0015));
    g.add(box(mw, H, 0.03, M.silver, x + mw / 2, 0, 0.045, 0.004)); // pressure cap
    if (i < cols.length) x += mw + cols[i];
  }
  let y = -H / 2;
  for (let j = 0; j <= rows.length; j++) {
    g.add(box(W - 0.002, mw, md * 0.66, M.silver, 0, y + mw / 2, -md * 0.33 + 0.03, 0.0015));
    g.add(box(W - 0.002, mw, 0.024, M.silver, 0, y + mw / 2, 0.043, 0.004));
    if (j < rows.length) {
      let xx = -W / 2 + mw;
      for (let i = 0; i < cols.length; i++) {
        glazing(g, cols[i], rows[j], xx + cols[i] / 2, y + mw + rows[j] / 2, 0.012, j === 0 ? M.spandrel : M.reflect, true, 0.024);
        xx += cols[i] + mw;
      }
      y += mw + rows[j];
    }
  }
};

// per-product camera azimuth (degrees, + = from the right)
const AZ = { "upvc-casement": 14, "curtain-wall": 32, "alu-lseries": 26, "shower-screen": 30 };

// per-product camera elevation (degrees); open sashes look odd from above
const EL = { "upvc-casement": 1.5 };
// per-product field of view: a longer lens flattens the open casement so its
// projecting free edge does not drop below the frame
const FOV = { "upvc-casement": 14 };

// ---------------------------------------------------------------- staging
function contactShadow(root) {
  root.updateMatrixWorld(true);
  const all = new THREE.Box3().setFromObject(root);
  const foot = new THREE.Box3();
  root.traverse((o) => {
    if (!o.isMesh) return;
    const b = new THREE.Box3().setFromObject(o);
    if (b.min.y < all.min.y + 0.03) foot.union(b);
  });
  const pad = 0.25;
  const fw = foot.max.x - foot.min.x + pad * 2, fd = foot.max.z - foot.min.z + pad * 2;
  const px = 1024, py = Math.max(64, Math.round((px * fd) / fw));
  const sc = px / fw;
  const tex = canvasTex(px, py, (c) => {
    c.fillStyle = "#000"; c.fillRect(0, 0, px, py);
    const rx = pad * sc, ry = pad * sc, w = (foot.max.x - foot.min.x) * sc, h = (foot.max.z - foot.min.z) * sc;
    c.filter = `blur(${Math.round(0.09 * sc)}px)`; c.fillStyle = "rgba(255,255,255,0.22)"; c.fillRect(rx - 0.02 * sc, ry - 0.01 * sc, w + 0.04 * sc, h + 0.04 * sc);
    c.filter = `blur(${Math.round(0.012 * sc)}px)`; c.fillStyle = "rgba(255,255,255,0.38)"; c.fillRect(rx, ry, w, h);
  });
  tex.colorSpace = THREE.NoColorSpace;
  const m = mesh(new THREE.PlaneGeometry(fw, fd), new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, toneMapped: false, color: 0x000000, alphaMap: tex }));
  m.rotation.x = -Math.PI / 2;
  m.position.set((foot.min.x + foot.max.x) / 2, all.min.y + 0.0005, (foot.min.z + foot.max.z) / 2);
  m.renderOrder = -1;
  return m;
}

window.renderProduct = (id) => {
  const scene = new THREE.Scene();
  scene.environment = envTex;
  scene.environmentIntensity = 0.75;
  const key = new THREE.DirectionalLight(0xffffff, 1.9);
  key.position.set(-5, 4, 2.6);
  const fill = new THREE.DirectionalLight(0xffffff, 0.5);
  fill.position.set(1.5, 3, 5);
  scene.add(key, fill);
  const g = new THREE.Group();
  P[id](g);
  scene.add(g);
  // stand on the floor, centred
  g.updateMatrixWorld(true);
  let bb = new THREE.Box3().setFromObject(g);
  const c0 = bb.getCenter(new THREE.Vector3());
  g.position.set(-c0.x, -bb.min.y, -c0.z);
  g.updateMatrixWorld(true);
  bb = new THREE.Box3().setFromObject(g);
  scene.add(contactShadow(g));
  const center = bb.getCenter(new THREE.Vector3());
  const size = bb.getSize(new THREE.Vector3());
  const fov = FOV[id] ?? 26;
  const cam = new THREE.PerspectiveCamera(fov, 1, 0.05, 100);
  const az = THREE.MathUtils.degToRad(AZ[id] ?? 28), el = THREE.MathUtils.degToRad(EL[id] ?? 5);
  const dir = new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
  const r = size.length() / 2;
  const dist = (r / Math.sin(THREE.MathUtils.degToRad(fov / 2))) * 0.92;
  // fit: shrink/grow the distance until the bounding box fills ~90% of the frame
  let dd = dist;
  for (let it = 0; it < 6; it++) {
    cam.position.copy(center).addScaledVector(dir, dd);
    cam.lookAt(center);
    cam.updateMatrixWorld(true);
    let m = 0;
    for (let k = 0; k < 8; k++) {
      const v = new THREE.Vector3(k & 1 ? bb.max.x : bb.min.x, k & 2 ? bb.max.y : bb.min.y, k & 4 ? bb.max.z : bb.min.z).project(cam);
      m = Math.max(m, Math.abs(v.x), Math.abs(v.y));
    }
    dd *= m / 0.9;
  }
  cam.position.copy(center).addScaledVector(dir, dd);
  cam.lookAt(center);
  renderer.render(scene, cam);
  return canvas.toDataURL("image/png");
};
window.productIds = Object.keys(P);
window.ready = true;
