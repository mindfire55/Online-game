/* ===================== STRIKE ZONE - ui.js =====================
   Interface helpers (no game rules here):
     loading screen, top score bar, compass, kill/streak banners, medal pop-ups,
     floating damage numbers, scoreboard (hold Tab), FPS counter, profile/rank card,
     animated menu background, game-over screen, UI click/hover sounds.
   Needs the HTML in index.html + styles in style.css. Loaded after audio.js, match.js.
*/
const UI = (function () {
  const $ = function (id) { return document.getElementById(id); };
  const cache = new WeakMap();
  function setText(el, v) {
    if (!el) return;
    v = String(v);
    if (cache.get(el) !== v) { cache.set(el, v); el.textContent = v; }
  }
  function mk(tag, id, cls, parent, text) {
    const e = document.createElement(tag);
    if (id) e.id = id;
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    if (parent) parent.appendChild(e);
    return e;
  }
  const fmt = function (n) { return Math.round(n).toLocaleString('en-US'); };

  const TIPS = [
    'Headshots do 2.5x damage - aim for the head.',
    'Kill enemies quickly in a row to build a combo multiplier (up to x3).',
    'Glowing green pads slowly heal you. The map shows them on the minimap.',
    'Press B any time to open the weapon store. Coins come from kills.',
    'Crouch (C) while aiming to make your shots steadier.',
    'Sprinting widens your view but you cannot aim or reload while sprinting.',
    'Use the training area (blue circle on the minimap) to try new weapons safely.',
    'Knife attacks from behind do double damage.',
    'Heavy enemies are slow but tough. Scouts are fast and fragile.',
    'Every 10 kills starts a new wave with more enemies.',
    'Press O to open Settings - sound, effects, controls and HUD can all be changed.'
  ];

  let hud = null, E = {}, projector = null;
  let numCount = 0, fpsFrames = 0, fpsLast = performance.now(), fpsShown = 0;
  let menuBgOn = false, menuBgRaf = 0;

  /* ---------------------------------------------------------------
     build the extra HUD / overlay elements
  --------------------------------------------------------------- */
  function build() {
    hud = $('hud');

    // loading screen
    const ld = mk('div', 'loading', 'screen hidden', document.body);
    const box = mk('div', null, 'loading-box', ld);
    mk('div', null, 'loading-logo', box).innerHTML = 'STRIKE <span>ZONE</span>';
    E.loadMap = mk('div', 'loading-map', null, box, 'Loading...');
    const bar = mk('div', null, 'loading-bar', box);
    E.loadFill = mk('i', null, null, bar);
    E.loadTip = mk('div', 'loading-tip', null, box, '');
    E.loading = ld;

    // top bar
    const tb = mk('div', 'topbar', null, hud);
    const wv = mk('div', null, 'tb-wave', tb);
    mk('span', null, null, wv, 'WAVE');
    E.wave = mk('b', null, null, wv, '1');
    const sc = mk('div', null, 'tb-score', tb);
    mk('span', null, null, sc, 'SCORE');
    E.score = mk('b', null, null, sc, '0');
    const tm = mk('div', null, 'tb-time', tb);
    mk('span', null, null, tm, 'TIME LEFT');
    E.time = mk('b', null, null, tm, '2:00');
    E.timeCell = tm;
    const wp = mk('div', null, 'tb-wprog', tb);
    E.wprog = mk('i', null, null, wp);
    E.mult = mk('div', 'mult', null, tb, 'x1');
    E.multBar = mk('i', null, null, E.mult);
    E.topbar = tb;

    // compass
    const cp = mk('canvas', 'compass', null, hud);
    cp.width = 560; cp.height = 44;
    E.compass = cp;
    E.compassCtx = cp.getContext('2d');

    // banners / medals / damage numbers / fps
    E.banners = mk('div', 'banners', null, hud);
    E.medals = mk('div', 'medals', null, hud);
    E.nums = mk('div', 'dmg-layer', null, hud);
    E.fps = mk('div', 'fps', 'hidden', hud, '');

    // v11 effect layers: big countdown, kill flash, speed lines, hurt flash, time-up card, final-10 edge pulse
    E.timer = mk('div', 'timer', null, hud);
    E.timerNum = mk('b', null, null, E.timer, '10');
    mk('span', null, null, E.timer, 'SECONDS LEFT');
    E.kflash = mk('div', 'killflash', null, hud);
    E.kflashTxt = mk('span', null, null, E.kflash, '');
    E.speed = mk('div', 'speedlines', null, hud);
    E.hurtfx = mk('div', 'hurtflash', null, hud);
    E.f10 = mk('div', 'final10', null, hud);
    E.timeup = mk('div', 'timeup', null, hud);
    mk('b', null, null, E.timeup, "TIME'S UP");
    E.timeupSub = mk('span', null, null, E.timeup, '');

    // scoreboard
    const sb = mk('div', 'scoreboard', 'hidden', document.body);
    const sp = mk('div', null, 'panel sb-panel', sb);
    mk('h2', null, null, sp, 'MATCH STATS');
    E.sbBody = mk('div', 'sb-body', null, sp);
    mk('div', null, 'set-note', sp, 'Release the key to close');
    E.scoreboard = sb;

    // profile card in the main menu
    const menuPanel = document.querySelector('#menu .menu-panel');
    const tag = menuPanel && menuPanel.querySelector('.tag');
    if (menuPanel) {
      const pc = mk('div', 'profile-card');
      if (tag && tag.nextSibling) menuPanel.insertBefore(pc, tag.nextSibling); else menuPanel.appendChild(pc);
      E.profile = pc;
    }
    // animated background behind the menu
    const menu = $('menu');
    if (menu) {
      const bg = mk('canvas', 'menu-bg');
      menu.insertBefore(bg, menu.firstChild);
      E.menuBg = bg;
    }

    // sounds for every button
    document.addEventListener('click', function (e) {
      if (e.target.closest && e.target.closest('.btn, .tab, .map-card, .char-card, .keybtn, .tog')) Sound.uiClick();
    }, true);
    document.addEventListener('mouseover', function (e) {
      const t = e.target.closest && e.target.closest('.btn, .tab, .map-card, .char-card, .keybtn, .tog');
      if (t && !(e.relatedTarget && t.contains(e.relatedTarget))) Sound.uiHover();
    }, true);
  }

  /* ---------------------------------------------------------------
     loading screen
  --------------------------------------------------------------- */
  function showLoading(mapName) {
    setText(E.loadMap, 'Deploying to ' + mapName + '...');
    setText(E.loadTip, 'TIP: ' + TIPS[Math.floor(Math.random() * TIPS.length)]);
    E.loadFill.style.width = '5%';
    E.loading.classList.remove('hidden');
  }
  function loadingProgress(p) { E.loadFill.style.width = Math.round(Math.max(0, Math.min(1, p)) * 100) + '%'; }
  function hideLoading() { E.loading.classList.add('hidden'); }

  /* ---------------------------------------------------------------
     top bar + compass
  --------------------------------------------------------------- */
  function updateTop(d) {
    setText(E.wave, d.wave);
    setText(E.score, fmt(d.score));
    setText(E.time, d.time);
    if (E.timeCell) E.timeCell.className = 'tb-time' + (d.timeClass ? ' ' + d.timeClass : '');
    E.wprog.style.width = Math.round(d.waveProgress * 100) + '%';
    if (d.mult > 1.001) {
      E.mult.classList.add('on');
      setText(E.mult.firstChild, 'x' + d.mult.toFixed(2).replace(/0$/, ''));
      E.multBar.style.width = Math.round(d.comboFrac * 100) + '%';
    } else E.mult.classList.remove('on');
  }

  const COMPASS_LABELS = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' };
  function drawCompass(yaw, marks) {
    const c = E.compassCtx, W = E.compass.width, H = E.compass.height;
    const heading = (((-yaw * 180 / Math.PI) % 360) + 360) % 360;
    const ppd = 4.2;
    c.clearRect(0, 0, W, H);
    c.font = 'bold 15px Rajdhani, Segoe UI, Arial'; c.textAlign = 'center'; c.textBaseline = 'middle';
    for (let d = -70; d <= 70; d += 5) {
      const ang = Math.round(heading / 5) * 5 + d;
      const x = W / 2 + (ang - heading) * ppd;
      const a = 1 - Math.abs(x - W / 2) / (W / 2);
      const wrapped = ((ang % 360) + 360) % 360;
      c.globalAlpha = Math.max(0, Math.min(1, a * 1.6));
      if (COMPASS_LABELS[wrapped]) {
        c.fillStyle = wrapped === 0 ? '#ff5252' : '#ffffff';
        c.fillText(COMPASS_LABELS[wrapped], x, 14);
      } else if (wrapped % 15 === 0) {
        c.fillStyle = '#cfd8df'; c.font = '11px Rajdhani, Segoe UI, Arial';
        c.fillText(String(wrapped), x, 14);
        c.font = 'bold 15px Rajdhani, Segoe UI, Arial';
      }
      c.fillStyle = '#ffffff';
      c.fillRect(x - 0.5, 26, 1, wrapped % 15 === 0 ? 9 : 5);
    }
    c.globalAlpha = 1;
    if (marks) {
      for (let i = 0; i < marks.length; i++) {
        const m = marks[i];
        let diff = ((m.b - heading + 540) % 360) - 180;
        if (Math.abs(diff) > 68) continue;
        const x = W / 2 + diff * ppd;
        c.globalAlpha = 1 - Math.abs(diff) / 80;
        c.fillStyle = m.c;
        c.font = 'bold 17px Segoe UI, Arial';
        c.fillText(m.t, x, 37);
      }
      c.globalAlpha = 1;
    }
    c.fillStyle = '#ffb02e';
    c.beginPath(); c.moveTo(W / 2 - 6, 2); c.lineTo(W / 2 + 6, 2); c.lineTo(W / 2, 9); c.closePath(); c.fill();
  }

  /* ---------------------------------------------------------------
     banners, medals, damage numbers
  --------------------------------------------------------------- */
  function banner(text, sub, cls) {
    while (E.banners.children.length >= 3) E.banners.removeChild(E.banners.firstChild);
    const b = mk('div', null, 'banner ' + (cls || ''), E.banners);
    mk('b', null, null, b, text);
    if (sub) mk('span', null, null, b, sub);
    setTimeout(function () { if (b.parentNode) b.parentNode.removeChild(b); }, 2600);
  }
  function medal(name, desc) {
    while (E.medals.children.length >= 3) E.medals.removeChild(E.medals.firstChild);
    const m = mk('div', null, 'medal-pop', E.medals);
    mk('i', null, null, m, '★');
    const t = mk('div', null, null, m);
    mk('b', null, null, t, name);
    mk('span', null, null, t, desc);
    setTimeout(function () { if (m.parentNode) m.parentNode.removeChild(m); }, 4200);
  }
  function setProjector(fn) { projector = fn; }
  function damageNumber(worldPoint, text, cls) {
    if (!projector || numCount > 16) return;
    const p = projector(worldPoint);
    if (!p || !p.visible) return;
    const d = mk('div', null, 'dmgnum ' + (cls || ''), E.nums, text);
    d.style.left = (p.x + (Math.random() - 0.5) * 40) + 'px';
    d.style.top = p.y + 'px';
    numCount++;
    setTimeout(function () { if (d.parentNode) d.parentNode.removeChild(d); numCount--; }, 900);
  }
  /* ---------- v11: timer + screen effects ---------- */
  let lastTimerSec = -1, lastSpeed = -1;
  function setTimer(left) {
    const sec = Math.ceil(left);
    if (sec === lastTimerSec) return;
    lastTimerSec = sec;
    const crit = sec <= 10 && sec > 0;
    E.timer.classList.toggle('show', crit);
    document.body.classList.toggle('final10', crit);
    if (crit) { setText(E.timerNum, sec); E.timerNum.style.animation = 'none'; void E.timerNum.offsetWidth; E.timerNum.style.animation = ''; }
  }
  let kfTimer = null;
  function killFlash(head, pts, mult) {
    try {
      E.kflash.className = '';
      void E.kflash.offsetWidth;
      E.kflash.className = head ? 'on head' : 'on';
      setText(E.kflashTxt, (head ? 'HEADSHOT  +' : 'ELIMINATED  +') + pts + (mult > 1.01 ? '  x' + mult.toFixed(2).replace(/0$/, '') : ''));
      clearTimeout(kfTimer);
      kfTimer = setTimeout(function () { E.kflash.className = ''; }, 700);
    } catch (e) { /* ignore */ }
  }
  function speedLines(a) {
    const v = Math.round(Math.max(0, Math.min(1, a)) * 20) / 20;
    if (v === lastSpeed) return;
    lastSpeed = v;
    E.speed.style.opacity = v;
  }
  let hurtTimer = null;
  function hurt() {
    try {
      E.hurtfx.className = ''; void E.hurtfx.offsetWidth; E.hurtfx.className = 'on';
      document.body.classList.remove('hurt'); void document.body.offsetWidth; document.body.classList.add('hurt');
      clearTimeout(hurtTimer);
      hurtTimer = setTimeout(function () { document.body.classList.remove('hurt'); E.hurtfx.className = ''; }, 320);
    } catch (e) { /* ignore */ }
  }
  function lowHp(on) { document.body.classList.toggle('lowhp', !!on); }
  function timeUp(score, bonus) {
    setText(E.timeupSub, 'SCORE  ' + fmt(score) + (bonus ? '     SURVIVOR BONUS +' + fmt(bonus) : ''));
    E.timeup.className = ''; void E.timeup.offsetWidth; E.timeup.className = 'on';
  }
  function resetFx() {
    lastTimerSec = -1; lastSpeed = -1;
    document.body.classList.remove('final10', 'hurt', 'lowhp');
    if (E.timer) E.timer.classList.remove('show');
    if (E.kflash) E.kflash.className = '';
    if (E.timeup) E.timeup.className = '';
    if (E.speed) E.speed.style.opacity = 0;
    if (E.hurtfx) E.hurtfx.className = '';
  }

  function clearOverlays() {
    resetFx();
    E.banners.innerHTML = ''; E.medals.innerHTML = ''; E.nums.innerHTML = ''; numCount = 0;
  }

  /* ---------------------------------------------------------------
     fps counter
  --------------------------------------------------------------- */
  function frameTick(show) {
    fpsFrames++;
    const n = performance.now();
    if (n - fpsLast >= 500) {
      fpsShown = Math.round(fpsFrames * 1000 / (n - fpsLast));
      fpsFrames = 0; fpsLast = n;
      if (show) setText(E.fps, fpsShown + ' FPS');
    }
    E.fps.classList.toggle('hidden', !show);
  }

  /* ---------------------------------------------------------------
     scoreboard
  --------------------------------------------------------------- */
  function showScoreboard(on) { E.scoreboard.classList.toggle('hidden', !on); }
  function renderScoreboard(d) {
    const rows = [
      ['Player', d.name], ['Rank', d.rank], ['Score', fmt(d.score)], ['Kills', d.kills], ['Headshots', d.headshots + ' (' + d.hsPct + '%)'],
      ['Accuracy', d.accuracy + '%'], ['Damage dealt', fmt(d.damage)], ['Longest kill', d.longest + ' m'],
      ['Best combo', d.bestCombo], ['Wave', d.wave], ['Time alive', d.time], ['Coins', d.coins]
    ];
    E.sbBody.innerHTML = '';
    rows.forEach(function (r) {
      const row = mk('div', null, 'sb-row', E.sbBody);
      mk('span', null, null, row, r[0]);
      mk('b', null, null, row, String(r[1]));
    });
  }
  function scoreboardVisible() { return !E.scoreboard.classList.contains('hidden'); }

  /* ---------------------------------------------------------------
     profile / rank card (menu)
  --------------------------------------------------------------- */
  function rankLabel(r) { return r.name + (r.stars ? ' ' + '★'.repeat(Math.min(5, r.stars)) : ''); }
  function renderProfile(name) {
    if (!E.profile) return;
    const p = Match.getProfile(name || 'Player');
    const r = Match.rankInfo(p.xp);
    E.profile.innerHTML = '';
    const left = mk('div', null, 'pc-rank', E.profile);
    mk('div', null, 'pc-badge', left, String(r.index + 1));
    const info = mk('div', null, 'pc-info', left);
    mk('b', null, null, info, rankLabel(r));
    const bar = mk('div', null, 'pc-bar', info);
    mk('i', null, null, bar).style.width = Math.round(Math.max(0.02, r.progress) * 100) + '%';
    mk('span', null, null, info, r.ceil ? fmt(p.xp) + ' / ' + fmt(r.ceil) + ' XP  to ' + r.nextName : fmt(p.xp) + ' XP  (max rank)');
    const st = mk('div', null, 'pc-stats', E.profile);
    [['MATCHES', p.matches], ['TOTAL KILLS', p.kills], ['BEST SCORE', fmt(p.bestScore)], ['BEST WAVE', p.bestWave],
     ['ACCURACY', (p.shots ? Math.round(p.hits / p.shots * 100) : 0) + '%']].forEach(function (s) {
      const c = mk('div', null, null, st);
      mk('b', null, null, c, String(s[1]));
      mk('span', null, null, c, s[0]);
    });
  }

  /* ---------------------------------------------------------------
     animated menu background
  --------------------------------------------------------------- */
  function menuBgLoop() {
    if (!menuBgOn) return;
    const cv = E.menuBg, c = cv.getContext('2d');
    if (cv.width !== window.innerWidth || cv.height !== window.innerHeight) { cv.width = window.innerWidth; cv.height = window.innerHeight; }
    const W = cv.width, H = cv.height, t = performance.now() / 1000;
    c.clearRect(0, 0, W, H);
    // slow light beams
    for (let i = 0; i < 3; i++) {
      const x = (Math.sin(t * 0.15 + i * 2) * 0.5 + 0.5) * W;
      const g = c.createLinearGradient(x - 120, 0, x + 120, H);
      g.addColorStop(0, 'rgba(255,150,40,0)'); g.addColorStop(0.5, 'rgba(255,150,40,0.06)'); g.addColorStop(1, 'rgba(255,150,40,0)');
      c.fillStyle = g; c.fillRect(0, 0, W, H);
    }
    // rising embers
    if (!E.embers) {
      E.embers = [];
      for (let i = 0; i < 70; i++) E.embers.push({ x: Math.random(), y: Math.random(), s: 0.5 + Math.random() * 2, v: 0.02 + Math.random() * 0.06, p: Math.random() * 6 });
    }
    for (let i = 0; i < E.embers.length; i++) {
      const e = E.embers[i];
      e.y -= e.v * 0.016; if (e.y < -0.05) { e.y = 1.05; e.x = Math.random(); }
      const x = (e.x + Math.sin(t + e.p) * 0.01) * W, y = e.y * H;
      c.globalAlpha = 0.25 + 0.5 * Math.abs(Math.sin(t * 1.5 + e.p));
      c.fillStyle = '#ff9d3a';
      c.beginPath(); c.arc(x, y, e.s, 0, 6.283); c.fill();
    }
    c.globalAlpha = 1;
    menuBgRaf = requestAnimationFrame(menuBgLoop);
  }
  function menuBackground(on) {
    if (!E.menuBg) return;
    if (on && !menuBgOn) { menuBgOn = true; menuBgRaf = requestAnimationFrame(menuBgLoop); }
    else if (!on) { menuBgOn = false; cancelAnimationFrame(menuBgRaf); }
  }

  /* ---------------------------------------------------------------
     game-over screen
  --------------------------------------------------------------- */
  function gameOver(s, container) {
    container.innerHTML = '';
    if (s.note) mk('div', null, 'go-note', container, s.note);
    if (s.bonus) mk('div', null, 'go-note gold', container, 'SURVIVOR BONUS  +' + fmt(s.bonus));
    const rankBox = mk('div', null, 'go-rank', container);
    mk('div', null, 'pc-badge', rankBox, String(s.after.index + 1));
    const info = mk('div', null, 'pc-info', rankBox);
    mk('b', null, null, info, rankLabel(s.after) + (s.leveledUp ? '  -  RANK UP!' : ''));
    const bar = mk('div', null, 'pc-bar', info);
    const fill = mk('i', null, null, bar);
    fill.style.width = Math.round(Math.max(0.02, s.before.index === s.after.index ? s.before.progress : 0) * 100) + '%';
    setTimeout(function () { fill.style.width = Math.round(Math.max(0.02, s.after.progress) * 100) + '%'; }, 120);
    mk('span', null, null, info, '+' + fmt(s.xpGained) + ' XP' + (s.after.ceil ? '   (' + fmt(s.after.xp) + ' / ' + fmt(s.after.ceil) + ')' : ''));

    const grid = mk('div', null, 'go-grid', container);
    [['SCORE', fmt(s.score) + (s.isBestScore ? '  NEW BEST' : '')], ['KILLS', s.kills], ['HEADSHOTS', s.headshots], ['WAVE', s.wave],
     ['ACCURACY', Math.round(s.accuracy * 100) + '%'], ['DAMAGE', fmt(s.damage)], ['LONGEST KILL', Math.round(s.longest) + ' m'],
     ['BEST COMBO', 'x' + s.bestCombo], ['TIME ALIVE', Match.fmtTime(s.time)], ['ALL-TIME KILLS', s.profile.kills]].forEach(function (r) {
      const c = mk('div', null, 'go-cell', grid);
      mk('span', null, null, c, r[0]);
      mk('b', null, null, c, String(r[1]));
    });
    if (s.medals.length) {
      const ms = mk('div', null, 'go-medals', container);
      s.medals.forEach(function (m) {
        const chip = mk('div', null, 'go-medal', ms);
        mk('i', null, null, chip, '★');
        mk('b', null, null, chip, m.name);
        chip.title = m.desc;
      });
    }
  }

  /* ---------- v7: make the whole homepage fit the screen (laptop / phone) ---------- */
  function fitMenu() {
    try {
      const menu = $('menu'), panel = menu && menu.querySelector('.menu-panel');
      if (!panel || menu.classList.contains('hidden')) return;
      panel.style.zoom = '';
      if (window.innerWidth < 900) return;                       // phones/tablets: scroll normally
      const avail = window.innerHeight - 20;
      const need = panel.offsetHeight;
      if (need > avail) panel.style.zoom = String(Math.max(0.6, avail / need));
    } catch (e) { /* ignore */ }
  }
  function init() {
    build();
    renderProfile($('username') ? ($('username').value.trim() || 'Player') : 'Player');
    menuBackground(true);
    const more = $('menu-more');
    if (more) {
      try { if (window.innerWidth >= 900 && window.innerHeight >= 880) more.open = true; } catch (e) { /* ignore */ }
      more.addEventListener('toggle', function () { setTimeout(fitMenu, 0); });
    }
    window.addEventListener('resize', fitMenu);
    window.addEventListener('orientationchange', function () { setTimeout(fitMenu, 250); });
    setTimeout(fitMenu, 50); setTimeout(fitMenu, 600);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitMenu);
  }

  /* ---------- v9: ability chips (dodge cooldown + grenades) ---------- */
  let abEl = null, abLast = '';
  function abilities(d) {
    try {
      if (!abEl) {
        const hud = document.getElementById('hud') || document.body;
        abEl = mk('div', 'abilities', null, hud);
        abEl.innerHTML = '<div class="ab" id="ab-dodge"><i></i><b>DODGE</b><kbd></kbd></div><div class="ab" id="ab-nade"><b>GRENADES</b><span>0</span><kbd></kbd></div><div class="ab" id="ab-stam" style="display:none"></div>';
      }
      const key = [Math.round(d.dodge * 20), d.nades, d.dodgeKey, d.nadeKey].join('|');
      if (key === abLast) return;
      abLast = key;
      const dEl = abEl.querySelector('#ab-dodge'), nEl = abEl.querySelector('#ab-nade');
      dEl.className = 'ab' + (d.dodge >= 1 ? ' ready' : '');
      dEl.querySelector('i').style.transform = 'scaleX(' + Math.max(0, Math.min(1, d.dodge)) + ')';
      dEl.querySelector('kbd').textContent = d.dodgeKey;
      nEl.className = 'ab' + (d.nades > 0 ? ' ready' : ' empty');
      nEl.querySelector('span').textContent = 'x' + d.nades;
      nEl.querySelector('kbd').textContent = d.nadeKey;
    } catch (e) { /* ignore */ }
  }

  /* ---------- v6: horror headshot overlay ---------- */
  let scaryEl = null, scaryTimer = null;
  const SKULL = '<svg viewBox="0 0 100 110" class="sk-svg"><path d="M50 4C25 4 10 22 10 45c0 14 6 22 14 28v17c0 4 3 7 7 7h38c4 0 7-3 7-7V73c8-6 14-14 14-28C90 22 75 4 50 4z" fill="currentColor"/><ellipse cx="33" cy="48" rx="11" ry="13" fill="#000"/><ellipse cx="67" cy="48" rx="11" ry="13" fill="#000"/><path d="M50 60l-6 14h12z" fill="#000"/><path d="M36 92v-12M45 92v-12M55 92v-12M64 92v-12" stroke="#000" stroke-width="3"/></svg>';
  function scaryBuild() {
    if (scaryEl) return;
    scaryEl = document.createElement('div');
    scaryEl.id = 'scary-overlay';
    scaryEl.innerHTML = '<div class="sk-veins"></div><div class="sk-splat"></div><div class="sk-skull">' + SKULL + '</div><div class="sk-scan"></div>';
    const hud = document.getElementById('hud') || document.body;
    hud.appendChild(scaryEl);
  }
  /* kill=false: quick red hit-flash.  kill=true: full horror sting (desaturated screen, blood veins, skull, glitch) */
  function scary(kill) {
    try {
      scaryBuild();
      scaryEl.className = '';
      void scaryEl.offsetWidth;
      scaryEl.className = kill ? 'on kill' : 'on';
      document.body.classList.remove('scary-hit', 'scary-kill');
      void document.body.offsetWidth;
      document.body.classList.add(kill ? 'scary-kill' : 'scary-hit');
      clearTimeout(scaryTimer);
      scaryTimer = setTimeout(function () {
        document.body.classList.remove('scary-hit', 'scary-kill');
        if (scaryEl) scaryEl.className = '';
      }, kill ? 1900 : 500);
    } catch (e) { /* ignore */ }
  }

  return {
    abilities, scary, fitMenu, init, showLoading, loadingProgress, hideLoading, updateTop, drawCompass, banner, medal, setProjector, damageNumber,
    setTimer, killFlash, speedLines, hurt, lowHp, timeUp, resetFx,
    clearOverlays, frameTick, showScoreboard, renderScoreboard, scoreboardVisible, renderProfile, menuBackground, gameOver, rankLabel, fmt
  };
})();
