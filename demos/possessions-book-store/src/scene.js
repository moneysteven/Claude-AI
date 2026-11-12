// 3D header: procedural, low-poly library objects drifting in warm lamplight.
// Everything (geometry + textures) is generated here: no model or image downloads.
import {
  WebGLRenderer, Scene, PerspectiveCamera, Group, Mesh, Points, BufferGeometry, BufferAttribute,
  BoxGeometry, CylinderGeometry, ConeGeometry, TorusGeometry, PlaneGeometry, CircleGeometry,
  SphereGeometry, ExtrudeGeometry, ShapeGeometry, Shape,
  MeshStandardMaterial, MeshBasicMaterial, PointsMaterial, CanvasTexture,
  SRGBColorSpace, NoColorSpace, RepeatWrapping, DoubleSide, BackSide, AdditiveBlending,
  Color, HemisphereLight, DirectionalLight, PMREMGenerator, NeutralToneMapping,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const d = document;
const w = window;
const html = d.documentElement;
const PBS = w.PBS || { reduce: false, input: { tx: 0, ty: 0 }, onReveal: (cb) => cb(performance.now()), revealed: true };
const canvas = d.querySelector('.hero__canvas');
const hero = d.querySelector('.hero');
const wm = d.querySelector('.wm');

const PI = Math.PI;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const easeOut = (t) => 1 - Math.pow(1 - t, 3);

// deterministic randomness so every visit looks the same
let seed = 1337;
const rnd = () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

// Yield to the browser between setup stages so first paint and the intro are never held up.
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));

if (canvas && hero) {
  nextFrame()
    .then(nextFrame)
    .then(start)
    .catch(() => html.classList.add('no-webgl'));
}

