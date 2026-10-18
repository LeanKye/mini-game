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
