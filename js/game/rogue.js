import { spriteCanvas } from './sprites.js';

const VIEW = { w: 360, h: 480 };
const MM = { x: VIEW.w - 98, y: 8, w: 88, h: 58 };
const RX0 = 14;
const RX1 = 346;
const RY0 = 70;
const RY1 = 440;
const DOOR = 56;
const INSET = 12;
const FLOORS = 3;
const CX = (RX0 + RX1) / 2;
const CY = (RY0 + RY1) / 2;
const OPP = { n: 's', s: 'n', w: 'e', e: 'w' };
const DIRV = { n: [0, -1], s: [0, 1], w: [-1, 0], e: [1, 0] };

function doorPos(d) {
  if (d === 'n') return { x: CX, y: RY0 };
  if (d === 's') return { x: CX, y: RY1 };
  if (d === 'w') return { x: RX0, y: CY };
  return { x: RX1, y: CY };
}

function lcg(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const ITEMS = [
  { id: 'rock', name: 'Острый камень', desc: 'Урон +35%', glyph: '◆', col: '#ff7ab8', tags: [], apply: (s) => { s.dmg *= 1.35; } },
  { id: 'boots', name: 'Ветряные сапоги', desc: 'Скорость +25%', glyph: '➜', col: '#6fe3ff', tags: ['speed'], apply: (s) => { s.speed *= 1.25; } },
  { id: 'heart', name: 'Кристалл жизни', desc: '+1 сердце', glyph: '♥', col: '#ff5f8d', tags: [], apply: (s) => { s.maxHp += 2; } },
  { id: 'rapid', name: 'Пружина', desc: 'Стрельба быстрее на 40%', glyph: '✸', col: '#ffd36b', tags: [], apply: (s) => { s.rate *= 1.4; } },
  { id: 'ember', name: 'Уголёк', desc: 'Враги горят', glyph: '✦', col: '#ff9a4a', tags: ['fire'], apply: (s) => { s.burn = true; } },
  { id: 'frost', name: 'Ледяная капля', desc: 'Замедляет врагов', glyph: '❄', col: '#8fe6ff', tags: ['ice'], apply: (s) => { s.freeze = true; } },
  { id: 'orbit', name: 'Звёздная пыль', desc: 'Осколки кружатся рядом', glyph: '◎', col: '#c9a8ff', tags: ['orbit'], apply: (s) => { s.orbit += 1; } },
  { id: 'spear', name: 'Копьё', desc: 'Слёзы пробивают врага', glyph: '➹', col: '#b79bf0', tags: ['pierce'], apply: (s) => { s.pierce += 1; } },
  { id: 'magnet', name: 'Магнит', desc: 'Слёзы летят к врагам', glyph: '⟲', col: '#a0f0c8', tags: ['homing'], apply: (s) => { s.homing += 0.12; } },
  { id: 'wings', name: 'Крылья', desc: 'Рывок дальше', glyph: '⚑', col: '#7ec8ff', tags: ['speed'], apply: (s) => { s.dashDist *= 1.4; } },
  { id: 'shield', name: 'Ракушка', desc: '+1 щит в каждой комнате', glyph: '⛨', col: '#ffb3d9', tags: [], apply: (s) => { s.shieldMax += 1; } },
  { id: 'range', name: 'Линза', desc: 'Дальность +30%', glyph: '◉', col: '#fff0a0', tags: [], apply: (s) => { s.range *= 1.3; } },
];

const SYNERGIES = [
  {
    name: 'Туман',
    when: (s) => s.fire > 0 && s.ice > 0,
    apply: (s) => { s.mistDmg = 16; s.mistR = 46; },
  },
  {
    name: 'Орбиты',
    when: (s) => s.orbit >= 2,
    apply: (s) => { s.orbit += 2; s.orbitMul = 1.8; },
  },
  {
    name: 'Рывок-таран',
    when: (s) => s.speedTags >= 2,
    apply: (s) => { s.ramDmg = 12; },
  },
  {
    name: 'Рикошет',
    when: (s) => s.pierce >= 1 && s.homing > 0,
    apply: (s) => { s.pierce += 1; s.homing *= 1.6; },
  },
  {
    name: 'Пожар',
    when: (s) => s.fire >= 3,
    apply: (s) => { s.burnMul = 2; s.spreadFire = true; },
  },
];

function computeStats(items) {
  const s = {
    dmg: 10, rate: 2.0, range: 150, speed: 88, maxHp: 6, shotSpd: 240,
    pierce: 0, homing: 0, orbit: 0, orbitMul: 1, dashDist: 96, dashCd: 1.4,
    shieldMax: 0, burn: false, freeze: false, fire: 0, ice: 0, speedTags: 0,
    burnMul: 1, spreadFire: false, mistDmg: 0, mistR: 0, ramDmg: 0,
  };
  for (const it of items) {
    it.apply(s);
    for (const t of it.tags) {
      if (t === 'fire') s.fire += 1;
      if (t === 'ice') s.ice += 1;
      if (t === 'speed') s.speedTags += 1;
    }
  }
  s.burn = s.fire > 0;
  s.freeze = s.ice > 0;
  s.active = [];
  for (const syn of SYNERGIES) {
    if (syn.when(s)) {
      syn.apply(s);
      s.active.push(syn.name);
    }
  }
  return s;
}

const ENEMY = {
  blob: { r: 12, hp: 14, speed: 50, col: '#ff8fb0', dark: '#d95f86' },
  spitter: { r: 12, hp: 11, speed: 28, col: '#8fe0a8', dark: '#58b07a' },
  charger: { r: 14, hp: 20, speed: 22, col: '#ffcf5e', dark: '#d9a325' },
};

const spriteCache = {};
function glowSprite(color) {
  if (spriteCache[color]) return spriteCache[color];
  const c = document.createElement('canvas');
  c.width = 32;
  c.height = 32;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0, '#ffffff');
  grad.addColorStop(0.35, color);
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 32, 32);
  spriteCache[color] = c;
  return c;
}

const GRID = 7;

function genFloor(floor, rnd) {
  const key = (x, y) => `${x},${y}`;
  const cells = new Map();
  const list = [];
  const start = { x: 3, y: 3 };
  const add = (x, y) => {
    cells.set(key(x, y), list.length);
    list.push({ x, y });
  };
  add(start.x, start.y);
  const dirs = Object.keys(DIRV);
  const edges = [];
  const edgeSet = new Set();
  const edgeKey = (a, b) => [a, b].sort().join('|');
  const target = 9 + Math.floor(rnd() * 4);
  let guard = 0;
  // случайное дерево: ветвится и уходит в тупики
  while (list.length < target && guard < 2000) {
    guard += 1;
    const from = list[Math.floor(rnd() * list.length)];
    const d = dirs[Math.floor(rnd() * dirs.length)];
    const nx = from.x + DIRV[d][0];
    const ny = from.y + DIRV[d][1];
    if (nx < 0 || ny < 0 || nx >= GRID || ny >= GRID || cells.has(key(nx, ny))) continue;
    const a = key(from.x, from.y);
    const b = key(nx, ny);
    add(nx, ny);
    edges.push([a, b]);
    edgeSet.add(edgeKey(a, b));
  }
  // дополнительные проходы создают петли и обходные пути
  for (const c of list) {
    for (const d of dirs) {
      const nx = c.x + DIRV[d][0];
      const ny = c.y + DIRV[d][1];
      if (!cells.has(key(nx, ny))) continue;
      const a = key(c.x, c.y);
      const b = key(nx, ny);
      if (edgeSet.has(edgeKey(a, b)) || rnd() > 0.2) continue;
      edgeSet.add(edgeKey(a, b));
      edges.push([a, b]);
    }
  }
  // босс - комната дальше всего от старта по пути через двери
  const adj = new Map(list.map((c) => [key(c.x, c.y), []]));
  for (const [a, b] of edges) {
    adj.get(a).push(b);
    adj.get(b).push(a);
  }
  const startKey = key(start.x, start.y);
  const dist = new Map([[startKey, 0]]);
  const queue = [startKey];
  for (let qi = 0; qi < queue.length; qi++) {
    const cur = queue[qi];
    for (const nb of adj.get(cur)) {
      if (dist.has(nb)) continue;
      dist.set(nb, dist.get(cur) + 1);
      queue.push(nb);
    }
  }
  let far = 0;
  list.forEach((c, i) => {
    if (dist.get(key(c.x, c.y)) >= dist.get(key(list[far].x, list[far].y))) far = i;
  });
  // золотая комната: одна на этаж, не старт и не босс
  const goldPool = list.map((_, i) => i).filter((i) => i !== 0 && i !== far && dist.get(key(list[i].x, list[i].y)) >= 2);
  const fallbackPool = list.map((_, i) => i).filter((i) => i !== 0 && i !== far);
  const pool = goldPool.length ? goldPool : fallbackPool;
  const goldIdx = pool[Math.floor(rnd() * pool.length)];
  const rooms = list.map((c, i) => {
    const doorTo = (dx, dy) => {
      const o = { x: c.x + dx, y: c.y + dy };
      return edgeSet.has(edgeKey(key(c.x, c.y), key(o.x, o.y)));
    };
    const kind = i === 0 ? 'start' : i === far ? 'boss' : i === goldIdx ? 'gold' : 'normal';
    return {
      x: c.x,
      y: c.y,
      kind,
      doors: { n: doorTo(0, -1), s: doorTo(0, 1), w: doorTo(-1, 0), e: doorTo(1, 0) },
      cleared: kind === 'start',
      spawned: kind === 'start',
      enemies: [],
      obstacles: makeObstacles(rnd, floor),
      cache: null,
      index: i,
      visited: false,
    };
  });
  const byKey = new Map(rooms.map((r) => [key(r.x, r.y), r]));
  return { rooms, byKey, startIdx: 0 };
}

