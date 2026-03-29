(function () {
  'use strict';

  // Replace with your actual published Google Sheet CSV URL
  // To set up: File > Share > Publish to web > CSV format
  var SHEET_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vR924WO2DyQgNVtwpZYHhUG64bli3m0Ucxg8QWDBKAT4UT7KBxODwOgvr2QqzzhHMyzg9pK19cHQD1J/pub?gid=1372138766&single=true&output=csv';
  var TOTAL_SPOTS = 120;
  var POLL_INTERVAL = 60000; // Refresh every 60 seconds

  function init() {
    // If no sheet URL configured, show default
    if (!SHEET_CSV_URL) {
      updateDisplay(TOTAL_SPOTS);
      return;
    }

    fetchSpots();
    setInterval(fetchSpots, POLL_INTERVAL);
  }

  function fetchSpots() {
    var url = SHEET_CSV_URL + (SHEET_CSV_URL.includes('?') ? '&' : '?') + '_t=' + Date.now();

    fetch(url)
      .then(function (response) {
        if (!response.ok) throw new Error('Fetch failed');
        return response.text();
      })
      .then(function (text) {
        var lines = text.trim().split('\n');
        // SpotsCount tab: header row "registered", then the count in row 2
        var registered = 0;
        if (lines.length >= 2) {
          registered = parseInt(lines[1].trim(), 10) || 0;
        }
        var remaining = Math.max(0, TOTAL_SPOTS - registered);
        updateDisplay(remaining);
      })
      .catch(function (err) {
        console.warn('Spots counter fetch error:', err);
        // Keep showing last known value
      });
  }

  function updateDisplay(spots) {
    // Update header spots counter
    var spotsNumber = document.getElementById('spots-number');
    if (spotsNumber) {
      spotsNumber.textContent = spots;
      spotsNumber.classList.remove('text-green-400', 'text-yellow-400', 'text-mscc-red', 'spots-urgent');

      if (spots > 50) {
        spotsNumber.classList.add('text-green-400');
      } else if (spots > 20) {
        spotsNumber.classList.add('text-yellow-400');
      } else {
        spotsNumber.classList.add('text-mscc-red', 'spots-urgent');
      }
    }

    // Update all spots-display elements
    document.querySelectorAll('.spots-display').forEach(function (el) {
      el.textContent = spots;
    });

    // Update spots-claimed elements
    var claimed = TOTAL_SPOTS - spots;
    document.querySelectorAll('.spots-claimed').forEach(function (el) {
      el.textContent = claimed;
    });

    // Update progress bar
    var progressBar = document.getElementById('spots-progress-bar');
    if (progressBar) {
      var pct = Math.min(100, (claimed / TOTAL_SPOTS) * 100);
      progressBar.style.width = pct + '%';
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
