const VIEW = { w: 500, h: 400 };
const TOP_H = 32;
const BOT_H = 68;
const BOT_Y = VIEW.h - BOT_H;
const CELL = 50;
const COLS = 10;
const ROWS = 6;
const FIELD_Y = TOP_H;

const START_GOLD = 70;
const START_LIVES = 4;

const WAYPOINTS = [
  [-1, 3],
  [8, 3],
  [8, 0],
  [2, 0],
  [2, 5],
  [9, 5],
  [9, 2],
];

const TOWERS = {
  gun: { name: 'Стрелок', cost: 20, dmg: 7, range: 118, rate: 1.5, color: '#7a5cc4' },
  frost: { name: 'Мороз', cost: 30, dmg: 3, range: 112, rate: 1.1, slow: 0.4, slowDur: 1.4, color: '#3fb8b0' },
  cannon: { name: 'Пушка', cost: 45, dmg: 24, range: 138, rate: 0.5, splash: 46, color: '#c96a4a' },
};

const ENEMIES = {
  grunt: { hp: 55, speed: 46, gold: 3, armor: 0, r: 11, color: '#ff9db5' },
  runner: { hp: 38, speed: 100, gold: 3, armor: 0, r: 9, color: '#ffcf5e' },
  tank: { hp: 210, speed: 27, gold: 6, armor: 0.4, r: 14, color: '#8b6fb0' },
  mini: { hp: 560, speed: 34, gold: 12, armor: 0.28, r: 16, color: '#b79bf0', boss: true },
  boss: { hp: 2000, speed: 27, gold: 20, armor: 0.32, r: 19, color: '#5f4586', boss: true },
};

const WAVES = [
  { groups: [{ type: 'grunt', count: 6, gap: 44, delay: 0 }], reward: 12 },
  { groups: [{ type: 'grunt', count: 9, gap: 34, delay: 0 }, { type: 'runner', count: 5, gap: 26, delay: 200 }], reward: 14 },
  { groups: [{ type: 'runner', count: 12, gap: 22, delay: 0 }, { type: 'tank', count: 3, gap: 64, delay: 260 }], reward: 16 },
  {
    groups: [
      { type: 'grunt', count: 14, gap: 26, delay: 0 },
      { type: 'runner', count: 10, gap: 20, delay: 240 },
      { type: 'tank', count: 5, gap: 52, delay: 420 },
    ],
    reward: 18,
  },
  {
    groups: [
      { type: 'mini', count: 2, gap: 90, delay: 0 },
      { type: 'grunt', count: 16, gap: 22, delay: 120 },
      { type: 'runner', count: 14, gap: 16, delay: 400 },
    ],
    reward: 22,
  },
  {
    groups: [
      { type: 'boss', count: 2, gap: 160, delay: 0 },
      { type: 'tank', count: 10, gap: 44, delay: 140 },
      { type: 'runner', count: 20, gap: 14, delay: 380 },
      { type: 'grunt', count: 20, gap: 18, delay: 560 },
    ],
    reward: 30,
  },
];

const MAX_LEVEL = 3;

function cx(col) {
  return col * CELL + CELL / 2;
}
function cy(row) {
  return FIELD_Y + row * CELL + CELL / 2;
}

