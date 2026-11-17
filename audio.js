/* ===================== STRIKE ZONE - audio.js (v7) =====================
   v7: gunshots are now PRE-RENDERED studio-style samples (stereo, 3 variants per gun, compressed + normalised) built
       at start-up with an OfflineAudioContext, then played with random pitch, distance muffling and map reverb.
       Headshots got a horror upgrade: ear-ring muffle, screeching strings, demon voice, gore squelch.
   v6: much heavier layered gunshots (distortion, sub boom, echo slaps, brass ping) and a horror headshot sound.
   Everything is generated live with the Web Audio API (no sound files).
   New in v5:
     - room reverb that changes per map
     - 3D-ish positional sound (left/right pan, distance muffling, speed-of-sound delay)
     - layered gunshots, bullet whizz, ricochets, shell casings
     - different footsteps for sand / leaves / metal / snow
     - generative background music that gets more intense in a fight
     - separate Master / Sound-effects / Music volumes, UI sounds, stingers, heartbeat
*/
const Sound = (function () {
  let ctx = null, master = null, sfxBus = null, musicBus = null, reverbIn = null, reverbOut = null, convolver = null;
  let noiseBuf = null, sfxLP = null, stingBus = null, curBus = null;
  const shotBufs = {};
  let ambientSrc = null, ambientGain = null, ambientNodes = [], birdTimer = null, creakTimer = null;
  let vol = 0.7, sfxVol = 1, musicVol = 0.4;
  let enabled = true, ambientOn = true, voiceOn = true, musicOn = true;
  let ambientKind = null, env = 'dust', surface = 'sand', lastVoice = 0;
  const lastPlay = {};          // per-sound throttles

  const ENVS = {
    dust:   { decay: 1.3, damp: 0.55, wet: 0.22 },
    jungle: { decay: 1.8, damp: 0.75, wet: 0.28 },
    yard:   { decay: 2.6, damp: 0.35, wet: 0.42 },
    snow:   { decay: 2.1, damp: 0.6,  wet: 0.34 }
  };
  const PROFILES = {
    rifle:   { crack: 1800, body: 1400, dur: 0.18, thump: 120, vol: 0.95, tail: 0.55, click: 2400, bark: 210, echo: 1.0 },
    smg:     { crack: 2600, body: 1900, dur: 0.11, thump: 150, vol: 0.75, tail: 0.30, click: 3000, bark: 300, echo: 0.7 },
    shotgun: { crack: 1300, body: 700,  dur: 0.32, thump: 70,  vol: 1.2,  tail: 0.75, click: 1500, bark: 120, echo: 1.2 },
    sniper:  { crack: 1500, body: 550,  dur: 0.42, thump: 55,  vol: 1.3,  tail: 1.3,  click: 1200, bark: 95,  echo: 1.8 },
    lmg:     { crack: 1700, body: 1100, dur: 0.15, thump: 95,  vol: 1.0,  tail: 0.5,  click: 2000, bark: 170, echo: 1.0 },
    pistol:  { crack: 2800, body: 2100, dur: 0.11, thump: 180, vol: 0.7,  tail: 0.30, click: 3200, bark: 380, echo: 0.7 },
    deagle:  { crack: 1700, body: 900,  dur: 0.24, thump: 90,  vol: 1.1,  tail: 0.7,  click: 1800, bark: 150, echo: 1.2 }
  };

  /* ---------------------------------------------------------------
     setup
  --------------------------------------------------------------- */
  function applyGain() {
    if (!master) return;
    master.gain.value = enabled ? vol : 0;
    sfxBus.gain.value = sfxVol;
    musicBus.gain.value = musicOn && enabled ? musicVol : 0;
  }

  function buildImpulse(e) {
    if (!ctx) return;
    const len = Math.floor(ctx.sampleRate * Math.min(3.2, e.decay + 0.8));
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        const t = i / len;
        const n = Math.random() * 2 - 1;
        lp += (n - lp) * (0.08 + e.damp * 0.5 * (1 - t));      // gets darker as it decays
        d[i] = lp * Math.pow(1 - t, 2.2 + 1.4 / e.decay) * (i < 400 ? i / 400 : 1);
      }
    }
    convolver.buffer = buf;
    reverbOut.gain.value = e.wet;
  }

  function init() {
    try {
      if (!ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        ctx = new AC();
        master = ctx.createGain();
        const comp = ctx.createDynamicsCompressor();
        comp.threshold.value = -16; comp.knee.value = 18; comp.ratio.value = 5; comp.attack.value = 0.003; comp.release.value = 0.2;
        sfxBus = ctx.createGain();
        musicBus = ctx.createGain();
        reverbIn = ctx.createGain();
        reverbOut = ctx.createGain();
        convolver = ctx.createConvolver();
        sfxLP = ctx.createBiquadFilter(); sfxLP.type = 'lowpass'; sfxLP.frequency.value = 20000; sfxLP.Q.value = 0.5;
        stingBus = ctx.createGain();
        sfxBus.connect(sfxLP); sfxLP.connect(master); stingBus.connect(master);
        musicBus.connect(master);
        reverbIn.connect(convolver);
        convolver.connect(reverbOut);
        reverbOut.connect(sfxBus);
        master.connect(comp);
        comp.connect(ctx.destination);
        const len = Math.floor(ctx.sampleRate * 2);
        noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
        const d = noiseBuf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
        buildImpulse(ENVS[env]);
        applyGain();
        setTimeout(buildShots, 80);
      }
      if (ctx.state === 'suspended') ctx.resume();
    } catch (e) {
      ctx = null;
    }
  }

  function setEnv(kind) {
    env = ENVS[kind] ? kind : 'dust';
    surface = { dust: 'sand', jungle: 'leaf', yard: 'metal', snow: 'snow' }[env];
    if (ctx) buildImpulse(ENVS[env]);
  }

  /* ---------------------------------------------------------------
     low-level building blocks
     o: t (delay s), dur, vol, pan (-1..1), wet (0..1 reverb send), type, f0, f1, q, attack
  --------------------------------------------------------------- */
  const curves = {};
  function driveCurve(k) {
    const key = Math.round(k * 10);
    if (curves[key]) return curves[key];
    const n = 1024, c = new Float32Array(n);
    for (let i = 0; i < n; i++) { const x = i * 2 / n - 1; c[i] = Math.tanh(x * (1 + k * 6)) / Math.tanh(1 + k * 6); }
    return (curves[key] = c);
  }
  function route(g, o) {
    let node = g;
    if (o.drive && ctx.createWaveShaper) {            // saturation = punch / grit
      const ws = ctx.createWaveShaper();
      ws.curve = driveCurve(o.drive); ws.oversample = '2x';
      node.connect(ws); node = ws;
    }
    if (o.pan && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, o.pan));
      node.connect(p); node = p;
    }
    node.connect(o.bus || curBus || sfxBus);
    if (o.wet) {
      const s = ctx.createGain();
      s.gain.value = o.wet;
      node.connect(s); s.connect(reverbIn);
    }
  }

  function noise(o) {
    if (!ctx) return;
    const t0 = ctx.currentTime + (o.t || 0);
    const dur = o.dur || 0.1;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = o.type || 'lowpass';
    f.frequency.setValueAtTime(Math.max(20, o.f0 || 1000), t0);
    if (o.f1) f.frequency.exponentialRampToValueAtTime(Math.max(20, o.f1), t0 + dur);
    f.Q.value = o.q || 0.7;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(Math.max(0.0002, o.vol || 0.5), t0 + (o.attack || 0.002));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f); f.connect(g);
    route(g, o);
    src.start(t0, Math.random() * 1.2, dur + 0.05);
    src.stop(t0 + dur + 0.06);
  }

  function tone(o) {
    if (!ctx) return;
    const t0 = ctx.currentTime + (o.t || 0);
    const dur = o.dur || 0.1;
    const osc = ctx.createOscillator();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(Math.max(10, o.f0 || 440), t0);
    if (o.f1) osc.frequency.exponentialRampToValueAtTime(Math.max(10, o.f1), t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(Math.max(0.0002, o.vol || 0.3), t0 + (o.attack || 0.004));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    route(g, o);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  function throttle(key, ms) {
    const n = performance.now();
    if (lastPlay[key] && n - lastPlay[key] < ms) return false;
    lastPlay[key] = n;
    return true;
  }

  function click(t, f, v, pan) {
    noise({ t: t, dur: 0.035, type: 'bandpass', f0: f, q: 4, vol: v, pan: pan });
    tone({ t: t, dur: 0.04, type: 'square', f0: f * 0.6, f1: f * 0.3, vol: v * 0.25, pan: pan });
  }

  /* ---------------------------------------------------------------
     gunfire. dist (metres) muffles + delays; pan is -1 (left) .. 1 (right)
  --------------------------------------------------------------- */
  function shotLive(kind, vol_, muffle, pan, dist) {
    if (!ctx) return;
    const p = PROFILES[kind] || PROFILES.rifle;
    const V = (vol_ == null ? 1 : vol_);
    const v = V * p.vol;
    const m = muffle || 1;
    dist = dist || 0;
    const near = 1 - Math.min(1, dist / 60);                 // 1 = right next to you
    const delay = Math.min(0.45, dist / 340);
    const wet = ENVS[env].wet * (0.7 + Math.min(1, dist / 80) * 1.2);
    const r = 0.93 + Math.random() * 0.14;                    // every shot is a little different
    const base = { t: delay, pan: pan || 0, wet: wet };
    const B = function (x) { return Object.assign({}, base, x); };
    // 1) ultra-short transient: the "snap" that makes a shot feel punchy
    noise(B({ type: 'highpass', f0: 5000 * m, dur: 0.012, vol: v * 0.9 * (0.4 + 0.6 * near), q: 0.4, attack: 0.0005, drive: 0.6 }));
    // 2) supersonic crack
    noise(B({ type: 'bandpass', f0: p.crack * 2.2 * m * r, f1: p.crack * 0.8 * m, q: 0.9, dur: 0.05, vol: v * 0.75, drive: 0.5 }));
    // 3) the muzzle blast: saturated, filtered noise that falls in pitch
    noise(B({ type: 'lowpass', f0: p.body * 3.4 * m * r, f1: p.body * 0.35 * m, dur: p.dur, vol: v * 1.0, drive: 0.7 }));
    noise(B({ type: 'bandpass', f0: p.body * 1.1 * m, f1: p.body * 0.45, q: 1.3, dur: p.dur * 1.5, vol: v * 0.4 }));
    // 4) "bark": the mid-range growl of the gun, distorted
    tone(B({ type: 'sawtooth', f0: p.bark * 1.8 * r, f1: p.bark * 0.5, dur: p.dur * 1.2, vol: v * 0.32 * m, drive: 0.9 }));
    // 5) low-end punch / sub boom (felt more than heard)
    tone(B({ type: 'sine', f0: p.thump * 1.8 * r, f1: p.thump * 0.35, dur: 0.18, vol: 0.9 * v }));
    tone(B({ type: 'sine', f0: p.thump * 0.75, f1: 26, dur: 0.38, vol: 0.55 * v * m }));
    // 6) echoes slapping back off the map (two reflections, darker each time)
    const ec = p.echo * (0.5 + 0.5 * wet / 0.3);
    noise({ t: delay + 0.07, dur: p.tail * 0.7, type: 'lowpass', f0: 1500 * m, f1: 260, vol: 0.2 * V * ec, pan: -(pan || 0) * 0.5, wet: wet * 1.4 });
    noise({ t: delay + 0.18, dur: p.tail, type: 'lowpass', f0: 800 * m, f1: 150, vol: 0.14 * V * ec, pan: (pan || 0) * 0.5, wet: wet * 1.8 });
    // 7) low rumble that rolls away
    noise(B({ t: delay + 0.02, dur: p.tail * 0.9, type: 'lowpass', f0: 380, f1: 70, vol: 0.28 * v, q: 0.6 }));
    // 8) gun mechanics (only when it is close): bolt / slide clack + brass ping
    if (dist < 14) {
      click(0.012, p.click, 0.14 * v, pan);
      click(0.075, p.click * 0.55, 0.1 * v, pan);
      if (kind === 'sniper' || kind === 'shotgun') { click(0.4, 1300, 0.16, pan); click(0.52, 900, 0.18, pan); }
    }
    // 9) heavy guns: extra shock-wave boom
    if (kind === 'sniper' || kind === 'shotgun' || kind === 'deagle') {
      tone(B({ type: 'sine', f0: 70, f1: 24, dur: 0.6, vol: 0.5 * v * m }));
      noise(B({ type: 'lowpass', f0: 2500 * m, f1: 120, dur: 0.5, vol: 0.35 * v, drive: 0.6 }));
    }
  }

  /* ---------------------------------------------------------------
     v7: pre-rendered gunshot samples
  --------------------------------------------------------------- */
  const SHOT_VARIANTS = 3;
  function renderShot(kind, variant) {
    const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!OAC || !ctx) return Promise.resolve(null);
    const p = PROFILES[kind];
    const sr = ctx.sampleRate;
    const secs = Math.min(3.0, p.tail + 0.8 + p.dur);
    let off;
    try { off = new OAC(2, Math.ceil(sr * secs), sr); } catch (e) { return Promise.resolve(null); }
    const nb = off.createBuffer(2, sr * 2, sr);
    for (let c = 0; c < 2; c++) { const d = nb.getChannelData(c); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
    const comp = off.createDynamicsCompressor();
    comp.threshold.value = -12; comp.knee.value = 6; comp.ratio.value = 9; comp.attack.value = 0.001; comp.release.value = 0.12;
    const bus = off.createGain();
    bus.connect(comp); comp.connect(off.destination);
    const rj = [0.93, 0.985, 1.04][variant % 3];
    const jit = function () { return 0.92 + Math.random() * 0.16; };
    function out(g, o) {
      let node = g;
      if (o.drive) { const ws = off.createWaveShaper(); ws.curve = driveCurve(o.drive); node.connect(ws); node = ws; }
      if (o.pan && off.createStereoPanner) { const sp = off.createStereoPanner(); sp.pan.value = o.pan; node.connect(sp); node = sp; }
      node.connect(bus);
    }
    function N(o) {
      const t0 = o.t || 0, dur = o.dur;
      const src = off.createBufferSource(); src.buffer = nb; src.loop = true;
      const f = off.createBiquadFilter(); f.type = o.type || 'lowpass';
      f.frequency.setValueAtTime(Math.max(20, o.f0), t0);
      if (o.f1) f.frequency.exponentialRampToValueAtTime(Math.max(20, o.f1), t0 + dur);
      f.Q.value = o.q || 0.7;
      const g = off.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.linearRampToValueAtTime(Math.max(0.0002, o.vol), t0 + (o.attack || 0.0015));
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      src.connect(f); f.connect(g); out(g, o);
      src.start(t0, Math.random() * 1.5, dur + 0.05);
    }
    function T(o) {
      const t0 = o.t || 0, dur = o.dur;
      const osc = off.createOscillator(); osc.type = o.type || 'sine';
      osc.frequency.setValueAtTime(Math.max(10, o.f0), t0);
      if (o.f1) osc.frequency.exponentialRampToValueAtTime(Math.max(10, o.f1), t0 + dur);
      const g = off.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.linearRampToValueAtTime(Math.max(0.0002, o.vol), t0 + (o.attack || 0.002));
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(g); out(g, o);
      osc.start(t0); osc.stop(t0 + dur + 0.05);
    }
    const heavy = (kind === 'sniper' || kind === 'shotgun' || kind === 'deagle');
    // --- the strike: snap + supersonic crack + blast (this is the "bang")
    N({ type: 'highpass', f0: 6500, dur: 0.010, vol: 0.9 * jit(), q: 0.4, attack: 0.0004, drive: 0.7 });
    N({ type: 'bandpass', f0: p.crack * 2.4 * rj, f1: p.crack * 0.7, q: 0.8, dur: 0.06, vol: 0.9 * jit(), drive: 0.7 });
    N({ type: 'lowpass', f0: p.body * 4 * rj, f1: p.body * 0.3, dur: p.dur * 1.1, vol: 1.0, drive: 0.85 });
    N({ type: 'bandpass', f0: p.body * 1.2 * rj, f1: p.body * 0.4, q: 1.2, dur: p.dur * 1.7, vol: 0.5, drive: 0.4 });
    N({ type: 'bandpass', f0: p.body * 2.6, f1: p.body * 0.9, q: 2.2, dur: p.dur * 0.7, vol: 0.28, t: 0.003, drive: 0.5, pan: variant === 1 ? 0.25 : -0.25 });
    // --- body: bark + chest punch + sub
    T({ type: 'sawtooth', f0: p.bark * 2 * rj, f1: p.bark * 0.45, dur: p.dur * 1.4, vol: 0.34, drive: 0.95 });
    T({ type: 'square', f0: p.bark * 1.2 * rj, f1: p.bark * 0.5, dur: p.dur * 0.9, vol: 0.12, drive: 0.8 });
    T({ type: 'sine', f0: p.thump * 2 * rj, f1: p.thump * 0.4, dur: 0.17, vol: 1.0 });
    T({ type: 'sine', f0: p.thump * 0.7, f1: 24, dur: 0.46, vol: 0.7 });
    if (heavy) {
      T({ type: 'sine', f0: 64 * rj, f1: 22, dur: 0.75, vol: 0.65 });
      N({ type: 'lowpass', f0: 3200, f1: 110, dur: 0.6, vol: 0.4, drive: 0.7 });
    }
    // --- stereo tail: two decorrelated noise clouds + rumble + three slapback echoes off the scenery
    N({ type: 'lowpass', f0: 2600, f1: 160, dur: p.tail, vol: 0.34, t: 0.012, pan: -0.75 });
    N({ type: 'lowpass', f0: 2600, f1: 160, dur: p.tail, vol: 0.34, t: 0.012, pan: 0.75 });
    N({ type: 'lowpass', f0: 420, f1: 55, dur: p.tail * 1.15, vol: 0.4, t: 0.02, q: 0.6 });
    const ec = 0.22 * p.echo;
    N({ type: 'lowpass', f0: 1700, f1: 260, dur: p.tail * 0.7, vol: ec, t: 0.085, pan: -0.55 });
    N({ type: 'lowpass', f0: 1100, f1: 200, dur: p.tail * 0.8, vol: ec * 0.75, t: 0.19, pan: 0.6 });
    N({ type: 'lowpass', f0: 700, f1: 140, dur: p.tail * 0.9, vol: ec * 0.5, t: 0.34, pan: -0.35 });
    // --- tiny metallic ring of the barrel
    T({ type: 'sine', f0: p.crack * 2.6 * rj, f1: p.crack * 2.5 * rj, dur: 0.3, vol: 0.03, t: 0.004 });

    return new Promise(function (resolve) {
      let done = false;
      const fin = function (buf) {
        if (done) return; done = true;
        try {
          let pk = 0;
          for (let c = 0; c < buf.numberOfChannels; c++) { const d = buf.getChannelData(c); for (let i = 0; i < d.length; i++) { const a = Math.abs(d[i]); if (a > pk) pk = a; } }
          if (pk > 0.0001) { const k = 0.95 / pk; for (let c = 0; c < buf.numberOfChannels; c++) { const d = buf.getChannelData(c); for (let i = 0; i < d.length; i++) d[i] *= k; } }
        } catch (e) { /* ignore */ }
        resolve(buf);
      };
      try {
        const r = off.startRendering();
        if (r && r.then) r.then(fin, function () { resolve(null); });
        else off.oncomplete = function (ev) { fin(ev.renderedBuffer); };
      } catch (e) { resolve(null); }
    });
  }
  let shotsBuilding = false;
  function buildShots() {
    if (shotsBuilding || !ctx) return;
    shotsBuilding = true;
    const jobs = [];
    Object.keys(PROFILES).forEach(function (k) { for (let v = 0; v < SHOT_VARIANTS; v++) jobs.push([k, v]); });
    const next = function () {
      const j = jobs.shift();
      if (!j) return;
      renderShot(j[0], j[1]).then(function (b) {
        if (b) (shotBufs[j[0]] = shotBufs[j[0]] || []).push(b);
        setTimeout(next, 25);
      }, function () { setTimeout(next, 25); });
    };
    next();
  }
  function shotsReady() { return Object.keys(PROFILES).every(function (k) { return shotBufs[k] && shotBufs[k].length >= SHOT_VARIANTS; }); }

  function shot(kind, vol_, muffle, pan, dist) {
    if (!ctx) return;
    const arr = shotBufs[kind] || (PROFILES[kind] ? null : shotBufs.rifle);
    if (!arr || !arr.length) return shotLive(kind, vol_, muffle, pan, dist);
    const p = PROFILES[kind] || PROFILES.rifle;
    const V = (vol_ == null ? 1 : vol_);
    const m = muffle || 1;
    dist = dist || 0;
    const near = 1 - Math.min(1, dist / 60);
    const delay = Math.min(0.45, dist / 340);
    const wet = ENVS[env].wet * (0.7 + Math.min(1, dist / 80) * 1.2);
    const src = ctx.createBufferSource();
    src.buffer = arr[(Math.random() * arr.length) | 0];
    src.playbackRate.value = 0.96 + Math.random() * 0.08;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass';
    lp.frequency.value = 600 + 19400 * m * m * (0.3 + 0.7 * near);
    const g = ctx.createGain();
    g.gain.value = 0.62 * V * p.vol * (0.5 + 0.5 * near);
    src.connect(lp); lp.connect(g);
    route(g, { pan: pan || 0, wet: wet });
    src.start(ctx.currentTime + delay);
    const v = V * p.vol;
    // mechanical clicks only when the gun is close
    if (dist < 14) {
      click(0.014, p.click, 0.14 * v, pan);
      click(0.08, p.click * 0.55, 0.1 * v, pan);
      if (kind === 'sniper' || kind === 'shotgun') { click(0.4, 1300, 0.16, pan); click(0.52, 900, 0.18, pan); }
      if (kind === 'sniper' && dist < 3) tone({ t: 0.05, f0: 7200, dur: 0.9, vol: 0.018 });      // ears ringing after a big shot
    }
  }
  function pump() { click(0.32, 1400, 0.3); click(0.46, 900, 0.35); tone({ t: 0.32, f0: 220, f1: 140, dur: 0.1, vol: 0.12, type: 'square' }); }
  function reload(d) {
    click(d * 0.18, 2200, 0.35);                                                      // release
    noise({ t: d * 0.22, dur: 0.12, type: 'lowpass', f0: 900, f1: 250, vol: 0.4 });  // mag slides out
    noise({ t: d * 0.5, dur: 0.1, type: 'lowpass', f0: 700, f1: 200, vol: 0.5 });    // new mag
    click(d * 0.53, 1500, 0.42);
    tone({ t: d * 0.53, f0: 120, f1: 70, dur: 0.1, vol: 0.3 });
    click(d * 0.8, 1800, 0.4);                                                        // charging handle
    noise({ t: d * 0.8, dur: 0.12, type: 'bandpass', f0: 2600, f1: 900, q: 1.4, vol: 0.25 });
    click(d * 0.9, 1100, 0.42);
  }
  function empty() { click(0, 1900, 0.3); tone({ f0: 160, f1: 110, dur: 0.06, vol: 0.1, type: 'square' }); }
  function switchWeapon() { click(0, 1300, 0.2); noise({ dur: 0.1, type: 'lowpass', f0: 600, f1: 250, vol: 0.18 }); }
  function casing(pan) {
    if (!throttle('casing', 60)) return;
    const f = 4200 + Math.random() * 1800;
    tone({ t: 0.32 + Math.random() * 0.12, f0: f, dur: 0.07, vol: 0.05, pan: pan, type: 'triangle' });
    tone({ t: 0.4 + Math.random() * 0.12, f0: f * 0.8, dur: 0.05, vol: 0.03, pan: pan, type: 'triangle' });
  }

  /* bullet passing close to your head */
  function whiz(pan) {
    if (!throttle('whiz', 120)) return;
    noise({ dur: 0.22, type: 'bandpass', f0: 4200, f1: 900, q: 2.2, vol: 0.28, pan: pan, attack: 0.03 });
    tone({ dur: 0.18, f0: 2600, f1: 700, vol: 0.05, pan: pan, type: 'sawtooth', attack: 0.03 });
  }

  /* bullet impacts by surface: metal ping / wood crack / stone chip / dirt / snow */
  function impact(kind, pan, dist) {
    if (!throttle('imp', 35)) return;
    const d = Math.min(1, (dist || 0) / 90), v = 1 - d * 0.75, w = ENVS[env].wet;
    const o = { pan: pan, wet: w * 0.6 };
    if (kind === 'metal') {
      noise(Object.assign({ dur: 0.05, type: 'highpass', f0: 3500, vol: 0.3 * v }, o));
      tone(Object.assign({ dur: 0.35, f0: 1800 + Math.random() * 900, f1: 1500, vol: 0.16 * v, type: 'triangle' }, o));
      tone(Object.assign({ t: 0.01, dur: 0.25, f0: 3300 + Math.random() * 600, vol: 0.08 * v }, o));
    } else if (kind === 'wood') {
      noise(Object.assign({ dur: 0.09, type: 'bandpass', f0: 900, f1: 400, q: 1.5, vol: 0.4 * v }, o));
      tone(Object.assign({ dur: 0.09, f0: 240, f1: 120, vol: 0.2 * v, type: 'square' }, o));
    } else if (kind === 'snow') {
      noise(Object.assign({ dur: 0.1, type: 'lowpass', f0: 600, f1: 200, vol: 0.2 * v }, o));
    } else if (kind === 'dirt') {
      noise(Object.assign({ dur: 0.1, type: 'lowpass', f0: 800, f1: 250, vol: 0.3 * v }, o));
      tone(Object.assign({ dur: 0.08, f0: 120, f1: 60, vol: 0.18 * v }, o));
    } else {
      noise(Object.assign({ dur: 0.07, type: 'highpass', f0: 2200, vol: 0.22 * v }, o));
      noise(Object.assign({ dur: 0.1, type: 'lowpass', f0: 900, f1: 300, vol: 0.28 * v }, o));
      tone(Object.assign({ dur: 0.07, f0: 160, f1: 80, vol: 0.14 * v }, o));
    }
    // sometimes a ricochet whine
    if ((kind === 'metal' || kind === 'stone') && Math.random() < 0.35) {
      tone(Object.assign({ t: 0.03, dur: 0.4, f0: 2400, f1: 700, vol: 0.05 * v, type: 'sawtooth' }, o));
    }
  }

  /* ---------------------------------------------------------------
     hits / melee / player
  --------------------------------------------------------------- */
  function hitMarker() { tone({ f0: 1900, f1: 1500, dur: 0.05, vol: 0.2 }); }
  function flesh() {
    noise({ dur: 0.09, type: 'lowpass', f0: 700, f1: 200, vol: 0.45 });
    tone({ f0: 140, f1: 60, dur: 0.08, vol: 0.3 });
    noise({ t: 0.01, dur: 0.05, type: 'bandpass', f0: 1800, q: 1, vol: 0.12 });
  }
  /* temporarily lower music + ambience so the horror hit is heard clearly */
  function scaryDuck(sec) {
    if (!ctx) return;
    const t = ctx.currentTime;
    try {
      musicBus.gain.cancelScheduledValues(t);
      const base = musicOn && enabled ? musicVol : 0;
      musicBus.gain.setValueAtTime(musicBus.gain.value, t);
      musicBus.gain.linearRampToValueAtTime(base * 0.08, t + 0.05);
      musicBus.gain.linearRampToValueAtTime(base, t + sec);
    } catch (e) { /* ignore */ }
  }
  /* quick dip of the whole sound mix (concussion / ear ringing). depth = Hz it falls to */
  function muffleDip(depth, sec) {
    if (!ctx || !sfxLP) return;
    try {
      const t = ctx.currentTime, f = sfxLP.frequency;
      f.cancelScheduledValues(t);
      f.setValueAtTime(f.value, t);
      f.exponentialRampToValueAtTime(depth, t + 0.03);
      f.setValueAtTime(depth, t + sec * 0.4);
      f.exponentialRampToValueAtTime(20000, t + sec);
    } catch (e) { /* ignore */ }
  }
  /* horror-film string screech: detuned saws that bend downward */
  function screech(t, f0, f1, dur, vol) {
    const k = [1, 1.0595, 1.4983];
    for (let i = 0; i < k.length; i++) {
      tone({ t: t, type: 'sawtooth', f0: f0 * k[i], f1: f1 * k[i], dur: dur, vol: vol / (1 + i * 0.4), drive: 1, wet: 0.55, attack: 0.012 });
    }
    noise({ t: t, dur: dur, type: 'bandpass', f0: f0 * 1.5, f1: f1 * 1.5, q: 6, vol: vol * 0.7, attack: 0.02, wet: 0.5 });
  }
  /* body headshot: bone crack + wet squelch + dark sub boom + screech + ear ring */
  function headshot() {
    curBus = stingBus;
    noise({ dur: 0.03, type: 'highpass', f0: 4000, vol: 0.55, drive: 0.9, attack: 0.0005 });                    // snap
    noise({ t: 0.004, dur: 0.08, type: 'bandpass', f0: 2800, f1: 600, q: 3, vol: 0.6, drive: 0.7 });            // bone crack
    tone({ dur: 0.05, type: 'square', f0: 900, f1: 280, vol: 0.14 });
    noise({ t: 0.03, dur: 0.22, type: 'lowpass', f0: 1200, f1: 140, vol: 0.65, wet: 0.25 });                    // wet splat
    noise({ t: 0.06, dur: 0.16, type: 'bandpass', f0: 380, f1: 900, q: 2, vol: 0.28 });                         // squelch
    tone({ dur: 0.5, f0: 82, f1: 26, vol: 0.85, wet: 0.25 });                                                   // sub boom
    screech(0.02, 1760, 760, 0.45, 0.06);                                                                       // string screech
    noise({ t: 0.05, dur: 0.4, type: 'bandpass', f0: 900, f1: 2600, q: 3, vol: 0.1, attack: 0.18, wet: 0.5 }); // gasp
    tone({ t: 0.04, dur: 0.8, type: 'triangle', f0: 98, vol: 0.1, wet: 0.5 });
    tone({ t: 0.04, dur: 0.8, type: 'triangle', f0: 139, vol: 0.08, wet: 0.5 });                                // tritone
    tone({ t: 0.03, dur: 1.0, f0: 6200, vol: 0.03 });                                                           // ringing
    curBus = null;
    muffleDip(900, 0.9);
    scaryDuck(1.0);
  }
  function kill() { tone({ type: 'triangle', f0: 520, f1: 880, dur: 0.18, vol: 0.22 }); tone({ t: 0.09, type: 'triangle', f0: 880, f1: 1320, dur: 0.2, vol: 0.14 }); }
  /* headshot kill: full horror sting - skull crunch, gore, sub drop, screaming strings, demon voice, ear ring, heartbeat */
  function headshotKill() {
    curBus = stingBus;
    noise({ dur: 0.03, type: 'highpass', f0: 4200, vol: 0.65, drive: 0.95, attack: 0.0005 });
    noise({ t: 0.004, dur: 0.12, type: 'bandpass', f0: 2300, f1: 450, q: 3, vol: 0.7, drive: 0.8 });            // skull crunch
    noise({ t: 0.03, dur: 0.4, type: 'lowpass', f0: 1400, f1: 110, vol: 0.8, wet: 0.35, drive: 0.5 });          // gore splat
    noise({ t: 0.08, dur: 0.35, type: 'bandpass', f0: 420, f1: 1100, q: 2.5, vol: 0.35, wet: 0.2 });            // wet squelch
    for (let i = 0; i < 5; i++) noise({ t: 0.12 + i * 0.07 + Math.random() * 0.04, dur: 0.05, type: 'bandpass', f0: 700 + Math.random() * 1400, q: 3, vol: 0.14, wet: 0.2 }); // droplets
    tone({ dur: 1.0, f0: 92, f1: 20, vol: 1.0, wet: 0.3 });                                                     // huge sub drop
    tone({ t: 0.02, dur: 1.8, type: 'sawtooth', f0: 52, f1: 28, vol: 0.24, wet: 0.5, drive: 0.95 });            // monster growl
    screech(0.03, 2093, 520, 1.3, 0.085);                                                                       // screaming strings
    screech(0.35, 1568, 392, 1.2, 0.05);
    tone({ t: 0.05, dur: 1.6, type: 'triangle', f0: 146.8, f1: 140, vol: 0.13, wet: 0.7 });                     // minor-second cluster
    tone({ t: 0.05, dur: 1.6, type: 'triangle', f0: 155.6, f1: 150, vol: 0.13, wet: 0.7 });
    tone({ t: 0.05, dur: 1.6, type: 'sine', f0: 207.7, vol: 0.07, wet: 0.7 });                                  // tritone
    noise({ t: 0.12, dur: 1.1, type: 'bandpass', f0: 3200, f1: 1300, q: 7, vol: 0.1, attack: 0.4, wet: 0.5 });  // breathy whisper
    noise({ t: 0.0, dur: 0.8, type: 'bandpass', f0: 400, f1: 7000, q: 1.2, vol: 0.17, attack: 0.6, wet: 0.7 }); // swell
    tone({ t: 0.05, dur: 2.0, f0: 6400, vol: 0.04 });                                                           // tinnitus
    tone({ t: 0.55, dur: 0.14, f0: 60, f1: 38, vol: 0.6 });                                                     // heartbeat x4, slowing
    tone({ t: 0.76, dur: 0.16, f0: 54, f1: 34, vol: 0.5 });
    tone({ t: 1.12, dur: 0.14, f0: 58, f1: 36, vol: 0.42 });
    tone({ t: 1.34, dur: 0.16, f0: 52, f1: 32, vol: 0.34 });
    tone({ t: 1.75, dur: 0.14, f0: 56, f1: 34, vol: 0.28 });
    tone({ t: 1.98, dur: 0.16, f0: 50, f1: 30, vol: 0.22 });
    curBus = null;
    muffleDip(500, 1.8);
    scaryDuck(2.2);
    setTimeout(function () { voice('Head shot', true, 0, 0.42); }, 140);                                        // demon-deep voice
  }
  function knife() { noise({ dur: 0.18, type: 'bandpass', f0: 1800, f1: 5000, q: 1.2, vol: 0.28, attack: 0.04 }); }
  function meleeHit() { noise({ dur: 0.1, type: 'lowpass', f0: 1000, f1: 200, vol: 0.55 }); tone({ f0: 100, f1: 50, dur: 0.12, vol: 0.45 }); }
  function hurt(pan) {
    noise({ dur: 0.2, type: 'lowpass', f0: 500, f1: 120, vol: 0.6, pan: pan });
    tone({ f0: 90, f1: 45, dur: 0.2, vol: 0.5, pan: pan });
    noise({ t: 0.02, dur: 0.08, type: 'highpass', f0: 2600, vol: 0.12, pan: pan });
  }
  function heal() { tone({ f0: 660, dur: 0.35, vol: 0.1 }); tone({ t: 0.08, f0: 990, dur: 0.35, vol: 0.08 }); tone({ t: 0.16, f0: 1320, dur: 0.35, vol: 0.06 }); }
  function buy() { tone({ type: 'square', f0: 1500, dur: 0.05, vol: 0.12 }); tone({ t: 0.06, type: 'square', f0: 2250, dur: 0.12, vol: 0.12 }); }
  function deny() { tone({ type: 'sawtooth', f0: 180, f1: 120, dur: 0.18, vol: 0.18 }); }
  function death() {
    tone({ f0: 200, f1: 40, dur: 1.1, vol: 0.4, type: 'sawtooth', wet: 0.4 });
    noise({ dur: 0.8, type: 'lowpass', f0: 800, f1: 80, vol: 0.4, wet: 0.5 });
  }
  function heartbeat() {
    tone({ f0: 62, f1: 40, dur: 0.14, vol: 0.55 });
    tone({ t: 0.2, f0: 56, f1: 36, dur: 0.16, vol: 0.4 });
  }

  /* footsteps depend on the ground: sand / leaf / metal / snow. vol & pan for enemy steps */
  function step(vol_, pan, kind) {
    const k = kind || surface, v = vol_ == null ? 1 : vol_, o = { pan: pan };
    if (v < 0.03) return;
    if (k === 'snow') {
      noise(Object.assign({ dur: 0.14, type: 'bandpass', f0: 1800, f1: 900, q: 0.9, vol: 0.2 * v }, o));
      noise(Object.assign({ t: 0.05, dur: 0.1, type: 'bandpass', f0: 2400, f1: 1200, q: 0.9, vol: 0.12 * v }, o));
    } else if (k === 'metal') {
      noise(Object.assign({ dur: 0.07, type: 'bandpass', f0: 1400, q: 2.5, vol: 0.2 * v }, o));
      tone(Object.assign({ dur: 0.18, f0: 210 + Math.random() * 40, f1: 190, vol: 0.12 * v, type: 'triangle' }, o));
    } else if (k === 'leaf') {
      noise(Object.assign({ dur: 0.12, type: 'highpass', f0: 1500, vol: 0.12 * v }, o));
      noise(Object.assign({ dur: 0.09, type: 'lowpass', f0: 400, f1: 180, vol: 0.14 * v }, o));
    } else {
      noise(Object.assign({ dur: 0.08, type: 'lowpass', f0: 320 + Math.random() * 150, vol: 0.14 * v }, o));
      noise(Object.assign({ t: 0.01, dur: 0.06, type: 'highpass', f0: 2500, vol: 0.05 * v }, o));
    }
  }
  /* v9 extras */
  function dodgeReady() { tone({ f0: 1400, f1: 1900, dur: 0.07, vol: 0.05, type: 'triangle' }); }
  function pin() { click(0, 2600, 0.3); click(0.05, 1800, 0.2); noise({ t: 0.04, dur: 0.12, type: 'bandpass', f0: 1800, f1: 900, q: 2, vol: 0.12 }); }
  function grenadeBounce(pan, dist) { const v = Math.max(0.05, 0.4 - (dist || 0) / 80); click(0, 3200, v, pan); tone({ f0: 1900, f1: 1200, dur: 0.05, vol: 0.08 * v * 2, type: 'triangle', pan: pan }); }
  /* v9: movement + grenade sounds */
  /* v11: timer + kill + breathing sounds */
  function tick(sec) {                    // countdown beep, higher for the last 3 seconds
    const hi = sec <= 3;
    tone({ f0: hi ? 1320 : 880, dur: 0.09, vol: 0.22, type: 'square' });
    if (hi) tone({ t: 0.0, f0: 660, dur: 0.12, vol: 0.12, type: 'triangle' });
    noise({ dur: 0.04, type: 'highpass', f0: 3000, vol: 0.08 });
  }
  function timeUp() {                      // end-of-round horn + boom
    tone({ f0: 196, f1: 190, dur: 1.5, vol: 0.32, type: 'sawtooth', attack: 0.03, wet: 0.5 });
    tone({ f0: 294, f1: 284, dur: 1.5, vol: 0.22, type: 'sawtooth', attack: 0.03, wet: 0.5 });
    tone({ f0: 392, f1: 380, dur: 1.4, vol: 0.14, type: 'square', attack: 0.04, wet: 0.5 });
    tone({ f0: 70, f1: 28, dur: 1.2, vol: 0.9 });
    noise({ type: 'lowpass', f0: 3000, f1: 120, dur: 0.9, vol: 0.5, wet: 0.7 });
  }
  function killConfirm(head, mult) {       // satisfying layered "ding + thump"
    const m = Math.min(3, mult || 1);
    tone({ f0: head ? 1560 : 1180, f1: head ? 2300 : 1500, dur: 0.18, vol: 0.2, type: 'sine', wet: 0.3 });
    tone({ t: 0.06, f0: (head ? 1560 : 1180) * 1.5, dur: 0.22, vol: 0.12 * m / 2 + 0.05, type: 'sine', wet: 0.4 });
    tone({ f0: 90, f1: 38, dur: 0.22, vol: head ? 0.7 : 0.45 });
    noise({ type: 'lowpass', f0: 1800, f1: 200, dur: 0.18, vol: 0.2 });
  }
  function breath() {                      // tired breathing after a long sprint
    for (let i = 0; i < 2; i++) {
      noise({ t: i * 0.55, dur: 0.45, type: 'bandpass', f0: 500, f1: 900, q: 0.9, vol: 0.2, attack: 0.15 });
      noise({ t: i * 0.55 + 0.3, dur: 0.3, type: 'bandpass', f0: 800, f1: 450, q: 0.9, vol: 0.12, attack: 0.1 });
    }
  }

  function jump() { noise({ dur: 0.09, type: 'lowpass', f0: 900, f1: 300, vol: 0.18 }); tone({ f0: 180, f1: 260, dur: 0.07, vol: 0.06, type: 'triangle' }); }
  function dodge() {                    // cloth whoosh + a scuff on the ground
    noise({ dur: 0.38, type: 'bandpass', f0: 500, f1: 2600, q: 0.8, vol: 0.34, attack: 0.04 });
    noise({ t: 0.03, dur: 0.3, type: 'lowpass', f0: 1800, f1: 300, vol: 0.2, attack: 0.02 });
    tone({ f0: 110, f1: 55, dur: 0.22, vol: 0.2 });
  }
  function slide() { noise({ dur: 0.7, type: 'bandpass', f0: 700, f1: 380, q: 0.7, vol: 0.3, attack: 0.05 }); noise({ dur: 0.6, type: 'lowpass', f0: 600, f1: 160, vol: 0.2 }); }
  function mantle() { noise({ dur: 0.12, type: 'lowpass', f0: 700, f1: 200, vol: 0.3 }); click(0.1, 900, 0.18); noise({ t: 0.32, dur: 0.14, type: 'lowpass', f0: 500, f1: 160, vol: 0.3 }); }
  function grenadeThrow() { click(0, 2600, 0.3); click(0.05, 1500, 0.22); noise({ t: 0.08, dur: 0.25, type: 'bandpass', f0: 400, f1: 1600, q: 0.8, vol: 0.2, attack: 0.03 }); }
  function bounce(vol_, pan) { if (!throttle('nbounce', 60)) return; click(0, 1700, 0.18 * (vol_ == null ? 1 : vol_), pan); tone({ f0: 320, f1: 140, dur: 0.06, vol: 0.08 * (vol_ == null ? 1 : vol_), pan: pan, type: 'triangle' }); }
  function beep(pan) { tone({ f0: 2300, dur: 0.05, vol: 0.05, pan: pan, type: 'square' }); }
  function explosion(dist, pan) {
    dist = dist || 0;
    const near = 1 - Math.min(1, dist / 70), delay = Math.min(0.5, dist / 340);
    const B = function (x) { return Object.assign({ t: delay, pan: pan || 0, wet: 0.5 + 0.5 * (1 - near) }, x); };
    noise(B({ type: 'highpass', f0: 3000, dur: 0.02, vol: 0.8 * (0.3 + 0.7 * near), drive: 0.6 }));
    noise(B({ type: 'lowpass', f0: 5000 * (0.3 + 0.7 * near), f1: 90, dur: 1.1, vol: 1.0 * (0.4 + 0.6 * near), drive: 0.8 }));
    tone(B({ type: 'sine', f0: 95, f1: 24, dur: 1.0, vol: 1.0 * (0.3 + 0.7 * near) }));
    tone(B({ type: 'sine', f0: 52, f1: 18, dur: 1.6, vol: 0.7 * near }));
    noise(B({ t: delay + 0.12, type: 'lowpass', f0: 900, f1: 120, dur: 1.8, vol: 0.4, wet: 0.9 }));
    for (let i = 0; i < 6; i++) tone(B({ t: delay + 0.2 + Math.random() * 0.8, type: 'triangle', f0: 1800 + Math.random() * 2500, f1: 600, dur: 0.05, vol: 0.05 * near }));   // debris tinkle
    if (dist < 12) tone({ t: 0.05, f0: 6800, dur: 1.6, vol: 0.02 });       // ears ringing
  }
  function land() { noise({ dur: 0.12, type: 'lowpass', f0: 400, f1: 120, vol: 0.4 }); tone({ f0: 80, f1: 40, dur: 0.14, vol: 0.35 }); }

  /* ---------------------------------------------------------------
     UI sounds + stingers
  --------------------------------------------------------------- */
  function uiClick() { if (!throttle('uic', 30)) return; init(); tone({ type: 'square', f0: 900, f1: 1300, dur: 0.045, vol: 0.06 }); }
  function uiHover() { if (!throttle('uih', 60)) return; init(); tone({ f0: 1500, dur: 0.03, vol: 0.025, type: 'triangle' }); }
  function uiTab() { init(); tone({ type: 'triangle', f0: 600, f1: 900, dur: 0.06, vol: 0.07 }); }
  function uiOpen() { init(); noise({ dur: 0.2, type: 'bandpass', f0: 500, f1: 2500, q: 0.8, vol: 0.12 }); tone({ f0: 400, f1: 800, dur: 0.15, vol: 0.05, type: 'triangle' }); }
  function uiClose() { init(); noise({ dur: 0.18, type: 'bandpass', f0: 2500, f1: 500, q: 0.8, vol: 0.1 }); }
  function stinger(level) {
    // level 1..5: bigger = more notes + bass hit
    const notes = [392, 494, 587, 784, 988, 1175];
    const n = Math.min(notes.length, 2 + level);
    for (let i = 0; i < n; i++) tone({ t: i * 0.07, f0: notes[i], dur: 0.35, vol: 0.09, type: 'triangle', wet: 0.4 });
    if (level >= 2) tone({ f0: 98, f1: 49, dur: 0.6, vol: 0.4, wet: 0.4 });
    if (level >= 3) noise({ dur: 0.5, type: 'lowpass', f0: 2000, f1: 200, vol: 0.2, wet: 0.5 });
  }
  function levelUp() {
    [523, 659, 784, 1047, 1319].forEach(function (f, i) { tone({ t: i * 0.09, f0: f, dur: 0.5, vol: 0.1, type: 'triangle', wet: 0.5 }); });
    tone({ t: 0.4, f0: 130, f1: 65, dur: 0.8, vol: 0.3, wet: 0.5 });
  }
  function waveStart() {
    tone({ f0: 110, f1: 82, dur: 0.9, vol: 0.4, type: 'sawtooth', wet: 0.5 });
    noise({ dur: 0.9, type: 'lowpass', f0: 300, f1: 1800, q: 1, vol: 0.18, attack: 0.5, wet: 0.5 });
  }

  /* ---------------------------------------------------------------
     announcer voice (browser text-to-speech)
  --------------------------------------------------------------- */
  function pickVoice() {
    try {
      const vs = window.speechSynthesis.getVoices();
      if (!vs.length) return null;
      const pref = ['Google UK English Male', 'Daniel', 'David', 'Alex', 'Fred', 'Male'];
      for (let i = 0; i < pref.length; i++) {
        const v = vs.find(function (x) { return x.name.indexOf(pref[i]) >= 0 && /^en/i.test(x.lang); });
        if (v) return v;
      }
      return vs.find(function (x) { return /^en/i.test(x.lang); }) || null;
    } catch (e) { return null; }
  }
  function voice(text, force, pitch, rate) {
    if (!voiceOn || !enabled) return;
    const now = performance.now();
    if (!force && now - lastVoice < 900) return;
    lastVoice = now;
    try {
      if (!('speechSynthesis' in window)) return;
      const u = new SpeechSynthesisUtterance(text);
      const v = pickVoice();
      if (v) u.voice = v;
      u.rate = rate || 0.95; u.pitch = pitch == null ? 0.45 : pitch; u.volume = Math.min(1, vol * 1.3);
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
    } catch (e) { /* ignore */ }
  }

  /* ---------------------------------------------------------------
     ambience
  --------------------------------------------------------------- */
  function ambient(kind) {
    ambientKind = kind;
    killAmbient();
    if (!ctx || !ambientOn) return;
    try {
      ambientSrc = ctx.createBufferSource();
      ambientSrc.buffer = noiseBuf;
      ambientSrc.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = kind === 'snow' ? 520 : kind === 'yard' ? 260 : 380;
      ambientGain = ctx.createGain();
      ambientGain.gain.value = kind === 'snow' ? 0.07 : 0.045;
      const lfo = ctx.createOscillator(), lfoG = ctx.createGain();
      lfo.frequency.value = 0.12; lfoG.gain.value = 0.02;
      lfo.connect(lfoG); lfoG.connect(ambientGain.gain);
      // slow wind sweep on the filter
      const lfo2 = ctx.createOscillator(), lfo2G = ctx.createGain();
      lfo2.frequency.value = 0.07; lfo2G.gain.value = kind === 'snow' ? 260 : 140;
      lfo2.connect(lfo2G); lfo2G.connect(f.frequency);
      ambientSrc.connect(f); f.connect(ambientGain); ambientGain.connect(sfxBus);
      ambientSrc.start(); lfo.start(); lfo2.start();
      ambientNodes = [lfo, lfo2];
      if (kind === 'jungle') birds();
      if (kind === 'yard') creaks();
      if (kind === 'dust') desertHum();
    } catch (e) { /* ignore */ }
  }
  function birds() {
    birdTimer = setTimeout(function () {
      if (!ctx || !ambientOn) return;
      const f = 2200 + Math.random() * 1500, pan = Math.random() * 1.6 - 0.8;
      const n = 2 + Math.floor(Math.random() * 3);
      for (let i = 0; i < n; i++) tone({ t: i * 0.11, f0: f, f1: f * 1.5, dur: 0.08, vol: 0.05, pan: pan, wet: 0.3 });
      birds();
    }, 2500 + Math.random() * 5000);
  }
  function creaks() {
    creakTimer = setTimeout(function () {
      if (!ctx || !ambientOn) return;
      const pan = Math.random() * 1.6 - 0.8;
      if (Math.random() < 0.5) tone({ f0: 140 + Math.random() * 40, f1: 90, dur: 1.4, vol: 0.05, type: 'sawtooth', pan: pan, wet: 0.7, attack: 0.4 });   // distant ship horn / creak
      else noise({ dur: 0.7, type: 'bandpass', f0: 700, f1: 400, q: 6, vol: 0.05, pan: pan, wet: 0.6, attack: 0.2 });
      creaks();
    }, 6000 + Math.random() * 9000);
  }
  function desertHum() {
    creakTimer = setTimeout(function () {
      if (!ctx || !ambientOn) return;
      noise({ dur: 2.5, type: 'bandpass', f0: 500, f1: 900, q: 0.6, vol: 0.05, attack: 1.2, pan: Math.random() - 0.5 });   // gust
      desertHum();
    }, 5000 + Math.random() * 7000);
  }
  function killAmbient() {
    try {
      if (ambientSrc) ambientSrc.stop();
      ambientNodes.forEach(function (n) { n.stop(); });
    } catch (e) { /* ignore */ }
    ambientSrc = null; ambientNodes = [];
    if (birdTimer) { clearTimeout(birdTimer); birdTimer = null; }
    if (creakTimer) { clearTimeout(creakTimer); creakTimer = null; }
  }
  function stopAmbient() { ambientKind = null; killAmbient(); }

  /* ---------------------------------------------------------------
     generative music: pads + bass always; drums + arpeggio as intensity rises
  --------------------------------------------------------------- */
  const CHORDS = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]];   // Am F C G
  let musicTimer = null, musicStep = 0, musicNext = 0, intensity = 0, targetIntensity = 0, musicPlaying = false;
  const mtof = function (m) { return 440 * Math.pow(2, (m - 69) / 12); };

  function mTone(t, f, dur, type, v, lp) {
    const o = ctx.createOscillator(), g = ctx.createGain(), fl = ctx.createBiquadFilter();
    o.type = type; o.frequency.value = f;
    fl.type = 'lowpass'; fl.frequency.value = lp || 1200;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(v, t + Math.min(0.3, dur * 0.4));
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    o.connect(fl); fl.connect(g); g.connect(musicBus);
    const s = ctx.createGain(); s.gain.value = 0.5; g.connect(s); s.connect(reverbIn);
    o.start(t); o.stop(t + dur + 0.05);
  }
  function mNoise(t, dur, f, v, type) {
    const s = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noiseBuf; fl.type = type || 'highpass'; fl.frequency.value = f;
    g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(fl); fl.connect(g); g.connect(musicBus);
    s.start(t, Math.random()); s.stop(t + dur + 0.02);
  }
  function mKick(t, v) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(130, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.14);
    g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    o.connect(g); g.connect(musicBus); o.start(t); o.stop(t + 0.25);
  }
  function scheduleStep(step, t) {
    const beatDur = 60 / 92 / 2;                     // 8th notes at 92 bpm
    const bar = Math.floor(step / 8), chord = CHORDS[bar % 4], s8 = step % 8;
    if (s8 === 0) {                                  // pad on the first step of each bar
      chord.forEach(function (n, i) {
        mTone(t, mtof(n), beatDur * 8.5, 'sawtooth', 0.05 + intensity * 0.02, 500 + intensity * 700);
        mTone(t, mtof(n) * 1.004, beatDur * 8.5, 'sawtooth', 0.04, 500 + intensity * 700);
        if (i === 0) mTone(t, mtof(n - 12), beatDur * 8, 'sine', 0.12, 300);
      });
    }
    if (s8 === 0 || s8 === 4) mTone(t, mtof(chord[0] - 24), beatDur * 3.6, 'triangle', 0.16 + intensity * 0.08, 400);
    if (intensity > 0.25 && (s8 === 0 || s8 === 3 || s8 === 4 || s8 === 6)) mKick(t, 0.28 * Math.min(1, intensity + 0.3));
    if (intensity > 0.55 && s8 % 2 === 1) mNoise(t, 0.04, 7000, 0.05 * intensity);
    if (intensity > 0.45 && (s8 === 2 || s8 === 6)) mNoise(t, 0.12, 1800, 0.07 * intensity, 'bandpass');
    if (intensity > 0.7) {                           // arpeggio
      const n = chord[(s8 / 2 | 0) % 3] + 12;
      mTone(t, mtof(n), beatDur * 1.6, 'square', 0.025, 1800);
    }
  }
  function musicTick() {
    if (!ctx || !musicPlaying) return;
    intensity += (targetIntensity - intensity) * 0.08;
    const beatDur = 60 / 92 / 2;
    while (musicNext < ctx.currentTime + 0.4) {
      if (musicNext < ctx.currentTime - 0.2) musicNext = ctx.currentTime + 0.05;
      scheduleStep(musicStep, musicNext);
      musicNext += beatDur; musicStep++;
    }
  }
  function musicStart() {
    if (!ctx || musicPlaying) return;
    musicPlaying = true; musicStep = 0; musicNext = ctx.currentTime + 0.1; intensity = 0;
    musicTimer = setInterval(musicTick, 100);
  }
  function musicStop() {
    musicPlaying = false;
    if (musicTimer) { clearInterval(musicTimer); musicTimer = null; }
  }
  function setIntensity(v) { targetIntensity = Math.max(0, Math.min(1, v)); }

  /* ---------------------------------------------------------------
     settings
  --------------------------------------------------------------- */
  function setVolume(v) { vol = v; applyGain(); }
  function setSfxVolume(v) { sfxVol = v; applyGain(); }
  function setMusicVolume(v) { musicVol = v; applyGain(); }
  function setEnabled(b) { enabled = !!b; applyGain(); }
  function setMusicOn(b) { musicOn = !!b; applyGain(); }
  function setAmbientOn(b) {
    ambientOn = !!b;
    if (!ambientOn) killAmbient();
    else if (ambientKind && ctx) ambient(ambientKind);
  }
  function setVoiceOn(b) { voiceOn = !!b; if (!voiceOn) { try { window.speechSynthesis.cancel(); } catch (e) { /* ignore */ } } }
  function getContext() { return ctx; }

  return {
    init, setEnv, shot, pump, reload, empty, switchWeapon, casing, whiz, impact,
    tick, timeUp, killConfirm, breath,
    jump, dodge, slide, mantle, grenadeThrow, bounce, beep, explosion,
    hitMarker, flesh, headshot, kill, headshotKill, scaryDuck, knife, meleeHit, hurt, heal, buy, deny, death, heartbeat,
    step, land, jump, slide, dodge, dodgeReady, pin, grenadeThrow, grenadeBounce, explosion, uiClick, uiHover, uiTab, uiOpen, uiClose, stinger, levelUp, waveStart, voice,
    ambient, stopAmbient, musicStart, musicStop, setIntensity,
    setVolume, setSfxVolume, setMusicVolume, setEnabled, setMusicOn, setAmbientOn, setVoiceOn, getContext
  };
})();
