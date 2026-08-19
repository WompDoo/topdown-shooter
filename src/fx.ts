// Feedback layer: particles, tracers, muzzle flashes, decals, screen shake,
// hitstop. All the "juice" that sells the gunplay. Spawners + per-frame decay.

import type { World } from './world';
import type { Vec2 } from './math';
import { fromAngle, rand, randRange, randSpread, v } from './math';

export function addShake(w: World, amount: number): void {
  w.shake = Math.min(w.shake + amount, 16);
}

export function addHitstop(w: World, seconds: number): void {
  w.hitstop = Math.max(w.hitstop, seconds);
}

export function spawnTracer(w: World, a: Vec2, b: Vec2, team: 'player' | 'enemy'): void {
  w.tracers.push({ a: { ...a }, b: { ...b }, life: 0.06, maxLife: 0.06, team });
}

export function spawnMuzzle(w: World, pos: Vec2, angle: number, size: number): void {
  w.muzzles.push({ pos: { ...pos }, angle, life: 0.05, size });
}

export function spawnSlash(w: World, pos: Vec2, angle: number, arc: number, reach: number): void {
  w.slashes.push({ pos: { ...pos }, angle, arc, reach, life: 0.16, maxLife: 0.16 });
}

export function spawnSparks(w: World, pos: Vec2, dir: number, count = 8): void {
  for (let i = 0; i < count; i++) {
    const a = dir + Math.PI + randSpread(1.2);
    const sp = randRange(80, 340);
    w.particles.push({
      pos: { ...pos },
      vel: fromAngle(a, sp),
      life: randRange(0.12, 0.3),
      maxLife: 0.3,
      size: randRange(1, 2.4),
      color: rand() < 0.5 ? '#ffd479' : '#ff9a3c',
      drag: 6,
      kind: 'spark',
      angle: 0,
      spin: 0,
    });
  }
}

export function spawnBlood(w: World, pos: Vec2, dir: number, count = 10): void {
  for (let i = 0; i < count; i++) {
    const a = dir + randSpread(0.9);
    const sp = randRange(60, 300);
    w.particles.push({
      pos: { ...pos },
      vel: fromAngle(a, sp),
      life: randRange(0.2, 0.5),
      maxLife: 0.5,
      size: randRange(1.5, 3.5),
      color: rand() < 0.5 ? '#c1263a' : '#8f1626',
      drag: 5,
      kind: 'blood',
      angle: 0,
      spin: 0,
    });
  }
}

// Damage smoke, shade + size escalating with how wrecked the car is.
const SMOKE_SHADE = { light: '184,184,190', dark: '70,68,72', black: '26,24,24' };
export function spawnSmokePuff(w: World, pos: Vec2, shade: keyof typeof SMOKE_SHADE, size: number): void {
  w.particles.push({
    pos: { x: pos.x + randSpread(4), y: pos.y + randSpread(4) },
    vel: fromAngle(rand() * Math.PI * 2, randRange(6, 22)),
    life: randRange(0.7, 1.5),
    maxLife: 1.5,
    size,
    color: `rgba(${SMOKE_SHADE[shade]},0.6)`,
    drag: 1.1,
    kind: 'smoke',
    angle: 0,
    spin: 0,
  });
}

// Small licking flame for a car that's about to blow.
export function spawnFire(w: World, pos: Vec2): void {
  w.particles.push({
    pos: { x: pos.x + randSpread(3), y: pos.y + randSpread(3) },
    vel: fromAngle(rand() * Math.PI * 2, randRange(20, 70)),
    life: randRange(0.18, 0.4),
    maxLife: 0.4,
    size: randRange(3, 6),
    color: rand() < 0.5 ? '#ffb028' : '#ff5a1e',
    drag: 3,
    kind: 'spark',
    angle: 0,
    spin: 0,
  });
}

