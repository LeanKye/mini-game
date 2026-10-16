const LANES = 4;
const BPM = 120;
const BEAT = 60 / BPM;
const EIGHTH = BEAT / 2;
const BAR = BEAT * 4;
const BARS = 28;
const TRAVEL = 1.5;
const LEAD_IN = 0.9;
const WINDOW_GOOD = 0.15;
const WINDOW_PERFECT = 0.065;

const LANE_COLORS = ['#ff7ab8', '#b79bf0', '#6fe3ff', '#ffd36b'];
const LANE_KEYS = [['d', 'ArrowLeft'], ['f', 'ArrowDown'], ['j', 'ArrowUp'], ['k', 'ArrowRight']];

const CHORD_NOTES = [
  [440.0, 523.25, 659.25, 880.0],
  [349.23, 440.0, 523.25, 698.46],
  [523.25, 659.25, 783.99, 1046.5],
  [392.0, 493.88, 587.33, 783.99],
];
const PAD_NOTES = [
  [220.0, 261.63, 329.63],
  [174.61, 220.0, 261.63],
  [261.63, 329.63, 392.0],
  [196.0, 246.94, 293.66],
];
const BASS_ROOT = [110.0, 87.31, 130.81, 98.0];

const PATTERN_A = [0, 2, 4, 6];
const PATTERN_B = [[0, 2, 4, 6], [0, 2, 3, 4, 6], [0, 1, 2, 4, 6], [0, 2, 4, 5, 6]];
const PATTERN_C = [[0, 1, 2, 3, 4, 6], [0, 2, 3, 4, 5, 6], [0, 1, 2, 4, 5, 6], [0, 2, 3, 4, 6, 7]];
const PATTERN_D = [[0, 4], [0, 4, 6]];
const PATTERN_E = [[0, 1, 2, 4, 5, 6], [0, 2, 3, 4, 6, 7], [0, 1, 2, 3, 4, 6], [0, 2, 4, 5, 6, 7]];

function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function patternFor(bar) {
  if (bar < 2) return [];
  if (bar <= 5) return PATTERN_A;
  if (bar <= 9) return PATTERN_B[(bar - 6) % 4];
  if (bar <= 13) return PATTERN_C[(bar - 10) % 4];
  if (bar <= 15) return PATTERN_D[(bar - 14) % 2];
  if (bar <= 25) return PATTERN_E[(bar - 16) % 4];
  return PATTERN_A;
}

export function buildChart() {
  const rnd = seeded(20251016);
  const notes = [];
  let lane = 1;
  let lastStep = -99;
  for (let bar = 2; bar < BARS; bar++) {
    const chord = bar % 4;
    for (const e of patternFor(bar)) {
      const step = bar * 8 + e;
      const gap = step - lastStep;
      let d;
      const r = rnd();
      if (gap <= 1) d = r < 0.5 ? 1 : -1;
      else if (r < 0.14) d = 0;
      else if (r < 0.5) d = rnd() < 0.5 ? 1 : -1;
      else if (r < 0.85) d = rnd() < 0.5 ? 2 : -2;
      else d = rnd() < 0.5 ? 3 : -3;
      let next = lane + d;
      if (next < 0) next = -next;
      if (next > LANES - 1) next = 2 * (LANES - 1) - next;
      lane = Math.max(0, Math.min(LANES - 1, next));
      const time = step * EIGHTH;
      notes.push({ time, lane, chord, freq: CHORD_NOTES[chord][lane], judged: false });
      if (bar >= 22 && bar <= 25 && (e === 0 || e === 4) && rnd() < 0.3) {
        const other = (lane + 2) % LANES;
        notes.push({ time, lane: other, chord, freq: CHORD_NOTES[chord][other], judged: false });
      }
      lastStep = step;
    }
  }
  notes.sort((a, b) => a.time - b.time || a.lane - b.lane);
  return notes;
}

