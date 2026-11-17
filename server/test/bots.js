/* Multiplayer logic test: several simulated players, every game mode.
   Run:  node test/bots.js     (uses real socket.io-client/socket.io when installed, else the shim) */
'use strict';
const http = require('http');
let FakeIO, ioClient, RealServer = null;
try { RealServer = require('socket.io').Server; ioClient = require('socket.io-client').io; console.log('[using real socket.io]'); } catch (e) { ({ FakeIO, ioClient } = require('./fake-socketio')); console.log('[using test shim - socket.io not installed]'); }
const { attach, LAYOUT, LADDER } = require('../rooms');

let T = 1000;                                   // fake clock (seconds)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
function check(n, ok, x) { ok ? pass++ : fail++; console.log((ok ? 'PASS ' : 'FAIL ') + n + (x !== undefined ? '  -> ' + (typeof x === 'string' ? x : JSON.stringify(x)) : '')); }

class Bot {
  constructor(url, name, char) {
    this.name = name; this.char = char; this.lobby = null; this.lb = null; this.snap = null; this.results = null; this.start = null; this.events = []; this.hp = 100; this.go = false;
    this.s = ioClient(url);
    this.s.on('room:state', (d) => { this.lobby = d; });
    this.s.on('lb', (d) => { this.lb = d; });
    this.s.on('s', (d) => { this.snap = d; });
    this.s.on('match:start', (d) => { this.start = d; this.s.emit('p:loaded'); });
    this.s.on('match:go', () => { this.go = true; });
    this.s.on('match:end', (d) => { this.results = d; });
    ['ev:kill', 'ev:hit', 'ev:hitmark', 'ev:respawn', 'ev:level', 'ev:flag', 'ev:shot', 'ev:correct', 'ev:feed'].forEach((e) => this.s.on(e, (d) => { this.events.push([e, d]); if (e === 'ev:hit') this.hp = d.hp; if (e === 'ev:respawn' && d.id === this.id) { this.hp = 100; this._x = d.x; this._z = d.z; } }));
  }
  get id() { return this.s.id; }
  call(ev, d) { return new Promise((r) => this.s.emit(ev, d, r)); }
  ev(name) { return this.events.filter((e) => e[0] === name).map((e) => e[1]); }
  state(x, z, extra) { this.s.emit('p:state', Object.assign({ x: x, y: 0, z: z, yaw: 0, pitch: 0, spd: 0, fl: 0 }, extra || {})); }
}

