import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SHAPES, pickRounds } from '../js/core/shapes.js';
import { scoreDrawing, roundPoints, starsFor, distanceToShape } from '../js/core/shapeScore.js';
import { resample } from '../js/core/geometry.js';

const jitter = (pts, amp, seed = 1) => {
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647 - 0.5) * 2;
  return pts.map((p) => ({ x: p.x + rnd() * amp, y: p.y + rnd() * amp }));
};

test('точная обводка даёт высокую точность и 3 звезды', () => {
  for (const shape of Object.values(SHAPES)) {
    const r = scoreDrawing(shape, shape.paths.map((p) => jitter(resample(p, 0.02), 0.01)));
    assert.ok(r.accuracy >= 90, `${shape.id}: ${r.accuracy}`);
    assert.equal(r.stars, 3);
  }
});

test('пустой холст — 0 и подсказка поднять палец', () => {
  const r = scoreDrawing(SHAPES.circle, []);
  assert.equal(r.accuracy, 0);
  assert.match(r.hints[0].text, /Холст пустой/);
});

test('половина круга: подсказка называет пропущенную сторону', () => {
  const half = SHAPES.circle.paths[0].filter((p) => p.x <= 0.5);
  const r = scoreDrawing(SHAPES.circle, [half]);
  assert.ok(r.coverage > 0.4 && r.coverage < 0.65, String(r.coverage));
  assert.ok(r.hints.some((h) => /Пропущен участок контура .*справа/.test(h.text)), JSON.stringify(r.hints));
});

test('круг слишком большого радиуса: «линия уходит наружу»', () => {
  const big = SHAPES.circle.paths[0].map((p) => ({ x: 0.5 + (p.x - 0.5) * 1.35, y: 0.5 + (p.y - 0.5) * 1.35 }));
  const r = scoreDrawing(SHAPES.circle, [big]);
  assert.ok(r.accuracy < 50, String(r.accuracy));
  assert.ok(r.hints.some((h) => /наружу/.test(h.text)), JSON.stringify(r.hints));
});

test('незамкнутый контур', () => {
  const pts = SHAPES.circle.paths[0].slice(0, -12);
  const r = scoreDrawing(SHAPES.circle, [pts]);
  assert.ok(r.hints.some((h) => /не замкнут/.test(h.text)), JSON.stringify(r.hints));
});

test('каракули штрафуются', () => {
  const scribble = [];
  for (let i = 0; i < 400; i++) scribble.push({ x: 0.5 + 0.45 * Math.sin(i * 1.7), y: 0.5 + 0.45 * Math.cos(i * 2.3) });
  const r = scoreDrawing(SHAPES.circle, [scribble]);
  assert.ok(r.hints.some((h) => /лишних линий/.test(h.text)));
});

test('очки, звёзды и расстояние до фигуры', () => {
  assert.deepEqual(roundPoints(80, 10), { base: 800, timeBonus: 50, total: 850 });
  assert.equal(roundPoints(30, 10).timeBonus, 0, 'бонус за скорость только за приличный рисунок');
  assert.deepEqual([starsFor(90), starsFor(70), starsFor(45), starsFor(10)], [3, 2, 1, 0]);
  assert.ok(distanceToShape(SHAPES.circle, { x: 0.5, y: 0.08 }) < 0.01);
  assert.ok(distanceToShape(SHAPES.circle, { x: 0.5, y: 0.5 }) > 0.4);
});

test('три раунда нарастающей сложности', () => {
  const r = pickRounds(() => 0.99);
  assert.deepEqual(r.map((s) => s.level), [1, 2, 3]);
});
