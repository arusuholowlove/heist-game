// Everything the player sees: the gallery floor, walls and cover, the guards and their
// vision cones, the sweeping cameras, the glowing loot, the thief, the smoke and coins,
// and the HUD with loot, alarm, tools, timer and score. All drawing is on one canvas,
// scaled from the fixed 1280x720 field to the window.
import { ALARM, CAMERA, FIELD, FONT, GUARD, LOOT, PALETTE, THIEF, TIME_LIMIT, TOOLS } from './config.js';
import { buildLevel } from './level.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_CAUGHT = 'caught';
export const SCREEN_ESCAPED = 'escaped';

const LEVEL = buildLevel();

function roundRect(context, x, y, w, h, radius) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.lineTo(x + w - radius, y);
  context.arcTo(x + w, y, x + w, y + radius, radius);
  context.lineTo(x + w, y + h - radius);
  context.arcTo(x + w, y + h, x + w - radius, y + h, radius);
  context.lineTo(x + radius, y + h);
  context.arcTo(x, y + h, x, y + h - radius, radius);
  context.lineTo(x, y + radius);
  context.arcTo(x, y, x + radius, y, radius);
  context.closePath();
}

function drawCone(context, x, y, angle, range, halfAngle, fill, edge) {
  context.beginPath();
  context.moveTo(x, y);
  context.arc(x, y, range, angle - halfAngle, angle + halfAngle);
  context.closePath();
  context.fillStyle = fill;
  context.fill();
  context.beginPath();
  context.moveTo(x, y);
  context.lineTo(x + Math.cos(angle - halfAngle) * range, y + Math.sin(angle - halfAngle) * range);
  context.moveTo(x, y);
  context.lineTo(x + Math.cos(angle + halfAngle) * range, y + Math.sin(angle + halfAngle) * range);
  context.strokeStyle = edge;
  context.lineWidth = 1.5;
  context.stroke();
}

function formatTime(seconds) {
  const total = Math.max(0, Math.ceil(seconds));
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return `${minutes}:${String(rest).padStart(2, '0')}`;
}

