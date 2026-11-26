// Awan Courier — the world: islands, sea, runways, rings, clouds.
// One job: build the terrain once from a seed and answer "how high is
// the ground here?" plus where the runways, rings and scenery sit.

import { WORLD, RUNWAYS, MISSIONS } from './config.js';
import { mulberry32, makeNoise2D, clamp, lerp, degToRad } from './random.js';

// Island humps: [centreX, centreZ, radius, peakHeight].
const ISLANDS = [
  { x: 0, z: 200, r: 2300, peak: 165 },
  { x: 2600, z: -1500, r: 1250, peak: 125 },
  { x: -2400, z: 1900, r: 900, peak: 85 },
  { x: -900, z: -2100, r: 700, peak: 65 },
];

function islandHeight(x, z) {
  let h = -14; // sea floor baseline
  for (const isl of ISLANDS) {
    const dx = x - isl.x;
    const dz = z - isl.z;
    const d = Math.sqrt(dx * dx + dz * dz) / isl.r;
    if (d >= 1) continue;
    // Smooth dome: 1 at centre, 0 at the shore, with a soft shoulder.
    const dome = Math.pow(Math.cos((d * Math.PI) / 2), 1.15);
    h += dome * isl.peak;
  }
  return h;
}

export class World {
  constructor(seed) {
    this.seed = seed;
    this.noise = makeNoise2D(seed * 31 + 5);
    const n = WORLD.gridN;
    const half = WORLD.halfSize;
    this.gridN = n;
    this.cell = (half * 2) / (n - 1);
    this.heights = new Float32Array(n * n);
    for (let iz = 0; iz < n; iz++) {
      for (let ix = 0; ix < n; ix++) {
        const x = -half + ix * this.cell;
        const z = -half + iz * this.cell;
        this.heights[iz * n + ix] = this.rawHeight(x, z);
      }
    }
    this.clouds = this.buildClouds();
    this.trees = this.buildTrees();
    this.houses = this.buildVillage();
  }

  // Height before the grid is baked, with runway aprons flattened.
  rawHeight(x, z) {
    let h = islandHeight(x, z);
    // Rolling hills on land only, fading out at the shore.
    const land = clamp((h + 14) / 60, 0, 1);
    h += this.noise(x / 520, z / 520) * 26 * land;
    h += this.noise(x / 170 + 40, z / 170 + 40) * 6 * land;
    // Flatten a capsule around each runway so the strip sits level and
    // the approaches along its axis stay clear.
    for (const key of Object.keys(RUNWAYS)) {
      const rw = RUNWAYS[key];
      const hdg = degToRad(rw.headingDeg);
      const ax = Math.sin(hdg);
      const az = Math.cos(hdg);
      const along = clamp((x - rw.x) * ax + (z - rw.z) * az, -rw.length / 2, rw.length / 2);
      const cxp = rw.x + ax * along;
      const czp = rw.z + az * along;
      const d = Math.hypot(x - cxp, z - czp);
      if (d < 340) {
        const t = clamp((d - 170) / 170, 0, 1);
        const s = t * t * (3 - 2 * t);
        h = lerp(rw.elevation, h, s);
      }
    }
    return h;
  }

  heightAt(x, z) {
    const half = WORLD.halfSize;
    const n = this.gridN;
    const gx = clamp((x + half) / this.cell, 0, n - 1.001);
    const gz = clamp((z + half) / this.cell, 0, n - 1.001);
    const ix = Math.floor(gx);
    const iz = Math.floor(gz);
    const fx = gx - ix;
    const fz = gz - iz;
    const h00 = this.heights[iz * n + ix];
    const h10 = this.heights[iz * n + ix + 1];
    const h01 = this.heights[(iz + 1) * n + ix];
    const h11 = this.heights[(iz + 1) * n + ix + 1];
    return lerp(lerp(h00, h10, fx), lerp(h01, h11, fx), fz);
  }

  buildClouds() {
    const rand = mulberry32(this.seed * 7 + 11);
    const clouds = [];
    for (let i = 0; i < 46; i++) {
      const x = (rand() * 2 - 1) * WORLD.halfSize * 0.95;
      const z = (rand() * 2 - 1) * WORLD.halfSize * 0.95;
      clouds.push({
        x,
        z,
        y: 380 + rand() * 240,
        size: 60 + rand() * 90,
        puffs: 3 + Math.floor(rand() * 3),
        drift: 1.5 + rand() * 2.5,
      });
    }
    return clouds;
  }

  buildTrees() {
    const rand = mulberry32(this.seed * 13 + 3);
    const trees = [];
    for (let i = 0; i < 420; i++) {
      const x = (rand() * 2 - 1) * WORLD.halfSize * 0.9;
      const z = (rand() * 2 - 1) * WORLD.halfSize * 0.9;
      const h = this.heightAt(x, z);
      if (h < 6 || h > 150) continue; // grass band only, not beach or peak
      trees.push({ x, z, y: h, s: 6 + rand() * 7 });
    }
    return trees;
  }

  // A little fishing village beside the home runway's south end.
  buildVillage() {
    const rand = mulberry32(this.seed * 17 + 29);
    const houses = [];
    for (let i = 0; i < 26; i++) {
      const x = 1500 + rand() * 380;
      const z = 880 + rand() * 260;
      const h = this.heightAt(x, z);
      if (h < 4) continue;
      houses.push({ x, z, y: h, w: 14 + rand() * 10, d: 12 + rand() * 8, rot: rand() * Math.PI });
    }
    return houses;
  }

  // Rings of a mission, as {x, y, z} targets in flight order.
  ringsFor(mission) {
    return mission.rings.map((r) => ({ ...r, passed: false }));
  }

  // The lighthouse on the headland west of the home strip.
  lighthouse() {
    const x = -1250;
    const z = 620;
    return { x, z, y: this.heightAt(x, z) };
  }
}

export function missionById(id) {
  return MISSIONS.find((m) => m.id === id);
}
