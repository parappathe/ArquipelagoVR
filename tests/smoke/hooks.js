// Ganchos do Node para o teste do main.js: troca o Three.js por um que tem um WebGLRenderer
// falso (sem placa de vídeo), o resto do Three.js é o de verdade.
const WRAP = new URL('./three-wrap.js', import.meta.url).href;
export async function resolve(spec, ctx, next) {
  if (spec.endsWith('three.module.js') && !spec.includes('?real') && !ctx.parentURL?.endsWith('three-wrap.js')) return { url: WRAP, shortCircuit: true };
  return next(spec, ctx);
}
