// Testes automáticos: node tests/run.js (ou npm test). Não tocam som nem usam navegador.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { K, DIRS, disk, hexDist, hexToXZ, xzToHex } from '../js/hex.js';
import { Game, HEIGHT, PIECE_KINDS, BAG_WEIGHTS, CABINS, makeBag, pieceCells, rotCount, tideCurve, findIslands, islandOwner, scoreIslands, vice, rng } from '../js/rules.js';
import { MAPS } from '../js/maps.js';
import { OPPONENTS, ROBOT, chooseMove, playTurn, evaluate } from '../js/ai.js';

let fails = 0, count = 0;
function ok(cond, msg) {
  count++;
  if (!cond) { fails++; console.log('  FALHOU:', msg); }
}

// Mapa de teste pequeno: mar de raio 3, um rochedo no meio, maré enche no fim da rodada 2 (praias)
// e da 4 (florestas).
const TINY = { id: 'tiny', name: 'Teste', cells: disk(3), reefs: [[1, -1]], start: [[0, 0, 'R']], rounds: 5, peaks: { 2: 1, 4: 2 } };
const two = (map = TINY, seed = 1) => new Game({ map, players: [{ name: 'A' }, { name: 'B' }], seed });
// Põe peça direto na mão do jogador da vez (para testar posições exatas).
const give = (g, t, hi = 0) => { g.hands[g.current][hi] = { id: 900 + hi, t }; };

console.log('Grade hexagonal');
{
  ok(disk(5).length === 91 && disk(6).length === 127, 'raio 5 = 91 casas, raio 6 = 127');
  ok(DIRS.every(([q, r]) => hexDist(q, r) === 1), 'as 6 vizinhas ficam a 1 casa');
  let back = true;
  for (const [q, r] of disk(4)) { const [x, z] = hexToXZ(q, r, 0.05); const [q2, r2] = xzToHex(x + 0.01, z - 0.012, 0.05); if (q2 !== q || r2 !== r) back = false; }
  ok(back, 'ponto perto do centro da casa volta para a mesma casa');
  const [x1, z1] = hexToXZ(1, 0, 1), [x2, z2] = hexToXZ(0, 1, 1);
  ok(Math.abs(Math.hypot(x1, z1) - Math.sqrt(3)) < 1e-9 && Math.abs(Math.hypot(x2, z2) - Math.sqrt(3)) < 1e-9, 'vizinhas a √3 × lado de distância');
}

console.log('Peças e saquinho');
{
  ok(PIECE_KINDS.length === BAG_WEIGHTS.length, 'cada tipo de peça tem peso');
  const bag = makeBag(42, rng(5));
  ok(bag.length === 42 && new Set(bag.map(p => p.id)).size === 42, 'saquinho com 42 peças diferentes');
  const lot = bag.slice(0, 21).map(p => p.t.join('')).sort().join(',');
  const want = PIECE_KINDS.flatMap((t, i) => Array(BAG_WEIGHTS[i]).fill(t.join(''))).sort().join(',');
  ok(lot === want, 'as primeiras 21 peças são um lote completo');
  const hexes = bag.slice(0, 21).flatMap(p => p.t);
  const share = (t) => hexes.filter(x => x === t).length / hexes.length;
  ok(share('M') < share('F') && share('F') < share('P'), `montanha é a mais rara, praia a mais comum (${['P', 'F', 'M'].map(t => Math.round(share(t) * 100) + '%').join(' / ')})`);
  ok(makeBag(30, rng(9)).map(p => p.t.join('')).join() === makeBag(30, rng(9)).map(p => p.t.join('')).join(), 'mesma semente, mesmo saquinho');
  ok(rotCount({ t: ['P'] }) === 1 && rotCount({ t: ['F', 'F'] }) === 3 && rotCount({ t: ['P', 'M'] }) === 6, 'giros distintos: 1, 3 e 6');
  const cs = pieceCells({ t: ['P', 'M'] }, 2, -1, 1);
  ok(cs.length === 2 && cs[1][0] === 3 && cs[1][1] === -2 && cs[1][2] === 'M', 'peça dupla: segunda casa na direção do giro');
  ok(pieceCells({ t: ['P', 'M'] }, 0, 0, 7)[1][0] === pieceCells({ t: ['P', 'M'] }, 0, 0, 1)[1][0], 'giro 7 = giro 1');
}

