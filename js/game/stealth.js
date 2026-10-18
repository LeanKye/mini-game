import { spriteCanvas } from './sprites.js';

// Стелс: вор крадёт предметы, охрана патрулирует. Свет и тени решают, кто его видит.
// Координаты мира - в клетках (tile units); на экран переводим через T пикселей на клетку.

const T = 32;
const VIEW_H = 400;
const MIN_W = 360;
const MAX_W = 900;
const MAP_W = 36;
const MAP_H = 24;
const FLOORS = 3;
const FOV = 0.62;
const SEE_R = 7.5;
const CLOSE_R = 2.2;
const LIGHT_R = 4.5;
const LIT = 0.28;
const PLAYER_SPEED = 2.9;
const PATROL_SPEED = 1.7;
const INVEST_SPEED = 2.3;
const CHASE_SPEED = 2.6;
const PLAYER_R = 0.3;
const CATCH_D = 0.6;
const PICK_D = 0.65;
const STONE_RANGE = 4;
const STONE_NOISE = 6;

const TILE = { FLOOR: 0, WALL: 1, CRATE: 3, EXIT: 4, LAMP: 5 };
const SOLID = new Set([TILE.WALL, TILE.CRATE, TILE.LAMP]);
const BLOCK_SIGHT = new Set([TILE.WALL, TILE.CRATE]);

const MODS = [
  { id: 'moon', name: 'Лунная ночь', desc: 'Почти нет ламп', lampChance: 0.2, guards: 0, seeMul: 1, stones: 0 },
  { id: 'party', name: 'Вечеринка', desc: 'Лишний охранник', lampChance: 0.7, guards: 1, seeMul: 1, stones: 0 },
  { id: 'alarm', name: 'Сигналка', desc: 'Охрана видит дальше', lampChance: 0.6, guards: 0, seeMul: 1.35, stones: 0 },
  { id: 'quiet', name: 'Тихий дом', desc: 'Два лишних камня', lampChance: 0.6, guards: 0, seeMul: 1, stones: 2 },
];

function lcg(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

// Генерация этажа: комнаты, коридоры, ящики, лампы, предметы и маршруты охраны.
// Все проверяется связностью: ящики и лампы не должны отрезать путь до предметов и выхода.
export function makeFloor(seed, floorIdx) {
  const rnd = lcg(seed);
  const grid = [];
  for (let y = 0; y < MAP_H; y++) grid.push(new Array(MAP_W).fill(TILE.WALL));
  const rooms = [];
  let guardLoop = 0;
  while (rooms.length < 9 && guardLoop++ < 600) {
    const w = 5 + Math.floor(rnd() * 5);
    const h = 4 + Math.floor(rnd() * 4);
    const x = 1 + Math.floor(rnd() * (MAP_W - w - 2));
    const y = 1 + Math.floor(rnd() * (MAP_H - h - 2));
    if (rooms.some((o) => x < o.x + o.w + 2 && x + w + 2 > o.x && y < o.y + o.h + 2 && y + h + 2 > o.y)) continue;
    rooms.push({ x, y, w, h, cx: Math.floor(x + w / 2), cy: Math.floor(y + h / 2) });
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) grid[yy][xx] = TILE.FLOOR;
  }
  rooms.sort((a, b) => a.cx - b.cx);
  const corridor = (a, b) => {
    let x = a.cx;
    let y = a.cy;
    while (x !== b.cx) {
      x += Math.sign(b.cx - x);
      if (grid[y][x] === TILE.WALL) grid[y][x] = TILE.FLOOR;
    }
    while (y !== b.cy) {
      y += Math.sign(b.cy - y);
      if (grid[y][x] === TILE.WALL) grid[y][x] = TILE.FLOOR;
    }
  };
  for (let i = 0; i + 1 < rooms.length; i++) corridor(rooms[i], rooms[i + 1]);
  for (let i = 0; i + 2 < rooms.length; i++) if (rnd() < 0.4) corridor(rooms[i], rooms[i + 2]);

  const mod = MODS[Math.floor(rnd() * MODS.length)];
  const start = rooms[0];
  const exitRoom = rooms[rooms.length - 1];
  const exit = { x: exitRoom.cx, y: exitRoom.cy };
  grid[exit.y][exit.x] = TILE.EXIT;
  const reserved = new Set([`${start.cx},${start.cy}`, `${exit.x},${exit.y}`]);
  const key = (x, y) => `${x},${y}`;

  const randomInterior = (room) => ({
    x: room.x + 1 + Math.floor(rnd() * Math.max(1, room.w - 2)),
    y: room.y + 1 + Math.floor(rnd() * Math.max(1, room.h - 2)),
  });

  // предметы: по одному в трёх комнатах, кроме старта и выхода
  const itemRooms = rooms.slice(1, rooms.length - 1);
  const items = [];
  for (let i = 0; i < 3 && itemRooms.length; i++) {
    const room = itemRooms.splice(Math.floor(rnd() * itemRooms.length), 1)[0];
    let p = randomInterior(room);
    let guard = 0;
    while (reserved.has(key(p.x, p.y)) && guard++ < 20) p = randomInterior(room);
    reserved.add(key(p.x, p.y));
    items.push({ x: p.x, y: p.y, taken: false });
  }

  // ящики и лампы, с проверкой связности
  const placeObjects = () => {
    const placed = [];
    for (const room of rooms.slice(1)) {
      const crates = Math.floor(rnd() * 3);
      for (let i = 0; i < crates; i++) {
        const p = randomInterior(room);
        if (reserved.has(key(p.x, p.y)) || grid[p.y][p.x] !== TILE.FLOOR) continue;
        grid[p.y][p.x] = TILE.CRATE;
        placed.push({ x: p.x, y: p.y, t: TILE.CRATE });
      }
      if (rnd() < mod.lampChance) {
        const p = randomInterior(room);
        if (!reserved.has(key(p.x, p.y)) && grid[p.y][p.x] === TILE.FLOOR) {
          grid[p.y][p.x] = TILE.LAMP;
          placed.push({ x: p.x, y: p.y, t: TILE.LAMP });
        }
      }
    }
    let lampCount = placed.filter((p) => p.t === TILE.LAMP).length;
    for (const room of rooms.slice(1).sort(() => rnd() - 0.5)) {
      if (lampCount >= 3) break;
      for (let k = 0; k < 6 && lampCount < 3; k++) {
        const p = randomInterior(room);
        if (reserved.has(key(p.x, p.y)) || grid[p.y][p.x] !== TILE.FLOOR) continue;
        grid[p.y][p.x] = TILE.LAMP;
        placed.push({ x: p.x, y: p.y, t: TILE.LAMP });
        lampCount++;
      }
    }
    return placed;
  };
  const reachableFrom = (sx, sy) => {
    const seen = new Set([key(sx, sy)]);
    const q = [[sx, sy]];
    for (let i = 0; i < q.length; i++) {
      const [x, y] = q[i];
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= MAP_W || ny >= MAP_H) continue;
        if (SOLID.has(grid[ny][nx]) || seen.has(key(nx, ny))) continue;
        seen.add(key(nx, ny));
        q.push([nx, ny]);
      }
    }
    return seen;
  };
  for (let attempt = 0; attempt < 4; attempt++) {
    const placed = placeObjects();
    const reach = reachableFrom(start.cx, start.cy);
    const ok = items.every((it) => reach.has(key(it.x, it.y))) && reach.has(key(exit.x, exit.y));
    if (ok) break;
    for (const p of placed) grid[p.y][p.x] = TILE.FLOOR;
  }

  const guardCount = 2 + floorIdx + mod.guards;
  const guardRooms = rooms.slice(1);
  const routes = [];
  for (let g = 0; g < guardCount; g++) {
    const route = [];
    const order = guardRooms.slice().sort(() => rnd() - 0.5);
    for (let k = 0; k < 3; k++) {
      const room = order[k % order.length];
      let p = randomInterior(room);
      let guard = 0;
      while (SOLID.has(grid[p.y][p.x]) && guard++ < 20) p = randomInterior(room);
      route.push({ x: p.x, y: p.y });
    }
    routes.push(route);
  }

  const lamps = [];
  for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) {
    if (grid[y][x] === TILE.LAMP) lamps.push({ x, y, on: true, flick: Math.random() * 6 });
  }

  return {
    grid,
    rooms,
    start: { x: start.cx, y: start.cy },
    exit,
    items,
    routes,
    lamps,
    mod,
  };
}

