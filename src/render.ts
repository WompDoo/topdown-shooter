// Canvas-2D renderer for the open-world sandbox. Camera follows the player (or
// their car); full visibility, no fog. Draws city, cars, hostiles, gunfire juice,
// HUD, and a minimap. Never mutates the world.

import type { Car, Enemy, EnemyType, Seg, World } from './world';
import type { Input } from './input';
import type { Weapon } from './weapon';
import { fromAngle, randSpread } from './math';
import { nearestCarIndex } from './car';
import { vehicleAtlas, weaponSheet, wreckAtlas } from './sprites';
import { GRIP_FWD, WEAPON_SCALE, weaponArt } from './weaponart';
import { VEHICLES } from './vehicles';

export interface Camera {
  x: number;
  y: number;
  zoom: number;
}

const ENEMY_COL: Record<EnemyType, string> = {
  gunman: '#d3673f',
  smg: '#d6c23f',
  brute: '#e0473a',
  marksman: '#5aa9d6',
};

const COL = {
  outside: '#0a0c10',
  ground: '#20242b',
  grid: '#262b33',
  buildEdge: '#0e1116',
  build: '#39414d',
  roof: '#454f5d',
  track: '#191c22',
  kerb: '#39414d',
  barrier: '#cbd2da',
  barrierStripe: '#c94f4f',
  player: '#57d6bf',
  playerLimb: '#d9fff7',
  hud: '#d7e6ef',
  hudDim: '#7d8b98',
};

export function render(
  ctx: CanvasRenderingContext2D,
  w: World,
  cam: Camera,
  input: Input,
  cssW: number,
  cssH: number,
  dpr: number,
): void {
  const z = cam.zoom * dpr;
  const sx = w.shake > 0.1 ? randSpread(w.shake) * dpr : 0;
  const sy = w.shake > 0.1 ? randSpread(w.shake) * dpr : 0;
  const ox = (cssW / 2 - cam.x * cam.zoom) * dpr + sx;
  const oy = (cssH / 2 - cam.y * cam.zoom) * dpr + sy;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = COL.outside;
  ctx.fillRect(0, 0, cssW, cssH);

  ctx.setTransform(z, 0, 0, z, ox, oy);
  drawGround(ctx, w);
  drawTrack(ctx, w);
  drawSkids(ctx, w);
  drawDecals(ctx, w);
  drawBuildings(ctx, w);
  drawBarriers(ctx, w);
  drawPickups(ctx, w);
  for (const c of w.cars) drawCar(ctx, c);
  for (const e of w.enemies) {
    if (e.alive) drawEnemy(ctx, e);
    else drawCorpse(ctx, e);
  }
  drawCivilians(ctx, w);
  if (w.player.inCar < 0) drawPlayer(ctx, w);
  drawSlashes(ctx, w);
  drawTracers(ctx, w);
  drawMuzzles(ctx, w);
  drawParticles(ctx, w);

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawHud(ctx, w, input, cssW, cssH);
}

function drawGround(ctx: CanvasRenderingContext2D, w: World): void {
  const b = w.bounds;
  ctx.fillStyle = COL.ground;
  ctx.fillRect(b.x, b.y, b.w, b.h);
  ctx.strokeStyle = COL.grid;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = b.x; x <= b.x + b.w; x += 100) {
    ctx.moveTo(x, b.y);
    ctx.lineTo(x, b.y + b.h);
  }
  for (let y = b.y; y <= b.y + b.h; y += 100) {
    ctx.moveTo(b.x, y);
    ctx.lineTo(b.x + b.w, y);
  }
  ctx.stroke();
}

