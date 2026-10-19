import { CONFIG } from './config.js';
import { createPlatformer } from './game/platformer.js';
import { createDefense } from './game/defense.js';
import { createRhythm } from './game/rhythm.js';
import { createRogue } from './game/rogue.js';
import { createStealth } from './game/stealth.js';
import { createBrawl } from './game/brawl.js';
import { getReward } from './rewards.js';

const screens = {
  lobby: document.getElementById('screen-lobby'),
  game: document.getElementById('screen-game'),
  reward: document.getElementById('screen-reward'),
};

const el = {
  hudTitle: document.getElementById('hud-title'),
  hudCollected: document.getElementById('hud-collected'),
  hudTotal: document.getElementById('hud-total'),
  hudStars: document.getElementById('hud-stars'),
  hudTimer: document.getElementById('hud-timer'),
  gameHint: document.getElementById('game-hint'),
  back: document.getElementById('btn-back'),
  skip: document.getElementById('btn-skip'),
  sync: document.getElementById('hud-sync'),
  syncMinus: document.getElementById('btn-sync-minus'),
  syncPlus: document.getElementById('btn-sync-plus'),
  intro: document.getElementById('game-intro'),
  introEyebrow: document.getElementById('intro-eyebrow'),
  introTitle: document.getElementById('intro-title'),
  introText: document.getElementById('intro-text'),
  introBtn: document.getElementById('btn-intro'),
  canvas: document.getElementById('game-canvas'),
  controlsBox: document.getElementById('controls'),
  controls: {
    left: document.getElementById('pad-left'),
    right: document.getElementById('pad-right'),
    jump: document.getElementById('pad-jump'),
  },
  lobbyEyebrow: document.getElementById('lobby-eyebrow'),
  levels: document.getElementById('levels'),
  levelsTrack: document.getElementById('levels-track'),
  lobbyDots: document.getElementById('lobby-dots'),
  lobbyHint: document.getElementById('lobby-hint'),
  rewardEyebrow: document.getElementById('reward-eyebrow'),
  rewardTitle: document.getElementById('reward-title'),
  rewardStory: document.getElementById('reward-story'),
  puzzleBlock: document.getElementById('reward-puzzle'),
  puzzleBoard: document.getElementById('puzzle-board'),
  puzzleLabel: document.getElementById('puzzle-label'),
  puzzleHint: document.getElementById('puzzle-hint'),
  codeBlock: document.getElementById('reward-code-block'),
  codeLabel: document.getElementById('code-label'),
  code: document.getElementById('reward-code'),
  codeHint: document.getElementById('code-hint'),
  bonus: document.getElementById('reward-bonus'),
  replay: document.getElementById('btn-replay'),
  lobby: document.getElementById('btn-lobby'),
  sparkles: document.getElementById('sparkles'),
};

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let game = null;
let currentLevelId = CONFIG.levels?.[0]?.id || 'level1';
const lobbyState = { index: 0, step: 0, cardW: 0, viewportW: 0, dragging: false, startX: 0, moved: false };
let puzzle = null;

function showScreen(active) {
  for (const [key, node] of Object.entries(screens)) {
    node.classList.toggle('hidden', key !== active);
  }
}

function fillStatic() {
  el.lobbyEyebrow.textContent = CONFIG.lobbyEyebrow;
  el.lobbyHint.textContent = CONFIG.lobbyHint;
  el.lobby.textContent = CONFIG.lobbyReturnLabel;
  el.hudTitle.textContent = CONFIG.gameTitle;
  el.rewardEyebrow.textContent = CONFIG.winEyebrow;
  el.rewardTitle.textContent = CONFIG.winTitle;
  el.codeLabel.textContent = CONFIG.codeLabel;
  el.codeHint.textContent = CONFIG.codeHint;
  el.replay.textContent = CONFIG.replayLabel;
  el.skip.textContent = CONFIG.skipLabel;
  el.introEyebrow.textContent = CONFIG.introEyebrow;
  el.introBtn.textContent = CONFIG.introStartLabel;
  document.title = CONFIG.gameTitle;
}

