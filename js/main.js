// Точка входа: камера → MediaPipe → наш классификатор → тренер ошибок → режим → отрисовка.

import { HandTracker, BrightnessMeter, startCamera, CameraError } from './core/handTracker.js';
import { analyzeHand, classify, toIsotropic, GESTURES } from './core/gestures.js';
import { GestureStabilizer, PointFilter, HoldTimer } from './core/filters.js';
import { Coach, MotionMonitor, frameIssues, gestureIssues } from './core/errorCoach.js';
import { dist2d } from './core/geometry.js';
import { Progress, randomName } from './core/storage.js';
import { SHAPES } from './core/shapes.js';
import { Painter } from './ui/painter.js';
import { Overlay } from './ui/overlay.js';
import { Hud } from './ui/hud.js';
import { Sound } from './ui/audio.js';
import { AirPointer } from './ui/airPointer.js';
import { TutorialMode } from './modes/tutorial.js';
import { ChallengeMode } from './modes/challenge.js';
import { FreeDrawMode } from './modes/freeDraw.js';

const $ = (s) => document.querySelector(s);
const params = new URLSearchParams(location.search);
const DEBUG = params.has('debug');
const TEST = params.has('test'); // для автотестов: кадры подаются через window.__luiqi.inject
const isMobile = matchMedia('(pointer: coarse)').matches || Math.min(innerWidth, innerHeight) < 600;

class App {
  constructor() {
    this.stage = $('#stage');
    this.video = $('#video');
    this.painter = new Painter($('#paint'));
    this.overlay = new Overlay($('#overlay'));
    this.hud = new Hud();
    this.sound = new Sound();
    this.coach = new Coach();
    this.progress = new Progress();
    this.tracker = new HandTracker();
    this.brightness = new BrightnessMeter();
    this.stabilizer = new GestureStabilizer();
    this.cursorFilter = new PointFilter({ minCutoff: 1.4, beta: 0.012 });
    this.motion = new MotionMonitor();
    this.air = new AirPointer({ onClick: () => this.sound.click() });
    this.thumbsHold = new HoldTimer(1000);
    this.thumbsArmed = false;
    this.modes = { tutorial: new TutorialMode(this), challenge: new ChallengeMode(this), free: new FreeDrawMode(this) };
    this.mode = null;
    this.screen = 'screen-welcome';
    this.running = false;
    this.injected = null;
    this.lastGesture = undefined;
    this.lastWarnSound = 0;
    this.lastResolved = null;
    this.fps = 0;
    this.layout = { box: { x: 0, y: 0, size: 100 } };
    this.syncToolbar = () => this.modes.free.sync();

    this.bindUi();
    this.resize();
    addEventListener('resize', () => this.resize());
    addEventListener('orientationchange', () => setTimeout(() => this.resize(), 300));
  }

  // ---------- Интерфейс ----------

  bindUi() {
    $('#welcome-gestures').innerHTML = Object.values(GESTURES)
      .map((g) => `<div class="g-tile"><span class="e">${g.emoji}</span><span><b>${g.action}</b>${g.name}</span></div>`)
      .join('');
    $('#btn-start').addEventListener('click', () => {
      this.sound.unlock();
      this.start();
    });
    addEventListener('pointerdown', () => this.sound.unlock(), { passive: true });
    $('#btn-sound').addEventListener('click', () => {
      this.sound.unlock();
      $('#btn-sound').textContent = this.sound.toggle() ? '🔊' : '🔇';
    });
    $('#btn-home').addEventListener('click', () => this.goMenu());
    $('#res-name').addEventListener('change', (e) => this.progress.renameLatest(e.target.value));

    const actions = {
      tutorial: () => this.setMode(this.modes.tutorial),
      challenge: () => this.setMode(this.modes.challenge),
      free: () => this.setMode(this.modes.free),
      leaderboard: () => this.showLeaderboard(),
      menu: () => this.goMenu(),
      'next-round': () => this.modes.challenge.next(),
      'save-postcard': () => this.savePostcard(),
      'free-clear': () => this.modes.free.clear(),
      'free-save': () => this.modes.free.save(),
      retry: () => this.start(),
    };
    document.addEventListener('click', (e) => {
      const el = e.target.closest('[data-action]');
      if (el && actions[el.dataset.action]) actions[el.dataset.action]();
    });
  }

  show(id) {
    for (const s of document.querySelectorAll('.screen')) s.classList.toggle('active', s.id === id);
    this.screen = id;
    const el = id && document.getElementById(id);
    this.stage.classList.toggle('screen-open', !!el && !el.classList.contains('passthrough'));
    this.thumbsArmed = false;
    this.thumbsHold.reset();
    this.air.reset();
  }

