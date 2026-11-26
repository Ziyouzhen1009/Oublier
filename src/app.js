(function (global) {
  "use strict";

  const Oublier = (global.Oublier = global.Oublier || {});

  document.addEventListener("DOMContentLoaded", function () {
    const canvas = document.getElementById("world-canvas");
    const state = Oublier.Storage.getState();

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
    Oublier.UI.init();
    Oublier.World.start();

    document.addEventListener("keydown", function (e) {
      if (e.code === "Escape") {
        if (Oublier.UI.isModalOpen()) {
          Oublier.UI.closeModal();
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
