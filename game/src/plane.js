// Awan Courier — the flight model.
// One job: turn throttle, pitch and bank inputs into a moving aircraft,
// and decide what happens when it meets a ring, the ground or a runway.

import { PLANE, RUNWAYS, RING, SCORE } from './config.js';
import { clamp, degToRad } from './random.js';

export function makePlane() {
  return {
    x: 0,
    y: 150, // altitude, metres
    z: 1150,
    headingDeg: 0, // 0 = north (-z), 90 = east (+x)
    pitchDeg: 0, // + = nose up
    bankDeg: 0, // + = bank right
    speed: 55,
    throttle: 0.65,
    fuel: 100,
    damage: 0,
    onGround: false,
    verticalSpeed: 0,
    // Input targets, eased toward by the model.
    targetBankDeg: 0,
    targetPitchDeg: 0,
  };
}

// Where the aircraft starts a sortie: on the strip, lined up, with the
// whole strip ahead of it. Forward for a heading is (sin, -cos) in
// (x, z): north is -z, so the start sits behind the threshold.
export function placeOnRunway(plane, runwayKey) {
  const rw = RUNWAYS[runwayKey];
  const hdg = degToRad(rw.headingDeg);
  // Start at the threshold end so the whole strip lies ahead.
  const back = rw.length / 2 - 40;
  plane.x = rw.x - Math.sin(hdg) * back;
  plane.z = rw.z + Math.cos(hdg) * back;
  plane.y = rw.elevation + 1.5;
  plane.headingDeg = rw.headingDeg;
  plane.pitchDeg = 0;
  plane.bankDeg = 0;
  plane.speed = 0;
  plane.throttle = 0;
  plane.onGround = true;
  plane.verticalSpeed = 0;
  plane.targetBankDeg = 0;
  plane.targetPitchDeg = 0;
}

