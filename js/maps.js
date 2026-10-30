// Os 3 mapas: forma do mar, corais (onde não se põe peça), terra do começo e a tabela da maré.
// peaks: { rodada: nível } = no fim daquela rodada a maré enche e afunda tudo com altura até o
// nível (1 = praias, 2 = praias e florestas). Sem navegador.
import { disk, hexDist } from './hex.js';

export const MAPS = [
  {
    id: 'enseada',
    name: 'Enseada Mansa',
    desc: 'Mar calmo, quatro rochedos e umas ilhotas. A maré enche nas rodadas 3, 6 e 12 (praias) e na 9 (florestas).',
    radius: 5,
    cells: disk(5),
    reefs: [],
    start: [
      [0, 0, 'R'], [1, -1, 'F'], [-1, 1, 'P'],
      [-4, 1, 'R'], [-3, 1, 'P'],
      [4, -3, 'R'], [3, -2, 'F'],
      [1, 3, 'R'],
    ],
    rounds: 12,
    peaks: { 3: 1, 6: 1, 9: 2, 12: 1 },
  },
  {
    id: 'atol',
    name: 'Atol das Marés',
    desc: 'Seis rochedos em anel em volta da laguna de coral. Maré brava: enche nas rodadas 2, 5 e 12 (praias) e na 8 (florestas).',
    radius: 6,
    cells: disk(6),
    reefs: disk(1),
    start: [[4, 0, 'R'], [0, 4, 'R'], [-4, 4, 'R'], [-4, 0, 'R'], [0, -4, 'R'], [4, -4, 'R']],
    rounds: 12,
    peaks: { 2: 1, 5: 1, 8: 2, 12: 1 },
  },
  {
    id: 'estreito',
    name: 'Estreito dos Corais',
    desc: 'Duas ilhas grandes com montanha, separadas por corais com três passagens. Cheias nas rodadas 4 e 12 (praias) e 8 (florestas).',
    radius: 5,
    cells: disk(5),
    reefs: [[-5, 0], [-4, 0], [-3, 0], [-1, 0], [1, 0], [3, 0], [4, 0], [5, 0]].filter(([q, r]) => hexDist(q, r) <= 5),
    start: [
      [-1, -3, 'R'], [0, -3, 'M'], [-2, -2, 'F'], [1, -4, 'P'],
      [1, 3, 'R'], [0, 3, 'M'], [2, 2, 'F'], [-1, 4, 'P'],
    ],
    rounds: 12,
    peaks: { 4: 1, 8: 2, 12: 1 },
  },
];
