const VIEW = { w: 500, h: 400 };
const TOP_H = 32;
const BOT_H = 68;
const BOT_Y = VIEW.h - BOT_H;
const CELL = 50;
const COLS = 10;
const ROWS = 6;
const FIELD_Y = TOP_H;

const START_GOLD = 90;
const START_LIVES = 4;

const WAYPOINTS = [
  [-1, 2],
  [8, 2],
  [8, 0],
  [1, 0],
  [1, 4],
  [9, 4],
  [9, 2],
];

const TOWERS = {
  gun: { name: 'Стрелок', cost: 20, dmg: 7, range: 118, rate: 1.5, color: '#7a5cc4', accent: '#b79bf0' },
  frost: { name: 'Мороз', cost: 30, dmg: 3, range: 112, rate: 1.1, slow: 0.4, slowDur: 1.4, color: '#3fb8b0', accent: '#a7ecff' },
  cannon: { name: 'Пушка', cost: 45, dmg: 24, range: 138, rate: 0.5, splash: 46, color: '#c96a4a', accent: '#ffcf9e' },
};

const ENEMIES = {
  grunt: { hp: 50, speed: 46, gold: 3, armor: 0, r: 11, color: '#ff8fb0', dark: '#d95f86' },
  runner: { hp: 35, speed: 100, gold: 3, armor: 0, r: 9, color: '#ffcf5e', dark: '#d9a325' },
  tank: { hp: 195, speed: 27, gold: 6, armor: 0.4, r: 14, color: '#9d82c9', dark: '#6f56a0' },
  mini: { hp: 520, speed: 34, gold: 12, armor: 0.28, r: 16, color: '#b79bf0', dark: '#7f5fd0', boss: true },
  boss: { hp: 1800, speed: 27, gold: 20, armor: 0.32, r: 19, color: '#6a4fb0', dark: '#432a7a', boss: true },
};

