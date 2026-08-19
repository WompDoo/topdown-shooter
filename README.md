# Top-down Shooter

A GTA-2-style top-down open-world sandbox: walk and drive around a small city and
fight hostiles with kinetic, deadly gunplay. **v1 is pure freedom** — no missions,
no runs, no stealth. Just roam, shoot, and drive.

Browser-native, Canvas-2D, no framework. Fixed 60 Hz sim + a Canvas renderer on
top. (Extracted from the ASHWAKE repo into its own project.)

## Run

```
npm install
npm run dev        # open the printed http://localhost:5173/
```

Other scripts: `npm run build` (production bundle to `dist/`), `npm run preview`,
`npm run lint`, `npm run typecheck`.

## Controls

| Input | Action |
| --- | --- |
| WASD / arrows | Move (on foot) / drive (in a car) |
| Mouse | Aim |
| Left mouse | Fire (auto or semi per weapon; swing for the knife) |
| F | Enter / exit the nearest car (bail at speed to tumble out) |
| Space | Handbrake (in a car) — breaks traction for slides |
| 1 / 2 | Swap primary / secondary |
| R | Reload |

## What's in (v1)

- **Four-district sandbox:** a walled **battle arena** (top-left) for combat
  testing, a **city** grid with roads (top-right), a **testing lot** with one of
  every vehicle and a rack of weapon pickups (bottom-right), and a **racing
  circuit** with guardrails, an infield and a start line (bottom-left). You spawn
  in the open middle. Full visibility, camera follows you, minimap.
- **Weapon pickups:** every gun (and the knife) sits on a pad in the testing lot;
  walk over one to equip it.
- **Kinetic gunplay:** hitscan with recoil bloom, muzzle flash, tracers, casing
  ejection, screen shake, hitstop, blood, procedural SFX; magazine + reload; a
  primary + secondary you swap with 1/2 (pistol / rifle / shotgun / sniper / knife).
- **Cars:** arcade momentum + grippy steering, a Space handbrake to drift (with
  tyre marks), physics-based wall collisions (glancing hits slide, they don't dead-
  stop), and lethal run-overs at speed. Bail out while moving for a GTA-style tumble
  while the car keeps rolling. Sit in a car and bullets hit the car, not you.
- **Hostiles:** scattered gunmen, SMG runners, shotgun brutes, and marksmen. They
  idle/wander until they see you or you provoke them, then chase and shoot with a
  brief telegraph. Low player HP, no regen. Die → `WASTED`, press R to respawn.
- **Civilians:** unarmed city-dwellers who wander until danger is near — gunfire,
  a hostile, a speeding car — then sprint away from it. They never fight, but can
  be caught in the crossfire.

## Architecture

| File | Role |
| --- | --- |
| `src/math.ts` | vectors, RNG, ray/rect/circle casts, collision |
| `src/world.ts` | entity shapes, weapon assignment, the four-district map + pickups |
| `src/weapon.ts` | weapon tuning (data) |
| `src/weaponart.ts` | maps each weapon to its sprite cell + barrel offset |
| `src/player.ts` | on-foot movement, the weapon loop, the bail-out dive, pickups |
| `src/car.ts` | arcade car physics, drifting, wall response, run-overs, enter/exit |
| `src/enemy.ts` | aggro AI (idle/wander → chase-and-shoot) |
| `src/civilian.ts` | neutral crowd AI (wander → flee from danger) |
| `src/combat.ts` | shot + melee resolution, line-of-sight, aggro, civilian panic |
| `src/fx.ts` | particles, tracers, slashes, skid marks, shake, hitstop |
| `src/audio.ts` | procedural SFX + drop-in sample loader |
| `src/render.ts` | Canvas-2D draw: world, weapons, civilians, pickups, HUD, minimap |
| `src/input.ts` | keyboard + mouse (multi-button safe) |
| `src/main.ts` | loop, camera follow, enter/exit, respawn |

## Audio

Per-weapon procedural WebAudio (synth). A drop-in loader checks
`public/sfx/<name>.{ogg,wav,mp3}` on startup and uses real files if present.

## Deploy

Pushing to `main` runs CI (lint + typecheck + build) and deploys `dist/` to
Cloudflare Pages via GitHub Actions (`.github/workflows/ci.yml`). Requires the
repo Actions secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.

Pull requests also get their own Cloudflare Pages preview deployment, so a branch
can be played on a live URL before it's merged.

## Credits

Weapon sprites are from **"The Ultimate Weapons Pack" by Jestan**, used under
Jestan's Public License (free use in games with attribution). The sheet ships as
`public/sprites/weapons.png`; `src/weaponart.ts` maps each in-game weapon to its
cell on it.