  setMode(mode) {
    if (this.mode) this.mode.exit();
    this.mode = mode;
    this.coach.clear();
    this.painter.clear();
    if (mode) mode.enter();
    else this.hud.setLegend([{ id: 'point', action: 'Навести' }, { id: 'peace', action: 'Навести' }, { id: 'thumbsUp', action: 'Главная кнопка' }]);
  }

  goMenu() {
    this.setMode(null);
    this.show('screen-menu');
  }

  resize() {
    const w = innerWidth;
    const h = innerHeight;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    this.w = w;
    this.h = h;
    this.painter.resize(w, h, dpr);
    this.overlay.resize(w, h, dpr);
    const top = 80;
    const bottom = isMobile || w < 760 ? 150 : 110;
    const avail = Math.max(120, h - top - bottom);
    const size = Math.min(w * 0.86, avail) * 0.92;
    this.layout.box = { x: (w - size) / 2, y: top + (avail - size) / 2, size };
  }

  /** Переводит нормированную точку кадра в экранные пиксели с учётом object-fit: cover и зеркала. */
  toScreen(p) {
    const { vw, vh } = this.videoSize();
    const scale = Math.max(this.w / vw, this.h / vh);
    const dw = vw * scale;
    const dh = vh * scale;
    return { x: (this.w - dw) / 2 + (1 - p.x) * dw, y: (this.h - dh) / 2 + p.y * dh };
  }

  videoSize() {
    if (TEST || !this.video.videoWidth) return { vw: 1280, vh: 720 };
    return { vw: this.video.videoWidth, vh: this.video.videoHeight };
  }

  // ---------- Запуск ----------

  async start() {
    this.show('screen-loading');
    try {
      if (!TEST) {
        $('#loading-text').textContent = 'Включаю камеру…';
        await startCamera(this.video, { mobile: isMobile });
        await this.tracker.init((msg) => ($('#loading-text').textContent = msg));
      }
    } catch (e) {
      this.showError(e);
      return;
    }
    this.hud.showChrome(true);
    this.goMenu();
    if (!this.running) {
      this.running = true;
      this.lastFrameAt = performance.now();
      requestAnimationFrame((t) => this.loop(t));
    }
  }

  showError(e) {
    const texts = {
      denied: ['Нет доступа к камере', 'Разреши доступ к камере: нажми на значок камеры в адресной строке и выбери «Разрешить», затем «Попробовать снова».'],
      missing: ['Камера не найдена', 'Подключи веб-камеру или открой приложение на телефоне.'],
      busy: ['Камера занята', 'Закрой другие приложения, которые используют камеру (Zoom, Teams, другие вкладки), и попробуй снова.'],
      unsupported: ['Браузер не поддерживается', `${e.message}. Открой приложение в свежем Chrome, Edge, Safari или Firefox.`],
    };
    const [title, text] = texts[e instanceof CameraError ? e.kind : ''] ?? ['Что-то пошло не так', `Не удалось запустить распознавание: ${e.message}. Обнови страницу.`];
    $('#error-title').textContent = title;
    $('#error-text').textContent = text;
    this.show('screen-error');
  }

  loop(t) {
    try {
      this.processFrame(t);
    } catch (e) {
      console.error(e);
    }
    const dt = t - this.lastFrameAt;
    this.lastFrameAt = t;
    this.fps = this.fps * 0.9 + (1000 / Math.max(1, dt)) * 0.1;
    requestAnimationFrame((tt) => this.loop(tt));
  }

  // ---------- Кадр ----------

  readHands(t) {
    const result = this.injected ? this.injected(t) : this.tracker.detect(this.video, t);
    const { vw, vh } = this.videoSize();
    const hands = (result?.landmarks ?? []).map((lm) => {
      const analysis = analyzeHand(toIsotropic(lm, vw, vh));
      const pts = lm.map((p) => this.toScreen(p));
      return { lm, analysis, pts, palmNorm: analysis.palm / vh, palmPx: dist2d(pts[0], pts[9]) };
    });
    return hands.sort((a, b) => b.palmPx - a.palmPx);
  }

