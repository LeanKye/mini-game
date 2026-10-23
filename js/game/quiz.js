// Уровень 11: опросник «Как хорошо ты меня знаешь?».
// Вопросы по историям, варианты ответов, процент и разбор ошибок. Всё на канвасе.

const VIEW_H = 520;
const MIN_W = 360;
const MAX_W = 760;

export const QUIZ = {
  title: 'Как хорошо ты меня знаешь?',
  intro: 'Ты прошла все игры и прочитала истории. Проверим, насколько внимательно?',
  questions: [
    {
      q: 'Когда у меня появился интерес к акробатике?',
      options: ['В университете', 'Ещё в первом классе', 'В пятом классе', 'В выпускном классе'],
      answer: 1,
      note: 'В истории №1: интерес появился ещё в первом классе.',
    },
    {
      q: 'Что я зарифмовал для школьного проекта в 9 классе?',
      options: ['Второй закон Ньютона (f = ma)', 'Таблицу Менделеева', 'Теорему Пифагора', 'Закон Ома'],
      answer: 0,
      note: 'В истории №2 для проекта я зарифмовал второй закон Ньютона.',
    },
    {
      q: 'В какую игру меня подсадил старший брат в 4-5 лет?',
      options: ['Minecraft', 'Dota 2', 'CS 1.6', 'Warcraft III'],
      answer: 2,
      note: 'В истории №3: брат подсадил меня на CS 1.6.',
    },
    {
      q: 'В каком году была моя первая победа на турнире?',
      options: ['2016', '2013', '2020', '2019'],
      answer: 3,
      note: 'В истории №3 первая победа была в 2019 году (это и был код).',
    },
    {
      q: 'Что у меня лечили с глазами?',
      options: ['Ячмень', 'Халязион', 'Конъюнктивит', 'Астигматизм'],
      answer: 1,
      note: 'В истории №4 это был халязион, а уколы потом всё усложнили.',
    },
    {
      q: 'В какой город приехала девушка из CS, с которой я познакомился на сервере?',
      options: ['Москва', 'Казань', 'Сыктывкар', 'Киров'],
      answer: 2,
      note: 'В истории про девушку из CS она прилетела в Сыктывкар.',
    },
    {
      q: 'Куда я поступил учиться?',
      options: ['МГУ', 'СГУ', 'СПбГУ', 'ВШЭ'],
      answer: 1,
      note: 'В истории про университет я поступил в СГУ.',
    },
    {
      q: 'Как звали собаку в истории, где мне исполнилось 17?',
      options: ['Бублик', 'Найда', 'Мурка', 'Фрося'],
      answer: 3,
      note: 'В истории про 17 лет и гопников собаку звали Фрося.',
    },
    {
      q: 'Что крикнул незнакомец, когда мы проходили мимо «СССР»?',
      options: ['«Эй, пацаны, сюда»', '«Голубки, метнитесь сюда»', '«Молодые, подойдите»', '«Слышь, стой»'],
      answer: 1,
      note: 'В истории про драку он крикнул «Голубки, метнитесь сюда».',
    },
    {
      q: 'Кто спас нас в драке у «СССР»?',
      options: ['Полиция', 'Прохожий', 'Брат друга с битой', 'Тренер'],
      answer: 2,
      note: 'В той же истории прибежал брат друга с битой, и все разбежались.',
    },
  ],
};

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

