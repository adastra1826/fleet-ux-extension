'use strict';

/**
 * Fleet web API emulation (`/api/*`), plus the internal and orchestrator surfaces the
 * extension reaches for. Shapes follow local/api; the data is the synthetic seed.
 */

const { intId, isoAt, nextFeedbackId, uuid } = require('../seed/rng');

const LEASE_MINUTES = 15;

function jsonBody(req) {
    return new Promise((resolve) => {
        let raw = '';
        req.on('data', (chunk) => { raw += chunk; });
        req.on('end', () => {
            if (!raw) return resolve({});
            try {
                resolve(JSON.parse(raw));
            } catch (_e) {
                resolve({ _raw: raw });
            }
        });
    });
}

function disputeMatchesStatus(dispute, status) {
    if (!status || status === 'all') return true;
    if (status === 'open' || status === 'pending') return dispute.dispute_status === 'pending';
    if (status === 'resolved') return dispute.dispute_status !== 'pending';
    return dispute.dispute_status === status;
}

function profileEmbed(person) {
    return person ? { id: person.id, full_name: person.full_name, email: person.email } : null;
}

class FleetWebApi {
    constructor(seed, personas) {
        this.seed = seed;
        this.personas = personas;
    }

    async handle(req, url) {
        const path = url.pathname.replace(/^\/api/, '');
        const method = req.method.toUpperCase();
        const actor = this.personas.resolve(req);

        if (method === 'GET' && path === '/disputes') return this.listDisputes(url);
        if (method === 'GET' && path === '/disputes/task-disputes') return this.taskDisputes(url);

        const disputeAction = path.match(/^\/disputes\/(\d+)\/(claim|release|resolve)$/);
        if (method === 'POST' && disputeAction) {
            const body = await jsonBody(req);
            return this.disputeAction(Number(disputeAction[1]), disputeAction[2], actor, body);
        }

        if (method === 'GET' && path === '/task-flags') return this.listFlags(url);
        if (method === 'POST' && path === '/task-flags') {
            const body = await jsonBody(req);
            return this.createFlag(actor, body);
        }
        const flagResolve = path.match(/^\/task-flags\/([^/]+)\/resolve$/);
        if (method === 'POST' && flagResolve) {
            const body = await jsonBody(req);
            return this.resolveFlag(flagResolve[1], actor, body);
        }

        const flagBugged = path.match(/^\/flag-bugged\/([^/]+)$/);
        if (method === 'POST' && flagBugged) {
            const body = await jsonBody(req);
            return this.flagBugged(decodeURIComponent(flagBugged[1]), actor, body);
        }

        if (method === 'POST' && path === '/orchestrator-private/v1/qa-feedback/screenshots/view-urls') {
            const body = await jsonBody(req);
            return this.screenshotViewUrls(body);
        }
        if (method === 'POST' && path === '/orchestrator-private/v1/qa-feedback/screenshots/upload-urls') {
            const body = await jsonBody(req);
            return this.screenshotUploadUrls(body);
        }
        if (method === 'GET' && path === '/orchestrator-private/v1/work/stats/qa-feedback') {
            return this.workStats(url);
        }
        const discard = path.match(/^\/orchestrator-private\/v1\/pipeline\/tasks\/([^/]+)\/qa\/discard$/);
        if (method === 'POST' && discard) {
            const body = await jsonBody(req);
            return this.qaDiscard(decodeURIComponent(discard[1]), body);
        }
        if (method === 'POST' && path === '/orchestrator-private/v1/team/members/bulk-remove') {
            const body = await jsonBody(req);
            return this.teamBulkRemove(actor, body);
        }
        if (method === 'POST' && path === '/orchestrator-private/v1/team/users/permissions') {
            const body = await jsonBody(req);
            return { status: 200, body: { success: true, updated: (body && body.userIds) || [] } };
        }
        if (method === 'POST' && path === '/mcp-proxy') {
            const body = await jsonBody(req);
            return { status: 200, body: { jsonrpc: '2.0', id: (body && body.id) || 1, result: { content: [] } } };
        }

        return null;
    }

