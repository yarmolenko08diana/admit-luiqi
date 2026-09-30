// Сквозной тест в настоящем браузере: вместо камеры в приложение подаются
// синтетические позы руки (?test), и мы проходим обучение и челлендж целиком.
// Запуск: npm run test:e2e (нужен Playwright и Chromium).
import { chromium } from 'playwright';
import http from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.wasm': 'application/wasm' };
const server = http.createServer(async (req, res) => {
  try {
    const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const file = join(ROOT, path === '/' ? 'index.html' : path);
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' });
    res.end(await readFile(file));
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((r) => server.listen(0, r));
const base = `http://localhost:${server.address().port}`;
const shots = join(ROOT, 'tests/e2e/screenshots');
await mkdir(shots, { recursive: true });

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const errors = [];
let failed = false;
const check = (cond, msg) => {
  console.log(`${cond ? '✓' : '✗'} ${msg}`);
  if (!cond) failed = true;
};

for (const viewport of [{ width: 1366, height: 800, name: 'desktop' }, { width: 390, height: 844, name: 'phone' }]) {
  const page = await browser.newPage({ viewport });
  page.on('pageerror', (e) => errors.push(`${viewport.name}: ${e.message}`));
  // Шрифты Google в песочнице могут не грузиться — это не ошибка приложения.
  page.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errors.push(`${viewport.name}: ${m.text()}`));
  await page.goto(`${base}/?test`);
  await page.waitForFunction(() => window.__luiqi?.last?.screen === 'screen-menu');
  // Позу меняем из теста: window.__pose — функция(t) → точки или null.
  await page.evaluate(async () => {
    const { POSES, makeHand } = await import('/tests/helpers/poses.mjs');
    const { resample } = await import('/js/core/geometry.js');
    window.resample = resample;
    window.POSES = POSES;
    window.makeHand = makeHand;
    window.__pose = null;
    window.__luiqi.inject(() => ({ landmarks: window.__pose ? [window.__pose()] : [] }));
  });
  const pose = (expr) => page.evaluate(`window.__pose = ${expr}`);
  await page.screenshot({ path: join(shots, `${viewport.name}-menu.png`) });
  const last = () => page.evaluate(() => window.__luiqi.last);
  const wait = (ms) => page.waitForTimeout(ms);

  // Меню → обучение (жест ✌️ наведён на карточку)
  const card = await page.locator('[data-action="tutorial"]').boundingBox();
  await pose(`() => { const s = window.__luiqi.app; const p = window.POSES.peace(); const tip = p[8];
    const want = { x: ${card.x + card.width / 2}, y: ${card.y + card.height / 2} };
    const cur = s.toScreen(tip); const dx = (want.x - cur.x), dy = (want.y - cur.y);
    const { vw, vh } = s.videoSize(); const sc = Math.max(s.w / vw, s.h / vh);
    return p.map(q => ({ ...q, x: q.x - dx / (vw * sc), y: q.y + dy / (vh * sc) })); }`);
  await page.waitForFunction(() => window.__luiqi.last.screen === 'screen-tutorial', null, { timeout: 5000 });
  check(true, `${viewport.name}: «воздушная» кнопка открыла обучение`);

  // Ошибка: средний палец приподнят → конкретная подсказка
  await pose(`() => window.makeHand({ index: 'ext', middle: 'half' })`);
  await wait(900);
  let l = await last();
  check(/средний/i.test(l.issueTitle ?? ''), `${viewport.name}: тренер заметил приподнятый средний палец — «${l.issueTitle}»`);
  await page.screenshot({ path: join(shots, `${viewport.name}-coach.png`) });

  for (const g of ['point', 'peace', 'palm', 'pinch', 'fist', 'thumbsUp']) {
    await pose(`() => window.POSES.${g}()`);
    await wait(1900);
  }
  await page.waitForFunction(() => window.__luiqi.last.screen === 'screen-tutorial-done', null, { timeout: 5000 });
  check(true, `${viewport.name}: обучение пройдено всеми 6 жестами`);

  // Челлендж: 👍 на экране «готово» запускает его
  await pose('() => window.POSES.fist()');
  await wait(300);
  await pose(`() => window.POSES.thumbsUp()`);
  await page.waitForFunction(() => window.__luiqi.last.screen === 'screen-round-intro', null, { timeout: 5000 });
  check(true, `${viewport.name}: 👍 запустил челлендж`);

  for (let round = 0; round < 3; round++) {
    await pose(`() => window.POSES.point()`);
    await page.waitForFunction(() => window.__luiqi.last.screen === null, null, { timeout: 6000 });
    // Обводим фигуру: кончик указательного пальца идёт по шаблону.
    await pose(`(() => { const s = window.__luiqi.app; const shape = s.modes.challenge.shape; const b = s.layout.box;
      const pts = shape.paths.flatMap((p) => window.resample(p, 0.015)); const start = performance.now();
      return (t) => { const k = Math.min(pts.length - 1, Math.floor((performance.now() - start) / 25));
        const target = { x: b.x + pts[k].x * b.size, y: b.y + pts[k].y * b.size };
        const p = window.POSES.point(); const cur = s.toScreen(p[8]);
        const { vw, vh } = s.videoSize(); const sc = Math.max(s.w / vw, s.h / vh);
        return p.map(q => ({ ...q, x: q.x - (target.x - cur.x) / (vw * sc), y: q.y + (target.y - cur.y) / (vh * sc) })); }; })()`);
    const n = await page.evaluate(() => window.__luiqi.app.modes.challenge.shape.paths.flatMap((p) => window.resample(p, 0.015)).length);
    await wait(n * 25 + 600);
    if (round === 0) await page.screenshot({ path: join(shots, `${viewport.name}-drawing.png`) });
    await pose(`() => window.POSES.thumbsUp()`);
    await page.waitForFunction(() => window.__luiqi.last.screen === 'screen-round-result', null, { timeout: 5000 });
    const acc = Number(await page.locator('#rr-acc').textContent());
    check(acc >= 60, `${viewport.name}: раунд ${round + 1} — точность ${acc}%`);
    if (round === 0) await page.screenshot({ path: join(shots, `${viewport.name}-round.png`) });
    await pose('() => window.POSES.fist()');
    await wait(300);
    await pose(`() => window.POSES.thumbsUp()`);
    await page.waitForFunction(() => ['screen-round-intro', 'screen-results'].includes(window.__luiqi.last.screen), null, { timeout: 5000 });
  }
  await page.waitForFunction(() => window.__luiqi.last.screen === 'screen-results');
  const score = Number(await page.locator('#res-score').textContent());
  check(score > 0, `${viewport.name}: итоги — ${score} очков, место ${await page.locator('#res-place').textContent()}`);
  await wait(600);
  await page.screenshot({ path: join(shots, `${viewport.name}-results.png`) });
  await page.close();
}

check(errors.length === 0, `ошибок в консоли нет${errors.length ? ': ' + [...new Set(errors)].slice(0, 5).join(' | ') : ''}`);
await browser.close();
server.close();
process.exit(failed ? 1 : 0);