function wrap(ctx, text, maxW) {
  const words = String(text).split(' ');
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

export function createQuiz(canvas, { onHint, onWin } = {}) {
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

  const qs = QUIZ.questions;
  const answers = new Array(qs.length).fill(null);
  let idx = 0;
  let phase = 'intro'; // intro | q | result | review | done
  let reviewIdx = 0;
  let optionRects = [];
  let buttonRect = null;

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

  function score() {
    let n = 0;
    qs.forEach((q, i) => {
      if (answers[i] === q.answer) n += 1;
    });
    return n;
  }

  function percent() {
    return qs.length ? Math.round((score() / qs.length) * 100) : 0;
  }

  function wrongList() {
    const out = [];
    qs.forEach((q, i) => {
      if (answers[i] !== q.answer) out.push({ q, chosen: answers[i] });
    });
    return out;
  }

  function finishRun() {
    if (finished) return;
    finished = true;
    setTimeout(() => {
      if (onWin) onWin();
    }, 400);
    setTimeout(() => {
      running = false;
      if (raf) cancelAnimationFrame(raf);
    }, 600);
  }

  function goNext() {
    if (idx + 1 < qs.length) {
      idx += 1;
      if (onHint) onHint(`Вопрос ${idx + 1} из ${qs.length}`);
    } else {
      phase = 'result';
      if (onHint) onHint('Результат опроса');
    }
  }

  function startQuiz() {
    phase = 'q';
    idx = 0;
    answers.fill(null);
    if (onHint) onHint(`Вопрос 1 из ${qs.length}`);
  }

  function openReview() {
    reviewIdx = 0;
    phase = 'review';
  }

  function nextReview() {
    if (reviewIdx + 1 < wrongList().length) reviewIdx += 1;
    else finishRun();
  }

  // ── Отрисовка ───────────────────────────────────────────
  const PAD = 22;

  function renderIntro() {
    const cx = VIEW.w / 2;
    ctx.fillStyle = '#ffffff';
    ctx.font = "800 21px 'Nunito', sans-serif";
    ctx.fillText(QUIZ.title, cx, 84);
    ctx.fillStyle = '#e6dcff';
    ctx.font = "600 16px 'Nunito', sans-serif";
    const lines = wrap(ctx, QUIZ.intro, VIEW.w - 70);
    lines.forEach((l, i) => ctx.fillText(l, cx, 140 + i * 26));
    ctx.fillStyle = '#b9a8e0';
    ctx.font = "600 14px 'Nunito', sans-serif";
    ctx.fillText(`${qs.length} вопросов`, cx, 140 + lines.length * 26 + 24);
    buttonRect = { x: cx - 120, y: VIEW.h - 110, w: 240, h: 52 };
    drawButton(buttonRect, 'Начать', '#ffe066');
  }

  function drawButton(rect, label, color) {
    ctx.fillStyle = 'rgba(20,14,40,0.9)';
    rr(ctx, rect.x, rect.y, rect.w, rect.h, 13);
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    rr(ctx, rect.x, rect.y, rect.w, rect.h, 13);
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.font = "800 16px 'Nunito', sans-serif";
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, rect.x + rect.w / 2, rect.y + rect.h / 2);
  }

  function renderQuestion() {
    const q = qs[idx];
    optionRects = [];
    buttonRect = null;
    ctx.fillStyle = '#ffffff';
    ctx.font = "800 18px 'Nunito', sans-serif";
    ctx.fillText(`Вопрос ${idx + 1} из ${qs.length}`, VIEW.w / 2, 40);

    // полоса прогресса
    const barW = VIEW.w - PAD * 2;
    ctx.fillStyle = 'rgba(255,255,255,0.16)';
    rr(ctx, PAD, 58, barW, 6, 3);
    ctx.fill();
    ctx.fillStyle = '#7dffc4';
    rr(ctx, PAD, 58, Math.max(6, (barW * (idx + 1)) / qs.length), 6, 3);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.font = "800 18px 'Nunito', sans-serif";
    const qLines = wrap(ctx, q.q, VIEW.w - PAD * 2);
    const qTop = 84;
    qLines.forEach((l, i) => ctx.fillText(l, VIEW.w / 2, qTop + i * 24));

    // варианты
    const optW = VIEW.w - PAD * 2;
    let y = qTop + qLines.length * 24 + 18;
    const pad = 18;
    q.options.forEach((opt, i) => {
      ctx.font = "700 15px 'Nunito', sans-serif";
      const oLines = wrap(ctx, opt, optW - pad * 2);
      const h = Math.max(50, oLines.length * 20 + 26);
      const rect = { x: PAD, y, w: optW, h, i };
      optionRects.push(rect);
      const picked = answers[idx] === i;
      ctx.fillStyle = picked ? 'rgba(201,184,255,0.5)' : 'rgba(255,255,255,0.14)';
      rr(ctx, rect.x, rect.y, rect.w, rect.h, 14);
      ctx.fill();
      ctx.strokeStyle = picked ? '#ffe066' : 'rgba(201,184,255,0.6)';
      ctx.lineWidth = 2;
      rr(ctx, rect.x, rect.y, rect.w, rect.h, 14);
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.font = "700 15px 'Nunito', sans-serif";
      ctx.textAlign = 'left';
      const startY = rect.y + rect.h / 2 - ((oLines.length - 1) * 20) / 2;
      oLines.forEach((l, k) => ctx.fillText(l, rect.x + pad, startY + k * 20));
      ctx.textAlign = 'center';
      y += h + 12;
    });
  }

  function renderResult() {
    const cx = VIEW.w / 2;
    const pct = percent();
    const good = score();
    ctx.fillStyle = '#ffffff';
    ctx.font = "800 20px 'Nunito', sans-serif";
    ctx.fillText('Результат', cx, 66);
    ctx.fillStyle = pct >= 70 ? '#7dffc4' : pct >= 40 ? '#ffe066' : '#ff9fc0';
    ctx.font = "800 64px 'Nunito', sans-serif";
    ctx.fillText(`${pct}%`, cx, 148);
    ctx.fillStyle = '#d9cdf5';
    ctx.font = "700 16px 'Nunito', sans-serif";
    ctx.fillText(`Правильных ответов: ${good} из ${qs.length}`, cx, 196);

    const verdict =
      pct === 100
        ? 'Идеально! Ты читала очень внимательно.'
        : pct >= 70
          ? 'Хорошо! Пара моментов всё же проскочила.'
          : pct >= 40
            ? 'Непосредственно, но истории читались вполглаза :)'
            : 'Похоже, истории листались по диагонали, хаха.';
    ctx.fillStyle = '#e6dcff';
    ctx.font = "600 15px 'Nunito', sans-serif";
    wrap(ctx, verdict, VIEW.w - 70).forEach((l, i) => ctx.fillText(l, cx, 236 + i * 22));

    const wrong = wrongList();
    buttonRect = { x: cx - 130, y: VIEW.h - 104, w: 260, h: 50 };
    if (wrong.length) drawButton(buttonRect, 'Разобрать ошибки', '#ffe066');
    else drawButton(buttonRect, 'Готово', '#7dffc4');
  }

  function renderReview() {
    const cx = VIEW.w / 2;
    const wrong = wrongList();
    const w = wrong[reviewIdx];
    ctx.fillStyle = '#ffffff';
    ctx.font = "800 18px 'Nunito', sans-serif";
    ctx.fillText(`Ошибка ${reviewIdx + 1} из ${wrong.length}`, cx, 40);
    buttonRect = null;
    optionRects = [];
    let y = 74;
    ctx.textAlign = 'left';
    ctx.fillStyle = '#ffffff';
    ctx.font = "800 17px 'Nunito', sans-serif";
    wrap(ctx, w.q.q, VIEW.w - PAD * 2).forEach((l) => {
      ctx.fillText(l, PAD, y);
      y += 24;
    });
    y += 6;
    ctx.fillStyle = '#ff9fc0';
    ctx.font = "700 15px 'Nunito', sans-serif";
    const chosenTxt = w.chosen === null ? 'Ты не ответила' : `Твой ответ: ${w.q.options[w.chosen]}`;
    wrap(ctx, chosenTxt, VIEW.w - PAD * 2).forEach((l) => {
      ctx.fillText(l, PAD, y);
      y += 22;
    });
    y += 6;
    ctx.fillStyle = '#7dffc4';
    ctx.font = "800 15px 'Nunito', sans-serif";
    wrap(ctx, `Правильно: ${w.q.options[w.q.answer]}`, VIEW.w - PAD * 2).forEach((l) => {
      ctx.fillText(l, PAD, y);
      y += 22;
    });
    if (w.q.note) {
      y += 8;
      ctx.fillStyle = 'rgba(230,220,255,0.85)';
      ctx.font = "600 14px 'Nunito', sans-serif";
      wrap(ctx, w.q.note, VIEW.w - PAD * 2).forEach((l) => {
        ctx.fillText(l, PAD, y);
        y += 20;
      });
    }
    ctx.textAlign = 'center';
    buttonRect = { x: cx - 110, y: VIEW.h - 100, w: 220, h: 50 };
    drawButton(buttonRect, reviewIdx + 1 < wrong.length ? 'Дальше' : 'Завершить', '#ffe066');
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
    else if (phase === 'q') renderQuestion();
    else if (phase === 'result') renderResult();
    else if (phase === 'review') renderReview();
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
    t += dt;
    render();
  }

  function inside(rect, q) {
    const p = 12;
    return q.x >= rect.x - p && q.x <= rect.x + rect.w + p && q.y >= rect.y - p && q.y <= rect.y + rect.h + p;
  }

  function onPointerDown(e) {
    e.preventDefault();
    const q = toLogical(e.clientX, e.clientY);
    if (phase === 'intro') {
      if (buttonRect && inside(buttonRect, q)) startQuiz();
      return;
    }
    if (phase === 'q') {
      if (answers[idx] !== null) return;
      for (const rect of optionRects) {
        if (inside(rect, q)) {
          answers[idx] = rect.i;
          setTimeout(goNext, 220);
          return;
        }
      }
      return;
    }
    if (phase === 'result') {
      if (buttonRect && inside(buttonRect, q)) {
        if (wrongList().length) openReview();
        else finishRun();
      }
      return;
    }
    if (phase === 'review') {
      if (buttonRect && inside(buttonRect, q)) nextReview();
    }
  }

  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  window.addEventListener('resize', setScale);
  setScale();
  if (onHint) onHint(QUIZ.title);

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
      return { phase, index: idx + 1, total: qs.length, score: score(), percent: percent(), finished };
    },
    test: {
      phase: () => phase,
      total: () => qs.length,
      index: () => idx + 1,
      percent: () => percent(),
      answers: () => answers.slice(),
      start: () => startQuiz(),
      // ответить на текущий вопрос выбранным вариантом (или правильным при answer=null)
      answer: (opt) => {
        if (phase !== 'q') return;
        answers[idx] = opt === null || opt === undefined ? qs[idx].answer : opt;
        goNext();
      },
      // ответить на все вопросы правильно, кроме перечисленных индексов
      answerAll: (wrongIdx = []) => {
        qs.forEach((q, i) => {
          answers[i] = wrongIdx.includes(i) ? (q.answer + 1) % q.options.length : q.answer;
        });
        phase = 'result';
      },
      openReview: () => openReview(),
      finish: () => finishRun(),
    },
  };
}
