// World state + entity shapes + city layout for the open-world sandbox (v1).
// GTA-2-style: a small city you walk and drive around, with hostiles to fight.
// No fog / stealth — full visibility around the camera. Pure data, no rendering.

import type { Rect, Vec2 } from './math';
import { norm, sub, v } from './math';
import { VEHICLES, type VehicleKind } from './vehicles';
import type { Weapon } from './weapon';
import {
  ENEMY_RIFLE,
  ENEMY_SHOTGUN,
  ENEMY_SMG,
  ENEMY_SNIPER,
  KNIFE,
  PISTOL,
  RIFLE,
  SHOTGUN,
  SNIPER,
} from './weapon';

export type Team = 'player' | 'enemy';
export type EnemyType = 'gunman' | 'smg' | 'brute' | 'marksman';

export interface Loadout {
  primary: Weapon;
  secondary: Weapon;
}

export interface Player {
  pos: Vec2;
  vel: Vec2;
  radius: number;
  aim: number;
  hp: number;
  maxHp: number;
  weapon: Weapon;
  ammo: number;
  slots: Weapon[];
  slotAmmo: number[];
  slot: number;
  reloading: boolean;
  reloadTimer: number;
  fireTimer: number;
  spread: number;
  aimKick: number;
  muzzleTimer: number;
  swing: number;
  flash: number;
  downed: boolean;
  inCar: number; // index into world.cars, or -1 on foot
  walkTo: number; // car index the player is auto-walking to enter, or -1
  enterTimer: number; // debounce for enter/exit
  dive: number; // >0 = tumbling after bailing from a moving car (seconds left)
  roll: number; // accumulated tumble rotation for the dive visual
}

export interface Enemy {
  pos: Vec2;
  vel: Vec2;
  radius: number;
  aim: number;
  hp: number;
  maxHp: number;
  alive: boolean;
  etype: EnemyType;
  weapon: Weapon;
  aggro: number; // >0 = hunting the player (seconds left)
  fireTimer: number;
  telegraph: number;
  burstLeft: number;
  ammo: number;
  reloadTimer: number;
  reloading: boolean;
  spread: number;
  muzzleTimer: number;
  flash: number;
  home: Vec2;
  wanderTimer: number;
  wanderTarget: Vec2;
  speed: number;
  rangeMin: number;
  rangeMax: number;
  telegraphTime: number;
  rush: boolean;
}

export interface Car {
  pos: Vec2;
  angle: number; // heading, radians
  speed: number; // signed along heading
  rpm: number; // engine revs
  gear: number; // -1 = reverse, 0-based forward gears
  shiftTimer: number; // gearbox shift lockout
  vel: Vec2;
  w: number;
  h: number;
  radius: number; // collision circle
  color: string;
  kind: VehicleKind;
  hp: number;
  maxHp: number;
  dead: boolean; // destroyed: a burnt wreck, no longer drivable
  pop: number; // 1 at the moment of explosion, decays: lifts/enlarges the sprite
  wreckFire: number; // seconds a fresh wreck keeps actively burning before it smoulders
  smoke: number; // countdown to the next damage smoke/fire puff
  bloodyTires: number; // seconds left of leaving red tyre tracks after a run-over
  gore: GoreDecal[]; // blood splats on the car, in its own frame (+x = front)
  occupant: 'none' | 'player';
}

// A blood splat fixed to the car body, positioned in the car's local frame
// (x forward, y right, both in world px from centre) so it rotates with it.
export interface GoreDecal {
  x: number;
  y: number;
  r: number;
}

export interface Tracer {
  a: Vec2;
  b: Vec2;
  life: number;
  maxLife: number;
  team: Team;
}

export type ParticleKind = 'spark' | 'blood' | 'casing' | 'smoke' | 'fire';

export interface Particle {
  pos: Vec2;
  vel: Vec2;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  drag: number;
  kind: ParticleKind;
  angle: number;
  spin: number;
}

export interface Muzzle {
  pos: Vec2;
  angle: number;
  life: number;
  size: number;
}

export interface Slash {
  pos: Vec2;
  angle: number;
  arc: number;
  reach: number;
  life: number;
  maxLife: number;
}

export interface Decal {
  pos: Vec2;
  r: number;
  color: string;
}

