const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const scriptPath = path.join(__dirname, "..", "script.js");
const source = fs.readFileSync(scriptPath, "utf8");
const instrumentedSource = `${source}

globalThis.__testHooks = {
  step,
  setDirection,
  resetGame,
  getState: () => ({
    snake,
    direction,
    nextDirection,
    food,
    score,
    best,
    gameOver,
    statusText: statusEl.textContent,
  }),
  setState: (nextState) => {
    if ("snake" in nextState) snake = nextState.snake;
    if ("direction" in nextState) direction = nextState.direction;
    if ("nextDirection" in nextState) nextDirection = nextState.nextDirection;
    if ("food" in nextState) food = nextState.food;
    if ("score" in nextState) score = nextState.score;
    if ("best" in nextState) best = nextState.best;
    if ("gameOver" in nextState) gameOver = nextState.gameOver;
  },
};
`;

function createContext({ storageThrows = false } = {}) {
  const listeners = new Map();
  const elements = new Map();
  const localStore = new Map();

  const canvasContext = {
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    fillRect() {},
    clearRect() {},
    beginPath() {},
    moveTo() {},
    lineTo() {},
    stroke() {},
    arcTo() {},
    closePath() {},
    fill() {},
  };

  const canvas = {
    width: 400,
    height: 400,
    getContext() {
      return canvasContext;
    },
  };

  const scoreEl = { textContent: "0" };
  const bestEl = { textContent: "0" };
  const statusEl = { textContent: "" };

  elements.set("game", canvas);
  elements.set("score", scoreEl);
  elements.set("best", bestEl);
  elements.set("status", statusEl);

  const localStorage = {
    getItem(key) {
      if (storageThrows) throw new Error("storage disabled");
      return localStore.has(key) ? localStore.get(key) : null;
    },
    setItem(key, value) {
      if (storageThrows) throw new Error("storage disabled");
      localStore.set(key, String(value));
    },
  };

  const context = {
    console,
    Math,
    document: {
      getElementById(id) {
        return elements.get(id);
      },
      addEventListener(type, handler) {
        listeners.set(type, handler);
      },
    },
    window: {
      AudioContext: null,
      webkitAudioContext: null,
    },
    localStorage,
    setInterval(fn) {
      context.__intervalFn = fn;
      return 1;
    },
    clearInterval() {},
  };

  vm.createContext(context);
  vm.runInContext(instrumentedSource, context, { filename: "script.js" });

  return {
    context,
    hooks: context.__testHooks,
    elements: { scoreEl, bestEl, statusEl },
    dispatchKey(key) {
      let prevented = false;
      const handler = listeners.get("keydown");
      assert.ok(handler, "keydown handler should be registered");
      handler({
        key,
        preventDefault() {
          prevented = true;
        },
      });
      return prevented;
    },
  };
}

function testMovingIntoVacatedTailIsAllowed() {
  const { hooks } = createContext();
  hooks.setState({
    snake: [
      { x: 2, y: 2 },
      { x: 2, y: 1 },
      { x: 1, y: 1 },
      { x: 1, y: 2 },
    ],
    direction: { x: -1, y: 0 },
    nextDirection: { x: -1, y: 0 },
    food: { x: 5, y: 5 },
    gameOver: false,
  });

  hooks.step();

  const state = hooks.getState();
  assert.equal(state.gameOver, false, "moving into the old tail cell should stay alive");
  assert.deepEqual(
    JSON.parse(JSON.stringify(state.snake)),
    [
      { x: 1, y: 2 },
      { x: 2, y: 2 },
      { x: 2, y: 1 },
      { x: 1, y: 1 },
    ],
    "snake should move forward and drop the previous tail"
  );
}

function testStorageFailuresDoNotCrashStartup() {
  assert.doesNotThrow(() => createContext({ storageThrows: true }));
}

function testControlKeysPreventDefaultScrolling() {
  const game = createContext();

  assert.equal(game.dispatchKey("ArrowUp"), true, "arrow keys should prevent default");
  assert.equal(game.dispatchKey("w"), true, "WASD controls should prevent default");

  game.hooks.setState({ gameOver: true });
  assert.equal(game.dispatchKey(" "), true, "restart key should prevent default");
}

testMovingIntoVacatedTailIsAllowed();
testStorageFailuresDoNotCrashStartup();
testControlKeysPreventDefaultScrolling();

console.log("All tests passed");
