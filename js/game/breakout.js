// Арканоид: платформа, шары и кирпичи. Три этапа, бонусы-улучшатели.
// Управление платформой: стрелки ◀ ▶ (кнопки внизу или клавиатура), либо перетаскивание по полю.
// Жизнь теряется, только когда потеряны ВСЕ шары (важно для бонуса «дублирование»).

const VIEW_H = 512;
const MIN_W = 360;
const MAX_W = 760;
const PADDLE_SPEED = 430;
const BALL_R = 7;
const LIVES = 3;
const READY_DELAY = 1.1;
const MAX_BALLS = 10;
const DROP_SPEED = 150;
const DROP_CHANCE = 0.24;

// Кирпичи: '1','2','3' - число попаданий, '.' - пусто.
export const BREAKOUT_STAGES = [
  {
    name: 'Первый зал',
    speed: 250,
    rows: [
      '111111111',
      '111111111',
      '111111111',
      '111111111',
      '111111111',
      '111111111',
    ],
  },
  {
    name: 'Колонны',
    speed: 278,
    rows: [
      '211111112',
      '121111121',
      '112222211',
      '121111121',
      '211111112',
    ],
  },
  {
    name: 'Крепость',
    speed: 306,
    rows: [
      '222222222',
      '211111112',
      '213333312',
      '213131312',
      '213333312',
      '211111112',
      '222222222',
    ],
  },
];

const BRICK_COLOR = { 3: '#d9568f', 2: '#ff9f1c', 1: '#4cc9f0' };

// Бонусы: M - дублирование шаров, W - широкая платформа, S - медленный шар, L - жизнь.
const DROPS = [
  { type: 'M', weight: 30, color: '#4cc9f0', label: 'M' },
  { type: 'W', weight: 26, color: '#ffd166', label: 'W' },
  { type: 'S', weight: 26, color: '#06d6a0', label: 'S' },
  { type: 'L', weight: 14, color: '#ff6b8b', label: 'L' },
];
const DROP_TOTAL = DROPS.reduce((s, d) => s + d.weight, 0);

