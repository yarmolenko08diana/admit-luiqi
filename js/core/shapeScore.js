// Оценка рисунка относительно шаблона + конкретные подсказки, где именно ошибка.
// Все координаты — в системе шаблона (единичный квадрат).

import { dist2d, distToSegment, pathLength, resample } from './geometry.js';

const STEP = 0.01;
export const TOLERANCE = 0.07; // допустимое отклонение — 7% размера фигуры

const REGION = [
  ['сверху слева', 'сверху', 'сверху справа'],
  ['слева', 'в центре', 'справа'],
  ['снизу слева', 'снизу', 'снизу справа'],
];
const regionOf = (p) => {
  const c = Math.min(2, Math.max(0, Math.floor(p.x * 3)));
  const r = Math.min(2, Math.max(0, Math.floor(p.y * 3)));
  return REGION[r][c];
};

/** Минимальное расстояние от точки до ломаных шаблона. */
export function distanceToShape(shape, p) {
  let best = Infinity;
  for (const path of shape.paths) {
    for (let i = 1; i < path.length; i++) best = Math.min(best, distToSegment(p, path[i - 1], path[i]));
  }
  return best;
}

function nearest(p, pts) {
  let best = Infinity;
  let idx = -1;
  for (let i = 0; i < pts.length; i++) {
    const d = dist2d(p, pts[i]);
    if (d < best) {
      best = d;
      idx = i;
    }
  }
  return { d: best, idx };
}

function centroid(pts) {
  const c = pts.reduce((s, p) => ({ x: s.x + p.x, y: s.y + p.y }), { x: 0, y: 0 });
  return { x: c.x / pts.length, y: c.y / pts.length };
}

export function starsFor(accuracy) {
  if (accuracy >= 85) return 3;
  if (accuracy >= 65) return 2;
  if (accuracy >= 40) return 1;
  return 0;
}

/**
 * @param shape шаблон из shapes.js
 * @param strokes массив штрихов, каждый — массив точек {x,y} в координатах шаблона
 * @returns { accuracy 0..100, coverage, precision, lengthRatio, stars, hints: [{text, severity}] }
 */
export function scoreDrawing(shape, strokes, { tol = TOLERANCE } = {}) {
  const tpl = shape.paths.flatMap((p) => resample(p, STEP));
  const drawn = strokes.filter((s) => s.length).flatMap((s) => resample(s, STEP));
  const tplLen = shape.paths.reduce((s, p) => s + pathLength(p), 0);
  const drawnLen = strokes.reduce((s, p) => s + pathLength(p), 0);

  if (drawn.length < 3) {
    return {
      accuracy: 0,
      coverage: 0,
      precision: 0,
      lengthRatio: 0,
      stars: 0,
      hints: [{ severity: 3, text: 'Холст пустой — подними указательный палец ☝️ и веди им по пунктиру' }],
    };
  }

  // Покрытие: какая доля контура обведена.
  const missedByRegion = new Map();
  const totalByRegion = new Map();
  let covered = 0;
  for (const p of tpl) {
    const r = regionOf(p);
    totalByRegion.set(r, (totalByRegion.get(r) ?? 0) + 1);
    if (nearest(p, drawn).d <= tol) covered++;
    else missedByRegion.set(r, (missedByRegion.get(r) ?? 0) + 1);
  }
  const coverage = covered / tpl.length;

  // Точность: какая доля линии лежит на контуре. Для промахов запоминаем сторону.
  const c = centroid(tpl);
  const offByRegion = new Map();
  let precise = 0;
  let maxOff = 0;
  for (const p of drawn) {
    const d = distanceToShape(shape, p);
    if (d <= tol * 1.3) {
      precise++;
      continue;
    }
    maxOff = Math.max(maxOff, d);
    const n = tpl[nearest(p, tpl).idx];
    const outside = dist2d(p, c) > dist2d(n, c);
    const r = regionOf(n);
    const e = offByRegion.get(r) ?? { out: 0, in: 0 };
    e[outside ? 'out' : 'in']++;
    offByRegion.set(r, e);
  }
  const precision = precise / drawn.length;
  const lengthRatio = drawnLen / tplLen;

  let accuracy = 100 * (0.6 * coverage + 0.4 * precision);
  if (lengthRatio > 1.8) accuracy *= Math.max(0.6, 1 - (lengthRatio - 1.8) * 0.25); // штраф за каракули
  accuracy = Math.round(Math.max(0, Math.min(100, accuracy)));

  const hints = [];
  const missed = [...missedByRegion.entries()]
    .filter(([r, n]) => n >= 4 && n / totalByRegion.get(r) > 0.3)
    .sort((a, b) => b[1] - a[1]);
  if (coverage < 0.35) {
    hints.push({ severity: 3, text: `Обведено только ${Math.round(coverage * 100)}% фигуры — не торопись сдавать, пройди весь пунктир` });
  } else if (missed.length) {
    const where = missed.slice(0, 2).map(([r]) => r).join(' и ');
    hints.push({ severity: 2, text: `Пропущен участок контура ${where} — доведи линию туда` });
  }

  const off = [...offByRegion.entries()].map(([r, e]) => ({ r, n: e.out + e.in, outside: e.out >= e.in })).sort((a, b) => b.n - a.n);
  if (off.length && off[0].n >= 5) {
    const o = off[0];
    const side = o.outside ? 'наружу, за контур' : 'внутрь фигуры';
    const px = Math.round(maxOff * 100);
    hints.push({ severity: 2, text: `${o.r.charAt(0).toUpperCase() + o.r.slice(1)} линия уходит ${side} (до ${px}% размера) — веди палец ближе к пунктиру` });
  }

  if (shape.closed && coverage >= 0.35 && coverage < 0.95) {
    const longest = strokes.reduce((a, b) => (b.length > a.length ? b : a), []);
    if (strokes.length === 1 && longest.length > 2 && dist2d(longest[0], longest[longest.length - 1]) > tol * 2.2) {
      hints.push({ severity: 1, text: 'Контур не замкнут — доведи конец линии до её начала' });
    }
  }
  if (lengthRatio > 1.8) {
    hints.push({ severity: 2, text: 'Слишком много лишних линий — обводи контур одним спокойным движением, а не штрихуй' });
  }
  if (strokes.length > 6) {
    hints.push({ severity: 1, text: `Линия прервалась ${strokes.length - 1} раз — держи указательный палец выпрямленным всё время` });
  }
  if (!hints.length && accuracy >= 85) hints.push({ severity: 0, text: 'Отличная точность — линия почти идеально лежит на контуре!' });
  hints.sort((a, b) => b.severity - a.severity);

  return { accuracy, coverage, precision, lengthRatio, stars: starsFor(accuracy), hints: hints.slice(0, 3) };
}

/** Очки за раунд: точность + бонус за оставшееся время (только если рисунок достойный). */
export function roundPoints(accuracy, secondsLeft) {
  const timeBonus = accuracy >= 50 ? Math.round(Math.max(0, secondsLeft) * 5) : 0;
  return { base: accuracy * 10, timeBonus, total: accuracy * 10 + timeBonus };
}
