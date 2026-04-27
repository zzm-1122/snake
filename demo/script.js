const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const scoreEl = document.getElementById("score");
const bestEl = document.getElementById("best");
const statusEl = document.getElementById("status");

const GRID_COUNT = 20;
const CELL_SIZE = canvas.width / GRID_COUNT;
const TICK_MS = 120;

let snake = [];
let direction = { x: 1, y: 0 };
let nextDirection = { x: 1, y: 0 };
let food = { x: 0, y: 0 };
let score = 0;
let best = readBestScore();
let gameOver = false;
let timer = null;
let audioCtx = null;

bestEl.textContent = String(best);

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
  const ctx = getAudioCtx();
  if (!ctx) return;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const now = ctx.currentTime;
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
  gain.connect(ctx.destination);
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

function readBestScore() {
  try {
    return Number(localStorage.getItem("snake_best") || 0);
  } catch {
    return 0;
  }
}

function writeBestScore(value) {
  try {
    localStorage.setItem("snake_best", String(value));
  } catch {
    // Ignore storage failures so the game still runs in restricted environments.
  }
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
  gameOver = false;
  statusEl.textContent = "";
  scoreEl.textContent = "0";
  placeFood();
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

function render() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#12172b";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  drawCell(food.x, food.y, "#fb7185", 6);

  snake.forEach((seg, index) => {
    const color = index === 0 ? "#22c55e" : "#4ade80";
    drawCell(seg.x, seg.y, color, 4);
  });
}

function hitWall(head) {
  return (
    head.x < 0 ||
    head.x >= GRID_COUNT ||
    head.y < 0 ||
    head.y >= GRID_COUNT
  );
}

function hitSelf(head, willGrow) {
  const bodyToCheck = willGrow ? snake : snake.slice(0, -1);
  return bodyToCheck.some((seg) => seg.x === head.x && seg.y === head.y);
}

function step() {
  if (gameOver) return;

  direction = nextDirection;
  const head = {
    x: snake[0].x + direction.x,
    y: snake[0].y + direction.y,
  };
  const willGrow = head.x === food.x && head.y === food.y;

  if (hitWall(head) || hitSelf(head, willGrow)) {
    gameOver = true;
    statusEl.textContent = "游戏结束，按空格键重新开始";
    playGameOverSound();
    return;
  }

  snake.unshift(head);

  if (head.x === food.x && head.y === food.y) {
    score += 1;
    scoreEl.textContent = String(score);
    playEatSound();
    if (score > best) {
      best = score;
      writeBestScore(best);
      bestEl.textContent = String(best);
    }
    placeFood();
  } else {
    snake.pop();
  }

  render();
}

function setDirection(x, y) {
  if (direction.x + x === 0 && direction.y + y === 0) {
    return;
  }
  nextDirection = { x, y };
}

document.addEventListener("keydown", (event) => {
  const key = event.key.toLowerCase();
  const isControlKey =
    key === "arrowup" ||
    key === "arrowdown" ||
    key === "arrowleft" ||
    key === "arrowright" ||
    key === "w" ||
    key === "a" ||
    key === "s" ||
    key === "d" ||
    key === " ";

  if (isControlKey) {
    event.preventDefault();
  }

  if (gameOver && key === " ") {
    resetGame();
    render();
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
timer = setInterval(step, TICK_MS);
