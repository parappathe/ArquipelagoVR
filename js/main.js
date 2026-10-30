// Liga as regras e a IA à mesa 3D, ao Quest (controles e mãos) e ao mouse/teclado.
import * as THREE from '../vendor/three/three.module.js';
import { Game, HEIGHT, TNAME_PL, pieceCells, rng } from './rules.js';
import { MAPS } from './maps.js';
import { OPPONENTS, ROBOT, chooseMoveGen } from './ai.js';
import { K, unK, DIRS, hexToXZ, xzToHex } from './hex.js';
import { buildWorld, makePieceGroup, makeTile, makeCabin, makeBag, makeCharacter, S, U, TABLE_H, waterY, PLAYER_COLOR, COLORS } from './scene.js';
import { Panel, Label } from './ui.js';
import { Sfx } from './audio.js';
import { loadSave, storeSave } from './save.js';

const save = loadSave();
const sfx = new Sfx();
sfx.on = save.sound;
const IS_QUEST = /OculusBrowser|Quest/i.test(navigator.userAgent);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const damp = (k, dt) => 1 - Math.exp(-k * dt);
const ease = (t) => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
const hex6 = (c) => '#' + c.toString(16).padStart(6, '0');

const STAGE_Z = -0.75;        // centro da mesa em relação a quem joga
const TRAY_R = 0.545;         // distância das bandejas de cada jogador ao centro
const SLOT_X = [-0.075, 0.075];
const PILE_X = 0.205, BAG_X = -0.235;
const THINK_MIN = 0.8;        // a IA "pensa" pelo menos isto (s), para dar para acompanhar
const THINK_BUDGET = IS_QUEST ? 4 : 7;   // ms por quadro para a IA pensar
const SEAT_A = { 2: [0, Math.PI], 3: [0, Math.PI * 0.68, -Math.PI * 0.68] };

// ---------- Render e cena ----------
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: !IS_QUEST });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, IS_QUEST ? 1 : 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local-floor');
renderer.xr.setFoveation?.(1);
document.getElementById('app').appendChild(renderer.domElement);

const world = buildWorld(renderer);
const { scene, stage, board } = world;
stage.position.set(0, TABLE_H, STAGE_Z);
const rig = new THREE.Group();
scene.add(rig);
const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.03, 900);
rig.add(camera);
const raycaster = new THREE.Raycaster();
const _v = new THREE.Vector3(), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3();
const BOARD_PLANE_Y = 3.4 * U;     // altura onde o mouse/laser "toca" o tabuleiro

function setTableHeight(h) {
  stage.position.y = h;
  world.legs.scale.y = h;
  world.foot.position.y = -h + 0.02;
}
setTableHeight(TABLE_H);

const panel = new Panel(0.9);
panel.mesh.visible = false;
scene.add(panel.mesh);
const fpsLabel = new Label(0.12);
fpsLabel.mesh.position.set(0.16, -0.14, -0.6);
fpsLabel.mesh.visible = false;
camera.add(fpsLabel.mesh);
// placas do VR: placar à esquerda da mesa, recado à direita, botão "sem cabana" na bandeja
const scoreSign = new Label(0.46, 768, 420);
scoreSign.mesh.position.set(-0.78, 0.42, 0.05);
scoreSign.mesh.rotation.set(-0.15, 0.75, 0);
scoreSign.mesh.material.depthTest = true;
stage.add(scoreSign.mesh);
const infoSign = new Label(0.42, 768, 300);
infoSign.mesh.position.set(0.78, 0.36, 0.05);
infoSign.mesh.rotation.set(-0.15, -0.75, 0);
infoSign.mesh.material.depthTest = true;
stage.add(infoSign.mesh);
const noCabinBtn = new Label(0.15, 384, 128);
noCabinBtn.bg = 'rgba(120,50,30,0.92)';
noCabinBtn.set([{ text: 'Sem cabana', size: 0.6 }]);
noCabinBtn.mesh.position.set(0, 0.045, TRAY_R + 0.085);
noCabinBtn.mesh.rotation.x = -0.9;
noCabinBtn.mesh.material.depthTest = true;
noCabinBtn.mesh.visible = false;
board.add(noCabinBtn.mesh);

// ---------- Estado ----------
let app = 'menu';          // menu | playing | paused | over
let game = null;
let mapIndex = save.map;
let seats = [];            // [{ name, color, style, opp, figure, label }]
let handViews = [];        // por jogador: Map(id da peça → { group, held, flying })
let cellViews = new Map(); // K → mesh da casa
let cabinViews = new Map();// K → grupo da cabana
let pileViews = [];        // por jogador: grupo com as cabanas que sobram
let trays = [];            // por jogador: grupo da bandeja (posição/rotação do lugar)
let bag = null;
let lastEvent = 0;
let tideShown = 0;         // nível da água na tela (anima)
let tideTarget = 0;
let thinker = null;        // { gen, t, move }
let seq = [];              // tarefas em fila: { start?, update(dt) → true quando acabou }
let fx = [];               // animações soltas (não seguram o jogo)
let time = 0;
let resultShown = false;
let toast = { text: '', t: 0 };
let fast = false;          // dev.advance: sem esperas
let aiRand = rng(Date.now() % 100000);
const dev = { autoplay: false };

// Botões e eixos do controle (para os testes poderem simular)
const ctrls = [];
const holds = {};          // fonte ('mouse' | 'left' | 'right') → segurando
const ghost = new THREE.Group();
board.add(ghost);
const ghostMats = { ok: new THREE.MeshBasicMaterial({ color: 0x5dff9a, transparent: true, opacity: 0.45, depthWrite: false }), bad: new THREE.MeshBasicMaterial({ color: 0xff5a4a, transparent: true, opacity: 0.45, depthWrite: false }) };
const ghostGeo = new THREE.CylinderGeometry(S * 0.96, S * 0.96, 0.004, 6).translate(0, 0.002, 0);
const ghostCells = [new THREE.Mesh(ghostGeo, ghostMats.ok), new THREE.Mesh(ghostGeo, ghostMats.ok)];
ghost.add(...ghostCells);
ghost.visible = false;
const ringGeo = new THREE.RingGeometry(S * 0.62, S * 0.9, 6, 1).rotateX(-Math.PI / 2).rotateY(Math.PI / 6);
const targetRings = [0, 1].map(() => {
  const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: PLAYER_COLOR, transparent: true, opacity: 0.9, depthWrite: false, depthTest: false }));
  m.renderOrder = 6; m.visible = false; board.add(m); return m;
});

// setas balançando em cima das casas onde a cabana pode ir
const targetArrows = [0, 1].map(() => {
  const m = new THREE.Mesh(new THREE.ConeGeometry(0.011, 0.024, 4).rotateX(Math.PI), new THREE.MeshBasicMaterial({ color: PLAYER_COLOR }));
  m.visible = false; board.add(m); return m;
});

// Contorno das ilhas na linha d'água: cor do dono, espuma branca se ninguém manda nela.
const MAX_RINGS = 200;
const foam = new THREE.InstancedMesh(new THREE.RingGeometry(S * 0.93, S * 1.12, 6, 1).rotateX(-Math.PI / 2).rotateY(Math.PI / 6),
  new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.7, depthWrite: false }), MAX_RINGS);
foam.count = 0;
foam.renderOrder = 3;
foam.frustumCulled = false;
board.add(foam);
const _m4 = new THREE.Matrix4(), _col = new THREE.Color();

// ---------- Posições ----------
const cellXZ = (q, r) => hexToXZ(q, r, S);
function trayPoint(p, x, y = 0, z = 0) {
  const a = seatAngle(p);
  const lx = x, lz = TRAY_R + z;
  return new THREE.Vector3(lx * Math.cos(a) + lz * Math.sin(a), y, -lx * Math.sin(a) + lz * Math.cos(a));
}
function seatAngle(p) { return (SEAT_A[game?.n ?? 2] || SEAT_A[2])[p] ?? 0; }
const slotPos = (p, i) => trayPoint(p, SLOT_X[i] ?? 0, 0.004);
const bagPos = () => trayPoint(0, BAG_X, 0.1);
const pilePos = (p) => trayPoint(p, PILE_X, 0.004);
// centro (no tabuleiro) de uma peça com a primeira casa em (q, r) e giro rot
function pieceCenter(piece, q, r, rot) {
  const [x, z] = cellXZ(q, r);
  if (piece.t.length < 2) return new THREE.Vector3(x, 0, z);
  const d = DIRS[((rot % 6) + 6) % 6];
  const [dx, dz] = cellXZ(d[0], d[1]);
  return new THREE.Vector3(x + dx / 2, 0, z + dz / 2);
}
// primeira casa de uma peça cujo centro está no ponto (x, z) do tabuleiro
function anchorAt(piece, x, z, rot) {
  if (piece.t.length < 2) return xzToHex(x, z, S);
  const d = DIRS[((rot % 6) + 6) % 6];
  const [dx, dz] = cellXZ(d[0], d[1]);
  return xzToHex(x - dx / 2, z - dz / 2, S);
}

