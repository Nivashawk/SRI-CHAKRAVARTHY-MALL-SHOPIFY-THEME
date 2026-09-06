/* ---------------------------------------------------------------------------
   Sri Chakravarthy — scroll reveals and counters.

   Mirrors the theme's own idiom (see assets/jumbo-text.js): one
   IntersectionObserver, a reduced-motion guard, and unobserve once fired.

   The hiding is applied only under `html.js-reveal`, which this script adds.
   If the script never runs — blocked, errored, old browser — nothing is hidden
   and the page renders in full. That ordering is the whole safety story.
   --------------------------------------------------------------------------- */
(() => {
  const root = document.documentElement;

  // Reduced motion: leave everything visible and static. No class, no observer.
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  if (!('IntersectionObserver' in window)) return;

  const STAGGER_MS = 60;
  const MAX_STEPS = 6; // a 10-tile grid shouldn't take 600ms to finish arriving

  /** Sections that should never be hidden: the hero is already on screen. */
  const SKIP = new Set(['hero']);

  const sectionId = (el) => (el.id || '').split('__').pop();

  /** Give each child its own delay so a section arrives in sequence, not as a slab. */
  const stagger = (container) => {
    const row =
      container.querySelector('.group-block-content, .resource-list, .accordion') ||
      container;
    const kids = Array.from(row.children);
    if (kids.length < 2) return;
    kids.forEach((kid, i) => {
      kid.style.setProperty('--reveal-delay', `${Math.min(i, MAX_STEPS) * STAGGER_MS}ms`);
      kid.classList.add('reveal-child');
    });
  };

  /** Count a number up from 0 when its section arrives. */
  const runCounters = (scope) => {
    scope.querySelectorAll('[data-count-to]').forEach((el) => {
      if (el.dataset.counted) return;
      el.dataset.counted = '1';
      const target = Number(el.dataset.countTo);
      if (!Number.isFinite(target)) return;
      const started = performance.now();
      const duration = 1100;
      const tick = (now) => {
        const t = Math.min((now - started) / duration, 1);
        // ease-out cubic: fast start, settles rather than stops dead
        const eased = 1 - Math.pow(1 - t, 3);
        el.textContent = Math.round(target * eased).toLocaleString('en-IN');
        if (t < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  };

  const observer = new IntersectionObserver(
    (entries, obs) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('is-revealed');
        runCounters(entry.target);
        obs.unobserve(entry.target); // fire once; replaying on scroll-back feels cheap
      }
    },
    { threshold: 0.12, rootMargin: '0px 0px -8% 0px' }
  );

  const init = () => {
    const sections = document.querySelectorAll('.shopify-section');
    if (!sections.length) return;

    root.classList.add('js-reveal'); // only now does the CSS hide anything

    sections.forEach((section) => {
      if (SKIP.has(sectionId(section))) return;
      // Header and footer groups sit outside the scroll narrative.
      if (section.closest('.shopify-section-group-header-group, .shopify-section-group-footer-group')) return;
      section.classList.add('reveal');
      stagger(section);
      observer.observe(section);
    });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
