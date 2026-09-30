// «Воздушные» кнопки: наведи палец на элемент с атрибутом data-air
// и подержи — он нажмётся. Так весь интерфейс управляется без мыши.

export class AirPointer {
  constructor({ dwellMs = 900, cooldownMs = 700, onClick = () => {} } = {}) {
    this.dwellMs = dwellMs;
    this.cooldownMs = cooldownMs;
    this.onClick = onClick;
    this.target = null;
    this.since = 0;
    this.cooldownUntil = 0;
  }

  /** p — точка экрана или null (курсор не активен). Возвращает прогресс 0..1. */
  update(p, tMs) {
    let el = null;
    if (p && tMs >= this.cooldownUntil) {
      const hit = document.elementFromPoint(p.x, p.y);
      el = hit?.closest?.('[data-air]') ?? null;
      if (el && (el.disabled || el.closest('[hidden]'))) el = null;
    }
    if (el !== this.target) {
      this.setTarget(el);
      this.since = tMs;
    }
    if (!el) return 0;
    const progress = Math.min(1, (tMs - this.since) / this.dwellMs);
    el.style.setProperty('--dwell', progress.toFixed(3));
    if (progress >= 1) {
      this.setTarget(null);
      this.cooldownUntil = tMs + this.cooldownMs;
      this.onClick(el);
      el.click();
      return 0;
    }
    return progress;
  }

  setTarget(el) {
    if (this.target) {
      this.target.classList.remove('air-hover');
      this.target.style.removeProperty('--dwell');
    }
    this.target = el;
    if (el) el.classList.add('air-hover');
  }

  reset() {
    this.setTarget(null);
  }
}
