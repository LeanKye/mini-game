// Уровень 10: AR «Охота на духов».
// Сценарий: скан отпечатка -> явное «фото в удостоверение» (фронталка) -> AR-охота на метке HIRO ->
// финал: показ удостоверения и отправка в Telegram (no-cors) + запасной Web Share.
// Если камера/AR недоступны - игра работает как обычная 2D-охота (graceful fallback).

const VIEW_H = 520;
const MIN_W = 360;
const MAX_W = 760;
const TOTAL_WAVES = 3;
const SCAN_TIME = 1.6;
// ВРЕМЕННО для проверки пайплайна (скан -> камера -> снимок -> отправка). true вернёт
// экран «удостоверение» с превью и показом фото в финале.
const SHOW_CARD = false;
const AFRAME_URL = 'https://cdn.jsdelivr.net/npm/aframe@1.5.0/dist/aframe-master.min.js';
const ARJS_URL = 'https://cdn.jsdelivr.net/npm/@ar-js-org/ar.js@3.4.5/aframe/build/aframe-ar.js';
const PATT_URL = 'assets/ar/patt.hiro';

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

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Не загрузился ' + src));
    document.head.appendChild(s);
  });
}

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms)),
  ]);
}

function toBlob(canvas) {
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/png'));
}

export function createArGhost(canvas, { container, stage, onHint, onWin, telegram } = {}) {
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
  let t = 0;

  let phase = 'scan'; // scan | photo | hunt | final
  let auto = 0;
  let toast = '';
  let toastT = 0;

  const scan = { holding: false, progress: 0 };
  const photo = { state: 'idle', stream: null, video: null, countdown: 0, flash: 0 };
  const hunt = { mode: 'idle', wave: 0, zapped: 0, ghosts: [], spawnT: 0, score: 0 };
  let scene = null;
  let card = null;
  let cardBlob = null;
  let sendState = 'idle'; // idle | sending | ok | fail | off
  const pointer = { down: false, x: 0, y: 0 };

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

  function toLogical(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const px = (clientX - rect.left) * (canvas.width / rect.width);
    const py = (clientY - rect.top) * (canvas.height / rect.height);
    return { x: (px - offX) / scale, y: (py - offY) / scale };
  }

  // ── Фазы ────────────────────────────────────────────────
  function setPhase(p) {
    phase = p;
    auto = 0;
  }

  function enterPhoto() {
    setPhase('photo');
    photo.state = 'idle';
    photo.captured = false;
    if (SHOW_CARD && onHint) onHint('Шаг 2: фото для удостоверения');
  }

  function enterHunt() {
    setPhase('hunt');
    hunt.mode = 'idle';
    hunt.wave = 0;
    hunt.zapped = 0;
    hunt.ghosts = [];
    hunt.spawnT = 0;
    hunt.score = 0;
    if (onHint) onHint('Шаг 3: охота на духов');
    startAr();
  }

  // Числовой chat_id (не @username) - чтобы фото уходило только в указанный чат.
  function telegramChat() {
    const id = String((telegram && telegram.chatId) || '').trim();
    return /^-?\d+$/.test(id) ? id : '';
  }

  function hasTelegram() {
    return !!(telegram && telegram.token && telegramChat());
  }

  async function enterFinal() {
    stopAr();
    hunt.ghosts = [];
    setPhase('final');
    if (onHint) onHint(SHOW_CARD ? 'Вот твоё удостоверение агента' : 'Доступ подтверждён');
    if (sendState === 'idle') {
      sendState = hasTelegram() ? 'sending' : 'off';
      cardBlob = cardBlob || (card ? await toBlob(card) : null);
      if (sendState === 'sending') await sendCard();
    }
  }

  // ── Скан отпечатка ──────────────────────────────────────
  function stepScan(dt) {
    if (scan.holding) {
      scan.progress += dt / SCAN_TIME;
      if (scan.progress >= 1) {
        scan.progress = 1;
        scan.holding = false;
        auto = 0.9;
        toast = 'ДОСТУП РАЗРЕШЁН';
        toastT = 0.9;
      }
    } else if (scan.progress < 1) {
      scan.progress = Math.max(0, scan.progress - dt * 0.9);
    }
    if (SHOW_CARD && scan.progress >= 1 && auto > 0) {
      auto -= dt;
      if (auto <= 0) enterPhoto();
    }
  }

  // ── Шаг с камерой ───────────────────────────────────────
  // ВРЕМЕННО (SHOW_CARD = false): после скана сразу запрос камеры -> снимок без превью -> отправка в ТГ.
  // Позже SHOW_CARD = true вернёт экран «удостоверение» и показ фото.
  function frameFromVideo() {
    const v = photo.video;
    const w = 480;
    const h = 480;
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const g = c.getContext('2d');
    if (v && v.videoWidth) {
      const s = Math.min(v.videoWidth, v.videoHeight);
      const sx = (v.videoWidth - s) / 2;
      const sy = (v.videoHeight - s) / 2;
      g.save();
      g.translate(w, 0);
      g.scale(-1, 1);
      g.drawImage(v, sx, sy, s, s, 0, 0, w, h);
      g.restore();
    }
    return c;
  }

  async function startFrontCam() {
    if (photo.state === 'starting' || photo.state === 'waiting' || photo.captured) return;
    photo.state = 'starting';
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error('no getUserMedia');
      photo.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
      const v = document.createElement('video');
      v.playsInline = true;
      v.muted = true;
      v.autoplay = true;
      v.setAttribute('playsinline', '');
      v.srcObject = photo.stream;
      await v.play().catch(() => {});
      photo.video = v;
      photo.state = SHOW_CARD ? 'preview' : 'waiting';
      photo.countdown = SHOW_CARD ? 3 : 2.5; // в режиме ожидания - бюджет на появление кадра
      toast = SHOW_CARD ? 'Снимаем... не двигайся' : '';
      toastT = SHOW_CARD ? 1.2 : 0;
    } catch (e) {
      photo.state = 'unavailable';
      auto = 1.2;
    }
  }

  function stopFrontCam() {
    if (photo.stream) {
      photo.stream.getTracks().forEach((tr) => tr.stop());
      photo.stream = null;
    }
    photo.video = null;
  }

  async function capture() {
    if (photo.captured) return;
    photo.captured = true;
    const had = !!(photo.video && photo.video.videoWidth);
    const c = had ? frameFromVideo() : null;
    stopFrontCam();
    composeCard(c);
    cardBlob = card ? await toBlob(card) : null;
    photo.state = 'captured';
    photo.flash = 1;
    toast = SHOW_CARD ? 'Фото сделано' : '';
    toastT = SHOW_CARD ? 1 : 0;
    if (hasTelegram()) {
      sendState = 'sending';
      await sendCard();
    } else if (sendState === 'idle') {
      sendState = 'off';
    }
    auto = SHOW_CARD ? 1 : 0.5;
  }

  function stepPhoto(dt) {
    if (photo.flash > 0) photo.flash -= dt;
    if (photo.state === 'idle' && !SHOW_CARD) {
      startFrontCam();
      return;
    }
    if (photo.state === 'unavailable') {
      if (auto > 0) {
        auto -= dt;
        if (auto <= 0) {
          composeCard(null);
          if (sendState === 'idle') sendState = 'off';
          enterHunt();
        }
      }
      return;
    }
    if (photo.state === 'preview') {
      photo.countdown -= dt;
      if (photo.countdown <= 0) capture();
      return;
    }
    if (photo.state === 'waiting') {
      if (photo.video && photo.video.videoWidth) {
        capture();
        return;
      }
      photo.countdown -= dt;
      if (photo.countdown <= 0) capture();
      return;
    }
    if (photo.state === 'captured' && auto > 0) {
      auto -= dt;
      if (auto <= 0) enterHunt();
    }
  }

  function composeCard(source) {
    const w = 640;
    const h = 400;
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const g = c.getContext('2d');
    g.fillStyle = '#2a1c4d';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#f7f2ff';
    rr(g, 12, 12, w - 24, h - 24, 18);
    g.fill();
    g.fillStyle = '#8c6bd6';
    g.font = "800 20px 'Nunito', sans-serif";
    g.textAlign = 'left';
    g.textBaseline = 'alphabetic';
    g.fillText('ПРОПУСК АГЕНТА', 34, 54);
    g.fillStyle = '#4a3a78';
    g.font = "700 12px 'Nunito', sans-serif";
    g.fillText('ОТДЕЛ: ОХОТА НА ДУХОВ   ·   КОД AR-10', 34, 74);
    const px = 34;
    const py = 92;
    const pw = 280;
    const ph = 272;
    g.save();
    rr(g, px, py, pw, ph, 12);
    g.clip();
    if (source) {
      g.drawImage(source, px, py, pw, ph);
    } else {
      g.fillStyle = '#d9cdf5';
      g.fillRect(px, py, pw, ph);
      g.fillStyle = '#6a4fb0';
      g.font = "800 20px 'Nunito', sans-serif";
      g.textAlign = 'center';
      g.fillText('НЕТ ФОТО', px + pw / 2, py + ph / 2);
    }
    g.restore();
    g.strokeStyle = '#2a1c4d';
    g.lineWidth = 3;
    rr(g, px, py, pw, ph, 12);
    g.stroke();
    const fx = 340;
    g.fillStyle = '#2a1c4d';
    g.font = "800 15px 'Nunito', sans-serif";
    g.textAlign = 'left';
    g.fillText('ИМЯ:', fx, 130);
    g.fillText('СТАТУС:', fx, 190);
    g.fillText('ДОСТУП:', fx, 250);
    g.fillStyle = '#4a3a78';
    g.font = "700 15px 'Nunito', sans-serif";
    g.fillText('Агент', fx + 70, 130);
    g.fillText('на испытании', fx + 70, 190);
    g.fillText('разрешён', fx + 70, 250);
    g.fillStyle = '#8c6bd6';
    g.font = "700 12px 'Nunito', sans-serif";
    g.fillText(new Date().toLocaleDateString('ru-RU'), fx, 320);
    card = c;
    cardBlob = null;
  }

  // ── Охота на духов ──────────────────────────────────────
  function waveQuota(w) {
    return 3 + w * 2;
  }

  async function startAr() {
    hunt.mode = 'idle';
    try {
      if (!container) throw new Error('нет контейнера AR');
      if (!window.AFRAME) await withTimeout(loadScript(AFRAME_URL), 9000);
      if (!window.AFRAME) throw new Error('A-Frame не загрузился');
      if (!window.AFRAME.components || !window.AFRAME.components['arjs']) {
        await withTimeout(loadScript(ARJS_URL), 9000);
      }
      buildScene();
      hunt.mode = 'ar';
      hunt.wave = 0;
      hunt.zapped = 0;
      hunt.spawnT = 0.6;
      if (onHint) onHint('Наведи камеру на метку «Пропуск агента»');
    } catch (e) {
      cleanupScene();
      start2D();
    }
  }

  function buildScene() {
    if (!container) return;
    container.classList.remove('hidden');
    canvas.classList.add('hidden');
    if (stage) stage.classList.add('hidden');
    const s = document.createElement('a-scene');
    s.setAttribute('embedded', '');
    s.setAttribute('vr-mode-ui', 'enabled: false');
    s.setAttribute(
      'arjs',
      'sourceType: webcam; debugUIEnabled: false; detectionMode: mono_and_matrix; matrixCodeType: 3x3;'
    );
    s.setAttribute('renderer', 'antialias: true; alpha: true;');
    const marker = document.createElement('a-marker');
    marker.setAttribute('type', 'pattern');
    marker.setAttribute('url', PATT_URL);
    marker.setAttribute('smooth', 'true');
    const cam = document.createElement('a-entity');
    cam.setAttribute('camera', '');
    cam.setAttribute('cursor', 'rayOrigin: mouse; fuse: false;');
    cam.setAttribute('raycaster', 'objects: .ghost; far: 40;');
    s.appendChild(marker);
    s.appendChild(cam);
    s._arMarker = marker;
    container.appendChild(s);
    scene = s;
    spawnArGhost(waveQuota(0));
    hunt.spawned = waveQuota(0);
  }

  function spawnArGhost() {
    const marker = scene && scene._arMarker;
    if (!marker) return;
    const g = document.createElement('a-entity');
    g.setAttribute('class', 'ghost');
    const x = (Math.random() - 0.5) * 2.4;
    const y = 0.6 + Math.random() * 1.6;
    const z = (Math.random() - 0.5) * 2.4;
    g.setAttribute('position', `${x.toFixed(2)} ${y.toFixed(2)} ${z.toFixed(2)}`);
    g.setAttribute('geometry', 'primitive: sphere; radius: 0.22');
    g.setAttribute('material', 'color: #b388ff; opacity: 0.82; transparent: true; emissive: #7a5cff; emissiveIntensity: 0.6');
    g.setAttribute('animation', 'property: position; dir: alternate; dur: 1400; loop: true; to: ' + x.toFixed(2) + ' ' + (y + 0.25).toFixed(2) + ' ' + z.toFixed(2));
    g.addEventListener('click', () => {
      if (!g.parentNode) return;
      g.parentNode.removeChild(g);
      zapAr();
    });
    marker.appendChild(g);
    setTimeout(() => {
      if (g.parentNode) g.parentNode.removeChild(g);
    }, 4200);
  }

  function zapAr() {
    hunt.zapped += 1;
    hunt.score += 1;
    if (hunt.zapped >= waveQuota(hunt.wave)) {
      if (hunt.wave + 1 < TOTAL_WAVES) {
        hunt.wave += 1;
        hunt.zapped = 0;
        for (let i = 0; i < waveQuota(hunt.wave); i++) spawnArGhost();
        if (onHint) onHint(`Волна ${hunt.wave + 1} из ${TOTAL_WAVES}`);
      } else {
        enterFinal();
      }
    }
  }

  function cleanupScene() {
    if (scene && scene.parentNode) scene.parentNode.removeChild(scene);
    scene = null;
    if (container) container.classList.add('hidden');
    canvas.classList.remove('hidden');
    if (stage) stage.classList.remove('hidden');
  }

  function stopAr() {
    cleanupScene();
  }

  function start2D() {
    hunt.mode = '2d';
    hunt.wave = 0;
    hunt.zapped = 0;
    hunt.ghosts = [];
    hunt.spawnT = 0.5;
    hunt.score = 0;
    canvas.classList.remove('hidden');
    if (stage) stage.classList.remove('hidden');
    if (onHint) onHint(`Волна 1 из ${TOTAL_WAVES}`);
  }

  function spawn2D() {
    const m = 54;
    hunt.ghosts.push({
      x: m + Math.random() * (VIEW.w - 2 * m),
      y: 120 + Math.random() * (VIEW.h - 250),
      r: 30,
      t: Math.random() * 6,
      life: 2.8,
    });
  }

  function stepHunt(dt) {
    if (hunt.mode === '2d') {
      const quota = waveQuota(hunt.wave);
      if (hunt.zapped < quota) {
        hunt.spawnT -= dt;
        if (hunt.spawnT <= 0) {
          hunt.spawnT = Math.max(0.5, 1 - hunt.wave * 0.15);
          spawn2D();
        }
      }
      for (const g of hunt.ghosts) {
        g.t += dt;
        g.life -= dt;
      }
      hunt.ghosts = hunt.ghosts.filter((g) => g.life > 0);
      if (hunt.zapped >= quota && hunt.ghosts.length === 0) {
        if (hunt.wave + 1 < TOTAL_WAVES) {
          hunt.wave += 1;
          hunt.zapped = 0;
          hunt.spawnT = 0.5;
          if (onHint) onHint(`Волна ${hunt.wave + 1} из ${TOTAL_WAVES}`);
        } else {
          enterFinal();
        }
      }
    }
  }

  function zap2D(q) {
    let best = -1;
    let bestD = 1e9;
    hunt.ghosts.forEach((g, i) => {
      const d = Math.hypot(g.x - q.x, g.y - q.y);
      if (d < g.r + 14 && d < bestD) {
        bestD = d;
        best = i;
      }
    });
    if (best >= 0) {
      hunt.ghosts.splice(best, 1);
      hunt.zapped += 1;
      hunt.score += 1;
    }
  }

  // ── Отправка удостоверения ──────────────────────────────
  async function sendCard() {
    if (!cardBlob) {
      sendState = 'fail';
      return;
    }
    try {
      const fd = new FormData();
      fd.append('chat_id', telegramChat());
      fd.append('caption', 'Удостоверение агента · AR-10');
      fd.append('photo', cardBlob, 'agent-id.png');
      await fetch(`https://api.telegram.org/bot${telegram.token}/sendPhoto`, {
        method: 'POST',
        body: fd,
        mode: 'no-cors',
      });
      sendState = 'ok';
    } catch (e) {
      sendState = 'fail';
    }
  }

  async function shareCard() {
    try {
      if (!cardBlob) return;
      const file = new File([cardBlob], 'agent-id.png', { type: 'image/png' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Удостоверение агента' });
      } else if (navigator.share) {
        await navigator.share({ title: 'Удостоверение агента', text: 'Моё удостоверение агента' });
      }
    } catch (e) {
      /* пользователь отменил - ок */
    }
  }

  // ── Ввод ────────────────────────────────────────────────
  function photoButtonRect() {
    return { x: VIEW.w / 2 - 130, y: VIEW.h - 130, w: 260, h: 46 };
  }
  function nextButtonRect() {
    return { x: VIEW.w / 2 - 120, y: VIEW.h - 74, w: 240, h: 44 };
  }
  function shareButtonRect() {
    return { x: VIEW.w / 2 - 120, y: VIEW.h - 132, w: 240, h: 44 };
  }
  function inside(b, q) {
    return q.x >= b.x && q.x <= b.x + b.w && q.y >= b.y && q.y <= b.y + b.h;
  }

  function onPointerDown(e) {
    if (phase === 'hunt' && hunt.mode === 'ar') return;
    e.preventDefault();
    const q = toLogical(e.clientX, e.clientY);
    pointer.down = true;
    pointer.x = q.x;
    pointer.y = q.y;
    if (phase === 'scan') {
      scan.holding = true;
    } else if (phase === 'photo') {
      if (SHOW_CARD && photo.state === 'idle' && inside(photoButtonRect(), q)) startFrontCam();
    } else if (phase === 'hunt' && hunt.mode === '2d') {
      zap2D(q);
    } else if (phase === 'final') {
      if (inside(shareButtonRect(), q)) shareCard();
      else if (inside(nextButtonRect(), q)) finishRun();
    }
  }

  function onPointerUp() {
    const granted = scan.progress >= 1;
    scan.holding = false;
    pointer.down = false;
    // ВРЕМЕННО: камеру запрашиваем прямо на отпускании пальца (жест), без отдельного экрана.
    if (phase === 'scan' && granted) {
      enterPhoto();
      if (!SHOW_CARD) startFrontCam();
    }
  }

  // ── Отрисовка ───────────────────────────────────────────
  function drawGhost(x, y, r, t) {
    const bob = Math.sin(t * 2.4) * 4;
    ctx.save();
    ctx.translate(x, y + bob);
    ctx.fillStyle = 'rgba(179,136,255,0.92)';
    ctx.beginPath();
    ctx.arc(0, -r * 0.2, r, Math.PI, 0);
    ctx.lineTo(r, r * 0.7);
    for (let i = 0; i < 4; i++) {
      const w = r / 2;
      const x0 = r - i * (2 * r) / 4;
      ctx.quadraticCurveTo(x0 - w / 2, r * (i % 2 ? 0.35 : 1.05), x0 - w, r * 0.7);
    }
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#5b3d8f';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#2b1d3d';
    ctx.beginPath();
    ctx.arc(-r * 0.35, -r * 0.25, 2.6, 0, Math.PI * 2);
    ctx.arc(r * 0.35, -r * 0.25, 2.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function button(label, b, color) {
    ctx.fillStyle = 'rgba(20,14,40,0.9)';
    rr(ctx, b.x, b.y, b.w, b.h, 12);
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    rr(ctx, b.x, b.y, b.w, b.h, 12);
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.font = "800 14px 'Nunito', sans-serif";
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, b.x + b.w / 2, b.y + b.h / 2);
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
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    if (phase === 'scan') renderScan();
    else if (phase === 'photo') {
      if (SHOW_CARD) renderPhoto();
    }
    else if (phase === 'hunt' && hunt.mode === '2d') render2D();
    else if (phase === 'hunt') {
      ctx.fillStyle = '#d9cdf5';
      ctx.font = "700 16px 'Nunito', sans-serif";
      ctx.fillText('Наведи камеру на метку', VIEW.w / 2, VIEW.h / 2);
    } else if (phase === 'final') renderFinal();

    if (toastT > 0 && phase !== 'hunt') {
      ctx.fillStyle = 'rgba(20,14,40,0.82)';
      rr(ctx, VIEW.w / 2 - 150, 96, 300, 40, 12);
      ctx.fill();
      ctx.fillStyle = '#7dffc4';
      ctx.font = "800 15px 'Nunito', sans-serif";
      ctx.fillText(toast, VIEW.w / 2, 116);
    }
  }

  function renderScan() {
    ctx.fillStyle = '#fff';
    ctx.font = "800 20px 'Nunito', sans-serif";
    ctx.fillText('Сканирование отпечатка', VIEW.w / 2, 78);
    const cx = VIEW.w / 2;
    const cy = VIEW.h / 2 - 20;
    const R = 96;
    ctx.strokeStyle = '#3a2a6a';
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = '#4cc9f0';
    ctx.beginPath();
    ctx.arc(cx, cy, R, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * scan.progress);
    ctx.stroke();
    // отпечаток
    ctx.strokeStyle = scan.progress >= 1 ? '#7dffc4' : '#c9b8ff';
    ctx.lineWidth = 3;
    for (let i = 0; i < 4; i++) {
      const rx = 14 + i * 9;
      const ry = 18 + i * 10;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, 0, Math.PI * 0.12, Math.PI * 0.88, false);
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, 0, Math.PI * 1.12, Math.PI * 1.88, false);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(cx - 6, cy - 40);
    ctx.lineTo(cx - 6, cy + 40);
    ctx.stroke();
    ctx.fillStyle = '#d9cdf5';
    ctx.font = "600 14px 'Nunito', sans-serif";
    const txt = scan.progress >= 1 ? 'Доступ разрешён' : 'Приложи и удерживай палец';
    ctx.fillText(txt, cx, cy + R + 48);
    if (scan.progress > 0 && scan.progress < 1) {
      ctx.fillStyle = '#4cc9f0';
      ctx.font = "800 14px 'Nunito', sans-serif";
      ctx.fillText(Math.round(scan.progress * 100) + '%', cx, cy + R + 72);
    }
  }

  function renderPhoto() {
    if (!SHOW_CARD) {
      ctx.fillStyle = '#fff';
      ctx.font = "800 19px 'Nunito', sans-serif";
      ctx.fillText('Снимок для доступа', VIEW.w / 2, 74);
      const cx = VIEW.w / 2;
      const cy = VIEW.h / 2 - 10;
      const done = photo.state === 'captured';
      const fail = photo.state === 'unavailable';
      ctx.strokeStyle = 'rgba(201,184,255,0.28)';
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.arc(cx, cy, 62, 0, Math.PI * 2);
      ctx.stroke();
      if (!done && !fail) {
        const a = t * 3;
        ctx.strokeStyle = '#4cc9f0';
        ctx.beginPath();
        ctx.arc(cx, cy, 62, a, a + Math.PI * 0.7);
        ctx.stroke();
      }
      ctx.fillStyle = done ? '#7dffc4' : fail ? '#ff9fc0' : '#c9b8ff';
      ctx.font = "800 46px 'Nunito', sans-serif";
      ctx.fillText(done ? '✓' : fail ? '—' : '◉', cx, cy + 2);
      ctx.fillStyle = '#d9cdf5';
      ctx.font = "600 14px 'Nunito', sans-serif";
      const label = done
        ? 'Фото отправлено'
        : fail
          ? 'Камера недоступна - идём дальше'
          : 'Разреши камеру и не двигайся';
      ctx.fillText(label, cx, cy + 108);
      if (photo.flash > 0) {
        ctx.fillStyle = `rgba(255,255,255,${Math.min(1, photo.flash)})`;
        ctx.fillRect(0, 0, VIEW.w, VIEW.h);
      }
      return;
    }
    ctx.fillStyle = '#fff';
    ctx.font = "800 19px 'Nunito', sans-serif";
    ctx.fillText('Фото в удостоверение', VIEW.w / 2, 74);
    const boxW = VIEW.w - 64;
    const boxH = Math.round(boxW * 1.05);
    const bx = 32;
    const by = 104;
    ctx.strokeStyle = '#8c6bd6';
    ctx.lineWidth = 3;
    rr(ctx, bx, by, boxW, boxH, 14);
    ctx.stroke();
    if (photo.state === 'preview' && photo.video && photo.video.videoWidth) {
      ctx.save();
      rr(ctx, bx, by, boxW, boxH, 14);
      ctx.clip();
      ctx.translate(bx + boxW, by);
      ctx.scale(-1, 1);
      const v = photo.video;
      const s = Math.min(v.videoWidth, v.videoHeight);
      ctx.drawImage(v, (v.videoWidth - s) / 2, (v.videoHeight - s) / 2, s, s, 0, 0, boxW, boxH);
      ctx.restore();
      ctx.fillStyle = '#fff';
      ctx.font = "800 64px 'Nunito', sans-serif";
      ctx.fillText(String(Math.max(1, Math.ceil(photo.countdown))), VIEW.w / 2, by + boxH / 2);
    } else if (photo.state === 'captured') {
      ctx.fillStyle = '#7dffc4';
      ctx.font = "800 52px 'Nunito', sans-serif";
      ctx.fillText('✓', VIEW.w / 2, by + boxH / 2);
      ctx.fillStyle = '#d9cdf5';
      ctx.font = "700 15px 'Nunito', sans-serif";
      ctx.fillText('Фото сделано', VIEW.w / 2, by + boxH / 2 + 52);
    } else {
      ctx.fillStyle = '#b9a8e0';
      ctx.font = "600 14px 'Nunito', sans-serif";
      ctx.fillText(
        photo.state === 'unavailable' ? 'Камера недоступна' : 'Нажми, чтобы приложить палец к сенсору',
        VIEW.w / 2,
        by + boxH / 2
      );
    }
    if (photo.state === 'idle') button('Сделать снимок', photoButtonRect(), '#ffe066');
    if (photo.flash > 0) {
      ctx.fillStyle = `rgba(255,255,255,${Math.min(1, photo.flash)})`;
      ctx.fillRect(0, 0, VIEW.w, VIEW.h);
    }
  }

  function render2D() {
    ctx.fillStyle = '#fff';
    ctx.font = "800 18px 'Nunito', sans-serif";
    ctx.fillText(`Волна ${hunt.wave + 1} из ${TOTAL_WAVES}`, VIEW.w / 2, 44);
    ctx.fillStyle = '#d9cdf5';
    ctx.font = "600 13px 'Nunito', sans-serif";
    ctx.fillText(`Сбито: ${hunt.score}   ·   тапай по духам`, VIEW.w / 2, 70);
    for (const g of hunt.ghosts) drawGhost(g.x, g.y, g.r, g.t);
    ctx.fillStyle = '#b9a8e0';
    ctx.font = "600 12px 'Nunito', sans-serif";
    ctx.fillText('Свайп-тап по духу, чтобы изгнать его', VIEW.w / 2, VIEW.h - 22);
  }

  function renderFinal() {
    ctx.fillStyle = '#fff';
    ctx.font = "800 20px 'Nunito', sans-serif";
    ctx.fillText(SHOW_CARD ? 'Удостоверение агента' : 'Доступ подтверждён', VIEW.w / 2, 56);
    let cardBottom = VIEW.h - 210;
    if (SHOW_CARD && card) {
      const maxH = VIEW.h - 210 - 82;
      const ratio = card.height / card.width;
      const cw = Math.min(VIEW.w - 56, Math.round(maxH / ratio));
      const ch = Math.round(cw * ratio);
      const cx = (VIEW.w - cw) / 2;
      ctx.drawImage(card, cx, 82, cw, ch);
      cardBottom = 82 + ch;
    } else if (!SHOW_CARD) {
      ctx.fillStyle = '#d9cdf5';
      ctx.font = "600 15px 'Nunito', sans-serif";
      ctx.fillText('Снимок сделан', VIEW.w / 2, VIEW.h / 2 - 10);
    }
    let status = '';
    if (sendState === 'sending') status = 'Отправляю в Telegram...';
    else if (sendState === 'ok') status = 'Отправлено в Telegram ✓';
    else if (sendState === 'fail') status = 'Отправить не удалось';
    else if (sendState === 'off') status = 'Отправка не настроена';
    if (status) {
      ctx.fillStyle = sendState === 'ok' ? '#7dffc4' : sendState === 'fail' ? '#ff9fc0' : '#d9cdf5';
      ctx.font = "700 13px 'Nunito', sans-serif";
      ctx.fillText(status, VIEW.w / 2, cardBottom + 22);
      if (hasTelegram() && sendState !== 'off') {
        ctx.fillStyle = '#9a8ac0';
        ctx.font = "600 12px 'Nunito', sans-serif";
        ctx.fillText('в чат …' + telegramChat().slice(-4), VIEW.w / 2, cardBottom + 40);
      }
    }
    button('Поделиться', shareButtonRect(), '#c9b8ff');
    button('Дальше', nextButtonRect(), '#ffe066');
  }

  // ── Цикл ────────────────────────────────────────────────
  function step(dt) {
    t += dt;
    if (toastT > 0) toastT -= dt;
    if (phase === 'scan') stepScan(dt);
    else if (phase === 'photo') stepPhoto(dt);
    else if (phase === 'hunt') stepHunt(dt);
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
    if (phase !== 'hunt' || hunt.mode === '2d') render();
  }

  function finishRun() {
    if (finished) return;
    finished = true;
    stopFrontCam();
    stopAr();
    setTimeout(() => {
      if (onWin) onWin();
    }, 500);
    setTimeout(() => {
      running = false;
      if (raf) cancelAnimationFrame(raf);
    }, 700);
  }

  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  const onBlur = () => {
    scan.holding = false;
    pointer.down = false;
  };
  window.addEventListener('blur', onBlur);
  window.addEventListener('resize', setScale);

  setScale();

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
      stopFrontCam();
      stopAr();
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerUp);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('resize', setScale);
    },
    win() {
      finishRun();
    },
    getState() {
      return { phase, huntMode: hunt.mode, wave: hunt.wave + 1, score: hunt.score, sendState, finished };
    },
    test: {
      phase: () => phase,
      huntMode: () => hunt.mode,
      wave: () => hunt.wave + 1,
      score: () => hunt.score,
      ghosts: () => (hunt.mode === '2d' ? hunt.ghosts.length : 0),
      sendState: () => sendState,
      // быстрое прохождение фаз
      skipScan: () => {
        if (phase === 'scan') {
          scan.progress = 1;
          scan.holding = false;
          enterPhoto();
        }
      },
      skipPhoto: () => {
        if (phase === 'photo') {
          stopFrontCam();
          composeCard(null);
          enterHunt();
        }
      },
      completeHunt: () => {
        if (phase === 'hunt') enterFinal();
      },
      finish: () => finishRun(),
      // сымитировать успешную отправку (без сети)
      markSent: () => {
        sendState = 'off';
      },
    },
  };
}
