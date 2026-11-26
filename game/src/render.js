// Awan Courier — everything the pilot sees.
// One job: turn the world + plane state into one canvas frame: sky,
// terrain, runway, rings, the aircraft, the cockpit and the HUD.

import { WORLD, SKY, RUNWAYS, RING } from './config.js';
import { clamp, lerp, degToRad } from './random.js';

const FOV_DEG = 68;

// --- Colour helpers -------------------------------------------------------

function hexRgb(hex) {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

function mixHex(a, b, t) {
  const ca = hexRgb(a);
  const cb = hexRgb(b);
  const r = Math.round(lerp(ca[0], cb[0], t));
  const g = Math.round(lerp(ca[1], cb[1], t));
  const bl = Math.round(lerp(ca[2], cb[2], t));
  return '#' + [r, g, bl].map((v) => v.toString(16).padStart(2, '0')).join('');
}

function terrainColor(h, slope, dist, fogColor, jitter) {
  let c;
  if (h < 0.5) {
    // Water: shallow turquoise to deep blue.
    const depth = clamp(-h / 14, 0, 1);
    c = mixHex('#3d9db5', '#14456b', depth);
  } else if (h < 3) {
    c = '#dcc491'; // sand
  } else if (h < 60) {
    c = mixHex('#8fbc58', '#6a9a44', clamp(h / 60, 0, 1)); // meadow
  } else if (h < 140) {
    c = mixHex('#5d8a3c', '#46682c', clamp((h - 60) / 80, 0, 1)); // forest
  } else if (h < 210) {
    c = mixHex('#8a7d6d', '#6e6258', clamp((h - 140) / 70, 0, 1)); // rock
  } else {
    c = mixHex('#a99e8d', '#e8e2d4', clamp((h - 210) / 60, 0, 1)); // high rock to snow
  }
  // Slope shading: steep faces read darker, gently.
  const shade = clamp(1 - slope * 0.5, 0.68, 1) * (jitter || 1);
  const rgb = hexRgb(c.startsWith('#') ? c : '#888888');
  const sh = (v) => Math.max(0, Math.min(255, Math.round(v * shade)));
  const shaded = `rgb(${sh(rgb[0])},${sh(rgb[1])},${sh(rgb[2])})`;
  // Fog swallows distance.
  const fogT = clamp((dist - WORLD.fogNear) / (WORLD.fogFar - WORLD.fogNear), 0, 1);
  if (fogT <= 0) return shaded;
  const frgb = hexRgb(fogColor);
  const srgb = [sh(rgb[0]), sh(rgb[1]), sh(rgb[2])];
  return `rgb(${Math.round(lerp(srgb[0], frgb[0], fogT))},${Math.round(lerp(srgb[1], frgb[1], fogT))},${Math.round(lerp(srgb[2], frgb[2], fogT))})`;
}

// --- Camera ---------------------------------------------------------------

export function computeCamera(plane, W, H) {
  const hdg = degToRad(plane.headingDeg);
  const pitch = degToRad(plane.pitchDeg);
  const fwd = {
    x: Math.sin(hdg) * Math.cos(pitch),
    y: Math.sin(pitch),
    z: -Math.cos(hdg) * Math.cos(pitch),
  };
  const right0 = { x: Math.cos(hdg), y: 0, z: Math.sin(hdg) };
  const up0 = {
    x: -Math.sin(hdg) * Math.sin(pitch),
    y: Math.cos(pitch),
    z: Math.cos(hdg) * Math.sin(pitch),
  };
  // Roll the camera with the bank, but only partway: the horizon tilts
  // without the view spinning.
  const roll = degToRad(plane.bankDeg) * 0.45;
  const cosR = Math.cos(roll);
  const sinR = Math.sin(roll);
  const right = {
    x: right0.x * cosR + up0.x * sinR,
    y: right0.y * cosR + up0.y * sinR,
    z: right0.z * cosR + up0.z * sinR,
  };
  const up = {
    x: up0.x * cosR - right0.x * sinR,
    y: up0.y * cosR - right0.y * sinR,
    z: up0.z * cosR - right0.z * sinR,
  };
  const dist = 26;
  const height = 7;
  const pos = {
    x: plane.x - fwd.x * dist + up.y * 0 + 0,
    y: plane.y - fwd.y * dist + height,
    z: plane.z - fwd.z * dist,
  };
  const f = (H / 2) / Math.tan(degToRad(FOV_DEG) / 2);
  return { pos, fwd, right, up, f, W, H };
}

function project(cam, p) {
  const dx = p.x - cam.pos.x;
  const dy = p.y - cam.pos.y;
  const dz = p.z - cam.pos.z;
  const cx = dx * cam.right.x + dy * cam.right.y + dz * cam.right.z;
  const cy = dx * cam.up.x + dy * cam.up.y + dz * cam.up.z;
  const cz = dx * cam.fwd.x + dy * cam.fwd.y + dz * cam.fwd.z;
  if (cz < 2) return null;
  const s = cam.f / cz;
  return { x: cam.W / 2 + cx * s, y: cam.H / 2 - cy * s, dist: cz, scale: s };
}

// Like project, but a corner that slips behind the camera is clamped to
// the near plane instead of dropping its whole quad: near terrain would
// otherwise leave holes at the bottom of the screen.
function projectLoose(cam, p) {
  const dx = p.x - cam.pos.x;
  const dy = p.y - cam.pos.y;
  const dz = p.z - cam.pos.z;
  const cx = dx * cam.right.x + dy * cam.right.y + dz * cam.right.z;
  const cy = dx * cam.up.x + dy * cam.up.y + dz * cam.up.z;
  let cz = dx * cam.fwd.x + dy * cam.fwd.y + dz * cam.fwd.z;
  if (cz < 3) cz = 3;
  const s = cam.f / cz;
  return { x: cam.W / 2 + cx * s, y: cam.H / 2 - cy * s, dist: cz, scale: s };
}

// --- Sky ------------------------------------------------------------------

function drawSky(ctx, game, cam) {
  const W = cam.W;
  const H = cam.H;
  const pal = SKY[game.mission.timeOfDay];
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, pal.top);
  g.addColorStop(0.45, pal.mid);
  g.addColorStop(0.72, pal.low);
  g.addColorStop(1, pal.fog);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // Sun: low and warm in the morning and at dusk, high at noon.
  const sunPos = {
    morning: { x: W * 0.78, y: H * 0.2 },
    noon: { x: W * 0.5, y: H * 0.12 },
    dusk: { x: W * 0.2, y: H * 0.26 },
  }[game.mission.timeOfDay];
  const glow = ctx.createRadialGradient(sunPos.x, sunPos.y, 4, sunPos.x, sunPos.y, 130);
  glow.addColorStop(0, pal.sun);
  glow.addColorStop(0.25, mixHex(pal.sun, pal.low, 0.5));
  glow.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(sunPos.x - 140, sunPos.y - 140, 280, 280);
  ctx.fillStyle = pal.sun;
  ctx.beginPath();
  ctx.arc(sunPos.x, sunPos.y, 26, 0, Math.PI * 2);
  ctx.fill();
}

