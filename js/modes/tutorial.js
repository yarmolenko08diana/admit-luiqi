// Школа жестов: по очереди просим показать каждый жест и удержать его.
// Если жест неточный, тренер говорит, какой палец поставить иначе.

import { GESTURES } from '../core/gestures.js';
import { HoldTimer } from '../core/filters.js';

const STEPS = [
  { id: 'point', title: 'Указательный палец — рисуем', desc: 'Выпрями указательный палец, остальные прижми к ладони. Пока палец поднят — за ним тянется линия.' },
  { id: 'peace', title: 'Два пальца — курсор', desc: 'Подними указательный и средний пальцы (✌️). Линия не рисуется: так можно перенести руку или нажать кнопку.' },
  { id: 'palm', title: 'Открытая ладонь — ластик', desc: 'Раскрой все пять пальцев и разверни ладонь к камере. Центр ладони стирает рисунок.' },
  { id: 'pinch', title: 'Щипок — смена цвета', desc: 'Соедини кончики большого и указательного пальцев. Каждый щипок — следующий цвет.' },
  { id: 'fist', title: 'Кулак — очистить холст', desc: 'Сожми кулак и подержи секунду, чтобы стереть всё сразу.' },
  { id: 'thumbsUp', title: 'Палец вверх — готово', desc: 'Сожми кулак и подними большой палец вверх. Так сдаётся рисунок в челлендже.' },
];

const $ = (s) => document.querySelector(s);

export class TutorialMode {
  constructor(app) {
    this.app = app;
    this.hold = new HoldTimer(900);
  }

  enter() {
    this.step = 0;
    this.pauseUntil = 0;
    this.app.coach.resetStats();
    this.app.hud.setLegend(STEPS.map((s) => ({ id: s.id })));
    this.app.show('screen-tutorial');
    this.renderStep();
  }

  get target() {
    return STEPS[this.step]?.id ?? null;
  }

  coachContext() {
    return { target: this.target };
  }

  idleHint() {
    const s = STEPS[this.step];
    return s ? { icon: GESTURES[s.id].emoji, title: 'Покажи жест и держи', fix: s.desc } : { icon: '🎉', title: 'Готово', fix: '' };
  }

  renderStep() {
    const s = STEPS[this.step];
    $('#tut-step').textContent = `Шаг ${this.step + 1} из ${STEPS.length}`;
    $('#tut-emoji').textContent = GESTURES[s.id].emoji;
    $('#tut-title').textContent = s.title;
    $('#tut-desc').textContent = s.desc;
    $('#tut-progress').style.width = '0%';
    $('#tut-dots').innerHTML = STEPS.map((_, i) => `<span class="${i < this.step ? 'done' : i === this.step ? 'now' : ''}"></span>`).join('');
    $('.tutorial-card').classList.remove('success');
  }

  frame(f) {
    if (f.t < this.pauseUntil || !this.target) return { issues: [], cursor: f.hand ? { p: f.cursor, mode: 'hover' } : null };
    const ok = f.hand && f.gesture === this.target;
    const done = this.hold.update(ok, f.t);
    $('#tut-progress').style.width = `${Math.round(this.hold.progress() * 100)}%`;
    if (done) {
      const { sound, overlay } = this.app;
      sound.success();
      overlay.burst(f.cursor.x, f.cursor.y, '#39f3bb', 30);
      $('#tut-progress').style.width = '100%';
      $('.tutorial-card').classList.add('success');
      this.step++;
      this.hold.reset();
      this.pauseUntil = f.t + 700;
      setTimeout(() => {
        if (this.app.mode !== this) return;
        if (this.step >= STEPS.length) this.finish();
        else this.renderStep();
      }, 700);
    }
    return { issues: [], cursor: f.hand ? { p: f.cursor, mode: f.gesture === 'point' ? 'draw' : 'hover', color: '#39f3bb', size: 8, hold: ok ? this.hold.progress() : 0, holdColor: '#39f3bb' } : null };
  }

  finish() {
    $('#tut-fixed').textContent = this.app.coach.fixedCount;
    this.app.setMode(null);
    this.app.show('screen-tutorial-done');
    this.app.sound.fanfare();
  }

  exit() {
    this.hold.reset();
  }
}
