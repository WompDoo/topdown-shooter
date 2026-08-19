// Arcade car with a proper drift model. Steering rotates the heading; the
// velocity is decomposed and recomposed in that *same* heading each tick, so the
// car's momentum is NOT rigidly rotated with it — the tail can slide out. Lateral
// grip is high (tyres bite) until you pull the Space handbrake, which lets the
// back step out for slides. Walls use a physics response (slide, don't stop
// dead); run-overs at speed are lethal. Abandoned cars coast on via updateLooseCar,
// and bailing from a moving car flings the driver into a tumbling dive.

import type { Car, World } from './world';
import type { Input } from './input';
import { VEHICLES } from './vehicles';
import { clamp, collideCircleRect, fromAngle, resolveCircleRect } from './math';
import { addHitstop, addShake, spawnBlood, spawnDeath, spawnExplosion, spawnFire, spawnSmokePuff } from './fx';
import { sfxEnemyDeath } from './audio';

const ACCEL = 640;
const REV_ACCEL = 320;
const ENGINE_DRAG = 260; // extra coast-down when off throttle
const ROLL = 0.5; // rolling resistance (always on the forward axis)
const MAX_FWD = 560;
const MAX_REV = 190;
const TURN_RATE = 3.0; // rad/s of steering authority at speed
const HB_TURN = 1.7; // extra steering authority with the handbrake pulled
const GRIP = 9.0; // lateral traction — high = tyres bite, tight cornering
const HANDBRAKE_GRIP = 1.0; // lateral traction while sliding — low = long drift
const STEER_SPEED_REF = 120; // speed for full steering authority
const SKID_MIN = 55; // lateral speed above which the tyres leave marks
const WALL_BOUNCE = 0.15; // restitution off walls (0 = dead stop, 1 = full bounce)
const WALL_SCRUB = 0.08; // tangential speed lost per wall contact (scrape friction)
const LOOSE_DRAG = 1.1; // how fast an abandoned car coasts to a stop
export const ENTER_REACH = 34;
const RUN_OVER_SPEED = 120;
const DIVE_SPEED = 150; // bail out above this and you tumble instead of stepping off
const DIVE_TIME = 0.55; // seconds of tumble
const WALL_DAMAGE_MIN = 170; // into-wall speed a hit must exceed to dent the car
const CAR_DAMAGE_MIN = 150; // closing speed a car-car bump must exceed to dent
const DAMAGE_PER_SPEED = 0.6; // hp lost per unit of speed above the threshold
const SMOKE_HP = 0.6; // start smoking below this fraction of max hp
const BURN_HP = 0.12; // catch fire below this; then burn down to the explosion
const BLOODY_TIRE_TIME = 1.4; // seconds of red tyre tracks after a run-over
const EXPLOSION_RADIUS = 150;
const EXPLOSION_ENEMY_DMG = 500;
const EXPLOSION_PLAYER_DMG = 55;
const EXPLOSION_CAR_DMG = 120;
const MAX_GORE = 6;

