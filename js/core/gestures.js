// Собственный классификатор жестов по 21 точке руки MediaPipe.
// Мы не используем готовый GestureRecognizer: состояние каждого пальца
// вычисляется из углов в суставах, а жест — из комбинации состояний.
// Это же позволяет понять, какой именно палец «ошибся» (см. errorCoach.js).

import { angleAt, dist } from './geometry.js';

export const LM = {
  WRIST: 0,
  THUMB: [1, 2, 3, 4],
  INDEX: [5, 6, 7, 8],
  MIDDLE: [9, 10, 11, 12],
  RING: [13, 14, 15, 16],
  PINKY: [17, 18, 19, 20],
};

export const FINGER_KEYS = ['thumb', 'index', 'middle', 'ring', 'pinky'];
const FINGER_LM = { thumb: LM.THUMB, index: LM.INDEX, middle: LM.MIDDLE, ring: LM.RING, pinky: LM.PINKY };

export const EXT = 'ext';
export const HALF = 'half';
export const CURL = 'curl';

export const GESTURES = {
  point: { id: 'point', emoji: '☝️', name: 'Указательный', action: 'Рисовать' },
  peace: { id: 'peace', emoji: '✌️', name: 'Два пальца', action: 'Курсор без рисования' },
  palm: { id: 'palm', emoji: '🖐', name: 'Ладонь', action: 'Ластик' },
  pinch: { id: 'pinch', emoji: '🤏', name: 'Щипок', action: 'Сменить цвет' },
  fist: { id: 'fist', emoji: '✊', name: 'Кулак (держать)', action: 'Очистить холст' },
  thumbsUp: { id: 'thumbsUp', emoji: '👍', name: 'Большой палец вверх', action: 'Готово / сдать' },
};

/**
 * Какие пальцы должны быть выпрямлены (EXT) или прижаты (CURL) для каждого жеста.
 * null — палец не важен. Используется и для классификации, и для подсказок.
 */
export const GESTURE_SHAPES = {
  point: { thumb: null, index: EXT, middle: CURL, ring: CURL, pinky: CURL },
  peace: { thumb: null, index: EXT, middle: EXT, ring: CURL, pinky: CURL },
  palm: { thumb: EXT, index: EXT, middle: EXT, ring: EXT, pinky: EXT },
  fist: { thumb: CURL, index: CURL, middle: CURL, ring: CURL, pinky: CURL },
  thumbsUp: { thumb: EXT, index: CURL, middle: CURL, ring: CURL, pinky: CURL },
  pinch: { thumb: null, index: null, middle: null, ring: null, pinky: null },
};

export const THRESHOLDS = {
  fingerStraight: 155, // средний угол в PIP/DIP выше этого — палец прямой
  fingerCurled: 115, // ниже — согнут
  thumbStraight: 145,
  thumbOutRatio: 1.12, // кончик большого дальше от основания мизинца, чем его сустав, — палец отведён
  thumbInRatio: 1.0, // ближе — палец лежит поперёк ладони
  thumbAbove: 0.25, // для 👍 кончик большого пальца выше основания указательного на 1/4 ладони
  pinchOn: 0.28, // расстояние между кончиками большого и указательного в долях ладони
  pinchNear: 0.5,
  thumbUpCos: 0.6, // насколько вертикально должен смотреть большой палец
};

/**
 * Переводит нормированные точки MediaPipe в изотропные единицы
 * (x и y в пикселях кадра, z — в масштабе x), чтобы углы считались корректно.
 */
export function toIsotropic(landmarks, frameW = 1, frameH = 1) {
  return landmarks.map((p) => ({ x: p.x * frameW, y: p.y * frameH, z: (p.z ?? 0) * frameW }));
}

/** Размер ладони: запястье → основание среднего пальца. Всё меряем в этих единицах. */
export const palmSize = (lm) => dist(lm[LM.WRIST], lm[LM.MIDDLE[0]]) || 1e-6;

/** Ширина ладони (основание указательного → основание мизинца). */
export const palmWidth = (lm) => dist(lm[LM.INDEX[0]], lm[LM.PINKY[0]]);

