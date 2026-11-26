(function (global) {
  "use strict";

  const Oublier = (global.Oublier = global.Oublier || {});
  const STORAGE_KEY = "oublier_v1";

  function safeRead() {
    try {
      const raw = global.localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (err) {
      return null;
    }
  }

  function safeWrite(state) {
    try {
      global.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (err) {
      // 隐私模式或存储受限时静默降级为内存状态
    }
  }

  function pickRandom(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  function createDefaultState() {
    const pool = Oublier.Data.IDENTITY_POOL;
    return {
      identity: pickRandom(pool),
      mood: "midnight",
      releasedCount: 0,
      journalEntries: [],
      userBottles: [],
      litBottleIds: [],
      savedBottles: []
    };
  }

  let memoryState = null;

  function loadState() {
    if (memoryState) return memoryState;
    const defaults = createDefaultState();
    const stored = safeRead();
    memoryState = stored ? Object.assign({}, defaults, stored) : defaults;
    if (!Array.isArray(memoryState.journalEntries)) memoryState.journalEntries = [];
    if (!Array.isArray(memoryState.userBottles)) memoryState.userBottles = [];
    if (!Array.isArray(memoryState.litBottleIds)) memoryState.litBottleIds = [];
    if (!Array.isArray(memoryState.savedBottles)) memoryState.savedBottles = [];
    if (typeof memoryState.releasedCount !== "number") memoryState.releasedCount = 0;
    return memoryState;
  }

  function commit() {
    if (memoryState) {
      safeWrite(memoryState);
    }
  }

  function getState() {
    return loadState();
  }

  function setIdentity(name) {
    const state = loadState();
    const trimmed = String(name || "").trim().slice(0, 20);
    state.identity = trimmed || pickRandom(Oublier.Data.IDENTITY_POOL);
    commit();
    return state.identity;
  }

  function randomIdentity() {
    return pickRandom(Oublier.Data.IDENTITY_POOL);
  }

  function setMood(moodId) {
    const state = loadState();
    if (Oublier.Data.MOODS[moodId]) {
      state.mood = moodId;
      commit();
    }
    return state.mood;
  }

  function incrementReleased() {
    const state = loadState();
    state.releasedCount += 1;
    commit();
    return state.releasedCount;
  }

  function saveReflection(prompt, answer) {
    const state = loadState();
    const cleanAnswer = String(answer || "").trim();
    if (!cleanAnswer) return null;
    const entry = {
      id: "j-" + Date.now(),
      prompt: prompt,
      answer: cleanAnswer,
      createdAt: new Date().toISOString()
    };
    state.journalEntries.unshift(entry);
    commit();
    return entry;
  }

  function getBottles() {
    const state = loadState();
    const seeds = Oublier.Data.SEED_BOTTLES.map(function (b) {
      const isLit = state.litBottleIds.indexOf(b.id) !== -1;
      return Object.assign({}, b, {
        lights: b.lights + (isLit ? 1 : 0),
        litByMe: isLit,
        isMine: false
      });
    });
    const mine = state.userBottles.map(function (b) {
      const isLit = state.litBottleIds.indexOf(b.id) !== -1;
      return Object.assign({}, b, {
        lights: (b.lights || 0) + (isLit ? 1 : 0),
        litByMe: isLit,
        isMine: true
      });
    });
    return mine.concat(seeds);
  }

  function addBottle(text, moodTag) {
    const state = loadState();
    const clean = String(text || "").trim();
    if (!clean) return null;
    const bottle = {
      id: "usr-" + Date.now(),
      author: state.identity,
      text: clean,
      mood: moodTag || "此刻",
      lights: 0,
      timestampLabel: "刚刚投入海面"
    };
    state.userBottles.unshift(bottle);
    commit();
    return bottle;
  }

  function lightBottle(bottleId) {
    const state = loadState();
    const idx = state.litBottleIds.indexOf(bottleId);
    let lit = false;
    if (idx === -1) {
      state.litBottleIds.push(bottleId);
      lit = true;
    } else {
      state.litBottleIds.splice(idx, 1);
      lit = false;
    }
    commit();
    return lit;
  }

  function isBottleSaved(bottleId) {
    const state = loadState();
    return state.savedBottles.some(function (b) {
      return b.id === bottleId;
    });
  }

  function toggleSaveBottle(bottle) {
    const state = loadState();
    const idx = state.savedBottles.findIndex(function (b) {
      return b.id === bottle.id;
    });
    let saved = false;
    if (idx === -1) {
      state.savedBottles.unshift({
        id: bottle.id,
        author: bottle.author,
        text: bottle.text,
        mood: bottle.mood,
        savedAt: new Date().toISOString()
      });
      saved = true;
    } else {
      state.savedBottles.splice(idx, 1);
      saved = false;
    }
    commit();
    return saved;
  }

  function formatDateLabel(iso) {
    try {
      const d = new Date(iso);
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      const hh = String(d.getHours()).padStart(2, "0");
      const mi = String(d.getMinutes()).padStart(2, "0");
      return yyyy + "-" + mm + "-" + dd + " " + hh + ":" + mi;
    } catch (e) {
      return iso || "";
    }
  }

  function exportJournalMarkdown() {
    const state = loadState();
    const lines = [
      "# Oublier · 记忆匣",
      "",
      "> 在这里逃离真实的世界。",
      "",
      "- 当前岛上身份：" + state.identity,
      "- 投入篝火释怀的心事：" + state.releasedCount + " 件（未留痕迹）",
      "",
      "## 内在回声（自我对话）",
      ""
    ];

    if (state.journalEntries.length === 0) {
      lines.push("暂无记录。");
    } else {
      state.journalEntries.forEach(function (item) {
        lines.push("### " + formatDateLabel(item.createdAt));
        lines.push("**问题**：" + item.prompt);
        lines.push("");
        lines.push(item.answer);
        lines.push("");
      });
    }

    lines.push("## 收藏的漂流瓶", "");
    if (state.savedBottles.length === 0) {
      lines.push("暂无收藏。");
    } else {
      state.savedBottles.forEach(function (b) {
        lines.push("- **来自「" + b.author + "」**（" + (b.mood || "旅途") + "）：" + b.text);
      });
    }

    const blob = new Blob([lines.join("\n")], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "Oublier-记忆匣.md";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 1000);
  }

  function clearAll() {
    const currentMood = loadState().mood;
    memoryState = createDefaultState();
    memoryState.mood = currentMood;
    commit();
    return memoryState;
  }

  Oublier.Storage = {
    getState,
    setIdentity,
    randomIdentity,
    setMood,
    incrementReleased,
    saveReflection,
    getBottles,
    addBottle,
    lightBottle,
    isBottleSaved,
    toggleSaveBottle,
    exportJournalMarkdown,
    clearAll,
    formatDateLabel
  };
})(window);
