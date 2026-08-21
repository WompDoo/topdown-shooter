// Flying explosives. Rockets fly straight and detonate on the first thing they
// touch; grenades are lobbed, slide with drag, bounce off walls and go off on a
// fuse or on hitting a body. Both explode in a radius blast that hurts everything
// nearby — enemies, civilians, the player, and cars.

import type { Projectile, Team, World } from './world';
import type { Weapon } from './weapon';
import type { Vec2 } from './math';
import { collideCircleRect, collideCircleSegment, fromAngle } from './math';
import { addHitstop, addShake, spawnDeath, spawnExplosion, spawnSparks } from './fx';
import { sfxEnemyDeath } from './audio';
import { damageCar } from './car';

const GRENADE_DRAG = 1.1; // how fast a grenade slides to a stop
const BOUNCE = 0.45; // grenade restitution off walls

export function spawnProjectile(w: World, origin: Vec2, angle: number, weapon: Weapon, team: Team): void {
  const dir = fromAngle(angle);
  const speed = weapon.projSpeed ?? 600;
  const rocket = weapon.projectile === 'rocket';
  w.projectiles.push({
    pos: { x: origin.x, y: origin.y },
    vel: { x: dir.x * speed, y: dir.y * speed },
    kind: rocket ? 'rocket' : 'grenade',
    team,
    fuse: weapon.projFuse ?? 2,
    radius: rocket ? 6 : 5,
    blastR: weapon.blastRadius ?? 140,
    dmg: weapon.damage,
    spin: angle,
  });
}

function bounce(pr: Projectile, n: Vec2): void {
  const vn = pr.vel.x * n.x + pr.vel.y * n.y;
  if (vn < 0) {
    pr.vel.x -= (1 + BOUNCE) * vn * n.x;
    pr.vel.y -= (1 + BOUNCE) * vn * n.y;
  }
}

export function updateProjectiles(w: World, dt: number): void {
  const live: Projectile[] = [];
  for (const pr of w.projectiles) {
    let boom = false;
    pr.fuse -= dt;
    pr.spin += (pr.kind === 'rocket' ? 0 : 11) * dt;
    pr.pos.x += pr.vel.x * dt;
    pr.pos.y += pr.vel.y * dt;
    if (pr.kind === 'grenade') {
      const f = Math.max(0, 1 - GRENADE_DRAG * dt);
      pr.vel.x *= f;
      pr.vel.y *= f;
    }

    // walls (rockets detonate, grenades bounce)
    for (const b of w.solids) {
      const n = collideCircleRect(pr.pos, pr.radius, b);
      if (!n) continue;
      if (pr.kind === 'rocket') {
        boom = true;
        break;
      }
      bounce(pr, n);
    }
    const t = w.track;
    if (!boom && t) {
      for (const s of t.walls) {
        const n = collideCircleSegment(pr.pos, pr.radius, s.a, s.b, t.wallHalf);
        if (!n) continue;
        if (pr.kind === 'rocket') {
          boom = true;
          break;
        }
        bounce(pr, n);
      }
    }
    // direct hits: any car, any live enemy, or the player when enemy-fired
    if (!boom) {
      for (const c of w.cars) {
        if (Math.hypot(c.pos.x - pr.pos.x, c.pos.y - pr.pos.y) < c.radius + pr.radius) {
          boom = true;
          break;
        }
      }
    }
    if (!boom) {
      for (const e of w.enemies) {
        if (e.alive && Math.hypot(e.pos.x - pr.pos.x, e.pos.y - pr.pos.y) < e.radius + pr.radius) {
          boom = true;
          break;
        }
      }
    }
    if (!boom && pr.team === 'enemy' && !w.player.downed && w.player.inCar < 0) {
      if (Math.hypot(w.player.pos.x - pr.pos.x, w.player.pos.y - pr.pos.y) < w.player.radius + pr.radius) boom = true;
    }
    if (!boom && pr.fuse <= 0) boom = true;
    if (
      pr.pos.x < w.bounds.x ||
      pr.pos.x > w.bounds.x + w.bounds.w ||
      pr.pos.y < w.bounds.y ||
      pr.pos.y > w.bounds.y + w.bounds.h
    ) {
      boom = true;
    }

    if (boom) blast(w, pr);
    else live.push(pr);
  }
  w.projectiles = live;
}

function blast(w: World, pr: Projectile): void {
  spawnExplosion(w, pr.pos, pr.blastR / 150);
  spawnSparks(w, pr.pos, pr.spin, 10);
  addShake(w, Math.min(14, pr.blastR * 0.05));
  addHitstop(w, 0.05);
  const r = pr.blastR;
  const dmgAt = (px: number, py: number, rad: number): number => {
    const d = Math.hypot(px - pr.pos.x, py - pr.pos.y);
    return d > r + rad ? 0 : pr.dmg * (1 - d / (r + rad));
  };

  for (const e of w.enemies) {
    if (!e.alive) continue;
    const dmg = dmgAt(e.pos.x, e.pos.y, e.radius);
    if (dmg <= 0) continue;
    e.hp -= dmg;
    e.aggro = 9;
    if (e.hp <= 0) {
      e.alive = false;
      spawnDeath(w, e.pos, pr.spin);
      sfxEnemyDeath();
    }
  }
  for (const c of w.civilians) {
    if (!c.alive) continue;
    const dmg = dmgAt(c.pos.x, c.pos.y, c.radius);
    if (dmg <= 0) continue;
    c.hp -= dmg;
    c.panic = Math.max(c.panic, 3);
    c.fleeFrom = { x: pr.pos.x, y: pr.pos.y };
    if (c.hp <= 0) {
      c.alive = false;
      spawnDeath(w, c.pos, pr.spin);
      sfxEnemyDeath();
    }
  }
  const p = w.player;
  if (!p.downed && p.inCar < 0) {
    const dmg = dmgAt(p.pos.x, p.pos.y, p.radius);
    if (dmg > 0) {
      p.hp -= dmg;
      p.flash = 0.14;
      if (p.hp <= 0) {
        p.hp = 0;
        p.downed = true;
        w.state = 'dead';
        w.stateTimer = 0;
        spawnDeath(w, p.pos, pr.spin);
      }
    }
  }
  for (const c of w.cars) {
    const dmg = dmgAt(c.pos.x, c.pos.y, c.radius);
    if (dmg > 0) damageCar(w, c, dmg);
  }
}
