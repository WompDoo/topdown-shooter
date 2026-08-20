// Weapon tuning as data. Guns and one melee. Spread in radians, time in seconds,
// distance in world px. Player picks a random weapon each spawn (PLAYER_WEAPONS).

export type WeaponSound = 'pistol' | 'rifle' | 'shotgun' | 'sniper' | 'knife';

export interface Weapon {
  name: string;
  kind: 'gun' | 'melee';
  sound: WeaponSound;
  auto: boolean; // held-to-fire vs semi (one shot per click)
  rpm: number; // fire cadence for guns
  damage: number;
  pellets: number; // >1 for shotguns
  spreadMin: number;
  spreadMax: number;
  spreadPerShot: number;
  spreadRecover: number;
  mag: number; // 0 for melee
  reloadTime: number;
  range: number;
  knockback: number;
  recoilKick: number;
  shake: number;
  muzzleSize: number;
  // aim-down-sights modifiers
  adsZoom: number; // camera zoom multiplier while aiming
  adsMoveMult: number; // movement speed while aiming
  adsSpreadMult: number; // cone multiplier while aiming (lower = tighter)
  // melee only
  reach: number;
  arc: number; // half-arc in radians
  lunge: number; // forward dash speed on swing
  swingTime: number; // seconds between swings
}

const GUN = {
  kind: 'gun' as const,
  pellets: 1,
  reach: 0,
  arc: 0,
  lunge: 0,
  swingTime: 0,
};

export const PISTOL: Weapon = {
  ...GUN,
  name: 'Sidearm',
  sound: 'pistol',
  auto: false,
  rpm: 300,
  damage: 30,
  spreadMin: 0.02,
  spreadMax: 0.13,
  spreadPerShot: 0.035,
  spreadRecover: 1.5,
  mag: 12,
  reloadTime: 1.15,
  range: 720,
  knockback: 70,
  recoilKick: 0.05,
  shake: 1.8,
  muzzleSize: 15,
  adsZoom: 1.3,
  adsMoveMult: 0.6,
  adsSpreadMult: 0.4,
};

export const RIFLE: Weapon = {
  ...GUN,
  name: 'MK-7 Carbine',
  sound: 'rifle',
  auto: true,
  rpm: 620,
  damage: 22,
  spreadMin: 0.014,
  spreadMax: 0.2,
  spreadPerShot: 0.028,
  spreadRecover: 0.95,
  mag: 30,
  reloadTime: 1.5,
  range: 900,
  knockback: 85,
  recoilKick: 0.05,
  shake: 2.2,
  muzzleSize: 20,
  adsZoom: 1.28,
  adsMoveMult: 0.5,
  adsSpreadMult: 0.45,
};

export const SHOTGUN: Weapon = {
  ...GUN,
  name: 'Breacher',
  sound: 'shotgun',
  auto: false,
  rpm: 85,
  damage: 12, // per pellet
  pellets: 9,
  spreadMin: 0.17,
  spreadMax: 0.28,
  spreadPerShot: 0.02,
  spreadRecover: 1.6,
  mag: 6,
  reloadTime: 2.5,
  range: 470,
  knockback: 210,
  recoilKick: 0.13,
  shake: 5.5,
  muzzleSize: 30,
  adsZoom: 1.16,
  adsMoveMult: 0.6,
  adsSpreadMult: 0.62,
};

export const SNIPER: Weapon = {
  ...GUN,
  name: 'Longshot',
  sound: 'sniper',
  auto: false,
  rpm: 55,
  damage: 125, // one-shots most raiders
  spreadMin: 0.07, // wild from the hip: ADS is mandatory
  spreadMax: 0.16,
  spreadPerShot: 0.05,
  spreadRecover: 1.1,
  mag: 5,
  reloadTime: 2.8,
  range: 1500,
  knockback: 150,
  recoilKick: 0.2,
  shake: 6.5,
  muzzleSize: 26,
  adsZoom: 1.75,
  adsMoveMult: 0.32,
  adsSpreadMult: 0.05, // pinpoint when scoped
};

export const SMG: Weapon = {
  ...GUN,
  name: 'Vector SMG',
  sound: 'pistol',
  auto: true,
  rpm: 900,
  damage: 14,
  spreadMin: 0.05,
  spreadMax: 0.19,
  spreadPerShot: 0.02,
  spreadRecover: 1.5,
  mag: 32,
  reloadTime: 1.6,
  range: 620,
  knockback: 45,
  recoilKick: 0.035,
  shake: 1.6,
  muzzleSize: 15,
  adsZoom: 1.22,
  adsMoveMult: 0.62,
  adsSpreadMult: 0.5,
};

