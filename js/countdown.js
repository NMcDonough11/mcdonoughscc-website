(function () {
  'use strict';

  // June 26, 2026, 8:00 AM MDT (UTC-6)
  var TARGET_DATE = new Date('2026-06-26T08:00:00-06:00');

  var els = { days: null, hours: null, mins: null, secs: null };

  function init() {
    els.days = document.getElementById('cd-days');
    els.hours = document.getElementById('cd-hours');
    els.mins = document.getElementById('cd-mins');
    els.secs = document.getElementById('cd-secs');

    if (!els.days) return;

    update();
    setInterval(update, 1000);
  }

  function update() {
    var now = new Date();
    var diff = TARGET_DATE - now;

    if (diff <= 0) {
      setDigit(els.days, '0');
      setDigit(els.hours, '00');
      setDigit(els.mins, '00');
      setDigit(els.secs, '00');

      // Replace countdown with "GAME TIME" message
      var countdown = document.getElementById('countdown');
      if (countdown && !countdown.dataset.done) {
        countdown.dataset.done = 'true';
        countdown.innerHTML = '<div class="text-center"><span class="font-western text-4xl md:text-6xl text-mscc-gold">GAME TIME</span></div>';
      }
      return;
    }

    var days = Math.floor(diff / (1000 * 60 * 60 * 24));
    diff -= days * 1000 * 60 * 60 * 24;
    var hours = Math.floor(diff / (1000 * 60 * 60));
    diff -= hours * 1000 * 60 * 60;
    var mins = Math.floor(diff / (1000 * 60));
    diff -= mins * 1000 * 60;
    var secs = Math.floor(diff / 1000);

    setDigit(els.days, String(days));
    setDigit(els.hours, String(hours).padStart(2, '0'));
    setDigit(els.mins, String(mins).padStart(2, '0'));
    setDigit(els.secs, String(secs).padStart(2, '0'));
  }

  var prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function setDigit(el, value) {
    if (!el || el.textContent === value) return;
    el.textContent = value;

    // Subtle scale on digit change (skip if reduced motion)
    if (window.anime && !prefersReducedMotion) {
      anime({
        targets: el,
        scale: [1.12, 1],
        duration: 300,
        easing: 'easeOutExpo',
      });
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