// ---------- Montagem da partida ----------
function clearTable() {
  for (const v of cellViews.values()) board.remove(v);
  for (const v of cabinViews.values()) board.remove(v);
  for (const hv of handViews) for (const e of hv.values()) board.remove(e.group);
  for (const t of trays) board.remove(t);
  for (const s of seats) { if (s.figure) stage.remove(s.figure); }
  for (const p of pileViews) board.remove(p);
  for (const f of fx) f.cleanup?.();
  if (bag) board.remove(bag);
  cellViews = new Map(); cabinViews = new Map(); handViews = []; trays = []; seats = []; pileViews = []; fx = []; seq = [];
  ghost.visible = false;
  targetRings.forEach(r => { r.visible = false; });
  for (const k of Object.keys(holds)) delete holds[k];
}

function setupTable(g, seatDefs) {
  clearTable();
  game = g;
  world.setBoard(g.map);
  lastEvent = g.events.length;
  thinker = null;
  resultShown = false;
  tideShown = tideTarget = g.tideNow();
  seats = seatDefs.map((s, p) => ({ ...s, idx: p }));
  for (let p = 0; p < g.n; p++) {
    const tray = new THREE.Group();
    const a = seatAngle(p);
    const plank = new THREE.Mesh(new THREE.BoxGeometry(0.29, 0.006, 0.105), new THREE.MeshLambertMaterial({ color: 0x5a3820 }));
    plank.position.y = 0.003;
    const strip = new THREE.Mesh(new THREE.BoxGeometry(0.29, 0.0065, 0.008), new THREE.MeshLambertMaterial({ color: seats[p].color }));
    strip.position.set(0, 0.0035, 0.05);
    tray.add(plank, strip);
    tray.position.copy(trayPoint(p, 0, 0));
    tray.rotation.y = a;
    board.add(tray);
    trays.push(tray);
    handViews.push(new Map());
    const pile = new THREE.Group();
    pile.position.copy(pilePos(p));
    pile.rotation.y = a;
    board.add(pile);
    pileViews.push(pile);
    if (p > 0) {
      const fig = makeCharacter(seats[p].opp);
      const r = 0.95;
      fig.position.set(Math.sin(a) * r, -0.58, Math.cos(a) * r);
      fig.rotation.y = a + Math.PI;
      stage.add(fig);
      seats[p].figure = fig;
      const lab = new Label(0.36, 512, 128);
      lab.mesh.position.set(0, 1.32, 0);
      lab.mesh.material.depthTest = true;
      fig.add(lab.mesh);
      seats[p].label = lab;
      const bubble = new Label(0.12, 192, 96);
      bubble.mesh.position.set(0.16, 1.12, 0.05);
      bubble.mesh.visible = false;
      fig.add(bubble.mesh);
      seats[p].bubble = bubble;
    }
  }
  bag = makeBag();
  bag.position.copy(bagPos()).setY(0);
  board.add(bag);
  syncBoard();
  syncHands(true);
  syncCabins();
  syncPiles();
  updateFoam();
  updateHUD();
}

function startGame(mi = mapIndex, oppIdx = save.opps, seed) {
  mapIndex = clamp(mi, 0, MAPS.length - 1);
  const opps = oppIdx.slice(0, 2).map(i => OPPONENTS[i]).filter(Boolean);
  if (!opps.length) opps.push(OPPONENTS[0]);
  save.map = mapIndex;
  save.opps = oppIdx.slice(0, 2);
  storeSave(save);
  const defs = [{ name: 'Você', color: PLAYER_COLOR, style: null }, ...opps.map(o => ({ name: o.name, color: o.color, style: o, opp: o }))];
  const gameSeed = seed ?? (Date.now() % 1e6);
  const g = new Game({ map: MAPS[mapIndex], players: defs.map(d => ({ name: d.name })), seed: gameSeed });
  aiRand = rng(gameSeed * 7 + 3);   // a mesma semente repete a partida inteira (testes)
  setupTable(g, defs);
  app = 'playing';
  panel.hide();
  toastMsg(`${MAPS[mapIndex].name}: você começa`);
  updateHint();
}

// Mesa do menu: uma partida de enfeite com algumas peças postas ao acaso.
function showcase() {
  const defs = [{ name: 'Você', color: PLAYER_COLOR }, { name: OPPONENTS[2].name, color: OPPONENTS[2].color, opp: OPPONENTS[2] }];
  const g = new Game({ map: MAPS[mapIndex], players: defs.map(d => ({ name: d.name })), seed: 7 });
  const r = rng(11);
  for (let k = 0; k < 10 && !g.over; k++) {
    const opts = [0, 1].flatMap(hi => g.legalPlacements(hi));
    const mv = opts[Math.floor(r() * opts.length)];
    g.place(mv.hi, mv.q, mv.r, mv.rot);
    if (g.phase === 'cabin') g.cabin(k % 3 === 0 ? g.placed[0] : null);
  }
  setupTable(g, defs);
}

// ---------- Vista: tabuleiro, mãos, cabanas ----------
function syncBoard() {
  for (const [k, c] of game.land) {
    if (cellViews.has(k)) continue;
    const m = makeTile(c.t, (c.piece ?? k) % 3);
    const [x, z] = cellXZ(c.q, c.r);
    m.position.set(x, 0, z);
    m.rotation.y = ((k * 7) % 6) * Math.PI / 3;
    board.add(m);
    cellViews.set(k, m);
  }
}
function syncCabins() {
  for (const [k, c] of game.land) {
    if (c.cabin < 0 || cabinViews.has(k)) continue;
    const cab = makeCabin(seats[c.cabin].color);
    const [x, z] = cellXZ(c.q, c.r);
    cab.position.set(x, cabinTop(c.t), z);
    cab.rotation.y = seatAngle(c.cabin);
    board.add(cab);
    cabinViews.set(k, cab);
  }
}
// cabana em cima da casa; na montanha fica no cume
const cabinTop = (t) => HEIGHT[t] * U + (t === 'M' ? 0.027 : 0);
function syncPiles() {
  for (let p = 0; p < game.n; p++) {
    const pile = pileViews[p];
    while (pile.children.length > game.cabins[p]) pile.remove(pile.children[pile.children.length - 1]);
    while (pile.children.length < game.cabins[p]) {
      const i = pile.children.length;
      const c = makeCabin(seats[p].color);
      c.position.set((i % 2) * 0.022 - 0.011, Math.floor(i / 2) * 0.0, (Math.floor(i / 2) - 1.5) * 0.022);
      pile.add(c);
    }
  }
}
// Mãos: cada peça vai (suave) para o seu lugar na bandeja. Peça nova sai do saquinho.
function syncHands(instant = false) {
  for (let p = 0; p < game.n; p++) {
    const hv = handViews[p];
    const ids = new Set(game.hands[p].map(x => x.id));
    for (const [id, e] of hv) if (!ids.has(id) && !e.flying) { board.remove(e.group); hv.delete(id); }
    game.hands[p].forEach((piece, i) => {
      let e = hv.get(piece.id);
      if (!e) {
        const group = makePieceGroup(piece);
        group.position.copy(instant ? slotPos(p, i) : bagPos());
        group.rotation.y = seatAngle(p);
        if (!instant) group.scale.setScalar(0.4);
        board.add(group);
        e = { group, held: false, flying: false, hop: instant ? 0 : 1 };
        hv.set(piece.id, e);
      }
      e.slot = i;
    });
  }
}
function updateHands(dt) {
  for (let p = 0; p < handViews.length; p++) {
    for (const e of handViews[p].values()) {
      if (e.held || e.flying) continue;
      const tgt = slotPos(p, e.slot);
      if (e.hop > 0) { e.hop = Math.max(0, e.hop - dt * 1.6); tgt.y += Math.sin(e.hop * Math.PI) * 0.12; }
      e.group.position.lerp(tgt, damp(9, dt));
      const s = e.group.scale.x + (1 - e.group.scale.x) * damp(8, dt);
      e.group.scale.setScalar(s);
      let dr = seatAngle(p) - e.group.rotation.y;
      dr = Math.atan2(Math.sin(dr), Math.cos(dr));
      e.group.rotation.y += dr * damp(8, dt);
    }
  }
}