export const HMG: Weapon = {
  ...GUN,
  name: 'M60 HMG',
  sound: 'rifle',
  auto: true,
  rpm: 600,
  damage: 34,
  spreadMin: 0.03,
  spreadMax: 0.26,
  spreadPerShot: 0.03,
  spreadRecover: 0.8,
  mag: 100,
  reloadTime: 4.5,
  range: 1000,
  knockback: 120,
  recoilKick: 0.06,
  shake: 3.2,
  muzzleSize: 26,
  adsZoom: 1.18,
  adsMoveMult: 0.4, // heavy: you slow right down behind it
  adsSpreadMult: 0.55,
};

export const KNIFE: Weapon = {
  ...GUN,
  kind: 'melee',
  name: 'Combat Knife',
  sound: 'knife',
  auto: false,
  rpm: 0,
  damage: 95,
  mag: 0,
  reloadTime: 0,
  spreadMin: 0,
  spreadMax: 0,
  spreadPerShot: 0,
  spreadRecover: 0,
  range: 46,
  knockback: 180,
  recoilKick: 0,
  shake: 3,
  muzzleSize: 0,
  adsZoom: 1.0,
  adsMoveMult: 1,
  adsSpreadMult: 1,
  reach: 46,
  arc: 1.0, // ~115 deg total
  lunge: 320,
  swingTime: 0.34,
};

export const PLAYER_WEAPONS: Weapon[] = [PISTOL, SMG, RIFLE, HMG, SHOTGUN, SNIPER, KNIFE];

// --- Enemy weapons ---

export const ENEMY_RIFLE: Weapon = {
  ...GUN,
  name: 'Raider Rifle',
  sound: 'rifle',
  auto: true,
  rpm: 480,
  damage: 15,
  spreadMin: 0.04,
  spreadMax: 0.12,
  spreadPerShot: 0.02,
  spreadRecover: 1.2,
  mag: 24,
  reloadTime: 2.2,
  range: 820,
  knockback: 40,
  recoilKick: 0.03,
  shake: 0,
  muzzleSize: 16,
  adsZoom: 1,
  adsMoveMult: 1,
  adsSpreadMult: 1,
};

export const ENEMY_SHOTGUN: Weapon = {
  ...GUN,
  name: 'Scrap Shotgun',
  sound: 'shotgun',
  auto: false,
  rpm: 70,
  damage: 7, // per pellet, brutal up close
  pellets: 7,
  spreadMin: 0.22,
  spreadMax: 0.3,
  spreadPerShot: 0.02,
  spreadRecover: 1.5,
  mag: 5,
  reloadTime: 2.4,
  range: 400,
  knockback: 90,
  recoilKick: 0.05,
  shake: 0,
  muzzleSize: 22,
  adsZoom: 1,
  adsMoveMult: 1,
  adsSpreadMult: 1,
};

export const ENEMY_SMG: Weapon = {
  ...GUN,
  name: 'Machine Pistol',
  sound: 'pistol',
  auto: true,
  rpm: 720,
  damage: 8,
  spreadMin: 0.09,
  spreadMax: 0.18,
  spreadPerShot: 0.025,
  spreadRecover: 1.4,
  mag: 28,
  reloadTime: 2.0,
  range: 600,
  knockback: 30,
  recoilKick: 0.03,
  shake: 0,
  muzzleSize: 14,
  adsZoom: 1,
  adsMoveMult: 1,
  adsSpreadMult: 1,
};

export const ENEMY_SNIPER: Weapon = {
  ...GUN,
  name: 'Marksman Rifle',
  sound: 'sniper',
  auto: false,
  rpm: 40,
  damage: 42,
  spreadMin: 0.015,
  spreadMax: 0.05,
  spreadPerShot: 0.03,
  spreadRecover: 1.0,
  mag: 4,
  reloadTime: 3.0,
  range: 1400,
  knockback: 60,
  recoilKick: 0.05,
  shake: 0,
  muzzleSize: 18,
  adsZoom: 1,
  adsMoveMult: 1,
  adsSpreadMult: 1,
};

export const fireInterval = (w: Weapon): number => (w.rpm > 0 ? 60 / w.rpm : w.swingTime);
