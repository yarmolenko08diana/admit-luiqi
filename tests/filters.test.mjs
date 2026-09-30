import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GestureStabilizer, HoldTimer, OneEuroFilter } from '../js/core/filters.js';
import { resample, angleAt, pathLength } from '../js/core/geometry.js';

test('стабилизатор игнорирует одиночные «мигания» жеста', () => {
  const s = new GestureStabilizer({ framesToSwitch: 3, framesToNone: 4 });
  const seq = ['point', 'point', 'point', 'peace', 'point', 'none', 'none', 'none', 'point'];
  assert.deepEqual(seq.map((g) => s.update(g)), ['none', 'none', 'point', 'point', 'point', 'point', 'point', 'point', 'point']);
});

test('HoldTimer срабатывает один раз после удержания', () => {
  const h = new HoldTimer(500);
  assert.equal(h.update(true, 0), false);
  assert.equal(h.update(true, 499), false);
  assert.equal(h.update(true, 500), true);
  assert.equal(h.update(true, 900), false);
  h.update(false, 950);
  assert.equal(h.progress(), 0);
});

test('One Euro сглаживает шум на неподвижной точке', () => {
  const f = new OneEuroFilter({ minCutoff: 1, beta: 0 });
  let out = 0;
  for (let i = 0; i < 60; i++) out = f.filter(100 + (i % 2 ? 5 : -5), i * 16);
  assert.ok(Math.abs(out - 100) < 3, String(out));
});

test('геометрия: угол, длина, передискретизация', () => {
  assert.equal(Math.round(angleAt({ x: 0, y: 1 }, { x: 0, y: 0 }, { x: 1, y: 0 })), 90);
  assert.equal(Math.round(angleAt({ x: -1, y: 0 }, { x: 0, y: 0 }, { x: 1, y: 0 })), 180);
  const line = [{ x: 0, y: 0 }, { x: 1, y: 0 }];
  assert.equal(pathLength(line), 1);
  assert.equal(resample(line, 0.1).length, 11);
});