const WAVES = [
  { hpMul: 1, groups: [{ type: 'grunt', count: 6, gap: 44, delay: 0 }], reward: 12 },
  { hpMul: 1.1, groups: [{ type: 'grunt', count: 9, gap: 34, delay: 0 }, { type: 'runner', count: 6, gap: 26, delay: 200 }], reward: 14 },
  { hpMul: 1.3, groups: [{ type: 'runner', count: 12, gap: 22, delay: 0 }, { type: 'tank', count: 3, gap: 64, delay: 260 }], reward: 16 },
  {
    hpMul: 1.5,
    groups: [
      { type: 'grunt', count: 14, gap: 26, delay: 0 },
      { type: 'runner', count: 10, gap: 20, delay: 240 },
      { type: 'tank', count: 5, gap: 52, delay: 420 },
    ],
    reward: 18,
  },
  {
    hpMul: 1.9,
    groups: [
      { type: 'mini', count: 2, gap: 90, delay: 0 },
      { type: 'grunt', count: 16, gap: 22, delay: 120 },
      { type: 'runner', count: 14, gap: 16, delay: 400 },
    ],
    reward: 22,
  },
  {
    hpMul: 2.0,
    groups: [
      { type: 'boss', count: 1, gap: 0, delay: 0 },
      { type: 'tank', count: 7, gap: 50, delay: 160 },
      { type: 'runner', count: 16, gap: 16, delay: 380 },
      { type: 'grunt', count: 16, gap: 20, delay: 560 },
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

function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
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
  for (let i = 0; i < WAYPOINTS.length - 1; i++) {
    const [c0, r0] = WAYPOINTS[i];
    const [c1, r1] = WAYPOINTS[i + 1];
    if (c0 === c1) {
      for (let r = Math.min(r0, r1); r <= Math.max(r0, r1); r++) pathCells.add(`${c0},${r}`);
    } else if (r0 === r1) {
      for (let c = Math.min(c0, c1); c <= Math.max(c0, c1); c++) pathCells.add(`${c},${r0}`);
    }
  }

  const deco = [];
  {
    const rnd = seeded(98765);
    for (let i = 0; i < 46; i++) {
      const col = Math.floor(rnd() * COLS);
      const row = Math.floor(rnd() * ROWS);
      if (pathCells.has(`${col},${row}`)) continue;
      deco.push({ x: cx(col) + (rnd() - 0.5) * 26, y: cy(row) + (rnd() - 0.5) * 26, r: 3 + rnd() * 4, kind: rnd() < 0.55 ? 'grass' : 'flower', hue: rnd() });
    }
  }

  const base = path[path.length - 1];
  const portal = { x: cx(0), y: cy(2) };

  let towers = [];
  let enemies = [];
  let shots = [];
  let effects = [];
  let floaters = [];
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
  let shake = 0;

  function posAt(d) {
    const clamped = Math.max(0, Math.min(totalLen, d));
    for (const s of segments) {
      if (clamped <= s.start + s.len) {
        const t = s.len ? (clamped - s.start) / s.len : 0;
        return { x: s.a.x + (s.b.x - s.a.x) * t, y: s.a.y + (s.b.y - s.a.y) * t };
      }
    }
    return { x: base.x, y: base.y };
  }

  function isBuildable(col, row) {
    if (col < 0 || row < 0 || col >= COLS || row >= ROWS) return false;
    if (pathCells.has(`${col},${row}`)) return false;
    return !towers.some((t) => t.col === col && t.row === row);
  }

  function towerStat(t, key) {
    const b = TOWERS[t.type][key] || 0;
    const lvl = t.level - 1;
    if (key === 'dmg') return b * (1 + lvl * 0.5);
    if (key === 'rate') return b * (1 + lvl * 0.16);
    if (key === 'range') return b + lvl * 12;
    if (key === 'splash') return b + lvl * 8;
    return b;
  }

  function place(col, row, type) {
    if (!isBuildable(col, row)) return false;
    const def = TOWERS[type];
    if (!def || gold < def.cost) return false;
    gold -= def.cost;
    towers.push({
      col,
      row,
      x: cx(col),
      y: cy(row),
      type,
      level: 1,
      cd: 0,
      aim: -Math.PI / 2,
      recoil: 0,
      invested: def.cost,
    });
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
    gold += Math.round(t.invested * 0.6);
    towers = towers.filter((x) => x !== t);
  }

  function buildQueue(wave) {
    const q = [];
    for (const g of wave.groups) {
      for (let i = 0; i < g.count; i++) q.push({ frame: g.delay + i * g.gap, type: g.type });
    }
    q.sort((a, b) => a.frame - b.frame);
    return q;
  }

  function startWave() {
    if (phase !== 'build' || finished) return;
    if (!WAVES[waveIndex]) return;
    queue = buildQueue(WAVES[waveIndex]);
    frame = 0;
    phase = 'wave';
    announce(`Волна ${waveIndex + 1} из ${WAVES.length}`);
  }

  function announce(text) {
    if (onHint) onHint(text);
  }

  function finishWave() {
    gold += WAVES[waveIndex].reward;
    waveIndex += 1;
    if (waveIndex >= WAVES.length) win();
    else {
      phase = 'build';
      announce('Волна отбита. Готовься к следующей');
    }
  }

  function resetLevel() {
    towers = [];
    enemies = [];
    shots = [];
    effects = [];
    floaters = [];
    gold = START_GOLD;
    lives = START_LIVES;
    waveIndex = 0;
    phase = 'build';
    queue = [];
    frame = 0;
    selectedCell = null;
    selectedTower = null;
    shake = 22;
    announce('База пала. Начинаем заново');
  }

  function burst(x, y, color, n = 8, power = 2.4) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.6;
      effects.push({
        kind: 'spark',
        x,
        y,
        vx: Math.cos(a) * power * (0.5 + Math.random()),
        vy: Math.sin(a) * power * (0.5 + Math.random()),
        life: 0.4,
        max: 0.4,
        color,
      });
    }
  }

  function damage(enemy, amount) {
    enemy.hp -= amount * (1 - enemy.armor);
    enemy.hitFlash = 5;
    if (enemy.hp <= 0 && enemy.alive) {
      enemy.alive = false;
      gold += enemy.gold;
      floaters.push({ x: enemy.x, y: enemy.y - enemy.r - 6, text: `+${enemy.gold}`, life: 0.85, max: 0.85 });
      burst(enemy.x, enemy.y, enemy.dark, enemy.boss ? 16 : 8, enemy.boss ? 3.6 : 2.4);
      effects.push({ kind: 'poof', x: enemy.x, y: enemy.y, r: enemy.r + 4, life: 0.4, max: 0.4, color: enemy.color });
    }
  }

  function aimAt(t, e) {
    t.aim = Math.atan2(e.y - t.y, e.x - t.x);
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

  function fire(t, target) {
    const def = TOWERS[t.type];
    t.recoil = 6;
    aimAt(t, target);
    effects.push({
      kind: 'flash',
      x: t.x + Math.cos(t.aim) * 16,
      y: t.y + Math.sin(t.aim) * 16,
      life: 0.12,
      max: 0.12,
      color: t.type === 'cannon' ? '#ffd08a' : t.type === 'frost' ? '#bff3ff' : '#cdb8ff',
    });
    if (t.type === 'frost') {
      damage(target, towerStat(t, 'dmg'));
      target.slowFactor = 1 - def.slow;
      target.slowUntil = time + def.slowDur;
      effects.push({ kind: 'ring', x: target.x, y: target.y, r: 18, life: 0.3, max: 0.3, color: '#8fe6ff' });
    } else {
      shots.push({
        x: t.x + Math.cos(t.aim) * 14,
        y: t.y + Math.sin(t.aim) * 14,
        target,
        speed: t.type === 'cannon' ? 260 : 340,
        dmg: towerStat(t, 'dmg'),
        splash: towerStat(t, 'splash'),
        cannon: t.type === 'cannon',
        color: t.type === 'cannon' ? '#e08a4a' : '#8a6ad6',
        aim: t.aim,
      });
    }
    t.cd = 1 / towerStat(t, 'rate');
  }

  function step(dt) {
    if (finished) return;
    time += dt;
    if (shake > 0) shake -= dt * 60;

    if (phase === 'wave') {
      frame += dt * 60;
      while (queue.length && queue[0].frame <= frame) {
        const entry = queue.shift();
        const def = ENEMIES[entry.type];
        const mul = (WAVES[waveIndex] && WAVES[waveIndex].hpMul) || 1;
        const p = posAt(0);
        enemies.push({
          type: entry.type,
          x: p.x,
          y: p.y,
          dist: 0,
          hp: def.hp * mul,
          maxHp: def.hp * mul,
          speed: def.speed,
          armor: def.armor,
          gold: def.gold,
          r: def.r,
          color: def.color,
          dark: def.dark,
          boss: !!def.boss,
          alive: true,
          slowFactor: 1,
          slowUntil: 0,
          hitFlash: 0,
          bob: Math.random() * Math.PI * 2,
        });
      }
    }

    for (const e of enemies) {
      if (!e.alive) continue;
      if (e.hitFlash > 0) e.hitFlash -= 1;
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

    let leaked = 0;
    for (const e of enemies) {
      if (!e.reached) continue;
      leaked += e.boss ? 3 : 1;
      effects.push({ kind: 'ring', x: e.x, y: e.y, r: 24, life: 0.4, max: 0.4, color: '#ff5f8d' });
    }
    if (leaked) {
      lives -= leaked;
      shake = Math.min(26, 8 + leaked * 4);
    }
    enemies = enemies.filter((e) => e.alive);
    if (lives <= 0) {
      resetLevel();
      return;
    }

    for (const t of towers) {
      if (t.recoil > 0) t.recoil -= 1;
      t.cd -= dt;
      const target = pickTarget(t);
      if (target) aimAt(t, target);
      if (t.cd <= 0 && target) fire(t, target);
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
          effects.push({ kind: 'ring', x: s.x, y: s.y, r: s.splash, life: 0.28, max: 0.28, color: '#f0a060' });
          burst(s.x, s.y, '#ffcf9e', 6, 2.2);
        }
        s.done = true;
      } else {
        s.x += (dx / d) * move;
        s.y += (dy / d) * move;
      }
    }
    shots = shots.filter((s) => !s.done);

    for (const f of effects) {
      f.life -= dt;
      if (f.kind === 'spark') {
        f.x += f.vx;
        f.y += f.vy;
        f.vy += 0.12;
      }
    }
    effects = effects.filter((f) => f.life > 0);

    for (const f of floaters) {
      f.life -= dt;
      f.y -= dt * 22;
    }
    floaters = floaters.filter((f) => f.life > 0);

    if (phase === 'wave' && queue.length === 0 && enemies.length === 0) finishWave();
  }

  function win() {
    if (finished) return;
    finished = true;
    phase = 'done';
    setTimeout(() => { if (onWin) onWin(); }, 800);
    setTimeout(() => { running = false; if (raf) cancelAnimationFrame(raf); }, 900);
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

  function rr(x, y, w, h, r) {
    const k = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + k, y);
    ctx.arcTo(x + w, y, x + w, y + h, k);
    ctx.arcTo(x + w, y + h, x, y + h, k);
    ctx.arcTo(x, y + h, x, y, k);
    ctx.arcTo(x, y, x + w, y, k);
    ctx.closePath();
  }

  function star(cx0, cy0, outer, inner, n = 5) {
    ctx.beginPath();
    for (let i = 0; i < n * 2; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / n;
      const rad = i % 2 === 0 ? outer : inner;
      const x = cx0 + Math.cos(a) * rad;
      const y = cy0 + Math.sin(a) * rad;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
  }

  function drawField() {
    const g = ctx.createLinearGradient(0, FIELD_Y, 0, BOT_Y);
    g.addColorStop(0, '#eaf6e2');
    g.addColorStop(1, '#dcefd2');
    ctx.fillStyle = g;
    ctx.fillRect(0, FIELD_Y, VIEW.w, ROWS * CELL);

    ctx.strokeStyle = 'rgba(150, 190, 140, 0.22)';
    ctx.lineWidth = 1;
    for (let c = 0; c <= COLS; c++) {
      ctx.beginPath();
      ctx.moveTo(c * CELL, FIELD_Y);
      ctx.lineTo(c * CELL, BOT_Y);
      ctx.stroke();
    }
    for (let r = 0; r <= ROWS; r++) {
      ctx.beginPath();
      ctx.moveTo(0, FIELD_Y + r * CELL);
      ctx.lineTo(COLS * CELL, FIELD_Y + r * CELL);
      ctx.stroke();
    }

    for (const d of deco) {
      if (d.kind === 'grass') {
        ctx.strokeStyle = 'rgba(120, 165, 110, 0.5)';
        ctx.lineWidth = 1.6;
        for (let i = -1; i <= 1; i++) {
          ctx.beginPath();
          ctx.moveTo(d.x + i * 3, d.y + 3);
          ctx.quadraticCurveTo(d.x + i * 5, d.y - d.r, d.x + i * 7, d.y + 3);
          ctx.stroke();
        }
      } else {
        ctx.fillStyle = d.hue < 0.5 ? 'rgba(255,190,215,0.75)' : 'rgba(200,190,255,0.75)';
        ctx.beginPath();
        ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.8)';
        ctx.beginPath();
        ctx.arc(d.x, d.y, d.r * 0.4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  function drawPath() {
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(120, 96, 70, 0.35)';
    ctx.lineWidth = CELL * 0.78;
    ctx.beginPath();
    ctx.moveTo(path[0].x, path[0].y);
    for (let i = 1; i < path.length; i++) ctx.lineTo(path[i].x, path[i].y);
    ctx.stroke();

    ctx.strokeStyle = '#e8d3b4';
    ctx.lineWidth = CELL * 0.7;
    ctx.beginPath();
    ctx.moveTo(path[0].x, path[0].y);
    for (let i = 1; i < path.length; i++) ctx.lineTo(path[i].x, path[i].y);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.lineWidth = 5;
    ctx.setLineDash([10, 14]);
    ctx.beginPath();
    ctx.moveTo(path[0].x, path[0].y);
    for (let i = 1; i < path.length; i++) ctx.lineTo(path[i].x, path[i].y);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  function drawPortal() {
    const pulse = 1 + Math.sin(time * 3) * 0.08;
    ctx.save();
    ctx.translate(portal.x - 6, portal.y);
    ctx.scale(pulse, 1 / pulse);
    ctx.fillStyle = '#6a4fb0';
    ctx.beginPath();
    ctx.ellipse(0, 0, 12, 20, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#b79bf0';
    ctx.beginPath();
    ctx.ellipse(0, 0, 6, 13, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawBase() {
    const hp = Math.max(0, lives) / START_LIVES;
    const w = 46;
    const h = 46;
    const x = base.x - w / 2;
    const y = base.y - h / 2;

    ctx.fillStyle = 'rgba(80, 60, 110, 0.18)';
    ctx.beginPath();
    ctx.ellipse(base.x, base.y + h / 2, w * 0.55, 7, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.shadowColor = 'rgba(120, 90, 190, 0.5)';
    ctx.shadowBlur = 14;
    rr(x, y + 6, w, h - 6, 8);
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, '#c3a8f5');
    g.addColorStop(1, '#7f5fd0');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.restore();

    ctx.fillStyle = '#9d82c9';
    for (let i = 0; i < 4; i++) {
      rr(x + 3 + i * 11, y - 2, 8, 12, 2);
      ctx.fill();
    }

    ctx.fillStyle = 'rgba(60, 40, 100, 0.85)';
    rr(base.x - 8, base.y + 2, 16, 18, 5);
    ctx.fill();

    ctx.fillStyle = '#fff';
    star(base.x, base.y - 6, 7, 3, 5);
    ctx.fill();

    ctx.strokeStyle = '#6a4fb0';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(base.x + 14, y + 4);
    ctx.lineTo(base.x + 14, y - 14);
    ctx.stroke();
    ctx.fillStyle = '#ff7aa8';
    ctx.beginPath();
    ctx.moveTo(base.x + 14, y - 14);
    ctx.lineTo(base.x + 28, y - 9);
    ctx.lineTo(base.x + 14, y - 4);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
    rr(x, BOT_Y - 6, w, 4, 2);
    ctx.fill();
    ctx.fillStyle = hp > 0.5 ? '#7bd88f' : hp > 0.25 ? '#ffcf5e' : '#ff6b6b';
    rr(x, BOT_Y - 6, w * hp, 4, 2);
    ctx.fill();
  }

  function drawSelectedCell() {
    if (!selectedCell) return;
    const x = selectedCell.col * CELL;
    const y = FIELD_Y + selectedCell.row * CELL;
    const pulse = 0.5 + 0.5 * Math.sin(time * 5);
    ctx.save();
    ctx.globalAlpha = 0.5 + pulse * 0.4;
    ctx.strokeStyle = '#7a5cc4';
    ctx.lineWidth = 3;
    rr(x + 3, y + 3, CELL - 6, CELL - 6, 10);
    ctx.stroke();
    ctx.restore();
  }

  function drawTowers() {
    for (const t of towers) {
      const def = TOWERS[t.type];
      if (selectedTower === t) {
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.beginPath();
        ctx.arc(t.x, t.y, towerStat(t, 'range'), 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(120,90,160,0.6)';
        ctx.setLineDash([6, 6]);
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.setLineDash([]);
      }

      ctx.fillStyle = 'rgba(80, 60, 110, 0.2)';
      ctx.beginPath();
      ctx.ellipse(t.x, t.y + 16, 18, 6, 0, 0, Math.PI * 2);
      ctx.fill();

      const recoil = t.recoil > 0 ? 3 : 0;

      if (t.type === 'frost') {
        ctx.save();
        ctx.translate(t.x, t.y);
        ctx.rotate(Math.sin(time * 2 + t.x) * 0.12);
        ctx.shadowColor = 'rgba(120, 230, 255, 0.7)';
        ctx.shadowBlur = 12;
        const g = ctx.createLinearGradient(0, -16, 0, 16);
        g.addColorStop(0, '#d6f8ff');
        g.addColorStop(1, def.color);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(0, -17);
        ctx.lineTo(11, 0);
        ctx.lineTo(0, 17);
        ctx.lineTo(-11, 0);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      } else {
        rr(t.x - 16, t.y - 14, 32, 30, 9);
        const g = ctx.createLinearGradient(0, t.y - 14, 0, t.y + 16);
        g.addColorStop(0, def.accent);
        g.addColorStop(1, def.color);
        ctx.fillStyle = g;
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        rr(t.x - 12, t.y - 11, 24, 7, 3.5);
        ctx.fill();

        ctx.save();
        ctx.translate(t.x, t.y - 1);
        ctx.rotate(t.aim);
        ctx.translate(-recoil, 0);
        if (t.type === 'cannon') {
          ctx.fillStyle = '#4a3a5c';
          rr(-3, -6, 20, 12, 5);
          ctx.fill();
          ctx.fillStyle = def.accent;
          rr(13, -4, 5, 8, 2);
          ctx.fill();
        } else {
          ctx.fillStyle = '#4a3a5c';
          rr(0, -2.5, 17, 5, 2.5);
          ctx.fill();
        }
        ctx.beginPath();
        ctx.arc(0, 0, 6, 0, Math.PI * 2);
        ctx.fillStyle = '#5b4a6e';
        ctx.fill();
        ctx.restore();
      }

      for (let i = 0; i < t.level; i++) {
        ctx.beginPath();
        ctx.arc(t.x - 6 + i * 6, t.y + 18, 2.4, 0, Math.PI * 2);
        ctx.fillStyle = '#ffe08a';
        ctx.fill();
      }
    }
  }

  function enemyShadow(e) {
    ctx.fillStyle = 'rgba(80, 60, 110, 0.18)';
    ctx.beginPath();
    ctx.ellipse(e.x, e.y + e.r * 0.85, e.r * 0.95, e.r * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawEnemies() {
    for (const e of enemies) {
      if (!e.alive) continue;
      enemyShadow(e);
      const slow = time < e.slowUntil;
      const flash = e.hitFlash > 0;
      const bob = e.boss ? 0 : Math.sin(time * 6 + e.bob) * 1.2;
      const yy = e.y + bob;

      ctx.save();
      ctx.translate(e.x, yy);

      if (e.type === 'runner') {
        const a = Math.atan2(posAt(e.dist + 6).y - posAt(e.dist - 6).y, posAt(e.dist + 6).x - posAt(e.dist - 6).x);
        ctx.rotate(a);
        ctx.fillStyle = flash ? '#fff' : e.color;
        ctx.beginPath();
        ctx.moveTo(e.r + 3, 0);
        ctx.lineTo(-e.r, -e.r * 0.8);
        ctx.lineTo(-e.r * 0.4, 0);
        ctx.lineTo(-e.r, e.r * 0.8);
        ctx.closePath();
        ctx.fill();
      } else if (e.type === 'tank') {
        rr(-e.r, -e.r, e.r * 2, e.r * 2, 5);
        ctx.fillStyle = flash ? '#fff' : e.color;
        ctx.fill();
        ctx.strokeStyle = e.dark;
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        for (let i = -1; i <= 1; i += 2) {
          ctx.beginPath();
          ctx.arc(i * e.r * 0.5, -e.r * 0.5, 2, 0, Math.PI * 2);
          ctx.arc(i * e.r * 0.5, e.r * 0.5, 2, 0, Math.PI * 2);
          ctx.fill();
        }
      } else {
        ctx.fillStyle = flash ? '#fff' : e.color;
        ctx.beginPath();
        ctx.arc(0, 0, e.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = e.dark;
        ctx.beginPath();
        ctx.arc(0, e.r * 0.2, e.r, Math.PI * 0.15, Math.PI * 0.85);
        ctx.fill();
        if (e.boss) {
          ctx.fillStyle = '#ffe08a';
          star(0, -e.r - 8, 6, 2.6, 5);
          ctx.fill();
        }
        ctx.fillStyle = '#3f2f52';
        const ex = Math.cos(time * 5 + e.bob) * 1.4;
        ctx.beginPath();
        ctx.arc(-e.r * 0.32 + ex, -e.r * 0.15, 1.9, 0, Math.PI * 2);
        ctx.arc(e.r * 0.32 + ex, -e.r * 0.15, 1.9, 0, Math.PI * 2);
        ctx.fill();
      }

      if (slow) {
        ctx.strokeStyle = 'rgba(120, 230, 255, 0.9)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, e.r + 3, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();

      if (e.hp < e.maxHp) {
        const w = e.r * 2.2;
        ctx.fillStyle = 'rgba(0,0,0,0.28)';
        rr(e.x - w / 2, yy - e.r - 10, w, 4, 2);
        ctx.fill();
        ctx.fillStyle = '#7bd88f';
        rr(e.x - w / 2, yy - e.r - 10, w * (e.hp / e.maxHp), 4, 2);
        ctx.fill();
      }
    }
  }

  function drawShots() {
    for (const s of shots) {
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(s.aim || 0);
      ctx.fillStyle = s.color;
      if (s.cannon) {
        ctx.beginPath();
        ctx.arc(0, 0, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255, 200, 120, 0.6)';
        ctx.beginPath();
        ctx.arc(-4, 0, 3, 0, Math.PI * 2);
        ctx.fill();
      } else {
        rr(-6, -2, 10, 4, 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(180, 150, 255, 0.5)';
        rr(-11, -1.5, 6, 3, 1.5);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  function drawEffects() {
    for (const f of effects) {
      const k = f.life / f.max;
      ctx.globalAlpha = Math.max(0, k);
      if (f.kind === 'spark') {
        ctx.fillStyle = f.color;
        ctx.beginPath();
        ctx.arc(f.x, f.y, 2.6 * k + 0.6, 0, Math.PI * 2);
        ctx.fill();
      } else if (f.kind === 'flash') {
        ctx.fillStyle = f.color;
        ctx.beginPath();
        ctx.arc(f.x, f.y, 6 * k + 2, 0, Math.PI * 2);
        ctx.fill();
      } else if (f.kind === 'ring' || f.kind === 'poof') {
        ctx.strokeStyle = f.color;
        ctx.lineWidth = f.kind === 'poof' ? 3 : 2.5;
        ctx.beginPath();
        ctx.arc(f.x, f.y, f.r * (1.3 - k), 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }

  function drawFloaters() {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = "bold 13px 'Nunito', sans-serif";
    for (const f of floaters) {
      const k = f.life / f.max;
      ctx.globalAlpha = Math.min(1, k * 1.7);
      ctx.fillStyle = '#b8860b';
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;
  }

  function heartbeat(x, y, color, filled) {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = filled;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, 5);
    ctx.bezierCurveTo(7, -2, 4, -9, 0, -4);
    ctx.bezierCurveTo(-4, -9, -7, -2, 0, 5);
    ctx.closePath();
    if (filled) ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  function button(x, y, w, h, label, action, opts = {}) {
    hotspots.push({ x, y, w, h, action });
    rr(x, y, w, h, 12);
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, opts.bgTop || 'rgba(255,255,255,0.95)');
    g.addColorStop(1, opts.bg || 'rgba(240,235,250,0.95)');
    ctx.fillStyle = g;
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

  function drawTopBar() {
    const g = ctx.createLinearGradient(0, 0, 0, TOP_H);
    g.addColorStop(0, 'rgba(255,255,255,0.98)');
    g.addColorStop(1, 'rgba(245,238,252,0.96)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, VIEW.w, TOP_H);
    ctx.fillStyle = 'rgba(160,120,190,0.25)';
    ctx.fillRect(0, TOP_H - 1.5, VIEW.w, 1.5);

    heartbeat(16, TOP_H / 2, '#d63b63', 'rgba(255,120,160,0.9)');
    ctx.fillStyle = '#d63b63';
    ctx.font = "bold 15px 'Nunito', sans-serif";
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(Math.max(0, lives)), 28, TOP_H / 2 + 1);

    ctx.fillStyle = '#e0a53a';
    ctx.beginPath();
    ctx.arc(VIEW.w / 2 - 22, TOP_H / 2, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff7dc';
    ctx.beginPath();
    ctx.arc(VIEW.w / 2 - 22, TOP_H / 2, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#b8860b';
    ctx.font = "bold 15px 'Nunito', sans-serif";
    ctx.textAlign = 'left';
    ctx.fillText(String(gold), VIEW.w / 2 - 10, TOP_H / 2 + 1);

    ctx.fillStyle = '#5b3348';
    ctx.textAlign = 'right';
    ctx.fillText(`Волна ${Math.min(waveIndex + 1, WAVES.length)}/${WAVES.length}`, VIEW.w - 108, TOP_H / 2);
  }

  function drawSpeedButton() {
    button(VIEW.w - 96, 4, 44, 24, `×${speed}`, 'speed', {
      bg: 'rgba(230,220,250,0.95)',
      bgTop: 'rgba(255,255,255,0.95)',
      font: 'bold 13px',
    });
  }

  function drawBottomBar() {
    const g = ctx.createLinearGradient(0, BOT_Y, 0, VIEW.h);
    g.addColorStop(0, 'rgba(245,238,252,0.98)');
    g.addColorStop(1, 'rgba(255,255,255,0.99)');
    ctx.fillStyle = g;
    ctx.fillRect(0, BOT_Y, VIEW.w, BOT_H);
    ctx.fillStyle = 'rgba(160,120,190,0.25)';
    ctx.fillRect(0, BOT_Y, VIEW.w, 1.5);

    if (selectedTower) {
      const t = selectedTower;
      const cost = upgradeCost(t);
      const maxed = t.level >= MAX_LEVEL;
      button(12, BOT_Y + 14, 196, 40, maxed ? `${TOWERS[t.type].name} · макс` : `Улучшить · ${cost}`, 'upgrade', {
        bg: !maxed && gold >= cost ? 'rgba(150,220,170,0.95)' : 'rgba(224,220,230,0.95)',
        bgTop: 'rgba(255,255,255,0.95)',
        fg: '#2f5d3a',
      });
      button(216, BOT_Y + 14, 128, 40, `Продать +${Math.round(t.invested * 0.6)}`, 'sell', {
        bg: 'rgba(255,214,214,0.95)',
        bgTop: 'rgba(255,255,255,0.95)',
        fg: '#a63b3b',
      });
      button(352, BOT_Y + 14, 136, 40, 'Отмена', 'cancel', {
        bg: 'rgba(232,226,245,0.95)',
        bgTop: 'rgba(255,255,255,0.95)',
      });
      return;
    }

    if (selectedCell) {
      const types = ['gun', 'frost', 'cannon'];
      const bw = 122;
      const gap = 8;
      const totalW = types.length * bw + (types.length - 1) * gap;
      let x = (VIEW.w - totalW - 56) / 2;
      for (const type of types) {
        const def = TOWERS[type];
        const can = gold >= def.cost;
        button(x, BOT_Y + 14, bw, 40, `${def.name} · ${def.cost}`, `place:${type}`, {
          bg: can ? 'rgba(228,214,255,0.95)' : 'rgba(224,220,230,0.9)',
          bgTop: 'rgba(255,255,255,0.95)',
          fg: can ? '#5b3348' : '#9a94a6',
          font: 'bold 14px',
        });
        x += bw + gap;
      }
      button(VIEW.w - 48, BOT_Y + 14, 40, 40, '✕', 'cancel', {
        bg: 'rgba(232,226,245,0.95)',
        bgTop: 'rgba(255,255,255,0.95)',
      });
      return;
    }

    ctx.fillStyle = '#8a6478';
    ctx.font = "bold 14px 'Nunito', sans-serif";
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(phase === 'wave' ? 'Отбиваем волну…' : 'Тапни клетку и поставь башню', 14, BOT_Y + BOT_H / 2);

    if (phase === 'build') {
      button(VIEW.w - 190, BOT_Y + 14, 176, 40, 'Волна ▸', 'startWave', {
        bg: 'rgba(255,157,192,0.98)',
        bgTop: 'rgba(255,190,214,0.98)',
        fg: '#fff',
        border: 'rgba(255,120,170,0.7)',
      });
    }
  }

  function render() {
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.clearRect(0, 0, VIEW.w, VIEW.h);
    hotspots = [];

    const sx = shake > 0 ? (Math.random() - 0.5) * shake * 0.5 : 0;
    const sy = shake > 0 ? (Math.random() - 0.5) * shake * 0.5 : 0;

    ctx.save();
    ctx.translate(sx, sy);

    ctx.fillStyle = '#e7f0e0';
    ctx.fillRect(-10, -10, VIEW.w + 20, VIEW.h + 20);
    drawField();
    drawPath();
    drawSelectedCell();
    drawPortal();
    drawBase();
    drawTowers();
    drawEnemies();
    drawShots();
    drawEffects();
    drawFloaters();

    ctx.restore();

    const vg = ctx.createLinearGradient(0, 0, 0, VIEW.h);
    vg.addColorStop(0, 'rgba(120, 90, 170, 0.06)');
    vg.addColorStop(0.5, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(80, 60, 110, 0.1)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, VIEW.w, VIEW.h);

    drawTopBar();
    drawSpeedButton();
    drawBottomBar();
  }

  function deselect() {
    selectedCell = null;
    selectedTower = null;
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
    const existing = towers.find((t) => t.col === col && t.row === row);
    if (existing) {
      if (selectedTower === existing) deselect();
      else {
        selectedTower = existing;
        selectedCell = null;
      }
      return;
    }
    if (isBuildable(col, row)) {
      if (selectedCell && selectedCell.col === col && selectedCell.row === row) deselect();
      else {
        selectedCell = { col, row };
        selectedTower = null;
      }
      return;
    }
    deselect();
  }

  function action(name) {
    if (name === 'startWave') startWave();
    else if (name === 'speed') speed = speed === 1 ? 2 : speed === 2 ? 3 : 1;
    else if (name === 'cancel') deselect();
    else if (name === 'upgrade') {
      upgrade(selectedTower);
    } else if (name === 'sell') {
      sell(selectedTower);
      selectedTower = null;
    } else if (name.startsWith('place:')) {
      const type = name.split(':')[1];
      if (selectedCell && place(selectedCell.col, selectedCell.row, type)) deselect();
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
  const resizeObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(onResize) : null;
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
      deselect,
      state: () => ({ lives, gold, waveIndex, phase, enemies: enemies.filter((e) => e.alive).length, finished }),
    },
  };
}
