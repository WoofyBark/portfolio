import { getCapabilities, observeAll } from './utils.js';

export function initScrollPath() {
  const caps = getCapabilities();
  if (caps.isMinimal || window.innerWidth < 980) return;

  const html = document.documentElement;
  if (!html.classList.contains('is-scroll-path')) return;

  const camera = document.getElementById('camera');
  if (!camera) return;

  const track = document.getElementById('scroll-track') || (() => {
    const el = document.createElement('div');
    el.id = 'scroll-track';
    el.style.position = 'absolute';
    el.style.top = '0';
    el.style.left = '0';
    el.style.width = '1px';
    el.style.pointerEvents = 'none';
    el.style.visibility = 'hidden';
    document.body.appendChild(el);
    return el;
  })();

  const sections = Array.from(document.querySelectorAll('[data-section]'));
  const sectionEls = Object.fromEntries(sections.map(s => [s.getAttribute('data-section'), s]));
  const repeatTexts = Array.from(document.querySelectorAll('.repeat-text'));
  const skillsContent = sectionEls.skills?.querySelector('.track-content');
  const expContent = sectionEls.exp?.querySelector('.track-content');

  // Camera timeline. Every hold ends a little before the next waypoint so the
  // panel is stationary while it is read, and the transition that follows is
  // deliberately short:
  //   0.00–0.11 hero hold          0.49–0.52 experience → builds
  //   0.11–0.14 hero → bio         0.52–0.70 builds hold
  //   0.14–0.28 bio hold           0.70–0.73 builds → skills
  //   0.28–0.31 bio → experience   0.73–0.87 skills hold
  //   0.31–0.49 experience hold    0.87–0.90 skills → contact
  //                                0.90–1.00 contact hold
  const waypoints = [
    { p: 0,    x: 0,    y: 0,    mood: 'hero' },
    { p: 0.11, x: 0,    y: 0,    mood: 'hero' },
    { p: 0.14, x: 0,    y: -100, mood: 'bio' },
    { p: 0.28, x: 0,    y: -100, mood: 'bio' },
    { p: 0.31, x: -100, y: -100, mood: 'exp' },
    { p: 0.49, x: -100, y: -100, mood: 'exp' },
    { p: 0.52, x: -200, y: -100, mood: 'builds' },
    { p: 0.70, x: -200, y: -100, mood: 'builds' },
    { p: 0.73, x: -200, y: -200, mood: 'skills' },
    { p: 0.87, x: -200, y: -200, mood: 'skills' },
    { p: 0.90, x: -300, y: -200, mood: 'contact' },
    { p: 1,    x: -300, y: -200, mood: 'contact' }
  ];

  const phases = [
    { name: 'hero',  start: 0,    end: 0.14, direction: 'bottom' },
    { name: 'bio',   start: 0.14, end: 0.31, direction: 'right' },
    { name: 'exp',   start: 0.31, end: 0.52, direction: 'right' },
    { name: 'builds',start: 0.52, end: 0.73, direction: 'none' },
    { name: 'skills',start: 0.73, end: 0.90, direction: 'bottom' },
    { name: 'contact',start:0.90, end: 1,    direction: 'right' }
  ];

  const boundaries = [0.14, 0.31, 0.52, 0.73, 0.90];
  const snapThreshold = 0.04;
  const snapDelay = 900;

  // Where the camera starts moving away from the two panels that scroll
  // internally. Content scrolling must be finished (plus a readable dwell)
  // before these points, or the panel is torn away mid-read.
  const EXPERIENCE_HOLD = { start: 0.31, end: 0.49 };
  const SKILLS_HOLD = { start: 0.73, end: 0.87 };
  const BUILDS_START = 0.52;

  // Pacing for those inner scrollers. The panels only overflow their box by
  // ~150–200px, so mapping that across the whole hold meant thousands of pixels
  // of wheel travel moved the content a few dozen pixels. They now advance at a
  // bounded pace and then stay put for the rest of the hold.
  const CONTENT_MIN_SPAN = 0.05; // progress used when the overflow is small
  const CONTENT_DWELL = 0.03;    // progress held at the bottom before leaving

  function getTrackHeight() { return window.innerHeight * 8; }

  let currentMood = 'hero';
  function setMood(mood) {
    if (mood === currentMood) return;
    currentMood = mood;
    // Waypoints use 'exp' as the section id, but the CSS theme name is 'experience'.
    const themeMood = mood === 'exp' ? 'experience' : mood;
    document.body.setAttribute('data-mood', themeMood);
    sections.forEach(sec => sec.classList.toggle('is-active', sec.getAttribute('data-section') === mood));
    repeatTexts.forEach(rt => rt.classList.toggle('is-visible', mood === 'contact'));
  }

  function lerp(a, b, t) { return a + (b - a) * t; }

  function sample(progress) {
    for (let i = 0; i < waypoints.length - 1; i++) {
      const a = waypoints[i];
      const b = waypoints[i + 1];
      if (progress >= a.p && progress <= b.p) {
        const t = (progress - a.p) / (b.p - a.p);
        return {
          x: lerp(a.x, b.x, t),
          y: lerp(a.y, b.y, t),
          mood: t < 0.5 ? a.mood : b.mood
        };
      }
    }
    return waypoints[waypoints.length - 1];
  }

  function getPhase(progress) {
    for (const ph of phases) {
      if (progress >= ph.start && progress < ph.end) return ph;
    }
    return phases[phases.length - 1];
  }

  let targetX = 0, targetY = 0;
  let currentX = 0, currentY = 0;
  let raf = null;
  let lastPhase = null;
  let snapTimer = null;
  let lastScrollY = window.scrollY;
  let isAutoScrolling = false;

  function dispatchTransition(dir) {
    if (!dir) return;
    window.dispatchEvent(new CustomEvent('cameratransition', { detail: { direction: dir } }));
  }

  // Builds is a carousel. The camera only parks on the section; the arrows walk
  // through every project card, and scroll never changes which one is showing.
  const buildsGrid = sectionEls.builds?.querySelector('.builds-grid');
  const buildCards = Array.from(buildsGrid?.querySelectorAll('.project-card') || []);
  let buildsIndex = -1;
  let buildsLocked = false;

  function dispatchBuildsProject(index, direction) {
    window.dispatchEvent(new CustomEvent('buildsprojectchange', {
      detail: {
        index,
        project: buildCards[index]?.dataset.project || null,
        direction,
        source: 'scroll-path'
      }
    }));
  }

  function setBuildsIndex(index, direction) {
    if (!buildCards.length) return;
    const next = ((index % buildCards.length) + buildCards.length) % buildCards.length;
    if (next === buildsIndex) return;
    buildsIndex = next;
    buildsLocked = true;

    buildCards.forEach((card, i) => card.classList.toggle('is-active', i === next));
    dispatchBuildsProject(next, direction);

    setTimeout(() => { buildsLocked = false; }, 650);
  }

  // Every card carries a previous and a next arrow.
  buildsGrid?.querySelectorAll('.project-prev, .project-next').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (buildsLocked) return;
      const forward = btn.classList.contains('project-next');
      setBuildsIndex(buildsIndex + (forward ? 1 : -1), forward ? 'next' : 'prev');
    });
  });

  // The hero letters and anything else can ask for a specific project.
  function onExternalProjectChange(e) {
    if (e.detail?.source === 'scroll-path') return;
    if (Number.isFinite(e.detail?.index)) {
      setBuildsIndex(e.detail.index, e.detail.direction || 'external');
    }
  }
  window.addEventListener('buildsprojectchange', onExternalProjectChange);

  function update() {
    const trackHeight = getTrackHeight();
    track.style.height = trackHeight + 'px';
    const maxScroll = trackHeight - window.innerHeight;
    const progress = Math.max(0, Math.min(1, window.scrollY / maxScroll));
    const s = sample(progress);
    targetX = s.x;
    targetY = s.y;
    setMood(s.mood);

    // Camera smoothing — use a strong lerp so panels actually settle
    // centered in the viewport instead of lagging behind.
    const dist = Math.hypot(targetX - currentX, targetY - currentY);
    const lerpFactor = dist > 30 ? 0.35 : 0.18;
    currentX += (targetX - currentX) * lerpFactor;
    currentY += (targetY - currentY) * lerpFactor;
    camera.style.transform = `translate(${currentX}vw, ${currentY}vh)`;

    // First visit shows the first project; leaving upward resets to it so the
    // section always starts on the same card when it is re-entered.
    if (buildsIndex === -1) {
      setBuildsIndex(0, 'init');
    } else if (buildsIndex !== 0 && progress < BUILDS_START) {
      setBuildsIndex(0, 'up');
    }

    // Vertical-track internal scroll while the camera is pinned.
    // The scroller is driven at roughly wheel speed, then rests at the bottom
    // for the remainder of the hold (cameraMove - start - CONTENT_DWELL), so the
    // end of the content — the last reference card, the server IPs — is readable
    // before the camera moves on instead of being yanked away.
    function syncVerticalScroll(el, start, cameraMove) {
      if (!el) return;
      const maxScroll = el.scrollHeight - el.clientHeight;
      if (maxScroll <= 0) return;

      const scrollPx = Math.max(1, getTrackHeight() - window.innerHeight);
      const avail = Math.max(0.01, cameraMove - start - CONTENT_DWELL);
      const needed = maxScroll / scrollPx;
      const end = start + Math.min(avail, Math.max(needed, CONTENT_MIN_SPAN));

      if (progress <= start) {
        el.scrollTop = 0;
        return;
      }
      if (progress >= end) {
        el.scrollTop = maxScroll;
        return;
      }
      el.scrollTop = ((progress - start) / (end - start)) * maxScroll;
    }

    syncVerticalScroll(expContent, EXPERIENCE_HOLD.start, EXPERIENCE_HOLD.end);
    syncVerticalScroll(skillsContent, SKILLS_HOLD.start, SKILLS_HOLD.end);

    const phase = getPhase(progress);
    if (phase && phase.name !== lastPhase) {
      const dir = phase.direction || null;
      if (dir && lastPhase !== null) dispatchTransition(dir);
      lastPhase = phase.name;
    }

    lastScrollY = window.scrollY;
    raf = null;
    if (Math.abs(targetX - currentX) > 0.05 || Math.abs(targetY - currentY) > 0.05) {
      raf = requestAnimationFrame(update);
    }
  }

  function snapToNearestPhase(progress) {
    if (isAutoScrolling) return;

    const dy = window.scrollY - lastScrollY;
    const maxScroll = getTrackHeight() - window.innerHeight;
    const longPhases = [
      { name: 'experience', start: 0.31, end: 0.52 },
      { name: 'builds',     start: 0.52, end: 0.73 },
      { name: 'skills',     start: 0.73, end: 0.90 }
    ];

    // Inside a long reading phase: only snap when the user is clearly leaving
    // through the boundary they are scrolling toward. Otherwise let them stop
    // and read anywhere inside the section.
    for (const ph of longPhases) {
      if (progress >= ph.start && progress <= ph.end) {
        const effectiveEnd = ph.end;
        const distStart = Math.abs(progress - ph.start);
        if (distStart <= snapThreshold && dy < -0.5) {
          const target = Math.max(0, ph.start - snapThreshold - 0.015);
          doSnap(target * maxScroll);
          return;
        }
        if (progress > effectiveEnd && dy > 0.5) {
          const target = Math.min(1, ph.end + snapThreshold + 0.015);
          doSnap(target * maxScroll);
          return;
        }

        return;
      }
    }

    // Short phases: snap to the nearest boundary, but never snap *into* the
    // start of a long reading phase when the user is scrolling toward it — let
    // them land at the top of the long phase instead.
    let nearest = null, minDist = Infinity;
    for (const b of boundaries) {
      const d = Math.abs(progress - b);
      if (d < minDist) { minDist = d; nearest = b; }
    }
    if (!nearest || minDist > snapThreshold) return;

    const isLongStart = longPhases.some(ph => ph.start === nearest);
    const isLongEnd = longPhases.some(ph => ph.end === nearest);
    if (isLongStart && progress < nearest && dy > 0.5) return;
    if (isLongEnd && progress > nearest && dy < -0.5) return;

    let targetProgress;
    if (dy > 0.5) {
      targetProgress = nearest + snapThreshold + 0.015;
    } else if (dy < -0.5) {
      targetProgress = nearest - snapThreshold - 0.015;
    } else {
      targetProgress = progress > nearest ? nearest + snapThreshold + 0.015 : nearest - snapThreshold - 0.015;
    }

    targetProgress = Math.max(0, Math.min(1, targetProgress));
    doSnap(targetProgress * maxScroll);
  }

  function doSnap(targetTop) {
    isAutoScrolling = true;
    window.scrollTo({ top: targetTop, behavior: 'smooth' });
    setTimeout(() => { isAutoScrolling = false; }, 450);
  }

  function onScroll() {
    const html = document.documentElement;
    if (html.classList.contains('is-builds-open') || html.classList.contains('is-resume-locked')) return;
    if (!isAutoScrolling) {
      const maxScroll = getTrackHeight() - window.innerHeight;
      const progress = Math.max(0, Math.min(1, window.scrollY / maxScroll));
      if (snapTimer) clearTimeout(snapTimer);
      snapTimer = setTimeout(() => snapToNearestPhase(progress), snapDelay);
    }
    if (!raf) raf = requestAnimationFrame(update);
  }

  window.addEventListener('scroll', onScroll, { passive: true });

  // External callers (e.g. floating hire bar, hero-letter clicks) can announce
  // an auto-scroll so the snap timer is suppressed for the whole duration.
  const AUTO_SCROLL_MS = 600;
  let autoScrollTimer = null;
  function onExternalAutoScroll(e) {
    if (autoScrollTimer) clearTimeout(autoScrollTimer);
    isAutoScrolling = true;
    const duration = Number.isFinite(e?.detail?.duration) ? e.detail.duration : AUTO_SCROLL_MS;
    autoScrollTimer = setTimeout(() => {
      isAutoScrolling = false;
      autoScrollTimer = null;
    }, duration);
  }
  window.addEventListener('thoria-autoscroll', onExternalAutoScroll);

  // Resize: recalc track height and camera position
  let resizeRaf = null;
  function onResize() {
    if (resizeRaf) cancelAnimationFrame(resizeRaf);
    resizeRaf = requestAnimationFrame(() => {
      track.style.height = getTrackHeight() + 'px';
      update();
    });
  }
  window.addEventListener('resize', onResize);

  // Nav links: smooth-scroll to section progress
  const sectionProgress = {
    top: 0,
    hero: 0,
    bio: 0.14,
    experience: 0.31,
    builds: 0.52,
    skills: 0.73,
    contact: 0.90
  };

  function onNavClick(e) {
    const link = e.currentTarget;
    const id = link.getAttribute('href').replace('#', '');
    if (!(id in sectionProgress)) return;
    e.preventDefault();
    const maxScroll = getTrackHeight() - window.innerHeight;
    const targetY = Math.round(sectionProgress[id] * maxScroll);
    isAutoScrolling = true;
    window.scrollTo({ top: targetY, behavior: 'smooth' });
    setTimeout(() => { isAutoScrolling = false; }, 600);
  }

  const navLinks = Array.from(document.querySelectorAll('a[href^="#"]'));
  navLinks.forEach(link => link.addEventListener('click', onNavClick));

  update();
  const revealObserver = observeAll(document.querySelectorAll('.reveal'), (el, visible) => {
    if (visible) el.classList.add('visible');
  }, { threshold: 0.2 });

  return function destroyScrollPath() {
    if (snapTimer) clearTimeout(snapTimer);
    if (autoScrollTimer) clearTimeout(autoScrollTimer);
    if (resizeRaf) cancelAnimationFrame(resizeRaf);
    if (raf) cancelAnimationFrame(raf);
    window.removeEventListener('scroll', onScroll, { passive: true });
    window.removeEventListener('resize', onResize);
    window.removeEventListener('thoria-autoscroll', onExternalAutoScroll);
    window.removeEventListener('buildsprojectchange', onExternalProjectChange);
    navLinks.forEach(link => link.removeEventListener('click', onNavClick));
    if (typeof revealObserver === 'function') {
      revealObserver();
    }
  };
}
