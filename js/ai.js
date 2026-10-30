// Adversários do computador e o robô que joga sozinho. Sem navegador.
// Cada jogada candidata (peça da mão × posição × giro × cabana ou não) é aplicada no tabuleiro,
// avaliada e desfeita. A avaliação olha o placar agora, depois da próxima cheia e depois da
// pior cheia que ainda falta, e pesa isso pelo estilo de cada um.
import { pieceCells, findIslands, scoreIslands, HEIGHT, rng } from './rules.js';
import { K } from './hex.js';

export { rng };

export const OPPONENTS = [
  {
    id: 'marola', name: 'Capitã Marola', color: 0x2f7fe0, hat: 'quepe',
    desc: 'Cautelosa: cresce a própria ilha, foge de briga e guarda as cabanas no alto.',
    tide: 0.7, now: 0.3, all: 1.2, opp: 0.35, keep: 1.1, contest: -1.2, safe: 2.0, doom: 3, noise: 4.5, ply: 0,
  },
  {
    id: 'tubarao', name: 'Zé Tubarão', color: 0x9a4fd0, hat: 'bandana',
    desc: 'Invasor: gruda nas suas ilhas, rouba a maioria e gasta cabana sem dó.',
    tide: 0.7, now: 0.2, all: 1.5, opp: 1.0, keep: 0.8, contest: 1.2, safe: 0.8, doom: 1.5, noise: 4.5, ply: 0,
  },
  {
    id: 'coral', name: 'Vó Coral', color: 0x14a37f, hat: 'chapéu',
    desc: 'Mestra: lê a maré antes de todo mundo e pensa na sua resposta.',
    tide: 1.0, now: 0.2, all: 1.5, opp: 0.8, keep: 1.5, contest: 0, safe: 1.0, doom: 3, noise: 0.25, ply: 6,
  },
];
// Robô que joga no lugar do jogador (dev.autoplay e testes): como a mestra, sem erro.
export const ROBOT = { id: 'robo', name: 'Robô', tide: 1.0, all: 1.0, opp: 0.8, keep: 1.5, contest: 0, safe: 1.0, doom: 3, noise: 0, ply: 4 };
// Como a IA imagina a resposta dos outros (rápida, sem estilo).
const GREEDY = { tide: 1.0, opp: 0.6, keep: 1.0, contest: 0, safe: 0, noise: 0, ply: 0, quick: true };

