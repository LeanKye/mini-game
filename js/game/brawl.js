import { spriteCanvas } from './sprites.js';

// Бит-эм-ап: три улицы и финальный бой в храме. Героиня - пиксельные кадры из MUGEN,
// враги и фоны пока процедурные (их заменим, когда будут ассеты).

const VIEW_H = 320;
const MIN_W = 360;
const MAX_W = 760;
const WORLD_W = 1600;
const GROUND_TOP = 150;
const GROUND_BOT = 292;
const HERO_SCALE = 0.62;
const HERO_SPEED = 150;
const HERO_DEPTH_SPEED = 95;
const DASH_TIME = 0.22;
const DASH_SPEED = 420;
const DASH_CD = 0.7;
const HERO_HP_MAX = 100;
const HURT_TIME = 0.32;
const STUN_KNOCK = 40;

const ATTACKS = {
  jab: { anim: 'jab', dmg: 6, reach: 46, hitAt: 0.05, hitDur: 0.12, stun: 0.18, kb: 22 },
  punch2: { anim: 'punch2', dmg: 7, reach: 50, hitAt: 0.06, hitDur: 0.14, stun: 0.2, kb: 30 },
  kick: { anim: 'kick', dmg: 9, reach: 60, hitAt: 0.12, hitDur: 0.16, stun: 0.3, kb: 70 },
  uppercut: { anim: 'uppercut', dmg: 14, reach: 72, hitAt: 0.22, hitDur: 0.22, stun: 0.45, kb: 150 },
};
// одна кнопка: удары идут цепочкой, каждый следующий сильнее
const COMBO = ['jab', 'punch2', 'kick', 'uppercut'];
const COMBO_MUL = [1, 1.25, 1.55, 2.0];
const COMBO_WINDOW = 0.45;

const WEAPONS = [
  { id: 'pipe', name: 'Труба', dmgMul: 1.6, reachAdd: 14, uses: 6, col: '#9aa3b8', glyph: '▬' },
  { id: 'staff', name: 'Посох', dmgMul: 1.3, reachAdd: 30, uses: 8, col: '#c9a227', glyph: '/' },
  { id: 'katana', name: 'Катана', dmgMul: 2.0, reachAdd: 22, uses: 5, col: '#e6f1ff', glyph: '⚔' },
];

const ENEMY_DEF = {
  slime: { hp: 22, speed: 58, dmg: 8, reach: 38, windup: 0.5, cool: 1.1, scale: 3.4, sprite: 'blob', drop: 0.3 },
  bat: { hp: 14, speed: 100, dmg: 6, reach: 34, windup: 0.35, cool: 0.9, scale: 3.6, sprite: 'bat', drop: 0.2, fly: 46 },
  mushroom: { hp: 60, speed: 36, dmg: 14, reach: 46, windup: 0.8, cool: 1.7, scale: 4, sprite: 'spitter', drop: 0.6 },
  thug: { hp: 36, speed: 70, dmg: 11, reach: 44, windup: 0.6, cool: 1.0, scale: 1, sprite: null, frames: 'joe', drop: 0.35 },
  boss: { hp: 280, speed: 44, dmg: 16, reach: 64, windup: 0.8, cool: 1.4, scale: 5.4, sprite: 'golem', drop: 0 },
};

// История: Рин, искательница приключений, спускается в подземелье за древним свитком.
const STAGES = [
  {
    id: 'cave', title: 'Вход в пещеру', sub: 'Плющ, мох и сырость', sky: ['#0f2a24', '#1b4a40'],
    intro: [
      'Старая карта, потрёпанный рюкзак и слух, что под заброшенным монастырём спрятан древний свиток. Карта врёт, но я всё равно иду.',
      'Меня зовут Рин. Я искательница приключений, и если в подземелье есть опасность, значит, там точно есть что-то стоящее.',
      'Вход спрятан за плющом. Изнутри тянет холодом, а на стенах светится мох. Первые слизни уже ползут навстречу, будто давно ждали гостей.',
    ],
    waves: [['slime', 'slime', 'slime'], ['slime', 'bat', 'slime'], ['slime', 'slime', 'thug', 'bat']],
  },
  {
    id: 'river', title: 'Подземная река', sub: 'Шум воды и эхо', sky: ['#0b1c33', '#1f4e6e'],
    intro: [
      'Подземная река шумит так, будто говорит. Летучие мыши срываются с потолка, и эхо разносит их писк по всем залам.',
      'Чем глубже, тем чаще на стенах руны. Кто-то очень старался, чтобы сюда никто не добрался. Значит, я на верном пути.',
    ],
    waves: [['bat', 'bat', 'slime'], ['bat', 'thug', 'slime', 'slime'], ['bat', 'bat', 'bat', 'thug']],
  },
  {
    id: 'pillars', title: 'Залы колонн', sub: 'Камень шевелится', sky: ['#241a2e', '#4a3150'],
    intro: [
      'Колонны стоят ровными рядами, но карта перестала совпадать с залами. Камни сдвигаются, будто подземелье проверяет меня.',
      'Гриб-страж у выхода оказался живым. Он щёлкнул зубами и больше не выглядит дружелюбным.',
    ],
    waves: [['thug', 'slime', 'slime', 'bat'], ['thug', 'thug', 'bat', 'slime'], ['thug', 'bat', 'thug', 'slime', 'slime']],
  },
  {
    id: 'temple', title: 'Храм в глубине', sub: 'Голем у свитка', sky: ['#14101f', '#2e2244'], boss: true,
    intro: [
      'Круглый зал, а в центре постамент. На нём свиток, и от него по стенам бегут тёплые строки.',
      'Камень зашевелился. Между мной и свитком встаёт древний голем. Кажется, он охраняет не сокровище, а то, что написано внутри.',
    ],
    waves: [['slime', 'slime', 'bat'], ['boss']],
  },
];

