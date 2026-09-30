import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Progress, randomName } from '../js/core/storage.js';

const memory = () => {
  const m = new Map();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)) };
};

test('таблица рекордов сортируется и хранит 10 лучших', () => {
  const s = memory();
  const p = new Progress(s);
  for (let i = 0; i < 12; i++) p.addGame({ name: `P${i}`, score: i * 100, accuracy: 50 });
  assert.equal(p.records.length, 10);
  assert.equal(p.records[0].score, 1100);
  assert.equal(new Progress(s).records.length, 10, 'данные переживают перезагрузку');
  assert.equal(p.addGame({ name: 'low', score: 1, accuracy: 1 }), null);
  assert.equal(p.addGame({ name: 'top', score: 5000, accuracy: 99 }), 1);
});

test('личный рекорд по фигуре', () => {
  const p = new Progress(memory());
  assert.equal(p.recordShape('circle', 70), false, 'первый результат — не «побит рекорд»');
  assert.equal(p.recordShape('circle', 80), true);
  assert.equal(p.recordShape('circle', 60), false);
  assert.equal(p.bestFor('circle'), 80);
});

test('сломанное хранилище не ломает игру', () => {
  const broken = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } };
  const p = new Progress(broken);
  assert.equal(p.addGame({ name: 'x', score: 10, accuracy: 10 }), 1);
  assert.ok(randomName().includes(' '));
});
