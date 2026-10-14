const VIEW = { w: 500, h: 400 };
const WORLD = { w: 3400, h: 400 };

const GRAVITY = 0.6;
const MOVE = 3.2;
const JUMP = 11.8;
const MAX_FALL = 15;
const COYOTE_FRAMES = 6;
const BUFFER_FRAMES = 7;

export const PLATFORMS = [
  { x: 0, y: 330, w: 560, h: 70, ground: true },
  { x: 650, y: 300, w: 200, h: 18 },
  { x: 890, y: 270, w: 200, h: 18 },
  { x: 1330, y: 330, w: 420, h: 70, ground: true },
  { x: 1840, y: 290, w: 120, h: 18 },
  { x: 2160, y: 200, w: 200, h: 18 },
  { x: 2380, y: 330, w: 1020, h: 70, ground: true },
];

export const MOVERS = [
  { x: 1150, y: 310, w: 120, h: 18, axis: 'x', base: 1150, range: 60, speed: 1.4, phase: 0, moving: true, _dx: 0, _dy: 0 },
  { x: 2020, y: 250, w: 120, h: 18, axis: 'y', base: 250, range: 80, speed: 1.6, phase: 0, moving: true, _dx: 0, _dy: 0 },
];

export const SPIKES = [
  { x: 420, y: 298, w: 44, h: 32, axis: 'none', base: 298, range: 0, speed: 0, phase: 0 },
  { x: 1650, y: 248, w: 56, h: 56, axis: 'y', base: 248, range: 88, speed: 2.1, phase: 0 },
  { x: 2700, y: 300, w: 70, h: 36, axis: 'x', base: 2700, range: 150, speed: 1.6, phase: 0 },
  { x: 3130, y: 246, w: 52, h: 52, axis: 'y', base: 246, range: 84, speed: 2.2, phase: 1 },
];

export const STARS = [
  { x: 250, y: 275 },
  { x: 720, y: 250 },
  { x: 960, y: 220 },
  { x: 1450, y: 275 },
  { x: 2230, y: 150 },
  { x: 2950, y: 275 },
];

const CHECKPOINTS = [80, 1370, 1860, 2440];
const START = { x: 60, y: 220 };
const GOAL = { x: 3300, y: 240, w: 56, h: 90 };

const PLAYER = { w: 32, h: 38 };
const STAR_R = 13;

const CLOUDS = [
  { x: 120, y: 80, s: 44 },
  { x: 520, y: 130, s: 58 },
  { x: 940, y: 72, s: 38 },
  { x: 1380, y: 138, s: 52 },
  { x: 1820, y: 88, s: 46 },
  { x: 2260, y: 132, s: 56 },
  { x: 2700, y: 78, s: 40 },
  { x: 3140, y: 128, s: 52 },
];

const HILLS = [
  { depth: 0.45, y: 300, color: 'rgba(214, 200, 255, 0.7)', amp: 40 },
  { depth: 0.68, y: 330, color: 'rgba(255, 210, 232, 0.8)', amp: 30 },
];

const HINT_COOLDOWN_FRAMES = 150;

