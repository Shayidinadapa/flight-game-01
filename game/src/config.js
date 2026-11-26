// Awan Courier — tuning, missions and palette.
// One job: every number the game balances on lives here, so a tweak
// never means hunting through the flight model or the renderer.

export const GAME_TITLE = 'AWAN COURIER';
export const GAME_SUBTITLE = 'Island Parcel Run';

export const WORLD = {
  // Playable map, metres, centred on (0, 0). Sea level is y = 0.
  halfSize: 3000,
  // Heightmap resolution over the whole map.
  gridN: 160,
  // Fog starts to bite past this distance (metres).
  fogNear: 900,
  fogFar: 2600,
};

export const PLANE = {
  maxSpeed: 92, // m/s at full throttle, level flight
  cruiseSpeed: 55,
  stallSpeed: 22, // below this the wing stops flying
  maxClimb: 14, // m/s at best climb
  maxBankDeg: 55,
  maxPitchDeg: 20,
  // How fast the controls answer (degrees per second).
  bankRate: 26,
  pitchRate: 20,
  throttleRate: 0.55,
  // Fuel: 100 units. Full throttle burns ~0.5/s, idle ~0.12/s.
  fuelMax: 100,
  fuelBurnFull: 0.5,
  fuelBurnIdle: 0.12,
  damageMax: 100,
};

export const RING = {
  radius: 30, // metres; fly through the hoop
  // Points for a clean centre pass, scaled down toward the rim.
  centrePoints: 120,
  edgePoints: 40,
};

// A sortie: a chain of rings, then a landing strip to finish.
export const MISSIONS = [
  {
    id: 'morning',
    name: 'Sortie 1 — Latihan Pagi',
    brief: 'Terbang melewati 5 ring emas di atas teluk, lalu mendarat di landasan rumah.',
    timeOfDay: 'morning', // golden morning light
    wind: 0, // m/s crosswind
    turbulence: 0,
    fuelStart: 100,
    rings: [
      { x: 1950, y: 160, z: 100 },
      { x: 1850, y: 180, z: -350 },
      { x: 1700, y: 160, z: -800 },
      { x: 1500, y: 190, z: -1100 },
      { x: 1200, y: 150, z: -1250 },
    ],
    runway: 'home',
    startRunway: 'home',
    parTimeSec: 150,
  },
  {
    id: 'delivery',
    name: 'Sortie 2 — Antar Paket Pulau',
    brief: 'Bawa paket ke pulau timur: 7 ring lintas laut, angin samping, mendarat di strip timur.',
    timeOfDay: 'noon',
    wind: 6,
    turbulence: 0.15,
    fuelStart: 100,
    rings: [
      { x: 1800, y: 160, z: -100 },
      { x: 1500, y: 190, z: -700 },
      { x: 1700, y: 170, z: -1200 },
      { x: 2100, y: 200, z: -1500 },
      { x: 2400, y: 150, z: -1750 },
      { x: 2550, y: 130, z: -2000 },
      { x: 2600, y: 120, z: -2250 },
    ],
    runway: 'east',
    startRunway: 'home',
    parTimeSec: 210,
  },
  {
    id: 'storm',
    name: 'Sortie 3 — Badai Sore',
    brief: 'Badai sore: 8 ring dalam hujan dan turbulensi. Mendarat pulang sebelum gelap.',
    timeOfDay: 'dusk',
    wind: 11,
    turbulence: 0.45,
    fuelStart: 100,
    rings: [
      { x: 2500, y: 180, z: -1500 },
      { x: 2100, y: 210, z: -1100 },
      { x: 1600, y: 170, z: -900 },
      { x: 1100, y: 200, z: -600 },
      { x: 700, y: 160, z: -300 },
      { x: 300, y: 190, z: 0 },
      { x: 100, y: 150, z: 300 },
      { x: 600, y: 130, z: 600 },
    ],
    runway: 'home',
    startRunway: 'east',
    parTimeSec: 260,
  },
];

export const RUNWAYS = {
  // Home strip on the east coast: north-south, threshold at its south end.
  home: { x: 1900, z: 500, headingDeg: 0, length: 700, width: 34, elevation: 16 },
  // East strip on the second island: north-south, land flying south.
  east: { x: 2600, z: -1900, headingDeg: 180, length: 560, width: 30, elevation: 22 },
};

export const SCORE = {
  landingBase: 250,
  // Bonus for a gentle touchdown: up to this much extra.
  landingSmooth: 150,
  // Time bonus if the sortie finishes under par.
  timePerSecond: 4,
  // Crash costs this much score, then the sortie restarts.
  crashPenalty: 150,
};

export const SKY = {
  morning: { top: '#2f6fb4', mid: '#8fc3e8', low: '#ffe9b8', sun: '#fff3c4', fog: '#cfe4f2' },
  noon: { top: '#1f6fd0', mid: '#6db3ef', low: '#d8eefb', sun: '#ffffff', fog: '#cfe8f7' },
  dusk: { top: '#2c2a55', mid: '#b65a6e', low: '#ff9e5e', sun: '#ffb347', fog: '#8a6f7d' },
};

export const SHOT_SEEDS = { cover: 7, rings: 7, landing: 7, storm: 7 };
