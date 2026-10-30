// Grade hexagonal em coordenadas axiais (q, r), hexágono "de ponta para cima".
// Sem navegador: usado pelas regras, pela IA e pelos testes.

// As 6 vizinhas, em sentido anti-horário visto de cima, começando pela direita (+x).
export const DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];

// Chave inteira de uma casa (cabe em tabuleiros até raio 30).
export const K = (q, r) => (q + 32) * 64 + (r + 32);
export const unK = (k) => [Math.floor(k / 64) - 32, (k % 64) - 32];

export const hexDist = (q, r, q2 = 0, r2 = 0) => {
  const dq = q - q2, dr = r - r2;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
};

export function neighbors(q, r) {
  return DIRS.map(([dq, dr]) => [q + dq, r + dr]);
}

// Todas as casas até um raio, a partir do centro.
export function disk(radius) {
  const out = [];
  for (let q = -radius; q <= radius; q++) {
    for (let r = Math.max(-radius, -q - radius); r <= Math.min(radius, -q + radius); r++) out.push([q, r]);
  }
  return out;
}

// Centro de uma casa no plano (x para a direita, z para perto de quem olha), com lado = size.
export function hexToXZ(q, r, size) {
  return [size * Math.sqrt(3) * (q + r / 2), size * 1.5 * r];
}

// Casa mais próxima de um ponto do plano.
export function xzToHex(x, z, size) {
  const qf = (Math.sqrt(3) / 3 * x - z / 3) / size;
  const rf = (2 / 3 * z) / size;
  return hexRound(qf, rf);
}

export function hexRound(qf, rf) {
  const sf = -qf - rf;
  let q = Math.round(qf), r = Math.round(rf);
  const s = Math.round(sf);
  const dq = Math.abs(q - qf), dr = Math.abs(r - rf), ds = Math.abs(s - sf);
  if (dq > dr && dq > ds) q = -r - s;
  else if (dr > ds) r = -q - s;
  return [q, r];
}

// Ângulo (no plano, radianos, a partir de +x, girando para -z) da direção DIRS[i].
export function dirAngle(i) {
  return i * Math.PI / 3;
}
