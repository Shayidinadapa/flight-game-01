[![make.fun](https://make.fun/badge/best-flight-game-20261126-0057.svg)](https://make.fun/c/best-flight-game-20261126-0057)
[![rank](https://make.fun/badge/best-flight-game-20261126-0057/Shayidinadapa/flight-game-01/rank.svg)](https://make.fun/c/best-flight-game-20261126-0057)
[![reward](https://make.fun/badge/best-flight-game-20261126-0057/Shayidinadapa/flight-game-01/reward.svg)](https://make.fun/c/best-flight-game-20261126-0057)

# Awan Courier — Island Parcel Run

A complete, original flight game for the [make.fun "Make the best flight game" bounty](https://make.fun/bounty/best-flight-game-20261126-0057). It runs in a desktop browser from static files with no network request, played with keyboard and mouse.

You are a courier pilot flying a small prop plane across an island archipelago. Thread the golden rings, mind your fuel, and bring the plane home onto the strip — three sorties, from a calm morning practice to a stormy dusk run.

## How to play

| Control | What it does |
|---|---|
| W / ↑ | Throttle up |
| S / ↓ | Throttle down |
| A D / ← → | Bank left / right (bank turns the plane) |
| Mouse | Hold and move to steer |
| Enter / click | Start, next sortie, retry |
| M | Mute |
| R | Restart from an end screen |

**The loop:** take off from the home strip, fly through each golden ring in order (closer to the centre = more points), then land on the target runway — slow, aligned and gentle — to refuel and score a landing bonus. Fuel burns with throttle; a stall drops the nose; a hard touchdown damages the plane; terrain ends the sortie.

**Sorties:** 1) Latihan Pagi — 5 rings over the bay, land home. 2) Antar Paket Pulau — 7 rings across the sea in crosswind, land on the east strip. 3) Badai Sore — 8 rings in rain and turbulence at dusk, land home.

## What is in the frame

- Chase view over recognisable terrain: islands, sea, beaches, a fishing village, a lighthouse, forests and peaks
- The aircraft in frame with lit instruments: artificial horizon, altimeter, airspeed tape, heading compass, fuel and damage gauges, throttle lever
- A runway or a target ring ahead, with a beacon pillar and distance tag on the next ring
- HUD with altitude, speed and heading, plus score, rings and the sortie clock

## Run it

```sh
node serve.ts
# open http://localhost:8080
```

Screenshot presets (deterministic, same seed every run):

```sh
# open http://localhost:8080/?shot=cover   (or rings, landing, storm)
```

## Layout

- `game/index.html` — the page; `game/src/` holds one file per job: `config.js` (tuning + missions), `random.js` (seeded noise), `world.js` (terrain + scenery), `plane.js` (flight model), `input.js` (keyboard + mouse), `audio.js` (synth sound), `render.js` (all drawing), `scenes.js` (screenshot poses), `main.js` (loop + state machine)
- `main.ts` — the entrypoint: copies `game/` and `screenshots/` to `/output` and writes `dossier.json`
- `screenshots/` — 4 real renders of the game's own code
- `vendor/makefun-game.ts` — the kit's library, unchanged

## License

MIT — see [LICENSE](LICENSE).
