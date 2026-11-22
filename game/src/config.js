// Every tuning number and colour of Velvet Vault in one place. The playfield is a fixed
// 1280x720 logical area; the renderer scales it to the window, so no rule below depends on
// the screen size.
export const FIELD = { width: 1280, height: 720 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

/** Seconds on the clock when a run starts; 0 means the lockdown catches the thief. */
export const TIME_LIMIT = 240;

export const THIEF = {
  radius: 13,
  walkSpeed: 175,
  runSpeed: 268,
  /** How far away a running thief is heard. Walking is silent. */
  runHeardRadius: 150,
  /** How close the thief must be to a treasure to pocket it. */
  grabRadius: 44,
};

export const GUARD = {
  radius: 14,
  patrolSpeed: 72,
  chaseSpeed: 158,
  investigateSpeed: 110,
  /** Vision cone: how far a guard sees, and its half-angle in radians. */
  viewRange: 205,
  viewHalfAngle: 0.58,
  /** Suspicion 0..1; 0.45 makes a guard stop and stare, 1.0 makes it give chase. */
  suspectAt: 0.45,
  chaseAt: 1.0,
  suspicionGain: 1.5,
  suspicionLoss: 0.55,
  /** Seconds a suspicious guard stares before it goes back to patrol. */
  stareSeconds: 1.1,
  /** Seconds a guard looks around a noise before returning to patrol. */
  investigateSeconds: 2.6,
  /** Touching a chasing guard ends the run. */
  catchRadius: 24,
};

export const CAMERA = {
  viewRange: 265,
  viewHalfAngle: 0.38,
  sweepSpeed: 0.55,
  /** Alarm points per second while a camera holds the thief in its cone. */
  alarmRate: 11,
};

export const ALARM = {
  /** Alarm points per second while any guard holds the thief in its cone. */
  guardSeenRate: 15,
  /** Extra alarm per second while any guard is chasing. */
  chaseRate: 7,
  /** Alarm drains this fast while nobody sees the thief. */
  decayRate: 7,
  /** Alarm at 100 trips the lockdown and ends the run. */
  max: 100,
};

export const TOOLS = {
  smokeCount: 2,
  smokeRadius: 95,
  smokeSeconds: 4.5,
  coinCount: 3,
  coinRange: 270,
  coinThrowSpeed: 520,
  /** Guards this close to where a coin lands go to look. */
  coinHearRadius: 230,
};

export const LOOT = [
  { id: 'mask', name: 'JADE MASK', value: 400, x: 200, y: 400 },
  { id: 'portrait', name: 'CRIMSON PORTRAIT', value: 500, x: 1080, y: 400 },
  { id: 'diamond', name: 'STAR DIAMOND', value: 800, x: 640, y: 118 },
];

export const EXIT = { x: 24, y: 600, width: 28, height: 96 };

export const SPAWN = { x: 1150, y: 640 };

export const PALETTE = {
  floor: '#171a26',
  floorDark: '#12141f',
  carpet: '#232838',
  carpetEdge: '#2e3550',
  wall: '#3a4157',
  wallTop: '#4a526e',
  cover: '#262c40',
  coverTop: '#39415f',
  caseGlass: '#4d6f8e',
  gold: '#f2c94c',
  goldDim: '#a8842c',
  thief: '#7ee0c3',
  thiefDark: '#2e8f76',
  guard: '#e5534b',
  guardSuit: '#5a3a3a',
  cone: 'rgba(242, 201, 76, 0.20)',
  coneHot: 'rgba(229, 83, 75, 0.30)',
  cameraCone: 'rgba(229, 83, 75, 0.16)',
  smoke: 'rgba(200, 205, 220, 0.35)',
  exit: '#58d68d',
  exitLocked: '#8b93a3',
  text: '#eef1f5',
  muted: '#9aa1b5',
  panel: 'rgba(16, 19, 30, 0.88)',
  alarmLow: '#58d68d',
  alarmMid: '#f2c94c',
  alarmHigh: '#e5534b',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the best score is kept between visits (this browser only). */
export const BEST_KEY = 'velvet-vault.best';
