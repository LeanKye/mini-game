/**
 * Smoke-тест мини-игры: запускает локальный сервер, играет через headless Chromium,
 * проверяет загрузку, управление, победу, расшифровку истории и код.
 *
 *   npm test
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8099;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.txt': 'text/plain; charset=utf-8',
  '.ico': 'image/x-icon',
};

function startServer() {
  const server = createServer(async (req, res) => {
    try {
      const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      const rel = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '');
      const filePath = path.join(ROOT, rel);
      if (!filePath.startsWith(ROOT)) {
        res.writeHead(403).end('forbidden');
        return;
      }
      const data = await readFile(filePath);
      res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
      res.end(data);
    } catch {
      res.writeHead(404).end('not found');
    }
  });
  return new Promise((resolve) => server.listen(PORT, '127.0.0.1', () => resolve(server)));
}

const results = [];
const ignoreError = (text) =>
  /fonts\.(googleapis|gstatic)\.com|net::ERR|favicon/.test(text);

async function main() {
  const server = await startServer();
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 800 } });
  const errors = [];

  page.on('pageerror', (e) => errors.push(`PAGE ERROR: ${e.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error' && !ignoreError(msg.text())) errors.push(`CONSOLE: ${msg.text()}`);
  });

  const BASE = `http://127.0.0.1:${PORT}`;

  try {
    await page.addInitScript(() => {
      window.__ENABLE_TEST_HOOKS = true;
    });
    await page.route('**/*', (route) =>
      route.request().url().includes('127.0.0.1') ? route.continue() : route.abort()
    );
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#screen-lobby:not(.hidden)');
    results.push('✓ Сайт открывается сразу на лобби');

    const levelCards = await page.locator('.level-card').count();
    if (levelCards !== 3) throw new Error(`Лобби: ожидалось 3 уровня, got ${levelCards}`);
    const lockedCards = await page.locator('.level-card--locked').count();
    if (lockedCards !== 0) throw new Error('Лобби: все уровни должны быть открыты');
    results.push('✓ Лобби: 3 уровня, все открыты');

    await page.evaluate(() => window.__secureOsTest.goTo(1));
    await page.waitForTimeout(450);
    const lobbyIndex = await page.evaluate(() => window.__secureOsTest.lobby().index);
    if (lobbyIndex !== 1) throw new Error(`Лобби: переключение не сработало (index ${lobbyIndex})`);
    await page.evaluate(() => window.__secureOsTest.goTo(0));
    await page.waitForTimeout(450);
    results.push('✓ Лобби: переключение уровней');

    await page.click('.level-card.is-active');
    await page.waitForSelector('#game-intro:not(.hidden)');
    results.push('✓ Перед уровнем показывается объяснение «как играть»');
    await page.click('#btn-intro');
    await page.waitForFunction(() => document.getElementById('game-intro').classList.contains('hidden'));
    await page.waitForSelector('#screen-game:not(.hidden)');
    await page.waitForSelector('#game-canvas');
    results.push('✓ Переход в игру, канвас на месте');

    const total = await page.textContent('#hud-total');
    if (!Number(total)) throw new Error(`HUD total пустой: "${total}"`);

    const hasTestHook = await page.evaluate(() => !!window.__secureOsTest);
    if (!hasTestHook) throw new Error('Тестовый хук недоступен (window.__ENABLE_TEST_HOOKS?)');

    await page.waitForTimeout(700);

    const startX = await page.evaluate(() => window.__secureOsTest.state().x);
    await page.evaluate(() => {
      document.querySelector('#pad-right').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    });
    await page.waitForTimeout(700);
    await page.evaluate(() => {
      document.querySelector('#pad-right').dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    });
    const movedX = await page.evaluate(() => window.__secureOsTest.state().x);
    if (movedX <= startX + 20) throw new Error(`Герой не двигается вправо: ${startX} → ${movedX}`);
    results.push('✓ Кнопка «вправо» двигает героя');

    const minVy = await page.evaluate(async () => {
      const pad = document.querySelector('#pad-jump');
      pad.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
      let min = 1;
      for (let i = 0; i < 24; i++) {
        await new Promise((r) => setTimeout(r, 10));
        const s = window.__secureOsTest.state();
        if (s) min = Math.min(min, s.vy);
      }
      pad.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
      return min;
    });
    if (minVy > -2) throw new Error(`Прыжок не сработал (min vy = ${minVy})`);
    results.push('✓ Прыжок работает');

    const payload = await page.evaluate(() => window.__secureOsTest.payload());
    if (!payload?.title || !payload?.code) throw new Error('Расшифровка награды не удалась');
    results.push('✓ Награда расшифровывается (AES-GCM)');

    await page.evaluate(() => window.__secureOsTest.forceWin());
    await page.waitForSelector('#screen-reward:not(.hidden)');
    await page.waitForFunction(
      () => !document.querySelector('#reward-story .reward__loading'),
      null,
      { timeout: 5000 }
    );

    const storyText = await page.textContent('#reward-story');
    if (!storyText?.trim()) throw new Error('История пустая');

    await page.waitForSelector('#reward-code-block:not(.hidden)');
    const codeText = (await page.textContent('#reward-code'))?.trim();
    if (!codeText) throw new Error('Код не показан');
    if (codeText !== payload.code) throw new Error('Код не совпадает с расшифрованным');
    results.push('✓ После победы показаны история и код');

    await page.click('#reward-code');
    await page.waitForTimeout(120);
    const codeAfterCopy = (await page.textContent('#reward-code'))?.trim();
    if (codeAfterCopy !== payload.code) throw new Error('Код изменился после копирования');
    const hasCopyFeedback = await page
      .locator('#reward-code')
      .evaluate((el) => el.classList.contains('is-copied'));
    if (!hasCopyFeedback) throw new Error('Нет визуального фидбека копирования');
    results.push('✓ Копирование не портит код и даёт фидбек');

    await page.evaluate(() => window.__secureOsTest.startLevel('level2'));
    await page.waitForSelector('#screen-game:not(.hidden)');
    const towerState = await page.evaluate(() => {
      const d = window.__secureOsTest.defense();
      if (!d) return null;
      const a = d.place(3, 1, 'gun');
      const b = d.place(4, 1, 'gun');
      d.startWave();
      return { a, b, towers: d.towers().length, phase: d.state().phase };
    });
    if (!towerState || towerState.towers !== 2) {
      throw new Error(`TD: башни не ставятся (${JSON.stringify(towerState)})`);
    }
    if (towerState.phase !== 'wave') throw new Error('TD: волна не запускается');
    results.push('✓ Уровень 2 (tower defense): башни и волны работают');

    await page.evaluate(() => window.__secureOsTest.forceWin());
    await page.waitForSelector('#screen-reward:not(.hidden)');
    await page.waitForSelector('#reward-puzzle:not(.hidden)');
    const puzzleCodeHidden = await page
      .locator('#reward-code-block')
      .evaluate((n) => n.classList.contains('hidden'));
    if (!puzzleCodeHidden) throw new Error('TD: код показан без решения паззла');

    await page.evaluate(() => window.__secureOsTest.solvePuzzle());
    await page.waitForSelector('#reward-code-block:not(.hidden)');
    const code2 = (await page.textContent('#reward-code'))?.trim();
    const payload2 = await page.evaluate(() => window.__secureOsTest.payload('game2'));
    if (!code2 || code2 !== payload2.code) throw new Error('TD: код после паззла не совпал');
    results.push('✓ Уровень 2: код 1429 выдаётся после паззла');

    await page.evaluate(() => window.__secureOsTest.startLevel('level2'));
    await page.waitForSelector('#btn-skip:not(.hidden)');
    await page.click('#btn-skip');
    await page.waitForSelector('#screen-reward:not(.hidden)');
    await page.waitForSelector('#reward-code-block:not(.hidden)');
    const skippedCode = (await page.textContent('#reward-code'))?.trim();
    if (skippedCode !== payload2.code) throw new Error('skip: неверный код');
    const puzzleSkipped = await page
      .locator('#reward-puzzle')
      .evaluate((n) => n.classList.contains('hidden'));
    if (!puzzleSkipped) throw new Error('skip: паззл должен быть пропущен');
    results.push('✓ Уровень 2: «Пропустить» сразу выдаёт код');

    await page.evaluate(() => {
      localStorage.removeItem('rhythmOffset');
      window.__secureOsTest.startLevel('level3');
    });
    await page.waitForSelector('#screen-game:not(.hidden)');
    const calibBox = await page.locator('#game-canvas').boundingBox();
    const FAKE_LATENCY = 0.15;
    for (let k = 0; k < 9; k++) {
      await page.waitForFunction(
        ([kk, lat]) => {
          const c = window.__secureOsTest.rhythm().calib();
          return c && c.now - c.t0 >= kk * c.period + lat;
        },
        [k, FAKE_LATENCY],
        { timeout: 20000 }
      );
      await page.mouse.click(calibBox.x + calibBox.width / 2, calibBox.y + calibBox.height * 0.3);
    }
    await page.waitForFunction(() => window.__secureOsTest.state().state === 'play', null, { timeout: 20000 });
    const calibrated = await page.evaluate(() => {
      const r = window.__secureOsTest.rhythm();
      return { offset: r.offset(), auto: r.autoLatency() };
    });
    const expected = FAKE_LATENCY * 1000 - calibrated.auto;
    if (Math.abs(calibrated.offset - expected) > 60) {
      throw new Error('Калибровка: сдвиг ' + calibrated.offset + ' мс, ожидали около ' + Math.round(expected));
    }
    results.push('✓ Уровень 3: калибровка подбирает сдвиг звука по тапам (' + calibrated.offset + ' мс)');

    await page.evaluate(() => {
      window.__secureOsTest.startLevel('level3');
      window.__secureOsTest.rhythm().skipCalibration();
    });
    await page.waitForFunction(() => window.__secureOsTest.state().state === 'play', null, { timeout: 10000 });
    await page.waitForSelector('#screen-game:not(.hidden)');
    const chartLen = await page.evaluate(() => window.__secureOsTest.rhythm().chart().length);
    if (chartLen < 100) throw new Error('Ритм: чарт слишком короткий (' + chartLen + ')');
    const firstNote = await page.evaluate(() => {
      const n = window.__secureOsTest.rhythm().chart()[0];
      return { time: n.time, lane: n.lane };
    });
    await page.waitForFunction(
      (t) => window.__secureOsTest.rhythm().songTime() >= t - 0.02,
      firstNote.time,
      { timeout: 20000 }
    );
    const canvasBox = await page.locator('#game-canvas').boundingBox();
    const lanePos = await page.evaluate((l) => window.__secureOsTest.rhythm().laneCenter(l), firstNote.lane);
    await page.mouse.click(canvasBox.x + lanePos.x, canvasBox.y + lanePos.y);
    await page.waitForTimeout(150);
    const rhythmState = await page.evaluate(() => window.__secureOsTest.state());
    if (rhythmState.hits < 1) throw new Error('Ритм: тап по ноте не засчитан');
    results.push('✓ Уровень 3 (ритм): чарт построен, тап по ноте засчитывается');

    await page.evaluate(() => window.__secureOsTest.forceWin());
    await page.waitForSelector('#screen-reward:not(.hidden)');
    results.push('✓ Уровень 3: победа ведёт на экран награды');
  } catch (err) {
    results.push(`✗ ОШИБКА: ${err.message}`);
    process.exitCode = 1;
  } finally {
    await browser.close();
    server.close();
  }

  if (errors.length) {
    console.log('\nJS-ошибки страницы:');
    errors.forEach((e) => console.log(' ', e));
    process.exitCode = 1;
  }

  console.log('\n=== Результаты проверки ===\n');
  results.forEach((r) => console.log(r));
  console.log('');
}

main();