function updateFoam() {
  const isl = game.islands();
  let i = 0;
  for (const is of isl) {
    _col.set(is.owner >= 0 ? seats[is.owner].color : 0xffffff);
    for (const k of is.keys) {
      if (i >= MAX_RINGS) break;
      const [q, r] = unK(k);
      const [x, z] = cellXZ(q, r);
      _m4.makeTranslation(x, 0, z);
      foam.setMatrixAt(i, _m4);
      foam.setColorAt(i, _col);
      i++;
    }
  }
  foam.count = i;
  foam.instanceMatrix.needsUpdate = true;
  if (foam.instanceColor) foam.instanceColor.needsUpdate = true;
}

// ---------- Eventos da partida → animações ----------
function consumeEvents() {
  const evs = game.events.slice(lastEvent);
  lastEvent = game.events.length;
  for (const e of evs) {
    if (e.type === 'draw') { syncHands(); if (!fast) sfx.draw(); }
    else if (e.type === 'pass') toastMsg(`${seats[e.p].name} não tinha onde pôr: passou a vez`);
    else if (e.type === 'roundEnd') queueTide(e);
    else if (e.type === 'sink') queueSink(e);
    else if (e.type === 'over') seq.push({ update: () => { showResults(); return true; } });
  }
  syncHands();
  syncPiles();
  updateFoam();
  updateHUD();
}

function queueTide(e) {
  seq.push({
    start() { tideTarget = e.tide; if (!fast) sfx.tide(e.peak > 0); toastMsg(e.peak ? `Maré cheia! Afundam as ${e.peak === 1 ? 'praias' : 'praias e florestas'}` : `Fim da rodada ${e.round}: a maré sobe`); },
    t: 0,
    update(dt) { this.t += dt; return this.t > (e.peak ? 1.4 : 0.8); },
  });
}
function queueSink(e) {
  seq.push({
    t: 0,
    start() {
      if (!fast) sfx.sink(e.sunk.length);
      this.items = [];
      for (const s of e.sunk) {
        const m = cellViews.get(s.k), c = cabinViews.get(s.k);
        cellViews.delete(s.k); cabinViews.delete(s.k);
        this.items.push({ m, c, y0: m?.position.y ?? 0, d: Math.random() * 0.4 });
      }
      updateFoam();
    },
    update(dt) {
      this.t += dt;
      for (const it of this.items) {
        const k = clamp((this.t - it.d) / 1.2, 0, 1);
        if (it.m) it.m.position.y = it.y0 - k * 5 * U;
        if (it.c) { it.c.position.y -= dt * 0.03; it.c.rotation.z += dt * 0.8; }
      }
      if (this.t < 1.7) return false;
      for (const it of this.items) { if (it.m) board.remove(it.m); if (it.c) board.remove(it.c); }
      tideTarget = 0;
      return true;
    },
  });
  seq.push({ t: 0, update(dt) { this.t += dt; return this.t > 0.9; } });
}

function runSeq(dt) {
  let guard = 0;
  while (seq.length && guard++ < 50) {
    const task = seq[0];
    if (!task.started) { task.started = true; task.start?.(); }
    if (task.update(fast ? 10 : dt)) { seq.shift(); continue; }
    break;
  }
}

// Peça do computador voando da bandeja até o tabuleiro, depois a cabana.
function queueAiMove(p, mv) {
  const piece = game.hands[p][mv.hi];
  const e = handViews[p].get(piece.id);
  const cs = pieceCells(piece, mv.q, mv.r, mv.rot);
  const target = pieceCenter(piece, mv.q, mv.r, mv.rot);
  seq.push({
    t: 0,
    start() { if (e) { e.flying = true; this.from = e.group.position.clone(); this.r0 = e.group.rotation.y; } },
    update(dt) {
      this.t += dt / 0.85;
      if (e) {
        const k = ease(Math.min(1, this.t));
        e.group.position.lerpVectors(this.from, target, k);
        e.group.position.y += Math.sin(k * Math.PI) * 0.14;
        let r1 = mv.rot * Math.PI / 3;
        let dr = Math.atan2(Math.sin(r1 - this.r0), Math.cos(r1 - this.r0));
        e.group.rotation.y = this.r0 + dr * k;
      }
      if (this.t < 1) return false;
      if (e) { board.remove(e.group); handViews[p].delete(piece.id); }
      game.place(mv.hi, mv.q, mv.r, mv.rot);
      syncBoard();
      sfx.place();
      splash(target);
      if (game.phase !== 'cabin' || game.current !== p) { consumeEvents(); return true; }
      if (mv.cabin >= 0) queueAiCabin(p, K(cs[mv.cabin][0], cs[mv.cabin][1]));
      else { game.cabin(null); consumeEvents(); }
      return true;
    },
  });
}
function queueAiCabin(p, k) {
  const c = game.land.get(k);
  const [x, z] = cellXZ(c.q, c.r);
  const to = new THREE.Vector3(x, cabinTop(c.t), z);
  seq.splice(1, 0, {
    t: 0,
    start() {
      this.m = makeCabin(seats[p].color);
      const pile = pileViews[p];
      if (pile.children.length) pile.remove(pile.children[pile.children.length - 1]);
      this.from = pilePos(p);
      this.m.position.copy(this.from);
      board.add(this.m);
    },
    update(dt) {
      this.t += dt / 0.55;
      const e = ease(Math.min(1, this.t));
      this.m.position.lerpVectors(this.from, to, e);
      this.m.position.y += Math.sin(e * Math.PI) * 0.09;
      if (this.t < 1) return false;
      board.remove(this.m);
      game.cabin(k);
      syncCabins();
      sfx.cabin();
      consumeEvents();
      return true;
    },
  });
}

function splash(at) {
  const n = 14;
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(n * 3), vel = [];
  for (let i = 0; i < n; i++) {
    const a = Math.random() * 6.28, s = 0.08 + Math.random() * 0.12;
    pos.set([at.x, waterY(tideShown), at.z], i * 3);
    vel.push([Math.cos(a) * s * 0.6, 0.25 + Math.random() * 0.25, Math.sin(a) * s * 0.6]);
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xdff8ff, size: 0.006, transparent: true, opacity: 0.9, depthWrite: false }));
  board.add(pts);
  let t = 0;
  fx.push({
    update(dt) {
      t += dt;
      for (let i = 0; i < n; i++) {
        vel[i][1] -= 2.5 * dt;
        pos[i * 3] += vel[i][0] * dt; pos[i * 3 + 1] += vel[i][1] * dt; pos[i * 3 + 2] += vel[i][2] * dt;
      }
      geo.attributes.position.needsUpdate = true;
      pts.material.opacity = Math.max(0, 0.9 - t * 1.4);
      return t > 0.7;
    },
    cleanup() { board.remove(pts); geo.dispose(); },
  });
}

// ---------- Vez de cada um ----------
function isHumanTurn() { return game && !game.over && game.current === 0 && !dev.autoplay; }

function updateTurns(dt) {
  if (app !== 'playing' || !game || seq.length) return;
  if (game.over) return;
  const p = game.current;
  if (p === 0 && !dev.autoplay) return;
  const style = p === 0 ? ROBOT : seats[p].style;
  if (!thinker) {
    thinker = { gen: chooseMoveGen(game.clone(), style, aiRand), t: 0, move: null, p };
    if (seats[p].bubble) { seats[p].bubble.mesh.visible = true; }
  }
  thinker.t += dt;
  if (!thinker.move) {
    const t0 = performance.now();
    let r;
    do { r = thinker.gen.next(); } while (!r.done && (fast || performance.now() - t0 < THINK_BUDGET));
    if (r.done) thinker.move = r.value || { pass: true };
  }
  if (seats[p].bubble) seats[p].bubble.set([{ text: '.'.repeat(1 + Math.floor(time * 3) % 3), size: 0.8 }]);
  const minT = p === 0 ? 0.25 : THINK_MIN;
  if (thinker.move && (fast || thinker.t >= minT)) {
    const mv = thinker.move;
    thinker = null;
    if (seats[p].bubble) seats[p].bubble.mesh.visible = false;
    if (mv.pass) { if (!game.pass()) game.skipPasses(); consumeEvents(); return; }
    queueAiMove(p, mv);
  }
}

