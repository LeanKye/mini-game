// Арканоид: платформа, мяч и кирпичи. Три этапа с ростом сложности.
// Управление платформой: стрелки ◀ ▶ (кнопки внизу или клавиатура), либо перетаскивание по полю.

const VIEW_H = 512;
const MIN_W = 360;
const MAX_W = 760;
const PADDLE_SPEED = 430;
const BALL_R = 7;
const LIVES = 3;
const READY_DELAY = 1.1;

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
  let dir = 1; // горизонтальное направление запуска мяча (чередуем)

  const paddle = { x: 0, y: 0, w: 100, h: 12 };
  const ball = { x: 0, y: 0, vx: 0, vy: 0, r: BALL_R };
  const input = { left: false, right: false };

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
        const hits = Number(ch);
        bricks.push({ gx: x, gy: y, hits, alive: true });
      }
    }
    if (!keepScore) score = 0;
    lives = LIVES;
    paddle.w = Math.max(70, Math.min(140, Math.round(VIEW.w * 0.22)));
    paddle.x = (VIEW.w - paddle.w) / 2;
    paddle.y = VIEW_H - 72;
    resetBall();
    if (onHint) onHint(`Этап ${i + 1} из ${BREAKOUT_STAGES.length}: ${S.name}`);
  }

  function resetBall() {
    mode = 'ready';
    timer = READY_DELAY;
    ball.x = paddle.x + paddle.w / 2;
    ball.y = paddle.y - ball.r - 1;
    ball.vx = 0;
    ball.vy = 0;
  }

  function launch() {
    if (mode !== 'ready') return;
    mode = 'play';
    const a = 0.5; // угол запуска
    ball.vx = Math.cos(a) * speed * dir;
    ball.vy = -Math.sin(a) * speed;
    dir *= -1;
  }

  function bricksLeft() {
    let n = 0;
    for (const b of bricks) if (b.alive) n += 1;
    return n;
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

  function hitBrick(b) {
    b.hits -= 1;
    score += 5;
    if (b.hits <= 0) {
      b.alive = false;
      score += 10;
    }
  }

  function collideBricks() {
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
      return true;
    }
    return false;
  }

  function moveBall(dt) {
    const dist = Math.hypot(ball.vx, ball.vy) * dt;
    const steps = Math.max(1, Math.ceil(dist / (ball.r * 0.8)));
    const sdt = dt / steps;
    for (let i = 0; i < steps; i++) {
      ball.x += ball.vx * sdt;
      ball.y += ball.vy * sdt;
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
      collideBricks();
      if (bricksLeft() === 0) {
        clearStage();
        return;
      }
      // платформа
      if (
        ball.vy > 0 &&
        ball.y + ball.r >= paddle.y &&
        ball.y - ball.r <= paddle.y + paddle.h &&
        ball.x >= paddle.x - ball.r &&
        ball.x <= paddle.x + paddle.w + ball.r
      ) {
        ball.y = paddle.y - ball.r;
        const rel = (ball.x - (paddle.x + paddle.w / 2)) / (paddle.w / 2);
        const ang = Math.max(-1.05, Math.min(1.05, rel * 1.05));
        const sp = Math.hypot(ball.vx, ball.vy);
        ball.vx = Math.sin(ang) * sp;
        ball.vy = -Math.abs(Math.cos(ang) * sp);
      }
      if (ball.y - ball.r > VIEW.h) {
        loseLife();
        return;
      }
    }
  }

  function step(dt) {
    if (toastT > 0) toastT -= dt;
    // платформа
    if (input.left) paddle.x -= PADDLE_SPEED * dt;
    if (input.right) paddle.x += PADDLE_SPEED * dt;
    paddle.x = Math.max(0, Math.min(VIEW.w - paddle.w, paddle.x));

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
      ball.x = paddle.x + paddle.w / 2;
      ball.y = paddle.y - ball.r - 1;
      timer -= dt;
      if (timer <= 0) launch();
      return;
    }
    moveBall(dt);
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
    ctx.fillText(`Очки: ${score}   ·   Кирпичей: ${bricksLeft()}`, VIEW.w / 2, 92);

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
    ctx.fillStyle = '#c9b8ff';
    rr(ctx, paddle.x, paddle.y, paddle.w, paddle.h, 6);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    rr(ctx, paddle.x + 3, paddle.y + 2, paddle.w - 6, 3, 2);
    ctx.fill();

    // мяч
    ctx.fillStyle = '#fff3d6';
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,180,90,0.9)';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = '#b9a8e0';
    ctx.font = "600 12px 'Nunito', sans-serif";
    ctx.textAlign = 'center';
    ctx.fillText('Держи ◀ ▶ внизу, чтобы двигать платформу', VIEW.w / 2, VIEW.h - 24);
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
    paddle.x = Math.max(0, Math.min(VIEW.w - paddle.w, q.x - paddle.w / 2));
    if (mode === 'ready') launch();
  }

  function onPointerMove(e) {
    if (!drag || e.pointerId !== drag.id) return;
    const q = toLogical(e.clientX, e.clientY);
    paddle.x = Math.max(0, Math.min(VIEW.w - paddle.w, q.x - paddle.w / 2));
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
        lives,
        score,
        mode,
        finished,
      };
    },
    test: {
      stage: () => stageIdx + 1,
      bricks: () => bricksLeft(),
      lives: () => lives,
      score: () => score,
      paddleX: () => paddle.x,
      ball: () => ({ x: ball.x, y: ball.y }),
      mode: () => mode,
      state: () => ({
        stage: stageIdx + 1,
        bricks: bricksLeft(),
        lives,
        score,
        mode,
        paddleX: paddle.x,
        ball: { x: ball.x, y: ball.y },
      }),
      // тестовые хуки
      launch: () => launch(),
      // снять все кирпичи текущего этапа и засчитать прохождение
      clearStage: () => {
        for (const b of bricks) b.alive = false;
        clearStage();
      },
    },
  };
}