export function stepPlane(plane, input, world, mission, dt, time) {
  const events = [];
  const prevY = plane.y;

  // --- Controls: ease bank and pitch toward the pilot's input. ---
  plane.targetBankDeg = clamp(input.bank * PLANE.maxBankDeg, -PLANE.maxBankDeg, PLANE.maxBankDeg);
  plane.targetPitchDeg = clamp(input.pitch * PLANE.maxPitchDeg, -PLANE.maxPitchDeg, PLANE.maxPitchDeg);
  plane.bankDeg = clamp(
    plane.bankDeg + clamp(plane.targetBankDeg - plane.bankDeg, -PLANE.bankRate * dt, PLANE.bankRate * dt),
    -PLANE.maxBankDeg,
    PLANE.maxBankDeg,
  );
  plane.pitchDeg += clamp(plane.targetPitchDeg - plane.pitchDeg, -PLANE.pitchRate * dt, PLANE.pitchRate * dt);

  // --- Throttle and speed. ---
  plane.throttle = clamp(plane.throttle + input.throttle * PLANE.throttleRate * dt, 0, 1);
  const targetSpeed = PLANE.maxSpeed * (0.25 + 0.75 * plane.throttle);
  const speedEase = plane.onGround ? 0.35 : 0.55;
  plane.speed += (targetSpeed - plane.speed) * Math.min(1, speedEase * dt);
  if (plane.onGround && plane.speed < 8) plane.speed = Math.max(plane.speed, plane.throttle * 30 * dt * 8);

  // --- Fuel. ---
  const burn = PLANE.fuelBurnIdle + (PLANE.fuelBurnFull - PLANE.fuelBurnIdle) * plane.throttle;
  plane.fuel = Math.max(0, plane.fuel - burn * dt);
  if (plane.fuel <= 0 && plane.throttle > 0) {
    plane.throttle = 0;
    events.push({ type: 'fuel-empty' });
  }

  // --- Turn: bank rolls the heading around. A 1.6x arcade assist keeps
  // the turn lively at game speeds; the raw formula is a real Cessna's.
  const turnRate = (9.81 * Math.tan(degToRad(plane.bankDeg))) / Math.max(plane.speed, 12) * 1.6;
  plane.headingDeg = (plane.headingDeg + (turnRate * 180) / Math.PI * dt + 360) % 360;

  // --- Turbulence shakes the nose in the storm sortie. ---
  let turbPitch = 0;
  let turbBank = 0;
  if (mission.turbulence > 0 && !plane.onGround) {
    turbPitch = Math.sin(time * 2.7) * 2.2 * mission.turbulence + Math.sin(time * 5.1) * 1.1 * mission.turbulence;
    turbBank = Math.sin(time * 3.3 + 1.7) * 4 * mission.turbulence;
  }

  // --- Climb and sink. ---
  const hdg = degToRad(plane.headingDeg);
  const pitch = degToRad(plane.pitchDeg + turbPitch);
  const flying = plane.speed > PLANE.stallSpeed;
  let climb = 0;
  if (!plane.onGround) {
    if (flying) {
      climb = Math.sin(pitch) * plane.speed;
      // A steep bank costs lift: the wing has to work harder.
      climb -= Math.abs(Math.sin(degToRad(plane.bankDeg + turbBank))) * plane.speed * 0.12;
    } else {
      // Stalled: the nose drops and the aircraft sinks fast.
      climb = -12 - (PLANE.stallSpeed - plane.speed) * 0.4;
      events.push({ type: 'stall' });
    }
    // Wind pushes the aircraft sideways (crosswind component).
    const windPush = mission.wind * dt;
    plane.x += Math.cos(hdg) * windPush * 0.4;
    plane.z += Math.sin(hdg) * windPush * 0.4;
  }
  plane.y += climb * dt;
  plane.verticalSpeed = dt > 0 ? (plane.y - prevY) / dt : 0;

  // --- Move forward along the heading. ---
  const forward = Math.cos(pitch) * plane.speed * dt;
  plane.x += Math.sin(hdg) * forward;
  plane.z -= Math.cos(hdg) * forward;

  // Keep the aircraft inside the map; the sea beyond is out of bounds.
  const bound = 2950;
  plane.x = clamp(plane.x, -bound, bound);
  plane.z = clamp(plane.z, -bound, bound);
  if (plane.y > 900) plane.y = 900;

  // --- Rings: fly through the hoop, score by closeness to centre. ---
  const rings = mission.ringsState;
  const next = rings.find((r) => !r.passed);
  if (next && !plane.onGround) {
    const dx = plane.x - next.x;
    const dy = plane.y - next.y;
    const dz = plane.z - next.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (dist < RING.radius) {
      next.passed = true;
      const accuracy = 1 - dist / RING.radius;
      const points = Math.round(RING.edgePoints + (RING.centrePoints - RING.edgePoints) * accuracy);
      events.push({ type: 'ring', points, accuracy, ring: next });
    }
  }

  // --- Ground contact. ---
  const ground = world.heightAt(plane.x, plane.z);
  const clearance = plane.y - ground;
  if (clearance <= 0.5 && !plane.onGround) {
    const rw = RUNWAYS[mission.runway];
    const landed = checkLanding(plane, rw);
    if (landed.ok) {
      plane.onGround = true;
      plane.y = rw.elevation + 1.5;
      plane.pitchDeg = 0;
      plane.bankDeg = 0;
      plane.speed = Math.max(0, plane.speed - 18 * dt * 10);
      events.push({ type: 'landed', smooth: landed.smooth, runway: mission.runway });
    } else if (landed.hard) {
      // A hard touchdown on the strip: damage, but the aircraft survives.
      plane.damage = Math.min(PLANE.damageMax, plane.damage + 35);
      plane.onGround = true;
      plane.y = rw.elevation + 1.5;
      plane.speed *= 0.4;
      events.push({ type: 'hard-landing', damage: 35 });
    } else {
      // Terrain strike: crash.
      plane.damage = PLANE.damageMax;
      events.push({ type: 'crash', reason: 'terrain' });
    }
  } else if (plane.onGround) {
    // Rolling on the strip: stay glued, bleed speed, allow take-off.
    plane.y = ground + 1.5;
    plane.speed = Math.max(0, plane.speed - 6 * dt);
    if (plane.speed > PLANE.stallSpeed + 6 && plane.pitchDeg > 6) {
      plane.onGround = false;
      events.push({ type: 'takeoff' });
    }
    if (plane.speed < 1 && plane.throttle < 0.05) plane.speed = 0;
  }

  // --- Out of the sky with no fuel and no speed: forced landing. ---
  // (A terrain strike above already reported 'crash'; do not report it
  // twice, or the score penalty would land twice too.)
  if (plane.damage >= PLANE.damageMax && !events.some((e) => e.type === 'crash')) {
    events.push({ type: 'crashed' });
  }

  return events;
}

// Is the aircraft over the runway, aligned, slow and gentle?
export function checkLanding(plane, rw) {
  const hdg = degToRad(rw.headingDeg);
  const rx = Math.sin(hdg);
  const rz = Math.cos(hdg);
  const dx = plane.x - rw.x;
  const dz = plane.z - rw.z;
  const along = dx * rx + dz * rz; // + = past the centre toward the far end
  const across = Math.abs(dx * rz - dz * rx);
  const overStrip = Math.abs(along) <= rw.length / 2 && across <= rw.width / 2 + 6;
  if (!overStrip) return { ok: false, hard: false };
  const headingErr = Math.abs(((plane.headingDeg - rw.headingDeg + 540) % 360) - 180);
  const aligned = headingErr < 25 || headingErr > 335;
  const gentle = plane.verticalSpeed > -6.5;
  const slowEnough = plane.speed < 62;
  if (aligned && gentle && slowEnough) {
    const smooth = clamp(1 - Math.abs(plane.verticalSpeed) / 6.5, 0, 1);
    return { ok: true, hard: false, smooth };
  }
  // On the strip but too fast, too steep or sideways: a hard landing.
  if (plane.verticalSpeed > -14 && plane.speed < 85) return { ok: false, hard: true };
  return { ok: false, hard: false };
}

export function scoreLanding(smooth, timeSec, parTimeSec) {
  let points = SCORE.landingBase + Math.round(SCORE.landingSmooth * smooth);
  if (timeSec < parTimeSec) points += Math.round((parTimeSec - timeSec) * SCORE.timePerSecond);
  return points;
}