// ---------- Jogador: segurar, girar, encaixar ----------
// Começa a segurar a peça hi (fonte: 'mouse' | 'left' | 'right').
function startHold(src, hi, opts = {}) {
  if (!isHumanTurn() || game.phase !== 'place' || seq.length) return false;
  const piece = game.hands[0][hi];
  const e = piece && handViews[0].get(piece.id);
  if (!e || e.held) return false;
  e.held = true;
  holds[src] = { kind: 'piece', hi, piece, e, rot: 0, rot0: 0, target: null, legal: false, ...opts };
  sfx.grab();
  pulse(src, 0.3, 25);
  return true;
}
function startCabinHold(src, opts = {}) {
  if (!isHumanTurn() || game.phase !== 'cabin' || seq.length) return false;
  const m = makeCabin(PLAYER_COLOR);
  m.scale.setScalar(1.3);
  board.add(m);
  const pile = pileViews[0];
  if (pile.children.length) pile.children[pile.children.length - 1].visible = false;
  holds[src] = { kind: 'cabin', m, target: null, ...opts };
  sfx.grab();
  pulse(src, 0.3, 25);
  return true;
}
function rotateHold(h, d) {
  if (!h || h.kind !== 'piece') return;
  h.rot = (h.rot + d + 6) % 6;
  sfx.turn();
}
// Atualiza a peça segurada: point = ponto do tabuleiro (local) onde a peça está (ou null),
// lift = altura da peça na tela.
function moveHold(h, point, lift, handPos) {
  if (h.kind === 'piece') {
    const g = h.e.group;
    g.scale.setScalar(1);
    g.rotation.y = h.rot * Math.PI / 3;
    h.target = null; h.legal = false;
    if (point && Math.hypot(point.x, point.z) < world.outerR + 0.04) {
      let [q, r] = anchorAt(h.piece, point.x, point.z, h.rot);
      h.legal = game.canPlace(h.piece, q, r, h.rot);
      if (!h.legal) {
        // ajuda: casa vizinha que encaixa, se o ponto estiver perto dela
        let best = null, bd = S * 1.25;
        for (const [dq, dr] of DIRS) {
          if (!game.canPlace(h.piece, q + dq, r + dr, h.rot)) continue;
          const c = pieceCenter(h.piece, q + dq, r + dr, h.rot);
          const d = Math.hypot(c.x - point.x, c.z - point.z);
          if (d < bd) { bd = d; best = [q + dq, r + dr]; }
        }
        if (best) { [q, r] = best; h.legal = true; }
      }
      h.target = { q, r };
      const cs = pieceCells(h.piece, q, r, h.rot);
      ghost.visible = true;
      ghostCells.forEach((m, i) => {
        m.visible = i < cs.length;
        if (!m.visible) return;
        const [x, z] = cellXZ(cs[i][0], cs[i][1]);
        m.position.set(x, waterY(tideShown) + 0.001, z);
        m.material = h.legal ? ghostMats.ok : ghostMats.bad;
      });
      if (h.legal && h.key !== `${q},${r},${h.rot}`) { h.key = `${q},${r},${h.rot}`; pulse(h.src, 0.15, 10); }
    }
    if (handPos) g.position.copy(handPos);
    else if (h.target && point) { const c = pieceCenter(h.piece, h.target.q, h.target.r, h.rot); g.position.set(c.x, lift, c.z); }
    else if (point) g.position.set(point.x, lift, point.z);
  } else {
    h.target = null;
    if (point) {
      const [q, r] = xzToHex(point.x, point.z, S);
      const k = K(q, r);
      if (game.placed?.includes(k)) h.target = k;
    }
    if (handPos) h.m.position.copy(handPos);
    else if (h.target != null) { const c = game.land.get(h.target); const [x, z] = cellXZ(c.q, c.r); h.m.position.set(x, cabinTop(c.t) + lift * 0.5, z); }
    else if (point) h.m.position.set(point.x, lift, point.z);
  }
}
function dropHold(src) {
  const h = holds[src];
  if (!h) return;
  delete holds[src];
  ghost.visible = false;
  if (h.kind === 'piece') {
    h.e.held = false;
    if (h.legal && h.target && game.phase === 'place' && game.current === 0) {
      const at = pieceCenter(h.piece, h.target.q, h.target.r, h.rot);
      const from = h.e.group.position.clone();
      board.remove(h.e.group);
      handViews[0].delete(h.piece.id);
      const before = new Set(cellViews.keys());
      if (game.place(h.hi, h.target.q, h.target.r, h.rot)) {
        syncBoard();
        // as casas novas descem da mão até o lugar
        for (const [k, m] of cellViews) {
          if (before.has(k)) continue;
          const y0 = Math.max(0.01, from.y);
          m.position.y = y0;
          let t = 0;
          fx.push({ update(dt) { t += dt / 0.18; m.position.y = y0 * (1 - Math.min(1, t)); return t >= 1; } });
        }
        sfx.place();
        splash(at);
        pulse(src, 0.6, 40);
        consumeEvents();
        updateHint();
        return;
      }
    }
    sfx.deny();
  } else {
    board.remove(h.m);
    const pile = pileViews[0];
    if (pile.children.length) pile.children[pile.children.length - 1].visible = true;
    if (h.target != null && placeCabin(h.target)) return;
  }
}
function placeCabin(k) {
  if (!isHumanTurn() || game.phase !== 'cabin') return false;
  if (!game.cabin(k)) return false;
  if (k != null) { syncCabins(); sfx.cabin(); } else sfx.click();
  pulseAll(0.4, 30);
  consumeEvents();
  updateHint();
  return true;
}
function cancelHolds() { for (const s of Object.keys(holds)) { const h = holds[s]; if (h.kind === 'piece') { h.e.held = false; h.legal = false; } dropHold(s); } }

// ---------- Mouse e teclado (PC) ----------
const mouse = { x: 0, y: 0, ndc: new THREE.Vector2(), inside: false };
const view = { yaw: 0, pitch: 0.86, dist: 1.3 };
function deskCamera() {
  rig.position.set(0, 0, 0); rig.rotation.set(0, 0, 0);
  // olha um pouco para perto do jogador, para a bandeja dele aparecer embaixo
  const target = new THREE.Vector3(Math.sin(view.yaw) * 0.16, stage.position.y, STAGE_Z + Math.cos(view.yaw) * 0.16);
  const cp = Math.cos(view.pitch);
  camera.position.set(target.x + Math.sin(view.yaw) * cp * view.dist, target.y + Math.sin(view.pitch) * view.dist, target.z + Math.cos(view.yaw) * cp * view.dist);
  camera.lookAt(target);
}
deskCamera();
function mouseRay() {
  raycaster.setFromCamera(mouse.ndc, camera);
  return raycaster.ray.clone();
}
// Ponto do plano do tabuleiro (coordenadas locais) onde o raio bate.
function boardPoint(ray, h = BOARD_PLANE_Y) {
  board.updateMatrixWorld();
  const o = board.worldToLocal(ray.origin.clone());
  const d = board.worldToLocal(ray.origin.clone().add(ray.direction)).sub(o);
  if (Math.abs(d.y) < 1e-6) return null;
  const t = (h - o.y) / d.y;
  if (t < 0) return null;
  return o.add(d.multiplyScalar(t));
}
function pickHand(ray) {
  raycaster.ray.copy(ray);
  let best = null, bd = Infinity;
  game.hands[0].forEach((piece, hi) => {
    const e = handViews[0].get(piece.id);
    if (!e || e.held || e.flying) return;
    const hit = raycaster.intersectObject(e.group, true)[0];
    if (hit && hit.distance < bd) { bd = hit.distance; best = hi; }
  });
  return best;
}
function pickPile(ray) {
  raycaster.ray.copy(ray);
  return raycaster.intersectObject(pileViews[0], true).length > 0;
}
function pickNoCabin(ray) {
  if (!noCabinBtn.mesh.visible) return false;
  raycaster.ray.copy(ray);
  return raycaster.intersectObject(noCabinBtn.mesh).length > 0;
}
function hexUnder(ray) {
  const pt = boardPoint(ray, BOARD_PLANE_Y * 0.6);
  if (!pt) return null;
  const [q, r] = xzToHex(pt.x, pt.z, S);
  return K(q, r);
}

