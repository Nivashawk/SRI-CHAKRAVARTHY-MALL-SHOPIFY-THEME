import { Component } from '@theme/component';
import { prefersReducedMotion, mediaQueryLarge, requestIdleCallback } from '@theme/utilities';

/**
 * Detail explorer: hotspot markers on the product photo, and a close-up viewer
 * over it, driven by blocks/detail-explorer.liquid.
 *
 * Every close-up is a CDN crop of the photo already on the page. The block
 * renders the tiles; this script adds the parts that have to live inside
 * Horizon's gallery -- which it does without forking any gallery file, by
 * appending two nodes to each frame that shows the source photo:
 *
 *   .detail-explorer__overlay  markers, sized to the drawn image (object-fit
 *                              contain letterboxes it inside its frame)
 *   .detail-explorer__stage    the close-up viewer, covering the frame
 *
 * Two Horizon behaviours shape this file:
 *
 *   1. Component (assets/component.js) delegates `on:click` from `document` in
 *      the CAPTURE phase, and gallery frames carry `on:click` handlers that
 *      open the zoom dialog. A listener on our own nodes would run after that
 *      and could not stop it. So clicks, pointerdowns and keys inside our nodes
 *      are intercepted on `window`, which sees the capture phase first.
 *   2. The gallery may replace itself wholesale (media-gallery.js, on variant
 *      change), dropping our nodes. A MutationObserver on its parent re-mounts.
 *
 * Injected nodes never carry `ref=`: Component collects refs from the whole
 * gallery subtree, and an extra entry would shift the zoom dialog's indexes.
 */
class DetailExplorer extends Component {
  /** @type {AbortController} */
  #ac = new AbortController();
  /** @type {MutationObserver | null} */
  #observer = null;
  /** @type {ResizeObserver | null} */
  #resize = null;
  /** @type {HTMLElement | null} */
  #host = null;
  #regions = [];
  #strings = {};
  /** @type {Set<HTMLElement>} frames we have mounted into */
  #frames = new Set();
  /** @type {HTMLElement | null} */
  #activeFrame = null;
  #index = -1;
  /** @type {HTMLElement | null} */
  #invoker = null;
  #scrollTarget = -1;
  #warmed = new Set();

