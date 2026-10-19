// Пиксельные спрайты для уровня 4. Каждый спрайт - сетка символов,
// где каждый символ - один пиксель, а палитра задаёт цвета.
// '.' - прозрачный пиксель.

const PALETTE_HERO = {
  o: '#2b1d3d',
  h: '#5b3d8f',
  H: '#8c6bd6',
  s: '#ffd9c2',
  e: '#1a1030',
  d: '#ff7ab8',
  D: '#d9568f',
  w: '#4a2f5e',
  t: '#ffe066',
};

const PALETTE_BLOB = {
  o: '#7a2f55',
  L: '#ffc2d8',
  M: '#ff8fb0',
  D: '#d95f86',
  e: '#2b1d3d',
  w: '#ffffff',
};

const PALETTE_SPITTER = {
  o: '#2a5b3a',
  G: '#8fe0a8',
  D: '#58b07a',
  W: '#ffffff',
  E: '#2b1d3d',
};

const PALETTE_CHARGER = {
  o: '#5a3a0c',
  Y: '#ffe9a0',
  K: '#d9a325',
  e: '#2b1d3d',
  w: '#ffffff',
};

const PALETTE_QUEEN = {
  o: '#3a2a6a',
  L: '#d8c8ff',
  M: '#b8a0ff',
  D: '#6a4fb0',
  G: '#ffe066',
  e: '#1a1030',
  w: '#ffffff',
};

// Спрайты по маске: код строит строки нужной ширины, контур добавляется автоматически.
function shapeRows(w, h, cell, color) {
  const mask = Array.from({ length: h }, (_, y) => Array.from({ length: w }, (_, x) => cell(x, y)));
  const rows = [];
  for (let y = 0; y < h; y++) {
    let row = '';
    for (let x = 0; x < w; x++) {
      const v = mask[y][x];
      if (!v) {
        // пустая клетка рядом с телом - контур
        const near = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
          const yy = y + dy;
          const xx = x + dx;
          return yy >= 0 && yy < h && xx >= 0 && xx < w && mask[yy][xx];
        });
        row += near ? 'o' : '.';
      } else {
        row += color(x, y, v);
      }
    }
    rows.push(row);
  }
  return rows;
}

const BAT_PAL = { o: '#1a1030', w: '#6a5aa8', p: '#4a3a7a', e: '#ffe066', t: '#fff3d6' };
const bat = shapeRows(12, 8, (x, y) => {
  const body = x >= 5 && x <= 6 && y >= 2 && y <= 6;
  const head = x >= 4 && x <= 7 && y >= 1 && y <= 2;
  const lx = 4 - x;
  const rx = x - 7;
  const wingTop = (x <= 4 ? x : 11 - x) * 0.4;
  const wing = (x <= 4 || x >= 7) && (lx >= 0 || rx >= 0) && y >= wingTop && y <= 5 - (x <= 4 ? x : 11 - x) * 0.3;
  if (body || head) return 'p';
  if (wing) return 'w';
  return null;
}, (x, y, v) => v);
const GOLEM_PAL = { o: '#2b2f3f', b: '#6b7186', h: '#8a8fa0', l: '#c2c8d6', e: '#ffb13b', c: '#2b2f3f', m: '#4fbf8a' };
const golem = shapeRows(14, 16, (x, y) => {
  const head = x >= 4 && x <= 9 && y >= 0 && y <= 3 && !((x === 4 || x === 9) && y === 0);
  const body = x >= 2 && x <= 11 && y >= 4 && y <= 11;
  const arms = (x <= 1 || x >= 12) && y >= 5 && y <= 10;
  const legs = (x >= 3 && x <= 5 || x >= 8 && x <= 10) && y >= 12 && y <= 15;
  if (!(head || body || arms || legs)) return null;
  if (head && (y === 2 && (x === 5 || x === 8))) return 'e';
  if (body && y === 4) return 'l';
  if ((x + y * 3) % 11 === 0 && y > 4) return 'c';
  if (body && (x * 7 + y) % 9 === 0) return 'm';
  if (head && y === 0) return 'l';
  return (x + y) % 3 === 0 ? 'h' : 'b';
}, (x, y, v) => v);

