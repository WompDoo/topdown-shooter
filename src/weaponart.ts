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
}

export const WEAPON_SCALE = 0.8; // world px per source pixel
export const GRIP_FWD = 6; // world px the sprite's rear sits ahead of the entity centre

// Keyed by weapon name (unique across the roster).
const ART: Record<string, WeaponArt> = {
  Sidearm: { sx: 48, sy: 144, sw: 14, sh: 7 },
  'MK-7 Carbine': { sx: 288, sy: 0, sw: 33, sh: 11 },
  Breacher: { sx: 144, sy: 24, sw: 39, sh: 9 },
  Longshot: { sx: 240, sy: 144, sw: 45, sh: 13 },
  'Combat Knife': { sx: 48, sy: 216, sw: 8, sh: 7 },
  'Raider Rifle': { sx: 192, sy: 72, sw: 34, sh: 10 },
  'Scrap Shotgun': { sx: 144, sy: 0, sw: 21, sh: 9 },
  'Machine Pistol': { sx: 96, sy: 72, sw: 19, sh: 14 },
  'Marksman Rifle': { sx: 288, sy: 144, sw: 44, sh: 12 },
};

export const weaponArt = (w: Weapon): WeaponArt | null => ART[w.name] ?? null;

// Forward distance from the entity centre to the drawn barrel tip, so muzzle
// flash, tracers, and casings originate where the sprite's muzzle is. Falls back
// to the old fixed offset for any weapon without art.
export function barrelDist(w: Weapon, radius: number): number {
  const a = ART[w.name];
  return a ? GRIP_FWD + a.sw * WEAPON_SCALE : radius + 6;
}
