// Небольшие геометрические утилиты, общие для распознавания жестов и оценки рисунков.

export const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, (a.z ?? 0) - (b.z ?? 0));

export const dist2d = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

/** Угол в точке b (в градусах) между векторами b→a и b→c. 180° — прямая линия. */
export function angleAt(a, b, c) {
  const v1 = { x: a.x - b.x, y: a.y - b.y, z: (a.z ?? 0) - (b.z ?? 0) };
  const v2 = { x: c.x - b.x, y: c.y - b.y, z: (c.z ?? 0) - (b.z ?? 0) };
  const dot = v1.x * v2.x + v1.y * v2.y + v1.z * v2.z;
  const len = Math.hypot(v1.x, v1.y, v1.z) * Math.hypot(v2.x, v2.y, v2.z);
  if (len === 0) return 180;
  const cos = Math.min(1, Math.max(-1, dot / len));
  return (Math.acos(cos) * 180) / Math.PI;
}

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export const lerp = (a, b, t) => a + (b - a) * t;

/** Расстояние от точки p до отрезка ab (2D). */
export function distToSegment(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return dist2d(p, a);
  const t = clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / len2, 0, 1);
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** Длина ломаной. */
export function pathLength(points) {
  let len = 0;
  for (let i = 1; i < points.length; i++) len += dist2d(points[i - 1], points[i]);
  return len;
}

/**
 * Равномерно передискретизирует ломаную с шагом step.
 * Нужна, чтобы быстрые и медленные штрихи оценивались одинаково.
 */
export function resample(points, step) {
  if (points.length === 0) return [];
  if (points.length === 1) return [{ x: points[0].x, y: points[0].y }];
  const out = [{ x: points[0].x, y: points[0].y }];
  let carry = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const seg = dist2d(a, b);
    if (seg === 0) continue;
    let d = step - carry;
    while (d <= seg) {
      const t = d / seg;
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
      d += step;
    }
    carry = seg - (d - step);
  }
  const last = points[points.length - 1];
  if (dist2d(out[out.length - 1], last) > step * 0.3) out.push({ x: last.x, y: last.y });
  return out;
}