export const SPRITE_DATA = {
  hero: {
    pal: PALETTE_HERO,
    rows: [
      '...oooooo...',
      '..ohhHHhho..',
      '.ohHHHHHHho.',
      '.ohHssssHho.',
      '.ohsessesho.',
      '.ohssssssho.',
      '..ossssssho.',
      '....ssss....',
      '...odddddo..',
      '..oddDDddo..',
      '..oDdddDdo..',
      '..ow....wo..',
      '..oo....oo..',
    ],
  },
  blob: {
    pal: PALETTE_BLOB,
    rows: [
      '....oooo....',
      '..ooLLLLoo..',
      '.oLLLLLLLLo.',
      '.oLeLLLLeLo.',
      'oLLLLLLLLLLo',
      'oLLLLLLLLLLo',
      'oMMLLLLLLMMo',
      'oMMMMMMMMMMo',
      'oDMMDMMDMMDo',
      '.oo..oo..oo.',
    ],
  },
  spitter: {
    pal: PALETTE_SPITTER,
    rows: [
      '....oooo....',
      '...oGGGGo...',
      '..oGGWWGGo..',
      '..oGWEEWGo..',
      '.oGGGGGGGGo.',
      '.oGGGGGGGGo.',
      '.oDDDDDDDDo.',
      '..oDDDDDDo..',
      '...ooooo....',
      '....o..o....',
      '...oo..oo...',
    ],
  },
  charger: {
    pal: PALETTE_CHARGER,
    rows: [
      'oYo......oYo',
      '..oooooooo..',
      '.oYYYYYYYYo.',
      'oYKKKKKKKKYo',
      'oYKeKKKKeKYo',
      'oKKKKKKKKKKo',
      'oKKKKKKKKKKo',
      '.oKKKKKKKKo.',
      '..oo.oo.oo..',
    ],
  },
  queen: {
    pal: PALETTE_QUEEN,
    rows: [
      '.G..G..G..G.',
      '.GGGGGGGGGG.',
      '..oLLLLLLo..',
      '.oLLLLLLLLo.',
      'oLLLeLLeLLLo',
      'oLMMMMMMMMLo',
      'oLMMMMMMMMLo',
      'oMMeMMMMeMMo',
      'oDMMMMMMMMDo',
      'oDDMMMMMMDDo',
      'oDDDDDDDDDDo',
      '.oDDDDDDDDo.',
      '..oo.oo.oo..',
    ],
  },
  bat: { pal: BAT_PAL, rows: bat },
  golem: { pal: GOLEM_PAL, rows: golem },
  thief: {
    pal: {
      o: '#0d0b1a', h: '#2c2648', H: '#463c70', e: '#7ff6ff', c: '#1f1a33', b: '#c9a227', w: '#0a0814',
    },
    rows: [
      'oooooooo',
      'ohhhhhho',
      'ohHHHHho',
      'oheeeeho',
      'ohhhhhho',
      'occcccco',
      'ocbbbbco',
      'occcccco',
      'occcccco',
      'occ..cco',
      'owo..owo',
      'oo....oo',
    ],
  },
  guard: {
    pal: {
      o: '#0d0b1a', k: '#1d3a6e', y: '#ffd166', s: '#f6c9a8', e: '#1a1030', d: '#274f8a', u: '#3f6fb8', w: '#1a1a2a',
    },
    rows: [
      'oooooooo',
      'okkkkkko',
      'okkyykko',
      'oossssoo',
      'osesesso',
      'osssssso',
      'odduuddo',
      'oduuuudo',
      'oduuuudo',
      'odd..ddo',
      'owo..owo',
      'oo....oo',
    ],
  },
  gem: {
    pal: { o: '#0d0b1a', G: '#2bb8d6', g: '#7ff6ff', w: '#ffffff' },
    rows: [
      '.oooo.',
      'ogwwgo',
      'oGGGGo',
      'oGGGGo',
      '.oGGo.',
      '..oo..',
    ],
  },
};

// Проверка при загрузке: все строки спрайта одной ширины, все символы есть в палитре.
export function validateSprites() {
  const problems = [];
  for (const [name, spr] of Object.entries(SPRITE_DATA)) {
    const w = spr.rows[0].length;
    spr.rows.forEach((row, i) => {
      if (row.length !== w) problems.push(`${name} row ${i}: длина ${row.length}, ожидали ${w}`);
      for (const ch of row) {
        if (ch !== '.' && !(ch in spr.pal)) problems.push(`${name}: символ «${ch}» нет в палитре`);
      }
    });
  }
  return problems;
}

const cache = new Map();

// Возвращает canvas с отрисованным спрайтом. flash=true - белый силуэт для вспышки урона.
export function spriteCanvas(name, flash = false) {
  const key = name + (flash ? ':flash' : '');
  if (cache.has(key)) return cache.get(key);
  const spr = SPRITE_DATA[name];
  const h = spr.rows.length;
  const w = spr.rows[0].length;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  spr.rows.forEach((row, y) => {
    for (let x = 0; x < w; x++) {
      const ch = row[x];
      if (ch === '.') continue;
      g.fillStyle = flash ? '#ffffff' : spr.pal[ch];
      g.fillRect(x, y, 1, 1);
    }
  });
  cache.set(key, c);
  return c;
}
