'use strict';

/**
 * Host finders each archetype's main plugins query on the raw Fleet page, plus the
 * nodes those plugins inject. Raw selectors must exist with the extension off.
 * Injected selectors appear only after fleet.user.js attaches.
 *
 * `kind: 'css'` — querySelector must match.
 * `kind: 'text'` — a node matching `selector` (optionally `within`) has text that
 *   equals / startsWith / includes the given string.
 * `kind: 'thead'` — some table thead inside `within` includes all of `includes`
 *   and none of `excludes`.
 */

function css(selector) {
    return { kind: 'css', selector };
}

function text(selector, match, extra) {
    const check = { kind: 'text', selector };
    if (typeof match === 'string') check.equals = match;
    return Object.assign(check, extra || {});
}

function thead(includes, extra) {
    return Object.assign({ kind: 'thead', includes }, extra || {});
}

const WORKFLOW_RAW = [
    css('[data-ui="workflow-panel"]'),
    css('[data-ui="workflow-toolbar"]'),
    css('[data-ui="workflow-editor"]'),
    css('[data-ui="workflow-steps-container"]'),
    text('span', 'Workflow'),
    text('button', 'Source Data'),
    text('button', 'Save'),
    text('div.text-xs.font-medium.text-muted-foreground.uppercase', 'Result'),
    css('[data-ui="step-result"]'),
    css('div.p-3.rounded-md.border.text-xs.font-mono.whitespace-pre-wrap.overflow-auto')
];

const PROMPT_RAW = [
    css('#prompt-editor'),
    css('[data-ui="prompt-panel"]'),
    text('label', 'Prompt')
];

const QA_HEADER_RAW = [
    css('[data-ui="qa-header"]'),
    css('[data-ui="approve-task"]'),
    css('[data-ui="request-revisions"]'),
    css('[data-ui="qa-verifier-tab"]')
];

const ATTACH_CONTRACTS = {
    dashboard: {
        raw: [
            css('main [role="tabpanel"]'),
            text('h3', null, { startsWith: 'Submitted', within: '[role="tabpanel"]' }),
            thead(['Submitted', 'Environment'], { within: '[role="tabpanel"]' }),
            css('h3.tracking-tight.text-base.font-medium.text-primary'),
            text('h3.tracking-tight.text-base.font-medium.text-primary', 'Feedback Given'),
            text('p.text-sm.text-muted-foreground', null, {
                includes: 'approved',
                within: '.rounded-xl'
            }),
            text('h3.tracking-tight', 'Total Reviewed', { within: '[role="tabpanel"]' }),
            thead(['Date', 'Task', 'Outcome'], {
                within: '[role="tabpanel"]',
                excludes: ['Environment']
            })
        ],
        injected: [
            '[data-wf-task-creation-today-env-block]',
            '[data-wf-feedback-stats-block]',
            '[data-wf-disputes-reviewed-today-block]'
        ]
    },
    'tool-use-task-creation': {
        raw: [
            ...PROMPT_RAW,
            ...WORKFLOW_RAW,
            css('[data-ui="tools-panel"]'),
            css('[data-panel-group]'),
            css('[data-panel]'),
            css('[data-panel-resize-handle-id]')
        ],
        injected: []
    },
    'tool-use-task-creation-openclaw': {
        raw: [
            ...PROMPT_RAW,
            ...WORKFLOW_RAW,
            text('span', null, { includes: 'Task Designers - Special Projects Tasks' })
        ],
        injected: []
    },
    'tool-use-revision': {
        raw: [...PROMPT_RAW, ...WORKFLOW_RAW],
        injected: []
    },
    'create-task-project-selection': {
        raw: [css('[data-project-id]'), text('h1', 'Select a project')],
        injected: []
    },
    'dashboard-create-instance': {
        raw: [
            css('#instance-key'),
            css('[cmdk-root]'),
            css('[cmdk-input]'),
            css('[cmdk-item][role="option"]'),
            css('[role="combobox"]'),
            text('label', null, { includes: 'Select Environment' }),
            text('label', 'Version Configuration'),
            css('span.font-medium.text-foreground')
        ],
        injected: []
    },
    'comp-use-task-creation': {
        raw: [
            ...PROMPT_RAW,
            css('#problem-form'),
            css('#instance-top'),
            text('span', null, { startsWith: 'Time remaining:' }),
            text('p', null, { includes: 'Write a problem inspired by the following scenario' })
        ],
        injected: []
    },
    'comp-use-revision': {
        raw: [...PROMPT_RAW, css('#instance-top')],
        injected: []
    },
    'qa-tool-use': {
        raw: [
            ...QA_HEADER_RAW,
            ...WORKFLOW_RAW,
            css('[data-ui="qa-task-detail-panel"]'),
            css('#prompt-editor')
        ],
        injected: []
    },
    'qa-session': {
        raw: [
            text('div.text-sm.text-muted-foreground.font-medium', 'Verifier Output'),
            text('span.text-muted-foreground', 'Score:'),
            css('div.flex.items-center.justify-between.text-sm.cursor-pointer.select-none')
        ],
        injected: []
    },
    'qa-comp-use': {
        raw: [
            ...QA_HEADER_RAW,
            css('[data-ui="qa-task-card"]'),
            css('[data-ui="search-input"]'),
            css('#instance-top'),
            text('h4', 'Your Answer'),
            css('.rounded-lg.border.border-blue-200')
        ],
        injected: []
    },
    disputes: {
        raw: [
            css('[data-ui="dispute-card"]'),
            css('[data-ui="search-input"]'),
            css('[data-ui="dispute-expand"]')
        ],
        injected: []
    },
    'dispute-detail': {
        raw: [
            ...WORKFLOW_RAW,
            css('[data-ui="tools-panel"]'),
            css('[data-ui="tools-search"]'),
            css('#instance-top'),
            css('iframe[title="Instance Environment"]'),
            css('[data-ui="qa-verifier-tab"]')
        ],
        injected: []
    },
    'task-view': {
        raw: [css('[data-ui="view-task"]'), ...WORKFLOW_RAW],
        injected: []
    },
    'dashboard-data-task': {
        raw: [
            css('[data-slot="content"]'),
            css('[data-slot="actions"]'),
            text('div.text-sm.text-muted-foreground.font-medium', 'Project'),
            text('div.text-sm.text-muted-foreground.font-medium', 'Contributors'),
            text('div.text-sm.text-muted-foreground.font-medium', 'Prompt')
        ],
        injected: []
    },
    'dashboard-data-expert': {
        raw: [
            thead(['Task']),
            css('.max-w-md .font-medium.text-sm.mb-1'),
            text('p.font-medium', 'Recent Feedback:'),
            css('p.text-foreground.whitespace-pre-line')
        ],
        injected: []
    },
    'no-vnc': {
        raw: [css('#noVNC_clipboard_text'), css('#noVNC_screen'), css('canvas')],
        injected: []
    },
    'assessments-grade': {
        raw: [
            css('div.mx-auto.max-w-6xl.px-6.py-12'),
            css('[data-assessment-id]'),
            thead(['Submitted'])
        ],
        injected: []
    },
    'assessments-grade-detail': {
        raw: [css('#grading-q-1'), css('[data-assessment-id], section[id^="grading-q-"]')],
        injected: []
    },
    guidelines: {
        raw: [
            css('[data-guidelines-editor="true"]'),
            css('#title'),
            css('div.rounded-md.border'),
            css('div.sticky.top-0.z-10.flex.flex-wrap'),
            css('[data-type="detailsSummary"]')
        ],
        injected: ['[data-fleet-guidelines-export]']
    }
};

