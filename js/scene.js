// Cenário: quiosque de praia ao entardecer, mesa redonda com a bandeja de mar (água animada),
// peças de praia/floresta/montanha/rochedo, cabanas, saquinho e os adversários em volta.
import * as THREE from '../vendor/three/three.module.js';
import { HEIGHT } from './rules.js';
import { DIRS, hexToXZ } from './hex.js';

export const S = 0.038;          // lado do hexágono (m): peça de ~6,6 cm de largura
export const U = 0.011;          // altura de um nível (praia = 1, floresta = 2, montanha = 3, rochedo = 4)
export const TABLE_H = 0.8;      // altura da mesa (PC; no VR acompanha a altura de quem joga)
export const TABLE_R = 0.64;
export const WATER0 = 0.45;      // maré baixa: água a 0,45 nível (a praia fica de fora)
export const waterY = (tide) => (WATER0 + tide) * U;

export const COLORS = {
  P: { top: 0xf2d79b, side: 0xd7b77a },
  F: { top: 0x4f9a3e, side: 0x7a5a36 },
  M: { top: 0x8d8a7c, side: 0x6c665a },
  R: { top: 0x5f646d, side: 0x4b5058 },
};
export const PLAYER_COLOR = 0xff6a3d;

const rnd = (seed) => { let s = seed >>> 0 || 1; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; };

// ---------- Geometria com cor por vértice, juntada numa só (1 desenho por peça) ----------
function paint(geo, colorFn) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.computeVertexNormals();
  const pos = g.attributes.position, nor = g.attributes.normal;
  const col = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    c.set(colorFn(nor.getY(i), pos.getY(i), i));
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'color'].includes(k)) g.deleteAttribute(k);
  return g;
}
function merge(geos) {
  let n = 0;
  for (const g of geos) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3);
  let o = 0;
  for (const g of geos) {
    pos.set(g.attributes.position.array, o * 3);
    nor.set(g.attributes.normal.array, o * 3);
    col.set(g.attributes.color.array, o * 3);
    o += g.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.computeBoundingSphere();
  return out;
}
const solid = (geo, color) => paint(geo, () => color);
function jitter(geo, amt, rand) {
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    if (p.getY(i) <= 1e-4) continue;
    p.setXYZ(i, p.getX(i) + (rand() - 0.5) * amt, p.getY(i) + (rand() - 0.5) * amt * 0.6, p.getZ(i) + (rand() - 0.5) * amt);
  }
  return geo;
}

