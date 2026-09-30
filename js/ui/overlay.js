// Слой обратной связи поверх видео: скелет руки (ошибочные пальцы — красным),
// курсор, кольца удержания, шаблон фигуры и частицы.

import { fingerLandmarks } from '../core/gestures.js';

const CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
];

export const GESTURE_COLORS = {
  point: '#5b8cff',
  peace: '#a78bfa',
  palm: '#ff6b4a',
  pinch: '#39f3bb',
  fist: '#ffd23f',
  thumbsUp: '#39f3bb',
  none: '#9aa3b8',
};

export class Overlay {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.particles = [];
    this.w = 1;
    this.h = 1;
  }

  resize(w, h, dpr = 1) {
    this.w = w;
    this.h = h;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  clear() {
    this.ctx.clearRect(0, 0, this.w, this.h);
  }

  /** Пунктирный шаблон фигуры в квадрате box = {x, y, size}. */
  template(shape, box, { ctx = this.ctx, alpha = 1, t = 0 } = {}) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.setLineDash([10, 12]);
    ctx.lineDashOffset = -t / 40;
    ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    ctx.shadowColor = 'rgba(120,160,255,0.9)';
    ctx.shadowBlur = 10;
    ctx.lineWidth = 3;
    for (const path of shape.paths) {
      ctx.beginPath();
      path.forEach((p, i) => {
        const x = box.x + p.x * box.size;
        const y = box.y + p.y * box.size;
        if (i) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
      });
      ctx.stroke();
    }
    // Точка старта — подсказка, откуда начинать.
    const s = shape.paths[0][0];
    ctx.setLineDash([]);
    ctx.fillStyle = '#39f3bb';
    ctx.beginPath();
    ctx.arc(box.x + s.x * box.size, box.y + s.y * box.size, 7 + Math.sin(t / 200) * 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /** Скелет руки. pts — точки в пикселях экрана; wrong — ключи пальцев с ошибкой. */
  skeleton(pts, { gesture = 'none', wrong = [], t = 0 } = {}) {
    const { ctx } = this;
    const bad = new Set(wrong.flatMap((k) => fingerLandmarks(k)));
    const color = GESTURE_COLORS[gesture] ?? GESTURE_COLORS.none;
    ctx.save();
    ctx.lineCap = 'round';
    for (const [a, b] of CONNECTIONS) {
      const isBad = bad.has(a) && bad.has(b);
      ctx.strokeStyle = isBad ? '#ff3b5c' : color;
      ctx.globalAlpha = isBad ? 1 : 0.75;
      ctx.lineWidth = isBad ? 5 : 3;
      ctx.beginPath();
      ctx.moveTo(pts[a].x, pts[a].y);
      ctx.lineTo(pts[b].x, pts[b].y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    pts.forEach((p, i) => {
      const isBad = bad.has(i);
      ctx.fillStyle = isBad ? '#ff3b5c' : '#ffffff';
      ctx.beginPath();
      ctx.arc(p.x, p.y, isBad ? 5 : 3.2, 0, Math.PI * 2);
      ctx.fill();
    });
    // Пульсирующее кольцо на кончике «неправильного» пальца.
    for (const k of wrong) {
      const tip = pts[fingerLandmarks(k)[3]];
      ctx.strokeStyle = '#ff3b5c';
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.5 + 0.5 * Math.sin(t / 120);
      ctx.beginPath();
      ctx.arc(tip.x, tip.y, 14 + 4 * Math.sin(t / 120), 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  /** Курсор: mode = draw | hover | erase | idle. */
  cursor(p, { mode = 'idle', color = '#fff', size = 10, eraseRadius = 40, dwell = 0, hold = 0, holdColor = '#ffd23f' } = {}) {
    const { ctx } = this;
    ctx.save();
    if (mode === 'erase') {
      ctx.strokeStyle = '#ff6b4a';
      ctx.setLineDash([6, 6]);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, eraseRadius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    } else if (mode === 'draw') {
      ctx.fillStyle = color === 'rainbow' ? '#fff' : color;
      ctx.shadowColor = ctx.fillStyle;
      ctx.shadowBlur = 16;
      ctx.beginPath();
      ctx.arc(p.x, p.y, size / 2 + 2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.strokeStyle = mode === 'hover' ? '#a78bfa' : 'rgba(255,255,255,0.6)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 10, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = ctx.strokeStyle;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    const ring = (v, r, c) => {
      if (v <= 0) return;
      ctx.strokeStyle = c;
      ctx.lineWidth = 4;
      ctx.shadowBlur = 0;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, -Math.PI / 2, -Math.PI / 2 + v * Math.PI * 2);
      ctx.stroke();
    };
    ring(dwell, 22, '#a78bfa');
    ring(hold, 30, holdColor);
    ctx.restore();
  }

  burst(x, y, color, n = 14) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = 1 + Math.random() * 4;
      this.particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 1, color: color === 'rainbow' ? `hsl(${Math.random() * 360} 95% 65%)` : color });
    }
  }

  sparkle(x, y, color) {
    if (Math.random() < 0.5) return;
    this.particles.push({ x, y, vx: (Math.random() - 0.5) * 1.5, vy: (Math.random() - 0.5) * 1.5, life: 0.7, color: color === 'rainbow' ? `hsl(${Math.random() * 360} 95% 65%)` : color });
  }

  drawParticles() {
    const { ctx } = this;
    ctx.save();
    for (const p of this.particles) {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.05;
      p.life -= 0.025;
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 2.5 * p.life + 0.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    this.particles = this.particles.filter((p) => p.life > 0);
    if (this.particles.length > 400) this.particles.splice(0, this.particles.length - 400);
  }
}
