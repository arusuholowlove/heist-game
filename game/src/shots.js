// The screenshot scenes behind ?shot=cover|patrol|alert|escape. Each one plays the real
// rules forward from a fresh world, steered by an autopilot that plans a route on a grid
// with A* and re-plans as the cones sweep: cells a guard or camera can see cost extra,
// so the thief slips around the cones when a safe way exists and only hurries through
// them when there is none. A careful thief also waits where it is safe when the next
// step is watched. The frame is what a short game really looks like, and the same seed
// always gives the same frame.
import { LOOT, STEP, THIEF } from './config.js';
import { EVENT_CAUGHT, EVENT_ESCAPED } from './world.js';
import { SCREEN_ESCAPED, SCREEN_PLAY, SCREEN_TITLE } from './render.js';

/** The planning grid: 20 px cells over the 1280x720 field. */
const CELL = 20;
const COLS = 64;
const ROWS = 36;

/** Extra A* cost of a cell a guard or camera can see right now (0 in bold mode). */
const DANGER_COST = 60;
function cellCentre(col, row) {
  return { x: col * CELL + CELL / 2, y: row * CELL + CELL / 2 };
}

function toCell(x, y) {
  return {
    col: Math.min(COLS - 1, Math.max(0, Math.floor(x / CELL))),
    row: Math.min(ROWS - 1, Math.max(0, Math.floor(y / CELL))),
  };
}

/**
 * A* over the planning grid. `blocked` is the precomputed solid-cell table; a watched
 * cell costs `dangerCost` extra (0 in bold mode). Returns the list of cell centres from
 * the start to the goal, or an empty list when unreachable.
 */
function planPath(world, blocked, from, goal, dangerCost) {
  const start = toCell(from.x, from.y);
  const end = toCell(goal.x, goal.y);
  const startKey = start.row * COLS + start.col;
  const endKey = end.row * COLS + end.col;
  // The goal cell itself may be inside a pedestal: take the nearest free cell instead.
  let goalKey = endKey;
  if (blocked[endKey]) {
    let bestDist = Infinity;
    for (let row = 0; row < ROWS; row += 1) {
      for (let col = 0; col < COLS; col += 1) {
        const key = row * COLS + col;
        if (blocked[key]) continue;
        const centre = cellCentre(col, row);
        const dist = Math.hypot(centre.x - goal.x, centre.y - goal.y);
        if (dist < bestDist) {
          bestDist = dist;
          goalKey = key;
        }
      }
    }
  }
  const open = [{ key: startKey, f: 0 }];
  const cameFrom = new Map();
  const costSoFar = new Map([[startKey, 0]]);
  const seenCache = new Map();
  function isWatched(key) {
    if (dangerCost <= 0) return false;
    if (!seenCache.has(key)) {
      const centre = cellCentre(key % COLS, Math.floor(key / COLS));
      seenCache.set(key, world.pointSeenBy(centre.x, centre.y));
    }
    return seenCache.get(key);
  }
  function heuristic(key) {
    const col = key % COLS;
    const row = Math.floor(key / COLS);
    const goalCol = goalKey % COLS;
    const goalRow = Math.floor(goalKey / COLS);
    return Math.hypot(goalCol - col, goalRow - row);
  }
  while (open.length > 0) {
    let bestIndex = 0;
    for (let index = 1; index < open.length; index += 1) {
      if (open[index].f < open[bestIndex].f) bestIndex = index;
    }
    const current = open.splice(bestIndex, 1)[0];
    if (current.key === goalKey) {
      const path = [];
      let key = goalKey;
      while (key !== startKey) {
        path.push(cellCentre(key % COLS, Math.floor(key / COLS)));
        key = cameFrom.get(key);
      }
      path.reverse();
      return path;
    }
    const col = current.key % COLS;
    const row = Math.floor(current.key / COLS);
    for (let dRow = -1; dRow <= 1; dRow += 1) {
      for (let dCol = -1; dCol <= 1; dCol += 1) {
        if (dRow === 0 && dCol === 0) continue;
        const nextCol = col + dCol;
        const nextRow = row + dRow;
        if (nextCol < 0 || nextCol >= COLS || nextRow < 0 || nextRow >= ROWS) continue;
        const nextKey = nextRow * COLS + nextCol;
        if (blocked[nextKey]) continue;
        // No cutting corners through a solid's diagonal.
        if (dRow !== 0 && dCol !== 0) {
          if (blocked[row * COLS + nextCol] || blocked[nextRow * COLS + col]) continue;
        }
        const stepCost = (dRow !== 0 && dCol !== 0 ? 1.414 : 1)
          + (isWatched(nextKey) ? dangerCost : 0);
        const nextCost = costSoFar.get(current.key) + stepCost;
        if (!costSoFar.has(nextKey) || nextCost < costSoFar.get(nextKey)) {
          costSoFar.set(nextKey, nextCost);
          cameFrom.set(nextKey, current.key);
          open.push({ key: nextKey, f: nextCost + heuristic(nextKey) });
        }
      }
    }
  }
  return [];
}

