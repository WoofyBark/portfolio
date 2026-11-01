function isVisibleBuildCard(card) {
  // Outside the scroll path every card sits in normal flow, so all of them can
  // be opened. Inside it only the card currently on the carousel can be.
  if (!document.documentElement.classList.contains('is-scroll-path')) return true;
  return card.classList.contains('is-active');
}

function setBuildsOpen(isOpen) {
  document.documentElement.classList.toggle('is-builds-open', isOpen);
}

function getRect(el) {
  return el ? el.getBoundingClientRect() : null;
}

function readCssVar(el, name) {
  return getComputedStyle(el).getPropertyValue(name).trim();
}

function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function setFlip(el, from, to, scale = true) {
  // Cards without artwork have no thumbnail to flip.
  if (!el || !from || !to) return;
  const dx = from.left - to.left;
  const dy = from.top - to.top;
  let transform = `translate(${dx}px, ${dy}px)`;
  if (scale) {
    const sx = from.width / Math.max(1, to.width);
    const sy = from.height / Math.max(1, to.height);
    transform += ` scale(${sx}, ${sy})`;
  }
  el.style.transform = transform;
  el.style.transformOrigin = 'top left';
  el.style.transition = 'none';
}

function clearFlip(el) {
  if (!el) return;
  el.style.transform = '';
  el.style.transformOrigin = '';
  el.style.transition = '';
}

