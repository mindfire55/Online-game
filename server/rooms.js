/* ===================== STRIKE ZONE - server/rooms.js =====================
   All multiplayer game logic: rooms, lobby, map voting, the 5 game modes,
   server-side validation of hits / kills / scores / objectives, leaderboard
   and match results.

   It only uses a tiny Socket.IO subset (io.on('connection'), socket.on/emit/
   join/leave, io.to(room).emit) so it runs on real socket.io in production
   and on the test shim in server/test/.
*/
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

/* ---------- shared weapon table (the same weapons.js the browser uses) ---------- */
function loadWeapons() {
  const src = fs.readFileSync(path.join(__dirname, '..', 'weapons.js'), 'utf8');
  return vm.runInNewContext(src + '\n;WEAPONS', {});
}
const WEAPONS = loadWeapons();

const MAPS = [
  { id: 'dust', name: 'Dusty Outpost' },
  { id: 'jungle', name: 'Green Valley' },
  { id: 'yard', name: 'Container Yard' },
  { id: 'snow', name: 'Frozen Base' }
];
const HALF = 80;
const TRAIN = { cx: -45, cz: 48, r: 26 };            // safe training area (same on every map)

const MODES = {
  ffa:      { id: 'ffa',      name: 'Free For All',     short: 'FFA',  teams: false, time: 180, desc: 'Every player for themselves. Highest score after 3:00 wins.' },
  tdm:      { id: 'tdm',      name: 'Team Deathmatch',  short: 'TDM',  teams: true,  time: 300, desc: 'Red vs Blue. Highest combined team score after 5:00 wins.' },
  ctf:      { id: 'ctf',      name: 'Capture The Flag', short: 'CTF',  teams: true,  time: 600, capLimit: 3, desc: 'Steal the enemy flag and bring it home. First team to 3 captures wins.' },
  koth:     { id: 'koth',     name: 'King of the Hill', short: 'KOTH', teams: true,  time: 300, hillTarget: 200, desc: 'Hold the hill in the middle of the map to score. First team to 200 points (or the most points at 5:00) wins.' },
  gungame:  { id: 'gungame',  name: 'Gun Game',         short: 'GG',   teams: false, time: 600, desc: 'Everyone starts with a pistol. Each kill upgrades your weapon. First to finish the ladder wins.' }
};
const LADDER = ['glock', 'mp5', 'vector', 'pump', 'ak47', 'm4a1', 'scar', 'm249', 'kar98', 'katana'];
const STD_LOADOUT = ['ak47', 'pump', 'glock', 'bat'];   // allowed weapons in the other modes

/* ---------- fixed objective / spawn positions (identical on all maps; the client keeps them clear of obstacles) ---------- */
const LAYOUT = {
  flags: { red: { x: 0, z: -58 }, blue: { x: 0, z: 58 } },
  hill: { x: 0, z: 0, r: 9 },
  spawnsFFA: [[58, 0], [41, -41], [0, -58], [-41, -41], [-58, 0], [0, 38], [30, 30], [-30, -10], [20, -25], [58, 40]],
  spawnsRed: [[-24, -66], [-12, -66], [0, -66], [12, -66], [24, -66]],
  spawnsBlue: [[-4, 66], [6, 66], [16, 66], [26, 66], [36, 66]]
};

const SETTINGS = {
  maxPlayers: 12, respawn: 3.0, protect: 2.0, countdown: 5, loadTimeout: 8,
  killPoints: 100, headBonus: 50, capPoints: 500, returnPoints: 50, carrierKill: 100, hillPoints: 10,
  flagAutoReturn: 20, maxSpeed: 48, tickHz: 20, lbHz: 4
};

const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function makeCode(taken) {
  for (let t = 0; t < 200; t++) {
    let c = '';
    for (let i = 0; i < 5; i++) c += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    if (!taken[c]) return c;
  }
  return null;
}
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const num = (v, d) => (typeof v === 'number' && isFinite(v) ? v : d);
const cleanName = (n) => String(n || '').replace(/[^\w \-.]/g, '').trim().slice(0, 16) || 'Player';
const r2 = (v) => Math.round(v * 100) / 100;