function tileAt(grid, x, y) {
  const tx = Math.floor(x);
  const ty = Math.floor(y);
  if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) return TILE.WALL;
  return grid[ty][tx];
}

function clearLine(grid, x0, y0, x1, y1) {
  const d = Math.hypot(x1 - x0, y1 - y0);
  const n = Math.max(1, Math.ceil(d / 0.12));
  for (let i = 1; i < n; i++) {
    const t = i / n;
    if (BLOCK_SIGHT.has(tileAt(grid, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t))) return false;
  }
  return true;
}

// Кратчайший путь по клеткам (4-направления), без стен, ящиков и ламп.
function bfsPath(grid, sx, sy, tx, ty) {
  if (sx === tx && sy === ty) return [];
  if (SOLID.has(grid[ty][tx])) return [];
  const prev = new Map();
  const startKey = sy * MAP_W + sx;
  const targetKey = ty * MAP_W + tx;
  prev.set(startKey, -1);
  const q = [startKey];
  for (let i = 0; i < q.length; i++) {
    const cur = q[i];
    if (cur === targetKey) break;
    const cx = cur % MAP_W;
    const cy = Math.floor(cur / MAP_W);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= MAP_W || ny >= MAP_H) continue;
      if (SOLID.has(grid[ny][nx])) continue;
      const nk = ny * MAP_W + nx;
      if (prev.has(nk)) continue;
      prev.set(nk, cur);
      q.push(nk);
    }
  }
  if (!prev.has(targetKey)) return [];
  const path = [];
  for (let k = targetKey; k !== startKey; k = prev.get(k)) {
    path.push({ x: k % MAP_W, y: Math.floor(k / MAP_W) });
  }
  return path.reverse();
}

