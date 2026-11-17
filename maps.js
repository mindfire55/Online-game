/* ===================== STRIKE ZONE - maps.js =====================
   MAPS      : the 4 playable maps (shown in the menu)
   buildMap  : builds one map into a three.js scene and returns the
               "world" (collision boxes, heal pads, vending machines...)
   Needs three.js, loaded before this file.
*/
const MAPS = [
  {
    id: 'dust', name: 'Dusty Outpost',
    desc: 'Sun-baked desert village. Sandstone houses, crates, dead trees.',
    preview: 'linear-gradient(180deg,#5d9ae0 0%,#f0d9b0 55%,#c9a26b 56%,#9d7b4a 100%)',
    skyTop: 0x4a8fd8, skyHorizon: 0xf3dfba, fog: 0xe3cba2, fogDensity: 0.0065,
    ground: 0xc9a26b, speck: [0xa88450, 0xdcc08a, 0x8f6d3d],
    sunColor: 0xfff0d0, sunInt: 1.5, sunPos: [60, 90, 35], hemiSky: 0xcfe3ff, hemiGround: 0xb08a55, hemiInt: 0.6,
    wall: 0xc6a77c, roof: 0x8a6a45, perimeter: 0xa8865a, dust: 0xd4b583,
    buildings: 14, containers: 10, crates: 26, barrels: 12, rocks: 22, trees: { type: 'dead', count: 14 },
    containerColors: [0x8b5a2b, 0x5a6b4a, 0x7a3a2a], ambient: 'desert'
  },
  {
    id: 'jungle', name: 'Green Valley',
    desc: 'Dense jungle with wooden huts, boulders and thick cover.',
    preview: 'linear-gradient(180deg,#3d86c9 0%,#a8c9a0 50%,#3f6b2a 52%,#27471a 100%)',
    skyTop: 0x3f86c8, skyHorizon: 0xbdd9c0, fog: 0x9bb88a, fogDensity: 0.011,
    ground: 0x3f6b2a, speck: [0x2f5420, 0x5a8a3a, 0x4a3a22],
    sunColor: 0xfff4d6, sunInt: 1.25, sunPos: [40, 80, 20], hemiSky: 0xcfe8ff, hemiGround: 0x3a5a2a, hemiInt: 0.65,
    wall: 0x7a5a38, roof: 0x4a6b2c, perimeter: 0x40502e, dust: 0x6a5a3a,
    buildings: 9, containers: 6, crates: 14, barrels: 6, rocks: 30, trees: { type: 'broad', count: 85 },
    containerColors: [0x3a5a3a], ambient: 'jungle'
  },
  {
    id: 'yard', name: 'Container Yard',
    desc: 'Industrial harbor at dusk. Stacked containers, warehouses, barrels.',
    preview: 'linear-gradient(180deg,#2c3f66 0%,#e8a070 52%,#5b5d60 54%,#3a3c3f 100%)',
    skyTop: 0x2a3d68, skyHorizon: 0xe6a276, fog: 0x8f8294, fogDensity: 0.0075,
    ground: 0x5b5d60, speck: [0x44464a, 0x6e7074, 0x35373a],
    sunColor: 0xffb070, sunInt: 1.15, sunPos: [-70, 40, 50], hemiSky: 0x8fa3c9, hemiGround: 0x3a3a40, hemiInt: 0.55,
    wall: 0x8a8d90, roof: 0x4a4d52, perimeter: 0x55585c, dust: 0x77797c,
    buildings: 6, containers: 38, crates: 12, barrels: 18, rocks: 4, trees: { type: 'none', count: 0 },
    containerColors: [0xb03a2a, 0x2a5aa0, 0xd58a1e, 0x2f7a4a, 0x7a2a6a, 0xcfcfcf], ambient: 'yard'
  },
  {
    id: 'snow', name: 'Frozen Base',
    desc: 'Arctic outpost. Log cabins, pine forest, deep snow and fog.',
    preview: 'linear-gradient(180deg,#8fa6c4 0%,#dfe8f3 52%,#eef3f9 54%,#c4d0de 100%)',
    skyTop: 0x8aa3c4, skyHorizon: 0xe3ebf4, fog: 0xd2dbe7, fogDensity: 0.0105,
    ground: 0xe8eef5, speck: [0xc8d4e2, 0xffffff, 0xaebdd0],
    sunColor: 0xe8f0ff, sunInt: 1.1, sunPos: [30, 55, -50], hemiSky: 0xdfe9ff, hemiGround: 0xaebbd0, hemiInt: 0.85,
    wall: 0x7a5538, roof: 0xdfe6ef, perimeter: 0xb4c0d0, dust: 0xf0f4f9,
    buildings: 12, containers: 12, crates: 16, barrels: 8, rocks: 22, trees: { type: 'pine', count: 70 },
    containerColors: [0x3a5a7a, 0x7a3a3a], ambient: 'snow'
  }
];

/* ---------- helpers ---------- */
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function textTexture(text, w, h, bg, fg, font) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = fg; ctx.lineWidth = Math.max(3, h / 24);
  ctx.strokeRect(ctx.lineWidth, ctx.lineWidth, w - ctx.lineWidth * 2, h - ctx.lineWidth * 2);
  ctx.fillStyle = fg; ctx.font = font; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, w / 2, h / 2 + 2);
  const t = new THREE.CanvasTexture(c);
  t.encoding = THREE.sRGBEncoding;
  return t;
}
function cssHex(n) { return '#' + ('000000' + n.toString(16)).slice(-6); }

function canvasTexture(size, draw, rx, ry) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  draw(ctx, size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx || 1, ry || 1);
  t.anisotropy = 8;
  t.encoding = THREE.sRGBEncoding;
  return t;
}

function speckleDraw(base, specks, strength) {
  return function (ctx, s) {
    ctx.fillStyle = cssHex(base);
    ctx.fillRect(0, 0, s, s);
    const n = Math.floor(s * s / 14);
    for (let i = 0; i < n; i++) {
      ctx.fillStyle = cssHex(specks[Math.floor(Math.random() * specks.length)]);
      ctx.globalAlpha = Math.random() * (strength || 0.25);
      ctx.fillRect(Math.random() * s, Math.random() * s, 1 + Math.random() * 4, 1 + Math.random() * 4);
    }
    ctx.globalAlpha = 1;
  };
}

// scale box UVs so textures keep a real-world size (no stretching)
function scaleBoxUV(geo, w, h, d, tile) {
  const uv = geo.attributes.uv;
  for (let f = 0; f < 6; f++) {
    let su, sv;
    if (f < 2) { su = d; sv = h; }
    else if (f < 4) { su = w; sv = d; }
    else { su = w; sv = h; }
    for (let j = 0; j < 4; j++) {
      const i = f * 4 + j;
      uv.setXY(i, uv.getX(i) * su / tile, uv.getY(i) * sv / tile);
    }
  }
  uv.needsUpdate = true;
}

