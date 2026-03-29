(function () {
  'use strict';

  // Replace with your actual published Google Sheet CSV URL
  // To set up: File > Share > Publish to web > CSV format
  var SHEET_CSV_URL = '';
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
        // Count rows where "Payment Confirmed" column = "Yes"
        // Assumes header row + data rows, with Payment Confirmed in column E (index 4)
        var confirmed = 0;
        for (var i = 1; i < lines.length; i++) {
          var cols = lines[i].split(',');
          // Check if payment confirmed (column E, index 4)
          if (cols.length > 4 && cols[4].trim().toLowerCase() === 'yes') {
            confirmed++;
          }
        }
        var remaining = Math.max(0, TOTAL_SPOTS - confirmed);
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
