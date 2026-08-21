// Vehicle catalogue: one entry per baked sprite atlas in /sprites. Each raw
// entry is the native atlas cell size and the tight east-facing footprint (in
// px) measured from the art; the collision box and on-screen draw size derive
// from those at a single shared scale, so every vehicle sits at consistent world
// size and the sedan keeps its original 64x30 box. Liveried types (ambulance,
// police, taxi) ship a single 'default' colour; the rest have 8 colour variants.

export type VehicleKind =
  | 'sedan'
  | 'coupe'
  | 'hatchback'
  | 'musclecar'
  | 'sport'
  | 'supercar'
  | 'luxury'
  | 'wagon'
  | 'suv'
  | 'minivan'
  | 'van'
  | 'pickup'
  | 'jeep'
  | 'civic'
  | 'micro'
  | 'camper'
  | 'limo'
  | 'taxi'
  | 'police'
  | 'ambulance'
  | 'bus'
  | 'boxtruck'
  | 'mediumtruck';

interface Raw {
  cell: number; // source cell size in the atlas (px)
  el: number; // east-facing footprint length (px)
  ew: number; // east-facing footprint width (px)
  liveried?: boolean; // single 'default' colour instead of 8 variants
}

const RAW: Record<VehicleKind, Raw> = {
  sedan: { cell: 100, el: 83, ew: 40 },
  coupe: { cell: 100, el: 85, ew: 42 },
  hatchback: { cell: 100, el: 79, ew: 40 },
  musclecar: { cell: 100, el: 83, ew: 41 },
  sport: { cell: 100, el: 81, ew: 41 },
  supercar: { cell: 100, el: 87, ew: 38 },
  luxury: { cell: 100, el: 89, ew: 43 },
  wagon: { cell: 100, el: 86, ew: 44 },
  suv: { cell: 100, el: 77, ew: 42 },
  minivan: { cell: 100, el: 82, ew: 43 },
  van: { cell: 100, el: 71, ew: 44 },
  pickup: { cell: 100, el: 85, ew: 40 },
  jeep: { cell: 100, el: 60, ew: 46 },
  civic: { cell: 100, el: 56, ew: 36 },
  micro: { cell: 100, el: 38, ew: 32 },
  camper: { cell: 140, el: 100, ew: 53 },
  limo: { cell: 140, el: 129, ew: 40 },
  taxi: { cell: 100, el: 83, ew: 40, liveried: true },
  police: { cell: 100, el: 84, ew: 42, liveried: true },
  ambulance: { cell: 140, el: 103, ew: 50, liveried: true },
  bus: { cell: 210, el: 142, ew: 63 },
  boxtruck: { cell: 140, el: 103, ew: 50 },
  mediumtruck: { cell: 140, el: 112, ew: 59 },
};

const SPRITE_TO_WORLD = 0.92; // native cell px -> on-screen px
const FOOTPRINT_TO_COLLISION = 0.771; // footprint px -> collision units (keeps sedan at 64x30)

// Handling profile: multipliers on the baseline car physics (1.0 = the sedan's
// current feel), plus a collision mass so heavier vehicles shove lighter ones.
// A simplified drivetrain: an engine torque curve fed through a gearbox. The
// distinct numbers per class are what make vehicles feel different — a peaky,
// high-revving sports engine versus a torquey, low-revving truck diesel — while
// an automatic box shifts for you (car.ts drives the model).
export interface Drivetrain {
  gears: number[]; // forward gear ratios (index 0 = 1st)
  reverse: number; // reverse ratio
  finalDrive: number;
  idleRpm: number;
  redlineRpm: number;
  peakTorque: number; // flywheel torque (force units) at peakRpm
  peakRpm: number; // rpm the torque curve peaks at
  inertia: number; // rotational/vehicle inertia for acceleration (heavier = slower to pick up)
}

export interface Handling {
  turn: number; // steering authority
  grip: number; // lateral grip (higher = corners harder before the tyres let go)
  balance: number; // 0 = stubborn understeer, 1 = tail-happy oversteer under power
  power: number; // engine torque multiplier (per-kind acceleration tuning)
  mass: number; // weight for car-to-car collisions (accel inertia is on the drivetrain)
  drivetrain: Drivetrain;
}

const HANDLING: Record<string, Handling> = {
  // balanced all-rounder: ~560 top, brisk 5-speed
  normal: {
    turn: 1,
    grip: 1,
    balance: 0.45,
    power: 1,
    mass: 1,
    drivetrain: { gears: [3.2, 2.1, 1.5, 1.15, 0.95], reverse: 3.4, finalDrive: 3.3, idleRpm: 900, redlineRpm: 6200, peakTorque: 340, peakRpm: 3800, inertia: 1.0 },
  },
  // light, revvy and quick: a tall high-revving 6-speed, ~670 top
  sports: {
    turn: 1.2,
    grip: 1.15,
    balance: 0.6,
    power: 1,
    mass: 0.9,
    drivetrain: { gears: [3.4, 2.5, 1.95, 1.55, 1.25, 1.0], reverse: 3.4, finalDrive: 3.4, idleRpm: 1000, redlineRpm: 7800, peakTorque: 320, peakRpm: 5400, inertia: 0.85 },
  },
  // tiny buzzy engine, nimble but weak; short gears, low ~450 top
  compact: {
    turn: 1.4,
    grip: 1.1,
    balance: 0.5,
    power: 1,
    mass: 0.7,
    drivetrain: { gears: [3.6, 2.2, 1.5, 1.1], reverse: 3.6, finalDrive: 4.0, idleRpm: 1000, redlineRpm: 6800, peakTorque: 160, peakRpm: 4400, inertia: 0.72 },
  },
  // low-end grunt, torquey launch, modest ~450 top
  offroad: {
    turn: 1.05,
    grip: 0.8,
    balance: 0.5,
    power: 1,
    mass: 1.3,
    drivetrain: { gears: [3.9, 2.4, 1.6, 1.1], reverse: 4.0, finalDrive: 3.7, idleRpm: 800, redlineRpm: 6300, peakTorque: 340, peakRpm: 2900, inertia: 1.4 },
  },
  // diesel truck: low-revving, a low redline and a lot of inertia — slow to build
  // speed and slow flat out (~315), but heavy enough to barge anything aside
  heavy: {
    turn: 0.6,
    grip: 0.72,
    balance: 0.35,
    power: 1,
    mass: 2.4,
    drivetrain: { gears: [4.4, 2.7, 1.8, 1.3, 1.0], reverse: 4.5, finalDrive: 4.0, idleRpm: 600, redlineRpm: 4500, peakTorque: 360, peakRpm: 2100, inertia: 3.4 },
  },
};