export function initProjectExpand() {
  const overlay = document.getElementById('builds-overlay');
  if (!overlay) return;

  let activeCard = null;
  let isOpen = false;
  let closeTimer = null;

  function buildOverlayContent(card) {
    const name = card.querySelector('.project-name')?.innerHTML || '';
    const summary = card.querySelector('.project-summary')?.innerHTML || '';
    const tags = card.querySelector('.project-tags')?.innerHTML || '';
    const thumb = card.querySelector('.project-thumb');
    const detail = card.querySelector('.project-detail');

    const thumbSrc = thumb?.getAttribute('src') || '';
    const thumbAlt = thumb?.getAttribute('alt') || '';
    const detailHtml = detail?.outerHTML || '';
    const thumbHtml = thumbSrc
      ? `<img class="project-thumb" src="${thumbSrc}" alt="${thumbAlt}" width="160" height="160" loading="lazy" decoding="async">`
      : '';

    return `
      <div class="expand-frame" aria-hidden="true">
        <div class="expand-line expand-line--top"></div>
        <div class="expand-line expand-line--right"></div>
        <div class="expand-line expand-line--bottom"></div>
        <div class="expand-line expand-line--left"></div>
      </div>
      <article class="expand-card">
        <button class="project-close" aria-label="Close project details">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M18 6 6 18M6 6l12 12"/>
          </svg>
        </button>
        <div class="expand-header">
          <div class="expand-hero">
            <h3 class="project-name">${name}</h3>
            <p class="project-summary">${summary}</p>
            <div class="project-tags">${tags}</div>
          </div>
          ${thumbHtml}
        </div>
        <div class="expand-body">
          ${detailHtml}
        </div>
      </article>
    `;
  }

  function openCard(card) {
    if (isOpen) return;
    // Cancel the pending close cleanup so it cannot wipe the card we are about
    // to build (reopening during the 420ms close fade).
    if (closeTimer) { clearTimeout(closeTimer); closeTimer = null; }
    activeCard = card;
    isOpen = true;

    const reduced = prefersReducedMotion();
    const cardRect = getRect(card);
    const name = card.querySelector('.project-name');
    const summary = card.querySelector('.project-summary');
    const tags = card.querySelector('.project-tags');
    const thumb = card.querySelector('.project-thumb');

    overlay.innerHTML = buildOverlayContent(card);
    overlay.setAttribute('aria-hidden', 'false');

    const expandCard = overlay.querySelector('.expand-card');
    const expandName = overlay.querySelector('.expand-header .project-name');
    const expandSummary = overlay.querySelector('.expand-header .project-summary');
    const expandTags = overlay.querySelector('.expand-header .project-tags');
    const expandThumb = overlay.querySelector('.expand-header .project-thumb');
    const expandBody = overlay.querySelector('.expand-body');
    const closeBtn = overlay.querySelector('.project-close');
    const lines = {
      top: overlay.querySelector('.expand-line--top'),
      right: overlay.querySelector('.expand-line--right'),
      bottom: overlay.querySelector('.expand-line--bottom'),
      left: overlay.querySelector('.expand-line--left'),
    };

    // The close button must work on every path, including reduced motion.
    closeBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      closeOverlay();
    });

    const revealBody = () => expandBody.classList.add('is-revealed');

    const fullscreen = {
      left: 0,
      top: 0,
      width: window.innerWidth,
      height: window.innerHeight,
      right: window.innerWidth,
      bottom: window.innerHeight
    };

    function placeCard(rect) {
      expandCard.style.position = 'absolute';
      expandCard.style.left = `${rect.left}px`;
      expandCard.style.top = `${rect.top}px`;
      expandCard.style.width = `${rect.width}px`;
      expandCard.style.height = `${rect.height}px`;
    }

    function placeLines(rect) {
      lines.top.style.left = `${rect.left}px`;
      lines.top.style.top = `${rect.top}px`;
      lines.top.style.width = `${rect.width}px`;
      lines.top.style.height = '1px';

      lines.bottom.style.left = `${rect.left}px`;
      lines.bottom.style.top = `${rect.bottom - 1}px`;
      lines.bottom.style.width = `${rect.width}px`;
      lines.bottom.style.height = '1px';

      lines.left.style.left = `${rect.left}px`;
      lines.left.style.top = `${rect.top}px`;
      lines.left.style.width = '1px';
      lines.left.style.height = `${rect.height}px`;

      lines.right.style.left = `${rect.right - 1}px`;
      lines.right.style.top = `${rect.top}px`;
      lines.right.style.width = '1px';
      lines.right.style.height = `${rect.height}px`;
    }

    // Start exactly over the source card.
    placeCard(cardRect);
    placeLines(cardRect);
    expandCard.style.borderRadius = readCssVar(card, '--radius') || '16px';

    // Activate the fullscreen header layout so its final geometry is measurable.
    expandCard.classList.add('is-open');
    setBuildsOpen(true);

    if (reduced) {
      overlay.classList.add('is-visible', 'is-open');
      placeCard(fullscreen);
      placeLines(fullscreen);
      expandCard.style.borderRadius = '0';
      revealBody();
      return;
    }

    overlay.classList.add('is-visible');

    // Measure the header elements in the real fullscreen layout, then put the
    // card back over the source card so the grow can animate out of it.
    // Measuring while the card was still thumbnail-sized produced wrong FLIP
    // offsets, which is what made the expansion look like it jumped.
    expandCard.style.transition = 'none';
    placeCard(fullscreen);
    expandCard.style.borderRadius = '0';
    void expandCard.offsetWidth;

    const toName = getRect(expandName);
    const toSummary = getRect(expandSummary);
    const toTags = getRect(expandTags);
    const toThumb = getRect(expandThumb);

    placeCard(cardRect);
    expandCard.style.borderRadius = readCssVar(card, '--radius') || '16px';
    void expandCard.offsetWidth;
    expandCard.style.transition = '';

    const fromName = getRect(name);
    const fromSummary = getRect(summary);
    const fromTags = getRect(tags);
    const fromThumb = getRect(thumb);

    // Apply FLIP transforms so elements visually sit at their source positions.
    setFlip(expandName, fromName, toName, false);
    setFlip(expandSummary, fromSummary, toSummary, false);
    setFlip(expandTags, fromTags, toTags, false);
    setFlip(expandThumb, fromThumb, toThumb, true);

    // Start the frame + line expansion on the next frame.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        overlay.classList.add('is-open');
        expandCard.style.left = '0';
        expandCard.style.top = '0';
        expandCard.style.width = '100vw';
        expandCard.style.height = '100vh';
        expandCard.style.borderRadius = '0';

    lines.top.style.left = '0';
        lines.top.style.width = '100vw';
        lines.bottom.style.left = '0';
        lines.bottom.style.top = 'calc(100vh - 1px)';
        lines.bottom.style.width = '100vw';
        lines.left.style.top = '0';
        lines.left.style.height = '100vh';
        lines.right.style.left = 'calc(100vw - 1px)';
        lines.right.style.height = '100vh';

        clearFlip(expandName);
        clearFlip(expandSummary);
        clearFlip(expandTags);
        clearFlip(expandThumb);

        // Reveal body text after the frame finishes expanding, with a timer as
        // a safety net so the body is never left hidden if the transition is
        // skipped (background tab, interrupted paint, effect downgrade).
        const onTransitionEnd = (e) => {
          if (e.propertyName === 'width' && e.target === expandCard) {
            expandCard.removeEventListener('transitionend', onTransitionEnd);
            revealBody();
          }
        };
        expandCard.addEventListener('transitionend', onTransitionEnd);
        setTimeout(revealBody, 900);
      });
    });
  }

  function closeOverlay() {
    if (!isOpen) return;
    isOpen = false;
    setBuildsOpen(false);
    overlay.classList.remove('is-open');
    overlay.classList.remove('is-visible');
    overlay.setAttribute('aria-hidden', 'true');
    // openCard() cancels this: reopening inside the fade used to wipe the newly
    // built overlay, leaving an empty panel with no fullscreen card.
    if (closeTimer) clearTimeout(closeTimer);
    closeTimer = setTimeout(() => {
      closeTimer = null;
      overlay.innerHTML = '';
      activeCard = null;
    }, 420);
  }

  document.querySelectorAll('[data-project-toggle]').forEach(header => {
    const card = header.closest('.project-card');
    if (!card) return;

    header.addEventListener('click', () => {
      if (!isVisibleBuildCard(card)) return;
      const grid = card.closest('.builds-grid');
      if (grid?.classList.contains('is-transitioning')) return;
      openCard(card);
    });

    header.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        header.click();
      }
    });
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && document.documentElement.classList.contains('is-builds-open')) {
      closeOverlay();
    }
  });

  // Lock scroll-path input while a build overlay is open, but allow the
  // overlay's own overflow scrolling.
  overlay.addEventListener('wheel', (e) => {
    const card = overlay.querySelector('.expand-card');
    if (!card) return;
    const atTop = card.scrollTop === 0;
    const atBottom = Math.abs(card.scrollTop + card.clientHeight - card.scrollHeight) <= 1;
    if ((atTop && e.deltaY < 0) || (atBottom && e.deltaY > 0)) {
      e.preventDefault();
    }
  }, { passive: false });
}
