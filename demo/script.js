const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const appEl = document.getElementById("app");
const panelEl = document.getElementById("panel");
const scoreEl = document.getElementById("score");
const bestEl = document.getElementById("best");
const levelEl = document.getElementById("level");
const speedEl = document.getElementById("speed");
const shieldEl = document.getElementById("shield");
const statusEl = document.getElementById("status");

const GRID_COUNT = 20;
const CELL_SIZE = canvas.width / GRID_COUNT;
const BASE_TICK_MS = 130;
const LEVEL_SCORE = 5;
const FOOD_TYPES = {
  normal: { label: "食物", score: 1, grow: 1, color: "#4ade80", ttl: 48 },
  gold: { label: "金币", score: 5, grow: 0, color: "#facc15", ttl: 22 },
  shield: { label: "护盾", score: 1, grow: 1, color: "#67e8f9", ttl: 30 },
  poison: { label: "毒物", score: -2, grow: -1, color: "#a855f7", ttl: 28 },
  boost: { label: "加速", score: 2, grow: 1, color: "#fb923c", ttl: 26 },
  slow: { label: "缓速", score: 1, grow: 1, color: "#93c5fd", ttl: 26 },
};
const FOOD_BAG = ["normal", "normal", "normal", "gold", "shield", "poison", "boost", "slow"];

let snake = [];
let direction = { x: 0, y: 0 };
let nextDirection = { x: 0, y: 0 };
let foods = [];
let food = null;
let obstacles = [];
let score = 0;
let best = readBestScore();
let level = 1;
let speedLevel = 1;
let shieldCharges = 0;
let paused = false;
let waitingToStart = true;
let gameOver = false;
let timer = null;
let audioCtx = null;
let particles = [];
let trailSegments = [];

bestEl.textContent = String(best);

function getAudioCtx() {
  if (!window.AudioContext && !window.webkitAudioContext) return null;
  if (!audioCtx) {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    audioCtx = new AudioCtx();
  }
  if (audioCtx.state === "suspended") audioCtx.resume();
  return audioCtx;
}

function playTone({ frequency, duration, type = "sine", volume = 0.08, slideTo }) {
  const toneCtx = getAudioCtx();
  if (!toneCtx) return;

  const osc = toneCtx.createOscillator();
  const gain = toneCtx.createGain();
  const now = toneCtx.currentTime;
  const endTime = now + duration;

  osc.type = type;
  osc.frequency.setValueAtTime(frequency, now);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, endTime);

  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(volume, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, endTime);

  osc.connect(gain);
  gain.connect(toneCtx.destination);
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
  playTone({ frequency: 360, slideTo: 450, duration: 0.08, type: "square", volume: 0.05 });
  playTone({ frequency: 540, slideTo: 680, duration: 0.12, type: "triangle", volume: 0.05 });
}

function playTurnSound() {
  playTone({ frequency: 280, slideTo: 320, duration: 0.045, type: "sine", volume: 0.035 });
}

function playHighScoreSound() {
  playTone({ frequency: 980, slideTo: 1240, duration: 0.12, type: "triangle", volume: 0.05 });
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
    // Storage can be unavailable in private or embedded contexts.
  }
}

function randomCell() {
  return Math.floor(Math.random() * GRID_COUNT);
}

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