const cv = renderer.domElement;
cv.addEventListener('contextmenu', (e) => e.preventDefault?.());
cv.addEventListener('pointermove', (e) => {
  mouse.x = e.clientX; mouse.y = e.clientY; mouse.inside = true;
  mouse.ndc.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
});
cv.addEventListener('pointerdown', (e) => {
  sfx.unlock();
  mouse.ndc.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  if (renderer.xr.isPresenting) return;
  const ray = mouseRay();
  if (panel.visible) {
    if (e.button !== 0) return;
    raycaster.ray.copy(ray);
    const hit = raycaster.intersectObject(panel.mesh)[0];
    const a = panel.actionAt(panel.pick(hit?.uv));
    if (a) { sfx.click(); a(); }
    return;
  }
  if (app !== 'playing') return;
  if (holds.mouse) { if (e.button === 2) rotateHold(holds.mouse, 1); return; }
  if (e.button !== 0 || !isHumanTurn() || seq.length) return;
  if (game.phase === 'place') {
    const hi = pickHand(ray);
    if (hi != null) startHold('mouse', hi);
  } else if (game.phase === 'cabin') {
    if (pickNoCabin(ray)) { placeCabin(null); return; }
    if (pickPile(ray)) { startCabinHold('mouse'); return; }
    const k = hexUnder(ray);
    if (k != null && game.placed.includes(k)) placeCabin(k);
  }
});
addEventListener('pointerup', (e) => {
  if (e.button === 0 && holds.mouse) dropHold('mouse');
});
cv.addEventListener('wheel', (e) => {
  if (holds.mouse) { rotateHold(holds.mouse, e.deltaY > 0 ? -1 : 1); return; }
  view.dist = clamp(view.dist + (e.deltaY > 0 ? 0.06 : -0.06), 0.6, 1.8);
}, { passive: true });
const keys = new Set();
addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  sfx.unlock();
  keys.add(k);
  if (k === 'escape' || k === 'p') { if (app === 'playing' || app === 'paused') togglePause(); return; }
  if (k === 'f') { save.fps = !save.fps; storeSave(save); }
  if (app !== 'playing') return;
  if (k === 'r' && holds.mouse) rotateHold(holds.mouse, e.shiftKey ? -1 : 1);
  if (k === 'n' && isHumanTurn() && game.phase === 'cabin') placeCabin(null);
});
addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

function updateMouse(dt) {
  if (keys.has('a') || keys.has('arrowleft')) view.yaw -= dt * 1.2;
  if (keys.has('d') || keys.has('arrowright')) view.yaw += dt * 1.2;
  if (keys.has('w') || keys.has('arrowup')) view.pitch = clamp(view.pitch + dt * 0.8, 0.35, 1.45);
  if (keys.has('s') || keys.has('arrowdown')) view.pitch = clamp(view.pitch - dt * 0.8, 0.35, 1.45);
  deskCamera();
  camera.updateMatrixWorld();
  const ray = mouseRay();
  if (panel.visible) {
    raycaster.ray.copy(ray);
    const hit = raycaster.intersectObject(panel.mesh)[0];
    panel.setHover(panel.pick(hit?.uv));
    cv.style.cursor = panel.hover >= 0 ? 'pointer' : 'default';
    return;
  }
  const h = holds.mouse;
  if (h) { moveHold(h, boardPoint(ray), 0.035); cv.style.cursor = 'grabbing'; return; }
  let hover = false;
  if (app === 'playing' && isHumanTurn() && !seq.length) {
    if (game.phase === 'place') hover = pickHand(ray) != null;
    else hover = pickNoCabin(ray) || pickPile(ray) || game.placed.includes(hexUnder(ray));
  }
  cv.style.cursor = hover ? 'pointer' : 'default';
}

// ---------- VR: controles e mãos ----------
for (let i = 0; i < 2; i++) {
  const ctrl = renderer.xr.getController(i);
  const grip = renderer.xr.getControllerGrip(i);
  rig.add(ctrl, grip);
  const laser = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1)]),
    new THREE.LineBasicMaterial({ color: 0xffd59a, transparent: true, opacity: 0.75 }));
  laser.visible = false;
  ctrl.add(laser);
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.007, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffd59a }));
  ctrl.add(tip);
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.018, 0.1, 10).rotateX(Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x3a3228 }));
  body.position.z = 0.05;
  grip.add(body);
  const entry = { ctrl, grip, laser, tip, body, source: null, side: null, prev: [], stickArmed: true, hover: -1, near: null };
  ctrls.push(entry);
  ctrl.addEventListener('connected', (e) => { entry.source = e.data; entry.side = e.data.handedness === 'left' ? 'left' : 'right'; body.visible = !e.data.hand; });
  ctrl.addEventListener('disconnected', () => { if (entry.side && holds[entry.side]) dropHold(entry.side); entry.source = null; entry.side = null; });
  ctrl.addEventListener('selectstart', () => onPress(entry, 'select'));
  ctrl.addEventListener('selectend', () => onRelease(entry, 'select'));
  ctrl.addEventListener('squeezestart', () => onPress(entry, 'squeeze'));
  ctrl.addEventListener('squeezeend', () => onRelease(entry, 'squeeze'));
}
const entryFor = (side) => ctrls.find(e => e.side === side && e.source);
function pulse(side, v, ms) {
  if (side !== 'left' && side !== 'right') return;
  try { entryFor(side)?.source?.gamepad?.hapticActuators?.[0]?.pulse?.(v, ms); } catch { /* sem vibração */ }
}
function pulseAll(v, ms) { pulse('left', v, ms); pulse('right', v, ms); }

function ctrlRay(e) {
  e.ctrl.updateMatrixWorld();
  e.ctrl.matrixWorld.decompose(_p, _q, _s);
  return { ray: new THREE.Ray(_p.clone(), new THREE.Vector3(0, 0, -1).applyQuaternion(_q).normalize()), quat: _q.clone() };
}
// Onde fica a "mão" (para pegar encostando): na mão rastreada é o ponto da pinça, no controle o punho.
function handPoint(e) {
  const src = e.source?.hand ? e.ctrl : e.grip;
  src.getWorldPosition(_v);
  return _v.clone();
}
function handQuat(e) {
  const src = e.source?.hand ? e.ctrl : e.grip;
  src.updateMatrixWorld();
  return src.getWorldQuaternion(new THREE.Quaternion());
}
// O que está ao alcance da mão (8 cm): uma peça da sua mão ou a pilha de cabanas.
function nearThing(e) {
  if (!isHumanTurn() || seq.length) return null;
  const hp = board.worldToLocal(handPoint(e));
  if (game.phase === 'place') {
    let best = null, bd = 0.085;
    game.hands[0].forEach((piece, hi) => {
      const v = handViews[0].get(piece.id);
      if (!v || v.held) return;
      const d = v.group.position.clone().setY(v.group.position.y + 0.02).distanceTo(hp);
      if (d < bd) { bd = d; best = { kind: 'piece', hi }; }
    });
    return best;
  }
  if (game.phase === 'cabin' && pilePos(0).setY(0.02).distanceTo(hp) < 0.09) return { kind: 'cabin' };
  return null;
}

function onPress(entry, button) {
  sfx.unlock();
  if (!entry.side) return;
  const { ray, quat } = ctrlRay(entry);
  if (panel.visible) {
    if (button !== 'select') return;
    raycaster.ray.copy(ray);
    const hit = raycaster.intersectObject(panel.mesh)[0];
    const a = panel.actionAt(panel.pick(hit?.uv));
    if (a) { sfx.click(); a(); }
    return;
  }
  if (app !== 'playing' || holds[entry.side] || !isHumanTurn() || seq.length) return;
  const near = nearThing(entry);
  const hq = handQuat(entry);
  const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(hq);
  if (near?.kind === 'piece') { startHold(entry.side, near.hi, { touch: true, button, q0: hq, fwd, src: entry.side }); return; }
  if (near?.kind === 'cabin') { startCabinHold(entry.side, { touch: true, button, src: entry.side }); return; }
  if (button !== 'select') return;
  // de longe, com o laser
  if (game.phase === 'place') {
    const hi = pickHand(ray);
    if (hi != null) startHold(entry.side, hi, { touch: false, button, q0: quat, fwd: ray.direction.clone(), src: entry.side });
  } else if (game.phase === 'cabin') {
    if (pickNoCabin(ray)) { placeCabin(null); return; }
    if (pickPile(ray)) { startCabinHold(entry.side, { touch: false, button, src: entry.side }); return; }
    const k = hexUnder(ray);
    if (k != null && game.placed.includes(k)) placeCabin(k);
  }
}
function onRelease(entry, button) {
  const h = entry.side && holds[entry.side];
  if (h && h.button === button) dropHold(entry.side);
}

// Giro do pulso em volta do eixo da mão desde que pegou (decomposição swing-twist), em passos
// de 45° de pulso = 60° da peça.
function twistSteps(h, quat) {
  const qr = quat.clone().multiply(h.q0.clone().invert());
  const f = h.fwd;
  let tw = 2 * Math.atan2(qr.x * f.x + qr.y * f.y + qr.z * f.z, qr.w);
  if (tw > Math.PI) tw -= 2 * Math.PI;
  if (tw < -Math.PI) tw += 2 * Math.PI;
  return -Math.round(tw / (Math.PI / 4));
}

