// Hostile AI for the sandbox: hang around until they notice the player (nearby
// with line-of-sight, or provoked by gunfire / being hit), then chase and shoot.
// No stealth/alert layer — just aggro on/off.

import type { Enemy, World } from './world';
import type { Vec2 } from './math';
import {
  add,
  angleDiff,
  angleOf,
  clamp,
  fromAngle,
  len,
  norm,
  rand,
  randRange,
  randSpread,
  resolveCircleRect,
  scale,
  sub,
} from './math';
import { fireInterval } from './weapon';
import { AGGRO_TIME, hasLoS, resolveShot } from './combat';
import { spawnCasing, spawnMuzzle } from './fx';
import { sfxWeapon } from './audio';

const AGGRO_RANGE = 440;

function moveToward(e: Enemy, target: Vec2, speed: number, dt: number): void {
  const to = sub(target, e.pos);
  const d = len(to);
  if (d > 3) {
    const step = Math.min(speed * dt, d);
    e.pos.x += (to.x / d) * step;
    e.pos.y += (to.y / d) * step;
  }
}

function fireBurst(w: World, e: Enemy): void {
  const aimDir = fromAngle(e.aim);
  const origin = add(e.pos, scale(aimDir, e.radius + 6));
  const baseAng = angleOf(sub(w.player.pos, origin));
  const pellets = Math.max(1, e.weapon.pellets);
  for (let i = 0; i < pellets; i++) {
    resolveShot(w, origin, baseAng + randSpread(e.spread), e.weapon.damage, e.weapon.range, 'enemy', e.weapon.knockback);
  }
  e.ammo -= 1;
  e.burstLeft -= 1;
  e.spread = Math.min(e.spread + e.weapon.spreadPerShot, e.weapon.spreadMax);
  e.muzzleTimer = 0.05;
  spawnMuzzle(w, origin, baseAng, e.weapon.muzzleSize);
  spawnCasing(w, origin, e.aim);
  sfxWeapon(e.weapon.sound, true);
  e.fireTimer = fireInterval(e.weapon);
  if (e.ammo <= 0) {
    e.reloading = true;
    e.reloadTimer = e.weapon.reloadTime;
    e.telegraph = 0;
    e.burstLeft = 0;
  }
}

function idle(e: Enemy, dt: number): void {
  e.wanderTimer -= dt;
  if (e.wanderTimer <= 0) {
    e.wanderTimer = randRange(2.5, 6);
    e.wanderTarget = { x: e.home.x + randSpread(120), y: e.home.y + randSpread(120) };
  }
  const to = sub(e.wanderTarget, e.pos);
  if (len(to) > 8) {
    e.aim += angleDiff(e.aim, angleOf(to)) * Math.min(1, 3 * dt);
    moveToward(e, e.wanderTarget, e.speed * 0.34, dt);
  }
}

function chase(w: World, e: Enemy, dt: number): void {
  const player = w.player;
  const to = sub(player.pos, e.pos);
  const d = len(to);
  const los = hasLoS(w, e.pos, player.pos);
  e.aim += angleDiff(e.aim, angleOf(to)) * Math.min(1, 7 * dt);

  // reload while repositioning
  if (e.reloading) {
    e.reloadTimer -= dt;
    if (e.reloadTimer <= 0) {
      e.ammo = e.weapon.mag;
      e.reloading = false;
    }
  }

  // keep in the weapon's range band; rushers push in
  let mv: Vec2 = { x: 0, y: 0 };
  if (!los || d > e.rangeMax) mv = norm(to);
  else if (d < e.rangeMin) mv = norm(sub(e.pos, player.pos));
  else {
    const t: Vec2 = { x: -Math.sin(e.aim), y: Math.cos(e.aim) };
    mv = scale(t, Math.sin(w.time * 1.6 + e.home.x * 0.01));
  }
  const spd = e.rush ? e.speed : e.speed * 0.85;
  e.pos.x += mv.x * spd * dt;
  e.pos.y += mv.y * spd * dt;

  // firing cycle
  e.fireTimer -= dt;
  if (los && d < e.weapon.range && !e.reloading && e.ammo > 0) {
    if (e.burstLeft > 0) {
      if (e.fireTimer <= 0) fireBurst(w, e);
      if (e.burstLeft <= 0) {
        e.telegraph = 0;
        e.fireTimer = randRange(0.6, 1.3);
      }
    } else if (e.fireTimer <= 0) {
      e.telegraph = Math.min(1, e.telegraph + dt / e.telegraphTime);
      if (e.telegraph >= 1) e.burstLeft = e.weapon.auto ? 3 + Math.floor(rand() * 3) : 1;
    }
  } else {
    e.telegraph = Math.max(0, e.telegraph - dt * 2);
  }
}

function updateEnemy(w: World, e: Enemy, dt: number): void {
  e.flash = Math.max(0, e.flash - dt);
  e.muzzleTimer = Math.max(0, e.muzzleTimer - dt);
  e.spread = Math.max(e.weapon.spreadMin, e.spread - e.weapon.spreadRecover * dt);

  // knockback residual (from bullets / cars)
  e.pos.x += e.vel.x * dt;
  e.pos.y += e.vel.y * dt;
  const drag = Math.exp(-7 * dt);
  e.vel.x *= drag;
  e.vel.y *= drag;

  const d = Math.hypot(w.player.pos.x - e.pos.x, w.player.pos.y - e.pos.y);
  const canSee = !w.player.downed && d < AGGRO_RANGE && hasLoS(w, e.pos, w.player.pos);
  if (canSee) e.aggro = AGGRO_TIME;
  else if (e.aggro > 0) e.aggro -= dt;

  if (e.aggro > 0 && !w.player.downed) chase(w, e, dt);
  else idle(e, dt);

  for (const b of w.solids) resolveCircleRect(e.pos, e.radius, b);
  e.pos.x = clamp(e.pos.x, w.bounds.x + e.radius, w.bounds.x + w.bounds.w - e.radius);
  e.pos.y = clamp(e.pos.y, w.bounds.y + e.radius, w.bounds.y + w.bounds.h - e.radius);
}

export function updateEnemies(w: World, dt: number): void {
  for (const e of w.enemies) if (e.alive) updateEnemy(w, e, dt);

  // light separation so they don't stack
  for (let i = 0; i < w.enemies.length; i++) {
    const a = w.enemies[i];
    if (!a.alive) continue;
    for (let j = i + 1; j < w.enemies.length; j++) {
      const b = w.enemies[j];
      if (!b.alive) continue;
      const dx = b.pos.x - a.pos.x;
      const dy = b.pos.y - a.pos.y;
      const dist = Math.hypot(dx, dy);
      const min = a.radius + b.radius;
      if (dist < min && dist > 1e-3) {
        const push = (min - dist) / 2;
        const nx = dx / dist;
        const ny = dy / dist;
        a.pos.x -= nx * push;
        a.pos.y -= ny * push;
        b.pos.x += nx * push;
        b.pos.y += ny * push;
      }
    }
  }
}
