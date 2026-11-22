// Boot and the one loop: input is read every frame, the world advances in fixed 1/60 s
// steps (several in a slow frame, none in a fast one), and the renderer paints what is
// there. The game moves between five screens: title, play, paused, caught and escaped.
//
// ?seed=N fixes the patrol jitter and camera phase. ?shot=cover|patrol|alert|escape
// (with &seed=N) stages that scene instead of running the loop, paints it twice and sets
// window.__shotReady for a screenshot.
import { BEST_KEY, STEP } from './config.js';
import { createRandom } from './random.js';
import { createWorld, EVENT_ALARM_TICK, EVENT_CAUGHT, EVENT_COIN, EVENT_ESCAPED, EVENT_PICKUP, EVENT_SMOKE, EVENT_SPOTTED } from './world.js';
import { ACTION_CONFIRM, ACTION_MUTE, ACTION_PAUSE, ACTION_SMOKE, createInput } from './input.js';
import { createRenderer, SCREEN_CAUGHT, SCREEN_ESCAPED, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE } from './render.js';
import { createSound } from './sound.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas);
const sound = createSound();

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the best score then lasts this visit only.
  }
}

function runShot(name) {
  const scene = stageShot(name, world);
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, scene.best);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let best = readBest();
  let accumulator = 0;
  let last = performance.now();

  // Screen readers (and anyone watching the page's text) hear the screen changes.
  function announce(message) {
    status.textContent = message;
  }

  function startGame() {
    world.reset();
    accumulator = 0;
    screen = SCREEN_PLAY;
    announce('Playing. Steal all three treasures, then reach the exit.');
  }

  function endRun(events) {
    if ((events & EVENT_ESCAPED) !== 0) {
      screen = SCREEN_ESCAPED;
      if (world.state.score > best) {
        best = world.state.score;
        saveBest(best);
      }
      sound.escaped();
      announce(`Clean getaway. Score ${world.state.score}. Best ${best}.`);
    } else if ((events & EVENT_CAUGHT) !== 0) {
      screen = SCREEN_CAUGHT;
      if (world.state.score > best) {
        best = world.state.score;
        saveBest(best);
      }
      sound.caught();
      announce(`Caught. Score ${world.state.score}. Best ${best}.`);
    }
  }

  function frame(now) {
    const delta = Math.min(MAX_FRAME, (now - last) / 1000);
    last = now;
    const actions = input.takeActions();
    if ((actions & ACTION_MUTE) !== 0) sound.toggleMute();

    if (screen === SCREEN_TITLE) {
      if ((actions & ACTION_CONFIRM) !== 0) startGame();
    } else if (screen === SCREEN_PLAY) {
      if ((actions & ACTION_PAUSE) !== 0) {
        screen = SCREEN_PAUSED;
        announce('Paused.');
      } else {
        accumulator += delta;
        let guard = 0;
        let stepActions = actions;
        while (accumulator >= STEP && guard < 5) {
          accumulator -= STEP;
          guard += 1;
          const events = world.step(STEP, {
            steering: input.steering(),
            running: input.running(),
            actions: stepActions,
            coinTarget: input.takeCoinTarget(),
          });
          stepActions = 0;
          if ((events & EVENT_PICKUP) !== 0) sound.pickup();
          if ((events & EVENT_COIN) !== 0) sound.coin();
          if ((events & EVENT_SMOKE) !== 0) sound.smoke();
          if ((events & EVENT_SPOTTED) !== 0) sound.spotted();
          if ((events & EVENT_ALARM_TICK) !== 0) sound.alarmTick();
          if ((events & (EVENT_CAUGHT | EVENT_ESCAPED)) !== 0) {
            endRun(events);
            break;
          }
        }
        if (guard >= 5) accumulator = 0;
      }
    } else if (screen === SCREEN_PAUSED) {
      if ((actions & ACTION_PAUSE) !== 0 || (actions & ACTION_CONFIRM) !== 0) {
        screen = SCREEN_PLAY;
        announce('Playing.');
      }
    } else if (screen === SCREEN_CAUGHT || screen === SCREEN_ESCAPED) {
      if ((actions & ACTION_CONFIRM) !== 0) startGame();
    }

    renderer.draw(world.state, screen, best);
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}

if (shot !== null) runShot(shot);
else runGame();
