import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeHand, classify, toIsotropic, gestureDistance, EXT, CURL, HALF } from '../js/core/gestures.js';
import { POSES, makeHand, FRAME } from './helpers/poses.mjs';

const analyze = (lm) => analyzeHand(toIsotropic(lm, FRAME.w, FRAME.h));

test('каждая эталонная поза распознаётся как свой жест', () => {
  for (const [id, pose] of Object.entries(POSES)) {
    assert.equal(classify(analyze(pose())), id, `поза ${id}`);
  }
});

test('распознавание не зависит от положения, масштаба и наклона руки', () => {
  for (const opts of [{ cx: 0.25, cy: 0.6 }, { scale: 0.6 }, { scale: 1.4 }, { rotate: -25 }, { rotate: 20, cx: 0.7 }]) {
    assert.equal(classify(analyze(makeHand({ index: 'ext' }, opts))), 'point', JSON.stringify(opts));
    assert.equal(classify(analyze(makeHand({ thumb: 'ext', index: 'ext', middle: 'ext', ring: 'ext', pinky: 'ext' }, opts))), 'palm', JSON.stringify(opts));
  }
});

test('полусогнутый палец получает состояние half', () => {
  const a = analyze(makeHand({ index: 'half' }));
  assert.equal(a.fingers.index, HALF);
  assert.equal(classify(a), 'none');
});

test('состояния пальцев в ладони и кулаке', () => {
  const palm = analyze(POSES.palm());
  const fist = analyze(POSES.fist());
  for (const k of ['index', 'middle', 'ring', 'pinky']) {
    assert.equal(palm.fingers[k], EXT);
    assert.equal(fist.fingers[k], CURL);
  }
});

test('большой палец вбок — не 👍', () => {
  const a = analyze(makeHand({ thumb: 'left' }));
  assert.notEqual(classify(a), 'thumbsUp');
});

test('gestureDistance считает полусогнутый палец за половину ошибки', () => {
  const a = analyze(makeHand({ index: 'ext', middle: 'half' }));
  const d = gestureDistance(a.fingers, 'point');
  assert.equal(d.cost, 0.5);
  assert.deepEqual(d.wrong.map((w) => w.finger), ['middle']);
});