// Peça de uma casa (com o centro da casa na origem e a base em y = 0).
const tileCache = new Map();
export function tileGeometry(t, variant = 0) {
  const key = t + variant;
  if (tileCache.has(key)) return tileCache.get(key);
  const h = HEIGHT[t] * U;
  const col = COLORS[t];
  const rand = rnd(17 + variant * 31 + t.charCodeAt(0));
  const parts = [];
  const prism = new THREE.CylinderGeometry(S * 0.955, S * 0.975, h, 6, 1).translate(0, h / 2, 0);
  const sideDark = new THREE.Color(col.side).multiplyScalar(0.8).getHex();
  parts.push(paint(prism, (ny, y) => ny > 0.9 ? col.top : (y < h * 0.4 ? sideDark : col.side)));
  if (t === 'P') {
    // conchas e, em algumas, um coqueiro
    for (let k = 0; k < 3; k++) {
      const a = rand() * 6.28, r = S * (0.3 + rand() * 0.4);
      parts.push(solid(new THREE.SphereGeometry(0.0028, 5, 3).scale(1, 0.5, 1).translate(Math.cos(a) * r, h, Math.sin(a) * r), 0xfff4e8));
    }
    if (variant !== 1) {
      const lean = (rand() - 0.5) * 0.5;
      const bx = S * 0.42, bz = -S * 0.3;
      const top = new THREE.Vector3(bx + Math.sin(lean) * 0.012, h + 0.04, bz);
      const trunk = new THREE.CylinderGeometry(0.0018, 0.0028, 0.042, 5).translate(0, 0.021, 0);
      trunk.rotateZ(-lean);
      parts.push(solid(trunk.translate(bx, h, bz), 0x8a6238));
      for (let k = 0; k < 5; k++) {
        const a = k * 1.26 + rand() * 0.3;
        const leaf = new THREE.ConeGeometry(0.004, 0.026, 3).rotateZ(-Math.PI / 2 - 0.5).translate(0.012, -0.004, 0).rotateY(a);
        parts.push(solid(leaf.translate(top.x, top.y, top.z), k % 2 ? 0x3e8a35 : 0x56a640));
      }
    }
  } else if (t === 'F') {
    // árvores na beirada: o meio fica livre para a cabana
    const spots = [[0.5, 0.18], [-0.5, 0.38], [-0.1, -0.62], [0.52, -0.36]];
    for (const [sx, sz] of spots.slice(0, 3 + (variant % 2))) {
      const th = 0.022 + rand() * 0.012, x = sx * S + (rand() - 0.5) * 0.006, z = sz * S + (rand() - 0.5) * 0.006;
      parts.push(solid(new THREE.CylinderGeometry(0.0016, 0.002, 0.006, 4).translate(x, h + 0.003, z), 0x6b4a2a));
      parts.push(solid(new THREE.ConeGeometry(0.0085 + rand() * 0.003, th, 6).translate(x, h + 0.005 + th / 2, z), rand() < 0.5 ? 0x2f7a32 : 0x3a8c3a));
    }
  } else if (t === 'M') {
    const mh = 0.034 + variant * 0.006;
    const cone = jitter(new THREE.ConeGeometry(S * 0.78, mh, 7, 3).translate(0, h + mh / 2, 0), 0.006, rand);
    parts.push(paint(cone, (ny, y) => (y > h + mh * 0.72 ? 0xf4f6f8 : y > h + mh * 0.35 ? 0x8f8a80 : 0x6f8a52)));
  } else if (t === 'R') {
    for (let k = 0; k < 3; k++) {
      const a = k * 2.1 + rand(), r = S * 0.32;
      const rock = jitter(new THREE.DodecahedronGeometry(0.011 + rand() * 0.006, 0), 0.004, rand).translate(Math.cos(a) * r, h + 0.004, Math.sin(a) * r);
      parts.push(solid(rock, k ? 0x666b74 : 0x585d66));
    }
  }
  const geo = merge(parts);
  tileCache.set(key, geo);
  return geo;
}

export const tileMat = new THREE.MeshLambertMaterial({ vertexColors: true });

export function makeTile(t, variant = 0) {
  const m = new THREE.Mesh(tileGeometry(t, variant), tileMat);
  m.userData.t = t;
  return m;
}

// Peça inteira (1 ou 2 casas) num grupo: o centro do grupo é o meio da peça; a segunda casa
// fica na direção do giro (rot 0 = +x). rotation.y = rot × 60°.
export function makePieceGroup(piece) {
  const g = new THREE.Group();
  const [dx, dz] = hexToXZ(DIRS[0][0], DIRS[0][1], S);
  piece.t.forEach((t, i) => {
    const m = makeTile(t, (piece.id + i) % 3);
    if (piece.t.length > 1) m.position.set(i ? dx / 2 : -dx / 2, 0, 0);
    g.add(m);
  });
  g.userData.piece = piece;
  return g;
}

// Cabana: paredes claras e telhado na cor do jogador.
const wallGeo = merge([
  solid(new THREE.BoxGeometry(0.017, 0.013, 0.015).translate(0, 0.0065, 0), 0xf3e6cf),
  solid(new THREE.BoxGeometry(0.005, 0.008, 0.001).translate(0, 0.004, 0.0078), 0x5a3a22),
]);
const roofGeo = new THREE.ConeGeometry(0.0145, 0.012, 4).rotateY(Math.PI / 4).translate(0, 0.019, 0);
const wallMat = new THREE.MeshLambertMaterial({ vertexColors: true });
const roofMats = new Map();
export function roofMat(color) {
  if (!roofMats.has(color)) roofMats.set(color, new THREE.MeshLambertMaterial({ color }));
  return roofMats.get(color);
}
export function makeCabin(color) {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(wallGeo, wallMat), new THREE.Mesh(roofGeo, roofMat(color)));
  return g;
}

