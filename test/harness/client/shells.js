'use strict';

/**
 * Page shells for every archetype.
 *
 * Each shell is hand-built from the DOM contract the plugins rely on: `data-ui` markers,
 * `#prompt-editor`, the resizable `data-panel*` tree, the Tailwind class chains plugins
 * query by, and the exact text nodes archetype disambiguation looks for. The saved pages in
 * local/context were used only as a structural reference; no markup, names or free text
 * were copied out of them.
 */

const { ARCHETYPES } = require('./archetype-map');

function escapeHtml(value) {
    return String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/** Resizable panel wrapper matching the host layout primitives. */
function panelGroup(direction, panels) {
    const children = panels
        .map(
            (panel, index) => `
        <div data-panel data-panel-id="${escapeHtml(panel.id)}" data-panel-size="${panel.size || 50}"
             style="flex:${panel.size || 50} 1 0px;min-width:0;min-height:0;overflow:auto;">
          ${panel.content}
        </div>
        ${index < panels.length - 1 ? '<div data-panel-resize-handle-id="handle-' + index + '" style="flex:0 0 6px;background:var(--border);cursor:col-resize;"></div>' : ''}`
        )
        .join('');
    return `<div data-panel-group data-panel-group-direction="${direction}"
        style="display:flex;flex-direction:${direction === 'vertical' ? 'column' : 'row'};height:100%;min-height:520px;">${children}</div>`;
}

function toolsPanel(seed) {
    const version = seed.task_versions[0];
    const steps = (version.tool_use_workflow && version.tool_use_workflow.steps) || [];
    const tools = steps.map((step) => step.tool);
    const unique = Array.from(new Set(tools.concat(['archive_document', 'assign_ticket'])));
    return `
    <div data-ui="tools-panel" class="p-3 border-r">
      <div class="text-sm font-medium mb-2">Tools</div>
      <input data-ui="tools-search" class="w-full" placeholder="Search tools" />
      <div data-ui="tools-list" class="mt-2 space-y-1">
        ${unique
            .map(
                (tool) => `
        <div data-ui="tool-item" class="rounded-lg border p-2 flex items-center justify-between">
          <span class="text-sm font-mono">${escapeHtml(tool)}</span>
          <button data-ui="tool-add-to-workflow" type="button">Add</button>
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
    <div data-ui="workflow-panel" class="relative">
      <div data-ui="workflow-toolbar" class="border-b h-9 flex items-center justify-between px-3">
        <span class="text-sm font-medium">Workflow</span>
        <div class="flex gap-2">
          <button type="button">Source Data</button>
          <button data-ui="workflow-clear" type="button">Clear</button>
        </div>
      </div>
      <div data-ui="workflow-editor">
        <div data-ui="workflow-steps-container" class="p-3 space-y-2">
          ${steps
            .map(
                (step, index) => `
          <div data-ui="workflow-step" class="rounded-lg border">
            <div data-ui="step-header" class="flex items-center justify-between px-3 py-2 border-b">
              <span class="text-sm font-mono">${index + 1}. ${escapeHtml(step.tool)}</span>
              <button data-ui="step-execute" type="button">Execute</button>
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
    <div data-ui="prompt-panel" class="p-3">
      ${heading ? `<h2 class="text-lg font-semibold tracking-tight">${escapeHtml(heading)}</h2>` : ''}
      <label class="text-sm font-medium" for="prompt-editor">Prompt</label>
      <textarea id="prompt-editor" class="w-full mt-2" rows="6">${escapeHtml(version.prompt)}</textarea>
      <div class="mt-4">
        <div class="text-sm text-muted-foreground font-medium">User story</div>
        <div class="text-sm whitespace-pre-wrap">${escapeHtml(scenario.user_story)}</div>
      </div>
      <div class="mt-4">
        <div class="text-sm text-muted-foreground font-medium">Annotator instructions</div>
        <div class="text-sm whitespace-pre-wrap">${escapeHtml(scenario.human_annotator_instructions)}</div>
      </div>
    </div>`;
}

function envIframe() {
    return `
    <div id="instance-top" class="border-b p-2 text-sm text-muted-foreground">Instance Environment</div>
    <iframe title="Instance Environment" src="/__harness/env-frame"
            style="width:100%;height:320px;border:0;background:var(--muted);"></iframe>
    <div id="instance-bottom" class="border-t p-2 text-sm text-muted-foreground">Frame 1 of 6</div>`;
}

function qaActions() {
    return `
    <div class="border-t p-3 flex gap-2">
      <button data-ui="approve-task" type="button" data-variant="primary">Approve</button>
      <button data-ui="request-revisions" type="button">Request revisions</button>
      <button data-ui="flag-bugged" type="button">Flag as bugged</button>
    </div>`;
}

function verifierTabs(seed) {
    const version = seed.verifier_versions[0];
    return `
    <div class="border-b h-9 flex items-center gap-2 px-3">
      <button data-ui="qa-instance-tab" type="button">Instance</button>
      <button data-ui="qa-verifier-tab" type="button">Verifier</button>
      <span data-ui="qa-prompt-version" class="text-xs text-muted-foreground">v${version.version_no}</span>
    </div>
    <div class="p-3">
      <pre>${escapeHtml(version.source)}</pre>
    </div>`;
}

function statCard(label, value) {
    return `
    <div class="rounded-lg border p-4">
      <h3 class="text-sm font-medium tracking-tight text-muted-foreground">${escapeHtml(label)}</h3>
      <div class="text-lg font-semibold">${escapeHtml(value)}</div>
    </div>`;
}

function taskTable(seed, limit) {
    const rows = seed.tasks.slice(0, limit || 8);
    const byId = new Map(seed.profiles.map((p) => [p.id, p]));
    return `
    <div class="rounded-md border">
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
            <td class="text-sm">${escapeHtml(task.task_lifecycle_status)}</td>
            <td class="text-sm text-muted-foreground">${escapeHtml(task.created_at.slice(0, 10))}</td>
          </tr>`;
            })
            .join('')}
        </tbody>
      </table>
    </div>`;
}

/** Shell builders keyed by archetype id. */
const SHELLS = {
    dashboard(seed) {
        const shipped = seed.tasks.filter((t) =>
            t.task_lifecycle_status === 'production' || t.task_lifecycle_status === 'staging'
        ).length;
        return `
      <main class="p-4">
        <h1 class="text-lg font-semibold tracking-tight">Create work</h1>
        <div class="grid gap-4 mt-4" style="grid-template-columns:repeat(3,minmax(0,1fr));">
          ${statCard('Tasks created', String(seed.tasks.length))}
          ${statCard('Shipped', String(shipped))}
          ${statCard('Open disputes', String(seed.disputes.filter((d) => d.dispute_status === 'pending').length))}
        </div>
        <div role="tablist" class="flex gap-2 mt-4">
          <button role="tab" aria-selected="true" type="button">Task Creation</button>
          <button role="tab" aria-selected="false" type="button">Review</button>
        </div>
        <div role="tabpanel" class="mt-2">${taskTable(seed)}</div>
      </main>`;
    },

    'tool-use-task-creation'(seed) {
        return `
      <main>
        ${panelGroup('horizontal', [
            { id: 'tools', size: 24, content: toolsPanel(seed) },
            { id: 'workflow', size: 46, content: workflowPanel(seed) },
            { id: 'prompt', size: 30, content: promptPanel(seed, 'Create tool use task') }
        ])}
      </main>`;
    },

    'tool-use-task-creation-openclaw'(seed) {
        return `
      <main>
        <div class="border-b p-3">
          <span class="text-sm font-medium">Task Designers - Special Projects Tasks</span>
        </div>
        ${panelGroup('horizontal', [
            { id: 'tools', size: 24, content: toolsPanel(seed) },
            { id: 'workflow', size: 46, content: workflowPanel(seed) },
            { id: 'prompt', size: 30, content: promptPanel(seed, 'Create tool use task') }
        ])}
      </main>`;
    },

    'tool-use-revision'(seed) {
        const feedback = seed.qa_feedback.find((f) => !f.is_system_feedback);
        return `
      <main>
        <div class="border-b p-3">
          <div class="text-sm text-muted-foreground font-medium">Reviewer feedback</div>
          <div class="text-sm whitespace-pre-wrap">${escapeHtml(feedback.feedback_content)}</div>
        </div>
        ${panelGroup('horizontal', [
            { id: 'tools', size: 24, content: toolsPanel(seed) },
            { id: 'workflow', size: 46, content: workflowPanel(seed) },
            { id: 'prompt', size: 30, content: promptPanel(seed, 'Revise tool use task') }
        ])}
      </main>`;
    },

    'create-task-project-selection'(seed) {
        return `
      <main class="p-4">
        <h1 class="text-lg font-semibold tracking-tight">Select a project</h1>
        <div class="space-y-2 mt-4">
          ${seed.task_projects
            .map(
                (project) => `
          <button type="button" class="w-full rounded-lg border p-3" data-project-id="${escapeHtml(project.id)}">
            ${escapeHtml(project.name)}
          </button>`
            )
            .join('')}
        </div>
      </main>`;
    },

    'dashboard-create-instance'(seed) {
        return `
      <main class="p-4">
        <h1 class="text-lg font-semibold tracking-tight">Create instance</h1>
        <div class="mt-4" style="max-width:520px;">
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
          <button type="button" data-variant="primary" class="mt-4">Create</button>
        </div>
      </main>`;
    },

    'comp-use-task-creation'(seed) {
        return `
      <main>
        <div class="border-b h-9 flex items-center justify-between px-3">
          <span class="text-sm font-medium">Computer use task</span>
          <span class="text-sm text-muted-foreground">Actions: 0</span>
        </div>
        ${panelGroup('horizontal', [
            { id: 'env', size: 62, content: envIframe() },
            { id: 'prompt', size: 38, content: promptPanel(seed, 'Instructions') }
        ])}
      </main>`;
    },

    'comp-use-revision'(seed) {
        const feedback = seed.qa_feedback.find((f) => !f.is_system_feedback);
        return `
      <main>
        <div class="border-b p-3">
          <div class="text-sm text-muted-foreground font-medium">Reviewer feedback</div>
          <div class="text-sm whitespace-pre-wrap">${escapeHtml(feedback.feedback_content)}</div>
        </div>
        ${panelGroup('horizontal', [
            { id: 'env', size: 62, content: envIframe() },
            { id: 'prompt', size: 38, content: promptPanel(seed, 'Revise instructions') }
        ])}
      </main>`;
    },

    'qa-tool-use'(seed) {
        return `
      <main>
        <div data-ui="qa-header" class="border-b p-3 flex items-center justify-between">
          <span class="text-sm font-medium">Task review</span>
          <select data-ui="qa-team-filter">
            ${seed.teams.map((team) => `<option value="${escapeHtml(team.id)}">${escapeHtml(team.name)}</option>`).join('')}
          </select>
        </div>
        ${panelGroup('horizontal', [
            { id: 'tools', size: 22, content: toolsPanel(seed) },
            { id: 'workflow', size: 44, content: workflowPanel(seed) },
            {
                id: 'detail',
                size: 34,
                content: `
              <div data-ui="qa-task-detail-panel">
                ${promptPanel(seed, 'Review')}
                ${verifierTabs(seed)}
                ${qaActions()}
              </div>`
            }
        ])}
      </main>`;
    },

    'qa-session'(seed) {
        const session = seed.sessions[0];
        const result = seed.qa_session_results[0];
        return `
      <main>
        <div class="border-b p-3 flex items-center justify-between">
          <span class="text-sm font-medium">Session trace review</span>
          <button type="button">Exit review</button>
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
                        (n) => `<div class="rounded-lg border p-2 text-sm">Frame ${n} — ${escapeHtml(session.status)}</div>`
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
                <div class="text-sm">${escapeHtml(result ? result.verdict : 'pending')}</div>
                <div class="text-sm whitespace-pre-wrap mt-2">${escapeHtml(result ? result.notes : '')}</div>
              </div>`
            }
        ])}
      </main>`;
    },

    'qa-comp-use'(seed) {
        const cards = seed.tasks.slice(0, 4);
        return `
      <main>
        <div data-ui="qa-header" class="border-b p-3 flex items-center justify-between">
          <span class="text-sm font-medium">Computer use QA</span>
          <input data-ui="search-input" placeholder="Search tasks" />
        </div>
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
                  <div class="text-xs text-muted-foreground">${escapeHtml(task.env_key)}</div>
                </div>`
                    )
                    .join('')}
              </div>`
            },
            {
                id: 'instance',
                size: 66,
                content: `
              <div data-ui="qa-instance-content">
                ${envIframe()}
                ${verifierTabs(seed)}
                ${qaActions()}
              </div>`
            }
        ])}
      </main>`;
    },

    disputes(seed) {
        const open = seed.disputes.filter((d) => d.dispute_status === 'pending');
        return `
      <main class="p-4">
        <div class="flex items-center justify-between">
          <h1 class="text-lg font-semibold tracking-tight">Disputes</h1>
          <input data-ui="search-input" placeholder="Search disputes" />
        </div>
        <div class="space-y-2 mt-4">
          ${open
            .map(
                (dispute) => `
          <div data-ui="dispute-card" class="rounded-lg border p-3" data-dispute-id="${dispute.id}">
            <div class="flex items-center justify-between">
              <span class="text-sm font-mono">#${dispute.id} · ${escapeHtml(dispute.eval_task.key)}</span>
              <button data-ui="dispute-expand" type="button">Expand</button>
            </div>
            <div class="text-sm whitespace-pre-wrap mt-2">${escapeHtml(dispute.dispute_reason)}</div>
            <div class="text-xs text-muted-foreground mt-2">Raised by ${escapeHtml(dispute.creator ? dispute.creator.full_name : '—')}</div>
          </div>`
            )
            .join('')}
        </div>
      </main>`;
    },

    'dispute-detail'(seed) {
        const dispute = seed.disputes[0];
        return `
      <main>
        <div class="border-b p-3">
          <span class="text-sm font-mono">Dispute #${dispute.id}</span>
          <span class="text-sm text-muted-foreground"> · ${escapeHtml(dispute.eval_task.key)}</span>
        </div>
        ${panelGroup('horizontal', [
            { id: 'tools', size: 20, content: toolsPanel(seed) },
            { id: 'workflow', size: 44, content: workflowPanel(seed) },
            {
                id: 'dispute',
                size: 36,
                content: `
              <div class="p-3">
                <div class="text-sm text-muted-foreground font-medium">Dispute reason</div>
                <div class="text-sm whitespace-pre-wrap">${escapeHtml(dispute.dispute_reason)}</div>
                <div class="text-sm text-muted-foreground font-medium mt-4">Original review</div>
                <div class="text-sm whitespace-pre-wrap">${escapeHtml(dispute.original_feedback_content)}</div>
                ${verifierTabs(seed)}
                <div class="border-t p-3 flex gap-2">
                  <button type="button" data-variant="primary">Uphold</button>
                  <button type="button">Overturn</button>
                </div>
              </div>`
            }
        ])}
      </main>`;
    },

    'task-view'(seed) {
        const task = seed.tasks[0];
        const creator = seed.profiles.find((p) => p.id === task.created_by);
        return `
      <main class="p-4" data-ui="view-task">
        <h1 class="text-lg font-semibold tracking-tight">${escapeHtml(task.key)}</h1>
        <div class="rounded-lg border p-3 mt-4">
          <div class="text-sm text-muted-foreground font-medium">Activity</div>
          <div class="text-sm">Created by ${escapeHtml(creator ? creator.full_name : '—')}</div>
          <div class="text-sm text-muted-foreground">${escapeHtml(task.created_at)}</div>
        </div>
        ${workflowPanel(seed)}
      </main>`;
    },

    'dashboard-data-task'(seed) {
        const task = seed.tasks[0];
        const version = seed.task_versions[0];
        return `
      <main class="p-4">
        <h1 class="text-lg font-semibold tracking-tight">${escapeHtml(task.key)}</h1>
        <div class="rounded-lg border mt-4">
          <div data-slot="content" class="p-4">
            <div class="text-sm text-muted-foreground font-medium">Prompt</div>
            <div class="text-sm whitespace-pre-wrap">${escapeHtml(version.prompt)}</div>
          </div>
          <div data-slot="actions" class="border-t p-3 flex gap-2">
            <button type="button">Copy prompt</button>
            <button type="button">Open task</button>
          </div>
        </div>
        <div class="rounded-lg border p-4 mt-4">
          <div class="text-sm text-muted-foreground font-medium">Verifier</div>
          <pre>${escapeHtml(seed.verifier_versions[0].source)}</pre>
        </div>
      </main>`;
    },

    'dashboard-data-expert'(seed) {
        const person = seed.profiles[0];
        const authored = seed.tasks.filter((t) => t.created_by === person.id);
        const reviews = seed.qa_feedback.filter((f) => f.created_by === person.id);
        return `
      <main class="p-4">
        <h1 class="text-lg font-semibold tracking-tight">${escapeHtml(person.full_name)}</h1>
        <div class="text-sm text-muted-foreground">${escapeHtml(person.email)}</div>
        <div class="grid gap-4 mt-4" style="grid-template-columns:repeat(3,minmax(0,1fr));">
          ${statCard('Tasks authored', String(authored.length))}
          ${statCard('Reviews given', String(reviews.length))}
          ${statCard('Team', escapeHtml(person.harness.teamRole))}
        </div>
        <div class="mt-4">${taskTable(seed, 5)}</div>
        <div class="rounded-lg border p-4 mt-4">
          <div class="text-sm text-muted-foreground font-medium">Recent feedback</div>
          ${reviews
            .slice(0, 3)
            .map((f) => `<div class="text-sm whitespace-pre-wrap break-words">${escapeHtml(f.feedback_content)}</div>`)
            .join('')}
        </div>
      </main>`;
    },

    'no-vnc'() {
        return `
      <main class="p-4">
        <div class="text-sm font-medium">noVNC instance</div>
        <textarea id="noVNC_clipboard_text" class="w-full mt-2" rows="4"></textarea>
        <div id="noVNC_screen" class="rounded-lg border mt-4" style="height:280px;background:var(--muted);"></div>
      </main>`;
    },

    'assessments-grade'(seed) {
        return `
      <main class="p-4">
        <h1 class="text-lg font-semibold tracking-tight">Assessments</h1>
        <div class="text-sm font-medium mt-4">To grade</div>
        <div class="rounded-md border mt-2">
          <table>
            <thead><tr><th>Candidate</th><th>Submitted</th><th>Status</th></tr></thead>
            <tbody>
              ${seed.assessments
                .map(
                    (row) => `
              <tr data-assessment-id="${escapeHtml(row.id)}">
                <td class="text-sm break-words">${escapeHtml(row.candidate_name)}</td>
                <td class="text-sm text-muted-foreground">${escapeHtml(row.submitted_at.slice(0, 10))}</td>
                <td class="text-sm">${escapeHtml(row.status)}</td>
              </tr>`
                )
                .join('')}
            </tbody>
          </table>
        </div>
      </main>`;
    },

    'assessments-grade-detail'(seed) {
        const row = seed.assessments[0];
        return `
      <main class="p-4">
        <button type="button" class="mb-2">← Back to queue</button>
        <h1 class="text-lg font-semibold tracking-tight">${escapeHtml(row.candidate_name)}</h1>
        <div class="rounded-md border p-4 mt-4">
          <div class="text-sm text-muted-foreground font-medium">Submission</div>
          <div class="text-sm whitespace-pre-wrap break-words">${escapeHtml(seed.task_versions[0].prompt)}</div>
        </div>
        <div class="mt-4 flex gap-2">
          <button type="button" data-variant="primary">Pass</button>
          <button type="button">Fail</button>
        </div>
      </main>`;
    },

    guidelines(seed) {
        return `
      <main class="p-4">
        <h1 class="text-lg font-semibold tracking-tight">Guidelines</h1>
        <div data-guidelines-editor class="mt-4 space-y-2">
          ${seed.guidelines
            .map(
                (doc) => `
          <details class="rounded-lg border p-3" data-doc-id="${escapeHtml(doc.id)}">
            <summary data-type="detailsSummary" class="text-sm font-medium">${escapeHtml(doc.title)}</summary>
            <div data-type="detailsContent" class="text-sm whitespace-pre-wrap mt-2">${escapeHtml(doc.body)}</div>
          </details>`
            )
            .join('')}
        </div>
      </main>`;
    }
};

/** Fallback for archetypes without a dedicated shell. */
function genericShell(archetype) {
    return `
    <main class="p-4">
      <h1 class="text-lg font-semibold tracking-tight">${escapeHtml(archetype.name)}</h1>
      <p class="text-sm text-muted-foreground">Harness shell for <code>${escapeHtml(archetype.id)}</code>.</p>
    </main>`;
}

function renderShell(archetypeId, seed) {
    const archetype = ARCHETYPES.find((a) => a.id === archetypeId);
    const builder = SHELLS[archetypeId];
    if (!builder) return genericShell(archetype || { id: archetypeId, name: archetypeId });
    return builder(seed, archetype);
}

module.exports = { renderShell, SHELLS, escapeHtml };
