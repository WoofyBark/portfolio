const OWNER = 'WoofyBark';
const API_URL = `https://api.github.com/users/${OWNER}/repos?type=public&sort=updated&per_page=100`;
const REFRESH_INTERVAL = 15 * 60 * 1000;
const PROJECT_LIMIT = 5;

function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
}

function formatSize(kb) {
  if (kb >= 1024 * 1024) return (kb / (1024 * 1024)).toFixed(1) + ' GB';
  if (kb >= 1024) return (kb / 1024).toFixed(1) + ' MB';
  return Math.max(1, kb) + ' KB';
}

function titleCase(value) {
  return value.replace(/[-_]/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase());
}

function projectCard(repo, index) {
  const name = escapeHtml(titleCase(repo.name));
  const description = escapeHtml(repo.description || 'A public software project by WoofyBark.');
  const language = repo.language ? escapeHtml(repo.language) : 'Source code';
  const tags = [language, repo.fork ? 'Fork' : 'Repository', formatSize(repo.size)];
  const updated = repo.updated_at ? new Date(repo.updated_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '';
  const forkNote = repo.fork
    ? '<p>This repository is a fork. Visit GitHub to see its upstream source, license, and contribution history.</p>'
    : '<p>This is a public repository on my GitHub profile. Open the repository to explore its source, documentation, and development history.</p>';

  return `
    <article class="project-card reveal" data-project="github-${escapeHtml(repo.name)}">
      <div class="project-header" data-project-toggle role="button" tabindex="0" aria-expanded="false">
        <div class="project-title-block">
          <div class="project-title-row">
            <h3 class="project-name">${name}</h3>
          </div>
          <p class="project-summary">${description}</p>
          <div class="project-tags">${tags.map(tag => `<span class="project-tag">${escapeHtml(tag)}</span>`).join('')}</div>
        </div>
        <div class="project-thumb project-placeholder" aria-hidden="true">${escapeHtml(repo.name.slice(0, 2).toUpperCase())}</div>
      </div>
      <nav class="project-nav" aria-label="Project navigation">
        <button class="project-prev" type="button" aria-label="Previous project"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg></button>
        <button class="project-next" type="button" aria-label="Next project"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg></button>
      </nav>
      <div class="project-body">
        <div class="project-body-inner">
          <div class="project-detail">
            <div>
              <h4>Repository</h4>
              <p>${description}</p>
              <h4>Details</h4>
              <ul>
                <li>Primary language: <b>${language}</b></li>
                <li>Repository size: <b>${formatSize(repo.size)}</b></li>
                <li>Last updated: <b>${escapeHtml(updated || 'Not available')}</b></li>
                <li>Visibility: <b>Public</b></li>
              </ul>
            </div>
            <div>
              <h4>Attribution</h4>
              ${forkNote}
              <p>Projects are ranked automatically by repository size. A larger public repository can take this spot on the next refresh.</p>
              <div class="project-actions">
                <a class="btn btn-primary" href="${escapeHtml(repo.html_url)}" target="_blank" rel="noopener noreferrer">View on GitHub ↗</a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </article>`;
}

function renderSkills(repositories) {
  const target = document.getElementById('githubSkills');
  if (!target) return;
  const totals = new Map();
  for (const repo of repositories) {
    if (!repo.language) continue;
    totals.set(repo.language, (totals.get(repo.language) || 0) + 1);
  }
  const languages = [...totals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  const cards = [
    { title: 'Full-stack development', description: 'Building software across application layers, from user-facing interfaces to backend functionality.' },
    { title: 'Open-source development', description: 'Publishing public repositories and building software that others can inspect and use.' },
    ...languages.map(([language, size]) => ({
      title: language,
      description: `Primary language in ${size} public repositor${size === 1 ? 'y' : 'ies'}.`
    }))
  ];
  target.innerHTML = cards.map(card => `
    <article class="skill-card">
      <h3>${escapeHtml(card.title)}</h3>
      <p>${escapeHtml(card.description)}</p>
    </article>`).join('');
}

async function refreshPortfolio() {
  const projects = document.getElementById('githubProjects');
  const status = document.getElementById('githubProjectsStatus');
  if (!projects || !status) return;

  try {
    const response = await fetch(API_URL, {
      headers: { Accept: 'application/vnd.github+json' },
      cache: 'no-store'
    });
    if (!response.ok) throw new Error(`GitHub returned ${response.status}`);
    const repositories = await response.json();
    if (!Array.isArray(repositories)) throw new Error('GitHub returned an unexpected repository response.');

    const eligible = repositories
      .filter(repo => !repo.archived && repo.size > 0 && repo.name.toLowerCase() !== 'portfolio')
      .sort((a, b) => (b.size || 0) - (a.size || 0) || new Date(b.updated_at) - new Date(a.updated_at));
    const featured = eligible.slice(0, PROJECT_LIMIT);

    if (!featured.length) {
      projects.innerHTML = '<p>No public repositories are available to feature yet.</p>';
      status.textContent = 'No eligible public repositories found.';
      renderSkills(repositories);
      return;
    }

    projects.innerHTML = featured.map(projectCard).join('');
    renderSkills(repositories);
    status.textContent = `Live from GitHub · Top ${featured.length} of ${eligible.length} public repositories by size · Refreshes every 15 minutes`;

    // Newly inserted cards need the same reveal state as the rest of the page.
    projects.querySelectorAll('.reveal').forEach(card => card.classList.add('visible'));
    document.dispatchEvent(new CustomEvent('github-projects-updated'));
  } catch (error) {
    console.error('Unable to load GitHub portfolio:', error);
    status.textContent = 'GitHub projects are temporarily unavailable. Please try again later.';
    renderSkills([]);
    projects.innerHTML = '<p>Projects could not be loaded right now. Visit <a href="https://github.com/WoofyBark" target="_blank" rel="noopener noreferrer">GitHub</a> to browse public repositories.</p>';
  }
}

export function initGithubPortfolio() {
  refreshPortfolio();
  window.setInterval(refreshPortfolio, REFRESH_INTERVAL);
}
