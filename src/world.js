(function (global) {
  "use strict";

  const Oublier = (global.Oublier = global.Oublier || {});

  let canvas = null;
  let ctx = null;
  let width = 1280;
  let height = 720;
  let dpr = 1;
  let worldScale = 1;

  let running = false;
  let lastTime = 0;
  let elapsed = 0;

  let currentMoodId = "midnight";
  let extraStarsCount = 0;

  const camera = { x: 0, y: 15 };

  const player = {
    x: 0,
    y: 88,
    vx: 0,
    vy: 0,
    speed: 138,
    facing: 1,
    stepTimer: 0,
    target: null,
    pendingAction: null
  };

  const keys = Object.create(null);
  let pointerWorld = null;
  let hoveredTarget = null;
  let nearbyTarget = null;

  let callbacks = {
    onInteractLandmark: function () {},
    onInteractTraveler: function () {},
    onNearbyChange: function () {},
    isInputBlocked: function () {
      return false;
    }
  };

  const stars = [];
  const shootingStars = [];
  const fireflies = [];
  const raindrops = [];
  const embers = [];
  const footsteps = [];
  const ripples = [];
  const floatingTexts = [];
  const flyingBottles = [];
  const pineTrees = [];
  const pebbles = [];

  let travelers = [];

  function islandRadius(angle) {
    return (
      258 +
      24 * Math.cos(angle * 2 - 0.5) +
      16 * Math.sin(angle * 3 + 0.9) +
      10 * Math.cos(angle * 5 - 1.2)
    );
  }

  function isInsideIsland(x, y, margin) {
    const r = Math.hypot(x, y);
    const angle = Math.atan2(y, x);
    return r <= islandRadius(angle) - (margin || 0);
  }

  function clampToIsland(x, y, margin) {
    const angle = Math.atan2(y, x);
    const maxR = islandRadius(angle) - (margin || 20);
    const r = Math.hypot(x, y);
    if (r <= maxR) return { x: x, y: y };
    return {
      x: Math.cos(angle) * maxR,
      y: Math.sin(angle) * maxR
    };
  }

  function initDecor() {
    stars.length = 0;
    for (let i = 0; i < 150; i++) {
      stars.push({
        x: Math.random(),
        y: Math.random(),
        r: 0.6 + Math.random() * 1.5,
        phase: Math.random() * Math.PI * 2,
        speed: 0.7 + Math.random() * 1.8
      });
    }

    fireflies.length = 0;
    for (let i = 0; i < 24; i++) {
      const a = Math.random() * Math.PI * 2;
      const dist = 35 + Math.random() * 185;
      fireflies.push({
        baseX: Math.cos(a) * dist,
        baseY: Math.sin(a) * dist,
        phase: Math.random() * Math.PI * 2,
        speed: 0.5 + Math.random() * 0.9,
        size: 1.5 + Math.random() * 1.8
      });
    }

    raindrops.length = 0;
    for (let i = 0; i < 130; i++) {
      raindrops.push({
        x: Math.random() * 1600,
        y: Math.random() * 1000,
        len: 10 + Math.random() * 14,
        speed: 440 + Math.random() * 200
      });
    }

    pineTrees.length = 0;
    const candidateAngles = [
      -2.75, -2.42, -2.05, -1.15, -0.82, -0.46, -0.1, 0.25, 0.7, 2.35, 2.75, 3.05
    ];
    candidateAngles.forEach(function (ang, idx) {
      const r = islandRadius(ang) - (46 + (idx % 3) * 18);
      pineTrees.push({
        x: Math.cos(ang) * r,
        y: Math.sin(ang) * r,
        scale: 0.85 + (idx % 3) * 0.16,
        swayOffset: idx * 0.7
      });
    });
    // 长椅旁的两棵守护松树
    pineTrees.push({ x: 204, y: -58, scale: 1.12, swayOffset: 1.1 });
    pineTrees.push({ x: 152, y: -62, scale: 0.92, swayOffset: 2.3 });

    pebbles.length = 0;
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2 + 0.12;
      const r = islandRadius(a) - 18 - (i % 4) * 5;
      pebbles.push({
        x: Math.cos(a) * r,
        y: Math.sin(a) * r,
        rx: 3 + (i % 3) * 1.6,
        ry: 2 + (i % 2) * 1.1
      });
    }

    travelers = Oublier.Data.TRAVELERS.map(function (t, i) {
      return Object.assign({}, t, {
        x: t.home.x,
        y: t.home.y,
        targetX: t.home.x,
        targetY: t.home.y,
        waitTimer: 1.5 + i * 1.3,
        phase: i * 1.9
      });
    });
  }

  function resize() {
    if (!canvas) return;
    dpr = Math.min(global.devicePixelRatio || 1, 2);
    width = global.innerWidth || 1280;
    height = global.innerHeight || 720;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = width + "px";
    canvas.style.height = height + "px";
    worldScale = Math.max(0.72, Math.min(1.08, Math.min(width / 700, height / 620)));
  }

  function screenToWorld(sx, sy) {
    return {
      x: (sx - width / 2) / worldScale + camera.x,
      y: (sy - height / 2) / worldScale + camera.y
    };
  }

  function findHitTarget(wx, wy) {
    for (let i = 0; i < travelers.length; i++) {
      const t = travelers[i];
      if (Math.hypot(wx - t.x, wy - t.y) <= 28) {
        return { kind: "traveler", item: t, x: t.x, y: t.y };
      }
    }
    const landmarks = Oublier.Data.LANDMARKS;
    for (let i = 0; i < landmarks.length; i++) {
      const lm = landmarks[i];
      if (Math.hypot(wx - lm.x, wy - lm.y) <= 44) {
        return { kind: "landmark", item: lm, x: lm.x, y: lm.y };
      }
    }
    return null;
  }

  function findClosestInteractive() {
    let best = null;
    let bestDist = Infinity;

    Oublier.Data.LANDMARKS.forEach(function (lm) {
      const d = Math.hypot(player.x - lm.x, player.y - lm.y);
      if (d <= lm.radius && d < bestDist) {
        bestDist = d;
        best = { kind: "landmark", item: lm };
      }
    });

    travelers.forEach(function (t) {
      const d = Math.hypot(player.x - t.x, player.y - t.y);
      if (d <= 60 && d < bestDist) {
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

  function handleCanvasClick(clientX, clientY) {
    if (callbacks.isInputBlocked()) return;
    const wPos = screenToWorld(clientX, clientY);
    const hit = findHitTarget(wPos.x, wPos.y);

    if (hit) {
      const dist = Math.hypot(player.x - hit.x, player.y - hit.y);
      const triggerRange = hit.kind === "landmark" ? hit.item.radius - 6 : 54;
      if (dist <= triggerRange) {
        triggerTarget(hit);
        return;
      }
      const clamped = clampToIsland(hit.x, hit.y, 18);
      player.target = { x: clamped.x, y: clamped.y };
      player.pendingAction = hit;
      ripples.push({ x: hit.x, y: hit.y, r: 6, maxR: 34, alpha: 0.85, color: "#f2b073" });
      return;
    }

    const clamped = clampToIsland(wPos.x, wPos.y, 18);
    player.target = clamped;
    player.pendingAction = null;
    ripples.push({ x: clamped.x, y: clamped.y, r: 4, maxR: 28, alpha: 0.65, color: "#9ac6f4" });
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

    canvas.addEventListener("mousemove", function (e) {
      const rect = canvas.getBoundingClientRect();
      pointerWorld = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
      hoveredTarget = findHitTarget(pointerWorld.x, pointerWorld.y);
      canvas.style.cursor = hoveredTarget ? "pointer" : "default";
    });

    canvas.addEventListener("mouseleave", function () {
      pointerWorld = null;
      hoveredTarget = null;
    });

    canvas.addEventListener("click", function (e) {
      const rect = canvas.getBoundingClientRect();
      handleCanvasClick(e.clientX - rect.left, e.clientY - rect.top);
    });
  }

  function updatePlayer(dt) {
    let dx = 0;
    let dy = 0;

    if (!callbacks.isInputBlocked()) {
      if (keys.KeyW || keys.ArrowUp) dy -= 1;
      if (keys.KeyS || keys.ArrowDown) dy += 1;
      if (keys.KeyA || keys.ArrowLeft) dx -= 1;
      if (keys.KeyD || keys.ArrowRight) dx += 1;
    }

    let moving = false;

    if (dx !== 0 || dy !== 0) {
      const len = Math.hypot(dx, dy);
      dx /= len;
      dy /= len;
      player.vx = dx * player.speed;
      player.vy = dy * player.speed;
      moving = true;
    } else if (player.target) {
      const tx = player.target.x - player.x;
      const ty = player.target.y - player.y;
      const dist = Math.hypot(tx, ty);
      const stopDist = player.pendingAction ? 34 : 6;
      if (dist <= stopDist) {
        const pending = player.pendingAction;
        player.target = null;
        player.pendingAction = null;
        player.vx = 0;
        player.vy = 0;
        if (pending) {
          triggerTarget(pending);
        }
      } else {
        player.vx = (tx / dist) * player.speed;
        player.vy = (ty / dist) * player.speed;
        moving = true;
      }
    } else {
      player.vx *= 0.8;
      player.vy *= 0.8;
    }

    if (moving) {
      const nextX = player.x + player.vx * dt;
      const nextY = player.y + player.vy * dt;
      const clamped = clampToIsland(nextX, nextY, 16);
      player.x = clamped.x;
      player.y = clamped.y;
      if (Math.abs(player.vx) > 6) {
        player.facing = player.vx >= 0 ? 1 : -1;
      }
      player.stepTimer += dt;
      if (player.stepTimer >= 0.24) {
        player.stepTimer = 0;
        footsteps.push({ x: player.x, y: player.y + 8, alpha: 0.45, r: 2.6 });
      }
    }

    // 栈桥木板允许略微向外延伸
    if (Math.abs(player.x) < 26 && player.y > 190 && player.y < 248) {
      // keep within pier bounds smoothly
    }

    // 相机柔顺跟随
    const targetCamX = player.x * 0.48;
    const targetCamY = player.y * 0.42;
    camera.x += (targetCamX - camera.x) * Math.min(1, dt * 3.5);
    camera.y += (targetCamY - camera.y) * Math.min(1, dt * 3.5);

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
      const dy = t.targetY - t.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 3) {
        const spd = 24;
        t.x += (dx / dist) * spd * dt;
        t.y += (dy / dist) * spd * dt;
      } else {
        t.waitTimer -= dt;
        if (t.waitTimer <= 0) {
          t.waitTimer = 3.5 + Math.random() * 5;
          const a = Math.random() * Math.PI * 2;
          const r = Math.random() * t.patrolRadius;
          const candidate = clampToIsland(t.home.x + Math.cos(a) * r, t.home.y + Math.sin(a) * r, 24);
          t.targetX = candidate.x;
          t.targetY = candidate.y;
        }
      }
    });
  }

  function updateParticles(dt) {
    const mood = Oublier.Data.MOODS[currentMoodId] || Oublier.Data.MOODS.midnight;

    // 篝火常驻火星
    if (Math.random() < dt * 11) {
      embers.push({
        x: (Math.random() - 0.5) * 16,
        y: 6,
        vx: (Math.random() - 0.5) * 18,
        vy: -26 - Math.random() * 34,
        life: 0,
        maxLife: 1.4 + Math.random() * 1.2,
        size: 1.4 + Math.random() * 2.1,
        color: Math.random() > 0.35 ? "#ffbd6b" : "#ff7e47"
      });
    }

    for (let i = embers.length - 1; i >= 0; i--) {
      const e = embers[i];
      e.life += dt;
      e.x += (e.vx + Math.sin(elapsed * 2 + i) * 7) * dt;
      e.y += e.vy * dt;
      if (e.life >= e.maxLife) {
        embers.splice(i, 1);
      }
    }

    for (let i = footsteps.length - 1; i >= 0; i--) {
      footsteps[i].alpha -= dt * 0.25;
      if (footsteps[i].alpha <= 0) footsteps.splice(i, 1);
    }

    for (let i = ripples.length - 1; i >= 0; i--) {
      const rp = ripples[i];
      rp.r += dt * 42;
      rp.alpha -= dt * 1.1;
      if (rp.alpha <= 0 || rp.r >= rp.maxR) ripples.splice(i, 1);
    }

    for (let i = floatingTexts.length - 1; i >= 0; i--) {
      const ft = floatingTexts[i];
      ft.life += dt;
      ft.y -= dt * 24;
      ft.x += Math.sin(ft.life * 2.2) * dt * 8;
      if (ft.life >= ft.maxLife) floatingTexts.splice(i, 1);
    }

    for (let i = flyingBottles.length - 1; i >= 0; i--) {
      const fb = flyingBottles[i];
      fb.t += dt / fb.duration;
      if (fb.t >= 1) {
        ripples.push({ x: fb.endX, y: fb.endY, r: 4, maxR: 48, alpha: 0.9, color: "#9ee2ff" });
        flyingBottles.splice(i, 1);
      }
    }

    // 雨滴
    if (mood.rainIntensity > 0) {
      raindrops.forEach(function (rd) {
        rd.x -= rd.speed * 0.22 * dt;
        rd.y += rd.speed * dt;
        if (rd.y > height + 30 || rd.x < -30) {
          rd.x = Math.random() * (width + 240);
          rd.y = -20 - Math.random() * 120;
        }
      });
    }

    // 偶尔流星
    if (mood.starAlpha > 0.3 && Math.random() < dt * 0.16) {
      shootingStars.push({
        x: Math.random() * width * 0.8 + width * 0.1,
        y: Math.random() * height * 0.32,
        vx: -280 - Math.random() * 140,
        vy: 110 + Math.random() * 70,
        life: 0,
        maxLife: 0.75
      });
    }

    for (let i = shootingStars.length - 1; i >= 0; i--) {
      const s = shootingStars[i];
      s.life += dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      if (s.life >= s.maxLife) shootingStars.splice(i, 1);
    }
  }

  function drawSkyAndSea(mood) {
    const skyGrad = ctx.createLinearGradient(0, 0, 0, height);
    skyGrad.addColorStop(0, mood.skyTop);
    skyGrad.addColorStop(0.55, mood.skyBottom);
    skyGrad.addColorStop(1, mood.seaOuter);
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, width, height);

    // 星空
    if (mood.starAlpha > 0.05) {
      const totalStars = Math.min(stars.length, 95 + extraStarsCount * 4);
      for (let i = 0; i < totalStars; i++) {
        const s = stars[i];
        const twinkle = 0.45 + 0.55 * Math.sin(elapsed * s.speed + s.phase);
        const alpha = mood.starAlpha * twinkle;
        ctx.fillStyle = "rgba(235, 243, 255, " + alpha.toFixed(3) + ")";
        ctx.beginPath();
        ctx.arc(s.x * width, s.y * height * 0.78, s.r, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // 流星
    shootingStars.forEach(function (s) {
      const progress = s.life / s.maxLife;
      const alpha = Math.sin(progress * Math.PI) * 0.85;
      const grad = ctx.createLinearGradient(s.x, s.y, s.x - s.vx * 0.16, s.y - s.vy * 0.16);
      grad.addColorStop(0, "rgba(255, 246, 224, " + alpha + ")");
      grad.addColorStop(1, "rgba(255, 246, 224, 0)");
      ctx.strokeStyle = grad;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(s.x - s.vx * 0.16, s.y - s.vy * 0.16);
      ctx.stroke();
    });
  }

  function traceIslandPath(scaleFactor, offsetY) {
    const steps = 96;
    ctx.beginPath();
    for (let i = 0; i <= steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      const r = islandRadius(a) * scaleFactor;
      const px = Math.cos(a) * r;
      const py = Math.sin(a) * r + (offsetY || 0);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
  }

  function drawIsland(mood) {
    // 海水光晕
    const seaHalo = ctx.createRadialGradient(0, 0, 120, 0, 0, 520);
    seaHalo.addColorStop(0, mood.seaInner);
    seaHalo.addColorStop(1, "rgba(8, 16, 32, 0)");
    ctx.fillStyle = seaHalo;
    ctx.beginPath();
    ctx.arc(0, 0, 520, 0, Math.PI * 2);
    ctx.fill();

    // 呼吸潮汐波纹
    for (let w = 0; w < 2; w++) {
      const wavePhase = ((elapsed * 0.28 + w * 0.5) % 1);
      const scale = 1.03 + wavePhase * 0.15;
      const alpha = (1 - wavePhase) * 0.25;
      ctx.save();
      ctx.strokeStyle = mood.foam.replace(/[\d.]+\)$/, alpha.toFixed(2) + ")");
      ctx.lineWidth = 2.2;
      traceIslandPath(scale, 0);
      ctx.stroke();
      ctx.restore();
    }

    // 湿润沙滩层
    ctx.save();
    traceIslandPath(1.02, 4);
    ctx.fillStyle = mood.sand;
    ctx.fill();
    ctx.restore();

    // 岛屿草地层
    ctx.save();
    traceIslandPath(0.93, 0);
    const turfGrad = ctx.createRadialGradient(0, -20, 20, 0, 0, 265);
    turfGrad.addColorStop(0, mood.turfInner);
    turfGrad.addColorStop(1, mood.turfOuter);
    ctx.fillStyle = turfGrad;
    ctx.fill();
    ctx.restore();

    // 碎石路径（连接篝火到各处）
    ctx.save();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.05)";
    ctx.lineWidth = 14;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(0, 12);
    ctx.lineTo(0, 210);
    ctx.moveTo(0, 12);
    ctx.lineTo(0, -165);
    ctx.moveTo(0, 12);
    ctx.lineTo(175, -24);
    ctx.stroke();
    ctx.restore();

    // 岸边鹅卵石
    ctx.fillStyle = "rgba(200, 215, 235, 0.14)";
    pebbles.forEach(function (p) {
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, p.rx, p.ry, 0.3, 0, Math.PI * 2);
      ctx.fill();
    });

    // 脚印星尘
    footsteps.forEach(function (f) {
      ctx.fillStyle = "rgba(244, 218, 178, " + f.alpha.toFixed(2) + ")";
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  function drawPineTree(tree, mood) {
    const sway = Math.sin(elapsed * 1.1 + tree.swayOffset) * 2.2;
    ctx.save();
    ctx.translate(tree.x, tree.y);
    ctx.scale(tree.scale, tree.scale);

    // 树影
    ctx.fillStyle = "rgba(0, 0, 0, 0.22)";
    ctx.beginPath();
    ctx.ellipse(0, 6, 15, 6, 0, 0, Math.PI * 2);
    ctx.fill();

    // 树干
    ctx.fillStyle = "#2b2220";
    ctx.fillRect(-2.5, -6, 5, 11);

    // 两层松冠
    ctx.fillStyle = mood.treeDark;
    ctx.beginPath();
    ctx.moveTo(sway * 0.4, -34);
    ctx.lineTo(-15, -6);
    ctx.lineTo(15, -6);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = mood.treeLight;
    ctx.beginPath();
    ctx.moveTo(sway, -46);
    ctx.lineTo(-11, -20);
    ctx.lineTo(11, -20);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }

  function drawLandmarks(mood) {
    // 1. 潮汐栈桥
    ctx.save();
    ctx.translate(0, 222);
    ctx.fillStyle = "#513b2d";
    ctx.fillRect(-16, -24, 32, 62);
    ctx.fillStyle = "#6c4f3d";
    for (let y = -20; y <= 32; y += 9) {
      ctx.fillRect(-17, y, 34, 6);
    }
    // 栈桥灯笼柱
    ctx.fillStyle = "#3e2d22";
    ctx.fillRect(14, -18, 4, 20);
    const lanternGlow = ctx.createRadialGradient(16, -20, 2, 16, -20, 30);
    lanternGlow.addColorStop(0, "rgba(255, 214, 150, 0.9)");
    lanternGlow.addColorStop(1, "rgba(255, 214, 150, 0)");
    ctx.fillStyle = lanternGlow;
    ctx.beginPath();
    ctx.arc(16, -20, 30, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ffe2ae";
    ctx.beginPath();
    ctx.arc(16, -20, 3.6, 0, Math.PI * 2);
    ctx.fill();

    // 海面漂浮的发光瓶子
    const bob = Math.sin(elapsed * 2.1) * 3;
    ctx.save();
    ctx.translate(-28, 46 + bob);
    ctx.rotate(-0.35 + Math.sin(elapsed * 1.4) * 0.12);
    ctx.fillStyle = "rgba(160, 226, 255, 0.35)";
    ctx.strokeStyle = "rgba(205, 242, 255, 0.78)";
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.roundRect(-5, -8, 10, 16, 4);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#ffe5a8";
    ctx.beginPath();
    ctx.arc(0, 1, 2.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.restore();

    // 2. 观星石阶
    ctx.save();
    ctx.translate(0, -178);
    ctx.fillStyle = "rgba(192, 212, 240, 0.16)";
    ctx.beginPath();
    ctx.ellipse(0, 4, 34, 18, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(180, 206, 245, 0.35)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(0, 2, 24, 12, 0, 0, Math.PI * 2);
    ctx.stroke();

    // 旋转的星辰微粒
    for (let i = 0; i < 4; i++) {
      const a = elapsed * 0.7 + (i * Math.PI) / 2;
      const sx = Math.cos(a) * 18;
      const sy = Math.sin(a) * 8 - 8;
      ctx.fillStyle = "rgba(218, 232, 255, 0.85)";
      ctx.beginPath();
      ctx.arc(sx, sy, 2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // 3. 静谧长椅
    ctx.save();
    ctx.translate(185, -26);
    ctx.fillStyle = "rgba(0, 0, 0, 0.25)";
    ctx.beginPath();
    ctx.ellipse(0, 10, 22, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#7a5b47";
    ctx.fillRect(-16, -4, 32, 7);
    ctx.fillStyle = "#5c4333";
    ctx.fillRect(-14, 3, 4, 7);
    ctx.fillRect(10, 3, 4, 7);
    ctx.fillRect(-16, -12, 32, 5);
    // 旁侧小地灯
    const lampGlow = ctx.createRadialGradient(-24, 0, 2, -24, 0, 28);
    lampGlow.addColorStop(0, "rgba(255, 204, 138, 0.55)");
    lampGlow.addColorStop(1, "rgba(255, 204, 138, 0)");
    ctx.fillStyle = lampGlow;
    ctx.beginPath();
    ctx.arc(-24, 0, 28, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ffdda6";
    ctx.beginPath();
    ctx.arc(-24, 0, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // 4. 遗忘篝火
    ctx.save();
    ctx.translate(0, 12);
    const flicker = Math.sin(elapsed * 11) * 2 + Math.cos(elapsed * 17) * 1.4;
    const fireGlow = ctx.createRadialGradient(0, -6, 6, 0, -6, 125 + flicker * 3);
    fireGlow.addColorStop(0, "rgba(255, 178, 92, 0.42)");
    fireGlow.addColorStop(0.5, "rgba(242, 128, 66, 0.14)");
    fireGlow.addColorStop(1, "rgba(242, 128, 66, 0)");
    ctx.fillStyle = fireGlow;
    ctx.beginPath();
    ctx.arc(0, -6, 132, 0, Math.PI * 2);
    ctx.fill();

    // 围圈石块
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      ctx.fillStyle = "#485266";
      ctx.beginPath();
      ctx.ellipse(Math.cos(a) * 18, Math.sin(a) * 11 + 4, 4.5, 3, a, 0, Math.PI * 2);
      ctx.fill();
    }

    // 木柴
    ctx.strokeStyle = "#4a3224";
    ctx.lineWidth = 4.5;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(-10, 6);
    ctx.lineTo(10, -2);
    ctx.moveTo(10, 6);
    ctx.lineTo(-10, -2);
    ctx.stroke();

    // 外层火焰
    ctx.fillStyle = "#f27d42";
    ctx.beginPath();
    ctx.moveTo(-10, 2);
    ctx.quadraticCurveTo(-8, -18, 0 + flicker * 0.4, -26 - flicker);
    ctx.quadraticCurveTo(9, -17, 10, 2);
    ctx.closePath();
    ctx.fill();

    // 内层火焰
    ctx.fillStyle = "#ffd78a";
    ctx.beginPath();
    ctx.moveTo(-5, 2);
    ctx.quadraticCurveTo(-4, -11, 0 - flicker * 0.25, -17 - flicker * 0.6);
    ctx.quadraticCurveTo(5, -10, 5, 2);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawAvatar(x, y, color, label, isPlayer, bobPhase) {
    const bob = Math.sin(bobPhase) * 1.8;
    ctx.save();
    ctx.translate(x, y);

    // 地面微光影
    ctx.fillStyle = "rgba(0, 0, 0, 0.28)";
    ctx.beginPath();
    ctx.ellipse(0, 10, 9, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    // 柔和光环
    const halo = ctx.createRadialGradient(0, -4 + bob, 2, 0, -4 + bob, isPlayer ? 28 : 24);
    halo.addColorStop(0, color + (isPlayer ? "55" : "3d"));
    halo.addColorStop(1, color + "00");
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(0, -4 + bob, isPlayer ? 28 : 24, 0, Math.PI * 2);
    ctx.fill();

    // 斗篷身体
    ctx.fillStyle = isPlayer ? "#e8eef8" : color;
    ctx.globalAlpha = isPlayer ? 0.96 : 0.78;
    ctx.beginPath();
    ctx.moveTo(0, -10 + bob);
    ctx.quadraticCurveTo(9, -1 + bob, 8, 9 + bob * 0.4);
    ctx.lineTo(-8, 9 + bob * 0.4);
    ctx.quadraticCurveTo(-9, -1 + bob, 0, -10 + bob);
    ctx.closePath();
    ctx.fill();

    // 小头部
    ctx.fillStyle = "#fff8ee";
    ctx.beginPath();
    ctx.arc(0, -13 + bob, 5.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    if (label) {
      ctx.font = "11.5px 'PingFang SC', 'Microsoft YaHei', sans-serif";
      ctx.textAlign = "center";
      ctx.fillStyle = "rgba(235, 242, 255, 0.78)";
      ctx.fillText(label, 0, -24 + bob);
    }

    ctx.restore();
  }

  function drawLabelsAndHighlights() {
    const active = hoveredTarget || nearbyTarget;
    Oublier.Data.LANDMARKS.forEach(function (lm) {
      const isActive = active && active.kind === "landmark" && active.item.id === lm.id;
      const dist = Math.hypot(player.x - lm.x, player.y - lm.y);
      const showLabel = isActive || dist < 130;

      if (isActive) {
        ctx.save();
        ctx.strokeStyle = "rgba(242, 176, 115, 0.65)";
        ctx.lineWidth = 1.6;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.arc(lm.x, lm.y, 32 + Math.sin(elapsed * 3) * 2, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      if (showLabel) {
        ctx.save();
        ctx.font = "12px 'PingFang SC', 'Microsoft YaHei', sans-serif";
        ctx.textAlign = "center";
        ctx.fillStyle = isActive ? "#ffe3c2" : "rgba(218, 230, 248, 0.72)";
        ctx.fillText(lm.name, lm.x, lm.y - 34);
        ctx.restore();
      }
    });

    if (active && active.kind === "traveler") {
      const t = active.item;
      ctx.save();
      ctx.strokeStyle = "rgba(155, 206, 250, 0.65)";
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(t.x, t.y - 2, 20 + Math.sin(elapsed * 3) * 1.5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawEffects(mood) {
    // 萤火虫
    if (mood.fireflyAlpha > 0.1) {
      fireflies.forEach(function (f) {
        const fx = f.baseX + Math.sin(elapsed * f.speed + f.phase) * 18;
        const fy = f.baseY + Math.cos(elapsed * f.speed * 0.8 + f.phase) * 14;
        const a = (0.3 + 0.7 * (0.5 + 0.5 * Math.sin(elapsed * 2.2 + f.phase))) * mood.fireflyAlpha;
        ctx.fillStyle = "rgba(255, 232, 148, " + a.toFixed(2) + ")";
        ctx.beginPath();
        ctx.arc(fx, fy, f.size, 0, Math.PI * 2);
        ctx.fill();
      });
    }

    // 火星粒子
    embers.forEach(function (e) {
      const p = e.life / e.maxLife;
      const alpha = (1 - p) * 0.92;
      ctx.fillStyle = e.color;
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.size * (1 - p * 0.5), 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;

    // 飞翔中的漂流瓶
    flyingBottles.forEach(function (fb) {
      const t = fb.t;
      const x = fb.startX + (fb.endX - fb.startX) * t;
      const arc = Math.sin(t * Math.PI) * 56;
      const y = fb.startY + (fb.endY - fb.startY) * t - arc;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(t * Math.PI * 2);
      ctx.fillStyle = "#b8ebff";
      ctx.beginPath();
      ctx.roundRect(-4, -7, 8, 14, 3);
      ctx.fill();
      ctx.restore();
    });

    // 地面/水面波纹
    ripples.forEach(function (rp) {
      ctx.save();
      ctx.strokeStyle = rp.color;
      ctx.globalAlpha = Math.max(0, rp.alpha);
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(rp.x, rp.y, rp.r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    });

    // 焚烧后升空的漂浮碎句
    floatingTexts.forEach(function (ft) {
      const p = ft.life / ft.maxLife;
      const alpha = p < 0.2 ? p / 0.2 : 1 - (p - 0.2) / 0.8;
      ctx.save();
      ctx.font = "13px 'Noto Serif SC', 'Songti SC', serif";
      ctx.textAlign = "center";
      ctx.fillStyle = "rgba(255, 224, 178, " + Math.max(0, alpha).toFixed(2) + ")";
      ctx.fillText(ft.text, ft.x, ft.y);
      ctx.restore();
    });
  }

  function drawScreenOverlay(mood) {
    if (mood.rainIntensity > 0) {
      ctx.save();
      ctx.strokeStyle = "rgba(186, 222, 238, 0.24)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      raindrops.forEach(function (rd) {
        ctx.moveTo(rd.x, rd.y);
        ctx.lineTo(rd.x - rd.len * 0.22, rd.y + rd.len);
      });
      ctx.stroke();
      ctx.restore();
    }

    // 边缘暗角，提升沉浸感
    const vignette = ctx.createRadialGradient(
      width / 2,
      height / 2,
      Math.min(width, height) * 0.28,
      width / 2,
      height / 2,
      Math.max(width, height) * 0.78
    );
    vignette.addColorStop(0, "rgba(0, 0, 0, 0)");
    vignette.addColorStop(1, "rgba(4, 8, 16, 0.45)");
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, width, height);
  }

  function render() {
    const mood = Oublier.Data.MOODS[currentMoodId] || Oublier.Data.MOODS.midnight;
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    drawSkyAndSea(mood);

    ctx.save();
    ctx.translate(width / 2, height / 2);
    ctx.scale(worldScale, worldScale);
    ctx.translate(-camera.x, -camera.y);

    drawIsland(mood);
    drawLandmarks(mood);

    // 按 y 深度排序绘制树木、旅人与玩家
    const drawables = [];
    pineTrees.forEach(function (tree) {
      drawables.push({
        y: tree.y,
        draw: function () {
          drawPineTree(tree, mood);
        }
      });
    });

    travelers.forEach(function (t) {
      drawables.push({
        y: t.y,
        draw: function () {
          const isMoving = Math.hypot(t.targetX - t.x, t.targetY - t.y) > 4;
          const bobPhase = isMoving ? elapsed * 7 + t.phase : elapsed * 2 + t.phase;
          drawAvatar(t.x, t.y, t.color, t.name, false, bobPhase);
        }
      });
    });

    drawables.push({
      y: player.y,
      draw: function () {
        const isMoving = Math.hypot(player.vx, player.vy) > 10;
        const bobPhase = isMoving ? elapsed * 10 : elapsed * 2.4;
        drawAvatar(player.x, player.y, "#f2b073", "", true, bobPhase);
      }
    });

    drawables.sort(function (a, b) {
      return a.y - b.y;
    });
    drawables.forEach(function (d) {
      d.draw();
    });

    drawLabelsAndHighlights();
    drawEffects(mood);

    ctx.restore();
    drawScreenOverlay(mood);
    ctx.restore();
  }

  function loop(timestamp) {
    if (!running) return;
    if (!lastTime) lastTime = timestamp;
    const dt = Math.min(0.05, (timestamp - lastTime) / 1000);
    lastTime = timestamp;
    elapsed += dt;

    updatePlayer(dt);
    updateTravelers(dt);
    updateParticles(dt);
    render();

    global.requestAnimationFrame(loop);
  }

  function triggerReleaseBurst(textSnippet) {
    for (let i = 0; i < 36; i++) {
      embers.push({
        x: (Math.random() - 0.5) * 26,
        y: 6,
        vx: (Math.random() - 0.5) * 65,
        vy: -55 - Math.random() * 85,
        life: 0,
        maxLife: 1.8 + Math.random() * 1.4,
        size: 1.8 + Math.random() * 2.8,
        color: Math.random() > 0.3 ? "#ffd28a" : "#ff8e53"
      });
    }
    const clean = String(textSnippet || "").trim();
    if (clean) {
      const display = clean.length > 16 ? clean.slice(0, 16) + "…" : clean;
      floatingTexts.push({
        x: 0,
        y: -26,
        text: display,
        life: 0,
        maxLife: 3.4
      });
    }
    ripples.push({ x: 0, y: 12, r: 10, maxR: 76, alpha: 0.8, color: "#f2b073" });
  }

  function triggerBottleToss() {
    flyingBottles.push({
      startX: 0,
      startY: 222,
      endX: (Math.random() > 0.5 ? 1 : -1) * (40 + Math.random() * 45),
      endY: 305 + Math.random() * 28,
      t: 0,
      duration: 1.25
    });
  }

  function triggerHeartRipple(x, y) {
    ripples.push({
      x: typeof x === "number" ? x : player.x,
      y: typeof y === "number" ? y : player.y,
      r: 8,
      maxR: 54,
      alpha: 0.9,
      color: "#ffcca0"
    });
  }

  function setMood(moodId) {
    if (Oublier.Data.MOODS[moodId]) {
      currentMoodId = moodId;
    }
  }

  function setExtraStars(count) {
    extraStarsCount = Math.max(0, Number(count) || 0);
  }

  function init(canvasEl, options) {
    canvas = canvasEl;
    ctx = canvas.getContext("2d");
    if (options) {
      callbacks = Object.assign(callbacks, options);
    }
    initDecor();
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
    triggerHeartRipple
  };
})(window);