export function createDefense(canvas, { onHint, onWin } = {}) {
  const ctx = canvas.getContext('2d');

  const path = WAYPOINTS.map(([c, r]) => ({ x: cx(c), y: cy(r) }));
  const segments = [];
  let totalLen = 0;
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i];
    const b = path[i + 1];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    segments.push({ a, b, len, start: totalLen });
    totalLen += len;
  }

  const pathCells = new Set();
  for (const [c, r] of WAYPOINTS) {
    pathCells.add(`${c},${r}`);
  }
  for (let i = 0; i < WAYPOINTS.length - 1; i++) {
    const [c0, r0] = WAYPOINTS[i];
    const [c1, r1] = WAYPOINTS[i + 1];
    if (c0 === c1) {
      const from = Math.min(r0, r1);
      const to = Math.max(r0, r1);
      for (let r = from; r <= to; r++) pathCells.add(`${c0},${r}`);
    } else if (r0 === r1) {
      const from = Math.min(c0, c1);
      const to = Math.max(c0, c1);
      for (let c = from; c <= to; c++) pathCells.add(`${c},${r0}`);
    }
  }

  let towers = [];
  let enemies = [];
  let shots = [];
  let effects = [];
  let gold = START_GOLD;
  let lives = START_LIVES;
  let waveIndex = 0;
  let phase = 'build';
  let queue = [];
  let frame = 0;
  let finished = false;
  let running = false;
  let raf = null;
  let last = 0;
  let acc = 0;
  let speed = 1;
  let time = 0;
  let selectedCell = null;
  let selectedTower = null;
  let hotspots = [];
  let scale = 1;
  let hint = 'Поставь башни и жми «Волна»';

  function posAt(d) {
    const clamped = Math.max(0, Math.min(totalLen, d));
    for (const s of segments) {
      if (clamped <= s.start + s.len) {
        const t = s.len ? (clamped - s.start) / s.len : 0;
        return { x: s.a.x + (s.b.x - s.a.x) * t, y: s.a.y + (s.b.y - s.a.y) * t };
      }
    }
    const lastSeg = segments[segments.length - 1];
    return { x: lastSeg.b.x, y: lastSeg.b.y };
  }

  function isBuildable(col, row) {
    if (col < 0 || row < 0 || col >= COLS || row >= ROWS) return false;
    if (pathCells.has(`${col},${row}`)) return false;
    return !towers.some((t) => t.col === col && t.row === row);
  }

  function towerStat(t, key) {
    const base = TOWERS[t.type][key] || 0;
    const lvl = t.level - 1;
    if (key === 'dmg') return base * (1 + lvl * 0.5);
    if (key === 'rate') return base * (1 + lvl * 0.16);
    if (key === 'range') return base + lvl * 12;
    if (key === 'splash') return base + lvl * 8;
    return base;
  }

  function place(col, row, type) {
    if (!isBuildable(col, row)) return false;
    const def = TOWERS[type];
    if (!def || gold < def.cost) return false;
    gold -= def.cost;
    towers.push({ col, row, x: cx(col), y: cy(row), type, level: 1, cd: 0, invested: def.cost });
    return true;
  }

  function upgradeCost(t) {
    return Math.round(TOWERS[t.type].cost * 0.8 * t.level);
  }

  function upgrade(t) {
    if (!t || t.level >= MAX_LEVEL) return false;
    const cost = upgradeCost(t);
    if (gold < cost) return false;
    gold -= cost;
    t.invested += cost;
    t.level += 1;
    return true;
  }

  function sell(t) {
    const refund = Math.round(t.invested * 0.6);
    gold += refund;
    towers = towers.filter((x) => x !== t);
  }

  function buildQueue(wave) {
    const q = [];
    for (const g of wave.groups) {
      for (let i = 0; i < g.count; i++) {
        q.push({ frame: g.delay + i * g.gap, type: g.type });
      }
    }
    q.sort((a, b) => a.frame - b.frame);
    return q;
  }

  function startWave() {
    if (phase !== 'build' || finished) return;
    const wave = WAVES[waveIndex];
    if (!wave) return;
    queue = buildQueue(wave);
    frame = 0;
    phase = 'wave';
    hint = `Волна ${waveIndex + 1} из ${WAVES.length}`;
    if (onHint) onHint(hint);
  }

  function finishWave() {
    gold += WAVES[waveIndex].reward;
    waveIndex += 1;
    if (waveIndex >= WAVES.length) {
      win();
    } else {
      phase = 'build';
      hint = `Волна пройдена. Готовься к следующей`;
      if (onHint) onHint(hint);
    }
  }

  function resetLevel() {
    towers = [];
    enemies = [];
    shots = [];
    effects = [];
    gold = START_GOLD;
    lives = START_LIVES;
    waveIndex = 0;
    phase = 'build';
    queue = [];
    frame = 0;
    selectedCell = null;
    selectedTower = null;
    hint = 'База пала. Начинаем заново';
    if (onHint) onHint(hint);
  }

  function damage(enemy, amount) {
    const dealt = amount * (1 - enemy.armor);
    enemy.hp -= dealt;
    if (enemy.hp <= 0 && enemy.alive) {
      enemy.alive = false;
      gold += enemy.gold;
      effects.push({ x: enemy.x, y: enemy.y, r: enemy.r, life: 0.35, max: 0.35, color: '#ffdf6b' });
    }
  }

  function pickTarget(t) {
    let best = null;
    let bestDist = -1;
    const range = towerStat(t, 'range');
    for (const e of enemies) {
      if (!e.alive) continue;
      if (Math.hypot(e.x - t.x, e.y - t.y) <= range && e.dist > bestDist) {
        best = e;
        bestDist = e.dist;
      }
    }
    return best;
  }

  function fire(t) {
    const target = pickTarget(t);
    if (!target) return;
    const def = TOWERS[t.type];
    if (t.type === 'frost') {
      damage(target, towerStat(t, 'dmg'));
      target.slowFactor = 1 - def.slow;
      target.slowUntil = time + def.slowDur;
      effects.push({ x: target.x, y: target.y, r: 16, life: 0.25, max: 0.25, color: '#7fe6e0' });
    } else {
      shots.push({
        x: t.x,
        y: t.y,
        target,
        speed: 320,
        dmg: towerStat(t, 'dmg'),
        splash: towerStat(t, 'splash'),
        color: t.type === 'cannon' ? '#c96a4a' : '#7a5cc4',
      });
    }
    t.cd = 1 / towerStat(t, 'rate');
  }

  function step(dt) {
    if (finished) return;
    time += dt;

    if (phase === 'wave') {
      frame += dt * 60;
      while (queue.length && queue[0].frame <= frame) {
        const entry = queue.shift();
        const def = ENEMIES[entry.type];
        const p = posAt(0);
        enemies.push({
          type: entry.type,
          x: p.x,
          y: p.y,
          dist: 0,
          hp: def.hp,
          maxHp: def.hp,
          speed: def.speed,
          armor: def.armor,
          gold: def.gold,
          r: def.r,
          color: def.color,
          boss: !!def.boss,
          alive: true,
          slowFactor: 1,
          slowUntil: 0,
        });
      }
    }

    for (const e of enemies) {
      if (!e.alive) continue;
      const slow = time < e.slowUntil ? e.slowFactor : 1;
      e.dist += e.speed * slow * dt;
      const p = posAt(e.dist);
      e.x = p.x;
      e.y = p.y;
      if (e.dist >= totalLen) {
        e.alive = false;
        e.reached = true;
      }
    }

    for (const e of enemies) {
      if (e.reached) {
        lives -= e.boss ? 3 : 1;
        effects.push({ x: e.x, y: e.y, r: 22, life: 0.4, max: 0.4, color: '#ff5f8d' });
      }
    }
    enemies = enemies.filter((e) => e.alive);
    if (lives <= 0) {
      resetLevel();
      return;
    }

    for (const t of towers) {
      t.cd -= dt;
      if (t.cd <= 0) fire(t);
    }

    for (const s of shots) {
      const tx = s.target.alive ? s.target.x : s.x;
      const ty = s.target.alive ? s.target.y : s.y;
      const dx = tx - s.x;
      const dy = ty - s.y;
      const d = Math.hypot(dx, dy) || 1;
      const move = s.speed * dt;
      if (d <= Math.max(6, move)) {
        s.x = tx;
        s.y = ty;
        if (s.target.alive) damage(s.target, s.dmg);
        if (s.splash) {
          for (const e of enemies) {
            if (e.alive && Math.hypot(e.x - s.x, e.y - s.y) <= s.splash) damage(e, s.dmg * 0.6);
          }
          effects.push({ x: s.x, y: s.y, r: s.splash, life: 0.25, max: 0.25, color: '#e0a080' });
        }
        s.done = true;
      } else {
        s.x += (dx / d) * move;
        s.y += (dy / d) * move;
      }
    }
    shots = shots.filter((s) => !s.done);

    for (const f of effects) f.life -= dt;
    effects = effects.filter((f) => f.life > 0);

    if (phase === 'wave' && queue.length === 0 && enemies.length === 0) {
      finishWave();
    }
  }

  function win() {
    if (finished) return;
    finished = true;
    phase = 'done';
    setTimeout(() => {
      if (onWin) onWin();
    }, 700);
    setTimeout(() => {
      running = false;
      if (raf) cancelAnimationFrame(raf);
    }, 800);
  }

  function loop(t) {
    if (!running) return;
    if (!last) last = t;
    const dt = Math.min(0.05, (t - last) / 1000);
    last = t;
    acc += dt * speed;
    while (acc >= 1 / 60) {
      step(1 / 60);
      acc -= 1 / 60;
    }
    render();
    raf = requestAnimationFrame(loop);
  }

  function setScale() {
    const rect = canvas.getBoundingClientRect();
    const cssW = rect.width || VIEW.w;
    canvas.width = Math.round(cssW * 2);
    canvas.height = Math.round(cssW * 2 * (VIEW.h / VIEW.w));
    scale = canvas.width / VIEW.w;
  }

  function roundRect(x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  function button(x, y, w, h, label, action, opts = {}) {
    hotspots.push({ x, y, w, h, action });
    roundRect(x, y, w, h, 12);
    ctx.fillStyle = opts.bg || 'rgba(255,255,255,0.9)';
    ctx.fill();
    ctx.strokeStyle = opts.border || 'rgba(160,120,190,0.5)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = opts.fg || '#5b3348';
    ctx.font = `${opts.font || 'bold 15px'} 'Nunito', sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x + w / 2, y + h / 2 + 1);
  }

  function drawField() {
    ctx.fillStyle = '#eef7ea';
    ctx.fillRect(0, 0, VIEW.w, VIEW.h);

    ctx.strokeStyle = 'rgba(140, 180, 130, 0.25)';
    ctx.lineWidth = 1;
    for (let c = 0; c <= COLS; c++) {
      ctx.beginPath();
      ctx.moveTo(c * CELL, FIELD_Y);
      ctx.lineTo(c * CELL, FIELD_Y + ROWS * CELL);
      ctx.stroke();
    }
    for (let r = 0; r <= ROWS; r++) {
      ctx.beginPath();
      ctx.moveTo(0, FIELD_Y + r * CELL);
      ctx.lineTo(COLS * CELL, FIELD_Y + r * CELL);
      ctx.stroke();
    }

    ctx.strokeStyle = '#d8c3a5';
    ctx.lineWidth = CELL * 0.72;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(path[0].x, path[0].y);
    for (let i = 1; i < path.length; i++) ctx.lineTo(path[i].x, path[i].y);
    ctx.stroke();

    const base = path[path.length - 1];
    ctx.fillStyle = '#b79bf0';
    roundRect(base.x - 24, base.y - 24, 48, 48, 12);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = "bold 22px 'Nunito', sans-serif";
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('★', base.x, base.y + 1);
  }

  function drawTowers() {
    for (const t of towers) {
      if (selectedTower === t) {
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.beginPath();
        ctx.arc(t.x, t.y, towerStat(t, 'range'), 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(120,90,160,0.5)';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      roundRect(t.x - 18, t.y - 18, 36, 36, 10);
      ctx.fillStyle = TOWERS[t.type].color;
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      roundRect(t.x - 12, t.y - 14, 24, 7, 3.5);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = "bold 12px 'Nunito', sans-serif";
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(t.level), t.x, t.y + 6);
    }
  }

  function drawEnemies() {
    for (const e of enemies) {
      if (!e.alive) continue;
      ctx.fillStyle = e.color;
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2);
      ctx.fill();
      if (e.boss) {
        ctx.strokeStyle = 'rgba(95,69,134,0.7)';
        ctx.lineWidth = 3;
        ctx.stroke();
      }
      if (e.hp < e.maxHp) {
        const w = e.r * 2;
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.fillRect(e.x - e.r, e.y - e.r - 8, w, 4);
        ctx.fillStyle = '#7bd88f';
        ctx.fillRect(e.x - e.r, e.y - e.r - 8, w * (e.hp / e.maxHp), 4);
      }
    }
  }

  function drawShots() {
    for (const s of shots) {
      ctx.fillStyle = s.color;
      ctx.beginPath();
      ctx.arc(s.x, s.y, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const f of effects) {
      ctx.globalAlpha = Math.max(0, f.life / f.max);
      ctx.strokeStyle = f.color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.r * (1.2 - f.life / f.max), 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  function drawTopBar() {
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.fillRect(0, 0, VIEW.w, TOP_H);
    ctx.font = "bold 15px 'Nunito', sans-serif";
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#d63b63';
    ctx.fillText(`♥ ${Math.max(0, lives)}`, 12, TOP_H / 2);
    ctx.fillStyle = '#b8860b';
    ctx.textAlign = 'center';
    ctx.fillText(`⛁ ${gold}`, VIEW.w / 2, TOP_H / 2);
    ctx.fillStyle = '#5b3348';
    ctx.textAlign = 'right';
    ctx.fillText(`Волна ${Math.min(waveIndex + 1, WAVES.length)}/${WAVES.length}`, VIEW.w - 108, TOP_H / 2);
  }

  function drawBottomBar() {
    ctx.fillStyle = 'rgba(255,255,255,0.94)';
    ctx.fillRect(0, BOT_Y, VIEW.w, BOT_H);

    if (selectedTower) {
      const t = selectedTower;
      const cost = upgradeCost(t);
      const canUp = t.level < MAX_LEVEL && gold >= cost;
      button(14, BOT_Y + 14, 210, 40, t.level < MAX_LEVEL ? `Улучшить · ${cost}` : 'Максимум', 'upgrade', {
        bg: canUp ? 'rgba(150,220,170,0.9)' : 'rgba(220,220,220,0.9)',
      });
      button(240, BOT_Y + 14, 120, 40, `Продать +${Math.round(t.invested * 0.6)}`, 'sell', {
        bg: 'rgba(255,220,220,0.9)',
      });
      return;
    }

    if (selectedCell) {
      const types = ['gun', 'frost', 'cannon'];
      const bw = 148;
      const totalW = types.length * bw + (types.length - 1) * 10;
      let x = (VIEW.w - totalW) / 2;
      for (const type of types) {
        const def = TOWERS[type];
        const can = gold >= def.cost;
        button(x, BOT_Y + 14, bw, 40, `${def.name} · ${def.cost}`, `place:${type}`, {
          bg: can ? 'rgba(230,215,255,0.95)' : 'rgba(220,220,220,0.85)',
        });
        x += bw + 10;
      }
      return;
    }

    const hintText = phase === 'wave' ? 'Отбиваем волну…' : 'Тапни клетку и поставь башню';
    ctx.fillStyle = '#8a6478';
    ctx.font = "bold 14px 'Nunito', sans-serif";
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(hintText, 14, BOT_Y + BOT_H / 2);

    if (phase === 'build') {
      button(VIEW.w - 190, BOT_Y + 14, 176, 40, 'Волна ▸', 'startWave', {
        bg: 'rgba(255,157,192,0.95)',
        fg: '#fff',
      });
    }
  }

  function drawSpeedButton() {
    button(VIEW.w - 96, 4, 44, 24, `×${speed}`, 'speed', {
      bg: 'rgba(255,255,255,0.9)',
      font: 'bold 13px',
    });
  }

  function render() {
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.clearRect(0, 0, VIEW.w, VIEW.h);
    hotspots = [];
    drawField();
    drawTowers();
    drawEnemies();
    drawShots();
    drawTopBar();
    drawSpeedButton();
    drawBottomBar();
  }

  function handleTap(x, y) {
    for (let i = hotspots.length - 1; i >= 0; i--) {
      const h = hotspots[i];
      if (x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h) {
        action(h.action);
        return;
      }
    }

    if (y > BOT_Y) return;
    const col = Math.floor(x / CELL);
    const row = Math.floor((y - FIELD_Y) / CELL);
    if (!isBuildable(col, row) && !towers.some((t) => t.col === col && t.row === row)) {
      selectedCell = null;
      selectedTower = null;
      return;
    }
    const existing = towers.find((t) => t.col === col && t.row === row);
    if (existing) {
      selectedTower = existing;
      selectedCell = null;
    } else {
      selectedCell = { col, row };
      selectedTower = null;
    }
  }

  function action(name) {
    if (name === 'startWave') {
      startWave();
    } else if (name === 'speed') {
      speed = speed === 1 ? 2 : speed === 2 ? 3 : 1;
    } else if (name === 'upgrade') {
      upgrade(selectedTower);
    } else if (name === 'sell') {
      sell(selectedTower);
      selectedTower = null;
    } else if (name.startsWith('place:')) {
      const type = name.split(':')[1];
      if (selectedCell && place(selectedCell.col, selectedCell.row, type)) {
        selectedCell = null;
      }
    }
  }

  function onPointerDown(e) {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * VIEW.w;
    const y = ((e.clientY - rect.top) / rect.height) * VIEW.h;
    handleTap(x, y);
  }

  function onResize() {
    setScale();
    render();
  }

  canvas.style.aspectRatio = `${VIEW.w} / ${VIEW.h}`;
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  window.addEventListener('resize', onResize);
  const resizeObserver =
    typeof ResizeObserver !== 'undefined' ? new ResizeObserver(onResize) : null;
  if (resizeObserver) resizeObserver.observe(canvas);

  setScale();
  render();

  return {
    start() {
      if (running) return;
      running = true;
      last = 0;
      acc = 0;
      setScale();
      raf = requestAnimationFrame(loop);
    },
    destroy() {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      canvas.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('resize', onResize);
      if (resizeObserver) resizeObserver.disconnect();
    },
    getState() {
      return {
        lives,
        gold,
        wave: waveIndex + 1,
        totalWaves: WAVES.length,
        phase,
        enemies: enemies.filter((e) => e.alive).length,
        towers: towers.length,
        finished,
      };
    },
    win,
    test: {
      place,
      upgrade,
      upgradeCost,
      sell,
      startWave,
      setSpeed: (n) => { speed = n; },
      towers: () => towers,
      state: () => ({ lives, gold, waveIndex, phase, enemies: enemies.filter((e) => e.alive).length, finished }),
    },
  };
}
