/* ===================== STRIKE ZONE - vfx.js =====================
   Visual effects that live in the 3D world:
     - sun glow + drifting clouds
     - weather / ambient particles (snow, dust, pollen, mist) that follow the player
     - soft sprite smoke, muzzle glow, sparks, blood mist, surface-specific bullet impacts
   Needs three.js. Loaded after maps.js and before game.js.
   game.js calls:  Fx.init(scene, camera, world)  /  Fx.update(dt, time)  /  Fx.setLevel(0..3)  /  Fx.setWeather(true|false)
*/
const Fx = (function () {
  const V3 = THREE.Vector3;
  const POOL = 190;
  const LEVEL_MUL = [0, 0.6, 1, 1.6];

  let scene = null, camera = null, world = null, def = null;
  let level = 2, weatherOn = true, cloudsOn = true;
  let T = null;                                  // shared canvas textures
  const pool = [];
  let poolIdx = 0;
  let sunGlow = null, sunCore = null, sunDir = new V3(0.5, 0.6, 0.3);
  let clouds = [];
  let weather = null;
  const tmp = new V3();

  /* ---------------------------------------------------------------
     textures (drawn once with canvas)
  --------------------------------------------------------------- */
  function canvasTex(size, draw) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    draw(c.getContext('2d'), size);
    const t = new THREE.CanvasTexture(c);
    t.encoding = THREE.sRGBEncoding;
    return t;
  }
  function makeTextures() {
    if (T) return;
    T = {};
    T.glow = canvasTex(128, function (ctx, s) {
      const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.25, 'rgba(255,255,255,0.65)');
      g.addColorStop(0.6, 'rgba(255,255,255,0.15)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
    });
    T.smoke = canvasTex(128, function (ctx, s) {
      for (let i = 0; i < 26; i++) {
        const x = s / 2 + (Math.random() - 0.5) * s * 0.45, y = s / 2 + (Math.random() - 0.5) * s * 0.45;
        const r = s * (0.12 + Math.random() * 0.2);
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        const a = 0.08 + Math.random() * 0.1;
        g.addColorStop(0, 'rgba(255,255,255,' + a + ')');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
      }
      const e = ctx.createRadialGradient(s / 2, s / 2, s * 0.25, s / 2, s / 2, s / 2);     // soft edge
      e.addColorStop(0, 'rgba(0,0,0,0)'); e.addColorStop(1, 'rgba(0,0,0,1)');
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = e; ctx.fillRect(0, 0, s, s);
    });
    T.cloud = canvasTex(256, function (ctx, s) {
      for (let i = 0; i < 42; i++) {
        const x = s * (0.2 + Math.random() * 0.6), y = s * (0.38 + Math.random() * 0.26);
        const r = s * (0.09 + Math.random() * 0.16);
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, 'rgba(255,255,255,0.5)');
        g.addColorStop(0.6, 'rgba(255,255,255,0.18)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
      }
    });
    T.dot = canvasTex(64, function (ctx, s) {
      const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.5, 'rgba(255,255,255,0.55)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
    });
  }

  /* ---------------------------------------------------------------
     sprite particle pool (smoke, glow, sparks, blood mist)
  --------------------------------------------------------------- */
  function buildPool() {
    pool.length = 0; poolIdx = 0;
    for (let i = 0; i < POOL; i++) {
      const mat = new THREE.SpriteMaterial({ map: T.smoke, transparent: true, depthWrite: false, opacity: 0 });
      const sp = new THREE.Sprite(mat);
      sp.visible = false;
      sp.renderOrder = 5;
      scene.add(sp);
      pool.push({ sp: sp, mat: mat, life: 0, max: 1, vel: new V3(), s0: 1, s1: 1, a0: 1, grav: 0, drag: 0, rot: 0, fadeIn: 0, active: false });
    }
  }

  // o: map, color, add(bool), size, size2, life, alpha, vel(V3), grav, drag, rot, fadeIn
  function emit(pos, o) {
    if (!scene || level === 0 || !pool.length) return null;
    const p = pool[poolIdx];
    poolIdx = (poolIdx + 1) % POOL;
    p.active = true;
    p.life = p.max = o.life || 0.5;
    p.s0 = o.size || 0.3;
    p.s1 = o.size2 == null ? p.s0 : o.size2;
    p.a0 = o.alpha == null ? 1 : o.alpha;
    p.grav = o.grav || 0;
    p.drag = o.drag || 0;
    p.rot = o.rot || 0;
    p.fadeIn = o.fadeIn || 0;
    if (o.vel) p.vel.copy(o.vel); else p.vel.set(0, 0, 0);
    p.mat.map = o.map || T.smoke;
    p.mat.color.setHex(o.color == null ? 0xffffff : o.color);
    p.mat.blending = o.add ? THREE.AdditiveBlending : THREE.NormalBlending;
    p.mat.opacity = 0;
    p.mat.rotation = Math.random() * 6.28;
    p.sp.position.copy(pos);
    p.sp.scale.set(p.s0, p.s0, p.s0);
    p.sp.visible = true;
    return p;
  }

  function updatePool(dt) {
    for (let i = 0; i < pool.length; i++) {
      const p = pool[i];
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) { p.active = false; p.sp.visible = false; continue; }
      const t = 1 - p.life / p.max;
      if (p.drag) { const k = Math.max(0, 1 - p.drag * dt); p.vel.multiplyScalar(k); }
      p.vel.y += p.grav * dt;
      p.sp.position.addScaledVector(p.vel, dt);
      const s = p.s0 + (p.s1 - p.s0) * t;
      p.sp.scale.set(s, s, s);
      p.mat.rotation += p.rot * dt;
      let a = 1 - t;
      if (p.fadeIn > 0 && t < p.fadeIn) a = t / p.fadeIn;
      p.mat.opacity = p.a0 * a * a;
    }
  }

  const n = function (x) { return Math.max(0, Math.round(x * LEVEL_MUL[level])); };
  const rnd = function (a, b) { return a + Math.random() * (b - a); };

  /* ---------------------------------------------------------------
     public effect calls
  --------------------------------------------------------------- */
  function muzzle(pos, scale, color) {
    if (level < 1) return;
    emit(pos, { map: T.glow, color: color || 0xffc060, add: true, size: 0.35 * scale, size2: 0.85 * scale, life: 0.055, alpha: 1 });
    if (level >= 2) emit(pos, { map: T.glow, color: 0xff8a30, add: true, size: 0.9 * scale, size2: 1.7 * scale, life: 0.09, alpha: 0.45 });
  }
  function muzzleSmoke(pos, scale) {
    if (level < 2) return;
    for (let i = 0; i < n(1.4); i++) {
      emit(pos, { color: 0xcfcfcf, size: 0.08 * scale, size2: 0.45 * scale, life: rnd(0.7, 1.3), alpha: 0.35,
        vel: new V3(rnd(-0.1, 0.1), rnd(0.15, 0.4), rnd(-0.1, 0.1)), drag: 1.5, rot: rnd(-1, 1), fadeIn: 0.12 });
    }
  }
  function sparks(point, normal, count, color) {
    for (let i = 0; i < n(count); i++) {
      const v = new V3(rnd(-1, 1), rnd(0.2, 1.2), rnd(-1, 1)).multiplyScalar(2.2).addScaledVector(normal, rnd(1.5, 3.5));
      emit(point, { map: T.glow, color: color || 0xffd36a, add: true, size: rnd(0.05, 0.1), size2: 0.01, life: rnd(0.15, 0.4), alpha: 1, vel: v, grav: -11 });
    }
  }
  function puff(point, normal, color, count, size, up) {
    for (let i = 0; i < n(count); i++) {
      const v = new V3(rnd(-0.5, 0.5), rnd(0.1, 0.6) + (up || 0), rnd(-0.5, 0.5)).addScaledVector(normal, rnd(0.3, 1.1));
      emit(point, { color: color, size: size * 0.4, size2: size * rnd(1.1, 1.8), life: rnd(0.45, 0.9), alpha: 0.5, vel: v, drag: 2.2, rot: rnd(-1.5, 1.5), fadeIn: 0.1 });
    }
  }
  // bullet hits a surface. kind: metal | wood | stone | dirt | snow
  function impact(point, normal, kind) {
    if (level < 1) return;
    if (kind === 'metal') {
      sparks(point, normal, 9, 0xffe0a0);
      emit(point, { map: T.glow, color: 0xffd090, add: true, size: 0.25, size2: 0.4, life: 0.07, alpha: 0.9 });
      puff(point, normal, 0xb8b8b8, 1, 0.5, 0);
    } else if (kind === 'wood') {
      sparks(point, normal, 3, 0xe0b070);
      for (let i = 0; i < n(5); i++) {                       // splinters
        const v = new V3(rnd(-1, 1), rnd(0.3, 1.2), rnd(-1, 1)).multiplyScalar(2).addScaledVector(normal, 2.4);
        emit(point, { color: 0x8a5a2b, size: 0.05, size2: 0.03, life: rnd(0.3, 0.6), alpha: 1, vel: v, grav: -12 });
      }
      puff(point, normal, 0xb89868, 1, 0.5, 0);
    } else if (kind === 'snow') {
      puff(point, normal, 0xffffff, 3, 0.7, 0.3);
    } else if (kind === 'dirt') {
      puff(point, normal, def && def.dust ? def.dust : 0xc9a26b, 3, 0.7, 0.3);
      for (let i = 0; i < n(3); i++) {
        const v = new V3(rnd(-1, 1), rnd(0.5, 1.5), rnd(-1, 1)).multiplyScalar(1.6).addScaledVector(normal, 1.5);
        emit(point, { color: 0x6b5a3c, size: 0.045, size2: 0.02, life: rnd(0.3, 0.5), alpha: 1, vel: v, grav: -12 });
      }
    } else {                                                  // stone / concrete
      sparks(point, normal, 4, 0xfff0c0);
      puff(point, normal, 0xcfcac0, 2, 0.6, 0.1);
      for (let i = 0; i < n(3); i++) {
        const v = new V3(rnd(-1, 1), rnd(0.3, 1.4), rnd(-1, 1)).multiplyScalar(1.8).addScaledVector(normal, 2);
        emit(point, { color: 0x8a867e, size: 0.04, size2: 0.02, life: rnd(0.3, 0.5), alpha: 1, vel: v, grav: -12 });
      }
    }
  }
  function blood(point, dir, power) {
    if (level < 1) return;
    const k = power || 1;
    for (let i = 0; i < n(4 * k); i++) {
      const v = new V3(rnd(-1, 1), rnd(-0.2, 1), rnd(-1, 1)).multiplyScalar(1.2).addScaledVector(dir, rnd(1, 3.5));
      emit(point, { color: 0x7a0606, size: 0.12, size2: 0.4 * k, life: rnd(0.35, 0.7), alpha: 0.6, vel: v, grav: -5, drag: 1.5, rot: rnd(-2, 2), fadeIn: 0.05 });
    }
  }
  // soft expanding glow ring-ish burst used for headshots and special hits
  function burst(point, color, size, life) {
    if (level < 2) return;
    emit(point, { map: T.glow, color: color, add: true, size: size * 0.3, size2: size, life: life || 0.25, alpha: 0.9 });
  }
  function dust(point, color, size) {
    if (level < 1) return;
    emit(point, { color: color, size: size * 0.5, size2: size * 1.6, life: 0.7, alpha: 0.4, vel: new V3(rnd(-0.3, 0.3), 0.3, rnd(-0.3, 0.3)), drag: 2, fadeIn: 0.1 });
  }

  /* ---------------------------------------------------------------
     sun + clouds
  --------------------------------------------------------------- */
  function buildSky() {
    const col = new THREE.Color(def.sunColor);
    const gm = new THREE.SpriteMaterial({ map: T.glow, color: col, transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending, opacity: 0.85 });
    sunGlow = new THREE.Sprite(gm); sunGlow.scale.set(260, 260, 1); sunGlow.renderOrder = -5;
    const cm = new THREE.SpriteMaterial({ map: T.glow, color: 0xffffff, transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending, opacity: 1 });
    sunCore = new THREE.Sprite(cm); sunCore.scale.set(70, 70, 1); sunCore.renderOrder = -4;
    scene.add(sunGlow); scene.add(sunCore);
    sunDir.set(def.sunPos[0], def.sunPos[1], def.sunPos[2]).normalize();

    const cfg = { dust: [8, 0xffffff, 0.45], jungle: [14, 0xf4fff4, 0.7], yard: [11, 0xffc9a0, 0.65], snow: [18, 0xe6edf5, 0.8] }[def.id] || [10, 0xffffff, 0.6];
    clouds = [];
    const count = Math.round(cfg[0] * (level >= 3 ? 1.3 : 1));
    for (let i = 0; i < count; i++) {
      const m = new THREE.SpriteMaterial({ map: T.cloud, color: cfg[1], transparent: true, depthWrite: false, fog: false, opacity: cfg[2] * rnd(0.6, 1) });
      const s = new THREE.Sprite(m);
      const w = rnd(140, 260);
      s.scale.set(w, w * rnd(0.28, 0.4), 1);
      s.renderOrder = -6;
      scene.add(s);
      clouds.push({ s: s, az: rnd(0, 6.28), r: rnd(240, 400), h: rnd(95, 210), speed: rnd(0.0006, 0.0022) });
    }
  }
  function updateSky(dt) {
    if (!camera) return;
    const c = camera.position;
    if (sunGlow) {
      sunGlow.position.set(c.x + sunDir.x * 390, c.y + sunDir.y * 390, c.z + sunDir.z * 390);
      sunCore.position.copy(sunGlow.position);
      sunGlow.visible = sunCore.visible = level > 0;
    }
    for (let i = 0; i < clouds.length; i++) {
      const k = clouds[i];
      k.az += k.speed * dt;
      k.s.position.set(c.x + Math.cos(k.az) * k.r, k.h, c.z + Math.sin(k.az) * k.r);
      k.s.visible = cloudsOn && level > 0;
    }
  }

  /* ---------------------------------------------------------------
     weather particles that wrap around the player
  --------------------------------------------------------------- */
  const WEATHER = {
    snow:   { n: 1100, size: 0.17, color: 0xffffff, op: 0.9, fall: -1.7, wx: 0.8, wz: 0.3, sway: 0.7, add: false },
    dust:   { n: 380,  size: 0.2,  color: 0xe6cf9f, op: 0.45, fall: -0.05, wx: 3.2, wz: 0.8, sway: 0.4, add: false },
    jungle: { n: 300,  size: 0.16, color: 0xf3ffb0, op: 0.75, fall: 0.05, wx: 0.15, wz: 0.1, sway: 0.9, add: true },
    yard:   { n: 420,  size: 0.3,  color: 0xd8dde6, op: 0.22, fall: -0.15, wx: 1.1, wz: 0.5, sway: 0.5, add: false }
  };
  function buildWeather() {
    const cfg = WEATHER[def.id];
    if (!cfg) return;
    const W = 36, H = 20;
    const pos = new Float32Array(cfg.n * 3), ph = new Float32Array(cfg.n);
    const p0 = camera.position;
    for (let i = 0; i < cfg.n; i++) {
      pos[i * 3] = p0.x + rnd(-W, W); pos[i * 3 + 1] = rnd(0, H); pos[i * 3 + 2] = p0.z + rnd(-W, W);
      ph[i] = rnd(0, 6.28);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({ size: cfg.size, map: T.dot, color: cfg.color, transparent: true, opacity: cfg.op, depthWrite: false, sizeAttenuation: true,
      blending: cfg.add ? THREE.AdditiveBlending : THREE.NormalBlending });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    pts.renderOrder = 4;
    scene.add(pts);
    weather = { pts: pts, geo: geo, pos: pos, ph: ph, cfg: cfg, W: W, H: H, mat: mat };
  }
  function updateWeather(dt, time) {
    if (!weather) return;
    weather.pts.visible = weatherOn && level > 0;
    if (!weather.pts.visible) return;
    const w = weather, c = w.cfg, p = w.pos, px = camera.position.x, pz = camera.position.z, W = w.W, W2 = W * 2;
    const draw = Math.max(1, Math.floor(c.n * [0, 0.45, 0.8, 1][level]));
    w.geo.setDrawRange(0, draw);
    for (let i = 0; i < draw; i++) {
      const j = i * 3;
      p[j] += (c.wx + Math.sin(time * 0.9 + w.ph[i]) * c.sway) * dt;
      p[j + 1] += (c.fall + Math.cos(time * 0.7 + w.ph[i] * 1.3) * c.sway * 0.25) * dt;
      p[j + 2] += (c.wz + Math.cos(time * 0.8 + w.ph[i]) * c.sway) * dt;
      let dx = p[j] - px, dz = p[j + 2] - pz;
      if (dx > W) p[j] -= W2; else if (dx < -W) p[j] += W2;
      if (dz > W) p[j + 2] -= W2; else if (dz < -W) p[j + 2] += W2;
      if (p[j + 1] < 0) p[j + 1] += w.H; else if (p[j + 1] > w.H) p[j + 1] -= w.H;
    }
    w.geo.attributes.position.needsUpdate = true;
  }

  /* ---------------------------------------------------------------
     lifecycle
  --------------------------------------------------------------- */
  function init(sceneRef, cameraRef, worldRef) {
    scene = sceneRef; camera = cameraRef; world = worldRef; def = world.def;
    makeTextures();
    clouds = []; weather = null; sunGlow = sunCore = null;
    buildPool();
    buildSky();
    buildWeather();
  }
  function update(dt, time) {
    if (!scene) return;
    updatePool(dt);
    updateSky(dt);
    updateWeather(dt, time);
  }
  function setLevel(l) { level = Math.max(0, Math.min(3, l | 0)); }
  function setWeather(b) { weatherOn = !!b; }
  function setClouds(b) { cloudsOn = !!b; }
  function stats() {
    let a = 0;
    for (let i = 0; i < pool.length; i++) if (pool[i].active) a++;
    return { active: a, pool: pool.length, clouds: clouds.length, weather: weather ? weather.cfg.n : 0 };
  }

  return { init, update, setLevel, setWeather, setClouds, muzzle, muzzleSmoke, sparks, puff, impact, blood, burst, dust, stats };
})();
