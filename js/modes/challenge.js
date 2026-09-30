// Челлендж: 3 раунда, в каждом нужно обвести фигуру по пунктиру за 45 секунд.
// Итог — очки, звёзды, конкретные подсказки по каждому рисунку и таблица рекордов.

import { pickRounds } from '../core/shapes.js';
import { scoreDrawing, roundPoints, distanceToShape, TOLERANCE } from '../core/shapeScore.js';
import { HoldTimer } from '../core/filters.js';
import { Brush } from './brush.js';

const ROUND_SECONDS = 45;
const $ = (s) => document.querySelector(s);

const REGIONS = [
  ['сверху слева', 'сверху', 'сверху справа'],
  ['слева', 'в центре', 'справа'],
  ['снизу слева', 'снизу', 'снизу справа'],
];

export class ChallengeMode {
  constructor(app) {
    this.app = app;
    this.brush = new Brush(app, { onDone: () => this.submit('thumbs') });
    this.readyHold = new HoldTimer(700);
  }

  enter() {
    this.rounds = pickRounds();
    this.results = [];
    this.index = 0;
    this.total = 0;
    this.app.coach.resetStats();
    this.app.hud.setLegend([
      { id: 'point', action: 'Рисовать' },
      { id: 'peace', action: 'Без линии' },
      { id: 'palm', action: 'Стереть' },
      { id: 'pinch', action: 'Цвет' },
      { id: 'fist', action: 'Очистить' },
      { id: 'thumbsUp', action: 'Сдать' },
    ]);
    this.startIntro();
  }

  get shape() {
    return this.rounds[this.index];
  }

  startIntro() {
    const { app } = this;
    this.phase = 'intro';
    this.countStart = null;
    this.readyHold.reset();
    app.painter.clear();
    app.painter.color = '#5b8cff';
    app.stage.classList.remove('drawing');
    $('#intro-round').textContent = `Раунд ${this.index + 1} из ${this.rounds.length}`;
    $('#intro-emoji').textContent = this.shape.emoji;
    $('#intro-name').textContent = this.shape.name;
    const best = app.progress.bestFor(this.shape.id);
    $('#intro-best').textContent = best ? `Твой рекорд на этой фигуре: ${best}%` : 'Обведи фигуру по пунктиру, начиная с зелёной точки';
    $('#intro-count').textContent = 'Подними руку ☝️ — начнём';
    $('#intro-count').classList.remove('num');
    app.show('screen-round-intro');
    this.updateHud();
  }

  startDrawing(t) {
    this.phase = 'draw';
    this.startedAt = t;
    this.lastTick = ROUND_SECONDS;
    this.offSince = null;
    this.app.stage.classList.add('drawing');
    this.app.show(null);
    this.app.sound.click();
  }

  secondsLeft(t) {
    return Math.max(0, ROUND_SECONDS - (t - this.startedAt) / 1000);
  }

  updateHud(t = 0) {
    const left = this.phase === 'draw' ? Math.ceil(this.secondsLeft(t)) : ROUND_SECONDS;
    this.app.hud.setRoundHud({
      title: `${this.shape.emoji} ${this.index + 1}/${this.rounds.length}`,
      timer: `⏱ ${left}`,
      low: this.phase === 'draw' && left <= 10,
      score: `★ ${this.total}`,
      banner: this.phase === 'draw' ? 'Обведи по пунктиру ☝️ · готово — 👍 подержи' : null,
    });
  }

  /** Во время рисования ☝️ рисует, поэтому кнопки нажимаются только жестом ✌️. */
  get dwellGestures() {
    return this.phase === 'draw' ? ['peace'] : ['point', 'peace'];
  }

  coachContext() {
    return { allowed: ['point', 'peace', 'palm', 'pinch', 'fist', 'thumbsUp'] };
  }

  idleHint(f) {
    if (this.phase === 'intro') return { icon: '☝️', title: 'Готовься', fix: 'Покажи руку в кадре — начнётся отсчёт' };
    if (f?.gesture === 'point') return { icon: '☝️', title: 'Рисуешь', fix: 'Веди палец плавно по пунктиру — я слежу за точностью' };
    return { icon: '✌️', title: 'Курсор без линии', fix: 'Подними только указательный палец ☝️, чтобы продолжить линию' };
  }

  render(overlay, t) {
    if (this.phase === 'intro' || this.phase === 'draw') overlay.template(this.shape, this.app.layout.box, { t, alpha: this.phase === 'intro' ? 0.5 : 1 });
  }

  toShape(p) {
    const b = this.app.layout.box;
    return { x: (p.x - b.x) / b.size, y: (p.y - b.y) / b.size };
  }