const CLASS_OF: Record<VehicleKind, keyof typeof HANDLING> = {
  sedan: 'normal',
  hatchback: 'normal',
  luxury: 'normal',
  wagon: 'normal',
  taxi: 'normal',
  police: 'normal',
  coupe: 'sports',
  musclecar: 'sports',
  sport: 'sports',
  supercar: 'sports',
  civic: 'compact',
  micro: 'compact',
  jeep: 'offroad',
  pickup: 'offroad',
  suv: 'offroad',
  minivan: 'heavy',
  van: 'heavy',
  camper: 'heavy',
  limo: 'heavy',
  ambulance: 'heavy',
  bus: 'heavy',
  boxtruck: 'heavy',
  mediumtruck: 'heavy',
};

export interface VehicleSpec {
  cell: number;
  draw: number; // on-screen size to blit the cell at
  w: number; // collision length (along heading)
  h: number; // collision width
  radius: number; // collision circle
  liveried: boolean;
  maxHp: number;
  handling: Handling;
}

// Per-car handling on top of the class base: grip/turn/power are multipliers,
// balance is an absolute override. This is where individual vehicles get their
// own character — a planted supercar, a tail-happy muscle car, a wallowing bus.
interface KindTweak {
  grip?: number;
  turn?: number;
  balance?: number;
  power?: number;
}
const KIND_HANDLING: Partial<Record<VehicleKind, KindTweak>> = {
  // sports
  coupe: { balance: 0.55, power: 0.95 },
  musclecar: { grip: 0.92, turn: 0.95, balance: 0.82, power: 1.18 }, // tail-happy, all engine
  sport: { grip: 1.08, turn: 1.1, balance: 0.6 },
  supercar: { grip: 1.28, turn: 1.15, balance: 0.5, power: 1.28 }, // planted + fast
  // normal
  hatchback: { turn: 1.08, power: 0.9 },
  luxury: { grip: 1.05, turn: 0.92, balance: 0.38, power: 1.05 }, // soft, planted
  wagon: { grip: 0.98, turn: 0.95 },
  taxi: { grip: 0.95, balance: 0.5, power: 0.95 },
  police: { grip: 1.1, turn: 1.05, balance: 0.5, power: 1.18 }, // interceptor
  // compact
  civic: { turn: 1.1 },
  micro: { grip: 0.9, turn: 1.22, balance: 0.55, power: 0.85 }, // tippy little thing
  // offroad
  suv: { grip: 0.85, turn: 0.95, balance: 0.45 },
  pickup: { grip: 0.82, turn: 0.92, balance: 0.55, power: 1.05 }, // light rear end
  jeep: { grip: 0.8, turn: 1.0, balance: 0.5, power: 0.95 },
  // heavy
  minivan: { grip: 0.9, turn: 0.9, balance: 0.35, power: 0.95 },
  van: { grip: 0.82, turn: 0.85, balance: 0.4 },
  camper: { grip: 0.72, turn: 0.75, balance: 0.32, power: 0.95 }, // top-heavy
  limo: { grip: 0.85, turn: 0.7, balance: 0.4 }, // long wheelbase, slow to turn in
  ambulance: { grip: 0.8, turn: 0.85, balance: 0.35, power: 1.05 },
  bus: { grip: 0.68, turn: 0.62, balance: 0.3 }, // huge, ponderous understeer
  boxtruck: { grip: 0.7, turn: 0.72, balance: 0.35, power: 1.05 },
  mediumtruck: { grip: 0.72, turn: 0.75, balance: 0.35, power: 1.1 },
};

function derive(kind: VehicleKind, r: Raw): VehicleSpec {
  const h = Math.round(r.ew * FOOTPRINT_TO_COLLISION);
  const base = HANDLING[CLASS_OF[kind]];
  const tw = KIND_HANDLING[kind] ?? {};
  const handling: Handling = {
    turn: base.turn * (tw.turn ?? 1),
    grip: base.grip * (tw.grip ?? 1),
    balance: tw.balance ?? base.balance,
    power: base.power * (tw.power ?? 1),
    mass: base.mass,
    drivetrain: base.drivetrain,
  };
  return {
    cell: r.cell,
    draw: Math.round(r.cell * SPRITE_TO_WORLD),
    w: Math.round(r.el * FOOTPRINT_TO_COLLISION),
    h,
    radius: Math.round(h * 0.85),
    liveried: r.liveried === true,
    maxHp: Math.round(600 * handling.mass), // heavier = tougher; cars are very durable
    handling,
  };
}

export const VEHICLES = Object.fromEntries(
  Object.entries(RAW).map(([k, r]) => [k, derive(k as VehicleKind, r)]),
) as Record<VehicleKind, VehicleSpec>;

export const VEHICLE_KINDS = Object.keys(RAW) as VehicleKind[];
