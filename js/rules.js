// Regras do Arquipélago: peças, saquinho, colocação, cabanas, maré, ilhas e pontuação.
// Sem navegador nem Three.js (os testes rodam no Node).
import { DIRS, K, unK } from './hex.js';

export const HEIGHT = { P: 1, F: 2, M: 3, R: 4 };
export const TNAME = { P: 'praia', F: 'floresta', M: 'montanha', R: 'rochedo' };
export const TNAME_PL = { P: 'praias', F: 'florestas', M: 'montanhas', R: 'rochedos' };

// Tipos de peça no saquinho e quantas de cada em cada "lote" de 21 peças.
export const PIECE_KINDS = [['P'], ['F'], ['M'], ['P', 'P'], ['P', 'F'], ['F', 'F'], ['F', 'M'], ['P', 'M'], ['M', 'M']];
export const BAG_WEIGHTS = [4, 3, 2, 2, 3, 2, 2, 2, 1];
export const HAND = 2;                       // peças na mão de cada um (todo mundo vê)
export const CABINS = { 2: 7, 3: 6 };        // cabanas de cada jogador
export const CABIN_PT = 1;                   // cada cabana de pé no fim vale 1 ponto

export function rng(seed = 1) {
  let s = (seed >>> 0) || 1;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(a, rand) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Saquinho: lotes de 21 peças embaralhados um a um (a mistura fica parecida do começo ao fim).
export function makeBag(count, rand) {
  const lot = [];
  PIECE_KINDS.forEach((t, i) => { for (let k = 0; k < BAG_WEIGHTS[i]; k++) lot.push(t); });
  const out = [];
  while (out.length < count) out.push(...shuffle(lot.slice(), rand));
  return out.slice(0, count).map((t, i) => ({ id: i + 1, t: t.slice() }));
}

// Quantas posições de giro uma peça tem de verdade (sozinha: 1; dupla igual: 3; dupla mista: 6).
export function rotCount(piece) {
  if (piece.t.length === 1) return 1;
  return piece.t[0] === piece.t[1] ? 3 : 6;
}

// Casas que a peça ocupa com a primeira casa em (q, r) e a segunda na direção rot.
export function pieceCells(piece, q, r, rot) {
  const out = [[q, r, piece.t[0]]];
  if (piece.t.length > 1) {
    const d = DIRS[((rot % 6) + 6) % 6];
    out.push([q + d[0], r + d[1], piece.t[1]]);
  }
  return out;
}

// Valor da maré no fim de cada rodada (1..rounds): sobe em linha reta até a próxima cheia e,
// depois da cheia, volta a 0 (vazante). Depois da última cheia sobe rumo a 1 sem chegar.
export function tideCurve(map) {
  const out = [0];
  const peakRounds = Object.keys(map.peaks).map(Number).sort((a, b) => a - b);
  for (let r = 1; r <= map.rounds; r++) {
    if (map.peaks[r]) { out.push(map.peaks[r]); continue; }
    const p0 = peakRounds.filter(p => p < r).pop() ?? 0;
    const p1 = peakRounds.find(p => p > r);
    const end = p1 ?? map.rounds + 2;
    const lvl = p1 ? map.peaks[p1] : 1;
    out.push(lvl * (r - p0) / (end - p0));
  }
  return out;
}

export class Game {
  // map: de maps.js; players: [{ name, ... }]; seed: embaralha o saquinho.
  constructor({ map, players, seed = 1, cabins }) {
    this.map = map;
    this.n = players.length;
    this.players = players.map((p, i) => ({ ...p, idx: i }));
    this.rand = rng(seed);
    this.cells = new Set(map.cells.map(([q, r]) => K(q, r)));
    this.reefs = new Set((map.reefs || []).map(([q, r]) => K(q, r)));
    for (const k of this.reefs) this.cells.delete(k);
    this.land = new Map();
    for (const [q, r, t] of map.start) this.land.set(K(q, r), { q, r, t, cabin: -1, born: 0 });
    this.rounds = map.rounds;
    this.peaks = map.peaks;
    this.curve = tideCurve(map);
    this.cabins = Array(this.n).fill(cabins ?? CABINS[this.n] ?? 6);
    this.drowned = Array(this.n).fill(0);
    this.bag = makeBag(this.n * (this.rounds + HAND) + 6, this.rand);
    this.hands = this.players.map(() => []);
    for (let k = 0; k < HAND; k++) for (const h of this.hands) h.push(this.bag.shift());
    this.round = 1;
    this.turn = 0;
    this.current = this.starter(1);
    this.phase = 'place';
    this.placed = null;     // chaves das casas da peça que acabou de ser posta (fase da cabana)
    this.events = [];
    this.moves = [];        // histórico: { p, piece, q, r, rot, cabin }
    this.result = null;
    this.stamp = 0;         // ordem das cabanas (desempate: quem chegou primeiro)
    this.skipPasses();
  }

  starter() { return 0; }   // toda rodada na mesma ordem (testado: girar quem começa desequilibra)
  order(round = this.round) { const s = this.starter(round); return Array.from({ length: this.n }, (_, i) => (s + i) % this.n); }
  turnIndexOf(p) { return (p - this.starter(this.round) + this.n) % this.n; }
  get over() { return this.phase === 'over'; }

  // Maré na tela durante a rodada atual (o que sobrou da rodada anterior).
  tideNow() { const prev = this.curve[this.round - 1] ?? 0; return this.peaks[this.round - 1] ? 0 : prev; }
  tideEnd(round = this.round) { return this.curve[round] ?? 0; }
  nextPeak(from = this.round) {
    for (let r = from; r <= this.rounds; r++) if (this.peaks[r]) return { round: r, level: this.peaks[r] };
    return null;
  }
  // Maior cheia que ainda falta (o que sobrevive até o fim, se ninguém puser mais nada).
  worstPeak(from = this.round) {
    let m = 0;
    for (let r = from; r <= this.rounds; r++) m = Math.max(m, this.peaks[r] || 0);
    return m;
  }

  isFree(k) { return this.cells.has(k) && !this.land.has(k); }
  touchesLand(q, r) {
    for (const [dq, dr] of DIRS) if (this.land.has(K(q + dq, r + dr))) return true;
    return false;
  }

  // Pode pôr a peça aqui? Todas as casas no mar livre (dentro do tabuleiro, sem coral) e pelo
  // menos uma encostada em terra que já existe.
  canPlace(piece, q, r, rot) {
    const cs = pieceCells(piece, q, r, rot);
    let touch = false;
    for (const [cq, cr] of cs) {
      if (!this.isFree(K(cq, cr))) return false;
      if (!touch && this.touchesLand(cq, cr)) touch = true;
    }
    return touch;
  }

  // Todas as jogadas da peça hi da mão de p (sem repetir posições iguais).
  legalPlacements(hi, p = this.current) {
    const piece = this.hands[p][hi];
    if (!piece) return [];
    const out = [], seen = new Set();
    for (const k of this.cells) {
      if (this.land.has(k)) continue;
      const [q, r] = unK(k);
      for (let rot = 0; rot < (piece.t.length > 1 ? 6 : 1); rot++) {
        if (!this.canPlace(piece, q, r, rot)) continue;
        const cs = pieceCells(piece, q, r, rot);
        const sig = cs.map(([a, b, t]) => `${K(a, b)}${t}`).sort().join('|');
        if (seen.has(sig)) continue;
        seen.add(sig);
        out.push({ hi, q, r, rot });
      }
    }
    return out;
  }
  hasMove(p = this.current) {
    for (let hi = 0; hi < this.hands[p].length; hi++) {
      const piece = this.hands[p][hi];
      for (const k of this.cells) {
        if (this.land.has(k)) continue;
        const [q, r] = unK(k);
        for (let rot = 0; rot < (piece.t.length > 1 ? 6 : 1); rot++) if (this.canPlace(piece, q, r, rot)) return true;
      }
    }
    return false;
  }

  place(hi, q, r, rot) {
    if (this.phase !== 'place') return false;
    const p = this.current, piece = this.hands[p][hi];
    if (!piece || !this.canPlace(piece, q, r, rot)) return false;
    const cs = pieceCells(piece, q, r, rot);
    for (const [cq, cr, t] of cs) this.land.set(K(cq, cr), { q: cq, r: cr, t, cabin: -1, born: this.round, piece: piece.id });
    this.hands[p].splice(hi, 1);
    this.placed = cs.map(([cq, cr]) => K(cq, cr));
    this.moves.push({ p, piece, q, r, rot, cabin: -1, round: this.round });
    this.events.push({ type: 'place', p, piece, q, r, rot, cells: cs });
    if (this.cabins[p] > 0) this.phase = 'cabin';
    else this.endTurn();
    return true;
  }

  // Cabana numa das casas da peça que acabou de pôr (k = chave), ou null para não pôr.
  cabin(k) {
    if (this.phase !== 'cabin') return false;
    const p = this.current;
    if (k != null) {
      if (!this.placed.includes(k) || this.cabins[p] <= 0) return false;
      const c = this.land.get(k);
      if (!c || c.cabin >= 0 || c.t === 'R') return false;
      c.cabin = p;
      c.at = ++this.stamp;
      this.cabins[p]--;
      this.moves[this.moves.length - 1].cabin = this.placed.indexOf(k);
      this.events.push({ type: 'cabin', p, k, q: c.q, r: c.r });
    }
    this.endTurn();
    return true;
  }

  // Jogada completa de uma vez (IA, robô, testes). cabin: índice da casa na peça (0/1) ou -1.
  play(mv) {
    if (mv.pass) return this.pass();
    const p = this.current;
    const piece = this.hands[p][mv.hi];
    if (!this.place(mv.hi, mv.q, mv.r, mv.rot)) return false;
    if (this.phase === 'cabin' && this.current === p) {
      const cs = pieceCells(piece, mv.q, mv.r, mv.rot);
      const c = mv.cabin >= 0 ? cs[mv.cabin] : null;
      if (!this.cabin(c ? K(c[0], c[1]) : null)) this.cabin(null);
    }
    return true;
  }

  pass() {
    if (this.phase !== 'place' || this.hasMove()) return false;
    this.events.push({ type: 'pass', p: this.current });
    this.endTurn();
    return true;
  }

  endTurn() {
    const p = this.current;
    while (this.hands[p].length < HAND && this.bag.length) {
      const piece = this.bag.shift();
      this.hands[p].push(piece);
      this.events.push({ type: 'draw', p, piece });
    }
    this.placed = null;
    this.phase = 'place';
    this.turn++;
    if (this.turn >= this.n) this.endRound();
    else this.current = (this.starter(this.round) + this.turn) % this.n;
    if (!this.over) this.skipPasses();
  }

  // Quem não tem onde pôr passa a vez sozinho (raro: tabuleiro cheio).
  skipPasses() {
    let guard = 0;
    while (!this.over && this.phase === 'place' && !this.hasMove() && guard++ < 100) {
      this.events.push({ type: 'pass', p: this.current });
      this.endTurn();
    }
  }

  endRound() {
    const level = this.peaks[this.round] || 0;
    this.events.push({ type: 'roundEnd', round: this.round, tide: this.curve[this.round], peak: level });
    if (level) this.sink(level);
    this.round++;
    this.turn = 0;
    if (this.round > this.rounds) { this.finish(); return; }
    this.current = this.starter(this.round);
  }

  // Maré cheia: tudo o que tem altura até o nível afunda (e as cabanas em cima se perdem).
  sink(level) {
    const sunk = [];
    for (const [k, c] of this.land) {
      if (HEIGHT[c.t] <= level) {
        sunk.push({ k, ...c });
        if (c.cabin >= 0) this.drowned[c.cabin]++;
        this.land.delete(k);
      }
    }
    this.events.push({ type: 'sink', level, round: this.round, sunk });
    return sunk;
  }

  islands(sinkLevel = 0) { return findIslands(this.land, this.n, sinkLevel); }
  scores(sinkLevel = 0) { return scoreIslands(this.islands(sinkLevel), this.n); }

  finish() {
    this.phase = 'over';
    const isl = this.islands();
    const sc = scoreIslands(isl, this.n);
    const rank = this.players.map((_, p) => ({ p, pts: sc.pts[p], big: sc.big[p], left: this.cabins[p] }));
    const better = (a, b) => a.pts - b.pts || a.big - b.big || a.left - b.left;
    rank.sort((a, b) => better(b, a));
    const winners = rank.filter(x => better(x, rank[0]) === 0).map(x => x.p);
    this.result = { pts: sc.pts, big: sc.big, islands: isl, rank, winners, tie: winners.length > 1 };
    this.events.push({ type: 'over', result: this.result });
  }

  // Cópia para a IA pensar (sem histórico nem eventos).
  clone() {
    const g = Object.create(Game.prototype);
    Object.assign(g, this);
    g.land = new Map([...this.land].map(([k, c]) => [k, { ...c }]));
    g.hands = this.hands.map(h => h.slice());
    g.bag = this.bag.slice();
    g.cabins = this.cabins.slice();
    g.drowned = this.drowned.slice();
    g.events = [];
    g.moves = [];
    g.placed = this.placed ? this.placed.slice() : null;
    return g;
  }
}

// Ilhas: grupos de terra ligados (só o que fica acima do nível sinkLevel). Para cada uma:
// casas, tamanho, cabanas de cada jogador, soma das alturas das cabanas e dono.
export function findIslands(land, n, sinkLevel = 0) {
  const seen = new Set(), out = [];
  for (const [k0, c0] of land) {
    if (seen.has(k0) || HEIGHT[c0.t] <= sinkLevel) continue;
    const isl = { keys: [], size: 0, votes: Array(n).fill(0), alt: Array(n).fill(0), first: Array(n).fill(Infinity), owner: -1 };
    const stack = [k0];
    seen.add(k0);
    while (stack.length) {
      const k = stack.pop();
      const c = land.get(k);
      isl.keys.push(k);
      isl.size++;
      if (c.cabin >= 0) { isl.votes[c.cabin]++; isl.alt[c.cabin] += HEIGHT[c.t]; isl.first[c.cabin] = Math.min(isl.first[c.cabin], c.at ?? Infinity); }
      for (const [dq, dr] of DIRS) {
        const k2 = K(c.q + dq, c.r + dr);
        if (seen.has(k2)) continue;
        const c2 = land.get(k2);
        if (!c2 || HEIGHT[c2.t] <= sinkLevel) continue;
        seen.add(k2);
        stack.push(k2);
      }
    }
    isl.owner = islandOwner(isl.votes, isl.alt, isl.first);
    out.push(isl);
  }
  return out;
}

// Dono da ilha: quem tem mais cabanas. Empate: quem tem as cabanas mais altas (soma das
// alturas). Empate de novo: quem pôs cabana na ilha primeiro. Sem cabana: ninguém.
export function islandOwner(votes, alt, first) {
  let who = -1;
  for (let p = 0; p < votes.length; p++) {
    if (!votes[p]) continue;
    if (who < 0 || votes[p] > votes[who] || (votes[p] === votes[who] && (alt[p] > alt[who] || (alt[p] === alt[who] && first && first[p] < first[who])))) who = p;
  }
  return who;
}

// Pontos: cada cabana de pé vale 1; o dono leva o tamanho da ilha; o segundo com mais cabanas
// (sem empate) leva metade.
export function scoreIslands(islands, n) {
  const pts = Array(n).fill(0), big = Array(n).fill(0);
  for (const isl of islands) {
    if (CABIN_PT) for (let p = 0; p < n; p++) pts[p] += isl.votes[p] * CABIN_PT;
    const o = isl.owner;
    if (o < 0) continue;
    pts[o] += isl.size;
    big[o] = Math.max(big[o], isl.size);
    const v = vice(isl.votes, o);
    if (v >= 0) pts[v] += Math.floor(isl.size / 2);
  }
  return { pts, big };
}

// Segundo lugar da ilha: quem tem mais cabanas fora o dono (empate aqui: ninguém).
export function vice(votes, owner) {
  let bv = 0, who = [];
  for (let p = 0; p < votes.length; p++) {
    if (p === owner || !votes[p]) continue;
    if (votes[p] > bv) { bv = votes[p]; who = [p]; } else if (votes[p] === bv) who.push(p);
  }
  return who.length === 1 ? who[0] : -1;
}