export function updateCar(w: World, car: Car, input: Input, dt: number): void {
  if (car.dead) return;
  const handbrake = input.isDown('Space');
  const hnd = VEHICLES[car.kind].handling;

  // throttle
  let throttle = 0;
  if (input.isDown('KeyW') || input.isDown('ArrowUp')) throttle += 1;
  if (input.isDown('KeyS') || input.isDown('ArrowDown')) throttle -= 1;

  // Steering rotates the heading only (not the velocity). Scale by speed so you
  // can't spin on the spot, invert when reversing, and sharpen with the handbrake.
  let steer = 0;
  if (input.isDown('KeyA') || input.isDown('ArrowLeft')) steer -= 1;
  if (input.isDown('KeyD') || input.isDown('ArrowRight')) steer += 1;
  const pre = fromAngle(car.angle);
  const travel = car.vel.x * pre.x + car.vel.y * pre.y;
  const speed = Math.hypot(car.vel.x, car.vel.y);
  const speedFactor = clamp(speed / STEER_SPEED_REF, 0, 1);
  const dir = travel < -1 ? -1 : 1;
  car.angle += steer * TURN_RATE * hnd.turn * (handbrake ? HB_TURN : 1) * speedFactor * dir * dt;

  // Decompose velocity onto the NEW heading (same basis for de/recompose keeps
  // the momentum in world space — the car can point one way and slide another).
  const fwd = fromAngle(car.angle);
  const right = { x: -fwd.y, y: fwd.x };
  let vFwd = car.vel.x * fwd.x + car.vel.y * fwd.y;
  let vLat = car.vel.x * right.x + car.vel.y * right.y;

  // engine + rolling resistance on the forward axis (no handbrake braking here —
  // the handbrake is for traction, not stopping)
  if (throttle > 0) vFwd += ACCEL * hnd.accel * dt;
  else if (throttle < 0) vFwd -= REV_ACCEL * hnd.accel * dt;
  else vFwd -= Math.sign(vFwd) * Math.min(Math.abs(vFwd), ENGINE_DRAG * dt);
  vFwd *= Math.max(0, 1 - ROLL * dt);
  vFwd = clamp(vFwd, -MAX_REV * hnd.top, MAX_FWD * hnd.top);

  // lateral grip: the tyres bite, or the handbrake lets the back slide
  vLat *= Math.exp(-(handbrake ? HANDBRAKE_GRIP : GRIP * hnd.grip) * dt);

  car.vel = { x: fwd.x * vFwd + right.x * vLat, y: fwd.y * vFwd + right.y * vLat };
  car.speed = vFwd;

  const prevX = car.pos.x;
  const prevY = car.pos.y;
  car.pos.x += car.vel.x * dt;
  car.pos.y += car.vel.y * dt;

  // Tyre marks while the car slides sideways.
  if (Math.abs(vLat) > SKID_MIN && speed > 60) {
    const rearX = car.pos.x - fwd.x * car.w * 0.35;
    const rearY = car.pos.y - fwd.y * car.w * 0.35;
    const ox = right.x * car.h * 0.42;
    const oy = right.y * car.h * 0.42;
    const dx = car.pos.x - prevX;
    const dy = car.pos.y - prevY;
    w.skids.push({ a: { x: rearX - ox - dx, y: rearY - oy - dy }, b: { x: rearX - ox, y: rearY - oy }, life: 8 });
    w.skids.push({ a: { x: rearX + ox - dx, y: rearY + oy - dy }, b: { x: rearX + ox, y: rearY + oy }, life: 8 });
  }

  collideCarWalls(w, car);
  carRunOver(w, car);
}

// An abandoned car keeps its momentum and coasts to a stop, still colliding with
// the world and mowing down anyone in its path.
export function updateLooseCar(w: World, car: Car, dt: number): void {
  if (car.dead) {
    car.vel.x = 0;
    car.vel.y = 0;
    car.speed = 0;
    return;
  }
  const speed = Math.hypot(car.vel.x, car.vel.y);
  if (speed < 6) {
    car.vel.x = 0;
    car.vel.y = 0;
    car.speed = 0;
    return;
  }
  const f = Math.max(0, 1 - LOOSE_DRAG * dt);
  car.vel.x *= f;
  car.vel.y *= f;
  car.pos.x += car.vel.x * dt;
  car.pos.y += car.vel.y * dt;
  collideCarWalls(w, car);
  carRunOver(w, car);
}

