// The heist itself: movement and collision, guard patrols and vision cones, sweeping
// cameras, the alarm meter, smoke bombs and thrown coins, loot and the getaway door.
// The world advances in fixed steps and reports what happened as event flags, so the
// loop and the screenshot stager both drive it the same way.
import {
  ALARM,
  CAMERA,
  EXIT,
  FIELD,
  GUARD,
  LOOT,
  SPAWN,
  STEP,
  THIEF,
  TIME_LIMIT,
  TOOLS,
} from './config.js';
import { buildLevel } from './level.js';
import { ACTION_SMOKE } from './input.js';

export const EVENT_PICKUP = 1;
export const EVENT_CAUGHT = 2;
export const EVENT_ESCAPED = 4;
export const EVENT_SPOTTED = 8;
export const EVENT_COIN = 16;
export const EVENT_SMOKE = 32;
export const EVENT_ALARM_TICK = 64;

const BOUND = 24;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function distance(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by);
}

/** True when the segment (x1,y1)-(x2,y2) touches the rectangle. */
function segmentHitsRect(x1, y1, x2, y2, rect) {
  const minX = Math.min(x1, x2);
  const maxX = Math.max(x1, x2);
  const minY = Math.min(y1, y2);
  const maxY = Math.max(y1, y2);
  if (maxX < rect.x || minX > rect.x + rect.w || maxY < rect.y || minY > rect.y + rect.h) return false;
  if (x1 >= rect.x && x1 <= rect.x + rect.w && y1 >= rect.y && y1 <= rect.y + rect.h) return true;
  const dx = x2 - x1;
  const dy = y2 - y1;
  // Slab test: the segment enters the rect when the entry time is before the exit time.
  let tMin = 0;
  let tMax = 1;
  for (const [origin, delta, low, high] of [
    [x1, dx, rect.x, rect.x + rect.w],
    [y1, dy, rect.y, rect.y + rect.h],
  ]) {
    if (Math.abs(delta) < 1e-9) {
      if (origin < low || origin > high) return false;
    } else {
      let t1 = (low - origin) / delta;
      let t2 = (high - origin) / delta;
      if (t1 > t2) [t1, t2] = [t2, t1];
      tMin = Math.max(tMin, t1);
      tMax = Math.min(tMax, t2);
      if (tMin > tMax) return false;
    }
  }
  return true;
}

/** True when the segment passes through the circle. */
function segmentHitsCircle(x1, y1, x2, y2, cx, cy, radius) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lengthSq = dx * dx + dy * dy;
  let t = lengthSq === 0 ? 0 : ((cx - x1) * dx + (cy - y1) * dy) / lengthSq;
  t = clamp(t, 0, 1);
  const nearestX = x1 + t * dx;
  const nearestY = y1 + t * dy;
  return distance(nearestX, nearestY, cx, cy) < radius;
}

/** Push a circle out of a rectangle it overlaps; returns true when it was pushed. */
function pushCircleOutOfRect(circle, rect) {
  const nearestX = clamp(circle.x, rect.x, rect.x + rect.w);
  const nearestY = clamp(circle.y, rect.y, rect.y + rect.h);
  const dx = circle.x - nearestX;
  const dy = circle.y - nearestY;
  const distSq = dx * dx + dy * dy;
  if (distSq >= circle.radius * circle.radius) return false;
  if (distSq > 1e-9) {
    const dist = Math.sqrt(distSq);
    circle.x = nearestX + (dx / dist) * circle.radius;
    circle.y = nearestY + (dy / dist) * circle.radius;
  } else {
    // The centre is inside the rectangle: push out along the smallest overlap.
    const left = circle.x - rect.x + circle.radius;
    const right = rect.x + rect.w - circle.x + circle.radius;
    const top = circle.y - rect.y + circle.radius;
    const bottom = rect.y + rect.h - circle.y + circle.radius;
    const smallest = Math.min(left, right, top, bottom);
    if (smallest === left) circle.x = rect.x - circle.radius;
    else if (smallest === right) circle.x = rect.x + rect.w + circle.radius;
    else if (smallest === top) circle.y = rect.y - circle.radius;
    else circle.y = rect.y + rect.h + circle.radius;
  }
  return true;
}