console.log('Colocação');
{
  const g = two();
  ok(g.hands[0].length === 2 && g.hands[1].length === 2, 'cada um começa com 2 peças na mão');
  give(g, ['P', 'F']);
  ok(!g.canPlace(g.hands[0][0], 0, 0, 0), 'não põe em cima de terra');
  ok(!g.canPlace(g.hands[0][0], 2, 2, 0), 'precisa encostar em terra');
  ok(!g.canPlace({ t: ['M'] }, 1, -1, 0), 'não põe no coral');
  ok(g.canPlace(g.hands[0][0], 1, 0, 0), 'encostada no rochedo pode');
  ok(g.canPlace(g.hands[0][0], 2, 0, 3), 'só a segunda casa encostando também pode');
  const n0 = g.legalPlacements(0).length;
  give(g, ['F', 'F']);
  const n1 = g.legalPlacements(0).length;
  give(g, ['M']);
  const n2 = g.legalPlacements(0).length;
  ok(n2 === 5, `peça sozinha: 5 lugares em volta do rochedo (o sexto é coral) (${n2})`);
  ok(n0 > n1 && n1 > n2, `dupla mista tem mais jogadas que dupla igual (${n0} > ${n1} > ${n2})`);
  give(g, ['P', 'F']);
  ok(g.place(0, 1, 0, 0), 'pôs a peça');
  ok(g.land.get(K(1, 0)).t === 'P' && g.land.get(K(2, 0)).t === 'F', 'praia e floresta no lugar');
  ok(g.phase === 'cabin' && g.current === 0, 'depois vem a cabana do mesmo jogador');
  ok(!g.cabin(K(0, 0)), 'cabana só na peça que acabou de pôr');
  ok(g.cabin(K(2, 0)), 'cabana na floresta');
  ok(g.land.get(K(2, 0)).cabin === 0 && g.cabins[0] === CABINS[2] - 1, 'cabana gasta da reserva');
  ok(g.current === 1 && g.phase === 'place' && g.hands[0].length === 2, 'vez do outro, e a mão completou do saquinho');
  ok(!g.canPlace({ t: ['P', 'F'] }, 3, 0, 0), 'não sai do tabuleiro');
  ok(g.events.some(e => e.type === 'draw' && e.p === 0), 'evento de tirar do saquinho');
  give(g, ['M']);
  ok(g.place(0, -1, 0, 0) && g.cabin(null), 'pode não pôr cabana');
  ok(g.cabins[1] === CABINS[2] && g.round === 2 && g.current === 0, 'rodada 2, de novo o primeiro (ordem fixa)');
  const g2 = new Game({ map: TINY, players: [{ name: 'A' }, { name: 'B' }], seed: 1, cabins: 0 });
  give(g2, ['P']);
  g2.place(0, 1, 0, 0);
  ok(g2.phase === 'place' && g2.current === 1, 'sem cabana na reserva: pula a fase da cabana');
}