  connectedCallback() {
    super.connectedCallback();
    this.#ac = new AbortController();

    try {
      this.#regions = JSON.parse(this.querySelector('script[data-regions]')?.textContent || '[]');
      this.#strings = JSON.parse(this.querySelector('script[data-strings]')?.textContent || '{}');
    } catch {
      return;
    }
    if (!this.#regions.length) return;

    const { signal } = this.#ac;

    // Tiles: delegated, so a re-render of the block's markup keeps working.
    this.addEventListener(
      'click',
      (event) => {
        const chip = event.target instanceof Element ? event.target.closest('.detail-explorer__chip') : null;
        if (chip instanceof HTMLElement) this.#onChip(Number(chip.dataset.regionIndex), chip);
      },
      { signal }
    );

    window.addEventListener('click', this.#onWindowClick, { capture: true, signal });
    window.addEventListener('pointerdown', this.#onWindowPointerDown, { capture: true, signal });
    window.addEventListener('keydown', this.#onWindowKeydown, { capture: true, signal });

    // The layout changes between phone and desktop; a half-open viewer would not.
    mediaQueryLarge.addEventListener('change', () => this.close({ restoreFocus: false }), { signal });

    // Theme editor: selecting the block shows what it does.
    document.addEventListener(
      'shopify:block:select',
      (event) => {
        if (/** @type {CustomEvent} */ (event).detail?.blockId === this.dataset.blockId) this.open(0, null);
      },
      { signal }
    );
    document.addEventListener(
      'shopify:block:deselect',
      (event) => {
        if (/** @type {CustomEvent} */ (event).detail?.blockId === this.dataset.blockId) {
          this.close({ restoreFocus: false });
        }
      },
      { signal }
    );

    this.#host = this.closest('product-component')?.querySelector('media-gallery')?.parentElement ?? null;
    if (!this.#host) return;

    this.#resize = new ResizeObserver(() => this.#layoutAll());
    this.#observer = new MutationObserver(() => this.#mountAll());
    this.#observer.observe(this.#host, { childList: true });

    // An enhancement, not the photo: wait until the page is idle.
    requestIdleCallback(() => this.#mountAll());
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.#ac.abort();
    this.#observer?.disconnect();
    this.#resize?.disconnect();
    for (const frame of this.#frames) {
      frame.querySelector(':scope > .detail-explorer__overlay')?.remove();
      frame.querySelector(':scope > .detail-explorer__stage')?.remove();
    }
    this.#frames.clear();
    this.#activeFrame = null;
    this.#index = -1;
  }

  /* --- Mounting -------------------------------------------------------------- */

  get #gallery() {
    return /** @type {any} */ (this.#host?.querySelector('media-gallery') ?? null);
  }

  #mountAll() {
    for (const frame of this.#frames) {
      if (frame.isConnected) continue;
      this.#frames.delete(frame);
      this.#resize?.unobserve(frame);
    }
    if (this.#activeFrame && !this.#activeFrame.isConnected) {
      this.#activeFrame = null;
      this.#index = -1;
      this.#setPressed(-1);
    }

    const gallery = this.#gallery;
    if (!gallery) return;

    const id = CSS.escape(this.dataset.sourceMediaId ?? '');
    for (const media of gallery.querySelectorAll(`.product-media[data-media-id="${id}"]`)) {
      if (media.closest('zoom-dialog')) continue;
      // The desktop grid item and the mobile slide both carry this class.
      const frame = /** @type {HTMLElement | null} */ (media.closest('.product-media-container'));
      if (!frame || this.#frames.has(frame)) continue;

      frame.append(this.#buildOverlay(), this.#buildStage());
      this.#frames.add(frame);
      this.#resize?.observe(frame);
      this.#layout(frame);
    }
  }

  #buildOverlay() {
    const { signal } = this.#ac;
    const overlay = document.createElement('div');
    overlay.className = 'detail-explorer__overlay';
    overlay.dataset.owner = this.dataset.blockId;
    overlay.style.setProperty('--hotspot-size', `${Number(this.dataset.hotspotSize) || 32}px`);

    if (this.dataset.showHotspots === 'false') return overlay;

    this.#regions.forEach((region, index) => {
      const rect = document.createElement('span');
      rect.className = 'detail-explorer__rect';
      rect.setAttribute('aria-hidden', 'true');
      for (const key of ['x', 'y', 'w', 'h']) rect.style.setProperty(`--${key}`, String(region[key]));

      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'detail-explorer__hotspot';
      button.dataset.regionIndex = String(index);
      button.style.setProperty('--cx', String(region.x + region.w / 2));
      button.style.setProperty('--cy', String(region.y + region.h / 2));
      button.setAttribute('aria-label', `${this.#strings.closeUp}: ${region.label}`);
      button.setAttribute('aria-expanded', 'false');

      const label = document.createElement('span');
      label.className = 'detail-explorer__hotspot-label';
      label.setAttribute('aria-hidden', 'true');
      label.textContent = region.label;
      button.append(label);

      const preview = () => {
        rect.classList.add('is-previewing');
        this.#warm(index);
      };
      const unpreview = () => rect.classList.remove('is-previewing');
      button.addEventListener('pointerenter', preview, { signal });
      button.addEventListener('focus', preview, { signal });
      button.addEventListener('pointerleave', unpreview, { signal });
      button.addEventListener('blur', unpreview, { signal });

      overlay.append(rect, button);
    });

    return overlay;
  }

  #buildStage() {
    const s = this.#strings;
    const stage = document.createElement('section');
    stage.className = 'detail-explorer__stage';
    stage.dataset.owner = this.dataset.blockId;
    stage.hidden = true;
    stage.tabIndex = -1;
    stage.setAttribute('aria-roledescription', s.closeUp);

    const bar = document.createElement('div');
    bar.className = 'detail-explorer__bar';
    const count = document.createElement('p');
    count.className = 'detail-explorer__count';
    count.setAttribute('aria-hidden', 'true');
    const nav = document.createElement('div');
    nav.className = 'detail-explorer__nav';
    nav.append(
      this.#button('prev', '‹', s.previous, true),
      this.#button('next', '›', s.next, true),
      this.#button('full', s.full, null, false),
      this.#button('close', '×', s.close, true)
    );
    bar.append(count, nav);

    const strip = document.createElement('div');
    strip.className = 'detail-explorer__strip';

    const caption = document.createElement('div');
    caption.className = 'detail-explorer__caption';
    const title = document.createElement('h3');
    title.className = 'detail-explorer__title';
    title.tabIndex = -1;
    const note = document.createElement('p');
    note.className = 'detail-explorer__note';
    const provenance = document.createElement('p');
    provenance.className = 'detail-explorer__provenance';
    provenance.textContent = s.provenance;
    caption.append(title, note, provenance);

    stage.append(bar, strip, caption);

    // Swiping the strip moves between close-ups. A programmatic scroll passes
    // through the slides in between, so ignore positions until it arrives.
    strip.addEventListener(
      'scroll',
      () => {
        if (this.#activeFrame !== stage.parentElement) return;
        const index = Math.round(strip.scrollLeft / Math.max(strip.clientWidth, 1));
        if (this.#scrollTarget !== -1) {
          if (index !== this.#scrollTarget) return;
          this.#scrollTarget = -1;
        }
        if (index === this.#index || index < 0 || index >= this.#regions.length) return;
        this.#index = index;
        this.#loadCrop(stage, index);
        this.#updateCaption();
      },
      { passive: true, signal: this.#ac.signal }
    );

    return stage;
  }

  /**
   * @param {string} action
   * @param {string} text
   * @param {string | null} label  accessible name when the visible text is a glyph
   * @param {boolean} icon
   */
  #button(action, text, label, icon) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `detail-explorer__btn${icon ? ' detail-explorer__btn--icon' : ''}`;
    button.dataset.action = action;
    if (label) {
      button.setAttribute('aria-label', label);
      const glyph = document.createElement('span');
      glyph.setAttribute('aria-hidden', 'true');
      glyph.textContent = text;
      button.append(glyph);
    } else {
      button.textContent = text;
    }
    return button;
  }

  /** Crop tiles are built the first time the viewer opens in a frame. */
  #fillStrip(stage, frame) {
    const strip = stage.querySelector('.detail-explorer__strip');
    if (!strip || strip.childElementCount) return;

    // The photo is already loaded, so it doubles as an instant placeholder:
    // positioned to the region, it shows the right area before the crop lands.
    const main = /** @type {HTMLImageElement | null} */ (frame.querySelector('.product-media img'));
    const base = main?.currentSrc || main?.src || '';

    this.#regions.forEach((region) => {
      const slide = document.createElement('figure');
      slide.className = 'detail-explorer__slide';
      const crop = document.createElement('div');
      crop.className = 'detail-explorer__crop';
      crop.style.setProperty('--ratio', `${region.cw} / ${region.ch}`);
      crop.style.setProperty('--cap', `${this.#cap(region)}px`);
      if (base) {
        crop.style.backgroundImage = `url(${JSON.stringify(base)})`;
        crop.style.backgroundSize = `${10000 / region.w}% ${10000 / region.h}%`;
        const px = region.w >= 100 ? 0 : (region.x / (100 - region.w)) * 100;
        const py = region.h >= 100 ? 0 : (region.y / (100 - region.h)) * 100;
        crop.style.backgroundPosition = `${px}% ${py}%`;
      }
      const img = document.createElement('img');
      img.decoding = 'async';
      crop.append(img);
      slide.append(crop);
      strip.append(slide);
    });
  }

  /**
   * Widest the close-up may be drawn: 1.5 device pixels per source pixel. DPR is
   * capped at 2, so a DPR-3 phone accepts slightly softer rather than tiny.
   */
  #cap(region) {
    return Math.round((region.cw * 1.5) / Math.min(window.devicePixelRatio || 1, 2));
  }

  #loadCrop(stage, index) {
    const img = /** @type {HTMLImageElement | undefined} */ (
      stage.querySelector('.detail-explorer__strip')?.children[index]?.querySelector('img')
    );
    const region = this.#regions[index];
    if (!img || !region || img.getAttribute('src')) return;

    const cap = this.#cap(region);
    img.alt = `${region.label} ${this.#strings.of} ${this.dataset.productTitle}. ${this.#strings.provenance}.`;
    img.sizes = `(min-width: 750px) min(${cap}px, 50vw), min(${cap}px, 100vw)`;
    img.srcset = region.srcset;
    img.src = region.src;
    if (img.complete) img.classList.add('is-loaded');
    else img.addEventListener('load', () => img.classList.add('is-loaded'), { once: true });
  }

  #warm(index) {
    const region = this.#regions[index];
    if (!region || this.#warmed.has(index)) return;
    this.#warmed.add(index);
    new Image().src = region.src;
  }

  /* --- Layout ---------------------------------------------------------------- */

  /**
   * The drawn image inside a frame. With object-fit: contain the <img> box is
   * larger than the picture, so markers are placed against this, not the box.
   * @param {HTMLElement} frame
   */
  #imageBox(frame) {
    const img = /** @type {HTMLImageElement | null} */ (frame.querySelector('.product-media img'));
    if (!img || !img.naturalWidth) return null;

    const frameRect = frame.getBoundingClientRect();
    const imgRect = img.getBoundingClientRect();
    if (!imgRect.width || !imgRect.height) return null;

    let width = imgRect.width;
    let height = imgRect.height;
    const fit = getComputedStyle(img).objectFit;
    if (fit === 'contain' || fit === 'scale-down') {
      const scale = Math.min(imgRect.width / img.naturalWidth, imgRect.height / img.naturalHeight);
      width = img.naturalWidth * scale;
      height = img.naturalHeight * scale;
    }

    return {
      left: imgRect.left - frameRect.left + (imgRect.width - width) / 2,
      top: imgRect.top - frameRect.top + (imgRect.height - height) / 2,
      width,
      height,
    };
  }

