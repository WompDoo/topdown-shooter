// Shot resolution + line-of-sight for the sandbox. Hitscan: each shot is an
// instant ray that stops at the nearest building, car, or body. Getting shot (or
// a round snapping past) makes nearby hostiles turn on the player.

import type { Car, Civilian, Enemy, World } from './world';
import type { Vec2 } from './math';
import { add, angleDiff, angleOf, clamp, fromAngle, len, rayVsCircle, rayVsRect, scale, sub } from './math';
import { addHitstop, addShake, spawnBlood, spawnDeath, spawnSparks, spawnTracer } from './fx';
import { sfxEnemyDeath, sfxImpactFlesh, sfxImpactWall, sfxPlayerHurt } from './audio';
import { bulletDamageMultiplier, damageCar } from './car';

export const AGGRO_TIME = 9; // seconds a hostile keeps hunting after being provoked

// True if no building blocks the segment a->b.
export function hasLoS(w: World, a: Vec2, b: Vec2): boolean {
  const d = sub(b, a);
  const dist = Math.hypot(d.x, d.y);
  if (dist < 1e-3) return true;
  const dir = scale(d, 1 / dist);
  for (const r of w.solids) {
    if (rayVsRect(a, dir, dist - 1, r) < dist - 1) return false;
  }
  return true;
}

function segDist(p: Vec2, a: Vec2, b: Vec2): number {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const t = clamp(((p.x - a.x) * abx + (p.y - a.y) * aby) / (abx * abx + aby * aby || 1), 0, 1);
  return Math.hypot(p.x - (a.x + abx * t), p.y - (a.y + aby * t));
}

function aggroAlong(w: World, a: Vec2, b: Vec2): void {
  for (const e of w.enemies) {
    if (e.alive && segDist(e.pos, a, b) < 90) e.aggro = Math.max(e.aggro, AGGRO_TIME);
  }
}

// A round cracking past sends any civilian near its path bolting from the shooter.
function scareCivilians(w: World, a: Vec2, b: Vec2): void {
  for (const c of w.civilians) {
    if (c.alive && segDist(c.pos, a, b) < 150) {
      c.panic = Math.max(c.panic, 2.6);
      c.fleeFrom = { x: a.x, y: a.y };
    }
  }
}

export function resolveShot(
  w: World,
  origin: Vec2,
  angle: number,
  dmg: number,
  range: number,
  team: 'player' | 'enemy',
  knockback: number,
): void {
  const dir = fromAngle(angle);
  let best = range;
  let hitEnemy: Enemy | null = null;
  let hitCiv: Civilian | null = null;
  let hitCar: Car | null = null;
  let hitPlayer = false;
  let hitSolid = false;

  for (const r of w.solids) {
    const t = rayVsRect(origin, dir, best, r);
    if (t < best) {
      best = t;
      hitEnemy = null;
      hitCar = null;
      hitPlayer = false;
      hitSolid = true;
    }
  }
  for (const c of w.cars) {
    const t = rayVsCircle(origin, dir, best, c.pos, c.radius);
    if (t < best) {
      best = t;
      hitEnemy = null;
      hitCar = c;
      hitPlayer = false;
      hitSolid = false;
    }
  }

  if (team === 'player') {
    for (const e of w.enemies) {
      if (!e.alive) continue;
      const t = rayVsCircle(origin, dir, best, e.pos, e.radius);
      if (t < best) {
        best = t;
        hitEnemy = e;
        hitCar = null;
        hitSolid = false;
      }
    }
  } else {
    const p = w.player;
    if (!p.downed && p.inCar < 0) {
      const t = rayVsCircle(origin, dir, best, p.pos, p.radius);
      if (t < best) {
        best = t;
        hitPlayer = true;
        hitCar = null;
        hitSolid = false;
      }
    }
  }

  // Civilians are neutral flesh — either side's rounds can catch them.
  for (const c of w.civilians) {
    if (!c.alive) continue;
    const t = rayVsCircle(origin, dir, best, c.pos, c.radius);
    if (t < best) {
      best = t;
      hitCiv = c;
      hitEnemy = null;
      hitCar = null;
      hitPlayer = false;
      hitSolid = false;
    }
  }

  const end = add(origin, scale(dir, best));
  spawnTracer(w, origin, end, team);

  if (hitEnemy) {
    hitEnemy.hp -= dmg;
    hitEnemy.flash = 0.09;
    hitEnemy.aggro = AGGRO_TIME;
    hitEnemy.vel = add(hitEnemy.vel, scale(dir, knockback));
    spawnBlood(w, end, angle, 8);
    sfxImpactFlesh();
    if (hitEnemy.hp <= 0 && hitEnemy.alive) {
      hitEnemy.alive = false;
      spawnDeath(w, hitEnemy.pos, angle);
      sfxEnemyDeath();
      addHitstop(w, 0.045);
      addShake(w, 3);
    }
  } else if (hitPlayer) {
    const p = w.player;
    p.hp -= dmg;
    p.flash = 0.12;
    spawnBlood(w, end, angle, 8);
    sfxPlayerHurt();
    addShake(w, 3.5);
    if (p.hp <= 0 && !p.downed) {
      p.hp = 0;
      p.downed = true;
      w.state = 'dead';
      w.stateTimer = 0;
      spawnDeath(w, p.pos, angle);
      addHitstop(w, 0.12);
      addShake(w, 8);
    }
  } else if (hitCar) {
    damageCar(w, hitCar, dmg * bulletDamageMultiplier(hitCar, end));
    spawnSparks(w, end, angle, 5);
    sfxImpactWall();
  } else if (hitCiv) {
    hitCiv.hp -= dmg;
    hitCiv.flash = 0.09;
    hitCiv.panic = Math.max(hitCiv.panic, 3);
    hitCiv.fleeFrom = { x: origin.x, y: origin.y };
    hitCiv.vel = add(hitCiv.vel, scale(dir, knockback));
    spawnBlood(w, end, angle, 8);
    sfxImpactFlesh();
    if (hitCiv.hp <= 0 && hitCiv.alive) {
      hitCiv.alive = false;
      spawnDeath(w, hitCiv.pos, angle);
      sfxEnemyDeath();
      addHitstop(w, 0.03);
    }
  } else if (hitSolid) {
    spawnSparks(w, end, angle, 7);
    sfxImpactWall();
  }

  if (team === 'player') aggroAlong(w, origin, end);
  scareCivilians(w, origin, end);
}

