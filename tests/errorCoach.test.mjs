import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeHand, classify, toIsotropic } from '../js/core/gestures.js';
import { Coach, MotionMonitor, fingerHint, fingerList, frameIssues, gestureIssues } from '../js/core/errorCoach.js';
import { POSES, makeHand, FRAME } from './helpers/poses.mjs';

const analyze = (lm) => analyzeHand(toIsotropic(lm, FRAME.w, FRAME.h));
const hand = (lm) => {
  const analysis = analyze(lm);
  return { lm, analysis, palmNorm: analysis.palm / FRAME.h };
};

test('fingerList склоняет названия пальцев', () => {
  assert.equal(fingerList(['middle']), 'средний палец');
  assert.equal(fingerList(['pinky']), 'мизинец');
  assert.equal(fingerList(['middle', 'ring']), 'средний и безымянный пальцы');
  assert.equal(fingerList(['middle', 'ring', 'pinky']), 'средний, безымянный пальцы и мизинец');
  assert.equal(fingerList(['ring', 'pinky']), 'безымянный палец и мизинец');
});

test('приподнятый средний палец: подсказка называет палец и действие', () => {
  const a = analyze(makeHand({ index: 'ext', middle: 'half' }));
  const [issue] = gestureIssues(a, classify(a), {});
  assert.ok(issue, 'должна быть подсказка');
  assert.match(issue.title, /Средний палец приподнят/);
  assert.match(issue.fix, /прижми к ладони средний палец/i);
  assert.match(issue.fix, /рисовать/);
  assert.deepEqual(issue.fingers, ['middle']);
});

test('согнутый указательный палец → «выпрями указательный палец»', () => {
  const a = analyze(makeHand({ index: 'half' }));
  const [issue] = gestureIssues(a, classify(a), { target: 'point' });
  assert.match(issue.title, /Указательный палец согнут наполовину/);
  assert.match(issue.fix, /Выпрями указательный палец/);
});

test('ладонь с согнутым безымянным → конкретная подсказка для ластика', () => {
  const a = analyze(makeHand({ thumb: 'ext', index: 'ext', middle: 'ext', ring: 'half', pinky: 'ext' }));
  const [issue] = gestureIssues(a, classify(a), { target: 'palm' });
  assert.match(issue.fix, /Выпрями безымянный палец/);
  assert.match(issue.fix, /стирать/);
});

test('в обучении другой жест объясняется относительно нужного', () => {
  const a = analyze(POSES.peace());
  const [issue] = gestureIssues(a, classify(a), { target: 'point' });
  assert.match(issue.title, /Это ✌️, а нужен ☝️/);
  assert.match(issue.fix, /прижми к ладони средний палец/i);
});

test('большой палец вбок → «направь вверх»', () => {
  const a = analyze(makeHand({ thumb: 'left' }));
  const [issue] = gestureIssues(a, classify(a), {});
  assert.equal(issue.id, 'thumb_sideways');
  assert.match(issue.fix, /вверх/);
});

test('правильный жест не вызывает подсказок', () => {
  for (const pose of Object.values(POSES)) {
    const a = analyze(pose());
    assert.deepEqual(gestureIssues(a, classify(a), {}), []);
  }
});

test('fingerHint возвращает null, если всё верно', () => {
  assert.equal(fingerHint(analyze(POSES.point()).fingers, 'point'), null);
});

test('ошибки кадра: нет руки, две руки, близко, далеко, край, темно', () => {
  assert.equal(frameIssues([])[0].id, 'no_hand');
  const ok = hand(POSES.point());
  assert.deepEqual(frameIssues([ok]).map((i) => i.id), []);
  assert.ok(frameIssues([ok, ok]).some((i) => i.id === 'two_hands'));
  assert.ok(frameIssues([hand(makeHand({ index: 'ext' }, { scale: 2.5, cy: 0.9 }))]).some((i) => i.id === 'too_close'));
  assert.ok(frameIssues([hand(makeHand({ index: 'ext' }, { scale: 0.3 }))]).some((i) => i.id === 'too_far'));
  const edge = frameIssues([hand(makeHand({ index: 'ext' }, { cx: 0.02 }))]).find((i) => i.id === 'edge');
  assert.match(edge.title, /правого/, 'видео отзеркалено: левый край кадра — правый край экрана');
  assert.ok(frameIssues([ok], { brightness: 20 }).some((i) => i.id === 'dark'));
});

test('MotionMonitor ругается на слишком быстрое рисование', () => {
  const m = new MotionMonitor({ maxSpeed: 7, frames: 3 });
  let issues = [];
  for (let i = 0; i < 6; i++) issues = m.update({ x: i * 200, y: 0 }, i * 16, 100, true);
  assert.equal(issues[0]?.id, 'too_fast');
  const slow = new MotionMonitor();
  for (let i = 0; i < 6; i++) issues = slow.update({ x: i * 2, y: 0 }, i * 16, 100, true);
  assert.deepEqual(issues, []);
});

test('Coach: задержка, приоритет, «исправлено» и статистика', () => {
  const c = new Coach({ delay: 300, holdMs: 1000 });
  const a = { id: 'a', severity: 1, title: 'A', fix: 'fa' };
  const b = { id: 'b', severity: 3, title: 'B', fix: 'fb' };
  assert.equal(c.update([a], 0).issue, null, 'не показываем сразу');
  assert.equal(c.update([a, b], 350).issue.id, 'a');
  assert.equal(c.update([a, b], 700).issue.id, 'a', 'держим показанную подсказку');
  assert.equal(c.update([a, b], 1400).issue.id, 'b', 'более важная вытесняет после holdMs');
  const s = c.update([], 2100);
  assert.equal(s.issue, null);
  assert.equal(s.resolved.id, 'b');
  assert.equal(c.fixedCount, 1);
  assert.deepEqual(c.topMistakes().map((m) => m.title).sort(), ['A', 'B']);
});
