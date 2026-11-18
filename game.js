/* ===================== STRIKE ZONE - game.js =====================
   Main game: menu, player, enemies, shooting, store, HUD, score.
   Needs (loaded before): three.js, audio.js, weapons.js, maps.js
*/
(function () {
  'use strict';

  /* ------------------------------------------------------------
     small helpers
  ------------------------------------------------------------ */
  const $ = function (id) { return document.getElementById(id); };
  const rand = function (a, b) { return a + Math.random() * (b - a); };
  const clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };
  const lerp = function (a, b, t) { return a + (b - a) * t; };
  const pick = function (arr) { return arr[Math.floor(Math.random() * arr.length)]; };
  const V3 = THREE.Vector3;
  let BASE_FOV = 78;
  const SWITCH_TIME = 0.35;
  const EYE = 1.65;
  const PLAYER_R = 0.45;
  const MATCH_SECONDS = 120;           // the whole round lasts 2 minutes


  /* ------------------------------------------------------------
     settings (saved in the browser) + characters
  ------------------------------------------------------------ */
  const SET_KEY = 'strikezone_settings_v2';
  const DEFAULT_BIND = { forward: 'KeyW', back: 'KeyS', left: 'KeyA', right: 'KeyD', jump: 'Space', sprint: 'ShiftLeft',
    crouch: 'KeyC', reload: 'KeyR', pov: 'KeyV', store: 'KeyB', use: 'KeyE', swap: 'KeyQ', settings: 'KeyO', scoreboard: 'Tab', dodge: 'KeyZ', grenade: 'KeyG' };
  const ACTIONS = [['forward', 'Move forward'], ['back', 'Move back'], ['left', 'Move left'], ['right', 'Move right'],
    ['jump', 'Jump'], ['sprint', 'Sprint'], ['crouch', 'Crouch'], ['reload', 'Reload'], ['pov', 'Change POV'],
    ['store', 'Open store'], ['use', 'Use vending machine'], ['swap', 'Quick-swap weapon'], ['settings', 'Open settings'], ['scoreboard', 'Show match stats (hold)'], ['dodge', 'Slide / dodge bullets'], ['grenade', 'Throw grenade']];
  const VFX_NAMES = ['Off', 'Normal', 'High', 'Ultra'];
  function defaultSettings() {
    return {
      volume: 0.7, sfxVol: 1, musicVol: 0.4, sound: true, ambient: true, music: true, voice: true, vfx: 2, sens: 1, fov: 78,
      models: true, weather: true, clouds: true, grade: true, vignette: true, grain: false, shake: true, dmgNumbers: true, autoFire: true, aimAssist: true, fps: false,
      bind: Object.assign({}, DEFAULT_BIND),
      hud: { minimap: true, topbar: true, compass: true, info: true, stats: true, killfeed: true, health: true, ammo: true, slots: true, crosshair: true },
      hudScale: 1, hudOpacity: 1, crossColor: '#ffffff', crossSize: 1, char: 0
    };
  }
  let SET = defaultSettings();
  /* phones: one-time lighter defaults so the game does not lag (can still be changed in Settings) */
  const IS_PHONE = ('ontouchstart' in window) && !!window.matchMedia && matchMedia('(pointer:coarse)').matches;
  try {
    if (IS_PHONE && !localStorage.getItem('sz_mobile_perf1')) {
      const r0 = JSON.parse(localStorage.getItem(SET_KEY) || '{}') || {};
      r0.vfx = Math.min(typeof r0.vfx === 'number' ? r0.vfx : 1, 1); r0.weather = false; r0.clouds = false; r0.grade = false; r0.vignette = false; r0.grain = false; r0.shake = false;
      localStorage.setItem(SET_KEY, JSON.stringify(r0));
      localStorage.setItem('strikezone_quality', 'low');
      localStorage.setItem('sz_mobile_perf1', '1');
    }
  } catch (e) { /* ignore */ }
  function loadSettings() {
    try {
      const raw = JSON.parse(localStorage.getItem(SET_KEY));
      if (raw && typeof raw === 'object') {
        const d = defaultSettings();
        Object.keys(raw).forEach(function (k) {
          if (!(k in d)) return;
          if (k === 'bind' || k === 'hud') { if (raw[k] && typeof raw[k] === 'object') Object.keys(raw[k]).forEach(function (kk) { if (kk in d[k] && typeof raw[k][kk] === typeof d[k][kk]) d[k][kk] = raw[k][kk]; }); }
          else if (typeof raw[k] === typeof d[k]) d[k] = raw[k];
        });
        SET = d;
      }
    } catch (e) { /* ignore */ }
    SET.vfx = clamp(Math.round(SET.vfx), 0, 3);
    SET.char = clamp(Math.round(SET.char), 0, 3);
    SET.fov = clamp(SET.fov, 60, 110);
    SET.sens = clamp(SET.sens, 0.3, 2.5);
    SET.volume = clamp(SET.volume, 0, 1);
    SET.sfxVol = clamp(SET.sfxVol, 0, 1);
    SET.musicVol = clamp(SET.musicVol, 0, 1);
    SET.hudScale = clamp(SET.hudScale, 0.7, 1.4);
    SET.hudOpacity = clamp(SET.hudOpacity, 0.3, 1);
    SET.crossSize = clamp(SET.crossSize, 0.6, 2);
  }
  function saveSettings() { try { localStorage.setItem(SET_KEY, JSON.stringify(SET)); } catch (e) { /* ignore */ } }
  function vmul(n) { return Math.round(n * [0, 1, 1.8, 3][SET.vfx]); }

  // 4 playable military characters
  const CHARS = [
    { name: 'GHOST', role: 'Woodland Recon', outfit: {
      shirt: 0x4b5a3a, pants: 0x3a4030, vest: 0x2a2e24, helmet: 0x2f3a2a, skin: 0xd9a679, camo: [0x4b5a3a, 0x2f3b2c, 0x6b5a3c],
      hat: 'helmet', mask: false, gaiter: true, maskColor: 0x2b3326, goggles: false, nvg: true, paint: 0x1f2a18, stubble: true, hairStyle: 'short', hair: 0x2a1d14, eye: 0x3f7a45, pack: true, glove: 0x1a1a1a, accent: 0x6fae4a } },
    { name: 'DESERT HAWK', role: 'Desert Assault', outfit: {
      shirt: 0xb59a6a, pants: 0x9a8458, vest: 0x6b5a3c, helmet: 0xa88f5d, skin: 0xb98259, camo: [0xb59a6a, 0x8a7348, 0x6b5a3c],
      hat: 'cap', mask: false, gaiter: true, maskColor: 0xc2ad82, goggles: false, gogglesUp: true, beard: true, hairStyle: 'short', hair: 0x1b130d, eye: 0x5a3a1c, pack: false, glove: 0x3a3426, accent: 0xffc14d } },
    { name: 'ARCTIC WOLF', role: 'Arctic Marksman', outfit: {
      shirt: 0xdfe6ee, pants: 0xc9d2dc, vest: 0x8a95a3, helmet: 0xe8eef5, skin: 0xf0c8a0, camo: [0xdfe6ee, 0xaab6c4, 0x7a8794],
      hat: 'helmet', mask: false, gaiter: true, maskColor: 0xdfe6ee, goggles: false, gogglesUp: true, earpro: true, scar: true, stubble: true, hairStyle: 'short', hair: 0xc9b27a, eye: 0x6fb6e8, pack: true, glove: 0x555d68, accent: 0x4aa3ff } },
    { name: 'NIGHT VIPER', role: 'Black Ops', outfit: {
      shirt: 0x1b1d20, pants: 0x17181a, vest: 0x101112, helmet: 0x0d0e10, skin: 0x6b4228, camo: null,
      hat: 'beanie', mask: false, gaiter: true, maskColor: 0x0a0a0a, goggles: false, monocle: 0xe5313b, hairStyle: 'bald', hair: 0x0b0b0b, eye: 0x2a1a10, pack: true, glove: 0x0a0a0a, accent: 0xe5313b } }
  ];

  function drawSoldierPreview(cv, o) {
    const c = cv.getContext('2d'), W = cv.width, H = cv.height, cx = W / 2;
    const hex = cssHex;
    c.clearRect(0, 0, W, H);
    function rect(col, x, y, w, h) { c.fillStyle = hex(col); c.fillRect(x, y, w, h); }
    function camoBlobs(x, y, w, h) {
      if (!o.camo) return;
      c.save(); c.beginPath(); c.rect(x, y, w, h); c.clip();
      for (let i = 0; i < 14; i++) {
        c.fillStyle = hex(o.camo[1 + (i % 2)]);
        c.beginPath(); c.ellipse(x + Math.random() * w, y + Math.random() * h, 5 + Math.random() * 7, 3 + Math.random() * 5, Math.random() * 3, 0, Math.PI * 2); c.fill();
      }
      c.restore();
    }
    rect(o.pants, cx - 22, 98, 19, 46); rect(o.pants, cx + 3, 98, 19, 46); camoBlobs(cx - 22, 98, 44, 46);
    rect(0x141414, cx - 24, 138, 22, 10); rect(0x141414, cx + 2, 138, 22, 10);
    rect(o.shirt, cx - 40, 56, 14, 44); rect(o.shirt, cx + 26, 56, 14, 44); camoBlobs(cx - 40, 56, 80, 44);
    rect(o.glove, cx - 41, 98, 16, 11); rect(o.glove, cx + 25, 98, 16, 11);
    rect(o.shirt, cx - 26, 52, 52, 50); camoBlobs(cx - 26, 52, 52, 50);
    rect(o.vest, cx - 25, 56, 50, 38);
    rect(0x111111, cx - 15, 62, 30, 24);
    [-12, -2, 8].forEach(function (x) { rect(0x111111, cx + x, 90, 8, 10); });
    rect(0x111111, cx - 26, 100, 52, 5);
    if (o.accent) { rect(o.accent, cx - 40, 62, 14, 6); rect(o.accent, cx - 14, 54, 10, 4); }
    rect(o.skin, cx - 5, 44, 10, 10);
    c.fillStyle = hex(o.skin); c.beginPath(); c.ellipse(cx, 35, 14.5, 17, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = hex(o.skin); c.beginPath(); c.ellipse(cx, 44, 12.5, 11, 0, 0, Math.PI); c.fill();              // jaw
    c.fillStyle = 'rgba(0,0,0,0.16)'; c.beginPath(); c.arc(cx - 6.5, 33, 4, 0, Math.PI * 2); c.arc(cx + 6.5, 33, 4, 0, Math.PI * 2); c.fill();   // eye sockets
    function eye(x) {
      c.fillStyle = '#f4f4ee'; c.beginPath(); c.ellipse(x, 33, 3.4, 2.1, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = hex(o.eye == null ? 0x4a3622 : o.eye); c.beginPath(); c.arc(x, 33, 1.7, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#050505'; c.beginPath(); c.arc(x, 33, 0.8, 0, Math.PI * 2); c.fill();
    }
    if (!o.mask && !(o.goggles && !o.gogglesUp)) {
      eye(cx - 6.5); eye(cx + 6.5);
      c.strokeStyle = hex(o.hair == null ? 0x2a1d14 : o.hair); c.lineWidth = 1.6;
      c.beginPath(); c.moveTo(cx - 10, 28.5); c.lineTo(cx - 3, 28); c.moveTo(cx + 3, 28); c.lineTo(cx + 10, 28.5); c.stroke();
      c.strokeStyle = 'rgba(0,0,0,0.28)'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(cx, 34); c.lineTo(cx - 1.6, 41); c.lineTo(cx + 1.6, 41); c.stroke();      // nose
      c.fillStyle = hex(o.skin); c.fillStyle = 'rgba(120,50,45,0.85)'; c.fillRect(cx - 3.5, 46, 7, 2.2);                                              // lips
      if (o.beard) { c.fillStyle = hex(o.hair == null ? 0x2a1d14 : o.hair); c.beginPath(); c.ellipse(cx, 47, 12, 8, 0, 0, Math.PI); c.fill(); c.fillRect(cx - 5, 44, 10, 2); c.fillStyle = 'rgba(120,50,45,0.85)'; c.fillRect(cx - 3, 47, 6, 1.6); }
      else if (o.stubble) { c.fillStyle = 'rgba(0,0,0,0.14)'; c.beginPath(); c.ellipse(cx, 45, 12.5, 9, 0, 0, Math.PI); c.fill(); }
      if (o.scar) { c.strokeStyle = '#9a4a44'; c.lineWidth = 1.3; c.beginPath(); c.moveTo(cx - 9, 27); c.lineTo(cx - 4, 39); c.stroke(); }
      if (o.paint) { c.strokeStyle = hex(o.paint); c.lineWidth = 2; [38, 41, 44].forEach(function (y) { c.beginPath(); c.moveTo(cx - 13, y); c.lineTo(cx - 7, y + 2); c.moveTo(cx + 13, y); c.lineTo(cx + 7, y + 2); c.stroke(); }); }
      if (o.monocle) { c.fillStyle = hex(o.monocle); c.beginPath(); c.arc(cx - 6.5, 33, 3.2, 0, Math.PI * 2); c.fill(); c.fillStyle = 'rgba(255,255,255,0.6)'; c.fillRect(cx - 8, 31.5, 2.2, 1.2); }
    }
    if (o.mask) { c.fillStyle = hex(o.maskColor || 0x151515); c.fillRect(cx - 14, 36, 28, 13); }
    if (o.gaiter) { c.fillStyle = hex(o.maskColor || 0x151515); c.fillRect(cx - 11, 49, 22, 6); }
    if (o.goggles && !o.gogglesUp) { rect(0x050505, cx - 14, 27, 28, 8); rect(0x6aa0c0, cx - 11, 29, 8, 4); rect(0x6aa0c0, cx + 3, 29, 8, 4); }
    c.fillStyle = hex(o.helmet);
    if (o.hat === 'beanie') { c.beginPath(); c.ellipse(cx, 27, 16.5, 13, 0, Math.PI, 0); c.fill(); c.fillRect(cx - 16, 24, 32, 5); }
    else if (o.hat === 'cap') { c.beginPath(); c.arc(cx, 28, 16.5, Math.PI, 0); c.fill(); c.fillRect(cx - 17, 27, 34, 3); c.fillRect(cx - 12, 29, 24, 3); }
    else { c.beginPath(); c.arc(cx, 31, 18, Math.PI, 0); c.fill(); c.fillRect(cx - 19, 29, 38, 4); }
    if (o.gogglesUp) { rect(0x15191c, cx - 15, 25, 30, 4); rect(0x6aa0c0, cx - 12, 24, 10, 4); rect(0x6aa0c0, cx + 2, 24, 10, 4); }
    if (o.earpro) { rect(0x2a2d30, cx - 19, 30, 5, 10); rect(0x2a2d30, cx + 14, 30, 5, 10); }
    if (o.nvg) { rect(0x2a2d30, cx - 4, 17, 8, 6); }
    if (o.accent) rect(o.accent, cx - 3, 13, 6, 16);
  }

  const QUALITY = {
    high:   { pr: 2,    shadows: true,  shadowSize: 2048, density: 1 },
    medium: { pr: 1.25, shadows: true,  shadowSize: 1024, density: 0.8 },
    low:    { pr: 0.8,  shadows: false, shadowSize: 512,  density: 0.55 },
    ultra:  { pr: 2,    shadows: true,  shadowSize: 4096, density: 1.15 }
  };

  const POVS = [
    { name: 'First Person',         shoulder: 0,    dist: 0 },
    { name: 'Third Person (Close)', shoulder: 0.55, dist: 2.6 },
    { name: 'Third Person (Far)',   shoulder: 0,    dist: 5.5 }
  ];

  const ENEMY_TYPES = {
    soldier: { hp: 100, speed: 1.0, scale: 1.0, reward: 100, color: 0xffb02e },
    scout:   { hp: 70,  speed: 1.3, scale: 0.95, reward: 120, color: 0x2ecc71, accent: 0x2ecc71 },
    heavy:   { hp: 170, speed: 0.85, scale: 1.12, reward: 160, color: 0xe5313b, accent: 0xe5313b, helmet: 0x4a1f1f, hat: 'helmet' }
  };
  const ENEMY_NAMES = ['Viper', 'Ghost', 'Raven', 'Wolf', 'Falcon', 'Cobra', 'Hawk', 'Shadow', 'Rogue', 'Titan', 'Reaper', 'Jackal', 'Bishop', 'Havoc'];

  /* ------------------------------------------------------------
     renderer + camera (created once)
  ------------------------------------------------------------ */
  const canvas = $('game-canvas');
  const renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: !IS_PHONE, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, IS_PHONE ? 1 : 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const camera = new THREE.PerspectiveCamera(BASE_FOV, window.innerWidth / window.innerHeight, 0.05, 700);
  camera.rotation.order = 'YXZ';

  let scene = null;
  let world = null;
  const raycaster = new THREE.Raycaster();

  /* ------------------------------------------------------------
     game state
  ------------------------------------------------------------ */
  const G = {
    state: 'menu',            // menu | playing | store | paused | dead
    username: 'Player',
    mapIndex: 0,
    quality: 'high',
    sens: 1,
    time: 0,
    kills: 0, headshots: 0, coins: 500,
    hp: 100, maxHp: 100,
    pos: new V3(0, 0, 0), velY: 0, onGround: true,
    yaw: 0, pitch: 0,
    pov: 0, ads: 0, adsHeld: false, fireHeld: false, firePressed: false,
    moveAmt: 0, bob: 0, stepDist: 0, speedNow: 0,
    vx: 0, vz: 0, crouch: 0, sprint: 0, roll: 0, landDip: 0,
    slowT: 0, shake: 0, punch: 0, aimHead: false, bleeds: [], pulses: [],
    swayX: 0, swayY: 0, dt: 0.016, hbT: 0, musT: 0, hudT: 0, sbT: 0, stepBudget: 3, _hitFlag: false,
    mp: null, remotes: {},
    dummies: [], inTrain: false, wasTrain: false, trainHintT: 0,
    slots: [null, null, null, null], cur: 0, lastSlot: 0,
    owned: {}, ammo: {},
    reloading: 0, reloadTotal: 1, switching: 0, nextFire: 0,
    kick: 0, recoilSpread: 0, flashT: 0,
    meleeSwing: 0, meleeDur: 0.4, meleeDone: true,
    autoReload: 0,
    enemies: [], spawnTimer: 0,
    particles: [], tracers: [], decals: [], debris: [],
    dmgFlash: 0, dmgDirT: 0, hitT: 0, headT: 0, healT: 0, healing: false, healTick: 0,
    hintOn: false,
    slideT: 0, slideDur: 1, slideI: 0, slideCd: 0, slideDirX: 0, slideDirZ: 0, slideTilt: 0, slideAmt: 0, slideSpeed: 10, slideKind: 'dodge',
    jumpBuf: 0, coyote: 0, jumpHeld: false, jumpAnim: 0, landPitch: 0, mantle: null,
    grenades: 3, nades: [], nadeLight: null, throwT: 0, nadeCd: 0,
    timeLeft: 120, timeUp: false, lastSec: 120, endT: 0, freezeT: 0, rawDt: 0.016, sprintT: 0, slideFx: 0, lowHpOn: false, timeBonus: 0
  };
  window.__game = G; // handy for debugging in the browser console

  const keys = {};
  const TOUCH = ('ontouchstart' in window) && window.matchMedia && matchMedia('(pointer:coarse)').matches;
  window.__touch = TOUCH;
  function down(a) { return !!keys[SET.bind[a]]; }
  function actionFor(code) {
    for (let i = 0; i < ACTIONS.length; i++) if (SET.bind[ACTIONS[i][0]] === code) return ACTIONS[i][0];
    return null;
  }
  function keyName(code) {
    if (code.indexOf('Key') === 0) return code.slice(3);
    if (code.indexOf('Digit') === 0) return code.slice(5);
    const m = { Space: 'SPACE', ShiftLeft: 'L-SHIFT', ShiftRight: 'R-SHIFT', ControlLeft: 'L-CTRL', ControlRight: 'R-CTRL', AltLeft: 'L-ALT', AltRight: 'R-ALT', Tab: 'TAB', CapsLock: 'CAPS', Backquote: '`', Enter: 'ENTER', Backspace: 'BACKSPACE' };
    return m[code] || code.toUpperCase();
  }

  /* HUD elements */
  const HUD = {
    root: $('hud'), hpFill: $('hp-fill'), hpText: $('hp-text'),
    kills: $('s-kills'), best: $('s-best'), total: $('s-total'), hs: $('s-hs'), coins: $('s-coins'),
    ammoName: $('ammo-name'), ammoMag: $('ammo-mag'), ammoRes: $('ammo-res'),
    slots: Array.prototype.slice.call(document.querySelectorAll('#slots .slot')),
    hint: $('hint'), killfeed: $('killfeed'), hit: $('hitmarker'), headText: $('headshot-text'),
    vignette: $('damage-vignette'), headFlash: $('headshot-flash'), dmgDir: $('damage-dir'), scope: $('scope-overlay'),
    cross: $('crosshair'), reloadBar: $('reload-bar'), user: $('hud-user'), map: $('hud-map'), pov: $('hud-pov'),
    mini: $('minimap')
  };
  const miniCtx = HUD.mini.getContext('2d');

  const textCache = new WeakMap();
  function setText(el, v) {
    v = String(v);
    if (textCache.get(el) !== v) { textCache.set(el, v); el.textContent = v; }
  }

  /* ------------------------------------------------------------
     saved scores (localStorage, per username)
  ------------------------------------------------------------ */
  const SCORE_KEY = 'strikezone_scores_v1';
  function loadScores() {
    try { return JSON.parse(localStorage.getItem(SCORE_KEY)) || {}; } catch (e) { return {}; }
  }
  function saveScores(s) {
    try { localStorage.setItem(SCORE_KEY, JSON.stringify(s)); } catch (e) { /* ignore */ }
  }
  function myRecord() {
    const s = loadScores();
    return s[G.username] || { best: 0, total: 0, headshots: 0 };
  }
  function recordKill(isHead) {
    const s = loadScores();
    const r = s[G.username] || { best: 0, total: 0, headshots: 0 };
    r.total += 1;
    if (isHead) r.headshots += 1;
    r.best = Math.max(r.best, G.kills);
    s[G.username] = r;
    saveScores(s);
  }
  function renderBoard() {
    const s = loadScores();
    const rows = Object.keys(s).map(function (n) { return { n: n, best: s[n].bestScore || 0, total: s[n].total }; })
      .sort(function (a, b) { return b.best - a.best || b.total - a.total; }).slice(0, 6);
    const tb = document.querySelector('#board tbody');
    tb.innerHTML = '';
    if (!rows.length) {
      const tr = document.createElement('tr');
      tr.innerHTML = '<td colspan="4" style="color:#8a97a3">No scores yet - go get some kills!</td>';
      tb.appendChild(tr);
      return;
    }
    rows.forEach(function (r, i) {
      const tr = document.createElement('tr');
      const me = r.n === ($('username').value.trim() || 'Player');
      tr.innerHTML = '<td>' + (i + 1) + '</td><td class="' + (me ? 'me' : '') + '"></td><td>' + r.best.toLocaleString('en-US') + '</td><td>' + r.total + '</td>';
      tr.children[1].textContent = r.n; // textContent keeps usernames safe from HTML
      tb.appendChild(tr);
    });
  }

  /* ------------------------------------------------------------
     menu
  ------------------------------------------------------------ */
  function buildMenu() {
    const list = $('map-list');
    list.innerHTML = '';
    MAPS.forEach(function (m, i) {
      const card = document.createElement('div');
      card.className = 'map-card' + (i === G.mapIndex ? ' selected' : '');
      card.style.background = m.preview;
      const info = document.createElement('div');
      info.className = 'info';
      const b = document.createElement('b'); b.textContent = m.name;
      const sp = document.createElement('span'); sp.textContent = m.desc;
      info.appendChild(b); info.appendChild(sp);
      card.appendChild(info);
      card.addEventListener('click', function () {
        G.mapIndex = i;
        Array.prototype.forEach.call(list.children, function (c, j) { c.classList.toggle('selected', i === j); });
      });
      list.appendChild(card);
    });
    try {
      const u = localStorage.getItem('strikezone_user');
      if (u) $('username').value = u;
      const q = localStorage.getItem('strikezone_quality');
      if (q && QUALITY[q]) $('quality').value = q;
      const se = localStorage.getItem('strikezone_sens');
      if (se) $('sens').value = se;
    } catch (e) { /* ignore */ }
    $('username').addEventListener('input', renderBoard);
    renderBoard();
    buildCharacters();
    const tips = ['TIP: Z dodges bullets and slides ~7 m - you are invincible for a moment.', 'TIP: One hit kills any enemy. Headshots give bonus score.', 'TIP: Spend coins at the store (B) to buy rifles and armor.', 'TIP: Kills trigger a weapon spin - keep the streak going.', 'TIP: Green pads heal you.'];
    try { const sc = JSON.parse(localStorage.getItem(SCORE_KEY) || '{}'); const fb = $('feat-best'); if (fb) fb.textContent = 'BEST ' + (sc.bestScore || 0).toLocaleString(); } catch (e) {}
    const tipEl = $('tip'); if (tipEl) tipEl.textContent = tips[Math.floor(Math.random() * tips.length)];
  }

  /* ------------------------------------------------------------
     weapons: slots, equip, ammo
  ------------------------------------------------------------ */
  function curId() { return G.slots[G.cur]; }
  function curWeapon() { return WEAPONS[G.slots[G.cur]]; }
  function curAmmo() { return G.ammo[G.slots[G.cur]]; }

  function slotKind(w) {
    if (w.type === 'gun') return 'gun';
    if (w.type === 'pistol' || w.type === 'knife') return 'side';
    return 'melee';
  }
  function defaultSlot(w) {
    const k = slotKind(w);
    if (k === 'side') return 2;
    if (k === 'melee') return 3;
    if (!G.slots[0]) return 0;
    if (!G.slots[1]) return 1;
    return G.cur === 1 ? 1 : 0;
  }
  function equipWeapon(id, slot) {
    const w = WEAPONS[id];
    if (slot == null) slot = defaultSlot(w);
    const other = G.slots.indexOf(id);
    if (other >= 0 && other !== slot) G.slots[other] = G.slots[slot];  // swap places
    G.slots[slot] = id;
    if (!G.ammo[id]) G.ammo[id] = { mag: w.mag || 0, reserve: w.reserve || 0 };
    if (!G.slots[G.cur]) G.cur = slot;
    if (G.cur === slot || other === G.cur) {
      G.reloading = 0;
      rebuildHeld();
    }
    updateHUD(true);
  }
  function switchTo(i) {
    if (i < 0 || i > 3 || !G.slots[i] || i === G.cur) return;
    G.lastSlot = G.cur;
    G.cur = i;
    G.reloading = 0; G.autoReload = 0;
    G.switching = SWITCH_TIME;
    G.nextFire = Math.max(G.nextFire, G.time + SWITCH_TIME);
    G.meleeSwing = 0;
    Sound.switchWeapon();
    rebuildHeld();
    updateHUD(true);
  }
  function cycleSlot(dir) {
    let i = G.cur;
    for (let n = 0; n < 4; n++) {
      i = (i + dir + 4) % 4;
      if (G.slots[i]) { switchTo(i); return; }
    }
  }
  function reload() {
    const w = curWeapon();
    if (!w || (w.type !== 'gun' && w.type !== 'pistol')) return;
    const a = curAmmo();
    if (G.reloading > 0 || G.switching > 0 || a.mag >= w.mag || a.reserve <= 0) return;
    G.reloading = w.reload;
    G.reloadTotal = w.reload;
    G.autoReload = 0;
    Sound.reload(w.reload);
  }
  function finishReload() {
    const w = curWeapon(), a = curAmmo();
    const take = Math.min(w.mag - a.mag, a.reserve);
    a.mag += take; a.reserve -= take;
    updateHUD(true);
  }

  /* ------------------------------------------------------------
     humanoid builder (used for the player model and for enemies)
  ------------------------------------------------------------ */
  const CAMO_CACHE = {};
  function camoTex(c1, c2, c3) {
    const key = c1 + '_' + c2 + '_' + c3;
    if (CAMO_CACHE[key]) return CAMO_CACHE[key];
    const t = canvasTexture(128, function (ctx, sz) {
      ctx.fillStyle = cssHex(c1); ctx.fillRect(0, 0, sz, sz);
      const cols = [c2, c3];
      for (let i = 0; i < 46; i++) {
        ctx.fillStyle = cssHex(cols[i % 2]);
        ctx.beginPath();
        ctx.ellipse(Math.random() * sz, Math.random() * sz, 6 + Math.random() * 14, 4 + Math.random() * 9, Math.random() * 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }, 1, 1);
    CAMO_CACHE[key] = t;
    return t;
  }

  function buildHumanoid(o) {
    const g = new THREE.Group();
    const parts = [], mats = [];
    function M(c, r, m, map) {
      const mt = new THREE.MeshStandardMaterial({ color: map ? 0xffffff : c, map: map || null, roughness: r == null ? 0.85 : r, metalness: m || 0 });
      mats.push(mt);
      return mt;
    }
    function shade(c, f) {
      const r = Math.min(255, Math.round(((c >> 16) & 255) * f)), gg = Math.min(255, Math.round(((c >> 8) & 255) * f)), b2 = Math.min(255, Math.round((c & 255) * f));
      return (r << 16) | (gg << 8) | b2;
    }
    const camo = o.camo ? camoTex(o.camo[0], o.camo[1], o.camo[2]) : null;
    const shirt = M(o.shirt, 0.9, 0, camo), pants = M(o.pants, 0.9, 0, camo), vest = M(o.vest, 0.95), skin = M(o.skin, 0.6);
    const skinDark = M(shade(o.skin, 0.72), 0.65), lip = M(shade(o.skin, 0.55), 0.6);
    const boots = M(0x141414, 0.7), helmM = M(o.helmet, 0.55, 0.15), glass = M(0x050505, 0.1, 0.6);
    const cloth = M(o.maskColor || 0x151515, 0.95), glove = M(o.glove == null ? 0x1a1a1a : o.glove, 0.8), strap = M(0x111111, 0.9);
    const metal = M(0x2a2d30, 0.4, 0.7), white = M(0xe9e9e4, 0.4), dark = M(0x0b0b0b, 0.5), pad = M(shade(o.vest, 0.75), 0.9);
    const hair = M(o.hair == null ? 0x2a1d14 : o.hair, 0.95);
    const accent = o.accent ? M(o.accent, 0.6) : null;
    function add(geo, mat, x, y, z, parent, part, small) {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.castShadow = !small;
      m.userData.part = part;
      parent.add(m);
      parts.push(m);
      return m;
    }
    const B = function (x, y, z) { return new THREE.BoxGeometry(x, y, z); };
    const C = function (rt, rb, h) { return new THREE.CylinderGeometry(rt, rb, h, 16); };
    const S = function (r) { return new THREE.SphereGeometry(r, 16, 12); };
    const heavy = !!o.heavy;

    // legs: hip -> thigh -> knee -> shin -> boot (the knee really bends when walking)
    const legL = new THREE.Group(); legL.position.set(-0.14, 0.92, 0); g.add(legL);
    const legR = new THREE.Group(); legR.position.set(0.14, 0.92, 0); g.add(legR);
    const kneeL = new THREE.Group(); kneeL.position.y = -0.47; legL.add(kneeL);
    const kneeR = new THREE.Group(); kneeR.position.y = -0.47; legR.add(kneeR);
    [[legL, kneeL, -1], [legR, kneeR, 1]].forEach(function (L) {
      const l = L[0], k = L[1], sd = L[2];
      add(C(0.11, 0.088, 0.5), pants, 0, -0.23, 0, l, 'limb');                    // thigh
      add(S(0.09), pants, 0, -0.47, 0, l, 'limb', true);                          // knee joint
      add(B(0.06, 0.2, 0.12), pants, 0.105 * sd, -0.25, 0, l, 'limb', true);      // cargo pocket
      add(C(0.082, 0.062, 0.46), pants, 0, -0.24, 0, k, 'limb');                  // shin
      add(B(0.15, 0.14, 0.07), pad, 0, 0.0, -0.085, k, 'limb', true);             // knee pad
      add(C(0.07, 0.085, 0.14), boots, 0, -0.5, 0, k, 'limb');                    // boot shaft
      add(B(0.16, 0.09, 0.3), boots, 0, -0.55, -0.06, k, 'limb');                 // foot
      add(B(0.16, 0.025, 0.3), dark, 0, -0.595, -0.06, k, 'limb', true);          // sole
      if (heavy) add(B(0.17, 0.26, 0.05), vest, 0, -0.12, -0.1, l, 'limb', true); // thigh plate
    });
    if (!o.noHolster) add(B(0.07, 0.17, 0.09), strap, 0.16, -0.26, 0.0, legR, 'limb', true);   // holster
    if (!o.noHolster) add(B(0.045, 0.1, 0.07), metal, 0.17, -0.2, -0.01, legR, 'limb', true);

    // torso: belt, shirt, plate-carrier vest with pouches, radio, grenades, backpack
    const torso = new THREE.Group(); torso.position.y = 0.92; g.add(torso);
    add(B(0.46, 0.2, 0.27), pants, 0, 0.1, 0, torso, 'body');
    add(B(0.49, 0.06, 0.3), strap, 0, 0.21, 0, torso, 'body');
    add(B(0.06, 0.05, 0.02), metal, 0, 0.21, -0.155, torso, 'body', true);              // belt buckle
    add(B(0.09, 0.1, 0.07), strap, -0.17, 0.17, -0.17, torso, 'body', true);
    add(B(0.09, 0.1, 0.07), strap, 0.17, 0.17, -0.17, torso, 'body', true);
    add(B(0.5, 0.52, 0.28), shirt, 0, 0.45, 0, torso, 'body');
    add(B(0.55, 0.42, 0.34), vest, 0, 0.47, 0, torso, 'body');
    add(B(0.3, 0.28, 0.06), strap, 0, 0.5, -0.19, torso, 'body');
    [-0.12, 0, 0.12].forEach(function (x) { add(B(0.07, 0.1, 0.05), strap, x, 0.3, -0.2, torso, 'body', true); });
    add(C(0.035, 0.035, 0.11), pad, 0.2, 0.34, -0.2, torso, 'body', true);               // grenade
    add(S(0.03), metal, 0.2, 0.4, -0.2, torso, 'body', true);
    add(B(0.06, 0.12, 0.05), metal, -0.21, 0.62, -0.19, torso, 'body', true);            // chest radio
    add(C(0.008, 0.008, 0.2), dark, -0.22, 0.78, -0.19, torso, 'body', true);            // antenna
    if (o.pack) {
      add(B(0.36, 0.42, 0.18), vest, 0, 0.45, 0.26, torso, 'body');
      add(C(0.07, 0.07, 0.34), strap, 0, 0.72, 0.26, torso, 'body', true).rotation.z = Math.PI / 2;
      add(B(0.2, 0.18, 0.06), pad, 0, 0.35, 0.37, torso, 'body', true);
    } else {
      add(B(0.3, 0.3, 0.06), strap, 0, 0.5, 0.19, torso, 'body');
    }
    if (accent) add(B(0.1, 0.06, 0.02), accent, -0.15, 0.62, -0.18, torso, 'body', true);
    add(B(0.09, 0.05, 0.34), vest, -0.17, 0.69, 0, torso, 'body', true);
    add(B(0.09, 0.05, 0.34), vest, 0.17, 0.69, 0, torso, 'body', true);
    add(S(heavy ? 0.14 : 0.09), vest, -0.31, 0.65, 0, torso, 'body');
    add(S(heavy ? 0.14 : 0.09), vest, 0.31, 0.65, 0, torso, 'body');
    if (heavy) { add(B(0.5, 0.36, 0.08), vest, 0, 0.5, -0.22, torso, 'body'); if (accent) add(B(0.3, 0.05, 0.02), accent, 0, 0.62, -0.27, torso, 'body', true); }
    add(C(0.06, 0.07, 0.12), skin, 0, 0.74, 0, torso, 'body', true);                     // neck

    // head: sculpted from scaled spheres - skull, cheekbones, jaw, eyes (sclera/iris/pupil/lids), brows, nose, lips, ears, hair, facial hair, scars, face paint
    const head = new THREE.Group(); head.position.set(0, 0.9, 0); torso.add(head);
    const eyeM = M(o.eye == null ? 0x4a3622 : o.eye, 0.25), lipUp = M(shade(o.skin, 0.62), 0.5), lipLow = M(shade(o.skin, 0.74), 0.45), browM = M(o.hair == null ? 0x2a1d14 : o.hair, 0.9);
    const skull = add(new THREE.SphereGeometry(0.125, 24, 18), skin, 0, 0, 0, head, 'head'); skull.scale.set(0.92, 1.1, 1.0);
    const jaw = add(new THREE.SphereGeometry(0.086, 18, 12), skin, 0, -0.07, -0.03, head, 'head', true); jaw.scale.set(1.12, 0.92, 1.02);
    const chin = add(new THREE.SphereGeometry(0.036, 12, 8), skin, 0, -0.112, -0.068, head, 'head', true); chin.scale.set(1.15, 0.8, 0.9);
    [-1, 1].forEach(function (sd) {
      const cheek = add(new THREE.SphereGeometry(0.034, 12, 8), skin, 0.068 * sd, -0.018, -0.094, head, 'head', true); cheek.scale.set(1.0, 0.85, 0.7);
      const sock = add(new THREE.SphereGeometry(0.03, 12, 8), skinDark, 0.05 * sd, 0.022, -0.1, head, 'head', true); sock.scale.set(1.15, 0.8, 0.45);       // eye socket shading
      const ball = add(new THREE.SphereGeometry(0.0225, 14, 10), white, 0.05 * sd, 0.021, -0.104, head, 'head', true); ball.scale.set(1.12, 0.78, 0.62);   // sclera
      add(new THREE.SphereGeometry(0.0125, 12, 8), eyeM, 0.05 * sd, 0.021, -0.1155, head, 'head', true).scale.set(1, 1, 0.5);                          // iris
      add(new THREE.SphereGeometry(0.0062, 8, 6), dark, 0.05 * sd, 0.021, -0.1185, head, 'head', true).scale.set(1, 1, 0.5);                           // pupil
      const lidU = add(new THREE.SphereGeometry(0.0255, 12, 6, 0, Math.PI * 2, 0, Math.PI * 0.5), skin, 0.05 * sd, 0.028, -0.103, head, 'head', true); lidU.scale.set(1.12, 0.55, 0.66);   // upper eyelid
      const brow = add(B(0.06, 0.013, 0.02), browM, 0.054 * sd, 0.056, -0.108, head, 'head', true); brow.rotation.z = -0.16 * sd; brow.rotation.y = 0.28 * sd;
      const ear = add(new THREE.SphereGeometry(0.03, 12, 8), skinDark, 0.117 * sd, -0.002, 0.004, head, 'head', true); ear.scale.set(0.42, 1.08, 0.72);
      add(new THREE.SphereGeometry(0.016, 8, 6), skin, 0.121 * sd, -0.002, 0.004, head, 'head', true).scale.set(0.3, 1, 0.7);
    });
    const bridge = add(B(0.022, 0.056, 0.03), skin, 0, 0.003, -0.12, head, 'head', true); bridge.rotation.x = 0.18;
    const tip = add(new THREE.SphereGeometry(0.019, 12, 8), skin, 0, -0.03, -0.14, head, 'head', true); tip.scale.set(1.0, 0.9, 1.0);
    [-1, 1].forEach(function (sd) {
      const ala = add(new THREE.SphereGeometry(0.012, 8, 6), skin, 0.016 * sd, -0.036, -0.13, head, 'head', true); ala.scale.set(1, 0.9, 0.9);
      add(new THREE.SphereGeometry(0.0055, 6, 5), dark, 0.0095 * sd, -0.041, -0.1385, head, 'head', true);                                              // nostril
    });
    const philtrum = add(B(0.014, 0.022, 0.012), skinDark, 0, -0.054, -0.126, head, 'head', true); philtrum.visible = !o.beard;
    add(B(0.054, 0.01, 0.02), lipUp, 0, -0.07, -0.119, head, 'head', true);                                                                              // upper lip
    add(B(0.046, 0.013, 0.022), lipLow, 0, -0.083, -0.117, head, 'head', true);                                                                          // lower lip
    add(B(0.056, 0.004, 0.012), dark, 0, -0.0765, -0.121, head, 'head', true);                                                                           // mouth line
    // hair: sideburns, nape and (optional) style
    const hs = o.hairStyle || 'short';
    if (hs !== 'bald') {
      add(B(0.022, 0.07, 0.04), hair, -0.112, 0.01, -0.06, head, 'head', true); add(B(0.022, 0.07, 0.04), hair, 0.112, 0.01, -0.06, head, 'head', true);
      add(B(0.19, 0.075, 0.05), hair, 0, -0.015, 0.105, head, 'head', true);
      if (hs === 'long') { const pt = add(C(0.03, 0.012, 0.2), hair, 0, -0.08, 0.15, head, 'head', true); pt.rotation.x = 0.35; }
      if (hs === 'mohawk') { const mh = add(B(0.03, 0.05, 0.22), hair, 0, 0.14, 0, head, 'head', true); mh.rotation.x = -0.05; }
    }
    if (o.beard) {
      const bd = add(new THREE.SphereGeometry(0.092, 16, 10), hair, 0, -0.078, -0.036, head, 'head', true); bd.scale.set(1.1, 0.86, 1.03);
      add(B(0.07, 0.016, 0.022), hair, 0, -0.06, -0.126, head, 'head', true);                                                                              // moustache
      add(B(0.03, 0.04, 0.03), hair, 0, -0.118, -0.082, head, 'head', true);                                                                               // chin tuft
    } else if (o.stubble) {
      const sb = add(new THREE.SphereGeometry(0.0875, 16, 10), M(shade(o.skin, 0.8), 0.95), 0, -0.071, -0.03, head, 'head', true); sb.scale.set(1.13, 0.93, 1.03);
    }
    if (o.scar) { const sc = add(B(0.01, 0.07, 0.005), M(0x9a4a44, 0.6), -0.058, 0.026, -0.1205, head, 'head', true); sc.rotation.z = 0.45; }
    if (o.paint) [0.0, -0.022, -0.044].forEach(function (y, i) {
      [-1, 1].forEach(function (sd) { const st = add(B(0.04, 0.007, 0.006), M(o.paint, 0.8), 0.08 * sd, -0.005 + y, -0.088 + i * 0.002, head, 'head', true); st.rotation.y = 0.55 * sd; st.rotation.z = 0.25 * sd; });
    });
    let helmet;
    if (o.hat === 'cap') {
      helmet = add(new THREE.SphereGeometry(0.138, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.5), helmM, 0, 0.032, 0, head, 'head');
      add(B(0.2, 0.02, 0.13), helmM, 0, 0.042, -0.14, head, 'head', true);
      add(B(0.22, 0.07, 0.07), hair, 0, 0.0, 0.1, head, 'head', true);
    } else if (o.hat === 'beanie') {
      helmet = add(new THREE.SphereGeometry(0.137, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), cloth, 0, 0.03, 0, head, 'head');
      add(C(0.139, 0.139, 0.035), cloth, 0, 0.045, 0, head, 'head', true);
    } else {
      helmet = add(new THREE.SphereGeometry(0.147, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), helmM, 0, 0.03, 0, head, 'head');
      add(C(0.165, 0.165, 0.02), helmM, 0, 0.068, 0, head, 'head', true);
      add(B(0.07, 0.05, 0.05), strap, 0, 0.11, -0.14, head, 'head', true);
      add(B(0.02, 0.1, 0.02), strap, -0.13, -0.05, -0.02, head, 'head', true);          // chin strap
      add(B(0.02, 0.1, 0.02), strap, 0.13, -0.05, -0.02, head, 'head', true);
      add(B(0.18, 0.05, 0.05), hair, 0, -0.01, 0.12, head, 'head', true);
      if (o.nvg) { add(B(0.07, 0.07, 0.03), metal, 0.0, 0.12, -0.15, head, 'head', true); add(C(0.028, 0.028, 0.05), dark, 0.0, 0.16, -0.165, head, 'head', true).rotation.x = Math.PI / 2; }
      else add(B(0.07, 0.07, 0.03), metal, 0.1, 0.11, -0.1, head, 'head', true);       // night-vision mount
      if (accent) add(B(0.05, 0.012, 0.22), accent, 0, 0.168, 0, head, 'head', true);
    }
    if (o.earpro) [-1, 1].forEach(function (sd) {                                   // headset ear cups
      const cup = add(C(0.055, 0.055, 0.045), metal, 0.128 * sd, 0.0, 0.0, head, 'head', true); cup.rotation.z = Math.PI / 2;
      add(S(0.028), accent || dark, 0.148 * sd, 0.0, 0.0, head, 'head', true);
    });
    if (o.mask) add(B(0.2, 0.1, 0.21), cloth, 0, -0.06, -0.005, head, 'head');
    if (o.gaiter) {                                                                  // neck gaiter / scarf, face stays visible
      add(C(0.092, 0.105, 0.085), cloth, 0, -0.135, -0.005, head, 'head', true);
      add(C(0.1, 0.12, 0.09), cloth, 0, 0.715, 0, torso, 'body', true);
    }
    if (o.goggles !== false && !o.gogglesUp) {
      add(B(0.23, 0.05, 0.06), glass, 0, 0.02, -0.115, head, 'head', true);
      add(B(0.27, 0.035, 0.27), strap, 0, 0.02, 0, head, 'head', true);
    }
    if (o.gogglesUp) {                                                               // goggles pushed up on the forehead
      add(B(0.25, 0.034, 0.27), strap, 0, 0.092, 0, head, 'head', true);
      [-1, 1].forEach(function (sd) { const ln = add(B(0.085, 0.045, 0.03), glass, 0.052 * sd, 0.1, -0.138, head, 'head', true); ln.rotation.x = -0.35; });
    }
    if (o.monocle) {
      const ml = add(C(0.026, 0.026, 0.02), new THREE.MeshStandardMaterial({ color: o.monocle, emissive: o.monocle, emissiveIntensity: 0.9, roughness: 0.3 }), -0.05, 0.022, -0.125, head, 'head', true); ml.rotation.x = Math.PI / 2;
      add(B(0.1, 0.01, 0.01), metal, -0.09, 0.03, -0.12, head, 'head', true);
    }

    // arms: shoulder -> upper arm -> elbow -> forearm -> glove
    const armR = new THREE.Group(); armR.position.set(0.34, 0.62, 0); torso.add(armR);
    const armL = new THREE.Group(); armL.position.set(-0.34, 0.62, 0); torso.add(armL);
    const elbowR = new THREE.Group(); elbowR.position.y = -0.31; armR.add(elbowR);
    const elbowL = new THREE.Group(); elbowL.position.y = -0.31; armL.add(elbowL);
    [[armR, elbowR], [armL, elbowL]].forEach(function (A) {
      const a = A[0], e = A[1];
      add(C(0.08, 0.066, 0.32), shirt, 0, -0.155, 0, a, 'limb');                         // upper arm
      add(S(0.068), shirt, 0, -0.31, 0, a, 'limb', true);                                // elbow joint
      add(C(0.066, 0.056, 0.3), shirt, 0, -0.15, 0, e, 'limb');                          // forearm
      add(B(0.11, 0.07, 0.11), pad, 0, 0.0, -0.05, e, 'limb', true);                     // elbow pad
      add(C(0.062, 0.062, 0.06), strap, 0, -0.26, 0, e, 'limb', true);                   // wrist band
      if (accent) add(C(0.086, 0.086, 0.06), accent, 0, -0.12, 0, a, 'limb', true);
      add(B(0.1, 0.11, 0.12), glove, 0, -0.33, 0, e, 'limb');                            // hand
    });
    // holder chain: three nested groups that cancel the arm + elbow rotation so the weapon stays aligned with the body
    const holderA = new THREE.Group(); holderA.position.set(0, -0.3, 0); elbowR.add(holderA);
    const holderB = new THREE.Group(); holderA.add(holderB);
    const holder = new THREE.Group(); holderB.add(holder);

    const rig = { group: g, parts: parts, mats: mats, legL: legL, legR: legR, kneeL: kneeL, kneeR: kneeR, torso: torso, head: head,
             helmet: helmet, armR: armR, armL: armL, elbowR: elbowR, elbowL: elbowL, holderA: holderA, holderB: holderB, holder: holder, walkT: 0 };
    poseArms(rig, 1.3, -0.4, 0.2, 1.35, 0.65, 0.25, -1.3);
    return rig;
  }

  /* one call sets both arms and keeps the weapon level:
     ax/az = right shoulder, e = right elbow bend, lax/lz/le = left arm, hx = extra weapon pitch (default cancels the arm) */
  function poseArms(h, ax, az, e, lax, lz, le, hx) {
    h.armR.rotation.set(ax, 0, az);
    h.elbowR.rotation.x = e;
    h.holderA.rotation.x = -e;
    h.holderB.rotation.z = -az;
    h.holder.rotation.x = hx == null ? -ax : hx;
    h.armL.rotation.set(lax, 0, lz);
    h.elbowL.rotation.x = le;
  }

  function lightenRig(h) {            // phones: far fewer draw calls per character
    if (!IS_PHONE || !h || !h.parts) return h;
    h.parts.forEach(function (m) { if (!m.castShadow && m.userData.part !== 'head') m.visible = false; });
    return h;
  }
  /* realistic animated soldier if models.js managed to load one, otherwise the procedural soldier above */
  const MAP_TINT = { dust: 0xffe8c4, jungle: 0xdcf0cc, yard: 0xd6dce4, snow: 0xffffff };
  const KIND_TINT = { heavy: 0xffb4a6, scout: 0xcfe6ff };
  const CHAR_TINT = [0xffffff, 0xffe2b8, 0xc6dcff, 0xb8b8b8];
  function buildCharacter(outfit, tint) {
    if (SET.models && Models.ready()) {
      try {
        const r = Models.create({ tint: tint });
        if (r) return r;
      } catch (err) { if (window.console) console.warn('[models] falling back to built-in soldier: ' + err.message); }
    }
    return lightenRig(buildHumanoid(outfit));
  }

  const CAMO_SETS = {
    dust:   [0xb59a6a, 0x8a7348, 0x6b5a3c],
    jungle: [0x4b5a3a, 0x2f3b2c, 0x6b5a3c],
    yard:   [0x70757a, 0x4a4e52, 0x2c2f33],
    snow:   [0xdfe6ee, 0xaab6c4, 0x7a8794]
  };
  function randomOutfit() {
    const id = MAPS[G.mapIndex].id;
    return {
      shirt: pick([0x4b5a3a, 0x5e5a46, 0x3d4a52, 0x6b5a3c, 0x2f3b2c, 0x554a3a]),
      pants: pick([0x3a3f33, 0x454035, 0x2b2f36, 0x4a4636]),
      vest: pick([0x2a2e24, 0x3d3a2c, 0x1d2228, 0x5a4d38, 0x333a30]),
      helmet: pick([0x2f3a2a, 0x3b3b30, 0x232a30, 0x5a5340]),
      skin: pick([0xd9a679, 0xb98259, 0x8d5a3b, 0xf0c8a0, 0x6b4228]),
      camo: Math.random() < 0.65 ? CAMO_SETS[id] : null,
      hat: pick(['helmet', 'helmet', 'cap', 'beanie']),
      mask: Math.random() < 0.45, goggles: Math.random() < 0.5, pack: Math.random() < 0.6,
      glove: pick([0x1a1a1a, 0x2b2b2b, 0x3a3426]), maskColor: pick([0x151515, 0x2b2b2b, 0x3a4630]),
      hair: pick([0x1b130d, 0x2a1d14, 0x4a3524, 0x8a6a3a, 0x2b2b2b]), beard: Math.random() < 0.35
    };
  }

  /* player's own body (visible in 3rd person) */
  let player = null;
  let viewRoot = null, viewModel = null, viewArms = null;
  let tppWeapon = null;
  let flashLight = null;

  function buildViewArms(o) {
    const g = new THREE.Group();
    const sleeve = new THREE.MeshStandardMaterial({ color: o.camo ? o.camo[0] : o.shirt, roughness: 0.9 });
    const skin = new THREE.MeshStandardMaterial({ color: o.glove, roughness: 0.8 });   // gloves
    function bx(sx, sy, sz, x, y, z, m, rx, ry) {
      const me = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), m);
      me.position.set(x, y, z);
      if (rx) me.rotation.x = rx;
      if (ry) me.rotation.y = ry;
      g.add(me);
      return me;
    }
    bx(0.075, 0.075, 0.5, 0.025, -0.14, 0.3, sleeve, -0.25);       // right forearm
    bx(0.085, 0.085, 0.04, 0.02, -0.105, 0.1, new THREE.MeshStandardMaterial({ color: 0x111111 }), -0.25); // cuff
    bx(0.07, 0.075, 0.12, 0.012, -0.075, 0.08, skin);               // right hand
    const l1 = bx(0.07, 0.07, 0.5, -0.1, -0.15, -0.05, sleeve, 0.1, -0.15);
    const l2 = bx(0.07, 0.07, 0.11, -0.05, -0.07, -0.38, skin);
    g.userData.left = [l1, l2];
    g.userData.fore = [g.children[0], g.children[1]];   // forearm+cuff: hidden during kill spin
    return g;
  }

  function rebuildHeld() {
    const id = curId();
    if (!id || !viewRoot) return;
    for (let i = viewRoot.children.length - 1; i >= 0; i--) { if (viewRoot.children[i] !== viewArms) viewRoot.remove(viewRoot.children[i]); }   // drop every old gun model, keep only the hands
    viewModel = makeWeaponModel(id);
    viewRoot.add(viewModel);
    const w = WEAPONS[id];
    const showLeft = w.type === 'gun';
    viewArms.userData.left.forEach(function (m) { m.visible = showLeft; });

    // third-person copy in the player's hand
    while (player.holder.children.length) player.holder.remove(player.holder.children[0]);
    tppWeapon = makeWeaponModel(id);
    const gunLike = w.type === 'gun' || w.type === 'pistol';
    if (gunLike) tppWeapon.position.set(0, 0.09, -0.1);
    player.holder.add(tppWeapon);
  }

  /* ------------------------------------------------------------
     collisions
  ------------------------------------------------------------ */
  function groundAt(x, z, y) {
    let g = 0;
    const bs = world.boxes;
    for (let i = 0; i < bs.length; i++) {
      const b = bs[i];
      if (b.maxY <= y + 0.5 && b.maxY > g && x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ) g = b.maxY;
    }
    return g;
  }
  function resolve(pos, radius, height) {
    const bs = world.boxes;
    for (let it = 0; it < 2; it++) {
      for (let i = 0; i < bs.length; i++) {
        const b = bs[i];
        if (pos.y + height <= b.minY || pos.y + 0.5 >= b.maxY) continue;
        const cx = clamp(pos.x, b.minX, b.maxX), cz = clamp(pos.z, b.minZ, b.maxZ);
        const dx = pos.x - cx, dz = pos.z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 < radius * radius) {
          if (d2 > 1e-8) {
            const d = Math.sqrt(d2), push = radius - d;
            pos.x += dx / d * push; pos.z += dz / d * push;
          } else {
            const l = pos.x - b.minX, r = b.maxX - pos.x, t = pos.z - b.minZ, bt = b.maxZ - pos.z;
            const m = Math.min(l, r, t, bt);
            if (m === l) pos.x = b.minX - radius;
            else if (m === r) pos.x = b.maxX + radius;
            else if (m === t) pos.z = b.minZ - radius;
            else pos.z = b.maxZ + radius;
          }
        }
      }
    }
    const lim = world.half - 0.8;
    pos.x = clamp(pos.x, -lim, lim);
    pos.z = clamp(pos.z, -lim, lim);
  }
  function blockedAt(x, z, r) {
    const bs = world.boxes;
    for (let i = 0; i < bs.length; i++) {
      const b = bs[i];
      if (b.maxY <= 0.5 || b.minY >= 1.8) continue;
      const cx = clamp(x, b.minX, b.maxX), cz = clamp(z, b.minZ, b.maxZ);
      if ((x - cx) * (x - cx) + (z - cz) * (z - cz) < r * r) return true;
    }
    return false;
  }

  function panFor(x, z) {
    const dx = x - G.pos.x, dz = z - G.pos.z, d = Math.hypot(dx, dz) || 1;
    return clamp((dx * Math.cos(G.yaw) - dz * Math.sin(G.yaw)) / d * 0.9, -1, 1);
  }
  const _proj = new V3();
  function projector(wp) {
    _proj.copy(wp).project(camera);
    return { x: (_proj.x * 0.5 + 0.5) * window.innerWidth, y: (-_proj.y * 0.5 + 0.5) * window.innerHeight, visible: _proj.z > -1 && _proj.z < 1 };
  }
  function handleMatchEvents(events) {
    events.forEach(function (ev) {
      const S = Match.state();
      if (ev.type === 'multi') {
        UI.banner(ev.text, 'COMBO  x' + S.mult.toFixed(2).replace(/0$/, ''), 'multi');
        Sound.stinger(ev.level); Sound.voice(ev.text.toLowerCase(), true, 0.5);
      } else if (ev.type === 'streak') {
        UI.banner(ev.text, G.kills + ' KILLS', 'streak');
        Sound.stinger(Math.min(5, ev.level)); Sound.voice(ev.text.toLowerCase(), true, 0.4);
      } else if (ev.type === 'medal') {
        UI.medal(ev.name, ev.desc); Sound.stinger(1);
      } else if (ev.type === 'wave') {
        G.coins += ev.bonus;
        G.hp = Math.min(G.maxHp, G.hp + 25);
        G.slots.forEach(function (id) {
          if (!id || !G.ammo[id]) return;
          const w = WEAPONS[id];
          if (w.type === 'gun' || w.type === 'pistol') G.ammo[id].reserve = Math.min(w.reserve * 2, G.ammo[id].reserve + w.mag);
        });
        UI.banner('WAVE ' + ev.n, 'BONUS  +' + ev.bonus + ' COINS', 'wave');
        if (!G.mp) Sound.waveStart();
        updateHUD(true);
      }
    });
  }
  function bearingTo(x, z) { return (Math.atan2(x - G.pos.x, -(z - G.pos.z)) * 180 / Math.PI + 360) % 360; }
  function compassMarks() {
    const m = [];
    world.healSpots.forEach(function (p) { m.push({ b: bearingTo(p.x, p.z), c: '#3ddc6b', t: '+' }); });
    world.vending.forEach(function (p) { m.push({ b: bearingTo(p.x, p.z), c: '#ffc14d', t: '$' }); });
    if (world.training) m.push({ b: bearingTo(world.training.cx, world.training.cz), c: '#58aaff', t: 'T' });
    return m;
  }
  function updateMatch(dt) {
    const evs = Match.update(dt);
    if (evs.length) handleMatchEvents(evs);
    const S = Match.state();
    // ---- 2:00 countdown (real time, so slow-motion does not stretch the round)
    G.timeLeft = Math.max(0, G.timeLeft - G.rawDt);
    const secLeft = Math.ceil(G.timeLeft);
    if (secLeft !== G.lastSec) {
      G.lastSec = secLeft;
      if (secLeft <= 10 && secLeft > 0) Sound.tick(secLeft);
      else if (secLeft === 60) UI.banner('ONE MINUTE LEFT', 'KEEP THE COMBO ALIVE', 'wave');
      else if (secLeft === 30) { UI.banner('30 SECONDS LEFT', 'GO GO GO', 'wave'); Sound.stinger(2); }
      if (secLeft === 10) { UI.banner('FINAL 10 SECONDS', 'MAKE THEM COUNT', 'multi'); Sound.stinger(3); }
    }
    UI.setTimer(G.timeLeft);
    if (G.timeLeft <= 0) { timeIsUp(); return; }
    // ---- run / slide screen effects, tired breathing, low-health look
    UI.speedLines(SET.vfx > 0 ? Math.min(1, G.sprint * 0.55 + G.slideAmt * 0.9) : 0);
    if (G.sprint > 0.5) G.sprintT += dt;
    else { if (G.sprintT > 2.5) Sound.breath(); G.sprintT = 0; }
    const lowNow = G.hp > 0 && G.hp < 30;
    if (lowNow !== G.lowHpOn) { G.lowHpOn = lowNow; UI.lowHp(lowNow && SET.vfx > 0); }
    G.hudT -= dt;
    if (G.hudT <= 0) {
      G.hudT = 0.1;
      UI.updateTop({ wave: S.wave, score: S.score, time: Match.fmtTime(G.timeLeft), timeClass: G.timeLeft <= 10 ? 'crit' : G.timeLeft <= 30 ? 'warn' : '', waveProgress: (S.kills % Match.KILLS_PER_WAVE) / Match.KILLS_PER_WAVE, mult: S.mult, comboFrac: Math.max(0, S.comboT / 4) });
    }
    if (SET.hud.compass) UI.drawCompass(G.yaw, compassMarks());
    const sb = down('scoreboard');
    if (sb !== UI.scoreboardVisible()) UI.showScoreboard(sb);
    if (sb) {
      G.sbT -= dt;
      if (G.sbT <= 0) {
        G.sbT = 0.25;
        const p = Match.getProfile(G.username);
        UI.renderScoreboard({ name: G.username, rank: UI.rankLabel(Match.rankInfo(p.xp)), score: S.score, kills: S.kills, headshots: S.headshots,
          hsPct: S.kills ? Math.round(S.headshots / S.kills * 100) : 0, accuracy: Math.round(Match.accuracy() * 100), damage: S.damage,
          longest: Math.round(S.longest), bestCombo: S.bestCombo, wave: S.wave, time: Match.fmtTime(S.time), coins: G.coins });
      }
    }
    // music reacts to the fight
    G.musT -= dt;
    if (G.musT <= 0) {
      G.musT = 0.5;
      let alerted = 0;
      for (let i = 0; i < G.enemies.length; i++) if (!G.enemies[i].dead && G.enemies[i].alerted) alerted++;
      Sound.setIntensity(G.inTrain ? 0.1 : Math.min(1, 0.12 + alerted * 0.13 + (G.hp < 40 ? 0.2 : 0)));
    }
    if (G.hp < 35 && G.hp > 0) {
      G.hbT -= dt;
      if (G.hbT <= 0) { Sound.heartbeat(); G.hbT = 0.55 + 0.6 * (G.hp / 35); }
    } else G.hbT = 0;
  }

  /* ------------------------------------------------------------
     start / stop game
  ------------------------------------------------------------ */
  function disposeScene(s) {
    if (!s) return;
    s.traverse(function (o) {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        const ms = Array.isArray(o.material) ? o.material : [o.material];
        ms.forEach(function (m) { if (m.map) m.map.dispose(); m.dispose(); });
      }
    });
  }

  const SHARED = {};
  function initShared() {
    SHARED.box = new THREE.BoxGeometry(1, 1, 1);
    SHARED.blood = [0x8a0303, 0x600000, 0xb00505].map(function (c) { return new THREE.MeshBasicMaterial({ color: c }); });
    SHARED.spark = new THREE.MeshBasicMaterial({ color: 0xffd36a });
    SHARED.tracer = new THREE.MeshBasicMaterial({ color: 0xffe9a0, transparent: true, opacity: 0.85 });
    SHARED.enemyTracer = new THREE.MeshBasicMaterial({ color: 0xff7a5a, transparent: true, opacity: 0.8 });
    SHARED.hole = new THREE.MeshBasicMaterial({ color: 0x0a0a0a, transparent: true, opacity: 0.8, polygonOffset: true, polygonOffsetFactor: -2, depthWrite: false });
    SHARED.holeGeo = new THREE.CircleGeometry(0.05, 8);
    SHARED.bloodDecal = new THREE.MeshBasicMaterial({ color: 0x5a0000, transparent: true, opacity: 0.85, polygonOffset: true, polygonOffsetFactor: -2, depthWrite: false });
    SHARED.bloodDecalGeo = new THREE.CircleGeometry(0.5, 10);
    SHARED.smoke = new THREE.MeshBasicMaterial({ color: 0xc9c9c9 });
    SHARED.brass = new THREE.MeshBasicMaterial({ color: 0xd9a441 });
    SHARED.gold = new THREE.MeshBasicMaterial({ color: 0xffd24d });
    SHARED.ringGeo = new THREE.RingGeometry(0.5, 0.62, 28);
  }

  function startGame() {
    if (G.state === 'loading') return;
    Sound.init();
    const name = ($('username').value || '').trim().slice(0, 16) || 'Player';
    G.username = name;
    G.quality = QUALITY[$('quality').value] ? $('quality').value : 'high';
    G.sens = parseFloat($('sens').value) || 1;
    SET.sens = G.sens;
    saveSettings();
    try {
      localStorage.setItem('strikezone_user', name);
      localStorage.setItem('strikezone_quality', G.quality);
      localStorage.setItem('strikezone_sens', String(G.sens));
    } catch (e) { /* ignore */ }
    canvas.requestPointerLock();
    G.state = 'loading';
    UI.menuBackground(false);
    document.body.classList.remove('menu-open');
    $('menu').classList.add('hidden');
    $('pause').classList.add('hidden');
    $('gameover').classList.add('hidden');
    $('store').classList.add('hidden');
    UI.showLoading(MAPS[G.mapIndex].name);
    setTimeout(function () { UI.loadingProgress(0.4); setTimeout(beginMatch, 40); }, 40);
  }

  function beginMatch() {
    try {
      const Q = IS_PHONE ? Object.assign({}, QUALITY[G.quality], { pr: 1, shadows: false }) : QUALITY[G.quality];
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, Q.pr));
      renderer.setSize(window.innerWidth, window.innerHeight);
      renderer.shadowMap.enabled = Q.shadows;

      if (scene) { disposeScene(scene); }
      scene = new THREE.Scene();
      if (!SHARED.box) initShared();
      G.remotes = {};
      world = buildMap(scene, MAPS[G.mapIndex], Q, G.mp ? MPG.reserveZones() : undefined);
      G.world = world;
      scene.add(camera);
      UI.loadingProgress(0.75);

      // reset state
      G.time = 0; G.kills = 0; G.headshots = 0; G.coins = 500;
      G.hp = G.maxHp; G.pos.set(0, 0, 8); G.velY = 0; G.onGround = true;
      G.yaw = 0; G.pitch = 0; G.pov = 0; G.ads = 0; G.adsHeld = false; G.fireHeld = false; G.firePressed = false;
      G.slots = [null, null, null, null]; G.cur = 0; G.lastSlot = 0; G.owned = {}; G.ammo = {};
      G.reloading = 0; G.switching = 0; G.nextFire = 0; G.kick = 0; G.recoilSpread = 0; G.flashT = 0;
      G.meleeSwing = 0; G.meleeDone = true; G.autoReload = 0;
      G.enemies = []; G.spawnTimer = 0; G.particles = []; G.tracers = []; G.decals = []; G.debris = [];
      G.dmgFlash = 0; G.dmgDirT = 0; G.hitT = 0; G.headT = 0; G.healing = false; G.healTick = 0;
      G.moveAmt = 0; G.bob = 0; G.stepDist = 0;
      G.vx = 0; G.vz = 0; G.crouch = 0; G.sprint = 0; G.roll = 0; G.landDip = 0;
      G.slideT = 0; G.slideI = 0; G.slideCd = 0; G.slideAmt = 0; G.jumpBuf = 0; G.coyote = 0; G.jumpAnim = 0; G.landPitch = 0; G.mantle = null;
      G.grenades = 3; G.nades = []; G.nadeLight = null; G.throwT = 0; G.nadeCd = 0;
      G.timeLeft = MATCH_SECONDS; G.timeUp = false; G.lastSec = MATCH_SECONDS; G.endT = 0; G.freezeT = 0; G.sprintT = 0; G.slideFx = 0; G.lowHpOn = false; G.timeBonus = 0;
      UI.resetFx();
      G.dummies = []; G.inTrain = false; G.wasTrain = false; G.trainHintT = 0;
      G.slowT = 0; G.shake = 0; G.punch = 0; G.aimHead = false; G.bleeds = []; G.pulses = [];
      G.swayX = 0; G.swayY = 0; G.hbT = 0; G.musT = 0; G.hudT = 0; G.sbT = 0; G._hitFlag = false;
      camera.fov = BASE_FOV; camera.updateProjectionMatrix();

      // first-person weapon holder (a child of the camera)
      if (viewRoot && viewRoot.parent) viewRoot.parent.remove(viewRoot);   // remove the previous match's weapon + hands (they were left on the camera)
      if (player && player.group && player.group.parent) player.group.parent.remove(player.group);
      viewModel = null; tppWeapon = null;
      viewRoot = new THREE.Group();
      viewArms = buildViewArms(CHARS[SET.char].outfit);
      viewRoot.add(viewArms);
      camera.add(viewRoot);

      // player body for third person
      player = buildCharacter(CHARS[SET.char].outfit, CHAR_TINT[SET.char] || 0xffffff);
      if (player.glb) player.group.rotation.order = 'YXZ';
      player.group.visible = false;
      scene.add(player.group);

      flashLight = new THREE.PointLight(0xffb060, 0, 14, 2);
      scene.add(flashLight);

      // starting weapons
      if (G.mp) { MPG.loadout(); } else {
      G.owned.glock = true;                     // v12: pistol only
      equipWeapon('glock', 2);
      if (/kit=full/.test(location.search)) { G.owned.ak47 = G.owned.bat = true; equipWeapon('ak47', 0); equipWeapon('bat', 3); SET.autoFire = SET.aimAssist = false; }   // dev/test only
      G.cur = /kit=full/.test(location.search) ? 0 : 2; G.lastSlot = 2; G.flourish = 0; G.flourishKind = 0; G.autoT = 0;
      rebuildHeld(); }

      const n0 = G.quality === 'low' ? 6 : 8;
      if (!G.mp) for (let i = 0; i < n0; i++) spawnEnemy(true);
      buildDummies();

      // match rules, effects, sound environment
      Match.start(G.username);
      camera.position.set(G.pos.x, EYE, G.pos.z);
      Fx.init(scene, camera, world);
      Fx.setLevel(SET.vfx); Fx.setWeather(SET.weather); Fx.setClouds(SET.clouds);
      applyVisual();
      UI.clearOverlays();
      UI.showScoreboard(false);
      UI.updateTop({ wave: 1, score: 0, time: '0:00', waveProgress: 0, mult: 1, comboFrac: 0 });

      // HUD
      setText(HUD.user, G.username.toUpperCase());
      setText(HUD.map, MAPS[G.mapIndex].name);
      setText(HUD.pov, 'POV: ' + POVS[0].name + '  [' + keyName(SET.bind.pov) + ']');
      HUD.root.classList.remove('hidden');
      HUD.killfeed.innerHTML = '';
      updateHUD(true);

      G.state = 'playing';
      Sound.setEnv(MAPS[G.mapIndex].id);
      Sound.ambient(MAPS[G.mapIndex].ambient);
      Sound.musicStart();
      Sound.setIntensity(0.15);
      Sound.waveStart();
      if (G.mp) MPG.afterBegin(); else UI.banner('WAVE 1', 'GOOD LUCK, ' + G.username.toUpperCase(), 'wave');
      canvas.requestPointerLock();
      UI.loadingProgress(1);
      setTimeout(UI.hideLoading, 150);
    } catch (err) {
      if (window.console) console.error('Could not start the match:', err);
      UI.hideLoading();
      quitToMenu();
    }
  }

  function quitToMenu() {
    if (G.mp && window.MP && MP.active) { MP.leaveMatch(); return; }
    G.state = 'menu';
    Sound.stopAmbient();
    Sound.musicStop();
    UI.showScoreboard(false);
    UI.menuBackground(true);
    UI.renderProfile(G.username || ($('username').value.trim() || 'Player'));
    document.body.classList.add('menu-open');
    if (document.exitPointerLock) document.exitPointerLock();
    HUD.root.classList.add('hidden');
    $('pause').classList.add('hidden');
    $('gameover').classList.add('hidden');
    $('store').classList.add('hidden');
    $('menu').classList.remove('hidden');
    renderBoard();
    if (UI.fitMenu) setTimeout(UI.fitMenu, 0);
  }

  function pauseGame() {
    if (G.state !== 'playing') return;
    if (G.mp) { G.fireHeld = false; G.adsHeld = false; $('pause').classList.remove('hidden'); G.mpPaused = true; return; }   // online: the match keeps running
    G.state = 'paused';
    G.fireHeld = false; G.adsHeld = false;
    UI.showScoreboard(false);
    Sound.setIntensity(0.05);
    $('pause').classList.remove('hidden');
  }
  function resumeGame() {
    $('pause').classList.add('hidden');
    G.mpPaused = false;
    if (G.state !== 'dead') G.state = 'playing';
    canvas.requestPointerLock();
  }

  function die() { endMatch('dead'); }

  /* the 2:00 ran out: freeze-frame, horn, big TIME'S UP card, then the results screen */
  function timeIsUp() {
    if (G.timeUp || G.state !== 'playing') return;
    G.timeUp = true;
    G.state = 'timeup';
    G.endT = 2.7;
    G.fireHeld = false; G.adsHeld = false;
    G.timeBonus = G.hp > 0 ? Math.round(G.hp) * 10 : 0;
    if (G.timeBonus && Match.state()) Match.state().score += G.timeBonus;
    G.slowT = 2.7;
    Sound.timeUp(); Sound.setIntensity(0.05);
    UI.showScoreboard(false);
    UI.timeUp(Match.state() ? Match.state().score : 0, G.timeBonus);
    UI.setTimer(0);
    if (SET.vfx > 0) { G.shake = Math.max(G.shake, 0.05); G.punch = Math.max(G.punch, 5); }
  }

  function saveRunScore(score) {
    const s = loadScores();
    const r = s[G.username] || { best: 0, total: 0, headshots: 0 };
    r.bestScore = Math.max(r.bestScore || 0, score);
    s[G.username] = r;
    saveScores(s);
  }

  function endMatch(reason) {
    if (G.state === 'dead') return;
    const timed = reason === 'time';
    G.state = 'dead';
    G.fireHeld = false; G.adsHeld = false;
    if (!timed) { Sound.death(); Match.died(); }
    Sound.stopAmbient();
    Sound.musicStop();
    UI.showScoreboard(false);
    UI.resetFx();
    if (document.exitPointerLock) document.exitPointerLock();
    const sum = Match.finish();
    sum.reason = reason;
    sum.bonus = timed ? G.timeBonus : 0;
    sum.note = timed ? 'YOU SURVIVED THE FULL 2:00' : 'ELIMINATED WITH ' + Match.fmtTime(G.timeLeft) + ' LEFT';
    const title = $('go-title');
    if (title) { title.textContent = timed ? "TIME'S UP!" : 'YOU WERE ELIMINATED'; title.className = timed ? 'gold' : 'red'; }
    UI.gameOver(sum, $('go-stats'));
    saveRunScore(sum.score);
    if (sum.leveledUp) { Sound.levelUp(); }
    setTimeout(function () { if (G.state === 'dead') $('gameover').classList.remove('hidden'); }, timed ? 300 : 900);
  }

  /* ------------------------------------------------------------
     store
  ------------------------------------------------------------ */
  let storeTab = 'guns';
  const TAB_FILTER = {
    guns: function (w) { return w.type === 'gun'; },
    side: function (w) { return w.type === 'pistol' || w.type === 'knife'; },
    melee: function (w) { return w.type === 'melee'; }
  };

  function nearVending() {
    if (!world) return false;
    for (let i = 0; i < world.vending.length; i++) {
      const v = world.vending[i];
      if (Math.hypot(G.pos.x - v.x, G.pos.z - v.z) < 3.6) return true;
    }
    return false;
  }
  function openStore() {
    if (G.state !== 'playing' || G.mp) return;
    G.state = 'store';
    G.fireHeld = false; G.adsHeld = false;
    if (document.exitPointerLock) document.exitPointerLock();
    $('store').classList.remove('hidden');
    renderStore();
  }
  function closeStore(relock) {
    if (G.state !== 'store') return;
    $('store').classList.add('hidden');
    if (relock) {
      G.state = 'playing';
      canvas.requestPointerLock();
    } else {
      G.state = 'playing';
      pauseGame();
    }
  }

  function statBar(label, frac) {
    const d = document.createElement('div');
    d.className = 'stat-line';
    const s = document.createElement('span'); s.textContent = label;
    const bar = document.createElement('div'); bar.className = 'bar';
    const i = document.createElement('i'); i.style.width = Math.round(clamp(frac, 0.04, 1) * 100) + '%';
    bar.appendChild(i);
    d.appendChild(s); d.appendChild(bar);
    return d;
  }
  function mkBtn(text, cls, fn, disabled) {
    const b = document.createElement('button');
    b.className = 'btn small ' + (cls || '');
    b.textContent = text;
    if (disabled) b.disabled = true;
    b.addEventListener('click', fn);
    return b;
  }

  function renderStore() {
    setText($('store-coins'), G.coins);
    Array.prototype.forEach.call(document.querySelectorAll('#store-tabs .tab'), function (t) {
      t.classList.toggle('active', t.getAttribute('data-tab') === storeTab);
    });
    const grid = $('store-grid');
    grid.innerHTML = '';

    if (storeTab === 'supplies') {
      const items = [
        { name: 'Medkit', cat: 'Supply', desc: 'Restores 50 health instantly.', price: 150,
          can: function () { return G.hp < G.maxHp; }, buy: function () { G.hp = Math.min(G.maxHp, G.hp + 50); } },
        { name: 'Ammo Crate', cat: 'Supply', desc: 'Refills reserve ammo for all your guns.', price: 200,
          can: function () { return true; }, buy: function () {
            G.slots.forEach(function (id) {
              if (id && G.ammo[id] && (WEAPONS[id].type === 'gun' || WEAPONS[id].type === 'pistol')) G.ammo[id].reserve = WEAPONS[id].reserve;
            });
          } }
      ];
      items.forEach(function (it) {
        const c = document.createElement('div');
        c.className = 'item';
        const n = document.createElement('div'); n.className = 'name'; n.textContent = it.name;
        const ct = document.createElement('div'); ct.className = 'cat'; ct.textContent = it.cat;
        const ds = document.createElement('div'); ds.style.cssText = 'font-size:12px;color:#aab5be'; ds.textContent = it.desc;
        const pr = document.createElement('div'); pr.className = 'price'; pr.textContent = it.price + ' coins';
        const btns = document.createElement('div'); btns.className = 'btns';
        btns.appendChild(mkBtn('BUY', '', function () {
          if (G.coins < it.price || !it.can()) { Sound.deny(); return; }
          G.coins -= it.price; it.buy(); Sound.buy(); updateHUD(true); renderStore();
        }, G.coins < it.price || !it.can()));
        c.appendChild(n); c.appendChild(ct); c.appendChild(ds); c.appendChild(pr); c.appendChild(btns);
        grid.appendChild(c);
      });
      return;
    }

    const ids = Object.keys(WEAPONS).filter(function (id) { return TAB_FILTER[storeTab](WEAPONS[id]); })
      .sort(function (a, b) { return WEAPONS[a].price - WEAPONS[b].price; });
    ids.forEach(function (id) {
      const w = WEAPONS[id];
      const slotIdx = G.slots.indexOf(id);
      const owned = !!G.owned[id];
      const c = document.createElement('div');
      c.className = 'item' + (slotIdx >= 0 ? ' equipped' : '') + (w.price >= 2400 ? ' r-legendary' : w.price >= 1200 ? ' r-epic' : w.price >= 600 ? ' r-rare' : '');
      const n = document.createElement('div'); n.className = 'name'; n.textContent = w.name;
      const ct = document.createElement('div'); ct.className = 'cat'; ct.textContent = w.cat;
      c.appendChild(n); c.appendChild(ct);
      if (w.type === 'gun' || w.type === 'pistol') {
        c.appendChild(statBar('Damage', (w.dmg * w.pellets) / 140));
        c.appendChild(statBar('Fire rate', w.rpm / 1100));
        c.appendChild(statBar('Magazine', w.mag / 100));
      } else {
        c.appendChild(statBar('Damage', w.dmg / 110));
        c.appendChild(statBar('Speed', 1 / (w.cooldown + 0.3)));
        c.appendChild(statBar('Reach', w.range / 3.2));
      }
      const dpsV = (w.type === 'gun' || w.type === 'pistol') ? Math.round(w.dmg * w.pellets * w.rpm / 60) : Math.round(w.dmg / w.cooldown);
      const dpsEl = document.createElement('div'); dpsEl.className = 'dps'; dpsEl.innerHTML = 'DAMAGE / SEC <b></b>'; dpsEl.querySelector('b').textContent = dpsV;
      c.appendChild(dpsEl);
      const pr = document.createElement('div');
      pr.className = 'price';
      pr.textContent = owned ? (slotIdx >= 0 ? 'EQUIPPED - slot ' + (slotIdx + 1) : 'OWNED') : (w.price === 0 ? 'FREE' : w.price + ' coins');
      c.appendChild(pr);

      const btns = document.createElement('div'); btns.className = 'btns';
      const canBuy = owned || G.coins >= w.price;
      if (w.type === 'gun') {
        [0, 1].forEach(function (s) {
          const label = (owned ? 'EQUIP' : 'BUY') + ' > SLOT ' + (s + 1);
          btns.appendChild(mkBtn(label, '', function () { buyOrEquip(id, s); }, !canBuy || slotIdx === s));
        });
      } else {
        const s = slotKind(w) === 'side' ? 2 : 3;
        btns.appendChild(mkBtn((owned ? 'EQUIP' : 'BUY') + ' > SLOT ' + (s + 1), '', function () { buyOrEquip(id, s); }, !canBuy || slotIdx === s));
      }
      c.appendChild(btns);
      grid.appendChild(c);
    });
  }

  function buyOrEquip(id, slot) {
    const w = WEAPONS[id];
    if (!G.owned[id]) {
      if (G.coins < w.price) { Sound.deny(); return; }
      G.coins -= w.price;
      G.owned[id] = true;
      Sound.buy();
    } else {
      Sound.switchWeapon();
    }
    equipWeapon(id, slot);
    renderStore();
  }

  /* ------------------------------------------------------------
     effects: particles, tracers, decals
  ------------------------------------------------------------ */
  function addParticle(mat, size, pos, vel, life, grav, stick) {
    if (SET.vfx === 0) return;
    const m = new THREE.Mesh(SHARED.box, mat);
    m.scale.set(size, size, size);
    m.position.copy(pos);
    scene.add(m);
    G.particles.push({ mesh: m, vel: vel, life: life, max: life, grav: grav, size: size, stick: stick });
    if (G.particles.length > [0, 380, 650, 1000][SET.vfx]) {
      const old = G.particles.shift();
      scene.remove(old.mesh);
    }
  }
  function bloodSpray(point, dir, count, big) {
    Fx.blood(point, dir, big ? 1.6 : 1);
    count = vmul(count);
    for (let i = 0; i < count; i++) {
      const v = new V3(rand(-1, 1), rand(-0.2, 1.3), rand(-1, 1)).multiplyScalar(big ? 2.4 : 1.6);
      v.addScaledVector(dir, rand(1, big ? 5 : 3.5));
      addParticle(pick(SHARED.blood), rand(0.02, big ? 0.07 : 0.05), point, v, rand(0.5, 1.1), 14, true);
    }
  }
  function addDecal(geo, mat, point, normal, scale, maxCount, life) {
    if (SET.vfx === 0) return;
    const d = new THREE.Mesh(geo, mat);
    d.position.copy(point).addScaledVector(normal, 0.012);
    d.lookAt(_t1.copy(point).add(normal));
    if (scale !== 1) d.scale.set(scale, scale, scale);
    scene.add(d);
    G.decals.push({ mesh: d, life: life });
    if (G.decals.length > maxCount) {
      const old = G.decals.shift();
      scene.remove(old.mesh);
    }
  }
  const _t1 = new V3(), _t2 = new V3(), _t3 = new V3(), _t4 = new V3();

  function impactEffect(hit) {
    const n = hit.face ? _t2.copy(hit.face.normal).transformDirection(hit.object.matrixWorld) : _t2.set(0, 1, 0);
    const normal = n.clone();
    const isGround = hit.object.userData.ground;
    const surf = hit.object.userData.surf || 'stone';
    Fx.impact(hit.point, normal, surf);
    Sound.impact(surf, panFor(hit.point.x, hit.point.z), hit.distance || 0);
    if (!isGround) addDecal(SHARED.holeGeo, SHARED.hole, hit.point, normal, rand(0.8, 1.3), 70, 25);
  }
  function addTracer(from, to, mat, life) {
    if (SET.vfx === 0) return;
    const len = from.distanceTo(to);
    if (len < 0.3) return;
    const m = new THREE.Mesh(SHARED.box, mat);
    const tw = SET.vfx >= 2 ? 0.028 : 0.014;
    m.scale.set(tw, tw, len);
    m.position.copy(from).add(to).multiplyScalar(0.5);
    m.lookAt(to);
    scene.add(m);
    G.tracers.push({ mesh: m, life: life });
  }

  function addPulse(point, color, size, life) {
    if (SET.vfx < 2) return;
    const m = new THREE.Mesh(SHARED.ringGeo, new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
    m.position.copy(point);
    m.rotation.order = 'YXZ';
    m.rotation.set(camera.rotation.x, camera.rotation.y, 0);
    m.scale.set(0.1, 0.1, 0.1);
    scene.add(m);
    G.pulses.push({ mesh: m, life: life, max: life, size: size });
  }
  function flashHead(kill) {
    if (SET.vfx === 0) return;
    const el = HUD.headFlash;
    el.className = '';
    void el.offsetWidth;
    el.className = kill ? 'show kill' : 'show';
  }
  function headHitFx(point, dir) {
    if (SET.vfx === 0) return;
    G.shake = Math.max(G.shake, 0.01);
    UI.scary(false);
    Fx.blood(point, dir, 2.2);
    for (let i = 0; i < vmul(8); i++) {
      const v = new V3(rand(-1, 1), rand(0.2, 1.4), rand(-1, 1)).multiplyScalar(2.2).addScaledVector(dir, 1.5);
      addParticle(SHARED.gold, 0.03, point, v, rand(0.2, 0.45), 10, false);
    }
    addPulse(point, 0xff3b3b, 1.2, 0.3);
    Fx.burst(point, 0xffd24d, 1.4, 0.2);
  }
  function headKillFx(e, point, dir) {
    if (SET.vfx === 0) return;
    G.shake = Math.max(G.shake, 0.02);
    UI.scary(true);
    Fx.blood(point, dir, 4);
    Fx.burst(point, 0xaa0000, 5, 0.5);
    if (SET.vfx >= 2) {
      G.slowT = 0.9; G.punch = 9;
      addPulse(point, 0xffd24d, 2.4, 0.5);
      addPulse(point, 0xff3b3b, 1.5, 0.35);
      Fx.burst(point, 0xff5030, 2.6, 0.35);
      for (let i = 0; i < vmul(10); i++) {
        const v = new V3(rand(-1, 1), rand(0.2, 1.6), rand(-1, 1)).multiplyScalar(2.6).addScaledVector(dir, 2);
        addParticle(SHARED.gold, 0.035, point, v, rand(0.25, 0.6), 10, false);
      }
      G.bleeds.push({ e: e, t: 0.8 });
    }
  }
  function fireFx(origin, muzzle, w) {
    const fp = G.pov === 0 ? 0.6 : 1;
    Fx.muzzle(muzzle, fp * (w.pellets > 1 ? 1.35 : w.type === 'pistol' ? 0.7 : w.scope ? 1.5 : w.sfx === 'smg' ? 0.85 : 1));
    Fx.muzzleSmoke(muzzle, fp * (w.scope ? 1.3 : 1));
    Sound.casing(0.4);
    if (SET.vfx < 2) return;
    G.shake = Math.max(G.shake, w.recoil * (SET.vfx >= 3 ? 0.2 : 0.12));
    const pos = origin.clone().add(new V3(0.2, -0.15, -0.4).applyQuaternion(camera.quaternion));
    const v = new V3(1, 0.8, 0.3).applyQuaternion(camera.quaternion).multiplyScalar(rand(1.5, 2.6));
    addParticle(SHARED.brass, 0.022, pos, v, 1.6, 14, false);
  }

  function updateEffects(dt) {
    for (let i = G.particles.length - 1; i >= 0; i--) {
      const p = G.particles[i];
      p.life -= dt;
      if (p.life <= 0) { scene.remove(p.mesh); G.particles.splice(i, 1); continue; }
      p.vel.y -= p.grav * dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      if (p.mesh.position.y < 0.03) {
        p.mesh.position.y = 0.03;
        if (p.stick) { p.vel.set(0, 0, 0); } else { p.vel.y = Math.abs(p.vel.y) * 0.3; }
      }
      const s = p.size * clamp(p.life / p.max * 1.6, 0, 1);
      p.mesh.scale.set(s, s, s);
    }
    for (let i = G.tracers.length - 1; i >= 0; i--) {
      const t = G.tracers[i];
      t.life -= dt;
      if (t.life <= 0) { scene.remove(t.mesh); G.tracers.splice(i, 1); }
    }
    for (let i = G.decals.length - 1; i >= 0; i--) {
      const d = G.decals[i];
      d.life -= dt;
      if (d.life <= 0) { scene.remove(d.mesh); G.decals.splice(i, 1); }
    }
    for (let i = G.debris.length - 1; i >= 0; i--) {
      const d = G.debris[i];
      d.life -= dt;
      if (d.life <= 0) { scene.remove(d.mesh); G.debris.splice(i, 1); continue; }
      if (d.mesh.position.y > 0.1) {
        d.vel.y -= 16 * dt;
        d.mesh.position.addScaledVector(d.vel, dt);
        d.mesh.rotation.x += d.ang.x * dt; d.mesh.rotation.z += d.ang.z * dt;
      } else { d.mesh.position.y = 0.08; }
    }
    for (let i = G.pulses.length - 1; i >= 0; i--) {
      const p = G.pulses[i];
      p.life -= dt;
      if (p.life <= 0) { scene.remove(p.mesh); p.mesh.material.dispose(); G.pulses.splice(i, 1); continue; }
      const t = 1 - p.life / p.max;
      const sc = 0.1 + p.size * t;
      p.mesh.scale.set(sc, sc, sc);
      p.mesh.material.opacity = 0.9 * (1 - t);
    }
    for (let i = G.bleeds.length - 1; i >= 0; i--) {
      const b = G.bleeds[i];
      b.t -= dt;
      if (b.t <= 0 || b.e.removed) { G.bleeds.splice(i, 1); continue; }
      b.e.h.head.getWorldPosition(_t3);
      for (let k = 0; k < 2; k++) addParticle(pick(SHARED.blood), rand(0.025, 0.06), _t3, new V3(rand(-0.5, 0.5), rand(1.5, 3), rand(-0.5, 0.5)), rand(0.4, 0.8), 14, true);
    }
    G.shake *= Math.max(0, 1 - dt * 9);
    G.punch *= Math.max(0, 1 - dt * 6);
    if (G.flashT > 0) G.flashT -= dt;
    flashLight.intensity = (G.flashT > 0 && SET.vfx > 0) ? (SET.vfx >= 3 ? 4 : 2.6) : 0;
  }

  /* ------------------------------------------------------------
     player damage
  ------------------------------------------------------------ */
  function damagePlayer(dmg, fromPos) {
    if (G.state !== 'playing') return;
    if (G.slideI > 0 && dmg < 60) { UI.banner('DODGED', 'bullets whizz past', 'streak'); Sound.whiz(fromPos ? panFor(fromPos.x, fromPos.z) : 0); return; }
    G.hp -= dmg;
    G.dmgFlash = 1;
    if (SET.vfx > 0) UI.hurt();
    if (SET.vfx > 0) G.shake = Math.max(G.shake, 0.02);
    Match.damageTaken(dmg);
    Sound.hurt(fromPos ? panFor(fromPos.x, fromPos.z) : 0);
    if (fromPos) {
      const dx = fromPos.x - G.pos.x, dz = fromPos.z - G.pos.z;
      const fx = -Math.sin(G.yaw), fz = -Math.cos(G.yaw);
      const rx = Math.cos(G.yaw), rz = -Math.sin(G.yaw);
      const ang = Math.atan2(dx * rx + dz * rz, dx * fx + dz * fz);
      HUD.dmgDir.style.transform = 'rotate(' + ang + 'rad)';
      G.dmgDirT = 1.2;
    }
    if (G.hp <= 0) { G.hp = 0; die(); }
  }

  /* ------------------------------------------------------------
     enemies
  ------------------------------------------------------------ */
  function findSpawn() {
    for (let i = 0; i < 50; i++) {
      const x = rand(-world.half + 6, world.half - 6), z = rand(-world.half + 6, world.half - 6);
      if (Math.hypot(x - G.pos.x, z - G.pos.z) < 32) continue;
      if (blockedAt(x, z, 0.8)) continue;
      if (inTrainingZone(x, z, 4)) continue;
      return new V3(x, 0, z);
    }
    return null;
  }

  function spawnEnemy(initial) {
    const p = findSpawn();
    if (!p) return;
    const r0 = Math.random();
    const kind = r0 < 0.2 ? 'heavy' : r0 < 0.42 ? 'scout' : 'soldier';
    const T = ENEMY_TYPES[kind];
    const outfit = randomOutfit();
    if (T.accent) outfit.accent = T.accent;
    if (T.helmet) outfit.helmet = T.helmet;
    if (T.hat) outfit.hat = T.hat;
    if (kind === 'heavy') { outfit.pack = true; outfit.heavy = true; outfit.goggles = false; outfit.mask = true; }
    if (kind === 'scout') { outfit.hat = 'cap'; outfit.mask = Math.random() < 0.6; outfit.pack = false; }
    const h = buildCharacter(outfit, KIND_TINT[kind] != null ? KIND_TINT[kind] : MAP_TINT[MAPS[G.mapIndex].id]);
    h.group.scale.set(T.scale, T.scale, T.scale);
    h.group.position.copy(p);
    h.group.rotation.y = rand(0, Math.PI * 2);
    scene.add(h.group);
    const gunId = pick(['ak47', 'm4a1', 'mp5', 'scar']);
    const gun = makeWeaponModel(gunId);
    gun.position.set(0, 0.09, -0.1);
    h.holder.add(gun);
    if (h.glb) { h.group.updateMatrixWorld(true); h.glb.update(0.016, { spd: 0, aim: 0 }); }

    const e = {
      h: h, group: h.group, parts: h.parts, gun: gun, gunId: gunId,
      hp: 1, maxHp: 1, kind: kind, reward: T.reward, barT: 0, dead: false, deadT: 0, yaw: h.group.rotation.y,
      name: pick(ENEMY_NAMES) + '-' + Math.floor(rand(10, 99)),
      speed: rand(3.0, 4.2) * T.speed, state: 'wander', alerted: false, canSee: false, losT: rand(0, 0.3), lostT: 0,
      target: new V3(p.x, 0, p.z), idleT: rand(0.5, 2.5), shootCd: rand(1.2, 2.4),
      strafe: Math.random() < 0.5 ? 1 : -1, strafeT: rand(1, 3), range: rand(12, 22),
      detourT: 0, detourDir: 1, lastPos: new V3(p.x, 0, p.z), stuckT: 0, moving: false, vx: 0, vz: 0, tvx: 0, tvz: 0, spd: 0, dodgeT: 0,
      hurtT: 0, recoil: 0, flashT: 0, lastHit: new V3(), fallDir: 1, flinch: 0, roll: 0, stepAcc: 0, deathStyle: Math.floor(Math.random() * 3), crouchAmt: 0, breath: Math.random() * 6
    };
    h.parts.forEach(function (m) { m.userData.enemy = e; });
    // floating health bar (shown for a few seconds after the enemy is hit)
    const bar = new THREE.Group();
    bar.position.set(0, 2.15, 0);
    const bgm = new THREE.Mesh(new THREE.PlaneGeometry(0.76, 0.12), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.6, fog: false, depthWrite: false }));
    bgm.position.z = -0.005;
    const fill = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.07), new THREE.MeshBasicMaterial({ color: T.color, fog: false, depthWrite: false }));
    bar.add(bgm); bar.add(fill);
    bar.visible = false;
    h.group.add(bar);
    e.bar = bar; e.barFill = fill;
    G.enemies.push(e);
  }

  function enemyEye(e, out) { return out.set(e.group.position.x, 1.6, e.group.position.z); }

  function hasLOS(e) {
    enemyEye(e, _t3);
    _t4.set(G.pos.x, G.pos.y + 1.4, G.pos.z);
    const dir = _t4.clone().sub(_t3);
    const dist = dir.length();
    dir.normalize();
    raycaster.set(_t3, dir);
    raycaster.near = 0.1; raycaster.far = dist;
    const hits = raycaster.intersectObjects(world.blockers, false);
    return hits.length === 0 || hits[0].distance > dist - 0.6;
  }

  function inTrainingZone(x, z, pad) {
    const T = world.training;
    return !!T && Math.hypot(x - T.cx, z - T.cz) < T.r + (pad || 0);
  }
  function pushOutTraining(p) {
    const T = world.training;
    if (!T) return;
    const dx = p.x - T.cx, dz = p.z - T.cz, d = Math.hypot(dx, dz);
    if (d < T.r + 1) {
      const k = (T.r + 1) / (d || 0.01);
      p.x = T.cx + dx * k; p.z = T.cz + dz * k;
    }
  }
  function newWanderTarget(e, pos) {
    for (let t = 0; t < 8; t++) {
      const ang = rand(0, Math.PI * 2), r = rand(8, 25);
      const x = clamp(pos.x + Math.cos(ang) * r, -world.half + 5, world.half - 5);
      const z = clamp(pos.z + Math.sin(ang) * r, -world.half + 5, world.half - 5);
      if (!inTrainingZone(x, z, 3)) { e.target.set(x, 0, z); return; }
    }
    e.target.set(pos.x, 0, pos.z);
  }

  // sets the wanted velocity; the real velocity eases toward it in updateEnemy (smooth acceleration)
  function enemyMove(e, dx, dz, speed, dt) {
    const len = Math.hypot(dx, dz);
    if (len < 1e-5) return;
    dx /= len; dz /= len;
    if (e.detourT > 0) { const t = dx; dx = -dz * e.detourDir; dz = t * e.detourDir; }
    e.tvx = dx * speed; e.tvz = dz * speed;
    e.moving = true;
  }

  function enemyShoot(e) {
    const dist = Math.hypot(G.pos.x - e.group.position.x, G.pos.z - e.group.position.z);
    e.recoil = 1; e.flashT = 0.06;
    e.gun.userData.flash.visible = true;
    const muzzle = e.gun.userData.muzzle.clone();
    e.gun.updateWorldMatrix(true, false);
    e.gun.localToWorld(muzzle);
    const vol = clamp(1.1 - dist / 90, 0.12, 1);
    const epan = panFor(e.group.position.x, e.group.position.z);
    Sound.shot(WEAPONS[e.gunId].sfx, vol * 0.8, clamp(1 - dist / 140, 0.35, 1), epan, dist);
    Fx.muzzle(muzzle, 0.8);
    // chance to hit (low, drops with distance, harder if you are sprinting or jumping)
    let chance = clamp(0.35 - dist * 0.01, 0.06, 0.3);
    if (G.speedNow > 7) chance *= 0.7;
    if (!G.onGround) chance *= 0.6;
    const target = new V3(G.pos.x, G.pos.y + 1.2, G.pos.z);
    const hit = Math.random() < chance;
    if (!hit) target.add(new V3(rand(-1.4, 1.4), rand(-0.8, 0.9), rand(-1.4, 1.4)));
    addTracer(muzzle, target, SHARED.enemyTracer, 0.07);
    if (hit) damagePlayer(Math.round(rand(4, 7)), e.group.position);
    else if (dist < 70) Sound.whiz(epan);
  }

  function angleDiff(a, b) {
    let d = b - a;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return d;
  }

  function updateEnemy(e, dt) {
    if (e.dead) {
      e.deadT += dt;
      const h = e.h;
      if (h.glb && !h.glb.frozen) h.glb.freeze();
      const p = Math.min(1, e.deadT / (e.deathStyle === 2 ? 0.8 : 0.55));
      const q = p * p * (3 - 2 * p);
      if (e.deathStyle === 0) {            // knocked backwards
        e.group.rotation.x = q * 1.5 * e.fallDir;
        e.group.rotation.z = q * (e.roll || 0);
        h.armR.rotation.x = 1.3 - q * 2.4; h.armL.rotation.x = 1.35 - q * 2.2;
        h.legL.rotation.x = q * 0.4; h.legR.rotation.x = -q * 0.3;
      } else if (e.deathStyle === 1) {     // collapses sideways
        e.group.rotation.z = q * 1.45 * (e.roll >= 0 ? 1 : -1);
        e.group.rotation.x = q * 0.4 * e.fallDir;
        h.kneeL.rotation.x = q * 1.2; h.kneeR.rotation.x = q * 0.6;
        h.armR.rotation.x = 1.3 - q * 1.6; h.armL.rotation.x = 1.35 - q * 0.8;
      } else {                              // knees buckle first, then falls forward
        const k = Math.min(1, p * 2.2);
        h.kneeL.rotation.x = k * 1.9; h.kneeR.rotation.x = k * 1.9;
        h.legL.rotation.x = -k * 0.9; h.legR.rotation.x = -k * 0.9;
        h.torso.position.y = 0.92 - k * 0.45;
        e.group.rotation.x = Math.max(0, p - 0.35) / 0.65 * -1.45 * e.fallDir;
        h.armR.rotation.x = 1.3 - q * 1.5; h.armL.rotation.x = 1.35 - q * 1.5;
        h.head.rotation.x = q * 0.5;
      }
      h.head.rotation.x += q * 0.3;
      e.group.position.y = p * 0.12;
      if (e.deadT > 8) e.group.position.y -= (e.deadT - 8) * 0.3;
      if (e.deadT > 12) { scene.remove(e.group); e.removed = true; }
      return;
    }
    const pos = e.group.position;
    const dx = G.pos.x - pos.x, dz = G.pos.z - pos.z;
    const dist = Math.hypot(dx, dz);
    e.moving = false;
    if (e.barT > 0) { e.barT -= dt; e.bar.visible = true; e.bar.rotation.y = G.yaw - e.yaw; } else e.bar.visible = false;

    if (e.actT > 0) e.actT -= dt;
    e.actCd = (e.actCd || 0) - dt;
    e.losT -= dt;
    if (e.losT <= 0) {
      e.losT = 0.3;
      e.canSee = dist < 80 && !G.inTrain && hasLOS(e);
      if (e.canSee && dist < 55) { if (!e.alerted) e.shootCd = Math.max(e.shootCd, 1.4); e.alerted = true; }
    }
    if (G.inTrain) { e.alerted = false; e.canSee = false; }   // the training area is a safe zone
    if (e.canSee) e.lostT = 0; else e.lostT += dt;
    if (e.alerted && e.lostT > 12) e.alerted = false;

    // stuck detection -> sidestep
    e.stuckT += dt;
    if (e.stuckT > 0.6) {
      if (Math.hypot(pos.x - e.lastPos.x, pos.z - e.lastPos.z) < 0.25 && e.wasMoving) {
        e.detourT = 1.2; e.detourDir = Math.random() < 0.5 ? 1 : -1;
      }
      e.lastPos.copy(pos);
      e.stuckT = 0;
    }
    if (e.detourT > 0) e.detourT -= dt;

    let faceX = null, faceZ = null;
    if (e.alerted) {
      faceX = dx; faceZ = dz;
      if (e.canSee) {
        e.strafeT -= dt;
        if (e.strafeT <= 0) { e.strafe = -e.strafe; e.strafeT = rand(1.5, 3.5); }
        // sudden dodge: a short, faster side-step
        e.dodgeT -= dt;
        if (e.dodgeT <= -1 && Math.random() < dt * 0.35) { e.dodgeT = 0.6; e.strafe = -e.strafe; }
        const sm = e.dodgeT > 0 ? 1.4 : 1;
        // v12: acrobatics - random jumps and slides while fighting
        if (!(e.actT > 0) && e.actCd <= 0 && dist < 50 && Math.random() < dt * 1.3) {
          e.act = Math.random() < 0.5 ? 'jump' : 'slide';
          e.actDur = e.actT = e.act === 'jump' ? 0.7 : 0.65;
          e.actCd = rand(1.0, 2.4); e.actDir = Math.random() < 0.5 ? 1 : -1;
        }
        if (e.actT > 0 && e.act === 'slide') enemyMove(e, -dz * e.actDir, dx * e.actDir, e.speed * 2.8, dt);
        else if (e.actT > 0) enemyMove(e, -dz * e.actDir, dx * e.actDir, e.speed * 1.5, dt);
        else if (dist > e.range + 3) enemyMove(e, dx, dz, e.speed * 1.6, dt);
        else if (dist < e.range - 5) enemyMove(e, -dx, -dz, e.speed * 1.1, dt);
        else enemyMove(e, -dz * e.strafe, dx * e.strafe, e.speed * 0.85 * sm, dt);
        // slow, spaced-out shots
        if (dist < 55) {
          e.shootCd -= dt;
          if (e.shootCd <= 0) { enemyShoot(e); e.shootCd = rand(2.2, 3.8); }
        }
      } else {
        enemyMove(e, dx, dz, e.speed * 1.7, dt);   // run to the last place we saw you
      }
    } else {
      const tx = e.target.x - pos.x, tz = e.target.z - pos.z;
      if (e.idleT > 0) {
        e.idleT -= dt;
      } else if (Math.hypot(tx, tz) < 1.2) {
        e.idleT = rand(1, 3.5);
        newWanderTarget(e, pos);
      } else {
        enemyMove(e, tx, tz, e.speed * 0.5, dt);
        faceX = tx; faceZ = tz;
      }
    }
    e.wasMoving = e.moving;

    // velocity eases toward the wanted velocity
    const tvx = e.moving ? e.tvx : 0, tvz = e.moving ? e.tvz : 0;
    const k = Math.min(1, dt * (e.moving ? 6 : 10));
    e.vx += (tvx - e.vx) * k; e.vz += (tvz - e.vz) * k;
    e.spd = Math.hypot(e.vx, e.vz);
    if (e.spd > 0.03) {
      pos.x += e.vx * dt; pos.z += e.vz * dt; pos.y = 0;
      resolve(pos, 0.5, 1.8);
      pushOutTraining(pos);
    }

    // turn smoothly
    if (faceX !== null && (faceX !== 0 || faceZ !== 0)) {
      const want = Math.atan2(-faceX, -faceZ);
      e.yaw += angleDiff(e.yaw, want) * Math.min(1, dt * 8);
    }
    e.group.rotation.y = e.yaw;
    { // v12 jump arc / slide lean
      let ay = 0, tilt = 0;
      if (e.actT > 0) { const p = 1 - e.actT / e.actDur, sn = Math.sin(p * Math.PI); if (e.act === 'jump') ay = sn * 1.1; else tilt = -0.9 * sn; }
      e.group.position.y = ay; e.group.rotation.order = tilt ? 'YXZ' : 'XYZ'; e.group.rotation.x = tilt;
    }

    // animation: stride with bending knees, hip bob, lean when running, breathing, head scanning, crouch while shooting
    const h = e.h;
    h.walkT += dt * e.spd * 3.0;
    e.stepAcc = (e.stepAcc || 0) + e.spd * dt;
    if (e.stepAcc > 2.3) {
      e.stepAcc = 0;
      if (dist < 32 && G.stepBudget > 0) { G.stepBudget--; Sound.step(clamp(1 - dist / 32, 0, 1) * 0.9, panFor(pos.x, pos.z)); }
      if (e.spd > 3 && dist < 45 && SET.vfx > 0) Fx.dust(_t1.set(pos.x, 0.05, pos.z), world.def.dust, 0.8);
    }
    if (e.flinch > 0) e.flinch = Math.max(0, e.flinch - dt * 5);
    const run = clamp(e.spd / 3.2, 0, 1.4);
    const sw = Math.sin(h.walkT) * 0.75 * Math.min(run, 1);
    const wantCrouch = (e.alerted && e.canSee && e.spd < 1.2 && e.kind !== 'scout') ? 1 : 0;
    e.crouchAmt += (wantCrouch - e.crouchAmt) * Math.min(1, dt * 6);
    const cr = e.crouchAmt * 0.55;
    h.legL.rotation.x = sw - cr; h.legR.rotation.x = -sw - cr;
    // knee bends when the leg swings back, and a lot when crouching
    h.kneeL.rotation.x = Math.max(0, -sw) * 1.3 + cr * 1.9;
    h.kneeR.rotation.x = Math.max(0, sw) * 1.3 + cr * 1.9;
    e.breath += dt * 1.7;
    h.torso.position.y = 0.92 - e.crouchAmt * 0.3 + Math.abs(Math.sin(h.walkT)) * 0.04 * run + Math.sin(e.breath) * 0.006;
    h.torso.rotation.x = -0.1 * run - (e.flinch || 0) * 0.3 - e.crouchAmt * 0.12;
    h.torso.rotation.z = Math.sin(h.walkT) * 0.04 * run;
    h.torso.rotation.y = Math.sin(h.walkT) * 0.07 * run;
    h.head.rotation.y = e.alerted ? 0 : Math.sin(G.time * 0.7 + e.speed * 3) * 0.45;
    h.head.rotation.x = -(e.flinch || 0) * 0.5 + 0.1 * run;
    e.recoil = Math.max(0, e.recoil - dt * 8);
    // tactical run: gun held lower and closer while moving, raised to the shoulder when shooting
    const low = e.alerted && !e.canSee ? run * 0.25 : 0;
    poseArms(h, 1.3 - low + e.recoil * 0.12, -0.4, 0.2 + low * 1.2 + e.recoil * 0.35, 1.35 - low, 0.65, 0.25 + low, -1.3 + low * 0.0 - 0.0);
    e.gun.position.z = -0.1 + e.recoil * 0.05;
    if (h.glb) h.glb.update(dt, { spd: e.spd, aim: (e.alerted && e.canSee) ? 1 : 0, recoil: e.recoil });
    if (e.flashT > 0) { e.flashT -= dt; if (e.flashT <= 0) e.gun.userData.flash.visible = false; }
    if (e.hurtT > 0) {
      e.hurtT -= dt;
      if (e.hurtT <= 0) h.mats.forEach(function (m) { m.emissive.setHex(0x000000); });
    }
  }

  function updateEnemies(dt) {
    for (let i = G.enemies.length - 1; i >= 0; i--) {
      const e = G.enemies[i];
      updateEnemy(e, dt);
      if (e.removed) G.enemies.splice(i, 1);
    }
  }

  function updateSpawner(dt) {
    let alive = 0;
    G.enemies.forEach(function (e) { if (!e.dead) alive++; });
    const cap = IS_PHONE ? 8 : G.quality === 'low' ? 12 : 20;
    const want = Math.min((IS_PHONE ? 8 : 12) + Math.floor(G.kills / 2), cap + 4);
    G.spawnTimer -= dt;
    if (alive < want && G.spawnTimer <= 0) {
      spawnEnemy(false);
      G.spawnTimer = 0.2;
    }
  }

  /* ------------------------------------------------------------
     hitting enemies
  ------------------------------------------------------------ */
  function showHit(kind) {
    HUD.hit.className = 'show' + (kind ? ' ' + kind : '');
    G.hitT = 0.14;
  }
  function showHeadshotText(kill) {
    HUD.headText.textContent = kill ? 'HEADSHOT KILL!' : 'HEADSHOT!';
    HUD.headText.classList.toggle('kill', !!kill);
    HUD.headText.classList.remove('show');
    void HUD.headText.offsetWidth;
    HUD.headText.classList.add('show');
  }
  function killFeed(text, cls) {
    const d = document.createElement('div');
    d.textContent = text;
    if (cls) d.className = cls;
    HUD.killfeed.appendChild(d);
    while (HUD.killfeed.children.length > 5) HUD.killfeed.removeChild(HUD.killfeed.firstChild);
    setTimeout(function () { if (d.parentNode) d.parentNode.removeChild(d); }, 4500);
  }

  /* ---------- training dummies (no score, respawn after a few seconds) ---------- */
  function buildDummies() {
    G.dummies = [];
    const T = world.training;
    if (!T) return;
    T.spots.forEach(function (sp) {
      const h = buildHumanoid({ shirt: 0xd9731a, pants: 0x333333, vest: 0xeeeeee, helmet: 0xd9731a, skin: 0xbdbdbd, hat: 'helmet', goggles: false, glove: 0x333333 });
      poseArms(h, 0, -0.12, 0, 0, 0.12, 0, 0);
      h.group.position.set(sp.x, 0, sp.z);
      scene.add(h.group);
      const d = { dummy: true, h: h, group: h.group, parts: h.parts, mats: h.mats, hp: 100, dead: false, deadT: 0, yaw: 0, fallDir: 1, hurtT: 0, spot: sp };
      h.parts.forEach(function (m) { m.userData.enemy = d; });
      G.dummies.push(d);
    });
  }
  function damageDummy(d, dmg, part, point, dir) {
    if (d.dead) return;
    const mult = part === 'head' ? 2.5 : part === 'limb' ? 0.75 : 1;
    const dealt = Math.round(dmg * mult);
    d.hp -= dealt;
    d.hurtT = 0.12;
    d.mats.forEach(function (m) { m.emissive.setHex(0x663300); });
    for (let i = 0; i < 6; i++) {
      const v = new V3(rand(-1, 1), rand(0.2, 1.4), rand(-1, 1)).multiplyScalar(2).addScaledVector(dir, 1.5);
      addParticle(SHARED.spark, 0.03, point, v, rand(0.15, 0.3), 12, false);
    }
    const head = part === 'head';
    if (head) { Sound.headshot(); Sound.voice('Head shot!', false, 0.05, 0.62); showHit('head'); showHeadshotText(false); flashHead(false); headHitFx(point, dir); }
    else { Sound.hitMarker(); Sound.flesh(); showHit(''); }
    killFeed('Training: ' + (head ? 'HEADSHOT ' : part === 'limb' ? 'Limb ' : 'Body ') + dealt + ' dmg', head ? 'hs' : '');
    if (d.hp <= 0) {
      d.dead = true; d.deadT = 0;
      const fwd = _t1.set(-Math.sin(d.yaw), 0, -Math.cos(d.yaw));
      d.fallDir = fwd.dot(dir) < 0 ? 1 : -1;
      d.mats.forEach(function (m) { m.emissive.setHex(0x000000); });
      Sound.kill();
      showHit('kill');
    }
  }
  function updateDummies(dt) {
    for (let i = 0; i < G.dummies.length; i++) {
      const d = G.dummies[i], sp = d.spot;
      if (d.dead) {
        d.deadT += dt;
        const p = Math.min(1, d.deadT / 0.5);
        d.group.rotation.x = p * 1.5 * d.fallDir;
        d.group.position.y = p * 0.12;
        if (d.deadT > 2.5) { d.dead = false; d.hp = 100; d.group.rotation.x = 0; d.group.position.y = 0; }
        continue;
      }
      if (sp.move) {
        const x = sp.x + Math.sin(G.time * sp.speed + sp.phase) * sp.amp;
        d.h.walkT += Math.abs(x - d.group.position.x) * 3.2;
        d.group.position.x = x;
        const sw = Math.sin(d.h.walkT) * 0.5;
        d.h.legL.rotation.x = sw; d.h.legR.rotation.x = -sw; d.h.kneeL.rotation.x = Math.max(0, -sw) * 1.2; d.h.kneeR.rotation.x = Math.max(0, sw) * 1.2;
      }
      if (d.hurtT > 0) {
        d.hurtT -= dt;
        if (d.hurtT <= 0) d.mats.forEach(function (m) { m.emissive.setHex(0x000000); });
      }
    }
  }

  function damageEnemy(e, dmg, part, point, dir, tag, melee) {
    if (e.dummy) { damageDummy(e, dmg, part, point, dir); return; }
    if (e.remote) { MPG.hitRemote(e, dmg, part, point, dir, melee); return; }
    if (e.dead) return;
    const mult = part === 'head' ? 2.5 : part === 'limb' ? 0.75 : 1;
    const dealt = Math.max(1, Math.min(Math.round(dmg * mult), Math.ceil(e.hp)));
    e.hp -= dmg * mult;
    e.alerted = true; e.lostT = 0; e.canSee = true;
    e.hurtT = 0.09;
    e.flinch = 1;
    e.h.mats.forEach(function (m) { m.emissive.setHex(0x550000); });
    e.lastHit.copy(point);
    e.barT = 3.5;
    const hpf = clamp(e.hp / e.maxHp, 0, 1);
    e.barFill.scale.x = Math.max(hpf, 0.001);
    e.barFill.position.x = -0.35 * (1 - hpf);
    const head = part === 'head';
    Match.addDamage(dealt);
    if (SET.dmgNumbers) UI.damageNumber(point, dealt, (head ? 'head' : '') + (e.hp <= 0 ? ' kill' : ''));
    bloodSpray(point, dir, head ? 36 : 12, head);
    if (head) { Sound.headshot(); Sound.flesh(); Sound.voice('Head shot!', false, 0.05, 0.62); headHitFx(point, dir); }
    else Sound.flesh();

    if (e.hp <= 0) {
      killEnemy(e, head, point, dir, tag, melee);
    } else {
      if (head) { showHit('head'); showHeadshotText(false); flashHead(false); }
      else showHit('');
      if (!head) Sound.hitMarker();
    }
  }

  function killEnemy(e, head, point, dir, tag, melee) {
    e.dead = true; e.deadT = 0;
    e.roll = rand(-0.5, 0.5);
    e.bar.visible = false; e.barT = 0;
    // fall away from where the shot came from (relative to facing)
    const fwd = _t1.set(-Math.sin(e.yaw), 0, -Math.cos(e.yaw));
    e.fallDir = fwd.dot(dir) < 0 ? 1 : -1;
    e.gun.userData.flash.visible = false;
    e.h.mats.forEach(function (m) { m.emissive.setHex(0x000000); });

    G.kills++;
    if (G.kills % 5 === 0 && G.grenades < 6) { G.grenades++; killFeed('+1 GRENADE', 'hs'); }
    if (head) G.headshots++;
    G.coins += e.reward + (head ? 50 : 0);
    recordKill(head);
    // a little ammo drop for every kill
    G.slots.forEach(function (id) {
      if (!id) return;
      const w = WEAPONS[id];
      if ((w.type === 'gun' || w.type === 'pistol') && G.ammo[id]) {
        G.ammo[id].reserve = Math.min(w.reserve * 2, G.ammo[id].reserve + Math.ceil(w.mag * 0.4));
      }
    });
    const kd = Math.hypot(e.group.position.x - G.pos.x, e.group.position.z - G.pos.z);
    const res = Match.kill({ head: head, dist: kd, melee: !!melee, backstab: tag === 'Backstab', kind: e.kind });
    if (SET.dmgNumbers) { _t3.copy(point); _t3.y += 0.45; UI.damageNumber(_t3, '+' + res.points, 'kill'); }
    handleMatchEvents(res.events);
    Sound.kill();
    Sound.killConfirm(head, res.mult);
    killFx(point, dir, head, res);
    showHit(head ? 'kill head' : 'kill');
    if (head) { showHeadshotText(true); flashHead(true); Sound.headshotKill(); headKillFx(e, point, dir); }
    killFeed('You eliminated ' + (e.kind === 'soldier' ? '' : e.kind.toUpperCase() + ' ') + e.name + (tag ? ' [' + tag + ']' : head ? ' [Headshot]' : ''), head || tag ? 'hs' : '');

    // helmet flies off on a headshot kill
    if (head && e.h.helmet && e.h.helmet.parent) {
      const hm = e.h.helmet;
      e.h.parts.splice(e.h.parts.indexOf(hm), 1);
      scene.attach(hm);
      hm.userData.enemy = null;
      G.debris.push({ mesh: hm, vel: new V3(rand(-2, 2), rand(3, 5), rand(-2, 2)).addScaledVector(dir, 3), ang: new V3(rand(-8, 8), 0, rand(-8, 8)), life: 10 });
    }
    // blood pool on the ground
    const gp = new V3(e.group.position.x, 0, e.group.position.z);
    addDecal(SHARED.bloodDecalGeo, SHARED.bloodDecal, gp, new V3(0, 1, 0), rand(0.9, 1.6), 40, 40);
    updateHUD(true);
  }

  /* big kill feedback: hit-stop, shock rings, blood chunks, flash + points text, slow-mo on multi-kills */
  function killFx(point, dir, head, res) {
    G.flourish = 0.75; G.flourishKind = (G.flourishKind + 1) % 2;
    if (SET.vfx <= 0) return;
    G.freezeT = Math.max(G.freezeT, head ? 0.09 : 0.05);
    G.punch = Math.max(G.punch, head ? 3.2 : 1.6);
    if (SET.shake) G.shake = Math.max(G.shake, head ? 0.03 : 0.015);
    const col = head ? 0xff2a2a : 0xffb347;
    addPulse(point, col, head ? 6.5 : 4.2, 0.5);
    addPulse(point, 0xffffff, head ? 3.5 : 2.2, 0.28);
    Fx.burst(point, col, head ? 4.5 : 3, 0.28);
    const n = vmul(head ? 16 : 10);
    for (let i = 0; i < n; i++) {
      const v = new V3(rand(-1, 1), rand(0.2, 1.2), rand(-1, 1)).multiplyScalar(rand(2, 5)).addScaledVector(dir, rand(3, 8));
      addParticle(SHARED.blood[i % 3], rand(0.04, 0.1), point, v, rand(0.5, 1.1), 16, true);
    }
    Fx.puff(point, _t1.set(0, 1, 0), 0x6a0a0a, 4, 1.6, 0.8);
    let multi = false;
    for (let i = 0; i < res.events.length; i++) if (res.events[i].type === 'multi') multi = true;
    if (multi || res.mult >= 1.75) G.slowT = Math.max(G.slowT, 0.45);
    UI.killFlash(head, res.points, res.mult);
  }

  function enemyPartList() {
    const list = [];
    for (let i = 0; i < G.enemies.length; i++) {
      const e = G.enemies[i];
      if (e.dead) continue;
      for (let j = 0; j < e.parts.length; j++) list.push(e.parts[j]);
    }
    for (let i = 0; i < G.dummies.length; i++) {
      const d = G.dummies[i];
      if (d.dead) continue;
      for (let j = 0; j < d.parts.length; j++) list.push(d.parts[j]);
    }
    if (G.mp) for (const id in G.remotes) {
      const r = G.remotes[id];
      if (r.dead || !r.vis) continue;
      for (let j = 0; j < r.parts.length; j++) list.push(r.parts[j]);
    }
    return list;
  }

  /* ------------------------------------------------------------
     firing
  ------------------------------------------------------------ */
  function muzzleWorld(out) {
    const m = G.pov === 0 ? viewModel : tppWeapon;
    if (m && m.userData.muzzle) {
      m.updateWorldMatrix(true, false);
      out.copy(m.userData.muzzle);
      m.localToWorld(out);
    } else camera.getWorldPosition(out);
    return out;
  }

  function currentSpread(w) {
    let s = lerp(w.spread, w.adsSpread, G.ads);
    s *= 1 + G.moveAmt * 0.9;
    s *= 1 - 0.3 * G.crouch;
    if (!G.onGround) s *= 2.5;
    return s + G.recoilSpread;
  }

  function fireGun(w) {
    G.lastShotT = G.time;
    if (G.mp && window.MP) MP.shoot(w.id);
    const a = curAmmo();
    a.mag--;
    G.nextFire = G.time + 60 / w.rpm;
    G.kick = 1; G.flashT = 0.05;
    Sound.shot(w.sfx, 1, 1, 0, 0);
    if (w.pumpSound) Sound.pump();
    Match.shotFired(); G._hitFlag = false;

    const origin = camera.getWorldPosition(_t1.set(0, 0, 0)).clone();
    const muzzle = muzzleWorld(new V3());
    if (flashLight) flashLight.position.copy(muzzle);
    fireFx(origin, muzzle, w);
    const spread = currentSpread(w);
    const hasScopeBlur = w.scope && G.ads < 0.8;
    for (let p = 0; p < w.pellets; p++) {
      const sp = hasScopeBlur ? spread * 3 : spread;
      const dir = new V3((Math.random() - 0.5) * 2 * sp, (Math.random() - 0.5) * 2 * sp, -1).normalize().applyQuaternion(camera.quaternion);
      shootRay(origin, dir, w, muzzle);
    }
    G.pitch += w.recoil * (0.6 + Math.random() * 0.8) * (1 - G.ads * 0.4);
    G.yaw += (Math.random() - 0.5) * w.recoil * 0.7;
    G.recoilSpread = Math.min(G.recoilSpread + w.recoil * 0.5, 0.05);
    if (a.mag <= 0) G.autoReload = 0.35;
    updateHUD(true);
  }

  function shootRay(origin, dir, w, muzzle) {
    raycaster.set(origin, dir);
    raycaster.near = 0.05;
    raycaster.far = w.range;
    const targets = enemyPartList().concat(world.shootables);
    const hits = raycaster.intersectObjects(targets, false);
    const hit = hits[0];
    const end = hit ? hit.point.clone() : origin.clone().addScaledVector(dir, Math.min(w.range, 150));
    addTracer(muzzle, end, SHARED.tracer, 0.05);
    if (!hit) return;
    const o = hit.object;
    if (o.userData.enemy) {
      if (!G._hitFlag) { G._hitFlag = true; Match.shotHit(0); }
      const fall = lerp(1, 0.55, clamp(hit.distance / w.range, 0, 1) * (w.pellets > 1 ? 2 : 1));
      damageEnemy(o.userData.enemy, w.dmg * clamp(fall, 0.3, 1), o.userData.part, hit.point, dir);
    } else {
      impactEffect(hit);
    }
  }

  function meleeAttack(w) {
    G.lastShotT = G.time;
    if (G.mp && window.MP) MP.shoot(w.id);
    G.nextFire = G.time + w.cooldown;
    G.meleeDur = Math.min(w.cooldown, w.type === 'knife' ? 0.32 : 0.5);
    G.meleeSwing = G.meleeDur;
    G.meleeDone = false;
    Sound.knife();
  }
  function applyMelee(w) {
    let hitAny = false;
    const fx = -Math.sin(G.yaw), fz = -Math.cos(G.yaw);
    const targets = G.enemies.concat(G.dummies, G.mp ? Object.keys(G.remotes).map(function (k) { return G.remotes[k]; }) : []);
    for (let i = 0; i < targets.length; i++) {
      const e = targets[i];
      if (e.dead || e.friendly || e.vis === false) continue;
      const dx = e.group.position.x - G.pos.x, dz = e.group.position.z - G.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > w.range + 0.4) continue;
      if ((dx * fx + dz * fz) / (d || 1) < 0.55) continue;
      const ex = -Math.sin(e.yaw), ez = -Math.cos(e.yaw);
      const behind = (ex * dx + ez * dz) / (d || 1) > 0.5;   // enemy is facing away from you
      let dmg = w.dmg, tag = null;
      if (behind && w.type === 'knife') { dmg *= 2; tag = 'Backstab'; }
      const point = new V3(e.group.position.x, 1.3, e.group.position.z);
      const dir = new V3(dx, 0, dz).normalize();
      damageEnemy(e, dmg, 'body', point, dir, tag, true);
      if (tag) { showHit('kill'); }
      hitAny = true;
    }
    if (hitAny) Sound.meleeHit();
  }

  let aimT = 0;
  function updateAim(dt) {
    aimT -= dt;
    if (aimT > 0) return;
    aimT = 0.1;
    const parts = enemyPartList();
    let head = false;
    if (parts.length) {
      _cdir.set(0, 0, -1).applyQuaternion(camera.quaternion);
      raycaster.set(camera.position, _cdir);
      raycaster.near = 0.05; raycaster.far = 140;
      const hits = raycaster.intersectObjects(parts.concat(world.blockers), false);
      head = hits.length > 0 && hits[0].object.userData.part === 'head' && !!hits[0].object.userData.enemy;
    }
    G.aimHead = head;
    HUD.cross.classList.toggle('head', head);
  }

  const _af = new V3(), _afd = new V3();
  function crosshairOnEnemy(w) {
    _af.copy(camera.position); _afd.set(-Math.sin(G.yaw) * Math.cos(G.pitch), Math.sin(G.pitch), -Math.cos(G.yaw) * Math.cos(G.pitch));
    raycaster.set(_af, _afd); raycaster.near = 0.05; raycaster.far = Math.min(w.range, 90);
    const hits = raycaster.intersectObjects(enemyPartList().concat(world.shootables), false);
    const en = hits[0] && hits[0].object.userData.enemy;
    return !!(en && !en.friendly && !en.dead);
  }
  function aimAssist(dt) {
    if (!SET.aimAssist || G.state !== 'playing') return;
    _af.copy(camera.position); _afd.set(-Math.sin(G.yaw) * Math.cos(G.pitch), Math.sin(G.pitch), -Math.cos(G.yaw) * Math.cos(G.pitch));
    let best = null, bd = 0.16;               // ~9 degree cone
    const aimList = G.mp ? Object.keys(G.remotes).map(function (k) { return G.remotes[k]; }).filter(function (r) { return !r.friendly && r.vis; }) : G.enemies;
    for (let i = 0; i < aimList.length; i++) {
      const e = aimList[i]; if (e.dead || !e.group) continue;
      const dx = e.group.position.x - _af.x, dy = e.group.position.y + 1.35 - _af.y, dz = e.group.position.z - _af.z;
      const d = Math.hypot(dx, dy, dz); if (d > 70 || d < 1) continue;
      const ang = Math.acos(clamp((dx * _afd.x + dy * _afd.y + dz * _afd.z) / d, -1, 1));
      if (ang < bd) { bd = ang; best = { dx: dx, dy: dy, dz: dz }; }
    }
    if (!best) return;
    const ty = Math.atan2(-best.dx, -best.dz), tp = Math.atan2(best.dy, Math.hypot(best.dx, best.dz));
    let dyaw = ty - G.yaw; while (dyaw > Math.PI) dyaw -= Math.PI * 2; while (dyaw < -Math.PI) dyaw += Math.PI * 2;
    const k = Math.min(1, dt * (TOUCH ? 6 : 3));
    G.yaw += dyaw * k; G.pitch = clamp(G.pitch + (tp - G.pitch) * k, -1.5, 1.5);
  }
  function updateWeapons(dt) {
    aimAssist(dt);
    const w = curWeapon();
    if (!w) return;
    // timers
    if (G.switching > 0) G.switching -= dt;
    if (G.reloading > 0) {
      G.reloading -= dt;
      if (G.reloading <= 0) { G.reloading = 0; finishReload(); }
    }
    G.recoilSpread = Math.max(0, G.recoilSpread - dt * 0.08);
    G.kick = Math.max(0, G.kick - dt * 9);
    if (G.autoReload > 0) {
      G.autoReload -= dt;
      if (G.autoReload <= 0) reload();
    }

    if (w.type === 'knife' || w.type === 'melee') {
      if (G.meleeSwing > 0) {
        G.meleeSwing -= dt;
        const prog = 1 - G.meleeSwing / G.meleeDur;
        if (!G.meleeDone && prog > 0.4) { G.meleeDone = true; applyMelee(w); }
        if (G.meleeSwing < 0) G.meleeSwing = 0;
      }
      if (G.fireHeld && G.time >= G.nextFire && G.switching <= 0 && G.meleeSwing <= 0) meleeAttack(w);
    } else {
      const a = curAmmo();
      let autoOn = false;
      if (SET.autoFire && G.reloading <= 0 && G.switching <= 0) autoOn = crosshairOnEnemy(w);
      const wantFire = autoOn || (w.auto ? G.fireHeld : G.firePressed);
      if (wantFire && G.reloading <= 0 && G.switching <= 0) {
        if (a.mag <= 0) {
          if (G.firePressed) { Sound.empty(); reload(); }
        } else if (G.time >= G.nextFire) {
          fireGun(w);
        }
      }
    }
    G.firePressed = false;

    // ADS
    const canAds = (w.type === 'gun' || w.type === 'pistol') && G.reloading <= 0 && G.switching <= 0;
    const target = G.adsHeld && canAds ? 1 : 0;
    G.ads += (target - G.ads) * Math.min(1, dt * 12);
    if (Math.abs(G.ads - target) < 0.005) G.ads = target;

    // muzzle flashes
    const fl = G.flashT > 0 && SET.vfx > 0;
    if (viewModel && viewModel.userData.flash) viewModel.userData.flash.visible = fl && G.pov === 0;
    if (tppWeapon && tppWeapon.userData.flash) tppWeapon.userData.flash.visible = fl && G.pov !== 0;
  }

  /* ------------------------------------------------------------
     player movement + camera
  ------------------------------------------------------------ */
  /* ------------------------------------------------------------
     v9: slide / dodge, climbing over cover, grenades
  ------------------------------------------------------------ */
  function startDodge(kind) {
    if (G.state !== 'playing' || G.slideCd > 0 || G.slideT > 0 || !G.onGround || G.mantle) return;
    const f = (down('forward') || keys.ArrowUp ? 1 : 0) - (down('back') || keys.ArrowDown ? 1 : 0);
    const r = (down('right') || keys.ArrowRight ? 1 : 0) - (down('left') || keys.ArrowLeft ? 1 : 0);
    let wx = -Math.sin(G.yaw) * f + Math.cos(G.yaw) * r;
    let wz = -Math.cos(G.yaw) * f - Math.sin(G.yaw) * r;
    const len = Math.hypot(wx, wz);
    if (len < 0.01) {
      if (kind === 'slide') { wx = -Math.sin(G.yaw); wz = -Math.cos(G.yaw); }
      else { wx = Math.sin(G.yaw); wz = Math.cos(G.yaw); }     // no direction held: dodge backwards
    } else { wx /= len; wz /= len; }
    G.slideDirX = wx; G.slideDirZ = wz;
    G.slideKind = kind;
    G.slideDur = G.slideT = kind === 'slide' ? 0.9 : 0.62;
    G.slideSpeed = kind === 'slide' ? 14 : 30;   // v12: dodge ~7m, slide ~7m
    G.slideI = kind === 'dodge' ? 0.4 : 0;               // bullets pass you for a moment while dodging
    G.slideCd = kind === 'dodge' ? 1.0 : 0.8;
    const side = wx * Math.cos(G.yaw) - wz * Math.sin(G.yaw);
    G.slideTilt = clamp(-side * 0.17, -0.17, 0.17);
    if (kind === 'dodge') { Sound.dodge(); if (G.mp && window.MP) MP.dodge(); } else Sound.slide();
    if (SET.vfx > 0) { Fx.dust(_t1.set(G.pos.x, G.pos.y + 0.05, G.pos.z), 0xb8a98a, 1.2); G.punch = Math.max(G.punch, 0); }
  }
  function findMantle() {
    const fx = -Math.sin(G.yaw), fz = -Math.cos(G.yaw);
    const px = G.pos.x + fx * (PLAYER_R + 0.5), pz = G.pos.z + fz * (PLAYER_R + 0.5);
    const bs = world.boxes;
    let best = null;
    for (let i = 0; i < bs.length; i++) {
      const b = bs[i];
      if (px <= b.minX || px >= b.maxX || pz <= b.minZ || pz >= b.maxZ) continue;
      const rise = b.maxY - G.pos.y;
      if (rise < 0.55 || rise > 1.85 || b.minY > G.pos.y + 0.6) continue;
      let ok = true;
      for (let j = 0; j < bs.length && ok; j++) {
        const o = bs[j];
        if (o === b) continue;
        if (px > o.minX - PLAYER_R && px < o.maxX + PLAYER_R && pz > o.minZ - PLAYER_R && pz < o.maxZ + PLAYER_R && o.minY < b.maxY + 1.8 && o.maxY > b.maxY + 0.05) ok = false;
      }
      if (ok && (!best || b.maxY > best.top)) best = { top: b.maxY, x: px, z: pz };
    }
    return best;
  }
  function startMantle(m) {
    G.mantle = { t: 0, dur: 0.55, x0: G.pos.x, y0: G.pos.y, z0: G.pos.z, x1: m.x, y1: m.top, z1: m.z };
    G.vx = 0; G.vz = 0; G.velY = 0; G.onGround = false; G.slideT = 0;
    Sound.mantle();
  }
  function updateMantle(dt) {
    const M = G.mantle;
    M.t += dt;
    const p = Math.min(1, M.t / M.dur);
    const up = Math.min(1, p / 0.6), fw = Math.max(0, (p - 0.3) / 0.7);
    const eu = 1 - (1 - up) * (1 - up);
    G.pos.y = M.y0 + (M.y1 - M.y0) * eu;
    G.pos.x = M.x0 + (M.x1 - M.x0) * fw;
    G.pos.z = M.z0 + (M.z1 - M.z0) * fw;
    G.landPitch = -0.1 * Math.sin(Math.PI * p);
    G.onGround = false; G.velY = 0;
    G.bob += dt * 5;
    if (p >= 1) { G.mantle = null; G.onGround = true; G.landDip = 0.09; G.jumpAnim = 0.4; }
  }

  const _gv = new V3();
  function throwGrenade() {
    if (G.mp) return;
    if (G.state !== 'playing' || G.grenades <= 0 || G.nadeCd > 0 || G.mantle) return;
    G.grenades--; G.nadeCd = 0.9; G.throwT = 0.4;
    const cp = Math.cos(G.pitch);
    const dx = -Math.sin(G.yaw) * cp, dy = Math.sin(G.pitch) + 0.2, dz = -Math.cos(G.yaw) * cp;
    const l = Math.hypot(dx, dy, dz);
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.11, 10), new THREE.MeshStandardMaterial({ color: 0x3d4a2a, roughness: 0.6, metalness: 0.3 }));
    const lever = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.1, 0.03), new THREE.MeshStandardMaterial({ color: 0x777777, roughness: 0.4, metalness: 0.7 }));
    lever.position.set(0.045, 0.02, 0);
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.018, 6, 6), new THREE.MeshBasicMaterial({ color: 0xff2a1a }));
    led.position.set(0, 0.07, 0);
    const grp = new THREE.Group();
    grp.add(body); grp.add(lever); grp.add(led);
    grp.position.set(G.pos.x - Math.sin(G.yaw) * 0.5, G.pos.y + EYE - 0.15 - 0.6 * G.crouch, G.pos.z - Math.cos(G.yaw) * 0.5);
    scene.add(grp);
    G.nades.push({ mesh: grp, led: led, x: grp.position.x, y: grp.position.y, z: grp.position.z,
      vx: dx / l * 15 + G.vx * 0.6, vy: dy / l * 15, vz: dz / l * 15 + G.vz * 0.6, fuse: 2.3, beep: 0 });
    Sound.grenadeThrow();
    if (typeof updateHUD === 'function') updateHUD(true);
  }
  function explodeGrenade(n) {
    scene.remove(n.mesh);
    const pos = _gv.set(n.x, n.y + 0.2, n.z);
    const R = 8.5;
    const dP = Math.hypot(G.pos.x - n.x, G.pos.y + 1 - n.y, G.pos.z - n.z);
    Sound.explosion(dP, panFor(n.x, n.z));
    if (SET.vfx > 0) {
      Fx.burst(pos, 0xffa040, 9, 0.5);
      Fx.burst(pos, 0xfff0c0, 4.5, 0.2);
      Fx.puff(pos, _t1.set(0, 1, 0), 0x2a2a2a, 16, 3.2, 1.2);
      Fx.dust(pos, 0x9a8f7a, 4);
      addPulse(pos, 0xffa040, R * 0.7, 0.55);
      addPulse(pos, 0xffffff, R * 0.4, 0.25);
      for (let i = 0; i < vmul(26); i++) {
        const v = new V3(rand(-1, 1), rand(0.3, 1.6), rand(-1, 1)).normalize().multiplyScalar(rand(4, 11));
        addParticle(SHARED.spark, 0.04, pos, v, rand(0.4, 0.9), 14, false);
      }
      if (!G.nadeLight) { G.nadeLight = new THREE.PointLight(0xffa550, 0, 30); scene.add(G.nadeLight); }
      G.nadeLight.position.copy(pos); G.nadeLight.intensity = 9;
    }
    if (SET.vfx > 0 && SET.shake) G.shake = Math.max(G.shake, 0.07 * clamp(1 - dP / 30, 0, 1));
    G.punch = Math.max(G.punch, 5 * clamp(1 - dP / 20, 0, 1));
    const list = G.enemies.concat(G.dummies || []);
    list.forEach(function (e) {
      if (e.dead) return;
      const ep = e.group.position;
      const d = Math.hypot(ep.x - n.x, ep.y + 1 - n.y, ep.z - n.z);
      if (d > R) return;
      const dmg = Math.round(210 * Math.pow(1 - d / R, 1.25));
      if (dmg < 4) return;
      const dir = new V3(ep.x - n.x, 0.4, ep.z - n.z).normalize();
      damageEnemy(e, dmg, 'body', new V3(ep.x, ep.y + 1.2, ep.z), dir, 'GRENADE', false);
    });
    if (dP < R && G.state === 'playing') {
      const dmg = Math.round(75 * Math.pow(1 - dP / R, 1.2));
      if (dmg > 0) damagePlayer(dmg, new V3(n.x, 0, n.z));
    }
  }
  function updateGrenades(dt) {
    G.nadeCd = Math.max(0, G.nadeCd - dt);
    G.throwT = Math.max(0, G.throwT - dt);
    if (G.nadeLight && G.nadeLight.intensity > 0) G.nadeLight.intensity = Math.max(0, G.nadeLight.intensity - dt * 40);
    for (let i = G.nades.length - 1; i >= 0; i--) {
      const n = G.nades[i];
      n.fuse -= dt;
      n.vy -= 18 * dt;
      n.x += n.vx * dt; n.y += n.vy * dt; n.z += n.vz * dt;
      const bs = world.boxes;
      for (let j = 0; j < bs.length; j++) {
        const b = bs[j];
        if (n.y < b.minY || n.y > b.maxY + 0.05) continue;
        if (n.x > b.minX - 0.1 && n.x < b.maxX + 0.1 && n.z > b.minZ - 0.1 && n.z < b.maxZ + 0.1) {
          if (n.y > b.maxY - 0.2 && n.vy <= 0) { n.y = b.maxY + 0.06; n.vy = -n.vy * 0.4; n.vx *= 0.7; n.vz *= 0.7; Sound.bounce(0.8, panFor(n.x, n.z)); continue; }
          const l = n.x - (b.minX - 0.1), r = (b.maxX + 0.1) - n.x, t = n.z - (b.minZ - 0.1), bt = (b.maxZ + 0.1) - n.z;
          const m = Math.min(l, r, t, bt);
          if (m === l) { n.x = b.minX - 0.1; n.vx = -Math.abs(n.vx) * 0.45; }
          else if (m === r) { n.x = b.maxX + 0.1; n.vx = Math.abs(n.vx) * 0.45; }
          else if (m === t) { n.z = b.minZ - 0.1; n.vz = -Math.abs(n.vz) * 0.45; }
          else { n.z = b.maxZ + 0.1; n.vz = Math.abs(n.vz) * 0.45; }
          n.vy *= 0.8;
          Sound.bounce(0.9, panFor(n.x, n.z));
        }
      }
      const lim = world.half - 0.6;
      if (Math.abs(n.x) > lim) { n.x = clamp(n.x, -lim, lim); n.vx *= -0.4; }
      if (Math.abs(n.z) > lim) { n.z = clamp(n.z, -lim, lim); n.vz *= -0.4; }
      const gy = groundAt(n.x, n.z, n.y + 0.4) + 0.06;
      if (n.y <= gy) {
        n.y = gy;
        if (n.vy < -1.5) Sound.bounce(clamp(-n.vy / 8, 0.3, 1), panFor(n.x, n.z));
        n.vy = n.vy < -1.5 ? -n.vy * 0.4 : 0;
        const fr = Math.max(0, 1 - dt * 5);
        n.vx *= fr; n.vz *= fr;
      }
      n.mesh.position.set(n.x, n.y, n.z);
      n.mesh.rotation.x += dt * (n.vy + 3) * 2; n.mesh.rotation.z += dt * (Math.abs(n.vx) + Math.abs(n.vz)) * 1.2;
      n.beep -= dt;
      if (n.beep <= 0) {
        n.beep = n.fuse < 0.8 ? 0.12 : 0.35;
        n.led.visible = !n.led.visible;
        if (n.led.visible) Sound.beep(panFor(n.x, n.z));
      }
      if (n.fuse <= 0) { explodeGrenade(n); G.nades.splice(i, 1); }
    }
  }

  function updatePlayer(dt) {
    const w = curWeapon();
    const f = (down('forward') || keys.ArrowUp ? 1 : 0) - (down('back') || keys.ArrowDown ? 1 : 0);
    const r = (down('right') || keys.ArrowRight ? 1 : 0) - (down('left') || keys.ArrowLeft ? 1 : 0);
    let wx = -Math.sin(G.yaw) * f + Math.cos(G.yaw) * r;
    let wz = -Math.cos(G.yaw) * f - Math.sin(G.yaw) * r;
    const len = Math.hypot(wx, wz);
    const moving = len > 0.01;
    if (moving) { wx /= len; wz /= len; }

    if (G.mantle) { updateMantle(dt); G.inTrain = inTrainingZone(G.pos.x, G.pos.z, 0); return; }
    G.slideCd = Math.max(0, G.slideCd - dt);
    G.slideI = Math.max(0, G.slideI - dt);
    G.jumpAnim = Math.max(0, G.jumpAnim - dt * 3);
    G.landPitch *= Math.max(0, 1 - dt * 7);
    G.crouch += (((down('crouch') || G.slideT > 0) ? 1 : 0) - G.crouch) * Math.min(1, dt * 10);
    const sprint = !!(G.slideT <= 0 && (down('sprint') || (SET.bind.sprint === 'ShiftLeft' && keys.ShiftRight)) && f > 0 && G.ads < 0.3 && G.reloading <= 0 && G.crouch < 0.3);
    let speed = 5.2 * w.speed;
    if (sprint) speed *= 2.6;
    if (G.ads > 0.1) speed *= 1 - 0.4 * G.ads;
    speed *= 1 - 0.45 * G.crouch;

    // smooth acceleration / braking (keeps momentum a little in the air)
    if (G.slideT > 0) {
      G.slideT -= dt;
      const kk = Math.max(0, G.slideT / G.slideDur);
      const sp2 = G.slideSpeed * (G.slideKind === 'slide' ? (0.22 + 0.78 * kk) : (0.12 + 0.88 * kk * kk));
      G.vx = G.slideDirX * sp2; G.vz = G.slideDirZ * sp2;
      G.slideFx -= dt;
      if (G.slideFx <= 0 && SET.vfx > 0) {
        G.slideFx = 0.05;
        Fx.dust(_t1.set(G.pos.x, G.pos.y + 0.05, G.pos.z), world.def.dust, 1.3);
        const v = new V3(rand(-1, 1), rand(0.5, 1.5), rand(-1, 1)).addScaledVector(_t2.set(-G.slideDirX, 0, -G.slideDirZ), 2.5);
        addParticle(SHARED.spark, 0.025, _t1.set(G.pos.x, G.pos.y + 0.08, G.pos.z), v, 0.35, 14, false);
      }
      if (G.slideT <= 0) { G.slideT = 0; G.vx *= 0.45; G.vz *= 0.45; }
    } else if (G.onGround || moving) {
      const k = Math.min(1, dt * (G.onGround ? (moving ? 10 : 13) : 2.5));
      G.vx += ((moving ? wx * speed : 0) - G.vx) * k;
      G.vz += ((moving ? wz * speed : 0) - G.vz) * k;
    }
    const hv = Math.hypot(G.vx, G.vz);
    G.speedNow = hv;
    if (hv > 0.02) {
      G.pos.x += G.vx * dt;
      resolve(G.pos, PLAYER_R, 1.8);
      G.pos.z += G.vz * dt;
      resolve(G.pos, PLAYER_R, 1.8);
    }
    G.sprint += (((sprint && moving) ? 1 : 0) - G.sprint) * Math.min(1, dt * 8);
    G.slideAmt += ((G.slideT > 0 ? 1 : 0) - G.slideAmt) * Math.min(1, dt * 10);
    G.roll += ((-r * (sprint ? 1.4 : 1) * 0.014 * (G.onGround ? 1 : 0.5) + (G.slideT > 0 ? G.slideTilt : 0) + Math.sin(G.bob) * 0.006 * G.sprint * G.moveAmt) - G.roll) * Math.min(1, dt * 9);

    // jump (with a small input buffer + coyote time) / climb over low cover
    const jd = down('jump');
    if (jd && !G.jumpHeld) G.jumpBuf = 0.14;
    G.jumpHeld = jd;
    G.jumpBuf = Math.max(0, G.jumpBuf - dt);
    G.coyote = G.onGround ? 0.1 : Math.max(0, G.coyote - dt);
    if (G.jumpBuf > 0 && (G.crouch < 0.5 || G.slideT > 0)) {
      const mt = findMantle();
      if (mt) { startMantle(mt); G.jumpBuf = 0; G.inTrain = inTrainingZone(G.pos.x, G.pos.z, 0); return; }
      if (G.onGround || G.coyote > 0) {
        G.velY = 7.6; G.onGround = false; G.coyote = 0; G.jumpBuf = 0; G.slideT = 0; G.jumpAnim = 1;
        G.landPitch += 0.012;
        Sound.jump();
        if (SET.vfx > 0) Fx.dust(_t1.set(G.pos.x, G.pos.y + 0.05, G.pos.z), 0xb8a98a, 0.7);
      }
    }
    G.velY -= 22 * dt;
    G.pos.y += G.velY * dt;
    const gy = groundAt(G.pos.x, G.pos.z, G.pos.y);
    if (G.pos.y <= gy) {
      if (!G.onGround && G.velY < -5) {
        G.landDip = clamp(-G.velY * 0.012, 0, 0.14); Sound.land();
        G.landPitch -= clamp(-G.velY * 0.004, 0, 0.05); G.jumpAnim = 0.6;
        if (G.velY < -9) { G.vx *= 0.55; G.vz *= 0.55; }
        if (SET.vfx > 0) Fx.dust(_t1.set(G.pos.x, gy + 0.05, G.pos.z), 0xb8a98a, 1.1);
      }
      G.pos.y = gy; G.velY = 0; G.onGround = true;
    } else if (G.pos.y > gy + 0.05) {
      G.onGround = false;
    }
    resolve(G.pos, PLAYER_R, 1.8);
    G.landDip *= Math.max(0, 1 - dt * 6);

    const target = hv > 0.5 && G.onGround ? 1 : 0;
    G.moveAmt += (target - G.moveAmt) * Math.min(1, dt * 10);
    if (hv > 0.5 && G.onGround) {
      G.bob += dt * hv * 1.7;
      G.stepDist += hv * dt;
      if (G.stepDist > (G.sprint > 0.5 ? 2.6 : 2.0)) { G.stepDist = 0; if (G.crouch < 0.5) Sound.step(); if (G.sprint > 0.5 && SET.vfx > 0) Fx.dust(_t1.set(G.pos.x, G.pos.y + 0.05, G.pos.z), world.def.dust, 0.9); }
    }
    G.inTrain = inTrainingZone(G.pos.x, G.pos.z, 0);
  }

  const _off = new V3(), _eye = new V3(), _cdir = new V3();
  function updateCamera() {
    const w = curWeapon();
    const fovT = lerp(BASE_FOV + 7 * G.sprint + 9 * G.slideAmt + 2.5 * G.jumpAnim, w.adsFov, G.ads) - G.punch;
    if (Math.abs(camera.fov - fovT) > 0.01) { camera.fov = fovT; camera.updateProjectionMatrix(); }
    camera.rotation.set(G.pitch + G.landPitch, G.yaw, G.roll * (1 - G.ads * 0.8));
    if (G.shake > 0.0003 && SET.vfx > 0 && SET.shake) { camera.rotation.x += rand(-1, 1) * G.shake; camera.rotation.y += rand(-1, 1) * G.shake; }
    _eye.set(G.pos.x, G.pos.y + EYE - 0.6 * G.crouch - G.landDip, G.pos.z);
    if (G.pov === 0) {
      camera.position.copy(_eye);
      camera.position.y += Math.sin(G.bob * 2) * 0.025 * G.moveAmt * (1 - G.ads);
    } else {
      const p = POVS[G.pov];
      _off.set(p.shoulder * (1 - G.ads * 0.6), 0.25, p.dist * (1 - 0.35 * G.ads)).applyQuaternion(camera.quaternion);
      const len = _off.length();
      _cdir.copy(_off).normalize();
      raycaster.set(_eye, _cdir);
      raycaster.near = 0; raycaster.far = len + 0.3;
      const hs = raycaster.intersectObjects(world.blockers, false);
      let d = len;
      if (hs.length) d = Math.max(0.3, hs[0].distance - 0.3);
      camera.position.copy(_eye).addScaledVector(_cdir, d);
    }
    // world follows the player
    world.sky.position.copy(camera.position);
    world.sun.position.set(G.pos.x + world.sunOffset.x, world.sunOffset.y, G.pos.z + world.sunOffset.z);
    world.sun.target.position.set(G.pos.x, 0, G.pos.z);
  }

  function updateViewModel() {
    const w = curWeapon();
    const vis = G.pov === 0 && !(w.scope && G.ads > 0.85);
    viewRoot.visible = vis;
    if (!vis) return;
    const a = G.ads;
    let x = lerp(w.vmHip[0], w.vmAds[0], a), y = lerp(w.vmHip[1], w.vmAds[1], a), z = lerp(w.vmHip[2], w.vmAds[2], a);
    let rx = 0, ry = 0, rz = 0;
    const idle = 1 - a * 0.8;
    x += Math.sin(G.time * 1.3) * 0.0025 * idle; y += Math.sin(G.time * 1.9) * 0.003 * idle;
    G.swayX *= Math.max(0, 1 - G.dt * 9); G.swayY *= Math.max(0, 1 - G.dt * 9);
    ry += clamp(G.swayX, -0.09, 0.09) * idle; rx += clamp(G.swayY, -0.07, 0.07) * idle;
    const mv = G.moveAmt * (1 - a * 0.85);
    x += Math.sin(G.bob) * 0.012 * mv * (1 + G.sprint * 1.2);
    y += Math.abs(Math.cos(G.bob)) * 0.012 * mv * (1 + G.sprint * 1.2);
    y -= G.landDip * 1.5;
    const sp = G.sprint * (1 - a);     // sprint pose: weapon lowered and angled
    y -= 0.05 * sp; x += 0.03 * sp; rx -= 0.3 * sp; ry += 0.45 * sp;
    const gunLike = w.type === 'gun' || w.type === 'pistol';
    if (gunLike) {
      z += G.kick * 0.06; rx += G.kick * 0.07;
      if (G.reloading > 0) {
        const pr = 1 - G.reloading / G.reloadTotal, s = Math.sin(pr * Math.PI);
        y -= s * 0.16; rx -= s * 0.55; rz += s * 0.28; x -= s * 0.03;
      }
    } else {
      rx += w.type === 'melee' ? 0.5 : 0.15;
      if (G.meleeSwing > 0) {
        const p = 1 - G.meleeSwing / G.meleeDur, s = Math.sin(p * Math.PI);
        if (w.type === 'knife') { z -= s * 0.28; x -= s * 0.1; rx += s * 0.2; rz -= s * 0.3; }
        else { rz = lerp(0.9, -1.2, p); rx = 0.5 - s * 0.9; x -= s * 0.18; y += s * 0.05; }
      }
    }
    // v9: jump lift, airborne tilt, slide tilt, grenade throw
    const airV = G.onGround ? 0 : 1;
    y += G.jumpAnim * 0.03 + airV * 0.01; rx += airV * clamp(-G.velY * 0.012, -0.1, 0.12);
    if (G.slideAmt > 0.01) { rz -= G.slideTilt * 2.4 * G.slideAmt; y -= 0.04 * G.slideAmt; rx -= 0.22 * G.slideAmt; x += 0.02 * G.slideAmt; }
    if (G.throwT > 0) { const ts = Math.sin((1 - G.throwT / 0.4) * Math.PI); y -= 0.16 * ts; rx -= 0.55 * ts; z += 0.04 * ts; }
    if (G.mantle) { y -= 0.1; rx -= 0.3; }
    if (G.switching > 0) {
      const s = G.switching / SWITCH_TIME;
      y -= s * 0.35; rx -= s * 0.6;
    }
    const fl = G.flourish > 0;
    viewArms.userData.fore.forEach(function (m) { m.visible = !fl; });
    if (fl) viewArms.userData.left.forEach(function (m) { m.visible = false; });
    else if (w.type === 'gun') viewArms.userData.left.forEach(function (m) { m.visible = true; });
    if (G.flourish > 0) {
      G.flourish = Math.max(0, G.flourish - G.dt);
      const p = 1 - G.flourish / 0.75, e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2, lift = Math.sin(p * Math.PI);
      if (w.type === 'pistol') { rx -= e * Math.PI * 2; y += lift * 0.05; z += lift * 0.03; }
      else if (gunLike) { rz += e * Math.PI * 2 * (G.flourishKind ? 1 : -1); y += lift * 0.03; }
      else { rx -= e * Math.PI * 2; }
    }
    viewRoot.position.set(x, y, z);
    viewRoot.rotation.set(rx, ry, rz);
    viewArms.visible = gunLike;
  }

  function updatePlayerModel(dt) {
    const m = player;
    m.group.visible = G.pov !== 0 && G.state !== 'dead';
    m.group.position.copy(G.pos);
    m.group.rotation.y = G.yaw;
    m.group.scale.y = 1 - 0.2 * G.crouch;
    if (!m.group.visible) return;
    const w = curWeapon();
    const gunLike = w.type === 'gun' || w.type === 'pistol';
    m.walkT += dt * G.speedNow * 1.6 * (G.moveAmt > 0.1 ? 1 : 0);
    const sw = Math.sin(m.walkT) * 0.65 * G.moveAmt;
    const air = G.onGround ? 0 : 1;
    const sl = G.slideT > 0 ? 1 : 0;
    m.legL.rotation.x = sw * (1 - air) - air * 0.7 - sl * 1.1; m.legR.rotation.x = -sw * (1 - air) + air * 0.35 - sl * 0.2;
    m.kneeL.rotation.x = Math.max(0, -sw) * 1.3 * (1 - air) + air * 1.2 + sl * 0.3 + G.crouch * 1.2;
    m.kneeR.rotation.x = Math.max(0, sw) * 1.3 * (1 - air) + air * 0.6 + sl * 1.5 + G.crouch * 1.2;
    if (gunLike) {
      poseArms(m, 1.3 + G.pitch, -0.4, 0.2 + G.kick * 0.3, 1.35 + G.pitch, 0.65, 0.25, -1.3);
      if (tppWeapon) tppWeapon.position.z = -0.1 + G.kick * 0.05;
    } else {
      let swing = 0;
      if (G.meleeSwing > 0) { const p = 1 - G.meleeSwing / G.meleeDur, swing_ = Math.sin(p * Math.PI) * (w.type === 'knife' ? 1.0 : 2.2); swing = swing_; }
      poseArms(m, 0.5 + swing, -0.15, 0.3, 0, 0.1, 0.2, -0.5 - swing);
    }
    if (m.glb) {
      m.glb.update(dt, { spd: G.onGround ? G.speedNow : 0, aim: gunLike ? 1 : 0, recoil: G.kick, pitch: gunLike ? G.pitch * 0.6 : 0 });
      m.group.rotation.x = 0.4 * sl - 0.22 * G.sprint + (G.onGround ? 0 : 0.08);
    }
    m.torso.rotation.x = -0.12 * G.sprint;
  }

  /* ------------------------------------------------------------
     heal pads / vending hint / world animation
  ------------------------------------------------------------ */
  function updateHeal(dt) {
    let on = false;
    for (let i = 0; i < world.healSpots.length; i++) {
      const s = world.healSpots[i];
      if (Math.hypot(G.pos.x - s.x, G.pos.z - s.z) < s.r && G.pos.y < 1.5) { on = true; break; }
    }
    G.healing = on && G.hp < G.maxHp;
    if (G.healing) {
      G.hp = Math.min(G.maxHp, G.hp + 9 * dt);
      G.healTick -= dt;
      if (G.healTick <= 0) { Sound.heal(); G.healTick = 1.1; }
    }
    // hint text
    if (G.inTrain && !G.wasTrain) G.trainHintT = 4;
    G.wasTrain = G.inTrain;
    if (G.trainHintT > 0) G.trainHintT -= dt;
    let hint = '';
    if (G.healing) hint = 'Healing...';
    else if (G.trainHintT > 0) hint = 'TRAINING AREA - no enemies here, dummies respawn, kills are not scored';
    else if (nearVending()) hint = TOUCH ? '' : 'Press E to open the weapon vending machine';
    if (hint) { setText(HUD.hint, hint); if (!G.hintOn) { HUD.hint.classList.add('on'); G.hintOn = true; } }
    else if (G.hintOn) { HUD.hint.classList.remove('on'); G.hintOn = false; }
  }

  /* ------------------------------------------------------------
     HUD
  ------------------------------------------------------------ */
  let miniSkip = 0;
  function drawMinimap() {
    if (!SET.hud.minimap) return;
    if (IS_PHONE && (miniSkip++ % 3)) return;
    const c = miniCtx, S = 150, scale = 1.0;
    c.clearRect(0, 0, S, S);
    c.save();
    c.beginPath(); c.arc(S / 2, S / 2, S / 2 - 1, 0, Math.PI * 2); c.clip();
    c.translate(S / 2, S / 2);
    c.rotate(G.yaw);
    c.translate(-G.pos.x * scale, -G.pos.z * scale);
    // map edge
    c.strokeStyle = 'rgba(255,255,255,0.5)'; c.lineWidth = 2;
    c.strokeRect(-world.half * scale, -world.half * scale, world.half * 2 * scale, world.half * 2 * scale);
    // obstacles
    c.fillStyle = 'rgba(190,200,210,0.45)';
    for (let i = 0; i < world.boxes.length; i++) {
      const b = world.boxes[i];
      if (b.maxY - b.minY < 1 || b.minY > 2) continue;
      if (Math.abs(b.minX - G.pos.x) > 90 || Math.abs(b.minZ - G.pos.z) > 90) continue;
      c.fillRect(b.minX * scale, b.minZ * scale, (b.maxX - b.minX) * scale, (b.maxZ - b.minZ) * scale);
    }
    // training area
    if (world.training) {
      const T = world.training;
      c.fillStyle = 'rgba(80,170,255,0.14)'; c.strokeStyle = 'rgba(80,170,255,0.9)'; c.lineWidth = 2;
      c.beginPath(); c.arc(T.cx * scale, T.cz * scale, T.r * scale, 0, Math.PI * 2); c.fill(); c.stroke();
    }
    // heal pads
    c.fillStyle = 'rgba(61,220,107,0.85)';
    world.healSpots.forEach(function (s) { c.beginPath(); c.arc(s.x * scale, s.z * scale, 4, 0, Math.PI * 2); c.fill(); });
    // vending machines
    c.fillStyle = '#ffc14d';
    world.vending.forEach(function (s) { c.fillRect(s.x * scale - 3, s.z * scale - 3, 6, 6); });
    // enemies
    c.fillStyle = '#ff3b3b';
    G.enemies.forEach(function (e) {
      if (e.dead) return;
      if (Math.hypot(e.group.position.x - G.pos.x, e.group.position.z - G.pos.z) > 70) return;
      c.beginPath(); c.arc(e.group.position.x * scale, e.group.position.z * scale, 3, 0, Math.PI * 2); c.fill();
    });
    if (G.mp) {                                  // online: teammates (or everyone in FFA modes), flags and hill
      for (const id in G.remotes) {
        const r = G.remotes[id]; if (r.dead) continue;
        if (G.mp.teams && !r.friendly) continue;
        c.fillStyle = G.mp.teams ? (r.team === 'red' ? '#ff6a5e' : '#5aa4ff') : '#ffb347';
        c.beginPath(); c.arc(r.group.position.x * scale, r.group.position.z * scale, 3.5, 0, Math.PI * 2); c.fill();
      }
      const L = G.mp.layout;
      if (G.mp.mode === 'koth') { c.strokeStyle = '#ffd24a'; c.lineWidth = 2; c.beginPath(); c.arc(L.hill.x * scale, L.hill.z * scale, L.hill.r * scale, 0, Math.PI * 2); c.stroke(); }
      if (G.mp.mode === 'ctf') ['red', 'blue'].forEach(function (t) {
        const f = MPG.snapObj && MPG.snapObj.flags ? MPG.snapObj.flags[t] : L.flags[t];
        c.fillStyle = t === 'red' ? '#ff4a3d' : '#3d8bff'; c.fillRect(f.x * scale - 4, f.z * scale - 4, 8, 8);
      });
    }
    c.restore();
    // player arrow (always up)
    c.fillStyle = '#ffffff';
    c.beginPath(); c.moveTo(S / 2, S / 2 - 7); c.lineTo(S / 2 + 5, S / 2 + 5); c.lineTo(S / 2 - 5, S / 2 + 5); c.closePath(); c.fill();
  }

  let lastBest = -1, lastTotal = -1;
  function updateHUD(force) {
    const w = curWeapon();
    UI.abilities({ dodge: G.slideCd > 0 ? 1 - G.slideCd / (G.slideKind === 'dodge' ? 1.8 : 1.0) : 1, nades: G.grenades, dodgeKey: keyName(SET.bind.dodge), nadeKey: keyName(SET.bind.grenade) });
    // health
    const hp = Math.max(0, Math.ceil(G.hp));
    setText(HUD.hpText, hp);
    HUD.hpFill.style.width = (G.hp / G.maxHp * 100) + '%';
    HUD.hpFill.className = (G.hp < 25 ? 'low' : G.hp < 55 ? 'mid' : '') + (G.healing ? ' heal' : '');
    // scores
    setText(HUD.kills, G.kills);
    setText(HUD.hs, G.headshots);
    setText(HUD.coins, G.coins);
    if (force || lastBest < 0) {
      const rec = myRecord();
      lastBest = Math.max(rec.best, G.kills); lastTotal = rec.total;
      setText(HUD.best, lastBest);
      setText(HUD.total, lastTotal);
    }
    // ammo
    if (w) {
      setText(HUD.ammoName, w.name.toUpperCase());
      if (w.type === 'gun' || w.type === 'pistol') {
        const a = curAmmo();
        setText(HUD.ammoMag, a.mag);
        setText(HUD.ammoRes, ' / ' + a.reserve);
      } else {
        setText(HUD.ammoMag, '--');
        setText(HUD.ammoRes, ' melee');
      }
    }
    // slots
    HUD.slots.forEach(function (el, i) {
      const id = G.slots[i];
      const span = el.querySelector('span');
      setText(span, id ? WEAPONS[id].name : '(empty)');
      el.classList.toggle('empty', !id);
      el.classList.toggle('active', i === G.cur);
    });
  }

  function updateHudEffects(dt) {
    // damage flash
    if (G.dmgFlash > 0) G.dmgFlash = Math.max(0, G.dmgFlash - dt * 1.6);
    const lowBoost = G.hp < 30 ? 0.25 + Math.sin(G.time * 5) * 0.08 : 0;
    HUD.vignette.style.opacity = Math.min(1, G.dmgFlash + lowBoost);
    if (G.dmgDirT > 0) { G.dmgDirT -= dt; HUD.dmgDir.style.opacity = clamp(G.dmgDirT, 0, 1); }
    if (G.hitT > 0) { G.hitT -= dt; if (G.hitT <= 0) HUD.hit.className = ''; }
    // reload bar
    if (G.reloading > 0) {
      HUD.reloadBar.classList.add('on');
      HUD.reloadBar.firstElementChild.style.width = ((1 - G.reloading / G.reloadTotal) * 100) + '%';
    } else HUD.reloadBar.classList.remove('on');
    // scope + crosshair
    const w = curWeapon();
    const scoped = w.scope && G.ads > 0.85 && G.pov === 0;
    HUD.scope.classList.toggle('on', !!scoped);
    HUD.cross.style.display = scoped || (G.ads > 0.9 && w.scope) ? 'none' : 'block';
    const gap = 5 + currentSpread(w.type === 'gun' || w.type === 'pistol' ? w : { spread: 0.01, adsSpread: 0.01 }) * 650;
    HUD.cross.style.setProperty('--gap', gap.toFixed(1) + 'px');
    drawMinimap();
    updateHUD(false);
  }

  /* ------------------------------------------------------------
     main loop
  ------------------------------------------------------------ */
  let lastT = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    const rawDt = Math.min(0.05, (now - lastT) / 1000);
    lastT = now;
    UI.frameTick(SET.fps);
    if (!scene) return;
    if (G.slowT > 0) G.slowT -= rawDt;
    let dt = G.slowT > 0 ? rawDt * 0.3 : rawDt;     // headshot kills play in slow motion
    if (G.freezeT > 0) { G.freezeT -= rawDt; dt *= 0.04; }   // tiny hit-stop on every kill
    G.dt = dt; G.rawDt = rawDt; G.stepBudget = 3;

    if (G.state === 'playing') {
      G.time += dt;
      updatePlayer(dt);
      updateCamera();
      updateViewModel();
      camera.updateMatrixWorld(true);
      updatePlayerModel(dt);
      player.group.updateMatrixWorld(true);
      updateWeapons(dt);
      updateAim(rawDt);
      updateEnemies(dt);
      updateDummies(dt);
      if (!G.mp) updateSpawner(dt);
      updateGrenades(dt);
      updateEffects(dt);
      Fx.update(dt, G.time);
      updateHeal(dt);
      world.anim.forEach(function (fn) { fn(G.time); });
      if (!G.mp) updateMatch(dt); else MPG.update(dt);
      updateHudEffects(dt);
    } else if (G.state === 'timeup') {
      G.time += dt;
      updateGrenades(dt);
      updateEnemies(dt);
      updateEffects(dt);
      Fx.update(dt, G.time);
      G.endT -= rawDt;
      if (G.endT <= 0) endMatch('time');
      updateHudEffects(dt);
    } else if (G.state === 'mpend') {
      G.time += dt;
      MPG.update(dt);
      updateEffects(dt);
      Fx.update(dt, G.time);
    } else if (G.state === 'dead') {
      G.time += dt;
      if (G.mp) MPG.update(dt);
      updateEnemies(dt);
      updateEffects(dt);
      Fx.update(dt, G.time);
      if (!G.timeUp) {
        G.pitch += (0.25 - G.pitch) * dt * 2;
        camera.position.y += (0.5 - camera.position.y) * dt * 3;
      }
      updateHudEffects(dt);
    }
    renderer.render(scene, camera);
  }

  /* ------------------------------------------------------------
     input
  ------------------------------------------------------------ */
  document.addEventListener('keydown', function (e) {
    if (rebind) {                                   // waiting for a new key in Settings > Controls
      e.preventDefault();
      if (e.code !== 'Escape') applyRebind(e.code);
      rebind = null;
      renderSettings();
      return;
    }
    if (e.target && e.target.tagName === 'INPUT') return;
    keys[e.code] = true;
    const act = actionFor(e.code);
    if (G.state === 'playing') {
      if (act === 'jump' || e.code === 'Tab' || e.code.indexOf('Arrow') === 0) e.preventDefault();
      if (e.code.indexOf('Digit') === 0) {
        const n = parseInt(e.code.slice(5), 10);
        if (n >= 1 && n <= 4) switchTo(n - 1);
      }
      switch (act) {
        case 'reload': reload(); break;
        case 'dodge': if (!e.repeat) startDodge('dodge'); break;
        case 'grenade': if (!e.repeat) throwGrenade(); break;
        case 'crouch': if (!e.repeat && G.sprint > 0.6 && G.onGround) startDodge('slide'); break;
        case 'swap': switchTo(G.lastSlot); break;
        case 'pov':
          G.pov = (G.pov + 1) % POVS.length;
          setText(HUD.pov, 'POV: ' + POVS[G.pov].name + '  [' + keyName(SET.bind.pov) + ']');
          break;
        case 'store': openStore(); break;
        case 'use': if (nearVending()) openStore(); break;
        case 'settings': openSettings(); break;
      }
    } else if (G.state === 'store') {
      if (act === 'store') closeStore(true);
      else if (e.code === 'Escape') closeStore(false);
    }
  });
  document.addEventListener('keyup', function (e) { keys[e.code] = false; });

  document.addEventListener('mousedown', function (e) {
    if (G.state !== 'playing') return;
    if (e.button === 0) { G.fireHeld = true; G.firePressed = true; }
    if (e.button === 2) G.adsHeld = true;
  });
  document.addEventListener('mouseup', function (e) {
    if (e.button === 0) G.fireHeld = false;
    if (e.button === 2) G.adsHeld = false;
  });
  document.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  document.addEventListener('wheel', function (e) {
    if (G.state !== 'playing') return;
    cycleSlot(e.deltaY > 0 ? 1 : -1);
  }, { passive: true });
  document.addEventListener('mousemove', function (e) {
    if (G.state !== 'playing' || document.pointerLockElement !== canvas) return;
    const s = 0.0022 * (1 - 0.6 * G.ads) * G.sens;
    G.yaw -= e.movementX * s;
    G.pitch = clamp(G.pitch - e.movementY * s, -1.5, 1.5);
    G.swayX += e.movementX * 0.0007; G.swayY += e.movementY * 0.0006;
  });
  document.addEventListener('pointerlockchange', function () {
    if (!TOUCH && document.pointerLockElement !== canvas && G.state === 'playing') pauseGame();
  });
  document.addEventListener('pointerlockerror', function () {
    if (!TOUCH && G.state === 'playing') pauseGame();
  });
  window.addEventListener('blur', function () { if (!TOUCH && G.state === 'playing') pauseGame(); });
  window.addEventListener('resize', function () {
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  });




  /* ------------------------------------------------------------
     v14: ONLINE MULTIPLAYER bridge (the network + lobby UI lives in mp.js)
     Remote players, objectives (flags / hill), hit feedback, respawn.
  ------------------------------------------------------------ */
  const TEAM_COL = { red: 0xff4a3d, blue: 0x3d8bff };
  const TEAM_CSS = { red: '#ff6a5e', blue: '#5aa4ff' };
  const MPG = {
    objs: null, flags: {}, hillMesh: null, snapObj: null, myTeamCache: null,
    reserveZones: function () {
      const L = G.mp.layout, z = [];
      z.push({ x: L.hill.x, z: L.hill.z, r: L.hill.r + 3 });
      ['red', 'blue'].forEach(function (t) { z.push({ x: L.flags[t].x, z: L.flags[t].z, r: 7 }); });
      L.spawnsFFA.concat(L.spawnsRed, L.spawnsBlue).forEach(function (p) { z.push({ x: p[0], z: p[1], r: 3.2 }); });
      return z;
    },
    loadout: function () {
      const m = G.mp;
      G.slots = [null, null, null, null]; G.owned = {}; G.ammo = {}; G.cur = 0; G.lastSlot = 0;
      (m.mode === 'gungame' ? [m.startWeapon] : m.loadout).forEach(function (id) {
        const w = WEAPONS[id]; if (!w) return;
        G.owned[id] = true;
        const k = slotKind(w);
        G.slots[k === 'gun' ? (G.slots[0] ? 1 : 0) : k === 'side' ? 2 : 3] = id;
        G.ammo[id] = { mag: w.mag || 0, reserve: w.reserve || 0 };
      });
      G.cur = G.slots[0] ? 0 : G.slots[1] ? 1 : G.slots[2] ? 2 : 3;
      G.lastSlot = G.cur; G.flourish = 0; G.reloading = 0; G.switching = 0;
      rebuildHeld(); updateHUD(true);
    },
    afterBegin: function () {
      const m = G.mp;
      document.body.classList.add('mp-on');
      G.pos.set(m.spawn.x, 0, m.spawn.z); G.yaw = m.spawn.yaw; G.pitch = 0; G.grenades = 0; G.hp = 100;
      camera.position.set(G.pos.x, EYE, G.pos.z);
      m.players.forEach(function (p) { if (p.id !== m.selfId) MPG.addRemote(p); });
      MPG.buildObjectives();
      if (window.MP) MP.onBegin();
    },
    /* ---- remote players ---- */
    addRemote: function (p) {
      if (G.remotes[p.id]) return G.remotes[p.id];
      const ch = CHARS[p.char] || CHARS[0];
      const h = buildCharacter(ch.outfit, CHAR_TINT[p.char] != null ? CHAR_TINT[p.char] : 0xffffff);
      h.group.position.set(p.x || 0, 0, p.z || 0);
      h.group.rotation.y = p.yaw || 0;
      scene.add(h.group);
      const gunId = p.w || 'ak47';
      const gun = makeWeaponModel(gunId); gun.position.set(0, 0.09, -0.1); h.holder.add(gun);
      if (h.glb) { h.group.updateMatrixWorld(true); h.glb.update(0.016, { spd: 0, aim: 0 }); }
      const r = {
        remote: true, id: p.id, name: p.name, team: p.team, char: p.char, h: h, group: h.group, parts: h.parts, gun: gun, gunId: gunId,
        dead: false, deadT: 0, yaw: p.yaw || 0, tyaw: p.yaw || 0, tx: p.x || 0, tz: p.z || 0, ty: 0, pitch: 0, spd: 0, fl: 0, hp: 100,
        recoil: 0, flashT: 0, hurtT: 0, crouchAmt: 0, breath: Math.random() * 6, stepAcc: 0, deathStyle: Math.floor(Math.random() * 3), fallDir: 1, roll: 0,
        vis: true, friendly: !!(G.mp.teams && p.team && p.team === G.mp.myTeam), airAmt: 0, slideAmt: 0, spawnT: 0, lastX: p.x || 0, lastZ: p.z || 0, carrying: false, flagMesh: null
      };
      h.parts.forEach(function (m) { m.userData.enemy = r; });
      try {
        const col = G.mp.teams ? TEAM_CSS[p.team] : '#ffffff';
        if (!G.mp.teams || r.friendly) r.tag = MPG.makeTag(p.name, col);
        else r.tag = MPG.makeTag('', col);
        if (r.tag) h.group.add(r.tag);
      } catch (e) { r.tag = null; }
      G.remotes[p.id] = r;
      return r;
    },
    makeTag: function (name, color) {
      const cv = document.createElement('canvas'); cv.width = 256; cv.height = 64;
      const c = cv.getContext('2d');
      c.font = 'bold 30px sans-serif'; c.textAlign = 'center'; c.lineWidth = 6; c.strokeStyle = 'rgba(0,0,0,0.85)';
      if (name) { c.strokeText(name, 128, 40); c.fillStyle = color; c.fillText(name, 128, 40); }
      else { c.fillStyle = color; c.beginPath(); c.moveTo(114, 24); c.lineTo(142, 24); c.lineTo(128, 46); c.closePath(); c.fill(); }
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), transparent: true, depthTest: false, fog: false }));
      sp.scale.set(1.9, 0.48, 1); sp.position.y = 2.4; sp.renderOrder = 10;
      return sp;
    },
    removeRemote: function (id) {
      const r = G.remotes[id]; if (!r) return;
      scene.remove(r.group); delete G.remotes[id];
    },
    setWeapon: function (r, w) {
      if (!w || r.gunId === w || !WEAPONS[w]) return;
      while (r.h.holder.children.length) r.h.holder.remove(r.h.holder.children[0]);
      r.gun = makeWeaponModel(w); r.gun.position.set(0, 0.09, -0.1); r.h.holder.add(r.gun); r.gunId = w;
    },
    applySnap: function (snap) {
      MPG.snapObj = snap.o || null;
      for (let i = 0; i < snap.p.length; i++) {
        const q = snap.p[i], id = q[0];
        if (id === G.mp.selfId) continue;
        const r = G.remotes[id]; if (!r) continue;
        r.tx = q[1]; r.ty = q[2]; r.tz = q[3]; r.tyaw = q[4]; r.pitch = q[5]; r.spdT = q[6];
        const fl = q[7]; r.fl = fl; r.hp = q[8];
        if (q[9]) MPG.setWeapon(r, q[9]);
        const dead = !!(fl & 32);
        if (dead && !r.dead) MPG.remoteDie(r);
        else if (!dead && r.dead) MPG.remoteRespawn(r, r.tx, r.tz);
        const carry = !!(fl & 64);
        if (carry !== r.carrying) { r.carrying = carry; MPG.carryMesh(r); }
      }
    },
    carryMesh: function (r) {
      if (!r.carrying) { if (r.flagMesh) r.flagMesh.visible = false; return; }
      if (!r.flagMesh) {
        const g = new THREE.Group();
        const pole = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.5, 0.05), new THREE.MeshBasicMaterial({ color: 0xdddddd }));
        const cloth = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.45, 0.04), new THREE.MeshBasicMaterial({ color: 0xffffff }));
        cloth.position.set(0.35, 0.55, 0); g.add(pole); g.add(cloth); g.userData.cloth = cloth;
        g.position.set(0, 1.35, 0.3);
        r.h.group.add(g); r.flagMesh = g;
      }
      r.flagMesh.visible = true;
      r.flagMesh.userData.cloth.material.color.setHex(TEAM_COL[r.team === 'red' ? 'blue' : 'red']);
    },
    remoteDie: function (r) { r.dead = true; r.deadT = 0; r.fallDir = Math.random() < 0.5 ? 1 : -1; r.roll = rand(-0.5, 0.5); r.h.mats.forEach(function (m) { m.emissive.setHex(0x000000); }); },
    remoteRespawn: function (r, x, z) {
      r.dead = false; r.deadT = 0; r.group.visible = true; r.group.rotation.x = 0; r.group.rotation.z = 0; r.group.position.set(x, 0, z); r.tx = x; r.tz = z; r.spawnT = 0.5;
      r.h.torso.position.y = 0.92; r.h.head.rotation.x = 0;
    },
    remoteShot: function (id, w) {
      const r = G.remotes[id]; if (!r || r.dead) return;
      MPG.setWeapon(r, w);
      r.recoil = 1; r.flashT = 0.06;
      const wp = WEAPONS[w]; if (!wp || (wp.type !== 'gun' && wp.type !== 'pistol')) { r.recoil = 1; return; }
      try {
        if (r.gun.userData.flash) r.gun.userData.flash.visible = true;
        const muzzle = r.gun.userData.muzzle ? r.gun.userData.muzzle.clone() : new V3(0, 1.3, 0);
        r.gun.updateWorldMatrix(true, false); r.gun.localToWorld(muzzle);
        const dist = Math.hypot(G.pos.x - r.group.position.x, G.pos.z - r.group.position.z);
        const vol = clamp(1.1 - dist / 90, 0.12, 1);
        Sound.shot(wp.sfx, vol * 0.85, clamp(1 - dist / 140, 0.35, 1), panFor(r.group.position.x, r.group.position.z), dist);
        Fx.muzzle(muzzle, 0.8);
        const cp = Math.cos(r.pitch);
        const end = new V3(muzzle.x - Math.sin(r.yaw) * cp * 70, muzzle.y + Math.sin(r.pitch) * 70, muzzle.z - Math.cos(r.yaw) * cp * 70);
        addTracer(muzzle, end, SHARED.enemyTracer, 0.06);
      } catch (e) { /* cosmetic only */ }
    },
    hitRemote: function (r, dmg, part, point, dir, melee) {
      if (r.dead || r.friendly || !G.mp || G.state !== 'playing') return;
      const head = part === 'head';
      if (window.MP) MP.hit(r.id, part, curId());
      r.hurtT = 0.12; r.h.mats.forEach(function (m) { m.emissive.setHex(0x663300); });
      bloodSpray(point, dir, head ? 20 : 8, head);
      if (head) { Sound.headshot(); Sound.flesh(); headHitFx(point, dir); showHit('head'); flashHead(false); }
      else { Sound.flesh(); Sound.hitMarker(); showHit(''); }
      if (melee) Sound.meleeHit();
    },
    hitmark: function (d) {     // server-confirmed damage dealt by me
      const r = G.remotes[d.id]; if (!r) return;
      const pt = _t3.set(r.group.position.x, 1.5, r.group.position.z);
      if (SET.dmgNumbers) UI.damageNumber(pt, d.dmg, (d.head ? 'head' : '') + (d.kill ? ' kill' : ''));
      if (!d.kill) return;
      const dir = new V3(r.group.position.x - G.pos.x, 0.2, r.group.position.z - G.pos.z).normalize();
      const point = new V3(r.group.position.x, 1.3, r.group.position.z);
      G.kills++; if (d.head) G.headshots++;
      Sound.kill(); Sound.killConfirm(d.head, 1);
      killFx(point, dir, d.head, { events: [], mult: 1, points: d.pts || 100 });
      showHit(d.head ? 'kill head' : 'kill');
      if (d.head) { showHeadshotText(true); flashHead(true); Sound.headshotKill(); try { headKillFx(r, point, dir); } catch (e) {} }
      addDecal(SHARED.bloodDecalGeo, SHARED.bloodDecal, new V3(point.x, 0, point.z), new V3(0, 1, 0), rand(0.9, 1.6), 40, 40);
    },
    remoteKillFx: function (id, head) {        // somebody else got killed: blood + sound for spectators
      const r = G.remotes[id]; if (!r) return;
      const p = new V3(r.group.position.x, 1.3, r.group.position.z);
      bloodSpray(p, new V3(rand(-1, 1), 0.3, rand(-1, 1)).normalize(), head ? 24 : 12, head);
    },
    /* ---- me ---- */
    hurt: function (d) {
      G.hp = d.hp; G.dmgFlash = 1;
      if (SET.vfx > 0) { UI.hurt(); G.shake = Math.max(G.shake, 0.02); }
      Sound.hurt(panFor(d.x, d.z));
      const dx = d.x - G.pos.x, dz = d.z - G.pos.z, fx = -Math.sin(G.yaw), fz = -Math.cos(G.yaw), rx = Math.cos(G.yaw), rz = -Math.sin(G.yaw);
      HUD.dmgDir.style.transform = 'rotate(' + Math.atan2(dx * rx + dz * rz, dx * fx + dz * fz) + 'rad)'; G.dmgDirT = 1.2;
      updateHUD(true);
    },
    die: function () {
      if (G.state === 'dead') return;
      G.state = 'dead'; G.hp = 0; G.fireHeld = false; G.adsHeld = false; G.deaths = (G.deaths || 0) + 1;
      if (viewRoot) viewRoot.visible = false;
      UI.lowHp(false); Sound.hurt(0); updateHUD(true);
    },
    respawn: function (d) {
      G.state = 'playing'; G.mpPaused = false;
      G.hp = 100; G.pos.set(d.x, 0, d.z); G.velY = 0; G.onGround = true; G.vx = 0; G.vz = 0; G.yaw = d.yaw; G.pitch = 0;
      G.slideT = 0; G.slideI = 0; G.mantle = null; G.crouch = 0; G.ads = 0; G.reloading = 0; G.dmgFlash = 0;
      camera.position.set(G.pos.x, EYE, G.pos.z);
      MPG.loadout();
      if (d.w && G.mp.mode === 'gungame') MPG.gunGameWeapon(d.w, true);
      if (viewRoot) viewRoot.visible = true;
      updateHUD(true);
    },
    gunGameWeapon: function (w, silent) {
      G.mp.startWeapon = w;
      if (!silent) Sound.switchWeapon();
      MPG.loadout();
    },
    correct: function (d) { G.pos.set(d.x, G.pos.y, d.z); },
    /* ---- objectives ---- */
    buildObjectives: function () {
      const L = G.mp.layout, mode = G.mp.mode;
      MPG.flags = {}; MPG.hillMesh = null;
      const mat = function (c, o) { return new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, side: THREE.DoubleSide, fog: false, depthWrite: false }); };
      if (mode === 'koth') {
        const g = new THREE.Group(), R = L.hill.r;
        const ring = new THREE.Mesh(new THREE.RingGeometry(R - 0.5, R, 64), mat(0xffffff, 0.85)); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.1;
        const disc = new THREE.Mesh(new THREE.CircleGeometry(R, 64), mat(0xffffff, 0.12)); disc.rotation.x = -Math.PI / 2; disc.position.y = 0.06;
        const wall = new THREE.Mesh(new THREE.CylinderGeometry(R, R, 9, 48, 1, true), mat(0xffffff, 0.07)); wall.position.y = 4.5;
        g.add(ring); g.add(disc); g.add(wall); g.position.set(L.hill.x, 0, L.hill.z);
        scene.add(g); MPG.hillMesh = { g: g, ring: ring, disc: disc, wall: wall };
      }
      if (mode === 'ctf') {
        ['red', 'blue'].forEach(function (t) {
          const g = new THREE.Group(), col = TEAM_COL[t];
          const base = new THREE.Mesh(new THREE.CircleGeometry(2.6, 32), mat(col, 0.35)); base.rotation.x = -Math.PI / 2; base.position.y = 0.07;
          const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 4.2, 8), new THREE.MeshBasicMaterial({ color: 0xd8d8d8 })); pole.position.y = 2.1;
          const cloth = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.95, 0.05), new THREE.MeshBasicMaterial({ color: col })); cloth.position.set(0.8, 3.6, 0);
          const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 60, 12, 1, true), mat(col, 0.22)); beam.position.y = 30;
          const flag = new THREE.Group(); flag.add(pole); flag.add(cloth); flag.add(beam);
          const bg = new THREE.Group(); bg.add(base); bg.position.set(L.flags[t].x, 0, L.flags[t].z);
          flag.position.set(L.flags[t].x, 0, L.flags[t].z);
          scene.add(bg); scene.add(flag);
          MPG.flags[t] = { flag: flag, cloth: cloth, base: bg };
        });
      }
    },
    update: function (dt) {
      // remote players
      const k = 1 - Math.exp(-dt * 14);
      for (const id in G.remotes) MPG.updateRemote(G.remotes[id], dt, k);
      // objectives
      const o = MPG.snapObj, t = G.time;
      if (MPG.hillMesh) {
        const owner = o && o.hill ? o.hill.owner : null;
        const col = owner === 'red' ? TEAM_COL.red : owner === 'blue' ? TEAM_COL.blue : owner === 'contested' ? 0xffd24a : 0xffffff;
        const h = MPG.hillMesh; h.ring.material.color.setHex(col); h.disc.material.color.setHex(col); h.wall.material.color.setHex(col);
        h.disc.material.opacity = 0.12 + Math.sin(t * 3) * 0.04;
      }
      if (o && o.flags) {
        ['red', 'blue'].forEach(function (tm) {
          const f = MPG.flags[tm], d = o.flags[tm]; if (!f || !d) return;
          f.flag.visible = d.s !== 'carried';
          f.flag.position.x += (d.x - f.flag.position.x) * Math.min(1, dt * 12); f.flag.position.z += (d.z - f.flag.position.z) * Math.min(1, dt * 12);
          f.cloth.rotation.y = Math.sin(t * 4 + (tm === 'red' ? 0 : 1.7)) * 0.3;
        });
      }
    },
    updateRemote: function (r, dt, k) {
      const h = r.h, pos = r.group.position;
      if (r.dead) {
        r.deadT += dt;
        const p = Math.min(1, r.deadT / (r.deathStyle === 2 ? 0.8 : 0.55)), q = p * p * (3 - 2 * p);
        r.group.rotation.order = 'XYZ';
        if (r.deathStyle === 0) { r.group.rotation.x = q * 1.5 * r.fallDir; r.group.rotation.z = q * r.roll; h.armR.rotation.x = 1.3 - q * 2.4; h.armL.rotation.x = 1.35 - q * 2.2; }
        else if (r.deathStyle === 1) { r.group.rotation.z = q * 1.45 * (r.roll >= 0 ? 1 : -1); r.group.rotation.x = q * 0.4 * r.fallDir; h.armR.rotation.x = 1.3 - q * 1.6; }
        else { const kk = Math.min(1, p * 2.2); h.kneeL.rotation.x = kk * 1.9; h.kneeR.rotation.x = kk * 1.9; h.torso.position.y = 0.92 - kk * 0.45; r.group.rotation.x = Math.max(0, p - 0.35) / 0.65 * -1.45 * r.fallDir; }
        pos.y = p * 0.12;
        if (h.glb && !h.glb.frozen) h.glb.freeze();
        if (r.tag) r.tag.visible = false;
        if (r.deadT > 4) r.group.visible = false;
        return;
      }
      // smooth network movement
      pos.x += (r.tx - pos.x) * k; pos.z += (r.tz - pos.z) * k;
      const sp = Math.hypot(pos.x - r.lastX, pos.z - r.lastZ) / Math.max(dt, 1e-4);
      r.lastX = pos.x; r.lastZ = pos.z;
      r.spd += ((r.spdT != null ? r.spdT : sp) - r.spd) * Math.min(1, dt * 8);
      let dy = r.tyaw - r.yaw; while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2;
      r.yaw += dy * k;
      const crouch = (r.fl & 1) ? 1 : 0, air = (r.fl & 2) ? 1 : 0, slide = (r.fl & 4) ? 1 : 0, reloading = (r.fl & 16) ? 1 : 0;
      r.crouchAmt += (crouch - r.crouchAmt) * Math.min(1, dt * 10);
      r.airAmt += (air - r.airAmt) * Math.min(1, dt * 10);
      r.slideAmt += (slide - r.slideAmt) * Math.min(1, dt * 12);
      pos.y = Math.max(0, r.ty);
      if (r.spawnT > 0) { r.spawnT -= dt; const s = 0.75 + 0.25 * (1 - r.spawnT / 0.5); r.group.scale.set(s, s, s); if (r.spawnT <= 0) r.group.scale.set(1, 1, 1); }
      r.group.rotation.order = 'YXZ';
      r.group.rotation.y = r.yaw; r.group.rotation.x = -0.9 * r.slideAmt; r.group.rotation.z = 0;
      if (r.tag) { r.tag.visible = r.friendly || !G.mp.teams; if (r.tag.visible) { const d = Math.hypot(G.pos.x - pos.x, G.pos.z - pos.z); r.tag.visible = d < 60; } }
      h.walkT += dt * r.spd * 3.0;
      r.stepAcc += r.spd * dt;
      if (r.stepAcc > 2.3) {
        r.stepAcc = 0;
        const dist = Math.hypot(G.pos.x - pos.x, G.pos.z - pos.z);
        if (dist < 32 && G.stepBudget > 0 && !r.airAmt) { G.stepBudget--; Sound.step(clamp(1 - dist / 32, 0, 1) * 0.9, panFor(pos.x, pos.z)); }
        if (r.spd > 5 && dist < 45 && SET.vfx > 0) Fx.dust(_t1.set(pos.x, 0.05, pos.z), world.def.dust, 0.8);
      }
      const run = clamp(r.spd / 4.2, 0, 1.4);
      const sw = Math.sin(h.walkT) * 0.75 * Math.min(run, 1) * (1 - r.airAmt);
      const cr = r.crouchAmt * 0.55;
      h.legL.rotation.x = sw - cr - r.airAmt * 0.7; h.legR.rotation.x = -sw - cr + r.airAmt * 0.35;
      h.kneeL.rotation.x = Math.max(0, -sw) * 1.3 + cr * 1.9 + r.airAmt * 1.0; h.kneeR.rotation.x = Math.max(0, sw) * 1.3 + cr * 1.9 + r.airAmt * 0.4;
      r.breath += dt * 1.7;
      h.torso.position.y = 0.92 - r.crouchAmt * 0.3 + Math.abs(Math.sin(h.walkT)) * 0.04 * run + Math.sin(r.breath) * 0.006;
      h.torso.rotation.x = -0.1 * run - r.crouchAmt * 0.12; h.torso.rotation.z = Math.sin(h.walkT) * 0.04 * run; h.torso.rotation.y = Math.sin(h.walkT) * 0.07 * run;
      h.head.rotation.y = 0; h.head.rotation.x = -clamp(r.pitch, -1, 1) * 0.7;
      r.recoil = Math.max(0, r.recoil - dt * 8);
      const low = run > 0.9 ? 0.18 : 0;
      poseArms(h, 1.3 - low - reloading * 0.35 + r.recoil * 0.12 + clamp(r.pitch, -1, 1) * 0.25, -0.4, 0.2 + low * 1.2 + r.recoil * 0.35 + reloading * 0.5, 1.35 - low - reloading * 0.5, 0.65, 0.25 + low + reloading * 0.4, -1.3);
      r.gun.position.z = -0.1 + r.recoil * 0.05;
      if (h.glb) h.glb.update(dt, { spd: r.spd, aim: 1, recoil: r.recoil, crouch: r.crouchAmt, air: r.airAmt, reload: reloading, pitch: r.pitch });
      if (r.flashT > 0) { r.flashT -= dt; if (r.flashT <= 0 && r.gun.userData.flash) r.gun.userData.flash.visible = false; }
      if (r.hurtT > 0) { r.hurtT -= dt; if (r.hurtT <= 0) h.mats.forEach(function (m) { m.emissive.setHex(0x000000); }); }
      if (r.flagMesh && r.flagMesh.visible) r.flagMesh.userData.cloth.rotation.y = Math.sin(G.time * 5) * 0.3;
    },
    state: function () {
      const w = curId();
      const fl = (G.crouch > 0.5 ? 1 : 0) | (!G.onGround ? 2 : 0) | (G.slideT > 0 ? 4 : 0) | ((G.time - (G.lastShotT || -9) < 0.18) ? 8 : 0) | (G.reloading > 0 ? 16 : 0);
      return { x: G.pos.x, y: G.pos.y, z: G.pos.z, yaw: G.yaw, pitch: G.pitch, spd: G.speedNow || 0, fl: fl, w: w };
    },
    end: function () {
      G.state = 'mpend'; G.fireHeld = false; G.adsHeld = false;
      $('pause').classList.add('hidden'); $('store').classList.add('hidden');
      if (document.exitPointerLock) document.exitPointerLock();
      Sound.musicStop(); Sound.stopAmbient();
      HUD.root.classList.add('hidden');
      UI.lowHp(false);
    },
    exit: function () {
      G.mp = null; G.remotes = {}; G.mpPaused = false; MPG.objs = null; MPG.snapObj = null;
      document.body.classList.remove('mp-on');
      quitToMenu();
    }
  };
  window.SZ = {
    G: G, MPG: MPG, CHARS: CHARS, WEAPONS: WEAPONS, MAPS: MAPS,
    drawPreview: function (cv, idx) { drawSoldierPreview(cv, CHARS[idx].outfit); },
    killFeed: killFeed, banner: function (a, b, c) { UI.banner(a, b, c); },
    setChar: function (i) { SET.char = i; saveSettings(); },
    begin: function (cfg) {
      const me = cfg.players.find(function (p) { return p.id === cfg.selfId; }) || {};
      G.mp = Object.assign({ teams: !!(cfg.teamMode), myTeam: me.team || null, spawn: { x: me.x || 0, z: me.z || 0, yaw: me.yaw || 0 }, startWeapon: me.w || 'glock' }, cfg);
      G.mapIndex = cfg.mapIndex; SET.char = me.char != null ? me.char : SET.char;
      $('username').value = cfg.name || G.username;
      startGame();
    }
  };

  /* ------------------------------------------------------------
     v12: touch controls (joystick, look pad, buttons). Auto-fire does the shooting.
  ------------------------------------------------------------ */
  let TCAPI = null;                       // set by setupTouch; used by Settings > Controls on phones
  function setupTouch() {
    if (!TOUCH) return;
    const LKEY = 'strikezone_touch_layout';
    let L = { pos: {}, scale: 1, alpha: 1 };
    try { const r = JSON.parse(localStorage.getItem(LKEY) || 'null'); if (r && typeof r === 'object') { L.pos = r.pos || {}; L.scale = clamp(+r.scale || 1, 0.7, 1.6); L.alpha = clamp(+r.alpha || 1, 0.3, 1); } } catch (e) { /* ignore */ }
    function saveL() { try { localStorage.setItem(LKEY, JSON.stringify(L)); } catch (e) { /* ignore */ } }
    let editing = false;
    const css = document.createElement('style');
    css.textContent = '#tc{position:fixed;inset:0;z-index:30;pointer-events:none;touch-action:none;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none}#tc>div{position:absolute;pointer-events:auto;touch-action:none}'
      + '#tc-joy{left:4vw;bottom:8vh;width:130px;height:130px;border-radius:50%;background:rgba(255,255,255,.12);border:2px solid rgba(255,255,255,.3)}'
      + '#tc-knob{position:absolute;left:45px;top:45px;width:40px;height:40px;border-radius:50%;background:rgba(255,255,255,.45)}'
      + '#tc-look{right:0;top:0;width:55vw;height:100%}'
      + '.tc-b{width:54px;height:54px;border-radius:50%;background:rgba(0,0,0,.45);border:2px solid rgba(255,255,255,.4);color:#fff;font:700 11px sans-serif;display:flex;align-items:center;justify-content:center}'
      + '#tc>.tc-ctl{transform:scale(var(--tcs,1));opacity:var(--tca,1)}'
      + 'body.tc-editing .screen{display:none!important}'
      + 'body.tc-editing #tc-look{display:none}'
      + 'body.tc-editing .tc-ctl{outline:2px dashed #ffb02e;outline-offset:3px;background-color:rgba(255,176,46,.28)}'
      + '#tc-editbg{position:fixed;inset:0;z-index:29;display:none;background:rgba(8,12,18,.94);background-image:linear-gradient(rgba(255,255,255,.05) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.05) 1px,transparent 1px);background-size:40px 40px}'
      + 'body.tc-editing #tc-editbg{display:block}'
      + '#tc-edit{position:fixed;left:50%;top:max(8px,env(safe-area-inset-top));transform:translateX(-50%);z-index:40;display:none;gap:10px;align-items:center;flex-wrap:wrap;justify-content:center;background:rgba(0,0,0,.75);border:1px solid rgba(255,255,255,.25);border-radius:10px;padding:8px 12px;color:#fff;font:600 12px sans-serif;max-width:94vw}'
      + 'body.tc-editing #tc-edit{display:flex}'
      + '#tc-edit label{display:flex;align-items:center;gap:6px}#tc-edit input{width:90px}'
      + '#tc-edit button{font:700 12px sans-serif;padding:8px 12px;border-radius:6px;border:1px solid rgba(255,255,255,.4);background:#222;color:#fff}'
      + '#tc-edit button.go{background:#e8731a;border-color:#e8731a}'
      + '@media (hover:none) and (pointer:coarse){#fx-grain{display:none!important}#game-canvas{filter:none!important}}';   // phone speed: no animated grain / CSS colour filter on the 3D canvas
    document.head.appendChild(css);
    const root = document.createElement('div'); root.id = 'tc';
    root.innerHTML = '<div id="tc-look"></div><div id="tc-joy" class="tc-ctl" data-id="joy"><div id="tc-knob"></div></div>';
    document.body.appendChild(root);
    const bg = document.createElement('div'); bg.id = 'tc-editbg'; document.body.appendChild(bg);
    function show() { root.style.display = (G.state === 'playing' || editing) ? 'block' : 'none'; }
    setInterval(show, 250); show();
    function press(code, on) { if (!code) return; document.dispatchEvent(new KeyboardEvent(on ? 'keydown' : 'keyup', { code: code, bubbles: true })); }

    const els = { joy: $('tc-joy') };
    [['JUMP', 'jump', 'right:6vw;bottom:26vh'], ['DODGE', 'dodge', 'right:6vw;bottom:8vh'], ['RELOAD', 'reload', 'right:16vw;bottom:8vh'],
     ['NADE', 'grenade', 'right:16vw;bottom:26vh'], ['FIRE', null, 'right:26vw;bottom:14vh']].forEach(function (b) {
      const el = document.createElement('div'); el.className = 'tc-b tc-ctl'; el.textContent = b[0]; el.style.cssText = b[2]; el.setAttribute('data-id', b[0]);
      root.appendChild(el); els[b[0]] = el;
      el.addEventListener('touchstart', function (e) { e.preventDefault(); if (editing) return; if (b[1]) press(SET.bind[b[1]], true); else { G.fireHeld = true; G.firePressed = true; } }, { passive: false });
      el.addEventListener('touchend', function (e) { e.preventDefault(); if (editing) return; if (b[1]) press(SET.bind[b[1]], false); else G.fireHeld = false; }, { passive: false });
    });
    els.joy.setAttribute('data-id', 'joy');
    const base = {};                                       // original CSS positions, used by RESET
    Object.keys(els).forEach(function (k) { base[k] = els[k].style.cssText; });

    function applyLayout() {
      root.style.setProperty('--tcs', L.scale); root.style.setProperty('--tca', L.alpha);
      const W = window.innerWidth, H = window.innerHeight;
      Object.keys(els).forEach(function (k) {
        const el = els[k], p = L.pos[k];
        if (!p) { el.style.cssText = base[k]; return; }
        const w = el.offsetWidth || 54, h = el.offsetHeight || 54;
        el.style.right = 'auto'; el.style.bottom = 'auto';
        el.style.left = Math.round(clamp(p.x * W - w / 2, 0, W - w)) + 'px';
        el.style.top = Math.round(clamp(p.y * H - h / 2, 0, H - h)) + 'px';
      });
    }
    applyLayout();
    window.addEventListener('resize', applyLayout);
    window.addEventListener('orientationchange', function () { setTimeout(applyLayout, 300); });

    // ---- edit mode: drag every control where you want it ----
    const bar = document.createElement('div'); bar.id = 'tc-edit';
    bar.innerHTML = '<span>Drag a button to move it</span>'
      + '<label>Size <input id="tc-size" type="range" min="0.7" max="1.6" step="0.05"></label>'
      + '<label>See-through <input id="tc-alpha" type="range" min="0.3" max="1" step="0.05"></label>'
      + '<button id="tc-reset">RESET</button><button id="tc-done" class="go">DONE</button>';
    document.body.appendChild(bar);
    const drag = {};
    Object.keys(els).forEach(function (k) {
      const el = els[k];
      el.addEventListener('touchstart', function (e) {
        if (!editing) return; e.preventDefault(); e.stopPropagation();
        const t = e.changedTouches[0], r = el.getBoundingClientRect();
        drag[t.identifier] = { k: k, dx: t.clientX - (r.left + r.width / 2), dy: t.clientY - (r.top + r.height / 2) };
      }, { passive: false });
      el.addEventListener('touchmove', function (e) {
        if (!editing) return; e.preventDefault();
        for (let i = 0; i < e.changedTouches.length; i++) {
          const t = e.changedTouches[i], d = drag[t.identifier]; if (!d || d.k !== k) continue;
          const W = window.innerWidth, H = window.innerHeight;
          L.pos[k] = { x: clamp((t.clientX - d.dx) / W, 0.04, 0.96), y: clamp((t.clientY - d.dy) / H, 0.08, 0.96) };
          applyLayout();
        }
      }, { passive: false });
      const endDrag = function (e) { if (!editing) return; for (let i = 0; i < e.changedTouches.length; i++) delete drag[e.changedTouches[i].identifier]; saveL(); };
      el.addEventListener('touchend', endDrag); el.addEventListener('touchcancel', endDrag);
    });
    function setEdit(on) {
      editing = on;
      document.body.classList.toggle('tc-editing', on);
      $('tc-size').value = L.scale; $('tc-alpha').value = L.alpha;
      show(); applyLayout();
    }
    $('tc-size').addEventListener('input', function () { L.scale = parseFloat(this.value) || 1; applyLayout(); saveL(); });
    $('tc-alpha').addEventListener('input', function () { L.alpha = parseFloat(this.value) || 1; applyLayout(); saveL(); });
    $('tc-reset').addEventListener('click', function () { L = { pos: {}, scale: 1, alpha: 1 }; $('tc-size').value = 1; $('tc-alpha').value = 1; applyLayout(); saveL(); });
    $('tc-done').addEventListener('click', function () { setEdit(false); saveL(); $('settings').classList.remove('hidden'); renderSettings(); });
    TCAPI = { edit: function () { $('settings').classList.add('hidden'); setEdit(true); } };

    const joy = $('tc-joy'), knob = $('tc-knob'); let jid = null;
    function jmove(t) {
      const r = joy.getBoundingClientRect(), dx = t.clientX - (r.left + r.width / 2), dy = t.clientY - (r.top + r.height / 2), m = Math.min(1, Math.hypot(dx, dy) / (r.width * 0.46)), a = Math.atan2(dy, dx);
      const x = Math.cos(a) * m, y = Math.sin(a) * m;
      knob.style.transform = 'translate(' + x * 40 + 'px,' + y * 40 + 'px)';
      keys[SET.bind.left] = x < -0.3; keys[SET.bind.right] = x > 0.3; keys[SET.bind.forward] = y < -0.3; keys[SET.bind.back] = y > 0.3;
      keys[SET.bind.sprint] = y < -0.9;
    }
    function jend() { jid = null; knob.style.transform = ''; [SET.bind.left, SET.bind.right, SET.bind.forward, SET.bind.back, SET.bind.sprint].forEach(function (k) { keys[k] = false; }); }
    joy.addEventListener('touchstart', function (e) { if (editing) return; e.preventDefault(); jid = e.changedTouches[0].identifier; jmove(e.changedTouches[0]); }, { passive: false });
    joy.addEventListener('touchmove', function (e) { if (editing) return; e.preventDefault(); for (const t of e.changedTouches) if (t.identifier === jid) jmove(t); }, { passive: false });
    joy.addEventListener('touchend', jend); joy.addEventListener('touchcancel', jend);
    const look = $('tc-look'); let lid = null, lx = 0, ly = 0;
    look.addEventListener('touchstart', function (e) { const t = e.changedTouches[0]; lid = t.identifier; lx = t.clientX; ly = t.clientY; e.preventDefault(); }, { passive: false });
    look.addEventListener('touchmove', function (e) {
      e.preventDefault();
      for (const t of e.changedTouches) if (t.identifier === lid) {
        const s = 0.005 * G.sens * (1 - 0.5 * G.ads);
        G.yaw -= (t.clientX - lx) * s; G.pitch = clamp(G.pitch - (t.clientY - ly) * s, -1.5, 1.5); lx = t.clientX; ly = t.clientY;
      }
    }, { passive: false });
  }
  setupTouch();

  /* ------------------------------------------------------------
     character picker (menu)
  ------------------------------------------------------------ */
  function buildCharacters() {
    const list = $('char-list');
    list.innerHTML = '';
    CHARS.forEach(function (ch, i) {
      const card = document.createElement('div');
      card.className = 'char-card' + (i === SET.char ? ' selected' : '');
      const cv = document.createElement('canvas');
      cv.width = 110; cv.height = 150;
      drawSoldierPreview(cv, ch.outfit);
      const b = document.createElement('b'); b.textContent = ch.name;
      const sp = document.createElement('span'); sp.textContent = ch.role;
      card.appendChild(cv); card.appendChild(b); card.appendChild(sp);
      card.addEventListener('click', function () {
        SET.char = i; saveSettings();
        Array.prototype.forEach.call(list.children, function (c, j) { c.classList.toggle('selected', i === j); });
      });
      list.appendChild(card);
    });
  }

  /* ------------------------------------------------------------
     settings screen: audio, graphics/VFX, controls, HUD
  ------------------------------------------------------------ */
  let settingsTab = 'audio';
  let rebind = null;

  function applyHud() {
    const root = HUD.root;
    Object.keys(SET.hud).forEach(function (k) { root.classList.toggle('no-' + k, !SET.hud[k]); });
    root.style.setProperty('--hs', SET.hudScale);
    root.style.setProperty('--ho', SET.hudOpacity);
    root.style.setProperty('--cs', SET.crossSize);
    root.style.setProperty('--cross', SET.crossColor);
  }
  function applyVisual() {
    document.body.classList.toggle('no-vignette', !SET.vignette);
    document.body.classList.toggle('no-grain', !SET.grain);
    const id = (MAPS[G.mapIndex] || MAPS[0]).id;
    canvas.className = SET.grade ? 'grade-' + id : '';
  }
  function applySettings() {
    Sound.setVolume(SET.volume);
    Sound.setEnabled(SET.sound);
    Sound.setAmbientOn(SET.ambient);
    Sound.setVoiceOn(SET.voice);
    Sound.setSfxVolume(SET.sfxVol);
    Sound.setMusicVolume(SET.musicVol);
    Sound.setMusicOn(SET.music);
    Fx.setLevel(SET.vfx);
    Fx.setWeather(SET.weather);
    Fx.setClouds(SET.clouds);
    applyVisual();
    BASE_FOV = SET.fov;
    G.sens = SET.sens;
    $('sens').value = SET.sens;
    applyHud();
  }
  function applyRebind(code) {
    if (code.indexOf('Digit') === 0) return;           // 1-4 are always the weapon slots
    const a = rebind, old = SET.bind[a];
    const other = actionFor(code);
    if (other && other !== a) SET.bind[other] = old;   // swap with the action that had this key
    SET.bind[a] = code;
    saveSettings();
  }

  function mk(tag, cls, text) {
    const d = document.createElement(tag);
    if (cls) d.className = cls;
    if (text != null) d.textContent = text;
    return d;
  }
  function setRow(body, label) {
    const r = mk('div', 'set-row');
    r.appendChild(mk('label', '', label));
    body.appendChild(r);
    return r;
  }
  function addToggle(body, label, get, set) {
    const r = setRow(body, label);
    const b = mk('button', 'tog' + (get() ? ' on' : ''), get() ? 'ON' : 'OFF');
    b.addEventListener('click', function () {
      set(!get()); applySettings(); saveSettings();
      b.className = 'tog' + (get() ? ' on' : ''); b.textContent = get() ? 'ON' : 'OFF';
    });
    r.appendChild(b);
  }
  function addSlider(body, label, min, max, step, get, set, fmt) {
    const r = setRow(body, label);
    const wrap = mk('div', 'sl');
    const inp = document.createElement('input');
    inp.type = 'range'; inp.min = min; inp.max = max; inp.step = step; inp.value = get();
    const val = mk('span', 'val', fmt(get()));
    inp.addEventListener('input', function () {
      set(parseFloat(inp.value)); val.textContent = fmt(get()); applySettings(); saveSettings();
    });
    wrap.appendChild(inp); wrap.appendChild(val);
    r.appendChild(wrap);
  }
  function addSelect(body, label, opts, get, set) {
    const r = setRow(body, label);
    const sel = document.createElement('select');
    opts.forEach(function (o) {
      const op = document.createElement('option');
      op.value = o[0]; op.textContent = o[1];
      if (String(o[0]) === String(get())) op.selected = true;
      sel.appendChild(op);
    });
    sel.addEventListener('change', function () { set(sel.value); applySettings(); saveSettings(); });
    r.appendChild(sel);
  }

  function renderSettings() {
    Array.prototype.forEach.call(document.querySelectorAll('#settings-tabs .tab'), function (t) {
      t.classList.toggle('active', t.getAttribute('data-stab') === settingsTab);
    });
    const body = $('settings-body');
    body.innerHTML = '';
    if (settingsTab === 'audio') {
      addSlider(body, 'MASTER VOLUME', 0, 1, 0.05, function () { return SET.volume; }, function (v) { SET.volume = v; }, function (v) { return Math.round(v * 100) + '%'; });
      addToggle(body, 'SOUND EFFECTS (guns, hits, steps)', function () { return SET.sound; }, function (v) { SET.sound = v; });
      addToggle(body, 'AMBIENT SOUND (wind, birds)', function () { return SET.ambient; }, function (v) { SET.ambient = v; });
      addSlider(body, 'SOUND EFFECTS VOLUME', 0, 1, 0.05, function () { return SET.sfxVol; }, function (v) { SET.sfxVol = v; }, function (v) { return Math.round(v * 100) + '%'; });
      addToggle(body, 'MUSIC', function () { return SET.music; }, function (v) { SET.music = v; });
      addSlider(body, 'MUSIC VOLUME', 0, 1, 0.05, function () { return SET.musicVol; }, function (v) { SET.musicVol = v; }, function (v) { return Math.round(v * 100) + '%'; });
      addToggle(body, 'HEADSHOT VOICE ("Head shot!")', function () { return SET.voice; }, function (v) { SET.voice = v; });
      const r = setRow(body, 'TEST SOUNDS');
      const b1 = mk('button', 'keybtn', 'GUN'); b1.addEventListener('click', function () { Sound.init(); Sound.shot('rifle', 1, 1); });
      const b2 = mk('button', 'keybtn', 'HEADSHOT'); b2.addEventListener('click', function () { Sound.init(); Sound.headshotKill(); Sound.voice('Head shot!', true); });
      r.appendChild(b1); r.appendChild(b2);
      body.appendChild(mk('div', 'set-note', 'The headshot voice uses your browser\'s built-in text-to-speech voice.'));
    } else if (settingsTab === 'graphics') {
      addSelect(body, 'VFX (effects) QUALITY', VFX_NAMES.map(function (n, i) { return [i, n]; }),
        function () { return SET.vfx; }, function (v) { SET.vfx = clamp(parseInt(v, 10) || 0, 0, 3); });
      addSlider(body, 'FIELD OF VIEW', 60, 110, 1, function () { return SET.fov; }, function (v) { SET.fov = v; }, function (v) { return Math.round(v) + '°'; });
      addToggle(body, 'REALISTIC CHARACTER MODELS (animated soldiers)', function () { return SET.models; }, function (v) { SET.models = v; });
      body.appendChild(mk('div', 'set-note', 'Character models: ' + ({ ready: 'LOADED - enemies and your body use the realistic animated soldier (applies to enemies that spawn from now on, and your body at the next match).', loading: 'downloading...', offline: 'not available (' + Models.message() + ') - using the built-in soldiers.', idle: 'not started' }[Models.status()] || '')));
      addToggle(body, 'WEATHER PARTICLES (snow, dust, pollen)', function () { return SET.weather; }, function (v) { SET.weather = v; });
      addToggle(body, 'CLOUDS & SUN GLOW', function () { return SET.clouds; }, function (v) { SET.clouds = v; });
      addToggle(body, 'COLOR GRADING', function () { return SET.grade; }, function (v) { SET.grade = v; });
      addToggle(body, 'SCREEN VIGNETTE', function () { return SET.vignette; }, function (v) { SET.vignette = v; });
      addToggle(body, 'FILM GRAIN', function () { return SET.grain; }, function (v) { SET.grain = v; });
      addToggle(body, 'CAMERA SHAKE', function () { return SET.shake; }, function (v) { SET.shake = v; });
      addToggle(body, 'AUTO-FIRE ON ENEMY', function () { return SET.autoFire; }, function (v) { SET.autoFire = v; });
      addToggle(body, 'AIM ASSIST', function () { return SET.aimAssist; }, function (v) { SET.aimAssist = v; });
      addToggle(body, 'DAMAGE NUMBERS', function () { return SET.dmgNumbers; }, function (v) { SET.dmgNumbers = v; });
      addToggle(body, 'FPS COUNTER', function () { return SET.fps; }, function (v) { SET.fps = v; });
      body.appendChild(mk('div', 'set-note', 'Off = no particles, tracers, blood, decals or muzzle flash.  Normal = standard effects.  High = more blood and sparks, muzzle smoke, ejected shells, tracers, headshot ring flash, camera shake and slow-motion headshot kills.  Ultra = the most particles, extra smoke and stronger flashes. Weather, clouds and grading can be turned off separately if the game runs slowly.'));
      body.appendChild(mk('div', 'set-note', 'Shadows and resolution are chosen under GRAPHICS on the main menu and apply when a match starts.'));
    } else if (settingsTab === 'controls') {
      addSlider(body, TOUCH ? 'LOOK SENSITIVITY' : 'MOUSE SENSITIVITY', 0.3, 2.5, 0.1, function () { return SET.sens; }, function (v) { SET.sens = v; }, function (v) { return v.toFixed(1); });
      if (TOUCH) {
        const eb = mk('button', 'btn big', 'EDIT HUD LAYOUT'); eb.style.margin = '10px 0';
        eb.addEventListener('click', function () { if (TCAPI) TCAPI.edit(); });
        body.appendChild(eb);
        body.appendChild(mk('div', 'set-note', 'Opens an editor where you drag the joystick and the JUMP / DODGE / RELOAD / NADE / FIRE buttons anywhere you like, and change their size and see-through level. Drag the right side of the screen to look around.'));
        return;
      }   // phones: no keyboard key list
      ACTIONS.forEach(function (a) {
        const r = setRow(body, a[1].toUpperCase());
        const b = mk('button', 'keybtn' + (rebind === a[0] ? ' wait' : ''), rebind === a[0] ? 'PRESS A KEY...' : keyName(SET.bind[a[0]]));
        b.addEventListener('click', function () { rebind = a[0]; renderSettings(); });
        r.appendChild(b);
      });
      body.appendChild(mk('div', 'set-note', 'Click a key, then press the new key (Esc cancels). If the key is already used, the two actions swap. Weapon slots are always 1-4.'));
      const act = mk('div', 'set-actions');
      const reset = mk('button', 'btn small', 'RESET KEYS TO DEFAULT');
      reset.addEventListener('click', function () { SET.bind = Object.assign({}, DEFAULT_BIND); saveSettings(); renderSettings(); });
      act.appendChild(reset);
      body.appendChild(act);
    } else {
      [['minimap', 'MINIMAP'], ['topbar', 'SCORE BAR (wave, score, time)'], ['compass', 'COMPASS'], ['info', 'PLAYER NAME / MAP / POV TEXT'], ['stats', 'KILL & COIN COUNTERS'], ['killfeed', 'KILL FEED'],
       ['health', 'HEALTH BAR'], ['ammo', 'AMMO COUNTER'], ['slots', 'WEAPON SLOTS'], ['crosshair', 'CROSSHAIR']].forEach(function (h) {
        addToggle(body, h[1], function () { return SET.hud[h[0]]; }, function (v) { SET.hud[h[0]] = v; });
      });
      addSlider(body, 'HUD SIZE', 0.7, 1.4, 0.05, function () { return SET.hudScale; }, function (v) { SET.hudScale = v; }, function (v) { return Math.round(v * 100) + '%'; });
      addSlider(body, 'HUD OPACITY', 0.3, 1, 0.05, function () { return SET.hudOpacity; }, function (v) { SET.hudOpacity = v; }, function (v) { return Math.round(v * 100) + '%'; });
      addSlider(body, 'CROSSHAIR SIZE', 0.6, 2, 0.1, function () { return SET.crossSize; }, function (v) { SET.crossSize = v; }, function (v) { return v.toFixed(1) + 'x'; });
      addSelect(body, 'CROSSHAIR COLOR', [['#ffffff', 'White'], ['#3ddc6b', 'Green'], ['#00e5ff', 'Cyan'], ['#ffe14d', 'Yellow'], ['#ff4fd8', 'Pink']],
        function () { return SET.crossColor; }, function (v) { SET.crossColor = v; });
      body.appendChild(mk('div', 'set-note', 'The crosshair turns red while you are aiming at an enemy\'s head.'));
    }
  }
  function openSettings() {
    if (G.state === 'playing') {
      pauseGame();
      if (document.exitPointerLock) document.exitPointerLock();
    }
    renderSettings();
    $('settings').classList.remove('hidden');
  }
  function closeSettings() {
    rebind = null;
    saveSettings();
    $('settings').classList.add('hidden');
  }

  /* ------------------------------------------------------------
     buttons

  ------------------------------------------------------------ */
  $('btn-play').addEventListener('click', startGame);
  $('btn-resume').addEventListener('click', resumeGame);
  $('btn-quit').addEventListener('click', quitToMenu);
  $('btn-again').addEventListener('click', startGame);
  $('btn-menu').addEventListener('click', quitToMenu);
  $('store-close').addEventListener('click', function () { closeStore(true); });
  Array.prototype.forEach.call(document.querySelectorAll('#store-tabs .tab'), function (t) {
    t.addEventListener('click', function () { storeTab = t.getAttribute('data-tab'); renderStore(); });
  });
  $('username').addEventListener('keydown', function (e) { if (e.code === 'Enter') startGame(); });

  $('btn-settings').addEventListener('click', openSettings);
  $('btn-pause-settings').addEventListener('click', openSettings);
  $('settings-close').addEventListener('click', closeSettings);
  Array.prototype.forEach.call(document.querySelectorAll('#settings-tabs .tab'), function (t) {
    t.addEventListener('click', function () { rebind = null; settingsTab = t.getAttribute('data-stab'); renderSettings(); });
  });
  $('sens').addEventListener('input', function () { SET.sens = parseFloat($('sens').value) || 1; G.sens = SET.sens; saveSettings(); });

  G.getSet = function () { return SET; };
  G.damagePlayer = damagePlayer;
  loadSettings();
  buildMenu();
  UI.init();
  UI.setProjector(projector);
  Models.preload();
  document.body.classList.add('menu-open');
  $('username').addEventListener('input', function () { UI.renderProfile($('username').value.trim() || 'Player'); });
  applySettings();
  requestAnimationFrame(frame);
})();
