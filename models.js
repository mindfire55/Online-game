/* ===================== STRIKE ZONE - models.js =====================
   Realistic animated characters.
   Loads a rigged, textured human model (the free Mixamo "Soldier" that ships with the three.js examples)
   and gives every soldier real Idle / Walk / Run animation, plus arm IK so they hold and aim a rifle.

   Where the files come from (tried in this order, first one that works wins):
     1. /strikezone/models/soldier.glb        <- put your OWN rigged .glb here to override (see models/README.txt)
     2. jsDelivr / three.js.org / GitHub copies of three.js's Soldier.glb
   GLTFLoader.js and SkeletonUtils.js are loaded by index.html (jsDelivr) just before this file.

   If anything fails (offline, blocked, missing) the game silently keeps using the built-in procedural
   soldiers from game.js, so nothing can break.
   game.js uses:  Models.preload(), Models.ready(), Models.status(), Models.create({tint, ...})
*/
const Models = (function () {
  const URLS = [
    'models/soldier.glb',
    'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r128/examples/models/gltf/Soldier.glb',
    'https://threejs.org/examples/models/gltf/Soldier.glb',
    'https://raw.githubusercontent.com/mrdoob/three.js/r128/examples/models/gltf/Soldier.glb'
  ];
  const TARGET_HEIGHT = 1.8;        // metres: the model is scaled to this height
  const st = { ready: false, state: 'idle', msg: 'not started', gltf: null, scale: 1, yaw: Math.PI, footY: 0, url: '' };
  let started = false;
  const listeners = [];

  // reusable temporaries (no per-frame allocations)
  let T = null;
  function temps() {
    if (T) return T;
    T = {
      a: new THREE.Vector3(), b: new THREE.Vector3(), c: new THREE.Vector3(), d: new THREE.Vector3(), e: new THREE.Vector3(),
      f: new THREE.Vector3(), g: new THREE.Vector3(), h: new THREE.Vector3(), pole: new THREE.Vector3(),
      tr: new THREE.Vector3(), tl: new THREE.Vector3(), pr: new THREE.Vector3(), pl: new THREE.Vector3(),
      q1: new THREE.Quaternion(), q2: new THREE.Quaternion(), q3: new THREE.Quaternion(), q4: new THREE.Quaternion(),
      q5: new THREE.Quaternion(), q6: new THREE.Quaternion()
    };
    return T;
  }

  function hasLoader() {
    return typeof THREE !== 'undefined' && !!THREE.GLTFLoader && !!THREE.SkeletonUtils && !!THREE.AnimationMixer;
  }
  function done(ok, msg) {
    st.ready = ok; st.state = ok ? 'ready' : 'offline'; st.msg = msg;
    listeners.splice(0).forEach(function (f) { try { f(ok); } catch (e) { /* ignore */ } });
  }

  /* ---------- loading ---------- */
  function preload(cb) {
    if (cb) { if (st.state === 'ready' || st.state === 'offline') { cb(st.ready); return; } listeners.push(cb); }
    if (started) return;
    started = true;
    if (!hasLoader()) { done(false, 'GLTFLoader not available (offline?)'); return; }
    st.state = 'loading'; st.msg = 'downloading character model...';
    let i = 0;
    const loader = new THREE.GLTFLoader();
    const killTimer = setTimeout(function () { if (st.state === 'loading') done(false, 'timed out'); }, 25000);
    function next() {
      if (st.state !== 'loading') return;
      if (i >= URLS.length) { clearTimeout(killTimer); done(false, 'no model could be downloaded'); return; }
      const url = URLS[i++];
      try {
        loader.load(url, function (gltf) {
          if (st.state !== 'loading') return;
          try {
            prepare(gltf, url);
            clearTimeout(killTimer);
            done(true, 'loaded ' + url);
          } catch (e) { console.warn('[models] could not use ' + url + ': ' + e.message); next(); }
        }, undefined, function () { next(); });
      } catch (e) { next(); }
    }
    next();
  }

  function findBone(root, re) {
    let hit = null;
    root.traverse(function (o) { if (!hit && o.isBone && re.test(o.name)) hit = o; });
    return hit;
  }

  /* measure the model once: height -> scale, which way the feet point -> yaw, lowest point -> footY */
  function prepare(gltf, url) {
    const scene = gltf.scene;
    if (!scene) throw new Error('no scene');
    let skinned = 0;
    scene.traverse(function (o) { if (o.isSkinnedMesh) skinned++; });
    if (!skinned) throw new Error('model has no skin');
    if (!gltf.animations || !gltf.animations.length) throw new Error('model has no animations');
    scene.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(scene);
    const h = box.max.y - box.min.y;
    if (isFinite(h) && h > 0.2 && h < 500) {
      st.scale = TARGET_HEIGHT / h;
      st.footY = -box.min.y * st.scale;
    } else { st.scale = 1; st.footY = 0; }
    // which way is "forward"? the toes point forward from the foot
    st.yaw = Math.PI;                                 // glTF convention: faces +Z, the game faces -Z
    try {
      const foot = findBone(scene, /LeftFoot$/i), toe = findBone(scene, /LeftToe(Base)?$/i);
      if (foot && toe) {
        const t = temps();
        foot.getWorldPosition(t.a); toe.getWorldPosition(t.b);
        t.b.sub(t.a);
        if (Math.hypot(t.b.x, t.b.z) > 0.005) st.yaw = Math.PI - Math.atan2(t.b.x, t.b.z);
      }
    } catch (e) { /* keep default */ }
    st.gltf = gltf; st.url = url;
  }

  /* ---------- two-bone IK in world space (works whatever the bone axes are) ---------- */
  function rotateBoneToward(bone, childWorld, targetWorld) {
    const t = temps();
    bone.getWorldPosition(t.e);
    t.f.copy(childWorld).sub(t.e);
    t.g.copy(targetWorld).sub(t.e);
    if (t.f.lengthSq() < 1e-10 || t.g.lengthSq() < 1e-10) return;
    t.f.normalize(); t.g.normalize();
    t.q1.setFromUnitVectors(t.f, t.g);
    bone.getWorldQuaternion(t.q2);
    t.q2.premultiply(t.q1);                           // new world rotation
    bone.parent.getWorldQuaternion(t.q3);
    t.q3.invert();
    bone.quaternion.copy(t.q3.multiply(t.q2));        // back into the parent's space
    bone.updateWorldMatrix(false, true);
  }
  /* bend root->mid->end so that "end" reaches target; pole = direction the elbow should point; w = blend 0..1 */
  function twoBone(root, mid, end, target, poleDir, w) {
    const t = temps();
    root.getWorldPosition(t.a); mid.getWorldPosition(t.b); end.getWorldPosition(t.c);
    const l1 = t.a.distanceTo(t.b), l2 = t.b.distanceTo(t.c);
    t.d.copy(target).sub(t.a);
    let d = t.d.length();
    if (d < 1e-4 || l1 < 1e-4 || l2 < 1e-4) return;
    t.d.multiplyScalar(1 / d);                        // u
    d = Math.min(Math.max(d, Math.abs(l1 - l2) + 0.01), l1 + l2 - 0.001);
    const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
    const hgt = Math.sqrt(Math.max(0, l1 * l1 - a * a));
    t.pole.copy(poleDir);
    t.pole.addScaledVector(t.d, -t.pole.dot(t.d));
    if (t.pole.lengthSq() < 1e-6) t.pole.set(0, -1, 0);
    t.pole.normalize();
    t.h.copy(t.a).addScaledVector(t.d, a).addScaledVector(t.pole, hgt);      // wanted elbow position
    const q0r = root.quaternion.clone(), q0m = mid.quaternion.clone();
    t.f.copy(t.b);                                    // current elbow (rotateBone reuses f/g/e)
    const elbowOld = t.f.clone();
    const elbowNew = t.h.clone();
    rotateBoneToward(root, elbowOld, elbowNew);
    mid.getWorldPosition(t.b); end.getWorldPosition(t.c);
    const handNow = t.c.clone();
    rotateBoneToward(mid, handNow, target);
    if (w < 0.999) {
      const qr = root.quaternion.clone(), qm = mid.quaternion.clone();
      root.quaternion.copy(q0r).slerp(qr, w);
      mid.quaternion.copy(q0m).slerp(qm, w);
      root.updateWorldMatrix(false, true);
    }
  }

  /* ---------- create one character ---------- */
  const NAMES = {
    head: /Head$/i, spine2: /Spine2$/i, spine1: /Spine1$/i, spine: /Spine$/i, hips: /Hips$/i,
    lArm: /LeftArm$/i, lFore: /LeftForeArm$/i, lHand: /LeftHand$/i, rArm: /RightArm$/i, rFore: /RightForeArm$/i, rHand: /RightHand$/i,
    lUpLeg: /LeftUpLeg$/i, lLeg: /LeftLeg$/i, rUpLeg: /RightUpLeg$/i, rLeg: /RightLeg$/i
  };
  // [bone, shape, size, part]    (proxy sits halfway between the bone and its first child bone)
  const PROXIES = [
    ['head', 's', 0.15, 'head'],
    ['spine2', 'b', [0.5, 0.34, 0.3], 'body'], ['spine1', 'b', [0.46, 0.3, 0.28], 'body'], ['spine', 'b', [0.42, 0.26, 0.26], 'body'],
    ['hips', 'b', [0.4, 0.24, 0.28], 'body'],
    ['lArm', 's', 0.1, 'limb'], ['lFore', 's', 0.085, 'limb'], ['rArm', 's', 0.1, 'limb'], ['rFore', 's', 0.085, 'limb'],
    ['lUpLeg', 's', 0.13, 'limb'], ['lLeg', 's', 0.105, 'limb'], ['rUpLeg', 's', 0.13, 'limb'], ['rLeg', 's', 0.105, 'limb']
  ];
  let HIDDEN = null;

  /* opts: tint (hex multiplier on the texture), emissiveSafe */
  function create(opts) {
    opts = opts || {};
    if (!st.ready) return null;
    const clone = THREE.SkeletonUtils.clone(st.gltf.scene);
    clone.rotation.y = st.yaw;
    clone.scale.set(st.scale, st.scale, st.scale);
    clone.position.y = st.footY;
    const g = new THREE.Group();
    g.add(clone);

    const bones = {};
    Object.keys(NAMES).forEach(function (k) { bones[k] = findBone(clone, NAMES[k]); });
    const mats = [];
    clone.traverse(function (o) {
      if (o.isMesh || o.isSkinnedMesh) {
        o.castShadow = true; o.receiveShadow = false;
        o.frustumCulled = false;                       // skinned bounds are unreliable
        const list = Array.isArray(o.material) ? o.material : [o.material];
        const fresh = list.map(function (m) {
          const c = m.clone();
          if (opts.tint != null && c.color) c.color.setHex(opts.tint);
          if (c.emissive) mats.push(c);
          return c;
        });
        o.material = Array.isArray(o.material) ? fresh : fresh[0];
      }
    });

    // animation clips
    const mixer = new THREE.AnimationMixer(clone);
    const act = {};
    st.gltf.animations.forEach(function (clip) {
      const n = clip.name.toLowerCase();
      const key = /idle/.test(n) ? 'idle' : /run|sprint/.test(n) ? 'run' : /walk/.test(n) ? 'walk' : null;
      if (!key || act[key]) return;
      const a = mixer.clipAction(clip);
      a.play(); a.setEffectiveWeight(key === 'idle' ? 1 : 0);
      act[key] = a;
    });
    if (!act.idle) { const c0 = st.gltf.animations[0]; act.idle = mixer.clipAction(c0); act.idle.play(); }
    if (!act.walk) act.walk = act.idle;
    if (!act.run) act.run = act.walk;
    mixer.update(Math.random() * 2);                   // so a crowd doesn't move in sync

    // invisible hit-boxes that follow the bones (raycasts cannot see skinned meshes)
    if (!HIDDEN) HIDDEN = new THREE.MeshBasicMaterial({ visible: false });
    const proxies = [], parts = [];
    PROXIES.forEach(function (p) {
      const b = bones[p[0]];
      if (!b) return;
      const geo = p[1] === 's' ? new THREE.SphereGeometry(p[2], 8, 6) : new THREE.BoxGeometry(p[2][0], p[2][1], p[2][2]);
      const m = new THREE.Mesh(geo, HIDDEN);
      m.userData.part = p[3];
      g.add(m);
      let child = null;
      for (let i = 0; i < b.children.length; i++) if (b.children[i].isBone) { child = b.children[i]; break; }
      proxies.push({ mesh: m, bone: b, child: child, lift: p[0] === 'head' ? 0.0 : 0 });
      parts.push(m);
    });

    // dummy joint groups so the old procedural animation code can keep writing to them harmlessly
    const mkG = function () { const x = new THREE.Group(); g.add(x); return x; };
    const rig = {
      group: g, parts: parts, mats: mats, glb: null, walkT: 0,
      legL: mkG(), legR: mkG(), kneeL: mkG(), kneeR: mkG(), torso: mkG(), head: mkG(),
      armR: mkG(), armL: mkG(), elbowR: mkG(), elbowL: mkG(), holderA: mkG(), holderB: mkG(), holder: mkG(), helmet: null
    };

    const tmp = { aim: 0, spd: 0, ph: 0 };
    const glb = {
      bones: bones, mixer: mixer, frozen: false,
      freeze: function () { glb.frozen = true; mixer.timeScale = 0; },
      /* p: { spd (m/s), aim (0..1 raise the rifle), recoil (0..1), dt } */
      update: function (dt, p) {
        const t = temps();
        if (!glb.frozen) {
          const spd = p.spd || 0;
          // blend idle / walk / run by speed
          let wi = 0, ww = 0, wr = 0;
          if (spd < 0.25) wi = 1;
          else if (spd < 2.0) { ww = Math.min(1, spd / 1.6); wi = 1 - ww; }
          else { wr = Math.min(1, (spd - 2.0) / 1.2); ww = 1 - wr; }
          tmp.wi += (wi - tmp.wi) * Math.min(1, dt * 9); tmp.ww += (ww - tmp.ww) * Math.min(1, dt * 9); tmp.wr += (wr - tmp.wr) * Math.min(1, dt * 9);
          act.idle.setEffectiveWeight(tmp.wi);
          if (act.walk !== act.idle) act.walk.setEffectiveWeight(tmp.ww);
          if (act.run !== act.walk) act.run.setEffectiveWeight(tmp.wr);
          if (act.walk !== act.idle) act.walk.setEffectiveTimeScale(Math.max(0.5, Math.min(1.7, spd / 1.5)));
          if (act.run !== act.walk) act.run.setEffectiveTimeScale(Math.max(0.6, Math.min(1.5, spd / 4.2)));
          mixer.update(dt);
        }
        g.updateMatrixWorld(true);
        // raise the rifle: right hand to the shoulder, left hand to the fore-grip
        tmp.aim += ((p.aim || 0) - tmp.aim) * Math.min(1, dt * 7);
        if (tmp.aim > 0.02 && bones.rArm && bones.rFore && bones.rHand && bones.lArm && bones.lFore && bones.lHand) {
          const rc = (p.recoil || 0) * 0.06;
          t.tr.set(0.17, 1.36, -0.38 + rc); g.localToWorld(t.tr);
          t.tl.set(-0.03, 1.31, -0.56 + rc); g.localToWorld(t.tl);
          t.pr.set(0.3, -1, 0.1).transformDirection(g.matrixWorld);
          t.pl.set(-0.35, -1, 0.1).transformDirection(g.matrixWorld);
          twoBone(bones.rArm, bones.rFore, bones.rHand, t.tr, t.pr, tmp.aim);
          twoBone(bones.lArm, bones.lFore, bones.lHand, t.tl, t.pl, tmp.aim);
        }
        // the rifle follows the right hand
        if (bones.rHand) {
          bones.rHand.getWorldPosition(t.c);
          g.worldToLocal(t.c);
          rig.holder.position.copy(t.c);
          rig.holder.rotation.x = -0.42 * (1 - tmp.aim) + (p.pitch || 0);
        }
        // hit-boxes follow the skeleton
        for (let i = 0; i < proxies.length; i++) {
          const pr = proxies[i];
          pr.bone.getWorldPosition(t.a);
          if (pr.child) { pr.child.getWorldPosition(t.b); t.a.add(t.b).multiplyScalar(0.5); }
          g.worldToLocal(t.a);
          pr.mesh.position.copy(t.a);
        }
        if (bones.head) { bones.head.getWorldPosition(t.a); g.worldToLocal(t.a); rig.head.position.copy(t.a); }
      }
    };
    tmp.wi = 1; tmp.ww = 0; tmp.wr = 0;
    rig.glb = glb;
    return rig;
  }

  return {
    preload: preload,
    ready: function () { return st.ready; },
    status: function () { return st.state; },
    message: function () { return st.msg; },
    create: create,
    URLS: URLS,
    _state: st,
    _twoBone: twoBone                     // exposed for the self-test
  };
})();