/** Build the table of grid cells a thief's circle cannot stand in. */
function buildBlocked(world) {
  const blocked = new Array(COLS * ROWS).fill(false);
  for (let row = 0; row < ROWS; row += 1) {
    for (let col = 0; col < COLS; col += 1) {
      const centre = cellCentre(col, row);
      blocked[row * COLS + col] = world.pointBlocked(centre.x, centre.y, THIEF.radius);
    }
  }
  return blocked;
}

/**
 * Drive the world toward `goal` for up to `limitSeconds`, re-planning every second of
 * game time. Stops early when `doneWhen` says the objective is met, when `stopWhen`
 * says so, or when the run ends. `risk` scales how much the thief minds being seen
 * (1 = fully careful, 0 = bold); `bold` is risk 0. Returns the events.
 */
function driveTo(world, blocked, goal, { limitSeconds, bold = false, risk = 1, doneWhen = null, stopWhen = null }) {
  const dangerCost = bold ? 0 : DANGER_COST * risk;
  let path = [];
  let pathIndex = 0;
  let replanTimer = 0;
  let waitTimer = 0;
  let events = 0;
  let elapsed = 0;
  const steps = Math.round(limitSeconds / STEP);
  for (let index = 0; index < steps; index += 1) {
    const thief = world.state.thief;
    replanTimer -= STEP;
    if (replanTimer <= 0 || pathIndex >= path.length) {
      replanTimer = 1.0;
      path = planPath(world, blocked, thief, goal, dangerCost);
      pathIndex = 0;
    }
    let steering = { x: 0, y: 0 };
    if (pathIndex < path.length) {
      const node = path[pathIndex];
      if (Math.hypot(node.x - thief.x, node.y - thief.y) < 10) {
        pathIndex += 1;
      } else if (dangerCost > DANGER_COST * 0.5 && waitTimer <= 0 && world.pointSeenBy(node.x, node.y)
        && !world.pointSeenBy(thief.x, thief.y)) {
        // The next step is watched and this spot is safe: wait for the cone to pass.
        waitTimer = 0.5;
      } else if (waitTimer > 0) {
        waitTimer -= STEP;
      } else {
        const dist = Math.hypot(node.x - thief.x, node.y - thief.y);
        steering = { x: (node.x - thief.x) / dist, y: (node.y - thief.y) / dist };
      }
    } else {
      // The planned route is done but the objective is not met yet (the loot sits on a
      // pedestal the grid's cell centres never reach): press straight toward the goal
      // and let the collision push the thief to the pedestal's edge, where the grab lands.
      const dist = Math.hypot(goal.x - thief.x, goal.y - thief.y);
      if (dist > 5) steering = { x: (goal.x - thief.x) / dist, y: (goal.y - thief.y) / dist };
    }
    events |= world.step(STEP, {
      steering,
      running: false,
      actions: 0,
      coinTarget: null,
    });
    elapsed += STEP;
    if ((events & EVENT_CAUGHT) !== 0 || (events & EVENT_ESCAPED) !== 0) break;
    if (doneWhen !== null && doneWhen(world.state)) break;
    if (stopWhen !== null && stopWhen(world.state, elapsed)) break;
  }
  return events;
}

