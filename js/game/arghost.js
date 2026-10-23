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
  const photo = { state: 'idle', stream: null, video: null, countdown: 0, flash: 0, failed: false, frameBlob: null };
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
    photo.failed = false;
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
  // Можно выключить отправку в тестах (tg = {}), чтобы не было сетевых запросов.
  let tg = telegram || {};

  function telegramChat() {
    const id = String((tg && tg.chatId) || '').trim();
    return /^-?\d+$/.test(id) ? id : '';
  }

  function hasTelegram() {
    return !!(tg && tg.token && telegramChat());
  }

  async function enterFinal() {
    stopAr();
    hunt.ghosts = [];
    setPhase('final');
    if (onHint) onHint(SHOW_CARD ? 'Вот твоё удостоверение агента' : 'Доступ подтверждён');
    if (sendState === 'idle') {
      sendState = hasTelegram() ? 'sending' : 'off';
      cardBlob = cardBlob || (card ? await toBlob(card) : null);
      if (sendState === 'sending') await sendPhotos();
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
    // кадр 3:4 (вертикально, как селфи в руке), вырезаем центр исходного видео без искажений
    const w = 480;
    const h = 640;
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const g = c.getContext('2d');
    if (v && v.videoWidth) {
      const vw = v.videoWidth;
      const vh = v.videoHeight;
      let sw = vw;
      let sh = vh;
      if (vw / vh > 3 / 4) sw = (vh * 3) / 4;
      else sh = (vw * 4) / 3;
      const sx = (vw - sw) / 2;
      const sy = (vh - sh) / 2;
      g.save();
      g.translate(w, 0);
      g.scale(-1, 1);
      g.drawImage(v, sx, sy, sw, sh, 0, 0, w, h);
      g.restore();
    }
    return c;
  }

  async function startFrontCam() {
    if (photo.state === 'starting' || photo.state === 'waiting' || photo.captured) return;
    photo.state = 'starting';
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error('no getUserMedia');
      photo.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 720 }, height: { ideal: 720 } },
        audio: false,
      });
      const v = document.createElement('video');
      v.playsInline = true;
      v.muted = true;
      v.autoplay = true;
      v.setAttribute('playsinline', '');
      v.setAttribute('webkit-playsinline', '');
      // iOS Safari НЕ декодирует кадры у <video> вне DOM -> держим его в документе (невидимо).
      v.style.cssText = 'position:fixed;left:-9999px;top:0;width:2px;height:2px;opacity:0;pointer-events:none;';
      v.srcObject = photo.stream;
      document.body.appendChild(v);
      photo.video = v;
      await v.play().catch(() => {});
      photo.state = SHOW_CARD ? 'preview' : 'waiting';
      photo.countdown = SHOW_CARD ? 3 : 5; // в режиме ожидания - бюджет на появление кадра
      toast = SHOW_CARD ? 'Снимаем... не двигайся' : '';
      toastT = SHOW_CARD ? 1.2 : 0;
    } catch (e) {
      photo.state = 'unavailable';
      photo.failed = true;
      auto = 1.2;
      if (!SHOW_CARD) {
        toast = 'Камера недоступна';
        toastT = 1.4;
      }
    }
  }

  function stopFrontCam() {
    if (photo.video && photo.video.parentNode) photo.video.parentNode.removeChild(photo.video);
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
    photo.frameBlob = c ? await toBlob(c) : null;
    composeCard(c);
    cardBlob = card ? await toBlob(card) : null;
    photo.state = 'captured';
    photo.flash = 1;
    toast = SHOW_CARD ? 'Фото сделано' : '';
    toastT = SHOW_CARD ? 1 : 0;
    if (hasTelegram()) {
      sendState = 'sending';
      await sendPhotos();
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
          if (sendState === 'idle') sendState = hasTelegram() ? 'fail' : 'off';
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
      const v = photo.video;
      if (v && v.videoWidth && v.readyState >= 2) {
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
    const pw = 216;
    const ph = 288;
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

  function playArVideo() {
    if (!container) return;
    const v = container.querySelector('video');
    if (!v) return;
    v.muted = true;
    v.setAttribute('playsinline', '');
    v.setAttribute('webkit-playsinline', '');
    const p = v.play();
    if (p && p.catch) p.catch(() => {});
  }

  let arWatch = null;
  function startArWatch() {
    stopArWatch();
    let n = 0;
    arWatch = setInterval(() => {
      playArVideo();
      if (++n > 12) stopArWatch();
    }, 500);
  }
  function stopArWatch() {
    if (arWatch) {
      clearInterval(arWatch);
      arWatch = null;
    }
  }

  function showArTapPrompt() {
    if (!container || container.querySelector('.ar-tap')) return;
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'ar-tap';
    b.textContent = 'Включить AR';
    b.addEventListener('click', () => {
      playArVideo();
      b.remove();
    });
    container.appendChild(b);
  }

  function buildScene() {
    if (!container) return;
    container.classList.remove('hidden');
    container.classList.add('is-full');
    canvas.classList.add('hidden');
    if (stage) stage.classList.add('hidden');
    const s = document.createElement('a-scene');
    s.setAttribute('embedded', '');
    s.setAttribute('vr-mode-ui', 'enabled: false');
    s.setAttribute('loading-screen', 'enabled: false');
    // без системного запроса «Motion & Orientation Access» (страшная плашка на англ.)
    s.setAttribute('device-orientation-permission-ui', 'enabled: false');
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
    // look-controls не нужен в AR (камерой управляет AR.js) и провоцирует запрос ориентации
    cam.setAttribute('look-controls', 'enabled: false');
    cam.setAttribute('cursor', 'rayOrigin: mouse; fuse: false;');
    cam.setAttribute('raycaster', 'objects: .ghost; far: 40;');
    s.appendChild(marker);
    s.appendChild(cam);
    s._arMarker = marker;
    container.appendChild(s);
    scene = s;
    // iOS обычно не запускает видео-фон без жеста: следим за <video> и даём кнопку «Включить AR».
    startArWatch();
    showArTapPrompt();
    buildArHud(marker);
  }

  // ── Призрак: картинка в стиле скриншота (светло-голубое тело, чёрный контур, фиолетовое лицо) ──
  let ghostCanvas = null;
  let ghostDataUrl = null;
  function ghostArt() {
    if (ghostCanvas) return ghostCanvas;
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 512;
    const g = c.getContext('2d');
    g.lineJoin = 'round';
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(170, 85);
    g.bezierCurveTo(190, 30, 320, 25, 345, 95);
    g.bezierCurveTo(352, 140, 360, 160, 395, 178);
    g.bezierCurveTo(440, 195, 480, 230, 487, 278);
    g.bezierCurveTo(470, 270, 440, 265, 415, 285);
    g.bezierCurveTo(395, 310, 385, 350, 425, 424);
    g.bezierCurveTo(405, 420, 390, 425, 380, 430);
    g.bezierCurveTo(330, 445, 320, 470, 260, 470);
    g.bezierCurveTo(200, 470, 170, 420, 120, 425);
    g.bezierCurveTo(90, 428, 75, 430, 70, 430);
    g.bezierCurveTo(95, 375, 120, 330, 140, 240);
    g.bezierCurveTo(115, 300, 100, 280, 115, 270);
    g.bezierCurveTo(90, 260, 60, 250, 25, 278);
    g.bezierCurveTo(40, 225, 85, 185, 150, 170);
    g.bezierCurveTo(158, 155, 165, 120, 170, 85);
    g.closePath();
    g.fillStyle = '#e6f9ff';
    g.fill();
    g.strokeStyle = '#000';
    g.lineWidth = 14;
    g.stroke();
    // глаза и рот
    g.fillStyle = '#4d3a8a';
    g.strokeStyle = '#000';
    g.lineWidth = 10;
    g.beginPath();
    g.ellipse(230, 140, 30, 24, 0, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    g.beginPath();
    g.ellipse(302, 150, 30, 24, 0, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    g.lineWidth = 12;
    g.beginPath();
    g.ellipse(256, 210, 26, 36, 0, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    // складки
    g.lineWidth = 14;
    g.beginPath();
    g.moveTo(140, 245);
    g.lineTo(120, 318);
    g.stroke();
    g.beginPath();
    g.moveTo(372, 245);
    g.lineTo(395, 318);
    g.stroke();
    g.beginPath();
    g.moveTo(213, 320);
    g.lineTo(190, 400);
    g.stroke();
    g.beginPath();
    g.moveTo(297, 320);
    g.lineTo(322, 400);
    g.stroke();
    ghostCanvas = c;
    return c;
  }

  function ghostSrc() {
    if (!ghostDataUrl) ghostDataUrl = ghostArt().toDataURL('image/png');
    return ghostDataUrl;
  }

  // ── HUD поверх AR: волна, сколько изгнано, подсказка ──
  let arFound = false;
  let lastHud = '';
  function buildArHud(marker) {
    const hud = document.createElement('div');
    hud.className = 'ar-hud';
    container.appendChild(hud);
    scene._arHud = hud;
    lastHud = '';
    arFound = false;
    marker.addEventListener('markerFound', () => {
      arFound = true;
    });
    marker.addEventListener('markerLost', () => {
      arFound = false;
    });
  }

  function setArHud(msg) {
    const hud = scene && scene._arHud;
    if (!hud) return;
    const top = `Волна ${hunt.wave + 1} из ${TOTAL_WAVES} · изгнано ${hunt.zapped} из ${waveQuota(hunt.wave)}`;
    const text = top + '|' + msg;
    if (text === lastHud) return;
    lastHud = text;
    hud.innerHTML = '';
    const t = document.createElement('div');
    t.className = 'ar-hud__top';
    t.textContent = top;
    const m = document.createElement('div');
    m.className = 'ar-hud__msg';
    m.textContent = msg;
    hud.appendChild(t);
    hud.appendChild(m);
  }

  // ── Призраки в AR: появляются над меткой и уходят сами, охота не зависает ──
  function spawnArGhost() {
    const marker = scene && scene._arMarker;
    if (!marker) return;
    const x = (Math.random() - 0.5) * 1.6;
    const y = 0.35 + Math.random() * 0.9;
    const z = (Math.random() - 0.5) * 1.2;
    const g = document.createElement('a-plane');
    g.setAttribute('class', 'ghost');
    g.setAttribute('width', '0.55');
    g.setAttribute('height', '0.55');
    g.setAttribute('position', `${x.toFixed(2)} ${y.toFixed(2)} ${z.toFixed(2)}`);
    g.setAttribute('material', { src: ghostSrc(), transparent: true, alphaTest: 0.1, side: 'double' });
    g.setAttribute('animation', {
      property: 'position',
      dir: 'alternate',
      dur: 1500,
      loop: true,
      easing: 'easeInOutSine',
      to: `${x.toFixed(2)} ${(y + 0.12).toFixed(2)} ${z.toFixed(2)}`,
    });
    marker.appendChild(g);
    setTimeout(() => {
      if (g.parentNode) g.parentNode.removeChild(g);
    }, 4500);
  }

  function clearArGhosts() {
    if (!scene || !scene._arMarker) return;
    scene._arMarker.querySelectorAll('.ghost').forEach((el) => {
      if (el.parentNode) el.parentNode.removeChild(el);
    });
  }

  function zapAr() {
    hunt.zapped += 1;
    hunt.score += 1;
    if (hunt.zapped >= waveQuota(hunt.wave)) {
      clearArGhosts();
      if (hunt.wave + 1 < TOTAL_WAVES) {
        hunt.wave += 1;
        hunt.zapped = 0;
        hunt.spawnT = 0.6;
        if (onHint) onHint(`Волна ${hunt.wave + 1} из ${TOTAL_WAVES}`);
      } else {
        enterFinal();
      }
    }
    setArHud(arFound ? 'Метка найдена - тапай по духам!' : 'Наведи камеру на метку «Пропуск агента»');
  }

  // Тап по экрану: луч из камеры проверяет, попал ли он в видимого призрака.
  function tapAr(e) {
    if (hunt.mode !== 'ar' || !scene || !scene.camera || !window.AFRAME) return;
    const THREE = window.AFRAME.THREE;
    const cvs = scene.canvas;
    if (!THREE || !cvs) return;
    const r = cvs.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((e.clientX - r.left) / r.width) * 2 - 1,
      -((e.clientY - r.top) / r.height) * 2 + 1
    );
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, scene.camera);
    const objs = Array.from(scene.querySelectorAll('.ghost'))
      .map((el) => el.object3D)
      .filter(Boolean);
    const hits = ray.intersectObjects(objs, true);
    if (!hits.length) return;
    let o = hits[0].object;
    let visible = true;
    for (let p = o; p; p = p.parent) if (p.visible === false) visible = false;
    if (!visible) return;
    while (o && !o.el) o = o.parent;
    if (o && o.el && o.el.parentNode) {
      o.el.parentNode.removeChild(o.el);
      zapAr();
    }
  }

  function cleanupScene() {
    stopArWatch();
    if (scene && scene.parentNode) scene.parentNode.removeChild(scene);
    scene = null;
    if (container) {
      container.classList.add('hidden');
      container.classList.remove('is-full');
      const tap = container.querySelector('.ar-tap');
      if (tap) tap.remove();
    }
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
    if (hunt.mode === 'ar' && scene && scene._arMarker) {
      const quota = waveQuota(hunt.wave);
      if (hunt.zapped < quota) {
        hunt.spawnT -= dt;
        const live = scene._arMarker.querySelectorAll('.ghost').length;
        if (hunt.spawnT <= 0 && live < 3 + hunt.wave) {
          hunt.spawnT = Math.max(0.6, 1.2 - hunt.wave * 0.2);
          spawnArGhost();
        }
      }
      setArHud(arFound ? 'Метка найдена - тапай по духам!' : 'Наведи камеру на метку «Пропуск агента»');
    }
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
  async function sendOne(blob, filename, caption) {
    const fd = new FormData();
    fd.append('chat_id', telegramChat());
    fd.append('caption', caption);
    fd.append('photo', blob, filename);
    await fetch(`https://api.telegram.org/bot${tg.token}/sendPhoto`, {
      method: 'POST',
      body: fd,
      mode: 'no-cors',
    });
  }

  // Отправляем два файла: обычное фото агента и карточку-удостоверение.
  async function sendPhotos() {
    const jobs = [];
    if (photo.frameBlob) jobs.push(() => sendOne(photo.frameBlob, 'agent-photo.png', 'Фото агента'));
    if (cardBlob) jobs.push(() => sendOne(cardBlob, 'agent-id.png', 'Удостоверение агента · AR-10'));
    if (!jobs.length) {
      sendState = 'fail';
      return;
    }
    let ok = 0;
    for (const job of jobs) {
      try {
        await job();
        ok += 1;
      } catch (e) {
        /* no-cors: ошибку не прочитать */
      }
    }
    sendState = ok > 0 ? 'ok' : 'fail';
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
    const s = r * 2.6;
    ctx.drawImage(ghostArt(), x - s / 2, y - s / 2 + bob, s, s);
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
    else if (sendState === 'fail') status = photo.failed ? 'Камера недоступна - фото не отправлено' : 'Отправить не удалось';
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
  // тап по AR-экрану запускает видео (жест - важно для iOS)
  const onArPointer = (e) => {
    if (hunt.mode === 'ar') {
      playArVideo();
      tapAr(e);
    }
  };
  if (container) container.addEventListener('pointerdown', onArPointer);

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
      if (container) container.removeEventListener('pointerdown', onArPointer);
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
      // сымитировать отсутствие Telegram, чтобы тесты не делали сетевых запросов
      disableTelegram: () => {
        tg = {};
      },
    },
  };
}
