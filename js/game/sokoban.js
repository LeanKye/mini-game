// Сокобан: толкаем ящики на цели. Шесть уровней с ростом сложности.
// Управление: свайп/протяжка пальцем по полю или стрелки/WASD.
// Кнопки внизу: «Отменить» и «Заново».

const VIEW_H = 512;
const MIN_W = 360;
const MAX_W = 760;
const STEP_PX = 26; // сколько нужно протянуть палец, чтобы сделать шаг

// Уровни: '#' - стена, ' ' - пол, '$' - ящик, '.' - цель,
// '*' - ящик на цели, '@' - игрок, '+' - игрок на цели.
// Раскладки взяты из классических наборов и проверены на решаемость.
export const SOKOBAN_LEVELS = [
  {
    name: 'Разминка',
    rows: [
      '#######',
      '#     #',
      '# @$ .#',
      '#     #',
      '#######',
    ],
  },
  {
    name: 'Два ящика',
    rows: [
      '########',
      '#  . . #',
      '#  $ $ #',
      '#  @   #',
      '########',
    ],
  },
  {
    name: 'Три ящика',
    rows: [
      '#########',
      '#       #',
      '# . . . #',
      '# $ $ $ #',
      '#   @   #',
      '#########',
    ],
  },
  {
    name: 'В закоулках',
    rows: [
      '##########',
      '#        #',
      '# #####  #',
      '# #   #  #',
      '# # $ #  #',
      '#   $    #',
      '# .   .  #',
      '#   @    #',
      '##########',
    ],
  },
  {
    name: 'Коридор',
    rows: [
      '##########',
      '#     #  #',
      '# $   #  #',
      '#  $  #  #',
      '#   $ #  #',
      '# . . .  #',
      '#  @     #',
      '##########',
    ],
  },
  {
    name: 'Погрузка',
    rows: [
      '##########',
      '#        #',
      '# .    . #',
      '# $    $ #',
      '#        #',
      '#   ##   #',
      '#        #',
      '# $    $ #',
      '# .    . #',
      '#   @    #',
      '##########',
    ],
  },
];

