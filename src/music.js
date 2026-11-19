// Generative lo-fi beat made live with WebAudio: no audio files, no licences needed.
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const PROG = [
  { bass: 38, keys: [53, 57, 60, 64] }, // Dm9
  { bass: 43, keys: [53, 57, 59, 64] }, // G13
  { bass: 36, keys: [52, 55, 59, 62] }, // Cmaj9
  { bass: 45, keys: [55, 59, 60, 64] }, // Am9
];
const PENTA = [69, 72, 74, 76, 79, 81, 84];

export class LoFi {
  constructor() { this.ctx = null; this.muted = false; this.step = 0; this.next = 0; }
  start() {
    if (this.ctx) { this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain(); this.master.gain.value = 0;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2400; lp.Q.value = 0.3;
    const comp = ctx.createDynamicsCompressor();
    this.master.connect(lp); lp.connect(comp); comp.connect(ctx.destination);
    this.bus = ctx.createGain(); this.bus.connect(this.master);
    // delay for melody
    this.delay = ctx.createDelay(1); this.delay.delayTime.value = 0.42;
    const fb = ctx.createGain(); fb.gain.value = 0.32; const dl = ctx.createGain(); dl.gain.value = 0.35;
    this.delay.connect(fb); fb.connect(this.delay); this.delay.connect(dl); dl.connect(this.bus);
    // noise
    const len = ctx.sampleRate;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    // vinyl crackle
    const cr = ctx.createBuffer(1, len * 2, ctx.sampleRate); const cd = cr.getChannelData(0);
    for (let i = 0; i < cd.length; i++) cd[i] = (Math.random() < 0.0009 ? (Math.random() * 2 - 1) * 0.6 : 0) + (Math.random() * 2 - 1) * 0.006;
    const crs = ctx.createBufferSource(); crs.buffer = cr; crs.loop = true;
    const crg = ctx.createGain(); crg.gain.value = 0.5; crs.connect(crg); crg.connect(this.master); crs.start();
    this.bpm = 72; this.next = ctx.currentTime + 0.1; this.step = 0;
    this.timer = setInterval(() => this.schedule(), 60);
    this.setMuted(this.muted);
  }
  recordStream() { // music feed for recorded videos, independent of the mute button
    if (!this.ctx || !this.ctx.createMediaStreamDestination) return null;
    if (!this.recDest) { this.recDest = this.ctx.createMediaStreamDestination(); const g = this.ctx.createGain(); g.gain.value = 0.6; this.bus.connect(g); g.connect(this.recDest); }
    return this.recDest.stream;
  }
  setMuted(m) {
    this.muted = m;
    if (!this.ctx) return;
    const g = this.master.gain; const t = this.ctx.currentTime;
    g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(m ? 0 : 0.55, t + 1.2);
  }
  schedule() {
    const ctx = this.ctx; const eighth = 60 / this.bpm / 2;
    while (this.next < ctx.currentTime + 0.3) {
      const s = this.step % 8; const bar = Math.floor(this.step / 8) % PROG.length;
      const swing = s % 2 ? eighth * 0.16 : 0; const t = this.next + swing; const ch = PROG[bar];
      if (s === 0) { ch.keys.forEach((k, i) => this.keys(mtof(k), t + i * 0.018, eighth * 7.5)); }
      if (s === 5) ch.keys.slice(1).forEach((k, i) => this.keys(mtof(k), t + i * 0.02, eighth * 2.5, 0.5));
      if (s === 0 || s === 3 || s === 4) this.bassNote(mtof(ch.bass + (s === 4 ? 7 : 0)), t, eighth * (s === 0 ? 2.6 : 1));
      if (s === 0 || s === 5) this.kick(t);
      if (s === 2 || s === 6) this.snare(t);
      this.hat(t, s % 2 ? 0.035 : 0.06);
      if (Math.random() < 0.22 && (bar + s) % 3 !== 0) this.melody(mtof(PENTA[Math.floor(Math.random() * PENTA.length)]), t);
      this.next += eighth; this.step++;
    }
  }
  env(t, peak, a, dur) { const g = this.ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0008, t + dur); return g; }
  keys(f, t, dur, vol = 1) {
    const ctx = this.ctx; const g = this.env(t, 0.06 * vol, 0.03, dur); g.connect(this.bus);
    [[1, 'sine', 1], [2, 'triangle', 0.18], [1.003, 'sine', 0.6]].forEach(([mul, type, amp]) => {
      const o = ctx.createOscillator(); o.type = type; o.frequency.value = f * mul; o.detune.value = (Math.random() - 0.5) * 8;
      const og = ctx.createGain(); og.gain.value = amp; o.connect(og); og.connect(g); o.start(t); o.stop(t + dur + 0.1);
    });
  }
  bassNote(f, t, dur) { const o = this.ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f; const g = this.env(t, 0.22, 0.02, dur); o.connect(g); g.connect(this.bus); o.start(t); o.stop(t + dur + 0.1); }
  kick(t) {
    const o = this.ctx.createOscillator(); o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.14);
    const g = this.env(t, 0.5, 0.005, 0.32); o.connect(g); g.connect(this.bus); o.start(t); o.stop(t + 0.4);
  }
  noiseHit(t, type, freq, peak, dur) {
    const s = this.ctx.createBufferSource(); s.buffer = this.noise; s.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = this.ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; const g = this.env(t, peak, 0.004, dur);
    s.connect(f); f.connect(g); g.connect(this.bus); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
  }
  snare(t) { this.noiseHit(t, 'bandpass', 1700, 0.16, 0.22); }
  hat(t, v) { this.noiseHit(t, 'highpass', 7500, v, 0.05); }
  melody(f, t) {
    const o = this.ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = f;
    const g = this.env(t, 0.035, 0.05, 0.9); o.connect(g); g.connect(this.bus); g.connect(this.delay); o.start(t); o.stop(t + 1);
  }
}