    listDisputes(url) {
        const params = url.searchParams;
        const teamIds = (params.get('teamIds') || '').split(',').map((s) => s.trim()).filter(Boolean);
        const status = params.get('status') || 'open';
        const limit = Number(params.get('limit') || 50);
        const offset = Number(params.get('offset') || 0);

        let rows = this.seed.disputes.filter((d) => disputeMatchesStatus(d, status));
        if (teamIds.length) rows = rows.filter((d) => teamIds.includes(d.team_id));
        rows.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));

        const totalCount = rows.length;
        const page = rows.slice(offset, offset + limit);
        const active = this.seed.disputes.find((d) => d.leased_by);

        return {
            status: 200,
            body: {
                success: true,
                disputes: page,
                totalCount,
                activeDisputeId: active ? active.id : null
            }
        };
    }

    taskDisputes(url) {
        const taskId = url.searchParams.get('taskId');
        const rows = this.seed.disputes.filter(
            (d) => d.eval_task_id === taskId && d.dispute_status !== 'pending'
        );
        return { status: 200, body: { success: true, disputes: rows, totalCount: rows.length } };
    }

    disputeAction(id, action, actor, body) {
        const dispute = this.seed.disputes.find((d) => d.id === id);
        if (!dispute) {
            return { status: 404, body: { success: false, error: 'dispute not found' } };
        }

        if (action === 'claim') {
            const other = this.seed.disputes.find(
                (d) => d.leased_by && d.leased_by !== actor.person.id && d.id !== id
            );
            if (other) {
                return {
                    status: 409,
                    body: { error: 'You already have an active dispute claim.', activeDisputeId: other.id }
                };
            }
            if (dispute.leased_by && dispute.leased_by !== actor.person.id) {
                return { status: 409, body: { error: 'dispute already claimed', activeDisputeId: dispute.id } };
            }
            dispute.leased_by = actor.person.id;
            dispute.lease_expires_at = new Date(Date.now() + LEASE_MINUTES * 60000).toISOString();
            return { status: 200, body: { success: true, dispute } };
        }

        if (action === 'release') {
            dispute.leased_by = null;
            dispute.lease_expires_at = null;
            return { status: 200, body: { success: true, dispute } };
        }

        if (!actor.isResolver) {
            return { status: 403, body: { success: false, error: 'only dispute resolvers may resolve a dispute' } };
        }

        const status = (body && body.status) || (body && body.overturn ? 'approved' : 'rejected');
        dispute.dispute_status = status;
        dispute.resolved_by = actor.person.id;
        dispute.resolved_at = new Date().toISOString();
        dispute.resolution_reason = (body && (body.resolutionReason || body.reason)) || 'Resolved from the harness.';
        dispute.leased_by = null;
        dispute.lease_expires_at = null;
        if (body && body.disputeReviewDurationSeconds != null) {
            dispute.dispute_data = Object.assign({}, dispute.dispute_data, {
                dispute_review_duration_seconds: body.disputeReviewDurationSeconds
            });
        }
        if (body && body.resolutionScreenshotKeys) {
            dispute.dispute_data = Object.assign({}, dispute.dispute_data, {
                resolutionScreenshotKeys: body.resolutionScreenshotKeys
            });
        }
        const resolver = this.seed.profiles.find((p) => p.id === actor.person.id);
        dispute.resolver = resolver ? { full_name: resolver.full_name, email: resolver.email } : null;

        const task = this.seed.tasks.find((t) => t.id === dispute.eval_task_id);
        let newLifecycleStatus;
        if (status === 'approved' || status === 'approved_and_accepted' || status === 'approved_with_revisions') {
            if (task) task.task_lifecycle_status = status === 'approved_with_revisions' ? 'staging' : 'production';
            newLifecycleStatus = task ? task.task_lifecycle_status : 'production';
        } else if (task) {
            newLifecycleStatus = task.task_lifecycle_status;
        }

        return {
            status: 200,
            body: {
                success: true,
                dispute: { id: dispute.id, dispute_status: dispute.dispute_status, new_lifecycle_status: newLifecycleStatus }
            }
        };
    }

    listFlags(url) {
        const status = url.searchParams.get('status');
        const teamIds = (url.searchParams.get('teamIds') || '').split(',').map((s) => s.trim()).filter(Boolean);
        let rows = this.seed.task_flags.slice();
        if (status && status !== 'all') {
            rows = rows.filter((f) => (status === 'pending' ? f.resolution == null : f.resolution === status));
        }
        if (teamIds.length) rows = rows.filter((f) => teamIds.includes(f.task.team_id));
        rows.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
        return { status: 200, body: { flags: rows, totalCount: rows.length } };
    }

    createFlag(actor, body) {
        if (!actor.isQa) {
            return { status: 403, body: { success: false, error: 'only QA reviewers may raise a flag' } };
        }
        const taskId = body && (body.task_id || body.evalTaskId || body.eval_task_id || body.taskId);
        const task = this.seed.tasks.find((t) => t.id === taskId);
        if (!task) {
            return { status: 404, body: { success: false, error: 'task not found' } };
        }
        const flag = this._buildFlagRow(task, actor.person, body);
        this.seed.task_flags.push(flag);
        return { status: 200, body: { success: true, flag_id: flag.id } };
    }

    _buildFlagRow(task, flagger, body) {
        const versions = this.seed.task_versions.filter((v) => v.task_id === task.id);
        const creator = this.seed.profiles.find((p) => p.id === task.created_by);
        const target = this.seed.task_project_targets.find((t) => t.id === task.task_project_target_id);
        const project = target
            ? this.seed.task_projects.find((p) => p.id === target.project_id)
            : null;
        return {
            id: uuid(`flag:runtime:${task.key}:${this.seed.task_flags.length}`),
            task_id: task.id,
            flagger_id: flagger.id,
            reason: (body && body.reason) || 'other',
            note: (body && body.note) || '',
            resolution: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            resolved_by: null,
            resolved_at: null,
            resolution_note: null,
            flagger: profileEmbed(flagger),
            resolver: null,
            task: {
                id: task.id,
                key: task.key,
                team_id: task.team_id,
                created_by: task.created_by,
                task_lifecycle_status: task.task_lifecycle_status,
                task_project_target: target && project
                    ? { id: target.id, project: { id: project.id, name: project.name } }
                    : null,
                creator: profileEmbed(creator),
                eval_task_versions: versions.map((v) => ({ prompt: v.prompt, env_key: v.env_key }))
            }
        };
    }

    resolveFlag(id, actor, body) {
        if (!actor.isResolver) {
            return { status: 403, body: { success: false, error: 'only dispute resolvers may resolve a flag' } };
        }
        const flag = this.seed.task_flags.find((f) => String(f.id) === String(id));
        if (!flag) {
            return { status: 404, body: { success: false, error: 'flag not found' } };
        }
        const resolution = (body && body.resolution)
            || (body && body.dismiss ? 'dismissed' : 'confirmed');
        flag.resolution = resolution;
        flag.resolved_by = actor.person.id;
        flag.resolved_at = new Date().toISOString();
        flag.resolution_note = (body && body.note) || null;
        flag.updated_at = flag.resolved_at;
        flag.resolver = profileEmbed(actor.person);
        return { status: 200, body: { success: true } };
    }

    flagBugged(taskId, actor, body) {
        if (!actor.isQa) {
            return { status: 403, body: { success: false, error: 'only QA reviewers may flag a task as bugged' } };
        }
        const task = this.seed.tasks.find((t) => t.id === taskId || t.key === taskId);
        if (!task) {
            return { status: 404, body: { success: false, error: 'task not found' } };
        }
        if (task.task_lifecycle_status === 'discarded') {
            return { status: 400, body: { error: `Task is in 'discarded' status and cannot be flagged as bugged.` } };
        }
        task.task_lifecycle_status = 'bugged';
        const bugReason = (body && body.reason) || 'Task cannot be graded correctly';
        this.seed.qa_feedback.push({
            id: nextFeedbackId(),
            created_at: new Date().toISOString(),
            eval_task_id: task.id,
            feedback_content: `Escalated to fleet review: Flagged as bugged: ${bugReason}`,
            feedback_data: {
                bug_reason: bugReason,
                bug_description: (body && body.description) || 'Flagged as bugged from the harness.'
            },
            is_system_feedback: false,
            is_positive_feedback: false,
            created_by: actor.person.id,
            is_admin_feedback: false,
            proposed_prompt_changes: null,
            proposed_verifier_changes: null,
            qa_tool_use_workflow: null
        });
        return { status: 200, body: { success: true } };
    }

    screenshotViewUrls(body) {
        const keys = (body && (body.s3_keys || body.keys || body.screenshotKeys)) || [];
        const urls = keys.map((key) => `/__harness/screenshot?key=${encodeURIComponent(key)}`);
        return { status: 200, body: { urls } };
    }

    screenshotUploadUrls(body) {
        const files = (body && body.files) || [];
        const uploads = files.map((file) => {
            const s3Key = `qa-feedback-screenshots/${body.team_id || 'team'}/${body.task_id || 'task'}/${file.filename}`;
            return {
                filename: file.filename,
                s3_key: s3Key,
                upload_url: `/__harness/screenshot-upload?key=${encodeURIComponent(s3Key)}`
            };
        });
        return { status: 200, body: { uploads } };
    }

    workStats(url) {
        const userId = url.searchParams.get('userId') || url.searchParams.get('user_id')
            || (this.personas && this.personas.defaultPerson && this.personas.defaultPerson.id);
        const limit = Number(url.searchParams.get('limit') || 50);
        const offset = Number(url.searchParams.get('offset') || 0);
        const reviews = this.seed.qa_feedback.filter(
            (f) => f.created_by === userId && !f.is_system_feedback
        );
        const page = reviews.slice(offset, offset + limit);
        const feedbacks = page.map((row) => {
            const task = this.seed.tasks.find((t) => t.id === row.eval_task_id);
            const version = task
                ? this.seed.task_versions.find((v) => v.id === task.current_version_id)
                : null;
            const target = task
                ? this.seed.task_project_targets.find((t) => t.id === task.task_project_target_id)
                : null;
            const project = target
                ? this.seed.task_projects.find((p) => p.id === target.project_id)
                : null;
            return {
                id: row.id,
                eval_task_id: row.eval_task_id,
                created_at: row.created_at,
                created_by: row.created_by,
                feedback_content: row.feedback_content,
                feedback_data: row.feedback_data,
                qa_tool_use_workflow: row.qa_tool_use_workflow,
                is_positive_feedback: row.is_positive_feedback,
                is_admin_feedback: row.is_admin_feedback,
                is_system_feedback: row.is_system_feedback,
                eval_task: task
                    ? {
                        id: task.id,
                        created_at: task.created_at,
                        task_lifecycle_status: task.task_lifecycle_status,
                        task_project_target_id: task.task_project_target_id,
                        task_modality: task.task_modality
                    }
                    : null,
                eval_task_version: version
                    ? { id: version.id, prompt: version.prompt, env_key: version.env_key }
                    : null,
                task_project: project
                    ? { id: project.id, name: project.name, project_key: project.project_key }
                    : null
            };
        });
        return {
            status: 200,
            body: {
                feedbacks,
                total_count: reviews.length,
                has_more: offset + limit < reviews.length
            }
        };
    }

    qaDiscard(taskId, body) {
        const task = this.seed.tasks.find((t) => t.id === taskId || t.key === taskId);
        if (!task) {
            return { status: 404, body: { success: false, error: 'task not found' } };
        }
        task.task_lifecycle_status = 'discarded';
        const feedbackId = nextFeedbackId();
        const feedbackData = (body && body.feedback_data) || {};
        this.seed.qa_feedback.push({
            id: feedbackId,
            created_at: new Date().toISOString(),
            eval_task_id: task.id,
            feedback_content: `Task discarded: Rejection Reason: ${feedbackData.rejection_reason_label || 'Harness discard'}`,
            feedback_data: feedbackData,
            is_positive_feedback: false,
            is_system_feedback: false,
            created_by: null,
            is_admin_feedback: false,
            proposed_prompt_changes: null,
            proposed_verifier_changes: null,
            qa_tool_use_workflow: null
        });
        return {
            status: 200,
            body: {
                success: true,
                action: 'discard',
                error: null,
                new_version_id: null,
                new_instance_id: null,
                feedback_id: feedbackId,
                consecutive_approvals: 0,
                promoted_to_production: false,
                new_lifecycle_status: 'discarded'
            }
        };
    }

    teamBulkRemove(actor, body) {
        if (!actor.isResolver) {
            return { status: 403, body: { success: false, error: 'insufficient team permissions' } };
        }
        const ids = (body && body.userIds) || [];
        this.seed.team_member = this.seed.team_member.filter((m) => !ids.includes(m.profile_id));
        return { status: 200, body: { success: true, removed: ids } };
    }

    disputeReviewHistory(url) {
        const userId = url.searchParams.get('user_id');
        const limit = Number(url.searchParams.get('limit') || 25);
        const offset = Number(url.searchParams.get('offset') || 0);
        const rows = this.seed.disputes
            .filter((d) => d.resolved_by === userId)
            .map((d) => {
                const task = this.seed.tasks.find((t) => t.id === d.eval_task_id);
                return {
                    id: d.id,
                    eval_task_id: d.eval_task_id,
                    task_key: task ? task.key : null,
                    dispute_status: d.dispute_status,
                    dispute_data: d.dispute_data,
                    created_at: d.created_at,
                    resolved_at: d.resolved_at,
                    dispute_reason: d.dispute_reason
                };
            });
        return {
            status: 200,
            body: {
                total_count: rows.length,
                disputes: rows.slice(offset, offset + limit)
            }
        };
    }

    verifierVersion(versionId) {
        const row = this.seed.verifier_versions.find((v) => v.id === versionId);
        if (!row) {
            return { status: 404, body: { error: 'verifier version not found' } };
        }
        const verifier = this.seed.verifiers.find((v) => v.id === row.verifier_id);
        return {
            status: 200,
            body: {
                id: row.id,
                verifier_id: row.verifier_id,
                version: row.version,
                key: verifier ? verifier.key : null,
                code: row.display_src,
                display_src: row.display_src,
                created_at: row.created_at
            }
        };
    }

    taskEvents(url) {
        const taskId = url.searchParams.get('taskId') || url.searchParams.get('task_id');
        const task = this.seed.tasks.find((t) => t.id === taskId);
        if (!task) return { status: 200, body: { events: [] } };

        const versions = this.seed.task_versions
            .filter((v) => v.task_id === task.id)
            .sort((a, b) => a.version_no - b.version_no);
        const creator = this.seed.profiles.find((p) => p.id === task.created_by);
        const actor = creator
            ? { id: creator.id, full_name: creator.full_name, email: creator.email }
            : null;
        let eventId = intId(`events:${task.id}`, 900000, 999999);
        const events = [
            {
                id: eventId++,
                event_type: 'task.created',
                source: 'system',
                occurred_at: task.created_at,
                payload: {
                    key: task.key,
                    team_id: task.team_id,
                    task_modality: task.task_modality,
                    task_project_target_id: task.task_project_target_id,
                    task_scenario_id: task.task_scenario_id,
                    env_key: task.env_key,
                    env_version: task.env_version,
                    lifecycle_status: task.task_lifecycle_status
                },
                version_no: null,
                instance_id: null,
                workflow_id: null,
                actor: null
            }
        ];

        versions.forEach((version) => {
            events.push({
                id: eventId++,
                event_type: 'task.version_created',
                source: 'user',
                occurred_at: version.created_at,
                payload: {
                    prompt: version.prompt,
                    env_key: version.env_key,
                    env_variables: version.env_variables,
                    metadata: version.metadata,
                    verifier_id: version.verifier_id,
                    version: version.version_no,
                    prev_version_id: version.prev_version_id
                },
                version_no: version.version_no,
                instance_id: null,
                workflow_id: null,
                actor
            });
        });

        const failedExec = this.seed.verifier_executions.find(
            (e) => versions.some((v) => v.verifier_version_id === e.verifier_version_id && !e.success)
        );
        if (failedExec) {
            events.push({
                id: eventId++,
                event_type: 'instance.verifier_failed',
                source: 'system',
                occurred_at: failedExec.created_at,
                payload: {
                    error_message: 'ledger entry was never opened',
                    attempt_number: 1,
                    runtime_version: '3.11'
                },
                version_no: versions.find((v) => v.verifier_version_id === failedExec.verifier_version_id).version_no,
                instance_id: uuid(`instance:${task.id}`),
                workflow_id: null,
                actor: null
            });
        }

        const discard = this.seed.qa_feedback.find(
            (f) => f.eval_task_id === task.id && f.feedback_data && f.feedback_data.rejection_reason
        );
        if (discard) {
            events.push({
                id: eventId++,
                event_type: 'qa.revision_requested',
                source: 'user',
                occurred_at: discard.created_at,
                payload: {
                    feedback_content: discard.feedback_content,
                    feedback_data: discard.feedback_data,
                    is_admin_feedback: discard.is_admin_feedback,
                    is_positive_feedback: discard.is_positive_feedback
                },
                version_no: null,
                instance_id: null,
                workflow_id: null,
                actor: this.seed.profiles.find((p) => p.id === discard.created_by)
                    ? {
                        id: discard.created_by,
                        full_name: this.seed.profiles.find((p) => p.id === discard.created_by).full_name,
                        email: this.seed.profiles.find((p) => p.id === discard.created_by).email
                    }
                    : null
            });
        }

        return { status: 200, body: { events } };
    }
}

module.exports = { FleetWebApi, jsonBody };
