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
export interface Handling {
  accel: number; // engine acceleration
  top: number; // top speed
  turn: number; // steering authority
  grip: number; // lateral traction (low = slides, understeers)
  mass: number; // weight for car-to-car collisions
}

const HANDLING: Record<string, Handling> = {
  normal: { accel: 1, top: 1, turn: 1, grip: 1, mass: 1 },
  sports: { accel: 1.3, top: 1.25, turn: 1.2, grip: 1.15, mass: 0.9 },
  compact: { accel: 1.1, top: 0.85, turn: 1.4, grip: 1.1, mass: 0.7 },
  offroad: { accel: 0.9, top: 0.95, turn: 1.05, grip: 0.8, mass: 1.3 },
  heavy: { accel: 0.55, top: 0.8, turn: 0.6, grip: 0.72, mass: 2.4 },
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

function derive(kind: VehicleKind, r: Raw): VehicleSpec {
  const h = Math.round(r.ew * FOOTPRINT_TO_COLLISION);
  const handling = HANDLING[CLASS_OF[kind]];
  return {
    cell: r.cell,
    draw: Math.round(r.cell * SPRITE_TO_WORLD),
    w: Math.round(r.el * FOOTPRINT_TO_COLLISION),
    h,
    radius: Math.round(h * 0.85),
    liveried: r.liveried === true,
    maxHp: Math.round(200 * handling.mass), // heavier = tougher
    handling,
  };
}

export const VEHICLES = Object.fromEntries(
  Object.entries(RAW).map(([k, r]) => [k, derive(k as VehicleKind, r)]),
) as Record<VehicleKind, VehicleSpec>;

export const VEHICLE_KINDS = Object.keys(RAW) as VehicleKind[];
