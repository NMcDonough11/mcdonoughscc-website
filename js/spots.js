(function () {
  'use strict';

  // Registration closed. Roster locked at 109 players.
  var TOTAL_SPOTS = 120;
  var REGISTERED = 109;

  function init() {
    document.querySelectorAll('.spots-display').forEach(function (el) {
      el.textContent = REGISTERED;
    });

    document.querySelectorAll('.spots-claimed').forEach(function (el) {
      el.textContent = REGISTERED;
    });

    var progressBar = document.getElementById('spots-progress-bar');
    if (progressBar) {
      progressBar.style.width = (REGISTERED / TOTAL_SPOTS) * 100 + '%';
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
