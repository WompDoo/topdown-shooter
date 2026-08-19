// World state + entity shapes + city layout for the open-world sandbox (v1).
// GTA-2-style: a small city you walk and drive around, with hostiles to fight.
// No fog / stealth — full visibility around the camera. Pure data, no rendering.

import type { Rect, Vec2 } from './math';
import { v } from './math';
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

// A racing circuit: paved cells (the driveable surface) with a start/finish
// line. Its guardrails live in world.barriers; the infield is a building block.
export interface Track {
  pavement: Rect[];
  start: Rect;
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
  const lotCols = [2720, 3060, 3400, 3740, 4080, 4420];
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
  const pickups: Pickup[] = rack.map((wpn, i) => makePickup(v(2680 + i * 210, 2520), wpn));
  // target dummies at the far side for weapon testing
  enemySpots.push([4600, 2900, 'gunman'], [4600, 3300, 'brute'], [4300, 3720, 'smg'], [4650, 3720, 'marksman']);

  // ---------- Racing circuit (bottom-left) ----------
  const RW = 32;
  barriers.push(
    { x: 200, y: 2450, w: 1880, h: RW }, // top
    { x: 200, y: 2450, w: RW, h: 1780 }, // left
    { x: 2048, y: 2450, w: RW, h: 1780 }, // right
    { x: 200, y: 4198, w: 760, h: RW }, // bottom-left (pit gap x960..1320)
    { x: 1320, y: 4198, w: 760, h: RW }, // bottom-right
  );
  buildings.push(
    { x: 520, y: 2760, w: 760, h: 1180 }, // L-shaped infield: main column
    { x: 1280, y: 2760, w: 480, h: 520 }, // L-shaped infield: top arm
  );
  const track: Track = {
    pavement: [{ x: 200, y: 2450, w: 1880, h: 1780 }],
    start: { x: 640, y: 3944, w: 26, h: 254 },
  };
  cars.push(makeCar(v(820, 4066), Math.PI, '#c94f4f', 'sport')); // race car on the start line

  // ---------- Spawn (bottom-centre) ----------
  const spawn = v(2340, 4090);
  const player = makePlayer({ x: spawn.x, y: spawn.y }, loadout);
  cars.push(makeCar(v(2440, 3820), 0, '#5bb573', 'coupe')); // a ride waiting by the spawn

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