/* =================================================================
   buildMap(scene, def, quality) -> world
================================================================= */
function buildMap(scene, def, quality, extraReserve) {
  quality = quality || { shadows: true, shadowSize: 2048, density: 1 };
  const rng = mulberry32(hashStr(def.id));
  const R = function (a, b) { return a + rng() * (b - a); };
  const pickR = function (arr) { return arr[Math.floor(rng() * arr.length)]; };
  const half = 80;

  const world = {
    half: half, def: def, name: def.name,
    boxes: [], shootables: [], blockers: [],
    healSpots: [], vending: [], anim: [],
    sun: null, sky: null, ground: null
  };
  const placed = [];     // rectangles already used
  const reserved = [];   // circles that must stay empty {x,z,r}

  /* ---------- lights ---------- */
  scene.fog = new THREE.FogExp2(def.fog, def.fogDensity);
  scene.background = new THREE.Color(def.fog);

  const hemi = new THREE.HemisphereLight(def.hemiSky, def.hemiGround, def.hemiInt);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(def.sunColor, def.sunInt);
  sun.position.set(def.sunPos[0], def.sunPos[1], def.sunPos[2]);
  sun.castShadow = quality.shadows;
  sun.shadow.mapSize.set(quality.shadowSize, quality.shadowSize);
  const sc = sun.shadow.camera;
  sc.left = -55; sc.right = 55; sc.top = 55; sc.bottom = -55; sc.near = 1; sc.far = 260;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.04;
  scene.add(sun);
  scene.add(sun.target);
  // soft cool fill light from the opposite side so shadowed areas keep some shape
  const fill = new THREE.DirectionalLight(def.id === 'yard' ? 0x8aa0d8 : def.id === 'snow' ? 0xcfe0ff : 0xa8c4ff, 0.28);
  fill.position.set(-def.sunPos[0], 35, -def.sunPos[2]);
  scene.add(fill);
  world.fill = fill;
  world.sun = sun;
  world.sunOffset = new THREE.Vector3(def.sunPos[0], def.sunPos[1], def.sunPos[2]);

  /* ---------- sky dome ---------- */
  const skyTex = canvasTexture(256, function (ctx, s) {
    const gr = ctx.createLinearGradient(0, 0, 0, s);
    gr.addColorStop(0, cssHex(def.skyTop));
    gr.addColorStop(0.55, cssHex(def.skyHorizon));
    gr.addColorStop(1, cssHex(def.fog));
    ctx.fillStyle = gr;
    ctx.fillRect(0, 0, s, s);
  }, 1, 1);
  skyTex.wrapS = skyTex.wrapT = THREE.ClampToEdgeWrapping;
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(450, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false, depthWrite: false })
  );
  sky.renderOrder = -10;
  scene.add(sky);
  world.sky = sky;

  /* ---------- textures & materials ---------- */
  const groundTex = canvasTexture(512, speckleDraw(def.ground, def.speck, 0.35), 70, 70);
  const groundMat = new THREE.MeshStandardMaterial({ map: groundTex, roughness: 1, metalness: 0 });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  ground.userData.ground = true;
  ground.userData.surf = def.id === 'snow' ? 'snow' : 'dirt';
  scene.add(ground);
  world.shootables.push(ground);
  world.ground = ground;

  const wallTex = canvasTexture(256, function (ctx, s) {
    speckleDraw(def.wall, [0x000000, 0xffffff, def.wall], 0.18)(ctx, s);
    ctx.strokeStyle = 'rgba(0,0,0,0.22)';
    ctx.lineWidth = 2;
    for (let y = 0; y < s; y += 32) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(s, y); ctx.stroke();
      for (let x = (y / 32) % 2 ? 0 : 32; x < s; x += 64) { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + 32); ctx.stroke(); }
    }
  }, 1, 1);
  const wallMat = new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.92 });
  const roofTex = canvasTexture(128, speckleDraw(def.roof, [0x000000, 0xffffff], 0.2), 1, 1);
  const roofMat = new THREE.MeshStandardMaterial({ map: roofTex, roughness: 0.85 });
  const perimTex = canvasTexture(256, speckleDraw(def.perimeter, [0x000000, 0xffffff], 0.25), 1, 1);
  const perimMat = new THREE.MeshStandardMaterial({ map: perimTex, roughness: 1 });
  const woodTex = canvasTexture(128, function (ctx, s) {
    ctx.fillStyle = '#8b6234'; ctx.fillRect(0, 0, s, s);
    for (let y = 0; y < s; y += 16) {
      ctx.fillStyle = 'rgba(' + (60 + Math.random() * 60) + ',30,10,0.25)';
      ctx.fillRect(0, y, s, 14);
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(0, y + 14, s, 2);
    }
    ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 4;
    ctx.strokeRect(2, 2, s - 4, s - 4);
  }, 1, 1);
  const crateMat = new THREE.MeshStandardMaterial({ map: woodTex, roughness: 0.8 });
  const logTex = canvasTexture(128, function (ctx, s) {
    ctx.fillStyle = cssHex(def.wall); ctx.fillRect(0, 0, s, s);
    for (let y = 0; y < s; y += 21) {
      ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.fillRect(0, y + 17, s, 4);
      ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fillRect(0, y, s, 4);
    }
  }, 1, 1);
  const logMat = new THREE.MeshStandardMaterial({ map: logTex, roughness: 0.9 });
  const useLogs = def.id === 'jungle' || def.id === 'snow';
  const bldgWallMat = useLogs ? logMat : wallMat;

  const containerMats = def.containerColors.map(function (c) {
    const tex = canvasTexture(128, function (ctx, s) {
      ctx.fillStyle = cssHex(c); ctx.fillRect(0, 0, s, s);
      for (let x = 0; x < s; x += 8) {
        ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.fillRect(x, 0, 3, s);
        ctx.fillStyle = 'rgba(255,255,255,0.1)'; ctx.fillRect(x + 3, 0, 2, s);
      }
      speckleDraw(c, [0x000000, 0x8a4a1a], 0.15)(ctx, s);
    }, 1, 1);
    return new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55, metalness: 0.45 });
  });
  const barrelMats = [0xb02a22, 0x2a5aa0, 0x3a6a3a, 0x555a60].map(function (c) {
    return new THREE.MeshStandardMaterial({ color: c, roughness: 0.45, metalness: 0.6 });
  });
  const trunkMat = new THREE.MeshStandardMaterial({ color: def.id === 'dust' ? 0x6a5a48 : 0x5a3f26, roughness: 1 });
  const rockMat = new THREE.MeshStandardMaterial({
    color: def.id === 'snow' ? 0xcfd8e4 : def.id === 'yard' ? 0x6b6e72 : 0x7d7468, roughness: 1, flatShading: true
  });

  /* ---------- placement helpers ---------- */
  function free(x, z, w, d, margin) {
    for (let i = 0; i < reserved.length; i++) {
      const r = reserved[i];
      const cx = Math.max(x - w / 2, Math.min(r.x, x + w / 2));
      const cz = Math.max(z - d / 2, Math.min(r.z, z + d / 2));
      if ((cx - r.x) * (cx - r.x) + (cz - r.z) * (cz - r.z) < r.r * r.r) return false;
    }
    for (let i = 0; i < placed.length; i++) {
      const p = placed[i];
      if (x + w / 2 + margin > p.minX && x - w / 2 - margin < p.maxX &&
          z + d / 2 + margin > p.minZ && z - d / 2 - margin < p.maxZ) return false;
    }
    return true;
  }
  function tryPlace(w, d, margin) {
    for (let i = 0; i < 60; i++) {
      const x = R(-half + 6 + w / 2, half - 6 - w / 2);
      const z = R(-half + 6 + d / 2, half - 6 - d / 2);
      if (free(x, z, w, d, margin)) {
        placed.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
        return { x: x, z: z };
      }
    }
    return null;
  }

  // add a solid axis-aligned box mesh + collision
  function addBox(x, z, w, h, d, mat, o) {
    o = o || {};
    const y0 = o.y0 || 0;
    const geo = new THREE.BoxGeometry(w, h, d);
    scaleBoxUV(geo, w, h, d, o.tile || 3);
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y0 + h / 2, z);
    m.castShadow = true;
    m.receiveShadow = true;
    m.userData.surf = o.surf || (mat === crateMat || mat === logMat ? 'wood' : (mat.metalness || 0) > 0.3 ? 'metal' : 'stone');
    scene.add(m);
    world.shootables.push(m);
    if (!o.foliage) world.blockers.push(m);
    if (o.solid !== false) {
      world.boxes.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, minY: y0, maxY: y0 + h });
    }
    return m;
  }

  /* ---------- reserved zones: spawn, vending machines, heal pads ---------- */
  // TRAINING AREA (shooting range): a safe zone in the same spot on every map
  const TR = { cx: -45, cz: 48, r: 26 };
  reserved.push({ x: TR.cx, z: TR.cz, r: TR.r });
  reserved.push({ x: 0, z: 0, r: 7 });
  (extraReserve || []).forEach(function (z) { reserved.push({ x: z.x, z: z.z, r: z.r }); });   // multiplayer: keep objectives / spawns clear
  const vendPos = [[7.5, -6, -0.6], [-9, 8.5, 2.5]];
  vendPos.forEach(function (v) { reserved.push({ x: v[0], z: v[1], r: 3.5 }); });
  const healPos = [[TR.cx, 26]];   // first heal pad sits at the training area entrance
  for (let i = 0; i < 3; i++) {
    for (let t = 0; t < 40; t++) {
      const ang = R(0, Math.PI * 2), dist = R(22, 58);
      const x = Math.cos(ang) * dist, z = Math.sin(ang) * dist;
      let ok = true;
      for (let j = 0; j < healPos.length; j++) if (Math.hypot(healPos[j][0] - x, healPos[j][1] - z) < 35) ok = false;
      if (Math.hypot(x - TR.cx, z - TR.cz) < TR.r + 8) ok = false;
      if (ok) { healPos.push([x, z]); reserved.push({ x: x, z: z, r: 5 }); break; }
    }
  }

  /* ---------- perimeter walls ---------- */
  const T = 4, H = 8, L = half * 2 + 12;
  addBox(0, -(half + T / 2), L, H, T, perimMat, { tile: 6 });
  addBox(0, half + T / 2, L, H, T, perimMat, { tile: 6 });
  addBox(-(half + T / 2), 0, T, H, L, perimMat, { tile: 6 });
  addBox(half + T / 2, 0, T, H, L, perimMat, { tile: 6 });

  /* ---------- vending machines ---------- */
  const vendTex = canvasTexture(256, function (ctx, s) {
    ctx.fillStyle = '#111820'; ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = '#ff8a1f'; ctx.fillRect(0, 0, s, 46);
    ctx.fillStyle = '#1a1004'; ctx.font = 'bold 26px Arial'; ctx.textAlign = 'center';
    ctx.fillText('ARMORY', s / 2, 33);
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 3; c++) {
        ctx.fillStyle = '#26303b'; ctx.fillRect(14 + c * 76, 60 + r * 44, 66, 36);
        ctx.fillStyle = r % 2 ? '#7be07b' : '#e0b04a';
        ctx.fillRect(22 + c * 76, 70 + r * 44, 50, 6);
        ctx.fillRect(22 + c * 76, 82 + r * 44, 30, 6);
      }
    }
    ctx.fillStyle = '#ff3b3b'; ctx.fillRect(14, 236, 228, 10);
  }, 1, 1);
  vendTex.encoding = THREE.sRGBEncoding;
  vendPos.forEach(function (v) {
    const grp = new THREE.Group();
    grp.position.set(v[0], 0, v[1]);
    grp.rotation.y = v[2];
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.15, 2.1, 0.9),
      new THREE.MeshStandardMaterial({ color: 0x1c2631, roughness: 0.4, metalness: 0.6 }));
    body.position.y = 1.05; body.castShadow = true; body.userData.surf = 'metal'; grp.add(body);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 1.8),
      new THREE.MeshStandardMaterial({ map: vendTex, emissiveMap: vendTex, emissive: 0xffffff, emissiveIntensity: 0.85, roughness: 0.3 }));
    face.position.set(0, 1.1, 0.455); grp.add(face);
    scene.add(grp);
    world.blockers.push(body);
    world.shootables.push(body);
    world.boxes.push({ minX: v[0] - 0.65, maxX: v[0] + 0.65, minZ: v[1] - 0.65, maxZ: v[1] + 0.65, minY: 0, maxY: 2.1 });
    world.vending.push({ x: v[0], z: v[1] });
  });

  /* ---------- heal pads ---------- */
  healPos.forEach(function (p) {
    const grp = new THREE.Group();
    grp.position.set(p[0], 0, p[1]);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(3, 40),
      new THREE.MeshBasicMaterial({ color: 0x3ddc6b, transparent: true, opacity: 0.32, depthWrite: false }));
    disc.rotation.x = -Math.PI / 2; disc.position.y = 0.03; grp.add(disc);
    const ring = new THREE.Mesh(new THREE.RingGeometry(2.8, 3.05, 48),
      new THREE.MeshBasicMaterial({ color: 0x9dffb8, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.04; grp.add(ring);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(2.9, 2.9, 5, 32, 1, true),
      new THREE.MeshBasicMaterial({ color: 0x3ddc6b, transparent: true, opacity: 0.1, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
    beam.position.y = 2.5; grp.add(beam);
    const cross = new THREE.Group();
    const cm = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x3ddc6b, emissiveIntensity: 0.9 });
    cross.add(new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.3, 0.3), cm));
    cross.add(new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.9, 0.3), cm));
    cross.position.y = 1.5;
    grp.add(cross);
    scene.add(grp);
    world.healSpots.push({ x: p[0], z: p[1], r: 3, cross: cross, group: grp });
    world.anim.push(function (t) { cross.rotation.y = t * 1.5; cross.position.y = 1.5 + Math.sin(t * 2) * 0.12; });
  });

  /* ---------- HOUSES: walls with a door and windows, pitched roof, porch, furniture inside ---------- */
  const trimMat = new THREE.MeshStandardMaterial({ color: 0x33241a, roughness: 0.8 });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0xa9d2e6, roughness: 0.08, metalness: 0.25, transparent: true, opacity: 0.28, depthWrite: false });
  const floorMat = new THREE.MeshStandardMaterial({ color: def.id === 'yard' ? 0x66686b : 0x6b5236, roughness: 0.9 });
  const lampMat = new THREE.MeshStandardMaterial({ color: 0xfff1c9, emissive: 0xffe2a0, roughness: 0.5 });
  const fabricMats = [0x7a2f2f, 0x2f4f7a, 0x3f6a43, 0x6a5a2f, 0x55485f].map(function (c) { return new THREE.MeshStandardMaterial({ color: c, roughness: 0.95 }); });
  const roofTop = new THREE.MeshStandardMaterial({ map: roofTex, roughness: 0.85, side: THREE.DoubleSide });
  function vis(geo, mat, x, y, z, ry) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    if (ry) m.rotation.y = ry;
    m.castShadow = true; m.receiveShadow = true;
    scene.add(m);
    return m;
  }
  function gableRoof(cx, cz, w, d, y, rh, ov) {
    const alongX = w >= d;
    const hu = (alongX ? w : d) / 2 + ov, hv = (alongX ? d : w) / 2 + ov;
    function P(u, v, h) { return alongX ? [cx + u, y + h, cz + v] : [cx + v, y + h, cz + u]; }
    const A = P(-hu, -hv, 0), B = P(hu, -hv, 0), C = P(hu, hv, 0), D = P(-hu, hv, 0), R1 = P(-hu, 0, rh), R2 = P(hu, 0, rh);
    function build(tris) {
      const pos = [], uv = [];
      tris.forEach(function (t) { t.forEach(function (v) { pos.push(v[0], v[1], v[2]); uv.push(v[0] * 0.3 + v[2] * 0.1, v[2] * 0.3 + v[1] * 0.2); }); });
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
      g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uv), 2));
      g.computeVertexNormals();
      return g;
    }
    const slopes = new THREE.Mesh(build([[A, B, R2], [A, R2, R1], [C, D, R1], [C, R1, R2]]), roofTop);
    slopes.castShadow = true; slopes.receiveShadow = true; slopes.userData.surf = 'wood';
    scene.add(slopes); world.shootables.push(slopes);
    const gab = new THREE.Mesh(build([[D, A, R1], [B, C, R2]]), bldgWallMat);
    gab.castShadow = true; scene.add(gab);
    return { alongX: alongX, hu: hu };
  }
  function addBuilding(cx, cz, w, d, h) {
    const th = 0.4, doorW = 1.9, doorH = 2.4, winW = 1.5, winY0 = 1.0, winY1 = 2.3;
    const flat = def.id === 'yard';
    const side = Math.floor(rng() * 4);               // 0=N 1=S 2=W 3=E : which wall has the door
    const walls = [
      { isX: true,  fixed: cz - d / 2, center: cx, len: w, dir: [0, -1] },   // N
      { isX: true,  fixed: cz + d / 2, center: cx, len: w, dir: [0, 1] },    // S
      { isX: false, fixed: cx - w / 2, center: cz, len: d, dir: [-1, 0] },   // W
      { isX: false, fixed: cx + w / 2, center: cz, len: d, dir: [1, 0] }     // E
    ];
    let doorPos = null;
    walls.forEach(function (wl, i) {
      const ops = [];
      let dp = null;
      if (i === side) {
        dp = wl.center + R(-(wl.len / 2 - 2.2), wl.len / 2 - 2.2) * 0.7;
        ops.push({ p: dp, w: doorW, y0: 0, y1: doorH, door: true });
        doorPos = { x: wl.isX ? dp : wl.fixed, z: wl.isX ? wl.fixed : dp, dir: wl.dir };
      }
      const nWin = Math.max(1, Math.min(3, Math.floor((wl.len - 2) / 3.4)));
      for (let k = 0; k < nWin; k++) {
        const wp = wl.center - wl.len / 2 + (k + 0.5) * wl.len / nWin;
        if (dp !== null && Math.abs(wp - dp) < doorW / 2 + winW / 2 + 0.6) continue;
        ops.push({ p: wp, w: winW, y0: winY0, y1: winY1 });
      }
      ops.sort(function (a, b2) { return a.p - b2.p; });
      let cur = wl.center - wl.len / 2;
      const end = wl.center + wl.len / 2;
      function seg(a, b2, y0, y1) {
        if (b2 - a < 0.05 || y1 - y0 < 0.05) return;
        const mid = (a + b2) / 2, L = b2 - a, H = y1 - y0;
        if (wl.isX) addBox(mid, wl.fixed, L, H, th, bldgWallMat, { y0: y0 }); else addBox(wl.fixed, mid, th, H, L, bldgWallMat, { y0: y0 });
      }
      ops.forEach(function (op) {
        const a = op.p - op.w / 2, b2 = op.p + op.w / 2;
        seg(cur, a, 0, h); seg(a, b2, 0, op.y0); seg(a, b2, op.y1, h);
        cur = b2;
        // frames and glass (looks only - bullets fly through the windows)
        const ry = wl.isX ? 0 : Math.PI / 2;
        const px = wl.isX ? op.p : wl.fixed, pz = wl.isX ? wl.fixed : op.p;
        const ax = wl.isX ? 1 : 0, az = wl.isX ? 0 : 1;           // direction along the wall
        const fh = op.y1 - op.y0, fy = (op.y1 + op.y0) / 2;
        if (!op.door) {
          vis(new THREE.PlaneGeometry(op.w, fh), glassMat, px, fy, pz, ry).castShadow = false;
          vis(new THREE.BoxGeometry(wl.isX ? op.w + 0.16 : th + 0.1, 0.08, wl.isX ? th + 0.1 : op.w + 0.16), trimMat, px, op.y0, pz);
          vis(new THREE.BoxGeometry(wl.isX ? op.w + 0.16 : th + 0.1, 0.08, wl.isX ? th + 0.1 : op.w + 0.16), trimMat, px, op.y1, pz);
          vis(new THREE.BoxGeometry(wl.isX ? 0.06 : th + 0.1, fh, wl.isX ? th + 0.1 : 0.06), trimMat, px, fy, pz);   // mullion
          [-1, 1].forEach(function (sd) {
            vis(new THREE.BoxGeometry(wl.isX ? 0.08 : th + 0.1, fh, wl.isX ? th + 0.1 : 0.08), trimMat, px + ax * sd * op.w / 2, fy, pz + az * sd * op.w / 2);
          });
          // outer sill shelf
          vis(new THREE.BoxGeometry(wl.isX ? op.w + 0.3 : 0.25, 0.06, wl.isX ? 0.25 : op.w + 0.3), trimMat, px + wl.dir[0] * (th / 2 + 0.1), op.y0 - 0.03, pz + wl.dir[1] * (th / 2 + 0.1));
        } else {
          [-1, 1].forEach(function (sd) {
            vis(new THREE.BoxGeometry(wl.isX ? 0.12 : th + 0.1, doorH, wl.isX ? th + 0.1 : 0.12), trimMat, px + ax * sd * op.w / 2, doorH / 2, pz + az * sd * op.w / 2);
          });
          vis(new THREE.BoxGeometry(wl.isX ? op.w + 0.24 : th + 0.1, 0.12, wl.isX ? th + 0.1 : op.w + 0.24), trimMat, px, doorH, pz);
          // door standing open, swung against the outside wall
          const door = vis(new THREE.BoxGeometry(op.w - 0.1, doorH - 0.05, 0.07), crateMat, px + ax * op.w / 2 + wl.dir[0] * 0.5, doorH / 2, pz + az * op.w / 2 + wl.dir[1] * 0.5, ry + 1.15);
        }
      });
      seg(cur, end, 0, h);
    });

    // ceiling slab (solid) + roof
    addBox(cx, cz, w + 0.2, 0.25, d + 0.2, roofMat, { y0: h, tile: 4 });
    if (flat) {
      addBox(cx, cz, w + 0.8, 0.4, d + 0.8, roofMat, { y0: h + 0.25, tile: 4 });
      [[-1, 0], [1, 0], [0, -1], [0, 1]].forEach(function (q) {
        const px = cx + q[0] * (w / 2 + 0.3), pz = cz + q[1] * (d / 2 + 0.3);
        vis(new THREE.BoxGeometry(q[0] ? 0.25 : w + 0.8, 0.5, q[0] ? d + 0.8 : 0.25), perimMat, px, h + 0.9, pz);
      });
      vis(new THREE.CylinderGeometry(0.4, 0.4, 0.8, 10), containerMats[0], cx + w * 0.2, h + 1.0, cz - d * 0.15);
      vis(new THREE.BoxGeometry(1.2, 0.7, 1.2), containerMats[0], cx - w * 0.22, h + 0.95, cz + d * 0.2);
    } else {
      const rh = Math.min(w, d) * 0.32;
      const rf = gableRoof(cx, cz, w, d, h + 0.25, rh, 0.55);
      if (def.id !== 'jungle') {      // chimney
        const ox = rf.alongX ? w * 0.25 : 0, oz = rf.alongX ? 0 : d * 0.25;
        vis(new THREE.BoxGeometry(0.7, rh + 1.2, 0.7), perimMat, cx + ox, h + 0.25 + (rh + 1.2) / 2 + 0.2, cz + oz);
      }
    }
    vis(new THREE.BoxGeometry(w - th * 2, 0.05, d - th * 2), floorMat, cx, 0.03, cz);     // floor boards
    vis(new THREE.SphereGeometry(0.13, 10, 8), lampMat, cx, h - 0.35, cz);                  // hanging lamp

    // porch step + awning at the door
    if (doorPos) {
      const dx = doorPos.dir[0], dz = doorPos.dir[1];
      const sx = doorPos.x + dx * (th / 2 + 0.65), sz = doorPos.z + dz * (th / 2 + 0.65);
      addBox(sx, sz, dx ? 1.3 : 3.0, 0.22, dx ? 3.0 : 1.3, perimMat, { tile: 2 });
      if (!flat) {
        const awx = doorPos.x + dx * (th / 2 + 0.9), awz = doorPos.z + dz * (th / 2 + 0.9);
        vis(new THREE.BoxGeometry(dx ? 1.8 : 3.2, 0.12, dx ? 3.2 : 1.8), roofMat, awx, 2.95, awz);
        [-1, 1].forEach(function (sd) {
          const ppx = doorPos.x + dx * (th / 2 + 1.6) + (dx ? 0 : sd * 1.4), ppz = doorPos.z + dz * (th / 2 + 1.6) + (dx ? sd * 1.4 : 0);
          addBox(ppx, ppz, 0.16, 2.9, 0.16, trimMat, { tile: 1 });
        });
      }
    }

    // furniture inside (kept away from the doorway)
    const ix = w / 2 - th - 0.9, iz = d / 2 - th - 0.9;
    const spots = [[-ix, -iz], [ix, -iz], [-ix, iz], [ix, iz], [0, -iz], [0, iz], [-ix, 0], [ix, 0]];
    let inner = null;
    if (doorPos) inner = { x: doorPos.x - doorPos.dir[0] * 1.8, z: doorPos.z - doorPos.dir[1] * 1.8 };
    const used = [];
    const items = ['bed', 'table', 'shelf', 'couch', 'crates'];
    for (let n = 0; n < items.length; n++) {
      let spot = null;
      for (let t = 0; t < 8 && !spot; t++) {
        const c = spots[Math.floor(rng() * spots.length)];
        const wx = cx + c[0], wz = cz + c[1];
        if (inner && Math.hypot(wx - inner.x, wz - inner.z) < 2.6) continue;
        if (used.some(function (u) { return Math.hypot(wx - u[0], wz - u[1]) < 2.4; })) continue;
        spot = [wx, wz];
      }
      if (!spot || w < 7.5 || d < 7.5) continue;
      used.push(spot);
      const sw = rng() < 0.5;
      const kind = items[n];
      if (kind === 'bed') {
        const bw = sw ? 2.0 : 1.05, bd = sw ? 1.05 : 2.0;
        addBox(spot[0], spot[1], bw, 0.5, bd, crateMat, { tile: 1.5 });
        const blanket = vis(new THREE.BoxGeometry(sw ? 1.4 : 0.95, 0.12, sw ? 0.95 : 1.4), fabricMats[Math.floor(rng() * fabricMats.length)], spot[0] + (sw ? 0.28 : 0), 0.56, spot[1] + (sw ? 0 : 0.28));
        vis(new THREE.BoxGeometry(sw ? 0.4 : 0.8, 0.14, sw ? 0.8 : 0.4), fabricMats[4], spot[0] - (sw ? 0.7 : 0), 0.57, spot[1] - (sw ? 0 : 0.7));
      } else if (kind === 'table') {
        addBox(spot[0], spot[1], sw ? 1.6 : 0.95, 0.85, sw ? 0.95 : 1.6, crateMat, { tile: 1.5 });
        vis(new THREE.CylinderGeometry(0.1, 0.1, 0.2, 8), lampMat, spot[0], 0.95, spot[1]);
      } else if (kind === 'shelf') {
        addBox(spot[0], spot[1], sw ? 1.7 : 0.5, 1.8, sw ? 0.5 : 1.7, crateMat, { tile: 1.5 });
      } else if (kind === 'couch') {
        addBox(spot[0], spot[1], sw ? 1.9 : 0.85, 0.75, sw ? 0.85 : 1.9, fabricMats[Math.floor(rng() * fabricMats.length)], { tile: 1.5 });
      } else {
        addBox(spot[0], spot[1], 1.1, 1.1, 1.1, crateMat, { tile: 1.1 });
      }
    }
  }

  for (let i = 0; i < def.buildings; i++) {
    const big = def.id === 'yard';
    const w = big ? R(10, 15) : R(7, 12), d = big ? R(9, 13) : R(7, 11), h = big ? R(4.6, 5.6) : R(3.2, 3.9);
    const p = tryPlace(w + 3, d + 3, 3);
    if (p) addBuilding(p.x, p.z, w, d, h);
  }

  /* ---------- shipping containers ---------- */
  const doorMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.6, metalness: 0.5 });
  function placeContainer(x, z, horiz) {
    const w = horiz ? 6.1 : 2.45, d = horiz ? 2.45 : 6.1;
    addBox(x, z, w, 2.6, d, pickR(containerMats), { tile: 2.5 });
    if (rng() < 0.4) addBox(x, z, w, 2.6, d, pickR(containerMats), { y0: 2.6, tile: 2.5 });
    // door end detail (looks only)
    const door = new THREE.Mesh(new THREE.BoxGeometry(horiz ? 0.06 : 2.2, 2.3, horiz ? 2.2 : 0.06), doorMat);
    door.position.set(x + (horiz ? w / 2 : 0), 1.3, z + (horiz ? 0 : d / 2));
    scene.add(door);
  }
  const nCont = Math.round(def.containers * quality.density);
  for (let i = 0; i < nCont; i++) {
    const horiz = rng() < 0.5;
    const w = horiz ? 6.1 : 2.45, d = horiz ? 2.45 : 6.1;
    const p = tryPlace(w, d, 1.6);
    if (!p) continue;
    placeContainer(p.x, p.z, horiz);
    // sometimes a second container beside it, leaving a corridor to fight in
    if (rng() < 0.35) {
      const q = horiz ? { x: p.x, z: p.z + d + 2.2 } : { x: p.x + w + 2.2, z: p.z };
      if (Math.abs(q.x) < half - 9 && Math.abs(q.z) < half - 9 && free(q.x, q.z, w, d, 0.6)) {
        placed.push({ minX: q.x - w / 2, maxX: q.x + w / 2, minZ: q.z - d / 2, maxZ: q.z + d / 2 });
        placeContainer(q.x, q.z, horiz);
      }
    }
  }

  /* ---------- crates ---------- */
  const nCrates = Math.round(def.crates * quality.density);
  for (let i = 0; i < nCrates; i++) {
    const s = rng() < 0.5 ? 1.2 : 1.7;
    const p = tryPlace(s, s, 0.8);
    if (!p) continue;
    addBox(p.x, p.z, s, s, s, crateMat, { tile: s });
    if (rng() < 0.3) addBox(p.x + R(-0.1, 0.1), p.z + R(-0.1, 0.1), s * 0.8, s * 0.8, s * 0.8, crateMat, { y0: s, tile: s * 0.8, solid: true });
    if (rng() < 0.35) {
      const p2 = { x: p.x + s + 0.1, z: p.z };
      if (free(p2.x, p2.z, 1.2, 1.2, 0)) {
        placed.push({ minX: p2.x - 0.6, maxX: p2.x + 0.6, minZ: p2.z - 0.6, maxZ: p2.z + 0.6 });
        addBox(p2.x, p2.z, 1.2, 1.2, 1.2, crateMat, { tile: 1.2 });
      }
    }
  }

  /* ---------- low barriers (jump-over cover) ---------- */
  const barrierMat = new THREE.MeshStandardMaterial({
    map: canvasTexture(128, speckleDraw(def.id === 'snow' ? 0xc9d2dc : 0x9a9a94, [0x000000, 0xffffff], 0.2), 1, 1), roughness: 0.95 });
  const nBarr = Math.round(({ dust: 9, jungle: 5, yard: 16, snow: 9 }[def.id] || 8) * quality.density);
  for (let i = 0; i < nBarr; i++) {
    const horiz = rng() < 0.5, L = R(3.5, 6);
    const w = horiz ? L : 0.7, d = horiz ? 0.7 : L;
    const p = tryPlace(w, d, 1.0);
    if (!p) continue;
    addBox(p.x, p.z, w, 1.1, d, barrierMat, { tile: 2 });
  }

  /* ---------- barrels ---------- */
  const nBar = Math.round(def.barrels * quality.density);
  for (let i = 0; i < nBar; i++) {
    const p = tryPlace(0.9, 0.9, 0.8);
    if (!p) continue;
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 1.15, 16), pickR(barrelMats));
    m.position.set(p.x, 0.575, p.z);
    m.userData.surf = 'metal';
    m.castShadow = true; m.receiveShadow = true;
    scene.add(m);
    world.shootables.push(m); world.blockers.push(m);
    world.boxes.push({ minX: p.x - 0.42, maxX: p.x + 0.42, minZ: p.z - 0.42, maxZ: p.z + 0.42, minY: 0, maxY: 1.15 });
  }

  /* ---------- rocks ---------- */
  const nRock = Math.round(def.rocks * quality.density);
  for (let i = 0; i < nRock; i++) {
    const r = R(0.7, 2.0);
    const p = tryPlace(r * 1.6, r * 1.6, 0.6);
    if (!p) continue;
    const m = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), rockMat);
    m.scale.set(1.2, R(0.6, 0.95), 1);
    m.rotation.set(R(0, 3), R(0, 3), R(0, 3));
    m.position.set(p.x, r * 0.45, p.z);
    m.castShadow = true; m.receiveShadow = true;
    scene.add(m);
    world.shootables.push(m); world.blockers.push(m);
    const e = r * 0.85;
    world.boxes.push({ minX: p.x - e, maxX: p.x + e, minZ: p.z - e, maxZ: p.z + e, minY: 0, maxY: r * 0.9 });
  }

  /* ---------- trees ---------- */
  const leafCols = def.id === 'jungle' ? [0x2f6b22, 0x3a7d2a, 0x25561b] : [0x2b4a33, 0x234030, 0x34573c];
  const nTree = Math.round(def.trees.count * quality.density);
  for (let i = 0; i < nTree; i++) {
    const p = tryPlace(1.4, 1.4, 1.2);
    if (!p) continue;
    const type = def.trees.type;
    const hgt = R(5, 9);
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.38, hgt, 8), trunkMat);
    trunk.position.set(p.x, hgt / 2, p.z);
    trunk.castShadow = true;
    trunk.userData.surf = 'wood';
    scene.add(trunk);
    world.shootables.push(trunk); world.blockers.push(trunk);
    world.boxes.push({ minX: p.x - 0.4, maxX: p.x + 0.4, minZ: p.z - 0.4, maxZ: p.z + 0.4, minY: 0, maxY: hgt });
    if (type === 'broad') {
      const lm = new THREE.MeshStandardMaterial({ color: pickR(leafCols), roughness: 0.95, flatShading: true });
      for (let k = 0; k < 4; k++) {
        const s = R(1.8, 3.0);
        const c = new THREE.Mesh(new THREE.IcosahedronGeometry(s, 0), lm);
        c.position.set(p.x + R(-1.4, 1.4), hgt + R(-0.6, 1.4), p.z + R(-1.4, 1.4));
        c.castShadow = true; c.userData.foliage = true;
        scene.add(c); world.shootables.push(c);
      }
    } else if (type === 'pine') {
      const lm = new THREE.MeshStandardMaterial({ color: pickR(leafCols), roughness: 0.95 });
      const snowM = new THREE.MeshStandardMaterial({ color: 0xf2f6fb, roughness: 1 });
      for (let k = 0; k < 4; k++) {
        const rad = 3.0 - k * 0.6, ch = 3.0;
        const c = new THREE.Mesh(new THREE.ConeGeometry(rad, ch, 9), k % 2 ? snowM : lm);
        c.position.set(p.x, hgt * 0.45 + k * 1.5, p.z);
        c.castShadow = true; c.userData.foliage = true;
        scene.add(c); world.shootables.push(c);
      }
    } else if (type === 'dead') {
      for (let k = 0; k < 3; k++) {
        const br = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.14, 2.2, 5), trunkMat);
        br.position.set(p.x + R(-0.7, 0.7), hgt * R(0.6, 0.9), p.z + R(-0.7, 0.7));
        br.rotation.set(R(-0.9, 0.9), 0, R(-0.9, 0.9));
        br.castShadow = true;
        scene.add(br);
      }
    }
  }


  /* ---------- TRAINING AREA ---------- */
  (function buildTraining() {
    const padTex = canvasTexture(256, speckleDraw(0x6e7073, [0x55575a, 0x85888b, 0x4a4c4f], 0.3), 8, 10);
    const pad = new THREE.Mesh(new THREE.PlaneGeometry(26, 34),
      new THREE.MeshStandardMaterial({ map: padTex, roughness: 1, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
    pad.rotation.x = -Math.PI / 2;
    pad.position.set(TR.cx, 0.03, 48.5);
    pad.receiveShadow = true;
    scene.add(pad);

    // lane lines
    const lineMat = new THREE.MeshBasicMaterial({ color: 0xffd24d, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    [[36, 0.4], [44, 0.18], [51, 0.18], [58, 0.18]].forEach(function (L) {
      const ln = new THREE.Mesh(new THREE.PlaneGeometry(25, L[1]), lineMat);
      ln.rotation.x = -Math.PI / 2;
      ln.position.set(TR.cx, 0.05, L[0]);
      scene.add(ln);
    });
    // distance labels painted on the floor
    [[36, 'START'], [44, '8 m'], [51, '15 m'], [58, '22 m']].forEach(function (L) {
      [-1, 1].forEach(function (side) {
        const tex = textTexture(L[1], 128, 64, '#2a2c2e', '#ffd24d', 'bold 34px Arial');
        const lab = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.9),
          new THREE.MeshBasicMaterial({ map: tex, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
        lab.rotation.x = -Math.PI / 2;
        lab.position.set(TR.cx + side * 11, 0.06, L[0] + 1.2);
        scene.add(lab);
      });
    });

    // sandbag side walls and the back berm
    const sandMat = new THREE.MeshStandardMaterial({
      map: canvasTexture(128, speckleDraw(0xb8a276, [0x8a7650, 0xd0bd90], 0.4), 1, 1), roughness: 1 });
    addBox(TR.cx - 13, 48.5, 0.9, 1.3, 34, sandMat, { tile: 2 });
    addBox(TR.cx + 13, 48.5, 0.9, 1.3, 34, sandMat, { tile: 2 });
    addBox(TR.cx, 65.4, 27, 4, 1.4, perimMat, { tile: 4 });

    // sign on the berm
    const bermSign = new THREE.Mesh(new THREE.PlaneGeometry(15, 3.2),
      new THREE.MeshBasicMaterial({ map: textTexture('TRAINING RANGE', 1024, 220, '#14181c', '#ffb02e', 'bold 120px Arial') }));
    bermSign.position.set(TR.cx, 2.4, 64.68);
    bermSign.rotation.y = Math.PI;
    scene.add(bermSign);

    // entrance gate with a sign
    const postMat = new THREE.MeshStandardMaterial({ color: 0x2d3034, metalness: 0.6, roughness: 0.5 });
    addBox(TR.cx - 12, 30.5, 0.5, 6, 0.5, postMat, { tile: 1 });
    addBox(TR.cx + 12, 30.5, 0.5, 6, 0.5, postMat, { tile: 1 });
    const gateSign = new THREE.Mesh(new THREE.PlaneGeometry(23, 1.8),
      new THREE.MeshBasicMaterial({ map: textTexture('TRAINING AREA  -  NO ENEMIES  -  FREE FIRE', 1024, 80, '#14181c', '#7be07b', 'bold 44px Arial'), side: THREE.DoubleSide }));
    gateSign.position.set(TR.cx, 5.2, 30.5);
    scene.add(gateSign);

    // dummy positions: static near row, moving middle row, static far row
    const spots = [];
    [-6, 0, 6].forEach(function (dx) { spots.push({ x: TR.cx + dx, z: 44, move: false }); });
    spots.push({ x: TR.cx, z: 51, move: true, amp: 9, speed: 1.1, phase: 0 });
    spots.push({ x: TR.cx, z: 51, move: true, amp: 9, speed: 1.1, phase: Math.PI });
    [-7, 0, 7].forEach(function (dx) { spots.push({ x: TR.cx + dx, z: 58, move: false }); });
    world.training = { cx: TR.cx, cz: TR.cz, r: TR.r, spots: spots };
  })();

  /* ---------- extra yard details: lamp posts ---------- */
  if (def.id === 'yard') {
    for (let i = 0; i < 8; i++) {
      const p = tryPlace(0.6, 0.6, 3);
      if (!p) continue;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 7, 8), new THREE.MeshStandardMaterial({ color: 0x3a3d42, metalness: 0.7, roughness: 0.5 }));
      pole.position.set(p.x, 3.5, p.z); pole.castShadow = true; scene.add(pole);
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.18, 0.4), new THREE.MeshBasicMaterial({ color: 0xfff1c0 }));
      lamp.position.set(p.x, 7.0, p.z); scene.add(lamp);
      world.boxes.push({ minX: p.x - 0.12, maxX: p.x + 0.12, minZ: p.z - 0.12, maxZ: p.z + 0.12, minY: 0, maxY: 7 });
      world.shootables.push(pole); world.blockers.push(pole);
    }
  }

  /* ---------- ground detail: large soft blotches break up texture tiling ---------- */
  (function groundDetail() {
    const cols = def.speck;
    const tex = canvasTexture(256, function (ctx, sz) {
      ctx.clearRect(0, 0, sz, sz);
      for (let i = 0; i < 34; i++) {
        const x = Math.random() * sz, y = Math.random() * sz, r = 20 + Math.random() * 60;
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        const c = cssHex(cols[Math.floor(Math.random() * cols.length)]);
        g.addColorStop(0, c); g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.globalAlpha = 0.5;
        ctx.fillStyle = g; ctx.fillRect(0, 0, sz, sz);
      }
      ctx.globalAlpha = 1;
    }, 9, 9);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(900, 900),
      new THREE.MeshStandardMaterial({ map: tex, transparent: true, opacity: 0.55, roughness: 1, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = 0.012;
    mesh.receiveShadow = true;
    scene.add(mesh);
  })();

  /* ---------- scattered instanced detail: grass tufts, shrubs, snow mounds, puddles ---------- */
  function scatter(count, geos, mat, smin, smax, yOff, flat) {
    count = Math.round(count * quality.density);
    if (count < 1) return;
    const meshes = geos.map(function (g) {
      const m = new THREE.InstancedMesh(g, mat, count);
      m.frustumCulled = false;
      m.receiveShadow = true;
      return m;
    });
    const dummy = new THREE.Object3D();
    let k = 0;
    for (let i = 0; i < count * 4 && k < count; i++) {
      const x = R(-half + 3, half - 3), z = R(-half + 3, half - 3);
      if (!free(x, z, 0.5, 0.5, 0.25)) continue;
      const sc = R(smin, smax);
      dummy.position.set(x, yOff, z);
      dummy.rotation.set(0, R(0, 6.28), 0);
      dummy.scale.set(sc, sc * (flat ? 0.35 : R(0.8, 1.4)), sc);
      dummy.updateMatrix();
      meshes.forEach(function (m) { m.setMatrixAt(k, dummy.matrix); });
      k++;
    }
    meshes.forEach(function (m) { m.count = k; m.instanceMatrix.needsUpdate = true; scene.add(m); });
  }
  function tuftTexture(c1, c2) {
    return canvasTexture(64, function (ctx, sz) {
      ctx.clearRect(0, 0, sz, sz);
      for (let i = 0; i < 16; i++) {
        const x = sz * (0.15 + Math.random() * 0.7), h = sz * (0.4 + Math.random() * 0.55), lean = (Math.random() - 0.5) * 14;
        const g = ctx.createLinearGradient(0, sz, 0, sz - h);
        g.addColorStop(0, cssHex(c1)); g.addColorStop(1, cssHex(c2));
        ctx.strokeStyle = g; ctx.lineWidth = 2 + Math.random() * 2; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(x, sz); ctx.quadraticCurveTo(x + lean * 0.4, sz - h * 0.6, x + lean, sz - h); ctx.stroke();
      }
    }, 1, 1);
  }
  function tuftGeos() {
    const a = new THREE.PlaneGeometry(1.0, 0.8); a.translate(0, 0.4, 0);
    const b = new THREE.PlaneGeometry(1.0, 0.8); b.translate(0, 0.4, 0); b.rotateY(Math.PI / 2);
    return [a, b];
  }
  function tuftMat(c1, c2) {
    return new THREE.MeshStandardMaterial({ map: tuftTexture(c1, c2), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 1 });
  }

  if (def.id === 'jungle') {
    scatter(1700, tuftGeos(), tuftMat(0x2f6b22, 0x7bc24a), 0.7, 1.5, 0, false);
    scatter(500, tuftGeos(), tuftMat(0x3a5a1f, 0xa6c45a), 0.5, 1.1, 0, false);
  } else if (def.id === 'dust') {
    scatter(520, tuftGeos(), tuftMat(0x8a7040, 0xd4bb7a), 0.5, 1.2, 0, false);
    scatter(60, [new THREE.DodecahedronGeometry(0.25, 0)], new THREE.MeshStandardMaterial({ color: 0x8a7552, roughness: 1, flatShading: true }), 0.6, 1.6, 0.08, true);
  } else if (def.id === 'snow') {
    scatter(160, [new THREE.SphereGeometry(0.9, 10, 7)], new THREE.MeshStandardMaterial({ color: 0xf4f8fc, roughness: 1 }), 0.8, 2.2, 0, true);
    scatter(260, tuftGeos(), tuftMat(0x6b5a3c, 0xb09a6a), 0.4, 0.9, 0, false);
  } else if (def.id === 'yard') {
    const pm = new THREE.MeshStandardMaterial({ color: 0x151d28, roughness: 0.04, metalness: 0.75, transparent: true, opacity: 0.8, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
    const pg = new THREE.CircleGeometry(1, 20);
    pg.rotateX(-Math.PI / 2);
    scatter(26, [pg], pm, 1.2, 3.4, 0.03, false);
    const oil = new THREE.MeshStandardMaterial({ color: 0x0a0a0c, roughness: 0.3, metalness: 0.4, transparent: true, opacity: 0.6, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
    scatter(14, [pg], oil, 0.6, 1.4, 0.035, false);
  }

  /* ---------- sun-lit god ray planes would go here; kept simple for performance ---------- */

  return world;
}
