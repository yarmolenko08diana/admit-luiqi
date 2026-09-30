// Свободный холст: рисуй что угодно, меняй цвет щипком, сохраняй PNG жестом 👍.

import { Brush } from './brush.js';
import { PALETTE, SIZES } from '../ui/painter.js';

const $ = (s) => document.querySelector(s);

export class FreeDrawMode {
  constructor(app) {
    this.app = app;
    this.brush = new Brush(app, { onDone: () => this.save() });
  }

  enter() {
    const { app } = this;
    app.show(null);
    app.stage.classList.add('drawing');
    app.hud.setLegend([
      { id: 'point', action: 'Рисовать' },
      { id: 'peace', action: 'Кнопки' },
      { id: 'palm', action: 'Стереть' },
      { id: 'pinch', action: 'Цвет' },
      { id: 'fist', action: 'Очистить' },
      { id: 'thumbsUp', action: 'Сохранить' },
    ]);
    app.hud.setRoundHud({ title: '🎨 Свободный холст', banner: 'Кнопки справа нажимаются жестом ✌️' });
    this.buildToolbar();
    $('#toolbar').hidden = false;
  }

  buildToolbar() {
    const { painter } = this.app;
    $('#palette').innerHTML = PALETTE.map(
      (c) => `<button class="swatch${c === 'rainbow' ? ' rainbow' : ''}" data-air data-color="${c}" style="${c === 'rainbow' ? '' : `background:${c}`}" aria-label="Цвет ${c}"></button>`,
    ).join('');
    $('#sizes').innerHTML = SIZES.map((s) => `<button class="size-btn" data-air data-size="${s}" aria-label="Толщина ${s}"><span style="width:${Math.min(22, s)}px;height:${Math.min(22, s)}px"></span></button>`).join('');
    $('#palette').onclick = (e) => {
      const b = e.target.closest('[data-color]');
      if (b) painter.color = b.dataset.color;
      this.sync();
    };
    $('#sizes').onclick = (e) => {
      const b = e.target.closest('[data-size]');
      if (b) painter.size = Number(b.dataset.size);
      this.sync();
    };
    this.sync();
  }

  sync() {
    const { painter } = this.app;
    for (const b of document.querySelectorAll('#palette [data-color]')) b.classList.toggle('active', b.dataset.color === painter.color);
    for (const b of document.querySelectorAll('#sizes [data-size]')) b.classList.toggle('active', Number(b.dataset.size) === painter.size);
  }

  coachContext() {
    return { allowed: ['point', 'peace', 'palm', 'pinch', 'fist', 'thumbsUp'] };
  }

  get dwellGestures() {
    return ['peace'];
  }

  idleHint(f) {
    if (f?.gesture === 'point') return { icon: '☝️', title: 'Рисуешь', fix: 'Щипок 🤏 — другой цвет, ладонь 🖐 — ластик' };
    return { icon: '🎨', title: 'Свободный холст', fix: 'Подними указательный палец ☝️, чтобы рисовать. 👍 — сохранить картинку' };
  }

  frame(f) {
    return this.brush.frame(f);
  }

  clear() {
    this.app.painter.clear();
    this.app.sound.erase();
  }

  save() {
    const { app } = this;
    if (!app.painter.hasInk) {
      app.hud.toast('Сначала нарисуй что-нибудь ☝️');
      return;
    }
    app.download(app.painter.exportPNG(), `luiqi-${Date.now()}.png`);
    app.sound.success();
    app.hud.toast('Рисунок сохранён 💾');
  }

  exit() {
    this.brush.stop();
    $('#toolbar').hidden = true;
    this.app.stage.classList.remove('drawing');
    this.app.hud.setRoundHud(null);
  }
}
