/* ==========================================================================
   animations.js — CV Ramzi Bougdar
   The ONLY motion module (constitution, principle IX). The only file that uses GSAP.
   - Inert if GSAP failed to load (blocked CDN, invalid SRI): nothing is hidden.
   - All motion lives inside gsap.matchMedia(): under prefers-reduced-motion: reduce,
     GSAP reverts everything and the content returns to its final state.
   - Transform and opacity only. M1–M17 catalogue: specs/002-refonte-ui-ux/spec.md.
   - Hooks: data-anim attributes (contracts/dom-rendu.md).
   ========================================================================== */

(function () {
  'use strict';

  /* --------------------------------------------------------------------------
     Motion constants (mirror of the --d-* and --ease-* tokens of css/tokens.css)
     -------------------------------------------------------------------------- */

  /** Durations in seconds. */
  var DURATIONS = { instant: 0.1, fast: 0.18, medium: 0.3, slow: 0.6, scene: 0.9 };

  /** GSAP easings (equivalents of the CSS cubic-bezier curves). */
  var EASE = { out: 'power2.out', expressive: 'expo.out', toggle: 'power2.inOut', pop: 'back.out(2)' };

  /** Stagger: gap between elements and maximum total length of a group. */
  var STAGGER = { each: 0.07, max: 0.45 };

  var root = document.documentElement;
  var params = new URLSearchParams(window.location.search);

  /** ?final: immediate final state (screenshots, review). ?pdf: PDF generation. */
  var NO_MOTION = params.has('final') || /[?&]pdf\b/.test(window.location.search);

  if (!window.gsap || !window.ScrollTrigger) return;
  gsap.registerPlugin(ScrollTrigger);

  /** Shared "reduced motion" query. */
  var calmQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

  /**
   * Tells whether an animation may be played now.
   * @returns {boolean}
   */
  function motionAllowed() {
    return !NO_MOTION && !calmQuery.matches;
  }

  /**
   * Capped stagger: STAGGER.each between items, never more than STAGGER.max in total.
   * @param {number} n number of items
   * @returns {number} gap in seconds
   */
  function gap(n) {
    return n > 1 ? Math.min(STAGGER.each, STAGGER.max / (n - 1)) : 0;
  }

  /**
   * Shortcut: array of the elements matching a selector.
   * @param {string} selector
   * @param {Element} [parent]
   * @returns {Element[]}
   */
  function all(selector, parent) {
    return gsap.utils.toArray(selector, parent);
  }

  /* --------------------------------------------------------------------------
     M10 — Reading progress (an indicator: active even with reduced motion)
     -------------------------------------------------------------------------- */

  /**
   * Links the progress bar to the page scroll (no smoothing).
   */
  function initProgress() {
    var bar = document.querySelector('[data-anim="progress"]');
    if (!bar) return;
    gsap.fromTo(bar, { scaleX: 0 }, {
      scaleX: 1, ease: 'none', transformOrigin: 'left center',
      scrollTrigger: { start: 0, end: 'max', scrub: true }
    });
    root.classList.add('progress-active');
  }

  /* --------------------------------------------------------------------------
     M1, M2 — Bento entrance and counters
     -------------------------------------------------------------------------- */

  /**
   * Plays the orchestrated entrance (the only moment not triggered by the user), ≤ 1.8 s.
   * @returns {gsap.core.Timeline|null}
   */
  function initEntrance() {
    var hero = document.querySelector('[data-anim="hero"]');
    if (!hero) return null;
    var tiles = all('[data-anim="tile"]');
    var tl = gsap.timeline({ defaults: { ease: EASE.out } });

    tl.from('.bar__inner', { opacity: 0, y: -12, duration: DURATIONS.slow }, 0)
      .from(hero, { opacity: 0, y: 16, duration: DURATIONS.slow }, 0)
      .from(all('[data-anim="halo"]'), { opacity: 0, scale: 0.5, duration: 1.2, stagger: 0.1 }, 0.1)
      .from(all('[data-anim="name-letter"]'), { yPercent: 110, duration: DURATIONS.scene, stagger: 0.03, ease: EASE.expressive }, 0.15)
      .from(all('[data-anim="hero-text"]'), { opacity: 0, y: 12, duration: 0.5, stagger: 0.08 }, 0.5)
      .from(tiles, { opacity: 0, y: 16, duration: 0.5, stagger: gap(tiles.length) }, 0.45);

    /* M2: counters from 0 to the computed value. Assistive technologies already read
       the final value (visually hidden text next to it). */
    all('[data-anim="counter"]').forEach(function (el) {
      var target = el.querySelector('[aria-hidden="true"]') || el;
      var value = Number(el.getAttribute('value')) || 0;
      var state = { n: 0 };
      tl.to(state, {
        n: value, duration: 1.2, ease: 'power1.out',
        onUpdate: function () { target.textContent = String(Math.round(state.n)); }
      }, 0.6);
    });
    return tl;
  }

  /* --------------------------------------------------------------------------
     M3, M4 — Pointer responses (mouse only)
     -------------------------------------------------------------------------- */

  /**
   * Halos that follow the pointer inside the hero (±40 px) and 3D tilt of the tiles (±4°).
   * @returns {Function} listener cleanup
   */
  function initPointer() {
    var cleanups = [];
    var hero = document.querySelector('[data-anim="hero"]');

    if (hero) {
      var opts = { duration: DURATIONS.slow, ease: 'power3.out' };   // 0.6 s smoothed follow (M3)
      var halos = all('[data-anim="halo"]').map(function (h, i) {
        return { x: gsap.quickTo(h, 'x', opts), y: gsap.quickTo(h, 'y', opts), dir: i % 2 ? -1 : 1 };
      });
      var move = function (e) {
        var r = hero.getBoundingClientRect();
        var dx = gsap.utils.clamp(-1, 1, (e.clientX - r.left) / r.width * 2 - 1);
        var dy = gsap.utils.clamp(-1, 1, (e.clientY - r.top) / r.height * 2 - 1);
        halos.forEach(function (h) { h.x(dx * 40 * h.dir); h.y(dy * 40); });
      };
      var reset = function () { halos.forEach(function (h) { h.x(0); h.y(0); }); };
      hero.addEventListener('pointermove', move);
      hero.addEventListener('pointerleave', reset);
      cleanups.push(function () {
        hero.removeEventListener('pointermove', move);
        hero.removeEventListener('pointerleave', reset);
      });
    }

    all('[data-anim-tilt]').forEach(function (t) {
      var max = Math.min(4, Number(t.getAttribute('data-anim-tilt')) || 4);
      gsap.set(t, { transformPerspective: 900 });
      var rx = gsap.quickTo(t, 'rotationX', { duration: DURATIONS.medium, ease: EASE.out });
      var ry = gsap.quickTo(t, 'rotationY', { duration: DURATIONS.medium, ease: EASE.out });
      var move = function (e) {
        var r = t.getBoundingClientRect();
        ry(((e.clientX - r.left) / r.width - 0.5) * max * 2);
        rx(-((e.clientY - r.top) / r.height - 0.5) * max * 2);
      };
      var reset = function () {
        gsap.to(t, { rotationX: 0, rotationY: 0, duration: 0.2, ease: EASE.out, overwrite: 'auto' });
      };
      t.addEventListener('pointermove', move);
      t.addEventListener('pointerleave', reset);
      cleanups.push(function () {
        t.removeEventListener('pointermove', move);
        t.removeEventListener('pointerleave', reset);
      });
    });

    return function () { cleanups.forEach(function (f) { f(); }); };
  }

  /* --------------------------------------------------------------------------
     M5 — Staggered reveals on scroll (once)
     -------------------------------------------------------------------------- */

  /**
   * Fade + 16 px rise of the [data-anim="reveal"] groups as they enter the view.
   * Opacity only (no visibility): find-in-page still finds the text.
   */
  function initReveals() {
    var groups = all('[data-anim="reveal"]');
    if (!groups.length) return;
    // Elements already scrolled past on load (anchor, reload) stay visible.
    var toHide = groups.filter(function (el) { return el.getBoundingClientRect().top > window.innerHeight * 0.85; });
    gsap.set(toHide, { opacity: 0, y: 16 });
    ScrollTrigger.batch(toHide, {
      start: 'top 85%',
      once: true,
      onEnter: function (batch) {
        gsap.to(batch, { opacity: 1, y: 0, duration: DURATIONS.slow, ease: EASE.out, stagger: gap(batch.length), overwrite: true });
      }
    });
  }

  /* --------------------------------------------------------------------------
     M7, M8 — Experience timeline
     -------------------------------------------------------------------------- */

  /**
   * Timeline: the line draws itself with the scroll (reversible), nodes light up as it passes.
   */
  function initTimeline() {
    var line = document.querySelector('[data-anim="line"]');
    if (!line) return;
    var container = line.closest('.timeline-frame') || line.parentElement;
    gsap.fromTo(line, { scaleY: 0 }, {
      scaleY: 1, ease: 'none', transformOrigin: 'top center',
      scrollTrigger: { trigger: container, start: 'top 70%', end: 'bottom 70%', scrub: 0.4 }
    });
    // Each node lights up when the line reaches it, and the step date appears with it (reversible).
    all('[data-anim="node"]').forEach(function (node) {
      var step = node.closest('.step');
      var date = step ? step.querySelector('[data-anim="date"]') : null;
      var tl = gsap.timeline({ scrollTrigger: { trigger: node, start: 'top 70%', toggleActions: 'play none none reverse' } });
      tl.fromTo(node, { scale: 0.4, opacity: 0.3 }, { scale: 1, opacity: 1, duration: 0.35, ease: EASE.pop }, 0);
      if (date) tl.fromTo(date, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.35, ease: EASE.out }, 0);
    });
  }

  /* --------------------------------------------------------------------------
     M9, M12, M13 — Responses to actions (events dispatched by main.js)
     -------------------------------------------------------------------------- */

  /**
   * M9: opening/closing a timeline card. The card resizes immediately
   * (no height animation: a layout property); on opening, its missions,
   * redistributed across the columns, fade in (opacity + translation) with a stagger.
   * @param {CustomEvent} e detail { open, apply }
   */
  function onCardToggle(e) {
    if (!motionAllowed()) {
      window.requestAnimationFrame(function () { ScrollTrigger.refresh(); });
      return;
    }
    e.preventDefault();
    e.detail.apply();
    if (e.detail.open) {
      var missions = all('.position__missions li', e.target).filter(function (li) { return !li.hidden; });
      gsap.fromTo(missions, { opacity: 0, y: 6 }, {
        opacity: 1, y: 0, duration: DURATIONS.medium, ease: EASE.out, stagger: Math.min(0.03, gap(missions.length)), overwrite: true,
        clearProps: 'opacity,transform'
      });
    }
    window.requestAnimationFrame(function () { ScrollTrigger.refresh(); });
  }

  /**
   * M12: mobile menu, opening (0.3 s) and faster closing (0.2 s).
   * @param {CustomEvent} e detail { open, apply }
   */
  function onMenuToggle(e) {
    if (!motionAllowed()) return;
    var menu = e.target;
    var links = all('a', menu);
    e.preventDefault();
    if (e.detail.open) {
      e.detail.apply();
      gsap.fromTo(menu, { opacity: 0, y: -8 }, { opacity: 1, y: 0, duration: DURATIONS.medium, ease: EASE.out, clearProps: 'all' });
      gsap.from(links, { opacity: 0, y: -6, duration: DURATIONS.medium, stagger: 0.04, ease: EASE.out, clearProps: 'all' });
    } else {
      gsap.to(menu, {
        opacity: 0, y: -8, duration: 0.2, ease: 'power2.in',
        onComplete: function () { e.detail.apply(); gsap.set(menu, { clearProps: 'all' }); }
      });
    }
  }

  /**
   * M13: theme switch as a cross-fade (View Transitions), rotating icon.
   * Colours are never animated: the fade applies to snapshots (opacity).
   * @param {CustomEvent} e detail { apply }
   */
  function onThemeToggle(e) {
    if (!motionAllowed()) return;
    var icons = all('#theme-button svg');
    gsap.fromTo(icons, { rotation: -90, scale: 0.6 }, { rotation: 0, scale: 1, duration: DURATIONS.medium, ease: EASE.out });
    if (!document.startViewTransition) return;
    e.preventDefault();
    document.startViewTransition(e.detail.apply);
  }

  /* --------------------------------------------------------------------------
     M11 — Navigation scroll to an internal anchor
     -------------------------------------------------------------------------- */

  /**
   * Replaces the anchor jump with a 0.5 to 1 s scroll (depending on distance, power3.inOut),
   * offset by the sticky bar. Focus is moved by main.js; the URL gets the anchor.
   * @param {MouseEvent} evt
   */
  function onAnchorClick(evt) {
    var link = evt.target.closest && evt.target.closest('a[href^="#"]');
    if (!link || !motionAllowed() || evt.defaultPrevented || evt.button !== 0 || evt.metaKey || evt.ctrlKey) return;
    var id = link.getAttribute('href').slice(1);
    var target = id && document.getElementById(id);
    if (!target) return;
    evt.preventDefault();
    var offset = parseFloat(getComputedStyle(root).scrollPaddingTop) || 0;
    var destination = Math.max(0, Math.min(target.getBoundingClientRect().top + window.scrollY - offset,
      root.scrollHeight - window.innerHeight));
    var state = { y: window.scrollY };
    gsap.to(state, {
      y: destination, ease: 'power3.inOut', overwrite: true,
      duration: gsap.utils.clamp(0.5, 1, Math.abs(destination - state.y) / 2500),
      // "instant": otherwise the document's scroll-behavior: smooth would restart a native scroll on every frame.
      onUpdate: function () { window.scrollTo({ top: state.y, behavior: 'instant' }); }
    });
    if (window.history && window.history.pushState) window.history.pushState(null, '', '#' + id);
  }

  /* --------------------------------------------------------------------------
     Start-up
     -------------------------------------------------------------------------- */

  /**
   * Sets up motion once main.js has rendered the CV.
   */
  function start() {
    root.classList.add('gsap-ready');
    initProgress();

    document.addEventListener('card:toggle', onCardToggle);
    document.addEventListener('menu:toggle', onMenuToggle);
    document.addEventListener('theme:toggle', onThemeToggle);
    document.addEventListener('click', onAnchorClick);

    if (NO_MOTION) return;

    var mm = gsap.matchMedia();
    mm.add({
      motion: '(prefers-reduced-motion: no-preference)',
      pointer: '(prefers-reduced-motion: no-preference) and (hover: hover) and (pointer: fine)'
    }, function (context) {
      if (!context.conditions.motion) return undefined;
      root.classList.add('anim-ready');
      // ScrollTriggers created in page order (bento, timeline, reveals).
      initEntrance();
      initTimeline();
      initReveals();
      var cleanupPointer = context.conditions.pointer ? initPointer() : null;
      return function () {
        root.classList.remove('anim-ready');
        if (cleanupPointer) cleanupPointer();
      };
    });

    // Fonts change heights: triggers are recomputed once they are loaded.
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(function () { ScrollTrigger.refresh(); });
    }
  }

  if (root.classList.contains('cv-ready')) start();
  else document.addEventListener('cv:ready', start, { once: true });
})();
