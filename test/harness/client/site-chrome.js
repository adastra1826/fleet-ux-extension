'use strict';

/**
 * Shared Fleet site chrome lifted from the local/context dumps: logo wordmark,
 * Work tab strip, and the sidebar-wrapper / full-viewport main. Page bodies from
 * shells.js drop into the scroll region. noVNC stays unwrapped.
 */

function escapeHtml(value) {
    return String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

const NAV = [
    { key: 'home', label: 'Home', href: '/work/create' },
    { key: 'guidelines', label: 'Guidelines', href: '/work/guidelines' },
    { key: 'create', label: 'Create', href: '/work/problems/create-instance' },
    { key: 'review', label: 'Review', href: '/work/problems/qa-tool-use/harness' },
    { key: 'disputes', label: 'Disputes', href: '/work/problems/disputes' }
];

const ICONS = {
    home: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" class="fill-current mr-1.5 size-4"><path fill-rule="evenodd" clip-rule="evenodd" d="M12.6 4.7C12.2444 4.43333 11.7556 4.43333 11.4 4.7L5.4 9.2C5.14819 9.38885 5 9.68524 5 10V18C5 18.5523 5.44772 19 6 19H9V14C9 13.4477 9.44772 13 10 13H14C14.5523 13 15 13.4477 15 14V19H18C18.5523 19 19 18.5523 19 18V10C19 9.68524 18.8518 9.38885 18.6 9.2L12.6 4.7ZM13 19V15H11V19H13ZM10.2 3.1C11.2667 2.3 12.7333 2.3 13.8 3.1L19.8 7.6C20.5554 8.16656 21 9.05573 21 10V18C21 19.6569 19.6569 21 18 21H6C4.34315 21 3 19.6569 3 18V10C3 9.05573 3.44458 8.16656 4.2 7.6L10.2 3.1Z"></path></svg>`,
    guidelines: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="mr-1.5 size-4"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path></svg>`,
    create: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" class="fill-current mr-1.5 size-4"><path fill-rule="evenodd" clip-rule="evenodd" d="M3 6C3 4.34315 4.34315 3 6 3H18C19.6569 3 21 4.34315 21 6V18C21 19.6569 19.6569 21 18 21H6C4.34315 21 3 19.6569 3 18V6ZM6 5C5.44772 5 5 5.44772 5 6V18C5 18.5523 5.44772 19 6 19H18C18.5523 19 19 18.5523 19 18V6C19 5.44772 18.5523 5 18 5H6ZM12 7C12.5523 7 13 7.44772 13 8V11H16C16.5523 11 17 11.4477 17 12C17 12.5523 16.5523 13 16 13H13V16C13 16.5523 12.5523 17 12 17C11.4477 17 11 16.5523 11 16V13H8C7.44772 13 7 12.5523 7 12C7 11.4477 7 11.4477 7 11H11V8C11 7.44772 11.4477 7 12 7Z"></path></svg>`,
    review: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="mr-1.5 size-4"><path d="M9 11l3 3L22 4"></path><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path></svg>`,
    disputes: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="mr-1.5 size-4"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"></path><path d="M12 9v4"></path><path d="M12 17h.01"></path></svg>`
};

function navKeyFor(archetype) {
    const id = archetype && archetype.id;
    if (!id) return 'home';
    if (id === 'guidelines') return 'guidelines';
    if (
        id === 'create-task-project-selection' ||
        id === 'dashboard-create-instance' ||
        id === 'tool-use-task-creation' ||
        id === 'tool-use-task-creation-openclaw' ||
        id === 'comp-use-task-creation'
    ) {
        return 'create';
    }
    if (id === 'disputes' || id === 'dispute-detail') return 'disputes';
    if (
        id === 'qa-tool-use' ||
        id === 'qa-comp-use' ||
        id === 'qa-session' ||
        id === 'tool-use-revision' ||
        id === 'comp-use-revision' ||
        id === 'assessments-grade' ||
        id === 'assessments-grade-detail'
    ) {
        return 'review';
    }
    return 'home';
}

function wordmark() {
    return `
    <a class="flex items-center justify-center rounded-md px-3 py-1.5 outline-none mb-1 shrink-0 hover:bg-accent"
       href="/work/create" aria-label="Fleet home">
      <span class="inline-flex items-center gap-2 leading-none">
        <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true">
          <rect width="28" height="28" rx="6" fill="var(--brand)"></rect>
          <path d="M8 8h12v3H11v2.5h8v3H11V20H8V8z" fill="var(--brand-foreground)"></path>
        </svg>
        <span class="text-sm font-semibold tracking-tight">Fleet</span>
      </span>
    </a>`;
}

function workTopbar(activeKey) {
    const tabs = NAV.map((item) => {
        const active = item.key === activeKey;
        return `<a role="tab" aria-selected="${active ? 'true' : 'false'}" data-state="${active ? 'active' : 'inactive'}"
           data-slot="tabs-trigger" href="${item.href}"
           class="fleet-work-tab inline-flex items-center justify-center whitespace-nowrap text-sm font-medium text-muted-foreground px-3 h-11 w-fit${active ? ' fleet-work-tab--active' : ''}">
           ${ICONS[item.key] || ''}${escapeHtml(item.label)}
         </a>`;
    }).join('');

    return `
    <div class="flex h-12 items-center justify-between gap-4 bg-background-extra pl-1 pr-4 pt-1">
      ${wordmark()}
      <div class="mt-auto h-11 flex-1 bg-background-extra">
        <div role="tablist" aria-orientation="horizontal"
             class="inline-flex items-center justify-start gap-2 p-0 h-11 w-full bg-background-extra">
          ${tabs}
        </div>
      </div>
    </div>`;
}

/**
 * Wrap a page body in Fleet chrome. `no-vnc` and missing archetypes skip the tab bar
 * so they stay a single surface.
 */
function wrapWithSiteChrome(archetype, innerHtml) {
    if (archetype && archetype.id === 'no-vnc') return innerHtml;
    const activeKey = navKeyFor(archetype);
    return `
    <div class="group/sidebar-wrapper flex min-h-svh w-full" style="--sidebar-width:13em;--sidebar-width-icon:2rem">
      <main class="relative flex h-screen max-h-full w-dvw overflow-hidden bg-background-extra">
        <div class="flex min-h-0 min-w-0 flex-1 flex-col">
          ${workTopbar(activeKey)}
          <div class="flex-1 min-h-0 overflow-auto px-1 pb-1">
            ${innerHtml}
          </div>
        </div>
      </main>
    </div>`;
}

module.exports = { wrapWithSiteChrome, navKeyFor, NAV };
