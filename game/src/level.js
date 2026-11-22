// The gallery's fixed layout: walls, display cases and pillars the thief hides behind,
// the guards' patrol routes, the cameras and where the treasures sit. Every rectangle
// blocks both movement and sight, so a case is cover in both senses.
import { EXIT, LOOT, SPAWN } from './config.js';

/** Rebuilt below so the vault wall reads as one intent: three segments, two doors. */
export const VAULT_WALL = [
  { x: 440, y: 240, w: 60, h: 24 }, // west of the west door (door: x 500-570)
  { x: 570, y: 240, w: 140, h: 24 }, // between the doors (east door: x 710-780)
  { x: 780, y: 240, w: 60, h: 24 }, // east of the east door
];

/** Display cases, pillars and pedestals: solid cover the thief and the guards' sight stop at. */
export const COVER = [
  // Main gallery, upper row of display cases.
  { x: 300, y: 330, w: 120, h: 56, kind: 'case' },
  { x: 580, y: 330, w: 120, h: 56, kind: 'case' },
  { x: 860, y: 330, w: 120, h: 56, kind: 'case' },
  // Main gallery, lower row of display cases.
  { x: 180, y: 452, w: 120, h: 56, kind: 'case' },
  { x: 440, y: 452, w: 120, h: 56, kind: 'case' },
  { x: 700, y: 452, w: 120, h: 56, kind: 'case' },
  { x: 960, y: 452, w: 120, h: 56, kind: 'case' },
  // Pillars holding the gallery's roof.
  { x: 340, y: 286, w: 30, h: 30, kind: 'pillar' },
  { x: 910, y: 286, w: 30, h: 30, kind: 'pillar' },
  { x: 340, y: 528, w: 30, h: 30, kind: 'pillar' },
  { x: 910, y: 528, w: 30, h: 30, kind: 'pillar' },
  // The treasures' pedestals (the loot sits on top of these).
  { x: 170, y: 370, w: 60, h: 60, kind: 'pedestal' },
  { x: 1050, y: 370, w: 60, h: 60, kind: 'pedestal' },
  { x: 600, y: 88, w: 80, h: 56, kind: 'pedestal' },
];

/** Every solid rectangle: outer bounds are handled by clamping, the rest is listed here. */
export function solidRects() {
  return [...VAULT_WALL, ...COVER];
}

/** Guards, with their patrol loops (waypoints) and the direction they face at spawn. */
export const GUARDS = [
  {
    name: 'Rook',
    waypoints: [
      { x: 240, y: 318 },
      { x: 1040, y: 318 },
      { x: 1040, y: 500 },
      { x: 240, y: 500 },
    ],
  },
  {
    name: 'Bishop',
    waypoints: [
      { x: 130, y: 330 },
      { x: 130, y: 540 },
      { x: 420, y: 540 },
      { x: 420, y: 330 },
    ],
  },
  {
    name: 'Knight',
    waypoints: [
      { x: 860, y: 540 },
      { x: 1150, y: 540 },
      { x: 1150, y: 330 },
      { x: 860, y: 330 },
    ],
  },
];

/** Cameras, fixed to a wall, sweeping their cone back and forth around a centre angle. */
export const CAMERAS = [
  // High on the vault's west wall, sweeping the vault chamber and the west door.
  { x: 400, y: 70, angle: 1.05, sweep: 0.8, phase: 0 },
  // On the east wall, sweeping the right wing where the portrait hangs.
  { x: 1252, y: 300, angle: Math.PI, sweep: 0.7, phase: 1.6 },
];

export function buildLevel() {
  return {
    walls: VAULT_WALL,
    cover: COVER,
    solids: solidRects(),
    guards: GUARDS.map((guard) => ({
      name: guard.name,
      waypoints: guard.waypoints.map((point) => ({ ...point })),
    })),
    cameras: CAMERAS.map((camera) => ({ ...camera })),
    loot: LOOT.map((item) => ({ ...item, taken: false })),
    exit: { ...EXIT },
    spawn: { ...SPAWN },
  };
}
