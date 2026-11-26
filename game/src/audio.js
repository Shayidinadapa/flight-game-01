// Awan Courier — synthesised sound, no audio files.
// One job: engine hum, wind, ring chimes and thuds from WebAudio
// oscillators, so the game ships zero media and stays offline.

export function makeAudio() {
  const audio = {
    ctx: null,
    engineOsc: null,
    engineGain: null,
    windSrc: null,
    windGain: null,
    windFilter: null,
    started: false,
    muted: false,
  };

  function ensure() {
    if (audio.ctx) return true;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return false;
      audio.ctx = new Ctx();
      // Engine: two detuned saws through a lowpass, pitch follows throttle.
      audio.engineOsc = audio.ctx.createOscillator();
      audio.engineOsc.type = 'sawtooth';
      audio.engineOsc.frequency.value = 55;
      const engineOsc2 = audio.ctx.createOscillator();
      engineOsc2.type = 'sawtooth';
      engineOsc2.frequency.value = 55.7;
      audio.engineGain = audio.ctx.createGain();
      audio.engineGain.gain.value = 0;
      const lp = audio.ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 420;
      audio.engineOsc.connect(lp);
      engineOsc2.connect(lp);
      lp.connect(audio.engineGain);
      audio.engineGain.connect(audio.ctx.destination);
      audio.engineOsc.start();
      engineOsc2.start();
      audio.engineOsc2 = engineOsc2;
      // Wind: looped noise through a bandpass.
      const len = audio.ctx.sampleRate * 2;
      const buf = audio.ctx.createBuffer(1, len, audio.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      audio.windSrc = audio.ctx.createBufferSource();
      audio.windSrc.buffer = buf;
      audio.windSrc.loop = true;
      audio.windFilter = audio.ctx.createBiquadFilter();
      audio.windFilter.type = 'bandpass';
      audio.windFilter.frequency.value = 700;
      audio.windFilter.Q.value = 0.6;
      audio.windGain = audio.ctx.createGain();
      audio.windGain.gain.value = 0;
      audio.windSrc.connect(audio.windFilter);
      audio.windFilter.connect(audio.windGain);
      audio.windGain.connect(audio.ctx.destination);
      audio.windSrc.start();
      audio.started = true;
      return true;
    } catch (err) {
      return false;
    }
  }

  audio.resume = function resume() {
    if (ensure() && audio.ctx.state === 'suspended') audio.ctx.resume();
  };

  // Call every frame: engine and wind follow throttle and speed.
  audio.update = function update(throttle, speed, flying) {
    if (!audio.ctx || audio.muted) {
      if (audio.engineGain) audio.engineGain.gain.value = 0;
      if (audio.windGain) audio.windGain.gain.value = 0;
      return;
    }
    const t = audio.ctx.currentTime;
    const rpm = 42 + throttle * 58 + (flying ? speed * 0.12 : 0);
    audio.engineOsc.frequency.setTargetAtTime(rpm, t, 0.08);
    audio.engineOsc2.frequency.setTargetAtTime(rpm * 1.012, t, 0.08);
    audio.engineGain.gain.setTargetAtTime(flying ? 0.05 + throttle * 0.05 : 0.03, t, 0.1);
    audio.windGain.gain.setTargetAtTime(flying ? Math.min(0.09, speed * 0.0011) : 0, t, 0.15);
    audio.windFilter.frequency.setTargetAtTime(500 + speed * 6, t, 0.2);
  };

  function blip(freq, dur, type, vol, when) {
    if (!audio.ctx || audio.muted) return;
    const t = audio.ctx.currentTime + (when || 0);
    const osc = audio.ctx.createOscillator();
    osc.type = type || 'sine';
    osc.frequency.value = freq;
    const g = audio.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol || 0.16, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g);
    g.connect(audio.ctx.destination);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  audio.ring = function ring() {
    blip(880, 0.35, 'sine', 0.2, 0);
    blip(1318, 0.5, 'sine', 0.16, 0.09);
  };
  audio.thud = function thud() {
    blip(70, 0.3, 'sine', 0.3, 0);
    blip(48, 0.4, 'triangle', 0.22, 0.02);
  };
  audio.crash = function crash() {
    if (!audio.ctx || audio.muted) return;
    const t = audio.ctx.currentTime;
    const len = audio.ctx.sampleRate * 0.7;
    const buf = audio.ctx.createBuffer(1, len, audio.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = audio.ctx.createBufferSource();
    src.buffer = buf;
    const g = audio.ctx.createGain();
    g.gain.value = 0.5;
    const lp = audio.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 900;
    src.connect(lp);
    lp.connect(g);
    g.connect(audio.ctx.destination);
    src.start(t);
    blip(55, 0.6, 'sine', 0.3, 0);
  };
  audio.click = function click() {
    blip(660, 0.08, 'square', 0.07, 0);
  };
  audio.fanfare = function fanfare() {
    blip(523, 0.25, 'triangle', 0.18, 0);
    blip(659, 0.25, 'triangle', 0.18, 0.12);
    blip(784, 0.45, 'triangle', 0.2, 0.24);
  };

  return audio;
}
