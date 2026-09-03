'use strict';

/**
 * Page shells for every archetype.
 *
 * Layout, class names and control labels are lifted from the local/context dumps.
 * Copy, names and ids come from the synthetic seed — dumps are never served as-is.
 * Plugin hooks (`data-ui`, `#prompt-editor`, `data-panel*`, disambiguation text) stay.
 */

function escapeHtml(value) {
    return String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function slotButton(label, options) {
    const opts = options || {};
    const variant = opts.variant || 'outline';
    const extra = opts.attrs || '';
    return `<button type="button" data-slot="button" data-variant="${escapeHtml(variant)}" ${extra}>${label}</button>`;
}

function chip(text, kind) {
    const cls = kind === 'info' ? 'fleet-chip fleet-chip--info' : 'fleet-chip';
    return `<span class="${cls}">${escapeHtml(text)}</span>`;
}

/** Resizable panel wrapper matching the host layout primitives. */
function panelGroup(direction, panels) {
    const children = panels
        .map(
            (panel, index) => `
        <div data-panel data-panel-id="${escapeHtml(panel.id)}" data-panel-size="${panel.size || 50}"
             class="fleet-page-card"
             style="flex:${panel.size || 50} 1 0px;min-width:0;min-height:0;overflow:auto;">
          ${panel.content}
        </div>
        ${index < panels.length - 1 ? '<div data-panel-resize-handle-id="handle-' + index + '" style="flex:0 0 6px;background:var(--border);cursor:col-resize;"></div>' : ''}`
        )
        .join('');
    return `<div data-panel-group data-panel-group-direction="${direction}"
        class="w-full h-full"
        style="display:flex;flex-direction:${direction === 'vertical' ? 'column' : 'row'};height:100%;min-height:calc(100vh - 7rem);">${children}</div>`;
}

function toolsPanel(seed) {
    const version = seed.task_versions[0];
    const steps = (version.tool_use_workflow && version.tool_use_workflow.steps) || [];
    const tools = steps.map((step) => step.tool);
    const unique = Array.from(new Set(tools.concat(['archive_document', 'assign_ticket'])));
    return `
    <div data-ui="tools-panel" class="p-3 h-full flex flex-col">
      <div class="flex items-center justify-between mb-2">
        <div class="text-sm font-medium">Tools</div>
        ${chip(String(unique.length) + ' available')}
      </div>
      <input data-ui="tools-search" class="w-full" placeholder="Search tools" />
      <div data-ui="tools-list" class="mt-2 space-y-1 overflow-auto flex-1">
        ${unique
            .map(
                (tool) => `
        <div data-ui="tool-item" class="rounded-lg border p-2 flex items-center justify-between">
          <span class="text-sm font-mono">${escapeHtml(tool)}</span>
          <button data-ui="tool-add-to-workflow" data-slot="button" data-variant="ghost" type="button">Add</button>
        </div>`
            )
            .join('')}
      </div>
    </div>`;
}

function workflowPanel(seed, options) {
    const opts = options || {};
    const version = seed.task_versions[0];
    const steps = (version.tool_use_workflow && version.tool_use_workflow.steps) || [];
    return `
    <div data-ui="workflow-panel" class="relative h-full flex flex-col">
      <div data-ui="workflow-toolbar" class="border-b h-9 flex items-center justify-between px-3">
        <span class="text-sm font-medium">Workflow</span>
        <div class="flex gap-2">
          ${slotButton('Source Data', { variant: 'ghost' })}
          <button data-ui="workflow-clear" data-slot="button" data-variant="ghost" type="button">Clear</button>
        </div>
      </div>
      <div data-ui="workflow-editor" class="flex-1 overflow-auto">
        <div data-ui="workflow-steps-container" class="p-3 space-y-2">
          ${steps
            .map(
                (step, index) => `
          <div data-ui="workflow-step" class="rounded-lg border">
            <div data-ui="step-header" class="flex items-center justify-between px-3 py-2 border-b">
              <span class="text-sm font-mono">${index + 1}. ${escapeHtml(step.tool)}</span>
              <button data-ui="step-execute" data-slot="button" data-variant="outline" type="button">Execute</button>
            </div>
            <div data-ui="step-parameters" class="p-2">
              <pre>${escapeHtml(JSON.stringify(step.parameters, null, 2))}</pre>
            </div>
            <div data-ui="step-result" class="p-2 text-sm font-mono whitespace-pre-wrap">${escapeHtml(step.result)}</div>
          </div>`
            )
            .join('')}
        </div>
      </div>
      ${opts.actions || ''}
    </div>`;
}

function promptPanel(seed, heading) {
    const version = seed.task_versions[0];
    const scenario = seed.task_scenarios[0];
    return `
    <div data-ui="prompt-panel" class="p-3 h-full overflow-auto">
      ${heading ? `<h2 class="text-lg font-semibold tracking-tight">${escapeHtml(heading)}</h2>` : ''}
      <label class="text-sm font-medium" for="prompt-editor">Prompt</label>
      <textarea id="prompt-editor" class="w-full mt-2" rows="8">${escapeHtml(version.prompt)}</textarea>
      <div class="mt-4 rounded-lg border p-3">
        <div class="text-sm text-muted-foreground font-medium">User story</div>
        <div class="text-sm whitespace-pre-wrap mt-2">${escapeHtml(scenario.user_story)}</div>
      </div>
      <div class="mt-4 rounded-lg border p-3">
        <div class="text-sm text-muted-foreground font-medium">Annotator instructions</div>
        <div class="text-sm whitespace-pre-wrap mt-2">${escapeHtml(scenario.human_annotator_instructions)}</div>
      </div>
    </div>`;
}

function envIframe() {
    return `
    <div class="h-full flex flex-col">
      <div id="instance-top" class="border-b p-2 text-sm flex items-center justify-between">
        <span class="font-medium">Instance Environment</span>
        <span class="text-muted-foreground">Connected</span>
      </div>
      <iframe title="Instance Environment" src="/__harness/env-frame"
              style="width:100%;flex:1;min-height:280px;border:0;background:var(--muted);"></iframe>
      <div id="instance-bottom" class="border-t p-2 text-sm text-muted-foreground">Frame 1 of 6</div>
    </div>`;
}

function qaActions() {
    return `
    <div class="border-t p-3 flex gap-2">
      <button data-ui="approve-task" type="button" data-slot="button" data-variant="primary">Approve</button>
      <button data-ui="request-revisions" type="button" data-slot="button" data-variant="outline">Request revisions</button>
      <button data-ui="flag-bugged" type="button" data-slot="button" data-variant="outline">Flag as bugged</button>
    </div>`;
}

function verifierTabs(seed) {
    const version = seed.verifier_versions[0];
    return `
    <div class="border-b h-9 flex items-center gap-2 px-3">
      <button data-ui="qa-instance-tab" type="button" data-slot="button" data-variant="ghost">Instance</button>
      <button data-ui="qa-verifier-tab" type="button" data-slot="button" data-variant="ghost">Verifier</button>
      <span data-ui="qa-prompt-version" class="text-xs text-muted-foreground">${chip('Prompt v' + version.version_no + ' · latest')}</span>
    </div>
    <div class="p-3 overflow-auto">
      <pre>${escapeHtml(version.source)}</pre>
    </div>`;
}

function qaTopNav(seed, options) {
    const opts = options || {};
    const version = seed.task_versions[0];
    const team = seed.teams[0];
    const env = version.env_key || (seed.environments[0] && seed.environments[0].env_key) || 'fos-code';
    return `
    <div data-ui="qa-header" class="sticky top-0 z-20 flex-shrink-0 border-b px-1 py-1.5 bg-background" data-fleet-qa-top-nav-scroll-wrap="true">
      <div class="flex flex-wrap items-center gap-1 w-full min-w-0" data-fleet-qa-top-nav-scroll-inner="true">
        <div class="flex w-full flex-shrink-0 items-center justify-start gap-3">
          <div data-ui="qa-lease-timer">
            <div class="fleet-chip fleet-chip--info">
              <span class="text-sm">Time remaining:</span>
              <span class="font-mono font-medium">41:41</span>
            </div>
          </div>
          <span class="fleet-chip" aria-label="Prompt version ${version.version_no}, latest" data-ui="qa-prompt-version">Prompt v${version.version_no} · latest</span>
          <button data-ui="qa-exit" data-slot="button" data-variant="ghost" type="button" class="ml-auto text-xs">Exit QA</button>
        </div>
        <div class="flex min-w-0 flex-1 items-center gap-2 text-sm">
          <span class="shrink-0 text-muted-foreground">Environment:</span>
          <span class="truncate font-medium">${escapeHtml(env)}</span>
          <div class="ml-4 h-4 w-px bg-muted"></div>
          <span class="shrink-0 text-muted-foreground">Team:</span>
          <span class="truncate font-medium">${escapeHtml(team ? team.name : 'Task Designers')}</span>
          <button data-ui="qa-load-new" data-slot="button" data-variant="ghost" type="button" class="text-xs">Load new</button>
          ${opts.extra || ''}
        </div>
      </div>
    </div>`;
}

function creationBreadcrumb(label, teamName) {
    return `
    <div class="h-12 flex-shrink-0 mb-1">
      <div class="fleet-page-card w-full h-full flex items-center justify-between p-2">
        <div class="flex items-center gap-3">
          <a data-slot="button" data-variant="ghost" class="h-8 w-8 p-0" href="/work/create" aria-label="Close">×</a>
          <span>1. Create Problem</span>
          <span class="text-muted-foreground">→</span>
          <span>2. ${escapeHtml(label)}</span>
          ${chip(teamName || 'Task Designers - Computer Use Tasks')}
        </div>
        <div class="flex items-center gap-1">
          <span class="text-sm text-muted-foreground">Actions: 0</span>
        </div>
      </div>
    </div>`;
}

function statCard(label, value) {
    return `
    <div class="fleet-page-card rounded-lg border p-4">
      <h3 class="text-sm font-medium tracking-tight text-muted-foreground">${escapeHtml(label)}</h3>
      <div class="text-lg font-semibold mt-2">${escapeHtml(value)}</div>
    </div>`;
}

function taskTable(seed, limit) {
    const rows = seed.tasks.slice(0, limit || 8);
    const byId = new Map(seed.profiles.map((p) => [p.id, p]));
    return `
    <div class="fleet-page-card rounded-md border overflow-auto">
      <table>
        <thead>
          <tr><th>Key</th><th>Creator</th><th>Environment</th><th>Status</th><th>Created</th></tr>
        </thead>
        <tbody>
          ${rows
            .map((task) => {
                const creator = byId.get(task.created_by);
                return `
          <tr data-task-id="${escapeHtml(task.id)}">
            <td class="font-mono text-sm">${escapeHtml(task.key)}</td>
            <td class="text-sm">${escapeHtml(creator ? creator.full_name : '—')}</td>
            <td class="text-sm">${escapeHtml(task.env_key)}</td>
            <td class="text-sm">${chip(task.task_lifecycle_status)}</td>
            <td class="text-sm text-muted-foreground">${escapeHtml(task.created_at.slice(0, 10))}</td>
          </tr>`;
            })
            .join('')}
        </tbody>
      </table>
    </div>`;
}

/** Shell builders keyed by archetype id. Inner page only — site chrome wraps these. */
const SHELLS = {
    dashboard(seed) {
        const shipped = seed.tasks.filter((t) =>
            t.task_lifecycle_status === 'production' || t.task_lifecycle_status === 'staging'
        ).length;
        return `
      <div class="p-4">
        <div class="flex items-center justify-between">
          <div>
            <h1 class="text-lg font-semibold tracking-tight">Create work</h1>
            <p class="text-sm text-muted-foreground mt-2">Task creation and review queues</p>
          </div>
          <a data-slot="button" data-variant="primary" href="/work/problems/create-instance">New task</a>
        </div>
        <div class="grid gap-4 mt-4" style="grid-template-columns:repeat(3,minmax(0,1fr));">
          ${statCard('Tasks created', String(seed.tasks.length))}
          ${statCard('Shipped', String(shipped))}
          ${statCard('Open disputes', String(seed.disputes.filter((d) => d.dispute_status === 'pending').length))}
        </div>
        <div role="tablist" class="flex gap-2 mt-4 border-b">
          <button role="tab" aria-selected="true" data-state="active" data-slot="tabs-trigger" type="button">Task Creation</button>
          <button role="tab" aria-selected="false" data-state="inactive" data-slot="tabs-trigger" type="button">Review</button>
        </div>
        <div role="tabpanel" class="mt-2">${taskTable(seed)}</div>
      </div>`;
    },

    'tool-use-task-creation'(seed) {
        return `
      <div class="w-full h-full flex flex-col gap-1">
        ${creationBreadcrumb('Create Demonstration', 'Task Designers - Tool Use Tasks')}
        ${panelGroup('horizontal', [
            { id: 'tools', size: 24, content: toolsPanel(seed) },
            { id: 'workflow', size: 46, content: workflowPanel(seed) },
            { id: 'prompt', size: 30, content: promptPanel(seed, 'Create tool use task') }
        ])}
      </div>`;
    },

    'tool-use-task-creation-openclaw'(seed) {
        return `
      <div class="w-full h-full flex flex-col gap-1">
        <div class="border-b p-3 flex items-center gap-2">
          <span class="text-sm font-medium">Task Designers - Special Projects Tasks</span>
          ${chip('OpenClaw')}
        </div>
        ${panelGroup('horizontal', [
            { id: 'tools', size: 24, content: toolsPanel(seed) },
            { id: 'workflow', size: 46, content: workflowPanel(seed) },
            { id: 'prompt', size: 30, content: promptPanel(seed, 'Create tool use task') }
        ])}
      </div>`;
    },

    'tool-use-revision'(seed) {
        const feedback = seed.qa_feedback.find((f) => !f.is_system_feedback);
        return `
      <div class="w-full h-full flex flex-col">
        <div class="fleet-page-card border-b p-3 mb-1">
          <div class="text-sm text-muted-foreground font-medium">Reviewer feedback</div>
          <div class="text-sm whitespace-pre-wrap mt-2">${escapeHtml(feedback.feedback_content)}</div>
        </div>
        ${panelGroup('horizontal', [
            { id: 'tools', size: 24, content: toolsPanel(seed) },
            { id: 'workflow', size: 46, content: workflowPanel(seed) },
            { id: 'prompt', size: 30, content: promptPanel(seed, 'Revise tool use task') }
        ])}
      </div>`;
    },

    'create-task-project-selection'(seed) {
        return `
      <div class="p-4" style="max-width:720px;">
        <h1 class="text-lg font-semibold tracking-tight">Select a project</h1>
        <p class="text-sm text-muted-foreground mt-2">Choose the project this task will be created under.</p>
        <div class="space-y-2 mt-4">
          ${seed.task_projects
            .map(
                (project) => `
          <button type="button" class="w-full fleet-page-card rounded-lg border p-3 flex items-center justify-between" data-project-id="${escapeHtml(project.id)}">
            <span class="font-medium">${escapeHtml(project.name)}</span>
            <span class="text-sm text-muted-foreground">Open</span>
          </button>`
            )
            .join('')}
        </div>
      </div>`;
    },

    'dashboard-create-instance'(seed) {
        return `
      <div class="p-4">
        <h1 class="text-lg font-semibold tracking-tight">Create instance</h1>
        <div class="fleet-page-card mt-4 p-4" style="max-width:520px;">
          <label class="text-sm font-medium" for="instance-key">Key</label>
          <input id="instance-key" class="w-full mt-2" placeholder="task_" />
          <div role="combobox" aria-expanded="false" class="mt-4 rounded-lg border p-2">
            <div cmdk-root="">
              <input cmdk-input="" class="w-full" placeholder="Select environment" />
              <div cmdk-list="" class="mt-2 space-y-1">
                ${seed.environments
                    .map(
                        (env) => `<div cmdk-item="" data-value="${escapeHtml(env.env_key)}" class="text-sm p-2 rounded">${escapeHtml(env.name)}</div>`
                    )
                    .join('')}
              </div>
            </div>
          </div>
          <button type="button" data-slot="button" data-variant="primary" class="mt-4">Create</button>
        </div>
      </div>`;
    },

    'comp-use-task-creation'(seed) {
        return `
      <div class="w-full h-full flex flex-col gap-1">
        ${creationBreadcrumb('Create Demonstration', 'Task Designers - Computer Use Tasks')}
        ${panelGroup('horizontal', [
            { id: 'env', size: 62, content: envIframe() },
            { id: 'prompt', size: 38, content: promptPanel(seed, 'Instructions') }
        ])}
      </div>`;
    },

    'comp-use-revision'(seed) {
        const feedback = seed.qa_feedback.find((f) => !f.is_system_feedback);
        return `
      <div class="w-full h-full flex flex-col">
        <div class="fleet-page-card border-b p-3 mb-1">
          <div class="text-sm text-muted-foreground font-medium">Reviewer feedback</div>
          <div class="text-sm whitespace-pre-wrap mt-2">${escapeHtml(feedback.feedback_content)}</div>
        </div>
        ${panelGroup('horizontal', [
            { id: 'env', size: 62, content: envIframe() },
            { id: 'prompt', size: 38, content: promptPanel(seed, 'Revise instructions') }
        ])}
      </div>`;
    },

    'qa-tool-use'(seed) {
        return `
      <div class="flex h-full w-full flex-col overflow-hidden">
        ${qaTopNav(seed, {
            extra: `<select data-ui="qa-team-filter" class="ml-4">
              ${seed.teams.map((team) => `<option value="${escapeHtml(team.id)}">${escapeHtml(team.name)}</option>`).join('')}
            </select>`
        })}
        ${panelGroup('horizontal', [
            { id: 'tools', size: 22, content: toolsPanel(seed) },
            { id: 'workflow', size: 44, content: workflowPanel(seed) },
            {
                id: 'detail',
                size: 34,
                content: `
              <div data-ui="qa-task-detail-panel" class="h-full flex flex-col">
                ${promptPanel(seed, 'Review')}
                ${verifierTabs(seed)}
                ${qaActions()}
              </div>`
            }
        ])}
      </div>`;
    },

    'qa-session'(seed) {
        const session = seed.sessions[0];
        const result = seed.qa_session_results[0];
        return `
      <div class="flex h-full w-full flex-col">
        <div class="fleet-page-card border-b p-3 flex items-center justify-between mb-1">
          <div>
            <span class="text-sm font-medium">Session trace review</span>
            <div class="text-xs text-muted-foreground mt-2">${escapeHtml(session.status)}</div>
          </div>
          ${slotButton('Exit review', { variant: 'ghost' })}
        </div>
        ${panelGroup('horizontal', [
            {
                id: 'frames',
                size: 60,
                content: `
              <div class="p-3 space-y-2">
                <div class="text-sm text-muted-foreground font-medium">Frames</div>
                ${[1, 2, 3]
                    .map(
                        (n) => `<div class="rounded-lg border p-2 text-sm flex items-center justify-between">
                          <span>Frame ${n}</span>
                          <span class="text-muted-foreground">${escapeHtml(session.status)}</span>
                        </div>`
                    )
                    .join('')}
              </div>`
            },
            {
                id: 'verdict',
                size: 40,
                content: `
              <div class="p-3">
                <div class="text-sm text-muted-foreground font-medium">Verdict</div>
                <div class="text-sm mt-2">${chip(result ? result.verdict : 'pending')}</div>
                <div class="text-sm whitespace-pre-wrap mt-4">${escapeHtml(result ? result.notes : '')}</div>
              </div>`
            }
        ])}
      </div>`;
    },

    'qa-comp-use'(seed) {
        const cards = seed.tasks.slice(0, 4);
        return `
      <div class="flex h-full w-full flex-col overflow-hidden">
        ${qaTopNav(seed, {
            extra: `<input data-ui="search-input" placeholder="Search tasks" />`
        })}
        ${panelGroup('horizontal', [
            {
                id: 'cards',
                size: 34,
                content: `
              <div class="p-3 space-y-2">
                ${cards
                    .map(
                        (task) => `
                <div data-ui="qa-task-card" class="rounded-lg border p-3" data-task-id="${escapeHtml(task.id)}">
                  <div class="text-sm font-mono">${escapeHtml(task.key)}</div>
                  <div class="text-xs text-muted-foreground mt-2">${escapeHtml(task.env_key)}</div>
                </div>`
                    )
                    .join('')}
              </div>`
            },
            {
                id: 'instance',
                size: 66,
                content: `
              <div data-ui="qa-instance-content" class="h-full flex flex-col">
                ${envIframe()}
                ${verifierTabs(seed)}
                ${qaActions()}
              </div>`
            }
        ])}
      </div>`;
    },

    disputes(seed) {
        const open = seed.disputes.filter((d) => d.dispute_status === 'pending');
        return `
      <div class="p-4">
        <div class="flex items-center justify-between">
          <div>
            <h1 class="text-lg font-semibold tracking-tight">Disputes</h1>
            <p class="text-sm text-muted-foreground mt-2">${open.length} pending</p>
          </div>
          <input data-ui="search-input" placeholder="Search disputes" />
        </div>
        <div class="space-y-2 mt-4">
          ${open
            .map(
                (dispute) => `
          <div data-ui="dispute-card" class="fleet-page-card rounded-lg border p-3" data-dispute-id="${dispute.id}">
            <div class="flex items-center justify-between">
              <span class="text-sm font-mono">#${dispute.id} · ${escapeHtml(dispute.eval_task.key)}</span>
              <div class="flex items-center gap-2">
                ${chip(dispute.dispute_status)}
                <button data-ui="dispute-expand" data-slot="button" data-variant="ghost" type="button">Expand</button>
              </div>
            </div>
            <div class="text-sm whitespace-pre-wrap mt-2">${escapeHtml(dispute.dispute_reason)}</div>
            <div class="text-xs text-muted-foreground mt-2">Raised by ${escapeHtml(dispute.creator ? dispute.creator.full_name : '—')}</div>
          </div>`
            )
            .join('')}
        </div>
      </div>`;
    },

    'dispute-detail'(seed) {
        const dispute = seed.disputes[0];
        return `
      <div class="flex h-full w-full flex-col">
        <div class="fleet-page-card border-b p-3 mb-1 flex items-center gap-2">
          <span class="text-sm font-mono">Dispute #${dispute.id}</span>
          <span class="text-sm text-muted-foreground"> · ${escapeHtml(dispute.eval_task.key)}</span>
          ${chip(dispute.dispute_status)}
        </div>
        ${panelGroup('horizontal', [
            { id: 'tools', size: 20, content: toolsPanel(seed) },
            { id: 'workflow', size: 44, content: workflowPanel(seed) },
            {
                id: 'dispute',
                size: 36,
                content: `
              <div class="p-3 h-full overflow-auto">
                <div class="text-sm text-muted-foreground font-medium">Dispute reason</div>
                <div class="text-sm whitespace-pre-wrap mt-2">${escapeHtml(dispute.dispute_reason)}</div>
                <div class="text-sm text-muted-foreground font-medium mt-4">Original review</div>
                <div class="text-sm whitespace-pre-wrap mt-2">${escapeHtml(dispute.original_feedback_content)}</div>
                ${verifierTabs(seed)}
                <div class="border-t p-3 flex gap-2">
                  <button type="button" data-slot="button" data-variant="primary">Uphold</button>
                  <button type="button" data-slot="button" data-variant="outline">Overturn</button>
                </div>
              </div>`
            }
        ])}
      </div>`;
    },

    'task-view'(seed) {
        const task = seed.tasks[0];
        const creator = seed.profiles.find((p) => p.id === task.created_by);
        return `
      <div class="p-4" data-ui="view-task">
        <div class="flex items-center justify-between">
          <h1 class="text-lg font-semibold tracking-tight">${escapeHtml(task.key)}</h1>
          ${chip(task.task_lifecycle_status)}
        </div>
        <div class="fleet-page-card rounded-lg border p-3 mt-4">
          <div class="text-sm text-muted-foreground font-medium">Activity</div>
          <div class="text-sm mt-2">Created by ${escapeHtml(creator ? creator.full_name : '—')}</div>
          <div class="text-sm text-muted-foreground">${escapeHtml(task.created_at)}</div>
        </div>
        <div class="mt-4 fleet-page-card">${workflowPanel(seed)}</div>
      </div>`;
    },

    'dashboard-data-task'(seed) {
        const task = seed.tasks[0];
        const version = seed.task_versions[0];
        return `
      <div class="p-4">
        <div class="flex items-center justify-between">
          <h1 class="text-lg font-semibold tracking-tight">${escapeHtml(task.key)}</h1>
          ${chip('v' + version.version_no)}
        </div>
        <div class="fleet-page-card rounded-lg border mt-4">
          <div data-slot="content" class="p-4">
            <div class="text-sm text-muted-foreground font-medium">Prompt</div>
            <div class="text-sm whitespace-pre-wrap mt-2">${escapeHtml(version.prompt)}</div>
          </div>
          <div data-slot="actions" class="border-t p-3 flex gap-2">
            ${slotButton('Copy prompt')}
            ${slotButton('Open task')}
          </div>
        </div>
        <div class="fleet-page-card rounded-lg border p-4 mt-4">
          <div class="text-sm text-muted-foreground font-medium">Verifier</div>
          <pre class="mt-2">${escapeHtml(seed.verifier_versions[0].source)}</pre>
        </div>
      </div>`;
    },

    'dashboard-data-expert'(seed) {
        const person = seed.profiles[0];
        const authored = seed.tasks.filter((t) => t.created_by === person.id);
        const reviews = seed.qa_feedback.filter((f) => f.created_by === person.id);
        return `
      <div class="p-4">
        <div class="fleet-page-card rounded-lg border p-4">
          <h1 class="text-lg font-semibold tracking-tight">${escapeHtml(person.full_name)}</h1>
          <div class="text-sm text-muted-foreground mt-2">${escapeHtml(person.email)}</div>
        </div>
        <div class="grid gap-4 mt-4" style="grid-template-columns:repeat(3,minmax(0,1fr));">
          ${statCard('Tasks authored', String(authored.length))}
          ${statCard('Reviews given', String(reviews.length))}
          ${statCard('Team', escapeHtml(person.harness.teamRole))}
        </div>
        <div class="mt-4">${taskTable(seed, 5)}</div>
        <div class="fleet-page-card rounded-lg border p-4 mt-4">
          <div class="text-sm text-muted-foreground font-medium">Recent feedback</div>
          ${reviews
            .slice(0, 3)
            .map((f) => `<div class="text-sm whitespace-pre-wrap break-words mt-2">${escapeHtml(f.feedback_content)}</div>`)
            .join('')}
        </div>
      </div>`;
    },

    'no-vnc'() {
        return `
      <div class="p-4">
        <div class="text-sm font-medium">noVNC instance</div>
        <textarea id="noVNC_clipboard_text" class="w-full mt-2" rows="4"></textarea>
        <div id="noVNC_screen" class="fleet-page-card rounded-lg border mt-4" style="height:280px;background:var(--muted);"></div>
      </div>`;
    },

    'assessments-grade'(seed) {
        return `
      <div class="p-4">
        <h1 class="text-lg font-semibold tracking-tight">Assessments</h1>
        <div class="text-sm font-medium mt-4">To grade</div>
        <div class="fleet-page-card rounded-md border mt-2 overflow-auto">
          <table>
            <thead><tr><th>Candidate</th><th>Submitted</th><th>Status</th></tr></thead>
            <tbody>
              ${seed.assessments
                .map(
                    (row) => `
              <tr data-assessment-id="${escapeHtml(row.id)}">
                <td class="text-sm break-words">${escapeHtml(row.candidate_name)}</td>
                <td class="text-sm text-muted-foreground">${escapeHtml(row.submitted_at.slice(0, 10))}</td>
                <td class="text-sm">${chip(row.status)}</td>
              </tr>`
                )
                .join('')}
            </tbody>
          </table>
        </div>
      </div>`;
    },

    'assessments-grade-detail'(seed) {
        const row = seed.assessments[0];
        return `
      <div class="p-4">
        ${slotButton('← Back to queue', { variant: 'ghost' })}
        <h1 class="text-lg font-semibold tracking-tight mt-2">${escapeHtml(row.candidate_name)}</h1>
        <div class="fleet-page-card rounded-md border p-4 mt-4">
          <div class="text-sm text-muted-foreground font-medium">Submission</div>
          <div class="text-sm whitespace-pre-wrap break-words mt-2">${escapeHtml(seed.task_versions[0].prompt)}</div>
        </div>
        <div class="mt-4 flex gap-2">
          <button type="button" data-slot="button" data-variant="primary">Pass</button>
          <button type="button" data-slot="button" data-variant="outline">Fail</button>
        </div>
      </div>`;
    },

    guidelines(seed) {
        return `
      <div class="p-4">
        <div class="flex items-center justify-between">
          <h1 class="text-lg font-semibold tracking-tight">Guidelines</h1>
          ${slotButton('Export', { variant: 'outline' })}
        </div>
        <div data-guidelines-editor class="mt-4 space-y-2">
          ${seed.guidelines
            .map(
                (doc) => `
          <details class="fleet-page-card rounded-lg border p-3" data-doc-id="${escapeHtml(doc.id)}">
            <summary data-type="detailsSummary" class="text-sm font-medium">${escapeHtml(doc.title)}</summary>
            <div data-type="detailsContent" class="text-sm whitespace-pre-wrap mt-2">${escapeHtml(doc.body)}</div>
          </details>`
            )
            .join('')}
        </div>
      </div>`;
    }
};

/** Fallback for archetypes without a dedicated shell. */
function genericShell(archetype) {
    return `
    <div class="p-4">
      <h1 class="text-lg font-semibold tracking-tight">${escapeHtml(archetype.name)}</h1>
      <p class="text-sm text-muted-foreground">Harness shell for <code>${escapeHtml(archetype.id)}</code>.</p>
    </div>`;
}

function renderShell(archetypeId, seed) {
    const { ARCHETYPES } = require('./archetype-map');
    const archetype = ARCHETYPES.find((a) => a.id === archetypeId);
    const builder = SHELLS[archetypeId];
    if (!builder) return genericShell(archetype || { id: archetypeId, name: archetypeId });
    return builder(seed, archetype);
}

module.exports = { renderShell, SHELLS, escapeHtml };
