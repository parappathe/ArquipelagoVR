// Teste do main.js sem navegador: roda o jogo inteiro com um navegador e um renderer de
// mentira (tests/smoke/env.js e three-wrap.js) e joga com o mouse, com um controle de VR falso
// e com a pinça de uma mão rastreada falsa. Chamado pelo tests/run.js; sozinho:
//   node --import ./tests/smoke/register.js tests/smoke/main.js
// Não toca som (não existe AudioContext aqui).
import './env.js';
import * as THREE from '../../vendor/three/three.module.js';

await import('../../js/main.js');
const A = window.arq, dev = A.dev, R = globalThis.__renderer;
let fails = 0, count = 0;
const ok = (c, m) => { count++; if (!c) { fails++; console.log('  FALHOU: ' + m); } };
const frames = (n) => { for (let i = 0; i < n; i++) R.loop(); };
const fire = (list, e) => (list || []).forEach(f => f({ preventDefault() {}, button: 0, shiftKey: false, ...e }));
const cv = R.domElement.handlers, win = globalThis.windowHandlers;
const U = 0.011;
const toScreen = (world) => {
  A.camera.updateMatrixWorld();
  const v = world.clone().project(A.camera);
  return { clientX: (v.x + 1) / 2 * innerWidth, clientY: (1 - v.y) / 2 * innerHeight };
};
const boardWorld = (x, y, z) => { A.board.updateMatrixWorld(true); return A.board.localToWorld(new THREE.Vector3(x, y, z)); };
const cellWorld = (q, r, y) => boardWorld(0.038 * Math.sqrt(3) * (q + r / 2), y, 0.038 * 1.5 * r);
function clickPanel(cx, cy) {
  const pm = A.panel.mesh;
  pm.updateMatrixWorld();
  const at = toScreen(pm.localToWorld(new THREE.Vector3((cx / 1024 - 0.5) * 0.9, (0.5 - cy / 720) * 0.9 * 720 / 1024, 0)));
  fire(cv.pointermove, at); frames(1);
  fire(cv.pointerdown, at);
  fire(win.pointerup, at);
}
// Espera até a vez voltar para o jogador (IA pensando e animando).
function untilMyTurn(maxSec = 30) {
  for (let i = 0; i < maxSec * 10; i++) {
    const s = dev.state();
    if (s.over || (s.current === 0 && !s.busy && s.phase === 'place' && A.app === 'playing')) return true;
    dev.advance(0.1);
  }
  return false;
}

frames(3);
ok(A.app === 'menu' && A.panel.visible, 'abre no menu');
ok(A.game && A.cellViews().size === A.game.land.size, 'mesa de enfeite no menu com as peças desenhadas');

// ---------- Menu com o mouse ----------
clickPanel(512, 226);                  // "Jogar"
ok(A.panel.visible && A.app === 'menu', 'Jogar abre a escolha de mapa');
clickPanel(60 + 2 * 310 + 145, 177);   // mapa 3
clickPanel(60 + 2 * 310 + 145, 392);   // + Vó Coral
ok(A.save.map === 2 && A.save.opps.length === 2 && A.save.opps.includes(2), `escolheu o mapa 3 e dois adversários (${A.save.opps})`);
clickPanel(512, 633);                  // "Começar"
ok(A.app === 'playing' && A.game.n === 3 && A.game.map.id === 'estreito', 'Começar abre a partida de 3 no Estreito');
ok(A.seats.length === 3 && A.seats[1].figure && A.seats[2].figure, 'dois bonecos na mesa');

