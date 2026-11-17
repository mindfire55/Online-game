/* ===================== STRIKE ZONE - match.js =====================
   Match rules and progression (no 3D, no HTML here - pure logic):
     - score with combo multiplier, multi-kill + kill-streak announcements
     - medals, waves
     - accuracy / damage statistics
     - XP, ranks and lifetime profile saved per username in the browser
   game.js calls these and shows the results using ui.js.
*/
const Match = (function () {
  const PROFILE_KEY = 'strikezone_profile_v1';
  const COMBO_WINDOW = 4.0;           // seconds between kills that still count as a multi-kill
  const KILLS_PER_WAVE = 10;

  const RANKS = [
    { name: 'Recruit', xp: 0 }, { name: 'Private', xp: 250 }, { name: 'Corporal', xp: 700 },
    { name: 'Sergeant', xp: 1400 }, { name: 'Staff Sergeant', xp: 2400 }, { name: 'Lieutenant', xp: 3800 },
    { name: 'Captain', xp: 5800 }, { name: 'Major', xp: 8500 }, { name: 'Colonel', xp: 12000 }, { name: 'General', xp: 17000 }
  ];
  const MULTI = { 2: 'DOUBLE KILL', 3: 'TRIPLE KILL', 4: 'QUAD KILL', 5: 'MEGA KILL', 6: 'MONSTER KILL' };
  const STREAKS = { 5: 'KILLING SPREE', 10: 'RAMPAGE', 15: 'DOMINATING', 20: 'UNSTOPPABLE', 30: 'GODLIKE', 50: 'LEGENDARY' };
  const MEDALS = {
    firstblood: { name: 'FIRST BLOOD', desc: 'First kill of the match' },
    sharp:      { name: 'SHARPSHOOTER', desc: '5 headshots' },
    deadeye:    { name: 'DEAD EYE', desc: '15 headshots' },
    longshot:   { name: 'LONG SHOT', desc: 'Kill from over 60 m' },
    backstab:   { name: 'BACKSTABBER', desc: 'Knife kill from behind' },
    heavy:      { name: 'HEAVY HITTER', desc: 'Take down a heavy' },
    untouch:    { name: 'UNTOUCHABLE', desc: '10 kills without taking damage' },
    survivor:   { name: 'SURVIVOR', desc: 'Stay alive for 5 minutes' },
    surekill:   { name: 'SURE SHOT', desc: '60% accuracy after 25 shots' },
    wave5:      { name: 'WAVE BREAKER', desc: 'Reach wave 5' },
    crowd:      { name: 'CROWD CONTROL', desc: 'Triple kill' }
  };

  let S = null, profile = null, userName = 'Player';

  function loadAll() {
    try { return JSON.parse(localStorage.getItem(PROFILE_KEY)) || {}; } catch (e) { return {}; }
  }
  function saveAll(all) { try { localStorage.setItem(PROFILE_KEY, JSON.stringify(all)); } catch (e) { /* ignore */ } }
  function blank() { return { xp: 0, kills: 0, headshots: 0, bestScore: 0, bestStreak: 0, bestWave: 1, matches: 0, playTime: 0, shots: 0, hits: 0 }; }
  function getProfile(name) {
    const all = loadAll();
    const p = Object.assign(blank(), all[name] || {});
    return p;
  }

  function rankInfo(xp) {
    let i = 0;
    for (let k = 0; k < RANKS.length; k++) if (xp >= RANKS[k].xp) i = k;
    const cur = RANKS[i], next = RANKS[i + 1];
    const stars = i === RANKS.length - 1 ? Math.floor((xp - cur.xp) / 5000) : 0;
    return {
      index: i, name: cur.name, stars: stars, xp: xp,
      floor: cur.xp, ceil: next ? next.xp : null, nextName: next ? next.name : null,
      progress: next ? (xp - cur.xp) / (next.xp - cur.xp) : ((xp - cur.xp) % 5000) / 5000
    };
  }

  function start(name) {
    userName = name || 'Player';
    profile = getProfile(userName);
    S = {
      score: 0, kills: 0, headshots: 0, melee: 0, streakKills: 0, combo: 0, comboT: 0, mult: 1,
      shots: 0, hits: 0, damage: 0, damageTaken: 0, noHitKills: 0, time: 0, wave: 1,
      bestCombo: 0, longest: 0, medals: [], medalSet: {}, headChain: 0, died: false
    };
    return S;
  }
  function state() { return S; }

  /* call every frame while playing */
  function update(dt) {
    if (!S) return [];
    S.time += dt;
    const ev = [];
    if (S.comboT > 0) {
      S.comboT -= dt;
      if (S.comboT <= 0) { S.combo = 0; S.mult = 1; }
    }
    if (S.time >= 300) { const m = award('survivor'); if (m) ev.push(m); }
    return ev;
  }

  function award(id) {
    if (!S || S.medalSet[id]) return null;
    S.medalSet[id] = true;
    S.medals.push(id);
    S.score += 50;
    return { type: 'medal', id: id, name: MEDALS[id].name, desc: MEDALS[id].desc };
  }

  function shotFired() { if (S) S.shots++; }
  function shotHit(dmg) { if (S) { S.hits++; S.damage += dmg || 0; } }
  function addDamage(d) { if (S) S.damage += d || 0; }
  function damageTaken(d) { if (S) { S.damageTaken += d; S.noHitKills = 0; } }
  function accuracy() { return S && S.shots ? S.hits / S.shots : 0; }

  /* k: { head, dist, melee, knife, backstab, kind } -> { points, mult, events[] } */
  function kill(k) {
    const ev = [];
    if (!S) return { points: 0, mult: 1, events: ev };
    S.kills++;
    S.streakKills++;
    S.noHitKills++;
    if (k.head) { S.headshots++; S.headChain++; } else S.headChain = 0;
    if (k.melee) S.melee++;
    S.longest = Math.max(S.longest, k.dist || 0);

    // combo / multi-kill
    S.combo = S.comboT > 0 ? S.combo + 1 : 1;
    S.comboT = COMBO_WINDOW;
    S.mult = Math.min(3, 1 + 0.25 * (S.combo - 1));
    S.bestCombo = Math.max(S.bestCombo, S.combo);

    let pts = 100;
    if (k.head) pts += 50;
    if (k.backstab) pts += 75;
    if (k.melee) pts += 25;
    if ((k.dist || 0) > 50) pts += 75;
    if (k.kind === 'heavy') pts += 50; else if (k.kind === 'scout') pts += 20;
    pts = Math.round(pts * S.mult);
    S.score += pts;

    if (MULTI[S.combo] || S.combo > 6) ev.push({ type: 'multi', text: MULTI[Math.min(S.combo, 6)], level: Math.min(S.combo, 6) });
    if (STREAKS[S.streakKills]) ev.push({ type: 'streak', text: STREAKS[S.streakKills], level: Math.min(5, Math.ceil(S.streakKills / 10) + 1) });

    let m;
    if (S.kills === 1 && (m = award('firstblood'))) ev.push(m);
    if (S.headshots === 5 && (m = award('sharp'))) ev.push(m);
    if (S.headshots === 15 && (m = award('deadeye'))) ev.push(m);
    if ((k.dist || 0) > 60 && (m = award('longshot'))) ev.push(m);
    if (k.backstab && (m = award('backstab'))) ev.push(m);
    if (k.kind === 'heavy' && (m = award('heavy'))) ev.push(m);
    if (S.noHitKills >= 10 && (m = award('untouch'))) ev.push(m);
    if (S.combo >= 3 && (m = award('crowd'))) ev.push(m);
    if (S.shots >= 25 && accuracy() >= 0.6 && (m = award('surekill'))) ev.push(m);

    const wave = 1 + Math.floor(S.kills / KILLS_PER_WAVE);
    if (wave > S.wave) {
      S.wave = wave;
      ev.push({ type: 'wave', n: wave, bonus: 150 + 50 * wave });
      if (wave >= 5 && (m = award('wave5'))) ev.push(m);
    }
    return { points: pts, mult: S.mult, events: ev };
  }

  function died() { if (S) S.died = true; }

  /* end of match: add XP, save the profile, return a summary for the game-over screen */
  function finish() {
    if (!S) return null;
    const before = rankInfo(profile.xp);
    const prevBest = profile.bestScore;
    const xpGained = Math.round(S.score / 4) + S.medals.length * 25;
    profile.xp += xpGained;
    profile.kills += S.kills;
    profile.headshots += S.headshots;
    profile.bestScore = Math.max(profile.bestScore, S.score);
    profile.bestStreak = Math.max(profile.bestStreak, S.streakKills);
    profile.bestWave = Math.max(profile.bestWave, S.wave);
    profile.matches += 1;
    profile.playTime += S.time;
    profile.shots += S.shots;
    profile.hits += S.hits;
    const all = loadAll();
    all[userName] = profile;
    saveAll(all);
    const after = rankInfo(profile.xp);
    return {
      name: userName, score: S.score, kills: S.kills, headshots: S.headshots, wave: S.wave, time: S.time,
      accuracy: accuracy(), damage: Math.round(S.damage), longest: S.longest, bestCombo: S.bestCombo, melee: S.melee,
      medals: S.medals.map(function (id) { return MEDALS[id]; }),
      xpGained: xpGained, before: before, after: after, leveledUp: after.index > before.index,
      isBestScore: S.score > prevBest, profile: profile
    };
  }

  function fmtTime(t) {
    t = Math.max(0, Math.floor(t));
    const m = Math.floor(t / 60), s = t % 60;
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  return { start, state, update, shotFired, shotHit, addDamage, damageTaken, accuracy, kill, died, finish, getProfile, rankInfo, fmtTime, MEDALS, RANKS, KILLS_PER_WAVE };
})();
