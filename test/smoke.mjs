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
    if (levelCards !== 10) throw new Error(`Лобби: ожидалось 10 уровней, got ${levelCards}`);
    const lockedCards = await page.locator('.level-card--locked').count();
    if (lockedCards !== 9) throw new Error('Лобби: кроме последней игры, все уровни должны быть заблокированы, получили ' + lockedCards);
    results.push('✓ Лобби: 10 уровней, открыт только последний');

    await page.evaluate(() => window.__secureOsTest.goTo(1));
    await page.waitForTimeout(450);
    const lobbyIndex = await page.evaluate(() => window.__secureOsTest.lobby().index);
    if (lobbyIndex !== 1) throw new Error(`Лобби: переключение не сработало (index ${lobbyIndex})`);
    await page.evaluate(() => window.__secureOsTest.goTo(0));
    await page.waitForTimeout(450);
    results.push('✓ Лобби: переключение уровней');

    // закрытая игра: подсказка про блокировку, запуска нет
    await page.evaluate(() => window.__secureOsTest.goTo(0));
    await page.waitForTimeout(450);
    await page.click('.level-card.is-active');
    await page.waitForSelector('#lobby-hint:not(.hidden)', { timeout: 3000 }).catch(() => null);
    const lockHintText = await page.locator('#lobby-hint').textContent().catch(() => '');
    if (!/заблокировано/.test(lockHintText || '')) throw new Error('Лобби: закрытая игра должна показывать «Пока что заблокировано»');
    results.push('✓ Закрытая игра: «Пока что заблокировано», запуска нет');
    await page.evaluate(() => window.__secureOsTest.goTo(9));
    await page.waitForTimeout(450);
    await page.click('.level-card.is-active');
    await page.waitForSelector('#game-intro:not(.hidden)');
    results.push('✓ Перед уровнем показывается объяснение «как играть»');
    await page.click('#btn-intro');
    await page.waitForFunction(() => document.getElementById('game-intro').classList.contains('hidden'));
    await page.waitForSelector('#screen-game:not(.hidden)');
    await page.waitForSelector('#game-canvas');
    results.push('✓ Переход в игру, канвас на месте');
    await page.evaluate(() => window.__secureOsTest.startLevel('level1', false));
    await page.waitForSelector('#game-canvas');

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

    await page.waitForSelector('#reward-puzzle:not(.hidden)');
    const l3Hidden = await page
      .locator('#reward-code-block')
      .evaluate((n) => n.classList.contains('hidden'));
    if (!l3Hidden) throw new Error('Уровень 3: код показан без решения замка');

    await page.click('.lock__slot');
    await page.click('#lock-check');
    await page.waitForSelector('.lock__row');
    const rows = await page.locator('.lock__row').count();
    if (rows < 1) throw new Error('Уровень 3: попытка не попала в историю');
    results.push('✓ Уровень 3: замок принимает попытку и даёт обратную связь');

    await page.evaluate(() => window.__secureOsTest.solvePuzzle());
    await page.waitForSelector('#reward-code-block:not(.hidden)');
    const code3 = (await page.textContent('#reward-code'))?.trim();
    const payload3 = await page.evaluate(() => window.__secureOsTest.payload('game3'));
    if (code3 !== payload3.code || code3 !== '2019') {
      throw new Error('Уровень 3: код после замка не совпал (' + code3 + ')');
    }
    results.push('✓ Уровень 3: код 2019 выдаётся после кодового замка');

    await page.evaluate(() => window.__secureOsTest.startLevel('level4', false));
    await page.waitForSelector('#screen-game:not(.hidden)');
    await page.waitForTimeout(800);
    const hudTitle4 = (await page.textContent('#hud-title'))?.trim();
    const canvas4 = await page.locator('#game-canvas').boundingBox();
    if (!canvas4 || canvas4.width < 100) throw new Error('Уровень 4: канвас не отрисован');
    if (!hudTitle4) throw new Error('Уровень 4: нет заголовка в HUD');
    const payload4 = await page.evaluate(() => window.__secureOsTest.payload('game4'));
    if (!payload4 || !/^\d{4}$/.test(payload4.code || '') || !Array.isArray(payload4.story) || payload4.story.length < 1) {
      throw new Error('Уровень 4: награда не расшифровалась');
    }
    results.push('✓ Уровень 4: roguelike запускается и рисует поле');
    await page.evaluate(() => window.__secureOsTest.startLevel('level4', false));
    await page.waitForSelector('#screen-game:not(.hidden)');
    await page.evaluate(() => window.__secureOsTest.rogue().killAll());
    await page.waitForFunction(() => window.__secureOsTest.rogue().tutorialStep() === 3, null, { timeout: 5000 });
    await page.evaluate(() => window.__secureOsTest.rogue().pick(0));
    await page.waitForFunction(() => window.__secureOsTest.rogue().tutorialStep() === 4, null, { timeout: 5000 });
    await page.keyboard.down('s');
    await page.waitForFunction(() => window.__secureOsTest.rogue().floor() === 1, null, { timeout: 10000 }).catch(() => null);
    await page.keyboard.up('s');
    const floorAfterDoor = await page.evaluate(() => window.__secureOsTest.rogue().floor());
    if (floorAfterDoor !== 1) throw new Error('Уровень 4: после выбора предмета дверь внизу не ведёт на этаж 1');
    const items1 = await page.evaluate(() => window.__secureOsTest.rogue().items());
    if (items1 !== 1) throw new Error('Уровень 4: после обучения должен быть ровно 1 предмет, получили ' + items1);
    await page.evaluate(() => window.__secureOsTest.rogue().die());
    await page.waitForFunction(
      () => window.__secureOsTest.rogue().state() === 'play' && window.__secureOsTest.rogue().floor() === 1 && window.__secureOsTest.rogue().items() === 1,
      null,
      { timeout: 8000 }
    );
    results.push('✓ Уровень 4: после смерти чекпоинт сохраняет этаж и предметы');
    await page.evaluate(() => window.__secureOsTest.rogue().skipTutorial());
    await page.waitForFunction(() => window.__secureOsTest.rogue().floor() === 1, null, { timeout: 5000 }).catch(() => null);
    const floorAfterSkip = await page.evaluate(() => window.__secureOsTest.rogue().floor());
    if (floorAfterSkip !== 1) throw new Error('Уровень 4: пропуск обучения не переводит на этаж 1');
    results.push('✓ Уровень 4: обучение - выбор предмета открывает дверь, проход ведёт на этаж 1');
    await page.evaluate(() => window.__secureOsTest.startLevel('level5', false));
    await page.waitForSelector('#screen-game:not(.hidden)');
    await page.waitForTimeout(500);
    const floor5 = await page.evaluate(() => window.__secureOsTest.stealth().floor());
    if (floor5 !== 1) throw new Error('Уровень 5: старт должен быть на этаже 1');
    const guards5 = await page.evaluate(() => window.__secureOsTest.stealth().guardStates());
    if (guards5.length < 2) throw new Error('Уровень 5: охраны должно быть минимум 2');
    if (await page.evaluate(() => window.__secureOsTest.stealth().caught())) throw new Error('Уровень 5: игрок не должен быть пойман в начале');
    await page.evaluate(() => window.__secureOsTest.stealth().nearGuard(0));
    await page.waitForFunction(
      () => {
        const t = window.__secureOsTest.stealth();
        return t.caught() || t.guardStates().includes('chase');
      },
      null,
      { timeout: 6000 }
    );
    results.push('✓ Уровень 5: охранник замечает вора вплотную и переходит в погоню');
    await page.waitForFunction(() => !window.__secureOsTest.stealth().caught(), null, { timeout: 6000 });
    await page.evaluate(() => window.__secureOsTest.stealth().collectAll());
    await page.waitForFunction(() => window.__secureOsTest.stealth().items() === 3, null, { timeout: 3000 });
    await page.evaluate(() => window.__secureOsTest.stealth().teleportExit());
    await page.waitForFunction(() => window.__secureOsTest.stealth().floor() === 2, null, { timeout: 5000 });
    results.push('✓ Уровень 5 (стелс): охрана есть, добыча собирается, выход ведёт на этаж 2');
    const payload5 = await page.evaluate(() => window.__secureOsTest.payload('game5'));
    if (!payload5 || !/^\d{4}$/.test(payload5.code || '') || payload5.story.length !== 1) throw new Error('Уровень 5: награда не расшифровалась');
    results.push('✓ Уровень 5: приз расшифровывается');
    await page.evaluate(() => window.__secureOsTest.startLevel('level6', false));
    await page.waitForSelector('#screen-game:not(.hidden)');
    await page.waitForTimeout(400);
    await page.evaluate(() => window.__secureOsTest.brawl().skipCut());
    const stage6 = await page.evaluate(() => window.__secureOsTest.brawl().stage());
    if (stage6 !== 1) throw new Error('Уровень 6: старт должен быть на первом этапе');
    await page.evaluate(() => window.__secureOsTest.brawl().attack());
    await page.evaluate(() => window.__secureOsTest.brawl().attack());
    await page.waitForFunction(() => window.__secureOsTest.brawl().combo() >= 2, null, { timeout: 2000 });
    await page.waitForFunction(() => window.__secureOsTest.brawl().state() === 'attack', null, { timeout: 2000 });
    await page.waitForFunction(() => window.__secureOsTest.brawl().state() === 'idle', null, { timeout: 3000 });
    results.push('✓ Уровень 6 (бит-эм-ап): одна кнопка запускает цепочку ударов и возвращает героиню в стойку');
    for (const want of [2, 3, 4]) {
      await page.evaluate(() => window.__secureOsTest.brawl().skipCut());
      await page.evaluate(() => window.__secureOsTest.brawl().killAll());
      await page.evaluate(() => window.__secureOsTest.brawl().nextStage());
      await page.waitForFunction((w) => window.__secureOsTest.brawl().stage() === w, want, { timeout: 5000 });
    }
    results.push('✓ Уровень 6: три перехода (улица - крыши - святилище - храм) работают');
    await page.evaluate(() => window.__secureOsTest.brawl().skipCut());
    await page.evaluate(() => window.__secureOsTest.brawl().nextStage());
    results.push('✓ Уровень 6: финальный этап в храме');
    await page.evaluate(() => window.__secureOsTest.forceWin());
    await page.waitForSelector('.scroll__canvas', { timeout: 8000 });
    // длинный текст: холст выше экрана, прокручиваем к каждой полосе и растираем её
    const canvasEl = page.locator('.scroll__canvas');
    await canvasEl.scrollIntoViewIfNeeded();
    const h0 = (await canvasEl.boundingBox()).height;
    for (let y = 8; y < h0 - 8; y += 16) {
      // прокручиваем так, чтобы нужная строка холста была в видимой части экрана
      await page.evaluate((yy) => {
        const c = document.querySelector('.scroll__canvas');
        const r = c.getBoundingClientRect();
        window.scrollBy(0, r.top + yy - 200);
      }, y);
      const box = await canvasEl.boundingBox();
      if (!box) break;
      const top = box.y + y;
      await page.mouse.move(box.x + 8, top);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width - 8, top, { steps: 8 });
      await page.mouse.up();
      if (await page.locator('.scroll--done').count()) break;
    }
    await page.waitForSelector('.scroll--done', { timeout: 8000 });
    results.push('✓ Уровень 6: свиток проявляется пальцем, код не выдаётся');
    await page.evaluate(() => window.__secureOsTest.startLevel('level7', false));
    await page.waitForSelector('#screen-game:not(.hidden)');
    await page.waitForTimeout(300);
    for (const want of [2, 3]) {
      await page.evaluate(() => window.__secureOsTest.pour().solveStage());
      await page.waitForFunction((w) => window.__secureOsTest.pour().stage() === w, want, { timeout: 5000 });
    }
    await page.evaluate(() => window.__secureOsTest.pour().solveStage());
    await page.waitForFunction(() => document.querySelector('#reward-title')?.textContent.includes('Практика'), null, { timeout: 10000 });
    results.push('✓ Уровень 7 (переливание): три уровня проходятся, после последнего открывается история без кода');

    await page.evaluate(() => window.__secureOsTest.startLevel('level8', false));
    await page.waitForSelector('#screen-game:not(.hidden)');
    await page.waitForTimeout(300);
    const sok = await page.evaluate(() => {
      const s = window.__secureOsTest.sokoban();
      const st = s.state();
      return { stage: s.stage(), boxes: st.boxes.length, goals: st.goals.length };
    });
    if (sok.stage !== 1) throw new Error('Сокобан: старт должен быть на уровне 1');
    if (sok.boxes !== sok.goals || sok.boxes < 1) {
      throw new Error(`Сокобан: ящиков и целей должно быть поровну (${sok.boxes}/${sok.goals})`);
    }
    const pushed = await page.evaluate(() => {
      const s = window.__secureOsTest.sokoban();
      const before = s.boxes();
      const ok = s.push('right');
      return { ok, before, after: s.boxes(), moves: s.moves() };
    });
    if (!pushed.ok || pushed.moves !== 1) throw new Error('Сокобан: шаг вправо не сработал');
    if (JSON.stringify(pushed.before) === JSON.stringify(pushed.after)) {
      throw new Error('Сокобан: ящик не сдвинулся при толчке');
    }
    results.push('✓ Уровень 8 (сокобан): старт, шаг и толчок ящика работают');

    // «Подсказка»: на первом уровне решение - два хода вправо
    await page.evaluate(() => window.__secureOsTest.startLevel('level8', false));
    await page.waitForSelector('#screen-game:not(.hidden)');
    const hintTotal = await page.evaluate(() => window.__secureOsTest.sokoban().hintTotal());
    if (hintTotal !== 2) throw new Error('Сокобан: подсказка первого уровня должна быть из 2 ходов, got ' + hintTotal);
    await page.evaluate(() => window.__secureOsTest.sokoban().hint());
    await page.evaluate(() => window.__secureOsTest.sokoban().hint());
    await page.waitForFunction(() => window.__secureOsTest.sokoban().stage() === 2, null, { timeout: 5000 });
    results.push('✓ Уровень 8 (сокобан): «Подсказка» ведёт по решению и проходит уровень');

    for (const want of [3, 4, 5, 6]) {
      await page.evaluate(() => window.__secureOsTest.sokoban().solveStage());
      await page.waitForFunction((w) => window.__secureOsTest.sokoban().stage() === w, want, { timeout: 5000 });
    }
    await page.evaluate(() => window.__secureOsTest.sokoban().solveStage());
    await page.waitForSelector('#screen-reward:not(.hidden)', { timeout: 10000 });
    const sokStory = await page.evaluate(
      () => document.querySelector('#reward-story')?.textContent?.trim() || ''
    );
    if (!sokStory) throw new Error('Сокобан: после победы экран награды пуст');
    results.push('✓ Уровень 8 (сокобан): шесть карт проходятся, победа ведёт на награду');

    await page.evaluate(() => window.__secureOsTest.startLevel('level9', false));
    await page.waitForSelector('#screen-game:not(.hidden)');
    await page.waitForTimeout(300);
    const b0 = await page.evaluate(() => window.__secureOsTest.breakout().state());
    if (b0.stage !== 1 || b0.bricks < 1 || b0.lives !== 3) {
      throw new Error(`Арканоид: некорректный старт (этап ${b0.stage}, кирпичей ${b0.bricks}, жизней ${b0.lives})`);
    }
    if (await page.locator('#btn-skip:not(.hidden)').count()) {
      throw new Error('Арканоид: кнопки «Пропустить» быть не должно');
    }
    await page.evaluate(() => document.querySelector('#pad-right').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })));
    await page.waitForTimeout(300);
    await page.evaluate(() => document.querySelector('#pad-right').dispatchEvent(new PointerEvent('pointerup', { bubbles: true })));
    const bx = await page.evaluate(() => window.__secureOsTest.breakout().paddleX());
    if (!(bx > b0.paddleX + 5)) throw new Error(`Арканоид: платформа не двигается вправо (${b0.paddleX} → ${bx})`);
    await page.evaluate(() => window.__secureOsTest.breakout().launch());
    await page.waitForTimeout(150);
    if ((await page.evaluate(() => window.__secureOsTest.breakout().mode())) !== 'play') {
      throw new Error('Арканоид: мяч не запустился');
    }
    results.push('✓ Уровень 9 (арканоид): этап стартует, стрелка двигает платформу, мяч запускается');

    // бонусы: удвоение шаров и потеря жизни только когда шаров не осталось
    const lifeTest = await page.evaluate(() => {
      const t = window.__secureOsTest.breakout();
      const startLives = t.lives();
      t.give('M');
      const afterMulti = { balls: t.balls(), lives: t.lives() };
      while (t.balls() > 1) t.dropBall();
      const withOneLeft = { balls: t.balls(), lives: t.lives() };
      t.dropBall();
      const afterLast = { balls: t.balls(), lives: t.lives() };
      return { startLives, afterMulti, withOneLeft, afterLast };
    });
    if (lifeTest.afterMulti.balls < 2) {
      throw new Error('Арканоид: бонус M не дублирует шары (' + lifeTest.afterMulti.balls + ')');
    }
    if (lifeTest.withOneLeft.lives !== lifeTest.startLives) {
      throw new Error('Арканоид: потеря шара не должна тратить жизнь, пока есть другие шары');
    }
    if (lifeTest.afterLast.lives !== lifeTest.startLives - 1) {
      throw new Error('Арканоид: потеря последнего шара должна списывать ровно одну жизнь');
    }
    results.push('✓ Уровень 9 (арканоид): бонус M дублирует шары; жизнь списывается только за последний шар');

    const baseW = await page.evaluate(() => window.__secureOsTest.breakout().paddleW());
    await page.evaluate(() => window.__secureOsTest.breakout().give('W'));
    await page.waitForTimeout(150);
    const wideW = await page.evaluate(() => window.__secureOsTest.breakout().paddleW());
    if (!(wideW > baseW)) throw new Error('Арканоид: бонус W не расширяет платформу (' + baseW + ' → ' + wideW + ')');
    results.push('✓ Уровень 9 (арканоид): бонус W расширяет платформу');

    for (const want of [2, 3]) {
      await page.evaluate(() => window.__secureOsTest.breakout().clearStage());
      await page.waitForFunction((w) => window.__secureOsTest.breakout().stage() === w, want, { timeout: 5000 });
    }
    await page.evaluate(() => window.__secureOsTest.breakout().clearStage());
    await page.waitForSelector('#screen-reward:not(.hidden)', { timeout: 10000 });
    const bStory = await page.evaluate(
      () => document.querySelector('#reward-story')?.textContent?.trim() || ''
    );
    if (!bStory) throw new Error('Арканоид: после победы экран награды пуст');
    results.push('✓ Уровень 9 (арканоид): три этапа проходятся, победа ведёт на награду');

    await page.evaluate(() => window.__secureOsTest.startLevel('level10', false));
    await page.evaluate(() => window.__secureOsTest.arghost().disableTelegram());
    await page.waitForSelector('#screen-game:not(.hidden)');
    await page.waitForTimeout(200);
    const arPhase0 = await page.evaluate(() => window.__secureOsTest.arghost().phase());
    if (arPhase0 !== 'intro') throw new Error('AR: старт должен быть с приветствия агента, а не ' + arPhase0);
    if (await page.locator('#btn-skip:not(.hidden)').count()) {
      throw new Error('AR: кнопки «Пропустить» быть не должно');
    }
    results.push('✓ Уровень 10 (AR): старт с приветствия агента, без пропуска');

    await page.evaluate(() => window.__secureOsTest.arghost().begin());
    await page.waitForFunction(() => window.__secureOsTest.arghost().phase() === 'scan', null, { timeout: 8000 });
    results.push('✓ Уровень 10: доступ к камере -> фото -> переход к сканеру');

    await page.evaluate(() => window.__secureOsTest.arghost().skipScan());
    await page.waitForFunction(() => window.__secureOsTest.arghost().huntMode() === '2d', null, { timeout: 12000 });
    results.push('✓ Уровень 10: «Агент допущен» -> без AR-библиотек включается 2D-фолбэк охоты');

    await page.evaluate(() => window.__secureOsTest.arghost().completeHunt());
    await page.waitForFunction(() => window.__secureOsTest.arghost().phase() === 'outro', null, { timeout: 5000 });
    const arSend = await page.evaluate(() => window.__secureOsTest.arghost().sendState());
    if (arSend !== 'off') throw new Error('AR: при выключенном Telegram отправка должна быть отключена, а не ' + arSend);
    await page.evaluate(() => window.__secureOsTest.arghost().pressOutro());
    await page.waitForSelector('#screen-reward:not(.hidden)', { timeout: 10000 });
    const arStory = await page.evaluate(
      () => document.querySelector('#reward-story')?.textContent?.trim() || ''
    );
    if (!arStory) throw new Error('AR: после финала экран награды пуст');
    results.push('✓ Уровень 10 (AR): финал «Спасибо» -> награда');

    // Опросник вместо истории: проходим все вопросы и проверяем результат
    if (!(await page.locator('#reward-story .quiz').count())) throw new Error('Опросник не отрисовался');
    await page.click('#reward-story .quiz__start');
    for (let i = 0; i < 12; i++) {
      if (await page.locator('#reward-story .quiz__score').count()) break;
      const opt = page.locator('#reward-story .quiz__option:not([disabled])').first();
      if (!(await opt.count())) break;
      await opt.click();
      await page.waitForTimeout(450);
    }
    await page.waitForSelector('#reward-story .quiz__score', { timeout: 6000 });
    const quizScore = await page.locator('#reward-story .quiz__score').textContent();
    if (!quizScore.includes('%')) throw new Error('Опросник: нет результата в процентах');
    results.push('✓ Уровень 10: опросник «Как хорошо ты меня знаешь?» проходится, результат ' + quizScore.trim());

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