// ---------- Mouse: arrastar, girar, encaixar, cabana ----------
dev.startGame(1, [0], 42);
frames(2);
{
  const g = A.game;
  const opts = g.legalPlacements(0);
  const mv = opts.find(o => o.rot >= 2) || opts[0];
  const piece = g.hands[0][mv.hi];
  const e = A.handViews[0].get(piece.id);
  e.group.updateMatrixWorld(true);
  const a = toScreen(e.group.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.02, 0)));
  fire(cv.pointermove, a); frames(1);
  fire(cv.pointerdown, a);
  ok(A.holds.mouse && A.holds.mouse.piece === piece, 'clicou e segurou a peça da bandeja');
  for (let k = 0; k < mv.rot; k++) fire(win.keydown, { key: 'r' });
  ok(A.holds.mouse.rot === mv.rot % 6, `R gira a peça (${A.holds.mouse.rot})`);
  const c = A.pieceCenter(piece, mv.q, mv.r, mv.rot);
  const b = toScreen(boardWorld(c.x, 3.4 * U, c.z));
  fire(cv.pointermove, b); frames(2);
  ok(A.holds.mouse.legal && A.holds.mouse.target.q === mv.q && A.holds.mouse.target.r === mv.r, `fantasma verde no lugar certo (${JSON.stringify(A.holds.mouse.target)})`);
  fire(win.pointerup, b); frames(1);
  const cells = [[mv.q, mv.r]];
  if (piece.t.length > 1) { const d = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]][mv.rot]; cells.push([mv.q + d[0], mv.r + d[1]]); }
  ok(cells.every(([q, r]) => g.land.has((q + 32) * 64 + r + 32)), 'peça encaixada pelo mouse');
  ok(g.phase === 'cabin' && g.current === 0, 'agora a cabana');
  ok(A.noCabinBtn && !A.noCabinBtn.mesh.visible, 'no PC o botão 3D "Sem cabana" fica escondido (tem o botão da tela)');
  const k0 = g.placed[0];
  const cc = g.land.get(k0);
  const at = toScreen(cellWorld(cc.q, cc.r, 3.4 * U * 0.6));
  fire(cv.pointermove, at); frames(1);
  fire(cv.pointerdown, at);
  ok(g.land.get(k0).cabin === 0 && A.cabinViews().has(k0), 'clique na casa marcada põe a cabana');
  ok(g.current === 1, 'vez do computador');
  ok(untilMyTurn(), 'computador pensa, joga e devolve a vez');
  ok(g.moves.length === 2 && g.moves[1].p === 1, 'computador pôs uma peça');
  ok(A.cellViews().size === g.land.size, 'tabuleiro desenhado igual às regras');
  // soltar fora devolve a peça para a bandeja
  const p2 = g.hands[0][0], e2 = A.handViews[0].get(p2.id);
  e2.group.updateMatrixWorld(true);
  const a2 = toScreen(e2.group.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.02, 0)));
  fire(cv.pointermove, a2); frames(1);
  fire(cv.pointerdown, a2);
  const far = toScreen(boardWorld(0.6, 0.05, -0.1));
  fire(cv.pointermove, far); frames(1);
  fire(win.pointerup, far); frames(30);
  ok(g.hands[0].includes(p2) && g.phase === 'place' && !e2.held, 'soltar fora do mar devolve a peça');
  // Esc pausa e volta
  fire(win.keydown, { key: 'Escape' });
  ok(A.app === 'paused' && A.panel.visible, 'Esc pausa');
  fire(win.keydown, { key: 'Escape' });
  ok(A.app === 'playing' && !A.panel.visible, 'Esc continua');
}