// ---------- Água ----------
const WATER_VS = `
uniform float uTime; uniform float uScale; uniform float uAmp;
varying vec3 vPos; varying vec3 vN;
float h(vec2 p) {
  return sin(p.x * 1.7 + uTime * 1.1) * 0.5 + sin(p.y * 2.3 - uTime * 0.9) * 0.35 + sin((p.x + p.y) * 3.1 + uTime * 1.7) * 0.2 + sin((p.x - p.y * 0.7) * 5.3 - uTime * 2.3) * 0.08;
}
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vec2 p = wp.xz * uScale;
  float e = 0.05;
  float y0 = h(p);
  wp.y += y0 * uAmp;
  vN = normalize(vec3(-(h(p + vec2(e, 0.0)) - y0) / e * uAmp * uScale * 1.8, 1.0, -(h(p + vec2(0.0, e)) - y0) / e * uAmp * uScale * 1.8));
  vPos = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;
const WATER_FS = `
uniform vec3 uDeep; uniform vec3 uShallow; uniform vec3 uSun; uniform vec3 uSunCol; uniform vec3 uSky; uniform float uAlpha; uniform float uTime;
varying vec3 vPos; varying vec3 vN;
void main() {
  vec3 n = normalize(vN);
  vec3 v = normalize(cameraPosition - vPos);
  float fres = pow(1.0 - max(dot(n, v), 0.0), 3.0);
  vec3 r = reflect(-v, n);
  float spec = pow(max(dot(r, normalize(uSun)), 0.0), 90.0);
  float sparkle = pow(max(dot(r, normalize(uSun + vec3(0.2, 0.0, 0.1))), 0.0), 400.0) * 2.0;
  float ca = sin(vPos.x * 90.0 + uTime * 1.3) * sin(vPos.z * 80.0 - uTime * 1.1);
  vec3 col = mix(uShallow, uDeep, clamp(0.35 + n.x * 3.0 + ca * 0.08, 0.0, 1.0));
  col = mix(col, uSky, fres * 0.6) + uSunCol * (spec * 0.9 + sparkle);
  gl_FragColor = vec4(col, uAlpha + fres * 0.25 + spec * 0.3);
  #include <colorspace_fragment>
}`;
export function waterMaterial({ deep, shallow, alpha, scale, amp }) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 }, uScale: { value: scale }, uAmp: { value: amp },
      uDeep: { value: new THREE.Color(deep) }, uShallow: { value: new THREE.Color(shallow) },
      uSun: { value: new THREE.Vector3(-0.5, 0.35, -0.8) }, uSunCol: { value: new THREE.Color(0xffd7a0) },
      uSky: { value: new THREE.Color(0xf6b98a) }, uAlpha: { value: alpha },
    },
    vertexShader: WATER_VS, fragmentShader: WATER_FS, transparent: alpha < 1, depthWrite: alpha >= 1,
  });
}

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Hexágono grande (o contorno do tabuleiro): vértices nos ângulos 0, 60°, ... (ponta em +x).
function bigHexShape(R) {
  const sh = new THREE.Shape();
  for (let i = 0; i < 6; i++) {
    const a = i * Math.PI / 3;
    if (i) sh.lineTo(Math.cos(a) * R, Math.sin(a) * R); else sh.moveTo(R, 0);
  }
  sh.closePath();
  return sh;
}
export const boardOuterR = (radius) => ((1.5 * radius + 1) * S) / Math.cos(Math.PI / 6) + 0.006;

// ---------- Mundo ----------
export function buildWorld(renderer) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf0a878);
  scene.fog = new THREE.Fog(0xf0b08a, 30, 260);

  // céu: gradiente do pôr do sol numa esfera
  const skyTex = canvasTex(8, 256, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, '#3a4f8a'); gr.addColorStop(0.35, '#a874a0'); gr.addColorStop(0.48, '#f49a6c'); gr.addColorStop(0.52, '#ffcf8e'); gr.addColorStop(1, '#ffd9a8');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(400, 24, 12), new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false, depthWrite: false }));
  scene.add(sky);
  const sun = new THREE.Mesh(new THREE.CircleGeometry(14, 32), new THREE.MeshBasicMaterial({ color: 0xffe2a8, fog: false }));
  sun.position.set(-160, 26, -300); sun.lookAt(0, 0, 0);
  scene.add(sun);

  scene.add(new THREE.HemisphereLight(0xffe6cc, 0x6a7a90, 1.35));
  const key = new THREE.DirectionalLight(0xffe0b8, 1.9);
  key.position.set(-1.2, 2.4, 0.6);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0x9fc4ff, 0.35);
  fill.position.set(1.5, 1.0, -1.0);
  scene.add(fill);

  // mar aberto em volta e areia
  const ocean = new THREE.Mesh(new THREE.PlaneGeometry(700, 700, 60, 60).rotateX(-Math.PI / 2),
    waterMaterial({ deep: 0x1d5a7a, shallow: 0x3aa0a8, alpha: 1, scale: 0.35, amp: 0.25 }));
  ocean.position.set(0, -0.6, -60);
  scene.add(ocean);
  const sandTex = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#e8cf9a'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 2500; i++) { g.fillStyle = `rgba(${150 + Math.random() * 90},${120 + Math.random() * 70},80,0.18)`; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
  });
  sandTex.wrapS = sandTex.wrapT = THREE.RepeatWrapping; sandTex.repeat.set(30, 30);
  const sand = new THREE.Mesh(new THREE.CircleGeometry(40, 48).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ map: sandTex }));
  sand.position.set(0, -0.08, 8);
  scene.add(sand);

  // deque de madeira do quiosque
  const plankTex = canvasTex(256, 256, (g, w, h) => {
    for (let i = 0; i < 8; i++) {
      const v = 120 + Math.floor(Math.random() * 30);
      g.fillStyle = `rgb(${v + 40},${v - 5},${v - 50})`; g.fillRect(0, i * 32, w, 31);
      g.fillStyle = 'rgba(60,30,10,0.5)'; g.fillRect(0, i * 32 + 31, w, 1);
      for (let k = 0; k < 40; k++) { g.fillStyle = 'rgba(80,45,20,0.12)'; g.fillRect(Math.random() * w, i * 32 + Math.random() * 30, 20 + Math.random() * 40, 1); }
    }
  });
  plankTex.wrapS = plankTex.wrapT = THREE.RepeatWrapping; plankTex.repeat.set(3, 3);
  const deck = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 4.2, 0.12, 8), new THREE.MeshLambertMaterial({ map: plankTex }));
  deck.position.y = -0.06;
  scene.add(deck);
  // postes e telhado de palha
  const wood = new THREE.MeshLambertMaterial({ color: 0x7a5232 });
  for (let i = 0; i < 6; i++) {
    const a = i * Math.PI / 3 + Math.PI / 6;
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 3.0, 8), wood);
    post.position.set(Math.cos(a) * 3.7, 1.5, Math.sin(a) * 3.7);
    scene.add(post);
  }
  const strawTex = canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = '#b68a4c'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 400; i++) { g.strokeStyle = `rgba(${90 + Math.random() * 80},${60 + Math.random() * 50},20,0.5)`; g.beginPath(); const x = Math.random() * w; g.moveTo(x, Math.random() * h); g.lineTo(x + (Math.random() - 0.5) * 6, Math.random() * h); g.stroke(); }
  });
  strawTex.wrapS = strawTex.wrapT = THREE.RepeatWrapping; strawTex.repeat.set(6, 2);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(5.0, 1.6, 6, 1, true), new THREE.MeshLambertMaterial({ map: strawTex, side: THREE.DoubleSide }));
  roof.position.y = 3.6; roof.rotation.y = Math.PI / 6;
  scene.add(roof);
  // lampiões
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xffc46a });
  for (let i = 0; i < 6; i++) {
    const a = i * Math.PI / 3 + Math.PI / 6;
    const l = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), lampMat);
    l.position.set(Math.cos(a) * 3.55, 2.55, Math.sin(a) * 3.55);
    scene.add(l);
  }
  const lampLight = new THREE.PointLight(0xffb060, 1.2, 6, 1.5);
  lampLight.position.set(0, 2.6, 0);
  scene.add(lampLight);
  // coqueiros na areia
  const palmTrunk = new THREE.MeshLambertMaterial({ color: 0x8a6440 }), palmLeaf = new THREE.MeshLambertMaterial({ color: 0x3f7f34, side: THREE.DoubleSide });
  const rp = rnd(5);
  for (let i = 0; i < 9; i++) {
    const a = -0.4 + i * 0.55 + rp() * 0.3, d = 6.5 + rp() * 6;
    const p = new THREE.Group();
    const hgt = 4 + rp() * 2.5;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.17, hgt, 7).translate(0, hgt / 2, 0), palmTrunk);
    trunk.rotation.z = (rp() - 0.5) * 0.3;
    p.add(trunk);
    for (let k = 0; k < 7; k++) {
      const leaf = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 2.4).translate(0, 1.2, 0), palmLeaf);
      leaf.position.set(-Math.sin(trunk.rotation.z) * hgt, hgt * Math.cos(trunk.rotation.z), 0);
      leaf.rotation.set(1.0 + rp() * 0.4, k * 0.9, 0, 'YXZ');
      p.add(leaf);
    }
    p.position.set(Math.sin(a) * d, -0.08, Math.cos(a) * d);
    scene.add(p);
  }

  // mesa
  const stage = new THREE.Group();
  scene.add(stage);
  const tableWood = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#9a6a3e'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 90; i++) { g.strokeStyle = `rgba(70,40,15,${0.08 + Math.random() * 0.12})`; g.lineWidth = 1 + Math.random() * 2; g.beginPath(); g.arc(w / 2, h / 2, Math.random() * w * 0.7, 0, 6.3); g.stroke(); }
  });
  const table = new THREE.Mesh(new THREE.CylinderGeometry(TABLE_R, TABLE_R, 0.04, 48), new THREE.MeshLambertMaterial({ map: tableWood }));
  table.position.y = -0.02;
  const legs = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 1.0, 10).translate(0, -0.5, 0), wood);
  const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.36, 0.04, 20), wood);
  const tableGroup = new THREE.Group();
  tableGroup.add(table, legs, foot);
  stage.add(tableGroup);
  const board = new THREE.Group();
  board.position.y = 0.003;
  tableGroup.add(board);

  const waterMat = waterMaterial({ deep: 0x0f6f86, shallow: 0x48c6c0, alpha: 0.72, scale: 40, amp: 0.0012 });
  const shared = { scene, stage, tableGroup, table, legs, foot, board, waterMat, ocean, sky, tray: null };

  // tabuleiro (bandeja hexagonal com fundo de areia e água) — refeito por mapa
  shared.setBoard = (map) => {
    if (shared.tray) { board.remove(shared.tray); shared.tray.traverse(o => o.geometry?.dispose()); }
    const tray = new THREE.Group();
    const Ro = boardOuterR(map.radius);
    const floorTex = canvasTex(512, 512, (g, w, h) => {
      const gr = g.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, w / 2);
      gr.addColorStop(0, '#5fb8b0'); gr.addColorStop(1, '#2f7f88');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 1600; i++) { g.fillStyle = `rgba(${200 + Math.random() * 55},${210 + Math.random() * 40},170,${0.05 + Math.random() * 0.08})`; g.beginPath(); g.arc(Math.random() * w, Math.random() * h, 1 + Math.random() * 3, 0, 6.3); g.fill(); }
      // corais: manchas rosadas
      const toPx = (q, r) => { const [x, z] = hexToXZ(q, r, S); return [w / 2 + x / (2 * Ro) * w, h / 2 + z / (2 * Ro) * h]; };
      for (const [q, r] of map.reefs || []) {
        const [px, pz] = toPx(q, r);
        for (let k = 0; k < 14; k++) { g.fillStyle = ['#ff8a7a', '#ffb07a', '#e86a9a'][k % 3]; g.beginPath(); g.arc(px + (Math.random() - 0.5) * 34, pz + (Math.random() - 0.5) * 34, 4 + Math.random() * 6, 0, 6.3); g.fill(); }
      }
      // grade bem fraquinha para ajudar a encaixar
      g.strokeStyle = 'rgba(255,255,255,0.13)'; g.lineWidth = 1.5;
      for (const [q, r] of map.cells) {
        const [px, pz] = toPx(q, r), rr = S / (2 * Ro) * w * 0.97;
        g.beginPath();
        for (let i = 0; i < 6; i++) { const a = Math.PI / 6 + i * Math.PI / 3; const x = px + Math.cos(a) * rr, y = pz + Math.sin(a) * rr; if (i) g.lineTo(x, y); else g.moveTo(x, y); }
        g.closePath(); g.stroke();
      }
    });
    const floor = new THREE.Mesh(new THREE.ShapeGeometry(bigHexShape(Ro)), new THREE.MeshLambertMaterial({ map: floorTex }));
    // a forma está no plano xy; deitada fica no xz com y do desenho = +z
    floor.rotation.x = Math.PI / 2;
    floor.scale.y = 1;
    { const uv = floor.geometry.attributes.uv, p = floor.geometry.attributes.position; for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / (2 * Ro) + 0.5, 1 - (p.getY(i) / (2 * Ro) + 0.5)); }
    floor.material.side = THREE.DoubleSide;
    floor.position.y = 0.0005;
    tray.add(floor);
    // corais de verdade (pequenos, embaixo d'água)
    const coralMat = new THREE.MeshLambertMaterial({ color: 0xff8f80 });
    for (const [q, r] of map.reefs || []) {
      const [x, z] = hexToXZ(q, r, S);
      for (let k = 0; k < 3; k++) {
        const c = new THREE.Mesh(new THREE.ConeGeometry(0.006, 0.0035, 5), coralMat);
        c.position.set(x + (k - 1) * 0.012, 0.002, z + ((k * 7) % 3 - 1) * 0.01);
        tray.add(c);
      }
    }
    // moldura de madeira
    const frameShape = bigHexShape(Ro + 0.03);
    frameShape.holes.push(bigHexShape(Ro));
    const frame = new THREE.Mesh(new THREE.ExtrudeGeometry(frameShape, { depth: 4.6 * U, bevelEnabled: false }), new THREE.MeshLambertMaterial({ color: 0x6e4526 }));
    frame.rotation.x = -Math.PI / 2;
    tray.add(frame);
    // água
    const water = new THREE.Mesh(new THREE.ShapeGeometry(bigHexShape(Ro), 1), waterMat);
    water.rotation.x = -Math.PI / 2;
    water.renderOrder = 2;
    tray.add(water);
    shared.water = water;
    // régua da maré num canto da moldura
    const gauge = new THREE.Group();
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.012, 5.5 * U, 0.012).translate(0, 2.75 * U, 0), new THREE.MeshLambertMaterial({ color: 0xf2efe6 }));
    gauge.add(post);
    for (const [lvl, c] of [[1, COLORS.P.top], [2, COLORS.F.top], [3, COLORS.M.top]]) {
      const band = new THREE.Mesh(new THREE.BoxGeometry(0.0135, 0.0016, 0.0135), new THREE.MeshBasicMaterial({ color: c }));
      band.position.y = lvl * U;
      gauge.add(band);
    }
    const a = Math.PI * 4 / 3;
    gauge.position.set(Math.cos(a) * (Ro + 0.015), 4.6 * U, -Math.sin(a) * (Ro + 0.015));
    tray.add(gauge);
    board.add(tray);
    shared.tray = tray;
    shared.outerR = Ro;
  };

  shared.update = (t) => {
    waterMat.uniforms.uTime.value = t;
    ocean.material.uniforms.uTime.value = t * 0.6;
  };
  return shared;
}

// ---------- Saquinho de pano ----------
export function makeBag() {
  const pts = [];
  for (let i = 0; i <= 12; i++) {
    const y = i / 12;
    const r = 0.055 * Math.sin(Math.PI * Math.min(1, y * 1.15)) * (1 - 0.45 * y * y) + 0.012 + (y > 0.85 ? (y - 0.85) * 0.25 : 0);
    pts.push(new THREE.Vector2(Math.max(0.004, r), y * 0.11));
  }
  const clothTex = canvasTex(64, 64, (g, w, h) => {
    g.fillStyle = '#c0573e'; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(255,230,190,0.5)'; g.lineWidth = 3;
    for (let i = 0; i < w; i += 16) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, h); g.stroke(); }
  });
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.LatheGeometry(pts, 16), new THREE.MeshLambertMaterial({ map: clothTex, side: THREE.DoubleSide }));
  const cord = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.003, 6, 20).rotateX(Math.PI / 2).translate(0, 0.093, 0), new THREE.MeshLambertMaterial({ color: 0xf2e2b8 }));
  const mouth = new THREE.Mesh(new THREE.CircleGeometry(0.028, 16).rotateX(-Math.PI / 2).translate(0, 0.1, 0), new THREE.MeshBasicMaterial({ color: 0x2a120a }));
  g.add(body, cord, mouth);
  return g;
}

// ---------- Adversários: bonecos simples com chapéu ----------
export function makeCharacter(opp) {
  const g = new THREE.Group();
  const skin = new THREE.MeshLambertMaterial({ color: opp.skin ?? 0xd9a27a });
  const cloth = new THREE.MeshLambertMaterial({ color: opp.color });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 0.62, 14).translate(0, 0.31, 0), cloth);
  const shoulders = new THREE.Mesh(new THREE.SphereGeometry(0.16, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 0.62, 0), cloth);
  const head = new THREE.Group();
  head.position.y = 0.86;
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.13, 18, 12), skin);
  const eyeM = new THREE.MeshBasicMaterial({ color: 0x1a1a1a });
  for (const sx of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.017, 8, 6), eyeM);
    eye.position.set(sx * 0.045, 0.02, 0.118);
    head.add(eye);
  }
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 6), skin);
  nose.position.set(0, -0.015, 0.13);
  head.add(skull, nose);
  if (opp.hat === 'quepe') {
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.135, 0.13, 0.07, 16), new THREE.MeshLambertMaterial({ color: 0xf6f6f6 }));
    top.position.y = 0.1;
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.012, 16, 1, false, -Math.PI / 2, Math.PI), new THREE.MeshLambertMaterial({ color: 0x1b2a44 }));
    brim.position.set(0, 0.07, 0.1);
    const badge = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffcf4a }));
    badge.position.set(0, 0.1, 0.13);
    head.add(top, brim, badge);
  } else if (opp.hat === 'bandana') {
    const band = new THREE.Mesh(new THREE.SphereGeometry(0.136, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2.4), new THREE.MeshLambertMaterial({ color: 0xd8333a }));
    band.position.y = 0.01;
    const knot = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.08, 6).rotateX(-Math.PI / 2.5), band.material);
    knot.position.set(0, 0.04, -0.14);
    const fin = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.09, 4).scale(0.35, 1, 1), new THREE.MeshLambertMaterial({ color: 0x7a8aa0 }));
    fin.position.set(0, 0.16, -0.02);
    head.add(band, knot, fin);
  } else {
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.012, 20), new THREE.MeshLambertMaterial({ color: 0xe8d39a }));
    brim.position.y = 0.06;
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.09, 16), brim.material);
    crown.position.y = 0.105;
    const flower = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), new THREE.MeshLambertMaterial({ color: 0xff7aa8 }));
    flower.position.set(0.1, 0.09, 0.05);
    head.add(brim, crown, flower);
    // óculos de vó
    const glass = new THREE.Mesh(new THREE.TorusGeometry(0.026, 0.004, 6, 14), new THREE.MeshBasicMaterial({ color: 0x3a2a1a }));
    for (const sx of [-1, 1]) { const gl = glass.clone(); gl.position.set(sx * 0.045, 0.02, 0.122); head.add(gl); }
  }
  // braços (apoiados na mesa)
  const armGeo = new THREE.CylinderGeometry(0.04, 0.045, 0.42, 8).translate(0, -0.21, 0);
  const arms = [];
  for (const sx of [-1, 1]) {
    const arm = new THREE.Mesh(armGeo, cloth);
    arm.position.set(sx * 0.19, 0.6, 0.02);
    arm.rotation.x = -1.0;
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), skin);
    hand.position.y = -0.44;
    arm.add(hand);
    g.add(arm);
    arms.push(arm);
  }
  g.add(body, shoulders, head);
  g.userData = { head, arms };
  return g;
}
