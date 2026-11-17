// Game-show music + sound effects made with the Web Audio API (no files needed).
// Drop your own files at /audio/music.mp3 and /audio/buzzer.mp3 to replace them.
(function () {
  let ctx = null, master = null, musicGain = null, sfxGain = null;
  let musicOn = false, sfxOn = true, musicTimer = null, step = 0, nextTime = 0, tempo = 118;
  let fileMusic = null, fileBuzzer = null;
  const prefs = (() => { try { return JSON.parse(localStorage.getItem('qb-audio') || '{}'); } catch { return {}; } })();

  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = 0.9; master.connect(ctx.destination);
    musicGain = ctx.createGain(); musicGain.gain.value = 0.32; musicGain.connect(master);
    sfxGain = ctx.createGain(); sfxGain.gain.value = 0.8; sfxGain.connect(master);
    // Optional custom audio files (public/audio/music.mp3, public/audio/buzzer.mp3)
    fetch('/api/audio').then((r) => r.json()).then((has) => {
      if (has.music) { fileMusic = new Audio('/audio/music.mp3'); fileMusic.loop = true; fileMusic.volume = 0.45; if (musicOn) { stopSynth(); fileMusic.play().catch(() => {}); } }
      if (has.buzzer) fileBuzzer = '/audio/buzzer.mp3';
    }).catch(() => {});
  }

  function tone(freq, t, dur, type = 'sine', vol = 0.3, dest = sfxGain, attack = 0.005) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + 0.05);
    return o;
  }
  function noise(t, dur, vol, dest, hp = 6000) {
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp;
    const g = ctx.createGain(); g.gain.value = vol;
    src.connect(f); f.connect(g); g.connect(dest); src.start(t);
  }
  const N = (m) => 440 * Math.pow(2, (m - 69) / 12); // midi -> Hz

  // --- Music: bouncy 4-bar loop (C - Am - F - G) with bass, stabs, hats and a hook
  const PROG = [[48, 52, 55], [45, 48, 52], [41, 45, 48], [43, 47, 50]];
  const BASS = [0, null, 12, null, 7, null, 12, 10];
  const HOOK = [
    [72, null, 76, 79, null, 76, 77, null], [76, null, 72, null, 69, null, 72, null],
    [77, null, 81, 79, null, 77, 76, null], [74, null, 79, null, 77, 76, 74, null],
  ];
  function scheduleStep(t) {
    const bar = Math.floor(step / 8) % 4, s = step % 8;
    const chord = PROG[bar];
    const eighth = 60 / tempo / 2;
    // hats
    noise(t, 0.04, s % 2 ? 0.12 : 0.06, musicGain, 7000);
    // kick on 1 & 3, snare-ish clap on 2 & 4
    if (s === 0 || s === 4) { const o = tone(120, t, 0.18, 'sine', 0.55, musicGain); o.frequency.exponentialRampToValueAtTime(45, t + 0.15); }
    if (s === 2 || s === 6) noise(t, 0.12, 0.22, musicGain, 1500);
    // bass
    const b = BASS[s];
    if (b !== null) tone(N(chord[0] - 12 + b), t, eighth * 0.9, 'triangle', 0.32, musicGain);
    // offbeat chord stabs (brass-ish)
    if (s === 1 || s === 5 || s === 7) chord.forEach((n) => tone(N(n + 12), t, eighth * 0.6, 'sawtooth', 0.035, musicGain, 0.01));
    // hook every other time through
    const loop = Math.floor(step / 32) % 2;
    const h = HOOK[bar][s];
    if (loop === 1 && h !== null) { tone(N(h), t, eighth * 0.85, 'square', 0.045, musicGain); tone(N(h + 12), t, eighth * 0.5, 'sine', 0.04, musicGain); }
    step++;
  }
  function tick() {
    const eighth = 60 / tempo / 2;
    while (nextTime < ctx.currentTime + 0.15) { scheduleStep(nextTime); nextTime += eighth; }
  }
  function startSynth() { if (musicTimer) return; step = 0; nextTime = ctx.currentTime + 0.05; musicTimer = setInterval(tick, 40); }
  function stopSynth() { clearInterval(musicTimer); musicTimer = null; }

  const api = {
    init,
    get musicOn() { return musicOn; },
    get sfxOn() { return sfxOn; },
    setTempo(bpm) { tempo = bpm; },
    music(on) {
      musicOn = on; prefs.music = on; save();
      if (!ctx) return;
      if (on) { if (fileMusic) fileMusic.play().catch(() => {}); else startSynth(); }
      else { stopSynth(); if (fileMusic) fileMusic.pause(); }
    },
    sfx(on) { sfxOn = on; prefs.sfx = on; save(); },
    duck(on) { if (musicGain) musicGain.gain.setTargetAtTime(on ? 0.12 : 0.32, ctx.currentTime, 0.2); if (fileMusic) fileMusic.volume = on ? 0.15 : 0.45; },
    play(name) {
      if (!ctx || !sfxOn) return;
      const t = ctx.currentTime + 0.01;
      switch (name) {
        case 'buzzer':
          if (fileBuzzer) { const a = new Audio(fileBuzzer); a.volume = 0.9; a.play().catch(() => {}); break; }
          [0, 0.004].forEach((dt, i) => { const o = tone(i ? 151 : 146, t + dt, 0.9, 'sawtooth', 0.32, sfxGain, 0.01); o.frequency.linearRampToValueAtTime(i ? 139 : 134, t + 0.9); });
          tone(73, t, 0.9, 'square', 0.18, sfxGain, 0.01);
          break;
        case 'lock': tone(660, t, 0.08, 'square', 0.12); tone(990, t + 0.06, 0.12, 'sine', 0.2); break;
        case 'tick': tone(1400, t, 0.05, 'square', 0.08); break;
        case 'correct': [72, 76, 79, 84].forEach((m, i) => tone(N(m), t + i * 0.08, 0.35, 'triangle', 0.25)); break;
        case 'wrong': tone(N(52), t, 0.25, 'sawtooth', 0.12); tone(N(47), t + 0.2, 0.4, 'sawtooth', 0.12); break;
        case 'join': tone(N(79), t, 0.12, 'sine', 0.2); tone(N(84), t + 0.08, 0.18, 'sine', 0.2); break;
        case 'whoosh': noise(t, 0.35, 0.25, sfxGain, 900); break;
        case 'go': [60, 64, 67].forEach((m) => tone(N(m + 12), t, 0.5, 'sawtooth', 0.06)); tone(N(84), t, 0.5, 'triangle', 0.25); break;
        case 'count': tone(N(72), t, 0.18, 'triangle', 0.25); break;
        case 'fanfare':
          [[67, 0], [67, 0.12], [67, 0.24], [72, 0.4], [76, 0.7], [79, 0.95]].forEach(([m, dt]) => {
            tone(N(m), t + dt, 0.5, 'sawtooth', 0.07); tone(N(m), t + dt, 0.5, 'triangle', 0.22);
          });
          [60, 64, 67, 72].forEach((m) => tone(N(m), t + 0.95, 1.4, 'sawtooth', 0.05));
          break;
      }
    },
  };
  function save() { try { localStorage.setItem('qb-audio', JSON.stringify(prefs)); } catch {} }
  api.prefs = prefs;
  if (prefs.sfx === false) sfxOn = false;
  window.Sound = api;
})();