export interface Skid {
  a: Vec2;
  b: Vec2;
  life: number;
  blood?: boolean; // red tyre track laid down just after a run-over
}

export interface Seg {
  a: Vec2;
  b: Vec2;
}

// A racing circuit built as a spline ribbon: outer + inner boundary loops (the
// paved surface between them), guardrail wall segments to collide with (with a
// pit gap left open), and a start/finish line across the track. `bbox` is a
// broad-phase gate so movers only test the walls when they're near the circuit.
export interface Track {
  outer: Vec2[];
  inner: Vec2[];
  walls: Seg[];
  wallHalf: number;
  start: Seg;
  bbox: Rect;
}

// A neutral city-dweller: wanders until something dangerous is near, then bolts
// away from it. Never fights; can still be caught in the crossfire.
export interface Civilian {
  pos: Vec2;
  vel: Vec2;
  radius: number;
  aim: number; // travel / facing direction
  hp: number;
  maxHp: number;
  alive: boolean;
  color: string; // clothing tint
  panic: number; // >0 = fleeing (seconds left)
  fleeFrom: Vec2; // point to sprint away from while panicking
  wanderTimer: number;
  wanderTarget: Vec2;
  home: Vec2;
  speed: number;
  flash: number;
}

// A weapon lying on the ground; walk over it to equip that weapon.
export interface Pickup {
  pos: Vec2;
  weapon: Weapon;
  radius: number;
  bob: number; // phase for the idle float animation
}

export interface World {
  bounds: Rect;
  buildings: Rect[]; // city blocks (drawn as buildings)
  barriers: Rect[]; // track guardrails (drawn as barriers)
  solids: Rect[]; // buildings + barriers — everything that collides / blocks bullets
  player: Player;
  enemies: Enemy[];
  civilians: Civilian[];
  cars: Car[];
  pickups: Pickup[];
  tracers: Tracer[];
  particles: Particle[];
  muzzles: Muzzle[];
  slashes: Slash[];
  decals: Decal[];
  skids: Skid[];
  track: Track | null;
  shake: number;
  hitstop: number;
  time: number;
  state: 'playing' | 'dead';
  stateTimer: number;
}

function makePlayer(pos: Vec2, loadout: Loadout): Player {
  const weapon = loadout.primary;
  return {
    pos,
    vel: v(),
    radius: 12,
    aim: 0,
    hp: 100,
    maxHp: 100,
    weapon,
    ammo: weapon.mag,
    slots: [loadout.primary, loadout.secondary],
    slotAmmo: [loadout.primary.mag, loadout.secondary.mag],
    slot: 0,
    reloading: false,
    reloadTimer: 0,
    fireTimer: 0,
    spread: weapon.spreadMin,
    aimKick: 0,
    muzzleTimer: 0,
    swing: 0,
    flash: 0,
    downed: false,
    inCar: -1,
    walkTo: -1,
    enterTimer: 0,
    dive: 0,
    roll: 0,
  };
}

interface Profile {
  weapon: Weapon;
  hp: number;
  speed: number;
  rangeMin: number;
  rangeMax: number;
  telegraphTime: number;
  rush: boolean;
}

const PROFILES: Record<EnemyType, Profile> = {
  gunman: { weapon: ENEMY_RIFLE, hp: 55, speed: 118, rangeMin: 200, rangeMax: 440, telegraphTime: 0.42, rush: false },
  smg: { weapon: ENEMY_SMG, hp: 45, speed: 150, rangeMin: 160, rangeMax: 360, telegraphTime: 0.32, rush: false },
  brute: { weapon: ENEMY_SHOTGUN, hp: 80, speed: 165, rangeMin: 70, rangeMax: 220, telegraphTime: 0.24, rush: true },
  marksman: { weapon: ENEMY_SNIPER, hp: 40, speed: 100, rangeMin: 420, rangeMax: 720, telegraphTime: 0.85, rush: false },
};

