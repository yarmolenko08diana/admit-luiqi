// Синтетические позы руки (21 точка в формате MediaPipe) для тестов.
// Геометрия задаётся в пикселях кадра 1280×720, ладонь смотрит в камеру,
// сгибание пальца — поворот к камере (−z), как у настоящей руки.

export const FRAME = { w: 1280, h: 720 };

const BASES = {
  thumb: { cmc: [-40, -30], mcp: [-75, -65], len: [45, 35] },
  index: { mcp: [-45, -140], len: [55, 33, 25] },
  middle: { mcp: [-10, -150], len: [60, 37, 27] },
  ring: { mcp: [22, -142], len: [55, 35, 25] },
  pinky: { mcp: [50, -125], len: [42, 27, 22] },
};

// Углы поворота (градусы) в суставах MCP, PIP, DIP для каждого состояния пальца.
const BENDS = {
  ext: [0, 0, 0],
  half: [15, 45, 30],
  curl: [70, 100, 80],
};

function finger(base, bends) {
  const pts = [];
  let [x, y, z] = [base.mcp[0], base.mcp[1], 0];
  pts.push([x, y, z]);
  let theta = 0;
  base.len.forEach((len, i) => {
    theta += (bends[i] * Math.PI) / 180;
    // Направление: вверх (−y), поворачиваясь к камере (−z).
    x += 0;
    y += -Math.cos(theta) * len;
    z += -Math.sin(theta) * len;
    pts.push([x, y, z]);
  });
  return pts;
}

function thumb(state) {
  const { cmc, mcp, len } = BASES.thumb;
  const pts = [[cmc[0], cmc[1], 0], [mcp[0], mcp[1], 0]];
  let dirs;
  if (state === 'ext') dirs = [[-0.85, -0.53], [-0.85, -0.53]];
  else if (state === 'left') dirs = [[-1, 0], [-1, 0]]; // отведён строго в сторону
  else if (state === 'half') dirs = [[-0.2, -1], [0.6, -0.8]];
  else dirs = [[0.7, -0.7], [1, 0.2]]; // лежит поперёк ладони
  let [x, y] = mcp;
  dirs.forEach(([dx, dy], i) => {
    const n = Math.hypot(dx, dy);
    x += (dx / n) * len[i];
    y += (dy / n) * len[i];
    pts.push([x, y, 0]);
  });
  return pts;
}

/**
 * Строит позу. fingers — состояния: { thumb: 'ext'|'half'|'curl'|'left', index: 'ext'|'half'|'curl', ... }
 * opts: { cx, cy — положение запястья в долях кадра, scale, rotate — поворот в градусах, pinch — свести большой и указательный }
 */
export function makeHand(fingers, { cx = 0.5, cy = 0.75, scale = 1, rotate = 0, pinch = false } = {}) {
  const pts = [[0, 0, 0]];
  pts.push(...thumb(fingers.thumb ?? 'curl'));
  for (const k of ['index', 'middle', 'ring', 'pinky']) pts.push(...finger(BASES[k], BENDS[fingers[k] ?? 'curl']));
  if (pinch) {
    const tip = pts[8];
    pts[4] = [tip[0] - 6, tip[1] + 4, tip[2]];
    pts[3] = [(pts[2][0] + pts[4][0]) / 2, (pts[2][1] + pts[4][1]) / 2, tip[2] / 2];
  }
  const a = (rotate * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  return pts.map(([x, y, z]) => {
    const rx = (x * cos - y * sin) * scale;
    const ry = (x * sin + y * cos) * scale;
    return { x: cx + rx / FRAME.w, y: cy + ry / FRAME.h, z: (z * scale) / FRAME.w };
  });
}

export const POSES = {
  point: () => makeHand({ thumb: 'curl', index: 'ext' }),
  peace: () => makeHand({ thumb: 'curl', index: 'ext', middle: 'ext' }),
  palm: () => makeHand({ thumb: 'ext', index: 'ext', middle: 'ext', ring: 'ext', pinky: 'ext' }),
  fist: () => makeHand({ thumb: 'curl' }),
  // Кулак на боку, большой палец отведён → после поворота на 90° смотрит вверх.
  thumbsUp: () => makeHand({ thumb: 'left' }, { rotate: 90 }),
  pinch: () => makeHand({ thumb: 'ext', index: 'half', middle: 'curl', ring: 'curl', pinky: 'curl' }, { pinch: true }),
};