function updateVR() {
  for (const e of ctrls) {
    e.laser.visible = false; e.near = null;
    if (!e.source) continue;
    const { ray, quat } = ctrlRay(e);
    raycaster.ray.copy(ray);
    if (panel.visible) {
      const hit = raycaster.intersectObject(panel.mesh)[0];
      e.laser.visible = true;
      e.laser.scale.z = hit ? hit.distance : 1.2;
      e.hover = panel.pick(hit?.uv);
      continue;
    }
    if (app !== 'playing') continue;
    const h = holds[e.side];
    if (h) {
      if (h.kind === 'piece') {
        const q = h.touch ? handQuat(e) : quat;
        const steps = twistSteps(h, q);
        const want = (((h.rot0 + steps) % 6) + 6) % 6;
        if (want !== h.rot) { h.rot = want; sfx.turn(); pulse(e.side, 0.25, 12); }
      }
      if (h.touch) {
        const hp = board.worldToLocal(handPoint(e));
        const over = hp.y < 0.3 ? hp.clone() : null;
        moveHold(h, over, 0, hp.add(new THREE.Vector3(0, -0.01, 0)));
      } else {
        const pt = boardPoint(ray);
        e.laser.visible = true;
        e.laser.scale.z = pt ? board.localToWorld(pt.clone()).distanceTo(ray.origin) : 1.2;
        moveHold(h, pt, 0.04);
      }
      continue;
    }
    e.near = nearThing(e);
    if (isHumanTurn() && !seq.length) {
      const pt = boardPoint(ray);
      const show = game.phase === 'cabin' || pickHand(ray) != null;
      e.laser.visible = show || pickNoCabin(ray);
      e.laser.scale.z = pt ? Math.min(2, board.localToWorld(pt.clone()).distanceTo(ray.origin)) : 1.2;
    }
  }
  if (panel.visible) panel.setHover(ctrls.find(e => e.source && e.hover >= 0)?.hover ?? -1);
}

function pollButtons() {
  for (const e of ctrls) {
    const gp = e.source?.gamepad;
    if (!gp || e.source.hand) continue;
    const b = gp.buttons.map(x => x.pressed);
    const edge = (i) => b[i] && !e.prev[i];
    const h = holds[e.side];
    if (edge(5)) { if (app === 'playing' || app === 'paused') togglePause(); }   // B ou Y
    if (edge(4) && h) { h.rot0 += 1; }                                            // A ou X: gira 60°
    const sx = gp.axes?.[2] ?? 0;
    if (Math.abs(sx) < 0.3) e.stickArmed = true;
    else if (Math.abs(sx) > 0.75 && e.stickArmed && h) { e.stickArmed = false; h.rot0 += sx > 0 ? -1 : 1; }
    e.prev = b;
  }
}

let recenterIn = 0;
function recenter() {
  const e = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ');
  rig.rotation.set(0, -e.y, 0);
  const head = camera.position.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), -e.y);
  rig.position.set(-head.x, 0, -head.z);
  // a mesa fica na altura da cintura de quem joga (em pé ou sentado)
  setTableHeight(clamp(camera.position.y - 0.78, 0.45, 1.05));
  if (panel.visible) placePanel();
}
renderer.xr.addEventListener('sessionstart', () => {
  recenterIn = 5;
  cancelHolds();
  view.yaw = 0;
  rig.position.set(0, 0, 0); rig.rotation.set(0, 0, 0);
  camera.position.set(0, 0, 0); camera.rotation.set(0, 0, 0);
  updateHint();
});
renderer.xr.addEventListener('sessionend', () => {
  cancelHolds();
  setTableHeight(TABLE_H);
  deskCamera();
  if (panel.visible) placePanel();
  updateHint();
});

// ---------- Telas (painel) ----------
function placePanel() {
  camera.updateMatrixWorld();
  const head = camera.getWorldPosition(new THREE.Vector3());
  const fwd = camera.getWorldDirection(new THREE.Vector3());
  if (renderer.xr.isPresenting) {
    fwd.y = 0; fwd.normalize();
    panel.mesh.position.copy(head).addScaledVector(fwd, 0.85).setY(head.y - 0.12);
    panel.mesh.lookAt(head.x, head.y - 0.12, head.z);
  } else {
    panel.mesh.position.copy(head).addScaledVector(fwd, 0.82);
    panel.mesh.quaternion.copy(camera.getWorldQuaternion(new THREE.Quaternion()));
  }
}
function showScreen(name, arg) {
  cancelHolds();
  const draw = SCREENS[name];
  panel.show((p) => draw(p, arg));
  placePanel();
  updateHint();
}
function wrap(p, text, x, y, maxW, { size = 28, lh = 1.3, color, align = 'left' } = {}) {
  const g = p.ctx;
  g.font = `${size}px sans-serif`;
  let line = '', yy = y;
  for (const word of text.split(' ')) {
    const t = line ? line + ' ' + word : word;
    if (g.measureText(t).width > maxW && line) { p.text(line, x, yy, { size, color, align }); line = word; yy += size * lh; }
    else line = t;
  }
  if (line) p.text(line, x, yy, { size, color, align });
  return yy + size * lh;
}
const key = (mi, n) => `${MAPS[mi].id}-${n}`;
const RULES = [
  ['A mesa', [
    'A mesa é um mar. Na sua vez você pega uma das 2 peças da sua bandeja (praia, floresta, montanha, sozinhas ou em dupla), gira e encaixa no mar, sempre encostada em terra que já existe (os rochedos contam).',
    'Depois pode pôr uma cabana numa das casas da peça que acabou de pôr. Cada um tem poucas cabanas. Aí a bandeja completa com uma peça nova do saquinho.',
  ]],
  ['A maré', [
    'A maré sobe um pouco a cada rodada (veja a régua no canto da bandeja). Quando enche, tudo o que é baixo afunda: na cheia 1 afundam as praias, na cheia 2 as praias e as florestas. Montanha e rochedo nunca afundam.',
    'Cabana em peça que afundou se perde. Ilha que tinha praia no meio se parte em pedaços. A última rodada sempre termina com maré cheia: conta o que sobrar.',
  ]],
  ['Quem manda na ilha', [
    'Ilha é um grupo de terra ligada. Manda nela quem tem mais cabanas. Empate: quem tem as cabanas mais altas (montanha 3, floresta 2, praia 1). Empate de novo: quem pôs cabana lá primeiro.',
    'No fim, o dono marca 1 ponto por casa da ilha (rochedo conta), o segundo lugar marca metade e cada cabana sua de pé vale 1 ponto. Ganha quem tiver mais pontos; empate: a maior ilha, depois quem guardou mais cabanas.',
  ]],
];
const SCREENS = {
  menu(p) {
    p.title('Arquipélago', 72);
    p.text('Monte ilhas no mar, ponha cabanas e cuidado com a maré', 512, 128, { size: 28, color: '#9cc3c0' });
    p.button('Jogar', () => showScreen('setup'), 312, 180, 400, 92, { size: 42 });
    p.button('Como jogar', () => showScreen('rules', 0), 312, 292, 400, 80);
    p.button(`Som: ${save.sound ? 'sim' : 'não'}`, () => { save.sound = !save.sound; sfx.setOn(save.sound); storeSave(save); showScreen('menu'); }, 312, 392, 195, 70, { size: 28 });
    p.button(`FPS: ${save.fps ? 'sim' : 'não'}`, () => { save.fps = !save.fps; storeSave(save); showScreen('menu'); }, 517, 392, 195, 70, { size: 28 });
    const won = Object.values(save.wins).reduce((a, b) => a + b, 0), played = Object.values(save.games).reduce((a, b) => a + b, 0);
    p.text(played ? `${played} partida(s), ${won} vitória(s)` : 'Primeira vez? Veja "Como jogar".', 512, 520, { size: 26, color: '#9cc3c0' });
    p.text(OPPONENTS.map((o, i) => `${o.name}: ${save.beat[i]} vitória(s) sua(s)`).join('   ·   '), 512, 570, { size: 20, color: '#9cc3c0' });
    p.text(renderer.xr.isPresenting ? 'Aponte e aperte o gatilho' : 'Clique nas opções', 512, 650, { size: 22, color: '#9cc3c0' });
  },
  setup(p) {
    p.title('Nova partida', 58);
    p.text('Mapa', 120, 112, { size: 28, bold: true, align: 'left', color: '#ffd59a' });
    MAPS.forEach((m, i) => {
      const n = save.opps.length;
      const best = save.best[key(i, n)];
      p.button(m.name, () => { mapIndex = i; save.map = i; storeSave(save); showcase(); showScreen('setup'); }, 60 + i * 310, 135, 290, 84,
        { on: mapIndex === i, size: 28, sub: best != null ? `recorde ${best} pts · ${save.wins[key(i, n)] || 0} vitória(s)` : `${m.rounds} rodadas` });
    });
    wrap(p, MAPS[mapIndex].desc, 70, 250, 880, { size: 24, color: '#f4fbf8' });
    p.text('Adversários (1 ou 2)', 120, 330, { size: 28, bold: true, align: 'left', color: '#ffd59a' });
    OPPONENTS.forEach((o, i) => {
      const on = save.opps.includes(i);
      p.button(o.name, () => {
        const s = save.opps.filter(x => x !== i);
        if (!on) { s.push(i); if (s.length > 2) s.shift(); }
        if (s.length) save.opps = s;
        storeSave(save); showScreen('setup');
      }, 60 + i * 310, 352, 290, 80, { on, size: 28, sub: ['fácil', 'médio', 'difícil'][[1, 0, 2].indexOf(i)] });
      wrap(p, o.desc, 60 + i * 310 + 6, 462, 280, { size: 19, color: '#9cc3c0' });
    });
    p.button('Começar', () => startGame(mapIndex, save.opps), 312, 590, 400, 86, { size: 40 });
    p.button('Voltar', () => showScreen('menu'), 60, 600, 200, 66, { size: 28 });
  },
  rules(p, page = 0) {
    const [title, paras] = RULES[page];
    p.title(title, 66);
    let y = 140;
    for (const t of paras) y = wrap(p, t, 70, y, 884, { size: 29 }) + 18;
    p.text(`${page + 1} / ${RULES.length}`, 512, 560, { size: 24, color: '#9cc3c0' });
    if (page < RULES.length - 1) p.button('Próxima', () => showScreen('rules', page + 1), 600, 600, 300, 76);
    else p.button('Entendi', () => { save.seen = true; storeSave(save); showScreen(app === 'paused' ? 'pause' : 'menu'); }, 600, 600, 300, 76);
    p.button('Voltar', () => page ? showScreen('rules', page - 1) : showScreen(app === 'paused' ? 'pause' : 'menu'), 124, 600, 300, 76);
  },
  pause(p) {
    p.title('Pausa', 70);
    p.button('Continuar', () => togglePause(), 312, 140, 400, 84, { size: 38 });
    p.button('Recomeçar', () => startGame(mapIndex, save.opps), 312, 240, 400, 76);
    p.button('Como jogar', () => showScreen('rules', 0), 312, 332, 400, 76);
    p.button('Menu', () => goMenu(), 312, 424, 400, 76);
    p.button(`Som: ${save.sound ? 'sim' : 'não'}`, () => { save.sound = !save.sound; sfx.setOn(save.sound); storeSave(save); showScreen('pause'); }, 140, 530, 230, 70, { size: 28 });
    p.button(`FPS: ${save.fps ? 'sim' : 'não'}`, () => { save.fps = !save.fps; storeSave(save); showScreen('pause'); }, 397, 530, 230, 70, { size: 28 });
    p.button('Recentralizar', () => { recenter(); togglePause(); }, 654, 530, 230, 70, { size: 28, locked: !renderer.xr.isPresenting });
  },
  end(p) {
    const r = game.result;
    const me = r.winners.includes(0);
    p.title(r.tie && me ? 'Empate!' : me ? 'Você venceu!' : `${seats[r.winners[0]].name} venceu`, 64);
    r.rank.forEach((x, i) => {
      const y = 150 + i * 72;
      const s = seats[x.p];
      p.ctx.fillStyle = hex6(s.color);
      p.ctx.beginPath(); p.ctx.arc(150, y, 18, 0, 6.3); p.ctx.fill();
      p.text(`${i + 1}º  ${s.name}`, 190, y - 10, { size: 34, align: 'left', bold: true });
      p.text(`${x.pts} pts`, 880, y - 10, { size: 36, align: 'right', bold: true, color: '#ffd59a' });
      p.text(`maior ilha ${x.big} · ${x.left} cabana(s) guardada(s) · ${game.drowned[x.p]} afogada(s)`, 190, y + 22, { size: 20, align: 'left', color: '#9cc3c0' });
    });
    const owned = r.islands.filter(i => i.owner >= 0).length;
    p.text(`${r.islands.length} ilha(s) no fim, ${owned} com dono · ${MAPS[mapIndex].name}`, 512, 400, { size: 24, color: '#9cc3c0' });
    const best = save.best[key(mapIndex, game.n - 1)];
    p.text(`Seu recorde neste mapa: ${best ?? 0} pts`, 512, 444, { size: 24, color: '#9cc3c0' });
    p.button('Jogar de novo', () => startGame(mapIndex, save.opps), 140, 520, 360, 86, { size: 34 });
    p.button('Menu', () => goMenu(), 524, 520, 360, 86, { size: 34 });
  },
};

