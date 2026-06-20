(function () {
  'use strict';

  var API_URL = 'https://script.google.com/macros/s/AKfycbwQ9VGMYtaHLGPRkFStM3h5wu97qGFeQM9Lkwx36GO7snLq3czaQ41_dcc11xermY14/exec';

  var input, btn, errorEl, resultsEl, tbody, codeLabel, startHoleEl, roundLabel;

  function init() {
    input = document.getElementById('scoring-code-input');
    btn = document.getElementById('scoring-enter-btn');
    errorEl = document.getElementById('scoring-error');
    resultsEl = document.getElementById('scoring-results');
    tbody = document.getElementById('scoring-tbody');
    codeLabel = document.getElementById('scoring-group-code');
    startHoleEl = document.getElementById('scoring-start-hole');
    roundLabel = document.getElementById('scoring-round-label');

    if (!input || !btn) return;

    // Force uppercase while preserving caret position
    input.addEventListener('input', function () {
      var pos = input.selectionStart;
      var upper = input.value.toUpperCase();
      if (input.value !== upper) {
        input.value = upper;
        try { input.setSelectionRange(pos, pos); } catch (e) {}
      }
    });

    btn.addEventListener('click', submit);
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        submit();
      }
    });
  }

  function submit() {
    var code = (input.value || '').trim().toUpperCase();
    hideError();

    if (!code) {
      showError('Please enter your group code.');
      return;
    }

    btn.disabled = true;
    var originalText = btn.textContent;
    btn.textContent = 'Loading...';

    var url = API_URL + '?action=card&code=' + encodeURIComponent(code) + '&_t=' + Date.now();

    fetch(url)
      .then(function (response) {
        if (!response.ok) throw new Error('Network error');
        return response.json();
      })
      .then(function (data) {
        if (!data || !data.ok) {
          showError('Group code not found. Double-check and try again.');
          hideResults();
          return;
        }
        renderCard(data.card);
      })
      .catch(function (err) {
        console.warn('Scoring fetch error:', err);
        showError("Couldn't load right now. Try again in a moment.");
        hideResults();
      })
      .finally(function () {
        btn.disabled = false;
        btn.textContent = originalText;
      });
  }

  function renderCard(card) {
    if (!card) {
      showError('No card data returned.');
      return;
    }

    codeLabel.textContent = card.code || '';
    startHoleEl.textContent = card.startHole != null ? card.startHole : '--';

    var roundParts = [];
    if (card.round) roundParts.push(card.round);
    if (card.type) roundParts.push(card.type);
    roundLabel.textContent = roundParts.join(' • ');

    tbody.innerHTML = '';
    var members = card.members || [];
    members.forEach(function (player) {
      var row = document.createElement('tr');
      row.className = 'hover:bg-mscc-cream/30';

      var scores = player.scores || {};
      var cells = '';

      cells += '<td class="sticky left-0 bg-white px-4 py-3 font-semibold text-mscc-black whitespace-nowrap z-10 border-r border-mscc-black/5">'
        + escapeHtml(player.name || '') + '</td>';

      cells += '<td class="px-3 py-3 text-center text-mscc-black/60">'
        + (player.handicap != null && player.handicap !== '' ? escapeHtml(String(player.handicap)) : '&mdash;') + '</td>';

      for (var h = 1; h <= 18; h++) {
        var s = scores[String(h)];
        var val = (s != null && s !== '') ? escapeHtml(String(s)) : '';
        cells += '<td class="px-3 py-3 text-center text-mscc-black">' + val + '</td>';
      }

      cells += '<td class="px-3 py-3 text-center font-bold text-mscc-red bg-mscc-red/5">'
        + (player.total != null ? escapeHtml(String(player.total)) : '0') + '</td>';

      cells += '<td class="px-3 py-3 text-center text-mscc-black/60">'
        + (player.thru != null ? escapeHtml(String(player.thru)) : '0') + '</td>';

      row.innerHTML = cells;
      tbody.appendChild(row);
    });

    resultsEl.classList.remove('hidden');
  }

  function showError(msg) {
    if (!errorEl) return;
    errorEl.textContent = msg;
    errorEl.classList.remove('hidden');
  }

  function hideError() {
    if (!errorEl) return;
    errorEl.classList.add('hidden');
    errorEl.textContent = '';
  }

  function hideResults() {
    if (!resultsEl) return;
    resultsEl.classList.add('hidden');
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  document.addEventListener('DOMContentLoaded', init);
})();
