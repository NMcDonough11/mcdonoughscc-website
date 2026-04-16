(function () {
  'use strict';

  const TABS = ['home', 'the-day', 'the-course', 'sponsors', 'volunteer', 'register'];
  const DEFAULT_TAB = 'home';
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const sections = {};
  const navLinks = {};

  function init() {
    // Cache tab sections
    TABS.forEach(tab => {
      sections[tab] = document.getElementById(tab);
    });

    // Cache all nav links (desktop, mobile menu, bottom nav)
    document.querySelectorAll('[data-tab]').forEach(link => {
      const tabName = link.dataset.tab;
      if (!navLinks[tabName]) navLinks[tabName] = [];
      navLinks[tabName].push(link);

      link.addEventListener('click', (e) => {
        e.preventDefault();
        navigateTo(tabName);
        window.location.hash = tabName;
      });
    });

    // Hamburger menu toggle
    const hamburger = document.getElementById('hamburger-btn');
    const mobileMenu = document.getElementById('mobile-menu');
    if (hamburger && mobileMenu) {
      hamburger.addEventListener('click', () => {
        const isOpen = !mobileMenu.classList.contains('hidden');
        mobileMenu.classList.toggle('hidden');
        hamburger.classList.toggle('hamburger-open');
        hamburger.setAttribute('aria-expanded', String(!isOpen));
      });

      // Close mobile menu on nav click
      mobileMenu.querySelectorAll('[data-tab]').forEach(link => {
        link.addEventListener('click', () => {
          mobileMenu.classList.add('hidden');
          hamburger.classList.remove('hamburger-open');
          hamburger.setAttribute('aria-expanded', 'false');
        });
      });
    }

    // Handle browser back/forward
    window.addEventListener('hashchange', () => {
      navigateTo(getTabFromHash());
    });

    // Handle CTA links that point to tabs (e.g., href="#register")
    document.querySelectorAll('a[href^="#"]').forEach(link => {
      const hash = link.getAttribute('href').slice(1);
      if (TABS.includes(hash) && !link.dataset.tab) {
        link.addEventListener('click', (e) => {
          e.preventDefault();
          navigateTo(hash);
          window.location.hash = hash;
        });
      }
    });

    // FAQ accordion
    initFAQ();

    // Lightbox
    initLightbox();

    // Photo carousel
    initCarousel();

    // Form double-submit prevention
    initForms();

    // Initial navigation
    navigateTo(getTabFromHash());
  }

  function getTabFromHash() {
    const hash = window.location.hash.slice(1);
    return TABS.includes(hash) ? hash : DEFAULT_TAB;
  }

  function navigateTo(tabName) {
    var transitionDuration = prefersReducedMotion ? 0 : 350;

    // Hide all sections, update ARIA
    TABS.forEach(tab => {
      const section = sections[tab];
      if (!section) return;

      if (tab === tabName) {
        section.style.display = 'block';
        section.setAttribute('aria-hidden', 'false');
        requestAnimationFrame(() => {
          section.classList.add('active');
          section.style.opacity = '1';
        });
      } else {
        section.classList.remove('active');
        section.style.opacity = '0';
        section.setAttribute('aria-hidden', 'true');
        setTimeout(() => {
          if (!section.classList.contains('active')) {
            section.style.display = 'none';
          }
        }, transitionDuration);
      }
    });

    // Update nav active states + ARIA
    Object.entries(navLinks).forEach(([tab, links]) => {
      links.forEach(link => {
        var isActive = tab === tabName;
        link.classList.toggle('active', isActive);
        if (link.hasAttribute('aria-selected')) {
          link.setAttribute('aria-selected', String(isActive));
        }
      });
    });

    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'instant' });
  }

  function initFAQ() {
    document.querySelectorAll('.faq-trigger').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var item = btn.closest('.faq-item');
        var isOpen = item.classList.contains('open');
        item.classList.toggle('open');
        btn.setAttribute('aria-expanded', String(!isOpen));
      });
    });
  }

  function initLightbox() {
    const lightbox = document.getElementById('lightbox');
    const lightboxImg = document.getElementById('lightbox-img');
    if (!lightbox || !lightboxImg) return;

    // Click gallery images to open
    document.querySelectorAll('[data-lightbox]').forEach(img => {
      img.classList.add('cursor-pointer');
      img.setAttribute('tabindex', '0');
      img.setAttribute('role', 'button');
      img.setAttribute('aria-label', 'View photo');

      function openLightbox() {
        lightboxImg.src = img.dataset.lightbox || img.querySelector('img')?.src || '';
        lightboxImg.alt = img.alt || 'Gallery photo';
        lightbox.classList.remove('hidden');
        lightbox.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';
      }

      img.addEventListener('click', openLightbox);
      img.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openLightbox();
        }
      });
    });

    function closeLightbox() {
      lightbox.classList.add('hidden');
      lightbox.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';
    }

    // Close on click
    lightbox.addEventListener('click', closeLightbox);

    // Close on Escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !lightbox.classList.contains('hidden')) {
        closeLightbox();
      }
    });
  }

  function initCarousel() {
    setupCarousel('photo-carousel', 'carousel-prev', 'carousel-next', 4000);
    setupCarousel('course-carousel', 'course-carousel-prev', 'course-carousel-next', 5000);
  }

  function setupCarousel(carouselId, prevId, nextId, interval) {
    var carousel = document.getElementById(carouselId);
    var prevBtn = document.getElementById(prevId);
    var nextBtn = document.getElementById(nextId);
    if (!carousel) return;

    var scrollAmount = 320;

    if (prevBtn) {
      prevBtn.addEventListener('click', function () {
        carousel.scrollBy({ left: -scrollAmount, behavior: 'smooth' });
      });
    }
    if (nextBtn) {
      nextBtn.addEventListener('click', function () {
        carousel.scrollBy({ left: scrollAmount, behavior: 'smooth' });
      });
    }

    // Auto-scroll (pause on hover/touch)
    var autoScrollInterval = null;
    function startAutoScroll() {
      autoScrollInterval = setInterval(function () {
        if (carousel.scrollLeft + carousel.clientWidth >= carousel.scrollWidth - 10) {
          carousel.scrollTo({ left: 0, behavior: 'smooth' });
        } else {
          carousel.scrollBy({ left: scrollAmount, behavior: 'smooth' });
        }
      }, interval);
    }
    function stopAutoScroll() {
      clearInterval(autoScrollInterval);
    }

    startAutoScroll();
    carousel.addEventListener('mouseenter', stopAutoScroll);
    carousel.addEventListener('mouseleave', startAutoScroll);
    carousel.addEventListener('touchstart', stopAutoScroll, { passive: true });
    carousel.addEventListener('touchend', function () {
      setTimeout(startAutoScroll, 3000);
    });
  }

  // *** PASTE YOUR GOOGLE APPS SCRIPT WEB APP URL HERE ***
  var APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzgjbTWLXZ4HfjGtklMm9dtDKn1Yt38bpfT6hRG3r0AYPRFZxbDbIBKobFL2S7Mv5SShg/exec';

  function initForms() {
    ['volunteer-form', 'register-form'].forEach(function (formId) {
      var form = document.getElementById(formId);
      if (!form) return;

      var formType = formId === 'volunteer-form' ? 'volunteer' : 'register';

      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var submitBtn = form.querySelector('button[type="submit"]');
        if (submitBtn.disabled) return;

        // Disable button to prevent double submit
        submitBtn.disabled = true;
        var originalText = submitBtn.textContent;
        submitBtn.textContent = 'Submitting...';

        // Collect form data as JSON
        var formData = new FormData(form);
        var data = { formType: formType };
        formData.forEach(function (value, key) {
          // Handle multi-select checkboxes (roles, availability)
          if (data[key]) {
            data[key] = data[key] + ', ' + value;
          } else {
            data[key] = value;
          }
        });

        // If no Apps Script URL configured, show success after delay
        if (!APPS_SCRIPT_URL) {
          setTimeout(function () { showSuccess(form, formId); }, 800);
          return;
        }

        // Submit to Google Apps Script
        fetch(APPS_SCRIPT_URL, {
          method: 'POST',
          mode: 'no-cors',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        })
          .then(function () {
            showSuccess(form, formId);
          })
          .catch(function () {
            submitBtn.disabled = false;
            submitBtn.textContent = originalText;
            alert('Something went wrong. Please email mcdonoughscc@gmail.com directly.');
          });
      });
    });
  }

  function showSuccess(form, formId) {
    form.classList.add('hidden');
    var successId = formId.replace('-form', '-success');
    var successEl = document.getElementById(successId);
    if (successEl) successEl.classList.remove('hidden');
  }

  // Expose navigation for other modules
  window.MSCC = window.MSCC || {};
  window.MSCC.navigateTo = navigateTo;

  document.addEventListener('DOMContentLoaded', init);
})();