function togglePause() {
  if (app === 'playing') { cancelHolds(); app = 'paused'; showScreen('pause'); }
  else if (app === 'paused') { app = 'playing'; panel.hide(); updateHint(); }
}
function goMenu() {
  app = 'menu';
  showcase();
  showScreen('menu');
}

function showResults() {
  if (resultShown) return;
  resultShown = true;
  const r = game.result;
  const n = game.n - 1, kk = key(mapIndex, n);
  save.games[kk] = (save.games[kk] || 0) + 1;
  if (r.winners.includes(0)) {
    save.wins[kk] = (save.wins[kk] || 0) + 1;
    for (let p = 1; p < game.n; p++) { const i = OPPONENTS.indexOf(seats[p].opp); if (i >= 0) save.beat[i]++; }
  }
  save.best[kk] = Math.max(save.best[kk] ?? 0, r.pts[0]);
  storeSave(save);
  if (r.winners.includes(0)) sfx.win(); else sfx.lose();
  // placas com os pontos de cada ilha
  for (const isl of r.islands) {
    if (isl.owner < 0) continue;
    let x = 0, z = 0;
    for (const k of isl.keys) { const [q, rr] = unK(k); const [cx, cz] = cellXZ(q, rr); x += cx; z += cz; }
    const lab = new Label(0.09, 256, 96);
    lab.set([{ text: `${isl.size}`, size: 0.8, color: hex6(seats[isl.owner].color) }]);
    lab.mesh.position.set(x / isl.keys.length, 0.09, z / isl.keys.length);
    lab.mesh.material.depthTest = true;
    lab.mesh.renderOrder = 5;
    board.add(lab.mesh);
    let t = 0;
    fx.push({
      update(dt) {
        t += dt;
        // de frente para a câmera (o rótulo é filho do tabuleiro)
        lab.mesh.quaternion.copy(board.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(camera.getWorldQuaternion(_q)));
        lab.mesh.position.y = 0.09 + Math.sin(time * 2 + x) * 0.004;
        return app !== 'over' && t > 1;
      },
      cleanup() { board.remove(lab.mesh); },
    });
  }
  app = 'over';
  let t = 0;
  seq.push({ update(dt) { t += dt; if (t > 2.2) { showScreen('end'); return true; } return false; } });
}