function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export function createPlatformer(
  canvas,
  { controls = {}, timeLimit = 0, onProgress, onHint, onTime, onWin } = {}
) {
  const ctx = canvas.getContext('2d');
  const solids = PLATFORMS.concat(MOVERS);

  const player = {
    x: START.x,
    y: START.y,
    w: PLAYER.w,
    h: PLAYER.h,
    vx: 0,
    vy: 0,
    onGround: false,
    facing: 1,
    platform: null,
  };

  const stars = STARS.map((s) => ({ ...s, collected: false, bob: Math.random() * Math.PI * 2 }));
  const spikes = SPIKES.map((s) => ({ ...s }));
  let collected = 0;
  let checkpoint = { x: START.x, y: START.y };
  let coyote = 0;
  let buffer = 0;
  let prevJump = false;
  let running = false;
  let finished = false;
  let scale = 1;
  let camX = 0;
  let raf = null;
  let last = 0;
  let acc = 0;
  let time = 0;
  let burst = null;
  let hintCooldown = 0;
  let hurtFlash = 0;
  let timeLeft = timeLimit * 60;
  let lastShownSecond = -1;
  let gfx = null;

  const input = { left: false, right: false, jump: false };

  function buildGfx() {
    const sky = ctx.createLinearGradient(0, 0, 0, VIEW.h);
    sky.addColorStop(0, '#e6dcff');
    sky.addColorStop(0.45, '#f6e5f2');
    sky.addColorStop(1, '#ffe3ec');

    const glow = ctx.createRadialGradient(430, 90, 10, 430, 90, 220);
    glow.addColorStop(0, 'rgba(255, 240, 205, 0.85)');
    glow.addColorStop(1, 'rgba(255, 240, 205, 0)');

    const vignette = ctx.createLinearGradient(0, 0, 0, VIEW.h);
    vignette.addColorStop(0, 'rgba(255, 255, 255, 0.12)');
    vignette.addColorStop(0.5, 'rgba(255, 255, 255, 0)');
    vignette.addColorStop(1, 'rgba(150, 120, 180, 0.1)');

    const star = ctx.createLinearGradient(0, -STAR_R, 0, STAR_R);
    star.addColorStop(0, '#ffe79a');
    star.addColorStop(1, '#ffb32e');

    const goal = ctx.createLinearGradient(0, -42, 0, 42);
    goal.addColorStop(0, '#fff0b8');
    goal.addColorStop(1, '#ffa41f');

    const playerGrad = ctx.createLinearGradient(0, 0, 0, PLAYER.h);
    playerGrad.addColorStop(0, '#c9a8f0');
    playerGrad.addColorStop(1, '#9d78e0');

    const spike = ctx.createLinearGradient(0, -30, 0, 30);
    spike.addColorStop(0, '#8b6fb0');
    spike.addColorStop(1, '#5f4586');

    const mover = ctx.createLinearGradient(0, -12, 0, 12);
    mover.addColorStop(0, '#ffe0a8');
    mover.addColorStop(1, '#f0b45e');

    gfx = {
      sky,
      glow,
      vignette,
      star,
      goal,
      spike,
      mover,
      player: playerGrad,
      platforms: PLATFORMS.map((s) => {
        const g = ctx.createLinearGradient(0, s.y, 0, s.y + s.h);
        if (s.ground) {
          g.addColorStop(0, '#ffd6c9');
          g.addColorStop(1, '#f4b39c');
        } else {
          g.addColorStop(0, '#e9d5ff');
          g.addColorStop(1, '#c9a8f0');
        }
        return g;
      }),
    };
  }

  function setScale() {
    const rect = canvas.getBoundingClientRect();
    const cssW = rect.width || VIEW.w;
    canvas.width = Math.round(cssW * 2);
    canvas.height = Math.round(cssW * 2 * (VIEW.h / VIEW.w));
    scale = canvas.width / VIEW.w;
  }

  function onResize() {
    setScale();
    render();
  }

  function attachButton(el, key) {
    if (!el) return () => {};
    const down = (e) => {
      e.preventDefault();
      if (key === 'jump') input.jump = true;
      else input[key] = true;
      if (el.setPointerCapture && e.pointerId != null) {
        try { el.setPointerCapture(e.pointerId); } catch {}
      }
    };
    const up = (e) => {
      e.preventDefault();
      if (key === 'jump') input.jump = false;
      else input[key] = false;
    };
    const blockContext = (e) => e.preventDefault();
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('pointerleave', up);
    el.addEventListener('contextmenu', blockContext);
    return () => {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      el.removeEventListener('pointerleave', up);
      el.removeEventListener('contextmenu', blockContext);
    };
  }

  function onKeyDown(e) {
    if (e.repeat) return;
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') input.left = true;
    else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') input.right = true;
    else if (e.key === ' ' || e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
      input.jump = true;
      e.preventDefault();
    }
  }

  function onKeyUp(e) {
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') input.left = false;
    else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') input.right = false;
    else if (e.key === ' ' || e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') input.jump = false;
  }

  function moveX(dx) {
    player.x += dx;
    for (const s of solids) {
      if (rectsOverlap(player, s)) {
        if (dx > 0) player.x = s.x - player.w;
        else if (dx < 0) player.x = s.x + s.w;
        player.vx = 0;
      }
    }
  }

  function moveY(dy) {
    player.y += dy;
    player.onGround = false;
    player.platform = null;
    for (const s of solids) {
      if (rectsOverlap(player, s)) {
        if (dy > 0) {
          player.y = s.y - player.h;
          player.vy = 0;
          player.onGround = true;
          player.platform = s;
        } else if (dy < 0) {
          player.y = s.y + s.h;
          player.vy = 0;
        }
      }
    }
  }

  function resetLevel(message) {
    player.x = START.x;
    player.y = START.y;
    player.vx = 0;
    player.vy = 0;
    player.platform = null;
    checkpoint = { x: START.x, y: START.y };
    collected = 0;
    for (const s of stars) s.collected = false;
    timeLeft = timeLimit * 60;
    lastShownSecond = -1;
    hurtFlash = 26;
    camX = Math.max(0, Math.min(player.x - VIEW.w / 2, WORLD.w - VIEW.w));
    if (onProgress) onProgress(0, stars.length, null);
    if (message) hint(message);
  }

  function bounce() {
    player.x = checkpoint.x;
    player.y = checkpoint.y;
    player.vx = 0;
    player.vy = 0;
    player.platform = null;
    hurtFlash = 22;
    camX = Math.max(0, Math.min(player.x - VIEW.w / 2, WORLD.w - VIEW.w));
  }

  function updateCheckpoint() {
    for (const cx of CHECKPOINTS) {
      if (player.x >= cx - 10 && cx > checkpoint.x && player.onGround) {
        checkpoint = { x: cx, y: 220 };
      }
    }
  }

  function updateMovers() {
    for (const m of MOVERS) {
      const v = Math.sin(time * m.speed + m.phase) * m.range;
      if (m.axis === 'x') {
        const nx = m.base + v;
        m._dx = nx - m.x;
        m._dy = 0;
        m.x = nx;
      } else {
        const ny = m.base + v;
        m._dy = ny - m.y;
        m._dx = 0;
        m.y = ny;
      }
    }
  }

  function updateSpikes() {
    for (const s of spikes) {
      if (s.axis === 'x') s.x = s.base + Math.sin(time * s.speed + s.phase) * s.range;
      else if (s.axis === 'y') s.y = s.base + Math.sin(time * s.speed + s.phase) * s.range;
    }
  }

  function hint(message) {
    if (hintCooldown > 0) return;
    hintCooldown = HINT_COOLDOWN_FRAMES;
    if (onHint) onHint(message);
  }

  function step() {
    time += 1 / 60;
    if (hintCooldown > 0) hintCooldown -= 1;
    if (hurtFlash > 0) hurtFlash -= 1;
    if (finished) return;

    updateMovers();
    updateSpikes();

    const dir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    if (dir !== 0) player.facing = dir;
    player.vx = dir * MOVE;

    if (player.onGround && player.platform && player.platform.moving) {
      player.x += player.platform._dx;
      player.y += player.platform._dy;
    }

    if (input.jump && !prevJump) buffer = BUFFER_FRAMES;
    prevJump = input.jump;

    if (player.onGround) coyote = COYOTE_FRAMES;
    else if (coyote > 0) coyote -= 1;
    if (buffer > 0) buffer -= 1;

    if (buffer > 0 && (player.onGround || coyote > 0)) {
      player.vy = -JUMP;
      buffer = 0;
      coyote = 0;
      player.onGround = false;
      player.platform = null;
    }

    player.vy = Math.min(player.vy + GRAVITY, MAX_FALL);

    moveX(player.vx);
    moveY(player.vy);

    if (player.x < 0) { player.x = 0; player.vx = 0; }
    if (player.x + player.w > WORLD.w) player.x = WORLD.w - player.w;

    updateCheckpoint();
    if (player.y > WORLD.h + 140) {
      bounce();
      return;
    }

    for (const s of spikes) {
      if (rectsOverlap(player, s)) {
        bounce();
        return;
      }
    }

    for (const s of stars) {
      if (s.collected) continue;
      const dx = player.x + player.w / 2 - s.x;
      const dy = player.y + player.h / 2 - s.y;
      if (dx * dx + dy * dy < (STAR_R + 20) ** 2) {
        s.collected = true;
        collected += 1;
        if (onProgress) onProgress(collected, stars.length, s);
      }
    }

    if (timeLimit > 0) {
      timeLeft -= 1;
      const seconds = Math.max(0, Math.ceil(timeLeft / 60));
      if (seconds !== lastShownSecond) {
        lastShownSecond = seconds;
        if (onTime) onTime(seconds);
      }
      if (timeLeft <= 0) {
        resetLevel('Время вышло - начнём заново');
        return;
      }
    }

    if (rectsOverlap(player, GOAL)) {
      if (collected < stars.length) {
        hint(`Сначала все звёзды: осталось ${stars.length - collected}`);
      } else {
        win();
      }
    }

    camX = Math.max(0, Math.min(player.x + player.w / 2 - VIEW.w / 2, WORLD.w - VIEW.w));
  }

  function win() {
    if (finished) return;
    finished = true;
    burst = {
      x: GOAL.x + GOAL.w / 2,
      y: GOAL.y + 10,
      t: 0,
      parts: Array.from({ length: 30 }, () => ({
        vx: (Math.random() - 0.5) * 6,
        vy: -Math.random() * 7 - 2,
        s: 5 + Math.random() * 7,
        rot: Math.random() * Math.PI,
      })),
    };
    setTimeout(() => {
      if (onWin) onWin();
    }, 950);
    setTimeout(() => {
      running = false;
      if (raf) cancelAnimationFrame(raf);
    }, 1050);
  }

  function loop(t) {
    if (!running) return;
    if (!last) last = t;
    const dt = Math.min(0.05, (t - last) / 1000);
    last = t;
    acc += dt;
    while (acc >= 1 / 60) {
      step();
      acc -= 1 / 60;
    }
    render();
    raf = requestAnimationFrame(loop);
  }

  function starPath(cx, cy, outer, inner) {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const ang = -Math.PI / 2 + (i * Math.PI) / 5;
      const rad = i % 2 === 0 ? outer : inner;
      const x = cx + Math.cos(ang) * rad;
      const y = cy + Math.sin(ang) * rad;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
  }

  function roundRect(x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  function drawSky() {
    ctx.fillStyle = gfx.sky;
    ctx.fillRect(0, 0, VIEW.w, VIEW.h);
    ctx.fillStyle = gfx.glow;
    ctx.fillRect(0, 0, VIEW.w, VIEW.h);
  }

  function drawClouds() {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    const off = camX * 0.3;
    for (const c of CLOUDS) {
      const x = c.x - off;
      const wrapped = ((x % 3600) + 3600) % 3600 - 200;
      ctx.beginPath();
      ctx.ellipse(wrapped, c.y, c.s, c.s * 0.55, 0, 0, Math.PI * 2);
      ctx.ellipse(wrapped + c.s * 0.7, c.y + 6, c.s * 0.65, c.s * 0.4, 0, 0, Math.PI * 2);
      ctx.ellipse(wrapped - c.s * 0.7, c.y + 8, c.s * 0.55, c.s * 0.35, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawHills() {
    for (const L of HILLS) {
      const off = camX * L.depth;
      ctx.fillStyle = L.color;
      ctx.beginPath();
      ctx.moveTo(-100, VIEW.h);
      for (let x = -100; x <= VIEW.w + 100; x += 40) {
        const world = x + off;
        const y = L.y - Math.sin(world / 180) * L.amp - Math.cos(world / 90) * 8;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(VIEW.w + 100, VIEW.h);
      ctx.closePath();
      ctx.fill();
    }
  }

  function drawPlatforms() {
    for (let i = 0; i < PLATFORMS.length; i++) {
      const s = PLATFORMS[i];
      roundRect(s.x, s.y, s.w, s.h, s.ground ? 16 : 10);
      ctx.fillStyle = gfx.platforms[i];
      ctx.fill();

      ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
      roundRect(s.x + 4, s.y + 3, s.w - 8, 6, 3);
      ctx.fill();

      if (s.ground) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
        for (let x = s.x + 18; x < s.x + s.w - 10; x += 34) {
          ctx.beginPath();
          ctx.arc(x, s.y + 2, 3, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }

  function drawMovers() {
    for (const m of MOVERS) {
      roundRect(m.x, m.y, m.w, m.h, 9);
      ctx.fillStyle = gfx.mover;
      ctx.fill();

      ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
      roundRect(m.x + 4, m.y + 3, m.w - 8, 5, 2.5);
      ctx.fill();

      ctx.fillStyle = 'rgba(120, 80, 30, 0.55)';
      const cy = m.y + m.h / 2;
      const cx = m.x + m.w / 2;
      const dirn = m.axis === 'x' ? 0 : Math.PI / 2;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(dirn);
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(side * 18, 0);
        ctx.lineTo(side * 10, -5);
        ctx.lineTo(side * 10, 5);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    }
  }

  function drawStars() {
    for (const s of stars) {
      if (s.collected) continue;
      const bob = Math.sin(time * 2.4 + s.bob) * 4;
      ctx.save();
      ctx.translate(s.x, s.y + bob);
      ctx.rotate(Math.sin(time * 1.5 + s.bob) * 0.12);
      ctx.shadowColor = 'rgba(255, 180, 60, 0.6)';
      ctx.shadowBlur = 14;
      ctx.fillStyle = gfx.star;
      starPath(0, 0, STAR_R, STAR_R * 0.45);
      ctx.fill();
      ctx.restore();

      ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
      ctx.beginPath();
      ctx.arc(s.x - STAR_R * 0.3, s.y + bob - STAR_R * 0.4, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawSpikes() {
    for (const s of spikes) {
      const cx = s.x + s.w / 2;
      const cy = s.y + s.h / 2;
      const r = Math.max(s.w, s.h) / 2;

      ctx.save();
      ctx.translate(cx, cy);
      if (s.axis !== 'none') ctx.rotate(time * 0.9 + s.phase);
      ctx.fillStyle = gfx.spike;
      ctx.beginPath();
      for (let i = 0; i < 16; i++) {
        const ang = (i * Math.PI) / 8;
        const rad = i % 2 === 0 ? r + 8 : r * 0.75;
        const x = Math.cos(ang) * rad;
        const y = Math.sin(ang) * rad;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
      ctx.beginPath();
      ctx.arc(cx - r * 0.18, cy - r * 0.18, r * 0.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawGoal() {
    const cx = GOAL.x + GOAL.w / 2;
    const pulse = 1 + Math.sin(time * 3) * 0.08;

    ctx.save();
    ctx.translate(cx, GOAL.y + 36);
    ctx.shadowColor = 'rgba(255, 170, 40, 0.7)';
    ctx.shadowBlur = 30;
    ctx.fillStyle = gfx.goal;
    starPath(0, 0, 30 * pulse, 13 * pulse);
    ctx.fill();

    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    starPath(0, 0, 13 * pulse, 6 * pulse);
    ctx.fill();
    ctx.restore();
  }

  function drawPlayer() {
    const squash = player.onGround ? 1 : 1.06;
    const blink = hurtFlash > 0 && Math.floor(hurtFlash / 4) % 2 === 0;

    ctx.save();
    ctx.translate(player.x, player.y);
    if (!blink) {
      ctx.shadowColor = 'rgba(120, 90, 160, 0.3)';
      ctx.shadowBlur = 10;
      roundRect(0, 0, player.w, player.h * squash, 14);
      ctx.fillStyle = gfx.player;
      ctx.fill();
    }
    ctx.restore();

    if (blink) return;

    const eyeY = player.y + player.h * 0.4;
    const eyeX = player.x + player.w / 2;
    const eyeDx = player.facing * 3;
    ctx.fillStyle = '#3f2f52';
    ctx.beginPath();
    ctx.arc(eyeX - 7 + eyeDx, eyeY, 2.6, 0, Math.PI * 2);
    ctx.arc(eyeX + 7 + eyeDx, eyeY, 2.6, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#3f2f52';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(eyeX, eyeY + 5, 4, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.stroke();
  }

  function drawBurst() {
    if (!burst) return;
    for (const p of burst.parts) {
      const x = burst.x + p.vx * burst.t * 60;
      const y = burst.y + p.vy * burst.t * 60 + 0.5 * GRAVITY * (burst.t * 60) ** 2 * 0.5;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(p.rot + burst.t * 3);
      ctx.globalAlpha = Math.max(0, 1 - burst.t / 1.1);
      ctx.fillStyle = '#ffbf3a';
      starPath(0, 0, p.s, p.s * 0.45);
      ctx.fill();
      ctx.restore();
    }
  }

  function render() {
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.clearRect(0, 0, VIEW.w, VIEW.h);
    drawSky();
    drawClouds();
    drawHills();

    ctx.save();
    ctx.translate(-Math.round(camX), 0);
    drawPlatforms();
    drawMovers();
    drawStars();
    drawSpikes();
    drawGoal();
    drawPlayer();
    if (burst) {
      burst.t += 1 / 60;
      drawBurst();
    }
    ctx.restore();

    ctx.fillStyle = gfx.vignette;
    ctx.fillRect(0, 0, VIEW.w, VIEW.h);

    if (hurtFlash > 0) {
      ctx.fillStyle = `rgba(200, 70, 110, ${(hurtFlash / 44).toFixed(3)})`;
      ctx.fillRect(0, 0, VIEW.w, VIEW.h);
    }
  }

  const detachButtons = [
    attachButton(controls.left, 'left'),
    attachButton(controls.right, 'right'),
    attachButton(controls.jump, 'jump'),
  ];

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('resize', onResize);
  const resizeObserver =
    typeof ResizeObserver !== 'undefined' ? new ResizeObserver(onResize) : null;
  if (resizeObserver) resizeObserver.observe(canvas);

  buildGfx();
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
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('resize', onResize);
      detachButtons.forEach((fn) => fn());
      if (resizeObserver) resizeObserver.disconnect();
    },
    getState() {
      return {
        x: player.x,
        y: player.y,
        vy: player.vy,
        onGround: player.onGround,
        collected,
        total: stars.length,
        finished,
        time,
        timeLeft: Math.ceil(timeLeft / 60),
        spikes: spikes.map((s) => ({ x: s.x, y: s.y, w: s.w, h: s.h, axis: s.axis })),
        stars: stars.map((s) => ({ x: s.x, y: s.y, collected: s.collected })),
        movers: MOVERS.map((m) => ({ x: m.x, y: m.y, w: m.w, h: m.h, axis: m.axis })),
      };
    },
    win,
  };
}