function startGame(levelId = currentLevelId, withIntro = true) {
  const levels = CONFIG.levels || [];
  const level = levels.find((l) => l.id === levelId) || levels[0];
  currentLevelId = level.id;

  showScreen('game');
  if (game) game.destroy();
  game = null;

  const kind = level.kind || (level.id === 'level1' ? 'platformer' : 'defense');
  const isPlatformer = kind === 'platformer';
  el.canvas.style.aspectRatio = '';
  if (el.hudStars) el.hudStars.classList.toggle('hidden', !isPlatformer);
  if (el.controlsBox) el.controlsBox.classList.toggle('hidden', !isPlatformer);
  if (el.skip) el.skip.classList.toggle('hidden', !level.skippable);
  if (el.sync) el.sync.classList.toggle('hidden', kind !== 'rhythm');
  el.hudTitle.textContent = level.name || CONFIG.gameTitle;
  el.hudCollected.textContent = '0';
  el.hudTotal.textContent = '0';
  hideGameHint();

  if (isPlatformer) {
    updateTimer(CONFIG.timeLimitSec || 0);
    game = createPlatformer(el.canvas, {
      controls: el.controls,
      timeLimit: CONFIG.timeLimitSec || 0,
      onProgress: (collected, total) => {
        el.hudCollected.textContent = String(collected);
        el.hudTotal.textContent = String(total);
      },
      onHint: showGameHint,
      onTime: updateTimer,
      onWin: handleWin,
    });
    el.hudTotal.textContent = String(game.getState().total);
  } else if (kind === 'brawl') {
    updateTimer(0);
    game = createBrawl(el.canvas, {
      onHint: showGameHint,
      onWin: handleWin,
    });
  } else if (kind === 'stealth') {
    updateTimer(0);
    game = createStealth(el.canvas, {
      onHint: showGameHint,
      onWin: handleWin,
    });
  } else if (kind === 'roguelike') {
    updateTimer(0);
    game = createRogue(el.canvas, {
      onHint: showGameHint,
      onWin: handleWin,
      tutorial: true,
    });
  } else if (kind === 'rhythm') {
    updateTimer(0);
    game = createRhythm(el.canvas, {
      onHint: showGameHint,
      onWin: handleWin,
    });
  } else {
    updateTimer(0);
    game = createDefense(el.canvas, {
      onHint: showGameHint,
      onWin: handleWin,
    });
  }

  if (withIntro) showIntro(level);
  else if (game) game.start();
}

function nudgeSync(delta) {
  if (!game || !game.adjustOffset) return;
  const ms = game.adjustOffset(delta);
  showGameHint(`Синхронизация: ${ms > 0 ? '+' : ''}${ms} мс. Тапаешь раньше звука - жми +`);
}

function showIntro(level) {
  if (!el.intro) {
    if (game) game.start();
    return;
  }
  el.introTitle.textContent = level.name || CONFIG.gameTitle;
  el.introText.textContent = level.intro || '';
  el.intro.classList.remove('hidden');
}

function dismissIntro() {
  if (el.intro) el.intro.classList.add('hidden');
  if (game) game.start();
}

function handleWin() {
  spawnSparkles();
  setTimeout(() => {
    showScreen('reward');
    revealReward();
  }, reduceMotion ? 0 : 350);
}

function skipLevel() {
  if (game) {
    game.destroy();
    game = null;
  }
  showScreen('reward');
  revealReward({ skipPuzzle: true });
}

function showGameHint(message) {
  if (!el.gameHint) return;
  el.gameHint.textContent = message;
  el.gameHint.classList.add('visible');
  clearTimeout(showGameHint._timer);
  showGameHint._timer = setTimeout(hideGameHint, 2200);
}

function hideGameHint() {
  if (!el.gameHint) return;
  el.gameHint.classList.remove('visible');
  el.gameHint.textContent = '';
}

function updateTimer(seconds) {
  if (!el.hudTimer) return;
  if (!seconds) {
    el.hudTimer.hidden = true;
    el.hudTimer.textContent = '';
    el.hudTimer.classList.remove('low');
    return;
  }
  const m = Math.floor(seconds / 60);
  const s = String(seconds % 60).padStart(2, '0');
  el.hudTimer.hidden = false;
  el.hudTimer.textContent = `${m}:${s}`;
  el.hudTimer.classList.toggle('low', seconds <= 15);
}