function pickDrop() {
  let r = Math.random() * DROP_TOTAL;
  for (const d of DROPS) {
    r -= d.weight;
    if (r <= 0) return d;
  }
  return DROPS[0];
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

export function createBreakout(canvas, { controls = {}, onHint, onWin } = {}) {
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
  let gridRows = 0;
  let bricks = [];
  let speed = 250;
  let score = 0;
  let lives = LIVES;
  let mode = 'ready'; // ready | play | lost | clear
  let timer = READY_DELAY;
  let toast = '';
  let toastT = 0;
  let dir = 1;
  let wideT = 0;
  let slowT = 0;

  const paddle = { x: 0, y: 0, w: 100, baseW: 100, h: 12 };
  let balls = [];
  let drops = [];
  const input = { left: false, right: false };

  function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  }

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

  function layout() {
    const pad = 16;
    const top = 112;
    const availW = VIEW.w - pad * 2;
    const bw = availW / cols;
    const bh = Math.min(28, (VIEW_H - top - 150) / Math.max(1, gridRows));
    return { ox: pad, oy: top, bw, bh };
  }

  function loadStage(i, keepScore = true) {
    stageIdx = i;
    const S = BREAKOUT_STAGES[i];
    cols = S.rows[0].length;
    gridRows = S.rows.length;
    speed = S.speed;
    bricks = [];
    for (let y = 0; y < gridRows; y++) {
      for (let x = 0; x < cols; x++) {
        const ch = S.rows[y][x];
        if (ch === '.') continue;
        bricks.push({ gx: x, gy: y, hits: Number(ch), alive: true });
      }
    }
    if (!keepScore) score = 0;
    lives = LIVES;
    wideT = 0;
    slowT = 0;
    drops = [];
    paddle.baseW = clamp(Math.round(VIEW.w * 0.22), 70, 140);
    paddle.w = paddle.baseW;
    paddle.x = (VIEW.w - paddle.w) / 2;
    paddle.y = VIEW_H - 72;
    resetBall();
    if (onHint) onHint(`Этап ${i + 1} из ${BREAKOUT_STAGES.length}: ${S.name}`);
  }

  function resetBall() {
    mode = 'ready';
    timer = READY_DELAY;
    drops = [];
    balls = [{ x: paddle.x + paddle.w / 2, y: paddle.y - BALL_R - 1, vx: 0, vy: 0, r: BALL_R }];
  }

  function launch() {
    if (mode !== 'ready' || !balls.length) return;
    mode = 'play';
    const b = balls[0];
    const a = 0.5;
    const sp = speed;
    b.vx = Math.cos(a) * sp * dir;
    b.vy = -Math.sin(a) * sp;
    dir *= -1;
  }

  function bricksLeft() {
    let n = 0;
    for (const b of bricks) if (b.alive) n += 1;
    return n;
  }

  // Дублирование: каждому шару добавляем копию под другим углом.
  function multiball() {
    const add = [];
    for (const b of balls) {
      if (balls.length + add.length >= MAX_BALLS) break;
      const sp = Math.hypot(b.vx, b.vy) || speed;
      const ang = Math.atan2(b.vy, b.vx) + 0.55;
      add.push({ x: b.x, y: b.y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, r: BALL_R });
    }
    balls.push(...add);
    if (balls.length > MAX_BALLS) balls = balls.slice(0, MAX_BALLS);
  }

  function applyPowerup(type) {
    if (type === 'M') multiball();
    else if (type === 'W') wideT = 12;
    else if (type === 'S') slowT = 10;
    else if (type === 'L') lives = Math.min(9, lives + 1);
  }

  function spawnDrop(cx, cy) {
    if (Math.random() > DROP_CHANCE) return;
    const d = pickDrop();
    drops.push({ x: cx, y: cy, vy: DROP_SPEED, type: d.type, color: d.color, label: d.label });
  }

  function hitBrick(b) {
    b.hits -= 1;
    score += 5;
    if (b.hits <= 0) {
      b.alive = false;
      score += 10;
      const { ox, oy, bw, bh } = layout();
      spawnDrop(ox + b.gx * bw + bw / 2, oy + b.gy * bh + bh / 2);
    }
  }

  function collideBricks(ball) {
    const { ox, oy, bw, bh } = layout();
    for (const b of bricks) {
      if (!b.alive) continue;
      const rx = ox + b.gx * bw;
      const ry = oy + b.gy * bh;
      const rw = bw - 2;
      const rh = bh - 2;
      if (
        ball.x + ball.r <= rx ||
        ball.x - ball.r >= rx + rw ||
        ball.y + ball.r <= ry ||
        ball.y - ball.r >= ry + rh
      ) continue;
      const left = ball.x - rx;
      const right = rx + rw - ball.x;
      const top = ball.y - ry;
      const bottom = ry + rh - ball.y;
      const minX = Math.min(left, right);
      const minY = Math.min(top, bottom);
      if (minX < minY) {
        ball.vx = left < right ? -Math.abs(ball.vx) : Math.abs(ball.vx);
        ball.x += left < right ? ball.r - left : -(ball.r - right);
      } else {
        ball.vy = top < bottom ? -Math.abs(ball.vy) : Math.abs(ball.vy);
        ball.y += top < bottom ? ball.r - top : -(ball.r - bottom);
      }
      hitBrick(b);
      return;
    }
  }

  function moveBalls(dt) {
    const speedScale = slowT > 0 ? 0.62 : 1;
    const kept = [];
    for (const ball of balls) {
      const dist = Math.hypot(ball.vx, ball.vy) * speedScale * dt;
      const steps = Math.max(1, Math.ceil(dist / (ball.r * 0.8)));
      const sdt = dt / steps;
      let lost = false;
      for (let i = 0; i < steps; i++) {
        ball.x += ball.vx * speedScale * sdt;
        ball.y += ball.vy * speedScale * sdt;
        if (ball.x - ball.r < 0) {
          ball.x = ball.r;
          ball.vx = Math.abs(ball.vx);
        } else if (ball.x + ball.r > VIEW.w) {
          ball.x = VIEW.w - ball.r;
          ball.vx = -Math.abs(ball.vx);
        }
        if (ball.y - ball.r < 0) {
          ball.y = ball.r;
          ball.vy = Math.abs(ball.vy);
        }
        collideBricks(ball);
        if (
          ball.vy > 0 &&
          ball.y + ball.r >= paddle.y &&
          ball.y - ball.r <= paddle.y + paddle.h &&
          ball.x >= paddle.x - ball.r &&
          ball.x <= paddle.x + paddle.w + ball.r
        ) {
          ball.y = paddle.y - ball.r;
          const rel = (ball.x - (paddle.x + paddle.w / 2)) / (paddle.w / 2);
          const ang = clamp(rel * 1.05, -1.05, 1.05);
          const sp = Math.hypot(ball.vx, ball.vy) || speed;
          ball.vx = Math.sin(ang) * sp;
          ball.vy = -Math.abs(Math.cos(ang) * sp);
        }
        if (ball.y - ball.r > VIEW.h) {
          lost = true;
          break;
        }
        if (bricksLeft() === 0) {
          clearStage();
          return;
        }
      }
      if (!lost) kept.push(ball);
    }
    balls = kept;
    // жизнь теряется только когда не осталось ни одного шара
    if (balls.length === 0) loseLife();
  }

  function moveDrops(dt) {
    const kept = [];
    for (const d of drops) {
      d.y += d.vy * dt;
      if (
        d.y + 9 >= paddle.y &&
        d.y - 9 <= paddle.y + paddle.h &&
        d.x >= paddle.x &&
        d.x <= paddle.x + paddle.w
      ) {
        applyPowerup(d.type);
        continue;
      }
      if (d.y - 9 > VIEW.h) continue;
      kept.push(d);
    }
    drops = kept;
  }

  function loseLife() {
    lives -= 1;
    if (lives <= 0) {
      mode = 'lost';
      timer = 1.1;
      toast = 'Все жизни потеряны - этап заново';
      toastT = 1.1;
    } else {
      resetBall();
    }
  }

  function clearStage() {
    mode = 'clear';
    timer = 1.2;
    toast = stageIdx + 1 < BREAKOUT_STAGES.length ? 'Этап пройден! Дальше' : 'Все этапы!';
    toastT = 1.2;
  }

  function step(dt) {
    if (toastT > 0) toastT -= dt;
    if (wideT > 0) wideT -= dt;
    if (slowT > 0) slowT -= dt;

    // ширина платформы с учётом бонуса
    const targetW = Math.round(paddle.baseW * (wideT > 0 ? 1.55 : 1));
    if (targetW !== paddle.w) {
      const cx = paddle.x + paddle.w / 2;
      paddle.w = targetW;
      paddle.x = clamp(cx - targetW / 2, 0, VIEW.w - targetW);
    }

    if (input.left) paddle.x -= PADDLE_SPEED * dt;
    if (input.right) paddle.x += PADDLE_SPEED * dt;
    paddle.x = clamp(paddle.x, 0, VIEW.w - paddle.w);

    if (mode === 'clear') {
      timer -= dt;
      if (timer <= 0) {
        if (stageIdx + 1 < BREAKOUT_STAGES.length) loadStage(stageIdx + 1);
        else finishRun();
      }
      return;
    }
    if (mode === 'lost') {
      timer -= dt;
      if (timer <= 0) loadStage(stageIdx);
      return;
    }
    if (mode === 'ready') {
      const b = balls[0];
      if (b) {
        b.x = paddle.x + paddle.w / 2;
        b.y = paddle.y - b.r - 1;
      }
      timer -= dt;
      if (timer <= 0) launch();
      return;
    }
    moveBalls(dt);
    moveDrops(dt);
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

  function render() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#0f0b1f';
    ctx.fillRect(0, 0, W, H);
    ctx.setTransform(scale, 0, 0, scale, offX, offY);
    const bg = ctx.createLinearGradient(0, 0, 0, VIEW.h);
    bg.addColorStop(0, '#2a1c4d');
    bg.addColorStop(1, '#15102c');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, VIEW.w, VIEW.h);

    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = "bold 18px 'Nunito', sans-serif";
    ctx.fillText(`Этап ${stageIdx + 1} из ${BREAKOUT_STAGES.length} · ${BREAKOUT_STAGES[stageIdx].name}`, VIEW.w / 2, 40);
    ctx.font = "700 14px 'Nunito', sans-serif";
    ctx.fillStyle = '#ff9fc0';
    const hearts = '♥ '.repeat(lives).trim() + ' ' + '♡ '.repeat(Math.max(0, LIVES - lives)).trim();
    ctx.fillText(hearts, VIEW.w / 2, 68);
    ctx.fillStyle = '#d9cdf5';
    ctx.font = "600 13px 'Nunito', sans-serif";
    ctx.fillText(`Очки: ${score}   ·   Кирпичей: ${bricksLeft()}   ·   Шаров: ${balls.length}`, VIEW.w / 2, 92);

    const { ox, oy, bw, bh } = layout();
    for (const b of bricks) {
      if (!b.alive) continue;
      const x = ox + b.gx * bw + 1;
      const y = oy + b.gy * bh + 1;
      const c = BRICK_COLOR[b.hits] || '#4cc9f0';
      ctx.fillStyle = c;
      rr(ctx, x, y, bw - 2, bh - 2, 4);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.28)';
      rr(ctx, x + 2, y + 2, bw - 6, Math.max(3, (bh - 6) * 0.35), 3);
      ctx.fill();
      ctx.strokeStyle = 'rgba(10,6,24,0.5)';
      ctx.lineWidth = 1;
      rr(ctx, x + 0.5, y + 0.5, bw - 3, bh - 3, 4);
      ctx.stroke();
    }

    // платформа
    ctx.fillStyle = wideT > 0 ? '#ffe066' : '#c9b8ff';
    rr(ctx, paddle.x, paddle.y, paddle.w, paddle.h, 6);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    rr(ctx, paddle.x + 3, paddle.y + 2, paddle.w - 6, 3, 2);
    ctx.fill();

    // бонусы
    for (const d of drops) {
      ctx.fillStyle = d.color;
      rr(ctx, d.x - 11, d.y - 9, 22, 18, 6);
      ctx.fill();
      ctx.strokeStyle = 'rgba(10,6,24,0.55)';
      ctx.lineWidth = 1.5;
      rr(ctx, d.x - 11, d.y - 9, 22, 18, 6);
      ctx.stroke();
      ctx.fillStyle = '#1a1030';
      ctx.font = "800 12px 'Nunito', sans-serif";
      ctx.fillText(d.label, d.x, d.y + 1);
    }

    // шары
    for (const b of balls) {
      ctx.fillStyle = '#fff3d6';
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,180,90,0.9)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // активные бонусы
    const fx = [];
    if (wideT > 0) fx.push(`Шире ${Math.ceil(wideT)}с`);
    if (slowT > 0) fx.push(`Медленно ${Math.ceil(slowT)}с`);
    ctx.fillStyle = '#b9a8e0';
    ctx.font = "600 12px 'Nunito', sans-serif";
    ctx.fillText('Держи ◀ ▶ внизу   ·   лови бонусы M·W·S·L', VIEW.w / 2, VIEW.h - 30);
    if (fx.length) {
      ctx.fillStyle = '#7dffc4';
      ctx.font = "700 13px 'Nunito', sans-serif";
      ctx.fillText(fx.join('   '), VIEW.w / 2, VIEW.h - 12);
    }
    if (mode === 'ready') {
      ctx.fillStyle = '#ffe066';
      ctx.font = "700 14px 'Nunito', sans-serif";
      ctx.fillText('Приготовься...', VIEW.w / 2, paddle.y - 34);
    }

    if (toastT > 0 || mode === 'lost') {
      ctx.fillStyle = 'rgba(20,14,40,0.82)';
      rr(ctx, VIEW.w / 2 - 150, VIEW.h / 2 - 24, 300, 48, 14);
      ctx.fill();
      ctx.fillStyle = '#ffd166';
      ctx.font = "bold 15px 'Nunito', sans-serif";
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

  let drag = null;

  function onPointerDown(e) {
    const q = toLogical(e.clientX, e.clientY);
    drag = { id: e.pointerId };
    paddle.x = clamp(q.x - paddle.w / 2, 0, VIEW.w - paddle.w);
    if (mode === 'ready') launch();
  }

  function onPointerMove(e) {
    if (!drag || e.pointerId !== drag.id) return;
    const q = toLogical(e.clientX, e.clientY);
    paddle.x = clamp(q.x - paddle.w / 2, 0, VIEW.w - paddle.w);
  }

  function onPointerUp(e) {
    if (drag && e.pointerId === drag.id) drag = null;
  }

  function onKeyDown(e) {
    const k = e.key.toLowerCase();
    if (k === 'arrowleft' || k === 'a') input.left = true;
    else if (k === 'arrowright' || k === 'd') input.right = true;
    else if (k === ' ' || k === 'arrowup' || k === 'w') {
      e.preventDefault();
      if (mode === 'ready') launch();
    }
  }

  function onKeyUp(e) {
    const k = e.key.toLowerCase();
    if (k === 'arrowleft' || k === 'a') input.left = false;
    else if (k === 'arrowright' || k === 'd') input.right = false;
  }

  function attachButton(el, key) {
    if (!el) return () => {};
    const down = (e) => {
      e.preventDefault();
      input[key] = true;
      try { el.setPointerCapture(e.pointerId); } catch {}
    };
    const up = (e) => {
      e.preventDefault();
      input[key] = false;
    };
    const block = (e) => e.preventDefault();
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('pointerleave', up);
    el.addEventListener('contextmenu', block);
    return () => {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      el.removeEventListener('pointerleave', up);
      el.removeEventListener('contextmenu', block);
    };
  }

  const detach = [
    attachButton(controls.left, 'left'),
    attachButton(controls.right, 'right'),
  ];

  const onBlur = () => {
    input.left = false;
    input.right = false;
    drag = null;
  };

  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  window.addEventListener('resize', setScale);

  setScale();
  loadStage(0, false);

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
      detach.forEach((fn) => fn());
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerUp);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('resize', setScale);
    },
    win() {
      finishRun();
    },
    getState() {
      return {
        stage: stageIdx + 1,
        stages: BREAKOUT_STAGES.length,
        bricks: bricksLeft(),
        balls: balls.length,
        lives,
        score,
        mode,
        finished,
      };
    },
    test: {
      stage: () => stageIdx + 1,
      bricks: () => bricksLeft(),
      balls: () => balls.length,
      lives: () => lives,
      score: () => score,
      paddleX: () => paddle.x,
      paddleW: () => paddle.w,
      mode: () => mode,
      ball: () => (balls[0] ? { x: balls[0].x, y: balls[0].y } : null),
      state: () => ({
        stage: stageIdx + 1,
        bricks: bricksLeft(),
        balls: balls.length,
        lives,
        score,
        mode,
        paddleX: paddle.x,
        ball: balls[0] ? { x: balls[0].x, y: balls[0].y } : null,
      }),
      // тестовые хуки
      launch: () => launch(),
      give: (type) => applyPowerup(type),
      // положить бонус над платформой (для проверки выпадения и отрисовки)
      spawnDrop: (type) => {
        const d = DROPS.find((x) => x.type === type) || DROPS[0];
        drops.push({
          x: paddle.x + paddle.w / 2,
          y: paddle.y - 110,
          vy: DROP_SPEED,
          type: d.type,
          color: d.color,
          label: d.label,
        });
      },
      // имитирует потерю одного шара (как падение вниз): жизнь тратится только когда шаров не осталось
      dropBall: () => {
        if (balls.length) balls.pop();
        if (balls.length === 0) loseLife();
        return balls.length;
      },
      // снять все кирпичи текущего этапа и засчитать прохождение
      clearStage: () => {
        for (const b of bricks) b.alive = false;
        clearStage();
      },
    },
  };
}