// Slide-along-the-wall collision response: cancel only the velocity going into a
// wall (with a slight bounce), scrub a little tangential speed, shake on impact.
function collideCarWalls(w: World, car: Car): void {
  let impact = 0;
  for (const b of w.solids) {
    const n = collideCircleRect(car.pos, car.radius, b);
    if (!n) continue;
    const vn = car.vel.x * n.x + car.vel.y * n.y; // <0 = moving into the wall
    if (vn < 0) {
      car.vel.x -= (1 + WALL_BOUNCE) * vn * n.x;
      car.vel.y -= (1 + WALL_BOUNCE) * vn * n.y;
      car.vel.x *= 1 - WALL_SCRUB;
      car.vel.y *= 1 - WALL_SCRUB;
      impact = Math.max(impact, -vn);
    }
  }
  const minX = w.bounds.x + car.radius;
  const maxX = w.bounds.x + w.bounds.w - car.radius;
  const minY = w.bounds.y + car.radius;
  const maxY = w.bounds.y + w.bounds.h - car.radius;
  if (car.pos.x < minX && car.vel.x < 0) { car.pos.x = minX; impact = Math.max(impact, -car.vel.x); car.vel.x *= -WALL_BOUNCE; }
  if (car.pos.x > maxX && car.vel.x > 0) { car.pos.x = maxX; impact = Math.max(impact, car.vel.x); car.vel.x *= -WALL_BOUNCE; }
  if (car.pos.y < minY && car.vel.y < 0) { car.pos.y = minY; impact = Math.max(impact, -car.vel.y); car.vel.y *= -WALL_BOUNCE; }
  if (car.pos.y > maxY && car.vel.y > 0) { car.pos.y = maxY; impact = Math.max(impact, car.vel.y); car.vel.y *= -WALL_BOUNCE; }

  if (impact > 40) addShake(w, Math.min(9, impact * 0.02));
  if (impact > WALL_DAMAGE_MIN) damageCar(w, car, (impact - WALL_DAMAGE_MIN) * DAMAGE_PER_SPEED);
  const fwd = fromAngle(car.angle);
  car.speed = car.vel.x * fwd.x + car.vel.y * fwd.y;
}

// A solid hit at speed is lethal (uses total speed so a sideways slide still mows
// hostiles down).
function carRunOver(w: World, car: Car): void {
  if (Math.hypot(car.vel.x, car.vel.y) <= RUN_OVER_SPEED) return;
  for (const e of w.enemies) {
    if (!e.alive) continue;
    if (Math.hypot(e.pos.x - car.pos.x, e.pos.y - car.pos.y) > car.radius + e.radius) continue;
    e.hp -= 400;
    e.aggro = 9;
    e.vel.x += car.vel.x * 0.8;
    e.vel.y += car.vel.y * 0.8;
    spawnBlood(w, e.pos, car.angle, 16);
    addShake(w, 6);
    addGore(car, e.pos);
    car.bloodyTires = BLOODY_TIRE_TIME;
    if (e.hp <= 0 && e.alive) {
      e.alive = false;
      spawnDeath(w, e.pos, car.angle);
      sfxEnemyDeath();
      addHitstop(w, 0.05);
    }
  }
}

// Stamp a blood splat onto the car where the body hit them, kept in the car's
// own frame so it stays put as the car turns. Clamped to the front half.
function addGore(car: Car, at: { x: number; y: number }): void {
  const fwd = fromAngle(car.angle);
  const relX = at.x - car.pos.x;
  const relY = at.y - car.pos.y;
  const local = clamp(relX * fwd.x + relY * fwd.y, -car.w * 0.1, car.w * 0.5);
  const lateral = clamp(relX * -fwd.y + relY * fwd.x, -car.h * 0.5, car.h * 0.5);
  car.gore.push({ x: local, y: lateral, r: 3 + Math.random() * 3 });
  if (car.gore.length > MAX_GORE) car.gore.shift();
}

// Damage + destruction. A destroyed car explodes into a burnt wreck.
export function damageCar(w: World, car: Car, amount: number): void {
  if (car.dead || amount <= 0) return;
  car.hp -= amount;
  if (car.hp <= 0) destroyCar(w, car);
}

