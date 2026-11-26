(function (global) {
  "use strict";

  const Oublier = (global.Oublier = global.Oublier || {});

  document.addEventListener("DOMContentLoaded", function () {
    const canvas = document.getElementById("world-canvas");
    const state = Oublier.Storage.getState();

    Oublier.UI.init();

    try {
      Oublier.World.init(canvas, {
        onInteractLandmark: function (lm) {
          Oublier.UI.handleLandmark(lm);
        },
        onInteractTraveler: function (traveler) {
          Oublier.UI.openTravelerModal(traveler);
        },
        onNearbyChange: function (target) {
          Oublier.UI.updateNearbyHint(target);
        },
        onFrameUpdate: function () {
          Oublier.UI.renderMinimap();
        },
        isInputBlocked: function () {
          if (Oublier.UI.isEntryVisible() || Oublier.UI.isModalOpen()) {
            return true;
          }
          const active = document.activeElement;
          if (active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA")) {
            return true;
          }
          return false;
        }
      });

      Oublier.World.setMood(state.mood);
      Oublier.UI.updateHUD();
      Oublier.World.start();
    } catch (err) {
      Oublier.UI.showToast("当前浏览器未能启动 WebGL 3D 画面，请尝试开启硬件加速或更换现代浏览器。");
    }

    document.addEventListener("keydown", function (e) {
      if (e.code === "Escape") {
        if (Oublier.UI.isModalOpen()) {
          Oublier.UI.closeModal();
        } else if (Oublier.World.isOverlookActive && Oublier.World.isOverlookActive()) {
          Oublier.UI.setOverlookMode(false);
        } else {
          const soundPanel = document.getElementById("sound-panel");
          if (soundPanel && !soundPanel.classList.contains("hidden")) {
            soundPanel.classList.add("hidden");
          } else {
            Oublier.UI.setZenMode(false);
          }
        }
      }
    });
  });
})(window);
