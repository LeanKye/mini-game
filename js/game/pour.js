// Переливание по цветам: три уровня (лёгкий, средний, сложный).
// Сосуды вмещают CAP слоёв. Переливается верхний слой одного цвета (всё, что поместится).
// Цель: в каждом непустом сосуде один цвет, и каждый цвет - только в одном сосуде.

const CAP = 4;
const TUBE_W = 50;
const TUBE_H = 130;
const VIEW_H = 480;
const MIN_W = 360;
const MAX_W = 760;
const COLORS = ['#ff6b8b', '#ffd166', '#06d6a0', '#4cc9f0', '#b388ff', '#ff9f1c', '#8ac926'];

// Уровни: сосуды снизу вверх, числа - индексы цветов. Решаемость проверена перебором.
export const POUR_LEVELS = [
  { name: 'Лёгкий', tubes: [[2, 0, 2, 2], [2, 1, 1, 0], [1, 0, 1, 0], [], []] },
  { name: 'Средний', tubes: [[4, 0, 1, 1], [2, 3, 3, 0], [4, 3, 1, 4], [2, 4, 2, 0], [3, 0, 2, 1], [], []] },
  { name: 'Сложный', tubes: [[2, 2, 5, 0], [4, 1, 3, 4], [4, 6, 1, 3], [5, 0, 1, 1], [6, 5, 2, 6], [3, 6, 4, 0], [5, 0, 3, 2], [], []] },
];

// Можно ли перелить из from в to. Возвращает число переливаемых слоёв или 0.
export function pourAmount(tubes, from, to) {
  if (from === to) return 0;
  const src = tubes[from];
  const dst = tubes[to];
  if (!src.length || dst.length >= CAP) return 0;
  const c = src[src.length - 1];
  if (dst.length && dst[dst.length - 1] !== c) return 0;
  let run = 0;
  for (let i = src.length - 1; i >= 0 && src[i] === c; i--) run++;
  // переливать в пустой сосуд всё, что сверху одного цвета, но бессмысленно, если весь сосуд и так один цвет
  if (!dst.length && run === src.length) return 0;
  return Math.min(run, CAP - dst.length);
}

export function isSolved(tubes) {
  const used = new Set();
  for (const t of tubes) {
    if (!t.length) continue;
    if (t.some((c) => c !== t[0])) return false;
    if (used.has(t[0])) return false;
    used.add(t[0]);
  }
  return true;
}

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