function drawTrack(ctx: CanvasRenderingContext2D, w: World): void {
  const t = w.track;
  if (!t) return;
  // paved ribbon: fill the outer loop, punch out the inner hole (even-odd)
  ctx.beginPath();
  ctx.moveTo(t.outer[0].x, t.outer[0].y);
  for (let i = 1; i < t.outer.length; i++) ctx.lineTo(t.outer[i].x, t.outer[i].y);
  ctx.closePath();
  ctx.moveTo(t.inner[0].x, t.inner[0].y);
  for (let i = 1; i < t.inner.length; i++) ctx.lineTo(t.inner[i].x, t.inner[i].y);
  ctx.closePath();
  ctx.fillStyle = COL.track;
  ctx.fill('evenodd');

  // guardrails: a dark edge then a light rail, stroked per segment so the round
  // caps bridge them into a smooth curve and the pit gap stays open.
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = COL.buildEdge;
  ctx.lineWidth = t.wallHalf * 2 + 4;
  strokeSegs(ctx, t.walls);
  ctx.strokeStyle = COL.barrier;
  ctx.lineWidth = t.wallHalf * 2 - 2;
  strokeSegs(ctx, t.walls);
  ctx.lineCap = 'butt';
  ctx.lineJoin = 'miter';

  // start/finish: a white band with black dashes across the track = a chequer
  const s = t.start;
  ctx.lineWidth = 30;
  ctx.strokeStyle = '#e8edf2';
  ctx.beginPath();
  ctx.moveTo(s.a.x, s.a.y);
  ctx.lineTo(s.b.x, s.b.y);
  ctx.stroke();
  ctx.strokeStyle = '#12151b';
  ctx.setLineDash([14, 14]);
  ctx.beginPath();
  ctx.moveTo(s.a.x, s.a.y);
  ctx.lineTo(s.b.x, s.b.y);
  ctx.stroke();
  ctx.setLineDash([]);
}

function strokeSegs(ctx: CanvasRenderingContext2D, segs: Seg[]): void {
  ctx.beginPath();
  for (const s of segs) {
    ctx.moveTo(s.a.x, s.a.y);
    ctx.lineTo(s.b.x, s.b.y);
  }
  ctx.stroke();
}

function drawSkids(ctx: CanvasRenderingContext2D, w: World): void {
  ctx.lineCap = 'round';
  ctx.lineWidth = 3.5;
  for (const s of w.skids) {
    ctx.strokeStyle = s.blood
      ? `rgba(122,20,26,${Math.min(0.6, (s.life / 6) * 0.6)})`
      : `rgba(12,14,18,${Math.min(0.4, (s.life / 8) * 0.4)})`;
    ctx.beginPath();
    ctx.moveTo(s.a.x, s.a.y);
    ctx.lineTo(s.b.x, s.b.y);
    ctx.stroke();
  }
  ctx.lineCap = 'butt';
}

function drawBarriers(ctx: CanvasRenderingContext2D, w: World): void {
  for (const r of w.barriers) {
    const horiz = r.w >= r.h;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(r.x - 2, r.y - 2, r.w + 4, r.h + 4);
    ctx.fillStyle = COL.barrier;
    ctx.fillRect(r.x, r.y, r.w, r.h);
    // red hazard stripes along the long axis
    ctx.fillStyle = COL.barrierStripe;
    const span = horiz ? r.w : r.h;
    for (let o = 0; o < span; o += 56) {
      if (horiz) ctx.fillRect(r.x + o, r.y, Math.min(28, r.w - o), r.h);
      else ctx.fillRect(r.x, r.y + o, r.w, Math.min(28, r.h - o));
    }
  }
}

function drawBuildings(ctx: CanvasRenderingContext2D, w: World): void {
  for (const r of w.buildings) {
    ctx.fillStyle = COL.buildEdge;
    ctx.fillRect(r.x - 3, r.y - 3, r.w + 6, r.h + 6);
    ctx.fillStyle = COL.build;
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.fillStyle = COL.roof;
    ctx.fillRect(r.x + 14, r.y + 14, r.w - 28, r.h - 28);
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 2;
    ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
  }
}

function drawDecals(ctx: CanvasRenderingContext2D, w: World): void {
  for (const d of w.decals) {
    ctx.fillStyle = d.color;
    ctx.beginPath();
    ctx.arc(d.pos.x, d.pos.y, d.r, 0, Math.PI * 2);
    ctx.fill();
  }
}

const DIR48 = (Math.PI * 2) / 48; // one heading step of the 48-direction art

