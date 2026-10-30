// Navegador de mentira: só o que o main.js usa (elementos, canvas 2D, eventos, localStorage).
const ctx2d = () => new Proxy({}, {
  get: (o, k) => k === 'measureText' ? (t) => ({ width: String(t).length * 14 })
    : /^create.*Gradient$/.test(k) ? () => ({ addColorStop() {} })
    : (k in o ? o[k] : () => {}),
  set: (o, k, v) => { o[k] = v; return true; },
});
export function fakeEl() {
  const handlers = {};
  return {
    style: {}, dataset: {}, handlers, innerHTML: '', textContent: '', width: 800, height: 600,
    addEventListener: (t, f) => { (handlers[t] ||= []).push(f); }, appendChild() {}, getContext: ctx2d,
  };
}
if (!globalThis.document) {
  const els = {};
  globalThis.document = { createElement: () => fakeEl(), getElementById: (id) => (els[id] ||= fakeEl()), els };
  globalThis.window = globalThis;
  const wh = {};
  Object.assign(globalThis, { innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1, isSecureContext: false, windowHandlers: wh });
  globalThis.addEventListener = (t, f) => { (wh[t] ||= []).push(f); };
  const store = {};
  globalThis.localStorage = { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = v; } };
}
