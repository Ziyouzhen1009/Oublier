(function (global) {
  "use strict";

  const Oublier = (global.Oublier = global.Oublier || {});

  let els = {};
  let currentModal = null;
  let breathTimers = [];
  let bottleIndex = 0;
  let currentPromptIndex = 0;
  let whisperIndex = 0;
  let zenMode = false;

  function $(id) {
    return document.getElementById(id);
  }

  function escapeHtml(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function showToast(message) {
    if (!els.toastContainer) return;
    const node = document.createElement("div");
    node.className = "toast";
    node.textContent = message;
    els.toastContainer.appendChild(node);
    setTimeout(function () {
      if (node.parentNode) node.parentNode.removeChild(node);
    }, 3900);
  }

  function updateHUD() {
    const state = Oublier.Storage.getState();
    if (els.hudIdentityText) {
      els.hudIdentityText.textContent = state.identity;
    }
    if (els.statReleased) {
      els.statReleased.textContent = String(state.releasedCount);
    }
    const starsTotal = state.releasedCount + state.journalEntries.length;
    if (els.statStars) {
      els.statStars.textContent = String(starsTotal);
    }
    Oublier.World.setExtraStars(starsTotal);

    document.body.className = "mood-" + state.mood;
    const moodButtons = document.querySelectorAll(".mood-btn");
    moodButtons.forEach(function (btn) {
      btn.classList.toggle("active", btn.getAttribute("data-mood") === state.mood);
    });
  }

  function updateNearbyHint(target) {
    if (!els.hintBar || !els.hintText) return;
    if (target) {
      const label = target.item.name;
      const sub = target.kind === "landmark" ? target.item.shortHint : target.item.status;
      els.hintText.textContent = "已走近 · 左键点击「" + label + "」交互（" + sub + "）";
      els.hintBar.classList.add("interactive");
    } else {
      els.hintText.textContent = "左键点击或按住地面漫步 · 滚轮缩放视角 · 走近地标后左键点击交互";
      els.hintBar.classList.remove("interactive");
    }
  }

  function clearBreathTimers() {
    breathTimers.forEach(function (t) {
      clearTimeout(t);
    });
    breathTimers = [];
  }

  function isModalOpen() {
    return Boolean(currentModal);
  }

  function isEntryVisible() {
    return els.entryVeil && !els.entryVeil.classList.contains("leaving");
  }

  function closeModal() {
    clearBreathTimers();
    currentModal = null;
    if (els.modalBackdrop) {
      els.modalBackdrop.classList.add("hidden");
    }
    if (els.modalContent) {
      els.modalContent.innerHTML = "";
    }
  }

  function openModal(kind, html) {
    clearBreathTimers();
    currentModal = kind;
    if (els.soundPanel) {
      els.soundPanel.classList.add("hidden");
      if (els.btnSoundToggle) {
        els.btnSoundToggle.setAttribute("aria-expanded", "false");
        els.btnSoundToggle.classList.remove("active");
      }
    }
    els.modalContent.innerHTML = html;
    els.modalBackdrop.classList.remove("hidden");
  }

  function focusSoon(el) {
    if (!el) return;
    setTimeout(function () {
      el.focus();
    }, 90);
  }

  /* 1. 遗忘圣火坛 */
  function openCampfireModal() {
    openModal(
      "campfire",
      '<div class="modal-eyebrow">HEARTH OF LETTING GO</div>' +
        '<h2 class="modal-title">遗忘圣火坛</h2>' +
        '<p class="modal-lead">把今天让你觉得很重、很烦，或者一直卡在心里的一句话写下来。</p>' +
        '<textarea id="campfire-input" class="textarea-field" maxlength="300" placeholder="写下想暂时忘掉的事……"></textarea>' +
        '<p class="modal-note">为了守住“Oublier”的约定，这些文字不会被保存或上传，只会化作火星升向石拱之上。</p>' +
        '<div class="modal-actions">' +
        '  <button id="btn-campfire-cancel" class="btn-secondary" type="button">再待一会儿</button>' +
        '  <button id="btn-campfire-burn" class="btn-accent" type="button">投入火中</button>' +
        "</div>"
    );

    const input = $("campfire-input");
    focusSoon(input);

    $("btn-campfire-cancel").addEventListener("click", closeModal);
    $("btn-campfire-burn").addEventListener("click", function () {
      const text = input ? input.value.trim() : "";
      if (!text) {
        showToast("先在纸条上写下哪怕几个字，再交给圣火吧");
        if (input) input.focus();
        return;
      }
      Oublier.Storage.incrementReleased();
      updateHUD();
      closeModal();
      Oublier.World.triggerReleaseBurst(text);
      Oublier.Audio.playChime("release");
      const responses = Oublier.Data.RELEASE_RESPONSES;
      const msg = responses[Math.floor(Math.random() * responses.length)];
      showToast(msg);
    });
  }

  /* 2. 潮汐石栈桥 · 漂流瓶 */
  function openPierModal(initialTab) {
    const tab = initialTab || "read";
    openModal(
      "pier",
      '<div class="modal-eyebrow">WATER GATE &amp; DRIFT BOTTLES</div>' +
        '<h2 class="modal-title">潮汐石栈桥</h2>' +
        '<div class="tab-row">' +
        '  <button id="tab-bottle-read" class="tab-btn ' + (tab === "read" ? "active" : "") + '" type="button">捞一个瓶子</button>' +
        '  <button id="tab-bottle-write" class="tab-btn ' + (tab === "write" ? "active" : "") + '" type="button">投一个瓶子</button>' +
        "</div>" +
        '<div id="pier-body"></div>'
    );

    $("tab-bottle-read").addEventListener("click", function () {
      openPierModal("read");
    });
    $("tab-bottle-write").addEventListener("click", function () {
      openPierModal("write");
    });

    if (tab === "read") {
      renderBottleReader();
    } else {
      renderBottleWriter();
    }
  }

  function renderBottleReader() {
    const bottles = Oublier.Storage.getBottles();
    const bottle = bottles[bottleIndex % bottles.length];
    const saved = Oublier.Storage.isBottleSaved(bottle.id);
    const body = $("pier-body");
    body.innerHTML =
      '<div class="quote-card">' +
      '  <p class="quote-text">' + escapeHtml(bottle.text) + "</p>" +
      '  <div class="quote-meta">' +
      "    <span>来自「" + escapeHtml(bottle.author) + "」 · " + escapeHtml(bottle.mood) + "</span>" +
      "    <span>" + escapeHtml(bottle.timestampLabel) + " · " + bottle.lights + " 盏微灯</span>" +
      "  </div>" +
      "</div>" +
      '<div class="modal-actions" style="justify-content: space-between;">' +
      '  <div style="display:flex;gap:8px;flex-wrap:wrap;">' +
      '    <button id="btn-bottle-light" class="btn-secondary ' + (bottle.litByMe ? "active" : "") + '" type="button">' +
      (bottle.litByMe ? "已点亮微灯" : "点亮一盏灯") +
      "    </button>" +
      '    <button id="btn-bottle-save" class="btn-secondary ' + (saved ? "active" : "") + '" type="button">' +
      (saved ? "已收入记忆匣" : "收入记忆匣") +
      "    </button>" +
      "  </div>" +
      '  <button id="btn-bottle-next" class="btn-accent" type="button">再捞一个</button>' +
      "</div>";

    $("btn-bottle-light").addEventListener("click", function () {
      const lit = Oublier.Storage.lightBottle(bottle.id);
      if (lit) {
        Oublier.Audio.playChime("tea");
        Oublier.World.triggerHeartRipple(0, 56);
        showToast("替远方的旅人点亮了一盏微灯");
      }
      renderBottleReader();
    });

    $("btn-bottle-save").addEventListener("click", function () {
      const isSaved = Oublier.Storage.toggleSaveBottle(bottle);
      if (isSaved) {
        Oublier.Audio.playChime("star");
        showToast("已收入记忆匣，想回看时它都在");
      } else {
        showToast("已从记忆匣移出");
      }
      renderBottleReader();
    });

    $("btn-bottle-next").addEventListener("click", function () {
      bottleIndex = (bottleIndex + 1) % bottles.length;
      Oublier.Audio.playChime("bottle");
      renderBottleReader();
    });
  }

  function renderBottleWriter() {
    const state = Oublier.Storage.getState();
    const body = $("pier-body");
    body.innerHTML =
      '<p class="modal-lead">以「' + escapeHtml(state.identity) + '」的身份，给另一位正在海边发呆的陌生人留一句话。</p>' +
      '<textarea id="bottle-write-input" class="textarea-field" maxlength="240" placeholder="写点此刻想说的话，或送出一句不带压力的晚安……"></textarea>' +
      '<div style="margin-bottom:16px;">' +
      '  <input id="bottle-mood-input" class="input-field" maxlength="10" placeholder="给它一个词的天气标签（选填，如：深夜 / 放空）" />' +
      "</div>" +
      '<div class="modal-actions">' +
      '  <button id="btn-bottle-toss" class="btn-accent" type="button">投入大海</button>' +
      "</div>";

    const textarea = $("bottle-write-input");
    focusSoon(textarea);

    $("btn-bottle-toss").addEventListener("click", function () {
      const text = textarea ? textarea.value.trim() : "";
      const tag = $("bottle-mood-input") ? $("bottle-mood-input").value.trim() : "";
      if (!text) {
        showToast("写几句再投入海面吧");
        if (textarea) textarea.focus();
        return;
      }
      Oublier.Storage.addBottle(text, tag || "此刻");
      bottleIndex = 0;
      closeModal();
      Oublier.World.triggerBottleToss();
      Oublier.Audio.playChime("bottle");
      showToast("漂流瓶顺着退潮飘向远方了");
    });
  }

  /* 3. 观星钟楼 · 找回自己 */
  function openCliffModal() {
    const prompts = Oublier.Data.REFLECTION_PROMPTS;
    const prompt = prompts[currentPromptIndex % prompts.length];

    openModal(
      "cliff",
      '<div class="modal-eyebrow">ROSE WINDOW &amp; BELL TOWER</div>' +
        '<h2 class="modal-title">观星钟楼</h2>' +
        '<div class="quote-card">' +
        '  <p class="quote-text">' + escapeHtml(prompt) + "</p>" +
        "</div>" +
        '<textarea id="reflection-input" class="textarea-field" maxlength="600" placeholder="在玫瑰窗下，不需要工整的答案，想到什么就写给自己听……"></textarea>' +
        '<p class="modal-note">仅保存在本地「记忆匣」中，你可以随时导出或清空。</p>' +
        '<div class="modal-actions" style="justify-content: space-between;">' +
        '  <button id="btn-reflection-swap" class="btn-secondary" type="button">换一个问题</button>' +
        '  <button id="btn-reflection-save" class="btn-accent" type="button">留存这一刻</button>' +
        "</div>"
    );

    const input = $("reflection-input");
    focusSoon(input);

    $("btn-reflection-swap").addEventListener("click", function () {
      currentPromptIndex = (currentPromptIndex + 1) % prompts.length;
      openCliffModal();
    });

    $("btn-reflection-save").addEventListener("click", function () {
      const answer = input ? input.value.trim() : "";
      if (!answer) {
        showToast("留下一两句给自己的话再收好吧");
        if (input) input.focus();
        return;
      }
      Oublier.Storage.saveReflection(prompt, answer);
      updateHUD();
      closeModal();
      Oublier.Audio.playChime("star");
      Oublier.World.triggerHeartRipple(0, -50);
      showToast("这颗思绪已经化作钟楼上方的一颗星光");
    });
  }

  /* 4. 柏林石亭 · 呼吸引导 */
  function openBenchModal() {
    openModal(
      "bench",
      '<div class="modal-eyebrow">CYPRESS GROVE</div>' +
        '<h2 class="modal-title">柏林石亭</h2>' +
        '<p class="modal-lead">不用想待办事项，也不用思考人生。先跟着光圈，给身体一分钟。</p>' +
        '<div class="breath-stage">' +
        '  <div id="breath-orb" class="breath-orb"></div>' +
        '  <div id="breath-label" class="breath-label">准备好了就开始</div>' +
        '  <div id="breath-sub" class="breath-sub">吸气 4 秒 · 停顿 4 秒 · 呼气 6 秒</div>' +
        "</div>" +
        '<div class="modal-actions" style="justify-content: center; margin-top: 10px;">' +
        '  <button id="btn-breath-start" class="btn-accent" type="button">开始一轮呼吸</button>' +
        "</div>"
    );

    const orb = $("breath-orb");
    const label = $("breath-label");
    const sub = $("breath-sub");
    const startBtn = $("btn-breath-start");

    function runCycle(round) {
      if (currentModal !== "bench") return;
      if (round > 3) {
        orb.className = "breath-orb";
        label.textContent = "肩膀是不是松了一点？";
        sub.textContent = "随时可以起身继续漫步，或再坐一会儿";
        startBtn.classList.remove("hidden");
        startBtn.textContent = "再来一轮";
        return;
      }

      startBtn.classList.add("hidden");
      orb.className = "breath-orb inhale";
      label.textContent = "慢慢吸气…（第 " + round + "/3 轮）";
      sub.textContent = "感受柏树间的海风穿过肩膀";

      breathTimers.push(
        setTimeout(function () {
          if (currentModal !== "bench") return;
          orb.className = "breath-orb hold";
          label.textContent = "轻轻停住…";
          sub.textContent = "这一秒什么都不需要做";
        }, 4000)
      );

      breathTimers.push(
        setTimeout(function () {
          if (currentModal !== "bench") return;
          orb.className = "breath-orb exhale";
          label.textContent = "缓缓呼出…";
          sub.textContent = "把紧绷顺着呼吸放掉";
        }, 8000)
      );

      breathTimers.push(
        setTimeout(function () {
          runCycle(round + 1);
        }, 14000)
      );
    }

    startBtn.addEventListener("click", function () {
      clearBreathTimers();
      Oublier.Audio.playChime("tea");
      runCycle(1);
    });
  }

  /* 5. 回声长廊 · 低语与风钟 */
  function openCloisterModal() {
    const whispers = Oublier.Data.CLOISTER_WHISPERS;
    const whisper = whispers[whisperIndex % whispers.length];

    openModal(
      "cloister",
      '<div class="modal-eyebrow">WHISPERING CLOISTER</div>' +
        '<h2 class="modal-title">回声长廊</h2>' +
        '<p class="modal-lead">对称的尖拱石柱间留存着过往旅人的轻声低语。如果连打字都觉得累，只管听一听就好。</p>' +
        '<div class="quote-card">' +
        '  <p id="cloister-whisper-text" class="quote-text">' + escapeHtml(whisper) + "</p>" +
        '  <div class="quote-meta"><span>石廊回音</span><span>无需回应</span></div>' +
        "</div>" +
        '<div class="modal-actions" style="justify-content: space-between;">' +
        '  <button id="btn-cloister-next" class="btn-secondary" type="button">再听一句低语</button>' +
        '  <button id="btn-cloister-bell" class="btn-accent" type="button">敲响风钟</button>' +
        "</div>"
    );

    $("btn-cloister-next").addEventListener("click", function () {
      whisperIndex = (whisperIndex + 1) % whispers.length;
      const textEl = $("cloister-whisper-text");
      if (textEl) textEl.textContent = whispers[whisperIndex];
      Oublier.Audio.playChime("step");
    });

    $("btn-cloister-bell").addEventListener("click", function () {
      Oublier.Audio.playChime("bell");
      Oublier.World.triggerBellWave();
      showToast("沉缓的钟声荡开石廊，海风好像也跟着慢了下来");
    });
  }

  /* 6. 孤灯望海台 · 全景远眺 */
  function openLighthouseModal() {
    openModal(
      "lighthouse",
      '<div class="modal-eyebrow">CLIFFSIDE LANTERN OVERLOOK</div>' +
        '<h2 class="modal-title">孤灯望海台</h2>' +
        '<p class="modal-lead">东南悬崖上的高灯塔守望着整片夜海。站在高处看一眼整座修道院的轮廓，往往会让心里突然开阔。</p>' +
        '<div class="quote-card">' +
        '  <p class="quote-text">“当你觉得眼前的事情太大、太挤时，不妨退后几十步，看看大海和尖顶是如何安静共存的。”</p>' +
        "</div>" +
        '<div class="modal-actions" style="justify-content: space-between;">' +
        '  <button id="btn-lighthouse-close" class="btn-secondary" type="button">先留在这里</button>' +
        '  <button id="btn-lighthouse-overlook" class="btn-accent" type="button">切换全景远眺</button>' +
        "</div>"
    );

    $("btn-lighthouse-close").addEventListener("click", closeModal);
    $("btn-lighthouse-overlook").addEventListener("click", function () {
      closeModal();
      setOverlookMode(true);
      Oublier.Audio.playChime("star");
      showToast("已切换至望海台全景视角，按 ESC 或底部按钮返回");
    });
  }

  function setOverlookMode(enabled) {
    const active = Oublier.World.toggleOverlookCamera(enabled);
    if (els.btnExitOverlook) {
      els.btnExitOverlook.classList.toggle("hidden", !active);
    }
  }

  /* 7. 偶遇旅人 */
  function openTravelerModal(traveler) {
    const choicesHtml = traveler.dialogue
      .map(function (d, idx) {
        return '<button class="choice-btn" data-choice="' + idx + '" type="button">' + escapeHtml(d.choice) + "</button>";
      })
      .join("");

    openModal(
      "traveler",
      '<div class="modal-eyebrow">' + escapeHtml(traveler.role) + " · 偶遇</div>" +
        '<h2 class="modal-title">' + escapeHtml(traveler.name) + "</h2>" +
        '<div class="traveler-badge">天亮后，这段相遇会自动遗忘</div>' +
        '<div id="traveler-dialogue-box" class="dialogue-box">' + escapeHtml(traveler.greeting) + "</div>" +
        '<div class="modal-actions" style="justify-content: flex-start; margin-bottom: 14px;">' +
        '  <button id="btn-traveler-tea" class="btn-secondary" type="button">递一杯热茶</button>' +
        '  <button id="btn-traveler-silent" class="btn-secondary" type="button">并肩待一会儿</button>' +
        "</div>" +
        '<div id="traveler-choices" class="choice-list">' + choicesHtml + "</div>"
    );

    const box = $("traveler-dialogue-box");

    $("btn-traveler-tea").addEventListener("click", function () {
      box.textContent = traveler.teaReaction;
      Oublier.Audio.playChime("tea");
      Oublier.World.triggerHeartRipple(traveler.x, traveler.z);
      showToast("你向「" + traveler.name + "」递出了一杯热茶");
    });

    $("btn-traveler-silent").addEventListener("click", function () {
      box.textContent = traveler.silentReaction;
      Oublier.Audio.playChime("star");
    });

    document.querySelectorAll("#traveler-choices .choice-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        const idx = Number(btn.getAttribute("data-choice"));
        const item = traveler.dialogue[idx];
        if (item) {
          box.textContent = item.reply;
          Oublier.Audio.playChime("step");
        }
      });
    });
  }

  /* 8. 记忆匣 */
  function openJournalModal(tabName) {
    const tab = tabName || "reflections";
    const state = Oublier.Storage.getState();

    let listHtml = "";
    if (tab === "reflections") {
      if (state.journalEntries.length === 0) {
        listHtml =
          '<div class="empty-state">记忆匣里还没有自省回声。<br/>去北边的「观星钟楼」玫瑰窗下坐坐，和自己说说话吧。</div>';
      } else {
        listHtml =
          '<div class="journal-list">' +
          state.journalEntries
            .map(function (entry) {
              return (
                '<div class="journal-item">' +
                '  <div class="journal-prompt">' + escapeHtml(entry.prompt) + "</div>" +
                '  <div class="journal-answer">' + escapeHtml(entry.answer) + "</div>" +
                '  <div class="journal-date">' + escapeHtml(Oublier.Storage.formatDateLabel(entry.createdAt)) + "</div>" +
                "</div>"
              );
            })
            .join("") +
          "</div>";
      }
    } else {
      if (state.savedBottles.length === 0) {
        listHtml =
          '<div class="empty-state">还没有收藏的漂流瓶。<br/>去南边「潮汐石栈桥」捞一捞远方的声音吧。</div>';
      } else {
        listHtml =
          '<div class="journal-list">' +
          state.savedBottles
            .map(function (b) {
              return (
                '<div class="journal-item">' +
                '  <div class="journal-prompt">来自「' + escapeHtml(b.author) + "」 · " + escapeHtml(b.mood) + "</div>" +
                '  <div class="journal-answer">' + escapeHtml(b.text) + "</div>" +
                "</div>"
              );
            })
            .join("") +
          "</div>";
      }
    }

    openModal(
      "journal",
      '<div class="modal-eyebrow">MEMORY BOX · 记忆匣</div>' +
        '<h2 class="modal-title">只属于你的微光</h2>' +
        '<div class="tab-row">' +
        '  <button id="tab-j-reflections" class="tab-btn ' + (tab === "reflections" ? "active" : "") + '" type="button">内在回声 (' + state.journalEntries.length + ")</button>" +
        '  <button id="tab-j-bottles" class="tab-btn ' + (tab === "bottles" ? "active" : "") + '" type="button">收藏漂流瓶 (' + state.savedBottles.length + ")</button>" +
        "</div>" +
        listHtml +
        '<div class="modal-actions" style="justify-content: space-between;">' +
        '  <button id="btn-journal-clear" class="btn-danger-soft" type="button">清空记忆（彻底遗忘）</button>' +
        '  <button id="btn-journal-export" class="btn-secondary" type="button">导出 Markdown</button>' +
        "</div>"
    );

    $("tab-j-reflections").addEventListener("click", function () {
      openJournalModal("reflections");
    });
    $("tab-j-bottles").addEventListener("click", function () {
      openJournalModal("bottles");
    });
    $("btn-journal-export").addEventListener("click", function () {
      Oublier.Storage.exportJournalMarkdown();
      showToast("已将记忆匣导出为 Markdown 文件");
    });

    let confirmClear = false;
    const clearBtn = $("btn-journal-clear");
    clearBtn.addEventListener("click", function () {
      if (!confirmClear) {
        confirmClear = true;
        clearBtn.textContent = "再点一次确认彻底遗忘";
        return;
      }
      Oublier.Storage.clearAll();
      updateHUD();
      closeModal();
      showToast("一切归零。今夜重新开始。");
    });
  }

  /* 9. 更换临时身份 */
  function openIdentityModal() {
    const state = Oublier.Storage.getState();
    openModal(
      "identity",
      '<div class="modal-eyebrow">TEMPORARY IDENTITY</div>' +
        '<h2 class="modal-title">更换今晚的身份</h2>' +
        '<p class="modal-lead">不用真实姓名，选一个此时此刻你觉得舒服的代号。</p>' +
        '<div class="identity-row" style="margin-bottom: 18px;">' +
        '  <input id="modal-identity-input" class="input-field" maxlength="20" value="' + escapeHtml(state.identity) + '" />' +
        '  <button id="btn-modal-random-id" class="btn-ghost" type="button">换一个</button>' +
        "</div>" +
        '<div class="modal-actions">' +
        '  <button id="btn-modal-id-save" class="btn-accent" type="button">就用这个</button>' +
        "</div>"
    );

    const input = $("modal-identity-input");
    focusSoon(input);

    $("btn-modal-random-id").addEventListener("click", function () {
      if (input) input.value = Oublier.Storage.randomIdentity();
    });

    $("btn-modal-id-save").addEventListener("click", function () {
      Oublier.Storage.setIdentity(input ? input.value : "");
      updateHUD();
      closeModal();
      showToast("今晚你是「" + Oublier.Storage.getState().identity + "」");
    });
  }

  function renderMinimap() {
    const mc = els.minimapCanvas;
    if (!mc || (els.hud && els.hud.classList.contains("hidden"))) return;
    const mctx = mc.getContext("2d");
    const size = mc.width;
    const half = size / 2;
    const scale = 0.92;

    mctx.clearRect(0, 0, size, size);

    // 岛屿轮廓圆
    mctx.fillStyle = "rgba(38, 48, 66, 0.55)";
    mctx.strokeStyle = "rgba(217, 181, 132, 0.25)";
    mctx.lineWidth = 1;
    mctx.beginPath();
    mctx.arc(half, half, 54, 0, Math.PI * 2);
    mctx.fill();
    mctx.stroke();

    // 十字石道
    mctx.strokeStyle = "rgba(195, 208, 232, 0.16)";
    mctx.lineWidth = 2;
    mctx.beginPath();
    mctx.moveTo(half, half - 48);
    mctx.lineTo(half, half + 54);
    mctx.moveTo(half - 46, half - 7);
    mctx.lineTo(half + 46, half - 7);
    mctx.stroke();

    const data = Oublier.World.getMinimapState();

    // 六处地标微光点
    data.landmarks.forEach(function (lm) {
      const mx = half + lm.x * scale;
      const my = half + lm.z * scale;
      mctx.fillStyle = lm.id === "campfire" ? "#f5a764" : "#d9b584";
      mctx.beginPath();
      mctx.arc(mx, my, lm.id === "campfire" ? 3.5 : 2.6, 0, Math.PI * 2);
      mctx.fill();
    });

    // 同行旅人小点
    data.travelers.forEach(function (t) {
      const mx = half + t.x * scale;
      const my = half + t.z * scale;
      mctx.fillStyle = t.color;
      mctx.beginPath();
      mctx.arc(mx, my, 2.2, 0, Math.PI * 2);
      mctx.fill();
    });

    // 玩家三角方向标
    const px = half + data.player.x * scale;
    const py = half + data.player.z * scale;
    mctx.save();
    mctx.translate(px, py);
    mctx.rotate(-data.player.yaw + Math.PI);
    mctx.fillStyle = "#ffffff";
    mctx.beginPath();
    mctx.moveTo(0, -5);
    mctx.lineTo(3.6, 3.8);
    mctx.lineTo(-3.6, 3.8);
    mctx.closePath();
    mctx.fill();
    mctx.restore();
  }

  function setZenMode(enabled) {
    zenMode = Boolean(enabled);
    if (zenMode) {
      els.hud.classList.add("zen-hidden");
      els.btnExitZen.classList.remove("hidden");
      els.soundPanel.classList.add("hidden");
    } else {
      els.hud.classList.remove("zen-hidden");
      els.btnExitZen.classList.add("hidden");
    }
  }

  function syncSoundSliders() {
    const vols = Oublier.Audio.getVolumes();
    if (els.volOcean) els.volOcean.value = String(Math.round(vols.ocean * 100));
    if (els.volRain) els.volRain.value = String(Math.round(vols.rain * 100));
    if (els.volFire) els.volFire.value = String(Math.round(vols.fire * 100));
    if (els.volChimes) els.volChimes.value = String(Math.round(vols.chimes * 100));
  }

  function init() {
    els = {
      entryVeil: $("entry-veil"),
      entryIdentityInput: $("entry-identity-input"),
      btnRandomIdentity: $("btn-random-identity"),
      btnEnterIsland: $("btn-enter-island"),
      hud: $("hud"),
      hudIdentityText: $("hud-identity-text"),
      btnEditIdentity: $("btn-edit-identity"),
      statReleased: $("stat-released"),
      statStars: $("stat-stars"),
      btnSoundToggle: $("btn-sound-toggle"),
      soundPanel: $("sound-panel"),
      btnAudioMaster: $("btn-audio-master"),
      volOcean: $("vol-ocean"),
      volRain: $("vol-rain"),
      volFire: $("vol-fire"),
      volChimes: $("vol-chimes"),
      btnJournal: $("btn-journal"),
      btnZenMode: $("btn-zen-mode"),
      btnExitZen: $("btn-exit-zen"),
      btnExitOverlook: $("btn-exit-overlook"),
      minimapCanvas: $("minimap-canvas"),
      hintBar: $("hint-bar"),
      hintText: $("hint-text"),
      toastContainer: $("toast-container"),
      modalBackdrop: $("modal-backdrop"),
      modalContent: $("modal-content"),
      btnModalClose: $("btn-modal-close")
    };

    const state = Oublier.Storage.getState();
    els.entryIdentityInput.value = state.identity;
    updateHUD();
    syncSoundSliders();

    els.btnRandomIdentity.addEventListener("click", function () {
      els.entryIdentityInput.value = Oublier.Storage.randomIdentity();
    });

    els.btnEnterIsland.addEventListener("click", function () {
      Oublier.Storage.setIdentity(els.entryIdentityInput.value);
      updateHUD();
      Oublier.Audio.init();
      Oublier.Audio.playChime("enter");
      els.entryVeil.classList.add("leaving");
      els.hud.classList.remove("hidden");
      showToast("欢迎登岛，「" + Oublier.Storage.getState().identity + "」");
    });

    els.btnEditIdentity.addEventListener("click", openIdentityModal);
    els.btnJournal.addEventListener("click", function () {
      openJournalModal("reflections");
    });

    els.btnZenMode.addEventListener("click", function () {
      setZenMode(true);
    });
    els.btnExitZen.addEventListener("click", function () {
      setZenMode(false);
    });
    els.btnExitOverlook.addEventListener("click", function () {
      setOverlookMode(false);
    });

    els.hintBar.addEventListener("click", function () {
      Oublier.World.interactCurrent();
    });

    document.querySelectorAll(".mood-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        const moodId = btn.getAttribute("data-mood");
        Oublier.Storage.setMood(moodId);
        Oublier.World.setMood(moodId);
        Oublier.Audio.syncMood(moodId);
        syncSoundSliders();
        updateHUD();
      });
    });

    els.btnSoundToggle.addEventListener("click", function () {
      const hidden = els.soundPanel.classList.toggle("hidden");
      els.btnSoundToggle.setAttribute("aria-expanded", String(!hidden));
      els.btnSoundToggle.classList.toggle("active", !hidden);
      Oublier.Audio.init();
    });

    els.btnAudioMaster.addEventListener("click", function () {
      Oublier.Audio.init();
      const nextMuted = !Oublier.Audio.isMuted();
      Oublier.Audio.setMuted(nextMuted);
      els.btnAudioMaster.textContent = nextMuted ? "已静音" : "已开启";
      els.btnAudioMaster.classList.toggle("muted", nextMuted);
    });

    function bindSlider(inputEl, channel) {
      inputEl.addEventListener("input", function () {
        Oublier.Audio.init();
        Oublier.Audio.setVolume(channel, Number(inputEl.value) / 100);
      });
    }
    bindSlider(els.volOcean, "ocean");
    bindSlider(els.volRain, "rain");
    bindSlider(els.volFire, "fire");
    bindSlider(els.volChimes, "chimes");

    els.btnModalClose.addEventListener("click", closeModal);
    els.modalBackdrop.addEventListener("click", function (e) {
      if (e.target === els.modalBackdrop) {
        closeModal();
      }
    });
  }

  function handleLandmark(lm) {
    if (lm.id === "campfire") openCampfireModal();
    else if (lm.id === "pier") openPierModal("read");
    else if (lm.id === "cliff") openCliffModal();
    else if (lm.id === "bench") openBenchModal();
    else if (lm.id === "cloister") openCloisterModal();
    else if (lm.id === "lighthouse") openLighthouseModal();
  }

  Oublier.UI = {
    init,
    updateHUD,
    updateNearbyHint,
    handleLandmark,
    openTravelerModal,
    closeModal,
    isModalOpen,
    isEntryVisible,
    setZenMode,
    setOverlookMode,
    renderMinimap,
    showToast
  };
})(window);