console.log('Maré');
{
  const c = tideCurve(TINY);
  ok(c[2] === 1 && c[4] === 2, 'cheias no fim das rodadas 2 e 4');
  ok(c[1] > 0 && c[1] < 1 && c[3] > 0 && c[3] < 2 && c[3] > c[1], `sobe aos poucos entre as cheias (${c.slice(1).map(v => v.toFixed(2)).join(' ')})`);
  ok(c[5] > 0 && c[5] < 1, 'depois da última cheia sobe sem chegar');
  for (const m of MAPS) {
    const cm = tideCurve(m);
    ok(cm.length === m.rounds + 1 && cm[m.rounds] >= 1, `${m.name}: a última rodada termina com maré cheia (o que conta é o que sobra)`);
  }
  const g = two();
  give(g, ['P', 'F']); g.place(0, 1, 0, 0); g.cabin(K(1, 0));          // A: cabana na praia
  give(g, ['M', 'P']); g.place(0, -1, 0, 3); g.cabin(K(-1, 0));        // B: cabana na montanha
  ok(g.land.size === 5 && g.round === 2, 'rodada 1 sem cheia: nada afundou');
  ok(Math.abs(g.tideNow() - c[1]) < 1e-9, 'na rodada 2 a maré está no nível do fim da rodada 1');
  give(g, ['F']); g.place(0, 0, 1, 0); g.cabin(null);
  give(g, ['P']); g.place(0, 0, -1, 0); g.cabin(null);
  const sink = g.events.find(e => e.type === 'sink');
  ok(sink && sink.level === 1, 'fim da rodada 2: maré cheia');
  ok([...g.land.values()].every(c => c.t !== 'P'), 'todas as praias afundaram');
  ok(g.land.has(K(2, 0)) && g.land.has(K(-1, 0)) && g.land.has(K(0, 1)), 'florestas, montanhas e rochedo ficaram');
  ok(g.drowned[0] === 1 && g.drowned[1] === 0, 'cabana da praia se perdeu');
  ok(g.tideNow() === 0, 'depois da cheia a maré baixa');
  give(g, ['P']);
  ok(g.canPlace(g.hands[0][0], 1, 0, 0), 'onde a praia afundou volta a ser mar');
  give(g, ['F']); g.place(0, 1, 1, 0); g.cabin(null);
  give(g, ['F']); g.place(0, -1, 1, 0); g.cabin(null);
  give(g, ['M']); g.place(0, 2, -1, 0); g.cabin(null);
  give(g, ['M']); g.place(0, -2, 1, 0); g.cabin(null);
  ok([...g.land.values()].every(c => HEIGHT[c.t] >= 3), 'cheia de nível 2: afundam praias e florestas');
  ok(g.round === 5 && !g.over, 'rodada 5');
  give(g, ['P']); g.place(0, 3, -2, 0); g.cabin(null);
  give(g, ['P']); g.place(0, -2, 2, 0); g.cabin(null);
  ok(g.over && g.result, 'depois da última rodada o jogo acaba');
}

console.log('Ilhas e disputa');
{
  const land = new Map();
  const put = (q, r, t, cabin = -1, at) => land.set(K(q, r), { q, r, t, cabin, at });
  // ilha 1: praia no meio ligando duas florestas
  put(0, 0, 'F', 0, 1); put(1, 0, 'P'); put(2, 0, 'F', 1, 2); put(3, 0, 'M', 1, 3);
  // ilha 2 separada
  put(-3, 2, 'M', 0, 4); put(-3, 3, 'F');
  let isl = findIslands(land, 2);
  ok(isl.length === 2, 'duas ilhas');
  const big = isl.find(i => i.size === 4);
  ok(big && big.owner === 1, 'ilha grande: dono é quem tem mais cabanas');
  let sc = scoreIslands(isl, 2);
  ok(sc.pts[1] === 4 + 2 && sc.pts[0] === 2 + 2 + 2, `dono leva o tamanho, segundo lugar leva metade, cada cabana de pé vale 1 (${sc.pts})`);
  const after = findIslands(land, 2, 1);
  ok(after.length === 3, 'praia afundando parte a ilha em duas');
  sc = scoreIslands(after, 2);
  ok(sc.pts[0] === 1 + 2 + 2 && sc.pts[1] === 2 + 2, `depois da cheia cada pedaço tem seu dono (${sc.pts})`);
  ok(islandOwner([1, 1], [2, 3]) === 1, 'empate de cabanas: ganha quem está mais alto');
  ok(islandOwner([1, 1], [2, 2], [5, 3]) === 1, 'empate de altura: ganha quem chegou primeiro');
  ok(islandOwner([0, 0], [0, 0]) === -1, 'sem cabana: sem dono');
  ok(islandOwner([2, 1, 2], [3, 3, 4]) === 2, 'três jogadores: maioria, depois altura');
  ok(vice([2, 1, 1], 0) === -1 && vice([2, 1, 0], 0) === 1, 'segundo lugar empatado não leva nada');
  const rock = new Map([[K(0, 0), { q: 0, r: 0, t: 'R', cabin: -1 }], [K(1, 0), { q: 1, r: 0, t: 'F', cabin: 0, at: 1 }]]);
  ok(scoreIslands(findIslands(rock, 2), 2).pts[0] === 2 + 1, 'rochedo conta no tamanho da ilha');
  const lone = new Map([[K(0, 0), { q: 0, r: 0, t: 'M', cabin: 0, at: 1 }], [K(1, 0), { q: 1, r: 0, t: 'M', cabin: 1, at: 2 }], [K(2, 0), { q: 2, r: 0, t: 'M', cabin: 1, at: 3 }], [K(3, 0), { q: 3, r: 0, t: 'M', cabin: 0, at: 4 }], [K(4, 0), { q: 4, r: 0, t: 'M', cabin: 0, at: 5 }], [K(5, 0), { q: 5, r: 0, t: 'M', cabin: 2, at: 6 }]]);
  ok(scoreIslands(findIslands(lone, 3), 3).pts[2] === 1, 'quem perdeu a ilha ainda marca 1 por cabana de pé');
}

