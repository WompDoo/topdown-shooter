// On-foot player controller: movement, mouse-aim, the weapon loop (guns:
// auto/semi/pellets with recoil bloom + reload; knife: lunge + arc melee), and
// weapon swap. Collides with buildings and cars.

import type { Input } from './input';
import type { Player, World } from './world';
import type { Vec2 } from './math';
import type { Weapon } from './weapon';
import { driverDoor, enterCar } from './car';
import { add, angleOf, approach, clamp, collideCircleSegment, fromAngle, len, randSpread, resolveCircleRect, scale, sub } from './math';
import { fireInterval } from './weapon';
import { barrelDist } from './weaponart';
import { meleeHit, resolveShot } from './combat';
import { spawnProjectile } from './projectile';
import { addShake, spawnCasing, spawnMuzzle, spawnSlash } from './fx';
import { sfxDryFire, sfxReload, sfxWeapon } from './audio';

const MOVE_SPEED = 205;
const SPRINT_MULT = 1.6; // speed boost while holding Shift on foot
const DIVE_DRAG = 3.2; // ground friction while tumbling out of a car

// Push the player out of walls and cars, then clamp to the world.
function resolveFoot(w: World, p: Player): void {
  for (const b of w.solids) resolveCircleRect(p.pos, p.radius, b);
  const t = w.track;
  if (
    t &&
    p.pos.x > t.bbox.x - 40 &&
    p.pos.x < t.bbox.x + t.bbox.w + 40 &&
    p.pos.y > t.bbox.y - 40 &&
    p.pos.y < t.bbox.y + t.bbox.h + 40
  ) {
    for (const s of t.walls) collideCircleSegment(p.pos, p.radius, s.a, s.b, t.wallHalf);
  }
  for (const c of w.cars) {
    const dx = p.pos.x - c.pos.x;
    const dy = p.pos.y - c.pos.y;
    const d = Math.hypot(dx, dy);
    const mind = p.radius + c.radius;
    if (d < mind && d > 1e-3) {
      p.pos.x = c.pos.x + (dx / d) * mind;
      p.pos.y = c.pos.y + (dy / d) * mind;
    }
  }
  p.pos.x = clamp(p.pos.x, w.bounds.x + p.radius, w.bounds.x + w.bounds.w - p.radius);
  p.pos.y = clamp(p.pos.y, w.bounds.y + p.radius, w.bounds.y + w.bounds.h - p.radius);
}

// Tumbling bail-out from a moving car: carry the inherited momentum, slide with
// friction and spin, no aiming or shooting until you come to rest and pop up.
function updateDive(w: World, p: Player, dt: number): void {
  p.dive = Math.max(0, p.dive - dt);
  const sp = Math.hypot(p.vel.x, p.vel.y);
  const f = Math.max(0, 1 - DIVE_DRAG * dt);
  p.vel.x *= f;
  p.vel.y *= f;
  p.roll += (6 + sp * 0.03) * dt;
  p.pos.x += p.vel.x * dt;
  p.pos.y += p.vel.y * dt;
  resolveFoot(w, p);
  if (p.dive <= 0 || sp < 26) {
    p.dive = 0;
    p.roll = 0;
  }
  p.flash = Math.max(0, p.flash - dt);
  p.ads = Math.max(0, p.ads - dt * 6);
}

export function swapWeapon(p: Player, next: number): void {
  if (next === p.slot || next < 0 || next >= p.slots.length) return;
  p.slotAmmo[p.slot] = p.ammo;
  p.slot = next;
  p.weapon = p.slots[next];
  p.ammo = p.slotAmmo[next];
  p.reloading = false;
  p.reloadTimer = 0;
  p.fireTimer = Math.max(p.fireTimer, 0.12);
  p.spread = p.weapon.spreadMin;
}

// Equip a weapon grabbed off the ground into the active slot, topped up.
export function equipWeapon(p: Player, weapon: Weapon): void {
  p.slots[p.slot] = weapon;
  p.weapon = weapon;
  p.slotAmmo[p.slot] = weapon.mag;
  p.ammo = weapon.mag;
  p.reloading = false;
  p.reloadTimer = 0;
  p.fireTimer = Math.max(p.fireTimer, 0.12);
  p.spread = weapon.spreadMin;
}

function startReload(p: Player): void {
  if (p.reloading || p.ammo >= p.weapon.mag || p.weapon.mag <= 0) return;
  p.reloading = true;
  p.reloadTimer = p.weapon.reloadTime;
  sfxReload();
}

