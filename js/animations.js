(function () {
  'use strict';

  var prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function init() {
    initScrollReveal();
    initStatCounters();
  }

  function initScrollReveal() {
    var reveals = document.querySelectorAll('.reveal');
    if (!reveals.length) return;

    // If reduced motion, show everything immediately
    if (prefersReducedMotion) {
      reveals.forEach(function (el) {
        el.classList.add('revealed');
      });
      return;
    }

    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add('revealed');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.1, rootMargin: '0px 0px -40px 0px' }
    );

    reveals.forEach(function (el) {
      observer.observe(el);
    });
  }

  function initStatCounters() {
    var statNumbers = document.querySelectorAll('.stat-number');
    if (!statNumbers.length) return;

    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            animateCounter(entry.target);
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.5 }
    );

    statNumbers.forEach(function (el) {
      observer.observe(el);
    });
  }

  function animateCounter(el) {
    var target = parseInt(el.dataset.target, 10);
    if (isNaN(target)) return;

    var prefix = el.dataset.prefix || '';
    var suffix = el.dataset.suffix || '';

    // Skip animation if reduced motion preferred
    if (prefersReducedMotion || !window.anime) {
      el.textContent = prefix + target.toLocaleString() + suffix;
      return;
    }

    var obj = { val: 0 };
    anime({
      targets: obj,
      val: target,
      duration: 2000,
      easing: 'easeOutExpo',
      round: 1,
      update: function () {
        var current = Math.round(obj.val);
        el.textContent = prefix + current.toLocaleString() + suffix;
      },
    });
  }

  document.addEventListener('DOMContentLoaded', init);
})();
