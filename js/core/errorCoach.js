// Режим «ошибка»: находим неправильные или неточные движения и формулируем
// конкретную подсказку — что именно не так и что поменять.
//
// Источники ошибок:
//  1. кадр целиком (нет руки, две руки, слишком близко/далеко, край кадра, темно);
//  2. форма руки (какой палец не в том положении относительно нужного жеста);
//  3. движение (слишком быстро, рука пропала посреди линии);
//  4. рисунок (линия ушла от контура — это считает shapeScore.js).
// Coach решает, какую подсказку показать, чтобы они не мигали.

import { EXT, HALF, CURL, GESTURES, GESTURE_SHAPES, THRESHOLDS, gestureDistance } from './gestures.js';

const ADJ = { thumb: 'большой', index: 'указательный', middle: 'средний', ring: 'безымянный' };
const CAP = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/** «средний палец», «средний и безымянный пальцы», «средний, безымянный пальцы и мизинец». */
export function fingerList(keys) {
  const adj = keys.filter((k) => k !== 'pinky').map((k) => ADJ[k]);
  const hasPinky = keys.includes('pinky');
  let head = '';
  if (adj.length === 1) head = `${adj[0]} палец`;
  else if (adj.length > 1) head = `${adj.slice(0, -1).join(', ')} и ${adj[adj.length - 1]} пальцы`;
  if (!hasPinky) return head;
  if (!head) return 'мизинец';
  return adj.length > 1 ? `${head.replace(' и ', ', ')} и мизинец` : `${head} и мизинец`;
}

const fingerName = (k) => (k === 'pinky' ? 'мизинец' : `${ADJ[k]} палец`);

export const PURPOSE = {
  point: 'чтобы рисовать',
  peace: 'чтобы водить курсором без линии',
  palm: 'чтобы стирать',
  pinch: 'чтобы сменить цвет',
  fist: 'чтобы очистить холст',
  thumbsUp: 'чтобы сдать рисунок',
};

function describeWrongFinger({ finger, need, have }) {
  const name = CAP(fingerName(finger));
  if (have === HALF) return need === EXT ? `${name} согнут наполовину` : `${name} приподнят`;
  if (need === EXT) return `${name} согнут`;
  return `${name} выпрямлен`;
}

/**
 * Строит подсказку, как из текущего положения пальцев получить жест target.
 * Возвращает null, если пальцы уже в нужном положении.
 */
export function fingerHint(fingers, target) {
  const { wrong } = gestureDistance(fingers, target);
  if (!wrong.length) return null;
  const toExt = wrong.filter((w) => w.need === EXT).map((w) => w.finger);
  const toCurl = wrong.filter((w) => w.need === CURL).map((w) => w.finger);
  const actions = [];
  if (toExt.length) actions.push(`выпрями ${fingerList(toExt)}`);
  if (toCurl.length) actions.push(`прижми к ладони ${fingerList(toCurl)}`);
  return {
    id: `finger:${target}:${wrong.map((w) => w.finger + w.have).join(',')}`,
    kind: 'finger',
    severity: 2,
    title: describeWrongFinger(wrong[0]) + (wrong.length > 1 ? ` (+ещё ${wrong.length - 1})` : ''),
    fix: `${CAP(actions.join(' и '))}, ${PURPOSE[target]} ${GESTURES[target].emoji}`,
    fingers: wrong.map((w) => w.finger),
    target,
  };
}

/**
 * Ошибки уровня кадра.
 * @param hands [{ lm: нормированные точки 0..1, analysis }]
 * @param opts { aspect: frameW/frameH, brightness: 0..255 | null }
 */
export function frameIssues(hands, { brightness = null } = {}) {
  const issues = [];
  if (brightness !== null && brightness < 45) {
    issues.push({
      id: 'dark',
      severity: 3,
      title: 'Слишком темно',
      fix: 'Включи свет или повернись лицом к окну: в темноте пальцы распознаются с ошибками',
      delay: 800,
    });
  }
  if (!hands.length) {
    issues.push({
      id: 'no_hand',
      severity: 1,
      title: 'Руки не видно',
      fix: 'Подними ладонь перед камерой на уровне груди, в 40–60 см от экрана',
      delay: 1500,
    });
    return issues;
  }
  if (hands.length > 1) {
    issues.push({
      id: 'two_hands',
      severity: 2,
      title: 'В кадре две руки',
      fix: 'Рисует одна рука: убери вторую из кадра, чтобы жесты не путались',
      delay: 600,
    });
  }
  const { lm, palmNorm } = hands[0];
  if (palmNorm > 0.42) {
    issues.push({ id: 'too_close', severity: 3, title: 'Рука слишком близко', fix: 'Отодвинь руку на 20–30 см от камеры — сейчас пальцы обрезаются' });
  } else if (palmNorm < 0.075) {
    issues.push({ id: 'too_far', severity: 2, title: 'Рука слишком далеко', fix: 'Поднеси руку ближе к камере, чтобы пальцы было видно чётко', delay: 700 });
  }
  const out = lm.filter((p) => p.x < 0.015 || p.x > 0.985 || p.y < 0.015 || p.y > 0.985);
  if (out.length >= 2) {
    const mx = out.reduce((s, p) => s + p.x, 0) / out.length;
    const my = out.reduce((s, p) => s + p.y, 0) / out.length;
    const sides = [];
    if (my < 0.2) sides.push('верхнего');
    else if (my > 0.8) sides.push('нижнего');
    // Видео отзеркалено: маленький x в кадре — справа на экране.
    if (mx < 0.2) sides.push('правого');
    else if (mx > 0.8) sides.push('левого');
    const where = sides.length ? `у ${sides.join(' и ')} края` : 'у края';
    issues.push({ id: 'edge', severity: 2, title: `Рука ${where} кадра`, fix: 'Сдвинь руку ближе к центру экрана — часть пальцев не попадает в камеру', delay: 400 });
  }
  return issues;
}