const OUTRO = [
  'Голем рассыпался на осколки. Свиток лёг мне в руки и стал тёплым, как живой.',
  'Строки на нём начинают проявляться. Внизу подпись, которую я не могу прочитать. Но кто-то оставил её для меня.',
];

function rr(ctx, x, y, w, h, r) {
  const k = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + k, y);
  ctx.arcTo(x + w, y, x + w, y + h, k);
  ctx.arcTo(x + w, y + h, x, y + h, k);
  ctx.arcTo(x, y + h, x, y, k);
  ctx.arcTo(x, y, x + w, y, k);
  ctx.closePath();
}

// Загрузка кадров героини из manifest.json (после экспорта tools/export_hero.py)
export async function loadHeroFrames(base = 'assets/game/hero/') {
  const res = await fetch(base + 'manifest.json');
  const manifest = await res.json();
  const out = {};
  const loads = [];
  for (const [name, entry] of Object.entries(manifest)) {
    out[name] = entry.frames.map((f) => {
      const img = new Image();
      const ready = new Promise((resolve) => {
        img.onload = resolve;
        img.onerror = resolve;
      });
      img.src = base + f.file;
      loads.push(ready);
      return { img, dur: Math.max(0.03, (f.ticks || 4) / 60) };
    });
  }
  await Promise.all(loads);
  return out;
}

function makeBackground(stage) {
  const c = document.createElement('canvas');
  c.width = WORLD_W;
  c.height = VIEW_H;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, VIEW_H);
  grad.addColorStop(0, stage.sky[0]);
  grad.addColorStop(1, stage.sky[1]);
  g.fillStyle = grad;
  g.fillRect(0, 0, WORLD_W, VIEW_H);
  let seed = stage.id.length * 97 + 13;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  if (stage.id === 'cave') {
    // сталактиты и мох
    for (let x = 0; x < WORLD_W; x += 26 + rnd() * 30) {
      const h = 20 + rnd() * 60;
      g.fillStyle = '#0a1e1a';
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x + 14, 0);
      g.lineTo(x + 7, h);
      g.fill();
      if (rnd() > 0.5) {
        g.fillStyle = '#7fe0b4';
        g.fillRect(x + 6, h, 2, 3);
      }
    }
    for (let i = 0; i < 40; i++) {
      g.fillStyle = 'rgba(127,224,180,0.5)';
      g.fillRect(rnd() * WORLD_W, GROUND_TOP - 4 - rnd() * 60, 2, 2);
    }
  } else if (stage.id === 'river') {
    // вода, мосты и колонны над водой
    g.fillStyle = '#1d5b84';
    g.fillRect(0, GROUND_TOP - 30, WORLD_W, 26);
    g.fillStyle = 'rgba(180,230,255,0.35)';
    for (let x = 0; x < WORLD_W; x += 28) g.fillRect(x + (rnd() * 10), GROUND_TOP - 22 + rnd() * 8, 10, 2);
    for (let x = 80; x < WORLD_W; x += 300) {
      g.fillStyle = '#4d6d88';
      g.fillRect(x, 60, 18, GROUND_TOP - 60);
    }
  } else if (stage.id === 'pillars') {
    // ряды колонн с факелами
    for (let x = 30; x < WORLD_W; x += 150) {
      g.fillStyle = '#4a3a5a';
      g.fillRect(x, 40, 26, GROUND_TOP - 40);
      g.fillStyle = '#6a5a7a';
      g.fillRect(x - 6, 36, 38, 8);
      g.fillStyle = '#ffb347';
      g.beginPath();
      g.arc(x + 13, 96, 4 + rnd() * 2, 0, Math.PI * 2);
      g.fill();
    }
  } else {
    // храм: круглый алтарь, руны и свет
    g.fillStyle = 'rgba(255,224,102,0.12)';
    g.beginPath();
    g.arc(WORLD_W / 2, GROUND_TOP - 10, 240, 0, Math.PI * 2);
    g.fill();
    for (let x = 60; x < WORLD_W; x += 220) {
      g.fillStyle = '#3c2e56';
      g.fillRect(x, 30, 22, GROUND_TOP - 30);
    }
    for (let i = 0; i < 24; i++) {
      g.strokeStyle = 'rgba(255,224,102,0.35)';
      g.beginPath();
      g.arc(rnd() * WORLD_W, 40 + rnd() * 100, 6 + rnd() * 6, 0, Math.PI * 2);
      g.stroke();
    }
    g.fillStyle = '#4b3c66';
    g.beginPath();
    g.ellipse(WORLD_W / 2, GROUND_TOP + 30, 90, 24, 0, 0, Math.PI * 2);
    g.fill();
  }
  // пол
  g.fillStyle = stage.id === 'temple' ? '#4a3b66' : '#2e3a36';
  g.fillRect(0, GROUND_TOP, WORLD_W, VIEW_H - GROUND_TOP);
  g.strokeStyle = 'rgba(255,255,255,0.07)';
  g.lineWidth = 1;
  for (let y = GROUND_TOP; y < VIEW_H; y += 14) {
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(WORLD_W, y);
    g.stroke();
  }
  for (let x = 0; x < WORLD_W; x += 40) {
    g.beginPath();
    g.moveTo(x, GROUND_TOP);
    g.lineTo(x, VIEW_H);
    g.stroke();
  }
  return c;
}

