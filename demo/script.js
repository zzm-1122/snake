const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const appEl = document.querySelector(".app");
const scoreEl = document.getElementById("score");
const bestEl = document.getElementById("best");
const comboEl = document.getElementById("combo");
const statusEl = document.getElementById("status");
const historyListEl = document.getElementById("score-history");

const GRID_COUNT = 20;
const CELL_SIZE = canvas.width / GRID_COUNT;
const TICK_MS = 120;
const COMBO_WINDOW_MS = 1600;
const SCORE_HISTORY_KEY = "snake_score_history";
const MAX_SCORE_HISTORY = 10;

let snake = [];
let direction = { x: 1, y: 0 };
let nextDirection = { x: 1, y: 0 };
let food = { x: 0, y: 0 };
let score = 0;
let best = Number(localStorage.getItem("snake_best") || 0);
let combo = 0;
let lastEatAt = 0;
let gameOver = false;
let timer = null;
let audioCtx = null;
let particles = [];
let screenFlashUntil = 0;
let shakeUntil = 0;
let comboHintUntil = 0;
let frameTime = performance.now();

bestEl.textContent = String(best);
comboEl.textContent = "0";

function getScoreHistory() {
  try {
    const parsed = JSON.parse(localStorage.getItem(SCORE_HISTORY_KEY) || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item) => typeof item?.score === "number" && typeof item?.time === "number")
      .slice(0, MAX_SCORE_HISTORY);
  } catch {
    return [];
  }
}

function saveScoreHistory(entries) {
  localStorage.setItem(SCORE_HISTORY_KEY, JSON.stringify(entries.slice(0, MAX_SCORE_HISTORY)));
}

