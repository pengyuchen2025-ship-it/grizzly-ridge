// 宣传片镜头脚本（注入到 ?rec=1 的游戏页面里运行）
// 每个镜头：frames（30fps 帧数）、setup()（摆场景 + 设置镜头函数）、tick(i, t)（每帧控制怪兽输入）
(() => {
  const R = window.__rec, THREE = R.THREE, V = R.V3, P = R.player;
  const lerp = (a, b, k) => a + (b - a) * k;
  const ease = (k) => (k < 0 ? 0 : k > 1 ? 1 : k * k * (3 - 2 * k));
  const v = (x, y, z) => new V(x, y, z);
  const lerpV = (a, b, k) => v(lerp(a.x, b.x, k), lerp(a.y, b.y, k), lerp(a.z, b.z, k));
  let T = 0; // shot time (s), updated by tick
  const shakeOff = (s) => (s > 0 ? v((Math.random() * 2 - 1) * s * 0.6, (Math.random() * 2 - 1) * s * 0.6, 0) : v(0, 0, 0));

  const H = {
    place(x, z, r, ground = 0) { P.r = P.targetR = r; P.pos.set(x, ground + r, z); P.vel.set(0, 0, 0); P.grounded = true; P.root.position.copy(P.pos); },
    // remove civilians / cops within radius of a point (or everywhere)
    clearPeople(x, z, rad = 1e9, keepRoof = true) {
      for (const list of [R.civilians, R.cops]) for (let i = list.length - 1; i >= 0; i--) { const e = list[i]; if (keepRoof && e.roof) continue; if (Math.hypot(e.pos.x - x, e.pos.z - z) < rad) { R.scene.remove(e.mesh); list.splice(i, 1); } }
    },
    clearCars(x, z, rad = 1e9) { for (let i = R.cars.length - 1; i >= 0; i--) { const c = R.cars[i]; if (Math.hypot(c.pos.x - x, c.pos.z - z) < rad) { R.scene.remove(c.mesh); R.cars.splice(i, 1); } } },
    person(x, z, kind = Math.random() < 0.5 ? 'man' : 'woman', dir = null) {
      const e = R.spawnPerson(kind, v(x, 0, z)); e.pos.set(x, 0, z);
      if (dir) { e.dir.set(dir[0], 0, dir[1]).normalize(); e.t = 99; }
      return e;
    },
    parked(x, z, rotY = 0, police = false) {
      const { mesh, lights } = R.makeCar(police); mesh.position.set(x, 0, z); mesh.rotation.y = rotY; R.scene.add(mesh);
      const c = { mesh, pos: mesh.position, police, lights, state: police ? 'stop' : 'parked', ix: 0, iz: 0, tx: 0, tz: 0, deployed: true, vy: 0, spin: 0, flash: Math.random(), roadblock: police };
      R.cars.push(c); return c;
    },
    limbs(n) { for (let i = 0; i < n; i++) R.growLimb(Math.random() < 0.2); },
    // camera: position + look target (functions of time), with game shake added
    cam(posFn, lookFn, fov = 55) {
      R.cam = (camera, dt, shake) => {
        const p = posFn(T), l = lookFn(T);
        camera.position.copy(p).add(shakeOff(shake));
        if (camera.fov !== fov) { camera.fov = fov; camera.updateProjectionMatrix(); }
        camera.lookAt(l);
      };
    },
    // smooth follow camera: offset from the monster, damped
    follow(offsetFn, lookOffFn = () => v(0, 0, 0), fov = 55, damp = 6) {
      let cur = null, curL = null;
      R.cam = (camera, dt, shake) => {
        const want = P.pos.clone().add(offsetFn(T)), wantL = P.pos.clone().add(lookOffFn(T));
        if (!cur) { cur = want.clone(); curL = wantL.clone(); }
        cur.lerp(want, Math.min(1, dt * damp)); curL.lerp(wantL, Math.min(1, dt * damp * 1.5));
        camera.position.copy(cur).add(shakeOff(shake));
        if (camera.fov !== fov) { camera.fov = fov; camera.updateProjectionMatrix(); }
        camera.lookAt(curL);
      };
    },
  };

  const S = {};

  // 1. 开场航拍：雨夜灰岭市
  S.aerial = {
    frames: 132,
    setup() {
      H.place(-60, 60, 1.2); P.root.visible = false;
      H.cam((t) => lerpV(v(-5, 46, 118), v(-22, 34, 88), ease(t / 4.4)), (t) => lerpV(v(5, 6, 0), v(-12, 4, 18), ease(t / 4.4)), 50);
    },
    tick() { R.input = null; },
  };

  // 2. 伏击：路人在雨夜街头奔逃，被怪兽从背后吞掉
  S.ambush = {
    frames: 135,
    setup() {
      H.clearPeople(-60, 50, 45); H.clearCars(-60, 55, 30);
      H.place(-60, 18, 1.6); H.limbs(4);
      this.v = H.person(-59.6, 48, 'woman', [0, 1]);
      H.person(-63.5, 44, 'man', [-0.3, 1]); H.person(-55.8, 41, 'man', [0.2, 1]);
      H.cam((t) => v(-57.2, 1.45, 74), (t) => lerpV(v(-60, 2.4, 54), v(-59.6, 1.6, 64), ease((t - 1.2) / 2.2)), 44);
    },
    tick(i, t) {
      const e = this.v;
      if (R.civilians.includes(e)) { e.pos.x = -59.6 + Math.sin(t * 3) * 0.3; e.pos.z = 48 + 4.6 * t; e.dir.set(0, 0, 1); const dx = e.pos.x - P.pos.x; R.input = { x: dx * 0.3, z: 1 }; }
      else R.input = { x: 0, z: 0 };
    },
  };

  // 3. 吞噬狂欢：商业街人群
  S.frenzy = {
    frames: 96,
    setup() {
      const x = -30, z0 = 18;
      H.clearPeople(x, 0, 45); H.clearCars(x, 0, 30);
      H.place(x, z0, 2.0); H.limbs(10);
      for (let k = 0; k < 12; k++) H.person(x + (Math.random() * 2 - 1) * 4, z0 - 4 - k * 1.6, undefined, [Math.random() - 0.5, -1]);
      H.follow((t) => v(5.5 - t * 0.6, 3.2, 6.5), () => v(0, 1, -2), 50, 5);
    },
    tick(i, t) { R.input = { x: Math.sin(t * 2.2) * 0.35, z: -1 }; },
  };

  // 4. 特写：长满手脚的肉块（环绕）
  S.limbs = {
    frames: 84,
    setup() {
      H.clearPeople(-60, 60, 30);
      H.place(-60, 60, 2.3); H.limbs(40);
      H.cam((t) => { const a = 0.9 + t * 0.45; return v(-60 + Math.cos(a) * 10, 2.6 + t * 0.4, 60 + Math.sin(a) * 10); }, () => v(-60, 2.4, 60), 40);
    },
    tick(i, t) { R.input = { x: 0.08, z: 0.04 }; },
  };

  // 5. 爬墙：撞碎玻璃爬上楼（机位跟着往上升）
  S.climb = {
    frames: 100,
    setup() {
      H.clearPeople(-56, 45, 25);
      H.place(-58, 45, 1.9); H.limbs(14);
      let ly = 3;
      H.cam((t) => v(-66, lerp(2.2, 13, ease(t / 3.2)), lerp(53, 51, t / 3.3)), (t) => { ly += (Math.min(P.pos.y, 19) - ly) * 0.12; return v(-54, ly + 0.5, 45); }, 52);
    },
    tick(i, t) { R.input = { x: 1, z: 0 }; },
  };

  // 6. 楼顶跃下砸地：冲击波震倒行人
  S.slam = {
    frames: 105,
    setup() {
      H.clearPeople(-60, 45, 30);
      H.place(-43, 45, 2.4, 18.1); H.limbs(20);
      for (let k = 0; k < 10; k++) H.person(-60 + (Math.random() * 2 - 1) * 4.5, 46 + (Math.random() * 2 - 1) * 6, undefined, [Math.random() - 0.5, Math.random() - 0.5]);
      let l = null;
      H.cam(() => v(-63, 2.4, 63), () => { const want = P.pos.clone(); want.y -= 0.5; l = l ? l.lerp(want, 0.18) : want; return l; }, 56);
    },
    tick(i, t) {
      R.input = t < 0.95 ? { x: -1, z: 0.05 } : null;
      if (i === 21) R.jump();
    },
  };

  // 7. 警方到场（停顿段）：警车闪灯、警察举枪
  S.police = {
    frames: 105,
    setup() {
      H.clearPeople(-30, 22, 40); H.clearCars(-30, 15, 30);
      H.place(-30, 30, 2.7); H.limbs(26);
      const c1 = H.parked(-31.5, 12, Math.PI / 2 + 0.25, true), c2 = H.parked(-27, 15.5, Math.PI / 2 - 0.5, true);
      for (const [x, z] of [[-34, 15], [-29, 18], [-25, 19], [-33.5, 19.5]]) { const e = R.spawnPerson('police', v(x, 0, z)); e.pos.set(x, 0, z); }
      H.cam((t) => lerpV(v(-26.5, 1.1, 6.5), v(-27.5, 1.3, 8.5), t / 3.5), () => v(-30, 2.2, 28), 46);
    },
    tick() { R.input = null; },
  };

  // 8. 压爆警车路障：连环爆炸
  S.crush = {
    frames: 96,
    setup() {
      H.clearPeople(-30, 18, 30); H.clearCars(-30, 18, 30);
      H.place(-30, 34, 3.4); H.limbs(30);
      for (const x of [-33.4, -30, -26.6]) H.parked(x, 16, Math.PI / 2 + (Math.random() - 0.5) * 0.5, true);
      for (const x of [-34, -31, -27]) { const e = R.spawnPerson('police', v(x, 0, 12.5)); e.pos.set(x, 0, 12.5); }
      H.cam((t) => lerpV(v(-18.5, 1.5, 12.5), v(-19.5, 2.2, 11), t / 3.2), () => v(-29, 3, 20), 50);
    },
    tick(i, t) { R.input = { x: 0, z: -1 }; },
  };

  // 9. 加油站三连爆
  S.gas = {
    frames: 105,
    setup() {
      const g = R.cityCtx.gasStation;
      H.clearPeople(g.x, g.z, 30);
      H.place(g.x, g.z + 12.5, 3.2); H.limbs(30); this.g = g;
      H.cam((t) => lerpV(v(g.x + 17, 4, g.z + 22), v(g.x + 19, 5.5, g.z + 25), t / 3.5), () => v(g.x, 3, g.z), 50);
    },
    tick(i, t) { R.input = !this.g.exploded ? { x: 0, z: -1 } : null; },
  };

  // 10. 楼顶跳起撞直升机 → 坠毁
  S.heli = {
    frames: 150,
    setup() {
      H.clearPeople(-45, 45, 20, false);
      H.place(-44, 49.5, 3.0, 18.1); H.limbs(30);
      const h = R.spawnHeli(false); this.h = h;
      h.pos.set(-44 + 14, 30, 49.5 - 10); h.dive = 99; h.diveT = 99; h.angle = -0.6; h.fireT = 0.2;
      let l = null;
      H.cam((t) => lerpV(v(-50, 21.5, 62), v(-52, 21, 63), t / 5), () => { const want = this.h.state === 'falling' ? this.h.pos.clone() : P.pos.clone().lerp(this.h.pos, 0.55); l = l ? l.lerp(want, 0.12) : want; return l; }, 55);
    },
    tick(i, t) {
      R.input = null;
      if (i === 48) R.jump();
      if (i > 48 && i < 75 && this.h.state !== 'falling') { const d = this.h.pos.clone().sub(P.pos); R.input = { x: d.x * 0.2, z: d.z * 0.2 }; }
    },
  };

  // 11. 高潮：巨大的怪兽、燃烧的城市、直升机探照灯（机位拉远）
  S.climax = {
    frames: 210,
    setup() {
      H.clearPeople(-30, 30, 30);
      H.place(-30, 30, 6.5); H.limbs(45);
      for (const [x, z] of [[-38, 22], [-21, 38], [-24, 18], [-40, 40], [-14, 26], [-30, 48]]) R.fire(v(x, 0, z), Infinity);
      for (const [x, z, r] of [[-37, 25, 0.3], [-22, 35, 1.8], [-16, 30, 1.2]]) { const c = H.parked(x, z, r); c.state = 'wreck'; c.mesh.traverse((o) => { if (o.isMesh && o.material) { o.material = o.material.clone(); o.material.color && o.material.color.setHex(0x1a1614); } }); }
      for (let k = 0; k < 3; k++) { const h = R.spawnHeli(false); h.angle = k * 2.1; h.pos.set(-30 + Math.cos(h.angle) * 26, 24, 30 + Math.sin(h.angle) * 26); }
      for (let k = 0; k < 8; k++) H.person(-30 + (Math.random() * 2 - 1) * 16, 30 + (Math.random() * 2 - 1) * 16);
      H.cam((t) => { const k = ease(t / 7); const a = Math.PI + 0.5 - t * 0.09; const d = lerp(15, 44, k); return v(-30 + Math.cos(a) * d, lerp(3, 30, k), 30 + Math.sin(a) * d); }, (t) => v(-30, lerp(6, 3, ease(t / 7)), 30), 52);
    },
    tick(i, t) {
      R.input = { x: Math.sin(t * 0.8) * 0.15, z: Math.cos(t * 0.8) * 0.15 };
      if (i === 30 || i === 95 || i === 150) { const a = Math.random() * 6.28; const p = v(-30 + Math.cos(a) * 14, 1, 30 + Math.sin(a) * 14); R.explosion(p, 1.6); R.fire(p.clone().setY(0), Infinity); R.shake = 0.8; R.events.push({ n: 'boom', t: R.clock, a: [] }); }
    },
  };

  const SH = { names: Object.keys(S), t0: 0,
    begin(name) { const s = S[name]; this.cur = s; R.reseed(1234); s.setup(); T = 0; this.t0 = R.clock; return s.frames; },
    tick(i) { T = i / 30; this.cur.tick(i, T); },
  };
  window.SHOTS = SH;
})();
