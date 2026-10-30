// Progresso e opções, salvos no navegador.
const KEY = 'arquipelagovr.v1';
const DEFAULTS = {
  map: 0,                 // último mapa escolhido
  opps: [0],              // adversários escolhidos (índices de OPPONENTS, 1 ou 2)
  wins: {},               // vitórias por mapa e número de adversários: { 'enseada-1': 2 }
  games: {},              // partidas jogadas, mesma chave
  best: {},               // maior pontuação, mesma chave
  beat: [0, 0, 0],        // quantas vezes ganhou de cada adversário
  sound: true,
  fps: false,
  seen: false,            // já viu as regras
};

export function loadSave() {
  try {
    const s = { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') };
    for (const k of ['wins', 'games', 'best']) if (typeof s[k] !== 'object' || !s[k]) s[k] = {};
    if (!Array.isArray(s.opps) || !s.opps.length || s.opps.length > 2) s.opps = [0];
    if (!Array.isArray(s.beat) || s.beat.length !== 3) s.beat = [0, 0, 0];
    return s;
  } catch { return { ...DEFAULTS, wins: {}, games: {}, best: {}, opps: [0], beat: [0, 0, 0] }; }
}

export function storeSave(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* sem armazenamento: segue sem salvar */ }
}