function formatHistoryTime(ts) {
  return new Date(ts).toLocaleString("zh-CN", {
    hour12: false,
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function renderScoreHistory() {
  const history = getScoreHistory();
  if (history.length === 0) {
    historyListEl.innerHTML = '<li class="history-item"><span>暂无记录</span><span class="history-score">--</span></li>';
    return;
  }

  historyListEl.innerHTML = history
    .map(
      (item) =>
        `<li class="history-item"><span>${formatHistoryTime(item.time)}</span><span class="history-score">${item.score}</span></li>`
    )
    .join("");
}

function recordScore(scoreValue) {
  if (scoreValue <= 0) return;
  const history = getScoreHistory();
  history.unshift({ score: scoreValue, time: Date.now() });
  saveScoreHistory(history);
  renderScoreHistory();
}

function triggerClassAnimation(name) {
  appEl.classList.remove(name);
  void appEl.offsetWidth;
  appEl.classList.add(name);
}

function randomCell() {
  return Math.floor(Math.random() * GRID_COUNT);
}

function placeFood() {
  let pos;
  do {
    pos = { x: randomCell(), y: randomCell() };
  } while (snake.some((seg) => seg.x === pos.x && seg.y === pos.y));
  food = pos;
}

function resetGame() {
  snake = [
    { x: 10, y: 10 },
    { x: 9, y: 10 },
    { x: 8, y: 10 },
  ];
  direction = { x: 1, y: 0 };
  nextDirection = { x: 1, y: 0 };
  score = 0;
  combo = 0;
  lastEatAt = 0;
  gameOver = false;
  particles = [];
  screenFlashUntil = 0;
  shakeUntil = 0;
  comboHintUntil = 0;
  statusEl.textContent = "";
  scoreEl.textContent = "0";
  comboEl.textContent = "0";
  placeFood();
}

function getAudioCtx() {
  if (!window.AudioContext && !window.webkitAudioContext) {
    return null;
  }
  if (!audioCtx) {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    audioCtx = new AudioCtx();
  }
  if (audioCtx.state === "suspended") {
    audioCtx.resume();
  }
  return audioCtx;
}

function playTone({ frequency, duration, type = "sine", volume = 0.08, slideTo }) {
  const actx = getAudioCtx();
  if (!actx) return;

  const osc = actx.createOscillator();
  const gain = actx.createGain();
  const now = actx.currentTime;
  const endTime = now + duration;

  osc.type = type;
  osc.frequency.setValueAtTime(frequency, now);
  if (slideTo) {
    osc.frequency.exponentialRampToValueAtTime(slideTo, endTime);
  }

  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(volume, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, endTime);

  osc.connect(gain);
  gain.connect(actx.destination);
  osc.start(now);
  osc.stop(endTime);
}

function playEatSound() {
  playTone({ frequency: 700, slideTo: 960, duration: 0.09, type: "triangle", volume: 0.07 });
}

function playGameOverSound() {
  playTone({ frequency: 260, slideTo: 100, duration: 0.28, type: "sawtooth", volume: 0.09 });
}

function playRestartSound() {
  playTone({ frequency: 360, slideTo: 540, duration: 0.12, type: "square", volume: 0.06 });
}

function playComboSound(multiplier) {
  const base = Math.min(460 + multiplier * 55, 1100);
  playTone({ frequency: base, slideTo: base * 1.15, duration: 0.08, type: "triangle", volume: 0.05 });
}

function createEatParticles(cellX, cellY) {
  const centerX = (cellX + 0.5) * CELL_SIZE;
  const centerY = (cellY + 0.5) * CELL_SIZE;

  for (let i = 0; i < 15; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 60 + Math.random() * 140;
    particles.push({
      x: centerX,
      y: centerY,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 0.38 + Math.random() * 0.2,
      maxLife: 0.38 + Math.random() * 0.2,
      size: 2 + Math.random() * 3,
      color: Math.random() > 0.2 ? "#fb7185" : "#fcd34d",
    });
  }
}

function updateParticles(dt) {
  particles.forEach((p) => {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += 120 * dt;
    p.life -= dt;
  });
  particles = particles.filter((p) => p.life > 0);
}

function drawCell(x, y, color, radius = 0) {
  const px = x * CELL_SIZE;
  const py = y * CELL_SIZE;
  ctx.fillStyle = color;

  if (!radius) {
    ctx.fillRect(px + 1, py + 1, CELL_SIZE - 2, CELL_SIZE - 2);
    return;
  }

  const r = Math.min(radius, CELL_SIZE / 2 - 1);
  ctx.beginPath();
  ctx.moveTo(px + r, py + 1);
  ctx.lineTo(px + CELL_SIZE - r, py + 1);
  ctx.arcTo(px + CELL_SIZE - 1, py + 1, px + CELL_SIZE - 1, py + r, r);
  ctx.lineTo(px + CELL_SIZE - 1, py + CELL_SIZE - r);
  ctx.arcTo(
    px + CELL_SIZE - 1,
    py + CELL_SIZE - 1,
    px + CELL_SIZE - r,
    py + CELL_SIZE - 1,
    r
  );
  ctx.lineTo(px + r, py + CELL_SIZE - 1);
  ctx.arcTo(px + 1, py + CELL_SIZE - 1, px + 1, py + CELL_SIZE - r, r);
  ctx.lineTo(px + 1, py + r);
  ctx.arcTo(px + 1, py + 1, px + r, py + 1, r);
  ctx.closePath();
  ctx.fill();
}

function drawGrid() {
  ctx.strokeStyle = "#2b3150";
  ctx.lineWidth = 1;

  for (let i = 1; i < GRID_COUNT; i += 1) {
    const p = i * CELL_SIZE;
    ctx.beginPath();
    ctx.moveTo(p, 0);
    ctx.lineTo(p, canvas.height);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(0, p);
    ctx.lineTo(canvas.width, p);
    ctx.stroke();
  }
}

function drawParticles() {
  particles.forEach((p) => {
    const alpha = Math.max(0, p.life / p.maxLife);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.globalAlpha = 1;
}

function render(now = performance.now()) {
  const shaking = now < shakeUntil;
  const shakeX = shaking ? (Math.random() - 0.5) * 8 : 0;
  const shakeY = shaking ? (Math.random() - 0.5) * 8 : 0;

  ctx.save();
  ctx.translate(shakeX, shakeY);

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#12172b";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  drawCell(food.x, food.y, "#fb7185", 6);

  snake.forEach((seg, index) => {
    const color = index === 0 ? "#22c55e" : "#4ade80";
    drawCell(seg.x, seg.y, color, 4);
  });

  drawParticles();

  if (now < screenFlashUntil) {
    ctx.fillStyle = "rgb(251 113 133 / 20%)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  ctx.restore();
}

function hitWall(head) {
  return (
    head.x < 0 ||
    head.x >= GRID_COUNT ||
    head.y < 0 ||
    head.y >= GRID_COUNT
  );
}

function hitSelf(head) {
  return snake.some((seg) => seg.x === head.x && seg.y === head.y);
}

function step() {
  if (gameOver) return;

  direction = nextDirection;
  const head = {
    x: snake[0].x + direction.x,
    y: snake[0].y + direction.y,
  };

  if (hitWall(head) || hitSelf(head)) {
    gameOver = true;
    recordScore(score);
    statusEl.textContent = "游戏结束，按空格键重新开始";
    screenFlashUntil = performance.now() + 260;
    shakeUntil = performance.now() + 320;
    triggerClassAnimation("game-over-hit");
    playGameOverSound();
    return;
  }

  snake.unshift(head);

  if (head.x === food.x && head.y === food.y) {
    const now = performance.now();
    score += 1;
    scoreEl.textContent = String(score);
    createEatParticles(head.x, head.y);
    playEatSound();

    if (now - lastEatAt <= COMBO_WINDOW_MS) {
      combo += 1;
      playComboSound(combo);
    } else {
      combo = 1;
    }

    lastEatAt = now;
    comboEl.textContent = String(combo);

    if (combo >= 3) {
      statusEl.textContent = `连击 x${combo}`;
      comboHintUntil = now + 900;
      triggerClassAnimation("combo-pop");
    }

    if (score > best) {
      best = score;
      localStorage.setItem("snake_best", String(best));
      bestEl.textContent = String(best);
      statusEl.textContent = "新纪录！";
      triggerClassAnimation("best-glow");
    }

    placeFood();
  } else {
    snake.pop();
    if (combo > 0 && performance.now() - lastEatAt > COMBO_WINDOW_MS) {
      combo = 0;
      comboEl.textContent = "0";
    }
    if (!gameOver && comboHintUntil > 0 && performance.now() > comboHintUntil) {
      statusEl.textContent = "";
      comboHintUntil = 0;
    }
  }
}

function setDirection(x, y) {
  if (direction.x + x === 0 && direction.y + y === 0) {
    return;
  }
  nextDirection = { x, y };
}

function animate(now) {
  const dt = Math.min((now - frameTime) / 1000, 0.033);
  frameTime = now;
  updateParticles(dt);
  render(now);
  requestAnimationFrame(animate);
}

document.addEventListener("keydown", (event) => {
  const key = event.key.toLowerCase();

  if (gameOver && key === " ") {
    resetGame();
    playRestartSound();
    return;
  }

  if (key === "arrowup" || key === "w") setDirection(0, -1);
  if (key === "arrowdown" || key === "s") setDirection(0, 1);
  if (key === "arrowleft" || key === "a") setDirection(-1, 0);
  if (key === "arrowright" || key === "d") setDirection(1, 0);
});

resetGame();
render();
renderScoreHistory();
timer = setInterval(step, TICK_MS);
requestAnimationFrame(animate);