export function createPour(canvas, { onHint, onWin } = {}) {
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
  let tubes = [];
  let history = [];
  let sel = null;
  let winT = 0;
  let toast = '';
  let toastT = 0;
  let hits = [];

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

  // Раскладка сосудов: до пяти в ряд, дальше - вторым рядом
  function layout() {
    const n = tubes.length;
    const cols = n <= 5 ? n : Math.ceil(n / 2);
    const rows = Math.ceil(n / cols);
    const out = [];
    for (let i = 0; i < n; i++) {
      const r = Math.floor(i / cols);
      const c = i % cols;
      const inRow = Math.min(cols, n - r * cols);
      const gap = (VIEW.w - inRow * TUBE_W) / (inRow + 1);
      const x = gap + c * (TUBE_W + gap);
      const y = rows === 1 ? 190 : 130 + r * 160;
      out.push({ x, y, w: TUBE_W, h: TUBE_H });
    }
    return out;
  }

  function loadStage(i) {
    stageIdx = i;
    tubes = POUR_LEVELS[i].tubes.map((t) => t.slice());
    history = [];
    sel = null;
    winT = 0;
    if (onHint) onHint(`Уровень ${i + 1}: ${POUR_LEVELS[i].name}`);
  }

  function tryMove(from, to) {
    const n = pourAmount(tubes, from, to);
    if (!n) return false;
    history.push(tubes.map((t) => t.slice()));
    const c = tubes[from][tubes[from].length - 1];
    for (let k = 0; k < n; k++) tubes[from].pop();
    for (let k = 0; k < n; k++) tubes[to].push(c);
    return true;
  }

  function onTube(i) {
    if (winT > 0) return;
    if (sel === null) {
      if (tubes[i].length) sel = i;
      return;
    }
    if (sel === i) {
      sel = null;
      return;
    }
    if (tryMove(sel, i)) {
      sel = null;
      if (isSolved(tubes)) {
        winT = 1.4;
        toast = stageIdx + 1 < POUR_LEVELS.length ? 'Готово! Следующий уровень' : 'Все уровни пройдены!';
        toastT = 1.4;
      }
    } else {
      sel = tubes[i].length ? i : null;
    }
  }

  function undo() {
    if (winT > 0 || !history.length) return;
    tubes = history.pop();
    sel = null;
  }

  function restart() {
    if (winT > 0) return;
    loadStage(stageIdx);
  }

  function step(dt) {
    if (toastT > 0) toastT -= dt;
    if (winT > 0) {
      winT -= dt;
      if (winT <= 0) {
        if (stageIdx + 1 < POUR_LEVELS.length) loadStage(stageIdx + 1);
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

  function drawTube(tb, i, t) {
    const up = sel === i ? -16 : 0;
    const x = tb.x;
    const y = tb.y + up;
    ctx.fillStyle = '#2b1d3d';
    rr(ctx, x - 3, y - 3, tb.w + 6, tb.h + 6, 12);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.07)';
    rr(ctx, x, y, tb.w, tb.h, 10);
    ctx.fill();
    const inner = tb.h - 12;
    const slot = inner / CAP;
    tubes[i].forEach((c, k) => {
      const by = y + tb.h - 6 - (k + 1) * slot + 2;
      ctx.fillStyle = COLORS[c];
      rr(ctx, x + 5, by, tb.w - 10, slot - 3, 6);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.fillRect(x + 8, by + 3, 6, slot - 9);
      ctx.strokeStyle = 'rgba(20,10,40,0.85)';
      ctx.lineWidth = 1.5;
      rr(ctx, x + 5, by, tb.w - 10, slot - 3, 6);
      ctx.stroke();
    });
    ctx.strokeStyle = sel === i ? '#ffe066' : '#c9b8ff';
    ctx.lineWidth = sel === i ? 3 : 2;
    rr(ctx, x, y, tb.w, tb.h, 10);
    ctx.stroke();
  }

  function drawButton(label, x, y, w, col) {
    ctx.fillStyle = 'rgba(20,14,40,0.85)';
    rr(ctx, x, y, w, 30, 10);
    ctx.fill();
    ctx.strokeStyle = col;
    ctx.lineWidth = 2;
    rr(ctx, x, y, w, 30, 10);
    ctx.stroke();
    ctx.fillStyle = col;
    ctx.font = "bold 13px 'Nunito', sans-serif";
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x + w / 2, y + 15);
  }

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
    ctx.fillText(`Уровень ${stageIdx + 1} из ${POUR_LEVELS.length} · ${POUR_LEVELS[stageIdx].name}`, VIEW.w / 2, 56);
    ctx.font = "600 13px 'Nunito', sans-serif";
    ctx.fillStyle = '#d9cdf5';
    ctx.fillText('Тапни сосуд, потом сосуд, куда перелить верхний слой', VIEW.w / 2, 84);

    hits = layout();
    tubes.forEach((_, i) => drawTube(hits[i], i));

    drawButton('Назад', 16, VIEW.h - 46, 120, '#c9b8ff');
    drawButton('Заново', VIEW.w - 136, VIEW.h - 46, 120, '#ffb3c6');

    if (toastT > 0 || winT > 0) {
      ctx.fillStyle = 'rgba(20,14,40,0.82)';
      rr(ctx, VIEW.w / 2 - 130, VIEW.h / 2 - 22, 260, 44, 14);
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

  function onPointerDown(e) {
    e.preventDefault();
    if (!tubes.length) return;
    const q = toLogical(e.clientX, e.clientY);
    if (q.x >= 16 && q.x <= 136 && q.y >= VIEW.h - 46 && q.y <= VIEW.h - 16) {
      undo();
      return;
    }
    if (q.x >= VIEW.w - 136 && q.x <= VIEW.w - 16 && q.y >= VIEW.h - 46 && q.y <= VIEW.h - 16) {
      restart();
      return;
    }
    for (let i = 0; i < hits.length; i++) {
      const b = hits[i];
      if (q.x >= b.x - 6 && q.x <= b.x + b.w + 6 && q.y >= b.y - 20 && q.y <= b.y + b.h + 6) {
        onTube(i);
        return;
      }
    }
  }

  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
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
      window.removeEventListener('resize', setScale);
    },
    win() {
      finishRun();
    },
    getState() {
      return { stage: stageIdx + 1, stages: POUR_LEVELS.length, moves: history.length, finished };
    },
    test: {
      stage: () => stageIdx + 1,
      tubes: () => tubes.map((t) => t.slice()),
      // тестовый хук: сразу собрать текущий уровень
      solveStage: () => {
        const colors = [];
        tubes.forEach((t) => t.forEach((c) => colors.push(c)));
        const uniq = [...new Set(colors)];
        tubes = tubes.map(() => []);
        uniq.forEach((c, i) => {
          const count = colors.filter((x) => x === c).length;
          for (let k = 0; k < count; k++) tubes[i].push(c);
        });
        if (isSolved(tubes)) {
          winT = 0.01;
        }
      },
    },
  };
}
