// Сглаживание и устойчивость: чтобы линия была плавной, а жесты не «мигали».

class LowPass {
  constructor() {
    this.y = null;
  }
  filter(x, alpha) {
    this.y = this.y === null ? x : alpha * x + (1 - alpha) * this.y;
    return this.y;
  }
  reset() {
    this.y = null;
  }
}

/**
 * One Euro Filter (Casiez et al., 2012): мало сглаживает при быстром движении
 * (нет запаздывания) и сильно — при медленном (нет дрожания).
 */
export class OneEuroFilter {
  constructor({ minCutoff = 1.2, beta = 0.02, dCutoff = 1.0 } = {}) {
    Object.assign(this, { minCutoff, beta, dCutoff });
    this.x = new LowPass();
    this.dx = new LowPass();
    this.lastT = null;
    this.lastRaw = null;
  }
  static alpha(cutoff, dt) {
    const tau = 1 / (2 * Math.PI * cutoff);
    return 1 / (1 + tau / dt);
  }
  filter(value, tMs) {
    if (this.lastT === null) {
      this.lastT = tMs;
      this.lastRaw = value;
      this.dx.filter(0, 1);
      return this.x.filter(value, 1);
    }
    const dt = Math.max(1e-3, (tMs - this.lastT) / 1000);
    this.lastT = tMs;
    const d = (value - this.lastRaw) / dt;
    this.lastRaw = value;
    const edx = this.dx.filter(d, OneEuroFilter.alpha(this.dCutoff, dt));
    const cutoff = this.minCutoff + this.beta * Math.abs(edx);
    return this.x.filter(value, OneEuroFilter.alpha(cutoff, dt));
  }
  reset() {
    this.x.reset();
    this.dx.reset();
    this.lastT = null;
    this.lastRaw = null;
  }
}

/** Двумерная обёртка над OneEuroFilter. */
export class PointFilter {
  constructor(opts) {
    this.fx = new OneEuroFilter(opts);
    this.fy = new OneEuroFilter(opts);
  }
  filter(p, tMs) {
    return { x: this.fx.filter(p.x, tMs), y: this.fy.filter(p.y, tMs) };
  }
  reset() {
    this.fx.reset();
    this.fy.reset();
  }
}

/**
 * Гистерезис жестов: новый жест принимается, только если он держится
 * несколько кадров подряд. Убирает случайные переключения на границах.
 */
export class GestureStabilizer {
  constructor({ framesToSwitch = 3, framesToNone = 4 } = {}) {
    this.framesToSwitch = framesToSwitch;
    this.framesToNone = framesToNone;
    this.stable = 'none';
    this.candidate = 'none';
    this.count = 0;
  }
  update(raw) {
    if (raw === this.stable) {
      this.candidate = raw;
      this.count = 0;
      return this.stable;
    }
    if (raw === this.candidate) this.count++;
    else {
      this.candidate = raw;
      this.count = 1;
    }
    const need = raw === 'none' ? this.framesToNone : this.framesToSwitch;
    if (this.count >= need) {
      this.stable = raw;
      this.count = 0;
    }
    return this.stable;
  }
  reset() {
    this.stable = 'none';
    this.candidate = 'none';
    this.count = 0;
  }
}

/**
 * Удержание жеста: срабатывает один раз, когда условие выполняется durationMs подряд.
 * progress() — 0..1 для кольца прогресса в интерфейсе.
 */
export class HoldTimer {
  constructor(durationMs) {
    this.duration = durationMs;
    this.start = null;
    this.fired = false;
    this.value = 0;
  }
  update(active, tMs) {
    if (!active) {
      this.start = null;
      this.fired = false;
      this.value = 0;
      return false;
    }
    if (this.start === null) this.start = tMs;
    this.value = Math.min(1, (tMs - this.start) / this.duration);
    if (this.value >= 1 && !this.fired) {
      this.fired = true;
      return true;
    }
    return false;
  }
  progress() {
    return this.fired ? 0 : this.value;
  }
  reset() {
    this.update(false, 0);
  }
}