async function start() {
  const renderer = new WebGLRenderer({
    canvas,
    antialias: (w.devicePixelRatio || 1) < 1.5,
    alpha: true,
    powerPreference: 'high-performance',
    stencil: false,
  });
  let dpr = Math.min(w.devicePixelRatio || 1, 2);
  renderer.setPixelRatio(dpr);
  renderer.toneMapping = NeutralToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.setClearColor(0x000000, 0);
  const maxAniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());

  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    setRunning(false);
    html.classList.add('no-webgl');
    canvas.classList.remove('is-ready');
  });

  const scene = new Scene();
  const camera = new PerspectiveCamera(30, 1, 1, 60);
  const CAM_Z = 16;
  camera.position.set(0, 0, CAM_Z);

  // ---------------------------------------------------------------- textures
  const tex = (wd, ht, draw, { srgb = true, repeat = null } = {}) => {
    const c = d.createElement('canvas');
    c.width = wd;
    c.height = ht;
    draw(c.getContext('2d'), wd, ht);
    const t = new CanvasTexture(c);
    t.colorSpace = srgb ? SRGBColorSpace : NoColorSpace;
    if (repeat) {
      t.wrapS = t.wrapT = RepeatWrapping;
      t.repeat.set(repeat[0], repeat[1]);
    }
    t.anisotropy = maxAniso;
    return t;
  };

  const paperBase = (g, wd, ht) => {
    const grd = g.createLinearGradient(0, 0, wd, 0);
    grd.addColorStop(0, '#e6d8b8');
    grd.addColorStop(0.1, '#f6eedb');
    grd.addColorStop(0.9, '#f3e9d3');
    grd.addColorStop(1, '#e8dabd');
    g.fillStyle = grd;
    g.fillRect(0, 0, wd, ht);
    for (let i = 0; i < 1800; i++) {
      g.fillStyle = `rgba(120,90,50,${(rnd() * 0.07).toFixed(3)})`;
      g.fillRect(rnd() * wd, rnd() * ht, 1.6, 1.6);
    }
  };
  const textPage = (heading) => (g, wd, ht) => {
    paperBase(g, wd, ht);
    const L = wd * 0.13;
    const R = wd * 0.87;
    let y = ht * 0.1;
    g.fillStyle = 'rgba(62,44,30,.6)';
    if (heading) {
      g.fillRect(wd * 0.36, y + 6, wd * 0.28, 7);
      g.fillRect(wd * 0.45, y + 26, wd * 0.1, 3);
      y += 70;
      g.fillStyle = 'rgba(90,34,21,.75)';
      g.fillRect(L, y, 38, 40);
      g.fillStyle = 'rgba(62,44,30,.6)';
    }
    let indent = heading ? 46 : 20;
    let lines = 0;
    while (y < ht * 0.9) {
      const end = rnd() < 0.13;
      const len = end ? (R - L) * (0.25 + rnd() * 0.5) : R - L;
      let x = L + indent;
      while (x < L + len - 4) {
        const ww = Math.min(6 + rnd() * 30, L + len - x);
        g.fillRect(x, y, ww, 4.5);
        x += ww + 5.5;
      }
      lines++;
      indent = heading && lines < 3 ? 46 : 0;
      y += 13.5;
      if (end) { y += 7; indent = 20; }
    }
    g.fillRect(wd / 2 - 10, ht * 0.95, 20, 3);
  };
  const linedPage = (g, wd, ht) => {
    paperBase(g, wd, ht);
    g.fillStyle = 'rgba(70,110,150,.42)';
    for (let y = 92; y < ht - 16; y += 30) g.fillRect(0, y, wd, 2);
    g.fillStyle = 'rgba(176,58,48,.55)';
    g.fillRect(74, 0, 2.5, ht);
    // punched holes
    g.fillStyle = 'rgba(40,30,20,.2)';
    [0.2, 0.5, 0.8].forEach((f) => { g.beginPath(); g.arc(28, ht * f, 9, 0, 7); g.fill(); });
  };
  const pageTex = tex(512, 704, textPage(false));
  const chapterTex = tex(512, 704, textPage(true));
  const linedTex = tex(512, 704, linedPage);
  const edgeTex = tex(64, 256, (g, wd, ht) => {
    g.fillStyle = '#efe3c8';
    g.fillRect(0, 0, wd, ht);
    for (let y = 0; y < ht; y += 2) {
      g.fillStyle = `rgba(120,92,56,${(0.06 + rnd() * 0.2).toFixed(3)})`;
      g.fillRect(0, y, wd, 1);
    }
  }, { repeat: [1, 1] });
  const leatherBump = tex(256, 256, (g, wd, ht) => {
    g.fillStyle = '#808080';
    g.fillRect(0, 0, wd, ht);
    for (let i = 0; i < 4200; i++) {
      const v = (96 + rnd() * 90) | 0;
      g.fillStyle = `rgba(${v},${v},${v},.4)`;
      g.beginPath();
      g.arc(rnd() * wd, rnd() * ht, 0.6 + rnd() * 1.9, 0, 7);
      g.fill();
    }
  }, { srgb: false, repeat: [3, 3] });
  const rulerTex = tex(1024, 128, (g, wd, ht) => {
    const grd = g.createLinearGradient(0, 0, 0, ht);
    grd.addColorStop(0, '#e3c693');
    grd.addColorStop(1, '#c9a26c');
    g.fillStyle = grd;
    g.fillRect(0, 0, wd, ht);
    for (let i = 0; i < 46; i++) {
      g.strokeStyle = `rgba(120,78,36,${(0.05 + rnd() * 0.1).toFixed(3)})`;
      g.lineWidth = 1 + rnd() * 2;
      g.beginPath();
      const y0 = rnd() * ht;
      g.moveTo(0, y0);
      for (let x = 0; x <= wd; x += 64) g.lineTo(x, y0 + Math.sin(x * 0.01 + i) * 4);
      g.stroke();
    }
    const x0 = 34;
    const step = (wd - 68) / 150;
    g.fillStyle = 'rgba(45,26,12,.9)';
    for (let i = 0; i <= 150; i++) {
      const len = i % 10 === 0 ? 44 : i % 5 === 0 ? 30 : 18;
      g.fillRect(x0 + i * step - 0.8, 0, 1.6, len);
    }
    g.font = '600 26px Georgia, "Times New Roman", serif';
    g.textAlign = 'center';
    for (let c = 0; c <= 15; c++) g.fillText(String(c), x0 + c * 10 * step, 78);
  });
  const dotTex = tex(64, 64, (g) => {
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.25, 'rgba(255,240,200,.8)');
    grd.addColorStop(1, 'rgba(255,220,150,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 64, 64);
  });

  await nextFrame();

  // ---------------------------------------------------------------- materials
  const gold = new MeshStandardMaterial({ color: 0xd9b25e, metalness: 1, roughness: 0.24 });
  const brass = new MeshStandardMaterial({ color: 0xb98f45, metalness: 1, roughness: 0.36 });
  const leather = (c) => new MeshStandardMaterial({ color: c, roughness: 0.58, metalness: 0, bumpMap: leatherBump, bumpScale: 1.4 });
  const paperMat = (map) => new MeshStandardMaterial({ map, roughness: 0.92, metalness: 0, side: DoubleSide });
  const edgeMat = new MeshStandardMaterial({ map: edgeTex, roughness: 0.95, side: DoubleSide });
  const plainPaper = new MeshStandardMaterial({ color: 0xefe4cb, roughness: 0.95 });
  const lacquer = (c, r = 0.22) => new MeshStandardMaterial({ color: c, roughness: r, metalness: 0.15 });
  const wood = new MeshStandardMaterial({ color: 0xdcb98a, roughness: 0.75 });
  const graphite = new MeshStandardMaterial({ color: 0x2a2826, roughness: 0.45, metalness: 0.4 });
  const eraser = new MeshStandardMaterial({ color: 0xb46a5a, roughness: 0.9 });
  const glass = new MeshStandardMaterial({ color: 0xffffff, roughness: 0.04, metalness: 0, transparent: true, opacity: 0.16, envMapIntensity: 2.4, depthWrite: false });
  const rulerMat = new MeshStandardMaterial({ map: rulerTex, roughness: 0.55 });
  const rulerSide = new MeshStandardMaterial({ color: 0xc9a26c, roughness: 0.6 });

  const pageMat = paperMat(pageTex);
  const chapterMat = paperMat(chapterTex);
  const linedMat = paperMat(linedTex);

  // ---------------------------------------------------------------- environment (warm library light)
  {
    const pmrem = new PMREMGenerator(renderer);
    const env = new Scene();
    env.add(new Mesh(new SphereGeometry(30, 16, 8), new MeshBasicMaterial({ color: new Color(0.012, 0.03, 0.02), side: BackSide })));
    const panel = (wd, ht, c, pos) => {
      const m = new Mesh(new PlaneGeometry(wd, ht), new MeshBasicMaterial({ color: c, side: DoubleSide }));
      m.position.set(...pos);
      m.lookAt(0, 0, 0);
      env.add(m);
    };
    panel(10, 6, new Color(7, 4.6, 2.3), [-8, 14, 10]); // the lamp
    panel(26, 8, new Color(0.8, 0.6, 0.36), [0, -13, 8]); // warm bounce
    panel(7, 16, new Color(0.4, 0.75, 0.55), [17, 2, -6]); // green rim
    panel(30, 30, new Color(0.3, 0.25, 0.19), [0, 0, 24]); // soft front fill
    panel(8, 4, new Color(3, 2.2, 1.3), [12, 9, 6]); // second lamp
    scene.environment = pmrem.fromScene(env, 0.035).texture;
    pmrem.dispose();
  }
  scene.add(new HemisphereLight(0xffe2b8, 0x0d2a1e, 0.5));
  const key = new DirectionalLight(0xffd29a, 2.3);
  key.position.set(-5, 7, 8);
  scene.add(key);
  const rim = new DirectionalLight(0x9cc7b0, 0.75);
  rim.position.set(6, -2, -5);
  scene.add(rim);

  // ---------------------------------------------------------------- builders
  // Closed book lying flat, spine toward +z.
  function book({ W, T, D, color, label = 0x143426 }) {
    const g = new Group();
    const c = 0.05;
    const r = T / 2;
    const xs = D / 2 - r;
    const s = new Shape();
    s.moveTo(-D / 2, T / 2);
    s.lineTo(xs, T / 2);
    s.absarc(xs, 0, r, PI / 2, -PI / 2, true);
    s.lineTo(-D / 2, -T / 2);
    s.lineTo(-D / 2, -T / 2 + c);
    s.lineTo(xs, -T / 2 + c);
    s.absarc(xs, 0, r - c, -PI / 2, PI / 2, false);
    s.lineTo(-D / 2, T / 2 - c);
    s.closePath();
    const cg = new ExtrudeGeometry(s, { depth: W, bevelEnabled: true, bevelThickness: 0.022, bevelSize: 0.016, bevelSegments: 2, curveSegments: 10 });
    cg.rotateY(-PI / 2);
    cg.center();
    g.add(new Mesh(cg, leather(color)));

    const depth = xs + D / 2 - 0.04;
    const pg = new BoxGeometry(W - 0.05, T - 2 * c - 0.045, depth);
    const pm = new Mesh(pg, [edgeMat, edgeMat, plainPaper, plainPaper, plainPaper, edgeMat]);
    pm.position.z = (xs - D / 2 + 0.04) / 2;
    g.add(pm);

    const crescent = (r0, r1, depthW, x) => {
      const b = new Shape();
      b.moveTo(xs, r1);
      b.absarc(xs, 0, r1, PI / 2, -PI / 2, true);
      b.lineTo(xs, -r0);
      b.absarc(xs, 0, r0, -PI / 2, PI / 2, false);
      b.closePath();
      const geo = new ExtrudeGeometry(b, { depth: depthW, bevelEnabled: false, curveSegments: 10 });
      geo.rotateY(-PI / 2);
      geo.translate(x + depthW / 2, 0, 0);
      return geo;
    };
    const bandX = [-0.4, -0.34, 0.34, 0.4].map((f) => f * W);
    const bands = mergeGeometries(bandX.map((x) => crescent(r - 0.012, r + 0.012, 0.035, x)));
    g.add(new Mesh(bands, gold));
    g.add(new Mesh(crescent(r - 0.01, r + 0.007, W * 0.3, 0), leather(label)));
    const tit = mergeGeometries([-0.09, 0.09].map((f) => crescent(r + 0.004, r + 0.011, 0.012, f * W)));
    g.add(new Mesh(tit, gold));
    return g;
  }

  // Open book with a page that keeps turning.
  const N = 20;
  const PW = 1.45;
  const PH = 2.0;
  const ds = PW / N;
  const phiR = (s) => 0.95 * Math.pow(1 - s, 2.4) - 0.1 * s;
  const curveBuf = new Float32Array((N + 1) * 2);
  function curve(p, out) {
    let x = 0;
    let y = 0.03;
    out[0] = x;
    out[1] = y;
    for (let k = 0; k < N; k++) {
      const s = (k + 0.5) / N;
      let ps = clamp(p * 1.6 - 0.6 * s, 0, 1);
      ps = ps * ps * (3 - 2 * ps);
      const a = phiR(s);
      const phi = a + (PI - 2 * a) * ps;
      x += Math.cos(phi) * ds;
      y += Math.sin(phi) * ds;
      out[(k + 1) * 2] = x;
      out[(k + 1) * 2 + 1] = y;
    }
    return out;
  }
  function stripGeometry() {
    const geo = new BufferGeometry();
    const pos = new Float32Array((N + 1) * 2 * 3);
    const uv = new Float32Array((N + 1) * 2 * 2);
    const idx = [];
    for (let k = 0; k <= N; k++) {
      uv.set([k / N, 0, k / N, 1], k * 4);
      if (k < N) {
        const a = k * 2;
        idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      }
    }
    geo.setAttribute('position', new BufferAttribute(pos, 3));
    geo.setAttribute('uv', new BufferAttribute(uv, 2));
    geo.setIndex(idx);
    return geo;
  }
  function fillStrip(geo, pts, lift) {
    const pos = geo.attributes.position.array;
    for (let k = 0; k <= N; k++) {
      const x = pts[k * 2];
      const y = pts[k * 2 + 1] + lift;
      pos.set([x, y, PH / 2, x, y, -PH / 2], k * 6);
    }
    geo.attributes.position.needsUpdate = true;
    geo.computeVertexNormals();
  }
  function openBook(color) {
    const g = new Group();
    const rest = curve(0, new Float32Array((N + 1) * 2));
    const half = new Group();
    const surf = stripGeometry();
    fillStrip(surf, rest, 0);
    half.add(new Mesh(surf, chapterMat));
    // solid page-block sides
    const ex = rest[N * 2];
    const ey = rest[N * 2 + 1];
    const sh = new Shape();
    sh.moveTo(0, 0);
    for (let k = 0; k <= N; k++) sh.lineTo(rest[k * 2], rest[k * 2 + 1]);
    sh.lineTo(ex, 0);
    sh.closePath();
    const sg = new ShapeGeometry(sh);
    const uvs = sg.attributes.uv;
    for (let i = 0; i < uvs.count; i++) uvs.setXY(i, uvs.getX(i) * 0.5, uvs.getY(i) * 3);
    const f1 = new Mesh(sg, edgeMat);
    f1.position.z = PH / 2;
    const f2 = new Mesh(sg, edgeMat);
    f2.position.z = -PH / 2;
    const fore = new Mesh(new PlaneGeometry(PH, ey), edgeMat);
    fore.rotation.y = PI / 2;
    fore.position.set(ex, ey / 2, 0);
    half.add(f1, f2, fore);
    const board = new Mesh(new BoxGeometry(PW + 0.1, 0.05, PH + 0.14), leather(color));
    board.position.set((PW + 0.1) / 2 - 0.01, -0.025, 0);
    half.add(board);
    const left = half.clone();
    left.scale.x = -1;
    left.children[0].material = pageMat;
    g.add(half, left);
    // headbands
    const hb = new CylinderGeometry(0.035, 0.035, 0.12, 10);
    hb.rotateZ(PI / 2);
    [PH / 2 + 0.02, -PH / 2 - 0.02].forEach((z) => { const m = new Mesh(hb, gold); m.position.set(0, 0.03, z); g.add(m); });
    // the turning page
    const turner = stripGeometry();
    fillStrip(turner, rest, 0.004);
    const page = new Mesh(turner, pageMat);
    g.add(page);
    g.userData.turn = (p) => fillStrip(turner, curve(p, curveBuf), 0.004 + Math.sin(p * PI) * 0.01);
    return g;
  }

  function pencil() {
    const g = new Group();
    const L = 2.5;
    const body = new Mesh(new CylinderGeometry(0.085, 0.085, L, 6), lacquer(0x1f4d38, 0.3));
    body.rotation.z = PI / 2;
    g.add(body);
    const stripe = new Mesh(new CylinderGeometry(0.0865, 0.0865, 0.05, 6), gold);
    stripe.rotation.z = PI / 2;
    stripe.position.x = -L / 2 + 0.4;
    g.add(stripe);
    const fer = new Mesh(new CylinderGeometry(0.09, 0.09, 0.22, 18), brass);
    fer.rotation.z = PI / 2;
    fer.position.x = -L / 2 - 0.11;
    g.add(fer);
    [-0.05, 0.05].forEach((o) => {
      const ring = new Mesh(new TorusGeometry(0.09, 0.012, 6, 18), gold);
      ring.rotation.y = PI / 2;
      ring.position.x = -L / 2 - 0.11 + o;
      g.add(ring);
    });
    const er = new Mesh(new CylinderGeometry(0.083, 0.083, 0.17, 18), eraser);
    er.rotation.z = PI / 2;
    er.position.x = -L / 2 - 0.3;
    g.add(er);
    const cone = new Mesh(new ConeGeometry(0.085, 0.38, 6), wood);
    cone.rotation.z = -PI / 2;
    cone.position.x = L / 2 + 0.19;
    g.add(cone);
    const tip = new Mesh(new ConeGeometry(0.03, 0.12, 10), graphite);
    tip.rotation.z = -PI / 2;
    tip.position.x = L / 2 + 0.33;
    g.add(tip);
    return g;
  }

  function pen() {
    const g = new Group();
    const resin = lacquer(0x3a130b, 0.16);
    const black = lacquer(0x120c0a, 0.2);
    const seg = (r0, r1, len, x, mat, rs = 28) => {
      const m = new Mesh(new CylinderGeometry(r1, r0, len, rs), mat);
      m.rotation.z = PI / 2;
      m.position.x = x;
      g.add(m);
      return m;
    };
    seg(0.11, 0.115, 1.25, -0.2, resin); // barrel
    seg(0.13, 0.13, 0.95, -1.02, resin); // posted cap
    seg(0.132, 0.132, 0.06, -0.6, gold); // cap band
    seg(0.12, 0.12, 0.04, -0.82, gold);
    const fin = new Mesh(new SphereGeometry(0.13, 20, 10, 0, PI * 2, 0, PI / 2), gold);
    fin.rotation.z = PI / 2;
    fin.position.x = -1.5;
    g.add(fin);
    const clip = new Mesh(new BoxGeometry(0.75, 0.03, 0.05), gold);
    clip.position.set(-1.0, 0.15, 0);
    g.add(clip);
    const ball = new Mesh(new SphereGeometry(0.035, 10, 8), gold);
    ball.position.set(-0.64, 0.14, 0);
    g.add(ball);
    seg(0.115, 0.112, 0.05, 0.43, gold); // trim ring
    seg(0.1, 0.075, 0.32, 0.6, black); // section
    const nib = new Mesh(new ConeGeometry(0.085, 0.42, 24, 1, true), gold);
    nib.rotation.z = -PI / 2;
    nib.scale.set(1, 1, 0.42);
    nib.position.x = 0.96;
    g.add(nib);
    const slit = new Mesh(new BoxGeometry(0.22, 0.004, 0.012), black);
    slit.position.set(1.04, 0.002, 0.03);
    g.add(slit);
    return g;
  }

  function glasses() {
    const g = new Group();
    const rimGeo = new TorusGeometry(0.42, 0.032, 8, 44);
    const lensGeo = new CircleGeometry(0.41, 36);
    [-0.52, 0.52].forEach((x) => {
      const r = new Mesh(rimGeo, gold);
      r.scale.y = 0.8;
      r.position.x = x;
      g.add(r);
      const l = new Mesh(lensGeo, glass);
      l.scale.y = 0.8;
      l.position.x = x;
      g.add(l);
    });
    const bridge = new Mesh(new TorusGeometry(0.12, 0.026, 8, 18, PI), gold);
    bridge.position.y = 0.12;
    g.add(bridge);
    const templeGeo = new CylinderGeometry(0.018, 0.018, 1.45, 8);
    templeGeo.rotateX(PI / 2);
    [-0.93, 0.93].forEach((x) => {
      const t = new Mesh(templeGeo, gold);
      t.position.set(x, 0.12, -0.72);
      t.rotation.y = x < 0 ? 0.08 : -0.08;
      g.add(t);
      const tip = new Mesh(new TorusGeometry(0.16, 0.018, 6, 12, PI / 2), gold);
      tip.rotation.y = PI / 2;
      tip.position.set(x * 1.08, -0.04, -1.44);
      g.add(tip);
      const hinge = new Mesh(new BoxGeometry(0.08, 0.06, 0.08), gold);
      hinge.position.set(x, 0.12, 0);
      g.add(hinge);
    });
    return g;
  }

  function ruler() {
    const g = new Group();
    const m = new Mesh(new BoxGeometry(3.6, 0.05, 0.46), [rulerSide, rulerSide, rulerMat, rulerSide, rulerSide, rulerSide]);
    g.add(m);
    const edge = new Mesh(new BoxGeometry(3.6, 0.056, 0.03), brass);
    edge.position.z = -0.245;
    g.add(edge);
    return g;
  }

  function loosePage(mat) {
    const geo = new PlaneGeometry(1.25, 1.66, 8, 1);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i) / 0.625;
      p.setZ(i, 0.13 * x * x - 0.05 * x);
    }
    geo.computeVertexNormals();
    return new Mesh(geo, mat);
  }

  await nextFrame();

  // ---------------------------------------------------------------- assemble
  const world = new Group();
  scene.add(world);

  const stackG = new Group();
  const b1 = book({ W: 2.7, T: 0.46, D: 1.95, color: 0x5c2213, label: 0x16382a });
  const b2 = book({ W: 2.45, T: 0.38, D: 1.8, color: 0x1e4a34, label: 0x5a1a1f });
  const b3 = book({ W: 2.25, T: 0.5, D: 1.7, color: 0x5a1a1f, label: 0x1e4a34 });
  b1.position.set(0, -0.44, 0);
  b2.position.set(0.12, -0.02, -0.04);
  b2.rotation.y = -0.13;
  b3.position.set(-0.08, 0.42, 0.03);
  b3.rotation.y = 0.1;
  stackG.add(b1, b2, b3);

  const openG = openBook(0x4e1c10);
  const objects = {
    open: openG,
    stack: stackG,
    pencil: pencil(),
    pen: pen(),
    glasses: glasses(),
    ruler: ruler(),
    page1: loosePage(chapterMat),
    page2: loosePage(linedMat),
    page3: loosePage(pageMat),
    page4: loosePage(linedMat),
  };

  // Placement as fractions of the visible frustum at that depth.
  const LAYOUT = {
    wide: {
      open: { x: -0.74, y: 0.5, z: -0.8, s: 0.94, r: [1.0, 0.42, -0.1] },
      stack: { x: 0.7, y: -0.16, z: 0.2, s: 0.92, r: [0.36, -0.62, 0.04] },
      pencil: { x: -0.62, y: -0.12, z: 1.4, s: 0.9, r: [0.4, 0.3, 0.3] },
      pen: { x: 0.62, y: 0.58, z: 0.6, s: 0.95, r: [0.25, 0.4, -0.42] },
      glasses: { x: -0.2, y: 0.7, z: -2.4, s: 0.9, r: [0.35, -0.35, 0.06] },
      ruler: { x: 0.17, y: -0.55, z: -1.6, s: 0.84, r: [1.05, 0.15, 0.12] },
      page1: { x: -0.97, y: -0.02, z: -3.4, s: 1.15, r: [0.2, 0.6, 0.3] },
      page2: { x: 0.97, y: 0.26, z: -3.8, s: 1.2, r: [-0.2, -0.5, -0.25] },
      page3: { x: 0.36, y: -0.98, z: 2.4, s: 0.72, r: [0.9, 0.3, 1.2] },
      page4: { x: -0.36, y: 0.6, z: -6.5, s: 0.9, r: [0.3, -0.3, 0.5] },
    },
    // portrait: y is a position inside a free band measured from the page
    // (top = between nav and wordmark, bot = between wordmark and tagline)
    tall: {
      open: { band: 'top', f: 0.52, x: -0.36, z: -0.6, s: 0.6, r: [1.0, 0.4, -0.12] },
      ruler: { band: 'top', f: 0.1, x: -0.08, z: -2.4, s: 0.46, r: [1.15, 0.05, -0.08] },
      glasses: { band: 'top', f: 0.82, x: 0.2, z: -1.6, s: 0.5, r: [0.35, -0.35, 0.08] },
      stack: { band: 'bot', f: 0.46, x: 0.46, z: 0.2, s: 0.5, r: [0.36, -0.6, 0.04] },
      pencil: { band: 'bot', f: 0.2, x: -0.44, z: 1.2, s: 0.48, r: [0.4, 0.3, 0.5] },
      pen: { band: 'bot', f: 0.74, x: -0.26, z: 0.5, s: 0.5, r: [0.25, 0.4, 0.22] },
      page1: { band: 'top', f: 0.62, x: -1.04, z: -3.2, s: 0.75, r: [0.2, 0.6, 0.3] },
      page2: { band: 'mid', f: 0.4, x: 1.04, z: -3.6, s: 0.8, r: [-0.2, -0.5, -0.25] },
      page3: { band: 'bot', f: 0.56, x: -1.0, z: 1.8, s: 0.5, r: [0.7, 0.3, 0.9] },
      page4: { band: 'bot', f: 0.86, x: 0.98, z: -4.0, s: 0.7, r: [0.3, -0.3, 0.5] },
    },
  };

  const items = Object.entries(objects).map(([name, obj], i) => {
    const holder = new Group();
    const spin = new Group();
    spin.add(obj);
    holder.add(spin);
    world.add(holder);
    return {
      name,
      holder,
      spin,
      obj,
      home: { x: 0, y: 0, z: 0, s: 1 },
      base: [0, 0, 0],
      ph: rnd() * PI * 2,
      fs: 0.35 + rnd() * 0.3,
      fr: 0.22 + rnd() * 0.2,
      amp: name.startsWith('page') ? 0.22 : 0.12,
      yaw: name === 'glasses' ? 0.12 : name.startsWith('page') ? 0.07 : 0,
      delay: [0, 0.05, 0.1, 0.12, 0.08, 0.16, 0.2, 0.22, 0.26, 0.3][i] || 0.2,
    };
  });

  // dust motes in the lamplight
  const DUST = w.innerWidth < 640 ? 70 : 130;
  const dustPos = new Float32Array(DUST * 3);
  const dustSpeed = new Float32Array(DUST);
  const dustGeo = new BufferGeometry();
  dustGeo.setAttribute('position', new BufferAttribute(dustPos, 3));
  const dust = new Points(dustGeo, new PointsMaterial({ map: dotTex, color: 0xffd38a, size: 0.07, transparent: true, opacity: 0.75, depthWrite: false, blending: AdditiveBlending }));
  world.add(dust);

  let hw = 1;
  let hh = 1;
  let aspect = 1;
  let unit = 1;
  function layout() {
    hh = Math.tan((camera.fov * PI) / 360) * CAM_Z;
    hw = hh * aspect;
    const tall = aspect < 0.85;
    const L = tall ? LAYOUT.tall : LAYOUT.wide;
    let bands = null;
    if (tall) {
      // measure layout boxes (offsets ignore transforms, so entrance animations don't skew this)
      const H = hero.clientHeight || 1;
      const ndc = (py) => 1 - (2 * py) / H;
      const stage = hero.querySelector('.hero__stage');
      const title = hero.querySelector('.hero__title');
      const foot = hero.querySelector('.hero__foot');
      const t0 = stage ? stage.offsetTop : H * 0.07;
      const wt = title ? title.offsetTop : H * 0.3;
      const wb = title ? wt + title.offsetHeight : H * 0.42;
      const ft = foot ? foot.offsetTop : H * 0.7;
      bands = { top: [ndc(t0), ndc(wt)], mid: [ndc(wt), ndc(wb)], bot: [ndc(wb), ndc(ft)] };
      const bandMin = Math.min(wt - t0, ft - wb) * (2 * hh / H);
      unit = Math.min(hw / 2.0, hh / 4.3, bandMin / 1.75);
    } else {
      unit = Math.min(hw / 6.86, hh / 4.29) * (aspect < 1.25 ? 0.9 : 1);
    }
    items.forEach((it) => {
      const c = L[it.name];
      const k = (CAM_Z - c.z) / CAM_Z;
      const yf = bands ? lerp(bands[c.band][0], bands[c.band][1], c.f) : c.y;
      it.home = { x: c.x * hw * k, y: yf * hh * k, z: c.z, s: c.s * unit };
      it.base = c.r;
    });
    for (let i = 0; i < DUST; i++) {
      dustPos[i * 3] = (rnd() * 2 - 1) * hw * 1.1;
      dustPos[i * 3 + 1] = (rnd() * 2 - 1) * hh * 1.1;
      dustPos[i * 3 + 2] = -4 + rnd() * 7;
      dustSpeed[i] = 0.08 + rnd() * 0.22;
    }
    dustGeo.attributes.position.needsUpdate = true;
    dust.material.size = 0.07 * Math.max(0.6, unit);
  }

  // ---------------------------------------------------------------- per-frame
  let t = 0;
  let revealAt = -1;
  let heroH = 1;
  let wmLast = '';
  let px = 0;
  let py = 0;
  const reduce = !!PBS.reduce;

  function pose(now, dt) {
    const since = revealAt < 0 ? -1 : (now - revealAt) / 1000;
    const inp = PBS.input || { tx: 0, ty: 0 };
    const k = 1 - Math.exp(-dt * 3.2);
    if (!reduce) {
      px += (inp.tx - px) * k;
      py += (inp.ty - py) * k;
    }
    camera.position.x = px * 0.85;
    camera.position.y = -py * 0.55;
    camera.lookAt(0, 0, 0);

    const sp = clamp((w.scrollY || 0) / heroH, 0, 1.2);
    world.position.y = sp * hh * 0.55;
    world.rotation.x = sp * 0.25;

    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const e = reduce ? 1 : since < 0 ? 0 : easeOut(clamp((since - it.delay) / 1.9, 0, 1));
      const h = it.home;
      const ze = lerp(-9, h.z, e);
      const kk = (CAM_Z - ze) / CAM_Z;
      const fx = h.x / ((CAM_Z - h.z) / CAM_Z);
      const fy = h.y / ((CAM_Z - h.z) / CAM_Z);
      it.holder.position.set(lerp(fx * 0.05, fx, e) * kk, lerp(hh * 0.05, fy, e) * kk, ze);
      it.holder.scale.setScalar(h.s * lerp(0.25, 1, e));
      const spinIn = (1 - e) * 2.4;
      it.holder.rotation.set(it.base[0] + spinIn * 0.3, it.base[1] + spinIn, it.base[2]);
      if (!reduce) {
        it.spin.position.y = Math.sin(t * it.fs + it.ph) * it.amp;
        it.spin.rotation.x = Math.sin(t * it.fr + it.ph) * 0.12;
        it.spin.rotation.y = Math.sin(t * it.fr * 0.8 + it.ph * 2) * 0.22 + t * it.yaw;
        it.spin.rotation.z = Math.cos(t * it.fr * 0.9 + it.ph) * 0.07;
      }
    }

    // turning page: one leaf every 3.2s
    const cyc = (t % 3.2) / 1.55;
    openG.userData.turn(reduce ? 0.38 : clamp(cyc, 0, 1));

    if (!reduce) {
      for (let i = 0; i < DUST; i++) {
        let y = dustPos[i * 3 + 1] + dustSpeed[i] * dt;
        if (y > hh * 1.15) y = -hh * 1.15;
        dustPos[i * 3 + 1] = y;
        dustPos[i * 3] += Math.sin(t * 0.6 + i) * 0.0015;
      }
      dustGeo.attributes.position.needsUpdate = true;
    }
    dust.material.opacity = 0.75 * (since < 0 ? 0 : clamp(since / 1.5, 0, 1));

    if (wm && !reduce) {
      const v = `translate3d(${(-px * 9).toFixed(1)}px,${(-py * 6).toFixed(1)}px,0)`;
      if (v !== wmLast) { wm.style.transform = v; wmLast = v; }
    }
  }

  // ---------------------------------------------------------------- adaptive resolution
  let samples = [];
  let interval = 0;
  let ema = 0;
  let slow = 0;
  function adapt(ms) {
    if (interval === 0) {
      samples.push(ms);
      if (samples.length >= 90) {
        samples.sort((a, b) => a - b);
        interval = samples[(samples.length * 0.2) | 0];
        ema = interval;
        samples = null;
      }
      return;
    }
    ema += (ms - ema) * 0.05;
    if (ema > interval * 1.35) slow++;
    else if (slow > 0) slow--;
    if (slow > 50 && dpr > 1) {
      dpr = Math.max(1, dpr - 0.25);
      renderer.setPixelRatio(dpr);
      resize();
      slow = 0;
      ema = interval;
    }
  }

  // ---------------------------------------------------------------- loop
  let raf = 0;
  let running = false;
  let last = 0;
  let ready = false;
  let heroVisible = true;
  function frame(now) {
    raf = requestAnimationFrame(frame);
    const ms = now - last;
    last = now;
    const dt = Math.min(ms / 1000, 1 / 20);
    t += dt;
    pose(now, dt);
    renderer.render(scene, camera);
    if (ms > 0 && ms < 200) adapt(ms);
  }
  function setRunning(on) {
    if (on === running) return;
    running = on;
    if (on) {
      last = performance.now();
      raf = requestAnimationFrame(frame);
    } else {
      cancelAnimationFrame(raf);
    }
  }
  const update = () => setRunning(ready && !reduce && revealAt >= 0 && heroVisible && !d.hidden);
  d.addEventListener('visibilitychange', update);
  if ('IntersectionObserver' in w) {
    new IntersectionObserver(([e]) => { heroVisible = e.isIntersecting; update(); }).observe(hero);
  }

  function renderOnce() {
    const now = performance.now();
    pose(now, 0);
    renderer.render(scene, camera);
  }

  function resize() {
    const r = canvas.getBoundingClientRect();
    const wd = Math.max(1, Math.round(r.width));
    const ht = Math.max(1, Math.round(r.height));
    heroH = hero.clientHeight || ht;
    renderer.setSize(wd, ht, false);
    aspect = wd / ht;
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    layout();
    if (!running && ready) renderOnce();
  }
  if ('ResizeObserver' in w) new ResizeObserver(resize).observe(canvas);
  else w.addEventListener('resize', resize, { passive: true });
  resize();

  const onReady = () => {
    ready = true;
    renderOnce();
    canvas.classList.add('is-ready');
    PBS.onReveal((time) => {
      // if the scene arrived late, emerge from now rather than jumping in
      revealAt = Math.max(time, performance.now() - 120);
      if (reduce) renderOnce();
      update();
    });
  };
  const compiled = renderer.compileAsync ? renderer.compileAsync(scene, camera) : Promise.resolve(renderer.compile(scene, camera));
  compiled.then(onReady, onReady);
}
