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
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#screen-welcome:not(.hidden)');
    const welcomeGreeting = await page.textContent('#welcome-greeting');
    if (!welcomeGreeting?.trim()) throw new Error('Приветствие не заполнено');
    results.push('✓ Экран приветствия загружается');

    await page.click('#btn-start');
    await page.waitForSelector('#screen-lobby:not(.hidden)');
    const levelCards = await page.locator('.level-card').count();
    if (levelCards !== 2) throw new Error(`Лобби: ожидалось 2 уровня, got ${levelCards}`);
    const lockedCards = await page.locator('.level-card--locked').count();
    if (lockedCards !== 1) throw new Error('Лобби: нет закрытого уровня');
    results.push('✓ Лобби: 2 уровня, второй закрыт');

    await page.evaluate(() => window.__secureOsTest.goTo(1));
    await page.waitForTimeout(450);
    const lobbyIndex = await page.evaluate(() => window.__secureOsTest.lobby().index);
    if (lobbyIndex !== 1) throw new Error(`Лобби: переключение не сработало (index ${lobbyIndex})`);
    await page.evaluate(() => window.__secureOsTest.goTo(0));
    await page.waitForTimeout(450);
    results.push('✓ Лобби: переключение уровней');

    await page.click('.level-card.is-active');
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
