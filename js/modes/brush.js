// Общая логика «жест → действие на холсте» для челленджа и свободного холста.
//   ☝️ рисовать · ✌️ курсор без линии · 🖐 ластик · 🤏 сменить цвет
//   ✊ держать — очистить · 👍 держать — готово

import { HoldTimer } from '../core/filters.js';

export class Brush {
  constructor(app, { onDone, clearMs = 1200, doneMs = 800 } = {}) {
    this.app = app;
    this.onDone = onDone;
    this.clearHold = new HoldTimer(clearMs);
    this.doneHold = new HoldTimer(doneMs);
    this.lastPinchAt = 0;
    this.prevGesture = 'none';
    this.lostMidStroke = false;
  }

  /** Возвращает { issues, cursor } для кадра. */
  frame(f) {
    const { painter, overlay, sound } = this.app;
    const issues = [];
    const g = f.hand ? f.gesture : null;
    const p = f.cursor;

    // Рука пропала посреди линии — объясняем, почему линия оборвалась.
    if (!f.hand && painter.drawing) {
      painter.end();
      this.lostMidStroke = true;
    }
    if (f.hand) this.lostMidStroke = false;
    if (this.lostMidStroke) {
      issues.push({ id: 'lost_mid_stroke', severity: 3, title: 'Рука пропала посреди линии', fix: 'Держи всю кисть в кадре, пока рисуешь, — иначе линия обрывается', delay: 250 });
    }

    if (g !== 'point' && painter.drawing) {
      painter.end();
      sound.brush(false);
    }

    let cursor = null;
    if (!f.hand) return { issues, cursor };

    const palmCenter = f.hand.pts[9];
    switch (g) {
      case 'point': {
        // Пока жест «переходный» (сырой кадр уже не ☝️), точки не добавляем,
        // иначе при смене жеста к линии прилипает случайный хвост.
        if (f.raw === 'point') {
          if (!painter.drawing) painter.begin(p);
          else painter.add(p);
        }
        overlay.sparkle(p.x, p.y, painter.color === 'rainbow' ? 'rainbow' : painter.color);
        sound.brush(true, 1 - p.y / overlay.h, f.speed);
        cursor = { p, mode: 'draw', color: painter.color, size: painter.size };
        break;
      }
      case 'palm': {
        const r = Math.max(28, f.hand.palmPx * 0.55);
        if (painter.erase(palmCenter, r) && Math.random() < 0.15) sound.erase();
        cursor = { p: palmCenter, mode: 'erase', eraseRadius: r };
        break;
      }
      case 'pinch': {
        if (this.prevGesture !== 'pinch' && f.t - this.lastPinchAt > 600) {
          this.lastPinchAt = f.t;
          const c = painter.nextColor();
          sound.color();
          overlay.burst(p.x, p.y, c, 18);
          this.app.syncToolbar?.();
          this.app.hud.toast(`Цвет: ${c === 'rainbow' ? 'радуга 🌈' : '●'}`, 900);
          if (c !== 'rainbow') this.app.hud.toastEl.style.color = c;
          else this.app.hud.toastEl.style.color = '';
        }
        cursor = { p, mode: 'hover' };
        break;
      }
      default:
        cursor = { p, mode: g === 'peace' ? 'hover' : 'idle' };
    }

    if (this.clearHold.update(g === 'fist', f.t)) {
      if (painter.hasInk) {
        painter.clear();
        sound.erase();
        overlay.burst(palmCenter.x, palmCenter.y, '#ffd23f', 30);
        this.app.hud.toast('Холст очищен ✊', 1000);
      }
    }
    if (this.doneHold.update(g === 'thumbsUp', f.t)) this.onDone?.();

    if (g === 'fist') Object.assign(cursor, { p: palmCenter, hold: this.clearHold.progress(), holdColor: '#ffd23f' });
    if (g === 'thumbsUp') Object.assign(cursor, { p: f.hand.pts[4], hold: this.doneHold.progress(), holdColor: '#39f3bb' });
    this.prevGesture = g;
    return { issues, cursor };
  }

  stop() {
    this.app.painter.end();
    this.app.sound.brush(false);
    this.clearHold.reset();
    this.doneHold.reset();
    this.lostMidStroke = false;
  }
}