  processFrame(t) {
    const hands = this.readHands(t);
    const hand = hands[0] ?? null;
    const raw = hand ? classify(hand.analysis) : 'none';
    let gesture = 'none';
    let cursor = null;
    if (hand) {
      gesture = this.stabilizer.update(raw);
      cursor = this.cursorFilter.filter(hand.pts[8], t);
    } else {
      this.stabilizer.reset();
      this.cursorFilter.reset();
    }
    const drawingNow = !!hand && gesture === 'point' && this.stage.classList.contains('drawing');
    const motionIssues = this.motion.update(cursor, t, hand?.palmPx, drawingNow);
    const f = { t, hand, hands, raw, gesture, cursor, speed: this.motion.speed };

    const out = (this.mode?.frame(f)) ?? { issues: [], cursor: null };
    const cursorState = out.cursor ?? (hand ? { p: cursor, mode: 'hover' } : null);

    // --- Режим «ошибка» ---
    const ctx = this.mode?.coachContext?.() ?? { allowed: ['point', 'peace', 'thumbsUp'] };
    const brightness = this.video.srcObject ? this.brightness.sample(this.video) : null;
    const issues = [...frameIssues(hands, { brightness }), ...(hand ? gestureIssues(hand.analysis, raw, ctx) : []), ...motionIssues, ...out.issues];
    const state = this.coach.update(issues, t);
    const idle = this.mode?.idleHint?.(f) ?? { icon: '✌️', title: 'Управление жестами', fix: 'Наведи ✌️ или ☝️ на кнопку и подержи — она нажмётся' };
    if (this.hud.setCoach(state, idle) && t - this.lastWarnSound > 2500) {
      this.lastWarnSound = t;
      this.sound.warn();
    }
    if (state.resolved && state.resolved !== this.lastResolved) this.sound.fixed();
    this.lastResolved = state.resolved;

    const shown = hand ? gesture : null;
    if (shown !== this.lastGesture) {
      this.lastGesture = shown;
      this.hud.highlight(shown === 'none' ? undefined : shown);
    }

    // --- Кнопки жестами ---
    const dwellGestures = this.mode?.dwellGestures ?? ['point', 'peace'];
    const dwell = this.air.update(hand && dwellGestures.includes(gesture) ? cursor : null, t);
    let thumbs = 0;
    const main = document.querySelector('.screen.active [data-thumbs]');
    if (main && hand) {
      if (gesture !== 'thumbsUp') this.thumbsArmed = true;
      if (this.thumbsArmed && this.thumbsHold.update(gesture === 'thumbsUp', t)) {
        this.sound.click();
        main.click();
      }
      thumbs = this.thumbsHold.progress();
    }

    // --- Отрисовка ---
    this.overlay.clear();
    this.mode?.render?.(this.overlay, t);
    if (hand) this.overlay.skeleton(hand.pts, { gesture, wrong: state.issue?.fingers ?? [], t });
    this.overlay.drawParticles();
    if (cursorState) {
      const c = { ...cursorState, dwell };
      if (thumbs) Object.assign(c, { p: hand.pts[4], hold: thumbs, holdColor: '#39f3bb' });
      this.overlay.cursor(c.p, c);
    }

    if (DEBUG) this.debug(hand, raw, gesture);
    window.__luiqi.last = { raw, gesture, issue: state.issue?.id ?? null, issueTitle: state.issue?.title ?? null, screen: this.screen, strokes: this.painter.strokes.length };
  }

  debug(hand, raw, gesture) {
    const el = $('#debug');
    el.hidden = false;
    if (!hand) {
      el.textContent = `fps ${this.fps.toFixed(0)} · нет руки · ${this.tracker.delegate ?? ''}`;
      return;
    }
    const a = hand.analysis;
    const lines = Object.entries(a.details).map(([k, d]) => `${k.padEnd(6)} ${a.fingers[k].padEnd(4)} bend ${d.bend.toFixed(0).padStart(3)}  ${d.reach ? 'reach ' + d.reach.toFixed(2) : 'out ' + d.out.toFixed(2)}`);
    el.textContent = [`fps ${this.fps.toFixed(0)} · ${this.tracker.delegate ?? 'test'}`, `raw ${raw} → ${gesture}`, `pinch ${a.pinchRatio.toFixed(2)} thumbUp ${a.thumbUpCos.toFixed(2)} width ${a.widthRatio.toFixed(2)} palm ${hand.palmNorm.toFixed(2)}`, ...lines].join('\n');
  }

  // ---------- Итоги и рекорды ----------

