// Shot resolution + line-of-sight for the sandbox. Hitscan: each shot is an
// instant ray that stops at the nearest building, car, or body. Getting shot (or
// a round snapping past) makes nearby hostiles turn on the player.

import type { Enemy, World } from './world';
import type { Vec2 } from './math';
import { add, angleDiff, angleOf, clamp, fromAngle, len, rayVsCircle, rayVsRect, scale, sub } from './math';
import { addHitstop, addShake, spawnBlood, spawnDeath, spawnSparks, spawnTracer } from './fx';
import { sfxEnemyDeath, sfxImpactFlesh, sfxImpactWall, sfxPlayerHurt } from './audio';

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
  let hitPlayer = false;
  let hitSolid = false;

  for (const r of w.solids) {
    const t = rayVsRect(origin, dir, best, r);
    if (t < best) {
      best = t;
      hitEnemy = null;
      hitPlayer = false;
      hitSolid = true;
    }
  }
  for (const c of w.cars) {
    const t = rayVsCircle(origin, dir, best, c.pos, c.radius);
    if (t < best) {
      best = t;
      hitEnemy = null;
      hitPlayer = false;
      hitSolid = true;
    }
  }

  if (team === 'player') {
    for (const e of w.enemies) {
      if (!e.alive) continue;
      const t = rayVsCircle(origin, dir, best, e.pos, e.radius);
      if (t < best) {
        best = t;
        hitEnemy = e;
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
        hitSolid = false;
      }
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
  } else if (hitSolid) {
    spawnSparks(w, end, angle, 7);
    sfxImpactWall();
  }

  if (team === 'player') aggroAlong(w, origin, end);
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