export function createRenderer(canvas) {
  const context = canvas.getContext('2d');

  function resize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    context.setTransform(canvas.width / FIELD.width, 0, 0, canvas.height / FIELD.height, 0, 0);
    // Letterbox: scale by the smaller ratio and centre the field.
    const scale = Math.min(canvas.width / FIELD.width, canvas.height / FIELD.height);
    const offsetX = (canvas.width - FIELD.width * scale) / 2;
    const offsetY = (canvas.height - FIELD.height * scale) / 2;
    context.setTransform(scale, 0, 0, scale, offsetX, offsetY);
  }

  window.addEventListener('resize', resize);
  resize();

  function drawFloor() {
    context.fillStyle = PALETTE.floor;
    context.fillRect(0, 0, FIELD.width, FIELD.height);
    // Checkerboard tiles, faint enough to read as floor, not as noise.
    const tile = 64;
    context.fillStyle = PALETTE.floorDark;
    for (let row = 0; row < FIELD.height / tile; row += 1) {
      for (let col = 0; col < FIELD.width / tile; col += 1) {
        if ((row + col) % 2 === 0) context.fillRect(col * tile, row * tile, tile, tile);
      }
    }
    // The vault chamber's floor is a richer red carpet.
    context.fillStyle = '#2b1f2e';
    context.fillRect(24, 24, 1232, 216);
    context.fillStyle = PALETTE.carpet;
    context.fillRect(440, 264, 400, 60);
    context.fillStyle = PALETTE.carpetEdge;
    context.fillRect(440, 264, 400, 4);
    context.fillRect(440, 320, 400, 4);
    // Warm pools of lamplight.
    for (const [x, y] of [[200, 400], [640, 118], [1080, 400], [640, 420]]) {
      const glow = context.createRadialGradient(x, y, 10, x, y, 190);
      glow.addColorStop(0, 'rgba(242, 201, 76, 0.10)');
      glow.addColorStop(1, 'rgba(242, 201, 76, 0)');
      context.fillStyle = glow;
      context.fillRect(x - 190, y - 190, 380, 380);
    }
  }

  function drawWallsAndCover() {
    for (const rect of LEVEL.solids) {
      const isVaultWall = LEVEL.walls.includes(rect);
      context.fillStyle = isVaultWall ? PALETTE.wall : PALETTE.cover;
      context.fillRect(rect.x, rect.y, rect.w, rect.h);
      context.fillStyle = isVaultWall ? PALETTE.wallTop : PALETTE.coverTop;
      context.fillRect(rect.x, rect.y, rect.w, 5);
      if (rect.kind === 'case') {
        // A glass top catches the light.
        context.fillStyle = 'rgba(120, 170, 210, 0.22)';
        context.fillRect(rect.x + 8, rect.y + 8, rect.w - 16, rect.h - 16);
        context.strokeStyle = 'rgba(200, 220, 240, 0.35)';
        context.lineWidth = 1;
        context.strokeRect(rect.x + 8, rect.y + 8, rect.w - 16, rect.h - 16);
      }
    }
    // Outer wall frame.
    context.strokeStyle = PALETTE.wall;
    context.lineWidth = 24;
    context.strokeRect(12, 12, FIELD.width - 24, FIELD.height - 24);
    context.strokeStyle = PALETTE.wallTop;
    context.lineWidth = 3;
    context.strokeRect(24, 24, FIELD.width - 48, FIELD.height - 48);
  }

  function drawExit(state) {
    const exit = LEVEL.exit;
    const open = state.lootTaken === LOOT.length;
    context.fillStyle = open ? PALETTE.exit : PALETTE.exitLocked;
    roundRect(context, exit.x, exit.y, exit.width, exit.height, 6);
    context.fill();
    // The door's name runs down the door itself; its state sits beside it.
    context.save();
    context.translate(exit.x + exit.width / 2, exit.y + exit.height / 2);
    context.rotate(-Math.PI / 2);
    context.fillStyle = '#0c1116';
    context.font = 'bold 17px ' + FONT;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText('EXIT', 0, 1);
    context.restore();
    context.fillStyle = open ? PALETTE.exit : PALETTE.muted;
    context.font = 'bold 14px ' + FONT;
    context.textAlign = 'left';
    context.textBaseline = 'middle';
    context.fillText(open ? 'OPEN — slip out!' : 'LOCKED', exit.x + exit.width + 10, exit.y + exit.height / 2);
    if (!open) {
      context.fillStyle = PALETTE.muted;
      context.font = '13px ' + FONT;
      context.fillText(`needs ${LOOT.length - state.lootTaken} more treasure${LOOT.length - state.lootTaken > 1 ? 's' : ''}`,
        exit.x + exit.width + 10, exit.y + exit.height / 2 + 20);
    }
  }

  function drawLoot(state) {
    for (const item of state.loot) {
      if (item.taken) continue;
      const pulse = 0.75 + 0.25 * Math.sin(state.time * 3 + item.x);
      const glow = context.createRadialGradient(item.x, item.y, 4, item.x, item.y, 46);
      glow.addColorStop(0, `rgba(242, 201, 76, ${0.5 * pulse})`);
      glow.addColorStop(1, 'rgba(242, 201, 76, 0)');
      context.fillStyle = glow;
      context.fillRect(item.x - 46, item.y - 46, 92, 92);
      context.save();
      context.translate(item.x, item.y);
      context.rotate(Math.PI / 4);
      context.fillStyle = PALETTE.gold;
      const size = 13;
      context.fillRect(-size / 2, -size / 2, size, size);
      context.strokeStyle = '#fff3c4';
      context.lineWidth = 2;
      context.strokeRect(-size / 2, -size / 2, size, size);
      context.restore();
      context.fillStyle = PALETTE.gold;
      context.font = `bold 13px ${FONT}`;
      context.textAlign = 'center';
      context.textBaseline = 'alphabetic';
      context.fillText(item.name, item.x, item.y - 34);
      context.fillStyle = PALETTE.muted;
      context.font = `11px ${FONT}`;
      context.fillText(`${item.value} pts`, item.x, item.y + 46);
    }
  }

  function drawCameras(state) {
    for (const camera of state.cameras) {
      drawCone(context, camera.x, camera.y, camera.angle, CAMERA.viewRange,
        CAMERA.viewHalfAngle, PALETTE.cameraCone, 'rgba(229, 83, 75, 0.45)');
      // The camera body on its wall mount.
      context.save();
      context.translate(camera.x, camera.y);
      context.rotate(camera.angle);
      context.fillStyle = '#20242f';
      roundRect(context, -4, -7, 22, 14, 4);
      context.fill();
      context.fillStyle = PALETTE.guard;
      context.beginPath();
      context.arc(18, 0, 4, 0, Math.PI * 2);
      context.fill();
      context.restore();
      context.fillStyle = PALETTE.muted;
      context.font = `11px ${FONT}`;
      context.textAlign = 'center';
      const labelX = Math.min(1210, Math.max(50, camera.x));
      context.fillText('CAMERA', labelX, camera.y + 26);
    }
  }

  function drawGuards(state) {
    for (const guard of state.guards) {
      const hot = guard.state === 'chase' || guard.state === 'stare';
      drawCone(context, guard.x, guard.y, guard.angle, GUARD.viewRange,
        GUARD.viewHalfAngle, hot ? PALETTE.coneHot : PALETTE.cone,
        hot ? 'rgba(229, 83, 75, 0.6)' : 'rgba(242, 201, 76, 0.4)');
      // Guard body: a dark suit with a red shoulder flash, facing its angle.
      context.save();
      context.translate(guard.x, guard.y);
      context.rotate(guard.angle);
      context.fillStyle = PALETTE.guardSuit;
      context.beginPath();
      context.arc(0, 0, guard.radius, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = PALETTE.guard;
      context.beginPath();
      context.arc(4, -guard.radius + 4, 4.5, 0, Math.PI * 2);
      context.fill();
      context.beginPath();
      context.arc(4, guard.radius - 4, 4.5, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = '#e8b4b0';
      context.beginPath();
      context.arc(guard.radius - 2, 0, 5, 0, Math.PI * 2);
      context.fill();
      context.restore();
      // Suspicion: a small meter over a guard that has noticed something.
      if (guard.suspicion > 0.05) {
        const width = 36;
        const x = guard.x - width / 2;
        const y = guard.y - guard.radius - 16;
        context.fillStyle = 'rgba(10, 12, 20, 0.8)';
        context.fillRect(x - 1, y - 1, width + 2, 7);
        context.fillStyle = guard.suspicion >= GUARD.chaseAt ? PALETTE.alarmHigh : PALETTE.alarmMid;
        context.fillRect(x, y, width * guard.suspicion, 5);
      }
      if (guard.state === 'chase') {
        context.fillStyle = PALETTE.alarmHigh;
        context.font = `bold 13px ${FONT}`;
        context.textAlign = 'center';
        context.fillText('!', guard.x, guard.y - guard.radius - 22);
      }
    }
  }

  function drawThief(state) {
    const thief = state.thief;
    // A soft shadow, then the hooded figure: teal cloak, darker hood, facing the move.
    context.fillStyle = 'rgba(0, 0, 0, 0.35)';
    context.beginPath();
    context.ellipse(thief.x + 2, thief.y + 4, 14, 9, 0, 0, Math.PI * 2);
    context.fill();
    context.save();
    context.translate(thief.x, thief.y);
    context.rotate(thief.angle);
    context.fillStyle = PALETTE.thief;
    context.beginPath();
    context.arc(0, 0, thief.radius, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = PALETTE.thiefDark;
    context.beginPath();
    context.arc(3, 0, thief.radius - 4, -1.1, 1.1);
    context.closePath();
    context.fill();
    context.fillStyle = '#0c1116';
    context.beginPath();
    context.arc(thief.radius - 3, 0, 3.5, 0, Math.PI * 2);
    context.fill();
    context.restore();
    if (thief.running) {
      context.strokeStyle = 'rgba(238, 241, 245, 0.5)';
      context.lineWidth = 1.5;
      context.beginPath();
      context.arc(thief.x, thief.y, THIEF.runHeardRadius, 0, Math.PI * 2);
      context.setLineDash([4, 8]);
      context.stroke();
      context.setLineDash([]);
    }
  }

  function drawTools(state) {
    for (const cloud of state.clouds) {
      const alpha = Math.min(1, cloud.ttl / 1.2);
      const gradient = context.createRadialGradient(cloud.x, cloud.y, 8, cloud.x, cloud.y, cloud.radius);
      gradient.addColorStop(0, `rgba(205, 210, 225, ${0.5 * alpha})`);
      gradient.addColorStop(1, `rgba(205, 210, 225, ${0.08 * alpha})`);
      context.fillStyle = gradient;
      context.beginPath();
      context.arc(cloud.x, cloud.y, cloud.radius, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = `rgba(238, 241, 245, ${0.8 * alpha})`;
      context.font = `bold 12px ${FONT}`;
      context.textAlign = 'center';
      context.fillText('SMOKE', cloud.x, cloud.y + 4);
    }
    for (const coin of state.flyingCoins) {
      context.fillStyle = PALETTE.gold;
      context.beginPath();
      context.arc(coin.x, coin.y, 5, 0, Math.PI * 2);
      context.fill();
      context.strokeStyle = '#fff3c4';
      context.lineWidth = 1.5;
      context.stroke();
    }
  }

  function drawHud(state) {
    // Top bar: loot, alarm, timer and score.
    context.fillStyle = PALETTE.panel;
    roundRect(context, 16, 12, FIELD.width - 32, 46, 8);
    context.fill();
    context.textBaseline = 'middle';
    context.textAlign = 'left';
    context.fillStyle = PALETTE.text;
    context.font = `bold 17px ${FONT}`;
    let lootText = 'LOOT ';
    for (let index = 0; index < LOOT.length; index += 1) {
      lootText += index < state.lootTaken ? '◆ ' : '◇ ';
    }
    lootText += `${state.lootTaken}/${LOOT.length}`;
    context.fillText(lootText, 32, 36);
    // Alarm meter in the middle.
    const alarmX = 330;
    const alarmWidth = 380;
    context.fillStyle = PALETTE.muted;
    context.font = `bold 13px ${FONT}`;
    context.fillText('ALARM', alarmX, 24);
    context.fillStyle = '#0c1116';
    roundRect(context, alarmX, 32, alarmWidth, 12, 6);
    context.fill();
    const alarmColour = state.alarm < 40 ? PALETTE.alarmLow
      : state.alarm < 70 ? PALETTE.alarmMid : PALETTE.alarmHigh;
    context.fillStyle = alarmColour;
    if (state.alarm > 0) {
      roundRect(context, alarmX, 32, Math.max(12, alarmWidth * (state.alarm / ALARM.max)), 12, 6);
      context.fill();
    }
    context.fillStyle = PALETTE.text;
    context.font = `bold 13px ${FONT}`;
    context.fillText(`${Math.round(state.alarm)}%`, alarmX + alarmWidth + 10, 38);
    // Timer and score on the right.
    const timeColour = state.timeLeft < 30 ? PALETTE.alarmHigh : PALETTE.text;
    context.fillStyle = timeColour;
    context.font = `bold 20px ${FONT}`;
    context.textAlign = 'right';
    context.fillText(`TIME ${formatTime(state.timeLeft)}`, FIELD.width - 240, 36);
    context.fillStyle = PALETTE.text;
    context.fillText(`SCORE ${state.score}`, FIELD.width - 32, 36);
    // Bottom bar: the tools and the controls.
    context.fillStyle = PALETTE.panel;
    roundRect(context, 16, FIELD.height - 44, FIELD.width - 32, 30, 8);
    context.fill();
    context.fillStyle = PALETTE.text;
    context.font = `15px ${FONT}`;
    context.textAlign = 'left';
    context.fillText(`Q  SMOKE ×${state.smokeLeft}      CLICK  COIN ×${state.coinsLeft}      SHIFT  RUN (loud)      P  PAUSE      M  MUTE`,
      32, FIELD.height - 28);
    // A locked-exit hint floats beside the door.
    if (state.hint === 'locked') {
      context.fillStyle = PALETTE.gold;
      context.font = `bold 16px ${FONT}`;
      context.textAlign = 'left';
      context.fillText('LOCKED — steal every treasure first!', LEVEL.exit.x + LEVEL.exit.width + 10, LEVEL.exit.y - 16);
    }
  }

  function drawOverlay(title, lines, accent) {
    context.fillStyle = 'rgba(8, 10, 18, 0.72)';
    context.fillRect(0, 0, FIELD.width, FIELD.height);
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillStyle = accent;
    context.font = `bold 64px ${FONT}`;
    context.fillText(title, FIELD.width / 2, 210);
    context.fillStyle = PALETTE.text;
    context.font = `20px ${FONT}`;
    lines.forEach((line, index) => {
      context.fillText(line, FIELD.width / 2, 300 + index * 34);
    });
  }

  function draw(state, screen, best) {
    resize();
    context.fillStyle = '#05060a';
    context.fillRect(-100, -100, FIELD.width + 200, FIELD.height + 200);
    drawFloor();
    drawWallsAndCover();
    drawExit(state);
    drawLoot(state);
    drawCameras(state);
    drawGuards(state);
    drawThief(state);
    drawTools(state);
    drawHud(state);

    if (screen === SCREEN_TITLE) {
      drawOverlay('VELVET VAULT', [
        'A midnight heist in the Marlow Gallery. Steal the Jade Mask,',
        'the Crimson Portrait and the Star Diamond — then slip out the',
        'service door before the alarm hits 100% or dawn breaks.',
        '',
        'WASD / arrows — move      SHIFT — run (loud, guards hear it)',
        'Q — smoke bomb (×2)      CLICK — throw a coin to distract a guard',
        'Hide behind cases and pillars: cones cannot see through them.',
        '',
        'Press SPACE to begin',
        best > 0 ? `Best getaway so far: ${best} pts` : '',
      ], PALETTE.gold);
    } else if (screen === SCREEN_PAUSED) {
      drawOverlay('PAUSED', ['Take a breath. The guards keep their routes.', '', 'Press P to keep stealing'], PALETTE.text);
    } else if (screen === SCREEN_CAUGHT) {
      const reason = state.caughtReason === 'lockdown'
        ? 'The alarm hit 100% — the vault sealed itself.'
        : state.caughtReason === 'time'
          ? 'Dawn broke over the gallery. The crew left without you.'
          : 'A guard laid hands on you in the dark.';
      drawOverlay('CAUGHT!', [reason, '', `Score: ${state.score} pts    Best: ${best} pts`, '', 'Press SPACE to try again'], PALETTE.alarmHigh);
    } else if (screen === SCREEN_ESCAPED) {
      const timeBonus = Math.round(state.timeLeft) * 5;
      const toolBonus = state.smokeLeft * 150 + state.coinsLeft * 50;
      drawOverlay('CLEAN GETAWAY!', [
        'Every treasure is yours and the service door closed behind you.',
        '',
        `Loot ${state.score - timeBonus - toolBonus} pts   ·   Time bonus ${timeBonus} pts   ·   Unused tools ${toolBonus} pts`,
        `Total score: ${state.score} pts    Best: ${best} pts`,
        '',
        'Press SPACE to run it again',
      ], PALETTE.exit);
    }
  }

  return { draw };
}
