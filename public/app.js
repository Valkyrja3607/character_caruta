const startButton = document.getElementById('start-button');
const progress = document.getElementById('progress');
const score = document.getElementById('score');
const timer = document.getElementById('timer');
const bestTime = document.getElementById('best-time');
const lastTime = document.getElementById('last-time');
const quizImage = document.getElementById('quiz-image');
const nextButton = document.getElementById('next-button');
const result = document.getElementById('result');
const historyList = document.getElementById('history-list');

const BEST_TIME_KEY = 'chara_quiz_best_time_ms';
const LAST_TIME_KEY = 'chara_quiz_last_time_ms';

let entries = [];
let index = -1;
let roundStartMs = null;
let timerId = null;
let elapsedMs = 0;
let questionStartMs = null;
let history = [];
let preloadedImageRefs = [];
let bestMs = Number.parseInt(localStorage.getItem(BEST_TIME_KEY) || '', 10);
let lastMs = Number.parseInt(localStorage.getItem(LAST_TIME_KEY) || '', 10);

if (!Number.isFinite(bestMs)) bestMs = null;
if (!Number.isFinite(lastMs)) lastMs = null;

function showStartButton() {
  startButton.hidden = false;
  nextButton.hidden = true;
}

function showNextButton() {
  startButton.hidden = true;
  nextButton.hidden = false;
}

function formatMs(ms) {
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const millis = ms % 1000;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
}

function renderTimer() {
  timer.textContent = `タイム: ${formatMs(elapsedMs)}`;
  bestTime.textContent = `ベスト: ${bestMs === null ? '--:--.---' : formatMs(bestMs)}`;
  lastTime.textContent = `前回: ${lastMs === null ? '--:--.---' : formatMs(lastMs)}`;
}

function renderHistory() {
  historyList.innerHTML = '';
  for (const item of history) {
    const li = document.createElement('li');
    li.className = 'history-item';

    const img = document.createElement('img');
    img.className = 'history-thumb';
    img.src = item.imagePath;
    img.alt = item.name;

    const meta = document.createElement('div');
    meta.className = 'history-meta';
    meta.innerHTML = `<p class="history-name">${item.name}</p><p class="history-time">${formatMs(item.elapsedMs)}</p>`;

    li.append(img, meta);
    historyList.appendChild(li);
  }
}

function resetHistory() {
  history = [];
  renderHistory();
}

function recordCurrentQuestion() {
  if (index < 0 || index >= entries.length || questionStartMs === null) {
    return;
  }
  const current = entries[index];
  history.unshift({
    name: current.name,
    imagePath: current.imagePath,
    elapsedMs: Date.now() - questionStartMs
  });
  renderHistory();
}

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

async function preloadRoundImages(rawEntries) {
  const urls = [...new Set(rawEntries.flatMap((entry) => entry.imagePaths || []))];
  const loadedSet = new Set();
  preloadedImageRefs = [];

  if (urls.length === 0) {
    return [];
  }

  let done = 0;
  const updatePreloadText = () => {
    result.textContent = `画像を先読み中... ${done} / ${urls.length}`;
  };
  updatePreloadText();

  await Promise.all(urls.map((url) => new Promise((resolve) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      loadedSet.add(url);
      preloadedImageRefs.push(img);
      done += 1;
      updatePreloadText();
      resolve();
    };
    img.onerror = () => {
      done += 1;
      updatePreloadText();
      resolve();
    };
    img.src = url;
  })));

  return rawEntries
    .map((entry) => {
      const availablePaths = (entry.imagePaths || []).filter((path) => loadedSet.has(path));
      if (availablePaths.length === 0) {
        return null;
      }
      return {
        name: entry.name,
        imagePath: pickRandom(availablePaths)
      };
    })
    .filter(Boolean);
}

function startTimer() {
  roundStartMs = Date.now();
  elapsedMs = 0;
  renderTimer();
  if (timerId) {
    clearInterval(timerId);
  }
  timerId = setInterval(() => {
    elapsedMs = Date.now() - roundStartMs;
    renderTimer();
  }, 50);
}

function stopTimer() {
  if (roundStartMs === null) {
    return;
  }
  elapsedMs = Date.now() - roundStartMs;
  roundStartMs = null;
  if (timerId) {
    clearInterval(timerId);
    timerId = null;
  }
  lastMs = elapsedMs;
  localStorage.setItem(LAST_TIME_KEY, String(lastMs));
  if (bestMs === null || elapsedMs < bestMs) {
    bestMs = elapsedMs;
    localStorage.setItem(BEST_TIME_KEY, String(bestMs));
  }
  renderTimer();
}

function updateHeader() {
  if (entries.length === 0) {
    progress.textContent = 'ラウンドを開始してください。';
    score.textContent = '進行: 0 / 0';
    return;
  }

  if (index >= entries.length) {
    progress.textContent = `ラウンド終了: ${entries.length}人を出題しました。`;
    score.textContent = `進行: ${entries.length} / ${entries.length}`;
    return;
  }

  progress.textContent = `第 ${index + 1} 問 / ${entries.length}`;
  score.textContent = `進行: ${index + 1} / ${entries.length}`;
}

function showCurrentQuestion() {
  updateHeader();

  if (index < 0 || index >= entries.length) {
    quizImage.removeAttribute('src');
    result.textContent = '';
    nextButton.disabled = true;
    showStartButton();
    return;
  }

  const current = entries[index];
  quizImage.src = current.imagePath;
  quizImage.alt = `問題 ${index + 1}`;
  result.textContent = '次へで進みます。';
  nextButton.disabled = false;
  questionStartMs = Date.now();
  showNextButton();
}

async function startRound() {
  startButton.disabled = true;
  result.textContent = 'ラウンドを準備中...';

  try {
    const response = await fetch('/api/round');
    if (!response.ok) {
      throw new Error('round fetch failed');
    }

    const data = await response.json();
    entries = await preloadRoundImages(data.entries || []);
    index = 0;
    resetHistory();

    if (entries.length === 0) {
      index = -1;
      result.textContent = '出題可能な画像が見つかりませんでした。';
      if (timerId) {
        clearInterval(timerId);
        timerId = null;
      }
      roundStartMs = null;
      elapsedMs = 0;
      questionStartMs = null;
      renderTimer();
      showCurrentQuestion();
      return;
    }

    startTimer();
    showCurrentQuestion();
  } catch (err) {
    if (timerId) {
      clearInterval(timerId);
      timerId = null;
    }
    roundStartMs = null;
    elapsedMs = 0;
    questionStartMs = null;
    renderTimer();
    entries = [];
    index = -1;
    result.textContent = 'ラウンドの開始に失敗しました。';
    showStartButton();
    showCurrentQuestion();
  } finally {
    startButton.disabled = false;
  }
}

quizImage.addEventListener('error', () => {
  if (index < 0 || index >= entries.length) {
    return;
  }
  result.textContent = 'この問題の画像を読み込めませんでした。次へ進んでください。';
  nextButton.disabled = false;
});

nextButton.addEventListener('click', () => {
  recordCurrentQuestion();
  questionStartMs = null;
  index += 1;
  if (index >= entries.length) {
    stopTimer();
    updateHeader();
    quizImage.removeAttribute('src');
    result.textContent = `ラウンド終了。記録: ${formatMs(elapsedMs)}`;
    nextButton.disabled = true;
    showStartButton();
    return;
  }

  showCurrentQuestion();
});

startButton.addEventListener('click', startRound);
showCurrentQuestion();
renderTimer();
