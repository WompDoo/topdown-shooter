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
import { addHitstop, addShake, spawnBlood, spawnDeath } from './fx';
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
const ENTER_REACH = 34;
const RUN_OVER_SPEED = 120;
const DIVE_SPEED = 150; // bail out above this and you tumble instead of stepping off
const DIVE_TIME = 0.55; // seconds of tumble

export function updateCar(w: World, car: Car, input: Input, dt: number): void {
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
  car.odo += Math.hypot(car.vel.x, car.vel.y) * dt;

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
  car.odo += Math.hypot(car.vel.x, car.vel.y) * dt;
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
    if (e.hp <= 0 && e.alive) {
      e.alive = false;
      spawnDeath(w, e.pos, car.angle);
      sfxEnemyDeath();
      addHitstop(w, 0.05);
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
      const imA = 1 / VEHICLES[a.kind].handling.mass;
      const imB = 1 / VEHICLES[b.kind].handling.mass;
      const imSum = imA + imB;
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
      }
    }
  }
}

// Index of the nearest car the player could get into, or -1.
export function nearestCarIndex(w: World): number {
  const p = w.player;
  let idx = -1;
  let bd = p.radius + ENTER_REACH;
  for (let i = 0; i < w.cars.length; i++) {
    const d = Math.hypot(w.cars[i].pos.x - p.pos.x, w.cars[i].pos.y - p.pos.y);
    if (d < bd) {
      bd = d;
      idx = i;
    }
  }
  return idx;
}

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
