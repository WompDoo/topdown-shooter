// Civilian AI: neutral city-dwellers who wander until danger is near, then bolt
// away from it. They never fight. Gunfire and getting hit also panic them (set
// from combat.ts); here they react to nearby hostiles and fast-moving cars.

import type { Civilian, World } from './world';
import type { Vec2 } from './math';
import { angleDiff, angleOf, clamp, len, norm, randRange, randSpread, resolveCircleRect, sub } from './math';
import { hasLoS } from './combat';

const PANIC_TIME = 2.6; // seconds of fleeing after a scare
const ENEMY_SIGHT = 360; // spot a hostile within this (needs line of sight)
const CAR_FEAR = 220; // dread a moving car within this…
const CAR_FAST = 150; // …if it's going at least this fast

// Nearest thing worth running from: an armed hostile in sight, or a fast car.
function nearestThreat(w: World, c: Civilian): Vec2 | null {
  let best: Vec2 | null = null;
  let bd = Infinity;
  for (const e of w.enemies) {
    if (!e.alive) continue;
    const d = Math.hypot(e.pos.x - c.pos.x, e.pos.y - c.pos.y);
    if (d < ENEMY_SIGHT && d < bd && hasLoS(w, c.pos, e.pos)) {
      bd = d;
      best = e.pos;
    }
  }
  for (const car of w.cars) {
    if (car.dead || Math.hypot(car.vel.x, car.vel.y) < CAR_FAST) continue;
    const d = Math.hypot(car.pos.x - c.pos.x, car.pos.y - c.pos.y);
    if (d < CAR_FEAR && d < bd) {
      bd = d;
      best = car.pos;
    }
  }
  return best;
}

function wander(c: Civilian, dt: number): void {
  c.wanderTimer -= dt;
  if (c.wanderTimer <= 0) {
    c.wanderTimer = randRange(2, 5);
    c.wanderTarget = { x: c.home.x + randSpread(170), y: c.home.y + randSpread(170) };
  }
  const to = sub(c.wanderTarget, c.pos);
  const d = len(to);
  if (d > 8) {
    c.aim += angleDiff(c.aim, angleOf(to)) * Math.min(1, 4 * dt);
    const step = Math.min(c.speed * 0.4 * dt, d);
    c.pos.x += (to.x / d) * step;
    c.pos.y += (to.y / d) * step;
  }
}

function flee(c: Civilian, dt: number): void {
  const away = norm(sub(c.pos, c.fleeFrom));
  if (away.x === 0 && away.y === 0) {
    away.x = Math.cos(c.aim);
    away.y = Math.sin(c.aim);
  }
  c.aim += angleDiff(c.aim, angleOf(away)) * Math.min(1, 12 * dt);
  c.pos.x += away.x * c.speed * dt;
  c.pos.y += away.y * c.speed * dt;
}

function updateCivilian(w: World, c: Civilian, dt: number): void {
  c.flash = Math.max(0, c.flash - dt);

  // knockback residual (bullets, car shoves)
  c.pos.x += c.vel.x * dt;
  c.pos.y += c.vel.y * dt;
  const drag = Math.exp(-7 * dt);
  c.vel.x *= drag;
  c.vel.y *= drag;

  const threat = nearestThreat(w, c);
  if (threat) {
    c.panic = Math.max(c.panic, PANIC_TIME);
    c.fleeFrom = { x: threat.x, y: threat.y };
  } else if (c.panic > 0) {
    c.panic -= dt;
  }

  if (c.panic > 0) flee(c, dt);
  else wander(c, dt);

  for (const b of w.solids) resolveCircleRect(c.pos, c.radius, b);
  for (const car of w.cars) {
    const dx = c.pos.x - car.pos.x;
    const dy = c.pos.y - car.pos.y;
    const d = Math.hypot(dx, dy);
    const min = c.radius + car.radius;
    if (d < min && d > 1e-3) {
      c.pos.x = car.pos.x + (dx / d) * min;
      c.pos.y = car.pos.y + (dy / d) * min;
    }
  }
  c.pos.x = clamp(c.pos.x, w.bounds.x + c.radius, w.bounds.x + w.bounds.w - c.radius);
  c.pos.y = clamp(c.pos.y, w.bounds.y + c.radius, w.bounds.y + w.bounds.h - c.radius);
}

export function updateCivilians(w: World, dt: number): void {
  for (const c of w.civilians) if (c.alive) updateCivilian(w, c, dt);

  // light separation so a fleeing crowd doesn't collapse into one dot
  const cs = w.civilians;
  for (let i = 0; i < cs.length; i++) {
    const a = cs[i];
    if (!a.alive) continue;
    for (let j = i + 1; j < cs.length; j++) {
      const b = cs[j];
      if (!b.alive) continue;
      const dx = b.pos.x - a.pos.x;
      const dy = b.pos.y - a.pos.y;
      const d = Math.hypot(dx, dy);
      const min = a.radius + b.radius;
      if (d < min && d > 1e-3) {
        const push = (min - d) / 2;
        const nx = dx / d;
        const ny = dy / d;
        a.pos.x -= nx * push;
        a.pos.y -= ny * push;
        b.pos.x += nx * push;
        b.pos.y += ny * push;
      }
    }
  }
}