// ---------- HUD (PC) e placas (VR) ----------
const hudEl = document.getElementById('hud');
const hintEl = document.getElementById('hint');
const fpsEl = document.getElementById('fps');
const noCabEl = document.getElementById('nocab');
noCabEl.addEventListener('click', () => { sfx.unlock(); placeCabin(null); });
function tideText() {
  if (!game) return '';
  const pk = game.nextPeak();
  if (!pk) return 'Maré: última cheia já passou';
  const d = pk.round - game.round;
  const what = pk.level === 1 ? 'praias' : 'praias e florestas';
  return d === 0 ? `Maré cheia no fim desta rodada: afundam ${what}` : `Maré cheia em ${d + 1} rodadas (fim da ${pk.round}ª): afundam ${what}`;
}
function updateHUD() {
  if (!game) return;
  const pk = game.nextPeak();
  const now = game.scores(0).pts;
  const after = pk ? game.scores(pk.level).pts : now;
  const turnName = game.over ? 'Fim de jogo' : game.current === 0 ? (game.phase === 'cabin' ? 'Sua vez: ponha a cabana' : 'Sua vez') : `Vez de ${seats[game.current].name}`;
  const rows = seats.map((s, p) => `<div><i style="background:${hex6(s.color)}"></i><b>${s.name}</b> ${now[p]} pts <em>(depois da cheia: ${after[p]})</em> · ${game.cabins[p]} cabana(s)</div>`).join('');
  const html = `<div class="top"><b>Rodada ${Math.min(game.round, game.rounds)} de ${game.rounds}</b> · ${turnName}</div><div class="tide">${tideText()}</div>${rows}`;
  if (hudEl.dataset.last !== html) { hudEl.innerHTML = html; hudEl.dataset.last = html; }
  scoreSign.set([
    { text: `Rodada ${Math.min(game.round, game.rounds)}/${game.rounds}`, size: 0.17, color: '#ffd59a' },
    ...seats.map((s, p) => ({ text: `${s.name}: ${now[p]} (cheia: ${after[p]}) · ${game.cabins[p]} cab.`, size: 0.15, color: hex6(s.color) })),
    { text: tideText(), size: 0.12, bold: false },
  ]);
  for (let p = 1; p < seats.length; p++) seats[p].label?.set([{ text: `${seats[p].name}: ${now[p]} pts`, size: 0.6, color: hex6(seats[p].color) }]);
}
function updateInfo() {
  const vr = renderer.xr.isPresenting;
  const playing = (app === 'playing' || app === 'over') && game;
  hudEl.style.display = playing && !vr && !panel.visible ? 'block' : 'none';
  const myCabin = app === 'playing' && isHumanTurn() && game.phase === 'cabin' && !seq.length;
  noCabEl.style.display = myCabin && !vr ? 'block' : 'none';
  noCabinBtn.mesh.visible = myCabin && vr;
  scoreSign.mesh.visible = vr && playing;
  infoSign.mesh.visible = vr && playing;
  if (vr && playing) {
    let t = toast.t > 0 ? toast.text : '';
    if (!t) {
      if (game.over) t = 'Fim de jogo';
      else if (!isHumanTurn()) t = `Vez de ${seats[game.current].name}`;
      else if (game.phase === 'place') t = 'Sua vez: pegue uma peça (aperto ou pinça), gire o pulso e encaixe no mar';
      else t = 'Pegue uma cabana da pilha e ponha numa casa marcada, ou aperte "Sem cabana"';
    }
    infoSign.set([{ text: t.length > 46 ? t.slice(0, t.lastIndexOf(' ', 46)) : t, size: 0.3, color: '#ffd59a' }, ...(t.length > 46 ? [{ text: t.slice(t.lastIndexOf(' ', 46) + 1), size: 0.25, bold: false }] : []), { text: tideText(), size: 0.2, bold: false }]);
  }
  // casas marcadas para a cabana
  const ks = myCabin ? game.placed : [];
  targetArrows.forEach(a => { a.visible = false; });
  targetRings.forEach((m, i) => {
    m.visible = i < ks.length;
    if (!m.visible) return;
    const c = game.land.get(ks[i]);
    const [x, z] = cellXZ(c.q, c.r);
    m.position.set(x, cabinTop(c.t) + 0.002, z);
    m.scale.setScalar(1 + 0.08 * Math.sin(time * 6));
    const ar = targetArrows[i];
    ar.visible = true;
    ar.position.set(x, cabinTop(c.t) + 0.05 + Math.sin(time * 5) * 0.008, z);
  });
}
function updateHint() {
  if (renderer.xr.isPresenting) { hintEl.textContent = ''; return; }
  let t;
  if (panel.visible) t = 'Clique nas opções do painel';
  else if (app === 'playing' && isHumanTurn() && game.phase === 'place') t = 'Arraste uma peça da sua bandeja até o mar · R, roda ou botão direito: gira · A/D e W/S: câmera · Esc: pausa';
  else if (app === 'playing' && isHumanTurn() && game.phase === 'cabin') t = 'Clique numa casa marcada para pôr a cabana (ou arraste da pilha) · N: sem cabana';
  else t = 'A/D e W/S: câmera · roda: zoom · Esc: pausa';
  hintEl.innerHTML = `<span>${t}</span>`;
}
function toastMsg(text) { toast = { text, t: 2.6 }; }
const toastEl = document.getElementById('toast');

const vrBtn = document.getElementById('vr');
async function setupVR() {
  const ok = navigator.xr && await navigator.xr.isSessionSupported('immersive-vr').catch(() => false);
  if (!ok) {
    vrBtn.textContent = window.isSecureContext ? 'VR não disponível neste navegador' : 'VR precisa de HTTPS';
    vrBtn.disabled = true;
    return;
  }
  vrBtn.textContent = 'Entrar em VR';
  vrBtn.disabled = false;
  vrBtn.onclick = async () => {
    sfx.unlock();
    if (renderer.xr.isPresenting) { renderer.xr.getSession()?.end(); return; }
    try {
      const session = await navigator.xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking'] });
      await renderer.xr.setSession(session);
      vrBtn.textContent = 'Sair do VR';
      session.addEventListener('end', () => { vrBtn.textContent = 'Entrar em VR'; });
    } catch (err) {
      vrBtn.textContent = 'Erro ao entrar em VR';
      console.error(err);
    }
  };
}
setupVR();

// ---------- Laço principal ----------
let lastT = performance.now();
let fpsFrames = 0, fpsTime = 0, gullT = 8;

function frame(fixedDt) {
  const now = performance.now();
  const dt = fixedDt ?? Math.min(0.05, (now - lastT) / 1000);
  lastT = now;
  time += dt;
  const vr = renderer.xr.isPresenting;
  if (recenterIn > 0 && --recenterIn === 0) recenter();
  rig.updateMatrixWorld(true);
  pollButtons();
  if (vr) updateVR(); else updateMouse(dt);

  runSeq(dt);
  updateTurns(dt);
  updateHands(dt);
  fx = fx.filter(f => { const done = f.update(dt); if (done) f.cleanup?.(); return !done; });

  // água: sobe e desce até o nível da maré
  tideShown += (tideTarget - tideShown) * damp(fast ? 60 : 2.2, dt);
  if (world.water) world.water.position.y = waterY(tideShown);
  foam.position.y = waterY(tideShown) + 0.0006;
  world.update(time);
  for (let p = 1; p < seats.length; p++) {
    const f = seats[p].figure;
    if (!f) continue;
    const thinking = thinker?.p === p;
    f.userData.head.rotation.y = Math.sin(time * 0.7 + p) * 0.25 + (thinking ? Math.sin(time * 2.2) * 0.15 : 0);
    f.userData.head.rotation.x = thinking ? 0.35 : 0.15;
    f.position.y = -0.58 + Math.sin(time * 1.6 + p * 2) * 0.006;
  }
  if (bag) bag.rotation.y = Math.sin(time * 0.5) * 0.08;
  if (toast.t > 0) toast.t -= dt;
  toastEl.textContent = !vr && toast.t > 0 ? toast.text : '';
  toastEl.style.display = !vr && toast.t > 0 ? 'block' : 'none';
  if ((gullT -= dt) < 0) { gullT = 12 + Math.random() * 20; if (app !== 'menu') sfx.gull(); }
  updateInfo();

  fpsFrames++; fpsTime += dt;
  if (fpsTime >= 0.5) {
    const f = Math.round(fpsFrames / fpsTime);
    fpsFrames = 0; fpsTime = 0;
    fpsEl.style.display = save.fps && !vr ? 'block' : 'none';
    fpsEl.textContent = `${f} FPS`;
    fpsLabel.mesh.visible = save.fps && vr;
    fpsLabel.set(`${f} FPS`);
    updateHUD();
    updateHint();
  }
  renderer.render(scene, camera);
}

// Para testes no console:
//   arq.dev.loadLevel(2)      começa uma partida no mapa 2 (1 a 3) com os adversários escolhidos
//   arq.dev.startGame(3, [0, 2])  mapa 3 contra Capitã Marola e Vó Coral
//   arq.dev.autoplay = true   o robô joga por você
//   arq.dev.advance(30)       roda 30 s de jogo de uma vez (sem esperas)
//   arq.dev.state()           resumo da partida
Object.assign(dev, {
  loadLevel(n, opps = save.opps) { startGame(n - 1, opps, 1234); return dev.state(); },
  startGame(n, opps = save.opps, seed) { startGame(n - 1, opps, seed); return dev.state(); },
  advance(sec) {
    fast = true;
    const steps = Math.ceil(sec * 60);
    for (let i = 0; i < steps; i++) frame(1 / 60);
    fast = false;
    return dev.state();
  },
  state() {
    if (!game) return { app };
    return {
      app, map: MAPS[mapIndex].name, round: game.round, phase: game.phase, current: game.current, over: game.over,
      tide: +tideShown.toFixed(2), pts: game.scores(0).pts, cabins: game.cabins.slice(), land: game.land.size,
      busy: seq.length > 0, thinking: !!thinker, winners: game.result?.winners, screen: panel.visible ? 'panel' : null,
    };
  },
  resetSave() { try { localStorage.removeItem('arquipelagovr.v1'); } catch { /* nada */ } },
});
window.arq = {
  get game() { return game; }, get app() { return app; }, get seats() { return seats; }, get handViews() { return handViews; },
  get holds() { return holds; }, cellViews: () => cellViews, cabinViews: () => cabinViews,
  dev, save, camera, scene, renderer, board, panel, world, noCabinBtn, pileViews: () => pileViews,
  showScreen, togglePause, startGame, goMenu, pieceCenter, slotPos, pilePos, ctrls,
};

showcase();
showScreen('menu');
renderer.setAnimationLoop(() => frame());
