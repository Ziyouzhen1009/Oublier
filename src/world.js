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

  // 类《英雄联盟》高俯视固定朝向跟随相机（支持滚轮平滑缩放）
  const camState = {
    yaw: 0.06,
    pitch: 0.96,
    dist: 27.5,
    targetDist: 27.5,
    lookAt: new THREE.Vector3(0, 1.0, 10.5)
  };

  // 玩家状态（初始在圣火坛南侧石路上，面向北方的玫瑰窗与圣火坛）
  const player = {
    x: 0,
    y: 0.06,
    z: 10.5,
    vx: 0,
    vz: 0,
    yaw: Math.PI,
    speed: 10.5,
    target: null,
    rig: null,
    lanternLight: null
  };

  let leftHoldMoving = false;
  let hoveredTarget = null;

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
  let clickRingInnerMesh = null;
  let clickRingAlpha = 0;

  // 材质引用（支持根据心境天色调整湿度/色调）
  let stoneMat = null;
  let darkStoneMat = null;
  let roofMat = null;
  let turfMat = null;
  let courtyardMat = null;
  let roadStoneMat = null;
  let cloisterFloorMat = null;
  let northPlazaMat = null;
  let woodDeckMat = null;
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

  const swayTrees = [];
  const travelers = [];
  const hitTargets = [];
  const walkableMeshes = [];
  const landmarkRings = [];
  const fireflyList = [];
  const rainSystem = { points: null, positions: null, count: 550 };
  const embers = [];
  const flyingBottles = [];
  const ripples = [];
  const floatingSprites = [];

  const raycaster = new THREE.Raycaster();
  const pointerNDC = new THREE.Vector2();

  // 北向石阶精确几何参数（构建与 getSurfaceHeight 共用）
  const NORTH_STAIRS = {
    zStart: -21.0,
    zEnd: -34.0,
    halfWidth: 4.6,
    count: 12,
    topHeight: 3.2
  };

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
   * 岛屿自然地形基础高度（不含铺装厚度）
   */
  function getGroundHeight(x, z) {
    const r = Math.hypot(x, z);
    const angle = Math.atan2(z, x);
    const outerR = islandOuterRadius(angle);

    if (Math.abs(x) <= 3.6 && z >= 40 && z <= 61) {
      return 0.12;
    }

    if (r > outerR) {
      return Math.max(-3.2, -0.95 - (r - outerR) * 0.48);
    }

    let h = 0;

    // 北方观星钟楼台地 (y = 3.2) & 坡面
    if (z < -21 && Math.abs(x) < 23) {
      const rise = smoothstep(-21, -34, z);
      const sideFade = 1 - smoothstep(14, 23, Math.abs(x));
      h = Math.max(h, 3.2 * rise * sideFade);
    }

    // 石阶正下方地形略微下沉，避免任何一级台阶之间露草
    if (Math.abs(x) <= NORTH_STAIRS.halfWidth + 0.4 && z <= -20.5 && z >= -34.5) {
      const stairT = Math.max(0, Math.min(1, (-21.0 - z) / 13.0));
      h = Math.min(h, stairT * NORTH_STAIRS.topHeight - 0.35);
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
      h = Math.max(h, 1.85 * (1 - smoothstep(7.5, 16, dLight)));
    }

    const shoreDrop = smoothstep(outerR - 6, outerR, r) * 0.55;
    return h - shoreDrop;
  }

  /**
   * 精确行走表面高度（与铺装石板/石阶/木栈桥顶面 100% 对齐，杜绝脚部穿模/悬浮）
   */
  function getSurfaceHeight(x, z) {
    // 1. 南方木栈桥桥面（顶面 y = 0.28）
    if (Math.abs(x) <= 2.8 && z >= 42.5 && z <= 61.2) {
      return 0.28;
    }

    // 2. 北方 12 级哥特石阶
    if (
      Math.abs(x) <= NORTH_STAIRS.halfWidth &&
      z <= NORTH_STAIRS.zStart &&
      z >= NORTH_STAIRS.zEnd
    ) {
      const stepDepth = (NORTH_STAIRS.zStart - NORTH_STAIRS.zEnd) / NORTH_STAIRS.count;
      const idx = Math.min(
        NORTH_STAIRS.count - 1,
        Math.max(0, Math.floor((NORTH_STAIRS.zStart - z) / stepDepth))
      );
      return ((idx + 1) / NORTH_STAIRS.count) * NORTH_STAIRS.topHeight;
    }

    // 3. 北方观星钟楼石板平台（顶面 y = 3.22）
    if (Math.abs(x) <= 12.0 && z <= -34.0 && z >= -56.0) {
      return 3.22;
    }

    // 4. 西方回声长廊棋盘砖地面（顶面 y = 0.90）
    if (x >= -57.0 && x <= -31.0 && Math.abs(z + 8) <= 5.5) {
      return 0.9;
    }

    // 5. 东方柏林石亭八角石台（顶面 y = 0.90）
    if (Math.hypot(x - 46, z + 8) <= 6.5) {
      return 0.9;
    }

    // 6. 东南孤灯望海台石台（顶面 y = 1.92）
    if (Math.hypot(x - 38, z - 36) <= 7.2) {
      return 1.92;
    }

    // 7. 中央八角镶金花砖庭院（顶面 y = 0.08）
    if (Math.hypot(x, z) <= 16.8) {
      return 0.08;
    }

    // 8. 南北 / 东西主石板大道（顶面 y = 0.06）
    if (Math.abs(x) <= 2.6 && z >= -21.0 && z <= 42.6) {
      return 0.06;
    }
    if (Math.abs(z + 8) <= 2.3 && Math.abs(x) <= 31.2) {
      return Math.max(0.06, getGroundHeight(x, z) + 0.05);
    }

    // 9. 通往东南望海台的贴地斜石径
    const alongSE = (x - 10) * 0.7071 + (z - 8) * 0.7071;
    const perpSE = Math.abs(-(x - 10) * 0.7071 + (z - 8) * 0.7071);
    if (alongSE >= 0 && alongSE <= 32.5 && perpSE <= 1.95) {
      return getGroundHeight(x, z) + 0.05;
    }

    // 10. 其余草苔自然地形
    return getGroundHeight(x, z);
  }

  /**
   * 表面法线估算（用于脚底接触阴影贴合斜坡倾角）
   */
  function getSurfaceNormal(x, z) {
    const eps = 0.35;
    const hL = getSurfaceHeight(x - eps, z);
    const hR = getSurfaceHeight(x + eps, z);
    const hD = getSurfaceHeight(x, z - eps);
    const hU = getSurfaceHeight(x, z + eps);
    const n = new THREE.Vector3(hL - hR, 2 * eps, hD - hU);
    return n.normalize();
  }

  function clampWalkable(x, z) {
    let nx = x;
    let nz = z;

    const onPier = Math.abs(nx) <= 2.5 && nz >= 39 && nz <= 60.2;
    if (!onPier) {
      const angle = Math.atan2(nz, nx);
      const maxR = islandOuterRadius(angle) - 3.2;
      const r = Math.hypot(nx, nz);
      if (r > maxR) {
        nx = (nx / r) * maxR;
        nz = (nz / r) * maxR;
      }
    }

    // 避让中央圣火坛石座 (r = 3.95)
    const dFire = Math.hypot(nx, nz);
    if (dFire < 3.95) {
      const push = dFire > 0.01 ? 3.95 / dFire : 1;
      nx = dFire > 0.01 ? nx * push : 0;
      nz = dFire > 0.01 ? nz * push : 3.95;
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

    const seaGeo = new THREE.PlaneGeometry(380, 380, 56, 56);
    seaGeo.rotateX(-Math.PI / 2);
    const posAttr = seaGeo.attributes.position;
    seaBaseY = new Float32Array(posAttr.count);
    for (let i = 0; i < posAttr.count; i++) {
      seaBaseY[i] = posAttr.getY(i);
    }
    const seaMat = new THREE.MeshStandardMaterial({
      color: 0x0b1729,
      roughness: 0.25,
      metalness: 0.55,
      flatShading: true
    });
    seaMesh = new THREE.Mesh(seaGeo, seaMat);
    seaMesh.position.y = -0.65;
    seaMesh.receiveShadow = true;
    scene.add(seaMesh);
  }

  /**
   * 为主岛草苔地形生成丰富区域生态顶点色（东侧暖金草甸、西侧蓝绿苔原、北侧紫灰高地、东南鸢尾坡地、岸边鹅卵石湿沙）
   */
  function computeTerrainVertexColor(vx, vz) {
    const baseMoss = new THREE.Color(0x4c6852); // 祖母绿苔草基底
    const eastMeadow = new THREE.Color(0x7c7448); // 东侧金秋暖草与腐殖土
    const westHeath = new THREE.Color(0x445e64); // 西侧幽静蓝绿石楠
    const northSlate = new THREE.Color(0x5a5870); // 北侧高地紫灰砾石草坡
    const cliffIris = new THREE.Color(0x5c527a); // 东南悬崖薰衣草坡地
    const shoreSand = new THREE.Color(0x46484e); // 海岸潮湿鹅卵石沙砾

    const col = baseMoss.clone();

    // 东侧秘境花园（银杏暖调）
    const eastWeight = smoothstep(14, 42, vx) * (1 - smoothstep(14, 34, Math.abs(vz + 8)));
    col.lerp(eastMeadow, eastWeight * 0.68);

    // 西侧回廊外苔原
    const westWeight = smoothstep(-14, -42, vx);
    col.lerp(westHeath, westWeight * 0.62);

    // 北侧钟楼高地
    const northWeight = smoothstep(-16, -42, vz);
    col.lerp(northSlate, northWeight * 0.65);

    // 东南悬崖花坡
    const dLight = Math.hypot(vx - 38, vz - 36);
    const cliffWeight = 1 - smoothstep(6, 22, dLight);
    col.lerp(cliffIris, cliffWeight * 0.65);

    // 海岸带渐变
    const angle = Math.atan2(vz, vx);
    const outerR = islandOuterRadius(angle);
    const r = Math.hypot(vx, vz);
    const shoreWeight = smoothstep(outerR - 7.5, outerR - 0.5, r);
    col.lerp(shoreSand, shoreWeight * 0.88);

    // 轻微自然有机斑驳起伏
    const n = Math.sin(vx * 0.17 + vz * 0.13) * Math.cos(vx * 0.09 - vz * 0.21);
    col.offsetHSL(0, 0, n * 0.035);
    return col;
  }

  /**
   * 构造贴合斜坡地形的东南石板斜径网格
   */
  function createSlopedSERoadMesh(mat) {
    const lengthSegs = 28;
    const widthSegs = 2;
    const halfW = 1.95;
    const startX = 10.0;
    const startZ = 8.0;
    const dirX = 0.70710678;
    const dirZ = 0.70710678;
    const perpX = -dirZ;
    const perpZ = dirX;
    const totalLen = 32.5;

    const positions = [];
    const uvs = [];
    const indices = [];

    for (let i = 0; i <= lengthSegs; i++) {
      const s = (i / lengthSegs) * totalLen;
      for (let j = 0; j <= widthSegs; j++) {
        const w = ((j / widthSegs) * 2 - 1) * halfW;
        const px = startX + dirX * s + perpX * w;
        const pz = startZ + dirZ * s + perpZ * w;
        const py = getGroundHeight(px, pz) + 0.05;
        positions.push(px, py, pz);
        uvs.push(j / widthSegs, (i / lengthSegs) * 7.0);
      }
    }

    const rowStride = widthSegs + 1;
    for (let i = 0; i < lengthSegs; i++) {
      for (let j = 0; j < widthSegs; j++) {
        const a = i * rowStride + j;
        const b = a + 1;
        const c = a + rowStride;
        const d = c + 1;
        indices.push(a, c, b, b, c, d);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();

    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    return mesh;
  }

  function buildTerrainAndRoads() {
    // 1. 高细分多彩草苔主岛地面
    const geo = new THREE.PlaneGeometry(148, 148, 128, 128);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const vColors = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const vx = pos.getX(i);
      const vz = pos.getZ(i);
      pos.setY(i, getGroundHeight(vx, vz));
      const c = computeTerrainVertexColor(vx, vz);
      vColors[i * 3] = c.r;
      vColors[i * 3 + 1] = c.g;
      vColors[i * 3 + 2] = c.b;
    }
    geo.setAttribute("color", new THREE.BufferAttribute(vColors, 3));
    geo.computeVertexNormals();

    const ground = new THREE.Mesh(geo, turfMat);
    ground.receiveShadow = true;
    scene.add(ground);
    walkableMeshes.push(ground);

    // 2. 中央八角镶金花砖庭院（顶面精确位于 y = 0.08）
    const courtyard = new THREE.Mesh(
      new THREE.CylinderGeometry(16.8, 17.4, 0.24, 8),
      courtyardMat
    );
    courtyard.position.y = -0.04;
    courtyard.receiveShadow = true;
    scene.add(courtyard);
    walkableMeshes.push(courtyard);

    const brassTrimMat = new THREE.MeshStandardMaterial({
      color: 0xc9a060,
      roughness: 0.42,
      metalness: 0.7
    });
    const innerRing = new THREE.Mesh(new THREE.RingGeometry(8.5, 8.9, 8), brassTrimMat);
    innerRing.rotation.x = -Math.PI / 2;
    innerRing.position.y = 0.084;
    scene.add(innerRing);

    // 3. 四向风化青苔石板主道（顶面精确位于 y = 0.06）
    const nsRoadGeo = new THREE.BoxGeometry(5.2, 0.14, 63.6);
    const nsTexMat = roadStoneMat.clone();
    nsTexMat.map = roadStoneMat.map.clone();
    nsTexMat.map.repeat.set(1.2, 14);
    nsTexMat.map.needsUpdate = true;
    const nsRoad = new THREE.Mesh(nsRoadGeo, nsTexMat);
    nsRoad.position.set(0, -0.01, 10.8);
    nsRoad.receiveShadow = true;
    scene.add(nsRoad);
    walkableMeshes.push(nsRoad);

    const ewTexMat = roadStoneMat.clone();
    ewTexMat.map = roadStoneMat.map.clone();
    ewTexMat.map.repeat.set(14, 1.1);
    ewTexMat.map.needsUpdate = true;
    const ewRoad = new THREE.Mesh(new THREE.BoxGeometry(62.4, 0.14, 4.6), ewTexMat);
    ewRoad.position.set(0, -0.01, -8);
    ewRoad.receiveShadow = true;
    scene.add(ewRoad);
    walkableMeshes.push(ewRoad);

    // 4. 东南贴坡石板小径
    const seMat = roadStoneMat.clone();
    seMat.map = roadStoneMat.map.clone();
    seMat.map.repeat.set(1, 1);
    seMat.map.needsUpdate = true;
    const seRoad = createSlopedSERoadMesh(seMat);
    scene.add(seRoad);
    walkableMeshes.push(seRoad);

    // 5. 北方 12 级精确贴地哥特石阶（z 从 -21.0 升至 -34.0，顶面与 NORTH_STAIRS 完全一致）
    const stepDepth = (NORTH_STAIRS.zStart - NORTH_STAIRS.zEnd) / NORTH_STAIRS.count;
    for (let i = 0; i < NORTH_STAIRS.count; i++) {
      const topY = ((i + 1) / NORTH_STAIRS.count) * NORTH_STAIRS.topHeight;
      const centerZ = NORTH_STAIRS.zStart - (i + 0.5) * stepDepth;
      const stepH = 0.72;
      const step = new THREE.Mesh(
        new THREE.BoxGeometry(NORTH_STAIRS.halfWidth * 2, stepH, stepDepth + 0.34),
        darkStoneMat
      );
      step.position.set(0, topY - stepH * 0.5, centerZ);
      step.receiveShadow = true;
      step.castShadow = true;
      scene.add(step);
      walkableMeshes.push(step);
    }

    // 6. 北方钟楼星盘青石平台（顶面精确位于 y = 3.22）
    const northPlaza = new THREE.Mesh(new THREE.BoxGeometry(24, 0.5, 22), northPlazaMat);
    northPlaza.position.set(0, 2.97, -45);
    northPlaza.receiveShadow = true;
    scene.add(northPlaza);
    walkableMeshes.push(northPlaza);
  }

  /**
   * 地面宝石彩窗投影光斑贴花
   */
  function addStainedGlassDecal(x, y, z, radius, opacity) {
    const projTex = Oublier.Models3D.createStainedGlassTexture("projection");
    const mat = new THREE.MeshBasicMaterial({
      map: projTex,
      transparent: true,
      opacity: opacity || 0.46,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const decal = new THREE.Mesh(new THREE.CircleGeometry(radius, 32), mat);
    decal.rotation.x = -Math.PI / 2;
    decal.position.set(x, y + 0.018, z);
    scene.add(decal);
  }

  function buildGothicArchitecture() {
    // 1. 中央圣火坛 + 环绕八柱哥特尖拱庭院
    brazierObj = Oublier.Models3D.createBrazier(darkStoneMat, ironMat, glowTex);
    brazierObj.group.position.y = 0.08;
    scene.add(brazierObj.group);

    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
      const radius = 14.8;
      const arch = Oublier.Models3D.createGothicArch(5.4, 6.8, 0.85, stoneMat, darkStoneMat, glassMat);
      arch.position.set(Math.cos(a) * radius, 0.08, Math.sin(a) * radius);
      arch.rotation.y = -a + Math.PI / 2;
      scene.add(arch);
    }

    // 中央庭院与拱门地面微光花窗映彩
    addStainedGlassDecal(0, 0.08, -11.2, 2.6, 0.28);

    // 沿主路摆放哥特锻铁路灯（精确落于地表）
    const glowMat = new THREE.MeshBasicMaterial({ color: 0xffd796 });
    const lanternPositions = [
      [-3.8, 16, 0],
      [3.8, 16, Math.PI],
      [-3.8, 32, 0],
      [3.8, 32, Math.PI],
      [-5.2, -20.5, 0],
      [5.2, -20.5, Math.PI],
      [-6.5, -36, 0],
      [6.5, -36, Math.PI],
      [-23, -11, Math.PI / 2],
      [23, -11, -Math.PI / 2]
    ];
    lanternPositions.forEach(function (lp) {
      const l = Oublier.Models3D.createGothicLantern(3.4, ironMat, glowMat, glowTex);
      const y = getSurfaceHeight(lp[0], lp[1]);
      l.position.set(lp[0], y, lp[1]);
      l.rotation.y = lp[2];
      scene.add(l);
    });

    // 2. 北方观星钟楼 & 宝石彩绘玫瑰窗 + 地面绚丽彩光投射
    bellTowerObj = Oublier.Models3D.createBellTower(stoneMat, darkStoneMat, roofMat, glassMat, glowTex);
    bellTowerObj.group.position.set(0, 3.22, -55.5);
    scene.add(bellTowerObj.group);
    addStainedGlassDecal(0, 3.22, -45.5, 5.4, 0.44);

    // 3. 西方回声长廊（对称尖拱列柱 + 古典棋盘地砖 + 悬吊风钟 + 花窗微光）
    const cloisterFloor = new THREE.Mesh(new THREE.BoxGeometry(26, 0.4, 11), cloisterFloorMat);
    cloisterFloor.position.set(-44, 0.7, -8);
    cloisterFloor.receiveShadow = true;
    scene.add(cloisterFloor);
    walkableMeshes.push(cloisterFloor);

    for (let i = 0; i < 6; i++) {
      const ax = -33 - i * 4.6;
      const arch = Oublier.Models3D.createGothicArch(6.8, 7.2, 0.9, stoneMat, darkStoneMat, glassMat);
      arch.position.set(ax, 0.9, -8);
      arch.rotation.y = Math.PI / 2;
      scene.add(arch);
    }
    addStainedGlassDecal(-46, 0.9, -8, 3.3, 0.34);

    resonanceBellPivot = new THREE.Group();
    resonanceBellPivot.position.set(-46, 6.25, -8);
    const bellMat = new THREE.MeshStandardMaterial({ color: 0xd5b07a, roughness: 0.38, metalness: 0.75 });
    const bellCord = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.8, 6), ironMat);
    bellCord.position.y = -0.9;
    resonanceBellPivot.add(bellCord);
    const bellBody = new THREE.Mesh(new THREE.ConeGeometry(0.55, 0.85, 10, 1, true), bellMat);
    bellBody.position.y = -2.0;
    resonanceBellPivot.add(bellBody);
    scene.add(resonanceBellPivot);

    // 4. 东方柏林石亭 & 静谧石椅（顶面精确位于 y = 0.90）
    const eastFloor = new THREE.Mesh(new THREE.CylinderGeometry(6.5, 7.0, 0.35, 8), roadStoneMat);
    eastFloor.position.set(46, 0.725, -8);
    eastFloor.receiveShadow = true;
    scene.add(eastFloor);
    walkableMeshes.push(eastFloor);

    const ruinedArch = Oublier.Models3D.createGothicArch(5.6, 6.2, 0.8, stoneMat, darkStoneMat, glassMat);
    ruinedArch.position.set(48, 0.9, -11.5);
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

    // 5. 东南孤灯望海台（顶面精确位于 y = 1.92）
    const overlookBase = new THREE.Mesh(new THREE.CylinderGeometry(7.2, 8.0, 0.5, 8), roadStoneMat);
    overlookBase.position.set(38, 1.67, 36);
    overlookBase.receiveShadow = true;
    scene.add(overlookBase);
    walkableMeshes.push(overlookBase);

    const watchTower = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.5, 8.2, 8), darkStoneMat);
    watchTower.position.set(42, 6.02, 39);
    watchTower.castShadow = true;
    scene.add(watchTower);

    const towerRoof = new THREE.Mesh(new THREE.ConeGeometry(1.75, 2.8, 8), roofMat);
    towerRoof.position.set(42, 12.02, 39);
    scene.add(towerRoof);

    const towerBeacon = new THREE.Mesh(new THREE.OctahedronGeometry(0.55, 0), glowMat);
    towerBeacon.position.set(42, 10.32, 39);
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
    towerHalo.position.set(42, 10.32, 39);
    towerHalo.scale.set(6.5, 6.5, 1);
    scene.add(towerHalo);

    // 6. 南方水门尖拱 & 潮汐木石栈桥
    const waterGate = Oublier.Models3D.createGothicArch(6.4, 7.4, 1.1, darkStoneMat, stoneMat, glassMat);
    waterGate.position.set(0, 0.06, 42);
    scene.add(waterGate);

    pierObj = Oublier.Models3D.createGothicPier(stoneMat, woodDeckMat, ironMat, glowMat, glowTex);
    scene.add(pierObj.group);
    walkableMeshes.push(pierObj.deck);

    // 7. 多元哥特植物与蜡烛点缀（保持开阔视线与道路通畅）
    // 7a. 环岛修长翠柏
    const cypressSpecs = [
      [39, -15, 1.12],
      [51, -13, 1.08],
      [52, -2, 1.2],
      [-20, -34, 1.24],
      [20, -34, 1.18],
      [-26, -42, 1.08],
      [26, -42, 1.12],
      [-35, 14, 1.14],
      [-43, 22, 1.02],
      [-26, 29, 1.08],
      [-15, 36, 0.94],
      [16, 36, 0.98]
    ];
    cypressSpecs.forEach(function (sp, idx) {
      const tree = Oublier.Models3D.createCypressTree(sp[2], foliageDarkMat, foliageLightMat, woodMat);
      tree.group.position.set(sp[0], getGroundHeight(sp[0], sp[1]) - 0.06, sp[1]);
      tree.phase = idx * 0.7;
      scene.add(tree.group);
      swayTrees.push(tree);
    });

    // 7b. 暖金哥特银杏树（与翠柏形成金绿冷暖撞色）
    const ginkgoSpecs = [
      [37, -1, 1.05],
      [44, -18, 1.18],
      [18, 12, 0.95],
      [-19, 14, 1.02],
      [-15, -24, 0.96],
      [24, 26, 1.06]
    ];
    ginkgoSpecs.forEach(function (sp, idx) {
      const tree = Oublier.Models3D.createGinkgoTree(sp[2], woodMat);
      tree.group.position.set(sp[0], getGroundHeight(sp[0], sp[1]) - 0.05, sp[1]);
      tree.phase = idx * 1.1 + 0.4;
      scene.add(tree.group);
      swayTrees.push(tree);
    });

    // 7c. 深红/绯粉哥特蔷薇花丛（点缀庭院拱柱旁、东侧石亭、回廊外侧）
    const roseSpecs = [
      [-12.5, 10.5, 1.05, "crimson"],
      [12.5, 10.5, 1.0, "pink"],
      [-12.5, -10.5, 1.0, "wine"],
      [12.5, -10.5, 1.08, "crimson"],
      [40.2, -4.5, 1.12, "crimson"],
      [40.8, -11.8, 1.0, "pink"],
      [50.5, -4.2, 1.1, "wine"],
      [-32.5, -13.8, 0.98, "crimson"],
      [-38.5, -13.8, 1.05, "pink"],
      [-49.5, -2.0, 1.02, "wine"],
      [-5.6, 38.5, 1.0, "crimson"],
      [5.6, 38.5, 1.04, "pink"],
      [-8.5, -43.5, 1.05, "crimson"],
      [8.5, -43.5, 1.0, "wine"]
    ];
    roseSpecs.forEach(function (rp) {
      const bush = Oublier.Models3D.createRoseBush(rp[2], rp[3]);
      bush.position.set(rp[0], getSurfaceHeight(rp[0], rp[1]) - 0.02, rp[1]);
      bush.rotation.y = Math.random() * Math.PI * 2;
      scene.add(bush);
    });

    // 7d. 蓝紫夜鸢尾与薰衣草花穗（沿主道草坡、东南悬崖、回廊与北阶旁错落分布）
    const irisSpecs = [
      [-4.6, 22, 1.05, "cobalt"],
      [4.6, 23, 1.0, "lavender"],
      [-4.8, 28, 0.95, "lavender"],
      [4.8, 29, 1.08, "cobalt"],
      [-7.2, -23.5, 1.1, "mixed"],
      [7.2, -23.5, 1.05, "cobalt"],
      [-7.5, -30, 1.0, "lavender"],
      [7.5, -30, 1.06, "mixed"],
      [-26, -12.5, 1.05, "cobalt"],
      [26, -12.5, 1.0, "lavender"],
      [-28, -4.0, 0.98, "mixed"],
      [28, -4.0, 1.05, "cobalt"],
      [22, 23, 1.08, "lavender"],
      [27, 29, 1.12, "cobalt"],
      [33, 30, 1.05, "mixed"],
      [32, 41, 1.1, "lavender"],
      [44, 32, 1.06, "cobalt"],
      [-42, -2.0, 0.95, "lavender"]
    ];
    irisSpecs.forEach(function (ip) {
      const iris = Oublier.Models3D.createIrisCluster(ip[2], ip[3]);
      iris.position.set(ip[0], getSurfaceHeight(ip[0], ip[1]) - 0.02, ip[1]);
      iris.rotation.y = Math.random() * Math.PI * 2;
      scene.add(iris);
    });

    // 7e. 矮石座暖光蜂蜡烛群（柔和点亮圣火坛周边、钟楼台阶口与长廊柱脚）
    const candleSpots = [
      [-5.2, 5.2],
      [5.2, -5.2],
      [-5.6, -34.6],
      [5.6, -34.6],
      [-34.2, -4.0],
      [41.5, -9.8],
      [33.2, 34.5]
    ];
    candleSpots.forEach(function (cs) {
      const shrine = Oublier.Models3D.createCandleShrine(darkStoneMat);
      shrine.position.set(cs[0], getSurfaceHeight(cs[0], cs[1]), cs[1]);
      scene.add(shrine);
    });
  }

  function buildEntitiesAndEffects() {
    // 玩家 3D 角色（双靴精准贴地）
    player.rig = Oublier.Models3D.createCharacter({
      cloakColor: "#e6ecf5",
      scarfColor: "#e6ab72",
      hasLantern: true,
      glowTex: glowTex
    });
    player.y = getSurfaceHeight(player.x, player.z);
    player.rig.group.position.set(player.x, player.y, player.z);
    player.rig.group.rotation.y = player.yaw;
    scene.add(player.rig.group);

    // 随身提灯点光源
    player.lanternLight = new THREE.PointLight(0xffb86b, 1.25, 18, 1.5);
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
      const y = getSurfaceHeight(t.home.x, t.home.z);
      rig.group.position.set(t.home.x, y, t.home.z);
      scene.add(rig.group);

      const hitMesh = new THREE.Mesh(
        new THREE.CylinderGeometry(1.25, 1.25, 2.8, 8),
        new THREE.MeshBasicMaterial({ visible: false })
      );
      hitMesh.position.y = 1.3;
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

    // 6 处地标点击碰撞体积 + 可呼吸高亮法阵光环
    landmarkRings.length = 0;
    Oublier.Data.LANDMARKS.forEach(function (lm) {
      const y = getSurfaceHeight(lm.x, lm.z);
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0xe6b57e,
        transparent: true,
        opacity: 0.34,
        side: THREE.DoubleSide
      });
      const beaconRing = new THREE.Mesh(new THREE.RingGeometry(1.55, 1.85, 28), ringMat);
      beaconRing.rotation.x = -Math.PI / 2;
      beaconRing.position.set(lm.x, y + 0.025, lm.z);
      scene.add(beaconRing);
      landmarkRings.push({ id: lm.id, mesh: beaconRing, mat: ringMat });

      const hitMesh = new THREE.Mesh(
        new THREE.CylinderGeometry(2.8, 2.8, 5.0, 10),
        new THREE.MeshBasicMaterial({ visible: false })
      );
      hitMesh.position.set(lm.x, y + 2.4, lm.z);
      hitMesh.userData = { kind: "landmark", item: lm };
      scene.add(hitMesh);
      hitTargets.push(hitMesh);
    });

    // 地面点击引导双环（贴地收敛）
    clickRingMesh = new THREE.Mesh(
      new THREE.RingGeometry(0.45, 0.68, 28),
      new THREE.MeshBasicMaterial({
        color: 0xaad3ff,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        depthWrite: false
      })
    );
    clickRingMesh.rotation.x = -Math.PI / 2;
    scene.add(clickRingMesh);

    clickRingInnerMesh = new THREE.Mesh(
      new THREE.RingGeometry(0.16, 0.28, 20),
      new THREE.MeshBasicMaterial({
        color: 0xffe4aa,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        depthWrite: false
      })
    );
    clickRingInnerMesh.rotation.x = -Math.PI / 2;
    scene.add(clickRingInnerMesh);

    // 3D 萤火虫
    for (let i = 0; i < 38; i++) {
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
        baseY: getSurfaceHeight(fx, fz) + 1.2 + Math.random() * 2.2,
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

    // 细雨下路面与砖石更显湿润光泽
    const wetRoughness = mood.rainIntensity > 0 ? 0.42 : 0.84;
    if (courtyardMat) courtyardMat.roughness = wetRoughness;
    if (roadStoneMat) roadStoneMat.roughness = wetRoughness + 0.04;
    if (cloisterFloorMat) cloisterFloorMat.roughness = mood.rainIntensity > 0 ? 0.34 : 0.65;
    if (northPlazaMat) northPlazaMat.roughness = wetRoughness;
    if (woodDeckMat) woodDeckMat.roughness = mood.rainIntensity > 0 ? 0.55 : 0.88;

    if (starPoints) starPoints.material.opacity = mood.starAlpha;
    if (rainSystem.points) rainSystem.points.visible = mood.rainIntensity > 0;

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

  function getInteractivePosition(data) {
    if (data.kind === "traveler") {
      const tObj = travelers.find(function (tr) {
        return tr.id === data.item.id;
      });
      if (tObj) return { x: tObj.x, z: tObj.z, range: 5.5 };
    }
    return { x: data.item.x, z: data.item.z, range: data.item.radius };
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

  function updatePointerNDC(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    pointerNDC.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    pointerNDC.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointerNDC, camera);
  }

  function pickGroundDestination(clientX, clientY) {
    updatePointerNDC(clientX, clientY);
    const groundHits = raycaster.intersectObjects(walkableMeshes, false);
    if (groundHits.length > 0) {
      return clampWalkable(groundHits[0].point.x, groundHits[0].point.z);
    }
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -player.y);
    const pt = new THREE.Vector3();
    if (raycaster.ray.intersectPlane(plane, pt)) {
      return clampWalkable(pt.x, pt.z);
    }
    return null;
  }

  /**
   * 纯左键点击移动 & 靠近后左键点击交互（支持按住左键持续牵引移动）
   */
  function handleLeftDown(clientX, clientY) {
    if (callbacks.isInputBlocked() || overlookActive) return;
    updatePointerNDC(clientX, clientY);

    const hits = raycaster.intersectObjects(hitTargets, false);
    if (hits.length > 0) {
      const data = hits[0].object.userData;
      const info = getInteractivePosition(data);
      const dist = Math.hypot(player.x - info.x, player.z - info.z);

      // 已在交互范围内 -> 左键点击直接交互（不进入拖走模式）
      if (dist <= info.range) {
        player.target = null;
        leftHoldMoving = false;
        triggerTarget({ kind: data.kind, item: data.item });
        return;
      }

      // 尚在远处 -> 先走到目标旁边的舒适站立点，绝不远程弹窗误触
      const dx = player.x - info.x;
      const dz = player.z - info.z;
      const len = Math.max(0.001, Math.hypot(dx, dz));
      const standOffset = Math.min(info.range * 0.52, Math.max(2.6, info.range - 2.4));
      const dest = clampWalkable(
        info.x + (dx / len) * standOffset,
        info.z + (dz / len) * standOffset
      );
      player.target = dest;
      leftHoldMoving = false;
      showGroundRing(dest.x, dest.z, 0xf2b073);
      return;
    }

    // 点在空旷地面 -> 开始移动并允许按住左键丝滑牵引
    const dest = pickGroundDestination(clientX, clientY);
    if (dest) {
      player.target = dest;
      leftHoldMoving = true;
      showGroundRing(dest.x, dest.z, 0xaad3ff);
    }
  }

  function showGroundRing(x, z, hex) {
    if (!clickRingMesh || !clickRingInnerMesh) return;
    const sy = getSurfaceHeight(x, z) + 0.03;
    clickRingMesh.position.set(x, sy, z);
    clickRingMesh.material.color.setHex(hex);
    clickRingInnerMesh.position.set(x, sy + 0.004, z);
    clickRingAlpha = 0.95;
  }

  function bindEvents() {
    global.addEventListener("resize", resize);

    // 禁用右键上下文菜单（右键暂时留空）
    canvas.addEventListener("contextmenu", function (e) {
      e.preventDefault();
    });

    canvas.addEventListener("pointerdown", function (e) {
      // 仅响应左键或触屏点击
      if (e.pointerType === "mouse" && e.button !== 0) return;
      handleLeftDown(e.clientX, e.clientY);
    });

    global.addEventListener("pointermove", function (e) {
      if (callbacks.isInputBlocked() || overlookActive) {
        leftHoldMoving = false;
        if (canvas) canvas.style.cursor = "default";
        hoveredTarget = null;
        return;
      }

      if (leftHoldMoving) {
        const dest = pickGroundDestination(e.clientX, e.clientY);
        if (dest) {
          player.target = dest;
        }
        return;
      }

      // 悬停提示：仅当指针落在玩家已靠近的可交互对象上时切换手型光标
      if (e.target === canvas) {
        updatePointerNDC(e.clientX, e.clientY);
        const hits = raycaster.intersectObjects(hitTargets, false);
        if (hits.length > 0) {
          const data = hits[0].object.userData;
          const info = getInteractivePosition(data);
          const dist = Math.hypot(player.x - info.x, player.z - info.z);
          if (dist <= info.range) {
            hoveredTarget = data.item.id;
            canvas.style.cursor = "pointer";
            return;
          }
        }
        hoveredTarget = null;
        canvas.style.cursor = "default";
      }
    });

    global.addEventListener("pointerup", function () {
      leftHoldMoving = false;
    });

    global.addEventListener("pointercancel", function () {
      leftHoldMoving = false;
    });

    global.addEventListener("blur", function () {
      leftHoldMoving = false;
      hoveredTarget = null;
    });

    canvas.addEventListener(
      "wheel",
      function (e) {
        if (callbacks.isInputBlocked() || overlookActive) return;
        e.preventDefault();
        camState.targetDist = Math.max(17.5, Math.min(38.0, camState.targetDist + e.deltaY * 0.015));
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

  /**
   * 让人物脚底接触阴影紧贴地面坡度法线
   */
  function alignShadowToGround(rig, x, z, charYaw) {
    if (!rig || !rig.shadowGroup) return;
    const n = getSurfaceNormal(x, z);
    // 将世界法线转换至角色局部空间以匹配斜坡倾角
    const cosY = Math.cos(-charYaw);
    const sinY = Math.sin(-charYaw);
    const lx = n.x * cosY - n.z * sinY;
    const lz = n.x * sinY + n.z * cosY;
    rig.shadowGroup.rotation.z = -Math.asin(Math.max(-0.5, Math.min(0.5, lx)));
    rig.shadowGroup.rotation.x = Math.asin(Math.max(-0.5, Math.min(0.5, lz)));
  }

  function updatePlayer(dt) {
    let moveX = 0;
    let moveZ = 0;

    if (!callbacks.isInputBlocked() && player.target) {
      const dx = player.target.x - player.x;
      const dz = player.target.z - player.z;
      const dist = Math.hypot(dx, dz);
      const stopDist = leftHoldMoving ? 0.35 : 0.45;
      if (dist <= stopDist) {
        if (!leftHoldMoving) {
          player.target = null;
        }
      } else {
        moveX = dx / dist;
        moveZ = dz / dist;
      }
    }

    const movingSpeed = Math.hypot(moveX, moveZ) * player.speed;
    if (movingSpeed > 0.1) {
      const next = clampWalkable(
        player.x + moveX * player.speed * dt,
        player.z + moveZ * player.speed * dt
      );
      player.x = next.x;
      player.z = next.z;
      const targetYaw = Math.atan2(moveX, moveZ);
      player.yaw += shortestAngleDiff(player.yaw, targetYaw) * Math.min(1, dt * 13);
    }

    const targetY = getSurfaceHeight(player.x, player.z);
    player.y += (targetY - player.y) * Math.min(1, dt * 26);

    if (player.rig) {
      player.rig.group.position.set(player.x, player.y, player.z);
      player.rig.group.rotation.y = player.yaw;
      alignShadowToGround(player.rig, player.x, player.z, player.yaw);
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

      const surfY = getSurfaceHeight(t.x, t.z);
      t.y += (surfY - t.y) * Math.min(1, dt * 20);
      if (t.rig) {
        t.rig.group.position.set(t.x, t.y, t.z);
        t.rig.group.rotation.y = t.yaw;
        alignShadowToGround(t.rig, t.x, t.z, t.yaw);
        Oublier.Models3D.animateCharacter(t.rig, dt, speedRatio, elapsed + t.home.x);
      }
    });
  }

  function updateCamera(dt) {
    if (overlookActive) {
      const desiredPos = new THREE.Vector3(58, 22, 54);
      const desiredLook = new THREE.Vector3(0, 6, -12);
      camera.position.lerp(desiredPos, Math.min(1, dt * 2.5));
      camState.lookAt.lerp(desiredLook, Math.min(1, dt * 2.5));
      camera.lookAt(camState.lookAt);
      return;
    }

    camState.dist += (camState.targetDist - camState.dist) * Math.min(1, dt * 8);
    // 俯视角随拉远轻微抬高，呈现《英雄联盟》式的开阔俯瞰视感
    const distRatio = (camState.dist - 17.5) / (38.0 - 17.5);
    const targetPitch = 0.88 + distRatio * 0.16;
    camState.pitch += (targetPitch - camState.pitch) * Math.min(1, dt * 8);

    const horiz = Math.cos(camState.pitch) * camState.dist;
    const camX = player.x + Math.sin(camState.yaw) * horiz;
    const camY = player.y + 1.4 + Math.sin(camState.pitch) * camState.dist;
    const camZ = player.z + Math.cos(camState.yaw) * horiz;

    camera.position.lerp(new THREE.Vector3(camX, camY, camZ), Math.min(1, dt * 9));
    camState.lookAt.lerp(new THREE.Vector3(player.x, player.y + 0.9, player.z), Math.min(1, dt * 10));
    camera.lookAt(camState.lookAt);
  }

  function updateWorldEffects(dt) {
    const mood = Oublier.Data.MOODS[currentMoodId] || Oublier.Data.MOODS.midnight;

    if (brazierObj) {
      const f = 1 + Math.sin(elapsed * 12) * 0.08 + Math.cos(elapsed * 19) * 0.06;
      brazierObj.outerFlame.scale.set(1, f, 1);
      brazierObj.innerFlame.scale.set(1, 0.95 + Math.sin(elapsed * 15) * 0.1, 1);
      brazierObj.fireGlow.scale.set(6.2 * f, 6.2 * f, 1);
    }
    if (fireLight) {
      fireLight.intensity = 2.4 + Math.sin(elapsed * 11) * 0.25 + Math.cos(elapsed * 17) * 0.15;
    }

    if (bellTowerObj && bellTowerObj.astrolabe) {
      bellTowerObj.astrolabe.rotation.y += dt * 0.45;
      bellTowerObj.astrolabe.rotation.z = Math.sin(elapsed * 0.4) * 0.15;
    }

    swayTrees.forEach(function (tree) {
      tree.swayPivot.rotation.z = Math.sin(elapsed * 1.1 + tree.phase) * 0.025;
      tree.swayPivot.rotation.x = Math.cos(elapsed * 0.8 + tree.phase) * 0.018;
    });

    if (pierObj && pierObj.bottleGroup) {
      pierObj.bottleGroup.position.y = -0.45 + Math.sin(elapsed * 2.0) * 0.16;
      pierObj.bottleGroup.rotation.x = Math.sin(elapsed * 1.6) * 0.15;
    }

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

    if (resonanceBellPivot && bellSwingAmp > 0.002) {
      resonanceBellPivot.rotation.z = Math.sin(elapsed * 5.2) * bellSwingAmp;
      bellSwingAmp *= Math.max(0, 1 - dt * 0.65);
    }

    // 地标光环：接近或悬停时柔和亮起呼吸提示可点击交互
    const activeId = nearbyTarget && nearbyTarget.kind === "landmark" ? nearbyTarget.item.id : null;
    landmarkRings.forEach(function (lr) {
      const isNear = lr.id === activeId;
      const isHover = lr.id === hoveredTarget;
      const pulse = 0.5 + 0.5 * Math.sin(elapsed * 3.4);
      const targetOpacity = isNear ? (isHover ? 0.9 : 0.62 + pulse * 0.22) : 0.28;
      lr.mat.opacity += (targetOpacity - lr.mat.opacity) * Math.min(1, dt * 10);
      const targetScale = isNear ? 1.1 + pulse * 0.08 : 1.0;
      lr.mesh.scale.set(targetScale, targetScale, 1);
    });

    // 地面点击引导双环衰减动画
    if (clickRingMesh && clickRingInnerMesh && clickRingAlpha > 0) {
      clickRingAlpha = Math.max(0, clickRingAlpha - dt * 1.4);
      clickRingMesh.material.opacity = clickRingAlpha;
      clickRingInnerMesh.material.opacity = clickRingAlpha * 0.85;
      const sOuter = 1.15 - (1 - clickRingAlpha) * 0.45;
      const sInner = 0.7 + (1 - clickRingAlpha) * 0.9;
      clickRingMesh.scale.set(sOuter, sOuter, 1);
      clickRingInnerMesh.scale.set(sInner, sInner, 1);
    }

    fireflyList.forEach(function (f) {
      f.sprite.position.set(
        f.baseX + Math.sin(elapsed * f.speed + f.phase) * 1.6,
        f.baseY + Math.cos(elapsed * f.speed * 0.8 + f.phase) * 0.65,
        f.baseZ + Math.cos(elapsed * f.speed * 0.9 + f.phase) * 1.6
      );
      f.sprite.material.opacity =
        mood.fireflyAlpha * (0.4 + 0.6 * (0.5 + 0.5 * Math.sin(elapsed * 2.5 + f.phase)));
    });

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
    mesh.position.set(x, y + 0.04, z);
    scene.add(mesh);
    ripples.push({ mesh: mesh, life: 0, maxLife: 1.4, maxScale: maxScale || 4.5 });
  }

  function triggerReleaseBurst(textSnippet) {
    for (let i = 0; i < 40; i++) {
      spawnEmber(0, 2.0, 0, 2.3);
    }
    spawnRipple(0, 0.08, 0, 0xffbe73, 7.5);
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
    spawnRipple(tx, getSurfaceHeight(tx, tz), tz, 0xffcfa0, 4.2);
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
    renderer.toneMappingExposure = 1.15;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x121b2e, 0.0058);

    // 40 度经典高俯视焦段，透视自然舒展
    camera = new THREE.PerspectiveCamera(40, 16 / 9, 0.4, 420);

    glowTex = Oublier.Models3D.createGlowTexture(
      "rgba(255, 224, 175, 0.95)",
      "rgba(235, 165, 95, 0.18)"
    );

    // 程序化真实 PBR 材质集
    const turfTex = Oublier.Models3D.createTurfTextureSet(22, 22);
    turfMat = new THREE.MeshStandardMaterial({
      color: 0xb6cab8,
      map: turfTex.map,
      bumpMap: turfTex.bumpMap,
      bumpScale: 0.16,
      roughnessMap: turfTex.roughnessMap,
      roughness: 0.92,
      metalness: 0.02,
      vertexColors: true
    });

    const ashlarTex = Oublier.Models3D.createAshlarStoneTextureSet(2, 2, false);
    stoneMat = new THREE.MeshStandardMaterial({
      color: 0xd0d7e4,
      map: ashlarTex.map,
      bumpMap: ashlarTex.bumpMap,
      bumpScale: 0.08,
      roughness: 0.86,
      metalness: 0.06
    });

    const darkAshlarTex = Oublier.Models3D.createAshlarStoneTextureSet(2, 2, true);
    darkStoneMat = new THREE.MeshStandardMaterial({
      color: 0x9aa4b8,
      map: darkAshlarTex.map,
      bumpMap: darkAshlarTex.bumpMap,
      bumpScale: 0.08,
      roughness: 0.84,
      metalness: 0.08
    });

    const courtyardTex = Oublier.Models3D.createCourtyardMosaicTextureSet();
    courtyardMat = new THREE.MeshStandardMaterial({
      color: 0xdad5cd,
      map: courtyardTex.map,
      bumpMap: courtyardTex.bumpMap,
      bumpScale: 0.08,
      roughnessMap: courtyardTex.roughnessMap,
      roughness: 0.82,
      metalness: 0.12
    });

    const flagTex = Oublier.Models3D.createFlagstoneTextureSet(1, 1, false);
    roadStoneMat = new THREE.MeshStandardMaterial({
      color: 0xd4d6de,
      map: flagTex.map,
      bumpMap: flagTex.bumpMap,
      bumpScale: 0.09,
      roughnessMap: flagTex.roughnessMap,
      roughness: 0.86,
      metalness: 0.06
    });

    const cloisterTex = Oublier.Models3D.createCloisterTileTextureSet(4, 1.8);
    cloisterFloorMat = new THREE.MeshStandardMaterial({
      color: 0xdadce2,
      map: cloisterTex.map,
      bumpMap: cloisterTex.bumpMap,
      bumpScale: 0.06,
      roughnessMap: cloisterTex.roughnessMap,
      roughness: 0.65,
      metalness: 0.12
    });

    const northTex = Oublier.Models3D.createNorthPlazaTextureSet();
    northPlazaMat = new THREE.MeshStandardMaterial({
      color: 0xd0d8e8,
      map: northTex.map,
      bumpMap: northTex.bumpMap,
      bumpScale: 0.08,
      roughnessMap: northTex.roughnessMap,
      roughness: 0.8,
      metalness: 0.12
    });

    const woodPlankTex = Oublier.Models3D.createWoodPlankTextureSet(1, 3.2);
    woodDeckMat = new THREE.MeshStandardMaterial({
      color: 0xd2beb0,
      map: woodPlankTex.map,
      bumpMap: woodPlankTex.bumpMap,
      bumpScale: 0.09,
      roughnessMap: woodPlankTex.roughnessMap,
      roughness: 0.88,
      metalness: 0.04
    });

    roofMat = new THREE.MeshStandardMaterial({ color: 0x2a3346, roughness: 0.74, metalness: 0.16, flatShading: true });
    glassMat = new THREE.MeshStandardMaterial({
      color: 0xc2a8ff,
      emissive: 0x9b72f2,
      emissiveIntensity: 0.9,
      roughness: 0.25
    });
    ironMat = new THREE.MeshStandardMaterial({ color: 0x1e2430, roughness: 0.5, metalness: 0.75 });
    woodMat = new THREE.MeshStandardMaterial({ color: 0x4b382e, roughness: 0.88, flatShading: true });
    foliageDarkMat = new THREE.MeshStandardMaterial({ color: 0x1d3834, roughness: 0.88, flatShading: true });
    foliageLightMat = new THREE.MeshStandardMaterial({ color: 0x2a4e46, roughness: 0.86, flatShading: true });

    // 光照预算（1 半球光 + 1 高精度阴影主月光 + 3 战略点光源 + 1 随身提灯）
    hemiLight = new THREE.HemisphereLight(0x7694c2, 0x262d3d, 0.88);
    scene.add(hemiLight);

    moonLight = new THREE.DirectionalLight(0xe6efff, 1.22);
    moonLight.position.set(-34, 58, -56);
    moonLight.castShadow = true;
    moonLight.shadow.mapSize.set(2048, 2048);
    moonLight.shadow.camera.near = 10;
    moonLight.shadow.camera.far = 180;
    moonLight.shadow.camera.left = -64;
    moonLight.shadow.camera.right = 64;
    moonLight.shadow.camera.top = 64;
    moonLight.shadow.camera.bottom = -64;
    moonLight.shadow.bias = -0.0004;
    scene.add(moonLight);

    fireLight = new THREE.PointLight(0xff9b4a, 2.5, 32, 1.5);
    fireLight.position.set(0, 2.8, 0);
    scene.add(fireLight);

    roseLight = new THREE.PointLight(0xc2a8ff, 1.9, 34, 1.5);
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

    // 初始直接定位高俯视机位，避免开场镜头剧烈飞入
    const horiz = Math.cos(camState.pitch) * camState.dist;
    camera.position.set(
      player.x + Math.sin(camState.yaw) * horiz,
      player.y + 1.4 + Math.sin(camState.pitch) * camState.dist,
      player.z + Math.cos(camState.yaw) * horiz
    );
    camState.lookAt.set(player.x, player.y + 0.9, player.z);
    camera.lookAt(camState.lookAt);

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
