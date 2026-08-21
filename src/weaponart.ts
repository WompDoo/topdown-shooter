// Maps each weapon to its sprite on the shared weapons atlas (public/sprites/
// weapons.png — "The Ultimate Weapons Pack" by Jestan, 48x24 grid). Rects are the
// tight pixel bounds of the chosen cell so we blit just the gun, no cell padding.
// Every sprite faces east (+x = barrel), grip toward the rear (left), which lines
// up with the entity's aim before the renderer rotates it.

import type { Weapon } from './weapon';

export interface WeaponArt {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  flip?: boolean; // source sprite faces west (barrel -x); mirror it to point east
}

export const WEAPON_SCALE = 0.8; // world px per source pixel
export const GRIP_FWD = 6; // world px the sprite's rear sits ahead of the entity centre

// Keyed by weapon name (unique across the roster).
const ART: Record<string, WeaponArt> = {
  // These atlas cells are drawn barrel-east (grip at the rear/left), so no flip.
  Sidearm: { sx: 48, sy: 144, sw: 14, sh: 7 },
  'MK-7 Carbine': { sx: 288, sy: 0, sw: 33, sh: 11 },
  'M60 HMG': { sx: 288, sy: 120, sw: 47, sh: 13 }, // c6r5 — bipod M60
  'Frag Grenade': { sx: 0, sy: 121, sw: 10, sh: 7 },
  'Raider Rifle': { sx: 192, sy: 72, sw: 34, sh: 10 },
  'Marksman Rifle': { sx: 288, sy: 144, sw: 44, sh: 12 },
  'Combat Knife': { sx: 48, sy: 216, sw: 8, sh: 7 },
  // These cells are drawn barrel-west, so flip them to point along the aim.
  'Vector SMG': { sx: 96, sy: 144, sw: 25, sh: 12, flip: true },
  Breacher: { sx: 144, sy: 24, sw: 39, sh: 9, flip: true },
  Longshot: { sx: 240, sy: 144, sw: 45, sh: 13, flip: true },
  'Scrap Shotgun': { sx: 144, sy: 0, sw: 21, sh: 9, flip: true },
  'Machine Pistol': { sx: 96, sy: 72, sw: 19, sh: 14, flip: true },
  'Grenade Launcher': { sx: 336, sy: 0, sw: 33, sh: 12, flip: true },
  'Rocket Launcher': { sx: 336, sy: 24, sw: 47, sh: 11, flip: true }, // c7r1 — warhead launcher
  Flamethrower: { sx: 384, sy: 0, sw: 36, sh: 18, flip: true }, // c8r0 — tank + nozzle
};

export const weaponArt = (w: Weapon): WeaponArt | null => ART[w.name] ?? null;

// Forward distance from the entity centre to the drawn barrel tip, so muzzle
// flash, tracers, and casings originate where the sprite's muzzle is. Falls back
// to the old fixed offset for any weapon without art.
export function barrelDist(w: Weapon, radius: number): number {
  const a = ART[w.name];
  return a ? GRIP_FWD + a.sw * WEAPON_SCALE : radius + 6;
}