// ---------- VR com controle falso ----------
{
  R.xr.isPresenting = true;
  (R.xrHandlers.sessionstart || []).forEach(f => f());
  const right = R.ctrls[1];
  const buttons = Array.from({ length: 6 }, () => ({ pressed: false }));
  const pulses = [];
  const source = { handedness: 'right', gamepad: { buttons, axes: [0, 0, 0, 0], hapticActuators: [{ pulse: (v, ms) => pulses.push(ms) }] } };
  right.ctrl.dispatchEvent({ type: 'connected', data: source });
  frames(6); // recentraliza
  const rig = right.ctrl.parent;
  const putHand = (worldPos, quat = new THREE.Quaternion()) => {
    rig.updateMatrixWorld(true);
    const l = rig.worldToLocal(worldPos.clone());
    right.grip.position.copy(l); right.ctrl.position.copy(l);
    right.grip.quaternion.copy(quat); right.ctrl.quaternion.copy(quat);
  };
  const aim = (target) => {
    const eye = target.clone().add(new THREE.Vector3(0.05, 0.3, 0.25));
    const m = new THREE.Matrix4().lookAt(eye, target, new THREE.Vector3(0, 1, 0));
    putHand(eye, new THREE.Quaternion().setFromRotationMatrix(m));
  };
  const g = A.game;
  ok(g.current === 0 && g.phase === 'place', 'VR: minha vez');
  const opts = g.legalPlacements(1);
  const mv = opts.find(o => o.rot >= 1) || opts[0];
  const piece = g.hands[0][mv.hi];
  const e = A.handViews[0].get(piece.id);
  frames(20);
  e.group.updateMatrixWorld(true);
  putHand(e.group.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.02, 0)));
  frames(1);
  right.ctrl.dispatchEvent({ type: 'squeezestart' });
  ok(A.holds.right && A.holds.right.piece === piece && A.holds.right.touch, 'aperto do controle perto da peça pega a peça');
  // gira o pulso: cada 45° de pulso gira a peça 60°
  const steps = mv.rot <= 3 ? mv.rot : mv.rot - 6;
  const twist = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, -1), -steps * Math.PI / 4);
  const c = A.pieceCenter(piece, mv.q, mv.r, mv.rot);
  putHand(boardWorld(c.x, 0.05, c.z), twist);
  frames(2);
  ok(A.holds.right.rot === mv.rot % 6, `girar o pulso gira a peça (${A.holds.right.rot}, queria ${mv.rot})`);
  ok(A.holds.right.legal, 'fantasma verde embaixo da mão');
  right.ctrl.dispatchEvent({ type: 'squeezeend' });
  frames(1);
  ok(g.moves.length === 3 && g.moves[2].p === 0 && g.moves[2].q === mv.q && g.moves[2].r === mv.r, `soltar o aperto encaixa a peça (${JSON.stringify(g.moves[2] && { q: g.moves[2].q, r: g.moves[2].r, rot: g.moves[2].rot })})`);
  ok(pulses.length > 0, 'controle vibra');
  ok(g.phase === 'cabin' && A.noCabinBtn.mesh.visible, 'VR: aparece o botão "Sem cabana"');
  // laser + gatilho numa casa marcada
  const k0 = g.placed[g.placed.length - 1];
  const cc = g.land.get(k0);
  aim(cellWorld(cc.q, cc.r, 3.4 * U * 0.6));
  frames(1);
  right.ctrl.dispatchEvent({ type: 'selectstart' });
  right.ctrl.dispatchEvent({ type: 'selectend' });
  ok(g.land.get(k0).cabin === 0, 'apontar e apertar o gatilho põe a cabana');
  ok(untilMyTurn(), 'VR: computador joga e devolve a vez');
  // laser: pegar a peça de longe, soltar no mar e apertar "Sem cabana"
  const opts2 = g.legalPlacements(0);
  const mv2 = opts2[Math.floor(opts2.length / 2)];
  const p2 = g.hands[0][mv2.hi], e2 = A.handViews[0].get(p2.id);
  frames(20);
  e2.group.updateMatrixWorld(true);
  aim(e2.group.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.01, 0)));
  frames(1);
  right.ctrl.dispatchEvent({ type: 'selectstart' });
  ok(A.holds.right && !A.holds.right.touch, 'gatilho apontando para a peça pega de longe (laser)');
  for (let k = 0; k < mv2.rot; k++) { buttons[4].pressed = true; frames(1); buttons[4].pressed = false; frames(1); }
  const c2 = A.pieceCenter(p2, mv2.q, mv2.r, mv2.rot);
  aim(boardWorld(c2.x, 3.4 * U, c2.z));
  frames(2);
  ok(A.holds.right.rot === mv2.rot % 6, `botão A gira 60° (${A.holds.right.rot})`);
  right.ctrl.dispatchEvent({ type: 'selectend' });
  frames(1);
  ok(g.moves.length === 5 && g.moves[4].p === 0, 'laser encaixa a peça');
  const btn = A.noCabinBtn.mesh;
  btn.updateMatrixWorld(true);
  aim(btn.getWorldPosition(new THREE.Vector3()));
  frames(1);
  const before = g.cabins[0];
  right.ctrl.dispatchEvent({ type: 'selectstart' });
  right.ctrl.dispatchEvent({ type: 'selectend' });
  ok(g.current !== 0 || g.round > 3, 'apertou "Sem cabana"');
  ok(g.cabins[0] === before, 'sem gastar cabana');
  ok(untilMyTurn(), 'vez volta');
  // B pausa
  buttons[5].pressed = true; frames(1); buttons[5].pressed = false; frames(1);
  ok(A.app === 'paused', 'B pausa no VR');
  A.togglePause();

  // ---------- mão rastreada: pinça ----------
  right.ctrl.dispatchEvent({ type: 'disconnected' });
  const left = R.ctrls[0];
  left.ctrl.dispatchEvent({ type: 'connected', data: { handedness: 'left', hand: {}, gamepad: null } });
  frames(2);
  const putLeft = (worldPos) => { rig.updateMatrixWorld(true); const l = rig.worldToLocal(worldPos.clone()); left.ctrl.position.copy(l); left.grip.position.copy(l); left.ctrl.quaternion.identity(); };
  if (!g.over) {
    const opts3 = g.legalPlacements(0);
    const mv3 = opts3.find(o => o.rot === 0) || opts3[0];
    const p3 = g.hands[0][mv3.hi], e3 = A.handViews[0].get(p3.id);
    frames(20);
    e3.group.updateMatrixWorld(true);
    putLeft(e3.group.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.02, 0)));
    frames(1);
    left.ctrl.dispatchEvent({ type: 'selectstart' });
    ok(A.holds.left && A.holds.left.touch, 'pinça perto da peça pega a peça');
    const c3 = A.pieceCenter(p3, mv3.q, mv3.r, mv3.rot);
    putLeft(boardWorld(c3.x, 0.04, c3.z));
    frames(2);
    left.ctrl.dispatchEvent({ type: 'selectend' });
    frames(1);
    ok(g.moves[g.moves.length - 1].p === 0 && g.moves[g.moves.length - 1].q === mv3.q, 'soltar a pinça encaixa');
    // cabana: pinça na pilha, leva até a casa marcada
    if (g.phase === 'cabin') {
      const k3 = g.placed[0], c4 = g.land.get(k3);
      putLeft(boardWorld(...A.pilePos(0).toArray()).add(new THREE.Vector3(0, 0.02, 0)));
      frames(1);
      left.ctrl.dispatchEvent({ type: 'selectstart' });
      ok(A.holds.left && A.holds.left.kind === 'cabin', 'pinça na pilha pega uma cabana');
      putLeft(cellWorld(c4.q, c4.r, 0.06));
      frames(2);
      left.ctrl.dispatchEvent({ type: 'selectend' });
      ok(g.land.get(k3)?.cabin === 0, 'soltar a cabana em cima da casa marcada');
    }
  }
  R.xr.isPresenting = false;
  (R.xrHandlers.sessionend || []).forEach(f => f());
  frames(1);
}

