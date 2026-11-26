// Awan Courier — the entrypoint (Node 22, standard library only).
// One job: hand the game in. It copies this repository's game/ and
// screenshots/ into /output and writes /output/dossier.json, the summary
// the judge reads, with the vendored make.fun library. Outside the
// grader, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// Fail loudly, before copying anything, when the hand-in is incomplete:
// the gate refuses an entry without game/index.html or with the wrong
// number of screenshots, and a loud failure here beats a silent one.
const indexHtml = join(here, 'game', 'index.html');
if (!existsSync(indexHtml)) {
  throw new Error('main.ts: game/index.html is missing — the game cannot be handed in');
}
const shotDir = join(here, 'screenshots');
const shots = existsSync(shotDir)
  ? readdirSync(shotDir).filter((f) => /\.(png|jpe?g)$/i.test(f))
  : [];
if (shots.length < 3 || shots.length > 4) {
  throw new Error(`main.ts: screenshots/ must hold 3 or 4 images, found ${shots.length}`);
}
const gameFiles = readdirSync(join(here, 'game'), { recursive: true });
console.log(`Awan Courier: handing in ${gameFiles.length} game entries, ${shots.length} screenshots`);

function copyTree(src, dest) {
  mkdirSync(dest, { recursive: true });
  for (const entry of readdirSync(src, { withFileTypes: true })) {
    if (entry.isDirectory()) copyTree(join(src, entry.name), join(dest, entry.name));
    else if (entry.isFile()) cpSync(join(src, entry.name), join(dest, entry.name));
  }
}

mkdirSync(out, { recursive: true });
copyTree(join(here, 'game'), join(out, 'game'));
if (existsSync(join(here, 'screenshots'))) {
  copyTree(join(here, 'screenshots'), join(out, 'screenshots'));
}

// The scorer's own caps (reference/gate.json): only text_max_bytes shapes
// the bytes; the others refuse an entry the scorer would refuse (more
// than 4 screenshots or one over 256 KiB; more than 993 files in game/
// or 48 MiB of game files, in all, or a path under game/ over 1000 bytes).
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);