function paintTile(g, grid, x, y) {
  const v = grid[y][x];
  const px = x * T;
  const py = y * T;
  const hash = ((x * 73856093) ^ (y * 19349663)) >>> 0;
  if (v === TILE.WALL) {
    g.fillStyle = '#23254a';
    g.fillRect(px, py, T, T);
    g.fillStyle = '#3b3f72';
    g.fillRect(px, py, T, 4);
    g.fillStyle = '#1a1c3a';
    for (let r = 0; r < 2; r++) g.fillRect(px, py + 10 + r * 11, T, 2);
    g.fillRect(px + ((hash % 2) ? 8 : 20), py + 4, 2, 6);
    g.fillRect(px + ((hash % 2) ? 20 : 8), py + 16, 2, 6);
    return;
  }
  const base = (x + y) % 2 === 0 ? '#4b5079' : '#444a72';
  g.fillStyle = base;
  g.fillRect(px, py, T, T);
  g.fillStyle = 'rgba(255,255,255,0.05)';
  g.fillRect(px, py, T, 2);
  g.fillStyle = 'rgba(0,0,0,0.18)';
  g.fillRect(px + (hash % 9) + 4, py + ((hash >> 3) % 9) + 4, 3, 2);
  if (v === TILE.CRATE) {
    g.fillStyle = '#9a6434';
    g.fillRect(px + 2, py + 2, T - 4, T - 4);
    g.fillStyle = '#c48a4e';
    g.fillRect(px + 4, py + 4, T - 8, 4);
    g.fillStyle = '#5a3818';
    g.fillRect(px + 2, py + 12, T - 4, 2);
    g.fillRect(px + 2, py + 20, T - 4, 2);
    g.strokeStyle = '#3d2412';
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(px + 5, py + 5);
    g.lineTo(px + T - 5, py + T - 5);
    g.moveTo(px + T - 5, py + 5);
    g.lineTo(px + 5, py + T - 5);
    g.stroke();
  } else if (v === TILE.LAMP) {
    g.fillStyle = '#2b2d45';
    g.beginPath();
    g.arc(px + T / 2, py + T / 2 + 4, 9, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#56597e';
    g.fillRect(px + T / 2 - 2, py + 6, 4, T / 2);
  } else if (v === TILE.EXIT) {
    g.fillStyle = '#2e7d5b';
    g.fillRect(px + 3, py + 3, T - 6, T - 6);
    g.fillStyle = '#7dffc4';
    g.beginPath();
    g.moveTo(px + T / 2, py + 8);
    g.lineTo(px + T - 8, py + T / 2);
    g.lineTo(px + T / 2, py + T - 8);
    g.lineTo(px + 8, py + T / 2);
    g.closePath();
    g.fill();
  }
}

function drawMapCanvas(floor) {
  const c = document.createElement('canvas');
  c.width = MAP_W * T;
  c.height = MAP_H * T;
  const g = c.getContext('2d');
  for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) paintTile(g, floor.grid, x, y);
  return c;
}

