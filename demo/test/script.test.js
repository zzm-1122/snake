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
  togglePause,
  getState: () => ({
    snake,
    direction,
    nextDirection,
    foods,
    food,
    obstacles,
    score,
    best,
    level,
    speedLevel,
    shieldCharges,
    paused,
    waitingToStart,
    gameOver,
    statusText: statusEl.textContent,
    particlesCount: particles.length,
    trailsCount: trailSegments.length,
    appClasses: Array.from(appEl.classList),
    panelClasses: Array.from(panelEl.classList),
    scoreClasses: Array.from(scoreEl.classList),
  }),
  setState: (nextState) => {
    if ("snake" in nextState) snake = nextState.snake;
    if ("direction" in nextState) direction = nextState.direction;
    if ("nextDirection" in nextState) nextDirection = nextState.nextDirection;
    if ("foods" in nextState) foods = nextState.foods;
    if ("food" in nextState) food = nextState.food;
    if ("obstacles" in nextState) obstacles = nextState.obstacles;
    if ("score" in nextState) score = nextState.score;
    if ("best" in nextState) best = nextState.best;
    if ("level" in nextState) level = nextState.level;
    if ("speedLevel" in nextState) speedLevel = nextState.speedLevel;
    if ("shieldCharges" in nextState) shieldCharges = nextState.shieldCharges;
    if ("paused" in nextState) paused = nextState.paused;
    if ("waitingToStart" in nextState) waitingToStart = nextState.waitingToStart;
    if (
      !("waitingToStart" in nextState) &&
      ("snake" in nextState || "foods" in nextState || "food" in nextState)
    ) {
      waitingToStart = false;
    }
    if ("gameOver" in nextState) gameOver = nextState.gameOver;
  },
};
`;

function createContext({ storageThrows = false } = {}) {
  const listeners = new Map();
  const elements = new Map();
  const localStore = new Map();
  const toneEvents = [];
  const timeouts = [];

  function createClassList() {
    const classes = new Set();
    return {
      add(...tokens) {
        tokens.forEach((token) => classes.add(token));
      },
      remove(...tokens) {
        tokens.forEach((token) => classes.delete(token));
      },
      contains(token) {
        return classes.has(token);
      },
      [Symbol.iterator]() {
        return classes.values();
      },
    };
  }

  function createElement(initialText = "") {
    return {
      textContent: initialText,
      classList: createClassList(),
    };
  }

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
    arc() {},
    closePath() {},
    fill() {},
    createLinearGradient() {
      return {
        addColorStop() {},
      };
    },
  };

  const canvas = {
    width: 400,
    height: 400,
    getContext() {
      return canvasContext;
    },
  };

  const appEl = createElement();
  const panelEl = createElement();
  const scoreEl = createElement("0");
  const bestEl = createElement("0");
  const levelEl = createElement("1");
  const speedEl = createElement("1x");
  const shieldEl = createElement("无");
  const statusEl = createElement("");

  elements.set("app", appEl);
  elements.set("panel", panelEl);
  elements.set("game", canvas);
  elements.set("score", scoreEl);
  elements.set("best", bestEl);
  elements.set("level", levelEl);
  elements.set("speed", speedEl);
  elements.set("shield", shieldEl);
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

  class FakeAudioContext {
    constructor() {
      this.state = "running";
      this.currentTime = 0;
      this.destination = {};
    }

    resume() {
      this.state = "running";
      return Promise.resolve();
    }

    createOscillator() {
      const event = { frequency: null, slideTo: null, type: null, started: false, stopped: false };
      toneEvents.push(event);

      return {
        set type(value) {
          event.type = value;
        },
        get type() {
          return event.type;
        },
        frequency: {
          setValueAtTime(value) {
            event.frequency = value;
          },
          exponentialRampToValueAtTime(value) {
            event.slideTo = value;
          },
        },
        connect() {},
        start() {
          event.started = true;
        },
        stop() {
          event.stopped = true;
        },
      };
    }

    createGain() {
      return {
        gain: {
          setValueAtTime() {},
          exponentialRampToValueAtTime() {},
        },
        connect() {},
      };
    }
  }

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
      querySelectorAll() {
        return [];
      },
    },
    window: {
      AudioContext: FakeAudioContext,
      webkitAudioContext: null,
    },
    performance: {
      now() {
        return 1000;
      },
    },
    localStorage,
    setInterval(fn) {
      context.__intervalFn = fn;
      return 1;
    },
    clearInterval() {},
    setTimeout(fn, delay) {
      timeouts.push({ fn, delay });
      return timeouts.length;
    },
    clearTimeout() {},
  };

  vm.createContext(context);
  vm.runInContext(instrumentedSource, context, { filename: "script.js" });

  return {
    context,
    hooks: context.__testHooks,
    elements: { appEl, panelEl, scoreEl, bestEl, levelEl, speedEl, shieldEl, statusEl },
    toneEvents,
    timeouts,
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

function withNoRandomRespawn(game) {
  game.context.Math.random = () => 0.99;
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

function testRestartPlaysStartCue() {
  const game = createContext();

  game.hooks.setState({ gameOver: true });
  game.dispatchKey(" ");

  assert.equal(game.toneEvents.length, 2, "restart should play a short two-note cue");
  assert.deepEqual(
    game.toneEvents.map((event) => event.frequency),
    [360, 540],
    "restart cue should use the expected pair of notes"
  );
}

function testDirectionChangePlaysTurnCue() {
  const game = createContext();

  game.dispatchKey("ArrowUp");

  assert.equal(game.toneEvents.length, 1, "successful direction change should play one cue");
  assert.equal(game.toneEvents[0].frequency, 280, "turn cue should use the turn frequency");
}

function testNewHighScoreAddsBonusCue() {
  const game = createContext();

  game.hooks.setState({
    snake: [
      { x: 10, y: 10 },
      { x: 9, y: 10 },
      { x: 8, y: 10 },
    ],
    direction: { x: 1, y: 0 },
    nextDirection: { x: 1, y: 0 },
    foods: [{ x: 11, y: 10, type: "normal", ttl: 40 }],
    food: { x: 11, y: 10, type: "normal", ttl: 40 },
    obstacles: [],
    score: 0,
    best: 0,
    gameOver: false,
  });

  game.hooks.step();

  assert.equal(game.toneEvents.length, 2, "new high score should play eat plus bonus cue");
  assert.deepEqual(
    game.toneEvents.map((event) => event.frequency),
    [700, 980],
    "high-score cue should layer a brighter bonus note after the eat sound"
  );
}

function testEatingFoodAddsParticlesAndScorePulse() {
  const game = createContext();

  game.hooks.setState({
    snake: [
      { x: 10, y: 10 },
      { x: 9, y: 10 },
      { x: 8, y: 10 },
    ],
    direction: { x: 1, y: 0 },
    nextDirection: { x: 1, y: 0 },
    foods: [{ x: 11, y: 10, type: "normal", ttl: 40 }],
    food: { x: 11, y: 10, type: "normal", ttl: 40 },
    obstacles: [],
    score: 0,
    best: 5,
    gameOver: false,
  });

  game.hooks.step();

  const state = game.hooks.getState();
  assert.equal(state.particlesCount > 0, true, "eating should spawn visual particles");
  assert.equal(state.scoreClasses.includes("pop"), true, "eating should pulse the score");
}

function testGameOverAddsImpactClasses() {
  const game = createContext();

  game.hooks.setState({
    snake: [
      { x: 19, y: 10 },
      { x: 18, y: 10 },
      { x: 17, y: 10 },
    ],
    direction: { x: 1, y: 0 },
    nextDirection: { x: 1, y: 0 },
    food: { x: 2, y: 2 },
    gameOver: false,
  });

  game.hooks.step();

  const state = game.hooks.getState();
  assert.equal(state.appClasses.includes("is-flash"), true, "game over should trigger a flash");
  assert.equal(state.appClasses.includes("is-shaking"), true, "game over should trigger a shake");
}

function testGoldFoodAwardsMorePointsWithoutGrowing() {
  const game = createContext();
  withNoRandomRespawn(game);

  game.hooks.setState({
    snake: [
      { x: 10, y: 10 },
      { x: 9, y: 10 },
      { x: 8, y: 10 },
    ],
    direction: { x: 1, y: 0 },
    nextDirection: { x: 1, y: 0 },
    foods: [{ x: 11, y: 10, type: "gold", ttl: 20 }],
    obstacles: [],
    score: 0,
    best: 10,
    gameOver: false,
  });

  game.hooks.step();

  const state = game.hooks.getState();
  assert.equal(state.score, 5, "gold food should award a larger score bonus");
  assert.equal(state.snake.length, 3, "gold food should not grow the snake");
}

function testShieldFoodBlocksOneWallCollision() {
  const game = createContext();
  withNoRandomRespawn(game);

  game.hooks.setState({
    snake: [
      { x: 10, y: 10 },
      { x: 9, y: 10 },
      { x: 8, y: 10 },
    ],
    direction: { x: 1, y: 0 },
    nextDirection: { x: 1, y: 0 },
    foods: [{ x: 11, y: 10, type: "shield", ttl: 20 }],
    obstacles: [],
    score: 0,
    best: 10,
    gameOver: false,
  });

  game.hooks.step();
  game.hooks.setState({
    snake: [
      { x: 19, y: 10 },
      { x: 18, y: 10 },
      { x: 17, y: 10 },
    ],
    direction: { x: 1, y: 0 },
    nextDirection: { x: 1, y: 0 },
    foods: [],
    obstacles: [],
    gameOver: false,
  });

  game.hooks.step();

  const state = game.hooks.getState();
  assert.equal(state.gameOver, false, "shield should prevent one lethal wall hit");
  assert.equal(state.shieldCharges, 0, "shield should be consumed by the blocked hit");
  assert.equal(state.snake[0].x, 19, "blocked wall hit should leave the snake on the board");
}

function testLevelUpAddsObstacles() {
  const game = createContext();
  withNoRandomRespawn(game);

  game.hooks.setState({
    snake: [
      { x: 10, y: 10 },
      { x: 9, y: 10 },
      { x: 8, y: 10 },
    ],
    direction: { x: 1, y: 0 },
    nextDirection: { x: 1, y: 0 },
    foods: [{ x: 11, y: 10, type: "normal", ttl: 20 }],
    obstacles: [],
    score: 4,
    best: 10,
    level: 1,
    gameOver: false,
  });

  game.hooks.step();

  const state = game.hooks.getState();
  assert.equal(state.level, 2, "reaching five points should advance to level two");
  assert.equal(state.obstacles.length > 0, true, "level two should introduce obstacles");
}

function testPoisonShrinksSnakeAndReducesScore() {
  const game = createContext();
  withNoRandomRespawn(game);

  game.hooks.setState({
    snake: [
      { x: 10, y: 10 },
      { x: 9, y: 10 },
      { x: 8, y: 10 },
      { x: 7, y: 10 },
    ],
    direction: { x: 1, y: 0 },
    nextDirection: { x: 1, y: 0 },
    foods: [{ x: 11, y: 10, type: "poison", ttl: 20 }],
    obstacles: [],
    score: 3,
    best: 10,
    gameOver: false,
  });

  game.hooks.step();

  const state = game.hooks.getState();
  assert.equal(state.score, 1, "poison should subtract points without going below zero");
  assert.equal(state.snake.length, 3, "poison should trim the snake by one segment");
}

function testPauseStopsMovement() {
  const game = createContext();

  game.hooks.setState({
    snake: [
      { x: 10, y: 10 },
      { x: 9, y: 10 },
      { x: 8, y: 10 },
    ],
    direction: { x: 1, y: 0 },
    nextDirection: { x: 1, y: 0 },
    foods: [{ x: 15, y: 10, type: "normal", ttl: 20 }],
    obstacles: [],
    paused: true,
    gameOver: false,
  });

  game.hooks.step();

  assert.deepEqual(
    JSON.parse(JSON.stringify(game.hooks.getState().snake)),
    [
      { x: 10, y: 10 },
      { x: 9, y: 10 },
      { x: 8, y: 10 },
    ],
    "paused game should not advance snake position"
  );
}

function testFreshGameWaitsForDirectionBeforeMoving() {
  const game = createContext();
  const initialState = game.hooks.getState();
  const startSnake = JSON.parse(JSON.stringify(initialState.snake));

  assert.deepEqual(
    JSON.parse(JSON.stringify(initialState.direction)),
    { x: 0, y: 0 },
    "fresh game should start with no movement direction"
  );

  game.hooks.step();
  assert.deepEqual(
    JSON.parse(JSON.stringify(game.hooks.getState().snake)),
    startSnake,
    "fresh game should wait instead of moving immediately"
  );

  game.dispatchKey("ArrowRight");
  assert.equal(game.hooks.getState().waitingToStart, false, "first direction input should start play");
}

testMovingIntoVacatedTailIsAllowed();
testStorageFailuresDoNotCrashStartup();
testControlKeysPreventDefaultScrolling();
testRestartPlaysStartCue();
testDirectionChangePlaysTurnCue();
testNewHighScoreAddsBonusCue();
testEatingFoodAddsParticlesAndScorePulse();
testGameOverAddsImpactClasses();
testGoldFoodAwardsMorePointsWithoutGrowing();
testShieldFoodBlocksOneWallCollision();
testLevelUpAddsObstacles();
testPoisonShrinksSnakeAndReducesScore();
testPauseStopsMovement();
testFreshGameWaitsForDirectionBeforeMoving();

console.log("All tests passed");
