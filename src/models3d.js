(function (global) {
  "use strict";

  const Oublier = (global.Oublier = global.Oublier || {});

  const textureCache = Object.create(null);

  function createGlowTexture(innerRgba, outerRgba) {
    const key = innerRgba + "|" + outerRgba;
    if (textureCache[key]) return textureCache[key];
    const size = 128;
    const c = document.createElement("canvas");
    c.width = size;
    c.height = size;
    const ctx = c.getContext("2d");
    const g = ctx.createRadialGradient(size / 2, size / 2, 2, size / 2, size / 2, size / 2);
    g.addColorStop(0, innerRgba);
    g.addColorStop(0.45, outerRgba);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    const tex = new THREE.CanvasTexture(c);
    textureCache[key] = tex;
    return tex;
  }

  function createShadowTexture() {
    return createGlowTexture("rgba(5, 8, 15, 0.52)", "rgba(5, 8, 15, 0.14)");
  }

  function createTextSprite(text) {
    const clean = String(text || "").trim();
    const display = clean.length > 18 ? clean.slice(0, 18) + "…" : clean;
    const c = document.createElement("canvas");
    c.width = 512;
    c.height = 128;
    const ctx = c.getContext("2d");
    ctx.font = "34px 'Noto Serif SC', 'Songti SC', serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor = "rgba(255, 180, 90, 0.85)";
    ctx.shadowBlur = 16;
    ctx.fillStyle = "rgba(255, 232, 198, 0.96)";
    ctx.fillText(display, 256, 64);
    const tex = new THREE.CanvasTexture(c);
    const mat = new THREE.SpriteMaterial({
      map: tex,
      transparent: true,
      depthWrite: false
    });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(6.5, 1.65, 1);
    return sprite;
  }

  /**
   * 构建极简雕塑感 3D 披风旅人角色（玩家 & 同行旅人共用）
   */
  function createCharacter(opts) {
    const cloakHex = (opts && opts.cloakColor) || "#dde5f2";
    const scarfHex = (opts && opts.scarfColor) || "#e5ac73";
    const hasLantern = Boolean(opts && opts.hasLantern);
    const glowTex = (opts && opts.glowTex) || createGlowTexture("rgba(255, 208, 138, 0.9)", "rgba(242, 154, 78, 0.22)");

    const group = new THREE.Group();
    const bodyGroup = new THREE.Group();
    group.add(bodyGroup);

    // 脚底接地软阴影盘
    const shadowMat = new THREE.MeshBasicMaterial({
      map: createShadowTexture(),
      transparent: true,
      depthWrite: false
    });
    const shadowDisc = new THREE.Mesh(new THREE.PlaneGeometry(1.45, 1.45), shadowMat);
    shadowDisc.rotation.x = -Math.PI / 2;
    shadowDisc.position.y = 0.03;
    group.add(shadowDisc);

    const cloakMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(cloakHex),
      roughness: 0.82,
      metalness: 0.06,
      flatShading: true
    });

    const trimMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(cloakHex).multiplyScalar(0.55),
      roughness: 0.88,
      metalness: 0.05,
      flatShading: true
    });

    const legMat = new THREE.MeshStandardMaterial({
      color: 0x1b1f29,
      roughness: 0.9,
      metalness: 0.1
    });

    // 1. 简洁双足（可做迈步摆动）
    const legGeo = new THREE.CylinderGeometry(0.085, 0.075, 0.48, 8);
    legGeo.translate(0, -0.24, 0);

    const leftLeg = new THREE.Mesh(legGeo, legMat);
    leftLeg.position.set(-0.14, 0.48, 0);
    leftLeg.castShadow = true;
    bodyGroup.add(leftLeg);

    const rightLeg = new THREE.Mesh(legGeo, legMat);
    rightLeg.position.set(0.14, 0.48, 0);
    rightLeg.castShadow = true;
    bodyGroup.add(rightLeg);

    // 2. 锥形哥特斗篷轮廓（LatheGeometry 雕塑折面感）
    const cloakPts = [
      new THREE.Vector2(0.0, 1.46),
      new THREE.Vector2(0.26, 1.44),
      new THREE.Vector2(0.35, 1.24),
      new THREE.Vector2(0.41, 0.85),
      new THREE.Vector2(0.50, 0.32),
      new THREE.Vector2(0.46, 0.28)
    ];
    const cloakGeo = new THREE.LatheGeometry(cloakPts, 10);
    const cloak = new THREE.Mesh(cloakGeo, cloakMat);
    cloak.castShadow = true;
    cloak.receiveShadow = true;
    bodyGroup.add(cloak);

    // 斗篷肩披装饰领
    const mantleGeo = new THREE.ConeGeometry(0.42, 0.42, 10, 1, true);
    const mantle = new THREE.Mesh(mantleGeo, trimMat);
    mantle.position.y = 1.28;
    mantle.castShadow = true;
    bodyGroup.add(mantle);

    // 3. 头部与兜帽（正面留白面庞 + 柔光双眸 + 尖顶哥特兜帽）
    const headMat = new THREE.MeshStandardMaterial({
      color: 0xf6efe6,
      roughness: 0.65,
      metalness: 0.04
    });
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.21, 14, 12), headMat);
    head.position.set(0, 1.62, 0.03);
    head.castShadow = true;
    bodyGroup.add(head);

    // 微光双眸（面向 +Z 方向）
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffdfaa });
    const eyeGeo = new THREE.SphereGeometry(0.026, 8, 8);
    const eyeL = new THREE.Mesh(eyeGeo, eyeMat);
    eyeL.position.set(-0.07, 1.63, 0.22);
    const eyeR = new THREE.Mesh(eyeGeo, eyeMat);
    eyeR.position.set(0.07, 1.63, 0.22);
    bodyGroup.add(eyeL, eyeR);

    // 哥特尖帽兜（后倾包裹头部）
    const hoodGroup = new THREE.Group();
    hoodGroup.position.set(0, 1.63, -0.02);
    const cowlGeo = new THREE.SphereGeometry(0.26, 10, 10, 0, Math.PI * 2, 0, Math.PI * 0.72);
    const cowl = new THREE.Mesh(cowlGeo, cloakMat);
    cowl.rotation.x = -0.35;
    cowl.castShadow = true;
    hoodGroup.add(cowl);

    const hoodTipGeo = new THREE.ConeGeometry(0.22, 0.44, 8);
    const hoodTip = new THREE.Mesh(hoodTipGeo, cloakMat);
    hoodTip.position.set(0, 0.18, -0.18);
    hoodTip.rotation.x = -0.82;
    hoodTip.castShadow = true;
    hoodGroup.add(hoodTip);
    bodyGroup.add(hoodGroup);

    // 4. 随风飘动的分段围巾（向 -Z 后方延伸）
    const scarfMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(scarfHex),
      roughness: 0.78,
      metalness: 0.05,
      flatShading: true
    });
    const scarfSegments = [];
    let parentJoint = bodyGroup;
    for (let i = 0; i < 4; i++) {
      const segPivot = new THREE.Group();
      if (i === 0) {
        segPivot.position.set(0.08, 1.42, -0.22);
      } else {
        segPivot.position.set(0, -0.06, -0.22);
      }
      const w = 0.16 - i * 0.02;
      const segGeo = new THREE.BoxGeometry(w, 0.045, 0.24);
      segGeo.translate(0, 0, -0.11);
      const segMesh = new THREE.Mesh(segGeo, scarfMat);
      segMesh.castShadow = true;
      segPivot.add(segMesh);
      parentJoint.add(segPivot);
      scarfSegments.push(segPivot);
      parentJoint = segPivot;
    }

    // 5. 可选：提手锻铁小灯笼
    let lanternPivot = null;
    if (hasLantern) {
      lanternPivot = new THREE.Group();
      lanternPivot.position.set(0.42, 0.96, 0.20);

      const ironMat = new THREE.MeshStandardMaterial({
        color: 0x1c202a,
        roughness: 0.6,
        metalness: 0.65
      });
      const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.20, 6), ironMat);
      cord.position.y = -0.10;
      lanternPivot.add(cord);

      const cage = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.065, 0.16, 6), ironMat);
      cage.position.y = -0.25;
      lanternPivot.add(cage);

      const bulb = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.065, 0),
        new THREE.MeshBasicMaterial({ color: 0xffd796 })
      );
      bulb.position.y = -0.25;
      lanternPivot.add(bulb);

      const halo = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: glowTex,
          color: 0xffc67c,
          transparent: true,
          opacity: 0.78,
          blending: THREE.AdditiveBlending,
          depthWrite: false
        })
      );
      halo.position.y = -0.25;
      halo.scale.set(1.35, 1.35, 1);
      lanternPivot.add(halo);

      bodyGroup.add(lanternPivot);
    }

    return {
      group,
      bodyGroup,
      leftLeg,
      rightLeg,
      cloak,
      lanternPivot,
      scarfSegments
    };
  }

  function animateCharacter(rig, dt, speedRatio, elapsed) {
    if (!rig) return;
    const isMoving = speedRatio > 0.08;
    const strideFreq = isMoving ? 8.5 : 1.8;
    const strideAmp = isMoving ? 0.48 * Math.min(1, speedRatio) : 0.0;

    rig.leftLeg.rotation.x = Math.sin(elapsed * strideFreq) * strideAmp;
    rig.rightLeg.rotation.x = -Math.sin(elapsed * strideFreq) * strideAmp;

    const bob = isMoving
      ? Math.abs(Math.sin(elapsed * strideFreq)) * 0.075
      : Math.sin(elapsed * 1.9) * 0.022;
    rig.bodyGroup.position.y = bob;
    rig.bodyGroup.rotation.x = isMoving ? 0.06 * Math.min(1, speedRatio) : 0;

    // 围巾随微风与奔跑飘摆
    const windBase = 0.25 + speedRatio * 0.55;
    rig.scarfSegments.forEach(function (seg, idx) {
      const wave = Math.sin(elapsed * (3.2 + speedRatio * 4.5) - idx * 0.85);
      seg.rotation.x = -0.22 + windBase * 0.16 + wave * (0.09 + idx * 0.035);
      seg.rotation.y = Math.cos(elapsed * 2.1 - idx * 0.6) * (0.08 + speedRatio * 0.08);
    });

    if (rig.lanternPivot) {
      rig.lanternPivot.rotation.x = Math.sin(elapsed * 3.1) * (0.06 + speedRatio * 0.22);
      rig.lanternPivot.rotation.z = Math.cos(elapsed * 2.4) * 0.06;
    }
  }

  /**
   * 创建哥特尖拱门（双侧柱墩 + 真正双心尖拱轮廓）
   */
  function createGothicArch(width, height, thickness, stoneMat, trimMat) {
    const group = new THREE.Group();
    const halfW = width / 2;
    const pillarW = Math.max(0.55, width * 0.16);
    const springY = height * 0.54;
    const innerHalfW = halfW - pillarW;

    // 两侧立柱 + 基座 + 柱头
    [-1, 1].forEach(function (side) {
      const px = side * (halfW - pillarW * 0.5);
      const base = new THREE.Mesh(
        new THREE.BoxGeometry(pillarW * 1.32, 0.55, thickness * 1.28),
        trimMat
      );
      base.position.set(px, 0.275, 0);
      base.castShadow = true;
      base.receiveShadow = true;
      group.add(base);

      const shaft = new THREE.Mesh(
        new THREE.BoxGeometry(pillarW, springY, thickness),
        stoneMat
      );
      shaft.position.set(px, springY * 0.5, 0);
      shaft.castShadow = true;
      shaft.receiveShadow = true;
      group.add(shaft);

      const cap = new THREE.Mesh(
        new THREE.BoxGeometry(pillarW * 1.25, 0.34, thickness * 1.2),
        trimMat
      );
      cap.position.set(px, springY, 0);
      cap.castShadow = true;
      group.add(cap);
    });

    // 尖拱顶框（Shape 带尖拱镂空）
    const archShape = new THREE.Shape();
    archShape.moveTo(-halfW, springY);
    archShape.lineTo(-halfW, height * 0.86);
    archShape.quadraticCurveTo(-halfW * 0.55, height * 1.02, 0, height * 1.07);
    archShape.quadraticCurveTo(halfW * 0.55, height * 1.02, halfW, height * 0.86);
    archShape.lineTo(halfW, springY);

    // 内侧尖拱洞口
    archShape.lineTo(innerHalfW, springY);
    archShape.quadraticCurveTo(innerHalfW * 0.92, height * 0.84, 0, height * 0.96);
    archShape.quadraticCurveTo(-innerHalfW * 0.92, height * 0.84, -innerHalfW, springY);
    archShape.closePath();

    const extrudeGeo = new THREE.ExtrudeGeometry(archShape, {
      depth: thickness,
      bevelEnabled: true,
      bevelThickness: 0.06,
      bevelSize: 0.05,
      bevelSegments: 1,
      curveSegments: 14
    });
    extrudeGeo.translate(0, 0, -thickness / 2);

    const archMesh = new THREE.Mesh(extrudeGeo, stoneMat);
    archMesh.castShadow = true;
    archMesh.receiveShadow = true;
    group.add(archMesh);

    return group;
  }

  /**
   * 创建哥特玫瑰窗（辐射石窗棂 + 背光彩窗）
   */
  function createRoseWindow(radius, stoneMat, glassMat) {
    const group = new THREE.Group();

    const glassDisc = new THREE.Mesh(new THREE.CircleGeometry(radius * 0.94, 24), glassMat);
    glassDisc.position.z = -0.05;
    group.add(glassDisc);

    const outerRing = new THREE.Mesh(new THREE.TorusGeometry(radius, radius * 0.09, 8, 28), stoneMat);
    group.add(outerRing);

    const innerRing = new THREE.Mesh(new THREE.TorusGeometry(radius * 0.45, radius * 0.055, 6, 20), stoneMat);
    group.add(innerRing);

    for (let i = 0; i < 8; i++) {
      const spoke = new THREE.Mesh(
        new THREE.BoxGeometry(radius * 0.06, radius * 1.92, 0.22),
        stoneMat
      );
      spoke.rotation.z = (i * Math.PI) / 4;
      group.add(spoke);
    }

    return group;
  }

  /**
   * 创建北方观星钟楼与哥特修道院立面
   */
  function createBellTower(stoneMat, darkStoneMat, roofMat, glassMat, glowTex) {
    const group = new THREE.Group();

    // 塔身底座
    const basePlinth = new THREE.Mesh(new THREE.BoxGeometry(11.6, 1.4, 9.6), darkStoneMat);
    basePlinth.position.y = 0.7;
    basePlinth.castShadow = true;
    basePlinth.receiveShadow = true;
    group.add(basePlinth);

    // 主立面石墙
    const towerBody = new THREE.Mesh(new THREE.BoxGeometry(9.2, 13.5, 7.8), stoneMat);
    towerBody.position.y = 7.45;
    towerBody.castShadow = true;
    towerBody.receiveShadow = true;
    group.add(towerBody);

    // 两侧对称飞扶壁
    [-1, 1].forEach(function (side) {
      const lowerButtress = new THREE.Mesh(new THREE.BoxGeometry(1.7, 7.6, 2.2), darkStoneMat);
      lowerButtress.position.set(side * 5.3, 3.8, 0);
      lowerButtress.castShadow = true;
      lowerButtress.receiveShadow = true;
      group.add(lowerButtress);

      const upperButtress = new THREE.Mesh(new THREE.BoxGeometry(1.2, 5.2, 1.6), stoneMat);
      upperButtress.position.set(side * 5.05, 9.5, 0);
      upperButtress.castShadow = true;
      group.add(upperButtress);

      const pinnacle = new THREE.Mesh(new THREE.ConeGeometry(0.65, 2.8, 4), darkStoneMat);
      pinnacle.position.set(side * 5.05, 13.5, 0);
      pinnacle.rotation.y = Math.PI / 4;
      pinnacle.castShadow = true;
      group.add(pinnacle);
    });

    // 正面尖拱门框装饰
    const portal = createGothicArch(4.4, 5.2, 1.1, darkStoneMat, stoneMat);
    portal.position.set(0, 0, 4.1);
    group.add(portal);

    // 发光玫瑰窗（面朝南方广场 +Z）
    const rose = createRoseWindow(2.15, darkStoneMat, glassMat);
    rose.position.set(0, 9.8, 4.02);
    group.add(rose);

    // 玫瑰窗背光光晕
    const roseHalo = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glowTex,
        color: 0x99b8ff,
        transparent: true,
        opacity: 0.52,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      })
    );
    roseHalo.position.set(0, 9.8, 4.35);
    roseHalo.scale.set(9.5, 9.5, 1);
    group.add(roseHalo);

    // 钟楼八角尖顶与四角小尖塔
    const spire = new THREE.Mesh(new THREE.ConeGeometry(5.6, 9.5, 8), roofMat);
    spire.position.y = 18.9;
    spire.castShadow = true;
    group.add(spire);

    [
      [-3.9, 3.3],
      [3.9, 3.3],
      [-3.9, -3.3],
      [3.9, -3.3]
    ].forEach(function (pos) {
      const miniSpire = new THREE.Mesh(new THREE.ConeGeometry(0.7, 3.2, 4), roofMat);
      miniSpire.position.set(pos[0], 15.7, pos[1]);
      miniSpire.rotation.y = Math.PI / 4;
      miniSpire.castShadow = true;
      group.add(miniSpire);
    });

    // 塔顶星象仪旋转环
    const brassMat = new THREE.MeshStandardMaterial({
      color: 0xd9b584,
      roughness: 0.35,
      metalness: 0.8
    });
    const astrolabe = new THREE.Group();
    astrolabe.position.set(0, 24.4, 0);
    const ring1 = new THREE.Mesh(new THREE.TorusGeometry(1.05, 0.06, 8, 24), brassMat);
    const ring2 = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.05, 8, 20), brassMat);
    ring2.rotation.x = Math.PI / 3;
    astrolabe.add(ring1, ring2);
    group.add(astrolabe);

    return { group: group, astrolabe: astrolabe, roseHalo: roseHalo };
  }

  /**
   * 哥特锻铁路灯
   */
  function createGothicLantern(height, ironMat, glowMat, glowTex) {
    const group = new THREE.Group();

    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.24, 0.65, 6), ironMat);
    base.position.y = 0.325;
    base.castShadow = true;
    group.add(base);

    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.1, height, 6), ironMat);
    pole.position.y = height / 2 + 0.4;
    pole.castShadow = true;
    group.add(pole);

    const topY = height + 0.4;
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.08, 0.08), ironMat);
    arm.position.set(0.24, topY, 0);
    group.add(arm);

    const cap = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.26, 6), ironMat);
    cap.position.set(0.45, topY - 0.06, 0);
    group.add(cap);

    const bulb = new THREE.Mesh(new THREE.OctahedronGeometry(0.14, 0), glowMat);
    bulb.position.set(0.45, topY - 0.28, 0);
    group.add(bulb);

    const halo = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glowTex,
        color: 0xffc478,
        transparent: true,
        opacity: 0.7,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      })
    );
    halo.position.set(0.45, topY - 0.28, 0);
    halo.scale.set(2.8, 2.8, 1);
    group.add(halo);

    return group;
  }

  /**
   * 哥特修长柏树
   */
  function createCypressTree(scale, foliageDark, foliageLight, trunkMat) {
    const group = new THREE.Group();
    const swayPivot = new THREE.Group();
    group.add(swayPivot);

    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.22, 1.5, 6), trunkMat);
    trunk.position.y = 0.75;
    trunk.castShadow = true;
    swayPivot.add(trunk);

    const layers = [
      { y: 2.6, r: 1.05, h: 3.4, mat: foliageDark },
      { y: 4.5, r: 0.82, h: 3.2, mat: foliageLight },
      { y: 6.3, r: 0.56, h: 2.8, mat: foliageDark }
    ];
    layers.forEach(function (l) {
      const cone = new THREE.Mesh(new THREE.ConeGeometry(l.r, l.h, 7), l.mat);
      cone.position.y = l.y;
      cone.castShadow = true;
      cone.receiveShadow = true;
      swayPivot.add(cone);
    });

    group.scale.setScalar(scale || 1);
    return { group: group, swayPivot: swayPivot };
  }

  /**
   * 中央遗忘圣火坛
   */
  function createBrazier(stoneMat, ironMat, glowTex) {
    const group = new THREE.Group();

    const step1 = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.8, 0.35, 8), stoneMat);
    step1.position.y = 0.175;
    step1.receiveShadow = true;
    group.add(step1);

    const step2 = new THREE.Mesh(new THREE.CylinderGeometry(2.3, 2.6, 0.35, 8), stoneMat);
    step2.position.y = 0.525;
    step2.receiveShadow = true;
    group.add(step2);

    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(1.35, 0.85, 0.65, 8), ironMat);
    bowl.position.y = 1.02;
    bowl.castShadow = true;
    group.add(bowl);

    // 风格化立体火焰锥体
    const outerFlame = new THREE.Mesh(
      new THREE.ConeGeometry(0.75, 1.85, 7),
      new THREE.MeshBasicMaterial({ color: 0xf07838, transparent: true, opacity: 0.88 })
    );
    outerFlame.position.y = 2.05;
    group.add(outerFlame);

    const innerFlame = new THREE.Mesh(
      new THREE.ConeGeometry(0.42, 1.25, 6),
      new THREE.MeshBasicMaterial({ color: 0xffd786 })
    );
    innerFlame.position.y = 1.85;
    group.add(innerFlame);

    const fireGlow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glowTex,
        color: 0xffa85c,
        transparent: true,
        opacity: 0.85,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      })
    );
    fireGlow.position.y = 2.0;
    fireGlow.scale.set(6.4, 6.4, 1);
    group.add(fireGlow);

    return {
      group: group,
      outerFlame: outerFlame,
      innerFlame: innerFlame,
      fireGlow: fireGlow
    };
  }

  /**
   * 南方潮汐石栈桥与海面漂流瓶
   */
  function createGothicPier(stoneMat, woodMat, ironMat, glowMat, glowTex) {
    const group = new THREE.Group();

    // 栈桥木石栈道
    const deck = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.45, 16), woodMat);
    deck.position.set(0, 0.3, 53);
    deck.receiveShadow = true;
    deck.castShadow = true;
    group.add(deck);

    // 栈桥石桩柱
    [-2.4, 2.4].forEach(function (px) {
      [47, 53, 59].forEach(function (pz) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.28, 2.2, 8), stoneMat);
        post.position.set(px, -0.35, pz);
        post.castShadow = true;
        group.add(post);
      });
    });

    // 栈桥末端双灯柱
    const endLantern = createGothicLantern(3.1, ironMat, glowMat, glowTex);
    endLantern.position.set(2.3, 0.45, 59.8);
    endLantern.rotation.y = Math.PI;
    group.add(endLantern);

    // 漂浮在海面上的发光玻璃瓶
    const bottleGroup = new THREE.Group();
    bottleGroup.position.set(-4.5, -0.5, 62.5);
    const glassBody = new THREE.Mesh(
      new THREE.CylinderGeometry(0.24, 0.26, 0.68, 10),
      new THREE.MeshStandardMaterial({
        color: 0x9ce3ff,
        emissive: 0x2c6e8f,
        emissiveIntensity: 0.7,
        roughness: 0.2,
        transparent: true,
        opacity: 0.85
      })
    );
    glassBody.rotation.z = 0.42;
    bottleGroup.add(glassBody);

    const bottleGlow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glowTex,
        color: 0x9ee6ff,
        transparent: true,
        opacity: 0.75,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      })
    );
    bottleGlow.scale.set(2.2, 2.2, 1);
    bottleGroup.add(bottleGlow);
    group.add(bottleGroup);

    return { group: group, bottleGroup: bottleGroup };
  }

  Oublier.Models3D = {
    createGlowTexture,
    createTextSprite,
    createCharacter,
    animateCharacter,
    createGothicArch,
    createRoseWindow,
    createBellTower,
    createGothicLantern,
    createCypressTree,
    createBrazier,
    createGothicPier
  };
})(window);