  /** @param {HTMLElement} frame */
  #layout(frame) {
    const overlay = /** @type {HTMLElement | null} */ (frame.querySelector(':scope > .detail-explorer__overlay'));
    if (!overlay) return;

    const box = this.#imageBox(frame);
    if (!box) {
      overlay.hidden = true;
      const img = frame.querySelector('.product-media img');
      img?.addEventListener('load', () => this.#layout(frame), { once: true, signal: this.#ac.signal });
      return;
    }

    overlay.hidden = false;
    overlay.style.left = `${box.left}px`;
    overlay.style.top = `${box.top}px`;
    overlay.style.width = `${box.width}px`;
    overlay.style.height = `${box.height}px`;
  }

  #layoutAll() {
    for (const frame of this.#frames) if (frame.isConnected) this.#layout(frame);
  }

  /** The frame the shopper can actually see: the grid on desktop, a slide on a phone. */
  #visibleFrame() {
    const rendered = [...this.#frames].filter(
      (frame) => frame.isConnected && (frame.checkVisibility ? frame.checkVisibility() : frame.getClientRects().length > 0)
    );
    return rendered.find((frame) => !frame.closest('slideshow-slide')) ?? rendered[0] ?? null;
  }

  /** @param {HTMLElement} frame */
  #stageOf(frame) {
    return /** @type {HTMLElement | null} */ (frame.querySelector(':scope > .detail-explorer__stage'));
  }

  /* --- Events ---------------------------------------------------------------- */

  /** @param {Event} event */
  #owned(event) {
    const target = event.target instanceof Element ? event.target : null;
    const node = /** @type {HTMLElement | null} */ (
      target?.closest('.detail-explorer__overlay, .detail-explorer__stage') ?? null
    );
    return node && node.dataset.owner === this.dataset.blockId ? node : null;
  }

  /** @param {MouseEvent} event */
  #onWindowClick = (event) => {
    const owned = this.#owned(event);
    if (!owned) return;

    // Stop Horizon's document-level delegation from opening the zoom dialog.
    event.stopPropagation();
    const target = /** @type {Element} */ (event.target);

    const hotspot = /** @type {HTMLElement | null} */ (target.closest('.detail-explorer__hotspot'));
    if (hotspot) {
      event.preventDefault();
      const frame = /** @type {HTMLElement} */ (owned.parentElement);
      const index = Number(hotspot.dataset.regionIndex);
      if (this.#index === index && this.#activeFrame === frame) this.close();
      else this.open(index, hotspot, frame);
      return;
    }

    const action = /** @type {HTMLElement | null} */ (target.closest('[data-action]'))?.dataset.action;
    if (!action) return; // a click on the matte: swallowed, so it cannot open zoom
    event.preventDefault();
    if (action === 'close') this.close();
    else if (action === 'prev') this.step(-1);
    else if (action === 'next') this.step(1);
    else if (action === 'full') this.#openZoom(event);
  };

  /** Keeps a press on the viewer from starting the slideshow's drag. */
  /** @param {PointerEvent} event */
  #onWindowPointerDown = (event) => {
    if (this.#owned(event)) event.stopPropagation();
  };

  /** @param {KeyboardEvent} event */
  #onWindowKeydown = (event) => {
    if (this.#index === -1) return;
    const inViewer = this.#owned(event) || (event.target instanceof Node && this.contains(event.target));
    if (!inViewer) return;

    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      this.close();
    } else if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      if (!this.#owned(event)) return; // arrows on a tile belong to the page
      event.preventDefault();
      event.stopPropagation();
      this.step(event.key === 'ArrowRight' ? 1 : -1);
    }
  };

  /**
   * @param {number} index
   * @param {HTMLElement} chip
   */
  #onChip(index, chip) {
    const frame = this.#visibleFrame();
    if (!frame) return;

    // Tapping the open close-up's tile again closes it.
    if (this.#index === index && this.#activeFrame === frame) {
      this.close();
      return;
    }

    // On a phone the source photo may not be the slide on screen.
    const slide = frame.closest('slideshow-slide');
    const slideshow = /** @type {any} */ (frame.closest('slideshow-component'));
    if (slide && typeof slideshow?.select === 'function') {
      const position = [...slideshow.querySelectorAll('slideshow-slide')].indexOf(slide);
      if (position > -1) slideshow.select(position, undefined, { animate: !prefersReducedMotion() });
    }

    this.open(index, chip, frame);
    frame.scrollIntoView({ block: 'nearest', behavior: prefersReducedMotion() ? 'instant' : 'smooth' });
  }

  /* --- Viewer ---------------------------------------------------------------- */

  /**
   * @param {number} index
   * @param {HTMLElement | null} invoker  where focus returns on close
   * @param {HTMLElement | null} [frame]
   */
  open(index, invoker, frame = this.#visibleFrame()) {
    if (!frame) return;
    const stage = this.#stageOf(frame);
    if (!stage) return;

    if (this.#activeFrame && this.#activeFrame !== frame) this.#hideStage(this.#activeFrame);
    const opening = this.#activeFrame !== frame || stage.hidden;

    this.#activeFrame = frame;
    if (invoker) this.#invoker = invoker;

    this.#fillStrip(stage, frame);
    stage.hidden = false;
    this.#show(index, { instant: opening });

    if (opening && !prefersReducedMotion()) this.#animateIn(stage, frame);
    stage.querySelector('.detail-explorer__title')?.focus({ preventScroll: true });
  }

  /** @param {{ restoreFocus?: boolean }} [options] */
  close({ restoreFocus = true } = {}) {
    if (this.#index === -1) return;
    if (this.#activeFrame) this.#hideStage(this.#activeFrame);

    this.#index = -1;
    this.#activeFrame = null;
    this.#scrollTarget = -1;
    this.#setPressed(-1);
    this.#announce('');

    const invoker = this.#invoker;
    this.#invoker = null;
    if (restoreFocus && invoker?.isConnected) invoker.focus({ preventScroll: true });
  }

  /** @param {number} delta */
  step(delta) {
    if (this.#index === -1) return;
    this.#show(this.#index + delta);
  }

  /** @param {HTMLElement} frame */
  #hideStage(frame) {
    const stage = this.#stageOf(frame);
    if (stage) stage.hidden = true;
  }

  /**
   * @param {number} index
   * @param {{ instant?: boolean }} [options]
   */
  #show(index, { instant = false } = {}) {
    const frame = this.#activeFrame;
    const stage = frame && this.#stageOf(frame);
    if (!stage) return;

    const count = this.#regions.length;
    this.#index = ((index % count) + count) % count;
    this.#loadCrop(stage, this.#index);

    const strip = /** @type {HTMLElement} */ (stage.querySelector('.detail-explorer__strip'));
    const slide = /** @type {HTMLElement} */ (strip.children[this.#index]);
    const behavior = instant || prefersReducedMotion() ? 'instant' : 'smooth';
    this.#scrollTarget = behavior === 'smooth' ? this.#index : -1;
    strip.scrollTo({ left: slide.offsetLeft, behavior });

    this.#updateCaption();
  }

  #updateCaption() {
    const frame = this.#activeFrame;
    const stage = frame && this.#stageOf(frame);
    const region = this.#regions[this.#index];
    if (!stage || !region) return;

    const count = this.#regions.length;
    const title = stage.querySelector('.detail-explorer__title');
    const note = stage.querySelector('.detail-explorer__note');
    const position = stage.querySelector('.detail-explorer__count');
    if (title) title.textContent = region.label;
    if (note) note.textContent = region.note || '';
    if (position) position.textContent = `${this.#index + 1} / ${count}`;
    stage.setAttribute('aria-label', `${region.label} ${this.#strings.closeUp.toLowerCase()}`);

    this.#setPressed(this.#index);
    this.#announce(
      `${region.label} ${this.#strings.closeUp.toLowerCase()}, ${this.#index + 1} ${this.#strings.of} ${count}`
    );
  }

  /** @param {number} index  -1 for none */
  #setPressed(index) {
    for (const chip of this.querySelectorAll('.detail-explorer__chip')) {
      chip.setAttribute('aria-pressed', String(Number(/** @type {HTMLElement} */ (chip).dataset.regionIndex) === index));
    }
    for (const frame of this.#frames) {
      for (const hotspot of frame.querySelectorAll(':scope > .detail-explorer__overlay .detail-explorer__hotspot')) {
        const open = frame === this.#activeFrame && Number(/** @type {HTMLElement} */ (hotspot).dataset.regionIndex) === index;
        hotspot.setAttribute('aria-expanded', String(open));
      }
    }
  }

  /** @param {string} message */
  #announce(message) {
    const live = this.querySelector('[data-live]');
    if (live) live.textContent = message;
  }

  /** Grow the close-up out of its region on the photo, so the link is visible. */
  #animateIn(stage, frame) {
    const region = this.#regions[this.#index];
    const crop = /** @type {HTMLElement | undefined} */ (
      stage.querySelector('.detail-explorer__strip')?.children[this.#index]?.querySelector('.detail-explorer__crop')
    );
    const box = this.#imageBox(frame);
    if (!region || !crop || !box) return;

    const to = crop.getBoundingClientRect();
    if (!to.width || !to.height) return;
    const frameRect = frame.getBoundingClientRect();
    const from = {
      left: frameRect.left + box.left + (box.width * region.x) / 100,
      top: frameRect.top + box.top + (box.height * region.y) / 100,
      width: (box.width * region.w) / 100,
      height: (box.height * region.h) / 100,
    };

    const easing = 'cubic-bezier(0.22, 0.61, 0.36, 1)';
    crop.animate(
      [
        {
          transformOrigin: '0 0',
          transform: `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${from.width / to.width}, ${from.height / to.height})`,
        },
        { transformOrigin: '0 0', transform: 'none' },
      ],
      { duration: 280, easing }
    );
    stage.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing });
  }

  /** @param {Event} event */
  #openZoom(event) {
    const gallery = this.#gallery;
    const frame = this.#activeFrame;
    if (!gallery || !frame?.parentElement) return;

    // Same order the zoom dialog renders: the frame's position among its siblings.
    const siblings = [...frame.parentElement.children].filter((el) => el.matches('.product-media-container'));
    const index = Math.max(0, siblings.indexOf(frame));

    this.close({ restoreFocus: false });
    gallery.zoom?.(index, event);
  }
}

if (!customElements.get('detail-explorer')) {
  customElements.define('detail-explorer', DetailExplorer);
}