function fingerState(lm, key, palm) {
  const [mcp, pip, dip, tip] = FINGER_LM[key];
  if (key === 'thumb') {
    const bend = (angleAt(lm[1], lm[2], lm[3]) + angleAt(lm[2], lm[3], lm[4])) / 2;
    const pinkyBase = lm[LM.PINKY[0]];
    const out = dist(lm[tip], pinkyBase) / (dist(lm[dip], pinkyBase) || 1e-6);
    let state = HALF;
    if (bend >= THRESHOLDS.thumbStraight && out >= THRESHOLDS.thumbOutRatio) state = EXT;
    else if (out < THRESHOLDS.thumbInRatio || bend < 115) state = CURL;
    return { state, bend, out };
  }
  const a1 = angleAt(lm[mcp], lm[pip], lm[dip]);
  const a2 = angleAt(lm[pip], lm[dip], lm[tip]);
  const bend = (a1 + a2) / 2;
  const wrist = lm[LM.WRIST];
  // Кончик ближе к запястью, чем средний сустав — палец точно сложен.
  const reach = dist(wrist, lm[tip]) / (dist(wrist, lm[pip]) || 1e-6);
  let state = HALF;
  if (bend >= THRESHOLDS.fingerStraight && reach > 1.1) state = EXT;
  else if (bend < THRESHOLDS.fingerCurled || reach < 1.0) state = CURL;
  return { state, bend, reach };
}

/**
 * Полный разбор руки: состояние каждого пальца + метрики.
 * @param lm изотропные точки (см. toIsotropic)
 */
export function analyzeHand(lm) {
  const palm = palmSize(lm);
  const fingers = {};
  const details = {};
  for (const key of FINGER_KEYS) {
    const d = fingerState(lm, key, palm);
    fingers[key] = d.state;
    details[key] = d;
  }
  const pinchRatio = dist(lm[LM.THUMB[3]], lm[LM.INDEX[3]]) / palm;
  // Направление большого пальца: вектор от MCP к кончику.
  const tv = { x: lm[4].x - lm[2].x, y: lm[4].y - lm[2].y };
  const tlen = Math.hypot(tv.x, tv.y) || 1e-6;
  const thumbUpCos = -tv.y / tlen; // 1 — строго вверх (y в кадре растёт вниз)
  const widthRatio = palmWidth(lm) / palm;
  const thumbAbove = (lm[LM.INDEX[0]].y - lm[LM.THUMB[3]].y) / palm;
  return { fingers, details, palm, pinchRatio, thumbUpCos, thumbAbove, widthRatio };
}

function matches(fingers, shape) {
  return FINGER_KEYS.every((k) => shape[k] === null || fingers[k] === shape[k]);
}

/**
 * Классифицирует жест. Возвращает id жеста или 'none'.
 * Порядок проверок важен: щипок перекрывает остальные жесты.
 */
export function classify(analysis) {
  const { fingers, details, pinchRatio, thumbUpCos, thumbAbove } = analysis;
  // Щипок: кончики сведены, а указательный не спрятан в кулак (иначе это кулак).
  if (pinchRatio < THRESHOLDS.pinchOn && details.index.reach >= 1.0) return 'pinch';
  if (matches(fingers, GESTURE_SHAPES.point)) return 'point';
  if (matches(fingers, GESTURE_SHAPES.peace)) return 'peace';
  if (matches(fingers, GESTURE_SHAPES.palm)) return 'palm';
  const fourCurled = ['index', 'middle', 'ring', 'pinky'].every((k) => fingers[k] === CURL);
  if (fourCurled && fingers.thumb === EXT && thumbUpCos >= THRESHOLDS.thumbUpCos && thumbAbove >= THRESHOLDS.thumbAbove) return 'thumbsUp';
  if (fourCurled && fingers.thumb !== EXT) return 'fist';
  // Ладонь с чуть отведённым большим пальцем тоже считаем ладонью.
  if (['index', 'middle', 'ring', 'pinky'].every((k) => fingers[k] === EXT) && fingers.thumb === HALF) return 'palm';
  return 'none';
}

/**
 * Насколько текущие пальцы далеки от эталона жеста.
 * Полусогнутый палец — половина ошибки, противоположный — целая.
 * Возвращает { cost, wrong: [{finger, need, have}] }.
 */
export function gestureDistance(fingers, gestureId) {
  const shape = GESTURE_SHAPES[gestureId];
  const wrong = [];
  let cost = 0;
  for (const k of FINGER_KEYS) {
    const need = shape[k];
    if (need === null || fingers[k] === need) continue;
    cost += fingers[k] === HALF ? 0.5 : 1;
    wrong.push({ finger: k, need, have: fingers[k] });
  }
  return { cost, wrong };
}

/** Индексы точек пальца — для подсветки на скелете. */
export const fingerLandmarks = (key) => FINGER_LM[key];