function destroyCar(w: World, car: Car): void {
  if (car.dead) return;
  car.dead = true;
  car.hp = 0;
  car.pop = 1;
  car.vel.x *= 0.3;
  car.vel.y *= 0.3;
  if (car.occupant === 'player') exitCar(w); // fling the driver clear first
  const scale = clamp(car.radius / 26, 0.85, 1.9);
  spawnExplosion(w, car.pos, scale);
  const r = EXPLOSION_RADIUS * (0.7 + scale * 0.3);
  for (const e of w.enemies) {
    if (!e.alive) continue;
    if (Math.hypot(e.pos.x - car.pos.x, e.pos.y - car.pos.y) > r + e.radius) continue;
    e.hp -= EXPLOSION_ENEMY_DMG;
    e.aggro = 9;
    if (e.hp <= 0) {
      e.alive = false;
      spawnDeath(w, e.pos, car.angle);
      sfxEnemyDeath();
    }
  }
  const p = w.player;
  if (!p.downed) {
    const pd = Math.hypot(p.pos.x - car.pos.x, p.pos.y - car.pos.y);
    if (pd < r + p.radius) {
      p.hp -= EXPLOSION_PLAYER_DMG * (1 - pd / (r + p.radius));
      p.flash = 0.14;
      if (p.hp <= 0) {
        p.hp = 0;
        p.downed = true;
        w.state = 'dead';
        w.stateTimer = 0;
        spawnDeath(w, p.pos, car.angle);
      }
    }
  }
  // Chain: nearby cars catch the blast (they blow on their own next tick).
  for (const other of w.cars) {
    if (other === car || other.dead) continue;
    if (Math.hypot(other.pos.x - car.pos.x, other.pos.y - car.pos.y) > r + other.radius) continue;
    damageCar(w, other, EXPLOSION_CAR_DMG);
  }
}

// Per-tick cosmetic + burn state for every car: the explosion pop settling, the
// GTA-style damage smoke escalating with wreckedness, the burn-down to a blast,
// and red tyre tracks just after a run-over. Called for all cars each tick.
export function carEffects(w: World, car: Car, dt: number): void {
  if (car.pop > 0) car.pop = Math.max(0, car.pop - dt * 2.2);

  const fwd = fromAngle(car.angle);
  const nose = { x: car.pos.x + fwd.x * car.w * 0.3, y: car.pos.y + fwd.y * car.w * 0.3 };

  if (car.dead) {
    car.smoke -= dt;
    if (car.smoke <= 0) {
      car.smoke = 0.24;
      spawnSmokePuff(w, car.pos, 'black', 9 + Math.random() * 4);
    }
  } else {
    const frac = car.hp / car.maxHp;
    if (frac < BURN_HP) {
      // On fire: flames + black smoke, and burning down to the explosion.
      damageCar(w, car, car.maxHp * 0.05 * dt);
      car.smoke -= dt;
      if (car.smoke <= 0) {
        car.smoke = 0.05;
        spawnFire(w, nose);
        spawnSmokePuff(w, nose, 'black', 8 + Math.random() * 4);
      }
    } else if (frac < SMOKE_HP) {
      // Three smoke tiers before the fire.
      let interval: number;
      let shade: 'light' | 'dark';
      let size: number;
      if (frac < 0.28) {
        interval = 0.06;
        shade = 'dark';
        size = 9;
      } else if (frac < 0.44) {
        interval = 0.09;
        shade = 'light';
        size = 8;
      } else {
        interval = 0.18;
        shade = 'light';
        size = 5;
      }
      car.smoke -= dt;
      if (car.smoke <= 0) {
        car.smoke = interval;
        spawnSmokePuff(w, nose, shade, size);
      }
    }
  }

  if (car.bloodyTires > 0) {
    car.bloodyTires -= dt;
    if (Math.hypot(car.vel.x, car.vel.y) > 50) {
      const right = { x: -fwd.y, y: fwd.x };
      const rx = car.pos.x - fwd.x * car.w * 0.35;
      const ry = car.pos.y - fwd.y * car.w * 0.35;
      const ox = right.x * car.h * 0.42;
      const oy = right.y * car.h * 0.42;
      const bx = fwd.x * 7;
      const by = fwd.y * 7;
      w.skids.push({ a: { x: rx - ox - bx, y: ry - oy - by }, b: { x: rx - ox, y: ry - oy }, life: 6, blood: true });
      w.skids.push({ a: { x: rx + ox - bx, y: ry + oy - by }, b: { x: rx + ox, y: ry + oy }, life: 6, blood: true });
    }
  }
}

// Push overlapping cars apart and trade momentum along the contact normal, both
// weighted by vehicle mass, so a truck barges a hatchback aside. Run once per
// tick after every car has moved. O(n^2), but n is tiny.
const CAR_RESTITUTION = 0.25; // bounciness of a car-on-car bump

