'use strict';

/**
 * Concrete URLs for every archetype in archetypes.json.
 *
 * `urlPattern` entries contain wildcards, so each archetype needs one real path the harness
 * can serve and the tab switcher can link to. Where two archetypes share a pattern
 * (tool-use creation vs OpenClaw) the shells differ by the disambiguation text the host
 * looks for, and `query` keeps the links distinct.
 */

const { uuid } = require('../seed/rng');

const ARCHETYPES = [
    { id: 'dashboard', name: 'Main Dashboard', path: 'work/create' },
    {
        id: 'tool-use-task-creation',
        name: 'Tool Use Task Creation',
        path: 'work/problems/create-tool-use/harness'
    },
    {
        id: 'tool-use-task-creation-openclaw',
        name: 'Tool Use OpenClaw',
        path: 'work/problems/create-tool-use/harness',
        query: 'openclaw=1'
    },
    {
        id: 'tool-use-revision',
        name: 'Tool Use Revision',
        path: 'work/problems/respond-feedback/edit-tool-use/harness'
    },
    {
        id: 'create-task-project-selection',
        name: 'Create Task Project Selection',
        path: 'work/problems/create-instance'
    },
    {
        id: 'dashboard-create-instance',
        name: 'Dashboard Create Instance',
        path: 'dashboard/instances/create'
    },
    {
        id: 'comp-use-task-creation',
        name: 'Computer Use Task Creation',
        path: 'work/problems/create-computer-use/harness',
        query: `task_project_target_id=${uuid('task_project_target:0')}`
    },
    {
        id: 'comp-use-revision',
        name: 'Computer Use Revision',
        path: 'work/problems/respond-feedback/edit-computer-use/harness'
    },
    { id: 'qa-tool-use', name: 'Task Review (Tool Use)', path: 'work/problems/qa-tool-use/harness' },
    { id: 'qa-session', name: 'Session Trace Review', path: 'work/problems/qa-session/harness' },
    { id: 'qa-comp-use', name: 'Computer Use QA', path: 'work/problems/qa/harness' },
    { id: 'disputes', name: 'Dispute Review', path: 'work/problems/disputes' },
    { id: 'dispute-detail', name: 'Dispute Detail', path: 'work/problems/disputes/41000' },
    { id: 'task-view', name: 'Task View', path: 'work/problems/view-task/harness' },
    {
        id: 'dashboard-data-task',
        name: 'Dashboard Task View',
        path: 'dashboard/data/tasks/harness'
    },
    {
        id: 'dashboard-data-expert',
        name: 'Dashboard Expert Profile',
        path: 'dashboard/data/experts/harness'
    },
    { id: 'no-vnc', name: 'noVNC Instance', path: '_novnc' },
    { id: 'assessments-grade', name: 'Assessments Grade', path: 'work/assessments/grade' },
    {
        id: 'assessments-grade-detail',
        name: 'Assessments Grade Detail',
        path: 'work/assessments/grade/harness'
    },
    { id: 'guidelines', name: 'Guidelines', path: 'work/guidelines' }
];

/** Full harness link for an archetype tab. */
function archetypeHref(archetype) {
    return `/${archetype.path}${archetype.query ? `?${archetype.query}` : ''}`;
}

/**
 * Which archetype a request path belongs to. `no-vnc` is special: the host derives a
 * synthetic `_novnc` path from the hostname, and the harness exposes it as a real route.
 */
function archetypeForRequest(pathname, search) {
    const clean = pathname.replace(/^\/+/, '').replace(/\/+$/, '');
    const params = new URLSearchParams(search || '');
    const matches = ARCHETYPES.filter((a) => a.path === clean);
    if (matches.length === 0) return null;
    if (matches.length === 1) return matches[0];
    if (params.get('openclaw') === '1') {
        return matches.find((a) => a.id.endsWith('openclaw')) || matches[0];
    }
    return matches.find((a) => !a.id.endsWith('openclaw')) || matches[0];
}

module.exports = { ARCHETYPES, archetypeHref, archetypeForRequest };
