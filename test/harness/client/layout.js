'use strict';

/** Assembles a full harness page: theme, chrome bar, archetype shell, then the userscript. */

const { ARCHETYPES, archetypeHref } = require('./archetype-map');
const { renderShell, escapeHtml } = require('./shells');

function harnessBar(currentArchetype, personas, activePersona) {
    const tabs = ARCHETYPES.map((archetype) => {
        const active = currentArchetype && archetype.id === currentArchetype.id;
        return `<a href="${archetypeHref(archetype)}"
           data-harness-tab="${escapeHtml(archetype.id)}"
           aria-current="${active ? 'page' : 'false'}"
           class="harness-tab${active ? ' harness-tab--active' : ''}">${escapeHtml(archetype.name)}</a>`;
    }).join('');

    const options = personas
        .map((persona) => {
            const selected = activePersona && persona.id === activePersona.id;
            return `<option value="${escapeHtml(persona.id)}"${selected ? ' selected' : ''}>${escapeHtml(persona.name)} — ${escapeHtml(persona.label)}</option>`;
        })
        .join('');

    return `
  <div data-fleet-harness="1" class="harness-bar">
    <div class="harness-bar__row">
      <span class="harness-bar__brand">Fleet UX harness</span>
      <span class="harness-bar__archetype" data-harness-current="${escapeHtml(currentArchetype ? currentArchetype.id : '')}">
        ${escapeHtml(currentArchetype ? currentArchetype.id : 'unmatched')}
      </span>
      <label class="harness-bar__field">
        <span>Persona</span>
        <select data-harness-persona>${options}</select>
      </label>
      <button type="button" data-harness-theme aria-pressed="false">Light</button>
    </div>
    <nav class="harness-bar__tabs">${tabs}</nav>
  </div>`;
}

const HARNESS_CSS = `
.harness-bar {
    position: sticky;
    top: 0;
    z-index: 2147480000;
    background: var(--card);
    color: var(--foreground);
    border-bottom: 2px solid var(--brand);
    font-family: var(--font-sans);
    font-size: 12px;
}
.harness-bar__row {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 6px 10px;
}
.harness-bar__brand { font-weight: 600; }
.harness-bar__archetype {
    font-family: var(--font-mono);
    padding: 2px 6px;
    border: 1px solid var(--border);
    border-radius: 4px;
    color: var(--muted-foreground);
}
.harness-bar__field { display: inline-flex; align-items: center; gap: 6px; margin-left: auto; }
.harness-bar__tabs {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    padding: 0 10px 6px;
}
.harness-tab {
    padding: 3px 8px;
    border: 1px solid var(--border);
    border-radius: 4px;
    color: var(--muted-foreground);
    text-decoration: none;
}
.harness-tab:hover { background: var(--accent); }
.harness-tab--active {
    border-color: var(--brand);
    color: var(--brand);
    font-weight: 600;
}
`;

/**
 * @param {object} options
 * @param {object|null} options.archetype  entry from ARCHETYPES (null when unmatched)
 * @param {object} options.seed
 * @param {object[]} options.personas
 * @param {object} options.activePersona
 * @param {object} options.session   supabase-shaped session seeded into page storage
 */
function renderPage(options) {
    const { archetype, seed, personas, activePersona, session } = options;
    const shell = archetype
        ? renderShell(archetype.id, seed)
        : `<main class="p-4"><h1 class="text-lg font-semibold">No archetype for this path</h1></main>`;

    const clientConfig = {
        personas,
        persona: activePersona,
        session,
        archetypeId: archetype ? archetype.id : null
    };

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(archetype ? archetype.name : 'Fleet UX harness')}</title>
  <link rel="stylesheet" href="/__harness/theme.css">
  <style>${HARNESS_CSS}</style>
  <script>
    // Mirrors the host theme bootstrap: set the class before first paint.
    (function () {
      try {
        var stored = window.localStorage.getItem('theme');
        if (stored === 'dark') {
          document.documentElement.classList.add('dark');
          document.documentElement.style.colorScheme = 'dark';
        }
      } catch (e) {}
    })();
  </script>
  <script>window.__HARNESS_CONFIG__ = ${JSON.stringify(clientConfig)};</script>
  <script src="/__harness/gm-polyfill.js"></script>
</head>
<body>
  ${harnessBar(archetype, personas, activePersona)}
  ${shell}
  <script src="/__harness/chrome.js"></script>
  <script src="/__harness/cdn/fleet.user.js"></script>
</body>
</html>`;
}

module.exports = { renderPage, HARNESS_CSS };
