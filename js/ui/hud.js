// Элементы интерфейса поверх сцены: легенда жестов, чип текущего жеста,
// панель тренера, таймер и всплывающие сообщения.

import { GESTURES } from '../core/gestures.js';

const $ = (sel) => document.querySelector(sel);

export class Hud {
  constructor() {
    this.legend = $('#legend');
    this.chip = $('#gesture-chip');
    this.coach = $('#coach');
    this.center = $('#hud-center');
    this.title = $('#hud-title');
    this.timer = $('#hud-timer');
    this.score = $('#hud-score');
    this.banner = $('#round-banner');
    this.toastEl = $('#toast');
    this.lastCoachKey = '';
    this.toastTimer = null;
  }

  /** Легенда: список жестов с подписями действий, неактивные — полупрозрачные. */
  setLegend(items) {
    if (!items) {
      this.legend.hidden = true;
      return;
    }
    this.legend.hidden = false;
    this.legend.innerHTML = items
      .map(({ id, action, disabled }) => {
        const g = GESTURES[id];
        return `<div class="legend-item${disabled ? ' disabled' : ''}" data-gesture="${id}"><span class="li-emoji">${g.emoji}</span><span class="li-text"><b>${action ?? g.action}</b>${g.name}</span></div>`;
      })
      .join('');
  }

  highlight(gesture) {
    for (const el of this.legend.children) el.classList.toggle('active', el.dataset.gesture === gesture);
    if (gesture && GESTURES[gesture]) {
      this.chip.querySelector('.chip-emoji').textContent = GESTURES[gesture].emoji;
      this.chip.querySelector('.chip-text').textContent = GESTURES[gesture].name;
    } else {
      this.chip.querySelector('.chip-emoji').textContent = '✋';
      this.chip.querySelector('.chip-text').textContent = gesture === null ? 'Нет руки' : 'Жест не распознан';
    }
  }

  showChrome(on) {
    this.chip.hidden = !on;
    this.coach.hidden = !on;
    document.querySelector('#btn-home').hidden = !on;
  }

  /** Панель тренера: warn — ошибка, ok — исправлено, иначе — нейтральная подсказка. */
  setCoach({ issue, resolved }, idle) {
    let key;
    let cls = '';
    let icon;
    let title;
    let fix;
    if (issue) {
      cls = 'warn';
      icon = '⚠️';
      ({ title, fix } = issue);
      key = `w:${title}:${fix}`;
    } else if (resolved) {
      cls = 'ok';
      icon = '✅';
      title = 'Исправлено!';
      fix = `Так держать. Было: «${resolved.title.toLowerCase()}»`;
      key = `r:${resolved.id}`;
    } else {
      icon = idle.icon;
      title = idle.title;
      fix = idle.fix;
      key = `i:${title}:${fix}`;
    }
    if (key === this.lastCoachKey) return false;
    this.lastCoachKey = key;
    this.coach.className = `coach ${cls}`;
    this.coach.querySelector('.coach-icon').textContent = icon;
    this.coach.querySelector('.coach-title').textContent = title;
    this.coach.querySelector('.coach-fix').textContent = fix;
    return cls === 'warn';
  }

  setRoundHud(info) {
    if (!info) {
      this.center.hidden = true;
      this.banner.hidden = true;
      return;
    }
    this.center.hidden = false;
    this.title.textContent = info.title ?? '';
    this.timer.textContent = info.timer ?? '';
    this.timer.classList.toggle('low', !!info.low);
    this.score.textContent = info.score ?? '';
    if (info.banner) {
      this.banner.hidden = false;
      this.banner.textContent = info.banner;
    } else this.banner.hidden = true;
  }

  toast(text, ms = 1600) {
    this.toastEl.textContent = text;
    this.toastEl.hidden = false;
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => (this.toastEl.hidden = true), ms);
  }
}
