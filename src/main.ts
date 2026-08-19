// Bootstrap + game loop. Fixed 60 Hz sim with an accumulator; hitstop freezes
// the sim (not the render); camera follows the player, or their car when driving.

import { createInput } from './input';
import { buildWorld, DEFAULT_LOADOUT } from './world';
import { equipWeapon, updatePlayer } from './player';
import { updateEnemies } from './enemy';
import { updateCivilians } from './civilian';
import { updateFx } from './fx';
import {
  AUTO_PATH_RANGE,
  carEffects,
  ENTER_REACH,
  enterCar,
  exitCar,
  nearestCarIndex,
  resolveCarCollisions,
  updateCar,
  updateLooseCar,
} from './car';
import { render, type Camera } from './render';
import { initAudio } from './audio';
import { clamp, lerp } from './math';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ctx = canvas.getContext('2d');
if (!ctx) throw new Error('2D canvas unsupported');
document.getElementById('boot')?.remove();

let cssW = 0;
let cssH = 0;
let dpr = 1;
function resize(): void {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  cssW = window.innerWidth;
  cssH = window.innerHeight;
  canvas.width = Math.floor(cssW * dpr);
  canvas.height = Math.floor(cssH * dpr);
  canvas.style.width = `${cssW}px`;
  canvas.style.height = `${cssH}px`;
}
resize();
window.addEventListener('resize', resize);

const input = createInput(canvas);

const armAudio = (): void => {
  initAudio();
  window.removeEventListener('pointerdown', armAudio);
  window.removeEventListener('keydown', armAudio);
};
window.addEventListener('pointerdown', armAudio);
window.addEventListener('keydown', armAudio);

const BASE_ZOOM = 0.95;
let world = buildWorld(DEFAULT_LOADOUT);
const cam: Camera = { x: world.player.pos.x, y: world.player.pos.y, zoom: BASE_ZOOM };

function screenToWorld(mx: number, my: number): { x: number; y: number } {
  return { x: (mx - cssW / 2) / cam.zoom + cam.x, y: (my - cssH / 2) / cam.zoom + cam.y };
}

const STEP = 1 / 60;
let acc = 0;
let last = performance.now();

function fixedUpdate(dt: number): void {
  const w = world;
  w.time += dt;

  if (w.state === 'playing') {
    const p = w.player;
    p.enterTimer = Math.max(0, p.enterTimer - dt);
    if (p.inCar >= 0) {
      updateCar(w, w.cars[p.inCar], input, dt);
      if (input.pressed('KeyF') && p.enterTimer <= 0) exitCar(w);
    } else {
      updatePlayer(w, input, screenToWorld(input.mouse.x, input.mouse.y), dt);
      if (input.pressed('KeyF') && p.enterTimer <= 0 && p.dive <= 0) {
        const idx = nearestCarIndex(w, AUTO_PATH_RANGE);
        if (idx >= 0) {
          const car = w.cars[idx];
          const d = Math.hypot(car.pos.x - p.pos.x, car.pos.y - p.pos.y);
          if (d <= p.radius + ENTER_REACH) enterCar(w, idx);
          else p.walkTo = idx;
        }
      }
    }
    // Abandoned / bumped cars keep their momentum and coast on their own.
    for (let i = 0; i < w.cars.length; i++) {
      if (i !== p.inCar) updateLooseCar(w, w.cars[i], dt);
    }
    resolveCarCollisions(w);
    for (const c of w.cars) carEffects(w, c, dt);
    // Keep the driven car and the player pinned together after any shove.
    if (p.inCar >= 0) {
      p.pos.x = w.cars[p.inCar].pos.x;
      p.pos.y = w.cars[p.inCar].pos.y;
    }
    updateEnemies(w, dt);
    updateCivilians(w, dt);
    // Weapon pickups: walk over one to equip it (swaps the active slot).
    if (p.inCar < 0 && !p.downed && p.dive <= 0) {
      for (const pk of w.pickups) {
        if (p.weapon.name === pk.weapon.name) continue;
        if (Math.hypot(pk.pos.x - p.pos.x, pk.pos.y - p.pos.y) < p.radius + pk.radius) {
          equipWeapon(p, pk.weapon);
          break;
        }
      }
    }
  } else if (input.pressed('KeyR')) {
    world = buildWorld(DEFAULT_LOADOUT);
    cam.x = world.player.pos.x;
    cam.y = world.player.pos.y;
  }
  updateFx(w, dt);
}

function updateCamera(dt: number): void {
  const p = world.player;
  const car = p.inCar >= 0 ? world.cars[p.inCar] : null;
  const focus = car ? car.pos : p.pos;
  let leadX: number;
  let leadY: number;
  if (car) {
    leadX = clamp(car.vel.x * 0.35, -260, 260);
    leadY = clamp(car.vel.y * 0.35, -260, 260);
  } else {
    const aim = screenToWorld(input.mouse.x, input.mouse.y);
    leadX = clamp(aim.x - p.pos.x, -200, 200) * 0.35;
    leadY = clamp(aim.y - p.pos.y, -200, 200) * 0.35;
  }
  let tx = focus.x + leadX;
  let ty = focus.y + leadY;
  const hw = cssW / 2 / cam.zoom;
  const hh = cssH / 2 / cam.zoom;
  if (world.bounds.w > hw * 2) tx = clamp(tx, world.bounds.x + hw, world.bounds.x + world.bounds.w - hw);
  if (world.bounds.h > hh * 2) ty = clamp(ty, world.bounds.y + hh, world.bounds.y + world.bounds.h - hh);
  const k = 1 - Math.exp(-9 * dt);
  cam.x = lerp(cam.x, tx, k);
  cam.y = lerp(cam.y, ty, k);
}

function frame(now: number): void {
  let elapsed = (now - last) / 1000;
  last = now;
  if (elapsed > 0.1) elapsed = 0.1;

  if (world.hitstop > 0) {
    world.hitstop = Math.max(0, world.hitstop - elapsed);
  } else {
    acc += elapsed;
    while (acc >= STEP) {
      fixedUpdate(STEP);
      input.endFrame();
      acc -= STEP;
    }
  }

  updateCamera(elapsed);
  render(ctx as CanvasRenderingContext2D, world, cam, input, cssW, cssH, dpr);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