function moveCircle(circle, dx, dy, solids) {
  circle.x += dx;
  for (const rect of solids) pushCircleOutOfRect(circle, rect);
  circle.x = clamp(circle.x, BOUND + circle.radius, FIELD.width - BOUND - circle.radius);
  circle.y += dy;
  for (const rect of solids) pushCircleOutOfRect(circle, rect);
  circle.y = clamp(circle.y, BOUND + circle.radius, FIELD.height - BOUND - circle.radius);
}

export function createWorld(random) {
  const level = buildLevel();
  const solids = level.solids;

  const state = {
    time: 0,
    timeLeft: TIME_LIMIT,
    alarm: 0,
    score: 0,
    lootTaken: 0,
    smokeLeft: TOOLS.smokeCount,
    coinsLeft: TOOLS.coinCount,
    status: 'playing',
    caughtReason: null,
    hint: null,
    hintTimer: 0,
    alarmTickTimer: 0,
    thief: { x: SPAWN.x, y: SPAWN.y, radius: THIEF.radius, angle: -Math.PI / 2, moving: false, running: false },
    guards: [],
    cameras: [],
    loot: [],
    clouds: [],
    flyingCoins: [],
  };

  function resetGuards() {
    state.guards = level.guards.map((guard, index) => {
      const start = guard.waypoints[0];
      const next = guard.waypoints[1];
      return {
        name: guard.name,
        x: start.x,
        y: start.y,
        radius: GUARD.radius,
        angle: Math.atan2(next.y - start.y, next.x - start.x),
        waypoints: guard.waypoints,
        waypointIndex: 1,
        state: 'patrol',
        suspicion: 0,
        stareTimer: 0,
        investigateTarget: null,
        lookTimer: 0,
        lastSeen: null,
        loseSightTimer: 0,
        pauseTimer: index * 0.35,
      };
    });
  }

  function resetCameras() {
    state.cameras = level.cameras.map((camera) => ({
      x: camera.x,
      y: camera.y,
      angle: camera.angle,
      centreAngle: camera.angle,
      sweep: camera.sweep,
      phase: camera.phase,
    }));
  }

  function reset() {
    state.time = 0;
    state.timeLeft = TIME_LIMIT;
    state.alarm = 0;
    state.score = 0;
    state.lootTaken = 0;
    state.smokeLeft = TOOLS.smokeCount;
    state.coinsLeft = TOOLS.coinCount;
    state.status = 'playing';
    state.caughtReason = null;
    state.hint = null;
    state.hintTimer = 0;
    state.alarmTickTimer = 0;
    state.thief.x = SPAWN.x;
    state.thief.y = SPAWN.y;
    state.thief.angle = -Math.PI / 2;
    state.thief.moving = false;
    state.thief.running = false;
    state.loot = level.loot.map((item) => ({ ...item }));
    state.clouds = [];
    state.flyingCoins = [];
    resetGuards();
    resetCameras();
    void random;
  }

  /** True when nothing solid and no smoke stands between the two points. */
  function hasLineOfSight(x1, y1, x2, y2) {
    for (const rect of solids) {
      if (segmentHitsRect(x1, y1, x2, y2, rect)) return false;
    }
    for (const cloud of state.clouds) {
      if (segmentHitsCircle(x1, y1, x2, y2, cloud.x, cloud.y, cloud.radius)) return false;
    }
    return true;
  }

  function thiefHiddenInSmoke() {
    for (const cloud of state.clouds) {
      if (distance(state.thief.x, state.thief.y, cloud.x, cloud.y) < cloud.radius) return true;
    }
    return false;
  }

  /** True when the watcher at (ox,oy) facing `angle` can see the thief. */
  function canSeeThief(ox, oy, angle, range, halfAngle) {
    if (thiefHiddenInSmoke()) return false;
    const dx = state.thief.x - ox;
    const dy = state.thief.y - oy;
    const dist = Math.hypot(dx, dy);
    if (dist > range || dist < 1) return false;
    let diff = Math.atan2(dy, dx) - angle;
    while (diff > Math.PI) diff -= 2 * Math.PI;
    while (diff < -Math.PI) diff += 2 * Math.PI;
    if (Math.abs(diff) > halfAngle) return false;
    return hasLineOfSight(ox, oy, state.thief.x, state.thief.y);
  }

  function updateThief(dt, input) {
    const thief = state.thief;
    const speed = input.running ? THIEF.runSpeed : THIEF.walkSpeed;
    const dx = input.steering.x * speed * dt;
    const dy = input.steering.y * speed * dt;
    thief.moving = dx !== 0 || dy !== 0;
    thief.running = input.running && thief.moving;
    if (thief.moving) thief.angle = Math.atan2(input.steering.y, input.steering.x);
    moveCircle(thief, dx, dy, solids);
  }

  function updateGuards(dt, events) {
    for (const guard of state.guards) {
      const sees = canSeeThief(guard.x, guard.y, guard.angle, GUARD.viewRange, GUARD.viewHalfAngle);
      if (sees) {
        guard.suspicion = clamp(guard.suspicion + GUARD.suspicionGain * dt, 0, 1);
        guard.lastSeen = { x: state.thief.x, y: state.thief.y };
        guard.loseSightTimer = 0;
      } else {
        guard.suspicion = clamp(guard.suspicion - GUARD.suspicionLoss * dt, 0, 1);
        if (guard.state === 'chase') guard.loseSightTimer += dt;
      }

      if (guard.state === 'patrol') {
        if (guard.suspicion >= GUARD.chaseAt) {
          guard.state = 'chase';
          events.value |= EVENT_SPOTTED;
        } else if (guard.suspicion >= GUARD.suspectAt) {
          guard.state = 'stare';
          guard.stareTimer = GUARD.stareSeconds;
        } else {
          // A running thief is heard: the guard turns to listen, then investigates.
          const heard = state.thief.running
            && distance(guard.x, guard.y, state.thief.x, state.thief.y) < THIEF.runHeardRadius;
          if (heard) {
            guard.state = 'investigate';
            guard.investigateTarget = { x: state.thief.x, y: state.thief.y };
            continue;
          }
          if (guard.pauseTimer > 0) {
            guard.pauseTimer -= dt;
            continue;
          }
          const target = guard.waypoints[guard.waypointIndex];
          const dx = target.x - guard.x;
          const dy = target.y - guard.y;
          const dist = Math.hypot(dx, dy);
          if (dist < 6) {
            guard.waypointIndex = (guard.waypointIndex + 1) % guard.waypoints.length;
            guard.pauseTimer = 0.35;
            continue;
          }
          const step = Math.min(GUARD.patrolSpeed * dt, dist);
          guard.angle = Math.atan2(dy, dx);
          moveCircle(guard, (dx / dist) * step, (dy / dist) * step, solids);
        }
      } else if (guard.state === 'stare') {
        if (guard.lastSeen !== null) {
          guard.angle = Math.atan2(guard.lastSeen.y - guard.y, guard.lastSeen.x - guard.x);
        }
        if (guard.suspicion >= GUARD.chaseAt) {
          guard.state = 'chase';
          events.value |= EVENT_SPOTTED;
        } else {
          guard.stareTimer -= dt;
          if (guard.stareTimer <= 0) {
            guard.state = 'patrol';
            guard.suspicion = 0;
          }
        }
      } else if (guard.state === 'chase') {
        if (guard.lastSeen !== null) {
          guard.angle = Math.atan2(guard.lastSeen.y - guard.y, guard.lastSeen.x - guard.x);
          const dx = guard.lastSeen.x - guard.x;
          const dy = guard.lastSeen.y - guard.y;
          const dist = Math.hypot(dx, dy);
          if (dist > 4) {
            const step = Math.min(GUARD.chaseSpeed * dt, dist);
            moveCircle(guard, (dx / dist) * step, (dy / dist) * step, solids);
          }
        }
        if (distance(guard.x, guard.y, state.thief.x, state.thief.y) < GUARD.catchRadius) {
          state.status = 'caught';
          state.caughtReason = 'spotted';
          events.value |= EVENT_CAUGHT;
          return;
        }
        if (guard.loseSightTimer > 2.5) {
          guard.state = 'investigate';
          guard.investigateTarget = guard.lastSeen !== null
            ? { ...guard.lastSeen }
            : { x: state.thief.x, y: state.thief.y };
          guard.loseSightTimer = 0;
        }
      } else if (guard.state === 'investigate') {
        const target = guard.investigateTarget;
        if (target === null) {
          guard.state = 'patrol';
          continue;
        }
        const dx = target.x - guard.x;
        const dy = target.y - guard.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 10) {
          guard.lookTimer += dt;
          guard.angle += dt * 1.4;
          if (guard.lookTimer >= GUARD.investigateSeconds) {
            guard.state = 'patrol';
            guard.lookTimer = 0;
            guard.investigateTarget = null;
          }
        } else {
          guard.angle = Math.atan2(dy, dx);
          const step = Math.min(GUARD.investigateSpeed * dt, dist);
          moveCircle(guard, (dx / dist) * step, (dy / dist) * step, solids);
        }
      }
    }
  }

  function updateCameras(dt) {
    for (const camera of state.cameras) {
      camera.angle = camera.centreAngle
        + Math.sin(state.time * CAMERA.sweepSpeed + camera.phase) * camera.sweep;
    }
  }

  function updateAlarm(dt, events) {
    let seenByGuard = false;
    let chasing = false;
    for (const guard of state.guards) {
      if (guard.state === 'chase') chasing = true;
      if (canSeeThief(guard.x, guard.y, guard.angle, GUARD.viewRange, GUARD.viewHalfAngle)) {
        seenByGuard = true;
      }
    }
    let seenByCamera = false;
    for (const camera of state.cameras) {
      if (canSeeThief(camera.x, camera.y, camera.angle, CAMERA.viewRange, CAMERA.viewHalfAngle)) {
        seenByCamera = true;
      }
    }
    if (seenByGuard) state.alarm += ALARM.guardSeenRate * dt;
    if (seenByCamera) state.alarm += CAMERA.alarmRate * dt;
    if (chasing) state.alarm += ALARM.chaseRate * dt;
    if (!seenByGuard && !seenByCamera && !chasing) {
      state.alarm = Math.max(0, state.alarm - ALARM.decayRate * dt);
    }
    state.alarm = clamp(state.alarm, 0, ALARM.max);
    if (state.alarm > 60) {
      state.alarmTickTimer -= dt;
      if (state.alarmTickTimer <= 0) {
        state.alarmTickTimer = 0.55;
        events.value |= EVENT_ALARM_TICK;
      }
    }
    if (state.alarm >= ALARM.max) {
      state.status = 'caught';
      state.caughtReason = 'lockdown';
      events.value |= EVENT_CAUGHT;
    }
  }

  function updateTools(dt, input, events) {
    if ((input.actions & ACTION_SMOKE) !== 0 && state.smokeLeft > 0) {
      state.smokeLeft -= 1;
      state.clouds.push({
        x: state.thief.x,
        y: state.thief.y,
        radius: TOOLS.smokeRadius,
        ttl: TOOLS.smokeSeconds,
      });
      events.value |= EVENT_SMOKE;
    }
    const target = input.coinTarget;
    if (target !== null && state.coinsLeft > 0) {
      const dx = target.x - state.thief.x;
      const dy = target.y - state.thief.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 8) {
        const reach = Math.min(dist, TOOLS.coinRange);
        const landing = {
          x: state.thief.x + (dx / dist) * reach,
          y: state.thief.y + (dy / dist) * reach,
        };
        state.coinsLeft -= 1;
        state.flyingCoins.push({
          x: state.thief.x,
          y: state.thief.y,
          sx: state.thief.x,
          sy: state.thief.y,
          tx: landing.x,
          ty: landing.y,
          travelled: 0,
          total: Math.min(dist, TOOLS.coinRange),
        });
        events.value |= EVENT_COIN;
      }
    }
    for (let index = state.clouds.length - 1; index >= 0; index -= 1) {
      state.clouds[index].ttl -= dt;
      if (state.clouds[index].ttl <= 0) state.clouds.splice(index, 1);
    }
    for (let index = state.flyingCoins.length - 1; index >= 0; index -= 1) {
      const coin = state.flyingCoins[index];
      const step = TOOLS.coinThrowSpeed * dt;
      coin.travelled += step;
      const ratio = Math.min(1, coin.travelled / coin.total);
      coin.x = coin.sx + (coin.tx - coin.sx) * ratio;
      coin.y = coin.sy + (coin.ty - coin.sy) * ratio;
      if (coin.travelled >= coin.total) {
        // The coin has landed: nearby guards go to look at the noise.
        for (const guard of state.guards) {
          if (distance(guard.x, guard.y, coin.tx, coin.ty) < TOOLS.coinHearRadius
            && guard.state !== 'chase') {
            guard.state = 'investigate';
            guard.investigateTarget = { x: coin.tx, y: coin.ty };
            guard.lookTimer = 0;
          }
        }
        state.flyingCoins.splice(index, 1);
      }
    }
  }

  function updateLootAndExit(events) {
    for (const item of state.loot) {
      if (item.taken) continue;
      if (distance(state.thief.x, state.thief.y, item.x, item.y) < THIEF.grabRadius) {
        item.taken = true;
        state.lootTaken += 1;
        state.score += item.value;
        events.value |= EVENT_PICKUP;
      }
    }
    const exit = EXIT;
    const insideExit = state.thief.x > exit.x - 6
      && state.thief.x < exit.x + exit.width + 6
      && state.thief.y > exit.y - 10
      && state.thief.y < exit.y + exit.height + 6;
    if (insideExit) {
      if (state.lootTaken === LOOT.length) {
        state.status = 'escaped';
        state.score += Math.round(state.timeLeft) * 5
          + state.smokeLeft * 150 + state.coinsLeft * 50;
        events.value |= EVENT_ESCAPED;
      } else if (state.hintTimer <= 0) {
        state.hint = 'locked';
        state.hintTimer = 2.5;
      }
    }
  }

  /**
   * Advance the world one fixed step. `input` carries steering, running, the actions
   * taken this frame and an optional coin target. Returns the events of this step.
   */
  function step(dt, input) {    const events = { value: 0 };
    if (state.status !== 'playing') return events.value;
    state.time += dt;
    state.timeLeft -= dt;
    if (state.timeLeft <= 0) {
      state.timeLeft = 0;
      state.status = 'caught';
      state.caughtReason = 'time';
      return EVENT_CAUGHT;
    }
    if (state.hintTimer > 0) {
      state.hintTimer -= dt;
      if (state.hintTimer <= 0) state.hint = null;
    }
    updateThief(dt, input);
    updateTools(dt, input, events);
    updateGuards(dt, events);
    if (state.status !== 'playing') return events.value;
    updateCameras(dt);
    updateAlarm(dt, events);
    if (state.status !== 'playing') return events.value;
    updateLootAndExit(events);
    return events.value;
  }

  /** True when a point is visible to any guard or camera right now (cones and sight lines). */
  function pointSeenBy(x, y) {
    const saved = { x: state.thief.x, y: state.thief.y };
    state.thief.x = x;
    state.thief.y = y;
    let seen = false;
    for (const guard of state.guards) {
      if (canSeeThief(guard.x, guard.y, guard.angle, GUARD.viewRange, GUARD.viewHalfAngle)) {
        seen = true;
        break;
      }
    }
    if (!seen) {
      for (const camera of state.cameras) {
        if (canSeeThief(camera.x, camera.y, camera.angle, CAMERA.viewRange, CAMERA.viewHalfAngle)) {
          seen = true;
          break;
        }
      }
    }
    state.thief.x = saved.x;
    state.thief.y = saved.y;
    return seen;
  }

  /** True when a circle of `radius` at (x, y) would overlap a wall or a piece of cover. */
  function pointBlocked(x, y, radius) {
    if (x < BOUND + radius || x > FIELD.width - BOUND - radius
      || y < BOUND + radius || y > FIELD.height - BOUND - radius) return true;
    for (const rect of solids) {
      const nearestX = clamp(x, rect.x, rect.x + rect.w);
      const nearestY = clamp(y, rect.y, rect.y + rect.h);
      if (distance(x, y, nearestX, nearestY) < radius) return true;
    }
    return false;
  }

  reset();
  return { state, step, reset, STEP, pointSeenBy, pointBlocked };
}
