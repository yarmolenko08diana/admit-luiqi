// Холст с рисунком. Штрихи хранятся векторно (в долях размера сцены),
// поэтому их можно оценить, стереть частично и перерисовать при повороте экрана.

export const PALETTE = ['#5b8cff', '#ff4fd8', '#39f3bb', '#ffd23f', '#ff6b4a', '#ffffff', 'rainbow'];
export const SIZES = [6, 12, 22];

export class Painter {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.strokes = [];
    this.current = null;
    this.color = PALETTE[0];
    this.size = SIZES[1];
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
    this.redraw();
  }

  get hasInk() {
    return this.strokes.some((s) => s.pts.length > 1);
  }

  nextColor() {
    const i = PALETTE.indexOf(this.color);
    this.color = PALETTE[(i + 1) % PALETTE.length];
    return this.color;
  }

  begin(p) {
    this.current = { color: this.color, size: this.size, pts: [{ x: p.x / this.w, y: p.y / this.h }] };
    this.strokes.push(this.current);
  }

  add(p) {
    if (!this.current) return this.begin(p);
    const pts = this.current.pts;
    const last = pts[pts.length - 1];
    const q = { x: p.x / this.w, y: p.y / this.h };
    // Пропускаем микродвижения — меньше точек и нет «бахромы».
    if (Math.hypot((q.x - last.x) * this.w, (q.y - last.y) * this.h) < 1.5) return;
    pts.push(q);
    this.drawSegment(this.current, pts.length - 1);
  }

  end() {
    if (this.current && this.current.pts.length < 2) {
      // Точка — рисуем кружок, чтобы касание было видно.
      this.current.pts.push({ ...this.current.pts[0], x: this.current.pts[0].x + 0.0005 });
      this.drawSegment(this.current, 1);
    }
    this.current = null;
  }

  get drawing() {
    return this.current !== null;
  }

  strokeColor(stroke, i) {
    return stroke.color === 'rainbow' ? `hsl(${(i * 6) % 360} 95% 62%)` : stroke.color;
  }

  drawSegment(stroke, i) {
    const { ctx } = this;
    const P = (k) => ({ x: stroke.pts[k].x * this.w, y: stroke.pts[k].y * this.h });
    const p1 = P(i);
    const p0 = P(i - 1);
    const pm1 = i >= 2 ? P(i - 2) : p0;
    const m0 = { x: (pm1.x + p0.x) / 2, y: (pm1.y + p0.y) / 2 };
    const m1 = { x: (p0.x + p1.x) / 2, y: (p0.y + p1.y) / 2 };
    const color = this.strokeColor(stroke, i);
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = stroke.size * 1.2;
    ctx.lineWidth = stroke.size;
    ctx.beginPath();
    ctx.moveTo(i >= 2 ? m0.x : p0.x, i >= 2 ? m0.y : p0.y);
    ctx.quadraticCurveTo(p0.x, p0.y, m1.x, m1.y);
    ctx.stroke();
    // Хвост до последней точки, чтобы линия не отставала от пальца.
    ctx.beginPath();
    ctx.moveTo(m1.x, m1.y);
    ctx.lineTo(p1.x, p1.y);
    ctx.stroke();
    ctx.restore();
  }

  redraw() {
    this.ctx.clearRect(0, 0, this.w, this.h);
    for (const s of this.strokes) for (let i = 1; i < s.pts.length; i++) this.drawSegment(s, i);
  }

  /** Стирает всё в радиусе r (px) вокруг p, разрезая штрихи на части. */
  erase(p, r) {
    const rx = r / this.w;
    const ry = r / this.h;
    const inside = (q) => ((q.x - p.x / this.w) / rx) ** 2 + ((q.y - p.y / this.h) / ry) ** 2 <= 1;
    let changed = false;
    const next = [];
    for (const s of this.strokes) {
      if (!s.pts.some(inside)) {
        next.push(s);
        continue;
      }
      changed = true;
      let part = [];
      for (const q of s.pts) {
        if (inside(q)) {
          if (part.length > 1) next.push({ ...s, pts: part });
          part = [];
        } else part.push(q);
      }
      if (part.length > 1) next.push({ ...s, pts: part });
    }
    if (changed) {
      this.strokes = next;
      this.current = null;
      this.redraw();
    }
    return changed;
  }

  clear() {
    this.strokes = [];
    this.current = null;
    this.ctx.clearRect(0, 0, this.w, this.h);
  }

  /** Штрихи в пикселях сцены. */
  strokesPx() {
    return this.strokes.map((s) => s.pts.map((q) => ({ x: q.x * this.w, y: q.y * this.h })));
  }

  /** PNG с тёмным фоном (и, при желании, шаблоном под рисунком). */
  exportPNG(drawUnder) {
    const c = document.createElement('canvas');
    c.width = this.canvas.width;
    c.height = this.canvas.height;
    const x = c.getContext('2d');
    x.fillStyle = '#0b0d17';
    x.fillRect(0, 0, c.width, c.height);
    if (drawUnder) {
      x.save();
      x.scale(c.width / this.w, c.height / this.h);
      drawUnder(x);
      x.restore();
    }
    x.drawImage(this.canvas, 0, 0);
    return c.toDataURL('image/png');
  }

  /** Миниатюра для экрана итогов. */
  thumbnail(size = 220, drawUnder) {
    const c = document.createElement('canvas');
    const scale = size / Math.max(this.w, this.h);
    c.width = Math.round(this.w * scale);
    c.height = Math.round(this.h * scale);
    const x = c.getContext('2d');
    x.fillStyle = '#0b0d17';
    x.fillRect(0, 0, c.width, c.height);
    x.save();
    x.scale(scale, scale);
    if (drawUnder) drawUnder(x);
    x.restore();
    x.drawImage(this.canvas, 0, 0, c.width, c.height);
    return c.toDataURL('image/png');
  }
}