function makeEnemy(pos: Vec2, etype: EnemyType): Enemy {
  const p = PROFILES[etype];
  return {
    pos: { x: pos.x, y: pos.y },
    vel: v(),
    radius: etype === 'brute' ? 13 : 12,
    aim: Math.random() * Math.PI * 2,
    hp: p.hp,
    maxHp: p.hp,
    alive: true,
    etype,
    weapon: p.weapon,
    aggro: 0,
    fireTimer: 0,
    telegraph: 0,
    burstLeft: 0,
    ammo: p.weapon.mag,
    reloadTimer: 0,
    reloading: false,
    spread: p.weapon.spreadMin,
    muzzleTimer: 0,
    flash: 0,
    home: { x: pos.x, y: pos.y },
    wanderTimer: 0,
    wanderTarget: { x: pos.x, y: pos.y },
    speed: p.speed,
    rangeMin: p.rangeMin,
    rangeMax: p.rangeMax,
    telegraphTime: p.telegraphTime,
    rush: p.rush,
  };
}

function makeCar(pos: Vec2, angle: number, color: string, kind: VehicleKind = 'sedan'): Car {
  const spec = VEHICLES[kind];
  return {
    pos: { x: pos.x, y: pos.y },
    angle,
    speed: 0,
    rpm: spec.handling.drivetrain.idleRpm,
    gear: 0,
    shiftTimer: 0,
    vel: v(),
    w: spec.w,
    h: spec.h,
    radius: spec.radius,
    color,
    kind,
    hp: spec.maxHp,
    maxHp: spec.maxHp,
    dead: false,
    pop: 0,
    wreckFire: 0,
    smoke: 0,
    bloodyTires: 0,
    gore: [],
    occupant: 'none',
  };
}

const CIVILIAN_COLORS = ['#5b7fa6', '#a6795b', '#6fa65b', '#a65b8f', '#c9c07a', '#7a8a99', '#b0684f', '#4f9b8f'];

function makeCivilian(pos: Vec2, color: string): Civilian {
  return {
    pos: { x: pos.x, y: pos.y },
    vel: v(),
    radius: 11,
    aim: Math.random() * Math.PI * 2,
    hp: 30,
    maxHp: 30,
    alive: true,
    color,
    panic: 0,
    fleeFrom: { x: pos.x, y: pos.y },
    wanderTimer: 0,
    wanderTarget: { x: pos.x, y: pos.y },
    home: { x: pos.x, y: pos.y },
    speed: 98,
    flash: 0,
  };
}

function makePickup(pos: Vec2, weapon: Weapon): Pickup {
  return { pos: { x: pos.x, y: pos.y }, weapon, radius: 22, bob: Math.random() * Math.PI * 2 };
}

// Sample a smooth closed Catmull-Rom spline through the control points.
function sampleClosedSpline(pts: Vec2[], perSeg: number): Vec2[] {
  const n = pts.length;
  const out: Vec2[] = [];
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const p3 = pts[(i + 2) % n];
    for (let s = 0; s < perSeg; s++) {
      const t = s / perSeg;
      const t2 = t * t;
      const t3 = t2 * t;
      out.push({
        x: 0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
        y: 0.5 * (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
      });
    }
  }
  return out;
}

// Offset a closed centreline to its outer + inner boundary loops. Outward is
// decided per-point against the loop centroid, which is robust for the gentle
// convex-ish shapes used here.
function offsetLoops(center: Vec2[], half: number): { outer: Vec2[]; inner: Vec2[] } {
  const n = center.length;
  let cx = 0;
  let cy = 0;
  for (const p of center) {
    cx += p.x;
    cy += p.y;
  }
  cx /= n;
  cy /= n;
  const outer: Vec2[] = [];
  const inner: Vec2[] = [];
  for (let i = 0; i < n; i++) {
    const prev = center[(i - 1 + n) % n];
    const next = center[(i + 1) % n];
    const tan = norm({ x: next.x - prev.x, y: next.y - prev.y });
    let nx = -tan.y;
    let ny = tan.x;
    if ((center[i].x - cx) * nx + (center[i].y - cy) * ny < 0) {
      nx = -nx;
      ny = -ny;
    }
    outer.push({ x: center[i].x + nx * half, y: center[i].y + ny * half });
    inner.push({ x: center[i].x - nx * half, y: center[i].y - ny * half });
  }
  return { outer, inner };
}