export function createBrawl(canvas, { onHint, onWin } = {}) {
  const ctx = canvas.getContext('2d');
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
  let frames = null;
  const villainFrames = {};
  let stageIdx = 0;
  let bg = null;
  let st = null;
  let joy = null;
  const keys = {};
  const buttons = [];

  function setScale() {
    const rect = canvas.getBoundingClientRect();
    const cssW = rect.width || VIEW.w;
    const cssH = rect.height || (cssW * VIEW.h) / VIEW.w;
    canvas.width = Math.round(cssW * 2);
    canvas.height = Math.round(cssH * 2);
    W = canvas.width;
    H = canvas.height;
    VIEW.w = Math.max(MIN_W, Math.min(MAX_W, Math.round(VIEW.h * (W / H))));
    scale = Math.min(W / VIEW.w, H / VIEW.h);
    offX = (W - VIEW.w * scale) / 2;
    offY = (H - VIEW.h * scale) / 2;
    layoutButtons();
  }

  function layoutButtons() {
    buttons.length = 0;
    buttons.push({ id: 'attack', label: 'A', x: VIEW.w - 56, y: VIEW.h - 66, r: 32, col: '#ff7ab8' });
    buttons.push({ id: 'dash', label: '»', x: VIEW.w - 130, y: VIEW.h - 58, r: 24, col: '#c9b8ff' });
  }

  function newStage(index) {
    stageIdx = index;
    const stage = STAGES[index];
    bg = makeBackground(stage);
    st = {
      stage,
      cut: null,
      outroDone: false,
      hero: {
        x: 80,
        y: 230,
        face: 1,
        hp: HERO_HP_MAX,
        anim: 'idle',
        animT: 0,
        state: 'idle',
        stun: 0,
        dash: 0,
        dashCd: 0,
        comboT: 0,
        combo: 0,
        attack: null,
        attackT: 0,
        hitDone: false,
        queued: null,
        invuln: 0,
        weapon: null,
      },
      enemies: [],
      pickups: [],
      waves: stage.waves.slice(),
      waveNo: 0,
      spawnT: 0.9,
      camX: 0,
      transition: 0,
      dead: 0,
      kills: 0,
      hits: 0,
      banner: 0,
      floaters: [],
      difficulty: 1 + index * 0.15,
    };
    if (stage.intro && stage.intro.length) st.cut = { pages: stage.intro.slice(), i: 0, c: 0, onDone: null };
    if (onHint) onHint(`${stage.title}: ${stage.sub}`);
  }

  // Катсцена: текст печатается по буквам, нажатие сначала дописывает страницу, потом листает
  function cutAdvance() {
    const cut = st && st.cut;
    if (!cut) return;
    const text = cut.pages[cut.i];
    if (cut.c < text.length) {
      cut.c = text.length;
      return;
    }
    cut.i += 1;
    cut.c = 0;
    if (cut.i >= cut.pages.length) cutFinish();
  }

  function cutFinish() {
    const cut = st.cut;
    st.cut = null;
    if (cut && cut.onDone) cut.onDone();
  }

  function cutTick(dt) {
    const cut = st.cut;
    const text = cut.pages[cut.i];
    cut.c = Math.min(text.length, cut.c + dt * 38);
  }

  function animOf(name) {
    if (!frames || !frames[name] || !frames[name].length) return null;
    return frames[name];
  }

  function setAnim(hero, name) {
    hero.anim = name;
    hero.animT = 0;
  }

  function animDuration(name) {
    const list = animOf(name);
    if (!list) return 0.3;
    return list.reduce((s, f) => s + f.dur, 0);
  }

  function startAttack(idx) {
    const h = st.hero;
    const key = COMBO[idx];
    const def = ATTACKS[key];
    h.state = 'attack';
    h.comboIdx = idx;
    h.attack = key;
    h.attackT = 0;
    h.hitDone = false;
    h.queued = false;
    setAnim(h, def.anim);
  }

  // Кнопка атаки: в окне после удара запускает следующий в цепочке, иначе начинает сначала
  function tryAttack() {
    const h = st.hero;
    if (h.stun > 0 || h.state === 'dead' || h.state === 'dash') return;
    if (h.state === 'attack') {
      if (h.comboIdx < COMBO.length - 1) h.queued = true;
      return;
    }
    const next = h.comboT > 0 ? (h.comboIdx + 1) % COMBO.length : 0;
    startAttack(next);
  }

  function tryDash() {
    const h = st.hero;
    if (h.dashCd > 0 || h.state === 'dead' || h.stun > 0) return;
    h.state = 'dash';
    h.dash = DASH_TIME;
    h.dashCd = DASH_CD;
    h.invuln = DASH_TIME;
    setAnim(h, 'dash');
  }

  function weaponAdjust(def) {
    const w = st.hero.weapon;
    if (!w) return { dmg: def.dmg, reach: def.reach };
    return { dmg: def.dmg * w.dmgMul, reach: def.reach + w.reachAdd };
  }

  function damageEnemy(e, dmg, kb, stun) {
    e.hp -= dmg;
    e.hurt = stun;
    e.x += st.hero.face * kb * 0.25;
    e.flash = 0.12;
    st.hits += 1;
    st.floaters.push({ text: String(Math.round(dmg)), x: e.x, y: e.y - 64, life: 0.7, col: '#fff3b0' });
    if (e.hp <= 0 && e.state !== 'dead') killEnemy(e);
  }

  function killEnemy(e) {
    e.state = 'dead';
    e.deadT = 0.6;
    st.kills += 1;
    const def = ENEMY_DEF[e.type];
    if (def.drop && Math.random() < def.drop) {
      const w = WEAPONS[Math.floor(Math.random() * WEAPONS.length)];
      st.pickups.push({ w, x: e.x, y: e.y });
    }
  }

  function updateHero(dt) {
    const h = st.hero;
    if (h.state === 'dead') return;
    h.animT += dt;
    if (h.dashCd > 0) h.dashCd -= dt;
    if (h.invuln > 0) h.invuln -= dt;
    if (h.comboT > 0) h.comboT -= dt;
    if (h.stun > 0) {
      h.stun -= dt;
      if (h.stun <= 0 && h.state !== 'dead') {
        h.state = 'idle';
        setAnim(h, 'idle');
      }
      return;
    }
    if (h.state === 'dash') {
      h.dash -= dt;
      h.x += h.face * DASH_SPEED * dt;
      if (h.dash <= 0) {
        h.state = 'idle';
        setAnim(h, 'idle');
      }
    } else if (h.state === 'attack') {
      h.attackT += dt;
      const def = ATTACKS[h.attack];
      const dur = animDuration(def.anim);
      if (!h.hitDone && h.attackT >= def.hitAt) {
        h.hitDone = true;
        landHits(h, def);
      }
      if (h.attackT >= dur) {
        if (h.queued) {
          startAttack(h.comboIdx + 1);
        } else {
          h.state = 'idle';
          h.attack = null;
          h.comboT = COMBO_WINDOW;
          setAnim(h, 'idle');
        }
      }
    } else {
      // ходьба
      let mx = 0;
      let my = 0;
      if (joy) {
        const dx = joy.x - joy.ox;
        const dy = joy.y - joy.oy;
        const len = Math.hypot(dx, dy);
        if (len > 8) {
          mx = dx / len;
          my = dy / len;
        }
      }
      if (keys.left) mx -= 1;
      if (keys.right) mx += 1;
      if (keys.up) my -= 1;
      if (keys.down) my += 1;
      const len = Math.hypot(mx, my);
      if (len > 0) {
        mx /= len;
        my /= len;
        h.x += mx * HERO_SPEED * dt;
        h.y += my * HERO_DEPTH_SPEED * dt;
        if (Math.abs(mx) > 0.2) h.face = mx > 0 ? 1 : -1;
        if (h.anim !== 'walk') setAnim(h, 'walk');
      } else if (h.anim === 'walk') {
        setAnim(h, 'idle');
      }
    }
    h.x = Math.max(24, Math.min(WORLD_W - 24, h.x));
    h.y = Math.max(GROUND_TOP + 14, Math.min(GROUND_BOT, h.y));
  }

  function landHits(h, def) {
    const w = weaponAdjust(def);
    let hitAny = false;
    for (const e of st.enemies) {
      if (e.state === 'dead') continue;
      const dx = (e.x - h.x) * h.face;
      if (dx < -8 || dx > w.reach) continue;
      if (Math.abs(e.y - h.y) > 16) continue;
      damageEnemy(e, w.dmg * (COMBO_MUL[h.comboIdx] || 1), def.kb, def.stun);
      hitAny = true;
    }
    // оружие тратится только на попадании
    if (hitAny && h.weapon) {
      h.weapon.uses -= 1;
      if (h.weapon.uses <= 0) {
        st.floaters.push({ text: 'Оружие сломалось', x: h.x, y: h.y - 90, life: 1.2, col: '#ffb3c6' });
        h.weapon = null;
      }
    }
  }

  function spawnWave() {
    const wave = st.waves.shift();
    if (!wave) return;
    st.waveNo += 1;
    wave.forEach((type, i) => {
      const fromRight = (i + st.waveNo) % 2 === 0;
      const x = fromRight ? st.camX + VIEW.w + 30 + i * 26 : st.camX - 30 - i * 26;
      const y = GROUND_TOP + 30 + ((i * 47) % (GROUND_BOT - GROUND_TOP - 40));
      st.enemies.push(makeEnemy(type, Math.max(20, Math.min(WORLD_W - 20, x)), y));
    });
    st.banner = 1.4;
    st.bannerText = `Волна ${st.waveNo}`;
  }

  function makeEnemy(type, x, y) {
    const def = ENEMY_DEF[type];
    const mul = st.difficulty;
    return {
      type,
      x,
      y,
      hp: def.hp * mul,
      maxHp: def.hp * mul,
      state: 'approach',
      t: 0,
      hurt: 0,
      flash: 0,
      cd: Math.random() * 0.6,
      animT: 0,
      chargeCd: 2.5,
      deadT: 0,
      face: -1,
    };
  }

  function updateEnemies(dt) {
    const h = st.hero;
    for (const e of st.enemies) {
      const def = ENEMY_DEF[e.type];
      e.flash = Math.max(0, e.flash - dt);
      e.animT += dt;
      if (e.state === 'dead') {
        e.deadT -= dt;
        continue;
      }
      if (e.hurt > 0) {
        e.hurt -= dt;
        continue;
      }
      e.face = h.x > e.x ? 1 : -1;
      const dx = h.x - e.x;
      const dy = h.y - e.y;
      const dist = Math.hypot(dx, dy);
      e.cd -= dt;
      // босс: замах и рывок на героиню, рывок можно увернуть
      if (e.type === 'boss' && e.state === 'approach') {
        e.chargeCd -= dt;
        if (e.chargeCd <= 0 && Math.abs(dx) < 260) {
          e.state = 'charge_windup';
          e.t = 0.7;
        }
      }
      if (e.state === 'charge_windup') {
        e.t -= dt;
        if (e.t <= 0) {
          e.state = 'charge';
          e.t = 0.55;
          e.dirX = Math.sign(dx) || 1;
          e.hitDone = false;
        }
      } else if (e.state === 'charge') {
        e.t -= dt;
        e.x += e.dirX * 210 * dt;
        if (!e.hitDone && Math.abs(h.x - e.x) < 36 && Math.abs(dy) < 16 && h.invuln <= 0) {
          e.hitDone = true;
          hurtHero(def.dmg * st.difficulty * 1.3, e.x);
        }
        if (e.t <= 0) {
          e.state = 'approach';
          e.cd = def.cool;
          e.chargeCd = 4;
        }
      } else if (e.state === 'approach') {
        if (Math.abs(dx) > def.reach || Math.abs(dy) > 14) {
          const sp = def.speed * dt;
          e.x += Math.sign(dx) * Math.min(sp, Math.abs(dx));
          e.y += Math.sign(dy) * Math.min(sp * 0.6, Math.abs(dy));
        } else if (e.cd <= 0) {
          e.state = 'windup';
          e.t = def.windup * (1 / st.difficulty);
        }
      } else if (e.state === 'windup') {
        e.t -= dt;
        if (e.t <= 0) {
          const inReach = Math.abs(h.x - e.x) <= def.reach + 6 && Math.abs(dy) <= 16 && dist < def.reach + 40;
          if (inReach && h.invuln <= 0) {
            hurtHero(def.dmg * st.difficulty, e.x);
          }
          e.state = 'approach';
          e.cd = def.cool;
        }
      }
      e.x = Math.max(20, Math.min(WORLD_W - 20, e.x));
      e.y = Math.max(GROUND_TOP + 14, Math.min(GROUND_BOT, e.y));
    }
    st.enemies = st.enemies.filter((e) => e.state !== 'dead' || e.deadT > 0);
  }

  function hurtHero(dmg, fromX) {
    const h = st.hero;
    h.hp -= dmg;
    h.stun = HURT_TIME;
    h.state = 'hurt';
    h.attack = null;
    h.queued = false;
    h.comboT = 0;
    h.x += Math.sign(h.x - fromX) * STUN_KNOCK * 0.3;
    setAnim(h, 'hurt');
    h.flashT = 0.2;
    st.floaters.push({ text: `-${Math.round(dmg)}`, x: h.x, y: h.y - 90, life: 0.8, col: '#ff8fa3' });
    if (h.hp <= 0) {
      h.hp = 0;
      h.state = 'dead';
      st.dead = 1.6;
      setAnim(h, 'knock');
    }
  }

  function updatePickups() {
    const h = st.hero;
    st.pickups = st.pickups.filter((p) => {
      if (Math.abs(p.x - h.x) < 22 && Math.abs(p.y - h.y) < 16) {
        h.weapon = { ...p.w };
        st.floaters.push({ text: p.w.name, x: h.x, y: h.y - 90, life: 1.2, col: p.w.col });
        return false;
      }
      return true;
    });
  }

  function updateSpawning(dt) {
    if (st.transition > 0) return;
    const alive = st.enemies.some((e) => e.state !== 'dead');
    if (alive) return;
    if (st.waves.length) {
      st.spawnT -= dt;
      if (st.spawnT <= 0) {
        spawnWave();
        st.spawnT = 1.1;
      }
      return;
    }
    if (stageIdx === STAGES.length - 1) {
      if (!st.outroDone) {
        st.outroDone = true;
        st.cut = { pages: OUTRO.slice(), i: 0, c: 0, onDone: finishRun };
      }
    } else {
      st.transition = 2.4;
    }
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

  function updateCamera() {
    const target = st.hero.x - VIEW.w / 2;
    st.camX = Math.max(0, Math.min(WORLD_W - VIEW.w, target));
  }

  function step(dt) {
    if (!st) return;
    st.banner = Math.max(0, st.banner - dt);
    st.floaters.forEach((f) => (f.life -= dt));
    st.floaters = st.floaters.filter((f) => f.life > 0);
    if (st.hero.flashT > 0) st.hero.flashT -= dt;
    if (st.cut) {
      cutTick(dt);
      return;
    }
    if (st.dead > 0) {
      st.dead -= dt;
      if (st.dead <= 0) {
        newStage(stageIdx);
        if (onHint) onHint('Снова в бой: этап начат заново');
      }
      return;
    }
    if (st.transition > 0) {
      st.transition -= dt;
      if (st.transition <= 0 && !finished && stageIdx + 1 < STAGES.length) {
        newStage(stageIdx + 1);
      }
      return;
    }
    updateHero(dt);
    updateEnemies(dt);
    updatePickups();
    updateSpawning(dt);
    updateCamera();
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
    const dt = last ? Math.min(0.033, (ts - last) / 1000) : 1 / 60;
    last = ts;
    acc += dt;
    while (acc >= 1 / 60) {
      step(1 / 60);
      acc -= 1 / 60;
    }
    render(ts / 1000);
  }

  function drawFrame(name, x, y, flip, scale, tint) {
    const list = animOf(name);
    if (!list) return;
    const cyc = st.hero.animT;
    let t = 0;
    let idx = 0;
    const total = list.reduce((s, f) => s + f.dur, 0);
    const loop = name === 'idle' || name === 'walk' || name === 'dash' ? cyc % total : Math.min(cyc, total - 0.001);
    for (let i = 0; i < list.length; i++) {
      t += list[i].dur;
      if (loop < t) {
        idx = i;
        break;
      }
      idx = i;
    }
    const f = list[idx];
    const w = f.img.width * scale;
    const h = f.img.height * scale;
    ctx.save();
    ctx.translate(x, y);
    if (flip) ctx.scale(-1, 1);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(f.img, -w / 2, -h, w, h);
    if (tint) {
      ctx.globalCompositeOperation = 'source-atop';
      ctx.fillStyle = tint;
      ctx.fillRect(-w / 2, -h, w, h);
    }
    ctx.restore();
  }

  // Проигрывание списка кадров по времени: loop - зацикливать, иначе держать последний кадр
  function frameAt(list, time, loop) {
    const total = list.reduce((sum, f) => sum + f.dur, 0);
    let tt = loop ? time % total : Math.min(time, total - 0.001);
    for (const f of list) {
      if (tt < f.dur) return f;
      tt -= f.dur;
    }
    return list[list.length - 1];
  }

  // масштаб злодея: рост такой же, как у героини на экране
  function villainScale(set) {
    const hero = frames && frames.idle && frames.idle[0];
    const ref = set.idle && set.idle[0];
    if (!hero || !ref) return 1.2;
    return (hero.img.height * HERO_SCALE) / ref.img.height;
  }

  function drawVillain(e, def, t) {
    const set = villainFrames[def.frames];
    if (!set) return false;
    let anim = 'walk';
    let loop = true;
    if (e.state === 'dead') { anim = 'knock'; loop = false; }
    else if (e.hurt > 0) { anim = 'hurt'; loop = false; }
    else if (e.state === 'windup' || e.state === 'charge_windup') { anim = 'attack'; loop = false; }
    else if (e.state === 'charge') { anim = 'kick'; loop = true; }
    else if (e.state === 'approach' && Math.abs(st.hero.x - e.x) < 4) anim = 'idle';
    const list = set[anim] || set.idle || set.walk;
    if (!list || !list.length) return false;
    const f = frameAt(list, e.animT, loop);
    const k = villainScale(set);
    const w = f.img.width * k;
    const h = f.img.height * k;
    ctx.save();
    ctx.translate(e.x - st.camX, e.y + Math.sin(t * 6 + e.x) * 0.6);
    if (e.face > 0) ctx.scale(-1, 1);
    ctx.globalAlpha = e.state === 'dead' ? Math.max(0, e.deadT / 0.6) : 1;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(f.img, -w / 2, -h, w, h);
    if (e.flash > 0) {
      ctx.globalCompositeOperation = 'source-atop';
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.fillRect(-w / 2, -h, w, h);
    }
    ctx.restore();
    return true;
  }

  function drawEnemy(e, t) {
    const def = ENEMY_DEF[e.type];
    if (def.frames && drawVillain(e, def, t)) {
      if (e.hp < e.maxHp && e.state !== 'dead') {
        const bw = 34;
        const hh = 110;
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        rr(ctx, e.x - st.camX - bw / 2, e.y - hh, bw, 5, 2);
        ctx.fill();
        ctx.fillStyle = '#7bd88f';
        rr(ctx, e.x - st.camX - bw / 2, e.y - hh, bw * Math.max(0, e.hp / e.maxHp), 5, 2);
        ctx.fill();
      }
      return;
    }
    const img = spriteCanvas(def.sprite, e.flash > 0);
    const w = img.width * def.scale;
    const h = img.height * def.scale;
    const bob = e.state === 'dead' ? 0 : Math.sin(t * 6 + e.x) * 0.8;
    ctx.save();
    const air = def.fly ? -def.fly * 0.5 + Math.sin(t * 9 + e.x) * 6 : 0;
    ctx.translate(e.x - st.camX, e.y + bob + air);
    if (e.face > 0) ctx.scale(-1, 1);
    ctx.globalAlpha = e.state === 'dead' ? Math.max(0, e.deadT / 0.6) : 1;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, -w / 2, -h, w, h);
    ctx.restore();
    if (e.state === 'windup') {
      ctx.fillStyle = 'rgba(255,80,90,0.85)';
      ctx.font = "bold 14px 'Nunito', sans-serif";
      ctx.textAlign = 'center';
      ctx.fillText('!', e.x - st.camX, e.y - h - 6);
    }
    if (e.hp < e.maxHp && e.state !== 'dead') {
      const bw = 34;
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      rr(ctx, e.x - st.camX - bw / 2, e.y - h - 12, bw, 5, 2);
      ctx.fill();
      ctx.fillStyle = '#7bd88f';
      rr(ctx, e.x - st.camX - bw / 2, e.y - h - 12, bw * Math.max(0, e.hp / e.maxHp), 5, 2);
      ctx.fill();
    }
  }

  function render(t) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#0c0a18';
    ctx.fillRect(0, 0, W, H);
    ctx.setTransform(scale, 0, 0, scale, offX, offY);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, VIEW.w, VIEW.h);
    ctx.clip();
    if (bg) ctx.drawImage(bg, -st.camX, 0);
    // пикапы
    for (const p of st.pickups) {
      ctx.fillStyle = p.w.col;
      ctx.font = "bold 16px 'Nunito', sans-serif";
      ctx.textAlign = 'center';
      ctx.fillText(p.w.glyph, p.x - st.camX, p.y - 4 + Math.sin(t * 4) * 2);
    }
    // тени и враги, сортировка по глубине
    const drawables = [
      ...st.enemies.map((e) => ({ y: e.y, draw: () => drawEnemy(e, t) })),
      { y: st.hero.y, draw: () => drawHero(t) },
    ].sort((a, b) => a.y - b.y);
    for (const d of drawables) {
      d.draw();
    }
    for (const f of st.floaters) {
      ctx.globalAlpha = Math.min(1, f.life * 1.5);
      ctx.fillStyle = f.col;
      ctx.font = "bold 13px 'Nunito', sans-serif";
      ctx.textAlign = 'center';
      ctx.fillText(f.text, f.x - st.camX, f.y);
      ctx.globalAlpha = 1;
    }
    ctx.restore();
    drawHud(t);
    drawControls();
    if (st.cut) drawDialogue();
    if (st.transition > 0) drawTitle(st.stage.title, st.stage.sub, 'Следующий этап');
    if (st.dead > 0) drawTitle('Поражение', 'Этап начнётся заново', null, 'rgba(60,8,24,0.6)');
    if (finished) drawTitle('Храм побеждён', 'Ты дошла до конца', null, 'rgba(20,40,30,0.55)');
  }

  function drawHero(t) {
    const h = st.hero;
    const x = h.x - st.camX;
    const flash = h.flashT > 0;
    if (h.invuln > 0 && Math.floor(h.invuln * 25) % 2 === 0) return;
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(x, h.y, 16, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = flash ? 0.45 : 1;
    drawFrame(h.anim, x, h.y, h.face < 0, HERO_SCALE, null);
    ctx.globalAlpha = 1;
    if (h.weapon) {
      ctx.fillStyle = h.weapon.col;
      ctx.font = "bold 16px 'Nunito', sans-serif";
      ctx.textAlign = 'center';
      ctx.fillText(h.weapon.glyph, x + h.face * 20, h.y - 40);
    }
  }

  function drawHud() {
    ctx.setTransform(scale, 0, 0, scale, offX, offY);
    ctx.fillStyle = 'rgba(15,12,35,0.75)';
    rr(ctx, 10, 10, 150, 26, 10);
    ctx.fill();
    ctx.fillStyle = '#ff7ab8';
    rr(ctx, 16, 17, 138 * Math.max(0, st.hero.hp / HERO_HP_MAX), 12, 6);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = "bold 12px 'Nunito', sans-serif";
    ctx.textAlign = 'left';
    ctx.fillText(`${st.stage.title} · волна ${st.waveNo}`, 170, 24);
    if (st.hero.comboIdx > 0 && (st.hero.state === 'attack' || st.hero.comboT > 0)) {
      ctx.fillStyle = '#ffe066';
      ctx.font = "bold 14px 'Nunito', sans-serif";
      ctx.fillText(`Комбо x${st.hero.comboIdx + 1}`, 170, 46);
    }
    if (st.hero.weapon) {
      ctx.fillStyle = 'rgba(15,12,35,0.75)';
      rr(ctx, 10, 42, 150, 22, 10);
      ctx.fill();
      ctx.fillStyle = st.hero.weapon.col;
      ctx.fillText(`${st.hero.weapon.name}: ${st.hero.weapon.uses}`, 18, 57);
    }
    if (st.banner > 0 && st.bannerText) {
      ctx.fillStyle = 'rgba(40,20,70,0.8)';
      rr(ctx, VIEW.w / 2 - 70, 70, 140, 26, 10);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.fillText(st.bannerText, VIEW.w / 2, 87);
    }
    ctx.textAlign = 'left';
  }

  function drawControls() {
    ctx.setTransform(scale, 0, 0, scale, offX, offY);
    for (const b of buttons) {
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = 'rgba(20,14,40,0.6)';
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = b.col;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = b.col;
      ctx.font = "bold 14px 'Nunito', sans-serif";
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(b.label, b.x, b.y);
      ctx.globalAlpha = 1;
    }
    if (joy) {
      ctx.fillStyle = 'rgba(255,255,255,0.2)';
      ctx.beginPath();
      ctx.arc(joy.ox, joy.oy, 40, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function wrapWords(text, maxW) {
    const lines = [];
    let line = '';
    for (const w of text.split(' ')) {
      const test = line ? `${line} ${w}` : w;
      if (ctx.measureText(test).width > maxW && line) {
        lines.push(line);
        line = w;
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);
    return lines;
  }

  function drawDialogue() {
    const cut = st.cut;
    const full = cut.pages[cut.i];
    const shown = full.slice(0, Math.floor(cut.c));
    ctx.setTransform(scale, 0, 0, scale, offX, offY);
    ctx.fillStyle = 'rgba(8,6,20,0.25)';
    ctx.fillRect(0, 0, VIEW.w, VIEW.h);
    const bx = 14;
    const bw = VIEW.w - 28;
    const bh = 112;
    const by = VIEW.h - bh - 10;
    ctx.fillStyle = 'rgba(18,12,36,0.94)';
    rr(ctx, bx, by, bw, bh, 14);
    ctx.fill();
    ctx.strokeStyle = '#c9b8ff';
    ctx.lineWidth = 2;
    rr(ctx, bx, by, bw, bh, 14);
    ctx.stroke();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#ffe066';
    ctx.font = "bold 13px 'Nunito', sans-serif";
    ctx.fillText(st.stage.title, bx + 14, by + 20);
    ctx.fillStyle = '#ffffff';
    ctx.font = "600 13px 'Nunito', sans-serif";
    const lines = wrapWords(shown, bw - 28);
    lines.slice(0, 5).forEach((ln, i) => ctx.fillText(ln, bx + 14, by + 42 + i * 17));
    if (cut.c >= full.length) {
      ctx.fillStyle = '#ffe066';
      ctx.textAlign = 'right';
      ctx.fillText('▶', bx + bw - 14, by + bh - 12);
    }
    // пропуск катсцены
    ctx.fillStyle = 'rgba(18,12,36,0.85)';
    rr(ctx, VIEW.w - 104, 10, 94, 24, 10);
    ctx.fill();
    ctx.fillStyle = '#c9b8ff';
    ctx.font = "bold 11px 'Nunito', sans-serif";
    ctx.textAlign = 'center';
    ctx.fillText('пропустить', VIEW.w - 57, 26);
  }

  function drawTitle(title, sub, hint, bg2) {
    ctx.setTransform(scale, 0, 0, scale, offX, offY);
    ctx.fillStyle = bg2 || 'rgba(15,12,35,0.6)';
    ctx.fillRect(0, 0, VIEW.w, VIEW.h);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    ctx.font = "800 26px 'Nunito', sans-serif";
    ctx.fillText(title, VIEW.w / 2, VIEW.h / 2 - 14);
    ctx.font = "600 14px 'Nunito', sans-serif";
    ctx.fillText(sub, VIEW.w / 2, VIEW.h / 2 + 14);
    if (hint) {
      ctx.fillStyle = '#ffe066';
      ctx.fillText(hint, VIEW.w / 2, VIEW.h / 2 + 40);
    }
  }

  function toLogical(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const px = (clientX - rect.left) * (canvas.width / rect.width);
    const py = (clientY - rect.top) * (canvas.height / rect.height);
    return { x: (px - offX) / scale, y: (py - offY) / scale };
  }

  function pressButton(id) {
    if (id === 'dash') tryDash();
    else tryAttack();
  }

  function onPointerDown(e) {
    e.preventDefault();
    if (!st) return;
    const q = toLogical(e.clientX, e.clientY);
    if (st.cut) {
      if (q.x > VIEW.w - 110 && q.y < 40) cutFinish();
      else cutAdvance();
      return;
    }
    for (const b of buttons) {
      if (Math.hypot(q.x - b.x, q.y - b.y) <= b.r + 6) {
        pressButton(b.id);
        return;
      }
    }
    if (q.x < VIEW.w * 0.5) joy = { id: e.pointerId, ox: q.x, oy: q.y, x: q.x, y: q.y };
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

  const KEYMAP = { j: 'attack', ' ': 'dash', shift: 'dash' };
  function onKeyDown(e) {
    const k = e.key.toLowerCase();
    if (st && st.cut) {
      if (['enter', ' ', 'j', 'k', 'l', 'z'].includes(k)) {
        e.preventDefault();
        cutAdvance();
      }
      return;
    }
    if (k === 'arrowleft' || k === 'a') keys.left = true;
    else if (k === 'arrowright' || k === 'd') keys.right = true;
    else if (k === 'arrowup' || k === 'w') keys.up = true;
    else if (k === 'arrowdown' || k === 's') keys.down = true;
    else if (KEYMAP[k]) {
      e.preventDefault();
      pressButton(KEYMAP[k]);
    }
  }
  function onKeyUp(e) {
    const k = e.key.toLowerCase();
    if (k === 'arrowleft' || k === 'a') keys.left = false;
    else if (k === 'arrowright' || k === 'd') keys.right = false;
    else if (k === 'arrowup' || k === 'w') keys.up = false;
    else if (k === 'arrowdown' || k === 's') keys.down = false;
  }
  const onBlur = () => {
    keys.left = keys.right = keys.up = keys.down = false;
    joy = null;
  };

  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('resize', setScale);

  setScale();
  newStage(0);
  loadHeroFrames('assets/game/villain/joe/')
    .then((f) => {
      villainFrames.joe = f;
    })
    .catch(() => {});
  loadHeroFrames()
    .then((f) => {
      frames = f;
      setAnim(st.hero, 'idle');
    })
    .catch(() => {
      frames = null;
      if (onHint) onHint('Не удалось загрузить кадры героини');
    });

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
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('resize', setScale);
    },
    win() {
      finishRun();
    },
    getState() {
      return {
        stage: stageIdx + 1,
        stages: STAGES.length,
        hp: st ? st.hero.hp : 0,
        kills: st ? st.kills : 0,
        finished,
      };
    },
    test: {
      stage: () => stageIdx + 1,
      hp: () => (st ? st.hero.hp : -1),
      enemies: () => (st ? st.enemies.filter((e) => e.state !== 'dead').length : -1),
      killAll: () => {
        if (!st) return;
        for (const e of st.enemies) {
          if (e.state === 'dead') continue;
          e.hp = 0;
          killEnemy(e);
        }
        st.waves = [];
      },
      nextStage: () => {
        if (st) {
          st.waves = [];
          st.enemies = [];
          st.transition = 0.01;
        }
      },
      hurtHero: (n) => st && hurtHero(n, st.hero.x),
      skipCut: () => {
        if (st && st.cut) cutFinish();
      },
      attack: () => tryAttack(),
      state: () => (st ? st.hero.state : null),
      combo: () => (st ? st.hero.comboIdx + 1 : 0),
      weapon: () => (st && st.hero.weapon ? st.hero.weapon.id : null),
      giveWeapon: (id) => {
        if (st) st.hero.weapon = { ...WEAPONS.find((w) => w.id === id) };
      },
    },
  };
}
