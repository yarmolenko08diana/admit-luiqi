// Звук на Web Audio API — без файлов. «Поющая кисть»: пока рисуешь,
// звучит мягкий тон, высота которого зависит от высоты пальца на экране
// (квантуется в пентатонику, поэтому всегда звучит приятно).

const PENTATONIC = [0, 2, 4, 7, 9];

export class Sound {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.voice = null;
  }

  /** Браузеры разрешают звук только после действия пользователя — вызываем при первом клике/жесте. */
  unlock() {
    try {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.35;
        this.master.connect(this.ctx.destination);
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
    } catch {
      this.ctx = null;
    }
  }

  get ready() {
    return this.enabled && this.ctx && this.ctx.state === 'running';
  }

  toggle() {
    this.enabled = !this.enabled;
    if (!this.enabled) this.brush(false);
    return this.enabled;
  }

  tone(freq, { dur = 0.15, type = 'sine', vol = 0.3, delay = 0, slide = 0 } = {}) {
    if (!this.ready) return;
    const t = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slide) osc.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  click() {
    this.tone(880, { dur: 0.08, type: 'triangle', vol: 0.2 });
  }
  gesture() {
    this.tone(660, { dur: 0.06, type: 'sine', vol: 0.12 });
  }
  color() {
    this.tone(523, { dur: 0.1, type: 'triangle', vol: 0.2 });
    this.tone(784, { dur: 0.12, type: 'triangle', vol: 0.2, delay: 0.07 });
  }
  erase() {
    this.tone(300, { dur: 0.25, type: 'sawtooth', vol: 0.06, slide: 0.5 });
  }
  warn() {
    this.tone(220, { dur: 0.18, type: 'square', vol: 0.06 });
  }
  fixed() {
    this.tone(700, { dur: 0.1, vol: 0.15 });
    this.tone(1050, { dur: 0.14, vol: 0.15, delay: 0.08 });
  }
  tick() {
    this.tone(1200, { dur: 0.04, type: 'square', vol: 0.05 });
  }
  success() {
    [523, 659, 784, 1047].forEach((f, i) => this.tone(f, { dur: 0.25, type: 'triangle', vol: 0.22, delay: i * 0.1 }));
  }
  fanfare() {
    [523, 659, 784, 659, 784, 1047].forEach((f, i) => this.tone(f, { dur: 0.3, type: 'triangle', vol: 0.22, delay: i * 0.12 }));
  }

  /** Непрерывный тон кисти. heightRatio 0 (низ) .. 1 (верх), speed — скорость в ладонях/с. */
  brush(on, heightRatio = 0.5, speed = 0) {
    if (!this.ready) return;
    if (on && !this.voice) {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      const f = this.ctx.createBiquadFilter();
      osc.type = 'sine';
      f.type = 'lowpass';
      f.frequency.value = 1400;
      g.gain.value = 0.0001;
      osc.connect(f).connect(g).connect(this.master);
      osc.start();
      this.voice = { osc, g };
    }
    if (!this.voice) return;
    const t = this.ctx.currentTime;
    if (!on) {
      this.voice.g.gain.setTargetAtTime(0.0001, t, 0.05);
      const v = this.voice;
      this.voice = null;
      setTimeout(() => v.osc.stop(), 300);
      return;
    }
    const steps = Math.round(Math.max(0, Math.min(1, heightRatio)) * 14);
    const semis = Math.floor(steps / 5) * 12 + PENTATONIC[steps % 5];
    const freq = 220 * 2 ** (semis / 12);
    this.voice.osc.frequency.setTargetAtTime(freq, t, 0.03);
    const vol = Math.min(0.12, 0.03 + speed * 0.02);
    this.voice.g.gain.setTargetAtTime(vol, t, 0.05);
  }
}
