// Awan Courier — keyboard and mouse input.
// One job: turn keys and pointer movement into one control vector
// (bank, pitch, throttle) plus the clicks the menus need.

export function makeInput(canvas) {
  const input = {
    bank: 0, // -1 (left) .. +1 (right)
    pitch: 0, // -1 (down) .. +1 (up)
    throttle: 0, // -1 .. +1, applied as a nudge each frame
    keys: new Set(),
    mouseX: 0.5, // 0..1 across the canvas
    mouseY: 0.5,
    mouseSteer: false,
    clicked: null, // {x, y} of the latest click, consumed by the game
    pressedEnter: false,
    muted: false,
  };

  const KEYMAP = {
    ArrowLeft: 'left',
    KeyA: 'left',
    ArrowRight: 'right',
    KeyD: 'right',
    ArrowUp: 'up',
    KeyW: 'up',
    ArrowDown: 'down',
    KeyS: 'down',
  };

  function recompute() {
    const k = input.keys;
    const left = k.has('left') ? 1 : 0;
    const right = k.has('right') ? 1 : 0;
    const up = k.has('up') ? 1 : 0;
    const down = k.has('down') ? 1 : 0;
    let bank = right - left;
    let pitch = up - down;
    // Mouse steering: hold the pointer and the aircraft banks toward it.
    if (input.mouseSteer) {
      bank = (input.mouseX - 0.5) * 2;
      pitch = (0.5 - input.mouseY) * 1.4;
    }
    input.bank = Math.max(-1, Math.min(1, bank));
    input.pitch = Math.max(-1, Math.min(1, pitch));
    // Throttle lives on W/S (or Up/Down): hold to spool up or down.
    input.throttle = (up ? 1 : 0) - (down ? 1 : 0);
    if (input.mouseSteer) input.throttle = 0;
  }

  window.addEventListener('keydown', (e) => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    const action = KEYMAP[e.code];
    if (action) {
      input.keys.add(action);
      e.preventDefault();
    }
    if (e.code === 'Enter' || e.code === 'Space') input.pressedEnter = true;
    if (e.code === 'KeyM') input.muted = !input.muted;
    if (e.code === 'KeyR') input.pressedEnter = true; // R restarts from end screens
    recompute();
  });
  window.addEventListener('keyup', (e) => {
    const action = KEYMAP[e.code];
    if (action) input.keys.delete(action);
    recompute();
  });
  canvas.addEventListener('pointermove', (e) => {
    const rect = canvas.getBoundingClientRect();
    input.mouseX = (e.clientX - rect.left) / rect.width;
    input.mouseY = (e.clientY - rect.top) / rect.height;
    recompute();
  });
  canvas.addEventListener('pointerdown', (e) => {
    const rect = canvas.getBoundingClientRect();
    input.clicked = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    input.mouseSteer = true;
    recompute();
  });
  window.addEventListener('pointerup', () => {
    input.mouseSteer = false;
    recompute();
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  input.consumeClick = function consumeClick() {
    const c = input.clicked;
    input.clicked = null;
    return c;
  };
  input.consumeEnter = function consumeEnter() {
    const v = input.pressedEnter;
    input.pressedEnter = false;
    return v;
  };
  input.recompute = recompute;
  return input;
}