function drawCar(ctx: CanvasRenderingContext2D, c: Car): void {
  const spec = VEHICLES[c.kind];
  const cell = spec.cell;
  // Sprite leaps up and enlarges at the moment of an explosion, then settles.
  const draw = spec.draw * (1 + c.pop * 0.7);
  const lift = c.pop * spec.draw * 0.2;
  const dx = c.pos.x - draw / 2;
  const dy = c.pos.y - draw / 2 - lift;

  if (c.dead) {
    // While the blast is fresh, show the car flung up; then it's a burnt wreck.
    if (c.pop > 0.4) {
      const atlas = vehicleAtlas(c.kind, c.color);
      if (atlas) {
        const i = ((Math.round(c.angle / DIR48) % 48) + 48) % 48;
        ctx.drawImage(atlas, (i % 12) * cell, Math.floor(i / 12) * cell, cell, cell, dx, dy, draw, draw);
        return;
      }
    }
    const wreck = wreckAtlas(c.kind);
    if (!wreck) return; // nothing to fall back to; the explosion FX still played
    const k = ((Math.round(c.angle / (Math.PI / 4)) % 8) + 8) % 8;
    ctx.drawImage(wreck, k * cell, 0, cell, cell, dx, dy, draw, draw);
    return;
  }

  const atlas = vehicleAtlas(c.kind, c.color);
  if (!atlas) {
    drawCarRect(ctx, c);
    return;
  }
  // 48 pre-drawn headings: pick the nearest, no rotation needed.
  const idx = ((Math.round(c.angle / DIR48) % 48) + 48) % 48;
  ctx.drawImage(atlas, (idx % 12) * cell, Math.floor(idx / 12) * cell, cell, cell, dx, dy, draw, draw);
  if (c.gore.length) drawGore(ctx, c);
}