/**
 * Ошибки формы руки.
 * @param analysis результат analyzeHand
 * @param raw распознанный жест
 * @param ctx { target?: ожидаемый жест (обучение), allowed?: жесты, которые сейчас имеют смысл }
 */
export function gestureIssues(analysis, raw, { target = null, allowed = Object.keys(GESTURES) } = {}) {
  const { fingers, pinchRatio, thumbUpCos, thumbAbove, widthRatio } = analysis;
  const issues = [];
  const fourCurled = ['index', 'middle', 'ring', 'pinky'].every((k) => fingers[k] === CURL);

  // Большой палец выпрямлен, но смотрит вбок — пользователь явно хотел 👍.
  const wantsThumb = target === 'thumbsUp' || (!target && raw === 'none');
  const thumbWrong = thumbUpCos < THRESHOLDS.thumbUpCos || thumbAbove < THRESHOLDS.thumbAbove;
  if (wantsThumb && fourCurled && fingers.thumb === EXT && thumbWrong && allowed.includes('thumbsUp')) {
    let title = 'Большой палец не поднят над кулаком';
    if (thumbUpCos < -0.3) title = 'Большой палец смотрит вниз';
    else if (thumbUpCos < THRESHOLDS.thumbUpCos) title = 'Большой палец смотрит вбок';
    issues.push({
      id: 'thumb_sideways',
      severity: 2,
      title,
      fix: 'Направь большой палец строго вверх над кулаком, чтобы сдать рисунок 👍 — или прижми его к кулаку для ✊',
      fingers: ['thumb'],
    });
    return issues;
  }

  // Почти щипок.
  const wantsPinch = target === 'pinch' || (!target && raw === 'none');
  if (wantsPinch && raw !== 'pinch' && pinchRatio >= THRESHOLDS.pinchOn && pinchRatio < THRESHOLDS.pinchNear && allowed.includes('pinch')) {
    const gap = Math.round((pinchRatio - THRESHOLDS.pinchOn) * 100);
    issues.push({
      id: 'pinch_near',
      severity: 2,
      title: 'Почти щипок',
      fix: `Сведи кончики большого и указательного пальцев вплотную (осталось ~${Math.max(1, gap)}% ладони), чтобы сменить цвет 🤏`,
      fingers: ['thumb', 'index'],
    });
    return issues;
  }

  // Ладонь повёрнута ребром — пальцы перекрывают друг друга.
  const palmIntent = target === 'palm' || raw === 'palm' || (!target && raw === 'none' && gestureDistance(fingers, 'palm').cost <= 1.5);
  if (palmIntent && widthRatio < 0.38) {
    issues.push({ id: 'sideways', severity: 2, title: 'Ладонь повёрнута боком', fix: 'Разверни ладонь к камере внутренней стороной — так видны все пальцы', delay: 500 });
    return issues;
  }

  if (target) {
    if (raw === target) return issues;
    if (target === 'pinch') {
      issues.push({
        id: 'pinch_far',
        severity: 2,
        title: 'Пальцы разведены',
        fix: 'Соедини кончики большого и указательного пальцев, остальные прижми — чтобы сменить цвет 🤏',
        fingers: ['thumb', 'index'],
      });
      return issues;
    }
    const hint = fingerHint(fingers, target);
    if (hint) {
      if (raw !== 'none') hint.title = `Это ${GESTURES[raw].emoji}, а нужен ${GESTURES[target].emoji}: ${hint.title.toLowerCase()}`;
      issues.push(hint);
    } else if (target === 'thumbsUp') {
      issues.push({ id: 'thumb_sideways', severity: 2, title: 'Большой палец не смотрит вверх', fix: 'Направь большой палец строго вверх 👍', fingers: ['thumb'] });
    }
    return issues;
  }

  if (raw !== 'none') return issues;
  // Жест не распознан: ищем ближайший разрешённый и объясняем разницу.
  let best = null;
  for (const g of allowed) {
    if (g === 'pinch') continue;
    const d = gestureDistance(fingers, g);
    if (!best || d.cost < best.cost) best = { g, cost: d.cost };
  }
  if (best && best.cost > 0 && best.cost <= 1.5) {
    const hint = fingerHint(fingers, best.g);
    if (hint) issues.push({ ...hint, delay: 450 });
  }
  return issues;
}