  frame(f) {
    if (this.phase === 'intro') {
      if (this.countStart === null) {
        if (this.readyHold.update(!!f.hand, f.t)) {
          this.countStart = f.t;
          $('#intro-count').classList.add('num');
        }
      } else {
        const n = 3 - Math.floor((f.t - this.countStart) / 700);
        const el = $('#intro-count');
        if (n > 0 && el.textContent !== String(n)) {
          el.textContent = String(n);
          this.app.sound.tick();
        }
        if (n <= 0) this.startDrawing(f.t);
      }
      return { issues: [], cursor: f.hand ? { p: f.cursor, mode: 'hover', hold: this.countStart === null ? this.readyHold.progress() : 0, holdColor: '#39f3bb' } : null };
    }
    if (this.phase !== 'draw') return { issues: [], cursor: null };

    const out = this.brush.frame(f);
    const left = this.secondsLeft(f.t);
    const secs = Math.ceil(left);
    if (secs !== this.lastTick) {
      this.lastTick = secs;
      if (secs <= 5 && secs > 0) this.app.sound.tick();
      this.updateHud(f.t);
    }

    // Живая проверка: линия ушла от контура — говорим куда и где.
    if (f.hand && f.gesture === 'point') {
      const sp = this.toShape(f.cursor);
      const d = distanceToShape(this.shape, sp);
      if (d > TOLERANCE * 1.8) {
        const outside = Math.hypot(sp.x - 0.5, sp.y - 0.5) > 0.3;
        const c = Math.min(2, Math.max(0, Math.floor(sp.x * 3)));
        const r = Math.min(2, Math.max(0, Math.floor(sp.y * 3)));
        const where = REGIONS[r][c];
        out.issues.push({
          id: 'off_path',
          severity: 2,
          delay: 250,
          title: `Линия ушла ${outside ? 'наружу' : 'внутрь'} от контура ${where}`,
          fix: `Верни палец к пунктиру — он в ${Math.round(d * 100)}% размера фигуры от линии. Можно поднять ✌️ и перенести руку без следа`,
          statKey: 'off_path',
        });
      }
    }
    if (left <= 0) this.submit('time');
    return out;
  }

  submit(reason) {
    if (this.phase !== 'draw') return;
    const { app } = this;
    const t = performance.now();
    this.brush.stop();
    this.phase = 'result';
    app.stage.classList.remove('drawing');
    const left = reason === 'time' ? 0 : this.secondsLeft(t);
    const strokes = app.painter.strokesPx().map((s) => s.map((p) => this.toShape(p)));
    const score = scoreDrawing(this.shape, strokes);
    const pts = roundPoints(score.accuracy, left);
    this.total += pts.total;
    const isRecord = app.progress.recordShape(this.shape.id, score.accuracy);
    const box = app.layout.box;
    const thumb = app.painter.thumbnail(360, (ctx) => app.overlay.template(this.shape, box, { ctx, alpha: 0.35 }));
    this.results.push({ shape: this.shape, score, points: pts, thumb });
    app.painter.clear(); // рисунок остаётся в миниатюре, а экран результата читается чисто

    $('#rr-round').textContent = `Раунд ${this.index + 1} · ${this.shape.name}${reason === 'time' ? ' · время вышло' : ''}`;
    $('#rr-thumb').src = thumb;
    $('#rr-acc').textContent = score.accuracy;
    $('#rr-stars').innerHTML = [0, 1, 2].map((i) => `<span class="${i < score.stars ? '' : 'off'}">★</span>`).join('');
    $('#rr-points').textContent = `+${pts.total} очков${pts.timeBonus ? ` (из них ${pts.timeBonus} за скорость)` : ''}`;
    $('#rr-record').hidden = !isRecord;
    $('#rr-hints').innerHTML = score.hints.map((h) => `<li class="${h.severity === 0 ? 'good' : ''}">${h.text}</li>`).join('');
    $('#rr-next').textContent = this.index + 1 < this.rounds.length ? 'Следующая фигура →' : 'Итоги →';
    app.show('screen-round-result');
    this.updateHud();
    if (score.stars >= 2) app.sound.success();
    else app.sound.warn();
    if (score.stars === 3) app.celebrate();
  }

  next() {
    if (this.phase !== 'result') return;
    this.index++;
    if (this.index < this.rounds.length) this.startIntro();
    else this.finish();
  }

  finish() {
    this.phase = 'done';
    this.app.finishChallenge(this.results, this.total);
  }

  exit() {
    this.brush.stop();
    this.readyHold.reset();
    this.app.stage.classList.remove('drawing');
    this.app.hud.setRoundHud(null);
  }
}