const PUZZLE_KEYS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 0];

function clearPuzzleTimers() {
  if (puzzle && puzzle.timers) puzzle.timers.forEach((t) => clearTimeout(t));
  if (puzzle) puzzle.timers = [];
}

function puzzleLight(digit, on) {
  const tile = el.puzzleBoard.querySelector(`[data-digit="${digit}"]`);
  if (tile) tile.classList.toggle('is-lit', on);
}

function puzzleRenderHint(prefix) {
  const dots = puzzle.digits.map((_, i) => (i < puzzle.input.length ? '●' : '○')).join(' ');
  el.puzzleHint.textContent = `${prefix} ${dots}`;
}

function renderPuzzle() {
  el.puzzleBoard.innerHTML = '';
  for (const d of PUZZLE_KEYS) {
    const tile = document.createElement('button');
    tile.type = 'button';
    tile.className = 'puzzle__tile';
    tile.dataset.digit = String(d);
    tile.textContent = String(d);
    tile.addEventListener('click', () => onPuzzleTap(d));
    el.puzzleBoard.appendChild(tile);
  }
}

function playPuzzleSequence() {
  if (!puzzle || puzzle.solved) return;
  clearPuzzleTimers();
  puzzle.busy = true;
  puzzle.input = [];
  el.puzzleHint.textContent = 'Запомни порядок...';
  const step = 650;
  const start = 500;
  puzzle.digits.forEach((d, i) => {
    puzzle.timers.push(setTimeout(() => puzzleLight(d, true), start + i * step));
    puzzle.timers.push(setTimeout(() => puzzleLight(d, false), start + i * step + 420));
  });
  puzzle.timers.push(
    setTimeout(() => {
      if (!puzzle || puzzle.solved) return;
      puzzle.busy = false;
      puzzleRenderHint('Твой ход:');
    }, start + puzzle.digits.length * step)
  );
}

function onPuzzleTap(digit) {
  if (!puzzle || puzzle.busy || puzzle.solved) return;
  const k = puzzle.input.length;
  if (puzzle.digits[k] !== digit) {
    puzzle.busy = true;
    el.puzzleHint.textContent = 'Не то. Смотри ещё раз';
    el.puzzleBoard.classList.add('is-wrong');
    puzzle.timers.push(
      setTimeout(() => {
        el.puzzleBoard.classList.remove('is-wrong');
        playPuzzleSequence();
      }, 700)
    );
    return;
  }
  puzzle.input.push(digit);
  puzzleLight(digit, true);
  puzzle.timers.push(setTimeout(() => puzzleLight(digit, false), 220));
  if (puzzle.input.length === puzzle.digits.length) {
    solvePuzzle();
    return;
  }
  puzzleRenderHint('Твой ход:');
}

function puzzleType(level) {
  return (level && level.puzzleType) || 'sequence';
}

function showPuzzle(code) {
  const level = (CONFIG.levels || []).find((l) => l.id === currentLevelId);
  if (puzzleType(level) === 'lock') showLockPuzzle(code);
  else showSequencePuzzle(code);
}

function showLockPuzzle(code) {
  puzzle = {
    type: 'lock',
    code,
    digits: code.split('').map(Number),
    slots: [0, 0, 0, 0],
    tries: 10,
    history: [],
    solved: false,
  };
  el.puzzleLabel.textContent = CONFIG.lockLabel;
  el.puzzleHint.textContent = CONFIG.lockHint;
  el.puzzleBlock.classList.remove('hidden');
  el.codeBlock.classList.add('hidden');
  renderLock();
}

function lockFeedback(guess, digits) {
  const n = digits.length;
  const usedCode = new Array(n).fill(false);
  const usedGuess = new Array(n).fill(false);
  let bulls = 0;
  for (let i = 0; i < n; i++) {
    if (guess[i] === digits[i]) {
      bulls += 1;
      usedCode[i] = true;
      usedGuess[i] = true;
    }
  }
  let cows = 0;
  for (let i = 0; i < n; i++) {
    if (usedGuess[i]) continue;
    for (let j = 0; j < n; j++) {
      if (usedCode[j] || digits[j] !== guess[i]) continue;
      usedCode[j] = true;
      cows += 1;
      break;
    }
  }
  return { bulls, cows };
}