export function updatePlayer(w: World, input: Input, aimWorld: Vec2, dt: number): void {
  const p = w.player;

  if (p.downed) {
    p.flash = Math.max(0, p.flash - dt);
    p.swing = Math.max(0, p.swing - dt);
    p.ads = 0;
    return;
  }

  if (p.dive > 0) {
    updateDive(w, p, dt);
    return;
  }

  if (input.pressed('Digit1')) swapWeapon(p, 0);
  else if (input.pressed('Digit2')) swapWeapon(p, 1);

  const wpn = p.weapon;
  const isMelee = wpn.kind === 'melee';
  p.aim = angleOf(sub(aimWorld, p.pos));
  const aimDir = fromAngle(p.aim);

  // Aim down sights (hold right mouse): zoom (camera, in main), a tighter cone
  // and slower walk. Guns only; smoothed so it eases in and out.
  const wantAds = input.rightDown && !isMelee;
  p.ads = approach(p.ads, wantAds ? 1 : 0, dt * 8);

  // --- Move ---
  let ix = 0;
  let iy = 0;
  if (input.isDown('KeyA') || input.isDown('ArrowLeft')) ix -= 1;
  if (input.isDown('KeyD') || input.isDown('ArrowRight')) ix += 1;
  if (input.isDown('KeyW') || input.isDown('ArrowUp')) iy -= 1;
  if (input.isDown('KeyS') || input.isDown('ArrowDown')) iy += 1;

  // Auto-walk to a car after pressing F near it. Any manual input cancels it;
  // arriving hops in.
  if (p.walkTo >= 0) {
    const car = w.cars[p.walkTo];
    if (ix !== 0 || iy !== 0 || !car || car.dead) {
      p.walkTo = -1;
    } else {
      const door = driverDoor(car);
      const dx = door.x - p.pos.x;
      const dy = door.y - p.pos.y;
      const d = Math.hypot(dx, dy);
      if (d <= p.radius + 8) {
        enterCar(w, p.walkTo);
        p.walkTo = -1;
        return;
      }
      ix = dx / d;
      iy = dy / d;
    }
  }

  const moveLen = Math.hypot(ix, iy);
  const move: Vec2 = moveLen > 0 ? { x: ix / moveLen, y: iy / moveLen } : { x: 0, y: 0 };
  const sprinting = (input.isDown('ShiftLeft') || input.isDown('ShiftRight')) && p.ads < 0.5;
  const adsMove = 1 + (wpn.adsMoveMult - 1) * p.ads;
  p.vel = scale(move, MOVE_SPEED * (sprinting ? SPRINT_MULT : 1) * adsMove);
  if (isMelee && p.swing > 0) {
    const l = wpn.lunge * (p.swing / wpn.swingTime);
    p.vel.x += aimDir.x * l;
    p.vel.y += aimDir.y * l;
  }
  p.pos.x += p.vel.x * dt;
  p.pos.y += p.vel.y * dt;

  resolveFoot(w, p);

  // --- Fire ---
  const heldFire = input.mouseDown;
  const semiEdge = input.pressed('Mouse0');
  const wantFire = isMelee ? semiEdge : wpn.auto ? heldFire : semiEdge;
  const canFire = !isMelee && wantFire && !p.reloading && p.ammo > 0 && w.state === 'playing';

  if (!isMelee) {
    if (input.pressed('KeyR')) startReload(p);
    if (p.reloading) {
      p.reloadTimer -= dt;
      if (p.reloadTimer <= 0) {
        p.ammo = wpn.mag;
        p.reloading = false;
      }
    }
  }

  p.fireTimer -= dt;
  p.swing = Math.max(0, p.swing - dt);
  let fired = false;

  if (isMelee) {
    if (wantFire && p.fireTimer <= 0) {
      const origin = add(p.pos, scale(aimDir, p.radius));
      meleeHit(w, origin, p.aim, wpn.reach, wpn.arc, wpn.damage, wpn.knockback);
      spawnSlash(w, add(p.pos, scale(aimDir, p.radius + 4)), p.aim, wpn.arc, wpn.reach);
      addShake(w, wpn.shake);
      sfxWeapon(wpn.sound);
      p.fireTimer = wpn.swingTime;
      p.swing = wpn.swingTime;
      p.aimKick = 0.3;
    }
  } else {
    const shootOrigin = add(p.pos, scale(aimDir, barrelDist(wpn, p.radius)));
    if (canFire && p.fireTimer <= 0) {
      const cone = Math.min(p.spread, wpn.spreadMax) * (1 + (wpn.adsSpreadMult - 1) * p.ads);
      if (wpn.projectile) {
        // lob / launch an explosive instead of a hitscan shot
        spawnProjectile(w, shootOrigin, p.aim + randSpread(cone), wpn, 'player');
      } else {
        const pellets = Math.max(1, wpn.pellets);
        for (let i = 0; i < pellets; i++) {
          resolveShot(w, shootOrigin, p.aim + randSpread(cone), wpn.damage, wpn.range, 'player', wpn.knockback);
        }
      }
      p.ammo -= 1;
      p.spread = Math.min(p.spread + wpn.spreadPerShot, wpn.spreadMax);
      p.aimKick = Math.min(p.aimKick + wpn.recoilKick, 0.6);
      p.muzzleTimer = 0.05;
      if (wpn.muzzleSize > 0) spawnMuzzle(w, shootOrigin, p.aim, wpn.muzzleSize);
      if (!wpn.projectile) spawnCasing(w, shootOrigin, p.aim); // no shell for a lobbed grenade
      addShake(w, wpn.shake);
      sfxWeapon(wpn.sound);
      p.fireTimer = fireInterval(wpn);
      fired = true;
      if (p.ammo <= 0) startReload(p);
    } else if (heldFire && p.ammo <= 0 && !p.reloading && p.fireTimer <= 0) {
      sfxDryFire();
      startReload(p);
      p.fireTimer = 0.25;
    }
    const moving = len(p.vel) > 20;
    const restCone = wpn.spreadMin + (moving ? 0.06 : 0);
    if (!fired) p.spread = Math.max(restCone, p.spread - wpn.spreadRecover * dt);
  }

  p.aimKick = approach(p.aimKick, 0, dt * 3.2);
  p.muzzleTimer = Math.max(0, p.muzzleTimer - dt);
  p.flash = Math.max(0, p.flash - dt);
}