// Build the racing circuit: a big smooth loop (fat on the left, tapering to a
// tail on the right, with a gentle top wave) roughly tracing the reference
// sketch. Returns the track plus where to spawn the player (just outside the pit)
// and where to sit the race car (on the start line).
function buildCircuit(): { track: Track; spawn: Vec2; car: { pos: Vec2; angle: number } } {
  const control: Vec2[] = [
    v(280, 3350), v(400, 2720), v(820, 2500), v(1250, 2760), v(1700, 2620),
    v(2080, 2980), v(2280, 3350), v(2080, 3720), v(1550, 3980), v(950, 4080), v(480, 3900),
  ];
  const center = sampleClosedSpline(control, 12);
  const N = center.length;
  const half = 155; // track half-width
  const wallHalf = 16;
  const { outer, inner } = offsetLoops(center, half);
  // pit gap centred on the rightmost point, so it faces the open spawn corridor
  let gi = 0;
  for (let i = 1; i < N; i++) if (center[i].x > center[gi].x) gi = i;
  const gapSpan = 4;
  const walls: Seg[] = [];
  for (let i = 0; i < N; i++) {
    const j = (i + 1) % N;
    const dist = Math.min((i - gi + N) % N, (gi - i + N) % N);
    if (dist > gapSpan) walls.push({ a: outer[i], b: outer[j] }); // outer ring minus the gap
    walls.push({ a: inner[i], b: inner[j] }); // infield fully enclosed
  }
  const start: Seg = { a: { x: inner[gi].x, y: inner[gi].y }, b: { x: outer[gi].x, y: outer[gi].y } };
  let minx = Infinity;
  let miny = Infinity;
  let maxx = -Infinity;
  let maxy = -Infinity;
  for (const p of outer) {
    minx = Math.min(minx, p.x);
    miny = Math.min(miny, p.y);
    maxx = Math.max(maxx, p.x);
    maxy = Math.max(maxy, p.y);
  }
  const bbox: Rect = { x: minx, y: miny, w: maxx - minx, h: maxy - miny };
  const outward = norm(sub(outer[gi], center[gi]));
  const tan = norm(sub(center[(gi + 1) % N], center[gi]));
  const spawn = v(center[gi].x + outward.x * (half + 150), center[gi].y + outward.y * (half + 150));
  const car = { pos: v(center[gi].x, center[gi].y), angle: Math.atan2(tan.y, tan.x) };
  return { track: { outer, inner, walls, wallHalf, start, bbox }, spawn, car };
}