// статус каждой цифры попытки: bull - на своём месте, cow - есть в коде, но не здесь, miss - нет
function lockStatuses(guess, digits) {
  const n = digits.length;
  const status = new Array(n).fill('miss');
  const left = new Array(n).fill(true);
  for (let i = 0; i < n; i++) {
    if (guess[i] === digits[i]) {
      status[i] = 'bull';
      left[i] = false;
    }
  }
  for (let i = 0; i < n; i++) {
    if (status[i] === 'bull') continue;
    const j = digits.findIndex((d, k) => left[k] && d === guess[i]);
    if (j >= 0) {
      status[i] = 'cow';
      left[j] = false;
    }
  }
  return status;
}

function renderLock() {
  const p = puzzle;
  el.puzzleBoard.classList.add('lock');
  el.puzzleBoard.innerHTML = '';

  const slots = document.createElement('div');
  slots.className = 'lock__slots';
  p.slots.forEach((d, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'lock__slot';
    b.textContent = String(d);
    b.addEventListener('click', () => {
      if (p.solved) return;
      p.slots[i] = (p.slots[i] + 1) % 10;
      renderLock();
    });
    slots.appendChild(b);
  });

  const ctrl = document.createElement('div');
  ctrl.className = 'lock__ctrl';
  const check = document.createElement('button');
  check.type = 'button';
  check.className = 'lock__check';
  check.id = 'lock-check';
  check.textContent = CONFIG.lockCheck;
  check.addEventListener('click', checkLock);
  const tries = document.createElement('span');
  tries.className = 'lock__tries';
  tries.textContent = `${CONFIG.lockTries}: ${p.tries}`;
  ctrl.append(check, tries);

  const hist = document.createElement('div');
  hist.className = 'lock__history';
  for (const h of p.history) {
    const row = document.createElement('div');
    row.className = 'lock__row';
    const tiles = document.createElement('span');
    tiles.className = 'lock__tiles';
    const statuses = lockStatuses(h.guess, p.digits);
    h.guess.forEach((digit, i) => {
      const t = document.createElement('b');
      t.className = `lock__tile lock__tile--${statuses[i]}`;
      t.textContent = String(digit);
      t.title = statuses[i] === 'bull' ? 'на своём месте' : statuses[i] === 'cow' ? 'есть, но не здесь' : 'цифры нет';
      tiles.appendChild(t);
    });
    row.append(tiles);
    hist.appendChild(row);
  }

  el.puzzleBoard.append(slots, ctrl, hist);
}

function checkLock() {
  const p = puzzle;
  if (!p || p.type !== 'lock' || p.solved) return;
  const guess = p.slots.slice();
  const { bulls, cows } = lockFeedback(guess, p.digits);
  p.history.push({ guess, bulls, cows });
  if (bulls === p.digits.length) {
    p.solved = true;
    el.puzzleHint.textContent = CONFIG.lockOpened;
    revealCode(p.code);
    return;
  }
  p.tries -= 1;
  if (p.tries <= 0) {
    p.solved = true;
    revealCode(p.code);
    return;
  }
  renderLock();
}

function revealCode(code) {
  el.puzzleBlock.classList.add('hidden');
  el.puzzleHint.textContent = CONFIG.puzzleSolved;
  el.code.dataset.code = code;
  el.code.textContent = code;
  el.codeBlock.classList.remove('hidden');
}

function showSequencePuzzle(code) {
  clearPuzzleTimers();
  puzzle = {
    code,
    digits: code.split('').map(Number),
    input: [],
    busy: false,
    solved: false,
    timers: [],
  };
  el.puzzleLabel.textContent = CONFIG.puzzleLabel;
  el.puzzleBlock.classList.remove('hidden');
  el.codeBlock.classList.add('hidden');
  renderPuzzle();
  playPuzzleSequence();
}