  finishChallenge(results, total) {
    this.mode.exit();
    this.mode = null;
    this.hud.setLegend([{ id: 'point', action: 'Навести' }, { id: 'peace', action: 'Навести' }, { id: 'thumbsUp', action: 'Ещё раз' }]);
    const name = this.progress.name || randomName();
    const acc = Math.round(results.reduce((s, r) => s + r.score.accuracy, 0) / results.length);
    const place = this.progress.addGame({ name, score: total, accuracy: acc, shapes: results.map((r) => r.shape.id) });
    this.progress.setName(name);
    this.lastResults = { results, total, acc, name };

    $('#res-score').textContent = total;
    $('#res-acc').textContent = `${acc}%`;
    $('#res-place').textContent = place ? `№${place}` : '—';
    $('#res-name').value = name;
    $('#res-gallery').innerHTML = results
      .map((r) => `<figure><img src="${r.thumb}" alt="${r.shape.name}" /><figcaption>${r.shape.emoji} ${r.shape.name} · ${r.score.accuracy}% · ${'★'.repeat(r.score.stars) || '—'}</figcaption></figure>`)
      .join('');
    const mistakes = this.coach.topMistakes(3);
    const worst = [...results].sort((a, b) => a.score.accuracy - b.score.accuracy)[0];
    const items = mistakes.map((m) => `<li><b>${m.title}</b> — ${m.count}×<small>${m.fix}</small></li>`);
    if (worst?.score.hints[0] && worst.score.hints[0].severity > 0) items.push(`<li><b>${worst.shape.name}:</b> ${worst.score.hints[0].text}</li>`);
    if (!items.length) items.push('<li class="good">Ни одной ошибки — тренеру нечего добавить! 🏆</li>');
    else if (this.coach.fixedCount) items.push(`<li class="good">Исправлено на ходу по подсказкам тренера: ${this.coach.fixedCount}</li>`);
    $('#res-mistakes').innerHTML = items.join('');
    this.show('screen-results');
    this.sound.fanfare();
    this.celebrate();
  }

  showLeaderboard() {
    this.setMode(null);
    const latest = this.progress.records.reduce((a, b) => (!a || b.date > a.date ? b : a), null);
    $('#board-body').innerHTML =
      this.progress.records
        .map((r, i) => `<tr class="${r === latest ? 'me' : ''}"><td>${i + 1}</td><td>${escapeHtml(r.name)}</td><td>${r.score}</td><td>${r.accuracy}%</td></tr>`)
        .join('') || '<tr><td colspan="4">Пока пусто — сыграй челлендж 🏆</td></tr>';
    $('#board-shapes').innerHTML = Object.values(SHAPES)
      .map((s) => `<span>${s.emoji} ${s.name}: <b>${this.progress.bestFor(s.id) || '—'}${this.progress.bestFor(s.id) ? '%' : ''}</b></span>`)
      .join('');
    this.show('screen-leaderboard');
  }

  celebrate() {
    const colors = ['#5b8cff', '#ff4fd8', '#39f3bb', '#ffd23f'];
    for (let i = 0; i < 8; i++) this.overlay.burst(Math.random() * this.w, Math.random() * this.h * 0.5, colors[i % 4], 24);
  }

  savePostcard() {
    const r = this.lastResults;
    if (!r) return;
    const c = document.createElement('canvas');
    c.width = 1200;
    c.height = 630;
    const x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 1200, 630);
    g.addColorStop(0, '#0b0d17');
    g.addColorStop(1, '#1a1440');
    x.fillStyle = g;
    x.fillRect(0, 0, 1200, 630);
    x.fillStyle = '#fff';
    x.font = '800 44px Unbounded, sans-serif';
    x.fillText('Luiqi · нарисовано руками', 50, 80);
    x.font = '700 28px Manrope, sans-serif';
    x.fillStyle = '#39f3bb';
    x.fillText(`${r.name} — ${r.total} очков, точность ${r.acc}%`, 50, 130);
    const imgs = r.results.map((res) => new Promise((ok) => {
      const im = new Image();
      im.onload = () => ok({ im, res });
      im.src = res.thumb;
    }));
    Promise.all(imgs).then((list) => {
      list.forEach(({ im, res }, i) => {
        const w = 340;
        const h = (im.height / im.width) * w;
        const px = 50 + i * 380;
        x.drawImage(im, px, 170, w, Math.min(h, 380));
        x.fillStyle = '#eef1ff';
        x.font = '700 24px Manrope, sans-serif';
        x.fillText(`${res.shape.name} · ${res.score.accuracy}%`, px, 590);
      });
      this.download(c.toDataURL('image/png'), 'luiqi-postcard.png');
      this.hud.toast('Открытка сохранена 💾');
    });
  }

  download(url, name) {
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

const app = new App();
window.__luiqi = {
  app,
  /** Для автотестов: fn(t) → { landmarks: [[21 точка]] } вместо камеры. */
  inject(fn) {
    app.injected = fn;
  },
};

// Если доступ к камере уже выдан — сразу запускаемся, без лишнего клика.
if (TEST) app.start();
else navigator.permissions?.query({ name: 'camera' }).then((s) => s.state === 'granted' && app.start()).catch(() => {});