/**
 * Следит за скоростью кончика пальца во время рисования.
 * Скорость меряем в «ладонях в секунду», чтобы не зависеть от расстояния до камеры.
 */
export class MotionMonitor {
  constructor({ maxSpeed = 7, frames = 3 } = {}) {
    this.maxSpeed = maxSpeed;
    this.framesNeeded = frames;
    this.prev = null;
    this.fastFrames = 0;
    this.speed = 0;
  }
  update(point, tMs, palmPx, drawing) {
    const issues = [];
    if (this.prev && point) {
      const dt = Math.max(1, tMs - this.prev.t) / 1000;
      const d = Math.hypot(point.x - this.prev.x, point.y - this.prev.y) / (palmPx || 1);
      this.speed = d / dt;
    } else this.speed = 0;
    this.prev = point ? { ...point, t: tMs } : null;
    this.fastFrames = drawing && this.speed > this.maxSpeed ? this.fastFrames + 1 : 0;
    if (this.fastFrames >= this.framesNeeded) {
      issues.push({
        id: 'too_fast',
        severity: 2,
        title: 'Слишком быстро',
        fix: 'Веди палец медленнее — примерно одна ладонь за полсекунды, иначе линия получится рваной',
        delay: 0,
      });
    }
    return issues;
  }
  reset() {
    this.prev = null;
    this.fastFrames = 0;
    this.speed = 0;
  }
}

/**
 * Выбирает одну подсказку для показа. Ошибка должна продержаться delay мс
 * (чтобы не ругаться на промежуточные кадры), а показанная подсказка держится
 * минимум holdMs. Когда ошибка исчезает, коротко показываем «исправлено».
 */
export class Coach {
  constructor({ delay = 350, holdMs = 1500, resolvedMs = 1100 } = {}) {
    Object.assign(this, { delay, holdMs, resolvedMs });
    this.seen = new Map(); // id → время появления
    this.current = null;
    this.shownAt = 0;
    this.resolved = null;
    this.resolvedAt = 0;
    this.stats = new Map(); // id → { title, count }
    this.fixedCount = 0;
  }

  update(issues, tMs) {
    const ids = new Set(issues.map((i) => i.id));
    for (const id of [...this.seen.keys()]) if (!ids.has(id)) this.seen.delete(id);
    for (const i of issues) if (!this.seen.has(i.id)) this.seen.set(i.id, tMs);

    const ready = issues
      .filter((i) => tMs - this.seen.get(i.id) >= (i.delay ?? this.delay))
      .sort((a, b) => (b.severity ?? 1) - (a.severity ?? 1));
    const top = ready[0] ?? null;

    if (this.current) {
      const still = issues.find((i) => i.id === this.current.id);
      if (still) {
        this.current = still; // обновляем текст (например, сторону края кадра)
      } else if (tMs - this.shownAt >= Math.min(this.holdMs, 600)) {
        if (this.current.kind !== 'info' && this.current.id !== 'no_hand') {
          this.resolved = this.current;
          this.resolvedAt = tMs;
          this.fixedCount++;
        }
        this.current = null;
      }
    }
    if (top && (!this.current || (top.id !== this.current.id && tMs - this.shownAt >= this.holdMs && (top.severity ?? 1) >= (this.current.severity ?? 1)))) {
      if (!this.current || top.id !== this.current.id) {
        this.current = top;
        this.shownAt = tMs;
        this.resolved = null;
        const key = top.statKey ?? top.id.split(':').slice(0, 2).join(':');
        const s = this.stats.get(key) ?? { title: top.title, fix: top.fix, count: 0 };
        s.count++;
        this.stats.set(key, s);
      }
    }
    if (this.resolved && tMs - this.resolvedAt > this.resolvedMs) this.resolved = null;
    return { issue: this.current, resolved: this.current ? null : this.resolved };
  }

  /** Самые частые ошибки — для экрана итогов. */
  topMistakes(n = 3) {
    return [...this.stats.values()].sort((a, b) => b.count - a.count).slice(0, n);
  }

  resetStats() {
    this.stats.clear();
    this.fixedCount = 0;
  }

  clear() {
    this.seen.clear();
    this.current = null;
    this.resolved = null;
  }
}
