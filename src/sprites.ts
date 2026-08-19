// Vehicle sprite atlases. Each atlas /sprites/<kind>_<variant>.png is a grid of
// VEHICLE_FRAMES frame columns x 8 direction rows (rows ordered by heading step
// k = round(angle / 45deg): E, SE, S, SW, W, NW, N, NE, +y down). Atlases load
// lazily on first use, so only the vehicles actually placed are ever fetched;
// render falls back to a drawn rectangle until one arrives.

import { VEHICLES, type VehicleKind } from './vehicles';

// Reference RGB per baked colour variant, for mapping a car's tint to the
// nearest atlas. Liveried kinds ignore this and use the single 'default' file.
const VARIANTS: Record<string, [number, number, number]> = {
  black: [30, 30, 34],
  blue: [60, 110, 200],
  brown: [150, 90, 50],
  green: [70, 160, 90],
  magenta: [150, 80, 190],
  red: [200, 60, 60],
  white: [220, 220, 225],
  yellow: [210, 190, 70],
};

const images: Record<string, HTMLImageElement> = {};
const variantCache: Record<string, string> = {};

function nearestVariant(color: string): string {
  const cached = variantCache[color];
  if (cached) return cached;
  const r = parseInt(color.slice(1, 3), 16);
  const g = parseInt(color.slice(3, 5), 16);
  const b = parseInt(color.slice(5, 7), 16);
  let best = 'black';
  let bestD = Infinity;
  for (const [name, ref] of Object.entries(VARIANTS)) {
    const d = (r - ref[0]) ** 2 + (g - ref[1]) ** 2 + (b - ref[2]) ** 2;
    if (d < bestD) {
      bestD = d;
      best = name;
    }
  }
  variantCache[color] = best;
  return best;
}

// The atlas for a vehicle's kind + tint, or null until it has loaded. Kicks off
// the fetch on first request and caches the element thereafter.
export function vehicleAtlas(kind: VehicleKind, color: string): HTMLImageElement | null {
  const variant = VEHICLES[kind].liveried ? 'default' : nearestVariant(color);
  const key = `${kind}_${variant}`;
  return load(key);
}

// The burnt-wreck atlas for a kind (8 headings in one row, colour-independent).
export function wreckAtlas(kind: VehicleKind): HTMLImageElement | null {
  return load(`wreck_${kind}`);
}

function load(key: string): HTMLImageElement | null {
  let img = images[key];
  if (!img) {
    img = new Image();
    img.src = `sprites/${key}.png`;
    images[key] = img;
  }
  return img.complete && img.naturalWidth > 0 ? img : null;
}
