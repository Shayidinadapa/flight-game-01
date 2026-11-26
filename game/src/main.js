// Awan Courier — the game loop and state machine.
// One job: own the phases (title, briefing, flying, landed, crashed,
// complete), run the flight model, score the sortie, and draw frames.

import { MISSIONS, RUNWAYS, SCORE } from './config.js';
import { World } from './world.js';
import { makePlane, stepPlane, scoreLanding } from './plane.js';
import { makeInput } from './input.js';
import { makeAudio } from './audio.js';
import { drawScene, drawTitle, drawBriefing, drawEnd, fmtTime } from './render.js';
import { applyShot, startSortiePose } from './scenes.js';

export function createGame(canvas) {
  const game = {
    canvas,
    ctx: canvas.getContext('2d'),
    canvasW: 1280,
    canvasH: 800,
    world: new World(7),
    plane: makePlane(),
    input: makeInput(canvas),
    audio: makeAudio(),
    phase: 'title', // title | briefing | flying | landed | crashed | complete
    missionIndex: 0,
    mission: null,
    score: 0,
    elapsed: 0,
    time: 0,
    frozen: false,
    popups: [],
    buttons: [],
    lastTs: 0,
    endLines: [],
    endKind: 'complete',
    shotName: null,
    totalRings: 0,
  };
  game.mission = null;
  game.setMission = function setMission(mission) {
    game.mission = mission;
    game.mission.ringsState = game.world.ringsFor(mission);
  };
  game.setMission(MISSIONS[0]);
  startSortiePose(game);
  return game;
}

function popup(game, text) {
  game.popups.push({ text, at: game.time });
  if (game.popups.length > 5) game.popups.shift();
}

function startMission(game) {
  game.setMission(MISSIONS[game.missionIndex]);
  startSortiePose(game);
  game.score = game.missionIndex === 0 ? 0 : game.score;
  game.phase = 'briefing';
  game.elapsed = 0;
  game.popups = [];
}

function beginFlight(game) {
  game.phase = 'flying';
  game.audio.resume();
  game.audio.click();
}

function endSortie(game, kind) {
  if (kind === 'complete') {
    game.phase = 'complete';
    game.audio.fanfare();
    game.endKind = 'complete';
    game.endLines = [
      `Skor akhir: ${game.score}  ·  Ring: ${game.totalRings} dilewati`,
      'Terima kasih sudah terbang bersama Awan Courier!',
      'Tekan R atau klik ULANGI untuk terbang lagi.',
    ];
  }
}

function handleEvents(game, events) {
  for (const ev of events) {
    if (ev.type === 'ring') {
      game.score += ev.points;
      game.totalRings += 1;
      popup(game, `+${ev.points} RING!`);
      game.audio.ring();
    } else if (ev.type === 'landed') {
      const pts = scoreLanding(ev.smooth, game.elapsed, game.mission.parTimeSec);
      game.score += pts;
      popup(game, `MENDARAT +${pts}`);
      game.audio.thud();
      game.phase = 'landed';
      game.endKind = 'landed';
      game.endLines = [
        `Pendaratan mulus! +${pts} poin (halus ${Math.round(ev.smooth * 100)}%)`,
        `Skor sementara: ${game.score}`,
        game.missionIndex + 1 < MISSIONS.length
          ? 'Sortie berikutnya menunggu — tekan ENTER.'
          : 'Itu sortie terakhir — tekan ENTER untuk hasil akhir.',
      ];
      // Refuel on the strip, ready for the next leg.
      game.plane.fuel = game.mission.fuelStart;
    } else if (ev.type === 'hard-landing') {
      popup(game, 'PENDARATAN KERAS −35 DMG');
      game.audio.thud();
    } else if (ev.type === 'crash' || ev.type === 'crashed') {
      game.score = Math.max(0, game.score - SCORE.crashPenalty);
      game.phase = 'crashed';
      game.endKind = 'crash';
      game.audio.crash();
      game.endLines = [
        ev.reason === 'terrain' ? 'Pesawat menabrak medan.' : 'Pesawat rusak berat.',
        `Skor −${SCORE.crashPenalty} (sisa ${game.score}). Coba lagi sortie ini.`,
        'Tekan R atau klik ULANGI.',
      ];
    } else if (ev.type === 'fuel-empty') {
      popup(game, 'BAHAN BAKAR HABIS — meluncur!');
    } else if (ev.type === 'takeoff') {
      popup(game, 'LEPAS LANDAS!');
    }
  }
}