export function resolveCarCollisions(w: World): void {
  const cars = w.cars;
  for (let i = 0; i < cars.length; i++) {
    for (let j = i + 1; j < cars.length; j++) {
      const a = cars[i];
      const b = cars[j];
      let nx = b.pos.x - a.pos.x;
      let ny = b.pos.y - a.pos.y;
      let d = Math.hypot(nx, ny);
      const min = a.radius + b.radius;
      if (d >= min) continue;
      if (d < 1e-3) {
        nx = 1;
        ny = 0;
        d = 1e-3;
      }
      nx /= d;
      ny /= d;
      // Wrecks are immovable (infinite mass); two of them can't interact.
      const imA = a.dead ? 0 : 1 / VEHICLES[a.kind].handling.mass;
      const imB = b.dead ? 0 : 1 / VEHICLES[b.kind].handling.mass;
      const imSum = imA + imB;
      if (imSum === 0) continue;
      // separate the overlap, lighter car yields more
      const overlap = min - d;
      a.pos.x -= nx * overlap * (imA / imSum);
      a.pos.y -= ny * overlap * (imA / imSum);
      b.pos.x += nx * overlap * (imB / imSum);
      b.pos.y += ny * overlap * (imB / imSum);
      // bump impulse only if the two are closing
      const rvn = (b.vel.x - a.vel.x) * nx + (b.vel.y - a.vel.y) * ny;
      if (rvn < 0) {
        const jimp = (-(1 + CAR_RESTITUTION) * rvn) / imSum;
        a.vel.x -= jimp * imA * nx;
        a.vel.y -= jimp * imA * ny;
        b.vel.x += jimp * imB * nx;
        b.vel.y += jimp * imB * ny;
        // A hard shunt dents both cars.
        const closing = -rvn;
        if (closing > CAR_DAMAGE_MIN) {
          const dmg = (closing - CAR_DAMAGE_MIN) * DAMAGE_PER_SPEED;
          damageCar(w, a, dmg);
          damageCar(w, b, dmg);
        }
      }
    }
  }
}

// Index of the nearest drivable (not a wreck) car within reach of the player,
// or -1. A larger reach is used to start an auto-walk to the car.
export function nearestCarIndex(w: World, reach: number = ENTER_REACH): number {
  const p = w.player;
  let idx = -1;
  let bd = p.radius + reach;
  for (let i = 0; i < w.cars.length; i++) {
    if (w.cars[i].dead) continue;
    const d = Math.hypot(w.cars[i].pos.x - p.pos.x, w.cars[i].pos.y - p.pos.y);
    if (d < bd) {
      bd = d;
      idx = i;
    }
  }
  return idx;
}

export const AUTO_PATH_RANGE = 260; // press F within this to auto-walk to a car

export function enterCar(w: World, idx: number): void {
  const car = w.cars[idx];
  car.occupant = 'player';
  w.player.inCar = idx;
  w.player.enterTimer = 0.35;
}

export function exitCar(w: World): void {
  const p = w.player;
  const car = w.cars[p.inCar];
  car.occupant = 'none';
  const carSpeed = Math.hypot(car.vel.x, car.vel.y);
  const side = fromAngle(car.angle + Math.PI / 2);
  p.pos = { x: car.pos.x + side.x * (car.radius + p.radius + 8), y: car.pos.y + side.y * (car.radius + p.radius + 8) };
  // Momentum sticks: the driver inherits the car's velocity, the car keeps its
  // own and coasts away on its own (updateLooseCar takes over).
  p.vel = { x: car.vel.x, y: car.vel.y };
  p.inCar = -1;
  p.enterTimer = 0.35;
  if (carSpeed > DIVE_SPEED) {
    // GTA-style bail: flung out to the side and sent into a tumble.
    p.vel.x += side.x * 130;
    p.vel.y += side.y * 130;
    p.dive = DIVE_TIME;
    p.roll = 0;
    addShake(w, 3.5);
  }
  for (const b of w.solids) resolveCircleRect(p.pos, p.radius, b);
}