export function createStealth(canvas, { onHint, onWin } = {}) {
  const ctx = canvas.getContext('2d');
  const darkCanvas = document.createElement('canvas');
  const dctx = darkCanvas.getContext('2d');
  const VIEW = { w: MIN_W, h: VIEW_H };
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
  let st = null;
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
    darkCanvas.width = W;
    darkCanvas.height = H;
    VIEW.w = Math.max(MIN_W, Math.min(MAX_W, Math.round(VIEW.h * (W / H))));
    scale = Math.min(W / VIEW.w, H / VIEW.h);
    offX = (W - VIEW.w * scale) / 2;
    offY = (H - VIEW.h * scale) / 2;
  }

  function computeLight() {
    const light = new Float32Array(MAP_W * MAP_H);
    for (const l of st.floor.lamps) {
      if (!l.on) continue;
      for (let ty = Math.max(0, l.y - 5); ty <= Math.min(MAP_H - 1, l.y + 5); ty++) {
        for (let tx = Math.max(0, l.x - 5); tx <= Math.min(MAP_W - 1, l.x + 5); tx++) {
          const d = Math.hypot(tx + 0.5 - (l.x + 0.5), ty + 0.5 - (l.y + 0.5));
          if (d >= LIGHT_R) continue;
          light[ty * MAP_W + tx] += Math.pow(1 - d / LIGHT_R, 1.2);
        }
      }
    }
    st.light = light;
  }

  function lightAt(x, y) {
    const tx = Math.floor(x);
    const ty = Math.floor(y);
    if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) return 0;
    return st.light[ty * MAP_W + tx];
  }

  function alertLevel() {
    let level = 0;
    for (const g of st.guards) {
      if (g.state === 'chase') return 2;
      if (g.sus > 0.2 || g.state === 'investigate' || g.state === 'look') level = 1;
    }
    return level;
  }

  function buildFloor(cp) {
    st.floor = makeFloor(st.seed + st.floorIdx * 7919, st.floorIdx);
    st.mapCanvas = drawMapCanvas(st.floor);
    computeLight();
    st.player = { x: st.floor.start.x + 0.5, y: st.floor.start.y + 0.5, fx: 0, fy: 1 };
    st.guards = st.floor.routes.map((route) => ({
      x: route[0].x + 0.5,
      y: route[0].y + 0.5,
      face: 0,
      route,
      ri: 0,
      state: 'patrol',
      path: [],
      moving: false,
      goal: null,
      sus: 0,
      lastSeen: null,
      lost: 0,
      wait: 0.6,
      replan: 0,
      searchPts: [],
      searchT: 0,
      investT: 0,
    }));
    st.stones = 3 + st.floor.mod.stones;
    st.seeMul = st.floor.mod.seeMul;
    st.caught = false;
    st.caughtT = 0;
    if (cp) {
      st.stones = cp.stones;
      for (const i of cp.taken) if (st.floor.items[i]) st.floor.items[i].taken = true;
    }
    st.cam = { x: 0, y: 0 };
    centerCamera(true);
  }

  function saveCheckpoint() {
    st.checkpoint = {
      floorIdx: st.floorIdx,
      stones: st.stones,
      taken: st.floor.items.map((it, i) => (it.taken ? i : -1)).filter((i) => i >= 0),
    };
  }

  function startFloor(floorIdx, cp) {
    st.floorIdx = floorIdx;
    buildFloor(cp);
    if (!cp) saveCheckpoint();
  }

  function restartFromCheckpoint() {
    startFloor(st.checkpoint.floorIdx, st.checkpoint);
    if (onHint) onHint('Возвращаемся к чекпоинту: добыча сохранена');
  }

  function newRun() {
    st = {
      seed: (Date.now() ^ 0x5f3759df) >>> 0,
      floorIdx: 0,
      floor: null,
      light: null,
      mapCanvas: null,
      player: null,
      guards: [],
      stones: 0,
      seeMul: 1,
      caught: false,
      caughtT: 0,
      won: false,
      pulses: [],
      floaters: [],
      checkpoint: null,
      cam: { x: 0, y: 0 },
      banner: null,
      bannerT: 0,
    };
    startFloor(0, null);
    if (onHint) onHint(`Этаж 1: ${st.floor.mod.name} - ${st.floor.mod.desc}`);
  }

  function clampToMap(x, y) {
    return { x: Math.max(0.3, Math.min(MAP_W - 0.3, x)), y: Math.max(0.3, Math.min(MAP_H - 0.3, y)) };
  }

  function blockedCircle(x, y, r) {
    for (const [dx, dy] of [[-r, -r], [r, -r], [-r, r], [r, r]]) {
      if (SOLID.has(tileAt(st.floor.grid, x + dx, y + dy))) return true;
    }
    return false;
  }

  function moveBody(e, dx, dy, r) {
    const nx = e.x + dx;
    if (!blockedCircle(nx, e.y, r)) e.x = nx;
    const ny = e.y + dy;
    if (!blockedCircle(e.x, ny, r)) e.y = ny;
  }

  function guardSees(g) {
    const p = st.player;
    const dx = p.x - g.x;
    const dy = p.y - g.y;
    const d = Math.hypot(dx, dy);
    if (d > SEE_R * st.seeMul) return false;
    if (d > CLOSE_R && lightAt(p.x, p.y) < LIT) return false;
    if (d > 0.9 && Math.abs(angleDiff(Math.atan2(dy, dx), g.face)) > FOV) return false;
    return clearLine(st.floor.grid, g.x, g.y, p.x, p.y);
  }

  function setGoal(g, tx, ty) {
    g.path = bfsPath(st.floor.grid, Math.floor(g.x), Math.floor(g.y), tx, ty);
    g.goal = { x: tx, y: ty };
    g.moving = true;
  }

  // Двигает охранника по пути. true - путь пройден.
  function stepAlong(g, speed, dt) {
    if (!g.path.length) return true;
    const n = g.path[0];
    const tx = n.x + 0.5;
    const ty = n.y + 0.5;
    const dx = tx - g.x;
    const dy = ty - g.y;
    const d = Math.hypot(dx, dy);
    const s = speed * dt;
    if (d <= s) {
      g.x = tx;
      g.y = ty;
      g.path.shift();
      return g.path.length === 0;
    }
    g.x += (dx / d) * s;
    g.y += (dy / d) * s;
    g.face = Math.atan2(dy, dx);
    return false;
  }

  function noise(x, y, radius) {
    st.pulses.push({ x, y, r: 0, max: radius, life: 0.8 });
    for (const g of st.guards) {
      if (g.state === 'chase') continue;
      if (Math.hypot(g.x - x, g.y - y) <= radius) startInvestigate(g, x, y);
    }
  }

  function startInvestigate(g, x, y) {
    g.state = 'investigate';
    g.investT = 9;
    g.moving = false;
    setGoal(g, Math.floor(x), Math.floor(y));
  }

  function startChase(g) {
    g.state = 'chase';
    g.moving = false;
    g.replan = 0;
    g.lost = 0;
    if (g.lastSeen) {
      for (const o of st.guards) {
        if (o === g || o.state === 'chase') continue;
        if (Math.hypot(o.x - g.x, o.y - g.y) < 9) {
          o.sus = Math.max(o.sus, 0.5);
          startInvestigate(o, g.lastSeen.x, g.lastSeen.y);
        }
      }
    }
    st.banner = 'Тревога! Охрана идёт за тобой';
    st.bannerT = 2.2;
  }

  function startSearch(g) {
    g.state = 'search';
    g.searchT = 9;
    g.searchPts = [];
    const cx = Math.floor(g.lastSeen ? g.lastSeen.x : g.x);
    const cy = Math.floor(g.lastSeen ? g.lastSeen.y : g.y);
    const grid = st.floor.grid;
    for (let tries = 0; tries < 60 && g.searchPts.length < 4; tries++) {
      const x = cx + Math.round((Math.random() - 0.5) * 10);
      const y = cy + Math.round((Math.random() - 0.5) * 10);
      if (x < 1 || y < 1 || x >= MAP_W - 1 || y >= MAP_H - 1 || SOLID.has(grid[y][x])) continue;
      if (bfsPath(grid, Math.floor(g.x), Math.floor(g.y), x, y).length === 0 && (Math.floor(g.x) !== x || Math.floor(g.y) !== y)) continue;
      g.searchPts.push({ x, y });
    }
    g.moving = false;
    nextSearchPoint(g);
  }

  function nextSearchPoint(g) {
    if (!g.searchPts.length) {
      g.state = 'patrol';
      g.moving = false;
      g.wait = 0.6;
      return;
    }
    const p = g.searchPts.shift();
    setGoal(g, p.x, p.y);
  }

  function updateGuard(g, dt) {
    const p = st.player;
    const sees = guardSees(g);
    if (sees) {
      const lit = lightAt(p.x, p.y) >= LIT;
      g.sus = Math.min(1.25, g.sus + dt * (lit ? 1.4 : 0.8));
      g.lastSeen = { x: p.x, y: p.y };
      g.lost = 0;
    } else {
      g.sus = Math.max(0, g.sus - dt * 0.25);
      if (g.state === 'chase') g.lost += dt;
    }

    if (g.state !== 'chase' && sees && g.sus >= 1) startChase(g);
    else if ((g.state === 'patrol' || g.state === 'search' || g.state === 'look') && g.sus >= 0.5 && g.lastSeen && sees) {
      startInvestigate(g, g.lastSeen.x, g.lastSeen.y);
    }

    switch (g.state) {
      case 'patrol': {
        if (g.wait > 0) {
          g.wait -= dt;
          g.face += Math.sin(g.wait * 3) * dt * 1.2;
          return;
        }
        if (!g.moving) {
          const wp = g.route[g.ri];
          setGoal(g, wp.x, wp.y);
        }
        if (stepAlong(g, PATROL_SPEED, dt)) {
          g.moving = false;
          g.wait = 1.6;
          g.ri = (g.ri + 1) % g.route.length;
        }
        break;
      }
      case 'investigate': {
        g.investT -= dt;
        if (stepAlong(g, INVEST_SPEED, dt) || g.investT <= 0) {
          g.state = 'look';
          g.moving = false;
          g.wait = 2.2;
        }
        break;
      }
      case 'look': {
        g.wait -= dt;
        g.face += Math.sin(g.wait * 4) * dt * 1.6;
        if (g.wait <= 0) {
          g.state = 'patrol';
          g.moving = false;
          g.wait = 0.2;
        }
        break;
      }
      case 'chase': {
        g.replan -= dt;
        if (g.replan <= 0) {
          const t = sees ? p : g.lastSeen;
          if (t) setGoal(g, Math.floor(t.x), Math.floor(t.y));
          g.replan = 0.35;
        }
        stepAlong(g, CHASE_SPEED, dt);
        if (Math.hypot(g.x - p.x, g.y - p.y) < CATCH_D) {
          st.caught = true;
          st.caughtT = 1.6;
        }
        if (g.lost > 2.5) startSearch(g);
        break;
      }
      case 'search': {
        g.searchT -= dt;
        if (g.searchT <= 0) {
          g.state = 'patrol';
          g.moving = false;
          g.wait = 0.4;
          break;
        }
        if (stepAlong(g, INVEST_SPEED, dt)) nextSearchPoint(g);
        break;
      }
      default:
        break;
    }
  }

  function updatePlayer(dt) {
    const p = st.player;
    let vx = 0;
    let vy = 0;
    if (joy) {
      vx = joy.x - joy.ox;
      vy = joy.y - joy.oy;
      const len = Math.hypot(vx, vy);
      if (len > 8) {
        vx /= len;
        vy /= len;
      } else {
        vx = 0;
        vy = 0;
      }
    }
    if (keys.left) vx -= 1;
    if (keys.right) vx += 1;
    if (keys.up) vy -= 1;
    if (keys.down) vy += 1;
    const len = Math.hypot(vx, vy);
    if (len > 0) {
      vx /= len;
      vy /= len;
      p.fx = vx;
      p.fy = vy;
      moveBody(p, vx * PLAYER_SPEED * dt, vy * PLAYER_SPEED * dt, PLAYER_R);
    }
  }

  function checkItems() {
    const p = st.player;
    st.floor.items.forEach((it, i) => {
      if (it.taken) return;
      if (Math.hypot(it.x + 0.5 - p.x, it.y + 0.5 - p.y) < PICK_D) {
        it.taken = true;
        saveCheckpoint();
        const left = st.floor.items.filter((x) => !x.taken).length;
        st.floaters.push({ text: left ? `Добыча ${3 - left}/3` : 'Выход открыт!', x: it.x + 0.5, y: it.y + 0.5, life: 1.6 });
        if (onHint) onHint(left ? `Добыча: осталось ${left}` : 'Вся добыча у тебя. Иди к выходу');
      }
    });
  }

  function checkExit() {
    const p = st.player;
    if (st.floor.items.some((it) => !it.taken)) return;
    const ex = st.floor.exit;
    if (Math.hypot(ex.x + 0.5 - p.x, ex.y + 0.5 - p.y) >= PICK_D) return;
    if (st.floorIdx + 1 >= FLOORS) {
      st.won = true;
      finishRun();
      return;
    }
    startFloor(st.floorIdx + 1, null);
    if (onHint) onHint(`Этаж ${st.floorIdx + 1}: ${st.floor.mod.name} - ${st.floor.mod.desc}`);
  }

  function finishRun() {
    if (finished) return;
    finished = true;
    setTimeout(() => {
      if (onWin) onWin();
    }, 900);
    setTimeout(() => {
      running = false;
      if (raf) cancelAnimationFrame(raf);
    }, 1000);
  }

  function throwStone() {
    if (st.caught || st.won) return;
    if (st.stones <= 0) {
      st.floaters.push({ text: 'Камней нет', x: st.player.x, y: st.player.y, life: 1 });
      return;
    }
    const p = st.player;
    let len = Math.hypot(p.fx, p.fy) || 1;
    const dx = p.fx / len;
    const dy = p.fy / len;
    let tx = p.x;
    let ty = p.y;
    for (let s = 0.25; s <= STONE_RANGE; s += 0.25) {
      const nx = p.x + dx * s;
      const ny = p.y + dy * s;
      if (SOLID.has(tileAt(st.floor.grid, nx, ny))) break;
      tx = nx;
      ty = ny;
    }
    st.stones -= 1;
    noise(tx, ty, STONE_NOISE);
    st.floaters.push({ text: 'Шум!', x: tx, y: ty, life: 1 });
  }

  function breakLampAt(wx, wy) {
    if (st.caught || st.won) return false;
    const p = st.player;
    let best = null;
    let bestD = 0.9;
    for (const l of st.floor.lamps) {
      if (!l.on) continue;
      const d = Math.hypot(l.x + 0.5 - wx, l.y + 0.5 - wy);
      if (d < bestD && Math.hypot(l.x + 0.5 - p.x, l.y + 0.5 - p.y) < 3) {
        best = l;
        bestD = d;
      }
    }
    if (!best) return false;
    best.on = false;
    st.floor.grid[best.y][best.x] = TILE.FLOOR;
    computeLight();
    paintTile(st.mapCanvas.getContext('2d'), st.floor.grid, best.x, best.y);
    noise(best.x + 0.5, best.y + 0.5, 4.5);
    st.floaters.push({ text: 'Лампа разбита', x: best.x + 0.5, y: best.y + 0.5, life: 1.2 });
    return true;
  }

  function centerCamera(snap) {
    const p = st.player;
    const tx = p.x * T - VIEW.w / 2;
    const ty = p.y * T - VIEW.h / 2;
    const maxX = MAP_W * T - VIEW.w;
    const maxY = MAP_H * T - VIEW.h;
    const cx = Math.max(0, Math.min(maxX, tx));
    const cy = Math.max(0, Math.min(maxY, ty));
    if (snap) {
      st.cam.x = cx;
      st.cam.y = cy;
    } else {
      st.cam.x += (cx - st.cam.x) * 0.15;
      st.cam.y += (cy - st.cam.y) * 0.15;
    }
  }

  function step(dt) {
    if (!st) return;
    for (const pu of st.pulses) {
      pu.life -= dt;
      pu.r = Math.min(pu.max, pu.r + dt * 9);
    }
    st.pulses = st.pulses.filter((pu) => pu.life > 0);
    for (const f of st.floaters) f.life -= dt;
    st.floaters = st.floaters.filter((f) => f.life > 0);
    if (st.bannerT > 0) st.bannerT -= dt;
    if (st.caught) {
      st.caughtT -= dt;
      if (st.caughtT <= 0) restartFromCheckpoint();
      return;
    }
    if (st.won) return;
    updatePlayer(dt);
    for (const g of st.guards) {
      updateGuard(g, dt);
      if (st.caught) break;
    }
    if (!st.caught) {
      checkItems();
      checkExit();
    }
    centerCamera(false);
  }

  function frame(ts) {
    if (!running) return;
    raf = requestAnimationFrame(frame);
    if (document.hidden) {
      last = 0;
      return;
    }
    const rect = canvas.getBoundingClientRect();
    if (rect.width && Math.abs(rect.width * 2 - canvas.width) > 1) setScale();
    else if (rect.height && Math.abs(rect.height * 2 - canvas.height) > 1) setScale();
    const dt = last ? Math.min(0.033, (ts - last) / 1000) : 1 / 60;
    last = ts;
    acc += dt;
    while (acc >= 1 / 60) {
      step(1 / 60);
      acc -= 1 / 60;
    }
    render(ts);
  }

  function screenTransform() {
    ctx.setTransform(scale, 0, 0, scale, offX - st.cam.x * scale, offY - st.cam.y * scale);
  }

  function drawGuard(g, t) {
    const img = spriteCanvas('guard');
    const sc = 2.6;
    const dw = img.width * sc;
    const dh = img.height * sc;
    const bob = Math.sin(t * 6 + g.x) * 0.8;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.translate(g.x * T, g.y * T + bob);
    if (Math.cos(g.face) < 0) ctx.scale(-1, 1);
    ctx.drawImage(img, -dw / 2, -dh * 0.8, dw, dh);
    ctx.restore();
    if (g.state === 'chase' || g.state === 'investigate' || g.state === 'look') {
      ctx.fillStyle = g.state === 'chase' ? '#ff4d5e' : '#ffb13b';
      ctx.font = "bold 14px 'Nunito', sans-serif";
      ctx.textAlign = 'center';
      ctx.fillText(g.state === 'chase' ? '!' : '?', g.x * T, g.y * T - dh * 0.8 - 4);
    }
  }

  function drawCone(g, t) {
    const range = SEE_R * st.seeMul;
    const pts = [[g.x * T, g.y * T]];
    const steps = 24;
    for (let i = 0; i <= steps; i++) {
      const a = g.face - FOV + (2 * FOV * i) / steps;
      let d = 0;
      for (let s = 0; s <= range; s += 0.15) {
        const x = g.x + Math.cos(a) * s;
        const y = g.y + Math.sin(a) * s;
        if (BLOCK_SIGHT.has(tileAt(st.floor.grid, x, y))) break;
        d = s;
      }
      pts.push([(g.x + Math.cos(a) * d) * T, (g.y + Math.sin(a) * d) * T]);
    }
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
    const alerted = g.state === 'chase';
    const warn = g.sus > 0.2 || g.state === 'investigate' || g.state === 'look';
    ctx.fillStyle = alerted ? 'rgba(255,77,94,0.26)' : warn ? 'rgba(255,190,80,0.22)' : 'rgba(150,215,255,0.12)';
    ctx.fill();
    ctx.strokeStyle = alerted ? 'rgba(255,77,94,0.5)' : 'rgba(150,215,255,0.25)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  function render(ts) {
    const t = ts / 1000;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#07061a';
    ctx.fillRect(0, 0, W, H);
    screenTransform();
    ctx.drawImage(st.mapCanvas, 0, 0);

    // выход: мигающее свечение, пока добыча не собрана - красное
    const ex = st.floor.exit;
    const open = !st.floor.items.some((it) => !it.taken);
    const pulse = 0.5 + 0.5 * Math.sin(t * 4);
    ctx.fillStyle = open ? `rgba(125,255,196,${0.25 + pulse * 0.3})` : 'rgba(255,77,94,0.18)';
    ctx.beginPath();
    ctx.arc(ex.x * T + T / 2, ex.y * T + T / 2, T * (0.9 + pulse * 0.15), 0, Math.PI * 2);
    ctx.fill();

    // добыча
    const gem = spriteCanvas('gem');
    for (const it of st.floor.items) {
      if (it.taken) continue;
      const bob = Math.sin(t * 3 + it.x) * 2;
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(gem, it.x * T + T / 2 - 12, it.y * T + T / 2 - 12 + bob, 24, 24);
      ctx.restore();
    }

    for (const g of st.guards) drawGuard(g, t);
    for (const g of st.guards) drawCone(g, t);

    // игрок
    const p = st.player;
    const img = spriteCanvas('thief');
    const sc = 2.6;
    const dw = img.width * sc;
    const dh = img.height * sc;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.translate(p.x * T, p.y * T);
    if (p.fx < -0.2) ctx.scale(-1, 1);
    ctx.drawImage(img, -dw / 2, -dh * 0.8, dw, dh);
    ctx.restore();

    // темнота: лампы выжигают круги света
    dctx.setTransform(1, 0, 0, 1, 0, 0);
    dctx.globalCompositeOperation = 'source-over';
    dctx.clearRect(0, 0, W, H);
    dctx.fillStyle = 'rgba(6,4,20,0.84)';
    dctx.fillRect(0, 0, W, H);
    dctx.setTransform(scale, 0, 0, scale, offX - st.cam.x * scale, offY - st.cam.y * scale);
    dctx.globalCompositeOperation = 'destination-out';
    for (const l of st.floor.lamps) {
      if (!l.on) continue;
      const cx = l.x * T + T / 2;
      const cy = l.y * T + T / 2;
      const r = LIGHT_R * T * (1 + Math.sin(t * 9 + l.flick) * 0.03);
      const grad = dctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      grad.addColorStop(0, 'rgba(0,0,0,1)');
      grad.addColorStop(0.55, 'rgba(0,0,0,0.85)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      dctx.fillStyle = grad;
      dctx.beginPath();
      dctx.arc(cx, cy, r, 0, Math.PI * 2);
      dctx.fill();
    }
    // личный слабый свет вора: видно силуэт даже в тени
    const pcx = p.x * T;
    const pcy = p.y * T;
    const pg = dctx.createRadialGradient(pcx, pcy, 0, pcx, pcy, T * 1.6);
    pg.addColorStop(0, 'rgba(0,0,0,0.55)');
    pg.addColorStop(1, 'rgba(0,0,0,0)');
    dctx.fillStyle = pg;
    dctx.beginPath();
    dctx.arc(pcx, pcy, T * 1.6, 0, Math.PI * 2);
    dctx.fill();
    dctx.globalCompositeOperation = 'source-over';
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(darkCanvas, 0, 0);

    // тёплое свечение ламп поверх темноты
    screenTransform();
    ctx.globalCompositeOperation = 'lighter';
    for (const l of st.floor.lamps) {
      if (!l.on) continue;
      const cx = l.x * T + T / 2;
      const cy = l.y * T + T / 2;
      const flick = 0.8 + Math.sin(t * 11 + l.flick) * 0.1;
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, T * 1.4);
      grad.addColorStop(0, `rgba(255,190,90,${0.5 * flick})`);
      grad.addColorStop(1, 'rgba(255,150,60,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, T * 1.4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    for (let i = 0; i < 40; i++) {
      const x = ((i * 137.5 + t * 6) % (MAP_W * T));
      const y = ((i * 91.3 + Math.sin(t + i) * 12) % (MAP_H * T));
      if (Math.abs(x - st.cam.x - VIEW.w / 2) > VIEW.w || Math.abs(y - st.cam.y - VIEW.h / 2) > VIEW.h) continue;
      ctx.fillRect(x, y, 1.5, 1.5);
    }

    // пульсы шума
    for (const pu of st.pulses) {
      ctx.strokeStyle = `rgba(255,220,140,${pu.life * 0.6})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(pu.x * T, pu.y * T, pu.r * T * 0.6, 0, Math.PI * 2);
      ctx.stroke();
    }
    for (const f of st.floaters) {
      ctx.globalAlpha = Math.min(1, f.life);
      ctx.fillStyle = '#ffffff';
      ctx.font = "bold 13px 'Nunito', sans-serif";
      ctx.textAlign = 'center';
      ctx.fillText(f.text, f.x * T, f.y * T - 26);
      ctx.globalAlpha = 1;
    }

    drawHud();
    if (st.caught) {
      ctx.fillStyle = 'rgba(40,6,20,0.55)';
      ctx.fillRect(0, 0, VIEW.w, VIEW.h);
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.font = "800 22px 'Nunito', sans-serif";
      ctx.fillText('Тебя заметили', VIEW.w / 2, VIEW.h / 2 - 8);
      ctx.font = "600 14px 'Nunito', sans-serif";
      ctx.fillText('Возвращаемся к чекпоинту', VIEW.w / 2, VIEW.h / 2 + 16);
    }
    if (st.won) {
      ctx.fillStyle = 'rgba(20,40,30,0.55)';
      ctx.fillRect(0, 0, VIEW.w, VIEW.h);
      ctx.fillStyle = '#7dffc4';
      ctx.textAlign = 'center';
      ctx.font = "800 24px 'Nunito', sans-serif";
      ctx.fillText('Добыча у тебя!', VIEW.w / 2, VIEW.h / 2);
    }
  }

  function drawHud() {
    ctx.setTransform(scale, 0, 0, scale, offX, offY);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(15,12,35,0.8)';
    rr(10, 10, VIEW.w - 20, 34, 12);
    ctx.fill();
    ctx.font = "bold 13px 'Nunito', sans-serif";
    ctx.fillStyle = '#ffffff';
    ctx.fillText(`Этаж ${st.floorIdx + 1}/${FLOORS}`, 22, 27);
    const taken = st.floor.items.filter((it) => it.taken).length;
    ctx.fillStyle = '#ffd166';
    ctx.fillText(`◆ ${taken}/3`, 120, 27);
    ctx.fillStyle = '#c9b8ff';
    ctx.fillText(`● камни ${st.stones}`, 190, 27);
    const level = alertLevel();
    const label = level === 2 ? 'ТРЕВОГА' : level === 1 ? 'Внимание' : 'Тихо';
    const col = level === 2 ? '#ff4d5e' : level === 1 ? '#ffb13b' : '#7dffc4';
    ctx.fillStyle = col;
    ctx.textAlign = 'right';
    ctx.fillText(label, VIEW.w - 22, 27);
    ctx.textAlign = 'left';

    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.font = "bold 11px 'Nunito', sans-serif";
    ctx.textAlign = 'left';
    ctx.fillText(st.floor.mod.name, 16, 58);

    if (st.bannerT > 0 && st.banner) {
      ctx.fillStyle = 'rgba(255,77,94,0.85)';
      rr(VIEW.w / 2 - 130, 52, 260, 28, 12);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.font = "bold 13px 'Nunito', sans-serif";
      ctx.fillText(st.banner, VIEW.w / 2, 66);
      ctx.textAlign = 'left';
    }

    // кнопка броска камня
    ctx.fillStyle = st.stones > 0 ? 'rgba(201,184,255,0.9)' : 'rgba(120,110,150,0.5)';
    ctx.beginPath();
    ctx.arc(VIEW.w - 52, VIEW.h - 52, 30, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1a1433';
    ctx.font = "bold 12px 'Nunito', sans-serif";
    ctx.textAlign = 'center';
    ctx.fillText('шум', VIEW.w - 52, VIEW.h - 52);
    ctx.textAlign = 'left';

    if (joy) {
      ctx.fillStyle = 'rgba(255,255,255,0.2)';
      ctx.beginPath();
      ctx.arc(joy.ox, joy.oy, 40, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      const dx = Math.max(-40, Math.min(40, joy.x - joy.ox));
      const dy = Math.max(-40, Math.min(40, joy.y - joy.oy));
      ctx.beginPath();
      ctx.arc(joy.ox + dx, joy.oy + dy, 16, 0, Math.PI * 2);
      ctx.fill();
    }
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

  function toWorld(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const px = (clientX - rect.left) * (canvas.width / rect.width);
    const py = (clientY - rect.top) * (canvas.height / rect.height);
    const lx = (px - offX) / scale;
    const ly = (py - offY) / scale;
    return { lx, ly, wx: (lx + st.cam.x) / T, wy: (ly + st.cam.y) / T };
  }

  function onPointerDown(e) {
    e.preventDefault();
    if (!st) return;
    const q = toWorld(e.clientX, e.clientY);
    if (Math.hypot(q.lx - (VIEW.w - 52), q.ly - (VIEW.h - 52)) < 34) {
      throwStone();
      return;
    }
    if (q.lx < VIEW.w * 0.5 && q.ly > VIEW.h * 0.4) {
      joy = { id: e.pointerId, ox: q.lx, oy: q.ly, x: q.lx, y: q.ly };
      return;
    }
    breakLampAt(q.wx, q.wy);
  }

  function onPointerMove(e) {
    if (!joy || e.pointerId !== joy.id) return;
    const q = toWorld(e.clientX, e.clientY);
    joy.x = q.lx;
    joy.y = q.ly;
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
    else if (k === ' ') {
      e.preventDefault();
      throwStone();
    }
  }

  function onKeyUp(e) {
    const k = e.key.toLowerCase();
    if (k === 'arrowleft' || k === 'a') keys.left = false;
    else if (k === 'arrowright' || k === 'd') keys.right = false;
    else if (k === 'arrowup' || k === 'w') keys.up = false;
    else if (k === 'arrowdown' || k === 's') keys.down = false;
  }

  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('resize', setScale);
  const onBlur = () => {
    keys.left = keys.right = keys.up = keys.down = false;
    joy = null;
  };
  const onWindowPointerUp = (e) => onPointerUp(e);
  window.addEventListener('blur', onBlur);
  window.addEventListener('pointerup', onWindowPointerUp);

  setScale();
  newRun();

  return {
    start() {
      if (running) return;
      running = true;
      last = 0;
      acc = 0;
      raf = requestAnimationFrame(frame);
    },
    destroy() {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerUp);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('resize', setScale);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('pointerup', onWindowPointerUp);
    },
    win() {
      if (st) st.won = true;
      finishRun();
    },
    getState() {
      return {
        floor: st ? st.floorIdx + 1 : 0,
        items: st ? st.floor.items.filter((it) => it.taken).length : 0,
        total: 3,
        stones: st ? st.stones : 0,
        caught: st ? st.caught : false,
        won: st ? st.won : false,
        finished,
      };
    },
    test: {
      floor: () => (st ? st.floorIdx + 1 : 0),
      items: () => (st ? st.floor.items.filter((it) => it.taken).length : -1),
      caught: () => (st ? st.caught : null),
      guardStates: () => (st ? st.guards.map((g) => g.state) : []),
      collectAll: () => {
        if (!st) return;
        for (const it of st.floor.items) it.taken = true;
        saveCheckpoint();
      },
      teleportExit: () => {
        if (!st) return;
        st.player.x = st.floor.exit.x + 0.5;
        st.player.y = st.floor.exit.y + 0.5;
      },
      die: () => {
        if (st) {
          st.caught = true;
          st.caughtT = 0.01;
        }
      },
      nearGuard: (i) => {
        const g = st && st.guards[i];
        if (!g) return false;
        st.player.x = g.x;
        st.player.y = g.y;
        return true;
      },
      isLit: () => (st ? lightAt(st.player.x, st.player.y) >= LIT : null),
    },
  };
}