/** The objectives, in the order a careful thief takes them. */
function objectives() {
  return [
    { x: LOOT[0].x, y: LOOT[0].y },
    { x: LOOT[1].x, y: LOOT[1].y },
    { x: LOOT[2].x, y: LOOT[2].y },
    { x: 40, y: 648 },
  ];
}

/**
 * Set `world` to the named scene and return the screen to draw over it and the best
 * score to show. Any other name stages the title scene.
 */
export function stageShot(name, world) {
  world.reset();
  const blocked = buildBlocked(world);
  const [mask, portrait, diamond, exit] = objectives();

  if (name === 'patrol') {
    driveTo(world, blocked, mask, {
      limitSeconds: 14,
      doneWhen: (state) => state.loot[0].taken,
    });
    return { screen: SCREEN_PLAY, best: 0 };
  }
  if (name === 'cover') {
    driveTo(world, blocked, mask, {
      limitSeconds: 60,
      doneWhen: (state) => state.loot[0].taken,
    });
    driveTo(world, blocked, portrait, {
      limitSeconds: 45,
      doneWhen: (state) => state.loot[1].taken,
    });
    // Head for the diamond and freeze as the thief crosses the middle of the gallery:
    // two treasures pocketed, the diamond still glowing above, the cones sweeping.
    driveTo(world, blocked, diamond, {
      limitSeconds: 40,
      risk: 0.2,
      stopWhen: (state) => Math.hypot(state.thief.x - 640, state.thief.y - 380) < 145,
    });
    return { screen: SCREEN_PLAY, best: 0 };
  }
  if (name === 'alert') {
    driveTo(world, blocked, mask, {
      limitSeconds: 90,
      bold: true,
      doneWhen: (state) => state.loot[0].taken,
      stopWhen: (state) => state.alarm >= 55,
    });
    if (world.state.alarm < 55 && world.state.status === 'playing') {
      // No cone caught the thief on the way: walk into the nearest guard's cone and wait.
      for (let attempt = 0; attempt < 3 && world.state.alarm < 58; attempt += 1) {
        let nearest = null;
        let nearestDist = Infinity;
        for (const guard of world.state.guards) {
          const dist = Math.hypot(guard.x - world.state.thief.x, guard.y - world.state.thief.y);
          if (dist < nearestDist) {
            nearestDist = dist;
            nearest = guard;
          }
        }
        if (nearest === null) break;
        const provoke = {
          x: nearest.x + Math.cos(nearest.angle) * 110,
          y: nearest.y + Math.sin(nearest.angle) * 110,
        };
        driveTo(world, blocked, provoke, {
          limitSeconds: 25,
          bold: true,
          stopWhen: (state) => state.alarm >= 58,
        });
        if (world.state.status !== 'playing') break;
      }
    }
    return { screen: SCREEN_PLAY, best: 0 };
  }
  if (name === 'escape') {
    driveTo(world, blocked, mask, {
      limitSeconds: 90,
      doneWhen: (state) => state.loot[0].taken,
    });
    driveTo(world, blocked, portrait, {
      limitSeconds: 90,
      doneWhen: (state) => state.loot[1].taken,
    });
    driveTo(world, blocked, diamond, {
      limitSeconds: 90,
      doneWhen: (state) => state.loot[2].taken,
    });
    const events = driveTo(world, blocked, exit, { limitSeconds: 90 });
    if ((events & EVENT_ESCAPED) !== 0 || world.state.status === 'escaped') {
      return { screen: SCREEN_ESCAPED, best: world.state.score };
    }
    return { screen: SCREEN_PLAY, best: 0 };
  }
  return { screen: SCREEN_TITLE, best: 0 };
}