function cellCenter(cell) {
  return cell * CELL_SIZE + CELL_SIZE / 2;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function sameCell(a, b) {
  return a && b && a.x === b.x && a.y === b.y;
}

function isOccupied(pos, extra = []) {
  return snake
    .concat(obstacles, foods, extra)
    .some((cell) => sameCell(cell, pos));
}

function findSafeCell(extra = []) {
  for (let i = 0; i < 80; i += 1) {
    const pos = { x: randomCell(), y: randomCell() };
    if (!isOccupied(pos, extra)) return pos;
  }

  for (let y = 0; y < GRID_COUNT; y += 1) {
    for (let x = 0; x < GRID_COUNT; x += 1) {
      const pos = { x, y };
      if (!isOccupied(pos, extra)) return pos;
    }
  }

  return { x: 0, y: 0 };
}

function triggerClassEffect(element, className, duration) {
  if (!element || !element.classList) return;
  if (!element.__effectTimeouts) element.__effectTimeouts = {};
  if (element.__effectTimeouts[className]) clearTimeout(element.__effectTimeouts[className]);
  element.classList.remove(className);
  element.classList.add(className);
  element.__effectTimeouts[className] = setTimeout(() => {
    element.classList.remove(className);
    delete element.__effectTimeouts[className];
  }, duration);
}

function spawnBurst(cellX, cellY, options = {}) {
  const count = options.count ?? 14;
  const colors = options.colors ?? ["#67e8f9", "#4ade80", "#fb7185"];
  const speed = options.speed ?? 3.6;
  const life = options.life ?? 0.9;
  const centerX = cellCenter(clamp(cellX, 0, GRID_COUNT - 1));
  const centerY = cellCenter(clamp(cellY, 0, GRID_COUNT - 1));

  for (let i = 0; i < count; i += 1) {
    const angle = (Math.PI * 2 * i) / count + randomBetween(-0.18, 0.18);
    const velocity = randomBetween(speed * 0.45, speed);
    particles.push({
      x: centerX,
      y: centerY,
      vx: Math.cos(angle) * velocity,
      vy: Math.sin(angle) * velocity,
      life,
      maxLife: life,
      size: randomBetween(2, 4.8),
      color: colors[i % colors.length],
    });
  }
}

function leaveTrail(cellX, cellY) {
  trailSegments.unshift({ x: cellX, y: cellY, life: 0.72, maxLife: 0.72 });
  if (trailSegments.length > 14) trailSegments.length = 14;
}

function decayEffects() {
  trailSegments = trailSegments
    .map((segment) => ({ ...segment, life: segment.life - 0.12 }))
    .filter((segment) => segment.life > 0);

  particles = particles
    .map((particle) => ({
      ...particle,
      x: particle.x + particle.vx,
      y: particle.y + particle.vy,
      vx: particle.vx * 0.94,
      vy: particle.vy * 0.94,
      life: particle.life - 0.1,
    }))
    .filter((particle) => particle.life > 0);
}

function updatePanel() {
  scoreEl.textContent = String(score);
  bestEl.textContent = String(best);
  levelEl.textContent = String(level);
  speedEl.textContent = `${speedLevel}x`;
  shieldEl.textContent = shieldCharges > 0 ? `${shieldCharges} 层` : "无";
}

function currentTickMs() {
  return Math.max(62, BASE_TICK_MS - (level - 1) * 8 - (speedLevel - 1) * 9);
}

function restartTimer() {
  if (timer) clearInterval(timer);
  timer = setInterval(step, currentTickMs());
}

function targetFoodCount() {
  return Math.min(4, 1 + Math.floor(level / 2));
}

function chooseFoodType() {
  if (score < 2) return "normal";
  return FOOD_BAG[Math.floor(Math.random() * FOOD_BAG.length)];
}

function placeFood(type = chooseFoodType()) {
  const config = FOOD_TYPES[type] || FOOD_TYPES.normal;
  const pos = findSafeCell();
  const newFood = { ...pos, type, ttl: config.ttl };
  foods.push(newFood);
  food = foods[0] || newFood;
  return newFood;
}

function ensureFoods() {
  while (foods.length < targetFoodCount()) placeFood();
  food = foods[0] || null;
}

function updateFoodTimers() {
  foods = foods
    .map((item) => ({ ...item, ttl: item.ttl - 1 }))
    .filter((item) => item.ttl > 0 || item.type === "normal");
  ensureFoods();
}

function obstacleTarget() {
  return Math.min(24, Math.max(0, (level - 1) * 3));
}

function syncObstacles() {
  while (obstacles.length < obstacleTarget()) {
    const pos = findSafeCell(obstacles);
    if (!obstacles.some((obstacle) => sameCell(obstacle, pos))) obstacles.push(pos);
  }
  if (obstacles.length > obstacleTarget()) obstacles.length = obstacleTarget();
}

function resetGame() {
  snake = [
    { x: 10, y: 10 },
    { x: 9, y: 10 },
    { x: 8, y: 10 },
  ];
  direction = { x: 0, y: 0 };
  nextDirection = { x: 0, y: 0 };
  foods = [];
  food = null;
  obstacles = [];
  score = 0;
  level = 1;
  speedLevel = 1;
  shieldCharges = 0;
  paused = false;
  waitingToStart = true;
  gameOver = false;
  particles = [];
  trailSegments = [];
  statusEl.textContent = "";
  placeFood("normal");
  statusEl.textContent = "按方向键或 WASD 开始";
  updatePanel();
  restartTimer();
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
  ctx.arcTo(px + CELL_SIZE - 1, py + CELL_SIZE - 1, px + CELL_SIZE - r, py + CELL_SIZE - 1, r);
  ctx.lineTo(px + r, py + CELL_SIZE - 1);
  ctx.arcTo(px + 1, py + CELL_SIZE - 1, px + 1, py + CELL_SIZE - r, r);
  ctx.lineTo(px + 1, py + r);
  ctx.arcTo(px + 1, py + 1, px + r, py + 1, r);
  ctx.closePath();
  ctx.fill();
}

function drawGrid() {
  ctx.strokeStyle = "rgba(96, 165, 250, 0.14)";
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

function drawTrails() {
  trailSegments.forEach((segment, index) => {
    const alpha = Math.max(segment.life / segment.maxLife, 0) * (0.34 - index * 0.015);
    drawCell(segment.x, segment.y, `rgba(103, 232, 249, ${Math.max(alpha, 0.06)})`, 6);
  });
}

function drawParticles() {
  particles.forEach((particle) => {
    const alpha = Math.max(particle.life / particle.maxLife, 0);
    ctx.fillStyle = particle.color.startsWith("#")
      ? `${particle.color}${Math.round(alpha * 255).toString(16).padStart(2, "0")}`
      : particle.color;
    ctx.beginPath();
    ctx.arc(particle.x, particle.y, particle.size * alpha, 0, Math.PI * 2);
    ctx.fill();
  });
}

function render() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const background = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  background.addColorStop(0, "#09111f");
  background.addColorStop(1, "#101a31");
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  drawGrid();
  drawTrails();

  obstacles.forEach((obstacle) => drawCell(obstacle.x, obstacle.y, "#64748b", 3));

  foods.forEach((item) => {
    const config = FOOD_TYPES[item.type] || FOOD_TYPES.normal;
    const pulse = 5 + Math.sin(performance.now() / 180 + item.x) * 1.5;
    drawCell(item.x, item.y, config.color, pulse);
  });

  snake.forEach((seg, index) => {
    const color = index === 0 ? "#22c55e" : "#4ade80";
    drawCell(seg.x, seg.y, color, index === 0 ? 6 : 4);
  });

  if (shieldCharges > 0) {
    ctx.strokeStyle = "rgba(103, 232, 249, 0.76)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cellCenter(snake[0].x), cellCenter(snake[0].y), CELL_SIZE * 0.72, 0, Math.PI * 2);
    ctx.stroke();
  }

  drawParticles();
  decayEffects();
}

function hitWall(head) {
  return head.x < 0 || head.x >= GRID_COUNT || head.y < 0 || head.y >= GRID_COUNT;
}

function hitObstacle(head) {
  return obstacles.some((obstacle) => sameCell(obstacle, head));
}

function hitSelf(head, willGrow) {
  const bodyToCheck = willGrow ? snake : snake.slice(0, -1);
  return bodyToCheck.some((seg) => sameCell(seg, head));
}

function blockLethalHit(head) {
  shieldCharges -= 1;
  statusEl.textContent = "护盾抵消了一次撞击";
  triggerClassEffect(appEl, "is-flash", 260);
  spawnBurst(head.x, head.y, {
    count: 18,
    colors: ["#67e8f9", "#93c5fd", "#facc15"],
    speed: 3.4,
    life: 0.8,
  });
  updatePanel();
  render();
}

function finishGame(head) {
  gameOver = true;
  paused = false;
  statusEl.textContent = "游戏结束，按空格键重新开始";
  triggerClassEffect(appEl, "is-flash", 360);
  triggerClassEffect(appEl, "is-shaking", 320);
  spawnBurst(head.x, head.y, {
    count: 20,
    colors: ["#fb7185", "#f97316", "#facc15"],
    speed: 4.6,
    life: 1,
  });
  render();
  playGameOverSound();
}

function applyFoodEffect(eaten) {
  const config = FOOD_TYPES[eaten.type] || FOOD_TYPES.normal;
  score = Math.max(0, score + config.score);
  if (eaten.type === "shield") shieldCharges = Math.min(3, shieldCharges + 1);
  if (eaten.type === "boost") speedLevel = Math.min(8, speedLevel + 1);
  if (eaten.type === "slow") speedLevel = Math.max(1, speedLevel - 1);

  const nextLevel = Math.max(1, Math.floor(score / LEVEL_SCORE) + 1);
  if (nextLevel !== level) {
    level = nextLevel;
    syncObstacles();
    restartTimer();
    statusEl.textContent = `进入第 ${level} 关`;
  } else {
    statusEl.textContent = `吃到${config.label}`;
  }

  triggerClassEffect(scoreEl, "pop", 240);
  spawnBurst(eaten.x, eaten.y, {
    count: eaten.type === "gold" ? 22 : 16,
    colors: [config.color, "#facc15", "#67e8f9"],
    speed: 3.8,
    life: 0.9,
  });
  playEatSound();

  if (score > best) {
    best = score;
    writeBestScore(best);
    triggerClassEffect(panelEl, "flash-best", 520);
    spawnBurst(eaten.x, eaten.y, {
      count: 12,
      colors: ["#facc15", "#fde68a", "#67e8f9"],
      speed: 3.2,
      life: 0.95,
    });
    playHighScoreSound();
  }

  updatePanel();
  return config;
}

function step() {
  if (gameOver || paused || waitingToStart) return;

  direction = nextDirection;
  const head = { x: snake[0].x + direction.x, y: snake[0].y + direction.y };
  const eatenIndex = foods.findIndex((item) => sameCell(item, head));
  const eaten = eatenIndex >= 0 ? foods[eatenIndex] : null;
  const eatenConfig = eaten ? FOOD_TYPES[eaten.type] || FOOD_TYPES.normal : null;
  const willGrow = Boolean(eatenConfig && eatenConfig.grow > 0);

  if (hitWall(head) || hitObstacle(head) || hitSelf(head, willGrow)) {
    if (shieldCharges > 0) {
      blockLethalHit(head);
      return;
    }
    finishGame(head);
    return;
  }

  leaveTrail(snake[0].x, snake[0].y);
  snake.unshift(head);

  if (eaten) {
    foods.splice(eatenIndex, 1);
    const config = applyFoodEffect(eaten);
    if (config.grow <= 0) snake.pop();
    if (config.grow < 0 && snake.length > 2) snake.pop();
  } else {
    snake.pop();
  }

  updateFoodTimers();
  ensureFoods();
  updatePanel();
  render();
}

function setDirection(x, y) {
  if (waitingToStart) {
    nextDirection = { x, y };
    direction = { x, y };
    waitingToStart = false;
    statusEl.textContent = "";
    return true;
  }

  if (direction.x + x === 0 && direction.y + y === 0) return false;
  if (nextDirection.x === x && nextDirection.y === y) return false;

  nextDirection = { x, y };
  spawnBurst(snake[0].x, snake[0].y, {
    count: 6,
    colors: ["#67e8f9", "#60a5fa"],
    speed: 1.9,
    life: 0.42,
  });
  return true;
}

function togglePause() {
  if (gameOver) return false;
  paused = !paused;
  statusEl.textContent = paused ? "已暂停，按 P 或空格继续" : "";
  render();
  return paused;
}

function handleDirectionInput(value) {
  let changed = false;
  if (value === "up") changed = setDirection(0, -1);
  if (value === "down") changed = setDirection(0, 1);
  if (value === "left") changed = setDirection(-1, 0);
  if (value === "right") changed = setDirection(1, 0);
  if (changed) {
    playTurnSound();
    render();
  }
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
    key === "p" ||
    key === " ";

  if (isControlKey) event.preventDefault();

  if (gameOver && key === " ") {
    resetGame();
    render();
    playRestartSound();
    return;
  }

  if (key === " " || key === "p") {
    togglePause();
    return;
  }

  if (key === "arrowup" || key === "w") handleDirectionInput("up");
  if (key === "arrowdown" || key === "s") handleDirectionInput("down");
  if (key === "arrowleft" || key === "a") handleDirectionInput("left");
  if (key === "arrowright" || key === "d") handleDirectionInput("right");
});

document.querySelectorAll("[data-dir]").forEach((button) => {
  button.addEventListener("click", () => handleDirectionInput(button.dataset.dir));
});

resetGame();
render();