// Blood splats stamped on the body, kept in the car's frame so they turn with it.
function drawGore(ctx: CanvasRenderingContext2D, c: Car): void {
  const fwd = fromAngle(c.angle);
  ctx.fillStyle = 'rgba(120,20,26,0.85)';
  for (const g of c.gore) {
    const x = c.pos.x + fwd.x * g.x - fwd.y * g.y;
    const y = c.pos.y + fwd.y * g.x + fwd.x * g.y;
    ctx.beginPath();
    ctx.arc(x, y, g.r, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawCarRect(ctx: CanvasRenderingContext2D, c: Car): void {
  ctx.save();
  ctx.translate(c.pos.x, c.pos.y);
  ctx.rotate(c.angle);
  // body
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(-c.w / 2 - 2, -c.h / 2 - 2, c.w + 4, c.h + 4);
  ctx.fillStyle = c.color;
  ctx.fillRect(-c.w / 2, -c.h / 2, c.w, c.h);
  // windshield toward the front
  ctx.fillStyle = 'rgba(180,220,255,0.5)';
  ctx.fillRect(c.w / 2 - 20, -c.h / 2 + 4, 12, c.h - 8);
  // roof
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(-c.w / 2 + 12, -c.h / 2 + 6, c.w - 34, c.h - 12);
  ctx.restore();
}

function drawCorpse(ctx: CanvasRenderingContext2D, e: Enemy): void {
  ctx.fillStyle = 'rgba(70,40,32,0.7)';
  ctx.beginPath();
  ctx.arc(e.pos.x, e.pos.y, e.radius * 1.05, 0, Math.PI * 2);
  ctx.fill();
}

function drawCivilians(ctx: CanvasRenderingContext2D, w: World): void {
  for (const c of w.civilians) {
    if (!c.alive) {
      ctx.fillStyle = 'rgba(64,42,36,0.6)';
      ctx.beginPath();
      ctx.arc(c.pos.x, c.pos.y, c.radius, 0, Math.PI * 2);
      ctx.fill();
      continue;
    }
    const dir = fromAngle(c.aim);
    ctx.fillStyle = c.color;
    ctx.beginPath();
    ctx.arc(c.pos.x, c.pos.y, c.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(c.pos.x, c.pos.y);
    ctx.lineTo(c.pos.x + dir.x * (c.radius + 3), c.pos.y + dir.y * (c.radius + 3));
    ctx.stroke();
    if (c.panic > 0) {
      // a little alarm marker bobbing over the head
      ctx.fillStyle = 'rgba(255,224,90,0.95)';
      ctx.fillRect(c.pos.x - 1.5, c.pos.y - c.radius - 13, 3, 7);
      ctx.fillRect(c.pos.x - 1.5, c.pos.y - c.radius - 4, 3, 3);
    }
    if (c.flash > 0) {
      ctx.fillStyle = `rgba(255,255,255,${(c.flash / 0.09) * 0.8})`;
      ctx.beginPath();
      ctx.arc(c.pos.x, c.pos.y, c.radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawPickups(ctx: CanvasRenderingContext2D, w: World): void {
  const sheet = weaponSheet();
  ctx.imageSmoothingEnabled = false;
  for (const pk of w.pickups) {
    // a soft teal pad so the item reads as something to grab
    ctx.fillStyle = 'rgba(87,214,191,0.14)';
    ctx.beginPath();
    ctx.arc(pk.pos.x, pk.pos.y, pk.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(127,227,255,0.5)';
    ctx.lineWidth = 2;
    ctx.stroke();
    const art = weaponArt(pk.weapon);
    if (sheet && art) {
      const bob = Math.sin(w.time * 3 + pk.bob) * 3;
      const wd = art.sw * WEAPON_SCALE * 1.1;
      const ht = art.sh * WEAPON_SCALE * 1.1;
      ctx.drawImage(sheet, art.sx, art.sy, art.sw, art.sh, pk.pos.x - wd / 2, pk.pos.y - ht / 2 + bob, wd, ht);
    }
  }
  ctx.imageSmoothingEnabled = true;
}

// Draw a held weapon sprite: grip near the hand, barrel forward along `aim`,
// vertically flipped when aiming into the left half so it never appears
// upside-down. Returns false if the atlas or this weapon's art isn't ready yet,
// so the caller can fall back to the old drawn stub.
function drawWeapon(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  aim: number,
  weapon: Weapon,
  recoil = 0,
): boolean {
  const sheet = weaponSheet();
  const art = weaponArt(weapon);
  if (!sheet || !art) return false;
  const w = art.sw * WEAPON_SCALE;
  const h = art.sh * WEAPON_SCALE;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(aim);
  if (Math.cos(aim) < 0) ctx.scale(1, -1);
  ctx.imageSmoothingEnabled = false; // keep the pixel art crisp
  ctx.drawImage(sheet, art.sx, art.sy, art.sw, art.sh, GRIP_FWD - recoil, -h / 2, w, h);
  ctx.restore();
  return true;
}

function drawEnemy(ctx: CanvasRenderingContext2D, e: Enemy): void {
  const dir = fromAngle(e.aim);
  if (e.telegraph > 0) {
    const a = 0.2 + e.telegraph * 0.6;
    const reach = Math.min(e.weapon.range, 900);
    ctx.strokeStyle = `rgba(255,64,51,${a})`;
    ctx.lineWidth = 1 + e.telegraph * 2;
    ctx.beginPath();
    ctx.moveTo(e.pos.x + dir.x * e.radius, e.pos.y + dir.y * e.radius);
    ctx.lineTo(e.pos.x + dir.x * reach, e.pos.y + dir.y * reach);
    ctx.stroke();
  }
  ctx.fillStyle = ENEMY_COL[e.etype];
  ctx.beginPath();
  ctx.arc(e.pos.x, e.pos.y, e.radius, 0, Math.PI * 2);
  ctx.fill();
  if (!drawWeapon(ctx, e.pos.x, e.pos.y, e.aim, e.weapon)) {
    ctx.strokeStyle = '#20140f';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(e.pos.x, e.pos.y);
    ctx.lineTo(e.pos.x + dir.x * (e.radius + 9), e.pos.y + dir.y * (e.radius + 9));
    ctx.stroke();
  }
  if (e.flash > 0) {
    ctx.fillStyle = `rgba(255,255,255,${(e.flash / 0.09) * 0.8})`;
    ctx.beginPath();
    ctx.arc(e.pos.x, e.pos.y, e.radius, 0, Math.PI * 2);
    ctx.fill();
  }
  if (e.hp < e.maxHp) {
    const hpw = 22;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(e.pos.x - hpw / 2, e.pos.y - e.radius - 9, hpw, 3);
    ctx.fillStyle = '#e0533a';
    ctx.fillRect(e.pos.x - hpw / 2, e.pos.y - e.radius - 9, hpw * Math.max(0, e.hp / e.maxHp), 3);
  }
}

function drawPlayer(ctx: CanvasRenderingContext2D, w: World): void {
  const p = w.player;
  const dir = fromAngle(p.aim);
  if (p.downed) {
    ctx.fillStyle = '#3d4a4a';
    ctx.beginPath();
    ctx.arc(p.pos.x, p.pos.y, p.radius, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  if (p.dive > 0) {
    // tumbling bail-out: an elongated body that spins as it slides
    ctx.save();
    ctx.translate(p.pos.x, p.pos.y);
    ctx.rotate(p.roll);
    ctx.fillStyle = COL.player;
    ctx.beginPath();
    ctx.ellipse(0, 0, p.radius * 1.2, p.radius * 0.68, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = COL.playerLimb;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-p.radius * 1.1, 0);
    ctx.lineTo(p.radius * 1.1, 0);
    ctx.stroke();
    ctx.restore();
    return;
  }
  ctx.fillStyle = COL.player;
  ctx.beginPath();
  ctx.arc(p.pos.x, p.pos.y, p.radius, 0, Math.PI * 2);
  ctx.fill();
  if (!drawWeapon(ctx, p.pos.x, p.pos.y, p.aim, p.weapon, p.aimKick * 10)) {
    // Fallback until the weapons atlas loads: the old arm/gun stub.
    const isMelee = p.weapon.kind === 'melee';
    const reach = (isMelee ? p.radius + 16 : p.radius + 12) - p.aimKick * 14;
    ctx.strokeStyle = isMelee ? '#dfe9ef' : COL.playerLimb;
    ctx.lineWidth = isMelee ? 3 : 4;
    ctx.beginPath();
    ctx.moveTo(p.pos.x, p.pos.y);
    ctx.lineTo(p.pos.x + dir.x * reach, p.pos.y + dir.y * reach);
    ctx.stroke();
  }
  if (p.flash > 0) {
    ctx.fillStyle = `rgba(255,120,120,${(p.flash / 0.12) * 0.8})`;
    ctx.beginPath();
    ctx.arc(p.pos.x, p.pos.y, p.radius, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawSlashes(ctx: CanvasRenderingContext2D, w: World): void {
  for (const s of w.slashes) {
    const a = s.life / s.maxLife;
    ctx.strokeStyle = `rgba(230,245,255,${a * 0.9})`;
    ctx.lineWidth = 3 * a + 1;
    ctx.beginPath();
    ctx.arc(s.pos.x, s.pos.y, s.reach, s.angle - s.arc, s.angle + s.arc);
    ctx.stroke();
  }
}

function drawTracers(ctx: CanvasRenderingContext2D, w: World): void {
  ctx.globalCompositeOperation = 'lighter';
  for (const t of w.tracers) {
    const a = t.life / t.maxLife;
    ctx.strokeStyle = t.team === 'player' ? `rgba(255,238,170,${a})` : `rgba(255,96,72,${a})`;
    ctx.lineWidth = t.team === 'player' ? 2 : 1.6;
    ctx.beginPath();
    ctx.moveTo(t.a.x, t.a.y);
    ctx.lineTo(t.b.x, t.b.y);
    ctx.stroke();
  }
  ctx.globalCompositeOperation = 'source-over';
}

function drawMuzzles(ctx: CanvasRenderingContext2D, w: World): void {
  ctx.globalCompositeOperation = 'lighter';
  for (const m of w.muzzles) {
    const dir = fromAngle(m.angle);
    const a = m.life / 0.05;
    const grd = ctx.createRadialGradient(m.pos.x, m.pos.y, 0, m.pos.x, m.pos.y, m.size);
    grd.addColorStop(0, `rgba(255,247,214,${a})`);
    grd.addColorStop(0.5, `rgba(255,186,84,${a * 0.7})`);
    grd.addColorStop(1, 'rgba(255,140,40,0)');
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.arc(m.pos.x + dir.x * 4, m.pos.y + dir.y * 4, m.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
}

function drawParticles(ctx: CanvasRenderingContext2D, w: World): void {
  for (const p of w.particles) {
    const a = Math.max(0, p.life / p.maxLife);
    if (p.kind === 'casing') {
      ctx.save();
      ctx.translate(p.pos.x, p.pos.y);
      ctx.rotate(p.angle);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size, -p.size * 0.5, p.size * 2, p.size);
      ctx.restore();
    } else if (p.kind === 'spark') {
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = p.color;
      ctx.lineWidth = p.size;
      ctx.beginPath();
      ctx.moveTo(p.pos.x, p.pos.y);
      ctx.lineTo(p.pos.x - p.vel.x * 0.02, p.pos.y - p.vel.y * 0.02);
      ctx.stroke();
      ctx.globalCompositeOperation = 'source-over';
    } else if (p.kind === 'fire') {
      // Additive fireball: a white-hot core bleeding out to the ember colour.
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = a;
      const grd = ctx.createRadialGradient(p.pos.x, p.pos.y, 0, p.pos.x, p.pos.y, p.size);
      grd.addColorStop(0, 'rgba(255,246,214,0.95)');
      grd.addColorStop(0.4, p.color);
      grd.addColorStop(1, 'rgba(255,90,30,0)');
      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.arc(p.pos.x, p.pos.y, p.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    } else {
      ctx.globalAlpha = p.kind === 'smoke' ? a * 0.5 : a;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.pos.x, p.pos.y, p.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }
}

function drawMinimap(ctx: CanvasRenderingContext2D, w: World, cssW: number): void {
  const mw = 180;
  const mh = (mw * w.bounds.h) / w.bounds.w;
  const mx = cssW - mw - 16;
  const my = 16;
  const s = mw / w.bounds.w;
  ctx.fillStyle = 'rgba(8,10,14,0.7)';
  ctx.fillRect(mx - 2, my - 2, mw + 4, mh + 4);
  ctx.fillStyle = 'rgba(40,46,56,0.9)';
  for (const b of w.buildings) ctx.fillRect(mx + b.x * s, my + b.y * s, b.w * s, b.h * s);
  ctx.fillStyle = 'rgba(180,120,110,0.9)';
  for (const b of w.barriers) ctx.fillRect(mx + b.x * s, my + b.y * s, Math.max(1, b.w * s), Math.max(1, b.h * s));
  if (w.track) {
    ctx.strokeStyle = 'rgba(180,120,110,0.8)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    const o = w.track.outer;
    ctx.moveTo(mx + o[0].x * s, my + o[0].y * s);
    for (let i = 1; i < o.length; i++) ctx.lineTo(mx + o[i].x * s, my + o[i].y * s);
    ctx.closePath();
    ctx.stroke();
  }
  ctx.fillStyle = '#5a86c9';
  for (const c of w.cars) ctx.fillRect(mx + c.pos.x * s - 2, my + c.pos.y * s - 2, 4, 4);
  ctx.fillStyle = '#cfe0f0';
  for (const c of w.civilians) {
    if (!c.alive) continue;
    ctx.fillRect(mx + c.pos.x * s - 1, my + c.pos.y * s - 1, 2, 2);
  }
  ctx.fillStyle = '#e0533a';
  for (const e of w.enemies) {
    if (!e.alive) continue;
    ctx.fillRect(mx + e.pos.x * s - 2, my + e.pos.y * s - 2, 3, 3);
  }
  ctx.fillStyle = '#57d6bf';
  ctx.fillRect(mx + w.player.pos.x * s - 2, my + w.player.pos.y * s - 2, 4, 4);
  ctx.strokeStyle = 'rgba(120,140,155,0.4)';
  ctx.lineWidth = 1;
  ctx.strokeRect(mx - 2, my - 2, mw + 4, mh + 4);
}

function drawHud(ctx: CanvasRenderingContext2D, w: World, input: Input, cssW: number, cssH: number): void {
  const p = w.player;
  const driving = p.inCar >= 0;

  // reticle
  if (!driving) {
    const gap = Math.min(46, 6 + (p.weapon.kind === 'melee' ? 0.02 : p.spread) * 220);
    const mx = input.mouse.x;
    const my = input.mouse.y;
    ctx.strokeStyle = p.reloading ? 'rgba(255,120,90,0.9)' : 'rgba(230,245,255,0.9)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      ctx.moveTo(mx + dx * gap, my + dy * gap);
      ctx.lineTo(mx + dx * (gap + 9), my + dy * (gap + 9));
    }
    ctx.stroke();
  }

  ctx.textBaseline = 'alphabetic';
  // health
  const hb = { x: 24, y: cssH - 40, w: 240, h: 16 };
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(hb.x - 2, hb.y - 2, hb.w + 4, hb.h + 4);
  const hpFrac = Math.max(0, p.hp / p.maxHp);
  ctx.fillStyle = hpFrac > 0.5 ? '#4bd07a' : hpFrac > 0.25 ? '#e0c341' : '#e0533a';
  ctx.fillRect(hb.x, hb.y, hb.w * hpFrac, hb.h);
  ctx.font = '600 13px ui-monospace, Menlo, monospace';
  ctx.fillStyle = COL.hud;
  ctx.fillText(`HP ${Math.max(0, Math.ceil(p.hp))}`, hb.x, hb.y - 8);

  // weapon / ammo or driving
  ctx.textAlign = 'right';
  if (driving) {
    ctx.font = '700 22px ui-monospace, Menlo, monospace';
    ctx.fillStyle = COL.hud;
    ctx.fillText('DRIVING', cssW - 24, cssH - 28);
  } else {
    const os = p.slot === 0 ? 1 : 0;
    ctx.font = '600 11px ui-monospace, Menlo, monospace';
    ctx.fillStyle = 'rgba(125,139,152,0.7)';
    if (p.slots.length > 1) ctx.fillText(`[${os + 1}] ${p.slots[os].name.toUpperCase()}`, cssW - 24, cssH - 78);
    ctx.font = '600 13px ui-monospace, Menlo, monospace';
    ctx.fillStyle = COL.hudDim;
    ctx.fillText(p.weapon.name.toUpperCase(), cssW - 24, cssH - 58);
    if (p.weapon.kind === 'melee') {
      ctx.font = '700 22px ui-monospace, Menlo, monospace';
      ctx.fillStyle = COL.hud;
      ctx.fillText('MELEE', cssW - 24, cssH - 28);
    } else {
      ctx.font = '700 26px ui-monospace, Menlo, monospace';
      ctx.fillStyle = p.ammo > 0 ? COL.hud : '#e0533a';
      ctx.fillText(`${p.ammo}`, cssW - 24, cssH - 30);
      ctx.font = '600 14px ui-monospace, Menlo, monospace';
      ctx.fillStyle = COL.hudDim;
      ctx.fillText(`/ ${p.weapon.mag}`, cssW - 24, cssH - 12);
      if (p.reloading) {
        ctx.fillStyle = COL.hud;
        ctx.fillText('RELOADING', cssW - 24, cssH - 96);
      }
    }
  }
  ctx.textAlign = 'left';

  // enemies alive count
  const left = w.enemies.filter((e) => e.alive).length;
  ctx.textAlign = 'center';
  ctx.font = '600 13px ui-monospace, Menlo, monospace';
  ctx.fillStyle = COL.hudDim;
  ctx.fillText(`HOSTILES  ${left}`, cssW / 2, 24);
  ctx.textAlign = 'left';

  // enter/exit car prompt
  const canEnter = !driving && !p.downed && nearestCarIndex(w) >= 0;
  if (driving || canEnter) {
    ctx.textAlign = 'center';
    ctx.font = '700 14px ui-monospace, Menlo, monospace';
    ctx.fillStyle = '#7fe3ff';
    ctx.fillText(driving ? 'F  EXIT CAR' : 'F  ENTER CAR', cssW / 2, cssH - 40);
    ctx.textAlign = 'left';
  }

  // controls hint
  ctx.font = '500 12px ui-monospace, Menlo, monospace';
  ctx.fillStyle = 'rgba(160,180,195,0.55)';
  ctx.fillText(
    driving
      ? 'WASD drive   ·   SPACE handbrake   ·   F exit'
      : 'WASD move   ·   LMB fire   ·   1·2 swap   ·   R reload   ·   F enter car',
    24,
    cssH - 12,
  );

  drawMinimap(ctx, w, cssW);

  // death banner
  if (w.state === 'dead') {
    ctx.fillStyle = 'rgba(6,8,12,0.55)';
    ctx.fillRect(0, cssH / 2 - 70, cssW, 140);
    ctx.textAlign = 'center';
    ctx.font = '800 46px ui-monospace, Menlo, monospace';
    ctx.fillStyle = '#e0533a';
    ctx.fillText('WASTED', cssW / 2, cssH / 2);
    ctx.font = '600 18px ui-monospace, Menlo, monospace';
    ctx.fillStyle = COL.hud;
    ctx.fillText('press  R  to respawn', cssW / 2, cssH / 2 + 40);
    ctx.textAlign = 'left';
  }
}