function advanceAfterLanding(game) {
  if (game.missionIndex + 1 < MISSIONS.length) {
    game.missionIndex += 1;
    startMission(game);
  } else {
    endSortie(game, 'complete');
  }
}

function hitButton(game, click) {
  if (!click) return null;
  for (const b of game.buttons) {
    if (click.x >= b.x && click.x <= b.x + b.w && click.y >= b.y && click.y <= b.y + b.h) {
      return b.id;
    }
  }
  return null;
}

function update(game, dt) {
  const input = game.input;
  game.audio.muted = input.muted;
  const click = input.consumeClick();
  const enter = input.consumeEnter();

  if (game.phase === 'title') {
    if (enter || hitButton(game, click) === 'start') {
      game.audio.resume();
      game.missionIndex = 0;
      game.score = 0;
      game.totalRings = 0;
      startMission(game);
    }
    return;
  }
  if (game.phase === 'briefing') {
    if (enter || hitButton(game, click) === 'start') beginFlight(game);
    return;
  }
  if (game.phase === 'landed') {
    const hit = hitButton(game, click);
    if (enter || hit === 'retry') advanceAfterLanding(game);
    else if (hit === 'menu') {
      game.phase = 'title';
      game.missionIndex = 0;
    }
    return;
  }
  if (game.phase === 'crashed') {
    const hit = hitButton(game, click);
    if (enter || hit === 'retry') {
      game.plane.damage = 0;
      startMission(game);
    } else if (hit === 'menu') {
      game.phase = 'title';
    }
    return;
  }
  if (game.phase === 'complete') {
    const hit = hitButton(game, click);
    if (enter || hit === 'retry') {
      game.missionIndex = 0;
      game.score = 0;
      game.totalRings = 0;
      startMission(game);
    } else if (hit === 'menu') {
      game.phase = 'title';
    }
    return;
  }

  // Flying.
  game.elapsed += dt;
  game.time += dt;
  const events = stepPlane(game.plane, game.input, game.world, game.mission, dt, game.time);
  handleEvents(game, events);
  game.audio.update(game.plane.throttle, game.plane.speed, !game.plane.onGround);
  // Out of fuel and on the ground far from a strip: the sortie is over.
  if (game.plane.fuel <= 0 && game.plane.onGround && game.plane.speed < 1) {
    const rw = RUNWAYS[game.mission.runway];
    const d = Math.hypot(game.plane.x - rw.x, game.plane.z - rw.z);
    if (d > rw.length) {
      game.phase = 'crashed';
      game.endKind = 'fuel';
      game.endLines = [
        'Bahan bakar habis jauh dari landasan.',
        'Sortie gagal — coba lagi dengan throttle lebih hemat.',
        'Tekan R atau klik ULANGI.',
      ];
    }
  }
}

function frame(game, ts) {
  const dt = game.frozen ? 0 : Math.min(0.05, (ts - game.lastTs) / 1000 || 0.016);
  game.lastTs = ts;
  if (!game.frozen) update(game, dt);
  drawScene(game.ctx, game);
  // Overlays draw after the scene, so they can use the fresh camera.
  if (game.phase === 'title') game.buttons = drawTitle(game.ctx, game, game.cam);
  else if (game.phase === 'briefing') game.buttons = drawBriefing(game.ctx, game, game.cam);
  else if (game.phase === 'landed') game.buttons = drawEnd(game.ctx, game, game.cam, 'landed', game.endLines);
  else if (game.phase === 'crashed') game.buttons = drawEnd(game.ctx, game, game.cam, game.endKind, game.endLines);
  else if (game.phase === 'complete') game.buttons = drawEnd(game.ctx, game, game.cam, 'complete', game.endLines);
  if (!game.frozen) requestAnimationFrame((t) => frame(game, t));
}

// Test hook: the play-test drives the game through this handle.
export function boot(canvas) {
  const game = createGame(canvas);
  const params = new URLSearchParams(window.location.search);
  const shot = params.get('shot');
  if (shot) {
    game.shotName = applyShot(game, shot);
    game.phase = 'flying';
    drawScene(game.ctx, game);
  } else {
    // Scenic flyover behind the title screen; starting a sortie resets
    // the pose to the runway.
    game.plane.x = 1850;
    game.plane.y = 210;
    game.plane.z = 450;
    game.plane.headingDeg = 350;
    game.plane.pitchDeg = 4;
    game.plane.bankDeg = -6;
    game.plane.speed = 55;
    game.plane.throttle = 0.65;
    game.plane.onGround = false;
    game.lastTs = performance.now();
    requestAnimationFrame((t) => frame(game, t));
  }
  window.__awan = game;
  return game;
}

export { fmtTime };
