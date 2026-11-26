(function (global) {
  "use strict";

  const Oublier = (global.Oublier = global.Oublier || {});

  const textureCache = Object.create(null);

  function createRng(seed) {
    let s = seed >>> 0;
    return function () {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  function makeCanvas(size) {
    const c = document.createElement("canvas");
    c.width = size;
    c.height = size;
    return c;
  }

  function finishTexture(canvas, isSRGB, repeatX, repeatY) {
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    if (repeatX || repeatY) {
      tex.repeat.set(repeatX || 1, repeatY || 1);
    }
    if (isSRGB) {
      tex.encoding = THREE.sRGBEncoding;
    }
    tex.anisotropy = 4;
    tex.needsUpdate = true;
    return tex;
  }

  function createGlowTexture(innerRgba, outerRgba) {
    const key = "glow|" + innerRgba + "|" + outerRgba;
    if (textureCache[key]) return textureCache[key];
    const size = 128;
    const c = makeCanvas(size);
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

  function createShadowTexture(alphaCenter) {
    const a = typeof alphaCenter === "number" ? alphaCenter : 0.78;
    return createGlowTexture("rgba(4, 6, 14, " + a + ")", "rgba(4, 6, 14, " + (a * 0.34).toFixed(2) + ")");
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
   * 1. 修道院草苔与腐殖土无缝 PBR 纹理集（配合顶点色呈现丰富区域植被地貌）
   */
  function createTurfTextureSet(rx, ry) {
    const key = "pbr-turf|" + (rx || 1) + "|" + (ry || 1);
    if (textureCache[key]) return textureCache[key];

    const size = 512;
    const cMap = makeCanvas(size);
    const cBump = makeCanvas(size);
    const cRough = makeCanvas(size);
    const ctxM = cMap.getContext("2d");
    const ctxB = cBump.getContext("2d");
    const ctxR = cRough.getContext("2d");
    const rng = createRng(104729);

    ctxM.fillStyle = "#5c705c";
    ctxM.fillRect(0, 0, size, size);
    ctxB.fillStyle = "#7a7a7a";
    ctxB.fillRect(0, 0, size, size);
    ctxR.fillStyle = "#dfdfdf";
    ctxR.fillRect(0, 0, size, size);

    // 柔和腐殖土与苔藓斑块（3x3 平铺保证无缝）
    function wrapDraw(fn) {
      for (let ox = -1; ox <= 1; ox++) {
        for (let oy = -1; oy <= 1; oy++) {
          fn(ox * size, oy * size);
        }
      }
    }

    for (let i = 0; i < 120; i++) {
      const x = rng() * size;
      const y = rng() * size;
      const rad = 18 + rng() * 44;
      const isSoil = rng() < 0.28;
      const fillM = isSoil ? "rgba(74, 58, 46, 0.24)" : rng() < 0.5 ? "rgba(78, 114, 78, 0.25)" : "rgba(102, 134, 88, 0.22)";
      const fillB = isSoil ? "rgba(62, 62, 62, 0.22)" : "rgba(155, 155, 155, 0.2)";
      wrapDraw(function (dx, dy) {
        const g = ctxM.createRadialGradient(x + dx, y + dy, 2, x + dx, y + dy, rad);
        g.addColorStop(0, fillM);
        g.addColorStop(1, "rgba(0,0,0,0)");
        ctxM.fillStyle = g;
        ctxM.beginPath();
        ctxM.arc(x + dx, y + dy, rad, 0, Math.PI * 2);
        ctxM.fill();

        const gb = ctxB.createRadialGradient(x + dx, y + dy, 2, x + dx, y + dy, rad);
        gb.addColorStop(0, fillB);
        gb.addColorStop(1, "rgba(0,0,0,0)");
        ctxB.fillStyle = gb;
        ctxB.beginPath();
        ctxB.arc(x + dx, y + dy, rad, 0, Math.PI * 2);
        ctxB.fill();
      });
    }

    // 细碎草叶笔触与小三叶草簇
    for (let i = 0; i < 2400; i++) {
      const x = rng() * size;
      const y = rng() * size;
      const len = 3 + rng() * 7;
      const ang = -Math.PI * 0.5 + (rng() - 0.5) * 1.1;
      const tone = rng();
      let col = "#7da270";
      if (tone < 0.3) col = "#546e50";
      else if (tone < 0.6) col = "#8eb17c";
      else if (tone < 0.85) col = "#6c8b64";
      else col = "#9c9468";

      ctxM.strokeStyle = col;
      ctxM.lineWidth = 1.1 + rng() * 1.1;
      ctxM.beginPath();
      ctxM.moveTo(x, y);
      ctxM.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len);
      ctxM.stroke();

      const bv = Math.floor(135 + rng() * 90);
      ctxB.strokeStyle = "rgb(" + bv + "," + bv + "," + bv + ")";
      ctxB.lineWidth = 1.1;
      ctxB.beginPath();
      ctxB.moveTo(x, y);
      ctxB.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len);
      ctxB.stroke();
    }

    // 微小地衣、碎石粒与零星野花
    for (let i = 0; i < 160; i++) {
      const x = rng() * size;
      const y = rng() * size;
      const r = 1.2 + rng() * 2.2;
      const pick = rng();
      if (pick < 0.45) {
        ctxM.fillStyle = "rgba(130, 128, 120, 0.55)";
        ctxR.fillStyle = "rgb(175,175,175)";
      } else if (pick < 0.78) {
        ctxM.fillStyle = "rgba(182, 168, 224, 0.65)";
        ctxR.fillStyle = "rgb(200,200,200)";
      } else {
        ctxM.fillStyle = "rgba(225, 196, 122, 0.7)";
        ctxR.fillStyle = "rgb(200,200,200)";
      }
      ctxM.beginPath();
      ctxM.arc(x, y, r, 0, Math.PI * 2);
      ctxM.fill();
      ctxR.beginPath();
      ctxR.arc(x, y, r, 0, Math.PI * 2);
      ctxR.fill();
    }

    const set = {
      map: finishTexture(cMap, true, rx || 1, ry || 1),
      bumpMap: finishTexture(cBump, false, rx || 1, ry || 1),
      roughnessMap: finishTexture(cRough, false, rx || 1, ry || 1)
    };
    textureCache[key] = set;
    return set;
  }

  /**
   * 2. 中央八角庭院放射拼花镶金石砖 PBR 纹理
   */
  function createCourtyardMosaicTextureSet() {
    const key = "pbr-courtyard";
    if (textureCache[key]) return textureCache[key];

    const size = 512;
    const half = size / 2;
    const cMap = makeCanvas(size);
    const cBump = makeCanvas(size);
    const cRough = makeCanvas(size);
    const ctxM = cMap.getContext("2d");
    const ctxB = cBump.getContext("2d");
    const ctxR = cRough.getContext("2d");
    const rng = createRng(22991);

    ctxM.fillStyle = "#5c606d";
    ctxM.fillRect(0, 0, size, size);
    ctxB.fillStyle = "#484848";
    ctxB.fillRect(0, 0, size, size);
    ctxR.fillStyle = "#c4c4c4";
    ctxR.fillRect(0, 0, size, size);

    // 同心环状石砖块（8 个分段 x 6 个环）
    const rings = [34, 72, 114, 158, 206, 254];
    const palette = ["#8d857d", "#6e7688", "#7d748a", "#9c8d7a", "#677282"];

    for (let rIdx = 0; rIdx < rings.length - 1; rIdx++) {
      const r0 = rings[rIdx];
      const r1 = rings[rIdx + 1];
      const sectors = (rIdx + 2) * 8;
      for (let s = 0; s < sectors; s++) {
        const a0 = (s / sectors) * Math.PI * 2 + 0.012;
        const a1 = ((s + 1) / sectors) * Math.PI * 2 - 0.012;
        const col = palette[(s + rIdx * 2) % palette.length];
        ctxM.fillStyle = col;
        ctxM.beginPath();
        ctxM.arc(half, half, r1 - 2, a0, a1);
        ctxM.arc(half, half, r0 + 2, a1, a0, true);
        ctxM.closePath();
        ctxM.fill();

        const bTone = 170 + Math.floor(rng() * 45);
        ctxB.fillStyle = "rgb(" + bTone + "," + bTone + "," + bTone + ")";
        ctxB.beginPath();
        ctxB.arc(half, half, r1 - 2, a0, a1);
        ctxB.arc(half, half, r0 + 2, a1, a0, true);
        ctxB.closePath();
        ctxB.fill();

        const rTone = 150 + Math.floor(rng() * 55);
        ctxR.fillStyle = "rgb(" + rTone + "," + rTone + "," + rTone + ")";
        ctxR.beginPath();
        ctxR.arc(half, half, r1 - 2, a0, a1);
        ctxR.arc(half, half, r0 + 2, a1, a0, true);
        ctxR.closePath();
        ctxR.fill();
      }
    }

    // 黄铜镶嵌细圈与八芒线
    ctxM.strokeStyle = "#caa062";
    ctxM.lineWidth = 3;
    [72, 158, 248].forEach(function (rad) {
      ctxM.beginPath();
      ctxM.arc(half, half, rad, 0, Math.PI * 2);
      ctxM.stroke();
      ctxR.strokeStyle = "#5a5a5a";
      ctxR.lineWidth = 3;
      ctxR.beginPath();
      ctxR.arc(half, half, rad, 0, Math.PI * 2);
      ctxR.stroke();
    });

    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      ctxM.strokeStyle = "rgba(210, 168, 102, 0.72)";
      ctxM.lineWidth = 2;
      ctxM.beginPath();
      ctxM.moveTo(half + Math.cos(a) * 38, half + Math.sin(a) * 38);
      ctxM.lineTo(half + Math.cos(a) * 248, half + Math.sin(a) * 248);
      ctxM.stroke();
    }

    // 石材表面风化颗粒
    for (let i = 0; i < 1800; i++) {
      const x = rng() * size;
      const y = rng() * size;
      const light = rng() > 0.5;
      ctxM.fillStyle = light ? "rgba(255,248,235,0.06)" : "rgba(18,22,30,0.09)";
      ctxM.fillRect(x, y, 2, 2);
    }

    const set = {
      map: finishTexture(cMap, true, 1, 1),
      bumpMap: finishTexture(cBump, false, 1, 1),
      roughnessMap: finishTexture(cRough, false, 1, 1)
    };
    textureCache[key] = set;
    return set;
  }

  /**
   * 3. 通用风化青苔石板路砖 PBR 纹理（道路、石阶、边沿）
   */
  function createFlagstoneTextureSet(rx, ry, warmBias) {
    const key = "pbr-flag|" + (rx || 1) + "|" + (ry || 1) + "|" + (warmBias ? 1 : 0);
    if (textureCache[key]) return textureCache[key];

    const size = 512;
    const cMap = makeCanvas(size);
    const cBump = makeCanvas(size);
    const cRough = makeCanvas(size);
    const ctxM = cMap.getContext("2d");
    const ctxB = cBump.getContext("2d");
    const ctxR = cRough.getContext("2d");
    const rng = createRng(warmBias ? 88121 : 44503);

    // 砖缝苔土底色
    ctxM.fillStyle = "#3c4a39";
    ctxM.fillRect(0, 0, size, size);
    ctxB.fillStyle = "#383838";
    ctxB.fillRect(0, 0, size, size);
    ctxR.fillStyle = "#e6e6e6";
    ctxR.fillRect(0, 0, size, size);

    const rows = 8;
    const rowH = size / rows;
    for (let r = 0; r < rows; r++) {
      const cols = r % 2 === 0 ? 4 : 5;
      const offset = r % 2 === 0 ? 0 : size * 0.12;
      const colW = size / cols;
      for (let c = -1; c <= cols; c++) {
        const x = c * colW + offset + 3;
        const y = r * rowH + 3;
        const w = colW - 6;
        const h = rowH - 6;

        const base = warmBias
          ? [136 + Math.floor(rng() * 28), 124 + Math.floor(rng() * 22), 112 + Math.floor(rng() * 18)]
          : [106 + Math.floor(rng() * 26), 112 + Math.floor(rng() * 24), 126 + Math.floor(rng() * 24)];
        ctxM.fillStyle = "rgb(" + base[0] + "," + base[1] + "," + base[2] + ")";
        ctxM.beginPath();
        ctxM.roundRect(x, y, w, h, 5);
        ctxM.fill();

        const bVal = 175 + Math.floor(rng() * 55);
        ctxB.fillStyle = "rgb(" + bVal + "," + bVal + "," + bVal + ")";
        ctxB.beginPath();
        ctxB.roundRect(x, y, w, h, 5);
        ctxB.fill();

        const rVal = 148 + Math.floor(rng() * 56);
        ctxR.fillStyle = "rgb(" + rVal + "," + rVal + "," + rVal + ")";
        ctxR.beginPath();
        ctxR.roundRect(x, y, w, h, 5);
        ctxR.fill();

        // 石板内细微风化纹理与裂痕
        if (rng() < 0.55) {
          ctxM.strokeStyle = "rgba(32, 36, 44, 0.25)";
          ctxM.lineWidth = 1.2;
          ctxM.beginPath();
          ctxM.moveTo(x + w * 0.2, y + h * 0.3);
          ctxM.lineTo(x + w * (0.4 + rng() * 0.4), y + h * (0.45 + rng() * 0.35));
          ctxM.stroke();
        }
      }
    }

    // 砖缝点缀翠绿青苔斑
    for (let i = 0; i < 180; i++) {
      const mx = rng() * size;
      const my = Math.round((rng() * rows)) * rowH + (rng() - 0.5) * 6;
      const mr = 2.5 + rng() * 5.5;
      ctxM.fillStyle = rng() < 0.65 ? "rgba(74, 114, 68, 0.58)" : "rgba(104, 138, 82, 0.5)";
      ctxM.beginPath();
      ctxM.arc(mx, my, mr, 0, Math.PI * 2);
      ctxM.fill();
    }

    // 细颗粒噪点
    for (let i = 0; i < 2200; i++) {
      const px = rng() * size;
      const py = rng() * size;
      ctxM.fillStyle = rng() > 0.5 ? "rgba(255,255,255,0.05)" : "rgba(12,16,22,0.08)";
      ctxM.fillRect(px, py, 2, 2);
    }

    const set = {
      map: finishTexture(cMap, true, rx || 1, ry || 1),
      bumpMap: finishTexture(cBump, false, rx || 1, ry || 1),
      roughnessMap: finishTexture(cRough, false, rx || 1, ry || 1)
    };
    textureCache[key] = set;
    return set;
  }

  /**
   * 4. 西侧回声长廊：修道院古典菱格多色大理石地砖 PBR 纹理
   */
  function createCloisterTileTextureSet(rx, ry) {
    const key = "pbr-cloister|" + (rx || 1) + "|" + (ry || 1);
    if (textureCache[key]) return textureCache[key];

    const size = 512;
    const cMap = makeCanvas(size);
    const cBump = makeCanvas(size);
    const cRough = makeCanvas(size);
    const ctxM = cMap.getContext("2d");
    const ctxB = cBump.getContext("2d");
    const ctxR = cRough.getContext("2d");
    const rng = createRng(63719);

    ctxM.fillStyle = "#2d323e";
    ctxM.fillRect(0, 0, size, size);
    ctxB.fillStyle = "#525252";
    ctxB.fillRect(0, 0, size, size);
    ctxR.fillStyle = "#9e9e9e";
    ctxR.fillRect(0, 0, size, size);

    const grid = 8;
    const step = size / grid;
    for (let gy = 0; gy < grid; gy++) {
      for (let gx = 0; gx < grid; gx++) {
        const even = (gx + gy) % 2 === 0;
        const x = gx * step + 2;
        const y = gy * step + 2;
        const s = step - 4;

        if (even) {
          ctxM.fillStyle = "#b8b4aa";
          ctxR.fillStyle = "#888888";
        } else {
          ctxM.fillStyle = (gx + gy) % 4 === 1 ? "#4b5a72" : "#644456";
          ctxR.fillStyle = "#a2a2a2";
        }
        ctxM.fillRect(x, y, s, s);
        ctxR.fillRect(x, y, s, s);

        const bv = 195 + Math.floor(rng() * 35);
        ctxB.fillStyle = "rgb(" + bv + "," + bv + "," + bv + ")";
        ctxB.fillRect(x, y, s, s);

        // 大理石天然细纹
        ctxM.strokeStyle = even ? "rgba(95, 92, 88, 0.22)" : "rgba(210, 220, 238, 0.14)";
        ctxM.lineWidth = 1.2;
        ctxM.beginPath();
        ctxM.moveTo(x + rng() * s * 0.4, y);
        ctxM.bezierCurveTo(
          x + s * 0.5,
          y + s * 0.4,
          x + s * 0.4,
          y + s * 0.7,
          x + s * (0.5 + rng() * 0.4),
          y + s
        );
        ctxM.stroke();
      }
    }

    const set = {
      map: finishTexture(cMap, true, rx || 1, ry || 1),
      bumpMap: finishTexture(cBump, false, rx || 1, ry || 1),
      roughnessMap: finishTexture(cRough, false, rx || 1, ry || 1)
    };
    textureCache[key] = set;
    return set;
  }

  /**
   * 5. 北侧观星钟楼平台：星夜青石 + 镌刻黄铜星轨纹理
   */
  function createNorthPlazaTextureSet() {
    const key = "pbr-north-plaza";
    if (textureCache[key]) return textureCache[key];

    const size = 512;
    const half = size / 2;
    const base = createFlagstoneTextureSet(2, 2, false);
    const cMap = makeCanvas(size);
    const ctxM = cMap.getContext("2d");
    ctxM.drawImage(base.map.image, 0, 0, size, size);

    // 叠加深靛蓝星盘石板调色与黄铜星轨圆环
    ctxM.fillStyle = "rgba(38, 52, 82, 0.28)";
    ctxM.fillRect(0, 0, size, size);

    ctxM.strokeStyle = "rgba(222, 184, 114, 0.65)";
    ctxM.lineWidth = 2.5;
    [76, 138, 198].forEach(function (r) {
      ctxM.beginPath();
      ctxM.arc(half, half, r, 0, Math.PI * 2);
      ctxM.stroke();
    });
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      ctxM.beginPath();
      ctxM.moveTo(half + Math.cos(a) * 76, half + Math.sin(a) * 76);
      ctxM.lineTo(half + Math.cos(a) * 198, half + Math.sin(a) * 198);
      ctxM.stroke();
    }

    const set = {
      map: finishTexture(cMap, true, 1, 1),
      bumpMap: base.bumpMap,
      roughnessMap: base.roughnessMap
    };
    textureCache[key] = set;
    return set;
  }

  /**
   * 6. 南方潮汐栈桥：真实风化旧木板 PBR 纹理
   */
  function createWoodPlankTextureSet(rx, ry) {
    const key = "pbr-wood|" + (rx || 1) + "|" + (ry || 1);
    if (textureCache[key]) return textureCache[key];

    const size = 512;
    const cMap = makeCanvas(size);
    const cBump = makeCanvas(size);
    const cRough = makeCanvas(size);
    const ctxM = cMap.getContext("2d");
    const ctxB = cBump.getContext("2d");
    const ctxR = cRough.getContext("2d");
    const rng = createRng(91237);

    ctxM.fillStyle = "#2b1f1a";
    ctxM.fillRect(0, 0, size, size);
    ctxB.fillStyle = "#2e2e2e";
    ctxB.fillRect(0, 0, size, size);
    ctxR.fillStyle = "#c8c8c8";
    ctxR.fillRect(0, 0, size, size);

    const planks = 12;
    const ph = size / planks;
    for (let p = 0; p < planks; p++) {
      const y = p * ph + 2;
      const h = ph - 4;
      const r = 92 + Math.floor(rng() * 26);
      const g = 68 + Math.floor(rng() * 20);
      const b = 52 + Math.floor(rng() * 16);
      ctxM.fillStyle = "rgb(" + r + "," + g + "," + b + ")";
      ctxM.fillRect(0, y, size, h);

      const bv = 165 + Math.floor(rng() * 45);
      ctxB.fillStyle = "rgb(" + bv + "," + bv + "," + bv + ")";
      ctxB.fillRect(0, y, size, h);

      const rv = 155 + Math.floor(rng() * 45);
      ctxR.fillStyle = "rgb(" + rv + "," + rv + "," + rv + ")";
      ctxR.fillRect(0, y, size, h);

      // 木纹纤维线
      for (let s = 0; s < 16; s++) {
        const sy = y + 3 + rng() * (h - 6);
        ctxM.strokeStyle = rng() > 0.4 ? "rgba(44, 30, 22, 0.35)" : "rgba(138, 108, 84, 0.22)";
        ctxM.lineWidth = 1 + rng() * 1.4;
        ctxM.beginPath();
        ctxM.moveTo(0, sy);
        ctxM.bezierCurveTo(size * 0.33, sy + (rng() - 0.5) * 4, size * 0.66, sy + (rng() - 0.5) * 4, size, sy);
        ctxM.stroke();
      }

      // 两端暗铁铆钉
      [18, size - 18, size * 0.5].forEach(function (nx) {
        ctxM.fillStyle = "#2b2f38";
        ctxM.beginPath();
        ctxM.arc(nx, y + h * 0.3, 2.5, 0, Math.PI * 2);
        ctxM.arc(nx, y + h * 0.7, 2.5, 0, Math.PI * 2);
        ctxM.fill();
      });

      // 潮湿青苔水渍边缘
      if (rng() < 0.45) {
        ctxM.fillStyle = "rgba(62, 92, 66, 0.32)";
        ctxM.fillRect(rng() * (size - 80), y, 60 + rng() * 50, h);
      }
    }

    const set = {
      map: finishTexture(cMap, true, rx || 1, ry || 1),
      bumpMap: finishTexture(cBump, false, rx || 1, ry || 1),
      roughnessMap: finishTexture(cRough, false, rx || 1, ry || 1)
    };
    textureCache[key] = set;
    return set;
  }

  /**
   * 7. 哥特建筑雕凿条石（Ashlar）纹理
   */
  function createAshlarStoneTextureSet(rx, ry, darkMode) {
    const key = "pbr-ashlar|" + (rx || 1) + "|" + (ry || 1) + "|" + (darkMode ? 1 : 0);
    if (textureCache[key]) return textureCache[key];

    const size = 512;
    const cMap = makeCanvas(size);
    const cBump = makeCanvas(size);
    const ctxM = cMap.getContext("2d");
    const ctxB = cBump.getContext("2d");
    const rng = createRng(darkMode ? 7711 : 3391);

    ctxM.fillStyle = darkMode ? "#2a303c" : "#495162";
    ctxM.fillRect(0, 0, size, size);
    ctxB.fillStyle = "#484848";
    ctxB.fillRect(0, 0, size, size);

    const rows = 10;
    const rh = size / rows;
    for (let r = 0; r < rows; r++) {
      const cols = 4;
      const cw = size / cols;
      const off = (r % 2) * (cw * 0.5);
      for (let c = -1; c <= cols; c++) {
        const x = c * cw + off + 2;
        const y = r * rh + 2;
        const w = cw - 4;
        const h = rh - 4;
        const delta = Math.floor((rng() - 0.5) * 20);
        const baseR = (darkMode ? 68 : 112) + delta;
        const baseG = (darkMode ? 74 : 118) + delta;
        const baseB = (darkMode ? 90 : 134) + delta;
        ctxM.fillStyle = "rgb(" + baseR + "," + baseG + "," + baseB + ")";
        ctxM.fillRect(x, y, w, h);

        const bv = 175 + Math.floor(rng() * 45);
        ctxB.fillStyle = "rgb(" + bv + "," + bv + "," + bv + ")";
        ctxB.fillRect(x, y, w, h);
      }
    }

    for (let i = 0; i < 1600; i++) {
      ctxM.fillStyle = rng() > 0.5 ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.07)";
      ctxM.fillRect(rng() * size, rng() * size, 2, 2);
    }

    const set = {
      map: finishTexture(cMap, true, rx || 1, ry || 1),
      bumpMap: finishTexture(cBump, false, rx || 1, ry || 1)
    };
    textureCache[key] = set;
    return set;
  }

  /**
   * 8. 宝石色哥特彩绘玻璃花窗 & 地面投射彩光贴图
   */
  function createStainedGlassTexture(mode) {
    const isProj = mode === "projection";
    const key = "stained-glass|" + (isProj ? "proj" : "win");
    if (textureCache[key]) return textureCache[key];

    const size = 512;
    const half = size / 2;
    const c = makeCanvas(size);
    const ctx = c.getContext("2d");

    ctx.clearRect(0, 0, size, size);

    const jewelColors = [
      "#e03b60", // 宝石红
      "#3f82f0", // 钴蓝
      "#a052d9", // 紫水晶
      "#f2b740", // 琥珀金
      "#2eb486", // 翡翠绿
      "#e85b86"  // 玫瑰粉
    ];

    if (isProj) {
      ctx.filter = "blur(8px)";
    }

    // 16 片辐射彩绘花瓣
    const petals = 16;
    for (let i = 0; i < petals; i++) {
      const a0 = (i / petals) * Math.PI * 2;
      const a1 = ((i + 1) / petals) * Math.PI * 2;
      ctx.fillStyle = jewelColors[i % jewelColors.length];
      ctx.beginPath();
      ctx.moveTo(half, half);
      ctx.arc(half, half, half * 0.9, a0, a1);
      ctx.closePath();
      ctx.fill();

      // 内圈撞色宝石环瓣
      ctx.fillStyle = jewelColors[(i + 2) % jewelColors.length];
      ctx.beginPath();
      ctx.moveTo(half, half);
      ctx.arc(half, half, half * 0.54, a0, a1);
      ctx.closePath();
      ctx.fill();
    }

    // 中心金色太阳花心
    ctx.fillStyle = "#ffd978";
    ctx.beginPath();
    ctx.arc(half, half, half * 0.2, 0, Math.PI * 2);
    ctx.fill();

    if (!isProj) {
      // 窗框黑色铅条分割线
      ctx.strokeStyle = "#181a24";
      ctx.lineWidth = 5;
      for (let i = 0; i < petals; i++) {
        const a = (i / petals) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(half, half);
        ctx.lineTo(half + Math.cos(a) * half * 0.92, half + Math.sin(a) * half * 0.92);
        ctx.stroke();
      }
      [0.2, 0.54, 0.9].forEach(function (ratio) {
        ctx.beginPath();
        ctx.arc(half, half, half * ratio, 0, Math.PI * 2);
        ctx.stroke();
      });
    } else {
      ctx.filter = "none";
      // 地面投射边缘柔化蒙版
      ctx.globalCompositeOperation = "destination-in";
      const mask = ctx.createRadialGradient(half, half, half * 0.15, half, half, half * 0.94);
      mask.addColorStop(0, "rgba(255,255,255,0.92)");
      mask.addColorStop(0.65, "rgba(255,255,255,0.55)");
      mask.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = mask;
      ctx.fillRect(0, 0, size, size);
      ctx.globalCompositeOperation = "source-over";
    }

    const tex = new THREE.CanvasTexture(c);
    tex.encoding = THREE.sRGBEncoding;
    tex.needsUpdate = true;
    textureCache[key] = tex;
    return tex;
  }

  /**
   * 写实接地 3D 披风旅人（双关节短靴精准贴地 y=0 + 浓实多层贴地接触阴影）
   */
  function createCharacter(opts) {
    const cloakHex = (opts && opts.cloakColor) || "#dde5f2";
    const scarfHex = (opts && opts.scarfColor) || "#e5ac73";
    const hasLantern = Boolean(opts && opts.hasLantern);
    const glowTex =
      (opts && opts.glowTex) ||
      createGlowTexture("rgba(255, 208, 138, 0.9)", "rgba(242, 154, 78, 0.22)");

    const group = new THREE.Group();
    const bodyGroup = new THREE.Group();
    group.add(bodyGroup);

    // 地面贴合阴影组（独立于 bodyGroup，可随地形法线倾斜且永不离开地面）
    const shadowGroup = new THREE.Group();
    shadowGroup.position.y = 0.015;
    group.add(shadowGroup);

    const mainShadowMat = new THREE.MeshBasicMaterial({
      map: createShadowTexture(0.84),
      transparent: true,
      opacity: 0.9,
      depthWrite: false
    });
    const mainShadow = new THREE.Mesh(new THREE.PlaneGeometry(1.75, 1.75), mainShadowMat);
    mainShadow.rotation.x = -Math.PI / 2;
    shadowGroup.add(mainShadow);

    const footShadowTex = createShadowTexture(0.88);
    const leftFootShadowMat = new THREE.MeshBasicMaterial({
      map: footShadowTex,
      transparent: true,
      opacity: 0.78,
      depthWrite: false
    });
    const rightFootShadowMat = leftFootShadowMat.clone();

    const leftFootShadow = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.56), leftFootShadowMat);
    leftFootShadow.rotation.x = -Math.PI / 2;
    leftFootShadow.position.set(-0.135, 0.004, 0.04);
    shadowGroup.add(leftFootShadow);

    const rightFootShadow = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.56), rightFootShadowMat);
    rightFootShadow.rotation.x = -Math.PI / 2;
    rightFootShadow.position.set(0.135, 0.004, 0.04);
    shadowGroup.add(rightFootShadow);

    const cloakMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(cloakHex),
      roughness: 0.78,
      metalness: 0.06,
      flatShading: true
    });

    const trimMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(cloakHex).multiplyScalar(0.56),
      roughness: 0.84,
      metalness: 0.08,
      flatShading: true
    });

    const legMat = new THREE.MeshStandardMaterial({
      color: 0x202430,
      roughness: 0.88,
      metalness: 0.08
    });

    const bootMat = new THREE.MeshStandardMaterial({
      color: 0x2a1d17,
      roughness: 0.68,
      metalness: 0.14
    });

    // 双关节腿部 + 真实短靴（静止时靴底精确落于 y = 0.00）
    // hipPivot 在 y=0.50；thigh 长 0.23 -> kneePivot 在 y=-0.23；shin+boot 高 0.27 -> 恰好到 y=0.00
    function buildLeg(xOffset) {
      const hipPivot = new THREE.Group();
      hipPivot.position.set(xOffset, 0.50, 0);

      const thighGeo = new THREE.CylinderGeometry(0.082, 0.072, 0.23, 8);
      thighGeo.translate(0, -0.115, 0);
      const thigh = new THREE.Mesh(thighGeo, legMat);
      thigh.castShadow = true;
      hipPivot.add(thigh);

      const kneePivot = new THREE.Group();
      kneePivot.position.set(0, -0.23, 0);
      hipPivot.add(kneePivot);

      const shinGeo = new THREE.CylinderGeometry(0.07, 0.062, 0.18, 8);
      shinGeo.translate(0, -0.09, 0);
      const shin = new THREE.Mesh(shinGeo, bootMat);
      shin.castShadow = true;
      kneePivot.add(shin);

      // 靴底 + 微翘鞋面
      const bootSole = new THREE.Mesh(new THREE.BoxGeometry(0.145, 0.09, 0.27), bootMat);
      bootSole.position.set(0, -0.225, 0.055);
      bootSole.castShadow = true;
      kneePivot.add(bootSole);

      const bootToe = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.065, 0.11), bootMat);
      bootToe.position.set(0, -0.228, 0.175);
      bootToe.castShadow = true;
      kneePivot.add(bootToe);

      bodyGroup.add(hipPivot);
      return { hipPivot: hipPivot, kneePivot: kneePivot };
    }

    const leftLegRig = buildLeg(-0.135);
    const rightLegRig = buildLeg(0.135);

    // 2. 锥形哥特斗篷轮廓（下摆在 y=0.33，清晰露出双靴与踏步）
    const cloakPts = [
      new THREE.Vector2(0.0, 1.48),
      new THREE.Vector2(0.26, 1.46),
      new THREE.Vector2(0.35, 1.26),
      new THREE.Vector2(0.41, 0.88),
      new THREE.Vector2(0.48, 0.36),
      new THREE.Vector2(0.44, 0.33)
    ];
    const cloakGeo = new THREE.LatheGeometry(cloakPts, 10);
    const cloak = new THREE.Mesh(cloakGeo, cloakMat);
    cloak.castShadow = true;
    cloak.receiveShadow = true;
    bodyGroup.add(cloak);

    // 斗篷肩披装饰领
    const mantleGeo = new THREE.ConeGeometry(0.42, 0.42, 10, 1, true);
    const mantle = new THREE.Mesh(mantleGeo, trimMat);
    mantle.position.y = 1.30;
    mantle.castShadow = true;
    bodyGroup.add(mantle);

    // 3. 头部与兜帽
    const headMat = new THREE.MeshStandardMaterial({
      color: 0xf6efe6,
      roughness: 0.65,
      metalness: 0.04
    });
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.21, 14, 12), headMat);
    head.position.set(0, 1.64, 0.03);
    head.castShadow = true;
    bodyGroup.add(head);

    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffdfaa });
    const eyeGeo = new THREE.SphereGeometry(0.026, 8, 8);
    const eyeL = new THREE.Mesh(eyeGeo, eyeMat);
    eyeL.position.set(-0.07, 1.65, 0.22);
    const eyeR = new THREE.Mesh(eyeGeo, eyeMat);
    eyeR.position.set(0.07, 1.65, 0.22);
    bodyGroup.add(eyeL, eyeR);

    const hoodGroup = new THREE.Group();
    hoodGroup.position.set(0, 1.65, -0.02);
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

    // 4. 随风飘动的分段围巾
    const scarfMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(scarfHex),
      roughness: 0.76,
      metalness: 0.05,
      flatShading: true
    });
    const scarfSegments = [];
    let parentJoint = bodyGroup;
    for (let i = 0; i < 4; i++) {
      const segPivot = new THREE.Group();
      if (i === 0) {
        segPivot.position.set(0.08, 1.44, -0.22);
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
      lanternPivot.position.set(0.42, 0.98, 0.20);

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
      shadowGroup,
      mainShadow,
      leftFootShadow,
      rightFootShadow,
      leftLegRig,
      rightLegRig,
      cloak,
      lanternPivot,
      scarfSegments
    };
  }

  /**
   * 极简写实接地步态：支撑脚踩实 + 摆动脚屈膝迈步 + 落步重心微沉（绝不悬浮）
   */
  function animateCharacter(rig, dt, speedRatio, elapsed) {
    if (!rig) return;
    const clampedSpeed = Math.max(0, Math.min(1, speedRatio || 0));
    const isMoving = clampedSpeed > 0.06;
    const strideFreq = 7.8;
    const amp = isMoving ? clampedSpeed : 0;

    const phaseL = elapsed * strideFreq;
    const phaseR = phaseL + Math.PI;

    function applyLegCycle(legRig, footShadow, phase) {
      const s = Math.sin(phase);
      const c = Math.cos(phase);
      // 向前摆动角（负值抬腿向前，正值向后蹬地）
      const hipAng = -s * 0.56 * amp;
      // 摆动相屈膝抬脚，支撑相膝盖几乎伸直踩实地面
      const kneeBend = s > 0 ? s * 0.68 * amp : Math.max(0, -c) * 0.12 * amp;

      legRig.hipPivot.rotation.x += (hipAng - legRig.hipPivot.rotation.x) * Math.min(1, dt * 16);
      legRig.kneePivot.rotation.x += (kneeBend - legRig.kneePivot.rotation.x) * Math.min(1, dt * 16);

      // 脚底独立接地阴影跟随摆幅前后移动与浓淡变化
      const targetZ = 0.04 + s * 0.25 * amp;
      const onGround = s <= 0.1 ? 1 : Math.max(0.28, 1 - s * 0.65);
      footShadow.position.z += (targetZ - footShadow.position.z) * Math.min(1, dt * 18);
      footShadow.material.opacity = isMoving ? 0.22 + 0.58 * onGround : 0.78;
      const sc = isMoving ? 0.72 + 0.32 * onGround : 1.0;
      footShadow.scale.set(sc, sc, 1);
    }

    applyLegCycle(rig.leftLegRig, rig.leftFootShadow, phaseL);
    applyLegCycle(rig.rightLegRig, rig.rightFootShadow, phaseR);

    // 落步时重心向下微沉（绝不往上浮起）
    const doubleStepSink = isMoving ? -Math.abs(Math.cos(phaseL)) * 0.032 * amp : Math.sin(elapsed * 1.6) * 0.008;
    rig.bodyGroup.position.y += (doubleStepSink - rig.bodyGroup.position.y) * Math.min(1, dt * 16);

    // 行走前倾与微弱重心左右转移
    const targetLeanX = isMoving ? 0.055 * amp : 0;
    const targetSwayZ = isMoving ? Math.sin(phaseL) * 0.025 * amp : 0;
    rig.bodyGroup.rotation.x += (targetLeanX - rig.bodyGroup.rotation.x) * Math.min(1, dt * 12);
    rig.bodyGroup.rotation.z += (targetSwayZ - rig.bodyGroup.rotation.z) * Math.min(1, dt * 12);

    // 围巾随微风与步伐飘摆
    const windBase = 0.22 + clampedSpeed * 0.5;
    rig.scarfSegments.forEach(function (seg, idx) {
      const wave = Math.sin(elapsed * (3.0 + clampedSpeed * 4.2) - idx * 0.85);
      seg.rotation.x = -0.22 + windBase * 0.16 + wave * (0.08 + idx * 0.032);
      seg.rotation.y = Math.cos(elapsed * 2.1 - idx * 0.6) * (0.07 + clampedSpeed * 0.08);
    });

    if (rig.lanternPivot) {
      rig.lanternPivot.rotation.x = Math.sin(elapsed * 3.1) * (0.05 + clampedSpeed * 0.2);
      rig.lanternPivot.rotation.z = Math.cos(elapsed * 2.4) * 0.05;
    }
  }

  /**
   * 哥特尖拱门（柱墩 + 尖拱框 + 拱肩宝石小彩窗点缀）
   */
  function createGothicArch(width, height, thickness, stoneMat, trimMat, accentGlassMat) {
    const group = new THREE.Group();
    const halfW = width / 2;
    const pillarW = Math.max(0.55, width * 0.16);
    const springY = height * 0.54;
    const innerHalfW = halfW - pillarW;

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

    const archShape = new THREE.Shape();
    archShape.moveTo(-halfW, springY);
    archShape.lineTo(-halfW, height * 0.86);
    archShape.quadraticCurveTo(-halfW * 0.55, height * 1.02, 0, height * 1.07);
    archShape.quadraticCurveTo(halfW * 0.55, height * 1.02, halfW, height * 0.86);
    archShape.lineTo(halfW, springY);

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

    if (accentGlassMat) {
      const medallion = new THREE.Mesh(new THREE.OctahedronGeometry(0.26, 0), accentGlassMat);
      medallion.position.set(0, height * 1.01, 0);
      group.add(medallion);
    }

    return group;
  }

  /**
   * 宝石彩绘哥特玫瑰窗（辐射石窗棂 + 宝石色彩绘玻璃）
   */
  function createRoseWindow(radius, stoneMat) {
    const group = new THREE.Group();
    const stainedTex = createStainedGlassTexture("window");
    const stainedMat = new THREE.MeshStandardMaterial({
      map: stainedTex,
      emissive: new THREE.Color(0xffffff),
      emissiveMap: stainedTex,
      emissiveIntensity: 1.08,
      roughness: 0.22,
      metalness: 0.08
    });

    const glassDisc = new THREE.Mesh(new THREE.CircleGeometry(radius * 0.95, 28), stainedMat);
    glassDisc.position.z = -0.04;
    group.add(glassDisc);

    const outerRing = new THREE.Mesh(new THREE.TorusGeometry(radius, radius * 0.095, 8, 28), stoneMat);
    group.add(outerRing);

    const midRing = new THREE.Mesh(new THREE.TorusGeometry(radius * 0.56, radius * 0.05, 6, 22), stoneMat);
    group.add(midRing);

    const innerRing = new THREE.Mesh(new THREE.TorusGeometry(radius * 0.24, radius * 0.04, 6, 16), stoneMat);
    group.add(innerRing);

    for (let i = 0; i < 8; i++) {
      const spoke = new THREE.Mesh(
        new THREE.BoxGeometry(radius * 0.055, radius * 1.92, 0.22),
        stoneMat
      );
      spoke.rotation.z = (i * Math.PI) / 4;
      group.add(spoke);
    }

    return group;
  }

  /**
   * 北方观星钟楼与哥特修道院立面
   */
  function createBellTower(stoneMat, darkStoneMat, roofMat, glassMat, glowTex) {
    const group = new THREE.Group();

    const basePlinth = new THREE.Mesh(new THREE.BoxGeometry(11.6, 1.4, 9.6), darkStoneMat);
    basePlinth.position.y = 0.7;
    basePlinth.castShadow = true;
    basePlinth.receiveShadow = true;
    group.add(basePlinth);

    const towerBody = new THREE.Mesh(new THREE.BoxGeometry(9.2, 13.5, 7.8), stoneMat);
    towerBody.position.y = 7.45;
    towerBody.castShadow = true;
    towerBody.receiveShadow = true;
    group.add(towerBody);

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

    const portal = createGothicArch(4.4, 5.2, 1.1, darkStoneMat, stoneMat, glassMat);
    portal.position.set(0, 0, 4.1);
    group.add(portal);

    const rose = createRoseWindow(2.25, darkStoneMat);
    rose.position.set(0, 9.8, 4.02);
    group.add(rose);

    const roseHalo = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glowTex,
        color: 0xd0b0ff,
        transparent: true,
        opacity: 0.45,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      })
    );
    roseHalo.position.set(0, 9.8, 4.35);
    roseHalo.scale.set(9.8, 9.8, 1);
    group.add(roseHalo);

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
        opacity: 0.72,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      })
    );
    halo.position.set(0.45, topY - 0.28, 0);
    halo.scale.set(2.8, 2.8, 1);
    group.add(halo);

    return group;
  }

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
   * 暖金银杏树（为哥特秘境庭园带来秋季暖金色彩层次）
   */
  function createGinkgoTree(scale, trunkMat) {
    const group = new THREE.Group();
    const swayPivot = new THREE.Group();
    group.add(swayPivot);

    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.28, 2.4, 7), trunkMat);
    trunk.position.y = 1.2;
    trunk.castShadow = true;
    swayPivot.add(trunk);

    const goldMat = new THREE.MeshStandardMaterial({ color: 0xe3a83c, roughness: 0.84, flatShading: true });
    const amberMat = new THREE.MeshStandardMaterial({ color: 0xf0c75e, roughness: 0.8, flatShading: true });
    const bronzeMat = new THREE.MeshStandardMaterial({ color: 0xc97b32, roughness: 0.86, flatShading: true });

    const puffs = [
      { x: 0, y: 3.4, z: 0, r: 1.35, mat: goldMat },
      { x: -0.75, y: 2.9, z: 0.45, r: 0.92, mat: amberMat },
      { x: 0.78, y: 3.0, z: -0.35, r: 0.95, mat: bronzeMat },
      { x: 0.15, y: 4.15, z: 0.2, r: 0.85, mat: amberMat }
    ];
    puffs.forEach(function (p) {
      const m = new THREE.Mesh(new THREE.DodecahedronGeometry(p.r, 0), p.mat);
      m.position.set(p.x, p.y, p.z);
      m.castShadow = true;
      m.receiveShadow = true;
      swayPivot.add(m);
    });

    // 树下散落金色银杏落叶毯（柔和渐隐边缘纹理）
    const leafKey = "ginkgo-leaf-rug";
    if (!textureCache[leafKey]) {
      const lc = makeCanvas(128);
      const lctx = lc.getContext("2d");
      const lRng = createRng(55123);
      const lg = lctx.createRadialGradient(64, 64, 6, 64, 64, 60);
      lg.addColorStop(0, "rgba(186, 128, 36, 0.55)");
      lg.addColorStop(0.55, "rgba(176, 118, 32, 0.25)");
      lg.addColorStop(1, "rgba(176, 118, 32, 0)");
      lctx.fillStyle = lg;
      lctx.fillRect(0, 0, 128, 128);
      for (let i = 0; i < 65; i++) {
        const a = lRng() * Math.PI * 2;
        const d = Math.sqrt(lRng()) * 52;
        lctx.fillStyle = lRng() > 0.4 ? "rgba(228, 174, 62, 0.78)" : "rgba(196, 128, 42, 0.72)";
        lctx.beginPath();
        lctx.ellipse(64 + Math.cos(a) * d, 64 + Math.sin(a) * d, 3.2, 1.8, a, 0, Math.PI * 2);
        lctx.fill();
      }
      const lTex = new THREE.CanvasTexture(lc);
      lTex.encoding = THREE.sRGBEncoding;
      textureCache[leafKey] = lTex;
    }
    const leafPatch = new THREE.Mesh(
      new THREE.PlaneGeometry(3.4, 3.4),
      new THREE.MeshBasicMaterial({
        map: textureCache[leafKey],
        transparent: true,
        depthWrite: false
      })
    );
    leafPatch.rotation.x = -Math.PI / 2;
    leafPatch.position.y = 0.04;
    group.add(leafPatch);

    group.scale.setScalar(scale || 1);
    return { group: group, swayPivot: swayPivot };
  }

  /**
   * 哥特深红 / 绯粉蔷薇花丛
   */
  function createRoseBush(scale, variant) {
    const group = new THREE.Group();
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x264836, roughness: 0.86, flatShading: true });
    const leafDark = new THREE.MeshStandardMaterial({ color: 0x1a3528, roughness: 0.88, flatShading: true });

    const mounds = [
      { x: 0, y: 0.34, z: 0, r: 0.52, m: leafMat },
      { x: -0.32, y: 0.26, z: 0.22, r: 0.38, m: leafDark },
      { x: 0.34, y: 0.28, z: -0.18, r: 0.4, m: leafMat }
    ];
    mounds.forEach(function (b) {
      const mesh = new THREE.Mesh(new THREE.DodecahedronGeometry(b.r, 0), b.m);
      mesh.position.set(b.x, b.y, b.z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
    });

    const flowerHex = variant === "pink" ? 0xe85a7a : variant === "wine" ? 0x9c1e3a : 0xd62e50;
    const flowerMat = new THREE.MeshStandardMaterial({
      color: flowerHex,
      emissive: flowerHex,
      emissiveIntensity: 0.14,
      roughness: 0.65,
      flatShading: true
    });
    const blooms = [
      [0, 0.72, 0.14],
      [-0.3, 0.54, 0.34],
      [0.32, 0.58, -0.04],
      [0.14, 0.62, 0.38],
      [-0.18, 0.66, -0.22]
    ];
    blooms.forEach(function (bp) {
      const fl = new THREE.Mesh(new THREE.IcosahedronGeometry(0.11, 0), flowerMat);
      fl.position.set(bp[0], bp[1], bp[2]);
      group.add(fl);
    });

    group.scale.setScalar(scale || 1);
    return group;
  }

  /**
   * 夜光蓝紫鸢尾 / 薰衣草花穗丛
   */
  function createIrisCluster(scale, palette) {
    const group = new THREE.Group();
    const bladeMat = new THREE.MeshStandardMaterial({ color: 0x2c5246, roughness: 0.85, flatShading: true });
    const colors =
      palette === "cobalt"
        ? [0x4c82f2, 0x709ef8]
        : palette === "lavender"
        ? [0x9268ec, 0xb896fa]
        : [0x6e60e8, 0xa876f2];

    for (let i = 0; i < 6; i++) {
      const ang = (i / 6) * Math.PI * 2 + (i % 2) * 0.2;
      const dist = 0.16 + (i % 3) * 0.09;
      const bx = Math.cos(ang) * dist;
      const bz = Math.sin(ang) * dist;

      const blade = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.56, 4), bladeMat);
      blade.position.set(bx, 0.27, bz);
      blade.rotation.z = -Math.cos(ang) * 0.24;
      blade.rotation.x = Math.sin(ang) * 0.24;
      group.add(blade);

      if (i % 2 === 0 || i < 4) {
        const fColor = colors[i % colors.length];
        const fMat = new THREE.MeshStandardMaterial({
          color: fColor,
          emissive: fColor,
          emissiveIntensity: 0.22,
          roughness: 0.6
        });
        const blossom = new THREE.Mesh(new THREE.OctahedronGeometry(0.095, 0), fMat);
        blossom.position.set(bx * 1.15, 0.54 + (i % 2) * 0.1, bz * 1.15);
        blossom.scale.set(0.85, 1.45, 0.85);
        group.add(blossom);
      }
    }

    group.scale.setScalar(scale || 1);
    return group;
  }

  /**
   * 矮石座暖光蜂蜡烛群（精致哥特氛围点缀）
   */
  function createCandleShrine(stoneMat) {
    const group = new THREE.Group();
    const plinth = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.44, 0.24, 6), stoneMat);
    plinth.position.y = 0.12;
    plinth.castShadow = true;
    plinth.receiveShadow = true;
    group.add(plinth);

    const waxMat = new THREE.MeshStandardMaterial({ color: 0xf4ead4, roughness: 0.7 });
    const flameMat = new THREE.MeshBasicMaterial({ color: 0xffd17a });
    const candles = [
      { x: 0, z: 0, h: 0.42 },
      { x: -0.15, z: 0.12, h: 0.28 },
      { x: 0.16, z: -0.1, h: 0.34 }
    ];
    candles.forEach(function (c) {
      const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, c.h, 6), waxMat);
      stick.position.set(c.x, 0.24 + c.h / 2, c.z);
      group.add(stick);

      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.032, 0.09, 5), flameMat);
      flame.position.set(c.x, 0.24 + c.h + 0.05, c.z);
      group.add(flame);
    });
    return group;
  }

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

  function createGothicPier(stoneMat, woodMat, ironMat, glowMat, glowTex) {
    const group = new THREE.Group();

    // 栈桥木栈道（顶面精确位于 y = 0.28）
    const deck = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.44, 18), woodMat);
    deck.position.set(0, 0.06, 52);
    deck.receiveShadow = true;
    deck.castShadow = true;
    group.add(deck);

    // 栈桥石桩柱
    [-2.4, 2.4].forEach(function (px) {
      [45, 52, 59].forEach(function (pz) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.28, 2.2, 8), stoneMat);
        post.position.set(px, -0.38, pz);
        post.castShadow = true;
        group.add(post);
      });
    });

    const endLantern = createGothicLantern(3.1, ironMat, glowMat, glowTex);
    endLantern.position.set(2.3, 0.28, 59.8);
    endLantern.rotation.y = Math.PI;
    group.add(endLantern);

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

    return { group: group, deck: deck, bottleGroup: bottleGroup };
  }

  Oublier.Models3D = {
    createGlowTexture,
    createTextSprite,
    createTurfTextureSet,
    createCourtyardMosaicTextureSet,
    createFlagstoneTextureSet,
    createCloisterTileTextureSet,
    createNorthPlazaTextureSet,
    createWoodPlankTextureSet,
    createAshlarStoneTextureSet,
    createStainedGlassTexture,
    createCharacter,
    animateCharacter,
    createGothicArch,
    createRoseWindow,
    createBellTower,
    createGothicLantern,
    createCypressTree,
    createGinkgoTree,
    createRoseBush,
    createIrisCluster,
    createCandleShrine,
    createBrazier,
    createGothicPier
  };
})(window);
