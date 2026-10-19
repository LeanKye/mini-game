// Свиток: текст скрыт под «тушью», палец стирает её, и символы проявляются.
// Когда открыто достаточно поверхности, свиток считается раскрытым и вызывается onDone.

const CSS_MIN = 260;
const CSS_MAX = 560;
const LINE_H = 24;
const PAD = 18;
const DONE_RATIO = 0.8;

function wrapLines(ctx, text, maxW) {
  const out = [];
  for (const para of text.split('\n')) {
    const words = para.split(' ');
    let line = '';
    for (const w of words) {
      const test = line ? `${line} ${w}` : w;
      if (ctx.measureText(test).width > maxW && line) {
        out.push(line);
        line = w;
      } else {
        line = test;
      }
    }
    out.push(line);
    out.push('');
  }
  while (out.length && out[out.length - 1] === '') out.pop();
  return out;
}

export function createScroll(container, text, onDone) {
  const wrap = document.createElement('div');
  wrap.className = 'scroll';
  const canvas = document.createElement('canvas');
  canvas.className = 'scroll__canvas';
  const hint = document.createElement('p');
  hint.className = 'scroll__hint';
  hint.textContent = 'Тяни пальцем влево-вправо, чтобы проявились символы. Листай страницу вверх-вниз обычно';
  wrap.append(canvas, hint);
  container.appendChild(wrap);

  const ctx = canvas.getContext('2d');
  const measure = document.createElement('canvas').getContext('2d');
  const cssW = Math.max(CSS_MIN, Math.min(CSS_MAX, container.clientWidth || 320));
  const font = "600 16px 'Nunito', Georgia, serif";
  measure.font = font;
  const lines = wrapLines(measure, text, cssW - PAD * 2);
  const cssH = Math.max(220, lines.length * LINE_H + PAD * 3);
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.style.width = `${cssW}px`;
  canvas.style.height = `${cssH}px`;
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const fog = document.createElement('canvas');
  fog.width = canvas.width;
  fog.height = canvas.height;
  const fctx = fog.getContext('2d');
  fctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  fctx.fillStyle = '#7a5530';
  fctx.fillRect(0, 0, cssW, cssH);
  let seed = 7;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (let i = 0; i < 260; i++) {
    fctx.fillStyle = rnd() > 0.5 ? 'rgba(60,35,15,0.35)' : 'rgba(170,125,75,0.3)';
    fctx.beginPath();
    fctx.arc(rnd() * cssW, rnd() * cssH, 1 + rnd() * 3, 0, Math.PI * 2);
    fctx.fill();
  }
  fctx.globalCompositeOperation = 'destination-out';

  const sampler = document.createElement('canvas');
  sampler.width = 48;
  sampler.height = 32;
  const sctx = sampler.getContext('2d');

  let done = false;
  let drawing = false;
  let last = null;
  let moves = 0;

  function redraw() {
    ctx.clearRect(0, 0, cssW, cssH);
    const g = ctx.createLinearGradient(0, 0, 0, cssH);
    g.addColorStop(0, '#f6e7bf');
    g.addColorStop(1, '#e7cf98');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, cssW, cssH);
    ctx.strokeStyle = '#8a5a2b';
    ctx.lineWidth = 3;
    ctx.strokeRect(6, 6, cssW - 12, cssH - 12);
    ctx.fillStyle = '#3b2414';
    ctx.font = font;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    lines.forEach((ln, i) => ctx.fillText(ln, PAD, PAD + i * LINE_H));
    ctx.drawImage(fog, 0, 0, cssW, cssH);
  }

  function coverage() {
    sctx.clearRect(0, 0, sampler.width, sampler.height);
    sctx.drawImage(fog, 0, 0, sampler.width, sampler.height);
    const data = sctx.getImageData(0, 0, sampler.width, sampler.height).data;
    let open = 0;
    for (let i = 3; i < data.length; i += 4) if (data[i] < 128) open++;
    return open / (data.length / 4);
  }

  function finish() {
    if (done) return;
    done = true;
    fctx.clearRect(0, 0, cssW, cssH);
    redraw();
    wrap.classList.add('scroll--done');
    hint.textContent = 'Свиток раскрыт';
    if (onDone) onDone();
  }

  function brush(x, y) {
    fctx.lineCap = 'round';
    fctx.lineWidth = 34;
    fctx.beginPath();
    if (last) {
      fctx.moveTo(last.x, last.y);
      fctx.lineTo(x, y);
    } else {
      fctx.moveTo(x, y);
      fctx.lineTo(x + 0.1, y);
    }
    fctx.stroke();
    last = { x, y };
  }

  function local(e) {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function onDown(e) {
    if (done) return;
    e.preventDefault();
    drawing = true;
    last = null;
    const p = local(e);
    brush(p.x, p.y);
    redraw();
  }

  function onMove(e) {
    if (!drawing || done) return;
    const p = local(e);
    brush(p.x, p.y);
    redraw();
    moves += 1;
    if (moves % 12 === 0 && coverage() >= DONE_RATIO) finish();
  }

  function onUp() {
    drawing = false;
    last = null;
    if (!done && coverage() >= DONE_RATIO) finish();
  }

  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);
  canvas.addEventListener('pointerleave', onUp);

  redraw();
  return {
    destroy() {
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      canvas.removeEventListener('pointerleave', onUp);
      wrap.remove();
    },
    isDone: () => done,
    coverage,
  };
}
