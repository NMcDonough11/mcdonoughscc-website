(function () {
  'use strict';

  var API_URL = 'https://script.google.com/macros/s/AKfycbyhQUuFTTS7rUXNBD_-1nlKGZPIgF-SHwRRAuk0hZYlSHtVAov3VvRstR-hr22tRg6R/exec';

  // Fallback for the score button range until the hole config arrives.
  var DEFAULT_MAX_PER_HOLE = 8;

  // Sentinel sent to the server to clear a previously saved score for a hole.
  // Zero strokes is impossible in real golf, so the server treats it as "delete".
  var CLEAR_STROKES = 0;

  // State
  var currentCard = null;            // last server-confirmed (or optimistic) card
  var holeConfig = {};               // hole number -> { par, maxPerHole }
  var currentHole = 1;
  var pendingRetry = {};             // playerId -> { hole, strokes } (failed network write)
  var errorByPlayer = {};            // playerId -> { hole, message } (server-rejected write)

  // DOM refs (code entry)
  var input, btn, errorEl, resultsEl, codeLabel, startHoleEl, roundLabel;
  // DOM refs (entry panel)
  var currentHoleEl, currentParEl, prevBtn, nextBtn, playersList;
  // DOM refs (overview table)
  var theadRow, tbody;

  // ----- Leaderboard state -----
  var lbView = 'enter';                // 'enter' | 'leaderboard'
  var lbPollingInterval = null;        // setInterval handle while polling
  var lastLeaderboard = null;          // last server payload
  var lastLeaderboardAt = null;        // Date of last successful fetch
  var lbFullscreenOpen = false;

  // ----- Leaderboard DOM refs -----
  var tabEnterBtn, tabLbBtn;
  var enterViewEl, lbViewEl;
  var lbRoundEl, lbUpdatedEl;
  var lbLoadingEl, lbEmptyEl, lbTableWrapEl, lbTbodyEl;
  var lbFullscreenBtn, lbFullscreenOverlay, lbFsRoundEl, lbFsUpdatedEl, lbFsTbodyEl, lbCloseFsBtn;

  // Monotonic counter so concurrent JSONP requests do not collide.
  var jsonpCounter = 0;

  // ---------- JSONP transport ----------
  //
  // Apps Script does not reliably send CORS headers, so we cannot use fetch
  // for the GET path. JSONP loads the response through a <script> tag, which
  // is not subject to CORS. The server returns `NAME({...json...})` whenever
  // a `&callback=NAME` query param is present.
  //
  // The callback is invoked with the parsed response object, or with
  // { ok:false, error:'Network error' } on script error or after a ~12s
  // timeout, which keeps the existing error and retry UI working.
  function jsonp(params, cb) {
    var name = '__msccCb_' + (++jsonpCounter) + '_' + Date.now();
    var script = document.createElement('script');
    var timeoutId = null;
    var settled = false;

    function cleanup() {
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      if (script && script.parentNode) {
        script.parentNode.removeChild(script);
      }
      try { delete window[name]; } catch (e) { window[name] = undefined; }
    }

    function done(data) {
      if (settled) return;
      settled = true;
      cleanup();
      try { cb(data); } catch (e) { console.warn('JSONP cb error:', e); }
    }

    window[name] = function (data) { done(data); };

    script.onerror = function () {
      done({ ok: false, error: 'Network error' });
    };

    timeoutId = setTimeout(function () {
      done({ ok: false, error: 'Network error' });
    }, 12000);

    var qs = [];
    Object.keys(params).forEach(function (k) {
      var v = params[k];
      if (v == null) v = '';
      qs.push(encodeURIComponent(k) + '=' + encodeURIComponent(v));
    });
    qs.push('callback=' + encodeURIComponent(name));
    qs.push('_t=' + Date.now());

    script.src = API_URL + '?' + qs.join('&');
    document.body.appendChild(script);
  }

  function init() {
    input = document.getElementById('scoring-code-input');
    btn = document.getElementById('scoring-enter-btn');
    errorEl = document.getElementById('scoring-error');
    resultsEl = document.getElementById('scoring-results');
    codeLabel = document.getElementById('scoring-group-code');
    startHoleEl = document.getElementById('scoring-start-hole');
    roundLabel = document.getElementById('scoring-round-label');

    currentHoleEl = document.getElementById('scoring-current-hole');
    currentParEl = document.getElementById('scoring-current-par');
    prevBtn = document.getElementById('scoring-prev-hole');
    nextBtn = document.getElementById('scoring-next-hole');
    playersList = document.getElementById('scoring-players-list');

    theadRow = document.getElementById('scoring-overview-thead-row');
    tbody = document.getElementById('scoring-tbody');

    if (!input || !btn) return;

    // Force uppercase while preserving caret position.
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

    if (prevBtn) prevBtn.addEventListener('click', function () { changeHole(-1); });
    if (nextBtn) nextBtn.addEventListener('click', function () { changeHole(1); });

    initLeaderboard();
  }

  // ---------- Lookup ----------

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

    jsonp({ action: 'card', code: code }, function (data) {
      btn.disabled = false;
      btn.textContent = originalText;

      // Network failure path (script error or 12s timeout).
      if (data && data.error === 'Network error' && !data.ok) {
        console.warn('Scoring jsonp network error');
        showError("Couldn't load right now. Try again in a moment.");
        hideResults();
        return;
      }
      // Server-rejected path.
      if (!data || !data.ok) {
        showError('Group code not found. Double check and try again.');
        hideResults();
        return;
      }
      // Success.
      pendingRetry = {};
      errorByPlayer = {};
      currentCard = data.card;
      currentHole = (currentCard && currentCard.startHole) ? currentCard.startHole : 1;
      renderAll();
      resultsEl.classList.remove('hidden');
      // Fetch hole config (par + max per hole) in the background.
      loadHoleConfig();
    });
  }

  // ---------- Hole config ----------

  function loadHoleConfig() {
    jsonp({ action: 'health' }, function (data) {
      if (!data || !data.ok || !Array.isArray(data.holes)) {
        console.warn('Hole config error:', data);
        return;
      }
      holeConfig = {};
      data.holes.forEach(function (h) {
        holeConfig[h.hole] = {
          par: h.par,
          maxPerHole: h.maxPerHole || DEFAULT_MAX_PER_HOLE
        };
      });
      renderEntryPanel();
    });
  }

  // ---------- Navigation ----------

  function changeHole(delta) {
    // 1..18 with wrap.
    currentHole = ((currentHole - 1 + delta) % 18 + 18) % 18 + 1;
    renderEntryPanel();
    renderOverview();
  }

  // ---------- Rendering ----------

  function renderAll() {
    if (!currentCard) return;
    codeLabel.textContent = currentCard.code || '';
    startHoleEl.textContent = currentCard.startHole != null ? currentCard.startHole : '--';

    var roundParts = [];
    if (currentCard.round) roundParts.push(currentCard.round);
    if (currentCard.type) roundParts.push(currentCard.type);
    roundLabel.textContent = roundParts.join(' • '); // bullet, not em dash

    renderEntryPanel();
    renderOverview();
  }

  function renderEntryPanel() {
    if (!currentCard || !playersList) return;

    currentHoleEl.textContent = currentHole;
    var cfg = holeConfig[currentHole];
    currentParEl.textContent = (cfg && cfg.par != null) ? cfg.par : '--';
    var maxBtns = (cfg && cfg.maxPerHole) ? cfg.maxPerHole : DEFAULT_MAX_PER_HOLE;

    playersList.innerHTML = '';
    var members = currentCard.members || [];
    members.forEach(function (player) {
      var row = document.createElement('div');
      row.className = 'bg-white rounded-2xl p-4 md:p-5 shadow-md border border-mscc-black/5';

      var scores = player.scores || {};
      var currentScoreRaw = scores[String(currentHole)];
      var currentScoreNum = (currentScoreRaw != null && currentScoreRaw !== '')
        ? parseInt(currentScoreRaw, 10)
        : null;

      var err = errorByPlayer[player.playerId];
      var hasErrorHere = err && err.hole === currentHole;
      var retry = pendingRetry[player.playerId];
      var hasRetryHere = retry && retry.hole === currentHole;

      // Header line: name + handicap.
      var hcpVal = (player.handicap != null && player.handicap !== '')
        ? escapeHtml(String(player.handicap))
        : '--';

      var html = '' +
        '<div class="flex items-center justify-between mb-3 gap-3">' +
          '<h4 class="font-semibold text-mscc-black truncate">' + escapeHtml(player.name || '') + '</h4>' +
          '<span class="text-mscc-black/50 text-xs uppercase tracking-wider whitespace-nowrap">Hcp ' +
            '<span class="text-mscc-black font-semibold">' + hcpVal + '</span>' +
          '</span>' +
        '</div>';

      // Score buttons.
      html += '<div class="flex flex-wrap gap-2">';
      for (var s = 1; s <= maxBtns; s++) {
        var isSelected = (currentScoreNum === s);
        var base = 'w-12 h-12 rounded-lg font-bold text-lg transition-colors border-2 active:scale-95 ';
        var skin = isSelected
          ? 'bg-mscc-red text-white border-mscc-red'
          : 'bg-mscc-cream text-mscc-black border-mscc-black/10 hover:border-mscc-red';
        html += '<button type="button" data-strokes="' + s + '" data-player="' +
          escapeHtml(player.playerId) + '" class="score-btn ' + base + skin + '" aria-pressed="' +
          (isSelected ? 'true' : 'false') + '">' + s + '</button>';
      }
      html += '</div>';

      // Status line (error or retry).
      if (hasErrorHere) {
        html += '<p class="mt-3 text-mscc-red text-xs font-semibold">' +
          escapeHtml(err.message) + '</p>';
      } else if (hasRetryHere) {
        html += '<button type="button" data-player-retry="' + escapeHtml(player.playerId) +
          '" class="mt-3 inline-flex items-center gap-1.5 text-mscc-red text-xs font-semibold hover:underline active:scale-95">' +
          '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>' +
          "Didn't save. Tap to retry." +
          '</button>';
      }

      row.innerHTML = html;
      playersList.appendChild(row);
    });

    // Wire taps after render.
    playersList.querySelectorAll('.score-btn').forEach(function (b) {
      b.addEventListener('click', function () {
        var pid = b.getAttribute('data-player');
        var strokes = parseInt(b.getAttribute('data-strokes'), 10);
        onScoreTap(pid, strokes);
      });
    });
    playersList.querySelectorAll('[data-player-retry]').forEach(function (b) {
      b.addEventListener('click', function () {
        var pid = b.getAttribute('data-player-retry');
        retryWrite(pid);
      });
    });
  }

  function renderOverview() {
    if (!currentCard || !theadRow || !tbody) return;

    var thBase = 'px-3 py-3 text-center font-semibold uppercase tracking-wider text-xs';

    var thead = '' +
      '<th class="sticky left-0 bg-mscc-black px-4 py-3 text-left font-semibold uppercase tracking-wider text-xs z-10 whitespace-nowrap">Player</th>' +
      '<th class="' + thBase + '">Hcp</th>';
    for (var h = 1; h <= 18; h++) {
      var cls = thBase + (h === currentHole ? ' bg-mscc-gold text-mscc-black' : '');
      thead += '<th class="' + cls + '">' + h + '</th>';
    }
    thead += '<th class="' + thBase + ' bg-mscc-red">Total</th>';
    thead += '<th class="' + thBase + '">Thru</th>';
    theadRow.innerHTML = thead;

    tbody.innerHTML = '';
    var members = currentCard.members || [];
    members.forEach(function (player) {
      var row = document.createElement('tr');
      row.className = 'hover:bg-mscc-cream/30';

      var scores = player.scores || {};
      var hcp = (player.handicap != null && player.handicap !== '')
        ? escapeHtml(String(player.handicap))
        : '--';

      var cells = '' +
        '<td class="sticky left-0 bg-white px-4 py-3 font-semibold text-mscc-black whitespace-nowrap z-10 border-r border-mscc-black/5">' +
          escapeHtml(player.name || '') +
        '</td>' +
        '<td class="px-3 py-3 text-center text-mscc-black/60">' + hcp + '</td>';

      for (var h2 = 1; h2 <= 18; h2++) {
        var s = scores[String(h2)];
        var val = (s != null && s !== '') ? escapeHtml(String(s)) : '';
        var cellCls = 'px-3 py-3 text-center text-mscc-black' +
          (h2 === currentHole ? ' bg-mscc-gold/15 font-semibold' : '');
        cells += '<td class="' + cellCls + '">' + val + '</td>';
      }

      cells += '<td class="px-3 py-3 text-center font-bold text-mscc-red bg-mscc-red/5">' +
        (player.total != null ? escapeHtml(String(player.total)) : '0') + '</td>';
      cells += '<td class="px-3 py-3 text-center text-mscc-black/60">' +
        (player.thru != null ? escapeHtml(String(player.thru)) : '0') + '</td>';

      row.innerHTML = cells;
      tbody.appendChild(row);
    });
  }

  // ---------- Score entry ----------

  function onScoreTap(playerId, strokes) {
    if (!currentCard) return;
    var player = findPlayer(playerId);
    if (!player) return;

    var existingRaw = (player.scores || {})[String(currentHole)];
    var existingNum = (existingRaw != null && existingRaw !== '')
      ? parseInt(existingRaw, 10)
      : null;

    // Tapping the highlighted number again clears the score.
    var newStrokes = (existingNum === strokes) ? CLEAR_STROKES : strokes;

    // Snapshot for revert on server rejection.
    var snapshot = existingRaw;

    applyLocalScore(player, currentHole, newStrokes);
    recomputePlayerTotals(player);

    // Clear any stale status for this player.
    delete errorByPlayer[playerId];
    delete pendingRetry[playerId];

    renderEntryPanel();
    renderOverview();

    submitScore(currentCard.code, playerId, currentHole, newStrokes)
      .then(function (data) {
        if (data && data.ok) {
          // Successful save. Keep the optimistic value already applied to
          // currentCard locally. Do NOT replace currentCard with data.card,
          // because concurrent saves can race: a slower save's response may
          // not include a faster save's tap, which would briefly clear that
          // selection and cause a flicker. Pending and error state for this
          // player were cleared at the start of this handler, so the visible
          // state is already correct.
          return;
        }
        // Server rejected. Revert and surface the message.
        revertScore(player, currentHole, snapshot);
        recomputePlayerTotals(player);
        var msg = (data && data.error) ? data.error : 'Score rejected.';
        errorByPlayer[playerId] = { hole: currentHole, message: msg };
        renderEntryPanel();
        renderOverview();
      })
      .catch(function (err) {
        console.warn('submitScore error:', err);
        // Network failure. Keep the optimistic value, offer a retry.
        pendingRetry[playerId] = { hole: currentHole, strokes: newStrokes };
        renderEntryPanel();
      });
  }

  function retryWrite(playerId) {
    if (!currentCard) return;
    var pending = pendingRetry[playerId];
    if (!pending) return;
    delete pendingRetry[playerId];
    renderEntryPanel();

    submitScore(currentCard.code, playerId, pending.hole, pending.strokes)
      .then(function (data) {
        if (data && data.ok) {
          // Successful save. Keep the optimistic value. See onScoreTap for why.
          // The pending retry indicator was already cleared at the top of
          // retryWrite, so the visible state is already correct.
          return;
        }
        var msg = (data && data.error) ? data.error : 'Score rejected.';
        // Revert the optimistic value since server now rejects it.
        var player = findPlayer(playerId);
        if (player) {
          applyLocalScore(player, pending.hole, CLEAR_STROKES);
          recomputePlayerTotals(player);
        }
        errorByPlayer[playerId] = { hole: pending.hole, message: msg };
        renderEntryPanel();
        renderOverview();
      })
      .catch(function (err) {
        console.warn('retry error:', err);
        pendingRetry[playerId] = pending;
        renderEntryPanel();
      });
  }

  function submitScore(code, playerId, hole, strokes) {
    // JSONP under the hood. The helper's network-error sentinel is mapped to
    // a Promise rejection so onScoreTap/retryWrite's .catch() retry path keeps
    // firing for true network failures, while real server responses (including
    // ok:false) flow through .then().
    return new Promise(function (resolve, reject) {
      jsonp({
        action: 'submitScore',
        code: code,
        playerId: playerId,
        hole: hole,
        strokes: strokes
      }, function (data) {
        if (data && data.error === 'Network error' && !data.ok && !data.card) {
          reject(new Error('Network error'));
          return;
        }
        resolve(data);
      });
    });
  }

  // ---------- Leaderboard ----------

  function initLeaderboard() {
    tabEnterBtn = document.getElementById('scoring-tab-enter');
    tabLbBtn = document.getElementById('scoring-tab-leaderboard');
    enterViewEl = document.getElementById('scoring-enter-view');
    lbViewEl = document.getElementById('scoring-leaderboard-view');
    lbRoundEl = document.getElementById('scoring-lb-round');
    lbUpdatedEl = document.getElementById('scoring-lb-updated');
    lbLoadingEl = document.getElementById('scoring-lb-loading');
    lbEmptyEl = document.getElementById('scoring-lb-empty');
    lbTableWrapEl = document.getElementById('scoring-lb-table-wrap');
    lbTbodyEl = document.getElementById('scoring-lb-tbody');
    lbFullscreenBtn = document.getElementById('scoring-lb-fullscreen');
    lbFullscreenOverlay = document.getElementById('scoring-lb-fullscreen-overlay');
    lbFsRoundEl = document.getElementById('scoring-lb-fs-round');
    lbFsUpdatedEl = document.getElementById('scoring-lb-fs-updated');
    lbFsTbodyEl = document.getElementById('scoring-lb-fs-tbody');
    lbCloseFsBtn = document.getElementById('scoring-lb-close-fullscreen');

    if (!tabEnterBtn || !tabLbBtn) return;

    tabEnterBtn.addEventListener('click', function () { setView('enter'); });
    tabLbBtn.addEventListener('click', function () { setView('leaderboard'); });

    if (lbFullscreenBtn) lbFullscreenBtn.addEventListener('click', openFullscreen);
    if (lbCloseFsBtn) lbCloseFsBtn.addEventListener('click', closeFullscreen);

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && lbFullscreenOpen) closeFullscreen();
    });

    // Stop polling when the user navigates away from the Scoring tab; resume
    // when they come back, but only if they had the leaderboard view active.
    window.addEventListener('hashchange', function () {
      if (window.location.hash !== '#scoring') {
        stopLbPolling();
      } else if (lbView === 'leaderboard') {
        startLbPolling();
      }
    });
  }

  function setView(view) {
    lbView = view;
    if (view === 'leaderboard') {
      if (enterViewEl) enterViewEl.classList.add('hidden');
      if (lbViewEl) lbViewEl.classList.remove('hidden');
      setToggleActive(tabLbBtn, tabEnterBtn);
      startLbPolling();
      // If we already have data, render immediately while the next poll runs.
      if (lastLeaderboard) renderLeaderboard();
    } else {
      if (enterViewEl) enterViewEl.classList.remove('hidden');
      if (lbViewEl) lbViewEl.classList.add('hidden');
      setToggleActive(tabEnterBtn, tabLbBtn);
      stopLbPolling();
    }
  }

  function setToggleActive(activeBtn, inactiveBtn) {
    if (activeBtn) {
      activeBtn.classList.add('bg-mscc-red', 'text-white');
      activeBtn.classList.remove('text-mscc-black/60', 'hover:text-mscc-black');
    }
    if (inactiveBtn) {
      inactiveBtn.classList.remove('bg-mscc-red', 'text-white');
      inactiveBtn.classList.add('text-mscc-black/60', 'hover:text-mscc-black');
    }
  }

  function startLbPolling() {
    if (lbPollingInterval !== null) return;
    fetchLeaderboard();
    lbPollingInterval = setInterval(fetchLeaderboard, 30000);
  }

  function stopLbPolling() {
    if (lbPollingInterval !== null) {
      clearInterval(lbPollingInterval);
      lbPollingInterval = null;
    }
  }

  function fetchLeaderboard() {
    jsonp({ action: 'leaderboard' }, function (data) {
      if (data && data.error === 'Network error' && !data.ok) {
        console.warn('Leaderboard jsonp network error');
        return;
      }
      if (!data || !data.ok || !data.leaderboard) {
        console.warn('Leaderboard response invalid:', data);
        return;
      }
      lastLeaderboard = data.leaderboard;
      lastLeaderboardAt = new Date();
      renderLeaderboard();
    });
  }

  function renderLeaderboard() {
    if (!lastLeaderboard) return;
    var players = lastLeaderboard.players || [];

    var anyStarted = false;
    for (var i = 0; i < players.length; i++) {
      if (players[i].started === true) { anyStarted = true; break; }
    }

    var roundText = lastLeaderboard.round
      ? lastLeaderboard.round.charAt(0) + lastLeaderboard.round.slice(1).toLowerCase() + ' Leaderboard'
      : 'Leaderboard';
    if (lbRoundEl) lbRoundEl.textContent = roundText;
    if (lbFsRoundEl) lbFsRoundEl.textContent = roundText;

    var stamp = formatUpdated(lastLeaderboardAt);
    if (lbUpdatedEl) lbUpdatedEl.textContent = stamp;
    if (lbFsUpdatedEl) lbFsUpdatedEl.textContent = stamp;

    if (lbLoadingEl) lbLoadingEl.classList.add('hidden');

    if (!anyStarted) {
      if (lbEmptyEl) lbEmptyEl.classList.remove('hidden');
      if (lbTableWrapEl) lbTableWrapEl.classList.add('hidden');
      if (lbFullscreenBtn) lbFullscreenBtn.classList.add('hidden');
      if (lbFullscreenOpen) closeFullscreen();
      return;
    }

    if (lbEmptyEl) lbEmptyEl.classList.add('hidden');
    if (lbTableWrapEl) lbTableWrapEl.classList.remove('hidden');
    if (lbFullscreenBtn) lbFullscreenBtn.classList.remove('hidden');

    renderLeaderboardRows(lbTbodyEl, false);
    if (lbFullscreenOpen) renderLeaderboardRows(lbFsTbodyEl, true);
  }

  function renderLeaderboardRows(tbodyEl, large) {
    if (!tbodyEl || !lastLeaderboard) return;
    var players = lastLeaderboard.players || [];
    var cutSize = lastLeaderboard.cutSize || 0;
    var hasCutLine = cutSize > 0 && players.length > cutSize;

    tbodyEl.innerHTML = '';
    players.forEach(function (p) {
      var aboveCut = (cutSize > 0 && p.pos <= cutSize);
      var belowCut = (hasCutLine && p.pos > cutSize);

      var net = formatNet(p);
      var thru = (p.started === false) ? '-' : String(p.thru != null ? p.thru : 0);
      var hcp = (p.handicap != null && p.handicap !== '') ? String(p.handicap) : '-';

      var row = document.createElement('tr');
      var sizeCls;

      if (large) {
        sizeCls = 'py-4 md:py-5 text-xl md:text-3xl';
        row.className = (aboveCut ? 'bg-white/5 ' : (belowCut ? 'opacity-50 ' : '')) + 'border-b border-white/10';
        row.innerHTML = '' +
          '<td class="px-4 ' + sizeCls + ' text-center font-bold text-mscc-gold">' + escapeHtml(String(p.pos)) + '</td>' +
          '<td class="px-4 ' + sizeCls + ' text-left font-semibold text-mscc-cream truncate">' + escapeHtml(p.name || '') + '</td>' +
          '<td class="px-4 ' + sizeCls + ' text-center text-mscc-cream/60">' + escapeHtml(hcp) + '</td>' +
          '<td class="px-4 ' + sizeCls + ' text-center text-mscc-cream">' + escapeHtml(thru) + '</td>' +
          '<td class="px-4 ' + sizeCls + ' text-center font-bold text-mscc-red">' + escapeHtml(net) + '</td>';
      } else {
        sizeCls = 'py-3 text-sm';
        row.className = aboveCut ? 'bg-mscc-gold/10' : (belowCut ? 'opacity-60' : '');
        row.innerHTML = '' +
          '<td class="px-2 ' + sizeCls + ' text-center font-bold text-mscc-black">' + escapeHtml(String(p.pos)) + '</td>' +
          '<td class="px-3 ' + sizeCls + ' font-semibold text-mscc-black truncate">' + escapeHtml(p.name || '') + '</td>' +
          '<td class="px-2 ' + sizeCls + ' text-center text-mscc-black/60">' + escapeHtml(hcp) + '</td>' +
          '<td class="px-2 ' + sizeCls + ' text-center text-mscc-black">' + escapeHtml(thru) + '</td>' +
          '<td class="px-2 ' + sizeCls + ' text-center font-bold text-mscc-red bg-mscc-red/5">' + escapeHtml(net) + '</td>';
      }
      tbodyEl.appendChild(row);

      if (hasCutLine && p.pos === cutSize) {
        var cutRow = document.createElement('tr');
        var cutText = 'Cut Line. Top ' + cutSize + ' advance.';
        if (large) {
          cutRow.innerHTML = '<td colspan="5" class="bg-mscc-red text-mscc-cream px-4 py-3 md:py-4 text-center font-western text-base md:text-2xl uppercase tracking-[0.2em]">' + escapeHtml(cutText) + '</td>';
        } else {
          cutRow.innerHTML = '<td colspan="5" class="bg-mscc-red text-mscc-cream px-4 py-2 text-center font-western text-xs uppercase tracking-[0.2em]">' + escapeHtml(cutText) + '</td>';
        }
        tbodyEl.appendChild(cutRow);
      }
    });
  }

  function formatNet(p) {
    if (!p || p.started === false) return '-';
    var n = p.netDisplay;
    if (n == null || n === '') return '-';
    if (typeof n !== 'number') {
      var parsed = parseInt(n, 10);
      if (isNaN(parsed)) return String(n);
      n = parsed;
    }
    if (n === 0) return 'E';
    if (n < 0) return String(n);
    return '+' + n;
  }

  function formatUpdated(d) {
    if (!d) return '';
    var h = String(d.getHours()).padStart(2, '0');
    var m = String(d.getMinutes()).padStart(2, '0');
    return 'Updated ' + h + ':' + m;
  }

  function openFullscreen() {
    if (!lbFullscreenOverlay || !lastLeaderboard) return;
    lbFullscreenOpen = true;
    lbFullscreenOverlay.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    renderLeaderboardRows(lbFsTbodyEl, true);
  }

  function closeFullscreen() {
    if (!lbFullscreenOverlay) return;
    lbFullscreenOpen = false;
    lbFullscreenOverlay.classList.add('hidden');
    document.body.style.overflow = '';
  }

  // ---------- Helpers ----------

  function applyLocalScore(player, hole, strokes) {
    if (!player.scores) player.scores = {};
    if (strokes === CLEAR_STROKES) {
      delete player.scores[String(hole)];
    } else {
      player.scores[String(hole)] = strokes;
    }
  }

  function revertScore(player, hole, snapshot) {
    if (!player.scores) player.scores = {};
    if (snapshot != null && snapshot !== '') {
      player.scores[String(hole)] = snapshot;
    } else {
      delete player.scores[String(hole)];
    }
  }

  function recomputePlayerTotals(player) {
    var scores = player.scores || {};
    var total = 0;
    var thru = 0;
    for (var h = 1; h <= 18; h++) {
      var s = scores[String(h)];
      if (s != null && s !== '') {
        total += parseInt(s, 10) || 0;
        thru++;
      }
    }
    player.total = total;
    player.thru = thru;
  }

  function findPlayer(playerId) {
    var members = (currentCard && currentCard.members) || [];
    for (var i = 0; i < members.length; i++) {
      if (members[i].playerId === playerId) return members[i];
    }
    return null;
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
