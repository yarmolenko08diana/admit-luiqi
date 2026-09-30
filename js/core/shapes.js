// Фигуры-шаблоны для челленджа. Координаты в единичном квадрате [0..1],
// (0,0) — левый верхний угол. Каждая фигура — набор ломаных.

const TAU = Math.PI * 2;

function circle(cx, cy, r, n = 64) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = -Math.PI / 2 + (i / n) * TAU;
    pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
  }
  return pts;
}

function star(cx, cy, rOut, rIn, spikes = 5) {
  const pts = [];
  for (let i = 0; i <= spikes * 2; i++) {
    const r = i % 2 === 0 ? rOut : rIn;
    const a = -Math.PI / 2 + (i / (spikes * 2)) * TAU;
    pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
  }
  return pts;
}

function heart(n = 80) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * TAU;
    const x = 16 * Math.sin(t) ** 3;
    const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
    pts.push({ x: 0.5 + x / 34, y: 0.47 - y / 34 });
  }
  return pts;
}

function wave(n = 80) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    pts.push({ x: 0.05 + t * 0.9, y: 0.5 - 0.25 * Math.sin(t * TAU * 1.5) });
  }
  return pts;
}

function spiral(n = 140) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const a = t * TAU * 2.25;
    const r = 0.04 + t * 0.42;
    pts.push({ x: 0.5 + r * Math.cos(a), y: 0.5 + r * Math.sin(a) });
  }
  return pts;
}

const P = (x, y) => ({ x, y });

export const SHAPES = {
  circle: { id: 'circle', name: 'Круг', emoji: '⭕', level: 1, closed: true, paths: [circle(0.5, 0.5, 0.42)] },
  triangle: { id: 'triangle', name: 'Треугольник', emoji: '🔺', level: 1, closed: true, paths: [[P(0.5, 0.08), P(0.93, 0.88), P(0.07, 0.88), P(0.5, 0.08)]] },
  heart: { id: 'heart', name: 'Сердце', emoji: '❤️', level: 2, closed: true, paths: [heart()] },
  wave: { id: 'wave', name: 'Волна', emoji: '🌊', level: 2, closed: false, paths: [wave()] },
  house: {
    id: 'house',
    name: 'Домик',
    emoji: '🏠',
    level: 2,
    closed: true,
    paths: [[P(0.18, 0.45), P(0.18, 0.92), P(0.82, 0.92), P(0.82, 0.45), P(0.5, 0.1), P(0.18, 0.45), P(0.82, 0.45)]],
  },
  star: { id: 'star', name: 'Звезда', emoji: '⭐', level: 3, closed: true, paths: [star(0.5, 0.53, 0.46, 0.19)] },
  spiral: { id: 'spiral', name: 'Спираль', emoji: '🌀', level: 3, closed: false, paths: [spiral()] },
};

/** Три раунда нарастающей сложности: по одной случайной фигуре каждого уровня. */
export function pickRounds(rand = Math.random) {
  return [1, 2, 3].map((level) => {
    const pool = Object.values(SHAPES).filter((s) => s.level === level);
    return pool[Math.floor(rand() * pool.length)];
  });
}