// --- Terrain --------------------------------------------------------------

function drawTerrain(ctx, game, cam) {
  const world = game.world;
  const fogColor = SKY[game.mission.timeOfDay].fog;
  const cell = 110;
  const half = 15; // 31 x 31 cells around the aircraft
  const px = game.plane.x;
  const pz = game.plane.z;
  const cx0 = Math.floor(px / cell);
  const cz0 = Math.floor(pz / cell);
  const quads = [];
  for (let gz = cz0 - half; gz < cz0 + half; gz++) {
    for (let gx = cx0 - half; gx < cx0 + half; gx++) {
      const x0 = gx * cell;
      const z0 = gz * cell;
      const x1 = x0 + cell;
      const z1 = z0 + cell;
      const h00 = world.heightAt(x0, z0);
      const h10 = world.heightAt(x1, z0);
      const h01 = world.heightAt(x0, z1);
      const h11 = world.heightAt(x1, z1);
      const mcx = (x0 + x1) / 2;
      const mcz = (z0 + z1) / 2;
      const mcy = (h00 + h10 + h01 + h11) / 4;
      const dx = mcx - cam.pos.x;
      const dz = mcz - cam.pos.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist > WORLD.fogFar + 400) continue;
      const slope = Math.abs(h10 - h00) / cell + Math.abs(h01 - h00) / cell;
      // A whisper of per-quad variation breaks the flat colour banding.
      const jitter = 0.94 + 0.12 * (((gx * 73856093) ^ (gz * 19349663)) >>> 0) / 4294967296;
      quads.push({ x0, z0, x1, z1, h00, h10, h01, h11, dist, slope, mcy, jitter });
    }
  }
  quads.sort((a, b) => b.dist - a.dist);
  for (const q of quads) {
    const p00 = projectLoose(cam, { x: q.x0, y: q.h00, z: q.z0 });
    const p10 = projectLoose(cam, { x: q.x1, y: q.h10, z: q.z0 });
    const p11 = projectLoose(cam, { x: q.x1, y: q.h11, z: q.z1 });
    const p01 = projectLoose(cam, { x: q.x0, y: q.h01, z: q.z1 });
    ctx.fillStyle = terrainColor(q.mcy, q.slope, q.dist, fogColor, q.jitter);
    ctx.beginPath();
    ctx.moveTo(p00.x, p00.y);
    ctx.lineTo(p10.x, p10.y);
    ctx.lineTo(p11.x, p11.y);
    ctx.lineTo(p01.x, p01.y);
    ctx.closePath();
    ctx.fill();
  }
}

// --- Runway, rings, scenery ------------------------------------------------