(async () => {
  const srv = http.createServer();
  const io = RealServer ? new RealServer(srv, { cors: { origin: '*' } }) : new FakeIO(srv);
  const game = attach(io, { now: () => T, manualTick: true });
  await new Promise((r) => srv.listen(0, r));
  const url = 'http://localhost:' + srv.address().port;
  const adv = async (sec, step) => { step = step || 0.05; for (let t = 0; t < sec; t += step) { T += step; game.tickAll(); if (Math.round(t / step) % 10 === 0) await sleep(2); } await sleep(40); };

  /* ---------------- lobby ---------------- */
  const host = new Bot(url, 'Hunter', 0), b1 = new Bot(url, 'Bravo', 1), b2 = new Bot(url, 'Cobra', 2), b3 = new Bot(url, 'Delta', 3);
  await sleep(120);
  const r0 = await host.call('room:create', { name: 'Hunter', char: 0 });
  check('host creates a room with a 5-char code', r0.ok && /^[A-Z2-9]{5}$/.test(r0.code), r0.code);
  const bad = await b1.call('room:join', { code: 'ZZZZZ', name: 'Bravo', char: 1 });
  check('joining a wrong code fails', !bad.ok, bad.error);
  for (const [b, n, c] of [[b1, 'Bravo', 1], [b2, 'Cobra', 2], [b3, 'Delta', 3]]) { const r = await b.call('room:join', { code: r0.code.toLowerCase(), name: n, char: c }); if (!r.ok) console.log(r); }
  await sleep(60);
  check('all 4 players see each other in the lobby', [host, b1, b2, b3].every((b) => b.lobby && b.lobby.players.length === 4));
  check('host flag is correct', host.lobby.host === host.id && host.lobby.players.find((p) => p.host).name === 'Hunter');
  check('characters are synced in the lobby', JSON.stringify(b1.lobby.players.map((p) => p.char)) === '[0,1,2,3]');
  b1.s.emit('room:setMode', 'tdm'); await sleep(40);
  check('non-host cannot change the mode', host.lobby.mode === 'ffa');
  host.s.emit('room:setMode', 'tdm'); await sleep(40);
  check('host changes mode; everyone sees it', [host, b1, b2, b3].every((b) => b.lobby.mode === 'tdm'));
  const tc = host.lobby.players.reduce((a, p) => { a[p.team] = (a[p.team] || 0) + 1; return a; }, {});
  check('teams are balanced 2v2 in TDM', tc.red === 2 && tc.blue === 2, tc);
  host.s.emit('room:vote', 2); b1.s.emit('room:vote', 2); b2.s.emit('room:vote', 1); b3.s.emit('room:vote', 2); await sleep(40);
  check('map votes are counted (Container Yard=3)', host.lobby.maps[2].votes === 3 && host.lobby.maps[1].votes === 1);
  const nostart = await b1.call('room:start'); check('non-host cannot start', !nostart.ok, nostart.error);
  const late = new Bot(url, 'Late', 0); await sleep(80);

  /* ---------------- helpers for matches ---------------- */
  async function runStart(mode, votes) {
    [host, b1, b2, b3].forEach((b) => { b._x = undefined; b._z = undefined; b.start = null; b.results = null; b.events = []; b.go = false; b.lb = null; });
    host.s.emit('room:setMode', mode); await sleep(30);
    [host, b1, b2, b3].forEach((b, i) => b.s.emit('room:vote', votes[i % votes.length])); await sleep(30);
    const r = await host.call('room:start');
    check('[' + mode + '] host starts -> countdown', r.ok && host.lobby.state === 'countdown');
    await adv(2);
    check('[' + mode + '] countdown not finished after 2s', !host.start);
    await adv(3.5);
    check('[' + mode + '] all clients receive match:start with same map/mode', [host, b1, b2, b3].every((b) => b.start && b.start.mode === mode && b.start.mapIndex === host.start.mapIndex), host.start && host.start.mapId);
    await adv(0.6);
    check('[' + mode + '] match begins (go) once everyone loaded', [host, b1, b2, b3].every((b) => b.go));
    await adv(2.2);                                   // spawn protection ends
  }
  const bots = [host, b1, b2, b3];
  const P = (b) => b.start.players.find((p) => p.id === b.id);
  // put two bots next to each other and make a verified shot
  async function place(a, x, z) {
    let cx = a._x !== undefined ? a._x : P(a).x, cz = a._z !== undefined ? a._z : P(a).z;
    for (let g = 0; g < 12; g++) {
      const d = Math.hypot(x - cx, z - cz); if (d < 0.01) break;
      const k = Math.min(1, 45 / d); cx += (x - cx) * k; cz += (z - cz) * k;
      T += 2; a.state(cx, cz); await sleep(12);
    }
    a._x = x; a._z = z;
  }
  async function shootHit(att, vic, w, part, n) {
    att.s.emit('p:shoot', { w: w }); att.s.emit('p:hit', { t: vic.id, w: w, part: part || 'body' }); await sleep(25); T += 0.2; game.tickAll();
  }

  /* ---------------- TDM ---------------- */
  await runStart('tdm', [2]);
  const reds = bots.filter((b) => P(b).team === 'red'), blues = bots.filter((b) => P(b).team === 'blue');
  check('[tdm] teams assigned 2v2 and spawns are on the correct sides', reds.length === 2 && blues.length === 2 && reds.every((b) => P(b).z < 0) && blues.every((b) => P(b).z > 0));
  const [R1, R2] = reds, [B1, B2] = blues;
  await place(R1, 0, -20); await place(B1, 3, -20); await place(R2, 6, -20);
  await shootHit(R1, R2, 'ak47', 'body'); await sleep(30);
  check('[tdm] friendly fire is ignored', R2.hp === 100 && R1.lb && R1.lb.rows.find((r) => r.id === R1.id).kills === 0);
  await shootHit(R1, B1, 'ak47', 'body');
  check('[tdm] valid body shot does 28 damage (server-computed)', B1.hp >= 70 && B1.hp <= 74, B1.hp);
  R1.s.emit('p:hit', { t: B1.id, w: 'ak47', part: 'body' }); await sleep(30);
  check('[tdm] a hit claim without a fired shot is rejected', B1.hp >= 70 && B1.hp <= 74, B1.hp);
  await place(R1, 0, 0); await place(B2, 79, 0); await sleep(10);
  await shootHit(R1, B2, 'pump', 'head');
  check('[tdm] out-of-range shotgun hit is rejected', B2.hp === 100, B2.hp);
  await place(B2, 5, -20);
  R1.s.emit('p:shoot', { w: 'awm' }); R1.s.emit('p:hit', { t: B2.id, w: 'awm', part: 'head' }); await sleep(30);
  check('[tdm] weapons outside the loadout are rejected', B2.hp === 100, B2.hp);
  B2.s.emit('p:dodge'); await sleep(30);
  await shootHit(R1, B2, 'ak47', 'head');
  check('[tdm] dodge i-frames block damage', B2.hp === 100, B2.hp);
  T += 1; game.tickAll(); await sleep(10);
  for (let i = 0; i < 6 && !B1.events.some((e) => e[0] === 'ev:kill'); i++) { await shootHit(R1, B1, 'ak47', 'head'); T += 0.15; }
  const killEv = R1.ev('ev:kill')[0];
  check('[tdm] kill event broadcast (killer, victim, headshot)', killEv && killEv.k === R1.id && killEv.v === B1.id && killEv.head === true, killEv);
  const row = R1.lb.rows.find((r) => r.id === R1.id), vrow = R1.lb.rows.find((r) => r.id === B1.id);
  check('[tdm] server awards 150 (kill+headshot) and tracks deaths', row.kills === 1 && row.score === 150 && vrow.deaths === 1, [row, vrow]);
  check('[tdm] team scores sync to all clients', bots.every((b) => b.lb.teams && b.lb.teams[P(R1).team] === 150), bots[0].lb.teams);
  check('[tdm] every client got the same leaderboard', new Set(bots.map((b) => JSON.stringify(b.lb.rows))).size === 1);
  await adv(3.2);
  check('[tdm] victim respawns after ~3s with protection', B1.ev('ev:respawn').some((e) => e.id === B1.id && !e.first));
  await adv(300);
  check('[tdm] match ends at 5:00 for everyone with identical results', bots.every((b) => b.results) && new Set(bots.map((b) => JSON.stringify(b.results))).size === 1);
  let res = host.results;
  check('[tdm] results: winner team Red, ranking, MVP, stats', res.winner.type === 'team' && res.winner.team === P(R1).team && res.ranking[0].id === R1.id && res.mvp.id === R1.id && res.stats.totalKills === 1 && res.ranking.length === 4 && res.duration >= 299, { w: res.winner, mvp: res.mvp && res.mvp.name, dur: res.duration });
  check('[tdm] ranking is 1..N by score then kills', res.ranking.every((r, i) => r.rank === i + 1 && (i === 0 || res.ranking[i - 1].score >= r.score)));

  /* ---------------- FFA ---------------- */
  await runStart('ffa', [0]);
  check('[ffa] no teams assigned', bots.every((b) => P(b).team === null));
  await place(host, 10, 0); await place(b1, 14, 0);
  await shootHit(host, b1, 'pump', 'body'); T += 1.2;
  for (let i = 0; i < 6 && b1.hp > 0; i++) { await shootHit(host, b1, 'ak47', 'head'); T += 0.2; }
  const hk = host.lb.rows.find((r) => r.id === host.id);
  check('[ffa] shotgun + rifle shots kill and score', hk.kills >= 1 && hk.score >= 100, hk);
  await adv(185);
  check('[ffa] ends after 3:00; top scorer wins', bots.every((b) => b.results) && host.results.winner.type === 'player' && host.results.winner.id === host.id);
  check('[ffa] Play Again: host can start from the results screen', (await host.call('room:start')).ok);
  await adv(0.5); host.s.emit('room:cancel'); await sleep(50);
  check('[ffa] countdown can be cancelled', host.lobby.state === 'lobby');

  /* ---------------- CTF ---------------- */
  await runStart('ctf', [1]);
  const cr = bots.filter((b) => P(b).team === 'red'), cb = bots.filter((b) => P(b).team === 'blue');
  const redFlag = LAYOUT.flags.red, blueFlag = LAYOUT.flags.blue;
  let caps = 0;
  for (let i = 0; i < 3; i++) {
    await place(cr[0], blueFlag.x, blueFlag.z); await adv(0.3);
    check('[ctf] #' + (i + 1) + ' red steals blue flag', host.snap.o.flags.blue.s === 'carried' && host.snap.o.flags.blue.c === cr[0].id);
    for (let k = 1; k <= 6; k++) { await place(cr[0], blueFlag.x, blueFlag.z - k * 20 / 3 * 0 - (k * 20)); T += 0.1; if (k === 3) break; }
    await place(cr[0], redFlag.x, redFlag.z); await adv(0.3);
    caps = host.snap.o.caps.red;
    check('[ctf] #' + (i + 1) + ' capture scored on server', caps === i + 1 && host.snap.o.flags.blue.s === 'home', host.snap.o.caps);
    if (i < 2) await adv(0.2);
  }
  await adv(0.6);
  check('[ctf] first to 3 captures ends the match', bots.every((b) => b.results) && host.results.winner.team === 'red' && host.results.teams.red === 3, host.results.winner);
  check('[ctf] capturer got 1500 points', host.results.ranking.find((r) => r.id === cr[0].id).score === 1500 && host.results.ranking[0].id === cr[0].id);
  // flag drop on carrier death
  await runStart('ctf', [1]);
  const c2r = bots.filter((b) => P(b).team === 'red'), c2b = bots.filter((b) => P(b).team === 'blue');
  await place(c2r[0], blueFlag.x, blueFlag.z); await adv(0.2);
  await place(c2b[0], blueFlag.x + 5, blueFlag.z - 1); await place(c2r[0], blueFlag.x, blueFlag.z - 10);
  for (let i = 0; i < 6 && c2r[0].hp > 0; i++) { await shootHit(c2b[0], c2r[0], 'ak47', 'head'); T += 0.12; }
  await sleep(40);
  check('[ctf] flag drops when its carrier dies', host.snap.o.flags.blue.s === 'dropped' || c2b[0].ev('ev:flag').some((e) => e.state === 'dropped'), host.snap && host.snap.o.flags.blue);
  await adv(0.2);
  await place(c2b[0], host.snap.o.flags.blue.x, host.snap.o.flags.blue.z); await adv(0.3);
  check('[ctf] defender returns the dropped flag', host.snap.o.flags.blue.s === 'home');
  host.s.emit('room:leave'); await sleep(30); b1.s.emit('room:leave'); b2.s.emit('room:leave'); b3.s.emit('room:leave'); await sleep(30);
  const rr = await host.call('room:create', { name: 'Hunter', char: 0 });
  for (const [b, n, c] of [[b1, 'Bravo', 1], [b2, 'Cobra', 2], [b3, 'Delta', 3]]) await b.call('room:join', { code: rr.code, name: n, char: c });
  await sleep(40);

  /* ---------------- KOTH ---------------- */
  await runStart('koth', [3]);
  const kr = bots.filter((b) => P(b).team === 'red'), kb = bots.filter((b) => P(b).team === 'blue');
  await place(kr[0], 2, 2); await place(kb[0], 40, 40); await adv(5.2);
  check('[koth] holding the hill scores team points', host.snap.o.hill.owner === 'red' && host.snap.o.hill.red >= 4, host.snap.o.hill);
  await place(kb[0], -3, 3); await adv(3.2);
  check('[koth] contested hill gives nobody points', host.snap.o.hill.owner === 'contested', host.snap.o.hill);
  await place(kb[0], 40, 40); await adv(200);
  check('[koth] first team to 200 ends the match', bots.every((b) => b.results) && host.results.winner.team === 'red' && host.results.reason === 'hill', { w: host.results.winner, r: host.results.reason, t: host.results.teams });
  check('[koth] hill time recorded per player', host.results.ranking.find((r) => r.id === kr[0].id).hillSec >= 190);

  /* ---------------- Gun Game ---------------- */
  await runStart('gungame', [0]);
  check('[gungame] everyone starts with the first ladder weapon', bots.every((b) => P(b).w === LADDER[0]), LADDER[0]);
  await place(host, 10, 0); await place(b1, 12, 0);
  // wrong weapon (rifle at level 0) is rejected
  host.s.emit('p:shoot', { w: 'ak47' }); host.s.emit('p:hit', { t: b1.id, w: 'ak47', part: 'head' }); await sleep(30);
  check('[gungame] only the current ladder weapon is accepted', b1.hp === 100);
  for (let lvl = 0; lvl < LADDER.length; lvl++) {
    const w = LADDER[lvl];
    let tries = 0;
    while (b1.hp > 0 && tries++ < 40) {
      if (w === 'katana') { host.s.emit('p:shoot', { w }); }
      await shootHit(host, b1, w, 'head'); T += 0.8;
      if (host.results) break;
    }
    if (host.results) break;
    await adv(3.2); await place(host, 10, 0); await place(b1, 12, 0);
    if (lvl === 2) check('[gungame] level-up event sent with next weapon', host.ev('ev:level').slice(-1)[0] && host.ev('ev:level').slice(-1)[0].w === LADDER[3], host.ev('ev:level').slice(-1)[0]);
  }
  await sleep(80);
  check('[gungame] completing the ladder wins the match', host.results && host.results.reason === 'ladder' && host.results.winner.id === host.id && host.results.ranking[0].id === host.id, host.results && host.results.reason);

  /* ---------------- misc ---------------- */
  const joinBack = await late.call('room:join', { code: rr.code, name: 'Late', char: 0 });
  check('a late joiner can join a room in results/lobby state', joinBack.ok, joinBack.error);
  host.s.emit('room:leave'); await sleep(60);
  check('host leaves -> host migrates to another player', b1.lobby.host !== host.id && b1.lobby.players.length === 4);
  [host, b1, b2, b3, late].forEach((b) => b.s.close());
  console.log('\nSUMMARY: ' + pass + ' passed, ' + fail + ' failed');
  game.stop(); srv.close(); process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('TEST CRASH', e); process.exit(2); });