function solvePuzzle() {
  if (!puzzle || puzzle.solved) return false;
  puzzle.solved = true;
  clearPuzzleTimers();
  revealCode(puzzle.code);
  return true;
}

async function revealReward(opts = {}) {
  const level = (CONFIG.levels || []).find((l) => l.id === currentLevelId);
  const gameId = level?.gameId || CONFIG.gameId;
  const usePuzzle = !!(level && level.puzzle && !opts.skipPuzzle);

  el.rewardStory.innerHTML = `<p class="reward__loading">${CONFIG.loadingText}</p>`;
  el.rewardEyebrow.textContent = CONFIG.winEyebrow;
  el.rewardTitle.textContent = CONFIG.winTitle;
  el.codeBlock.classList.add('hidden');
  el.puzzleBlock.classList.add('hidden');
  puzzle = null;
  el.bonus.textContent = '';

  try {
    const reward = await getReward(gameId);
    if (!reward) {
      typeStory(el.rewardStory, [CONFIG.rewardSoon]);
      el.bonus.textContent = CONFIG.bonusFallback;
      return;
    }

    el.rewardTitle.textContent = reward.title || CONFIG.winTitle;
    typeStory(el.rewardStory, reward.story || []);

    if (reward.code) {
      if (usePuzzle) showPuzzle(reward.code);
      else {
        el.code.dataset.code = reward.code;
        el.code.textContent = reward.code;
        el.codeBlock.classList.remove('hidden');
      }
    }
    el.bonus.textContent = reward.bonus || CONFIG.bonusFallback;
  } catch (err) {
    el.rewardStory.innerHTML = '';
    const p = document.createElement('p');
    p.textContent = CONFIG.rewardUnavailable;
    el.rewardStory.appendChild(p);
    el.bonus.textContent = CONFIG.bonusFallback;
    console.warn('[rewards]', err);
  }
}