function gauss(rand) {
  const u = Math.max(1e-9, rand()), v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// Valor do tabuleiro (como está agora em g.land) para o jogador me.
export function evaluate(g, me, st) {
  const n = g.n;
  const peak = g.nextPeak();
  const now = scoreIslands(findIslands(g.land, n, 0), n).pts;
  const next = peak ? scoreIslands(findIslands(g.land, n, peak.level), n).pts : now;
  const worst = g.worstPeak();
  const all = !st.quick && worst > (peak ? peak.level : 0) ? scoreIslands(findIslands(g.land, n, worst), n).pts : next;
  const d = peak ? peak.round - g.round : 99;
  const wNext = st.tide * (d <= 0 ? 1 : d === 1 ? 0.6 : 0.35);
  const wAll = st.tide * (st.all ?? 0.25);
  const wNow = st.now ?? 1 - Math.min(1, wNext) * 0.8;
  const val = (p) => wNow * now[p] + wNext * next[p] + wAll * all[p];
  let opp = 0, sum = 0;
  for (let p = 0; p < n; p++) if (p !== me) { const v = val(p); opp = Math.max(opp, v); sum += v; }
  if (n > 2) opp = 0.65 * opp + 0.35 * sum / (n - 1);
  const turnsLeft = g.rounds - g.round + (g.turnIndexOf(me) > g.turn ? 1 : 0);
  return val(me) - st.opp * opp + st.keep * Math.min(g.cabins[me], turnsLeft);
}

// Ajustes de estilo para uma cabana posta na casa k.
function styleBonus(g, me, st, k) {
  if (k == null) return 0;
  let b = 0;
  const c = g.land.get(k);
  const peak = g.nextPeak();
  if (st.safe && peak && HEIGHT[c.t] <= peak.level) b -= st.safe;
  // Cabana em casa que ainda vai afundar antes do fim não conta nada na contagem final
  // (só dura até a cheia). Quem lê a maré quase nunca faz isso.
  const doomed = HEIGHT[c.t] <= g.worstPeak();
  if (doomed) b -= st.doom ?? 0;
  // invadir só conta como vantagem onde a cabana vai sobreviver
  if (st.contest && !(doomed && st.contest > 0)) {
    // cabana numa ilha onde já tem cabana de outro jogador
    for (const isl of findIslands(g.land, g.n, 0)) {
      if (!isl.keys.includes(k)) continue;
      if (isl.votes.some((v, p) => p !== me && v > 0)) b += st.contest;
      break;
    }
  }
  return b;
}

// Gerador: devolve (return) a jogada { hi, q, r, rot, cabin } ou { pass: true }. Faz yield de
// tempos em tempos para o navegador poder pensar aos pedaços sem travar a imagem.
export function* chooseMoveGen(g, st, rand = Math.random) {
  const me = g.current;
  if (g.phase !== 'place' || !g.hasMove(me)) return { pass: true };
  const cands = [];
  let count = 0;
  for (let hi = 0; hi < g.hands[me].length; hi++) {
    const piece = g.hands[me][hi];
    for (const pl of g.legalPlacements(hi, me)) {
      const cs = pieceCells(piece, pl.q, pl.r, pl.rot);
      const keys = cs.map(([q, r]) => K(q, r));
      cs.forEach(([q, r, t], i) => g.land.set(keys[i], { q, r, t, cabin: -1 }));
      const opts = [-1];
      if (g.cabins[me] > 0) cs.forEach((_, i) => opts.push(i));
      for (const ci of opts) {
        if (ci >= 0) { const c = g.land.get(keys[ci]); c.cabin = me; c.at = g.stamp + 1; g.cabins[me]--; }
        let v = evaluate(g, me, st) + styleBonus(g, me, st, ci >= 0 ? keys[ci] : null);
        if (ci >= 0) { g.land.get(keys[ci]).cabin = -1; g.cabins[me]++; }
        if (st.noise) v += gauss(rand) * st.noise;
        cands.push({ hi, q: pl.q, r: pl.r, rot: pl.rot, cabin: ci, v });
      }
      for (const k of keys) g.land.delete(k);
      if (++count % 20 === 0) yield;
    }
  }
  cands.sort((a, b) => b.v - a.v);
  if (!st.ply || cands.length < 2) return cands[0];
  // Mestra: para as melhores, imagina os outros respondendo até a vez dela voltar (com a
  // maré enchendo no meio, se for o caso) e fica com a que aguenta melhor.
  let best = cands[0], bestV = -Infinity;
  for (const mv of cands.slice(0, st.ply)) {
    const g2 = g.clone();
    g2.play(mv);
    let guard = 0;
    while (!g2.over && g2.current !== me && guard++ < 4) {
      const reply = yield* chooseMoveGen(g2, GREEDY, rand);
      if (!reply || !g2.play(reply)) break;
    }
    const v = g2.over ? finalValue(g2, me) : evaluate(g2, me, { ...st, noise: 0 });
    if (v + mv.v * 0.05 > bestV) { bestV = v + mv.v * 0.05; best = mv; }
  }
  return best;
}

function finalValue(g, me) {
  const pts = g.result.pts;
  let opp = 0;
  for (let p = 0; p < g.n; p++) if (p !== me) opp = Math.max(opp, pts[p]);
  return pts[me] - opp + (g.result.winners.includes(me) ? 3 : 0);
}

export function chooseMove(g, st, rand) {
  const gen = chooseMoveGen(g, st, rand);
  let r;
  do { r = gen.next(); } while (!r.done);
  return r.value;
}

// A vez inteira de uma vez (testes): escolhe e joga.
export function playTurn(g, st, rand) {
  const mv = chooseMove(g, st, rand);
  if (!mv || mv.pass) return g.pass() ? mv : null;
  g.play(mv);
  return mv;
}