function scopesFor(root, within) {
    if (!within) return [root];
    return Array.from(root.querySelectorAll(within));
}

/** Run one check against a Document (browser) or JSDOM-like root. */
function rawCheckPasses(root, check) {
    if (check.kind === 'css') {
        const scopes = scopesFor(root, check.within);
        return scopes.some((scope) => scope && scope.querySelector(check.selector));
    }
    if (check.kind === 'text') {
        const scopes = scopesFor(root, check.within);
        return scopes.some((scope) => {
            if (!scope) return false;
            const nodes = scope.querySelectorAll(check.selector);
            return Array.from(nodes).some((el) => {
                const t = (el.textContent || '').replace(/\s+/g, ' ').trim();
                if (check.equals != null) return t === check.equals;
                if (check.startsWith) return t.startsWith(check.startsWith);
                if (check.includes) return t.includes(check.includes);
                return t.length > 0;
            });
        });
    }
    if (check.kind === 'thead') {
        const scopes = scopesFor(root, check.within);
        for (const panel of scopes) {
            if (!panel || !panel.querySelectorAll) continue;
            const tables = panel.querySelectorAll('table');
            for (const table of tables) {
                const head = table.tHead && (table.tHead.textContent || '');
                if (!head) continue;
                const okIncludes = (check.includes || []).every((col) => head.includes(col));
                const okExcludes = !(check.excludes || []).some((col) => head.includes(col));
                if (okIncludes && okExcludes) return true;
            }
        }
        return false;
    }
    return false;
}

function describeCheck(check) {
    if (check.kind === 'css') return `css ${check.selector}`;
    if (check.kind === 'text') {
        const match = check.equals || check.startsWith || check.includes || '';
        return `text ${check.selector} ${match}`;
    }
    if (check.kind === 'thead') return `thead ${JSON.stringify(check.includes)}`;
    return JSON.stringify(check);
}

module.exports = {
    ATTACH_CONTRACTS,
    rawCheckPasses,
    describeCheck,
    scopesFor
};