function attach(io, opts) {
  opts = opts || {};
  const now = opts.now || (() => Date.now() / 1000);
  const rooms = {};          // code -> room
  const byId = {};           // socket id -> player

  /* ---------------- helpers ---------------- */
  function roomOf(p) { return p && p.room ? rooms[p.room] : null; }
  function list(room) { return Object.values(room.players); }
  function emitRoom(room, ev, data) { io.to(room.code).emit(ev, data); }
  function modeOf(room) { return MODES[room.mode]; }
  function isTeamMode(room) { return !!modeOf(room).teams; }
  function sendTo(p, ev, data) { if (p.socket) p.socket.emit(ev, data); }

  function assignTeams(room) {
    const ps = list(room);
    if (!isTeamMode(room)) { ps.forEach((p) => { p.team = null; }); return; }
    let r = ps.filter((p) => p.team === 'red').length, b = ps.filter((p) => p.team === 'blue').length;
    // keep existing teams if balanced, otherwise rebalance
    ps.forEach((p) => { if (p.team !== 'red' && p.team !== 'blue') p.team = r <= b ? (r++, 'red') : (b++, 'blue'); });
    r = ps.filter((p) => p.team === 'red').length; b = ps.filter((p) => p.team === 'blue').length;
    while (Math.abs(r - b) > 1) {
      const from = r > b ? 'red' : 'blue', to = r > b ? 'blue' : 'red';
      const mv = ps.filter((p) => p.team === from).pop();
      mv.team = to;
      r = ps.filter((p) => p.team === 'red').length; b = ps.filter((p) => p.team === 'blue').length;
    }
  }

  function lobbyState(room) {
    const votes = [0, 0, 0, 0];
    list(room).forEach((p) => { if (p.vote >= 0) votes[p.vote]++; });
    return {
      code: room.code, host: room.host, mode: room.mode, state: room.state,
      countdownEnd: room.state === 'countdown' ? room.countdownEnd : 0, serverNow: now(),
      maps: MAPS.map((m, i) => ({ id: m.id, name: m.name, votes: votes[i] })),
      modes: Object.values(MODES).map((m) => ({ id: m.id, name: m.name, short: m.short, teams: m.teams, time: m.time, desc: m.desc })),
      lastMap: room.map,
      players: list(room).map((p) => ({ id: p.id, name: p.name, char: p.char, team: p.team, vote: p.vote, host: p.id === room.host, ping: p.ping || 0 })),
      max: SETTINGS.maxPlayers
    };
  }
  function pushLobby(room) { emitRoom(room, 'room:state', lobbyState(room)); }

  /* ---------------- room management ---------------- */
  function newPlayer(socket, data) {
    return {
      id: socket.id, socket: socket, name: cleanName(data && data.name), char: clamp(Math.floor(num(data && data.char, 0)), 0, 3),
      room: null, team: null, vote: -1,
      x: 0, y: 0, z: 0, yaw: 0, pitch: 0, spd: 0, fl: 0, hp: 100, alive: false, respawnAt: 0, protectUntil: 0,
      kills: 0, deaths: 0, score: 0, hs: 0, shots: 0, hits: 0, dmg: 0, streak: 0, bestStreak: 0, level: 0, caps: 0, returns: 0, hillSec: 0,
      w: 'glock', credits: 0, creditExp: 0, lastShotAt: 0, iframeUntil: 0, dodgeCd: 0, loaded: false, lastStateAt: 0, carrying: null
    };
  }
  function joinRoom(p, room) {
    room.players[p.id] = p; p.room = room.code; p.socket.join(room.code);
    assignTeams(room);
  }
  function leaveRoom(p) {
    const room = roomOf(p);
    if (!room) return;
    p.socket.leave(room.code);
    delete room.players[p.id];
    p.room = null;
    if (room.state === 'playing' || room.state === 'loading') dropFlagOf(room, p);
    const ps = list(room);
    if (!ps.length) { delete rooms[room.code]; return; }
    if (room.host === p.id) room.host = ps[0].id;
    assignTeams(room);
    if (room.state === 'countdown' && ps.length < 1) room.state = 'lobby';
    pushLobby(room);
    if (room.state === 'playing') {
      emitRoom(room, 'ev:feed', { t: 'leave', name: p.name });
      checkEnd(room);
    }
  }

  /* ---------------- match lifecycle ---------------- */
  function pickMap(room) {
    const votes = [0, 0, 0, 0];
    list(room).forEach((p) => { if (p.vote >= 0) votes[p.vote]++; });
    const best = Math.max.apply(null, votes);
    const top = votes.map((v, i) => (v === best ? i : -1)).filter((i) => i >= 0);
    return top[Math.floor(Math.random() * top.length)];
  }
  function startCountdown(room) {
    room.state = 'countdown';
    room.countdownEnd = now() + SETTINGS.countdown;
    pushLobby(room);
  }
  function spawnPoint(room, p) {
    if (isTeamMode(room)) {
      const pool = p.team === 'red' ? LAYOUT.spawnsRed : LAYOUT.spawnsBlue;
      return pool[Math.floor(Math.random() * pool.length)];
    }
    // free-for-all style: choose the spawn furthest from living enemies
    let best = LAYOUT.spawnsFFA[0], bd = -1;
    LAYOUT.spawnsFFA.forEach((s) => {
      let d = 1e9;
      list(room).forEach((o) => { if (o !== p && o.alive) d = Math.min(d, Math.hypot(o.x - s[0], o.z - s[1])); });
      d += Math.random() * 6;
      if (d > bd) { bd = d; best = s; }
    });
    return best;
  }
  function weaponFor(room, p) { return room.mode === 'gungame' ? LADDER[p.level] : null; }
  function respawn(room, p, first) {
    const s = spawnPoint(room, p);
    p.x = s[0]; p.z = s[1]; p.y = 0; p.hp = 100; p.alive = true; p.fl = 0;
    const toward = isTeamMode(room) ? (p.team === 'red' ? 0 : Math.PI) : Math.atan2(-s[0], -s[1]);
    p.yaw = toward; p.pitch = 0;
    p.protectUntil = now() + SETTINGS.protect;
    p.credits = 0;
    if (room.mode === 'gungame') p.w = LADDER[p.level];
    emitRoom(room, 'ev:respawn', { id: p.id, x: s[0], z: s[1], yaw: p.yaw, hp: 100, w: weaponFor(room, p), first: !!first });
  }
  function startMatch(room) {
    room.map = pickMap(room);
    room.state = 'loading';
    room.loadEnd = now() + SETTINGS.loadTimeout;
    const M = modeOf(room);
    room.match = {
      mode: room.mode, map: room.map, startedAt: 0, endsAt: 0, timeLeft: M.time, duration: M.time,
      flags: { red: { state: 'home', x: LAYOUT.flags.red.x, z: LAYOUT.flags.red.z, carrier: null, returnAt: 0 }, blue: { state: 'home', x: LAYOUT.flags.blue.x, z: LAYOUT.flags.blue.z, carrier: null, returnAt: 0 } },
      caps: { red: 0, blue: 0 }, hill: { red: 0, blue: 0 }, owner: null, hillAcc: 0, ended: false, feedKills: 0, lbAcc: 0, firstBlood: false
    };
    assignTeams(room);
    list(room).forEach((p) => {
      Object.assign(p, { kills: 0, deaths: 0, score: 0, hs: 0, shots: 0, hits: 0, dmg: 0, streak: 0, bestStreak: 0, level: 0, caps: 0, returns: 0, hillSec: 0, loaded: false, carrying: null, w: room.mode === 'gungame' ? LADDER[0] : 'ak47' });
      respawn(room, p, true);
      p.protectUntil = now() + 999;           // protected until the match really begins
    });
    emitRoom(room, 'match:start', {
      mode: room.mode, mapIndex: room.map, mapId: MAPS[room.map].id, time: M.time, layout: LAYOUT, ladder: LADDER, loadout: STD_LOADOUT,
      capLimit: M.capLimit || 0, hillTarget: M.hillTarget || 0,
      players: list(room).map((p) => ({ id: p.id, name: p.name, char: p.char, team: p.team, x: p.x, z: p.z, yaw: p.yaw, w: p.w }))
    });
  }
  function beginPlay(room) {
    room.state = 'playing';
    room.match.startedAt = now();
    list(room).forEach((p) => { p.protectUntil = now() + SETTINGS.protect; });
    emitRoom(room, 'match:go', { serverNow: now(), time: room.match.timeLeft });
  }

  /* ---------------- scoring ---------------- */
  function teamScore(room, team) {
    return list(room).filter((p) => p.team === team).reduce((s, p) => s + p.score, 0);
  }
  function ranking(room) {
    return list(room).slice().sort((a, b) => b.score - a.score || b.kills - a.kills || a.deaths - b.deaths || (a.name < b.name ? -1 : 1));
  }
  function lbData(room) {
    const rk = ranking(room);
    const m = room.match || {};
    return {
      rows: rk.map((p, i) => ({ rank: i + 1, id: p.id, name: p.name, team: p.team, kills: p.kills, deaths: p.deaths, score: p.score, lvl: p.level, ping: p.ping || 0 })),
      teams: isTeamMode(room) ? { red: room.mode === 'ctf' ? (m.caps ? m.caps.red : 0) : room.mode === 'koth' ? m.hill.red : teamScore(room, 'red'), blue: room.mode === 'ctf' ? (m.caps ? m.caps.blue : 0) : room.mode === 'koth' ? m.hill.blue : teamScore(room, 'blue') } : null,
      teamPts: isTeamMode(room) ? { red: teamScore(room, 'red'), blue: teamScore(room, 'blue') } : null
    };
  }
  function pushLb(room) { emitRoom(room, 'lb', lbData(room)); }

  /* ---------------- damage / kills ---------------- */
  function sameTeam(room, a, b) { return isTeamMode(room) && a.team && a.team === b.team; }
  function inTraining(p) { return Math.hypot(p.x - TRAIN.cx, p.z - TRAIN.cz) < TRAIN.r; }
  function allowedWeapon(room, p, w) {
    if (!WEAPONS[w]) return false;
    if (room.mode === 'gungame') return w === LADDER[p.level];
    return STD_LOADOUT.indexOf(w) >= 0;
  }

  function dropFlagOf(room, p) {
    if (!room.match || !p.carrying) return;
    const f = room.match.flags[p.carrying];
    if (f && f.carrier === p.id) {
      f.state = 'dropped'; f.carrier = null; f.x = p.x; f.z = p.z; f.returnAt = now() + SETTINGS.flagAutoReturn;
      emitRoom(room, 'ev:flag', { team: p.carrying, state: 'dropped', x: f.x, z: f.z, by: p.name });
    }
    p.carrying = null;
  }

  function kill(room, victim, killer, w, head) {
    victim.alive = false; victim.hp = 0; victim.deaths++; victim.streak = 0;
    victim.respawnAt = now() + SETTINGS.respawn;
    const carried = victim.carrying;
    dropFlagOf(room, victim);
    let pts = 0;
    if (killer && killer !== victim) {
      killer.kills++; killer.streak++; killer.bestStreak = Math.max(killer.bestStreak, killer.streak);
      if (head) killer.hs++;
      pts = SETTINGS.killPoints + (head ? SETTINGS.headBonus : 0) + (carried ? SETTINGS.carrierKill : 0);
      killer.score += pts;
      if (room.mode === 'gungame') {
        if (killer.level >= LADDER.length - 1) { killer.level = LADDER.length; endMatch(room, 'ladder', killer); }
        else { killer.level++; killer.w = LADDER[killer.level]; sendTo(killer, 'ev:level', { level: killer.level, w: killer.w, of: LADDER.length }); }
      }
    } else if (room.mode === 'gungame' && victim.level > 0 && !killer) { /* suicide: no change */ }
    const first = !room.match.firstBlood && killer && killer !== victim;
    if (first) room.match.firstBlood = true;
    emitRoom(room, 'ev:kill', { k: killer ? killer.id : null, kn: killer ? killer.name : null, v: victim.id, vn: victim.name, w: w, head: !!head, pts: pts, streak: killer ? killer.streak : 0, first: !!first, kt: killer ? killer.team : null, vt: victim.team });
    pushLb(room);
    if (!room.match.ended) checkEnd(room);
  }

  function applyDamage(room, attacker, victim, dmg, head, w) {
    victim.hp -= dmg;
    attacker.dmg += dmg; attacker.hits++;
    sendTo(victim, 'ev:hit', { from: attacker.id, dmg: Math.round(dmg), hp: Math.max(0, Math.round(victim.hp)), head: !!head, x: attacker.x, z: attacker.z });
    sendTo(attacker, 'ev:hitmark', { id: victim.id, head: !!head, kill: victim.hp <= 0, dmg: Math.round(dmg) });
    if (victim.hp <= 0) kill(room, victim, attacker, w, head);
  }

  /* ---------------- end of match ---------------- */
  function winnerOf(room, forced) {
    const m = room.match;
    if (forced && room.mode !== 'ctf') return { type: 'player', id: forced.id };
    if (!isTeamMode(room)) {
      const rk = ranking(room);
      if (room.mode === 'gungame') {
        const g = rk.slice().sort((a, b) => b.level - a.level || b.score - a.score || b.kills - a.kills)[0];
        return g ? { type: 'player', id: g.id } : { type: 'draw' };
      }
      return rk.length ? { type: 'player', id: rk[0].id } : { type: 'draw' };
    }
    let r, b;
    if (room.mode === 'ctf') { r = m.caps.red; b = m.caps.blue; if (r === b) { r = teamScore(room, 'red'); b = teamScore(room, 'blue'); } }
    else if (room.mode === 'koth') { r = m.hill.red; b = m.hill.blue; if (r === b) { r = teamScore(room, 'red'); b = teamScore(room, 'blue'); } }
    else { r = teamScore(room, 'red'); b = teamScore(room, 'blue'); }
    return r === b ? { type: 'draw' } : { type: 'team', team: r > b ? 'red' : 'blue' };
  }

  function endMatch(room, reason, forced) {
    const m = room.match;
    if (!m || m.ended) return;
    m.ended = true;
    room.state = 'results';
    const dur = Math.round(Math.max(0, Math.min(m.duration, now() - m.startedAt)));
    const win = winnerOf(room, forced);
    let rk = ranking(room);
    if (room.mode === 'gungame') rk = rk.slice().sort((a, b) => b.level - a.level || b.score - a.score || b.kills - a.kills || a.deaths - b.deaths);
    let mvp = null;
    const pool = win.type === 'team' ? rk.filter((p) => p.team === win.team) : win.type === 'player' ? rk.filter((p) => p.id === win.id) : rk;
    const best = (pool.length ? pool : rk).slice().sort((a, b) => (b.score + b.kills * 10 + b.caps * 100 - b.deaths * 5) - (a.score + a.kills * 10 + a.caps * 100 - a.deaths * 5))[0];
    if (best) mvp = { id: best.id, name: best.name, team: best.team, char: best.char, kills: best.kills, deaths: best.deaths, score: best.score, caps: best.caps };
    const bestStreak = rk.slice().sort((a, b) => b.bestStreak - a.bestStreak)[0];
    const res = {
      mode: room.mode, modeName: modeOf(room).name, mapId: MAPS[room.map].id, mapName: MAPS[room.map].name, reason: reason, duration: dur,
      winner: win, teams: isTeamMode(room) ? lbData(room).teams : null, teamPts: isTeamMode(room) ? { red: teamScore(room, 'red'), blue: teamScore(room, 'blue') } : null,
      capLimit: modeOf(room).capLimit || 0,
      ranking: rk.map((p, i) => ({
        rank: i + 1, id: p.id, name: p.name, team: p.team, char: p.char, kills: p.kills, deaths: p.deaths, score: p.score,
        headshots: p.hs, accuracy: p.shots ? Math.round(p.hits / p.shots * 100) : 0, kd: r2(p.deaths ? p.kills / p.deaths : p.kills),
        bestStreak: p.bestStreak, damage: Math.round(p.dmg), caps: p.caps, hillSec: Math.round(p.hillSec), level: p.level
      })),
      mvp: mvp,
      stats: {
        totalKills: rk.reduce((s, p) => s + p.kills, 0), totalHeadshots: rk.reduce((s, p) => s + p.hs, 0),
        bestStreak: bestStreak ? { name: bestStreak.name, n: bestStreak.bestStreak } : null, players: rk.length
      }
    };
    room.lastResults = res;
    emitRoom(room, 'match:end', res);
    pushLobby(room);
  }
  function checkEnd(room) {
    const m = room.match, M = modeOf(room);
    if (!m || m.ended || room.state !== 'playing') return;
    if (list(room).length === 0) return;
    if (room.mode === 'ctf' && (m.caps.red >= M.capLimit || m.caps.blue >= M.capLimit)) return endMatch(room, 'caps');
    if (room.mode === 'koth' && (m.hill.red >= M.hillTarget || m.hill.blue >= M.hillTarget)) return endMatch(room, 'hill');
    if (m.timeLeft <= 0) return endMatch(room, 'time');
  }

  /* ---------------- per-tick simulation ---------------- */
  function tickRoom(room, dt) {
    const t = now();
    if (room.state === 'countdown') {
      if (t >= room.countdownEnd) startMatch(room);
      return;
    }
    if (room.state === 'loading') {
      const everyone = list(room).every((p) => p.loaded);
      if (everyone || t >= room.loadEnd) beginPlay(room);
      return;
    }
    if (room.state !== 'playing') return;
    const m = room.match;
    m.timeLeft = Math.max(0, m.timeLeft - dt);
    const ps = list(room);

    // respawns
    ps.forEach((p) => { if (!p.alive && t >= p.respawnAt) respawn(room, p, false); });

    // CTF
    if (room.mode === 'ctf') {
      ['red', 'blue'].forEach((team) => {
        const f = m.flags[team], enemy = team === 'red' ? 'blue' : 'red', home = LAYOUT.flags[team];
        if (f.state === 'carried') {
          const c = room.players[f.carrier];
          if (!c || !c.alive) { f.state = 'dropped'; f.carrier = null; f.returnAt = t + SETTINGS.flagAutoReturn; }
          else { f.x = c.x; f.z = c.z; }
        }
        if (f.state === 'dropped' && t >= f.returnAt) { f.state = 'home'; f.x = home.x; f.z = home.z; emitRoom(room, 'ev:flag', { team: team, state: 'home', auto: true }); }
        ps.forEach((p) => {
          if (!p.alive) return;
          const d = Math.hypot(p.x - f.x, p.z - f.z);
          if (d > 2.6) return;
          if (p.team === enemy && f.state !== 'carried' && !p.carrying) {            // steal
            f.state = 'carried'; f.carrier = p.id; p.carrying = team;
            emitRoom(room, 'ev:flag', { team: team, state: 'carried', by: p.name, byId: p.id });
          } else if (p.team === team && f.state === 'dropped') {                     // return own flag
            f.state = 'home'; f.x = home.x; f.z = home.z; f.carrier = null;
            p.score += SETTINGS.returnPoints; p.returns++;
            emitRoom(room, 'ev:flag', { team: team, state: 'home', by: p.name, returned: true });
          }
        });
      });
      // capture: carrier of enemy flag reaches own flag while it is at home
      ps.forEach((p) => {
        if (!p.alive || !p.carrying) return;
        const own = m.flags[p.team];
        if (own.state !== 'home') return;
        if (Math.hypot(p.x - LAYOUT.flags[p.team].x, p.z - LAYOUT.flags[p.team].z) < 3.2) {
          const stolen = m.flags[p.carrying];
          stolen.state = 'home'; stolen.carrier = null; stolen.x = LAYOUT.flags[p.carrying].x; stolen.z = LAYOUT.flags[p.carrying].z;
          p.carrying = null; p.caps++; p.score += SETTINGS.capPoints; m.caps[p.team]++;
          emitRoom(room, 'ev:flag', { team: p.team === 'red' ? 'blue' : 'red', state: 'home', captured: true, by: p.name, capTeam: p.team, caps: m.caps });
          pushLb(room);
        }
      });
    }

    // King of the Hill
    if (room.mode === 'koth') {
      m.hillAcc += dt;
      if (m.hillAcc >= 1) {
        m.hillAcc -= 1;
        const on = ps.filter((p) => p.alive && Math.hypot(p.x - LAYOUT.hill.x, p.z - LAYOUT.hill.z) < LAYOUT.hill.r);
        const red = on.filter((p) => p.team === 'red'), blue = on.filter((p) => p.team === 'blue');
        let owner = null;
        if (red.length && !blue.length) owner = 'red'; else if (blue.length && !red.length) owner = 'blue';
        m.owner = on.length ? (owner || 'contested') : null;
        if (owner) {
          m.hill[owner]++;
          (owner === 'red' ? red : blue).forEach((p) => { p.score += SETTINGS.hillPoints; p.hillSec++; });
        }
        pushLb(room);
      }
    }

    // periodic leaderboard
    m.lbAcc += dt;
    if (m.lbAcc >= 1 / SETTINGS.lbHz) { m.lbAcc = 0; pushLb(room); }

    broadcastSnap(room);
    checkEnd(room);
  }

  function broadcastSnap(room) {
    const m = room.match;
    const p = list(room).map((o) => [o.id, r2(o.x), r2(o.y), r2(o.z), r2(o.yaw), r2(o.pitch), r2(o.spd), o.fl | (o.alive ? 0 : 32) | (o.carrying ? 64 : 0), Math.round(o.hp), o.w]);
    const snap = { t: now(), tl: Math.round(m.timeLeft * 10) / 10, p: p, o: {} };
    if (room.mode === 'ctf') snap.o.flags = { red: pubFlag(m.flags.red), blue: pubFlag(m.flags.blue) }, snap.o.caps = m.caps;
    if (room.mode === 'koth') snap.o.hill = { owner: m.owner, red: m.hill.red, blue: m.hill.blue };
    emitRoom(room, 's', snap);
  }
  function pubFlag(f) { return { s: f.state, x: r2(f.x), z: r2(f.z), c: f.carrier }; }

  let timer = null;
  let last = now();
  function tickAll() {
    const t = now(), dt = Math.min(0.2, t - last); last = t;
    Object.keys(rooms).forEach((c) => { try { tickRoom(rooms[c], dt); } catch (e) { console.error('room tick error', e); } });
  }
  if (!opts.manualTick) timer = setInterval(tickAll, 1000 / SETTINGS.tickHz);

  /* ---------------- socket handlers ---------------- */
  io.on('connection', function (socket) {
    const p = newPlayer(socket, socket.handshake && socket.handshake.query);
    byId[socket.id] = p;
    const ack = function (cb, d) { if (typeof cb === 'function') cb(d); };

    socket.on('hello', function (d, cb) {
      p.name = cleanName(d && d.name); p.char = clamp(Math.floor(num(d && d.char, 0)), 0, 3);
      ack(cb, { ok: true, id: p.id, modes: MODES, maps: MAPS, serverNow: now() });
    });
    socket.on('ping:c', function (ts, cb) { ack(cb, { serverNow: now(), ts: ts }); });
    socket.on('ping:rtt', function (ms) { p.ping = clamp(Math.round(num(ms, 0)), 0, 999); });

    socket.on('room:create', function (d, cb) {
      if (roomOf(p)) leaveRoom(p);
      p.name = cleanName(d && d.name); p.char = clamp(Math.floor(num(d && d.char, 0)), 0, 3);
      const code = makeCode(rooms);
      if (!code) return ack(cb, { ok: false, error: 'No room codes available' });
      const room = { code: code, host: p.id, mode: MODES[d && d.mode] ? d.mode : 'ffa', state: 'lobby', players: {}, map: 0, countdownEnd: 0, match: null, priv: true };
      rooms[code] = room;
      p.vote = -1;
      joinRoom(p, room);
      pushLobby(room);
      ack(cb, { ok: true, code: code, id: p.id });
    });
    socket.on('room:join', function (d, cb) {
      const code = String((d && d.code) || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
      const room = rooms[code];
      if (!room) return ack(cb, { ok: false, error: 'Room ' + code + ' not found' });
      if (room.players[p.id]) return ack(cb, { ok: true, code: code, id: p.id });
      if (room.state === 'playing' || room.state === 'loading') return ack(cb, { ok: false, error: 'A match is in progress in this room' });
      if (list(room).length >= SETTINGS.maxPlayers) return ack(cb, { ok: false, error: 'Room is full' });
      if (roomOf(p)) leaveRoom(p);
      p.name = cleanName(d && d.name); p.char = clamp(Math.floor(num(d && d.char, 0)), 0, 3);
      // unique names inside a room
      let base = p.name, n = 2;
      while (list(room).some((o) => o.name === p.name)) p.name = (base.slice(0, 13) + ' ' + n++);
      p.vote = -1;
      joinRoom(p, room);
      pushLobby(room);
      ack(cb, { ok: true, code: code, id: p.id });
    });
    socket.on('room:leave', function (d, cb) { leaveRoom(p); ack(cb, { ok: true }); });
    socket.on('room:setMode', function (mode) {
      const room = roomOf(p);
      if (!room || room.host !== p.id || (room.state !== 'lobby' && room.state !== 'results') || !MODES[mode]) return;
      room.mode = mode; assignTeams(room); pushLobby(room);
    });
    socket.on('room:vote', function (i) {
      const room = roomOf(p);
      if (!room || (room.state !== 'lobby' && room.state !== 'results')) return;
      i = Math.floor(num(i, -1));
      p.vote = i >= 0 && i < MAPS.length ? i : -1;
      pushLobby(room);
    });
    socket.on('room:setChar', function (c) {
      const room = roomOf(p);
      p.char = clamp(Math.floor(num(c, 0)), 0, 3);
      if (room) pushLobby(room);
    });
    socket.on('room:swapTeam', function () {
      const room = roomOf(p);
      if (!room || !isTeamMode(room) || (room.state !== 'lobby' && room.state !== 'results')) return;
      const to = p.team === 'red' ? 'blue' : 'red';
      const cnt = list(room).filter((o) => o.team === to).length, mine = list(room).filter((o) => o.team === p.team).length;
      if (cnt + 1 > mine) return;     // would unbalance the teams
      p.team = to; pushLobby(room);
    });
    socket.on('room:start', function (d, cb) {
      const room = roomOf(p);
      if (!room) return ack(cb, { ok: false, error: 'Not in a room' });
      if (room.host !== p.id) return ack(cb, { ok: false, error: 'Only the host can start the match' });
      if (room.state !== 'lobby' && room.state !== 'results') return ack(cb, { ok: false, error: 'Already starting' });
      startCountdown(room);
      ack(cb, { ok: true });
    });
    socket.on('room:cancel', function () {
      const room = roomOf(p);
      if (room && room.host === p.id && room.state === 'countdown') { room.state = 'lobby'; pushLobby(room); }
    });
    socket.on('match:ready', function () { p.loaded = true; });

    /* ----- in-match ----- */
    socket.on('p:state', function (s) {
      const room = roomOf(p);
      if (!room || !s || room.state === 'lobby') return;
      if (!p.alive) return;
      const t = now();
      const nx = clamp(num(s.x, p.x), -HALF, HALF), nz = clamp(num(s.z, p.z), -HALF, HALF), ny = clamp(num(s.y, 0), -1, 30);
      const dt = Math.max(0.02, Math.min(1, t - (p.lastStateAt || t - 0.05)));
      const d = Math.hypot(nx - p.x, nz - p.z);
      if (p.lastStateAt && d > SETTINGS.maxSpeed * dt + 3) {                // speed hack / teleport: snap the client back
        socket.emit('ev:correct', { x: p.x, z: p.z });
        return;
      }
      p.lastStateAt = t;
      p.x = nx; p.y = ny; p.z = nz; p.yaw = num(s.yaw, p.yaw); p.pitch = clamp(num(s.pitch, 0), -1.6, 1.6);
      p.spd = clamp(num(s.spd, 0), 0, 40); p.fl = (s.fl | 0) & 31;
      if (typeof s.w === 'string' && allowedWeapon(room, p, s.w)) p.w = s.w;
    });
    socket.on('p:loaded', function () { p.loaded = true; });
    socket.on('p:dodge', function () {
      const t = now();
      if (t < p.dodgeCd) return;
      p.dodgeCd = t + 0.9; p.iframeUntil = t + 0.4;
    });
    socket.on('p:shoot', function (d) {
      const room = roomOf(p);
      if (!room || room.state !== 'playing' || !p.alive) return;
      const w = d && d.w;
      if (!allowedWeapon(room, p, w)) return;
      const W = WEAPONS[w], t = now();
      const min = (W.type === 'gun' || W.type === 'pistol') ? 60 / W.rpm * 0.7 : (W.cooldown || 0.4) * 0.7;
      if (t - p.lastShotAt < min) return;                    // firing faster than the weapon allows
      p.lastShotAt = t;
      p.shots++;
      p.credits = W.pellets || 1; p.creditExp = t + 0.6;     // hit claims can only be spent on a real shot
      socket.to ? socket.to(room.code).emit('ev:shot', { id: p.id, w: w }) : null;
    });
    socket.on('p:hit', function (d) {
      const room = roomOf(p);
      if (!room || room.state !== 'playing' || !p.alive || !d) return;
      const t = now();
      const v = room.players[d.t];
      if (!v || v === p || !v.alive || sameTeam(room, p, v)) return;
      if (t < v.protectUntil || t < v.iframeUntil) return;
      if (inTraining(p) || inTraining(v)) return;
      const w = d.w;
      if (!allowedWeapon(room, p, w)) return;
      const W = WEAPONS[w];
      if (!(t <= p.creditExp && p.credits > 0)) {
        if (W.type === 'gun' || W.type === 'pistol') return;
      }
      if (W.type === 'gun' || W.type === 'pistol') p.credits--;
      else {
        if (t - (p.lastMelee || 0) < (W.cooldown || 0.4) * 0.7) return;     // swinging faster than the weapon allows
        p.lastMelee = t;
      }
      const dist = Math.hypot(p.x - v.x, p.z - v.z);
      const reach = (W.range || 2.5) + (W.type === 'gun' || W.type === 'pistol' ? 6 : 3.5);
      if (dist > reach) return;                              // too far for that weapon (with a little lag tolerance)
      const part = d.part === 'head' ? 'head' : d.part === 'limb' ? 'limb' : 'body';
      const mult = part === 'head' ? 2.5 : part === 'limb' ? 0.75 : 1;
      const range = W.range || 100;
      const fall = (W.type === 'gun' || W.type === 'pistol') ? clamp(1 - 0.45 * clamp(dist / range, 0, 1) * (W.pellets > 1 ? 2 : 1), 0.3, 1) : 1;
      applyDamage(room, p, v, W.dmg * mult * fall, part === 'head', w);
    });
    socket.on('p:respawnNow', function () { /* respawn timing is server-controlled */ });

    socket.on('disconnect', function () {
      leaveRoom(p);
      delete byId[socket.id];
    });
  });

  return { rooms: rooms, tickAll: tickAll, tickRoom: tickRoom, SETTINGS: SETTINGS, stop: function () { if (timer) clearInterval(timer); }, WEAPONS: WEAPONS, MODES: MODES, LAYOUT: LAYOUT, LADDER: LADDER, STD_LOADOUT: STD_LOADOUT };
}

module.exports = { attach: attach, MODES: MODES, MAPS: MAPS, LAYOUT: LAYOUT, LADDER: LADDER, WEAPONS: WEAPONS, SETTINGS: SETTINGS, TRAIN: TRAIN };