function drawRunwayStrip(ctx, cam, rw, timeOfDay) {
  const hdg = degToRad(rw.headingDeg);
  const rx = Math.sin(hdg);
  const rz = Math.cos(hdg);
  const hx = rx * (rw.length / 2);
  const hz = rz * (rw.length / 2);
  const wx = rz * (rw.width / 2);
  const wz = -rx * (rw.width / 2);
  const y = rw.elevation + 0.4;
  const corners = [
    { x: rw.x - hx - wx, y, z: rw.z - hz - wz },
    { x: rw.x + hx - wx, y, z: rw.z + hz - wz },
    { x: rw.x + hx + wx, y, z: rw.z + hz + wz },
    { x: rw.x - hx + wx, y, z: rw.z - hz + wz },
  ];
  const pts = corners.map((c) => project(cam, c));
  if (pts.some((p) => !p)) return;
  ctx.fillStyle = '#3a3f45';
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < 4; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
  ctx.fill();
  // Centreline dashes.
  ctx.fillStyle = '#f5f5f0';
  const dashes = 12;
  for (let i = 0; i < dashes; i++) {
    const t0 = -0.46 + (i / dashes) * 0.92;
    const t1 = t0 + 0.045;
    const a = { x: rw.x + rx * (t0 * rw.length), y: y + 0.1, z: rw.z + rz * (t0 * rw.length) };
    const b = { x: rw.x + rx * (t1 * rw.length), y: y + 0.1, z: rw.z + rz * (t1 * rw.length) };
    const pa = project(cam, { x: a.x - wx * 0.06, y: a.y, z: a.z - wz * 0.06 });
    const pb = project(cam, { x: b.x - wx * 0.06, y: b.y, z: b.z - wz * 0.06 });
    const pc = project(cam, { x: b.x + wx * 0.06, y: b.y, z: b.z + wz * 0.06 });
    const pd = project(cam, { x: a.x + wx * 0.06, y: a.y, z: a.z + wz * 0.06 });
    if (!pa || !pb || !pc || !pd) continue;
    ctx.beginPath();
    ctx.moveTo(pa.x, pa.y);
    ctx.lineTo(pb.x, pb.y);
    ctx.lineTo(pc.x, pc.y);
    ctx.lineTo(pd.x, pd.y);
    ctx.closePath();
    ctx.fill();
  }
  // Edge lights: warm dots along both sides.
  ctx.fillStyle = timeOfDay === 'dusk' ? '#ffd27a' : '#ffe9a8';
  for (let i = 0; i <= 10; i++) {
    const t = -0.5 + (i / 10) * 1;
    for (const side of [-1, 1]) {
      const p = project(cam, {
        x: rw.x + rx * (t * rw.length) + wx * side,
        y: y + 0.6,
        z: rw.z + rz * (t * rw.length) + wz * side,
      });
      if (!p || p.dist > 2400) continue;
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(1.5, 90 / p.dist), 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawRing(ctx, cam, ring, isNext, time) {
  const c = project(cam, ring);
  if (!c) return;
  const rPx = RING.radius * c.scale;
  if (rPx < 3) return;
  const pulse = isNext ? 1 + Math.sin(time * 5) * 0.06 : 1;
  const r = rPx * pulse;
  ctx.save();
  ctx.translate(c.x, c.y);
  // The hoop reads as a circle seen slightly from the side.
  ctx.scale(1, 0.92);
  ctx.lineWidth = Math.max(3, r * 0.16);
  if (ring.passed) {
    ctx.strokeStyle = 'rgba(74,222,128,0.85)';
  } else if (isNext) {
    ctx.shadowColor = '#fbbf24';
    ctx.shadowBlur = 22;
    ctx.strokeStyle = '#fbbf24';
  } else {
    ctx.strokeStyle = 'rgba(251,191,36,0.45)';
  }
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.lineWidth = Math.max(1.5, r * 0.05);
  ctx.strokeStyle = ring.passed ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.85)';
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.82, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
  if (isNext) {
    // Distance tag above the next ring.
    const distM = Math.round(c.dist);
    ctx.font = 'bold 15px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillText(`${distM} m`, c.x + 1, c.y - r - 12 + 1);
    ctx.fillStyle = '#fff7d6';
    ctx.fillText(`${distM} m`, c.x, c.y - r - 12);
    // A light pillar marks it from afar.
    const top = project(cam, { x: ring.x, y: ring.y + 260, z: ring.z });
    if (top) {
      const grad = ctx.createLinearGradient(c.x, c.y, top.x, top.y);
      grad.addColorStop(0, 'rgba(251,191,36,0.22)');
      grad.addColorStop(1, 'rgba(251,191,36,0)');
      ctx.strokeStyle = grad;
      ctx.lineWidth = Math.max(1.5, r * 0.08);
      ctx.beginPath();
      ctx.moveTo(c.x, c.y);
      ctx.lineTo(top.x, top.y);
      ctx.stroke();
    }
  }
}

function drawClouds(ctx, game, cam) {
  const fogColor = SKY[game.mission.timeOfDay].fog;
  for (const cl of game.world.clouds) {
    const p = project(cam, { x: cl.x, y: cl.y, z: cl.z });
    if (!p || p.dist > WORLD.fogFar) continue;
    const s = cl.size * p.scale;
    if (s < 4) continue;
    const alpha = clamp(1.15 - p.dist / WORLD.fogFar, 0.25, 0.9);
    ctx.fillStyle = `rgba(255,255,255,${alpha})`;
    for (let i = 0; i < cl.puffs; i++) {
      const ox = ((i - cl.puffs / 2) * s) / 1.6;
      const oy = Math.sin(i * 2.3) * s * 0.12;
      ctx.beginPath();
      ctx.ellipse(p.x + ox, p.y + oy, s * 0.55, s * 0.3, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    void fogColor;
  }
}

function drawScenery(ctx, game, cam) {
  const world = game.world;
  const items = [];
  for (const t of world.trees) {
    const dx = t.x - cam.pos.x;
    const dz = t.z - cam.pos.z;
    const d2 = dx * dx + dz * dz;
    if (d2 > 900 * 900) continue;
    items.push({ d: Math.sqrt(d2), kind: 'tree', o: t });
  }
  for (const h of world.houses) {
    const dx = h.x - cam.pos.x;
    const dz = h.z - cam.pos.z;
    const d2 = dx * dx + dz * dz;
    if (d2 > 1600 * 1600) continue;
    items.push({ d: Math.sqrt(d2), kind: 'house', o: h });
  }
  const lh = world.lighthouse();
  items.push({ d: Math.hypot(lh.x - cam.pos.x, lh.z - cam.pos.z), kind: 'lighthouse', o: lh });
  items.sort((a, b) => b.d - a.d);
  for (const it of items) {
    if (it.kind === 'tree') {
      const t = it.o;
      const p = project(cam, { x: t.x, y: t.y, z: t.z });
      if (!p) continue;
      const hPx = t.s * p.scale * 2.2;
      if (hPx < 2) continue;
      ctx.fillStyle = '#2f5d23';
      ctx.beginPath();
      ctx.moveTo(p.x, p.y - hPx);
      ctx.lineTo(p.x - hPx * 0.45, p.y);
      ctx.lineTo(p.x + hPx * 0.45, p.y);
      ctx.closePath();
      ctx.fill();
    } else if (it.kind === 'house') {
      const h = it.o;
      const top = project(cam, { x: h.x, y: h.y + 9, z: h.z });
      const base = project(cam, { x: h.x, y: h.y, z: h.z });
      if (!top || !base) continue;
      const wPx = Math.abs(h.w * base.scale);
      const hPx = Math.abs(top.y - base.y);
      if (wPx < 2 || hPx < 2) continue;
      ctx.fillStyle = '#e8dcc3';
      ctx.fillRect(base.x - wPx / 2, base.y - hPx * 0.6, wPx, hPx * 0.6);
      ctx.fillStyle = '#b4502e';
      ctx.beginPath();
      ctx.moveTo(base.x - wPx / 2 - 2, base.y - hPx * 0.6);
      ctx.lineTo(base.x, top.y);
      ctx.lineTo(base.x + wPx / 2 + 2, base.y - hPx * 0.6);
      ctx.closePath();
      ctx.fill();
    } else {
      const l = it.o;
      const base = project(cam, { x: l.x, y: l.y, z: l.z });
      const top = project(cam, { x: l.x, y: l.y + 42, z: l.z });
      if (!base || !top) continue;
      const w = Math.max(2, 9 * base.scale);
      ctx.fillStyle = '#f3ede0';
      ctx.fillRect(base.x - w / 2, top.y, w, base.y - top.y);
      ctx.fillStyle = '#c0392b';
      ctx.fillRect(base.x - w / 2, top.y + (base.y - top.y) * 0.45, w, (base.y - top.y) * 0.14);
      ctx.fillStyle = '#222';
      ctx.beginPath();
      ctx.arc(base.x, top.y - 2, Math.max(2, w * 0.7), 0, Math.PI * 2);
      ctx.fill();
      if (game.mission.timeOfDay === 'dusk') {
        ctx.fillStyle = 'rgba(255,240,170,0.85)';
        ctx.beginPath();
        ctx.arc(base.x, top.y - 2, Math.max(3, w), 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}

// --- The aircraft ----------------------------------------------------------

function drawPlaneShadow(ctx, game, cam) {
  const ground = game.world.heightAt(game.plane.x, game.plane.z);
  const alt = game.plane.y - ground;
  if (alt > 320) return; // too high for a readable shadow
  const p = project(cam, { x: game.plane.x, y: ground + 1, z: game.plane.z });
  if (!p || p.dist > 1500) return;
  // Size from altitude, not from camera distance: the ground point below
  // the aircraft sits close to the camera when flying low.
  const r = clamp(1500 / (alt + 55), 18, 110);
  ctx.fillStyle = `rgba(0,0,0,${clamp(0.3 - alt * 0.0009, 0.07, 0.3)})`;
  ctx.beginPath();
  ctx.ellipse(p.x, p.y, r, r * 0.35, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawPlane(ctx, game, cam) {
  const W = cam.W;
  const H = cam.H;
  const plane = game.plane;
  const cx = W / 2;
  const cy = H * 0.54 + plane.pitchDeg * 2.2;
  const s = 1.05; // chase-view scale
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(degToRad(-plane.bankDeg) * 0.85);
  ctx.scale(s, s);
  const blink = Math.floor(game.time * 2) % 2 === 0;
  // Wings (seen from behind-above).
  ctx.fillStyle = '#f2e6c8';
  ctx.beginPath();
  ctx.moveTo(-14, 6);
  ctx.lineTo(-150, 26);
  ctx.lineTo(-152, 34);
  ctx.lineTo(-12, 16);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(14, 6);
  ctx.lineTo(150, 26);
  ctx.lineTo(152, 34);
  ctx.lineTo(12, 16);
  ctx.closePath();
  ctx.fill();
  // Teal wing stripes.
  ctx.fillStyle = '#0f766e';
  ctx.fillRect(-150, 26, 138, 4);
  ctx.fillRect(12, 26, 138, 4);
  // Tailplane + fin.
  ctx.fillStyle = '#e8d9b5';
  ctx.beginPath();
  ctx.moveTo(-8, -34);
  ctx.lineTo(-46, -44);
  ctx.lineTo(-46, -38);
  ctx.lineTo(-8, -28);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(8, -34);
  ctx.lineTo(46, -44);
  ctx.lineTo(46, -38);
  ctx.lineTo(8, -28);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#0f766e';
  ctx.beginPath();
  ctx.moveTo(0, -58);
  ctx.lineTo(-9, -30);
  ctx.lineTo(9, -30);
  ctx.closePath();
  ctx.fill();
  // Fuselage: rounded body, nose away from the camera.
  ctx.fillStyle = '#f7efdb';
  ctx.beginPath();
  ctx.moveTo(-13, 22);
  ctx.quadraticCurveTo(-16, -30, -7, -52);
  ctx.quadraticCurveTo(0, -58, 7, -52);
  ctx.quadraticCurveTo(16, -30, 13, 22);
  ctx.quadraticCurveTo(0, 30, -13, 22);
  ctx.closePath();
  ctx.fill();
  // Orange cheatline + courier badge.
  ctx.fillStyle = '#e07830';
  ctx.fillRect(-13, -6, 26, 5);
  ctx.fillStyle = '#0f766e';
  ctx.beginPath();
  ctx.arc(0, -24, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 9px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('A', 0, -21);
  // Nav lights.
  ctx.fillStyle = '#ff3b30';
  ctx.beginPath();
  ctx.arc(-152, 30, blink ? 4 : 2.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#34c759';
  ctx.beginPath();
  ctx.arc(152, 30, blink ? 4 : 2.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = blink ? '#ffffff' : 'rgba(255,255,255,0.35)';
  ctx.beginPath();
  ctx.arc(0, -56, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// --- Rain ------------------------------------------------------------------

function drawRain(ctx, game, cam) {
  if (game.mission.timeOfDay !== 'dusk') return;
  ctx.strokeStyle = 'rgba(200,215,235,0.5)';
  ctx.lineWidth = 1;
  const n = 130;
  for (let i = 0; i < n; i++) {
    const x = ((i * 97.3 + game.time * 620) % (cam.W + 80)) - 40;
    const y = ((i * 57.7 + game.time * 940) % (cam.H + 40)) - 20;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - 9, y + 26);
    ctx.stroke();
  }
}

// --- Cockpit + HUD ----------------------------------------------------------

function drawArtificialHorizon(ctx, x, y, r, bankDeg, pitchDeg) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.clip();
  ctx.translate(x, y);
  ctx.rotate(degToRad(-bankDeg));
  const off = clamp(pitchDeg, -25, 25) * (r / 28);
  ctx.fillStyle = '#3f8fd2';
  ctx.fillRect(-r - 2, -r - 2 - off, r * 2 + 4, r + 2 + off);
  ctx.fillStyle = '#7a5230';
  ctx.fillRect(-r - 2, -off, r * 2 + 4, r + 2 + off);
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-r, -off);
  ctx.lineTo(r, -off);
  ctx.stroke();
  ctx.restore();
  // Fixed aircraft symbol + bezel.
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(x - 18, y);
  ctx.lineTo(x - 6, y);
  ctx.moveTo(x + 6, y);
  ctx.lineTo(x + 18, y);
  ctx.stroke();
  ctx.fillStyle = '#ffd166';
  ctx.beginPath();
  ctx.arc(x, y, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#d8cdb2';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.stroke();
}

function drawCockpit(ctx, game, cam) {
  const W = cam.W;
  const H = cam.H;
  const plane = game.plane;
  const panelH = 148;
  const py = H - panelH;
  // Panel body.
  const g = ctx.createLinearGradient(0, py, 0, H);
  g.addColorStop(0, '#23272e');
  g.addColorStop(1, '#121419');
  ctx.fillStyle = g;
  ctx.fillRect(0, py, W, panelH);
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.fillRect(0, py, W, 2);

  const cx = 150;
  const cy = py + panelH / 2 + 4;
  drawArtificialHorizon(ctx, cx, cy, 46, plane.bankDeg, plane.pitchDeg);

  // Altimeter: dial + digital readout.
  const ax = 330;
  ctx.fillStyle = '#0d1117';
  ctx.beginPath();
  ctx.arc(ax, cy, 46, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#d8cdb2';
  ctx.lineWidth = 2;
  ctx.stroke();
  const alt = plane.y;
  const needle = degToRad((alt % 1000) / 1000) * 360 - 90;
  ctx.strokeStyle = '#ffd166';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(ax, cy);
  ctx.lineTo(ax + Math.cos(degToRad(needle)) * 36, cy + Math.sin(degToRad(needle)) * 36);
  ctx.stroke();
  ctx.fillStyle = '#e8f6ff';
  ctx.font = 'bold 20px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(`${Math.round(alt)}`, ax + 58, cy - 4);
  ctx.fillStyle = '#9fb3c8';
  ctx.font = '11px system-ui, sans-serif';
  ctx.fillText('ALT m', ax + 58, cy + 16);

  // Airspeed tape.
  const sx = 480;
  const spdKt = Math.round(plane.speed * 1.944);
  ctx.fillStyle = '#0d1117';
  ctx.fillRect(sx - 42, py + 18, 84, panelH - 36);
  ctx.strokeStyle = '#3a4552';
  ctx.strokeRect(sx - 42, py + 18, 84, panelH - 36);
  ctx.fillStyle = '#e8f6ff';
  ctx.font = 'bold 22px system-ui, sans-serif';
  ctx.fillText(`${spdKt}`, sx, cy + 8);
  ctx.fillStyle = '#9fb3c8';
  ctx.font = '11px system-ui, sans-serif';
  ctx.fillText('KT', sx, cy + 26);
  ctx.fillStyle = '#ffd166';
  ctx.beginPath();
  ctx.moveTo(sx - 42, cy);
  ctx.lineTo(sx - 30, cy - 6);
  ctx.lineTo(sx - 30, cy + 6);
  ctx.closePath();
  ctx.fill();

  // Heading compass strip.
  const hx = 640;
  ctx.fillStyle = '#0d1117';
  ctx.fillRect(hx - 130, py + 18, 260, 44);
  ctx.strokeStyle = '#3a4552';
  ctx.strokeRect(hx - 130, py + 18, 260, 44);
  const hdg = plane.headingDeg;
  ctx.save();
  ctx.beginPath();
  ctx.rect(hx - 130, py + 18, 260, 44);
  ctx.clip();
  ctx.font = 'bold 15px system-ui, sans-serif';
  ctx.textAlign = 'center';
  for (let d = -75; d <= 75; d += 15) {
    const a = ((Math.round(hdg / 15) * 15 + d) % 360 + 360) % 360;
    const x = hx + d * 1.5;
    const isMajor = a % 30 === 0;
    if (isMajor) {
      const label = a === 0 ? 'N' : a === 90 ? 'E' : a === 180 ? 'S' : a === 270 ? 'W' : `${a}`;
      ctx.fillStyle = d === 0 ? '#ffd166' : '#cfe0ef';
      ctx.fillText(label, x, py + 46);
    }
    ctx.fillStyle = d === 0 ? '#ffd166' : '#5a6a7a';
    ctx.fillRect(x - 1, py + 20, 2, isMajor ? 12 : 6);
  }
  ctx.restore();
  ctx.fillStyle = '#ffd166';
  ctx.beginPath();
  ctx.moveTo(hx, py + 18);
  ctx.lineTo(hx - 6, py + 28);
  ctx.lineTo(hx + 6, py + 28);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#e8f6ff';
  ctx.font = 'bold 18px system-ui, sans-serif';
  ctx.fillText(`HDG ${String(Math.round(hdg)).padStart(3, '0')}°`, hx, py + 96);

  // Fuel + damage gauges.
  const gx = 830;
  gauge(ctx, gx, py + 24, 150, 'FUEL', plane.fuel, 100, plane.fuel < 25 ? '#f59e0b' : '#34d399');
  gauge(ctx, gx, py + 78, 150, 'DMG', plane.damage, 100, '#ef4444');
  // Throttle lever.
  const tx = 1030;
  ctx.fillStyle = '#0d1117';
  ctx.fillRect(tx - 14, py + 18, 28, panelH - 36);
  ctx.strokeStyle = '#3a4552';
  ctx.strokeRect(tx - 14, py + 18, 28, panelH - 36);
  const leverY = py + panelH - 26 - plane.throttle * (panelH - 52);
  ctx.fillStyle = '#e07830';
  ctx.fillRect(tx - 20, leverY - 5, 40, 10);
  ctx.fillStyle = '#9fb3c8';
  ctx.font = '11px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('THR', tx, py + panelH - 4);

  // Warning lights.
  const stall = plane.speed < 24 && !plane.onGround;
  lamp(ctx, W - 180, py + 34, 'STALL', stall, '#ef4444');
  lamp(ctx, W - 180, py + 78, 'FUEL', plane.fuel < 25, '#f59e0b');
  ctx.fillStyle = '#9fb3c8';
  ctx.font = '11px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('M mute · R restart', W - 180, py + 122);
}

function gauge(ctx, x, y, w, label, value, max, color) {
  ctx.fillStyle = '#0d1117';
  ctx.fillRect(x, y, w, 16);
  ctx.strokeStyle = '#3a4552';
  ctx.strokeRect(x, y, w, 16);
  ctx.fillStyle = color;
  ctx.fillRect(x + 1, y + 1, (w - 2) * clamp(value / max, 0, 1), 14);
  ctx.fillStyle = '#cfe0ef';
  ctx.font = 'bold 12px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(`${label} ${Math.round(value)}`, x, y - 6);
}

function lamp(ctx, x, y, label, on, color) {
  ctx.fillStyle = on ? color : '#2a2f36';
  ctx.beginPath();
  ctx.arc(x, y, 9, 0, Math.PI * 2);
  ctx.fill();
  if (on) {
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.35;
    ctx.beginPath();
    ctx.arc(x, y, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  ctx.fillStyle = '#cfe0ef';
  ctx.font = 'bold 11px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(label, x + 16, y + 4);
}

function drawHUD(ctx, game, cam) {
  const W = cam.W;
  const plane = game.plane;
  const spdKt = Math.round(plane.speed * 1.944);
  ctx.textAlign = 'left';
  ctx.font = 'bold 26px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.fillText(`ALT ${Math.round(plane.y)} m`, 21, 41);
  ctx.fillText(`SPD ${spdKt} kt`, 21, 75);
  ctx.fillText(`HDG ${String(Math.round(plane.headingDeg)).padStart(3, '0')}°`, 21, 109);
  ctx.fillStyle = '#fff';
  ctx.fillText(`ALT ${Math.round(plane.y)} m`, 20, 40);
  ctx.fillText(`SPD ${spdKt} kt`, 20, 74);
  ctx.fillText(`HDG ${String(Math.round(plane.headingDeg)).padStart(3, '0')}°`, 20, 108);

  // Right side: score, rings, timer.
  ctx.textAlign = 'right';
  ctx.font = 'bold 24px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.fillText(`SKOR ${game.score}`, W - 19, 41);
  ctx.fillStyle = '#ffe9a8';
  ctx.fillText(`SKOR ${game.score}`, W - 20, 40);
  const rings = game.mission.ringsState;
  const done = rings.filter((r) => r.passed).length;
  ctx.font = 'bold 18px system-ui, sans-serif';
  ctx.fillStyle = '#fff';
  ctx.fillText(`Ring ${done}/${rings.length}  ·  ${fmtTime(game.elapsed)}`, W - 20, 70);

  // Centre reticle + next-ring pointer.
  const cx = W / 2;
  const cy = cam.H * 0.42;
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, 14, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx - 22, cy);
  ctx.lineTo(cx - 10, cy);
  ctx.moveTo(cx + 10, cy);
  ctx.lineTo(cx + 22, cy);
  ctx.moveTo(cx, cy - 22);
  ctx.lineTo(cx, cy - 10);
  ctx.moveTo(cx, cy + 10);
  ctx.lineTo(cx, cy + 22);
  ctx.stroke();
  const next = rings.find((r) => !r.passed);
  if (next) {
    const dx = next.x - plane.x;
    const dz = next.z - plane.z;
    const worldAng = Math.atan2(dx, -dz);
    const rel = worldAng - degToRad(plane.headingDeg);
    const ax = cx + Math.sin(rel) * 62;
    const ay = cy - Math.cos(rel) * 62;
    ctx.fillStyle = '#fbbf24';
    ctx.beginPath();
    ctx.moveTo(ax, ay - 9);
    ctx.lineTo(ax + 7, ay + 6);
    ctx.lineTo(ax - 7, ay + 6);
    ctx.closePath();
    ctx.fill();
  }
  // Mission banner.
  ctx.textAlign = 'center';
  ctx.font = 'bold 15px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fillText(game.mission.name, cx + 1, 21);
  ctx.fillStyle = '#fff7d6';
  ctx.fillText(game.mission.name, cx, 20);
}

export function fmtTime(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

// --- Overlays --------------------------------------------------------------

function overlayPanel(ctx, W, H, title, lines, buttons) {
  ctx.fillStyle = 'rgba(8,12,20,0.62)';
  ctx.fillRect(0, 0, W, H);
  const pw = 640;
  const ph = 150 + lines.length * 30 + (buttons ? 74 : 0);
  const px = (W - pw) / 2;
  const py = (H - ph) / 2;
  ctx.fillStyle = '#10151d';
  ctx.fillRect(px, py, pw, ph);
  ctx.strokeStyle = '#fbbf24';
  ctx.lineWidth = 2;
  ctx.strokeRect(px, py, pw, ph);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffd166';
  ctx.font = 'bold 34px system-ui, sans-serif';
  ctx.fillText(title, W / 2, py + 52);
  ctx.fillStyle = '#e8f6ff';
  ctx.font = '17px system-ui, sans-serif';
  lines.forEach((line, i) => {
    ctx.fillText(line, W / 2, py + 96 + i * 30);
  });
  const rects = [];
  if (buttons) {
    buttons.forEach((b, i) => {
      const bw = 220;
      const bh = 48;
      const bx = W / 2 - ((buttons.length * (bw + 16)) / 2 - 8) + i * (bw + 16);
      const by = py + ph - 66;
      ctx.fillStyle = i === 0 ? '#e07830' : '#2a3442';
      ctx.fillRect(bx, by, bw, bh);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 18px system-ui, sans-serif';
      ctx.fillText(b.label, bx + bw / 2, by + 31);
      rects.push({ x: bx, y: by, w: bw, h: bh, id: b.id });
    });
  }
  return rects;
}

export function drawTitle(ctx, game, cam) {
  const W = cam.W;
  const H = cam.H;
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.font = 'bold 64px system-ui, sans-serif';
  ctx.fillText('AWAN COURIER', W / 2 + 2, 142);
  ctx.fillStyle = '#fff';
  ctx.fillText('AWAN COURIER', W / 2, 140);
  ctx.fillStyle = '#ffe9a8';
  ctx.font = 'bold 24px system-ui, sans-serif';
  ctx.fillText('Island Parcel Run — terbang, lewati ring, mendarat.', W / 2, 180);
  return overlayPanel(ctx, W, H, 'Siap Terbang?', [
    'W / ↑ gas  ·  S / ↓ rem gas  ·  A D / ← → belok',
    'Mouse: tahan & gerakkan untuk membelok',
    'Terbang melewati ring emas, lalu mendarat di landasan.',
    'Jaga bahan bakar dan pendaratan yang halus.',
  ], [{ id: 'start', label: 'TERBANG  ▶' }]);
}

export function drawBriefing(ctx, game, cam) {
  const m = game.mission;
  return overlayPanel(ctx, cam.W, cam.H, m.name, [
    m.brief,
    `Bahan bakar awal: ${m.fuelStart}  ·  Angin: ${m.wind} m/s`,
    `Target waktu: ${fmtTime(m.parTimeSec)}  ·  Ring: ${m.rings.length}`,
    'Tekan ENTER atau klik MULAI untuk lepas landas.',
  ], [{ id: 'start', label: 'MULAI  ▶' }]);
}

export function drawEnd(ctx, game, cam, kind, lines) {
  const title =
    kind === 'complete'
      ? 'Penerbangan Selesai!'
      : kind === 'landed'
        ? 'Mendarat dengan Selamat!'
        : kind === 'fuel'
          ? 'Bahan Bakar Habis!'
          : 'Pesawat Jatuh!';
  return overlayPanel(ctx, cam.W, cam.H, title, lines, [
    { id: 'retry', label: 'ULANGI' },
    { id: 'menu', label: 'MENU' },
  ]);
}

// --- Main scene entry --------------------------------------------------------

export function drawScene(ctx, game) {
  const W = game.canvasW;
  const H = game.canvasH;
  const cam = computeCamera(game.plane, W, H);
  game.cam = cam;
  drawSky(ctx, game, cam);
  drawClouds(ctx, game, cam);
  drawTerrain(ctx, game, cam);
  // Runways (both strips are scenery, not only the target one).
  for (const key of Object.keys(RUNWAYS)) {
    drawRunwayStrip(ctx, cam, RUNWAYS[key], game.mission.timeOfDay);
  }
  // Rings, far to near.
  const rings = [...game.mission.ringsState].sort((a, b) => {
    const da = Math.hypot(a.x - cam.pos.x, a.z - cam.pos.z);
    const db = Math.hypot(b.x - cam.pos.x, b.z - cam.pos.z);
    return db - da;
  });
  const next = game.mission.ringsState.find((r) => !r.passed);
  for (const r of rings) drawRing(ctx, cam, r, r === next, game.time);
  drawScenery(ctx, game, cam);
  drawPlaneShadow(ctx, game, cam);
  if (game.phase === 'flying' || game.phase === 'landed' || game.phase === 'crashed' || game.phase === 'briefing') {
    drawPlane(ctx, game, cam);
  }
  drawRain(ctx, game, cam);
  if (game.phase === 'flying' || game.phase === 'landed' || game.phase === 'crashed') {
    drawCockpit(ctx, game, cam);
    drawHUD(ctx, game, cam);
  }
  // Floating score popups.
  ctx.textAlign = 'center';
  ctx.font = 'bold 22px system-ui, sans-serif';
  for (const pop of game.popups) {
    const age = game.time - pop.at;
    if (age > 1.6) continue;
    ctx.globalAlpha = 1 - age / 1.6;
    ctx.fillStyle = '#ffe9a8';
    ctx.fillText(pop.text, cam.W / 2, cam.H * 0.3 - age * 46);
  }
  ctx.globalAlpha = 1;
  return cam;
}
