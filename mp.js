/* ===================== STRIKE ZONE - mp.js =====================
   Online multiplayer client: connection, lobby (create/join rooms, game mode,
   map voting, character, countdown), in-match HUD (live leaderboard, mode bar),
   and the full-screen results screen.
   Talks to the Node.js + Socket.IO server (see /server) and to game.js via window.SZ.
*/
(function () {
  'use strict';
  const $ = function (id) { return document.getElementById(id); };
  const CFG = window.SZ_CONFIG || {};
  const MP = window.MP = { active: false };
  const CHAR_NAMES = ['GHOST', 'DESERT HAWK', 'ARCTIC WOLF', 'NIGHT VIPER'];
  const MODE_ICON = { ffa: '⚔', tdm: '⚔', ctf: '⚑', koth: '▲', gungame: '❖' };

  let sock = null, io = null, connected = false, serverUrl = '';
  let me = { id: null, name: 'Player', char: 0 };
  let room = null, match = null, lb = null, results = null, rtt = 0, clockOffset = 0;
  let screen = 'none';       // none | home | room | match | results
  let activeTab = 'players', wantAgain = false, lbMin = false, snapAt = 0, snapTl = 0, myTeam = null, respawnAt = 0;
  let timers = {};

  /* ---------------- helpers ---------------- */
  function el(tag, cls, html) { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function toast(msg, ms) {
    const t = el('div', 'mp-toast', esc(msg)); document.body.appendChild(t);
    setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, ms || 2600);
  }
  function fmtTime(s) { s = Math.max(0, Math.ceil(s)); return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2); }
  function teamCls(t) { return t === 'red' ? 'red' : t === 'blue' ? 'blue' : ''; }
  function avatar(char, w, h) {
    const cv = document.createElement('canvas'); cv.width = w || 56; cv.height = h || 76;
    try { window.SZ && SZ.drawPreview(cv, char); } catch (e) { /* preview is cosmetic */ }
    return cv;
  }
  function mapDef(i) { return (window.SZ && SZ.MAPS[i]) || { name: 'Map ' + i, preview: '#223' }; }
  function myName() { const i = $('username'); return ((i && i.value) || localStorage.getItem('strikezone_user') || 'Player').trim().slice(0, 16) || 'Player'; }
  function save(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function load(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function defaultServer() {
    const saved = load('strikezone_server');
    if (saved) return saved;
    if (CFG.server) return CFG.server;
    return location.protocol.indexOf('http') === 0 ? location.origin : 'http://localhost:3000';
  }

  /* ---------------- socket.io loading + connection ---------------- */
  function loadClientLib(url, done) {
    if (window.io) return done(true);
    const tryUrls = [url.replace(/\/$/, '') + '/socket.io/socket.io.js', 'https://cdn.jsdelivr.net/npm/socket.io-client@4.7.5/dist/socket.io.min.js'];
    (function next(i) {
      if (i >= tryUrls.length) return done(false);
      const s = document.createElement('script'); s.src = tryUrls[i];
      s.onload = function () { window.io ? done(true) : next(i + 1); };
      s.onerror = function () { next(i + 1); };
      document.head.appendChild(s);
    })(0);
  }
  function connect(url, cb) {
    serverUrl = url.replace(/\/$/, '');
    if (sock) { try { sock.close(); } catch (e) {} sock = null; connected = false; }
    setStatus('connecting', 'Connecting…');
    loadClientLib(serverUrl, function (ok) {
      if (!ok) { setStatus('bad', 'Could not load the multiplayer library'); return cb && cb(false); }
      sock = window.io(serverUrl, { transports: ['websocket', 'polling'], reconnectionAttempts: 5, timeout: 8000 });
      let first = true;
      sock.on('connect', function () {
        connected = true; me.id = sock.id; setStatus('ok', 'Online'); startPing();
        sock.emit('hello', { name: myName(), char: me.char }, function (r) { if (r && r.serverNow) clockOffset = r.serverNow - Date.now() / 1000; });
        if (first) { first = false; cb && cb(true); }
      });
      sock.on('connect_error', function () { setStatus('bad', 'Server unreachable'); if (first) { first = false; cb && cb(false); } });
      sock.on('disconnect', function () {
        connected = false; setStatus('bad', 'Disconnected');
        if (MP.active || screen === 'room' || screen === 'results') { toast('Connection to the server was lost'); resetToMenu(); }
      });
      bindEvents();
    });
  }
  function startPing() {
    clearInterval(timers.ping);
    timers.ping = setInterval(function () {
      if (!connected) return;
      const t0 = Date.now();
      sock.emit('ping:c', t0, function (r) { rtt = Date.now() - t0; if (r && r.serverNow) clockOffset = r.serverNow - Date.now() / 1000 + rtt / 2000; sock.emit('ping:rtt', rtt); updatePing(); });
    }, 3000);
  }
  function now() { return Date.now() / 1000 + clockOffset; }
  function setStatus(kind, text) {
    const p = $('mp-status'); if (!p) return;
    p.className = 'mp-pill ' + (kind === 'ok' ? 'ok' : kind === 'bad' ? 'bad' : '');
    p.innerHTML = '<i></i>' + esc(text) + (kind === 'ok' && rtt ? ' · ' + rtt + ' ms' : '');
  }
  function updatePing() { if (connected) setStatus('ok', 'Online'); }

  /* ---------------- DOM: lobby root ---------------- */
  let root, homeEl, roomEl, countEl;
  function buildRoot() {
    if ($('mp-root')) return;
    root = el('div'); root.id = 'mp-root'; root.className = 'hidden';
    root.innerHTML =
      '<div class="mp-wrap">' +
        '<div class="mp-top"><button class="mp-btn sm" id="mp-back">← MENU</button><h2>ONLINE <span>MULTIPLAYER</span></h2><div class="sp"></div><div id="mp-status" class="mp-pill"><i></i>Offline</div></div>' +
        '<div id="mp-home" class="mp-home"></div>' +
        '<div id="mp-room-wrap" class="hidden" style="display:flex;flex-direction:column;gap:8px;flex:1;min-height:0"></div>' +
      '</div><div id="mp-count"><div class="t" id="mp-count-t">MATCH STARTS IN</div><div class="n" id="mp-count-n">5</div><div class="s" id="mp-count-s"></div></div>';
    document.body.appendChild(root);
    countEl = $('mp-count');
    $('mp-back').addEventListener('click', function () { if (room) leaveRoom(); else closeLobby(); });
    buildHome();
  }

  function charPicker(onPick) {
    const wrap = el('div', 'mp-chars');
    function draw() {
      wrap.innerHTML = '';
      for (let i = 0; i < 4; i++) {
        const c = el('div', 'mp-char' + (i === me.char ? ' sel' : ''));
        c.appendChild(avatar(i, 64, 86)); c.appendChild(el('b', null, CHAR_NAMES[i]));
        c.addEventListener('click', function () { me.char = i; save('strikezone_mpchar', i); if (window.SZ) SZ.setChar(i); onPick(i); draw(); });
        wrap.appendChild(c);
      }
    }
    draw(); return wrap;
  }

  function buildHome() {
    homeEl = $('mp-home'); homeEl.innerHTML = '';
    const c1 = el('div', 'mp-card'); c1.innerHTML = '<h3>YOUR PLAYER</h3><label class="mp-label" for="mp-name">NAME</label><input class="mp-input" id="mp-name" maxlength="16" autocomplete="off" placeholder="Enter your name"><div style="height:12px"></div><label class="mp-label">CHARACTER</label>';
    c1.appendChild(charPicker(function (i) { if (connected) sock.emit('room:setChar', i); }));
    homeEl.appendChild(c1);
    const c2 = el('div', 'mp-card');
    c2.innerHTML = '<h3>PLAY WITH FRIENDS</h3><div class="mp-actions">' +
      '<button class="mp-btn primary" id="mp-create">CREATE PRIVATE ROOM</button>' +
      '<div class="mp-hero" style="text-align:center">— or join with a room code —</div>' +
      '<div class="mp-join"><input class="mp-input" id="mp-code" maxlength="5" placeholder="CODE" autocomplete="off" autocapitalize="characters"><button class="mp-btn blue" id="mp-join">JOIN</button></div>' +
      '<div class="mp-err" id="mp-err"></div></div>';
    homeEl.appendChild(c2);
    const c3 = el('div', 'mp-card wide');
    c3.innerHTML = '<h3>5 GAME MODES</h3><div class="mp-modes-info">' +
      [['Free For All', '3:00 · everyone for themselves, best score wins'], ['Team Deathmatch', '5:00 · Red vs Blue, combined score'], ['Capture The Flag', 'steal the enemy flag · first to 3 captures'], ['King of the Hill', 'hold the zone in the middle to score'], ['Gun Game', 'every kill upgrades your gun · finish the ladder']]
        .map(function (m) { return '<div class="mp-mode-chip"><b>' + m[0].toUpperCase() + '</b>' + m[1] + '</div>'; }).join('') + '</div>';
    homeEl.appendChild(c3);
    const c4 = el('div', 'mp-card wide');
    c4.innerHTML = '<details class="mp-adv"><summary>SERVER SETTINGS (advanced)</summary><label class="mp-label" style="margin-top:8px">SERVER ADDRESS</label><input class="mp-input" id="mp-server" autocomplete="off" spellcheck="false"><div class="mp-hero" style="margin-top:6px">Playing from the same computer / network: <b>http://localhost:3000</b>. Online with friends: your Render address, e.g. <b>https://strikezone.onrender.com</b></div><button class="mp-btn sm" id="mp-reconnect" style="margin-top:8px">RECONNECT</button></details>';
    homeEl.appendChild(c4);
    $('mp-name').value = myName();
    $('mp-server').value = defaultServer();
    $('mp-create').addEventListener('click', function () { withConnection(function () { doCreate(); }); });
    $('mp-join').addEventListener('click', function () { withConnection(function () { doJoin($('mp-code').value); }); });
    $('mp-code').addEventListener('keydown', function (e) { e.stopPropagation(); if (e.key === 'Enter') $('mp-join').click(); });
    $('mp-code').addEventListener('input', function () { this.value = this.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); });
    $('mp-name').addEventListener('keydown', function (e) { e.stopPropagation(); });
    $('mp-name').addEventListener('change', function () { const v = this.value.trim().slice(0, 16) || 'Player'; save('strikezone_user', v); const u = $('username'); if (u) u.value = v; });
    $('mp-server').addEventListener('keydown', function (e) { e.stopPropagation(); });
    $('mp-reconnect').addEventListener('click', function () { save('strikezone_server', $('mp-server').value.trim()); connect($('mp-server').value.trim(), function (ok) { toast(ok ? 'Connected' : 'Could not connect'); }); });
  }
  function homeErr(m) { const e = $('mp-err'); if (e) e.textContent = m || ''; }

  function withConnection(fn) {
    homeErr('');
    const nm = ($('mp-name').value || '').trim().slice(0, 16) || 'Player';
    save('strikezone_user', nm); const u = $('username'); if (u) u.value = nm; me.name = nm;
    const url = $('mp-server').value.trim() || defaultServer();
    save('strikezone_server', url);
    if (connected && serverUrl === url.replace(/\/$/, '')) return fn();
    connect(url, function (ok) { if (ok) fn(); else homeErr('Could not reach the server at ' + url + '. Is it running? (cd server && npm start)'); });
  }
  function doCreate() {
    sock.emit('room:create', { name: me.name, char: me.char }, function (r) {
      if (!r || !r.ok) return homeErr((r && r.error) || 'Could not create the room');
      showRoomScreen();
    });
  }
  function doJoin(code) {
    code = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (code.length < 4) return homeErr('Enter the room code from your friend');
    sock.emit('room:join', { code: code, name: me.name, char: me.char }, function (r) {
      if (!r || !r.ok) return homeErr((r && r.error) || 'Could not join that room');
      showRoomScreen();
    });
  }
  function leaveRoom() {
    if (sock && connected) sock.emit('room:leave');
    room = null; clearInterval(timers.count); countEl && countEl.classList.remove('on');
    showHome();
  }

  /* ---------------- room view ---------------- */
  function showHome() {
    screen = 'home'; buildRoot();
    root.classList.remove('hidden'); homeEl.classList.remove('hidden'); $('mp-room-wrap').classList.add('hidden');
    $('mp-name').value = myName();
    if (!connected) setStatus('', 'Not connected');
    if (results) hideResults();
  }
  function showRoomScreen() {
    screen = 'room'; buildRoot();
    root.classList.remove('hidden'); homeEl.classList.add('hidden'); $('mp-room-wrap').classList.remove('hidden');
    renderRoom();
  }
  function isHost() { return room && room.host === me.id; }
  function renderRoom() {
    if (!room || screen !== 'room') return;
    const w = $('mp-room-wrap'); const host = isHost();
    const mode = room.modes.find(function (m) { return m.id === room.mode; }) || room.modes[0];
    const mine = room.players.find(function (p) { return p.id === me.id; });
    myTeam = mine ? mine.team : null;
    // preserve scroll on re-render
    const scrollers = w.querySelectorAll('.mp-room, .mp-scroll'); const st = []; scrollers.forEach(function (s) { st.push(s.scrollTop); });
    w.innerHTML = '';
    // header: code + invite
    const head = el('div', 'mp-card');
    head.innerHTML = '<div class="mp-code"><div><div class="mp-label" style="margin:0">ROOM CODE</div><div class="code">' + esc(room.code) + '</div></div><div style="flex:1"></div>' +
      '<button class="mp-btn sm" id="mp-copy">COPY CODE</button><button class="mp-btn sm" id="mp-link">INVITE LINK</button></div>';
    w.appendChild(head);
    // tabs (phones)
    const tabs = el('div', 'mp-tabs');
    [['players', 'PLAYERS (' + room.players.length + ')'], ['mode', 'MODE'], ['maps', 'MAPS'], ['you', 'YOU']].forEach(function (t) {
      const b = el('button', 'mp-btn sm' + (activeTab === t[0] ? ' on' : ''), t[1]);
      b.addEventListener('click', function () { activeTab = t[0]; renderRoom(); });
      tabs.appendChild(b);
    });
    w.appendChild(tabs);
    const grid = el('div', 'mp-room'); grid.setAttribute('data-active', activeTab);
    const left = el('div', 'mp-col'), right = el('div', 'mp-col');
    // players
    const pc = el('div', 'mp-card grow'); pc.setAttribute('data-tab', 'players');
    pc.innerHTML = '<h3>PLAYERS <small>' + room.players.length + ' / ' + room.max + '</small></h3>';
    const plist = el('div', 'mp-scroll');
    if (mode.teams) {
      const cols = el('div', 'mp-team-cols');
      ['red', 'blue'].forEach(function (t) {
        const col = el('div', 'tcol ' + t); const ps = room.players.filter(function (p) { return p.team === t; });
        col.innerHTML = '<div class="thead"><span>' + t.toUpperCase() + ' TEAM</span><span>' + ps.length + '</span></div>';
        const l = el('div', 'mp-players'); ps.forEach(function (p) { l.appendChild(playerRow(p)); }); col.appendChild(l); cols.appendChild(col);
      });
      plist.appendChild(cols);
      if (mine && (room.state === 'lobby' || room.state === 'results')) {
        const sw = el('button', 'mp-btn sm', 'SWITCH TEAM'); sw.style.marginTop = '10px'; sw.addEventListener('click', function () { sock.emit('room:swapTeam'); }); plist.appendChild(sw);
      }
    } else {
      const l = el('div', 'mp-players'); room.players.forEach(function (p) { l.appendChild(playerRow(p)); }); plist.appendChild(l);
    }
    pc.appendChild(plist); left.appendChild(pc);
    // mode
    const mc = el('div', 'mp-card'); mc.setAttribute('data-tab', 'mode');
    mc.innerHTML = '<h3>GAME MODE <small>' + (host ? 'YOU ARE THE HOST' : 'HOST CHOOSES') + '</small></h3>';
    const mg = el('div', 'mp-modes');
    room.modes.forEach(function (m) {
      const b = el('div', 'mp-mode' + (m.id === room.mode ? ' sel' : '') + (host ? '' : ' ro'), '<b>' + MODE_ICON[m.id] + ' ' + esc(m.name.toUpperCase()) + '</b><span>' + (m.teams ? 'Teams' : 'Solo') + ' · ' + fmtTime(m.time) + '</span>');
      if (host) b.addEventListener('click', function () { sock.emit('room:setMode', m.id); });
      mg.appendChild(b);
    });
    mc.appendChild(mg); mc.appendChild(el('div', 'mp-modedesc', esc(mode.desc)));
    right.appendChild(mc);
    // maps
    const mpc = el('div', 'mp-card'); mpc.setAttribute('data-tab', 'maps');
    mpc.innerHTML = '<h3>VOTE FOR A MAP <small>MOST VOTES WINS</small></h3>';
    const mm = el('div', 'mp-maps'); const best = Math.max.apply(null, room.maps.map(function (m) { return m.votes; }));
    room.maps.forEach(function (m, i) {
      const d = mapDef(i);
      const c = el('div', 'mp-map' + (mine && mine.vote === i ? ' sel' : '') + (best > 0 && m.votes === best ? ' lead' : ''), '<span class="vt">' + m.votes + '</span><span class="nm">' + esc(m.name) + '</span>');
      c.style.background = d.preview;
      c.addEventListener('click', function () { sock.emit('room:vote', mine && mine.vote === i ? -1 : i); });
      mm.appendChild(c);
    });
    mpc.appendChild(mm); right.appendChild(mpc);
    // you
    const yc = el('div', 'mp-card'); yc.setAttribute('data-tab', 'you'); yc.innerHTML = '<h3>YOUR CHARACTER</h3>';
    yc.appendChild(charPicker(function (i) { sock.emit('room:setChar', i); }));
    right.appendChild(yc);
    grid.appendChild(left); grid.appendChild(right); w.appendChild(grid);
    // footer
    const foot = el('div', 'mp-foot');
    const leave = el('button', 'mp-btn danger', 'LEAVE'); leave.addEventListener('click', leaveRoom);
    foot.appendChild(leave); foot.appendChild(el('div', 'sp'));
    const starting = room.state === 'countdown';
    if (room.state === 'results' && room.lastResults !== false && results) {
      const rb = el('button', 'mp-btn', 'VIEW RESULTS'); rb.addEventListener('click', function () { showResults(); }); foot.appendChild(rb);
    }
    if (host) {
      if (starting) { const cb = el('button', 'mp-btn', 'CANCEL'); cb.addEventListener('click', function () { sock.emit('room:cancel'); }); foot.appendChild(cb); }
      else {
        const sb = el('button', 'mp-btn primary', 'START MATCH'); sb.addEventListener('click', function () { sock.emit('room:start', {}, function (r) { if (r && !r.ok) toast(r.error); }); }); foot.appendChild(sb);
      }
    } else {
      foot.appendChild(el('span', 'hint', starting ? 'Starting…' : 'Waiting for the host to start…'));
    }
    w.appendChild(foot);
    // restore scroll
    const sc2 = w.querySelectorAll('.mp-room, .mp-scroll'); sc2.forEach(function (s, i) { if (st[i]) s.scrollTop = st[i]; });
    $('mp-copy').addEventListener('click', function () { copyText(room.code); toast('Room code copied: ' + room.code); });
    $('mp-link').addEventListener('click', function () { copyText(location.origin + location.pathname + '?room=' + room.code); toast('Invite link copied'); });
    updateCountdown();
  }
  function playerRow(p) {
    const r = el('div', 'mp-p' + (p.id === me.id ? ' me' : ''));
    r.appendChild(avatar(p.char, 56, 76));
    r.appendChild(el('div', 'nm', esc(p.name) + (p.id === me.id ? ' (you)' : '')));
    if (p.host) r.appendChild(el('span', 'tag', '★ HOST'));
    if (p.ping) r.appendChild(el('span', 'png', p.ping + 'ms'));
    return r;
  }
  function copyText(t) {
    try { if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(t); } catch (e) {}
    const i = document.createElement('input'); i.value = t; document.body.appendChild(i); i.select(); try { document.execCommand('copy'); } catch (e) {} document.body.removeChild(i);
  }

  /* ---------------- countdown ---------------- */
  function updateCountdown() {
    clearInterval(timers.count);
    if (!room || room.state !== 'countdown') { countEl && countEl.classList.remove('on'); return; }
    function tick() {
      const left = Math.max(0, room.countdownEnd - now());
      const m = room.modes.find(function (x) { return x.id === room.mode; });
      $('mp-count-n').textContent = Math.max(1, Math.ceil(left));
      $('mp-count-s').textContent = m ? m.name + ' · ' + room.players.length + ' player' + (room.players.length === 1 ? '' : 's') : '';
      countEl.classList.add('on');
      if (left <= 0) clearInterval(timers.count);
    }
    tick(); timers.count = setInterval(tick, 150);
    const n = $('mp-count-n'); if (n) { n.style.animation = 'none'; void n.offsetWidth; n.style.animation = ''; }
  }

  /* ---------------- server events ---------------- */
  let bound = null;
  function bindEvents() {
    if (bound === sock) return; bound = sock;
    sock.on('room:state', function (d) {
      const prevState = room && room.state;
      room = d;
      if (screen === 'room') renderRoom();
      if (d.state === 'countdown' && prevState !== 'countdown') updateCountdown();
      if (d.state !== 'countdown' && prevState === 'countdown') { clearInterval(timers.count); countEl && countEl.classList.remove('on'); }
    });
    sock.on('match:start', onMatchStart);
    sock.on('match:go', function () { if (!MP.active) return; try { SZ.banner('GO!', match.modeName.toUpperCase(), 'wave'); } catch (e) {} });
    sock.on('s', function (snap) {
      if (!MP.active || !window.SZ || !SZ.G.mp) return;
      SZ.MPG.applySnap(snap); snapAt = Date.now(); snapTl = snap.tl;
    });
    sock.on('lb', function (d) { lb = d; renderLb(); if (MP.sbOpen) renderScoreboard(); });
    sock.on('ev:shot', function (d) { if (MP.active) SZ.MPG.remoteShot(d.id, d.w); });
    sock.on('ev:hit', function (d) { if (MP.active) SZ.MPG.hurt(d); });
    sock.on('ev:hitmark', function (d) { if (MP.active) { d.pts = d.head ? 150 : 100; SZ.MPG.hitmark(d); } });
    sock.on('ev:correct', function (d) { if (MP.active) SZ.MPG.correct(d); });
    sock.on('ev:level', function (d) {
      if (!MP.active) return;
      SZ.MPG.gunGameWeapon(d.w);
      SZ.banner('LEVEL ' + (d.level + 1) + ' / ' + d.of, SZ.WEAPONS[d.w].name.toUpperCase(), 'streak'); renderGG(d.level);
    });
    sock.on('ev:respawn', function (d) {
      if (!MP.active || !SZ.G.mp) return;
      if (d.id === me.id) { SZ.MPG.respawn(d); $('mp-resp').classList.remove('on'); if (SZ.G.mp.mode === 'gungame' && lb) { const r = lb.rows.find(function (x) { return x.id === me.id; }); if (r) renderGG(r.lvl); } }
      else { const r = SZ.G.remotes[d.id]; if (r) SZ.MPG.remoteRespawn(r, d.x, d.z); }
    });
    sock.on('ev:kill', onKill);
    sock.on('ev:flag', onFlag);
    sock.on('ev:feed', function (d) { if (d.t === 'leave') feed(esc(d.name) + ' left the match'); });
    sock.on('match:end', onMatchEnd);
  }

  /* ---------------- match start ---------------- */
  function onMatchStart(d) {
    match = d; results = null; lb = null; wantAgain = false;
    match.modeName = (room && room.modes.find(function (m) { return m.id === d.mode; }) || { name: d.mode }).name;
    clearInterval(timers.count); countEl.classList.remove('on');
    root.classList.add('hidden'); hideResults();
    const mine = d.players.find(function (p) { return p.id === me.id; }) || {};
    myTeam = mine.team;
    MP.active = true; screen = 'match';
    SZ.begin({
      selfId: me.id, name: me.name, mode: d.mode, mapIndex: d.mapIndex, layout: d.layout, loadout: d.loadout, ladder: d.ladder,
      players: d.players, teamMode: !!(room && room.modes.find(function (m) { return m.id === d.mode; }).teams), time: d.time, char: mine.char
    });
  }
  MP.onBegin = function () {               // game.js finished building the map
    buildHud();
    $('btn-quit').textContent = 'LEAVE MATCH';
    sock.emit('p:loaded');
    clearInterval(timers.state);
    timers.state = setInterval(function () {
      if (!MP.active || !connected || SZ.G.state !== 'playing') return;
      sock.emit('p:state', SZ.MPG.state());
    }, 50);
    clearInterval(timers.hud);
    timers.hud = setInterval(updateHud, 200);
    snapTl = match.time; snapAt = Date.now();
    if (match.mode === 'gungame') renderGG(0);
    renderLb();
  };

  /* ---------------- game -> network hooks ---------------- */
  MP.shoot = function (w) { if (connected) sock.emit('p:shoot', { w: w }); };
  MP.hit = function (id, part, w) { if (connected) sock.emit('p:hit', { t: id, part: part, w: w }); };
  MP.dodge = function () { if (connected) sock.emit('p:dodge'); };
  MP.leaveMatch = function () {
    if (sock && connected) sock.emit('room:leave');
    room = null; teardownMatch(); SZ.MPG.exit(); showHome();
  };
  function teardownMatch() {
    MP.active = false; clearInterval(timers.state); clearInterval(timers.hud);
    const h = $('mp-hud'); if (h) h.remove(); const r = $('mp-resp'); if (r) r.remove(); const s = $('mp-sb'); if (s) s.remove();
    const q = $('btn-quit'); if (q) q.textContent = 'QUIT TO MENU';
    hideResults();
  }
  function resetToMenu() {
    if (MP.active) { teardownMatch(); try { SZ.MPG.exit(); } catch (e) {} }
    room = null; screen = 'home'; if (root) { showHome(); }
  }

  /* ---------------- in-match HUD ---------------- */
  let H = {};
  function buildHud() {
    const old = $('mp-hud'); if (old) old.remove();
    const team = !!SZ.G.mp.teams;
    const hud = el('div'); hud.id = 'mp-hud';
    hud.innerHTML =
      '<div class="mph-bar">' +
        (team ? '<div class="tm red" id="mph-red"><small>RED</small><b>0</b></div>' : '') +
        '<div class="t" id="mph-t"><small id="mph-mode"></small><b id="mph-time">0:00</b></div>' +
        (team ? '<div class="tm blue" id="mph-blue"><small>BLUE</small><b>0</b></div>' : '<div class="tm solo"><small>YOUR SCORE</small><b id="mph-me">0</b></div>') +
      '</div><div class="mph-obj" id="mph-obj"></div>' +
      '<div class="mph-lb' + (lbMin ? ' min' : '') + '" id="mph-lb"><div class="hd" id="mph-lbhd"><span>LEADERBOARD</span><span class="rk" id="mph-rk"></span></div>' +
      '<table><thead><tr><th>#</th><th>PLAYER</th><th>K</th><th>D</th><th>PTS</th></tr></thead><tbody id="mph-rows"></tbody></table></div>' +
      '<div class="mph-feed" id="mph-feed"></div><div class="mph-gg" id="mph-gg"></div>';
    document.body.appendChild(hud);
    const resp = el('div'); resp.id = 'mp-resp'; resp.innerHTML = '<h2>ELIMINATED</h2><p id="mp-resp-by"></p><div class="n" id="mp-resp-n">3</div><p>RESPAWNING</p>';
    document.body.appendChild(resp);
    const sb = el('div'); sb.id = 'mp-sb'; sb.innerHTML = '<div class="mp-card"><h3>SCOREBOARD <small id="mp-sb-info"></small></h3><div class="res-tw" id="mp-sb-body"></div></div>';
    document.body.appendChild(sb);
    sb.addEventListener('click', function () { setScoreboard(false); });
    $('mph-mode').textContent = match.modeName.toUpperCase();
    $('mph-lbhd').addEventListener('click', function () { if (window.innerWidth <= 899) { setScoreboard(true); } else { lbMin = !lbMin; $('mph-lb').classList.toggle('min', lbMin); } });
    if (window.innerWidth <= 899) { lbMin = true; $('mph-lb').classList.add('min'); }
  }
  function updateHud() {
    if (!MP.active || !$('mph-time')) return;
    const left = Math.max(0, snapTl - (Date.now() - snapAt) / 1000);
    $('mph-time').textContent = fmtTime(left);
    $('mph-t').classList.toggle('low', left <= 10);
    if (SZ.G.state === 'dead' && respawnAt) {
      const r = Math.max(0, respawnAt - Date.now()) / 1000; $('mp-resp-n').textContent = Math.max(1, Math.ceil(r));
    }
    // objective line
    const o = SZ.MPG.snapObj, ob = $('mph-obj');
    if (match.mode === 'ctf' && o && o.flags) {
      const f = function (t) { const d = o.flags[t]; return d.s === 'home' ? 'AT BASE' : d.s === 'carried' ? 'TAKEN' : 'DROPPED'; };
      ob.innerHTML = '<span class="r">RED FLAG ' + f('red') + '</span> &nbsp;•&nbsp; <span class="b">BLUE FLAG ' + f('blue') + '</span> &nbsp;•&nbsp; FIRST TO ' + match.capLimit;
    } else if (match.mode === 'koth' && o && o.hill) {
      const ow = o.hill.owner;
      ob.innerHTML = 'HILL: ' + (ow === 'red' ? '<span class="r">RED HOLDS</span>' : ow === 'blue' ? '<span class="b">BLUE HOLDS</span>' : ow === 'contested' ? 'CONTESTED' : 'UNCLAIMED') + ' &nbsp;•&nbsp; FIRST TO ' + match.hillTarget;
    } else if (match.mode === 'tdm') ob.textContent = 'TEAM SCORE = COMBINED KILL POINTS';
    else if (match.mode === 'gungame') ob.textContent = 'KILL TO UPGRADE • FINISH ALL ' + match.ladder.length + ' WEAPONS';
    else ob.textContent = 'HIGHEST SCORE WINS';
  }
  function renderLb() {
    if (!lb || !$('mph-rows')) return;
    const rows = lb.rows, meRow = rows.find(function (r) { return r.id === me.id; });
    const show = rows.slice(0, 5); if (meRow && show.indexOf(meRow) < 0) show.push(meRow);
    const tb = $('mph-rows'); tb.innerHTML = '';
    show.forEach(function (r) {
      const tr = el('tr', (r.id === me.id ? 'me ' : '') + teamCls(r.team), '<td>' + r.rank + '</td><td>' + esc(r.name) + '</td><td>' + r.kills + '</td><td>' + r.deaths + '</td><td>' + r.score + '</td>');
      tb.appendChild(tr);
    });
    $('mph-rk').textContent = meRow ? '#' + meRow.rank + ' · ' + meRow.score + ' pts' : '';
    if (lb.teams && $('mph-red')) {
      $('mph-red').querySelector('b').textContent = lb.teams.red; $('mph-blue').querySelector('b').textContent = lb.teams.blue;
      $('mph-red').classList.toggle('you', myTeam === 'red'); $('mph-blue').classList.toggle('you', myTeam === 'blue');
    }
    if ($('mph-me') && meRow) $('mph-me').textContent = meRow.score;
  }
  function renderGG(level) {
    const g = $('mph-gg'); if (!g || match.mode !== 'gungame') return;
    g.style.display = 'block';
    let h = 'WEAPON ' + Math.min(level + 1, match.ladder.length) + '/' + match.ladder.length + ' &nbsp;';
    for (let i = 0; i < match.ladder.length; i++) h += '<i class="' + (i <= level ? 'on' : '') + '"></i>';
    g.innerHTML = h;
  }
  function feed(html, cls) {
    const f = $('mph-feed'); if (!f) return;
    const d = el('div', cls || '', html); f.appendChild(d);
    while (f.children.length > 6) f.removeChild(f.firstChild);
    setTimeout(function () { if (d.parentNode) d.parentNode.removeChild(d); }, 6000);
  }
  function nameHtml(name, team) { return '<span class="' + (team === 'red' ? 'r' : team === 'blue' ? 'b' : '') + '">' + esc(name) + '</span>'; }
  function onKill(d) {
    if (!MP.active || !SZ.G.mp) return;
    const w = SZ.WEAPONS[d.w] ? SZ.WEAPONS[d.w].name : d.w;
    feed(nameHtml(d.kn || 'World', d.kt) + ' [' + esc(w) + (d.head ? ' ★' : '') + '] ' + nameHtml(d.vn, d.vt), (d.k === me.id || d.v === me.id) ? 'me' : '');
    if (d.first) SZ.banner('FIRST BLOOD', (d.kn || '').toUpperCase(), 'streak');
    else if (d.k === me.id && d.streak >= 3) SZ.banner(d.streak + ' KILL STREAK', 'UNSTOPPABLE', 'streak');
    if (d.v === me.id) {
      SZ.MPG.die(); respawnAt = Date.now() + 3000;
      $('mp-resp-by').textContent = d.kn ? 'Killed by ' + d.kn + (d.w ? ' · ' + w : '') : 'You died';
      $('mp-resp').classList.add('on');
    } else SZ.MPG.remoteKillFx(d.v, d.head);
  }
  function onFlag(d) {
    if (!MP.active) return;
    const tn = d.team.toUpperCase();
    let msg = null;
    if (d.captured) { msg = esc(d.by) + ' captured the ' + tn + ' flag!'; SZ.banner((d.capTeam || '').toUpperCase() + ' TEAM CAPTURES', esc(d.by).toUpperCase(), 'multi'); }
    else if (d.state === 'carried') msg = esc(d.by) + ' took the ' + tn + ' flag';
    else if (d.state === 'dropped') msg = tn + ' flag dropped';
    else if (d.returned) msg = esc(d.by) + ' returned the ' + tn + ' flag';
    else if (d.auto) msg = tn + ' flag returned';
    if (msg) feed(msg, 'flag');
  }
  /* Tab / tap -> full scoreboard */
  MP.sbOpen = false;
  function setScoreboard(on) {
    const s = $('mp-sb'); if (!s) return;
    MP.sbOpen = on; s.classList.toggle('on', on); if (on) renderScoreboard();
  }
  function renderScoreboard() {
    const body = $('mp-sb-body'); if (!body || !lb) return;
    let h = '<table class="mp-table"><thead><tr><th>#</th><th>PLAYER</th><th>KILLS</th><th>DEATHS</th><th>SCORE</th><th class="opt">PING</th></tr></thead><tbody>';
    lb.rows.forEach(function (r) { h += '<tr class="' + (r.id === me.id ? 'me ' : '') + teamCls(r.team) + '"><td>' + r.rank + '</td><td>' + esc(r.name) + '</td><td>' + r.kills + '</td><td>' + r.deaths + '</td><td class="sc">' + r.score + '</td><td class="opt">' + (r.ping || '-') + '</td></tr>'; });
    body.innerHTML = h + '</tbody></table>';
    $('mp-sb-info').textContent = lb.teams ? 'RED ' + lb.teams.red + '  •  BLUE ' + lb.teams.blue : '';
  }
  document.addEventListener('keydown', function (e) {
    if (!MP.active || e.code !== 'Tab') return;
    e.preventDefault(); e.stopImmediatePropagation(); setScoreboard(true);
  }, true);
  document.addEventListener('keyup', function (e) {
    if (!MP.active || e.code !== 'Tab') return;
    e.preventDefault(); e.stopImmediatePropagation(); setScoreboard(false);
  }, true);

  /* ---------------- results ---------------- */
  function onMatchEnd(d) {
    if (!MP.active) return;
    results = d; SZ.MPG.end();
    const h = $('mp-hud'); if (h) h.style.display = 'none'; const r = $('mp-resp'); if (r) r.classList.remove('on'); setScoreboard(false);
    clearInterval(timers.state); clearInterval(timers.hud);
    MP.active = false;
    setTimeout(showResults, 900);
    try { SZ.banner(d.winner.type === 'draw' ? 'DRAW' : 'MATCH OVER', d.modeName.toUpperCase(), 'wave'); } catch (e) {}
  }
  function hideResults() { const r = $('mp-results'); if (r) r.remove(); }
  function showResults() {
    hideResults();
    const d = results; if (!d) return;
    screen = 'results';
    const meR = d.ranking.find(function (r) { return r.id === me.id; });
    const w = d.winner; let title, cls, sub;
    if (w.type === 'draw') { title = 'DRAW'; cls = ''; sub = 'Nobody could separate the teams'; }
    else if (w.type === 'team') {
      const won = meR && meR.team === w.team; title = won ? 'VICTORY' : 'DEFEAT'; cls = won ? 'win' : 'lose'; sub = w.team.toUpperCase() + ' TEAM WINS';
    } else {
      const won = w.id === me.id; const wn = d.ranking.find(function (r) { return r.id === w.id; });
      title = won ? 'VICTORY' : (meR ? '#' + meR.rank + ' PLACE' : 'MATCH OVER'); cls = won ? 'win' : ''; sub = 'WINNER: ' + (wn ? wn.name : '');
    }
    const root2 = el('div'); root2.id = 'mp-results';
    let teamBar = '';
    if (d.teams) {
      const main = d.mode === 'ctf' ? 'captures' : d.mode === 'koth' ? 'hill points' : 'team score';
      teamBar = '<div class="res-teams"><b class="r">' + d.teams.red + '</b><span>RED • ' + main.toUpperCase() + ' • BLUE</span><b class="b">' + d.teams.blue + '</b></div>' +
        (d.mode !== 'tdm' && d.teamPts ? '<p style="margin-top:6px;font-size:12px;color:var(--muted)">Combined player score: <span style="color:var(--mp-red)">' + d.teamPts.red + '</span> vs <span style="color:var(--mp-blue)">' + d.teamPts.blue + '</span></p>' : '');
    }
    const winTeamCls = w.type === 'team' ? w.team : '';
    const reasonTxt = { time: 'Time limit reached', caps: 'Capture limit reached', hill: 'Hill target reached', ladder: 'Weapon ladder completed' }[d.reason] || '';
    let h = '<div class="res-wrap"><div class="res-banner"><small>' + esc(d.modeName.toUpperCase()) + ' • ' + esc(d.mapName.toUpperCase()) + '</small><h1 class="' + (w.type === 'team' && cls !== 'win' && cls !== 'lose' ? winTeamCls : cls) + '">' + title + '</h1><p>' + esc(sub) + (reasonTxt ? ' • ' + reasonTxt : '') + '</p>' + teamBar + '</div>';
    h += '<div class="res-main"><div class="mp-card"><h3>FINAL RANKINGS <small>SCORE, THEN KILLS</small></h3><div class="res-tw"><table class="mp-table"><thead><tr><th>#</th><th>PLAYER</th><th>KILLS</th><th>DEATHS</th><th>SCORE</th><th class="opt">K/D</th><th class="opt">HS</th><th class="opt">ACC</th></tr></thead><tbody>';
    d.ranking.forEach(function (r, i) {
      h += '<tr class="' + (i === 0 ? 'win ' : '') + (r.id === me.id ? 'me ' : '') + teamCls(r.team) + '"><td>' + (i === 0 ? '🏆' : r.rank) + '</td><td>' + esc(r.name) + (r.id === me.id ? ' (you)' : '') + '</td><td>' + r.kills + '</td><td>' + r.deaths + '</td><td class="sc">' + r.score + '</td><td class="opt">' + r.kd + '</td><td class="opt">' + r.headshots + '</td><td class="opt">' + r.accuracy + '%</td></tr>';
    });
    h += '</tbody></table></div></div>';
    if (d.mvp) h += '<div class="mp-card res-mvp"><div class="crown">★ MVP ★</div><div id="mvp-av"></div><div class="nm">' + esc(d.mvp.name) + '</div><div class="st"><span><b>' + d.mvp.kills + '</b>KILLS</span><span><b>' + d.mvp.deaths + '</b>DEATHS</span><span><b>' + d.mvp.score + '</b>SCORE</span></div></div>';
    h += '</div>';
    const st = d.stats;
    h += '<div class="res-stats"><div>DURATION<b>' + fmtTime(d.duration) + '</b></div><div>MAP<b>' + esc(d.mapName) + '</b></div><div>MODE<b>' + esc(d.modeName) + '</b></div><div>PLAYERS<b>' + st.players + '</b></div><div>TOTAL KILLS<b>' + st.totalKills + '</b></div><div>HEADSHOTS<b>' + st.totalHeadshots + '</b></div>' +
      (st.bestStreak && st.bestStreak.n > 1 ? '<div>BEST STREAK<b>' + st.bestStreak.n + ' • ' + esc(st.bestStreak.name) + '</b></div>' : '') +
      (meR ? '<div>YOUR K/D<b>' + meR.kd + '</b></div><div>YOUR ACCURACY<b>' + meR.accuracy + '%</b></div>' : '') + '</div>';
    h += '<div class="res-btns"><button class="mp-btn primary" id="res-again">' + (isHost() ? 'PLAY AGAIN' : 'PLAY AGAIN (HOST STARTS)') + '</button><button class="mp-btn blue" id="res-lobby">RETURN TO LOBBY</button><button class="mp-btn danger" id="res-leave">LEAVE MATCH</button></div></div>';
    root2.innerHTML = h; document.body.appendChild(root2);
    if (d.mvp) { const slot = $('mvp-av'); if (slot) slot.appendChild(avatar(d.mvp.char, 86, 118)); }
    $('res-again').addEventListener('click', function () {
      if (isHost()) sock.emit('room:start', {}, function (r) { if (r && r.ok) { hideResults(); screen = 'room'; showRoomScreen(); } else if (r) toast(r.error); });
      else { wantAgain = true; this.textContent = 'WAITING FOR HOST…'; this.disabled = true; hideResultsToLobby(true); }
    });
    $('res-lobby').addEventListener('click', function () { hideResultsToLobby(false); });
    $('res-leave').addEventListener('click', function () { hideResults(); leaveToMenu(); });
  }
  function hideResultsToLobby(waiting) {
    hideResults(); SZ.MPG.exit();      // back to the menu scene underneath
    screen = 'room'; root.classList.remove('hidden'); showRoomScreen();
    if (waiting) toast('Waiting for the host to start the next match');
  }
  function leaveToMenu() {
    if (sock && connected) sock.emit('room:leave');
    room = null; results = null; SZ.MPG.exit(); closeLobby();
  }

  /* ---------------- open / close ---------------- */
  function openLobby() {
    buildRoot();
    me.char = parseInt(load('strikezone_mpchar') || (load('strikezone_settings_v2') ? (JSON.parse(load('strikezone_settings_v2')).char || 0) : 0), 10) || 0;
    me.name = myName();
    if (SZ && SZ.setChar) SZ.setChar(me.char);
    if (room && connected) showRoomScreen(); else { buildHome(); showHome(); }
    const m = /[?&]room=([A-Za-z0-9]{4,5})/.exec(location.search);
    if (m && !room) { $('mp-code').value = m[1].toUpperCase(); }
  }
  function closeLobby() { if (root) root.classList.add('hidden'); screen = 'none'; document.body.classList.remove('mp-on'); }
  MP.open = openLobby;

  function init() {
    const menu = document.querySelector('.menu-panel'), play = $('btn-play');
    if (!menu || !play || $('btn-online')) return;
    const b = el('button', null, 'ONLINE MULTIPLAYER'); b.id = 'btn-online'; b.type = 'button';
    menu.insertBefore(b, play);
    b.addEventListener('click', function () { if (window.SZ) { Sound && Sound.init && Sound.init(); openLobby(); } });
    // an invite link (?room=CODE) opens the lobby straight away
    if (/[?&]room=/.test(location.search)) setTimeout(function () { if (window.SZ) openLobby(); }, 400);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