export function createRhythm(canvas, { onHint, onWin } = {}) {
  const ctx = canvas.getContext('2d');
  const chart = buildChart();
  const lastNoteTime = chart[chart.length - 1].time;
  const endTime = lastNoteTime + 1.6;

  let notes = [];
  let running = false;
  let finished = false;
  let raf = null;
  let t0 = 0;
  let runId = 0;
  let pausedTotal = 0;
  let pausedAt = 0;
  let autoplay = false;
  let state = 'ready';
  let stateUntil = 0;
  let fails = 0;

  let score = 0;
  let combo = 0;
  let maxCombo = 0;
  let health = 100;
  let hits = 0;
  let perfects = 0;
  let misses = 0;

  let effects = [];
  let floaters = [];
  const pressed = [0, 0, 0, 0];
  let missFlash = 0;
  let comboPop = 0;
  let shake = 0;

  let W = 360;
  let H = 520;
  let dpr = 1;
  let L = null;

  const stars = [];
  {
    const rnd = seeded(777);
    for (let i = 0; i < 70; i++) {
      stars.push({ x: rnd(), y: rnd(), r: 0.6 + rnd() * 1.6, ph: rnd() * 6.28, sp: 0.6 + rnd() * 1.8 });
    }
  }

  let ac = null;
  let master = null;
  let noiseBuf = null;

  function perf() {
    return performance.now() / 1000;
  }
  function clock() {
    return perf() - pausedTotal;
  }
  let userOffset = 0;
  try {
    userOffset = Number(localStorage.getItem('rhythmOffset')) || 0;
  } catch {}

  function autoLatency() {
    if (!ac) return 0;
    const out = typeof ac.outputLatency === 'number' && ac.outputLatency > 0 ? ac.outputLatency : 0.09;
    return out + (ac.baseLatency || 0);
  }

  function latency() {
    return autoLatency() + userOffset;
  }

  function saveOffset() {
    try {
      localStorage.setItem('rhythmOffset', String(userOffset));
    } catch {}
  }

  const CALIB_CLICKS = 10;
  const CALIB_PERIOD = 0.75;
  let calib = null;
  let calibPulse = 0;
  let calibNote = '';

  function songTime() {
    return clock() - t0 - latency();
  }

  function ensureAudio() {
    if (ac) return;
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return;
    try {
      ac = new Ctor();
      noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
      const data = noiseBuf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    } catch {
      ac = null;
    }
  }

  function env(gainNode, when, peak, attack, decay) {
    gainNode.gain.setValueAtTime(0.0001, when);
    gainNode.gain.exponentialRampToValueAtTime(peak, when + attack);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, when + attack + decay);
  }

  function tone(dest, type, freq, when, attack, decay, peak, cutoff) {
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, when);
    let tail = g;
    if (cutoff) {
      const f = ac.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = cutoff;
      o.connect(f);
      f.connect(g);
    } else {
      o.connect(g);
    }
    g.connect(dest);
    env(g, when, peak, attack, decay);
    o.start(when);
    o.stop(when + attack + decay + 0.05);
    return tail;
  }

  function startCalibration() {
    const base = clock() + 0.8;
    calib = { t0: base, taps: [], done: false, endAt: base + CALIB_CLICKS * CALIB_PERIOD + 0.4, skipRect: null };
    state = 'calib';
    calibNote = '';
    if (!ac) return;
    try {
      const when = ac.currentTime + 0.8;
      for (let k = 0; k < CALIB_CLICKS; k++) {
        const w = when + k * CALIB_PERIOD;
        tone(ac.destination, 'sine', 1200, w, 0.002, 0.07, 0.5, null);
        tone(ac.destination, 'triangle', 600, w, 0.002, 0.09, 0.3, null);
      }
    } catch {}
  }

  function calibTap() {
    if (!calib || calib.done) return;
    calibPulse = 1;
    const now = clock();
    const k = Math.round((now - calib.t0) / CALIB_PERIOD);
    if (k < 0 || k >= CALIB_CLICKS) return;
    const delta = now - (calib.t0 + k * CALIB_PERIOD);
    if (Math.abs(delta) < CALIB_PERIOD / 2) calib.taps.push(delta);
  }

  function finishCalibration(skipped) {
    if (!calib || calib.done) return;
    calib.done = true;
    if (skipped) {
      calibNote = 'Пропущено';
    } else {
      const taps = calib.taps.slice().sort((a, b) => a - b);
      if (taps.length >= 5) {
        const med = taps[Math.floor(taps.length / 2)];
        const good = taps.filter((d) => Math.abs(d - med) < 0.12);
        const mean = good.reduce((a, b) => a + b, 0) / good.length;
        userOffset = Math.max(-0.3, Math.min(0.6, mean - autoLatency()));
        saveOffset();
        calibNote = 'Готово! Сдвиг подобран: ' + Math.round(userOffset * 1000) + ' мс';
      } else {
        calibNote = 'Не удалось поймать ритм - оставил прежние настройки';
      }
    }
    stateUntil = clock() + (skipped ? 0.05 : 1.5);
    state = 'calibDone';
  }

  function updateCalibration() {
    if (state === 'calib' && calib) {
      if (clock() > calib.endAt) finishCalibration(false);
    } else if (state === 'calibDone' && clock() >= stateUntil) {
      calib = null;
      newRun();
      if (onHint) onHint('Тапай по дорожкам в такт');
    }
  }

  function kick(dest, when) {
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(160, when);
    o.frequency.exponentialRampToValueAtTime(42, when + 0.14);
    o.connect(g);
    g.connect(dest);
    env(g, when, 0.9, 0.004, 0.26);
    o.start(when);
    o.stop(when + 0.32);
  }

  function noiseHit(dest, when, hp, peak, decay, type = 'highpass') {
    const s = ac.createBufferSource();
    s.buffer = noiseBuf;
    const f = ac.createBiquadFilter();
    f.type = type;
    f.frequency.value = hp;
    const g = ac.createGain();
    s.connect(f);
    f.connect(g);
    g.connect(dest);
    env(g, when, peak, 0.002, decay);
    s.start(when, Math.random() * 0.5);
    s.stop(when + decay + 0.05);
  }

  function scheduleSong(dest, start) {
    for (let bar = 0; bar < BARS; bar++) {
      const t = start + bar * BAR;
      const chord = bar % 4;
      const isBreak = bar >= 14 && bar <= 15;
      const loud = bar >= 6 && !isBreak;
      for (const f of PAD_NOTES[chord]) tone(dest, 'triangle', f, t, 0.25, BAR * 0.95, 0.045, 1400);
      for (let b = 0; b < 4; b++) {
        const root = BASS_ROOT[chord] * (b % 2 ? 2 : 1);
        if (!(isBreak && b > 0)) tone(dest, 'sawtooth', root, t + b * BEAT, 0.01, BEAT * 0.8, 0.11, 420);
      }
      if (bar >= 1 && !isBreak) {
        const beats = loud ? [0, 1, 2, 3] : [0, 2];
        for (const b of beats) kick(dest, t + b * BEAT);
      }
      if (bar >= 2 && !isBreak) {
        noiseHit(dest, t + BEAT, 1800, 0.22, 0.14, 'bandpass');
        noiseHit(dest, t + 3 * BEAT, 1800, 0.22, 0.14, 'bandpass');
        for (let e = 0; e < 8; e++) noiseHit(dest, t + e * EIGHTH, 7000, e % 2 ? 0.1 : 0.05, e % 2 ? 0.07 : 0.03);
      }
      if (bar === 1) noiseHit(dest, t, 800, 0.16, BAR * 0.9, 'highpass');
    }
    for (const n of chart) {
      tone(dest, 'triangle', n.freq, start + n.time, 0.006, 0.34, 0.12, 3200);
    }
    const endT = start + BARS * BAR;
    for (const f of [440, 523.25, 659.25, 880]) tone(dest, 'triangle', f, endT, 0.02, 1.4, 0.07, 3000);
    kick(dest, endT);
  }

  function startRunAudio(delay) {
    if (!ac) return;
    stopRunAudio();
    try {
      if (ac.state === 'suspended') ac.resume();
      master = ac.createGain();
      master.gain.value = 0.75;
      const comp = ac.createDynamicsCompressor();
      master.connect(comp);
      comp.connect(ac.destination);
      scheduleSong(master, ac.currentTime + delay);
    } catch {
      master = null;
    }
  }

  function stopRunAudio() {
    if (!ac || !master) return;
    try {
      const m = master;
      m.gain.cancelScheduledValues(ac.currentTime);
      m.gain.setTargetAtTime(0, ac.currentTime, 0.04);
      setTimeout(() => {
        try { m.disconnect(); } catch {}
      }, 500);
    } catch {}
    master = null;
  }

  function ding(freq, perfect) {
    if (!ac || ac.state !== 'running') return;
    try {
      const when = ac.currentTime;
      const dest = ac.destination;
      tone(dest, 'sine', freq * 2, when, 0.004, 0.22, perfect ? 0.2 : 0.12, null);
      if (perfect) tone(dest, 'triangle', freq * 3, when, 0.004, 0.16, 0.07, null);
    } catch {}
  }

  function missSound() {
    if (!ac || ac.state !== 'running') return;
    try {
      tone(ac.destination, 'sawtooth', 110, ac.currentTime, 0.005, 0.12, 0.08, 500);
    } catch {}
  }

  function newRun() {
    notes = chart.map((n) => ({ ...n, judged: false }));
    score = 0;
    combo = 0;
    maxCombo = 0;
    health = 100;
    hits = 0;
    perfects = 0;
    misses = 0;
    effects = [];
    floaters = [];
    t0 = clock() + LEAD_IN;
    state = 'play';
    runId += 1;
    startRunAudio(LEAD_IN);
  }

  function layout() {
    const aw = Math.min(W - 16, W > H ? 560 : 440);
    const ax = (W - aw) / 2;
    const laneW = aw / LANES;
    const topY = Math.max(52, Math.min(70, H * 0.14));
    const hitY = H - Math.max(52, H * 0.14);
    const speed = (hitY - topY + 30) / TRAVEL;
    const nh = Math.max(16, Math.min(32, laneW * 0.42, (hitY - topY) * 0.09));
    L = { aw, ax, laneW, topY, hitY, speed, nh, nw: laneW * 0.8 };
  }

  function setScale() {
    const rect = canvas.getBoundingClientRect();
    W = Math.max(120, rect.width || 360);
    H = Math.max(120, rect.height || 520);
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    layout();
  }

  function onResize() {
    setScale();
    draw();
  }

  function laneFromX(x) {
    const k = Math.floor((x - L.ax) / L.laneW);
    return Math.max(0, Math.min(LANES - 1, k));
  }

  function pop(text, x, y, color) {
    floaters.push({ text, x, y, color, life: 0.7, max: 0.7 });
  }

  function sparks(x, y, color, n, power) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = (0.4 + Math.random()) * power;
      effects.push({ kind: 'spark', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 1, life: 0.5, max: 0.5, color });
    }
  }

  function registerHit(note, dt) {
    note.judged = true;
    note.hit = true;
    const perfect = Math.abs(dt) <= WINDOW_PERFECT;
    hits += 1;
    if (perfect) perfects += 1;
    combo += 1;
    maxCombo = Math.max(maxCombo, combo);
    comboPop = 1;
    score += (perfect ? 100 : 60) + Math.min(combo, 40) * 2;
    health = Math.min(100, health + (perfect ? 1.6 : 1.0));
    const x = L.ax + note.lane * L.laneW + L.laneW / 2;
    effects.push({ kind: 'ring', x, y: L.hitY, r: L.laneW * 0.7, life: 0.35, max: 0.35, color: LANE_COLORS[note.lane] });
    sparks(x, L.hitY, LANE_COLORS[note.lane], perfect ? 12 : 7, 3.2);
    pop(perfect ? 'Идеально' : 'Хорошо', x, L.hitY - 34, perfect ? '#fff3b0' : '#d8e6ff');
    ding(note.freq, perfect);
  }

  function registerMiss(note) {
    note.judged = true;
    note.hit = false;
    misses += 1;
    combo = 0;
    const mul = Math.max(0.6, 1 - 0.15 * fails);
    health -= 16 * mul;
    missFlash = 1;
    const x = L.ax + note.lane * L.laneW + L.laneW / 2;
    pop('Мимо', x, L.hitY - 30, '#ff9aa8');
    missSound();
    if (health <= 0) failRun();
  }

  function failRun() {
    if (state !== 'play') return;
    fails += 1;
    state = 'failed';
    stateUntil = clock() + 1.5;
    stopRunAudio();
    shake = 18;
    pop('Ещё раз!', W / 2, H * 0.45, '#ffd0dc');
    if (onHint) onHint('Не страшно, давай ещё раз');
  }

  function tapLane(lane) {
    if (state === 'calib') {
      calibTap();
      return;
    }
    if (state !== 'play') return;
    pressed[lane] = 0.16;
    const now = songTime();
    let best = null;
    let bestAbs = 9;
    for (const n of notes) {
      if (n.judged || n.lane !== lane) continue;
      const dt = now - n.time;
      if (dt < -WINDOW_GOOD) break;
      if (dt > WINDOW_GOOD) continue;
      if (Math.abs(dt) < bestAbs) {
        best = n;
        bestAbs = Math.abs(dt);
      }
    }
    if (best) registerHit(best, now - best.time);
    else {
      const x = L.ax + lane * L.laneW + L.laneW / 2;
      effects.push({ kind: 'ring', x, y: L.hitY, r: L.laneW * 0.35, life: 0.18, max: 0.18, color: 'rgba(255,255,255,0.6)' });
    }
  }

  function update(dt) {
    const now = songTime();
    for (let i = 0; i < LANES; i++) if (pressed[i] > 0) pressed[i] -= dt;
    if (missFlash > 0) missFlash -= dt * 3;
    if (comboPop > 0) comboPop -= dt * 4;
    if (shake > 0) shake -= dt * 40;

    for (const f of effects) {
      f.life -= dt;
      if (f.kind === 'spark') {
        f.x += f.vx;
        f.y += f.vy;
        f.vy += 0.12;
      }
    }
    effects = effects.filter((f) => f.life > 0);
    for (const f of floaters) {
      f.life -= dt;
      f.y -= dt * 26;
    }
    floaters = floaters.filter((f) => f.life > 0);

    if (calibPulse > 0) calibPulse -= dt * 4;
    if (state === 'calib' || state === 'calibDone') {
      updateCalibration();
      return;
    }
    if (state === 'failed') {
      if (clock() >= stateUntil) newRun();
      return;
    }
    if (state !== 'play') return;

    for (const n of notes) {
      if (n.judged) continue;
      if (autoplay && now >= n.time) {
        registerHit(n, 0);
        continue;
      }
      if (now - n.time > WINDOW_GOOD) {
        registerMiss(n);
        if (state !== 'play') return;
      } else if (n.time - now > WINDOW_GOOD) break;
    }

    if (now > endTime && !finished) win();
  }

  function win() {
    if (finished) return;
    finished = true;
    state = 'done';
    stopRunAudio();
    for (let i = 0; i < 40; i++) sparks(W / 2, H * 0.4, LANE_COLORS[i % 4], 1, 5);
    pop('Готово!', W / 2, H * 0.42, '#fff3b0');
    setTimeout(() => { if (onWin) onWin(); }, 1100);
    setTimeout(() => { running = false; if (raf) cancelAnimationFrame(raf); }, 1200);
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

  function drawBackground(t, pulse) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#190d36');
    g.addColorStop(0.5, '#3d1e6d');
    g.addColorStop(1, '#9a3f8f');
    ctx.fillStyle = g;
    ctx.fillRect(-20, -20, W + 40, H + 40);

    for (const s of stars) {
      const a = 0.35 + 0.65 * Math.abs(Math.sin(t * s.sp + s.ph));
      ctx.globalAlpha = a;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(s.x * W, ((s.y * H) + t * 6 * s.r) % H, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    const sunR = Math.min(W, H) * (0.3 + pulse * 0.02);
    const sx = W / 2;
    const sy = H * 0.4;
    const sg = ctx.createLinearGradient(0, sy - sunR, 0, sy + sunR);
    sg.addColorStop(0, '#ffe39a');
    sg.addColorStop(1, '#ff5fa5');
    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = sg;
    ctx.shadowColor = 'rgba(255, 110, 190, 0.8)';
    ctx.shadowBlur = 40 + pulse * 30;
    ctx.beginPath();
    ctx.arc(sx, sy, sunR, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = 'rgba(25, 13, 54, 0.8)';
    for (let i = 0; i < 6; i++) {
      const yy = sy + sunR * 0.1 + i * sunR * 0.17;
      ctx.fillRect(sx - sunR, yy, sunR * 2, 2 + i * 1.6);
    }
  }

  function drawGrid(t, pulse) {
    const y0 = L.hitY + 26;
    ctx.save();
    ctx.strokeStyle = `rgba(255, 140, 220, ${0.25 + pulse * 0.2})`;
    ctx.lineWidth = 1.2;
    const cx = W / 2;
    for (let i = -8; i <= 8; i++) {
      ctx.beginPath();
      ctx.moveTo(cx + i * 6, y0);
      ctx.lineTo(cx + i * Math.max(34, W * 0.12), H + 4);
      ctx.stroke();
    }
    const rows = 5;
    for (let r = 0; r < rows; r++) {
      const k = (r + ((t * 0.8) % 1)) / rows;
      const y = y0 + (H - y0) * k * k;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawLanes(songT, pulse) {
    const { ax, aw, laneW, topY, hitY } = L;
    ctx.fillStyle = 'rgba(16, 8, 38, 0.4)';
    rr(ax - 6, topY - 18, aw + 12, hitY - topY + 70, 18);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    for (let i = 0; i < LANES; i++) {
      const x = ax + i * laneW;
      if (pressed[i] > 0) {
        const a = Math.min(1, pressed[i] / 0.16);
        const lg = ctx.createLinearGradient(0, hitY - 160, 0, hitY + 20);
        lg.addColorStop(0, 'rgba(255,255,255,0)');
        lg.addColorStop(1, hexAlpha(LANE_COLORS[i], 0.45 * a));
        ctx.fillStyle = lg;
        ctx.fillRect(x, hitY - 160, laneW, 180);
      }
      if (i > 0) {
        ctx.strokeStyle = 'rgba(255,255,255,0.1)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, topY - 12);
        ctx.lineTo(x, hitY + 40);
        ctx.stroke();
      }
    }

    const glow = 0.55 + pulse * 0.45;
    ctx.save();
    ctx.shadowColor = 'rgba(255,255,255,0.9)';
    ctx.shadowBlur = 14 * glow;
    ctx.fillStyle = `rgba(255,255,255,${0.55 + 0.4 * glow})`;
    rr(ax, hitY - 2, aw, 4, 2);
    ctx.fill();
    ctx.restore();

    for (let i = 0; i < LANES; i++) {
      const cx = ax + i * laneW + laneW / 2;
      ctx.strokeStyle = hexAlpha(LANE_COLORS[i], pressed[i] > 0 ? 1 : 0.7);
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(cx, hitY, L.nh * 0.75 * (1 + (pressed[i] > 0 ? 0.12 : pulse * 0.05)), 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = hexAlpha(LANE_COLORS[i], 0.14);
      ctx.fill();
    }
  }

  function hexAlpha(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
  }

  function drawNotes(songT) {
    const { ax, laneW, hitY, topY, speed, nh, nw } = L;
    ctx.save();
    ctx.beginPath();
    ctx.rect(ax - 6, topY - 18, L.aw + 12, hitY - topY + 70);
    ctx.clip();
    for (const n of notes) {
      if (n.judged && n.hit) continue;
      const y = hitY - (n.time - songT) * speed;
      if (y < topY - 40) break;
      if (y > H + 40) continue;
      const cx = ax + n.lane * laneW + laneW / 2;
      const alpha = Math.max(0, Math.min(1, (y - topY + 20) / 50)) * (n.judged ? 0.35 : 1);
      ctx.globalAlpha = alpha;
      const col = LANE_COLORS[n.lane];
      const grad = ctx.createLinearGradient(0, y - nh, 0, y + nh);
      grad.addColorStop(0, '#ffffff');
      grad.addColorStop(0.35, col);
      grad.addColorStop(1, hexAlpha(col, 0.7));
      ctx.save();
      ctx.shadowColor = col;
      ctx.shadowBlur = n.judged ? 0 : 16;
      ctx.fillStyle = grad;
      rr(cx - nw / 2, y - nh / 2, nw, nh, nh / 2);
      ctx.fill();
      ctx.restore();
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      rr(cx - nw / 2 + 6, y - nh / 2 + 3, nw - 12, 4, 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  function drawEffects() {
    for (const f of effects) {
      const k = Math.max(0, f.life / f.max);
      ctx.globalAlpha = k;
      if (f.kind === 'spark') {
        ctx.fillStyle = f.color;
        ctx.beginPath();
        ctx.arc(f.x, f.y, 2.6 * k + 0.6, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.strokeStyle = f.color;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(f.x, f.y, f.r * (1.25 - k * 0.7), 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = "800 17px 'Nunito', sans-serif";
    for (const f of floaters) {
      ctx.globalAlpha = Math.min(1, (f.life / f.max) * 1.6);
      ctx.fillStyle = f.color;
      ctx.shadowColor = 'rgba(0,0,0,0.5)';
      ctx.shadowBlur = 6;
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
  }

  function drawHud(songT) {
    const { ax, aw } = L;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.font = "800 15px 'Nunito', sans-serif";
    ctx.fillStyle = '#ffffff';
    ctx.fillText(`Очки ${score}`, ax, 20);

    const bw = Math.min(110, aw * 0.34);
    const bx = ax + aw - bw;
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    rr(bx, 14, bw, 11, 5.5);
    ctx.fill();
    const hp = Math.max(0, health) / 100;
    ctx.fillStyle = hp > 0.5 ? '#7bf0a8' : hp > 0.25 ? '#ffd36b' : '#ff6b8b';
    rr(bx, 14, bw * hp, 11, 5.5);
    ctx.fill();

    const p = Math.max(0, Math.min(1, songT / endTime));
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    rr(ax, 34, aw, 4, 2);
    ctx.fill();
    ctx.fillStyle = '#ff9fd0';
    rr(ax, 34, aw * p, 4, 2);
    ctx.fill();

    if (combo >= 4) {
      const s = 1 + Math.max(0, comboPop) * 0.18;
      ctx.save();
      ctx.translate(W / 2, L.topY + (L.hitY - L.topY) * 0.34);
      ctx.scale(s, s);
      ctx.textAlign = 'center';
      ctx.font = "900 34px 'Nunito', sans-serif";
      ctx.fillStyle = 'rgba(255,255,255,0.32)';
      ctx.fillText(`${combo}`, 0, 0);
      ctx.font = "800 13px 'Nunito', sans-serif";
      ctx.fillText('КОМБО', 0, 24);
      ctx.restore();
    }

    if (state === 'play' && songT < 0) {
      ctx.textAlign = 'center';
      ctx.font = "800 22px 'Nunito', sans-serif";
      ctx.fillStyle = '#ffffff';
      ctx.fillText('Приготовься', W / 2, L.topY + (L.hitY - L.topY) * 0.5);
    } else if (state === 'play' && songT < 2 * BAR - 0.2) {
      ctx.textAlign = 'center';
      ctx.font = "800 18px 'Nunito', sans-serif";
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.fillText('Тапай по дорожкам в такт', W / 2, L.topY + (L.hitY - L.topY) * 0.5);
    }
  }

  function drawCalibration() {
    const t = perf();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    drawBackground(t, calibPulse > 0 ? calibPulse * 0.8 : 0);
    const cx = W / 2;
    const cy = H * 0.42;
    const r = Math.min(W, H) * 0.14;

    ctx.fillStyle = 'rgba(16, 8, 38, 0.55)';
    rr(cx - Math.min(W - 24, 360) / 2, cy - r - 86, Math.min(W - 24, 360), r * 2 + 250, 22);
    ctx.fill();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    ctx.font = "800 21px 'Nunito', sans-serif";
    ctx.fillText('Настройка звука', cx, cy - r - 52);
    ctx.font = "700 14px 'Nunito', sans-serif";
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillText('Слушай щелчки и тапай по экрану', cx, cy - r - 26);
    ctx.fillText('ровно в момент звука', cx, cy - r - 8);

    const pulse = Math.max(0, calibPulse);
    ctx.save();
    ctx.shadowColor = '#ff7ab8';
    ctx.shadowBlur = 24 + pulse * 22;
    ctx.strokeStyle = pulse > 0 ? '#ffd0ea' : '#ff7ab8';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(cx, cy + 14, r * (1 + pulse * 0.16), 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = hexAlpha('#ff7ab8', 0.2 + pulse * 0.3);
    ctx.beginPath();
    ctx.arc(cx, cy + 14, r * 0.8, 0, Math.PI * 2);
    ctx.fill();

    const n = calib ? calib.taps.length : 0;
    const dotY = cy + r + 50;
    const step = 22;
    for (let i = 0; i < CALIB_CLICKS; i++) {
      ctx.fillStyle = i < n ? '#ffd36b' : 'rgba(255,255,255,0.25)';
      ctx.beginPath();
      ctx.arc(cx + (i - (CALIB_CLICKS - 1) / 2) * step, dotY, 6, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.font = "800 15px 'Nunito', sans-serif";
    ctx.fillStyle = '#ffffff';
    ctx.fillText(calibNote || (state === 'calib' && clock() < (calib ? calib.t0 : 0) ? 'Приготовься...' : 'Тапай в такт щелчкам'), cx, dotY + 30);

    if (state === 'calib' && calib) {
      const bw = 190;
      const bh = 38;
      const bx = cx - bw / 2;
      const by = dotY + 56;
      calib.skipRect = { x: bx, y: by, w: bw, h: bh };
      ctx.fillStyle = 'rgba(255,255,255,0.16)';
      rr(bx, by, bw, bh, 19);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.4)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.font = "800 14px 'Nunito', sans-serif";
      ctx.fillText('Пропустить настройку', cx, by + bh / 2 + 1);
    }
  }

  function draw() {
    if (state === 'calib' || state === 'calibDone') {
      drawCalibration();
      return;
    }
    const songT = songTime();
    const t = perf();
    const beatPhase = songT >= 0 ? (songT / BEAT) % 1 : 0;
    const pulse = songT >= 0 && state === 'play' ? Math.max(0, 1 - beatPhase * 2.2) : 0;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const sx = shake > 0 ? (Math.random() - 0.5) * shake * 0.4 : 0;
    const sy = shake > 0 ? (Math.random() - 0.5) * shake * 0.4 : 0;
    ctx.save();
    ctx.translate(sx, sy);
    drawBackground(t, pulse);
    drawGrid(t, pulse);
    drawLanes(songT, pulse);
    drawNotes(songT);
    drawEffects();
    ctx.restore();

    if (missFlash > 0) {
      ctx.fillStyle = `rgba(255, 70, 110, ${Math.min(0.28, missFlash * 0.28)})`;
      ctx.fillRect(0, 0, W, H);
    }
    const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(10,4,26,0.45)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);
    drawHud(songT);
  }

  let last = 0;
  function loop(ts) {
    if (!running) return;
    raf = requestAnimationFrame(loop);
    if (document.hidden) return;
    const dt = last ? Math.min(0.05, (ts - last) / 1000) : 0.016;
    last = ts;
    update(dt);
    draw();
  }

  function onPointerDown(e) {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    if (state === 'calib' && calib && calib.skipRect) {
      const q = calib.skipRect;
      if (px >= q.x && px <= q.x + q.w && py >= q.y && py <= q.y + q.h) {
        finishCalibration(true);
        return;
      }
    }
    tapLane(laneFromX(px));
  }

  function onKeyDown(e) {
    if (e.repeat) return;
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    for (let i = 0; i < LANES; i++) {
      if (LANE_KEYS[i].includes(key)) {
        tapLane(i);
        e.preventDefault();
        return;
      }
    }
  }

  function onVisibility() {
    if (document.hidden) {
      pausedAt = perf();
      if (ac && ac.state === 'running') ac.suspend().catch(() => {});
    } else if (pausedAt) {
      pausedTotal += perf() - pausedAt;
      pausedAt = 0;
      if (ac && ac.state === 'suspended') ac.resume().catch(() => {});
    }
  }

  canvas.style.aspectRatio = '3 / 4';
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('resize', onResize);
  document.addEventListener('visibilitychange', onVisibility);
  const resizeObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(onResize) : null;
  if (resizeObserver) resizeObserver.observe(canvas);

  setScale();
  notes = chart.map((n) => ({ ...n }));
  t0 = clock() + 99;
  draw();

  return {
    start() {
      if (running) return;
      running = true;
      last = 0;
      ensureAudio();
      if (ac && ac.state === 'suspended') ac.resume().catch(() => {});
      setScale();
      if (ac) startCalibration();
      else newRun();
      raf = requestAnimationFrame(loop);
    },
    destroy() {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      stopRunAudio();
      if (ac) {
        const a = ac;
        ac = null;
        setTimeout(() => { try { a.close(); } catch {} }, 600);
      }
      canvas.style.aspectRatio = '';
      canvas.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', onVisibility);
      if (resizeObserver) resizeObserver.disconnect();
    },
    adjustOffset(delta) {
      userOffset = Math.max(-0.3, Math.min(0.6, Math.round((userOffset + delta) * 1000) / 1000));
      saveOffset();
      return Math.round(userOffset * 1000);
    },
    getOffset: () => Math.round(userOffset * 1000),
    getState() {
      return {
        score,
        combo,
        maxCombo,
        health,
        hits,
        perfects,
        misses,
        total: chart.length,
        songTime: songTime(),
        state,
        fails,
        finished,
      };
    },
    win,
    test: {
      autoplay: (on) => { autoplay = !!on; },
      chart: () => chart,
      laneCenter: (lane) => ({ x: L.ax + lane * L.laneW + L.laneW / 2, y: L.hitY }),
      songTime,
      tap: tapLane,
      skipCalibration: () => { if (state === 'calib') finishCalibration(true); },
      calib: () => (calib ? { t0: calib.t0, period: CALIB_PERIOD, clicks: CALIB_CLICKS, now: clock(), done: calib.done } : null),
      clock,
      offset: () => Math.round(userOffset * 1000),
      autoLatency: () => Math.round(autoLatency() * 1000),
      endTime: () => endTime,
    },
  };
}