function typeStory(container, paragraphs) {
  container.innerHTML = '';
  if (!paragraphs.length) return;

  const nodes = paragraphs.map((text) => {
    const p = document.createElement('p');
    p.dataset.full = text;
    container.appendChild(p);
    return p;
  });

  if (reduceMotion) {
    nodes.forEach((p) => (p.textContent = p.dataset.full));
    return;
  }

  let skip = false;
  const skipOnTap = () => (skip = true);
  container.addEventListener('click', skipOnTap, { once: true });

  (async () => {
    for (const p of nodes) {
      const text = p.dataset.full;
      for (let i = 1; i <= text.length; i++) {
        if (skip) {
          p.textContent = text;
          break;
        }
        p.textContent = text.slice(0, i);
        await sleep(16);
      }
      if (!skip) await sleep(220);
    }
  })();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function spawnSparkles() {
  if (reduceMotion) return;
  const symbols = ['★', '✦', '✧', '☆'];
  for (let i = 0; i < 22; i++) {
    const s = document.createElement('span');
    s.textContent = symbols[i % symbols.length];
    s.style.left = `${Math.random() * 100}%`;
    s.style.fontSize = `${14 + Math.random() * 18}px`;
    s.style.animationDuration = `${1.8 + Math.random() * 1.8}s`;
    s.style.animationDelay = `${Math.random() * 0.5}s`;
    el.sparkles.appendChild(s);
    setTimeout(() => s.remove(), 4200);
  }
}

function fillBackgroundDeco() {
  const container = document.querySelector('.bg-deco');
  if (!container || reduceMotion) return;
  for (let i = 0; i < 16; i++) {
    const s = document.createElement('span');
    s.textContent = i % 3 === 0 ? '☆' : '★';
    s.style.left = `${Math.random() * 100}%`;
    s.style.fontSize = `${12 + Math.random() * 16}px`;
    s.style.animationDuration = `${9 + Math.random() * 10}s`;
    s.style.animationDelay = `${Math.random() * 9}s`;
    container.appendChild(s);
  }
}

async function copyCode() {
  const code = el.code.dataset.code;
  if (!code) return;

  try {
    await navigator.clipboard.writeText(code);
  } catch {
    const range = document.createRange();
    range.selectNodeContents(el.code);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }

  el.code.classList.add('is-copied');
  clearTimeout(copyCode._timer);
  copyCode._timer = setTimeout(() => el.code.classList.remove('is-copied'), 1200);
}

function escapeHtml(value) {
  const div = document.createElement('div');
  div.textContent = value == null ? '' : String(value);
  return div.innerHTML;
}

function lockSvg() {
  return (
    '<svg class="level-card__lock" viewBox="0 0 24 24" width="56" height="56" fill="none" ' +
    'stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' +
    '<rect x="5" y="11" width="14" height="9" rx="2.5"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>'
  );
}

function buildLevelCards() {
  el.levelsTrack.innerHTML = '';
  el.lobbyDots.innerHTML = '';
  (CONFIG.levels || []).forEach((lvl, i) => {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'level-card' + (lvl.unlocked ? '' : ' level-card--locked');
    card.dataset.kind = lvl.kind || 'platformer';
    card.dataset.index = String(i);
    card.innerHTML =
      `<span class="level-card__num">${i + 1}</span>` +
      `<span class="level-card__icon">${lvl.unlocked ? escapeHtml(lvl.icon || '★') : lockSvg()}</span>` +
      `<span class="level-card__name">${escapeHtml(lvl.name)}</span>` +
      `<span class="level-card__sub">${escapeHtml(lvl.subtitle || '')}</span>`;
    el.levelsTrack.appendChild(card);

    const dot = document.createElement('span');
    dot.className = 'lobby__dot';
    dot.dataset.index = String(i);
    el.lobbyDots.appendChild(dot);
  });
}

function measureLobby() {
  const cards = el.levelsTrack.children;
  if (!cards.length) return;
  lobbyState.viewportW = el.levels.clientWidth;
  lobbyState.cardW = cards[0].offsetWidth;
  const cs = getComputedStyle(el.levelsTrack);
  const gap = parseFloat(cs.columnGap || cs.gap) || 18;
  lobbyState.step = lobbyState.cardW + gap;
}

function offsetFor(index) {
  return (lobbyState.viewportW - lobbyState.cardW) / 2 - index * lobbyState.step;
}

function applyOffset(offset, animate) {
  el.levelsTrack.style.transition =
    animate && !reduceMotion ? 'transform 0.34s cubic-bezier(0.22, 1, 0.36, 1)' : 'none';
  el.levelsTrack.style.transform = `translateX(${offset}px)`;
}

function updateLobbyActive() {
  [...el.levelsTrack.children].forEach((card, i) => {
    card.classList.toggle('is-active', i === lobbyState.index);
  });
  [...el.lobbyDots.children].forEach((dot, i) => {
    dot.classList.toggle('is-active', i === lobbyState.index);
  });
}

function goToLobby(index, animate = true) {
  const count = (CONFIG.levels || []).length;
  lobbyState.index = Math.max(0, Math.min(count - 1, index));
  applyOffset(offsetFor(lobbyState.index), animate);
  updateLobbyActive();
}

function setLobbyHint(message) {
  if (el.lobbyHint) el.lobbyHint.textContent = message || '';
}

function openLobby(resetIndex = true) {
  if (game) {
    game.destroy();
    game = null;
  }
  showScreen('lobby');
  if (resetIndex) lobbyState.index = 0;
  requestAnimationFrame(() => {
    measureLobby();
    goToLobby(lobbyState.index, false);
  });
  setLobbyHint(CONFIG.lobbyHint);
}

function onLobbyDown(e) {
  lobbyState.dragging = true;
  lobbyState.moved = false;
  lobbyState.startX = e.clientX;
  applyOffset(offsetFor(lobbyState.index), false);
  window.addEventListener('pointermove', onLobbyMove, { passive: true });
  window.addEventListener('pointerup', onLobbyUp, { once: true });
  window.addEventListener('pointercancel', onLobbyUp, { once: true });
}

function onLobbyMove(e) {
  if (!lobbyState.dragging) return;
  const dx = e.clientX - lobbyState.startX;
  if (Math.abs(dx) > 6) lobbyState.moved = true;
  applyOffset(offsetFor(lobbyState.index) + dx, false);
}

function onLobbyUp(e) {
  window.removeEventListener('pointermove', onLobbyMove);
  if (!lobbyState.dragging) return;
  lobbyState.dragging = false;
  const dx = (e.clientX || 0) - lobbyState.startX;
  const threshold = lobbyState.step ? lobbyState.step * 0.22 : 40;
  if (dx < -threshold) goToLobby(lobbyState.index + 1);
  else if (dx > threshold) goToLobby(lobbyState.index - 1);
  else goToLobby(lobbyState.index);
}

function activateLobbyCard(index) {
  const lvl = (CONFIG.levels || [])[index];
  if (!lvl) return;
  if (!lvl.unlocked) {
    setLobbyHint(CONFIG.lockedHint);
    return;
  }
  startGame(lvl.id);
}

function init() {
  fillStatic();
  fillBackgroundDeco();
  buildLevelCards();
  openLobby(false);

  el.back.addEventListener('click', () => openLobby());
  el.lobby.addEventListener('click', () => openLobby());
  el.replay.addEventListener('click', () => startGame(currentLevelId, false));
  el.skip.addEventListener('click', skipLevel);
  el.syncMinus.addEventListener('click', () => nudgeSync(-0.03));
  el.syncPlus.addEventListener('click', () => nudgeSync(0.03));
  el.introBtn.addEventListener('click', dismissIntro);
  el.code.addEventListener('click', copyCode);

  el.levels.addEventListener('pointerdown', onLobbyDown);

  el.levelsTrack.addEventListener('click', (e) => {
    const card = e.target.closest('.level-card');
    if (!card) return;
    if (lobbyState.moved) {
      lobbyState.moved = false;
      return;
    }
    const i = Number(card.dataset.index);
    if (i !== lobbyState.index) {
      goToLobby(i);
      return;
    }
    activateLobbyCard(i);
  });

  el.lobbyDots.addEventListener('click', (e) => {
    const dot = e.target.closest('.lobby__dot');
    if (dot) goToLobby(Number(dot.dataset.index));
  });

  window.addEventListener('resize', () => {
    if (!screens.lobby.classList.contains('hidden')) {
      measureLobby();
      goToLobby(lobbyState.index, false);
    }
  });

  window.addEventListener('keydown', (e) => {
    if (screens.lobby.classList.contains('hidden')) return;
    if (e.key === 'ArrowRight') goToLobby(lobbyState.index + 1);
    else if (e.key === 'ArrowLeft') goToLobby(lobbyState.index - 1);
    else if (e.key === 'Enter') activateLobbyCard(lobbyState.index);
  });

  if (window.__ENABLE_TEST_HOOKS === true) {
    window.__secureOsTest = {
      start: () => startGame('level1', false),
      startLevel: (id) => startGame(id, false),
      openLobby: () => openLobby(),
      lobby: () => ({ index: lobbyState.index, step: lobbyState.step }),
      goTo: (i) => goToLobby(i),
      forceWin: () => game && game.win(),
      state: () => (game ? game.getState() : null),
      defense: () => (game && game.test ? game.test : null),
      rhythm: () => (game && game.test ? game.test : null),
      rogue: () => (game && game.test ? game.test : null),
      stealth: () => (game && game.test ? game.test : null),
      brawl: () => (game && game.test ? game.test : null),
      solvePuzzle: () => solvePuzzle(),
      puzzle: () => (puzzle ? { digits: puzzle.digits.length, solved: puzzle.solved } : null),
      payload: (id) => getReward(id || CONFIG.gameId),
    };
  }
}

// Игра на телефоне: без зума жестами, двойного тапа-зума и контекстного меню
['gesturestart', 'gesturechange', 'gestureend'].forEach((t) =>
  document.addEventListener(t, (e) => e.preventDefault(), { passive: false })
);
let lastTapAt = 0;
document.addEventListener(
  'touchend',
  (e) => {
    const now = Date.now();
    if (now - lastTapAt < 320) e.preventDefault();
    lastTapAt = now;
  },
  { passive: false }
);
document.addEventListener('contextmenu', (e) => {
  if (document.querySelector('.screen--game:not(.hidden)')) e.preventDefault();
});

init();
