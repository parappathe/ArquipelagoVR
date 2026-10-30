// Sons sintetizados na hora (sem arquivos): ondas de fundo, madeira das peças, cabana, saquinho,
// maré subindo, peças afundando com bolhas e fanfarra no fim.
export class Sfx {
  constructor() { this.ctx = null; this.on = true; }

  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.on ? 0.8 : 0;
      this.master.connect(this.ctx.destination);
      this.startWaves();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }
  setOn(v) {
    this.on = v;
    if (this.master) this.master.gain.setTargetAtTime(v ? 0.8 : 0, this.ctx.currentTime, 0.05);
  }

  noiseBuf(sec) {
    const c = this.ctx, buf = c.createBuffer(1, Math.ceil(c.sampleRate * sec), c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  // Mar de fundo: ruído filtrado que vai e volta devagar.
  startWaves() {
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf(4); src.loop = true;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 500;
    const g = c.createGain(); g.gain.value = 0.04;
    const lfo = c.createOscillator(), lg = c.createGain();
    lfo.frequency.value = 0.12; lg.gain.value = 0.03;
    lfo.connect(lg); lg.connect(g.gain);
    const lfo2 = c.createOscillator(), lg2 = c.createGain();
    lfo2.frequency.value = 0.09; lg2.gain.value = 260;
    lfo2.connect(lg2); lg2.connect(f.frequency);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(); lfo.start(); lfo2.start();
    this.waveGain = g;
  }

  tone(freq, dur, { type = 'sine', vol = 0.2, at = 0, slide = 0 } = {}) {
    const c = this.ctx;
    if (!c) return;
    const t = c.currentTime + at;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  noise(dur, { vol = 0.1, freq = 1200, q = 1, at = 0, type = 'bandpass', sweep = 0 } = {}) {
    const c = this.ctx;
    if (!c) return;
    const t = c.currentTime + at;
    const src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    src.buffer = this.noiseBuf(dur);
    f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (sweep) f.frequency.exponentialRampToValueAtTime(freq * sweep, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.02, dur * 0.2));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t);
  }

  click() { this.tone(1300, 0.04, { vol: 0.05, type: 'square' }); }
  grab() { this.noise(0.05, { vol: 0.08, freq: 1800, q: 3 }); this.tone(420, 0.06, { vol: 0.05, type: 'triangle', slide: 1.4 }); }
  turn() { this.tone(1700, 0.025, { vol: 0.04, type: 'square' }); }
  // Peça de madeira batendo no fundo + um respingo
  place() {
    this.noise(0.06, { vol: 0.16, freq: 700, q: 3 });
    this.tone(180, 0.09, { vol: 0.09, type: 'triangle' });
    this.noise(0.35, { vol: 0.05, freq: 2400, q: 0.8, at: 0.03, sweep: 0.4 });
  }
  cabin() { this.noise(0.04, { vol: 0.12, freq: 1500, q: 4 }); this.tone(620, 0.06, { vol: 0.06, type: 'triangle', at: 0.01 }); this.noise(0.04, { vol: 0.08, freq: 1500, q: 4, at: 0.09 }); }
  deny() { this.tone(170, 0.12, { vol: 0.07, type: 'square' }); }
  draw() { this.noise(0.25, { vol: 0.06, freq: 3000, q: 0.6, sweep: 0.5 }); }
  // Maré subindo: onda grave que cresce
  tide(big) {
    this.noise(1.6, { vol: big ? 0.16 : 0.09, freq: 300, q: 0.7, type: 'lowpass', sweep: 3 });
    this.noise(1.2, { vol: 0.05, freq: 1800, q: 0.5, at: 0.5, sweep: 0.5 });
  }
  // Peças afundando: bolhas
  sink(n) {
    for (let i = 0; i < Math.min(14, 4 + n * 2); i++) {
      const f = 300 + Math.random() * 500;
      this.tone(f, 0.08, { vol: 0.05, type: 'sine', at: i * 0.07 + Math.random() * 0.05, slide: 2.2 });
    }
  }
  win() {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => this.tone(f, 0.5, { vol: 0.11, at: i * 0.12, type: 'triangle' }));
    [261.6, 329.6, 392].forEach(f => this.tone(f, 1.6, { vol: 0.07, at: 0.5, type: 'sine' }));
  }
  lose() { [392, 349.2, 311.1, 261.6].forEach((f, i) => this.tone(f, 0.5, { vol: 0.09, at: i * 0.18, type: 'triangle' })); }
  gull() { this.tone(1500, 0.25, { vol: 0.025, type: 'sine', slide: 0.7 }); this.tone(1400, 0.2, { vol: 0.02, type: 'sine', at: 0.3, slide: 0.75 }); }
}
