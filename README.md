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

- **Open city:** a 7x5 grid of building blocks with roads and a central plaza,
  plus a small guardrailed **test racetrack** in the corner where you spawn (on
  the start line, with a race car). Full visibility, camera follows you, minimap.
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

## Architecture

| File | Role |
| --- | --- |
| `src/math.ts` | vectors, RNG, ray/rect/circle casts, collision |
| `src/world.ts` | entity shapes, weapon assignment, city + track layout |
| `src/weapon.ts` | weapon tuning (data) |
| `src/player.ts` | on-foot movement, the weapon loop, the bail-out dive |
| `src/car.ts` | arcade car physics, drifting, wall response, run-overs, enter/exit |
| `src/enemy.ts` | aggro AI (idle/wander → chase-and-shoot) |
| `src/combat.ts` | shot + melee resolution, line-of-sight, aggro |
| `src/fx.ts` | particles, tracers, slashes, skid marks, shake, hitstop |
| `src/audio.ts` | procedural SFX + drop-in sample loader |
| `src/render.ts` | Canvas-2D draw, camera, HUD, minimap |
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