console.log('Fim e desempate');
{
  const g = two();
  g.land.clear();
  const put = (q, r, t, cabin = -1) => g.land.set(K(q, r), { q, r, t, cabin, at: 1 });
  put(0, 0, 'M', 0); put(1, 0, 'M'); put(-3, 1, 'M', 1); put(-3, 2, 'M');
  g.cabins = [2, 1];
  g.finish();
  ok(g.result.pts[0] === 3 && g.result.pts[1] === 3, 'pontos empatados');
  ok(g.result.winners.length === 1 && g.result.winners[0] === 0, 'desempate: mais cabanas sobrando ganha');
  const g2 = two();
  g2.land.clear();
  g2.land.set(K(0, 0), { q: 0, r: 0, t: 'M', cabin: 0 }); g2.land.set(K(1, 0), { q: 1, r: 0, t: 'M', cabin: -1 });
  g2.land.set(K(-3, 1), { q: -3, r: 1, t: 'M', cabin: 1 }); g2.land.set(K(-3, 2), { q: -3, r: 2, t: 'M', cabin: -1 });
  g2.cabins = [3, 3];
  g2.finish();
  ok(g2.result.tie && g2.result.winners.length === 2, 'tudo igual: empate');
  ok(g2.phase === 'over' && !g2.place(0, 2, 0, 0), 'depois do fim não se joga');
}

console.log('Passar a vez');
{
  // tabuleiro de 3 casas: rochedo e duas casas de mar
  const map = { cells: [[0, 0], [1, 0], [2, 0]], reefs: [], start: [[0, 0, 'R']], rounds: 3, peaks: {} };
  const g = new Game({ map, players: [{ name: 'A' }, { name: 'B' }], seed: 2 });
  g.hands[0] = [{ id: 1, t: ['F', 'F'] }, { id: 2, t: ['M', 'M'] }];
  g.hands[1] = [{ id: 3, t: ['M', 'M'] }, { id: 4, t: ['F', 'F'] }];
  ok(g.place(0, 1, 0, 0) && g.cabin(null), 'A enche o mar');
  ok(g.events.some(e => e.type === 'pass' && e.p === 1), 'B não tinha onde pôr: passou sozinho');
  ok(g.over && g.events.filter(e => e.type === 'pass').length === 5, 'ninguém consegue jogar: todos passam até o fim');
}

