import { CONFIG } from './config.js';
import { createPlatformer } from './game/platformer.js';
import { getReward } from './rewards.js';

const screens = {
  welcome: document.getElementById('screen-welcome'),
  lobby: document.getElementById('screen-lobby'),
  game: document.getElementById('screen-game'),
  reward: document.getElementById('screen-reward'),
};

const el = {
  greeting: document.getElementById('welcome-greeting'),
  name: document.getElementById('welcome-name'),
  eyebrow: document.getElementById('welcome-eyebrow'),
  subtitle: document.getElementById('welcome-subtitle'),
  intro: document.getElementById('welcome-intro'),
  start: document.getElementById('btn-start'),
  hint: document.getElementById('welcome-hint'),
  hudTitle: document.getElementById('hud-title'),
  hudCollected: document.getElementById('hud-collected'),
  hudTotal: document.getElementById('hud-total'),
  hudTimer: document.getElementById('hud-timer'),
  gameHint: document.getElementById('game-hint'),
  back: document.getElementById('btn-back'),
  canvas: document.getElementById('game-canvas'),
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

function showScreen(active) {
  for (const [key, node] of Object.entries(screens)) {
    node.classList.toggle('hidden', key !== active);
  }
}

function fillWelcome() {
  const name = CONFIG.herName?.trim();
  el.eyebrow.textContent = CONFIG.eyebrow;
  el.greeting.textContent = name ? `${CONFIG.welcomeGreeting},` : `${CONFIG.welcomeGreeting}!`;
  el.name.textContent = name ? ` ${name}` : '';
  el.subtitle.textContent = CONFIG.subtitle;
  el.intro.textContent = CONFIG.intro;
  el.start.textContent = CONFIG.startLabel;
  el.hint.textContent = CONFIG.controlsHint;
  el.lobbyEyebrow.textContent = CONFIG.lobbyEyebrow;
  el.lobbyHint.textContent = CONFIG.lobbyHint;
  el.lobby.textContent = CONFIG.lobbyReturnLabel;
  el.hudTitle.textContent = CONFIG.gameTitle;
  el.rewardEyebrow.textContent = CONFIG.winEyebrow;
  el.rewardTitle.textContent = CONFIG.winTitle;
  el.codeLabel.textContent = CONFIG.codeLabel;
  el.codeHint.textContent = CONFIG.codeHint;
  el.replay.textContent = CONFIG.replayLabel;
  document.title = CONFIG.gameTitle;
}

function startGame(levelId = currentLevelId) {
  currentLevelId = levelId;
  showScreen('game');
  if (game) game.destroy();

  el.hudCollected.textContent = '0';
  el.hudTotal.textContent = '0';
  hideGameHint();
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
  game.start();
  const state = game.getState();
  el.hudTotal.textContent = String(state.total);
}

function handleWin() {
  spawnSparkles();
  setTimeout(() => {
    showScreen('reward');
    revealReward();
  }, reduceMotion ? 0 : 350);
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

async function revealReward() {
  el.rewardStory.innerHTML = `<p class="reward__loading">${CONFIG.loadingText}</p>`;
  el.codeBlock.classList.add('hidden');
  el.bonus.textContent = '';

  try {
    const reward = await getReward(CONFIG.gameId);
    if (!reward) throw new Error('no reward for ' + CONFIG.gameId);

    el.rewardTitle.textContent = reward.title || CONFIG.winTitle;
    typeStory(el.rewardStory, reward.story || []);

    if (reward.code) {
      el.code.dataset.code = reward.code;
      el.code.textContent = reward.code;
      el.codeBlock.classList.remove('hidden');
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
    card.dataset.index = String(i);
    card.innerHTML =
      `<span class="level-card__num">${i + 1}</span>` +
      `<span class="level-card__icon">${lvl.unlocked ? '★' : lockSvg()}</span>` +
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
  fillWelcome();
  fillBackgroundDeco();
  buildLevelCards();

  el.start.addEventListener('click', () => openLobby());
  el.back.addEventListener('click', () => openLobby());
  el.lobby.addEventListener('click', () => openLobby());
  el.replay.addEventListener('click', () => startGame(currentLevelId));
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
      start: () => startGame('level1'),
      openLobby: () => openLobby(),
      lobby: () => ({ index: lobbyState.index, step: lobbyState.step }),
      goTo: (i) => goToLobby(i),
      forceWin: () => game && game.win(),
      state: () => (game ? game.getState() : null),
      payload: () => getReward(CONFIG.gameId),
    };
  }
}

init();
