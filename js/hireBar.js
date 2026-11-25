const SECTION_PROGRESS = {
  top: 0,
  hero: 0,
  bio: 0.14,
  experience: 0.31,
  builds: 0.52,
  skills: 0.73,
  contact: 0.90
};

function scrollPathTo(id) {
  const maxScroll = window.innerHeight * 8 - window.innerHeight;
  const progress = SECTION_PROGRESS[id] ?? SECTION_PROGRESS.contact;
  window.dispatchEvent(new CustomEvent('thoria-autoscroll', { bubbles: true }));
  window.scrollTo({ top: Math.round(progress * maxScroll), behavior: 'smooth' });
}

export function initHireBar() {
  const bar = document.createElement('div');
  bar.className = 'hire-bar';
  bar.innerHTML = `
    <div class="hire-dock" id="hireDock">
      <button class="hire-btn" aria-label="Contact" title="Contact" data-action="contact"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><path d="m22 6-10 7L2 6"/></svg></button>
      <a class="hire-btn" aria-label="GitHub" title="GitHub" href="https://github.com/WoofyBark" target="_blank" rel="noopener"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.56v-2.02c-3.2.7-3.88-1.54-3.88-1.54-.52-1.33-1.28-1.68-1.28-1.68-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11 11 0 0 1 2.9-.39c.98 0 1.97.13 2.9.39 2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.84 1.19 3.1 0 4.42-2.69 5.39-5.25 5.68.41.36.78 1.07.78 2.16v3.2c0 .31.21.68.8.56A10.52 10.52 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5z"/></svg></a>
    </div>
    <button class="hire-toggle" id="hireToggle" aria-pressed="false" aria-label="Open hire menu">
      <span>Hire Me</span>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;flex:none"><path d="m18 15-6-6-6 6"/></svg>
    </button>
  `;
  document.body.appendChild(bar);

  const dock = bar.querySelector('#hireDock');
  const toggle = bar.querySelector('#hireToggle');
  let open = false;

  function setOpen(v) {
    open = v;
    toggle.setAttribute('aria-pressed', open ? 'true' : 'false');
    dock.classList.toggle('visible', open);
  }

  toggle.addEventListener('click', () => setOpen(!open));

  bar.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', () => {
      const action = btn.getAttribute('data-action');
      handleAction(action);
      setOpen(false);
    });
  });

  function handleAction(action) {
    if (action === 'contact') {
      if (document.documentElement.classList.contains('is-scroll-path')) {
        scrollPathTo('contact');
      } else {
        document.getElementById('contact')?.scrollIntoView({ behavior: 'smooth' });
      }
    }
  }
}
