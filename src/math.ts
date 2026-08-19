// Small vector + geometry + RNG toolkit for the top-down shooter prototype.
// No dependencies. World units are pixels at zoom 1.

export interface Vec2 {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const v = (x = 0, y = 0): Vec2 => ({ x, y });
export const clone = (a: Vec2): Vec2 => ({ x: a.x, y: a.y });
export const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y });
export const scale = (a: Vec2, s: number): Vec2 => ({ x: a.x * s, y: a.y * s });
export const len2 = (a: Vec2): number => a.x * a.x + a.y * a.y;
export const len = (a: Vec2): number => Math.hypot(a.x, a.y);
export const dist = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.y - b.y);
export const dot = (a: Vec2, b: Vec2): number => a.x * b.x + a.y * b.y;
export const angleOf = (a: Vec2): number => Math.atan2(a.y, a.x);
export const fromAngle = (a: number, r = 1): Vec2 => ({ x: Math.cos(a) * r, y: Math.sin(a) * r });

export function norm(a: Vec2): Vec2 {
  const l = len(a);
  return l > 1e-6 ? { x: a.x / l, y: a.y / l } : { x: 0, y: 0 };
}

export const clamp = (x: number, lo: number, hi: number): number =>
  x < lo ? lo : x > hi ? hi : x;
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

// Move `cur` toward `target` by at most `delta` (frame-rate independent easing helper).
export function approach(cur: number, target: number, delta: number): number {
  if (cur < target) return Math.min(cur + delta, target);
  if (cur > target) return Math.max(cur - delta, target);
  return cur;
}

// Shortest signed angle difference b - a, wrapped to [-PI, PI].
export function angleDiff(a: number, b: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

// --- Seeded RNG (mulberry32). Deterministic, matches the project's ethos. ---
export function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Seeded from the clock so each page load / run differs (this prototype does not
// need determinism — unlike the main ASHWAKE sim).
const rng = makeRng((Date.now() ^ (Date.now() >>> 9) ^ 0x1a5b) >>> 0);
export const rand = (): number => rng();
export const randRange = (a: number, b: number): number => a + (b - a) * rng();
export const randSpread = (m: number): number => (rng() * 2 - 1) * m;

// --- Ray casts (origin + normalized dir, bounded by maxDist). ---

// Ray vs axis-aligned rect (slab method). Returns entry distance or Infinity.
export function rayVsRect(o: Vec2, d: Vec2, maxDist: number, r: Rect): number {
  const invx = d.x !== 0 ? 1 / d.x : Infinity;
  const invy = d.y !== 0 ? 1 / d.y : Infinity;
  let t1 = (r.x - o.x) * invx;
  let t2 = (r.x + r.w - o.x) * invx;
  let t3 = (r.y - o.y) * invy;
  let t4 = (r.y + r.h - o.y) * invy;
  if (t1 > t2) [t1, t2] = [t2, t1];
  if (t3 > t4) [t3, t4] = [t4, t3];
  const tmin = Math.max(t1, t3);
  const tmax = Math.min(t2, t4);
  if (tmax < 0 || tmin > tmax) return Infinity;
  const t = tmin >= 0 ? tmin : tmax; // origin may be inside
  return t >= 0 && t <= maxDist ? t : Infinity;
}

// Ray vs circle. Returns nearest positive hit distance or Infinity.
export function rayVsCircle(o: Vec2, d: Vec2, maxDist: number, c: Vec2, radius: number): number {
  const ox = o.x - c.x;
  const oy = o.y - c.y;
  const b = ox * d.x + oy * d.y;
  const cc = ox * ox + oy * oy - radius * radius;
  const disc = b * b - cc;
  if (disc < 0) return Infinity;
  const sq = Math.sqrt(disc);
  const t = -b - sq;
  const hit = t >= 0 ? t : -b + sq;
  return hit >= 0 && hit <= maxDist ? hit : Infinity;
}

export function pointInRect(p: Vec2, r: Rect): boolean {
  return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
}

// Push a circle out of an axis-aligned rect if overlapping, returning the
// outward unit normal (rect surface -> circle) so callers can do a physics
// response, or null if there was no overlap. Mutates `p`.
export function collideCircleRect(p: Vec2, radius: number, r: Rect): Vec2 | null {
  const nx = clamp(p.x, r.x, r.x + r.w);
  const ny = clamp(p.y, r.y, r.y + r.h);
  const dx = p.x - nx;
  const dy = p.y - ny;
  const d2 = dx * dx + dy * dy;
  if (d2 > radius * radius) return null;
  if (d2 > 1e-6) {
    const d = Math.sqrt(d2);
    p.x = nx + (dx / d) * radius;
    p.y = ny + (dy / d) * radius;
    return { x: dx / d, y: dy / d };
  }
  // Center inside rect: push out along the nearest face.
  const left = p.x - r.x;
  const right = r.x + r.w - p.x;
  const top = p.y - r.y;
  const bottom = r.y + r.h - p.y;
  const m = Math.min(left, right, top, bottom);
  if (m === left) {
    p.x = r.x - radius;
    return { x: -1, y: 0 };
  }
  if (m === right) {
    p.x = r.x + r.w + radius;
    return { x: 1, y: 0 };
  }
  if (m === top) {
    p.y = r.y - radius;
    return { x: 0, y: -1 };
  }
  p.y = r.y + r.h + radius;
  return { x: 0, y: 1 };
}

// Boolean push-out for movers that don't need a collision response (foot units).
export function resolveCircleRect(p: Vec2, radius: number, r: Rect): boolean {
  return collideCircleRect(p, radius, r) !== null;
}

// Push a circle out of a thick line segment (a capsule: segment a-b with radius
// `half`), returning the outward unit normal (surface -> circle) or null if there
// was no overlap. Mutates `p`. Used for curved guardrails built from segments.
export function collideCircleSegment(p: Vec2, radius: number, a: Vec2, b: Vec2, half: number): Vec2 | null {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const t = clamp(((p.x - a.x) * abx + (p.y - a.y) * aby) / (abx * abx + aby * aby || 1), 0, 1);
  const cx = a.x + abx * t;
  const cy = a.y + aby * t;
  let dx = p.x - cx;
  let dy = p.y - cy;
  let d = Math.hypot(dx, dy);
  const min = radius + half;
  if (d >= min) return null;
  if (d < 1e-6) {
    // Centre exactly on the segment: push out along its perpendicular.
    dx = -aby;
    dy = abx;
    d = Math.hypot(dx, dy) || 1;
  }
  const nx = dx / d;
  const ny = dy / d;
  p.x = cx + nx * min;
  p.y = cy + ny * min;
  return { x: nx, y: ny };
}
