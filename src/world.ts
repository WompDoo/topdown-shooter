// World state + entity shapes + city layout for the open-world sandbox (v1).
// GTA-2-style: a small city you walk and drive around, with hostiles to fight.
// No fog / stealth — full visibility around the camera. Pure data, no rendering.

import type { Rect, Vec2 } from './math';
import { v } from './math';
import type { Weapon } from './weapon';
import {
  ENEMY_RIFLE,
  ENEMY_SHOTGUN,
  ENEMY_SMG,
  ENEMY_SNIPER,
  PISTOL,
  RIFLE,
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
  hp: number;
  occupant: 'none' | 'player';
}

export interface Tracer {
  a: Vec2;
  b: Vec2;
  life: number;
  maxLife: number;
  team: Team;
}

export type ParticleKind = 'spark' | 'blood' | 'casing' | 'smoke';

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
}

// A test racetrack: a paved area with a start/finish line. Its guardrails live
// in world.barriers; the infield is a normal barrier block.
export interface Track {
  area: Rect;
  start: Rect;
}

export interface World {
  bounds: Rect;
  buildings: Rect[]; // city blocks (drawn as buildings)
  barriers: Rect[]; // track guardrails (drawn as barriers)
  solids: Rect[]; // buildings + barriers — everything that collides / blocks bullets
  player: Player;
  enemies: Enemy[];
  cars: Car[];
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

function makeCar(pos: Vec2, angle: number, color: string): Car {
  return {
    pos: { x: pos.x, y: pos.y },
    angle,
    speed: 0,
    vel: v(),
    w: 64,
    h: 30,
    radius: 26,
    color,
    hp: 200,
    occupant: 'none',
  };
}

// A handcrafted city: a 7x5 grid of building blocks with roads between them.
// The bottom-left corner is cleared for a small oval racetrack where you spawn
// (a car on the start line); hostiles are scattered across the rest of the city,
// all kept well clear of the spawn. Cars parked on the roads. No fog / stealth.
export function buildWorld(loadout: Loadout): World {
  const bounds: Rect = { x: 0, y: 0, w: 4200, h: 3000 };
  const buildings: Rect[] = [];
  const bw = 380;
  const bh = 380;
  // Columns/rows step 560 (a 380 block + a 180 road gap).
  const cols = [140, 700, 1260, 1820, 2380, 2940, 3500];
  const rows = [140, 700, 1260, 1820, 2380];
  // Cleared cells, keyed "col,row": the bottom-left 3x2 (racetrack) + a central
  // plaza. Everything else is a city block.
  const cleared = new Set(['0,3', '1,3', '2,3', '0,4', '1,4', '2,4', '3,2']);
  for (let cx = 0; cx < cols.length; cx++) {
    for (let cy = 0; cy < rows.length; cy++) {
      if (cleared.has(`${cx},${cy}`)) continue;
      buildings.push({ x: cols[cx], y: rows[cy], w: bw, h: bh });
    }
  }

  // --- Racetrack (a bounded oval in the cleared bottom-left corner) ---
  const track: Track = { area: { x: 200, y: 1860, w: 1360, h: 840 }, start: { x: 410, y: 2436, w: 26, h: 228 } };
  const barriers: Rect[] = [
    // outer ring (thin guardrails), with a pit gap in the bottom straight
    { x: 220, y: 1880, w: 1340, h: 36 }, // top
    { x: 220, y: 1880, w: 36, h: 820 }, // left
    { x: 1524, y: 1880, w: 36, h: 820 }, // right
    { x: 220, y: 2664, w: 560, h: 36 }, // bottom-left (gap x780..1000)
    { x: 1000, y: 2664, w: 560, h: 36 }, // bottom-right
    // infield island
    { x: 660, y: 2150, w: 460, h: 280 },
  ];

  // Spawn on the bottom straight, on the start line, with a race car alongside.
  const spawn = v(474, 2550);
  const player = makePlayer({ x: spawn.x, y: spawn.y }, loadout);

  const cars: Car[] = [
    makeCar(v(590, 2550), 0, '#c94f4f'), // race car on the start line
    makeCar(v(1170, 610), Math.PI / 2, '#4f7dc9'),
    makeCar(v(610, 1170), 0, '#d8c14a'),
    makeCar(v(1730, 1730), Math.PI / 2, '#5bb573'),
    makeCar(v(2290, 610), Math.PI, '#9b6fc9'),
    makeCar(v(2850, 1170), Math.PI / 2, '#d68a3c'),
    makeCar(v(3410, 1730), 0, '#4fb0c9'),
    makeCar(v(2290, 2290), Math.PI, '#b5b55b'),
  ];

  // All on road intersections / the central plaza, i.e. open ground clear of the track.
  const spots: [number, number, EnemyType][] = [
    [1950, 1400, 'gunman'],
    [2080, 1480, 'smg'],
    [2010, 1560, 'brute'],
    [1170, 1170, 'gunman'],
    [1730, 610, 'marksman'],
    [2290, 1170, 'smg'],
    [2850, 1730, 'brute'],
    [3410, 610, 'marksman'],
    [2850, 2290, 'smg'],
    [1730, 2290, 'gunman'],
    [3410, 2290, 'brute'],
    [610, 610, 'gunman'],
    [2290, 1730, 'smg'],
    [3410, 1170, 'marksman'],
  ];
  // Safety net: never place a hostile near the spawn.
  const enemies = spots
    .filter(([x, y]) => Math.hypot(x - spawn.x, y - spawn.y) > 700)
    .map(([x, y, t]) => makeEnemy(v(x, y), t));

  return {
    bounds,
    buildings,
    barriers,
    solids: [...buildings, ...barriers],
    player,
    enemies,
    cars,
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
