// Awan Courier — deterministic screenshot scenes.
// One job: put the aircraft, the rings and the light exactly where a
// screenshot needs them, so every render is reproducible.

import { MISSIONS } from './config.js';
import { placeOnRunway } from './plane.js';

// The game calls this when the page opens with ?shot=<name>&seed=<n>.
// It freezes the clock and poses the aircraft for a beauty shot.
export function applyShot(game, name) {
  const plane = game.plane;
  game.frozen = true;
  if (name === 'cover') {
    // Golden morning over the east coast: next ring ahead, island coast
    // to the left, open sea to the right, sky above the horizon.
    game.setMission(MISSIONS[0]);
    plane.x = 1850;
    plane.y = 200;
    plane.z = 450;
    plane.headingDeg = 350;
    plane.pitchDeg = 4;
    plane.bankDeg = -8;
    plane.speed = 58;
    plane.throttle = 0.7;
    plane.fuel = 82;
    plane.onGround = false;
    game.mission.ringsState[0].passed = false;
    game.time = 42;
  } else if (name === 'rings') {
    // About to thread the second ring over the bay, sea below.
    game.setMission(MISSIONS[0]);
    plane.x = 1800;
    plane.y = 175;
    plane.z = -100;
    plane.headingDeg = 355;
    plane.pitchDeg = 1;
    plane.bankDeg = 6;
    plane.speed = 62;
    plane.throttle = 0.75;
    plane.fuel = 74;
    plane.onGround = false;
    game.mission.ringsState[0].passed = true;
    game.score = 112;
    game.time = 61;
  } else if (name === 'landing') {
    // Short final to the home strip: offset east of the centreline so
    // the runway reads beside the aircraft, low and slow.
    game.setMission(MISSIONS[0]);
    plane.x = 1980;
    plane.y = 45;
    plane.z = 1000;
    plane.headingDeg = 355;
    plane.pitchDeg = -4;
    plane.bankDeg = 5;
    plane.speed = 34;
    plane.throttle = 0.3;
    plane.fuel = 41;
    plane.onGround = false;
    game.mission.ringsState.forEach((r) => {
      r.passed = true;
    });
    game.score = 486;
    game.time = 118;
  } else if (name === 'storm') {
    // Storm sortie: rain, dusk light, next ring ahead over the sea.
    game.setMission(MISSIONS[2]);
    plane.x = 2350;
    plane.y = 195;
    plane.z = -1350;
    plane.headingDeg = 200;
    plane.pitchDeg = 1;
    plane.bankDeg = -14;
    plane.speed = 60;
    plane.throttle = 0.72;
    plane.fuel = 66;
    plane.onGround = false;
    game.mission.ringsState[0].passed = true;
    game.score = 118;
    game.time = 96;
  } else {
    // Unknown shot name: fall back to the cover pose.
    return applyShot(game, 'cover');
  }
  game.phase = 'flying';
  game.elapsed = game.time;
  return name;
}

export function shotList() {
  return ['cover', 'rings', 'landing', 'storm'];
}

// Place the aircraft at the start of a sortie, on its start runway.
export function startSortiePose(game) {
  placeOnRunway(game.plane, game.mission.startRunway ?? game.mission.runway);
  game.plane.fuel = game.mission.fuelStart;
  game.plane.damage = 0;
  game.elapsed = 0;
}