console.log('IA');
{
  // Tubarão rouba a ilha de A encostando e pondo cabana mais alta
  const g = two();
  give(g, ['F', 'F']); g.place(0, 1, 0, 0); g.cabin(K(1, 0));
  g.hands[1] = [{ id: 50, t: ['M'] }, { id: 51, t: ['P'] }];
  const mv = chooseMove(g, OPPONENTS[1], rng(1));
  const piece = g.hands[1][mv.hi];
  ok(piece.t[0] === 'M' && mv.cabin === 0, `Tubarão põe a montanha com cabana para tomar a ilha (${piece.t.join('')}, cabana ${mv.cabin})`);
  g.play(mv);
  ok(g.islands().find(i => i.keys.includes(K(1, 0))).owner === 1, 'ilha agora é do Tubarão');
  // Mestra não põe cabana em praia que vai afundar no fim da rodada
  const h = two({ ...TINY, rounds: 12, peaks: { 2: 1, 12: 1 } });
  h.round = 2;
  h.hands[0] = [{ id: 60, t: ['P', 'P'] }, { id: 61, t: ['P'] }];
  const mv2 = chooseMove(h, OPPONENTS[2], rng(2));
  ok(mv2.cabin === -1, 'Vó Coral não gasta cabana na praia antes da cheia');
  // Todas as jogadas escolhidas são legais
  let legal = true;
  for (const [i, m] of MAPS.entries()) {
    const gg = new Game({ map: m, players: [{ name: 'A' }, { name: 'B' }, { name: 'C' }], seed: 40 + i });
    for (let k = 0; k < 6; k++) {
      const st = OPPONENTS[k % 3];
      const p = gg.current, mvx = chooseMove(gg, st, rng(k));
      const pc = gg.hands[p][mvx.hi];
      if (!gg.canPlace(pc, mvx.q, mvx.r, mvx.rot) || !gg.play(mvx)) legal = false;
    }
  }
  ok(legal, 'as jogadas da IA são sempre legais');
  const t0 = Date.now();
  const big = new Game({ map: MAPS[1], players: [{ name: 'A' }, { name: 'B' }, { name: 'C' }], seed: 3 });
  for (let k = 0; k < 9; k++) playTurn(big, OPPONENTS[1], rng(k));
  const t1 = Date.now();
  chooseMove(big, OPPONENTS[2], rng(1));
  const ms = Date.now() - t1;
  ok(ms < 2500, `mestra pensa rápido no mapa maior (${ms} ms)`);
  console.log(`  Vó Coral pensou em ${ms} ms (rodada ${big.round}, ${big.land.size} casas de terra)`);
}

console.log('Robô joga partidas inteiras nos 3 mapas');
{
  const t0 = Date.now();
  for (const [i, m] of MAPS.entries()) {
    for (const n of [2, 3]) {
      const sts = n === 2 ? [ROBOT, OPPONENTS[i % 3]] : [ROBOT, OPPONENTS[0], OPPONENTS[1]];
      const g = new Game({ map: m, players: sts.map(s => ({ name: s.name })), seed: 70 + i * 3 + n });
      const r = rng(i + n);
      let turns = 0, badCabin = false, overlap = false;
      while (!g.over && turns < 200) {
        const before = g.land.size;
        playTurn(g, sts[g.current], r);
        turns++;
        if (g.cabins.some(c => c < 0)) badCabin = true;
        if (g.land.size < before && !g.events.slice(-4).some(e => e.type === 'sink')) overlap = true;
      }
      const placed = g.moves.length;
      const res = g.result;
      ok(g.over && res, `${m.name}, ${n} jogadores: acabou`);
      ok(placed === g.rounds * n || g.events.some(e => e.type === 'pass'), `${m.name}, ${n}: cada um pôs uma peça por rodada (${placed})`);
      ok(!badCabin && !overlap, `${m.name}, ${n}: cabanas e terra sempre coerentes`);
      const sunkRounds = g.events.filter(e => e.type === 'sink').map(e => e.round);
      ok(sunkRounds.join() === Object.keys(m.peaks).join(), `${m.name}, ${n}: cheias nas rodadas certas (${sunkRounds})`);
      ok([...g.land.values()].every(c => HEIGHT[c.t] > m.peaks[m.rounds]), `${m.name}, ${n}: no fim só sobra o que fica acima da última cheia`);
      ok(res.pts.reduce((a, b) => a + b, 0) > 0 && res.pts.every(p => p >= 0), `${m.name}, ${n}: alguém pontuou`);
      console.log(`  ${m.name.padEnd(20)} ${n} jogadores: ${res.pts.join(' x ')}  (${res.islands.length} ilhas, ${g.drowned.reduce((a, b) => a + b, 0)} cabanas afogadas, vencedor ${res.winners.map(w => sts[w].name).join(' e ')})`);
    }
  }
  console.log(`  ${((Date.now() - t0) / 1000).toFixed(1)} s`);
}