// A four-district sandbox map:
//   top-left     — a walled battle arena packed with hostiles (combat testing),
//   top-right    — a city grid with roads, parked cars and fleeing civilians,
//   bottom-right — a testing lot: one of every vehicle + a rack of weapon pickups,
//   bottom-left  — a racing circuit (guardrails, infield, start line, race car).
// The player spawns in the open bottom-centre between them. No fog / stealth.
export function buildWorld(loadout: Loadout): World {
  const bounds: Rect = { x: 0, y: 0, w: 5000, h: 4400 };
  const buildings: Rect[] = []; // gray blocks: city, arena cover, infield
  const barriers: Rect[] = []; // striped walls: arena perimeter, guardrails
  const cars: Car[] = [];
  const enemySpots: [number, number, EnemyType][] = [];
  const civSpots: Vec2[] = [];

  // ---------- Battle arena (top-left) ----------
  const AW = 34;
  barriers.push(
    { x: 160, y: 160, w: 1880, h: AW }, // top
    { x: 160, y: 160, w: AW, h: 1620 }, // left
    { x: 2006, y: 160, w: AW, h: 1620 }, // right
    { x: 160, y: 1746, w: 760, h: AW }, // bottom-left (entrance gap x920..1280)
    { x: 1280, y: 1746, w: 760, h: AW }, // bottom-right
  );
  buildings.push(
    { x: 520, y: 640, w: 200, h: 70 }, // cover blocks to break sight-lines
    { x: 1300, y: 560, w: 70, h: 240 },
    { x: 820, y: 1090, w: 260, h: 70 },
    { x: 1520, y: 1150, w: 70, h: 260 },
  );
  enemySpots.push(
    [520, 380, 'gunman'], [900, 360, 'smg'], [1320, 360, 'brute'], [1720, 420, 'marksman'],
    [700, 920, 'gunman'], [1520, 780, 'smg'], [1080, 1320, 'brute'], [1760, 1320, 'gunman'],
  );

  // ---------- City (top-right) ----------
  const cbw = 360;
  const cityCols = [2520, 3080, 3640, 4200];
  const cityRows = [220, 780, 1340];
  const plaza = '3080,780'; // one cleared block, a little square
  for (const cx of cityCols)
    for (const cy of cityRows)
      if (`${cx},${cy}` !== plaza) buildings.push({ x: cx, y: cy, w: cbw, h: cbw });
  // road-intersection coords (always clear of blocks) for the crowd + traffic
  const gapX = [2980, 3540, 4100, 4680];
  const gapY = [680, 1240, 1900];
  for (const gx of gapX) for (const gy of gapY) civSpots.push(v(gx, gy));
  civSpots.push(v(3260, 900), v(3320, 1000), v(3180, 1050), v(3380, 860)); // loiterers in the plaza
  cars.push(makeCar(v(2980, 680), 0, '#d8c14a', 'taxi'), makeCar(v(4100, 1240), Math.PI / 2, '#4f7dc9', 'sedan'));
  enemySpots.push([3560, 700, 'smg'], [4680, 1260, 'gunman'], [3520, 1920, 'brute']);

  // ---------- Testing lot (bottom-right) ----------
  const fleet: VehicleKind[] = [
    'sedan', 'coupe', 'hatchback', 'musclecar', 'sport', 'supercar', 'luxury', 'wagon',
    'suv', 'minivan', 'van', 'pickup', 'jeep', 'civic', 'micro', 'camper', 'limo',
    'taxi', 'police', 'ambulance', 'bus', 'boxtruck', 'mediumtruck',
  ];
  const palette = ['#c94f4f', '#4f7dc9', '#d8c14a', '#5bb573', '#9b6fc9', '#d68a3c', '#4fb0c9', '#b5b55b', '#cfcfd6', '#3a3a42'];
  const lotCols = [2800, 3140, 3480, 3820, 4160, 4500];
  const lotRows = [2760, 3140, 3520, 3900];
  let fi = 0;
  for (const ry of lotRows)
    for (const cx of lotCols) {
      if (fi >= fleet.length) break;
      cars.push(makeCar(v(cx, ry), (fi % 2) * (Math.PI / 2), palette[fi % palette.length], fleet[fi]));
      fi++;
    }
  // a rack with one of every weapon, laid out in a row along the top of the lot
  const rack: Weapon[] = [PISTOL, RIFLE, SHOTGUN, SNIPER, KNIFE];
  const pickups: Pickup[] = rack.map((wpn, i) => makePickup(v(2760 + i * 210, 2520), wpn));
  // target dummies at the far side for weapon testing
  enemySpots.push([4600, 2900, 'gunman'], [4600, 3300, 'brute'], [4300, 3720, 'smg'], [4650, 3720, 'marksman']);

  // ---------- Racing circuit (bottom-left) — a big smooth spline ribbon ----------
  const circuit = buildCircuit();
  const track = circuit.track;
  cars.push(makeCar(circuit.car.pos, circuit.car.angle, '#c94f4f', 'sport')); // race car on the start line

  // ---------- Spawn (just outside the circuit's pit) ----------
  const spawn = circuit.spawn;
  const player = makePlayer({ x: spawn.x, y: spawn.y }, loadout);
  cars.push(makeCar(v(spawn.x + 70, spawn.y + 190), 0, '#5bb573', 'coupe')); // a ride waiting by the spawn

  // Safety net: never place a hostile near the spawn.
  const enemies = enemySpots
    .filter(([x, y]) => Math.hypot(x - spawn.x, y - spawn.y) > 700)
    .map(([x, y, t]) => makeEnemy(v(x, y), t));
  const civilians = civSpots.map((p, i) => makeCivilian(p, CIVILIAN_COLORS[i % CIVILIAN_COLORS.length]));

  return {
    bounds,
    buildings,
    barriers,
    solids: [...buildings, ...barriers],
    player,
    enemies,
    civilians,
    cars,
    pickups,
    tracers: [],
    particles: [],
    muzzles: [],
    slashes: [],
    decals: [],
    skids: [],
    track,
    shake: 0,
    hitstop: 0,
    time: 0,
    state: 'playing',
    stateTimer: 0,
  };
}

export const DEFAULT_LOADOUT: Loadout = { primary: RIFLE, secondary: PISTOL };
