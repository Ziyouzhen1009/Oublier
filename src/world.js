(function (global) {
  "use strict";

  const Oublier = (global.Oublier = global.Oublier || {});

  let canvas = null;
  let renderer = null;
  let scene = null;
  let camera = null;

  let width = 1280;
  let height = 720;
  let running = false;
  let lastTime = 0;
  let elapsed = 0;

  let currentMoodId = "midnight";
  let extraStarsCount = 0;
  let overlookActive = false;

  // 相机状态（第三人称跟随 + 拖拽旋转）
  const camState = {
    yaw: 0.15,
    pitch: 0.44,
    dist: 17.5,
    targetYaw: 0.15,
    targetPitch: 0.44,
    targetDist: 17.5,
    lookAt: new THREE.Vector3(0, 1.8, 0)
  };

  // 玩家状态（初始在圣火坛南侧石路上，面向北方的玫瑰窗与圣火坛）
  const player = {
    x: 0,
    y: 0,
    z: 10.5,
    vx: 0,
    vz: 0,
    yaw: Math.PI,
    speed: 10.5,
    target: null,
    pendingAction: null,
    rig: null,
    lanternLight: null
  };

  const keys = Object.create(null);
  let pointerState = {
    down: false,
    startX: 0,
    startY: 0,
    lastX: 0,
    lastY: 0,
    dragged: false
  };

  let nearbyTarget = null;
  let callbacks = {
    onInteractLandmark: function () {},
    onInteractTraveler: function () {},
    onNearbyChange: function () {},
    onFrameUpdate: function () {},
    isInputBlocked: function () {
      return false;
    }
  };

  // 场景核心引用
  let hemiLight = null;
  let moonLight = null;
  let fireLight = null;
  let roseLight = null;
  let pierLight = null;
  let skyDome = null;
  let moonMesh = null;
  let starPoints = null;
  let seaMesh = null;
  let seaBaseY = null;
  let clickRingMesh = null;
  let clickRingAlpha = 0;

  let stoneMat = null;
  let darkStoneMat = null;
  let roofMat = null;
  let turfMat = null;
  let glassMat = null;
  let ironMat = null;
  let woodMat = null;
  let foliageDarkMat = null;
  let foliageLightMat = null;
  let glowTex = null;

  let brazierObj = null;
  let bellTowerObj = null;
  let pierObj = null;
  let resonanceBellPivot = null;
  let bellSwingAmp = 0;

  const cypressTrees = [];
  const travelers = [];
  const hitTargets = [];
  const fireflyList = [];
  const rainSystem = { points: null, positions: null, count: 550 };
  const embers = [];
  const flyingBottles = [];
  const ripples = [];
  const floatingSprites = [];

  const raycaster = new THREE.Raycaster();
  const pointerNDC = new THREE.Vector2();

  function smoothstep(edge0, edge1, x) {
    const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
    return t * t * (3 - 2 * t);
  }

  function islandOuterRadius(angle) {
    return (
      58 +
      4.5 * Math.cos(angle * 2 - 0.4) +
      3.2 * Math.sin(angle * 3 + 0.8) +
      1.8 * Math.cos(angle * 5 - 1.0)
    );
  }

  /**
   * 扩大版哥特岛屿地形高度函数
   */
  function getGroundHeight(x, z) {
    const r = Math.hypot(x, z);
    const angle = Math.atan2(z, x);
    const outerR = islandOuterRadius(angle);

    // 南部石栈桥走廊
    if (Math.abs(x) <= 3.6 && z >= 40 && z <= 61) {
      return 0.25;
    }

    // 海岸边缘外沉入海床
    if (r > outerR) {
      return Math.max(-2.6, -0.35 - (r - outerR) * 0.22);
    }

    let h = 0;

    // 北方观星钟楼台地 (y = 3.2) & 石阶斜坡
    if (z < -21 && Math.abs(x) < 23) {
      const rise = smoothstep(-21, -34, z);
      const sideFade = 1 - smoothstep(14, 23, Math.abs(x));
      h = Math.max(h, 3.2 * rise * sideFade);
    }

    // 西方回声长廊台地 (y = 0.85)
    if (x < -22 && Math.abs(z + 8) < 18) {
      const ramp = smoothstep(-22, -31, x);
      const zFade = 1 - smoothstep(12, 18, Math.abs(z + 8));
      h = Math.max(h, 0.85 * ramp * zFade);
    }

    // 东方柏林石亭台地 (y = 0.85)
    if (x > 22 && Math.abs(z + 8) < 18) {
      const ramp = smoothstep(22, 31, x);
      const zFade = 1 - smoothstep(12, 18, Math.abs(z + 8));
      h = Math.max(h, 0.85 * ramp * zFade);
    }

    // 东南孤灯望海台 (y = 1.85)
    const dLight = Math.hypot(x - 38, z - 36);
    if (dLight < 16) {
      h = Math.max(h, 1.85 * (1 - smoothstep(8, 16, dLight)));
    }

    // 海岸边缘微落差
    const shoreDrop = smoothstep(outerR - 6, outerR, r) * 0.55;
    return h - shoreDrop;
  }

  function clampWalkable(x, z) {
    let nx = x;
    let nz = z;

    // 南部石栈桥走廊允许通行至 z = 60
    const onPier = Math.abs(nx) <= 2.6 && nz >= 39 && nz <= 60.5;
    if (!onPier) {
      const angle = Math.atan2(nz, nx);
      const maxR = islandOuterRadius(angle) - 3.2;
      const r = Math.hypot(nx, nz);
      if (r > maxR) {
        nx = (nx / r) * maxR;
        nz = (nz / r) * maxR;
      }
    }

    // 避让中央圣火坛石座 (r = 3.9)
    const dFire = Math.hypot(nx, nz);
    if (dFire < 3.9) {
      const push = dFire > 0.01 ? 3.9 / dFire : 1;
      nx = dFire > 0.01 ? nx * push : 0;
      nz = dFire > 0.01 ? nz * push : 3.9;
    }

    // 避让北方钟楼主体墙基
    if (Math.abs(nx) < 6.4 && nz < -50.2) {
      nz = -50.2;
    }

    // 避让东南灯台石塔柱
    const dTower = Math.hypot(nx - 42, nz - 39);
    if (dTower < 2.6) {
      const ang = Math.atan2(nz - 39, nx - 42);
      nx = 42 + Math.cos(ang) * 2.6;
      nz = 39 + Math.sin(ang) * 2.6;
    }

    return { x: nx, z: nz };
  }

  function buildSkyAndOcean() {
    // 梯度天空穹顶
    const skyGeo = new THREE.SphereGeometry(230, 32, 20);
    const count = skyGeo.attributes.position.count;
    const colors = new Float32Array(count * 3);
    skyGeo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    const skyMat = new THREE.MeshBasicMaterial({
      vertexColors: true,
      side: THREE.BackSide,
      fog: false
    });
    skyDome = new THREE.Mesh(skyGeo, skyMat);
    scene.add(skyDome);

    // 月亮圆盘 + 光晕
    moonMesh = new THREE.Mesh(
      new THREE.SphereGeometry(6.5, 20, 20),
      new THREE.MeshBasicMaterial({ color: 0xe6efff, fog: false })
    );
    moonMesh.position.set(-48, 66, -125);
    scene.add(moonMesh);

    const moonHalo = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glowTex,
        color: 0xc2d8ff,
        transparent: true,
        opacity: 0.45,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: false
      })
    );
    moonHalo.scale.set(36, 36, 1);
    moonMesh.add(moonHalo);

    // 3D 星空粒子
    const maxStars = 420;
    const starPos = new Float32Array(maxStars * 3);
    for (let i = 0; i < maxStars; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI * 0.44;
      const r = 175 + Math.random() * 35;
      starPos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      starPos[i * 3 + 1] = r * Math.cos(phi) + 8;
      starPos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
    starGeo.setDrawRange(0, 260);
    const starMat = new THREE.PointsMaterial({
      color: 0xeaf2ff,
      size: 1.5,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.9,
      fog: false
    });
    starPoints = new THREE.Points(starGeo, starMat);
    scene.add(starPoints);

    // 3D 海面
    const seaGeo = new THREE.PlaneGeometry(380, 380, 56, 56);
    seaGeo.rotateX(-Math.PI / 2);
    const posAttr = seaGeo.attributes.position;
    seaBaseY = new Float32Array(posAttr.count);
    for (let i = 0; i < posAttr.count; i++) {
      seaBaseY[i] = posAttr.getY(i);
    }
    const seaMat = new THREE.MeshStandardMaterial({
      color: 0x091322,
      roughness: 0.25,
      metalness: 0.55,
      flatShading: true
    });
    seaMesh = new THREE.Mesh(seaGeo, seaMat);
    seaMesh.position.y = -0.65;
    seaMesh.receiveShadow = true;
    scene.add(seaMesh);
  }

  function buildTerrainAndRoads() {
    // 主岛屿曲面地形
    const geo = new THREE.PlaneGeometry(144, 144, 72, 72);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const vx = pos.getX(i);
      const vz = pos.getZ(i);
      pos.setY(i, getGroundHeight(vx, vz));
    }
    geo.computeVertexNormals();

    const ground = new THREE.Mesh(geo, turfMat);
    ground.receiveShadow = true;
    scene.add(ground);

    // 中央八角石砖庭院
    const courtyard = new THREE.Mesh(
      new THREE.CylinderGeometry(16.8, 17.4, 0.22, 8),
      stoneMat
    );
    courtyard.position.y = -0.02;
    courtyard.receiveShadow = true;
    scene.add(courtyard);

    const innerRing = new THREE.Mesh(
      new THREE.RingGeometry(8.6, 9.2, 8),
      darkStoneMat
    );
    innerRing.rotation.x = -Math.PI / 2;
    innerRing.position.y = 0.11;
    scene.add(innerRing);

    // 四向石板大道
    const nsRoad = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.14, 62), stoneMat);
    nsRoad.position.set(0, 0.04, 9);
    nsRoad.receiveShadow = true;
    scene.add(nsRoad);

    const ewRoad = new THREE.Mesh(new THREE.BoxGeometry(66, 0.14, 4.6), stoneMat);
    ewRoad.position.set(0, 0.04, -8);
    ewRoad.receiveShadow = true;
    scene.add(ewRoad);

    // 通往东南孤灯台的斜石径
    const seRoad = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.14, 34), stoneMat);
    seRoad.position.set(20, 0.12, 18);
    seRoad.rotation.y = -Math.PI / 4;
    seRoad.receiveShadow = true;
    scene.add(seRoad);

    // 北方拾级而上的哥特石阶
    for (let i = 0; i < 12; i++) {
      const t = i / 11;
      const stepZ = -21.5 - t * 12;
      const stepY = t * 3.15;
      const step = new THREE.Mesh(new THREE.BoxGeometry(9.2, 0.42, 1.35), darkStoneMat);
      step.position.set(0, stepY, stepZ);
      step.receiveShadow = true;
      step.castShadow = true;
      scene.add(step);
    }

    // 北方钟楼石板平台
    const northPlaza = new THREE.Mesh(new THREE.BoxGeometry(24, 0.5, 22), stoneMat);
    northPlaza.position.set(0, 3.05, -45);
    northPlaza.receiveShadow = true;
    scene.add(northPlaza);
  }

  function buildGothicArchitecture() {
    // 1. 中央圣火坛 + 环绕八柱哥特尖拱庭院
    brazierObj = Oublier.Models3D.createBrazier(darkStoneMat, ironMat, glowTex);
    scene.add(brazierObj.group);

    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
      const radius = 14.8;
      const arch = Oublier.Models3D.createGothicArch(5.4, 6.8, 0.85, stoneMat, darkStoneMat);
      arch.position.set(Math.cos(a) * radius, 0, Math.sin(a) * radius);
      arch.rotation.y = -a + Math.PI / 2;
      scene.add(arch);
    }

    // 沿主路摆放哥特锻铁路灯
    const glowMat = new THREE.MeshBasicMaterial({ color: 0xffd796 });
    const lanternPositions = [
      [-4.2, 16, 0],
      [4.2, 16, Math.PI],
      [-4.2, 32, 0],
      [4.2, 32, Math.PI],
      [-5.2, -20, 0],
      [5.2, -20, Math.PI],
      [-6.5, -36, 0],
      [6.5, -36, Math.PI],
      [-23, -11, Math.PI / 2],
      [23, -11, -Math.PI / 2]
    ];
    lanternPositions.forEach(function (lp) {
      const l = Oublier.Models3D.createGothicLantern(3.4, ironMat, glowMat, glowTex);
      const y = getGroundHeight(lp[0], lp[1]);
      l.position.set(lp[0], y, lp[1]);
      l.rotation.y = lp[2];
      scene.add(l);
    });

    // 2. 北方观星钟楼 & 玫瑰窗
    bellTowerObj = Oublier.Models3D.createBellTower(stoneMat, darkStoneMat, roofMat, glassMat, glowTex);
    bellTowerObj.group.position.set(0, 3.25, -55.5);
    scene.add(bellTowerObj.group);

    // 3. 西方回声长廊（6组对称哥特尖拱列柱 + 悬吊风钟）
    const cloisterFloor = new THREE.Mesh(new THREE.BoxGeometry(26, 0.4, 11), stoneMat);
    cloisterFloor.position.set(-44, 0.72, -8);
    cloisterFloor.receiveShadow = true;
    scene.add(cloisterFloor);

    for (let i = 0; i < 6; i++) {
      const ax = -33 - i * 4.6;
      const arch = Oublier.Models3D.createGothicArch(6.8, 7.2, 0.9, stoneMat, darkStoneMat);
      arch.position.set(ax, 0.85, -8);
      arch.rotation.y = Math.PI / 2;
      scene.add(arch);
    }

    // 悬吊黄铜风钟
    resonanceBellPivot = new THREE.Group();
    resonanceBellPivot.position.set(-46, 6.2, -8);
    const bellMat = new THREE.MeshStandardMaterial({ color: 0xd5b07a, roughness: 0.38, metalness: 0.75 });
    const bellCord = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.8, 6), ironMat);
    bellCord.position.y = -0.9;
    resonanceBellPivot.add(bellCord);
    const bellBody = new THREE.Mesh(new THREE.ConeGeometry(0.55, 0.85, 10, 1, true), bellMat);
    bellBody.position.y = -2.0;
    resonanceBellPivot.add(bellBody);
    scene.add(resonanceBellPivot);

    // 4. 东方柏林石亭 & 静谧石椅
    const eastFloor = new THREE.Mesh(new THREE.CylinderGeometry(6.5, 7.0, 0.35, 8), stoneMat);
    eastFloor.position.set(46, 0.75, -8);
    eastFloor.receiveShadow = true;
    scene.add(eastFloor);

    const ruinedArch = Oublier.Models3D.createGothicArch(5.6, 6.2, 0.8, stoneMat, darkStoneMat);
    ruinedArch.position.set(48, 0.85, -11.5);
    ruinedArch.rotation.y = -0.35;
    scene.add(ruinedArch);

    const benchGroup = new THREE.Group();
    benchGroup.position.set(46, 0.9, -8);
    const seat = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.22, 0.95), darkStoneMat);
    seat.position.y = 0.55;
    seat.castShadow = true;
    const legL = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.5, 0.85), stoneMat);
    legL.position.set(-1.05, 0.25, 0);
    const legR = legL.clone();
    legR.position.x = 1.05;
    benchGroup.add(seat, legL, legR);
    scene.add(benchGroup);

    const benchLantern = Oublier.Models3D.createGothicLantern(2.5, ironMat, glowMat, glowTex);
    benchLantern.position.set(43.2, 0.9, -7.2);
    scene.add(benchLantern);

    // 5. 东南孤灯望海台
    const overlookBase = new THREE.Mesh(new THREE.CylinderGeometry(7.2, 8.0, 0.5, 8), stoneMat);
    overlookBase.position.set(38, 1.75, 36);
    overlookBase.receiveShadow = true;
    scene.add(overlookBase);

    const watchTower = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.5, 8.2, 8), darkStoneMat);
    watchTower.position.set(42, 5.8, 39);
    watchTower.castShadow = true;
    scene.add(watchTower);

    const towerRoof = new THREE.Mesh(new THREE.ConeGeometry(1.75, 2.8, 8), roofMat);
    towerRoof.position.set(42, 11.8, 39);
    scene.add(towerRoof);

    const towerBeacon = new THREE.Mesh(new THREE.OctahedronGeometry(0.55, 0), glowMat);
    towerBeacon.position.set(42, 10.1, 39);
    scene.add(towerBeacon);

    const towerHalo = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glowTex,
        color: 0xffcc88,
        transparent: true,
        opacity: 0.85,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      })
    );
    towerHalo.position.set(42, 10.1, 39);
    towerHalo.scale.set(6.5, 6.5, 1);
    scene.add(towerHalo);

    // 6. 南方水门尖拱 & 潮汐石栈桥
    const waterGate = Oublier.Models3D.createGothicArch(6.4, 7.4, 1.1, darkStoneMat, stoneMat);
    waterGate.position.set(0, 0.15, 42);
    scene.add(waterGate);

    pierObj = Oublier.Models3D.createGothicPier(stoneMat, woodMat, ironMat, glowMat, glowTex);
    scene.add(pierObj.group);

    // 环岛哥特修长柏树林
    const treeSpecs = [
      [39, -15, 1.15],
      [44, -18, 1.32],
      [51, -13, 1.1],
      [51, -2, 1.24],
      [41, 2, 0.95],
      [-20, -34, 1.28],
      [20, -34, 1.22],
      [-26, -42, 1.1],
      [26, -42, 1.15],
      [-35, 14, 1.18],
      [-43, 22, 1.05],
      [-26, 29, 1.12],
      [23, 26, 1.02],
      [-15, 36, 0.96],
      [16, 36, 1.0]
    ];
    treeSpecs.forEach(function (sp, idx) {
      const tree = Oublier.Models3D.createCypressTree(sp[2], foliageDarkMat, foliageLightMat, woodMat);
      tree.group.position.set(sp[0], getGroundHeight(sp[0], sp[1]) - 0.1, sp[1]);
      tree.phase = idx * 0.7;
      scene.add(tree.group);
      cypressTrees.push(tree);
    });
  }

  function buildEntitiesAndEffects() {
    // 玩家 3D 角色
    player.rig = Oublier.Models3D.createCharacter({
      cloakColor: "#e6ecf5",
      scarfColor: "#e6ab72",
      hasLantern: true,
      glowTex: glowTex
    });
    player.y = getGroundHeight(player.x, player.z);
    player.rig.group.position.set(player.x, player.y, player.z);
    player.rig.group.rotation.y = player.yaw;
    scene.add(player.rig.group);

    // 随身提灯点光源
    player.lanternLight = new THREE.PointLight(0xffb86b, 1.15, 16, 1.6);
    player.lanternLight.position.set(0.45, 1.1, 0.25);
    player.rig.group.add(player.lanternLight);

    // 4 位同行 3D 旅人 + 点击碰撞体积
    travelers.length = 0;
    hitTargets.length = 0;

    Oublier.Data.TRAVELERS.forEach(function (t, i) {
      const rig = Oublier.Models3D.createCharacter({
        cloakColor: t.color,
        scarfColor: t.scarfColor,
        hasLantern: Boolean(t.hasLantern),
        glowTex: glowTex
      });
      const y = getGroundHeight(t.home.x, t.home.z);
      rig.group.position.set(t.home.x, y, t.home.z);
      scene.add(rig.group);

      const hitMesh = new THREE.Mesh(
        new THREE.CylinderGeometry(1.1, 1.1, 2.6, 8),
        new THREE.MeshBasicMaterial({ visible: false })
      );
      hitMesh.position.y = 1.25;
      hitMesh.userData = { kind: "traveler", item: t, refPos: rig.group.position };
      rig.group.add(hitMesh);
      hitTargets.push(hitMesh);

      travelers.push(
        Object.assign({}, t, {
          x: t.home.x,
          y: y,
          z: t.home.z,
          targetX: t.home.x,
          targetZ: t.home.z,
          yaw: Math.random() * Math.PI * 2,
          waitTimer: 1.8 + i * 1.1,
          rig: rig
        })
      );
    });

    // 6 处地标点击碰撞体积 + 地面微光法阵圈
    Oublier.Data.LANDMARKS.forEach(function (lm) {
      const y = getGroundHeight(lm.x, lm.z);
      const beaconRing = new THREE.Mesh(
        new THREE.RingGeometry(1.5, 1.75, 24),
        new THREE.MeshBasicMaterial({
          color: 0xe6b57e,
          transparent: true,
          opacity: 0.35,
          side: THREE.DoubleSide
        })
      );
      beaconRing.rotation.x = -Math.PI / 2;
      beaconRing.position.set(lm.x, y + 0.14, lm.z);
      scene.add(beaconRing);

      const hitMesh = new THREE.Mesh(
        new THREE.CylinderGeometry(2.6, 2.6, 4.6, 10),
        new THREE.MeshBasicMaterial({ visible: false })
      );
      hitMesh.position.set(lm.x, y + 2.2, lm.z);
      hitMesh.userData = { kind: "landmark", item: lm };
      scene.add(hitMesh);
      hitTargets.push(hitMesh);
    });

    // 地面点击引导光环
    clickRingMesh = new THREE.Mesh(
      new THREE.RingGeometry(0.45, 0.72, 24),
      new THREE.MeshBasicMaterial({
        color: 0xaad3ff,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide
      })
    );
    clickRingMesh.rotation.x = -Math.PI / 2;
    scene.add(clickRingMesh);

    // 3D 萤火虫
    for (let i = 0; i < 36; i++) {
      const a = Math.random() * Math.PI * 2;
      const dist = 6 + Math.random() * 44;
      const fx = Math.cos(a) * dist;
      const fz = Math.sin(a) * dist;
      const sp = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: glowTex,
          color: 0xffe494,
          transparent: true,
          opacity: 0.65,
          blending: THREE.AdditiveBlending,
          depthWrite: false
        })
      );
      sp.scale.set(0.55, 0.55, 1);
      scene.add(sp);
      fireflyList.push({
        sprite: sp,
        baseX: fx,
        baseY: getGroundHeight(fx, fz) + 1.2 + Math.random() * 2.2,
        baseZ: fz,
        phase: Math.random() * Math.PI * 2,
        speed: 0.6 + Math.random() * 0.8
      });
    }

    // 3D 细雨粒子系统
    const rainGeo = new THREE.BufferGeometry();
    const rainPos = new Float32Array(rainSystem.count * 3);
    for (let i = 0; i < rainSystem.count; i++) {
      rainPos[i * 3] = (Math.random() - 0.5) * 90;
      rainPos[i * 3 + 1] = Math.random() * 34;
      rainPos[i * 3 + 2] = (Math.random() - 0.5) * 90;
    }
    rainGeo.setAttribute("position", new THREE.BufferAttribute(rainPos, 3));
    const rainMat = new THREE.PointsMaterial({
      color: 0xaed4e6,
      size: 0.34,
      transparent: true,
      opacity: 0.74
    });
    rainSystem.positions = rainPos;
    rainSystem.points = new THREE.Points(rainGeo, rainMat);
    rainSystem.points.visible = false;
    scene.add(rainSystem.points);
  }

  function applyMoodVisuals(moodId) {
    const mood = Oublier.Data.MOODS[moodId] || Oublier.Data.MOODS.midnight;
    if (!scene) return;

    if (scene.fog) {
      scene.fog.color.setHex(mood.fogColor);
      scene.fog.density = mood.fogDensity;
    }
    if (hemiLight) {
      hemiLight.color.setHex(mood.hemiSky);
      hemiLight.groundColor.setHex(mood.hemiGround);
      hemiLight.intensity = mood.hemiIntensity;
    }
    if (moonLight) {
      moonLight.color.setHex(mood.moonColor);
      moonLight.intensity = mood.moonIntensity;
    }
    if (moonMesh) {
      moonMesh.material.color.setHex(mood.moonColor);
    }
    if (roseLight) {
      roseLight.color.setHex(mood.roseGlow);
    }
    if (bellTowerObj && bellTowerObj.roseHalo) {
      bellTowerObj.roseHalo.material.color.setHex(mood.roseGlow);
    }
    if (glassMat) {
      glassMat.color.setHex(mood.roseGlow);
      glassMat.emissive.setHex(mood.roseGlow);
    }
    if (seaMesh) seaMesh.material.color.setHex(mood.seaColor);
    if (stoneMat) stoneMat.color.setHex(mood.stoneTint);
    if (darkStoneMat) darkStoneMat.color.setHex(mood.darkStoneTint);
    if (turfMat) turfMat.color.setHex(mood.turfTint);
    if (starPoints) starPoints.material.opacity = mood.starAlpha;
    if (rainSystem.points) rainSystem.points.visible = mood.rainIntensity > 0;

    // 更新天空穹顶渐变顶点色
    if (skyDome) {
      const topC = new THREE.Color(mood.skyTop);
      const horC = new THREE.Color(mood.skyHorizon);
      const pos = skyDome.geometry.attributes.position;
      const col = skyDome.geometry.attributes.color;
      for (let i = 0; i < pos.count; i++) {
        const py = pos.getY(i);
        const t = smoothstep(-20, 140, py);
        const c = horC.clone().lerp(topC, t);
        col.setXYZ(i, c.r, c.g, c.b);
      }
      col.needsUpdate = true;
    }
  }

  function findClosestInteractive() {
    let best = null;
    let bestDist = Infinity;

    Oublier.Data.LANDMARKS.forEach(function (lm) {
      const d = Math.hypot(player.x - lm.x, player.z - lm.z);
      if (d <= lm.radius && d < bestDist) {
        bestDist = d;
        best = { kind: "landmark", item: lm };
      }
    });

    travelers.forEach(function (t) {
      const d = Math.hypot(player.x - t.x, player.z - t.z);
      if (d <= 5.5 && d < bestDist) {
        bestDist = d;
        best = { kind: "traveler", item: t };
      }
    });

    return best;
  }

  function triggerTarget(target) {
    if (!target) return;
    if (target.kind === "landmark") {
      callbacks.onInteractLandmark(target.item);
    } else if (target.kind === "traveler") {
      callbacks.onInteractTraveler(target.item);
    }
  }

  function interactCurrent() {
    if (callbacks.isInputBlocked()) return false;
    const target = nearbyTarget || findClosestInteractive();
    if (target) {
      triggerTarget(target);
      return true;
    }
    return false;
  }

  function handlePointerClick(clientX, clientY) {
    if (callbacks.isInputBlocked()) return;
    const rect = canvas.getBoundingClientRect();
    pointerNDC.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    pointerNDC.y = -((clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(pointerNDC, camera);
    const hits = raycaster.intersectObjects(hitTargets, false);
    if (hits.length > 0) {
      const data = hits[0].object.userData;
      let tx = data.item.x;
      let tz = data.item.z;
      if (data.kind === "traveler") {
        const tObj = travelers.find(function (tr) {
          return tr.id === data.item.id;
        });
        if (tObj) {
          tx = tObj.x;
          tz = tObj.z;
        }
      }
      const dist = Math.hypot(player.x - tx, player.z - tz);
      const range = data.kind === "landmark" ? data.item.radius - 0.5 : 5.2;
      if (dist <= range) {
        triggerTarget({ kind: data.kind, item: data.item });
        return;
      }
      const clamped = clampWalkable(tx, tz);
      player.target = clamped;
      player.pendingAction = { kind: data.kind, item: data.item };
      showGroundRing(clamped.x, clamped.z, 0xf2b073);
      return;
    }

    // 与地面高度平面相交，点击任意位置漫步
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -player.y);
    const pt = new THREE.Vector3();
    if (raycaster.ray.intersectPlane(plane, pt)) {
      const clamped = clampWalkable(pt.x, pt.z);
      player.target = clamped;
      player.pendingAction = null;
      showGroundRing(clamped.x, clamped.z, 0xaad3ff);
    }
  }

  function showGroundRing(x, z, hex) {
    if (!clickRingMesh) return;
    clickRingMesh.position.set(x, getGroundHeight(x, z) + 0.16, z);
    clickRingMesh.material.color.setHex(hex);
    clickRingAlpha = 0.95;
  }

  function bindEvents() {
    global.addEventListener("resize", resize);

    global.addEventListener("keydown", function (e) {
      if (callbacks.isInputBlocked()) return;
      const code = e.code;
      if (
        code === "KeyW" || code === "KeyA" || code === "KeyS" || code === "KeyD" ||
        code === "ArrowUp" || code === "ArrowDown" || code === "ArrowLeft" || code === "ArrowRight"
      ) {
        keys[code] = true;
        player.target = null;
        player.pendingAction = null;
      } else if (code === "KeyE" || code === "Space") {
        if (nearbyTarget || findClosestInteractive()) {
          e.preventDefault();
          interactCurrent();
        }
      }
    });

    global.addEventListener("keyup", function (e) {
      keys[e.code] = false;
    });

    global.addEventListener("blur", function () {
      Object.keys(keys).forEach(function (k) {
        keys[k] = false;
      });
    });

    canvas.addEventListener("pointerdown", function (e) {
      pointerState.down = true;
      pointerState.startX = e.clientX;
      pointerState.startY = e.clientY;
      pointerState.lastX = e.clientX;
      pointerState.lastY = e.clientY;
      pointerState.dragged = false;
    });

    global.addEventListener("pointermove", function (e) {
      if (!pointerState.down) return;
      const dx = e.clientX - pointerState.lastX;
      const dy = e.clientY - pointerState.lastY;
      pointerState.lastX = e.clientX;
      pointerState.lastY = e.clientY;

      if (Math.hypot(e.clientX - pointerState.startX, e.clientY - pointerState.startY) >= 6) {
        pointerState.dragged = true;
      }
      if (pointerState.dragged && !overlookActive && !callbacks.isInputBlocked()) {
        camState.targetYaw -= dx * 0.0065;
        camState.targetPitch = Math.max(0.20, Math.min(0.88, camState.targetPitch + dy * 0.0045));
      }
    });

    global.addEventListener("pointerup", function (e) {
      if (!pointerState.down) return;
      const wasDragged = pointerState.dragged;
      pointerState.down = false;
      if (!wasDragged && e.target === canvas) {
        handlePointerClick(e.clientX, e.clientY);
      }
    });

    canvas.addEventListener(
      "wheel",
      function (e) {
        if (callbacks.isInputBlocked() || overlookActive) return;
        e.preventDefault();
        camState.targetDist = Math.max(11, Math.min(27, camState.targetDist + e.deltaY * 0.012));
      },
      { passive: false }
    );
  }

  function resize() {
    if (!renderer || !camera) return;
    width = global.innerWidth || 1280;
    height = global.innerHeight || 720;
    renderer.setPixelRatio(Math.min(global.devicePixelRatio || 1, 2));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  function shortestAngleDiff(current, target) {
    let diff = ((target - current + Math.PI) % (Math.PI * 2)) - Math.PI;
    if (diff < -Math.PI) diff += Math.PI * 2;
    return diff;
  }

  function updatePlayer(dt) {
    let inputX = 0;
    let inputZ = 0;

    if (!callbacks.isInputBlocked()) {
      if (keys.KeyW || keys.ArrowUp) inputZ -= 1;
      if (keys.KeyS || keys.ArrowDown) inputZ += 1;
      if (keys.KeyA || keys.ArrowLeft) inputX -= 1;
      if (keys.KeyD || keys.ArrowRight) inputX += 1;
    }

    let moveX = 0;
    let moveZ = 0;

    if (inputX !== 0 || inputZ !== 0) {
      const len = Math.hypot(inputX, inputZ);
      inputX /= len;
      inputZ /= len;
      // 根据当前相机 yaw 旋转移动方向
      const sinY = Math.sin(camState.yaw);
      const cosY = Math.cos(camState.yaw);
      moveX = inputX * cosY + inputZ * sinY;
      moveZ = -inputX * sinY + inputZ * cosY;
    } else if (player.target) {
      const dx = player.target.x - player.x;
      const dz = player.target.z - player.z;
      const dist = Math.hypot(dx, dz);
      const stopDist = player.pendingAction ? 4.0 : 0.7;
      if (dist <= stopDist) {
        const pending = player.pendingAction;
        player.target = null;
        player.pendingAction = null;
        if (pending) {
          triggerTarget(pending);
        }
      } else {
        moveX = dx / dist;
        moveZ = dz / dist;
      }
    }

    const movingSpeed = Math.hypot(moveX, moveZ) * player.speed;
    if (movingSpeed > 0.1) {
      const next = clampWalkable(player.x + moveX * player.speed * dt, player.z + moveZ * player.speed * dt);
      player.x = next.x;
      player.z = next.z;
      const targetYaw = Math.atan2(moveX, moveZ);
      player.yaw += shortestAngleDiff(player.yaw, targetYaw) * Math.min(1, dt * 11);
    }

    const targetY = getGroundHeight(player.x, player.z);
    player.y += (targetY - player.y) * Math.min(1, dt * 12);

    if (player.rig) {
      player.rig.group.position.set(player.x, player.y, player.z);
      player.rig.group.rotation.y = player.yaw;
      Oublier.Models3D.animateCharacter(player.rig, dt, movingSpeed / player.speed, elapsed);
    }

    const nextNearby = findClosestInteractive();
    const prevKey = nearbyTarget ? nearbyTarget.kind + ":" + nearbyTarget.item.id : "";
    const nextKey = nextNearby ? nextNearby.kind + ":" + nextNearby.item.id : "";
    if (prevKey !== nextKey) {
      nearbyTarget = nextNearby;
      callbacks.onNearbyChange(nearbyTarget);
    } else {
      nearbyTarget = nextNearby;
    }
  }

  function updateTravelers(dt) {
    travelers.forEach(function (t) {
      const dx = t.targetX - t.x;
      const dz = t.targetZ - t.z;
      const dist = Math.hypot(dx, dz);
      let speedRatio = 0;

      if (dist > 0.35) {
        const spd = 2.6;
        const next = clampWalkable(t.x + (dx / dist) * spd * dt, t.z + (dz / dist) * spd * dt);
        t.x = next.x;
        t.z = next.z;
        const targetYaw = Math.atan2(dx, dz);
        t.yaw += shortestAngleDiff(t.yaw, targetYaw) * Math.min(1, dt * 6);
        speedRatio = 0.45;
      } else {
        t.waitTimer -= dt;
        if (t.waitTimer <= 0) {
          t.waitTimer = 3.5 + Math.random() * 5.0;
          const a = Math.random() * Math.PI * 2;
          const r = Math.random() * t.patrolRadius;
          const cand = clampWalkable(t.home.x + Math.cos(a) * r, t.home.z + Math.sin(a) * r);
          t.targetX = cand.x;
          t.targetZ = cand.z;
        }
      }

      t.y = getGroundHeight(t.x, t.z);
      if (t.rig) {
        t.rig.group.position.set(t.x, t.y, t.z);
        t.rig.group.rotation.y = t.yaw;
        Oublier.Models3D.animateCharacter(t.rig, dt, speedRatio, elapsed + t.home.x);
      }
    });
  }

  function updateCamera(dt) {
    if (overlookActive) {
      // 全景远眺模式：从东南悬崖上方回望整座哥特修道院与夜海
      const desiredPos = new THREE.Vector3(58, 22, 54);
      const desiredLook = new THREE.Vector3(0, 6, -12);
      camera.position.lerp(desiredPos, Math.min(1, dt * 2.5));
      camState.lookAt.lerp(desiredLook, Math.min(1, dt * 2.5));
      camera.lookAt(camState.lookAt);
      return;
    }

    camState.yaw += (camState.targetYaw - camState.yaw) * Math.min(1, dt * 8);
    camState.pitch += (camState.targetPitch - camState.pitch) * Math.min(1, dt * 8);
    camState.dist += (camState.targetDist - camState.dist) * Math.min(1, dt * 8);

    const horiz = Math.cos(camState.pitch) * camState.dist;
    const camX = player.x + Math.sin(camState.yaw) * horiz;
    const camY = player.y + 1.8 + Math.sin(camState.pitch) * camState.dist;
    const camZ = player.z + Math.cos(camState.yaw) * horiz;

    camera.position.lerp(new THREE.Vector3(camX, camY, camZ), Math.min(1, dt * 9));
    camState.lookAt.lerp(new THREE.Vector3(player.x, player.y + 1.6, player.z), Math.min(1, dt * 10));
    camera.lookAt(camState.lookAt);
  }

  function updateWorldEffects(dt) {
    const mood = Oublier.Data.MOODS[currentMoodId] || Oublier.Data.MOODS.midnight;

    // 圣火坛火焰跃动
    if (brazierObj) {
      const f = 1 + Math.sin(elapsed * 12) * 0.08 + Math.cos(elapsed * 19) * 0.06;
      brazierObj.outerFlame.scale.set(1, f, 1);
      brazierObj.innerFlame.scale.set(1, 0.95 + Math.sin(elapsed * 15) * 0.1, 1);
      brazierObj.fireGlow.scale.set(6.2 * f, 6.2 * f, 1);
    }
    if (fireLight) {
      fireLight.intensity = 2.4 + Math.sin(elapsed * 11) * 0.25 + Math.cos(elapsed * 17) * 0.15;
    }

    // 北方星象仪缓慢旋转
    if (bellTowerObj && bellTowerObj.astrolabe) {
      bellTowerObj.astrolabe.rotation.y += dt * 0.45;
      bellTowerObj.astrolabe.rotation.z = Math.sin(elapsed * 0.4) * 0.15;
    }

    // 柏树随海风轻摆
    cypressTrees.forEach(function (tree) {
      tree.swayPivot.rotation.z = Math.sin(elapsed * 1.1 + tree.phase) * 0.025;
      tree.swayPivot.rotation.x = Math.cos(elapsed * 0.8 + tree.phase) * 0.018;
    });

    // 栈桥漂浮瓶随海浪起伏
    if (pierObj && pierObj.bottleGroup) {
      pierObj.bottleGroup.position.y = -0.45 + Math.sin(elapsed * 2.0) * 0.16;
      pierObj.bottleGroup.rotation.x = Math.sin(elapsed * 1.6) * 0.15;
    }

    // 3D 海面波浪微动
    if (seaMesh && seaBaseY) {
      const pos = seaMesh.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const vx = pos.getX(i);
        const vz = pos.getZ(i);
        const wave = Math.sin(vx * 0.08 + elapsed * 1.2) * 0.18 + Math.cos(vz * 0.09 + elapsed * 0.9) * 0.14;
        pos.setY(i, seaBaseY[i] + wave);
      }
      pos.needsUpdate = true;
    }

    // 风钟摆动衰减
    if (resonanceBellPivot && bellSwingAmp > 0.002) {
      resonanceBellPivot.rotation.z = Math.sin(elapsed * 5.2) * bellSwingAmp;
      bellSwingAmp *= Math.max(0, 1 - dt * 0.65);
    }

    // 点击地面光圈衰减
    if (clickRingMesh && clickRingAlpha > 0) {
      clickRingAlpha = Math.max(0, clickRingAlpha - dt * 1.15);
      clickRingMesh.material.opacity = clickRingAlpha;
      const s = 1 + (1 - clickRingAlpha) * 0.7;
      clickRingMesh.scale.set(s, s, 1);
    }

    // 萤火虫游荡
    fireflyList.forEach(function (f) {
      f.sprite.position.set(
        f.baseX + Math.sin(elapsed * f.speed + f.phase) * 1.6,
        f.baseY + Math.cos(elapsed * f.speed * 0.8 + f.phase) * 0.65,
        f.baseZ + Math.cos(elapsed * f.speed * 0.9 + f.phase) * 1.6
      );
      f.sprite.material.opacity = mood.fireflyAlpha * (0.4 + 0.6 * (0.5 + 0.5 * Math.sin(elapsed * 2.5 + f.phase)));
    });

    // 3D 细雨下落
    if (rainSystem.points && rainSystem.points.visible) {
      const rp = rainSystem.positions;
      for (let i = 0; i < rainSystem.count; i++) {
        rp[i * 3 + 1] -= dt * 24;
        rp[i * 3] -= dt * 2.4;
        if (rp[i * 3 + 1] < -1) {
          rp[i * 3] = player.x + (Math.random() - 0.5) * 80;
          rp[i * 3 + 1] = 28 + Math.random() * 8;
          rp[i * 3 + 2] = player.z + (Math.random() - 0.5) * 80;
        }
      }
      rainSystem.points.geometry.attributes.position.needsUpdate = true;
    }

    // 火星粒子
    if (Math.random() < dt * 10) {
      spawnEmber(0, 1.9, 0, 1);
    }
    for (let i = embers.length - 1; i >= 0; i--) {
      const e = embers[i];
      e.life += dt;
      e.mesh.position.x += (e.vx + Math.sin(elapsed * 3 + i) * 0.4) * dt;
      e.mesh.position.y += e.vy * dt;
      e.mesh.position.z += e.vz * dt;
      const p = e.life / e.maxLife;
      e.mesh.material.opacity = (1 - p) * 0.95;
      if (e.life >= e.maxLife) {
        scene.remove(e.mesh);
        embers.splice(i, 1);
      }
    }

    // 升空碎句文字精灵
    for (let i = floatingSprites.length - 1; i >= 0; i--) {
      const fs = floatingSprites[i];
      fs.life += dt;
      fs.sprite.position.y += dt * 2.6;
      const p = fs.life / fs.maxLife;
      fs.sprite.material.opacity = p < 0.2 ? p / 0.2 : 1 - (p - 0.2) / 0.8;
      if (fs.life >= fs.maxLife) {
        scene.remove(fs.sprite);
        floatingSprites.splice(i, 1);
      }
    }

    // 飞翔中的漂流瓶
    for (let i = flyingBottles.length - 1; i >= 0; i--) {
      const fb = flyingBottles[i];
      fb.t += dt / fb.duration;
      const t = Math.min(1, fb.t);
      fb.mesh.position.set(
        fb.startX + (fb.endX - fb.startX) * t,
        fb.startY + (fb.endY - fb.startY) * t + Math.sin(t * Math.PI) * 5.2,
        fb.startZ + (fb.endZ - fb.startZ) * t
      );
      fb.mesh.rotation.x += dt * 5;
      if (fb.t >= 1) {
        spawnRipple(fb.endX, -0.5, fb.endZ, 0x9ce6ff, 5.5);
        scene.remove(fb.mesh);
        flyingBottles.splice(i, 1);
      }
    }

    // 地面/水面光环波纹
    for (let i = ripples.length - 1; i >= 0; i--) {
      const rp = ripples[i];
      rp.life += dt;
      const p = rp.life / rp.maxLife;
      const sc = 1 + p * rp.maxScale;
      rp.mesh.scale.set(sc, sc, 1);
      rp.mesh.material.opacity = (1 - p) * 0.88;
      if (rp.life >= rp.maxLife) {
        scene.remove(rp.mesh);
        ripples.splice(i, 1);
      }
    }
  }

  function spawnEmber(x, y, z, power) {
    const sp = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glowTex,
        color: Math.random() > 0.35 ? 0xffcc7c : 0xff7e45,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      })
    );
    sp.position.set(x + (Math.random() - 0.5) * 0.9, y, z + (Math.random() - 0.5) * 0.9);
    const size = (0.3 + Math.random() * 0.35) * (power > 1 ? 1.4 : 1);
    sp.scale.set(size, size, 1);
    scene.add(sp);
    embers.push({
      mesh: sp,
      vx: (Math.random() - 0.5) * 1.4 * power,
      vy: (1.8 + Math.random() * 2.2) * power,
      vz: (Math.random() - 0.5) * 1.4 * power,
      life: 0,
      maxLife: 1.5 + Math.random() * 1.4
    });
  }

  function spawnRipple(x, y, z, hex, maxScale) {
    const mesh = new THREE.Mesh(
      new THREE.RingGeometry(0.6, 0.85, 28),
      new THREE.MeshBasicMaterial({
        color: hex,
        transparent: true,
        opacity: 0.9,
        side: THREE.DoubleSide
      })
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, y + 0.15, z);
    scene.add(mesh);
    ripples.push({ mesh: mesh, life: 0, maxLife: 1.4, maxScale: maxScale || 4.5 });
  }

  function triggerReleaseBurst(textSnippet) {
    for (let i = 0; i < 40; i++) {
      spawnEmber(0, 2.0, 0, 2.3);
    }
    spawnRipple(0, 0.15, 0, 0xffbe73, 7.5);
    const clean = String(textSnippet || "").trim();
    if (clean) {
      const sp = Oublier.Models3D.createTextSprite(clean);
      sp.position.set(0, 3.2, 0);
      scene.add(sp);
      floatingSprites.push({ sprite: sp, life: 0, maxLife: 3.6 });
    }
  }

  function triggerBottleToss() {
    const bottle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.22, 0.24, 0.64, 8),
      new THREE.MeshStandardMaterial({ color: 0xa6ebff, emissive: 0x3b86a8 })
    );
    bottle.position.set(0, 1.4, 59);
    scene.add(bottle);
    flyingBottles.push({
      mesh: bottle,
      startX: 0,
      startY: 1.4,
      startZ: 59,
      endX: (Math.random() > 0.5 ? 1 : -1) * (4 + Math.random() * 6),
      endY: -0.5,
      endZ: 68 + Math.random() * 5,
      t: 0,
      duration: 1.25
    });
  }

  function triggerHeartRipple(x, z) {
    const tx = typeof x === "number" ? x : player.x;
    const tz = typeof z === "number" ? z : player.z;
    spawnRipple(tx, getGroundHeight(tx, tz), tz, 0xffcfa0, 4.2);
  }

  function triggerBellWave() {
    bellSwingAmp = 0.26;
    spawnRipple(-46, 0.9, -8, 0xa8c8ff, 8.5);
  }

  function toggleOverlookCamera(enabled) {
    overlookActive = Boolean(enabled);
    return overlookActive;
  }

  function isOverlookActive() {
    return overlookActive;
  }

  function setMood(moodId) {
    if (Oublier.Data.MOODS[moodId]) {
      currentMoodId = moodId;
      applyMoodVisuals(moodId);
    }
  }

  function setExtraStars(count) {
    extraStarsCount = Math.max(0, Number(count) || 0);
    if (starPoints && starPoints.geometry) {
      starPoints.geometry.setDrawRange(0, Math.min(420, 260 + extraStarsCount * 12));
    }
  }

  function getMinimapState() {
    return {
      player: { x: player.x, z: player.z, yaw: player.yaw, camYaw: camState.yaw },
      landmarks: Oublier.Data.LANDMARKS,
      travelers: travelers.map(function (t) {
        return { id: t.id, x: t.x, z: t.z, color: t.color };
      })
    };
  }

  function loop(timestamp) {
    if (!running) return;
    if (!lastTime) lastTime = timestamp;
    const dt = Math.min(0.05, (timestamp - lastTime) / 1000);
    lastTime = timestamp;
    elapsed += dt;

    updatePlayer(dt);
    updateTravelers(dt);
    updateWorldEffects(dt);
    updateCamera(dt);

    renderer.render(scene, camera);
    callbacks.onFrameUpdate();

    global.requestAnimationFrame(loop);
  }

  function init(canvasEl, options) {
    canvas = canvasEl;
    if (options) {
      callbacks = Object.assign(callbacks, options);
    }

    if (!global.THREE) {
      throw new Error("Three.js 渲染库未加载");
    }

    renderer = new THREE.WebGLRenderer({
      canvas: canvas,
      antialias: true,
      powerPreference: "high-performance"
    });
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x101828, 0.0085);

    camera = new THREE.PerspectiveCamera(48, 16 / 9, 0.2, 420);

    glowTex = Oublier.Models3D.createGlowTexture(
      "rgba(255, 224, 175, 0.95)",
      "rgba(235, 165, 95, 0.18)"
    );

    // 共享极简哥特材质
    stoneMat = new THREE.MeshStandardMaterial({ color: 0x525a6b, roughness: 0.9, metalness: 0.06, flatShading: true });
    darkStoneMat = new THREE.MeshStandardMaterial({ color: 0x323846, roughness: 0.88, metalness: 0.08, flatShading: true });
    roofMat = new THREE.MeshStandardMaterial({ color: 0x202634, roughness: 0.78, metalness: 0.14, flatShading: true });
    turfMat = new THREE.MeshStandardMaterial({ color: 0x1b2430, roughness: 0.95, metalness: 0.02, flatShading: true });
    glassMat = new THREE.MeshStandardMaterial({
      color: 0x9ab8ff,
      emissive: 0x6b8ef2,
      emissiveIntensity: 0.85,
      roughness: 0.25
    });
    ironMat = new THREE.MeshStandardMaterial({ color: 0x181c24, roughness: 0.55, metalness: 0.72 });
    woodMat = new THREE.MeshStandardMaterial({ color: 0x3c2e28, roughness: 0.88, flatShading: true });
    foliageDarkMat = new THREE.MeshStandardMaterial({ color: 0x16242c, roughness: 0.9, flatShading: true });
    foliageLightMat = new THREE.MeshStandardMaterial({ color: 0x1f333c, roughness: 0.88, flatShading: true });

    // 光照预算（1 半球光 + 1 阴影主月光 + 4 战略点光源）
    hemiLight = new THREE.HemisphereLight(0x5c7aa6, 0x181c28, 0.72);
    scene.add(hemiLight);

    moonLight = new THREE.DirectionalLight(0xdce8ff, 1.05);
    moonLight.position.set(-34, 54, -64);
    moonLight.castShadow = true;
    moonLight.shadow.mapSize.set(1024, 1024);
    moonLight.shadow.camera.near = 10;
    moonLight.shadow.camera.far = 180;
    moonLight.shadow.camera.left = -68;
    moonLight.shadow.camera.right = 68;
    moonLight.shadow.camera.top = 68;
    moonLight.shadow.camera.bottom = -68;
    moonLight.shadow.bias = -0.0008;
    scene.add(moonLight);

    fireLight = new THREE.PointLight(0xff9b4a, 2.5, 32, 1.5);
    fireLight.position.set(0, 2.8, 0);
    scene.add(fireLight);

    roseLight = new THREE.PointLight(0x8eaeff, 1.8, 34, 1.5);
    roseLight.position.set(0, 12, -46);
    scene.add(roseLight);

    pierLight = new THREE.PointLight(0xffc684, 1.4, 26, 1.5);
    pierLight.position.set(0, 4.2, 46);
    scene.add(pierLight);

    buildSkyAndOcean();
    buildTerrainAndRoads();
    buildGothicArchitecture();
    buildEntitiesAndEffects();
    applyMoodVisuals(currentMoodId);

    resize();
    bindEvents();
  }

  function start() {
    if (running) return;
    running = true;
    lastTime = 0;
    global.requestAnimationFrame(loop);
  }

  Oublier.World = {
    init,
    start,
    setMood,
    setExtraStars,
    interactCurrent,
    triggerReleaseBurst,
    triggerBottleToss,
    triggerHeartRipple,
    triggerBellWave,
    toggleOverlookCamera,
    isOverlookActive,
    getMinimapState
  };
})(window);