function makeObstacles(rnd, floor) {
  const out = [];
  const n = 1 + Math.floor(rnd() * 3) + (floor > 1 ? 1 : 0);
  for (let i = 0; i < n; i++) {
    for (let t = 0; t < 12; t++) {
      const w = 26 + rnd() * 26;
      const h = 26 + rnd() * 26;
      const x = RX0 + 40 + rnd() * (RX1 - RX0 - 80 - w);
      const y = RY0 + 40 + rnd() * (RY1 - RY0 - 80 - h);
      const cxo = x + w / 2;
      const cyo = y + h / 2;
      if (Math.hypot(cxo - CX, cyo - CY) < 70) continue;
      if (out.some((o) => x < o.x + o.w + 10 && x + w > o.x - 10 && y < o.y + o.h + 10 && y + h > o.y - 10)) continue;
      out.push({ x, y, w, h });
      break;
    }
  }
  return out;
}

function rrG(g, x, y, w, h, r) {
  const k = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + k, y);
  g.arcTo(x + w, y, x + w, y + h, k);
  g.arcTo(x + w, y + h, x, y + h, k);
  g.arcTo(x, y + h, x, y, k);
  g.arcTo(x, y, x + w, y, k);
  g.closePath();
}

function roomCache(room) {
  if (room.cache) return room.cache;
  const c = document.createElement('canvas');
  c.width = VIEW.w;
  c.height = VIEW.h;
  const g = c.getContext('2d');
  const gold = room.kind === 'gold';
  const boss = room.kind === 'boss';
  const grad = g.createLinearGradient(0, RY0, 0, RY1);
  if (gold) {
    grad.addColorStop(0, '#fff7d6');
    grad.addColorStop(1, '#ffd45c');
  } else if (boss) {
    grad.addColorStop(0, '#ffe0e8');
    grad.addColorStop(1, '#f5a9c0');
  } else {
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(1, '#e4d4ff');
  }
  g.fillStyle = grad;
  g.fillRect(RX0, RY0, RX1 - RX0, RY1 - RY0);
  // плиты пола в шахматном порядке
  g.fillStyle = gold ? 'rgba(190,120,10,0.18)' : boss ? 'rgba(160,40,90,0.14)' : 'rgba(110,80,170,0.14)';
  for (let x = RX0; x < RX1; x += 28) {
    for (let y = RY0; y < RY1; y += 28) {
      if ((((x - RX0) / 28) + ((y - RY0) / 28)) % 2 === 0) g.fillRect(x, y, 28, 28);
    }
  }
  // блики-искры
  g.fillStyle = gold ? '#ffffff' : 'rgba(255,255,255,0.9)';
  for (let x = RX0 + 20; x < RX1; x += 44) {
    for (let y = RY0 + 20; y < RY1; y += 44) {
      const j = ((x * 13 + y * 7) % 11) - 5;
      g.beginPath();
      g.arc(x + j, y - j, gold ? 2.2 : 1.4, 0, Math.PI * 2);
      g.fill();
    }
  }
  // стены: кирпичная кладка
  const wallCol = gold ? '#a8741a' : boss ? '#7a2a4a' : '#4e3380';
  const wallHi = gold ? '#ffe08a' : boss ? '#ff9ec0' : '#a68ae0';
  const walls = [
    [0, RY0 - 14, VIEW.w, 14],
    [0, RY1, VIEW.w, 14],
    [RX0 - 14, RY0, 14, RY1 - RY0],
    [RX1, RY0, 14, RY1 - RY0],
  ];
  for (const [x, y, w, h] of walls) {
    g.fillStyle = wallCol;
    g.fillRect(x, y, w, h);
  }
  g.fillStyle = wallHi;
  g.fillRect(RX0, RY0 - 2, RX1 - RX0, 2);
  g.fillRect(RX0, RY1, RX1 - RX0, 2);
  g.fillRect(RX0, RY0, 2, RY1 - RY0);
  g.fillRect(RX1 - 2, RY0, 2, RY1 - RY0);
  g.strokeStyle = 'rgba(0,0,0,0.25)';
  g.lineWidth = 1;
  g.beginPath();
  for (let y = 0; y < 14; y += 7) {
    for (let x = -7; x < VIEW.w; x += 14) {
      const xx = x + (y ? 7 : 0);
      g.moveTo(xx, RY0 - 14 + y);
      g.lineTo(xx, RY0 - 14 + y + 7);
    }
  }
  g.stroke();
  // препятствия: каменные блоки с объёмом
  for (const o of room.obstacles) {
    g.fillStyle = 'rgba(40,20,70,0.35)';
    g.beginPath();
    g.ellipse(o.x + o.w / 2, o.y + o.h + 3, o.w * 0.55, 5, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = gold ? '#c48a2a' : '#8f7bbf';
    rrG(g, o.x, o.y, o.w, o.h, 6);
    g.fillStyle = gold ? '#ffe39a' : '#cdbcf5';
    rrG(g, o.x, o.y, o.w, 7, 6);
    g.strokeStyle = gold ? '#6b4308' : '#3e2a66';
    g.lineWidth = 2;
    rrG(g, o.x, o.y, o.w, o.h, 6);
    g.stroke();
  }
  room.cache = c;
  return c;
}

export function createRogue(canvas, { onHint, onWin, tutorial = true } = {}) {
  const ctx = canvas.getContext('2d');
  let W = VIEW.w;
  let H = VIEW.h;
  let scale = 1;
  let offX = 0;
  let offY = 0;
  let running = false;
  let finished = false;
  let raf = null;
  let last = 0;
  let acc = 0;
  let stepN = 0;
  let run = null;
  let joy = null;
  const keys = {};

  function setScale() {
    const rect = canvas.getBoundingClientRect();
    const cssW = rect.width || VIEW.w;
    const cssH = rect.height || (cssW * VIEW.h) / VIEW.w;
    canvas.width = Math.round(cssW * 2);
    canvas.height = Math.round(cssH * 2);
    W = canvas.width;
    H = canvas.height;
    scale = Math.min(canvas.width / VIEW.w, canvas.height / VIEW.h);
    offX = (canvas.width - VIEW.w * scale) / 2;
    offY = (canvas.height - VIEW.h * scale) / 2;
  }

  function newRun(withTutorial) {
    const rnd = lcg((Date.now() ^ (stepN * 7919)) >>> 0);
    const floor = withTutorial ? 0 : 1;
    const map = withTutorial ? makeTutorialMap() : genFloor(1, rnd);
    run = {
      rnd,
      floor,
      map,
      room: null,
      items: [],
      stats: computeStats([]),
      hp: 6,
      shield: 0,
      invuln: 0,
      dash: { t: 0, cd: 0, dx: 0, dy: 1, rammed: new Set() },
      dashUsed: false,
      moveAcc: 0,
      player: { x: CX, y: RY1 - 60, fx: 0, fy: -1 },
      fireT: 0,
      tears: [],
      bullets: [],
      enemies: [],
      particles: [],
      floaters: [],
      state: 'play',
      stateT: 0,
      pickOpts: [],
      pickNext: false,
      tut: withTutorial ? 0 : -1,
      seenSyn: new Set(),
      shake: 0,
      dummy: null,
      lockT: 0,
      showMap: false,
    };
      enterRoom(map.rooms[map.startIdx], null);
    if (withTutorial) {
      run.player.x = CX;
      run.player.y = RY1 - 70;
      if (onHint) onHint('Обучение: следуй подсказкам вверху');
    }
  }

  function makeTutorialMap() {
    const room = { x: 0, y: 0, kind: 'tut', doors: { n: false, s: true, w: false, e: false }, cleared: false, spawned: false, enemies: [], obstacles: [], cache: null, index: 0 };
    return { rooms: [room], byKey: new Map([['0,0', room]]), startIdx: 0 };
  }

  function nextFloor() {
    run.floor += 1;
    run.tut = -1;
    run.map = genFloor(run.floor, run.rnd);
    enterRoom(run.map.rooms[run.map.startIdx], null);
    if (onHint) onHint(`Этаж ${run.floor}`);
  }

  function enterRoom(room, enteredFrom) {
    run.room = room;
    room.visited = true;
    run.bullets = [];
    run.tears = [];
    run.shield = run.stats.shieldMax;
    if (enteredFrom) {
      const p = doorPos(enteredFrom);
      const inward = { n: [0, 44], s: [0, -44], w: [44, 0], e: [-44, 0] }[enteredFrom];
      run.player.x = p.x + inward[0];
      run.player.y = p.y + inward[1];
    }
    if (!room.spawned) {
      spawnEnemies(room, room.kind);
    }
    run.enemies = room.enemies;
  }

  function spawnEnemies(room, kind) {
    room.spawned = true;
    room.enemies = [];
    if (kind === 'start') return;
    if (kind === 'tut') {
      const e = mkEnemy('spitter', CX, RY0 + 80, 0);
      e.dummy = true;
      e.hp = 14;
      e.maxHp = 14;
      e.speed = 0;
      e.shootT = 2.8;
      room.enemies.push(e);
      run.dummy = e;
      return;
    }
    if (kind === 'boss') {
      const hp = [700, 1000, 1300][run.floor - 1] || 1300;
      const q = mkEnemy('queen', CX, RY0 + 120, 0);
      q.hp = hp;
      q.maxHp = hp;
      q.r = 22;
      q.phase = 1;
      q.atk = 0;
      q.spawnT = 6;
      room.enemies.push(q);
      return;
    }
    const rnd = run.rnd;
    const count = 3 + run.floor + Math.floor(rnd() * 2);
    const mul = 1 + 0.25 * (run.floor - 1);
    for (let i = 0; i < count; i++) {
      const roll = rnd();
      const type = roll < 0.5 ? 'blob' : roll < 0.8 ? 'spitter' : 'charger';
      let x = 0;
      let y = 0;
      for (let t = 0; t < 30; t++) {
        x = RX0 + 24 + rnd() * (RX1 - RX0 - 48);
        y = RY0 + 24 + rnd() * (RY1 - RY0 - 48);
        if (Math.hypot(x - run.player.x, y - run.player.y) < 120) continue;
        if (room.obstacles.some((o) => x > o.x - 14 && x < o.x + o.w + 14 && y > o.y - 14 && y < o.y + o.h + 14)) continue;
        break;
      }
      room.enemies.push(mkEnemy(type, x, y, mul));
    }
  }

  function mkEnemy(type, x, y, mul) {
    if (type === 'queen') {
      return { type, x, y, hp: 600, maxHp: 600, r: 22, speed: 26, col: '#b8a0ff', dark: '#6a4fb0', boss: true, flash: 0, burnT: 0, slowT: 0, slowF: 1, orbCd: 0, shootT: 2, dead: false, contactT: 0, dir: 0 };
    }
    const d = ENEMY[type];
    const m = mul || 1;
    return {
      type, x, y, hp: d.hp * m, maxHp: d.hp * m, r: d.r, speed: d.speed, col: d.col, dark: d.dark,
      boss: false, flash: 0, burnT: 0, slowT: 0, slowF: 1, orbCd: 0, shootT: 1.2 + Math.random(),
      contactT: 0, state: 'walk', timer: 1.5 + Math.random(), dir: 0, dead: false,
    };
  }

  function nearestEnemy(x, y, maxD) {
    let best = null;
    let bd = maxD;
    for (const e of run.enemies) {
      if (e.dead) continue;
      const d = Math.hypot(e.x - x, e.y - y);
      if (d < bd) {
        bd = d;
        best = e;
      }
    }
    return best;
  }

  function hurt(n) {
    if (run.invuln > 0 || run.dash.t > 0) return;
    if (run.shield > 0) {
      run.shield -= 1;
      run.floaters.push({ text: 'Щит!', x: run.player.x, y: run.player.y - 22, col: '#ffd0ea', life: 0.8 });
      run.invuln = 0.5;
      return;
    }
    run.hp -= n;
    run.invuln = 0.9;
    run.shake = 10;
    spawnBurst(run.player.x, run.player.y, '#ff5f8d', 8);
    if (run.hp <= 0) {
      run.hp = 0;
      run.state = 'dead';
      run.stateT = 2.6;
    }
  }

  function spawnBurst(x, y, col, n) {
    for (let i = 0; i < n && run.particles.length < 70; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = 40 + Math.random() * 90;
      run.particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.45, max: 0.45, col });
    }
  }

  function dash() {
    if (run.state !== 'play' || run.dash.cd > 0 || run.dash.t > 0) return;
    const mv = moveVec();
    let dx = mv.x;
    let dy = mv.y;
    if (dx === 0 && dy === 0) {
      dx = run.player.fx;
      dy = run.player.fy;
    }
    const len = Math.hypot(dx, dy) || 1;
    run.dash = { t: 0.22, cd: run.stats.dashCd, dx: dx / len, dy: dy / len, rammed: new Set() };
    run.dashUsed = true;
  }

  function moveVec() {
    let x = 0;
    let y = 0;
    if (joy) {
      const dx = joy.x - joy.ox;
      const dy = joy.y - joy.oy;
      const len = Math.hypot(dx, dy);
      if (len > 6) {
        const k = Math.min(1, len / 40);
        x = (dx / len) * k;
        y = (dy / len) * k;
      }
    }
    if (keys.left) x -= 1;
    if (keys.right) x += 1;
    if (keys.up) y -= 1;
    if (keys.down) y += 1;
    const l = Math.hypot(x, y);
    if (l > 1) {
      x /= l;
      y /= l;
    }
    return { x, y };
  }

  function rectHit(px, py, r, o) {
    return px + r > o.x && px - r < o.x + o.w && py + r > o.y && py - r < o.y + o.h;
  }

  function pushOut(e, r, o) {
    const cx2 = Math.max(o.x, Math.min(e.x, o.x + o.w));
    const cy2 = Math.max(o.y, Math.min(e.y, o.y + o.h));
    let dx = e.x - cx2;
    let dy = e.y - cy2;
    const d = Math.hypot(dx, dy);
    if (d >= r) return;
    if (d < 0.001) {
      dx = 0;
      dy = -1;
    } else {
      dx /= d;
      dy /= d;
    }
    e.x = cx2 + dx * r;
    e.y = cy2 + dy * r;
  }

  function clampPlayer() {
    const p = run.player;
    const room = run.room;
    const lim = INSET + 4;
    p.x = Math.max(RX0 + lim, Math.min(RX1 - lim, p.x));
    p.y = Math.max(RY0 + lim, Math.min(RY1 - lim, p.y));
    for (const o of room.obstacles) pushOut(p, 12, o);
  }

  function doorOpen(room, d) {
    return room.doors[d] && room.cleared;
  }

  function doorHit(d, p) {
    if (d === 'n') return p.y <= RY0 + 16 && Math.abs(p.x - CX) < DOOR / 2;
    if (d === 's') return p.y >= RY1 - 16 && Math.abs(p.x - CX) < DOOR / 2;
    if (d === 'w') return p.x <= RX0 + 16 && Math.abs(p.y - CY) < DOOR / 2;
    return p.x >= RX1 - 16 && Math.abs(p.y - CY) < DOOR / 2;
  }

  function checkDoors() {
    const room = run.room;
    const p = run.player;
    for (const d of ['n', 's', 'w', 'e']) {
      if (!room.doors[d] || !doorHit(d, p)) continue;
      if (!room.cleared) {
        if (run.lockT <= 0) {
          run.lockT = 1.5;
          run.floaters.push({ text: 'Дверь заперта: победи врагов', x: VIEW.w / 2, y: 110, col: '#ffffff', life: 1.5 });
        }
        return;
      }
      if (room.kind === 'tut') {
        if (run.tut === 4) nextFloor();
        return;
      }
      const next = run.map.byKey.get(`${room.x + DIRV[d][0]},${room.y + DIRV[d][1]}`);
      if (!next) return;
      enterRoom(next, OPP[d]);
      return;
    }
  }

  function openPick(nextF, count = 3) {
    const owned = new Set(run.items.map((i) => i.id));
    const pool = ITEMS.filter((i) => !owned.has(i.id));
    const pick = [];
    const src = pool.length >= count ? pool : ITEMS;
    const copy = src.slice();
    while (pick.length < count && copy.length) {
      const k = Math.floor(run.rnd() * copy.length);
      pick.push(copy.splice(k, 1)[0]);
    }
    run.pickOpts = pick;
    run.pickNext = nextF;
    run.pickTitle = count === 2 ? 'Золотая комната: выбери один предмет' : 'Выбери предмет';
    run.state = 'pick';
    if (run.tut >= 0) run.tut = 3;
  }

  function choose(i) {
    const it = run.pickOpts[i];
    if (!it || run.state !== 'pick') return;
    run.items.push(it);
    if (it.id === 'heart') run.hp = Math.min(run.stats.maxHp + 2, run.hp + 2);
    run.stats = computeStats(run.items);
    run.hp = Math.min(run.hp, run.stats.maxHp);
    for (const name of run.stats.active) {
      if (!run.seenSyn.has(name)) {
        run.seenSyn.add(name);
        run.floaters.push({ text: `СИНЕРГИЯ: ${name}`, x: VIEW.w / 2, y: 110, col: '#fff3b0', life: 1.8 });
      }
    }
    run.floaters.push({ text: it.name, x: VIEW.w / 2, y: 96, col: it.col, life: 1.2 });
    run.state = 'play';
    if (run.tut === 3) run.tut = 4;
    if (run.pickNext) nextFloor();
  }

  function killEnemy(e) {
    e.dead = true;
    spawnBurst(e.x, e.y, e.dark, e.boss ? 22 : 8);
    if (run.stats.spreadFire && e.burnT > 0) {
      const other = nearestEnemy(e.x, e.y, 80);
      if (other && other !== e) other.burnT = 2.5;
    }
  }

  function hitEnemy(e, dmg) {
    if (e.dead) return;
    e.hp -= dmg;
    e.flash = 0.08;
    if (run.stats.burn) e.burnT = Math.max(e.burnT, 2.2);
    if (run.stats.freeze) {
      e.slowT = 1.3;
      e.slowF = 0.45;
    }
    if (run.stats.mistDmg && e.burnT > 0 && e.slowT > 0) {
      for (const o of run.enemies) {
        if (o.dead || o === e) continue;
        if (Math.hypot(o.x - e.x, o.y - e.y) < run.stats.mistR) {
          o.hp -= run.stats.mistDmg;
          o.flash = 0.1;
        }
      }
      spawnBurst(e.x, e.y, '#dfe9ff', 12);
    }
    if (e.hp <= 0 && !e.dead) killEnemy(e);
  }

  function fireTears(dt) {
    run.fireT -= dt;
    if (run.fireT > 0) return;
    const p = run.player;
    const target = nearestEnemy(p.x, p.y, run.stats.range);
    if (!target) return;
    run.fireT = 1 / run.stats.rate;
    const dx = target.x - p.x;
    const dy = target.y - p.y;
    const d = Math.hypot(dx, dy) || 1;
    p.fx = dx / d;
    p.fy = dy / d;
    run.tears.push({
      x: p.x + p.fx * 14, y: p.y + p.fy * 14, vx: p.fx * run.stats.shotSpd, vy: p.fy * run.stats.shotSpd,
      life: 1.4, dmg: run.stats.dmg, pierce: run.stats.pierce, hit: new Set(),
    });
  }

  function updateTears(dt) {
    const s = run.stats;
    for (const t of run.tears) {
      if (s.homing > 0) {
        const tg = nearestEnemy(t.x, t.y, 130);
        if (tg) {
          const sp = Math.hypot(t.vx, t.vy);
          const dx = tg.x - t.x;
          const dy = tg.y - t.y;
          const d = Math.hypot(dx, dy) || 1;
          t.vx += (dx / d) * sp * s.homing * 60 * dt;
          t.vy += (dy / d) * sp * s.homing * 60 * dt;
          const l2 = Math.hypot(t.vx, t.vy) || 1;
          t.vx = (t.vx / l2) * sp;
          t.vy = (t.vy / l2) * sp;
        }
      }
      t.x += t.vx * dt;
      t.y += t.vy * dt;
      t.life -= dt;
      if (t.life <= 0) {
        t.dead = true;
        continue;
      }
      if (t.x < RX0 || t.x > RX1 || t.y < RY0 || t.y > RY1) {
        t.dead = true;
        continue;
      }
      for (const o of run.room.obstacles) {
        if (rectHit(t.x, t.y, 4, o)) {
          t.dead = true;
          break;
        }
      }
      if (t.dead) continue;
      for (const e of run.enemies) {
        if (e.dead || t.hit.has(e)) continue;
        if (Math.hypot(e.x - t.x, e.y - t.y) < e.r + 4) {
          t.hit.add(e);
          hitEnemy(e, t.dmg);
          if (t.pierce <= 0) {
            t.dead = true;
            break;
          }
          t.pierce -= 1;
        }
      }
    }
    run.tears = run.tears.filter((t) => !t.dead);
  }

  function updateOrbs(dt) {
    const n = run.stats.orbit;
    if (!n) return;
    const dmg = 5 * run.stats.orbitMul;
    const t = perfNow();
    for (let i = 0; i < n; i++) {
      const a = t * 3 + (i / n) * Math.PI * 2;
      const ox = run.player.x + Math.cos(a) * 30;
      const oy = run.player.y + Math.sin(a) * 30;
      for (const e of run.enemies) {
        if (e.dead) continue;
        e.orbCd = Math.max(0, e.orbCd - dt);
        if (e.orbCd > 0) continue;
        if (Math.hypot(e.x - ox, e.y - oy) < e.r + 6) {
          e.orbCd = 0.4;
          hitEnemy(e, dmg);
        }
      }
    }
  }

  function perfNow() {
    return stepN / 60;
  }

  function updateEnemies(dt) {
    const p = run.player;
    for (const e of run.enemies) {
      if (e.dead) continue;
      if (e.flash > 0) e.flash -= dt;
      if (e.burnT > 0) {
        e.burnT -= dt;
        e.hp -= 3 * run.stats.burnMul * dt;
        if (e.hp <= 0) killEnemy(e);
        if (e.dead) continue;
      }
      if (e.slowT > 0) e.slowT -= dt;
      const slow = e.slowT > 0 ? e.slowF : 1;
      const dx = p.x - e.x;
      const dy = p.y - e.y;
      const d = Math.hypot(dx, dy) || 1;
      if (e.type === 'blob') {
        e.x += (dx / d) * e.speed * slow * dt;
        e.y += (dy / d) * e.speed * slow * dt;
      } else if (e.type === 'spitter') {
        if (!e.dummy) {
          const k = d > 150 ? 1 : d < 100 ? -1 : 0;
          e.x += (dx / d) * e.speed * k * slow * dt;
          e.y += (dy / d) * e.speed * k * slow * dt;
        }
        e.shootT -= dt;
        if (e.shootT <= 0) {
          e.shootT = e.dummy ? 2.4 : 2.0;
          const sp = e.dummy ? 90 : 120;
          run.bullets.push({ x: e.x, y: e.y, vx: (dx / d) * sp, vy: (dy / d) * sp, life: 3, r: 5 });
        }
      } else if (e.type === 'charger') {
        e.timer -= dt;
        if (e.state === 'walk') {
          e.x += (dx / d) * e.speed * slow * dt;
          e.y += (dy / d) * e.speed * slow * dt;
          if (e.timer <= 0 && d < 220) {
            e.state = 'wind';
            e.timer = 0.6;
          }
        } else if (e.state === 'wind') {
          if (e.timer <= 0) {
            e.state = 'charge';
            e.timer = 0.55;
            e.dir = Math.atan2(dy, dx);
          }
        } else if (e.state === 'charge') {
          e.x += Math.cos(e.dir) * 240 * dt;
          e.y += Math.sin(e.dir) * 240 * dt;
          if (e.timer <= 0) {
            e.state = 'walk';
            e.timer = 1.6;
          }
        }
      } else if (e.type === 'queen') {
        e.phase = e.hp < e.maxHp * 0.5 ? 2 : 1;
        const sp = e.speed * (e.phase === 2 ? 1.5 : 1);
        if (d > 90) {
          e.x += (dx / d) * sp * dt;
          e.y += (dy / d) * sp * dt;
        }
        e.atk -= dt;
        if (e.atk <= 0) {
          e.atk = e.phase === 2 ? 1.5 : 2.2;
          const n = e.phase === 2 ? 14 : 10;
          const off = Math.random() * 6;
          for (let i = 0; i < n; i++) {
            const a = (i / n) * Math.PI * 2 + off;
            run.bullets.push({ x: e.x, y: e.y, vx: Math.cos(a) * 110, vy: Math.sin(a) * 110, life: 3.2, r: 5 });
          }
        }
        e.spawnT -= dt;
        if (e.spawnT <= 0) {
          e.spawnT = e.phase === 2 ? 5 : 7;
          const alive = run.enemies.filter((z) => !z.dead).length;
          if (alive < 7) {
            run.enemies.push(mkEnemy('blob', e.x + (Math.random() - 0.5) * 60, e.y + 30, 0.7));
          }
        }
      }
      if (e.type !== 'queen' && e.state !== 'charge') {
        for (const o of run.room.obstacles) pushOut(e, e.r, o);
      }
      e.x = Math.max(RX0 + 8, Math.min(RX1 - 8, e.x));
      e.y = Math.max(RY0 + 8, Math.min(RY1 - 8, e.y));
      if (!e.dead && Math.hypot(p.x - e.x, p.y - e.y) < e.r + 10) {
        if (run.dash.t > 0) {
          if (run.stats.ramDmg && !run.dash.rammed.has(e)) {
            run.dash.rammed.add(e);
            hitEnemy(e, run.stats.ramDmg);
          }
        } else {
          hurt(e.boss ? 2 : 1);
        }
      }
    }
    run.room.enemies = run.room.enemies.filter((e) => !e.dead);
    run.enemies = run.room.enemies;
  }

  function updateBullets(dt) {
    const p = run.player;
    for (const b of run.bullets) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      if (b.life <= 0 || b.x < RX0 - 10 || b.x > RX1 + 10 || b.y < RY0 - 10 || b.y > RY1 + 10) {
        b.dead = true;
        continue;
      }
      if (run.room.obstacles.some((o) => rectHit(b.x, b.y, 4, o))) {
        b.dead = true;
        continue;
      }
      if (Math.hypot(p.x - b.x, p.y - b.y) < 12 + b.r) {
        b.dead = true;
        hurt(1);
      }
    }
    run.bullets = run.bullets.filter((b) => !b.dead);
  }

  function updatePlayer(dt) {
    const p = run.player;
    if (run.dash.t > 0) {
      const speed = run.stats.dashDist / 0.22;
      p.x += run.dash.dx * speed * dt;
      p.y += run.dash.dy * speed * dt;
      run.dash.t -= dt;
      run.invuln = Math.max(run.invuln, 0.05);
    } else {
      const mv = moveVec();
      const sp = run.stats.speed;
      p.x += mv.x * sp * dt;
      p.y += mv.y * sp * dt;
      if (mv.x || mv.y) {
        p.fx = mv.x;
        p.fy = mv.y;
        run.moveAcc += Math.hypot(mv.x, mv.y) * sp * dt;
      }
    }
    run.dash.cd = Math.max(0, run.dash.cd - dt);
    run.invuln = Math.max(0, run.invuln - dt);
    clampPlayer();
  }

  function checkRoomClear() {
    const room = run.room;
    if (room.cleared || !room.spawned) return;
    if (room.enemies.some((e) => !e.dead)) return;
    room.cleared = true;
    if (room.kind === 'tut') {
      if (run.tut >= 0) run.tut = 3;
      openPick(false, 3);
    } else if (room.kind === 'gold') {
      // предметы даются только в золотой комнате этажа: два варианта, один на выбор
      openPick(false, 2);
    } else if (room.kind === 'boss') {
      if (run.floor >= FLOORS) finishRun();
      else nextFloor();
    }
  }

  function finishRun() {
    if (finished) return;
    finished = true;
    run.state = 'won';
    setTimeout(() => {
      if (onWin) onWin();
    }, 900);
    setTimeout(() => {
      running = false;
      if (raf) cancelAnimationFrame(raf);
    }, 1000);
  }

  function tutorialTick() {
    if (run.tut === 0 && run.moveAcc > 70) run.tut = 1;
    if (run.tut === 1 && run.dashUsed) run.tut = 2;
    if (run.tut === 2 && run.dummy && run.dummy.dead) run.tut = 3;
  }

  function step(dt) {
    stepN += 1;
    if (!run) return;
    for (const pt of run.particles) {
      pt.life -= dt;
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.vy += 120 * dt;
    }
    run.particles = run.particles.filter((pt) => pt.life > 0);
    for (const f of run.floaters) f.life -= dt;
    run.floaters = run.floaters.filter((f) => f.life > 0);
    if (run.shake > 0) run.shake -= dt * 40;
    run.lockT -= dt;

    if (run.state === 'dead') {
      run.stateT -= dt;
      if (run.stateT <= 0) {
        const tut = false;
        newRun(tut);
        if (onHint) onHint('Новый забег - новые предметы и комнаты');
      }
      return;
    }
    if (run.state === 'pick' || run.state === 'won' || run.showMap) return;

    updatePlayer(dt);
    if (run.tut >= 0) tutorialTick();
    fireTears(dt);
    updateTears(dt);
    updateOrbs(dt);
    updateEnemies(dt);
    updateBullets(dt);
    checkDoors();
    checkRoomClear();
  }

  function frame(ts) {
    if (!running) return;
    raf = requestAnimationFrame(frame);
    if (document.hidden) {
      last = 0;
      return;
    }
    const dt = last ? Math.min(0.033, (ts - last) / 1000) : 1 / 60;
    last = ts;
    acc += dt;
    while (acc >= 1 / 60) {
      step(1 / 60);
      acc -= 1 / 60;
    }
    render();
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

  function drawEntityShadow(x, y, r) {
    ctx.fillStyle = 'rgba(70,40,100,0.18)';
    ctx.beginPath();
    ctx.ellipse(x, y + r * 0.8, r * 0.95, r * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawDoor(room, d) {
    const p = doorPos(d);
    const horiz = d === 'n' || d === 's';
    const w = horiz ? DOOR : 16;
    const h = horiz ? 16 : DOOR;
    const x = p.x - w / 2;
    const y = p.y - h / 2;
    const t = perfNow();
    const open = room.cleared;
    const dest = neighborOf(room, d);
    const icon = dest ? roomIcon(dest.kind) : '';
    // проём в стене
    ctx.fillStyle = '#2b1d3d';
    rr(x - 4, y - 4, w + 8, h + 8, 6);
    ctx.fill();
    if (open) {
      ctx.globalAlpha = 0.6 + 0.4 * Math.sin(t * 5);
      ctx.drawImage(glowSprite('#3fe0a0'), p.x - 36, p.y - 36, 72, 72);
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#7dffc4';
    } else {
      ctx.fillStyle = '#b06a3a';
    }
    rr(x, y, w, h, 3);
    ctx.fill();
    ctx.strokeStyle = open ? '#1f8f62' : '#4a2410';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let k = 1; k <= 2; k++) {
      if (horiz) {
        const xx = x + (w * k) / 3;
        ctx.moveTo(xx, y + 2);
        ctx.lineTo(xx, y + h - 2);
      } else {
        const yy = y + (h * k) / 3;
        ctx.moveTo(x + 2, yy);
        ctx.lineTo(x + w - 2, yy);
      }
    }
    ctx.stroke();
    // иконка комнаты за дверью: 💀 босс, 👑 золотая комната
    if (icon) {
      ctx.font = '13px serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(icon, p.x, p.y + 1);
    } else if (!open) {
      ctx.fillStyle = '#ffe066';
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3.2, 0, Math.PI * 2);
      ctx.fill();
    }
    if (!open) return;
    // стрелка внутри комнаты указывает на открытую дверь
    const v = DIRV[d];
    const dist = 36 + Math.sin(t * 6) * 3;
    const ax = p.x - v[0] * dist;
    const ay = p.y - v[1] * dist;
    const px = -v[1];
    const py = v[0];
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#2b1d3d';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(ax + v[0] * 9, ay + v[1] * 9);
    ctx.lineTo(ax - v[0] * 6 + px * 7, ay - v[1] * 6 + py * 7);
    ctx.lineTo(ax - v[0] * 6 - px * 7, ay - v[1] * 6 - py * 7);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  function drawPlayer() {
    const p = run.player;
    const blink = run.invuln > 0.5 && Math.floor(run.invuln * 20) % 2 === 0;
    if (blink) return;
    drawEntityShadow(p.x, p.y, 12);
    const img = spriteCanvas('hero');
    const sc = 2.4;
    const dw = img.width * sc;
    const dh = img.height * sc;
    const bob = run.dash.t > 0 ? 0 : Math.abs(Math.sin(perfNow() * 9)) * 1.5;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.translate(p.x, p.y);
    if (p.fx < 0) ctx.scale(-1, 1);
    ctx.drawImage(img, -dw / 2, -dh * 0.62 - bob, dw, dh);
    ctx.restore();
    if (run.stats.orbit) {
      const t = perfNow();
      for (let i = 0; i < run.stats.orbit; i++) {
        const a = t * 3 + (i / run.stats.orbit) * Math.PI * 2;
        ctx.fillStyle = '#fff3b0';
        ctx.beginPath();
        ctx.arc(p.x + Math.cos(a) * 30, p.y + Math.sin(a) * 30, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  function drawEnemy(e) {
    drawEntityShadow(e.x, e.y, e.r);
    const img = spriteCanvas(e.type, e.flash > 0);
    const sc = { blob: 2.2, spitter: 2.2, charger: 2.4, queen: 3.2 }[e.type] || 2.2;
    const dw = img.width * sc;
    const dh = img.height * sc;
    const t = perfNow();
    const jx = e.type === 'charger' && e.state === 'wind' ? Math.sin(t * 60) * 1.5 : 0;
    const bob = Math.sin(t * 6 + e.x) * (e.boss ? 1.5 : 1);
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.translate(e.x + jx, e.y + bob);
    ctx.drawImage(img, -dw / 2, -dh * 0.6, dw, dh);
    ctx.restore();
    if (e.burnT > 0) {
      ctx.fillStyle = 'rgba(255,150,70,0.8)';
      ctx.beginPath();
      ctx.arc(e.x, e.y - e.r - 3, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    if (e.slowT > 0) {
      ctx.strokeStyle = 'rgba(120,230,255,0.9)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.r + 3, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (e.hp < e.maxHp) {
      const bw = e.r * 2.2;
      ctx.fillStyle = 'rgba(40,20,60,0.35)';
      rr(e.x - bw / 2, e.y - e.r - 12, bw, 4, 2);
      ctx.fill();
      ctx.fillStyle = '#7bd88f';
      rr(e.x - bw / 2, e.y - e.r - 12, bw * Math.max(0, e.hp / e.maxHp), 4, 2);
      ctx.fill();
    }
  }

  function drawTears() {
    for (const t of run.tears) {
      const g = glowSprite('#b79bf0');
      ctx.drawImage(g, t.x - 9, t.y - 9, 18, 18);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(t.x, t.y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const b of run.bullets) {
      ctx.drawImage(glowSprite('#ff7a9a'), b.x - 8, b.y - 8, 16, 16);
    }
  }

  function neighborOf(room, d) {
    return run.map.byKey.get(`${room.x + DIRV[d][0]},${room.y + DIRV[d][1]}`);
  }

  function roomIcon(kind) {
    if (kind === 'boss') return '💀';
    if (kind === 'gold') return '👑';
    return '';
  }

  function drawHud() {
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    rr(10, 10, 130, 40, 14);
    ctx.fill();
    ctx.strokeStyle = '#5b3348';
    ctx.lineWidth = 2;
    rr(10, 10, 130, 40, 14);
    ctx.stroke();
    for (let i = 0; i < run.stats.maxHp / 2; i++) {
      const full = run.hp >= (i + 1) * 2;
      const half = !full && run.hp > i * 2;
      ctx.fillStyle = full || half ? '#ff2e6e' : 'rgba(255,46,110,0.25)';
      ctx.font = '20px serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('♥', 26 + i * 18, 31);
    }
    if (run.shield > 0) {
      ctx.fillStyle = '#7a2a6a';
      ctx.font = "bold 12px 'Nunito', sans-serif";
      ctx.fillText(`щит ${run.shield}`, 110, 30);
    }
    if (run.tut >= 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      rr(MM.x, MM.y, MM.w, MM.h, 10);
      ctx.fill();
      ctx.fillStyle = '#5b3348';
      ctx.font = "bold 13px 'Nunito', sans-serif";
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Обучение', MM.x + MM.w / 2, MM.y + MM.h / 2);
    } else {
      drawMiniMap();
    }

    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    let ix = 14;
    for (const it of run.items.slice(-10)) {
      ctx.fillStyle = it.col;
      ctx.beginPath();
      ctx.arc(ix + 8, RY1 + 22, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#2b1d3d';
      ctx.font = "bold 11px 'Nunito', sans-serif";
      ctx.textAlign = 'center';
      ctx.fillText(it.glyph, ix + 8, RY1 + 22);
      ctx.textAlign = 'left';
      ix += 20;
    }
    ctx.fillStyle = '#ffffff';
    ctx.font = "bold 12px 'Nunito', sans-serif";
    ctx.textAlign = 'center';
    ctx.fillText(run.tut >= 0 ? 'Обучение' : `Этаж ${run.floor}/${FLOORS}`, VIEW.w / 2, RY1 + 22);
    ctx.textAlign = 'left';
  }

  // мини-карта: окно 5x3 вокруг текущей комнаты, показывает только известные комнаты
  function drawMiniMap() {
    const map = run.map;
    const cur = run.room;
    ctx.fillStyle = 'rgba(43,29,61,0.85)';
    rr(MM.x, MM.y, MM.w, MM.h, 10);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    rr(MM.x, MM.y, MM.w, MM.h, 10);
    ctx.stroke();
    const STEP = 16;
    const SZ = 12;
    const centerOf = (dx, dy) => ({
      x: MM.x + MM.w / 2 + dx * STEP,
      y: MM.y + MM.h / 2 + dy * STEP,
    });
    const known = (r) => r.visited || Object.keys(r.doors).some((d) => r.doors[d] && neighborOf(r, d) && neighborOf(r, d).visited);
    ctx.strokeStyle = '#c9b8ff';
    ctx.lineWidth = 2;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const r = map.byKey.get(`${cur.x + dx},${cur.y + dy}`);
        if (!r || !known(r)) continue;
        for (const d of ['e', 's']) {
          const n = r.doors[d] ? neighborOf(r, d) : null;
          if (!n || !known(n) || Math.abs(n.x - cur.x) > 2 || Math.abs(n.y - cur.y) > 1) continue;
          const a = centerOf(dx, dy);
          const b = centerOf(n.x - cur.x, n.y - cur.y);
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }
    }
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const r = map.byKey.get(`${cur.x + dx},${cur.y + dy}`);
        if (!r || !known(r)) continue;
        const c = centerOf(dx, dy);
        ctx.fillStyle = r.visited ? (r.kind === 'start' ? '#9ff0c0' : r.kind === 'boss' ? '#ff7ab8' : r.kind === 'gold' ? '#ffd54a' : '#b79bf0') : 'rgba(255,255,255,0.4)';
        rr(c.x - SZ / 2, c.y - SZ / 2, SZ, SZ, 3);
        ctx.fill();
        if (r === cur) {
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 2;
          rr(c.x - SZ / 2 - 2, c.y - SZ / 2 - 2, SZ + 4, SZ + 4, 4);
          ctx.stroke();
        }
        const icon = roomIcon(r.kind);
        if (icon) {
          ctx.font = '10px serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = '#2b1d3d';
          ctx.fillText(icon, c.x, c.y + 0.5);
        }
      }
    }
    ctx.fillStyle = '#ffffff';
    ctx.font = "bold 9px 'Nunito', sans-serif";
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(`${run.floor}/${FLOORS} · карта`, MM.x + 5, MM.y + 4);
    ctx.textBaseline = 'middle';
  }

  // полная карта этажа: открывается нажатием на мини-карту
  function drawMap() {
    const map = run.map;
    ctx.fillStyle = 'rgba(30,14,50,0.92)';
    ctx.fillRect(0, 0, VIEW.w, VIEW.h);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    ctx.font = "800 18px 'Nunito', sans-serif";
    ctx.fillText(`Карта: этаж ${run.floor}/${FLOORS}`, VIEW.w / 2, 36);

    const xs = map.rooms.map((r) => r.x);
    const ys = map.rooms.map((r) => r.y);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const cols = Math.max(...xs) - minX + 1;
    const rows = Math.max(...ys) - minY + 1;
    const STEP = 44;
    const SQ = 30;
    const ox = VIEW.w / 2 - ((cols - 1) * STEP) / 2 - SQ / 2;
    const oy = 230 - ((rows - 1) * STEP) / 2 - SQ / 2;
    const cx = (r) => ox + (r.x - minX) * STEP;
    const cy = (r) => oy + (r.y - minY) * STEP;

    ctx.strokeStyle = '#c9b8ff';
    ctx.lineWidth = 4;
    for (const r of map.rooms) {
      for (const d of ['e', 's']) {
        const n = r.doors[d] ? neighborOf(r, d) : null;
        if (!n) continue;
        ctx.beginPath();
        ctx.moveTo(cx(r) + SQ / 2, cy(r) + SQ / 2);
        ctx.lineTo(cx(n) + SQ / 2, cy(n) + SQ / 2);
        ctx.stroke();
      }
    }
    for (const r of map.rooms) {
      let fill = '#e6dcff';
      if (r.visited) fill = r.kind === 'start' ? '#9ff0c0' : r.kind === 'boss' ? '#ff7ab8' : r.kind === 'gold' ? '#ffd54a' : '#b79bf0';
      ctx.fillStyle = fill;
      rr(cx(r), cy(r), SQ, SQ, 6);
      ctx.fill();
      if (r === run.room) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 4;
        rr(cx(r) - 4, cy(r) - 4, SQ + 8, SQ + 8, 8);
        ctx.stroke();
      }
      const icon = roomIcon(r.kind);
      if (icon) {
        ctx.font = '17px serif';
        ctx.fillStyle = '#2b1d3d';
        ctx.fillText(icon, cx(r) + SQ / 2, cy(r) + SQ / 2 + 1);
      } else if (!r.visited) {
        ctx.font = "bold 16px 'Nunito', sans-serif";
        ctx.fillStyle = '#5b3348';
        ctx.fillText('?', cx(r) + SQ / 2, cy(r) + SQ / 2 + 1);
      }
    }
    ctx.fillStyle = '#ffffff';
    ctx.font = "700 13px 'Nunito', sans-serif";
    ctx.fillText('💀 босс   👑 золотая комната   ? не исследовано', VIEW.w / 2, 420);
    ctx.fillText('Белая рамка - ты здесь', VIEW.w / 2, 442);
    ctx.font = "800 14px 'Nunito', sans-serif";
    ctx.fillStyle = '#ffe066';
    ctx.fillText('Нажми, чтобы вернуться', VIEW.w / 2, 466);
  }

  function drawBanner(text) {
    ctx.fillStyle = 'rgba(40,20,70,0.72)';
    rr(14, 78, VIEW.w - 28, 30, 12);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = "bold 13px 'Nunito', sans-serif";
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, VIEW.w / 2, 93);
  }

  function tutorialText() {
    const steps = [
      'Двигайся: тяни джойстик слева',
      'Уклонись рывком: кнопка справа внизу',
      'Стреляй: цель стреляет в ответ, убей её',
      'Выбери предмет: он меняет твою стрельбу',
      'Иди в открытую дверь внизу - начнётся первый этаж',
    ];
    return steps[Math.max(0, Math.min(4, run.tut))];
  }

  function pickRect(i, n) {
    const w = n === 2 ? 132 : 96;
    const h = n === 2 ? 170 : 150;
    const gap = n === 2 ? 22 : 14;
    const x0 = (VIEW.w - (n * w + (n - 1) * gap)) / 2;
    return { x: x0 + i * (w + gap), y: 160, w, h };
  }

  function drawPick() {
    const n = run.pickOpts.length;
    ctx.fillStyle = 'rgba(30,14,50,0.7)';
    ctx.fillRect(0, 0, VIEW.w, VIEW.h);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    ctx.font = "800 17px 'Nunito', sans-serif";
    ctx.fillText(run.pickTitle || 'Выбери предмет', VIEW.w / 2, 128);
    run.pickOpts.forEach((it, i) => {
      const b = pickRect(i, n);
      ctx.fillStyle = '#fffdf7';
      rr(b.x, b.y, b.w, b.h, 16);
      ctx.fill();
      ctx.strokeStyle = it.col;
      ctx.lineWidth = 3;
      rr(b.x, b.y, b.w, b.h, 16);
      ctx.stroke();
      ctx.fillStyle = it.col;
      ctx.beginPath();
      ctx.arc(b.x + b.w / 2, b.y + 40, 24, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = '24px serif';
      ctx.fillText(it.glyph, b.x + b.w / 2, b.y + 41);
      ctx.fillStyle = '#2b1d3d';
      ctx.font = "800 13px 'Nunito', sans-serif";
      wrapText(it.name, b.x + b.w / 2, b.y + 84, b.w - 12, 15);
      ctx.fillStyle = '#5b3348';
      ctx.font = "700 12px 'Nunito', sans-serif";
      wrapText(it.desc, b.x + b.w / 2, b.y + 114, b.w - 12, 14);
    });
  }

  function wrapText(text, x, y, maxW, lh) {
    const words = text.split(' ');
    let line = '';
    let yy = y;
    for (const w of words) {
      const test = line ? `${line} ${w}` : w;
      if (ctx.measureText(test).width > maxW && line) {
        ctx.fillText(line, x, yy);
        line = w;
        yy += lh;
      } else {
        line = test;
      }
    }
    if (line) ctx.fillText(line, x, yy);
  }

  function drawDead() {
    ctx.fillStyle = 'rgba(40,10,30,0.6)';
    ctx.fillRect(0, 0, VIEW.w, VIEW.h);
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.font = "800 22px 'Nunito', sans-serif";
    ctx.fillText('Забег окончен', VIEW.w / 2, VIEW.h / 2 - 10);
    ctx.font = "600 14px 'Nunito', sans-serif";
    ctx.fillText('Ничего, в следующий раз получится', VIEW.w / 2, VIEW.h / 2 + 16);
  }

  function render() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#e9dcff';
    ctx.fillRect(0, 0, W, H);
    ctx.setTransform(scale, 0, 0, scale, offX, offY);
    const sx = run.shake > 0 ? (Math.random() - 0.5) * run.shake * 0.4 : 0;
    const sy = run.shake > 0 ? (Math.random() - 0.5) * run.shake * 0.4 : 0;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, VIEW.w, VIEW.h);
    ctx.clip();
    ctx.translate(sx, sy);
    ctx.fillStyle = '#f3e9ff';
    ctx.fillRect(-10, -10, VIEW.w + 20, VIEW.h + 20);
    const room = run.room;
    ctx.drawImage(roomCache(room), 0, 0);
    for (const d of ['n', 's', 'w', 'e']) {
      if (room.doors[d]) drawDoor(room, d);
    }
    for (const pt of run.particles) {
      ctx.fillStyle = pt.col;
      ctx.globalAlpha = Math.max(0, pt.life / pt.max);
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 2.6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    for (const e of run.enemies) if (!e.dead) drawEnemy(e);
    drawTears();
    drawPlayer();
    for (const f of run.floaters) {
      ctx.globalAlpha = Math.min(1, f.life);
      ctx.fillStyle = f.col;
      ctx.font = "800 13px 'Nunito', sans-serif";
      ctx.textAlign = 'center';
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    if (joy) {
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.beginPath();
      ctx.arc(joy.ox, joy.oy, 40, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.beginPath();
      ctx.arc(joy.ox + Math.max(-40, Math.min(40, joy.x - joy.ox)), joy.oy + Math.max(-40, Math.min(40, joy.y - joy.oy)), 16, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = run.dash.cd > 0 ? 'rgba(200,180,230,0.5)' : 'rgba(255,255,255,0.85)';
    ctx.beginPath();
    ctx.arc(VIEW.w - 40, VIEW.h - 40, 28, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ff7ab8';
    ctx.font = "800 12px 'Nunito', sans-serif";
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('РЫВОК', VIEW.w - 40, VIEW.h - 40);

    drawHud();
    if (run.showMap) drawMap();
    if (run.tut >= 0) drawBanner(tutorialText());
    if (run.state === 'pick') drawPick();
    if (run.state === 'dead') drawDead();
    if (run.state === 'won') {
      ctx.fillStyle = 'rgba(40,20,70,0.5)';
      ctx.fillRect(0, 0, VIEW.w, VIEW.h);
      ctx.fillStyle = '#fff3b0';
      ctx.font = "800 24px 'Nunito', sans-serif";
      ctx.textAlign = 'center';
      ctx.fillText('Подземелье пройдено!', VIEW.w / 2, VIEW.h / 2);
    }
  }

  function toLogical(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const px = (clientX - rect.left) * (canvas.width / rect.width);
    const py = (clientY - rect.top) * (canvas.height / rect.height);
    return { x: (px - offX) / scale, y: (py - offY) / scale };
  }

  function onPointerDown(e) {
    e.preventDefault();
    if (!run) return;
    if (run.showMap) {
      run.showMap = false;
      return;
    }
    const q = toLogical(e.clientX, e.clientY);
    if (run.state === 'pick') {
      for (let i = 0; i < run.pickOpts.length; i++) {
        const b = pickRect(i, run.pickOpts.length);
        if (q.x >= b.x && q.x <= b.x + b.w && q.y >= b.y && q.y <= b.y + b.h) {
          choose(i);
          return;
        }
      }
      return;
    }
    if (run.state !== 'play') return;
    if (run.tut < 0 && q.x >= MM.x && q.x <= MM.x + MM.w && q.y >= MM.y && q.y <= MM.y + MM.h) {
      run.showMap = true;
      joy = null;
      return;
    }
    if (Math.hypot(q.x - (VIEW.w - 40), q.y - (VIEW.h - 40)) < 30) {
      dash();
      return;
    }
    if (q.x < VIEW.w * 0.7) {
      joy = { id: e.pointerId, ox: q.x, oy: q.y, x: q.x, y: q.y };
    }
  }

  function onPointerMove(e) {
    if (!joy || e.pointerId !== joy.id) return;
    const q = toLogical(e.clientX, e.clientY);
    joy.x = q.x;
    joy.y = q.y;
  }

  function onPointerUp(e) {
    if (joy && e.pointerId === joy.id) joy = null;
  }

  function onKeyDown(e) {
    const k = e.key.toLowerCase();
    if (k === 'arrowleft' || k === 'a') keys.left = true;
    else if (k === 'arrowright' || k === 'd') keys.right = true;
    else if (k === 'arrowup' || k === 'w') keys.up = true;
    else if (k === 'arrowdown' || k === 's') keys.down = true;
    else if (k === 'm' && run && run.tut < 0) run.showMap = !run.showMap;
    else if (k === ' ') {
      e.preventDefault();
      dash();
    }
  }

  function onKeyUp(e) {
    const k = e.key.toLowerCase();
    if (k === 'arrowleft' || k === 'a') keys.left = false;
    else if (k === 'arrowright' || k === 'd') keys.right = false;
    else if (k === 'arrowup' || k === 'w') keys.up = false;
    else if (k === 'arrowdown' || k === 's') keys.down = false;
  }

  canvas.style.aspectRatio = '3 / 4';
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('resize', setScale);

  setScale();

  return {
    start() {
      if (running) return;
      running = true;
      last = 0;
      setScale();
      newRun(tutorial);
      raf = requestAnimationFrame(frame);
    },
    destroy() {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      canvas.style.aspectRatio = '';
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerUp);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('resize', setScale);
    },
    getState() {
      return {
        floor: run ? run.floor : 0,
        hp: run ? run.hp : 0,
        items: run ? run.items.length : 0,
        tut: run ? run.tut : -1,
        state: run ? run.state : 'none',
        synergies: run ? run.stats.active.slice() : [],
        finished,
      };
    },
    win: () => {
      if (run) run.state = 'won';
      finishRun();
    },
    test: {
      killAll: () => {
        if (!run) return;
        for (const e of run.enemies) {
          e.hp = 0;
          killEnemy(e);
        }
      },
      pick: (i) => choose(i),
      skipTutorial: () => {
        if (run && run.tut >= 0) {
          run.tut = 4;
          nextFloor();
        }
      },
      enterKind: (kind) => {
        const r = run && run.map.rooms.find((x) => x.kind === kind);
        if (r) enterRoom(r, null);
        return !!r;
      },
      showMap: (v) => {
        if (run) run.showMap = v;
      },
      tutorialStep: () => (run ? run.tut : -1),
      floor: () => (run ? run.floor : 0),
    },
  };
}