console.log('Adversários mais fortes ganham dos mais fracos');
{
  const duel = (a, b, N) => {
    let wa = 0;
    const lines = [];
    for (const m of MAPS) for (let s = 0; s < N; s++) for (const swap of [0, 1]) {
      const sts = swap ? [b, a] : [a, b];
      const g = new Game({ map: m, players: sts.map(x => ({ name: x.name })), seed: 500 + s });
      const r = rng(s * 7 + swap + 1);
      while (!g.over) playTurn(g, sts[g.current], r);
      const ia = swap ? 1 : 0;
      if (g.result.winners.includes(ia)) wa += 1 / g.result.winners.length;
      lines.push(`${g.result.pts[ia]}x${g.result.pts[1 - ia]}`);
    }
    return { wa, games: lines.length, lines };
  };
  const t0 = Date.now();
  const d1 = duel(OPPONENTS[2], OPPONENTS[0], 3);
  console.log(`  Vó Coral x Capitã Marola: ${d1.wa} de ${d1.games} (${d1.lines.join(' ')})`);
  ok(d1.wa > d1.games / 2, 'Vó Coral ganha a maioria da Capitã Marola');
  const d2 = duel(OPPONENTS[0], OPPONENTS[1], 3);
  console.log(`  Capitã Marola x Zé Tubarão: ${d2.wa} de ${d2.games} (${d2.lines.join(' ')})`);
  ok(d2.wa > d2.games / 2, 'Capitã Marola ganha a maioria do Zé Tubarão');
  const tubScored = d2.lines.filter(l => +l.split('x')[1] > 0).length;
  ok(tubScored >= d2.games * 0.75, `Zé Tubarão marca pontos em quase todas as partidas a dois (${tubScored} de ${d2.games})`);
  // Mesa de 3 contra o robô e a Vó Coral (o caso mais duro): o fácil ainda tem que jogar de verdade
  let scored = 0, drowned = 0, n3 = 0;
  const l3 = [];
  let tubPts = 0;
  for (const [i, m] of MAPS.entries()) for (let s = 0; s < 3; s++) {
    const sts = [ROBOT, OPPONENTS[1], OPPONENTS[2]];
    const g = new Game({ map: m, players: sts.map(x => ({ name: x.name })), seed: 700 + s * 13 + i });
    const r = rng(s + 3 * i + 3);
    while (!g.over) playTurn(g, sts[g.current], r);
    n3++;
    if (g.result.pts[1] > 0) scored++;
    tubPts += g.result.pts[1];
    drowned += g.drowned[1];
    l3.push(g.result.pts.join('x'));
  }
  console.log(`  Robô x Zé Tubarão x Vó Coral: ${l3.join(' ')} (Tubarão afogou ${(drowned / n3).toFixed(1)} cabanas por partida)`);
  // Com a IA antiga do Tubarão (quase cega para a maré) dava 6 de 9, 6,4 pontos e 3,8 afogadas.
  ok(scored >= 7, `Zé Tubarão marca pontos em quase todas as partidas a três (${scored} de ${n3})`);
  ok(tubPts / n3 >= 9, `Zé Tubarão faz pontos de verdade a três (${(tubPts / n3).toFixed(1)} em média)`);
  ok(drowned / n3 <= 3.4, `Zé Tubarão não perde as cabanas para a maré (${(drowned / n3).toFixed(1)} por partida)`);
  console.log(`  ${((Date.now() - t0) / 1000).toFixed(1)} s`);
}

console.log('Jogo inteiro (main.js) com navegador e controle de VR falsos');
{
  const root = fileURLToPath(new URL('..', import.meta.url));
  const r = spawnSync(process.execPath, ['--import', './tests/smoke/register.js', 'tests/smoke/main.js'], { cwd: root, stdio: 'inherit' });
  ok(r.status === 0, 'teste do main.js (tests/smoke/main.js)');
}

console.log(fails ? `\n${fails} de ${count} verificações falharam` : `\nTudo certo (${count} verificações)`);
process.exit(fails ? 1 : 0);
