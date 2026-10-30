// Three.js de verdade, com o WebGLRenderer trocado por um falso que só guarda o que o jogo
// pede (controles do VR, eventos, laço de animação).
export * from '../../vendor/three/three.module.js?real';
import * as T from '../../vendor/three/three.module.js?real';
import { fakeEl } from './env.js';

export class WebGLRenderer {
  constructor() {
    this.domElement = fakeEl();
    this.renders = 0;
    this.ctrls = [];
    this.xrHandlers = {};
    const xh = this.xrHandlers;
    this.xr = {
      enabled: false, isPresenting: false, setReferenceSpaceType() {}, setFoveation() {},
      getController: (i) => (this.ctrls[i] ||= { ctrl: new T.Group(), grip: new T.Group() }).ctrl,
      getControllerGrip: (i) => (this.ctrls[i] ||= { ctrl: new T.Group(), grip: new T.Group() }).grip,
      addEventListener: (t, f) => { (xh[t] ||= []).push(f); }, getSession: () => null,
    };
    globalThis.__renderer = this;
  }
  setPixelRatio() {}
  setSize() {}
  render(scene, cam) { this.renders++; scene.updateMatrixWorld(); cam.updateMatrixWorld(); }
  setAnimationLoop(f) { this.loop = f; }
}