// ---------- Robô joga até o fim ----------
{
  const games0 = Object.values(A.save.games).reduce((a, b) => a + b, 0);
  dev.autoplay = true;
  for (let i = 0; i < 60 && A.app !== 'over'; i++) dev.advance(5);
  dev.advance(4);
  dev.autoplay = false;
  const g = A.game;
  ok(g.over && A.app === 'over', `partida chega ao fim (${JSON.stringify(dev.state())})`);
  ok(A.panel.visible, 'painel de resultado');
  ok(Object.values(A.save.games).reduce((a, b) => a + b, 0) === games0 + 1, 'partida contada no save');
  ok(A.cellViews().size === g.land.size, 'no fim o tabuleiro desenhado bate com as regras (afundados sumiram)');
  ok([...g.land.values()].every(c => c.t !== 'P'), 'última cheia afundou as praias');
  clickPanel(320, 563);                 // "Jogar de novo"
  ok(A.app === 'playing' && A.game !== g && A.game.round === 1, 'Jogar de novo');
}

// Zé Tubarão de verdade, pelo mesmo caminho do console (dev.loadLevel / startGame + autoplay):
// mesa de 3 com o robô no seu lugar e a Vó Coral. Ele já terminou com 0 ponto e 6 cabanas
// afogadas nos 3 mapas com a semente 1234 do loadLevel.
{
  const lines = [];
  let zero = 0, total = 0, drownedAll = 0, n = 0;
  for (const seed of [1234, 1]) for (let m = 1; m <= 3; m++) {
    if (seed === 1234) dev.loadLevel(m, [1, 2]); else dev.startGame(m, [1, 2], seed);
    dev.autoplay = true;
    for (let i = 0; i < 60 && A.app !== 'over'; i++) dev.advance(5);
    dev.autoplay = false;
    const g = A.game;
    ok(g.over && A.seats[1].name === 'Zé Tubarão', `mapa ${m}, semente ${seed}: partida a três terminou`);
    const pts = g.result.pts[1];
    if (!pts) zero++;
    total += pts; drownedAll += g.drowned[1]; n++;
    lines.push(`${g.result.pts.join('/')} (afogou ${g.drowned[1]})`);
  }
  console.log(`  robô / Zé Tubarão / Vó Coral pelo main.js: ${lines.join(' · ')}`);
  ok(zero === 0, `Zé Tubarão marca pontos em todas (${zero} zeradas de ${n})`);
  ok(total / n >= 5, `Zé Tubarão faz pontos de verdade (${(total / n).toFixed(1)} em média)`);
  ok(drownedAll / n <= 4, `Zé Tubarão não perde as cabanas para a maré (${(drownedAll / n).toFixed(1)} por partida)`);
}

// Os 3 mapas abrem
for (let n = 1; n <= 3; n++) {
  const s = dev.loadLevel(n, [1, 2]);
  ok(s.app === 'playing' && s.map === ['Enseada Mansa', 'Atol das Marés', 'Estreito dos Corais'][n - 1] && A.game.n === 3, `mapa ${n} abre com 2 adversários`);
}
A.goMenu();
frames(2);
ok(A.app === 'menu' && A.panel.visible, 'volta ao menu');

console.log(`  main.js (sem navegador): ${count} verificações, ${R.renders} quadros desenhados`);
if (fails) console.log(`  ${fails} falharam`);
process.exit(fails ? 1 : 0);