export function createSokoban(canvas, { onHint, onWin } = {}) {
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

  let stageIdx = 0;
  let cols = 0;
  let rows = 0;
  let wall = [];
  let goals = new Set();
  let boxes = new Set();
  let player = 0;
  let moves = 0;
  let pushes = 0;
  let history = [];
  let winT = 0;
  let toast = '';
  let toastT = 0;

  const DIRS = {
    up: [0, -1],
    down: [0, 1],
    left: [-1, 0],
    right: [1, 0],
  };

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
  }

  function parse(rowsIn) {
    rows = rowsIn.length;
    cols = Math.max(...rowsIn.map((r) => r.length));
    wall = [];
    goals = new Set();
    boxes = new Set();
    player = 0;
    for (let y = 0; y < rows; y++) {
      const line = rowsIn[y].padEnd(cols, ' ');
      for (let x = 0; x < cols; x++) {
        const ch = line[x];
        const id = y * cols + x;
        wall[id] = ch === '#';
        if (ch === '$' || ch === '*') boxes.add(id);
        if (ch === '.' || ch === '*' || ch === '+') goals.add(id);
        if (ch === '@' || ch === '+') player = id;
      }
    }
  }

  function loadStage(i) {
    stageIdx = i;
    parse(SOKOBAN_LEVELS[i].rows);
    moves = 0;
    pushes = 0;
    history = [];
    winT = 0;
    swipe = null;
    if (onHint) onHint(`Уровень ${i + 1} из ${SOKOBAN_LEVELS.length}: ${SOKOBAN_LEVELS[i].name}`);
  }

  function isWall(id) {
    return id < 0 || id >= cols * rows || wall[id];
  }

  function solvedNow() {
    for (const g of goals) if (!boxes.has(g)) return false;
    return true;
  }

  function snapshot() {
    history.push({ player, boxes: [...boxes], moves, pushes });
    if (history.length > 400) history.shift();
  }

  // Возвращает true, если шаг удался (сдвинулся или толкнул)
  function move(dir) {
    if (winT > 0 || finished) return false;
    const d = DIRS[dir];
    if (!d) return false;
    const [dx, dy] = d;
    const nx = (player % cols) + dx;
    const ny = Math.floor(player / cols) + dy;
    if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) return false;
    const target = ny * cols + nx;
    if (isWall(target)) return false;
    if (boxes.has(target)) {
      const bx = nx + dx;
      const by = ny + dy;
      if (bx < 0 || bx >= cols || by < 0 || by >= rows) return false;
      const beyond = by * cols + bx;
      if (isWall(beyond) || boxes.has(beyond)) return false;
      snapshot();
      boxes.delete(target);
      boxes.add(beyond);
      player = target;
      moves += 1;
      pushes += 1;
    } else {
      snapshot();
      player = target;
      moves += 1;
    }
    if (solvedNow()) {
      winT = 1.1;
      toast = stageIdx + 1 < SOKOBAN_LEVELS.length ? 'Готово! Следующий уровень' : 'Все уровни пройдены!';
      toastT = 1.1;
    }
    return true;
  }

  function undo() {
    if (winT > 0 || finished || !history.length) return;
    const h = history.pop();
    player = h.player;
    boxes = new Set(h.boxes);
    moves = h.moves;
    pushes = h.pushes;
  }

  function restart() {
    if (winT > 0 || finished) return;
    loadStage(stageIdx);
  }

  function step(dt) {
    if (hold) {
      hold.t -= dt;
      if (hold.t <= 0) {
        move(hold.dir);
        hold.t = 0.14;
      }
    }
    if (toastT > 0) toastT -= dt;
    if (winT > 0) {
      winT -= dt;
      if (winT <= 0) {
        if (stageIdx + 1 < SOKOBAN_LEVELS.length) loadStage(stageIdx + 1);
        else finishRun();
      }
    }
  }

  function finishRun() {
    if (finished) return;
    finished = true;
    setTimeout(() => {
      if (onWin) onWin();
    }, 700);
    setTimeout(() => {
      running = false;
      if (raf) cancelAnimationFrame(raf);
    }, 900);
  }

  function board() {
    const pad = 16;
    const top = 100;
    const bottom = 176;
    const availW = VIEW.w - pad * 2;
    const availH = VIEW.h - top - bottom;
    const cell = Math.max(8, Math.floor(Math.min(availW / cols, availH / rows)));
    const bw = cell * cols;
    const bh = cell * rows;
    const ox = Math.round((VIEW.w - bw) / 2);
    const oy = Math.round(top + (availH - bh) / 2);
    return { cell, ox, oy, bw, bh };
  }

  // Экранный крест-джойстик и кнопки «Отменить»/«Заново».
  function controls() {
    const b = 56;
    const g = 8;
    const cx = VIEW.w / 2;
    const yTop = VIEW.h - 162;
    const row2 = yTop + b + g;
    const arrows = [
      { dir: 'up', x: Math.round(cx - b / 2), y: yTop, w: b, h: b },
      { dir: 'left', x: Math.round(cx - b / 2 - b - g), y: row2, w: b, h: b },
      { dir: 'down', x: Math.round(cx - b / 2), y: row2, w: b, h: b },
      { dir: 'right', x: Math.round(cx + b / 2 + g), y: row2, w: b, h: b },
    ];
    const bw = Math.round((VIEW.w - 48) / 2);
    const undoBtn = { act: 'undo', x: 16, y: VIEW.h - 40, w: bw, h: 30 };
    const restartBtn = { act: 'restart', x: VIEW.w - 16 - bw, y: VIEW.h - 40, w: bw, h: 30 };
    return { arrows, undoBtn, restartBtn };
  }

  function inside(btn, q) {
    return q.x >= btn.x && q.x <= btn.x + btn.w && q.y >= btn.y && q.y <= btn.y + btn.h;
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

  function drawWall(x, y, s) {
    ctx.fillStyle = '#4a3a78';
    rr(x, y, s, s, 4);
    ctx.fill();
    ctx.fillStyle = '#3a2a6a';
    rr(x + 2, y + 2, s - 4, s - 4, 3);
    ctx.fill();
    ctx.strokeStyle = 'rgba(20,10,40,0.7)';
    ctx.lineWidth = 1;
    rr(x + 0.5, y + 0.5, s - 1, s - 1, 4);
    ctx.stroke();
  }

  function drawFloor(x, y, s) {
    ctx.fillStyle = 'rgba(255,255,255,0.04)';
    rr(x + 0.5, y + 0.5, s - 1, s - 1, 3);
    ctx.fill();
  }

  function drawGoal(x, y, s) {
    const cx = x + s / 2;
    const cy = y + s / 2;
    ctx.strokeStyle = '#ffe066';
    ctx.lineWidth = Math.max(2, s * 0.08);
    ctx.beginPath();
    ctx.arc(cx, cy, s * 0.24, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,224,102,0.25)';
    ctx.beginPath();
    ctx.arc(cx, cy, s * 0.1, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawBox(x, y, s, onGoal) {
    const inset = Math.max(2, s * 0.1);
    const bx = x + inset;
    const by = y + inset;
    const bs = s - inset * 2;
    ctx.fillStyle = onGoal ? '#3fbf8a' : '#c98a3c';
    rr(bx, by, bs, bs, Math.max(2, s * 0.14));
    ctx.fill();
    ctx.strokeStyle = onGoal ? '#7dffc4' : '#8a5a24';
    ctx.lineWidth = Math.max(1.5, s * 0.06);
    rr(bx, by, bs, bs, Math.max(2, s * 0.14));
    ctx.stroke();
    ctx.strokeStyle = 'rgba(40,24,10,0.45)';
    ctx.lineWidth = Math.max(1, s * 0.05);
    ctx.beginPath();
    ctx.moveTo(bx + bs * 0.18, by + bs * 0.18);
    ctx.lineTo(bx + bs * 0.82, by + bs * 0.82);
    ctx.moveTo(bx + bs * 0.82, by + bs * 0.18);
    ctx.lineTo(bx + bs * 0.18, by + bs * 0.82);
    ctx.stroke();
  }

  function drawPlayer(x, y, s) {
    const cx = x + s / 2;
    const cy = y + s / 2;
    const r = s * 0.34;
    ctx.fillStyle = '#ff7ab8';
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#d9568f';
    ctx.lineWidth = Math.max(1.5, s * 0.05);
    ctx.stroke();
    ctx.fillStyle = '#2b1d3d';
    const er = Math.max(1.2, s * 0.05);
    ctx.beginPath();
    ctx.arc(cx - r * 0.35, cy - r * 0.15, er, 0, Math.PI * 2);
    ctx.arc(cx + r * 0.35, cy - r * 0.15, er, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#2b1d3d';
    ctx.lineWidth = Math.max(1.2, s * 0.04);
    ctx.beginPath();
    ctx.arc(cx, cy + r * 0.2, r * 0.45, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.stroke();
  }

  function drawButton(label, x, y, w, col) {
    ctx.fillStyle = 'rgba(20,14,40,0.85)';
    rr(x, y, w, 30, 10);
    ctx.fill();
    ctx.strokeStyle = col;
    ctx.lineWidth = 2;
    rr(x, y, w, 30, 10);
    ctx.stroke();
    ctx.fillStyle = col;
    ctx.font = "bold 13px 'Nunito', sans-serif";
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x + w / 2, y + 15);
  }

  function drawPad(btn, glyph) {
    ctx.fillStyle = 'rgba(20,14,40,0.9)';
    rr(btn.x, btn.y, btn.w, btn.h, 12);
    ctx.fill();
    ctx.strokeStyle = '#c9b8ff';
    ctx.lineWidth = 2;
    rr(btn.x, btn.y, btn.w, btn.h, 12);
    ctx.stroke();
    ctx.fillStyle = '#e6dcff';
    ctx.font = `${Math.round(btn.h * 0.46)}px 'Nunito', sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(glyph, btn.x + btn.w / 2, btn.y + btn.h / 2 + 1);
  }

  const PAD_GLYPH = { up: '▲', down: '▼', left: '◀', right: '▶' };

  function render() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#0f0b1f';
    ctx.fillRect(0, 0, W, H);
    ctx.setTransform(scale, 0, 0, scale, offX, offY);
    const bg = ctx.createLinearGradient(0, 0, 0, VIEW.h);
    bg.addColorStop(0, '#2a1c4d');
    bg.addColorStop(1, '#1a1333');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, VIEW.w, VIEW.h);

    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = "bold 18px 'Nunito', sans-serif";
    ctx.fillText(`Уровень ${stageIdx + 1} из ${SOKOBAN_LEVELS.length} · ${SOKOBAN_LEVELS[stageIdx].name}`, VIEW.w / 2, 42);
    ctx.font = "600 13px 'Nunito', sans-serif";
    ctx.fillStyle = '#d9cdf5';
    ctx.fillText('Жми стрелки на экране, чтобы толкнуть ящик на цель', VIEW.w / 2, 70);
    ctx.fillStyle = '#b9a8e0';
    ctx.font = "600 12px 'Nunito', sans-serif";
    ctx.fillText(`Шагов: ${moves} · Толчков: ${pushes}`, VIEW.w / 2, 90);

    const { cell, ox, oy, bw, bh } = board();
    ctx.fillStyle = 'rgba(10,6,24,0.55)';
    rr(ox - 6, oy - 6, bw + 12, bh + 12, 10);
    ctx.fill();

    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const id = y * cols + x;
        const px = ox + x * cell;
        const py = oy + y * cell;
        if (wall[id]) drawWall(px, py, cell);
        else {
          drawFloor(px, py, cell);
          if (goals.has(id) && !boxes.has(id)) drawGoal(px, py, cell);
        }
      }
    }

    for (const b of boxes) {
      const px = ox + (b % cols) * cell;
      const py = oy + Math.floor(b / cols) * cell;
      drawBox(px, py, cell, goals.has(b));
    }

    drawPlayer(ox + (player % cols) * cell, oy + Math.floor(player / cols) * cell, cell);

    const ctrls = controls();
    for (const a of ctrls.arrows) drawPad(a, PAD_GLYPH[a.dir]);
    drawButton('Отменить', ctrls.undoBtn.x, ctrls.undoBtn.y, ctrls.undoBtn.w, '#c9b8ff');
    drawButton('Заново', ctrls.restartBtn.x, ctrls.restartBtn.y, ctrls.restartBtn.w, '#ffb3c6');

    if (toastT > 0 || winT > 0) {
      ctx.fillStyle = 'rgba(20,14,40,0.82)';
      rr(VIEW.w / 2 - 130, VIEW.h / 2 - 22, 260, 44, 14);
      ctx.fill();
      ctx.fillStyle = '#7dffc4';
      ctx.font = "bold 16px 'Nunito', sans-serif";
      ctx.fillText(toast, VIEW.w / 2, VIEW.h / 2);
    }
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
    render();
  }

  function toLogical(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const px = (clientX - rect.left) * (canvas.width / rect.width);
    const py = (clientY - rect.top) * (canvas.height / rect.height);
    return { x: (px - offX) / scale, y: (py - offY) / scale };
  }

  let swipe = null;
  let hold = null;

  function onPointerDown(e) {
    e.preventDefault();
    if (!cols) return;
    const q = toLogical(e.clientX, e.clientY);
    const ctrls = controls();
    for (const a of ctrls.arrows) {
      if (inside(a, q)) {
        move(a.dir);
        hold = { id: e.pointerId, dir: a.dir, t: 0.18 };
        return;
      }
    }
    if (inside(ctrls.undoBtn, q)) {
      undo();
      return;
    }
    if (inside(ctrls.restartBtn, q)) {
      restart();
      return;
    }
    swipe = { id: e.pointerId, x: q.x, y: q.y };
  }

  function onPointerMove(e) {
    if (!swipe || e.pointerId !== swipe.id) return;
    const q = toLogical(e.clientX, e.clientY);
    let dx = q.x - swipe.x;
    let dy = q.y - swipe.y;
    if (Math.abs(dx) < STEP_PX && Math.abs(dy) < STEP_PX) return;
    if (Math.abs(dx) > Math.abs(dy)) {
      move(dx > 0 ? 'right' : 'left');
    } else {
      move(dy > 0 ? 'down' : 'up');
    }
    swipe.x = q.x;
    swipe.y = q.y;
  }

  function onPointerUp(e) {
    if (hold && e.pointerId === hold.id) hold = null;
    if (swipe && e.pointerId === swipe.id) swipe = null;
  }

  function onKeyDown(e) {
    const k = e.key.toLowerCase();
    let dir = null;
    if (k === 'arrowleft' || k === 'a') dir = 'left';
    else if (k === 'arrowright' || k === 'd') dir = 'right';
    else if (k === 'arrowup' || k === 'w') dir = 'up';
    else if (k === 'arrowdown' || k === 's') dir = 'down';
    else if (k === 'z' || k === 'backspace') {
      e.preventDefault();
      undo();
      return;
    } else if (k === 'r') {
      restart();
      return;
    }
    if (dir) {
      e.preventDefault();
      move(dir);
    }
  }

  const onBlur = () => {
    swipe = null;
    hold = null;
  };

  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('blur', onBlur);
  window.addEventListener('resize', setScale);

  setScale();
  loadStage(0);

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
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('resize', setScale);
    },
    win() {
      finishRun();
    },
    getState() {
      let onGoal = 0;
      for (const g of goals) if (boxes.has(g)) onGoal += 1;
      return { stage: stageIdx + 1, stages: SOKOBAN_LEVELS.length, moves, pushes, onGoal, goals: goals.size, finished };
    },
    test: {
      stage: () => stageIdx + 1,
      state: () => ({ stage: stageIdx + 1, moves, pushes, player, boxes: [...boxes].sort((a, b) => a - b), goals: [...goals].sort((a, b) => a - b) }),
      moves: () => moves,
      player: () => player,
      boxes: () => [...boxes].sort((a, b) => a - b),
      goals: () => [...goals].sort((a, b) => a - b),
      push: (dir) => move(dir),
      // тестовый хук: разложить ящики по целям и засчитать уровень
      solveStage: () => {
        boxes = new Set(goals);
        if (solvedNow()) winT = 0.01;
      },
    },
  };
}