// Knife swing: hit every hostile inside the arc + reach in front.
export function meleeHit(
  w: World,
  origin: Vec2,
  aim: number,
  reach: number,
  arcHalf: number,
  dmg: number,
  knockback: number,
): void {
  for (const e of w.enemies) {
    if (!e.alive) continue;
    const to = sub(e.pos, origin);
    if (len(to) > reach + e.radius) continue;
    if (Math.abs(angleDiff(aim, angleOf(to))) > arcHalf) continue;
    e.hp -= dmg;
    e.flash = 0.09;
    e.aggro = AGGRO_TIME;
    e.vel = add(e.vel, scale(fromAngle(aim), knockback));
    spawnBlood(w, e.pos, aim, 12);
    sfxImpactFlesh();
    if (e.hp <= 0 && e.alive) {
      e.alive = false;
      spawnDeath(w, e.pos, aim);
      sfxEnemyDeath();
      addHitstop(w, 0.06);
      addShake(w, 4);
    }
  }
}

// Flamethrower tick: scorch every hostile, civilian and car inside the short
// cone in front of the player. Damage is strongest up close and tapers toward
// the tip of the flame. Called every fire tick while the trigger is held.
export function flameHit(
  w: World,
  origin: Vec2,
  aim: number,
  range: number,
  arcHalf: number,
  dmg: number,
): void {
  const scorch = (px: number, py: number, radius: number): number => {
    const dx = px - origin.x;
    const dy = py - origin.y;
    const d = Math.hypot(dx, dy);
    if (d > range + radius) return 0;
    if (d > 1e-3 && Math.abs(angleDiff(aim, angleOf({ x: dx, y: dy }))) > arcHalf) return 0;
    return dmg * (1 - Math.min(1, d / (range + radius)) * 0.6);
  };
  for (const e of w.enemies) {
    if (!e.alive) continue;
    const s = scorch(e.pos.x, e.pos.y, e.radius);
    if (s <= 0) continue;
    e.hp -= s;
    e.aggro = AGGRO_TIME;
    e.flash = 0.05;
    if (e.hp <= 0 && e.alive) {
      e.alive = false;
      spawnDeath(w, e.pos, aim);
      sfxEnemyDeath();
    }
  }
  for (const c of w.civilians) {
    if (!c.alive) continue;
    const s = scorch(c.pos.x, c.pos.y, c.radius);
    if (s <= 0) continue;
    c.hp -= s;
    c.panic = Math.max(c.panic, 3);
    c.fleeFrom = { x: origin.x, y: origin.y };
    if (c.hp <= 0 && c.alive) {
      c.alive = false;
      spawnDeath(w, c.pos, aim);
      sfxEnemyDeath();
    }
  }
  for (const c of w.cars) {
    const s = scorch(c.pos.x, c.pos.y, c.radius);
    if (s > 0) damageCar(w, c, s);
  }
}