export function spawnExplosion(w: World, pos: Vec2, scale = 1): void {
  addShake(w, Math.min(14, 9 * scale));
  addHitstop(w, 0.08);
  w.decals.push({ pos: { ...pos }, r: randRange(24, 34) * scale, color: 'rgba(18,14,12,0.6)' });
  for (let i = 0; i < Math.round(32 * scale); i++) {
    const sp = randRange(120, 540) * scale;
    w.particles.push({
      pos: { ...pos },
      vel: fromAngle(rand() * Math.PI * 2, sp),
      life: randRange(0.25, 0.6),
      maxLife: 0.6,
      size: randRange(3, 8) * scale,
      color: rand() < 0.45 ? '#ffd066' : rand() < 0.7 ? '#ff7a29' : '#e23b1e',
      drag: 5,
      kind: 'spark',
      angle: 0,
      spin: 0,
    });
  }
  for (let i = 0; i < Math.round(16 * scale); i++) {
    w.particles.push({
      pos: { ...pos },
      vel: fromAngle(rand() * Math.PI * 2, randRange(20, 130) * scale),
      life: randRange(0.9, 1.9),
      maxLife: 1.9,
      size: randRange(8, 17) * scale,
      color: rand() < 0.5 ? 'rgba(38,34,32,0.6)' : 'rgba(78,74,72,0.5)',
      drag: 1.4,
      kind: 'smoke',
      angle: 0,
      spin: 0,
    });
  }
}

export function spawnCasing(w: World, pos: Vec2, aim: number): void {
  // Ejects to the shooter's right, spins as it slides.
  const a = aim + Math.PI / 2 + randSpread(0.3);
  w.particles.push({
    pos: { ...pos },
    vel: fromAngle(a, randRange(90, 160)),
    life: 1.2,
    maxLife: 1.2,
    size: 2.2,
    color: '#d9b25a',
    drag: 7,
    kind: 'casing',
    angle: rand() * Math.PI,
    spin: randSpread(18),
  });
}

export function spawnDeath(w: World, pos: Vec2, dir: number): void {
  spawnBlood(w, pos, dir, 22);
  w.decals.push({ pos: { ...pos }, r: randRange(16, 24), color: 'rgba(90,14,24,0.5)' });
  for (let i = 0; i < 6; i++) {
    w.particles.push({
      pos: { ...pos },
      vel: fromAngle(rand() * Math.PI * 2, randRange(20, 90)),
      life: randRange(0.4, 0.9),
      maxLife: 0.9,
      size: randRange(3, 6),
      color: 'rgba(70,70,80,0.5)',
      drag: 2,
      kind: 'smoke',
      angle: 0,
      spin: 0,
    });
  }
}

export function updateFx(w: World, dt: number): void {
  // shake decays
  w.shake = Math.max(0, w.shake - 40 * dt * (0.2 + w.shake * 0.05));

  for (let i = w.tracers.length - 1; i >= 0; i--) {
    const t = w.tracers[i];
    t.life -= dt;
    if (t.life <= 0) w.tracers.splice(i, 1);
  }
  for (let i = w.muzzles.length - 1; i >= 0; i--) {
    const m = w.muzzles[i];
    m.life -= dt;
    if (m.life <= 0) w.muzzles.splice(i, 1);
  }
  for (let i = w.slashes.length - 1; i >= 0; i--) {
    const s = w.slashes[i];
    s.life -= dt;
    if (s.life <= 0) w.slashes.splice(i, 1);
  }
  for (let i = w.particles.length - 1; i >= 0; i--) {
    const p = w.particles[i];
    p.life -= dt;
    if (p.life <= 0) {
      w.particles.splice(i, 1);
      continue;
    }
    const f = Math.exp(-p.drag * dt);
    p.vel.x *= f;
    p.vel.y *= f;
    p.pos.x += p.vel.x * dt;
    p.pos.y += p.vel.y * dt;
    p.angle += p.spin * dt;
  }
  // Cap decals so long fights don't grow unbounded.
  if (w.decals.length > 60) w.decals.splice(0, w.decals.length - 60);

  // Skid marks fade out; cap the trail so laps don't grow unbounded.
  for (let i = w.skids.length - 1; i >= 0; i--) {
    w.skids[i].life -= dt;
    if (w.skids[i].life <= 0) w.skids.splice(i, 1);
  }
  if (w.skids.length > 400) w.skids.splice(0, w.skids.length - 400);
}

// Small helper so callers don't import v just for a throwaway point.
export const point = (x: number, y: number): Vec2 => v(x, y);
