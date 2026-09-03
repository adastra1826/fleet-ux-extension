'use strict';

const { uuid, intId, makeRng, pick, isoAt, nextFeedbackId, resetFeedbackIdCounter } = require('./rng');
const W = require('./words');
const D = require('./distributions');

/**
 * Synthetic dataset aligned to local/api column names and shapes. Only names, emails,
 * UUIDs, and free-form prose are invented; enums, field names, and null mixes follow docs.
 */

const QA_COUNT = 6;
const RESOLVER_COUNT = 2;
const TASKS_PER_WRITER = 9;

function buildEnvVariables(envKey, rng, person) {
    const handle = person ? person.email.split('@')[0] : 'harness.user';
    return {
        SEED_ROOT: '/alloc/data',
        ENV_DB_DIR: '/alloc/data',
        CURRENT_DATE: '2025-10-14T12:00:00',
        FLEET_ENV_KEY: envKey,
        FLEET_ENV_VERSION: `0.0.${59 + Math.floor(rng() * 40)}`,
        FLEET_DEPLOY_PROFILE: 'qa',
        LOGGED_IN_EMAIL: `${handle}@harness.example`,
        LOGGED_IN_NAME: person ? person.full_name : 'Harness User'
    };
}

function buildTeams() {
    return [
        {
            id: uuid('team:alpha'),
            name: 'Task Designers - Harness Alpha',
            logo_url: null,
            created_at: isoAt(-90)
        },
        {
            id: uuid('team:beta'),
            name: 'Task Designers - Harness Beta',
            logo_url: null,
            created_at: isoAt(-90)
        }
    ];
}

function buildPeople(teams) {
    return W.PEOPLE.map((person, index) => {
        const isQa = index < QA_COUNT;
        const isResolver = index < RESOLVER_COUNT;
        const handle = `${person.first}.${person.last}`.toLowerCase();
        return {
            id: uuid(`profile:${index}`),
            full_name: `${person.first} ${person.last}`,
            email: `${handle}@harness.example`,
            avatar_url: null,
            created_at: isoAt(-80 + index),
            harness: {
                index,
                isWriter: true,
                isQa,
                isResolver,
                teamId: teams[index % teams.length].id,
                teamRole: isResolver ? 'ADMIN' : 'MEMBER',
                label: isResolver ? 'Writer + QA + Resolver' : isQa ? 'Writer + QA' : 'Writer'
            }
        };
    });
}

function buildTeamMembership(people, teams) {
    const rows = [];
    people.forEach((person) => {
        const primary = teams.find((t) => t.id === person.harness.teamId) || teams[0];
        rows.push({
            id: uuid(`team_member:${person.id}:${primary.id}`),
            profile_id: person.id,
            team_id: primary.id,
            role: person.harness.teamRole,
            status: 'ACTIVE',
            created_at: isoAt(-70),
            team: { id: primary.id, name: primary.name, logo_url: primary.logo_url }
        });
        if (person.harness.isQa) {
            const secondary = teams.find((t) => t.id !== primary.id);
            if (secondary) {
                rows.push({
                    id: uuid(`team_member:${person.id}:${secondary.id}`),
                    profile_id: person.id,
                    team_id: secondary.id,
                    role: 'MEMBER',
                    status: 'ACTIVE',
                    created_at: isoAt(-65),
                    team: { id: secondary.id, name: secondary.name, logo_url: secondary.logo_url }
                });
            }
        }
    });
    return rows;
}

function buildProjects(teams) {
    const projects = W.PROJECTS.map((name, index) => ({
        id: uuid(`task_project:${index}`),
        name,
        team_id: teams[index % teams.length].id,
        status: 'active',
        description: `${name} harness project`,
        project_key: `harness-${index}`,
        created_at: isoAt(-60),
        task_pass_rate_distribution: index % 3 === 0
            ? {
                buckets: [
                    { min: 0, max: 0.1, label: 'Hard', percentage: 33 },
                    { min: 0.1, max: 0.4, label: 'Medium', percentage: 34 },
                    { min: 0.4, max: 1, label: 'Easy', percentage: 33 }
                ]
            }
            : null
    }));
    const targets = projects.map((project, index) => ({
        id: uuid(`task_project_target:${index}`),
        project_id: project.id,
        name: `${project.name} target`,
        env_key: W.ENV_KEYS[index % W.ENV_KEYS.length],
        created_at: isoAt(-60)
    }));
    return { projects, targets };
}

function buildEnvironments() {
    return W.ENV_KEYS.map((envKey, index) => ({
        id: uuid(`environment:${index}`),
        env_key: envKey,
        name: envKey.replace('harness-', 'Harness ').replace(/^./, (c) => c.toUpperCase()),
        created_at: isoAt(-60),
        deleted_at: null
    }));
}

function buildScenarios() {
    return W.SCENARIO_TITLES.map((title, index) => {
        const rng = makeRng(`scenario:${index}`);
        return {
            id: 20377 + index,
            scenario_title: title,
            user_story: [pick(rng, W.USER_STORY_PARTS), pick(rng, W.USER_STORY_PARTS)].join(' '),
            human_annotator_instructions: pick(rng, W.INSTRUCTION_PARTS),
            created_at: isoAt(-55)
        };
    });
}

function buildWorkflowSteps(rng, count) {
    const steps = [];
    for (let i = 0; i < count; i++) {
        const tool = pick(rng, W.TOOL_NAMES);
        steps.push({
            index: i,
            tool,
            parameters: {
                record_id: `rec_${Math.floor(rng() * 9000 + 1000)}`,
                confirm: i === count - 1
            },
            result: `${tool} returned ${Math.floor(rng() * 4 + 1)} row(s)`
        });
    }
    return steps;
}

function buildTasksAndVersions(people, teams, targets, scenarios) {
    const tasks = [];
    const versions = [];
    const verifiers = [];
    const verifierVersions = [];
    const verifierExecutions = [];

    const total = people.length * TASKS_PER_WRITER;
    const lifecycles = D.spread(D.LIFECYCLE_MIX, total, D.LIFECYCLE_MINIMUMS);
    const versionCounts = D.spread(D.VERSION_MIX, total);

    let counter = 0;
    people.forEach((person) => {
        for (let n = 0; n < TASKS_PER_WRITER; n++) {
            const rng = makeRng(`task:${person.harness.index}:${n}`);
            const taskKey = `task_harness${String(counter).padStart(3, '0')}`;
            const taskId = uuid(`task:${taskKey}`);
            const target = targets[counter % targets.length];
            const scenario = scenarios[counter % scenarios.length];
            const team = teams.find((t) => t.id === person.harness.teamId) || teams[0];
            const lifecycle = lifecycles[counter];
            const versionCount = versionCounts[counter];
            const accepted = D.LIFECYCLE_ACCEPTED.includes(lifecycle);
            const createdAt = isoAt(-120 + counter, counter % 12);
            const envVersionId = uuid(`env_version:${taskKey}`);

            const verifierId = uuid(`verifier:${taskKey}`);
            verifiers.push({
                id: verifierId,
                key: `verifier-${taskKey}`,
                team_id: team.id,
                created_at: createdAt
            });

            let currentVersionId = null;
            let prevVersionId = null;
            const v1CreationSeconds = 90 + Math.floor(rng() * 3600);

            for (let v = 1; v <= versionCount; v++) {
                const versionId = uuid(`task_version:${taskKey}:${v}`);
                const verifierVersionId = uuid(`verifier_version:${taskKey}:${v}`);
                const versionAt = isoAt(-120 + counter + (v - 1) * 2, (counter + v) % 12);
                currentVersionId = versionId;
                const prompt = `${scenario.scenario_title}. ${pick(rng, W.USER_STORY_PARTS)}`;
                const workflowSteps = buildWorkflowSteps(rng, 3 + (counter % 3));

                versions.push({
                    id: versionId,
                    task_id: taskId,
                    version_no: v,
                    created_at: versionAt,
                    created_by: person.id,
                    prompt,
                    env_key: target.env_key,
                    verifier_id: verifierId,
                    verifier_version_id: verifierVersionId,
                    prev_version_id: prevVersionId,
                    resubmission_notes: v > 1 && rng() < 0.6
                        ? pick(rng, W.QA_GENERAL_FEEDBACK)
                        : (v === 1 && rng() < 0.15 ? pick(rng, W.QA_POSITIVE) : null),
                    scratchpad: rng() < 0.12 ? pick(rng, W.INSTRUCTION_PARTS) : null,
                    env_variables: buildEnvVariables(target.env_key, rng, person),
                    metadata: {
                        verifier_key: `verifier-${taskKey}-${v}`,
                        verifier_version: v,
                        writer_timezone: pick(rng, ['America/New_York', 'America/Toronto', 'Europe/London']),
                        problem_creation_time: v === 1 ? v1CreationSeconds : undefined,
                        created_from_version_id: v > 1 ? prevVersionId : null,
                        verifier_code: [
                            'def validate_task(env, final_answer=None):',
                            `    """Harness verifier for ${taskKey} (v${v})."""`,
                            '    entry = env.get("ledger_entry")',
                            '    return bool(entry and entry.get("saved")), "checked saved flag"'
                        ].join('\n'),
                        feedback_response_time: v > 1 ? 120 + Math.floor(rng() * 800) : undefined
                    },
                    is_active: false,
                    is_user_authored: v === 1 ? true : rng() < 0.8,
                    version: null,
                    tool_use_workflow: rng() < 0.3 ? { steps: workflowSteps } : null,
                    factual_answer: null,
                    environment_version_id: null,
                    ci_job_id: null,
                    activity_event_id: null,
                    attachments: null,
                    graded: null
                });

                verifierVersions.push({
                    id: verifierVersionId,
                    verifier_id: verifierId,
                    version: v,
                    display_src: [
                        'def verify(state):',
                        `    """Harness verifier for ${taskKey} (v${v})."""`,
                        '    entry = state.get("ledger_entry")',
                        '    if entry is None:',
                        '        return False, "ledger entry was never opened"',
                        '    return bool(entry.get("saved")), "checked saved flag"'
                    ].join('\n'),
                    created_at: versionAt
                });

                const passed = accepted && v === versionCount;
                const stdout = passed
                    ? 'Verifier passed: checked saved flag\n'
                    : 'Verifier failed: ledger entry was never opened\n';
                verifierExecutions.push({
                    id: uuid(`verifier_execution:${taskKey}:${v}`),
                    created_at: versionAt,
                    score: passed ? 1 : 0,
                    success: passed,
                    stdout,
                    execution_time_ms: 800 + Math.floor(rng() * 5000),
                    result: {
                        meta: {
                            verifier_id: `verifier-${taskKey}`,
                            function_name: `verify_${taskKey.replace(/[^a-z0-9]/gi, '_')}`,
                            python_version: '3.11'
                        },
                        error: passed ? null : { message: 'ledger entry was never opened' },
                        result: passed ? 1.0 : 0.0,
                        stdout,
                        success: passed,
                        bundle_cache_hit: false,
                        execution_time_ms: 800 + Math.floor(rng() * 5000)
                    },
                    verifier_id: verifierId,
                    environment_id: `${target.env_key}-instance-${counter % 5}`,
                    verifier_version_id: verifierVersionId
                });

                prevVersionId = versionId;
            }

            tasks.push({
                id: taskId,
                key: taskKey,
                created_by: person.id,
                team_id: team.id,
                env_key: target.env_key,
                task_project_target_id: target.id,
                task_scenario_id: scenario.id,
                task_lifecycle_status: lifecycle,
                current_version_id: currentVersionId,
                deleted_at: null,
                created_at: createdAt,
                updated_at: createdAt,
                task_modality: 'computer_use',
                env_version_id: envVersionId,
                env_version: `v0.0.${157 + (counter % 20)}`,
                env_data_version: `v0.0.${37 + (counter % 10)}`,
                env_data_key: target.env_key.replace('harness-', ''),
                ci_active: false,
                writer_metadata: null,
                qa_metadata: null,
                post_run_qa_ready_at: null,
                env_multi_app_seed_versions: null
            });

            counter++;
        }
    });

    return { tasks, versions, verifiers, verifierVersions, verifierExecutions };
}

const LIFECYCLE_ENDS_NEGATIVE = ['discarded', 'dismissed', 'bugged'];

function buildQaFeedback(tasks, versions, people) {
    const qaPeople = people.filter((p) => p.harness.isQa);
    const versionsByTask = new Map();
    versions.forEach((version) => {
        const list = versionsByTask.get(version.task_id) || [];
        list.push(version);
        versionsByTask.set(version.task_id, list);
    });

    const reviewedCount = Math.round(tasks.length * D.QA_COVERAGE);
    const reviewed = new Set(
        D.spread([{ value: true, weight: D.QA_COVERAGE }, { value: false, weight: 1 - D.QA_COVERAGE }], tasks.length)
            .map((isReviewed, index) => (isReviewed ? index : -1))
            .filter((index) => index !== -1)
            .slice(0, reviewedCount)
    );

    const slots = [];
    tasks.forEach((task, index) => {
        if (!reviewed.has(index)) return;
        const taskVersions = versionsByTask.get(task.id) || [];
        const rounds = D.QA_ROWS_BY_VERSION[taskVersions.length] || 1;
        const accepted = D.LIFECYCLE_ACCEPTED.includes(task.task_lifecycle_status);
        for (let round = 0; round < rounds; round++) {
            const lastRound = round === rounds - 1;
            slots.push({
                task,
                version: taskVersions[Math.min(round, taskVersions.length - 1)],
                mustApprove: lastRound && accepted && rounds > 1,
                mustReject: lastRound && LIFECYCLE_ENDS_NEGATIVE.includes(task.task_lifecycle_status)
            });
        }
    });

    dealRowKinds(slots);

    const qualityRatings = D.spread(D.PROMPT_QUALITY_MIX, slots.length);
    const rejections = D.spread(
        D.REJECTION_REASONS.map((r) => ({ value: r.key, weight: r.weight })),
        slots.filter((slot) => slot.kind === 'discard').length
    );
    const bugReasons = D.spread(
        D.BUG_REASONS.map((r) => ({ value: r.label, weight: r.weight })),
        slots.filter((slot) => slot.kind === 'bugged').length
    );

    let discardIndex = 0;
    let bugIndex = 0;
    return slots.map((slot, sequence) => {
        if (slot.kind === 'system') {
            return makeSystemFeedbackRow(slot.task, slot.version, sequence);
        }
        return makeFeedbackRow(slot.task, slot.version, pickReviewer(qaPeople, slot.task, sequence), {
            kind: slot.kind,
            sequence,
            rng: makeRng(`qa:${slot.task.key}:${sequence}`),
            qualityRating: qualityRatings[sequence],
            rejectionReason: slot.kind === 'discard' ? rejections[discardIndex++] : null,
            bugReason: slot.kind === 'bugged' ? bugReasons[bugIndex++] : null
        });
    });
}

function dealRowKinds(slots) {
    const pool = D.spread(D.QA_ROW_KIND_MIX, slots.length);
    const approvals = pool.filter((kind) => kind === 'approval');
    const rejections = pool.filter((kind) => kind !== 'approval');
    const take = (list, fallback) => (list.length ? list.shift() : fallback.shift());

    slots.forEach((slot) => {
        if (slot.mustApprove) slot.kind = take(approvals, rejections);
    });
    slots.forEach((slot) => {
        if (!slot.kind && slot.mustReject) slot.kind = take(rejections, approvals);
    });
    slots.forEach((slot) => {
        if (!slot.kind) slot.kind = take(approvals, rejections) || take(rejections, approvals);
    });
}

function pickReviewer(qaPeople, task, sequence) {
    for (let offset = 0; offset < qaPeople.length; offset++) {
        const candidate = qaPeople[(sequence + offset) % qaPeople.length];
        if (candidate.id !== task.created_by) return candidate;
    }
    return qaPeople[0];
}

function makeSystemFeedbackRow(task, version, sequence) {
    return {
        id: nextFeedbackId(),
        created_at: isoAt(-100 + sequence, sequence % 10),
        eval_task_id: task.id,
        feedback_content: 'Automated verifier run did not reach a passing state.',
        feedback_data: {},
        is_positive_feedback: false,
        is_system_feedback: true,
        created_by: null,
        is_admin_feedback: false,
        proposed_prompt_changes: null,
        proposed_verifier_changes: null,
        qa_tool_use_workflow: null
    };
}

function makeFeedbackRow(task, version, reviewer, options) {
    const { kind, sequence, rng, qualityRating } = options;
    const base = {
        id: nextFeedbackId(),
        created_at: isoAt(-100 + sequence, sequence % 10),
        eval_task_id: task.id,
        is_system_feedback: false,
        is_positive_feedback: kind === 'approval',
        created_by: reviewer.id,
        is_admin_feedback: false,
        proposed_prompt_changes: null,
        proposed_verifier_changes: null,
        qa_tool_use_workflow: null
    };

    const reviewSeconds = 45 + Math.floor(rng() * 4200);

    if (kind === 'approval') {
        const data = {
            qa_checklist: { achievable: true, clearSolution: true, wellSpecified: true },
            prompt_quality_rating: qualityRating,
            qa_review_duration_seconds: reviewSeconds
        };
        if (rng() < D.FEEDBACK_FIELD_RATES.general_feedback) {
            data.general_feedback = pick(rng, W.QA_POSITIVE);
        }
        return Object.assign(base, {
            feedback_content: 'Task approved by QA reviewer',
            feedback_data: data
        });
    }

    if (kind === 'bugged') {
        return Object.assign(base, {
            feedback_content: `Escalated to fleet review: Flagged as bugged: ${options.bugReason}`,
            feedback_data: {
                bug_reason: options.bugReason,
                bug_description: pick(rng, W.BUG_DESCRIPTIONS)
            }
        });
    }

    const byKey = (key) => D.REJECTION_REASONS.find((r) => r.key === key);
    const reasons = [byKey(options.rejectionReason)];
    if (rng() < D.MULTI_REASON_SHARE) {
        const second = D.pickWeightedEntry(rng, D.REJECTION_REASONS);
        if (second.key !== reasons[0].key) reasons.push(second);
    }

    const escalated = task.task_lifecycle_status === 'escalated-fleet-review';
    const data = {
        rejection_reason: reasons[0].key,
        rejection_reasons: reasons.map((r) => r.key),
        rejection_reason_label: reasons[0].label,
        rejection_reason_labels: reasons.map((r) => r.label),
        issue_sources: ['Task'],
        is_escalation: escalated,
        qa_checklist: {
            achievable: rng() < 0.4,
            clearSolution: false,
            wellSpecified: rng() < 0.25
        },
        prompt_quality_rating: qualityRating,
        qa_review_duration_seconds: reviewSeconds
    };

    if (reasons[0].key === 'other') {
        data.other_reason_explanation = pick(rng, W.QA_NEGATIVE);
    }
    const rates = D.FEEDBACK_FIELD_RATES;
    if (rng() < rates.attempted_actions) data.attempted_actions = pick(rng, W.QA_ATTEMPTED_ACTIONS);
    if (rng() < rates.task_feedback) data.task_feedback = pick(rng, W.QA_NEGATIVE);
    if (rng() < rates.general_feedback) data.general_feedback = pick(rng, W.QA_GENERAL_FEEDBACK);
    if (escalated || rng() < rates.grading_feedback) data.grading_feedback = pick(rng, W.QA_GRADING_FEEDBACK);
    if (rng() < rates.environment_feedback) data.environment_feedback = pick(rng, W.QA_ENVIRONMENT_FEEDBACK);
    if (rng() < D.SCREENSHOT_SHARE) {
        data.screenshots = [`qa-feedback-screenshots/${task.team_id}/${task.id}/${uuid(`shot:${base.id}`)}.png`];
    }

    return Object.assign(base, {
        feedback_content: `Task discarded: Rejection Reason: ${data.rejection_reason_labels.join(', ')}`,
        feedback_data: data
    });
}

function buildDisputes(qaFeedback, tasks, people, versions, projects, targets) {
    const resolvers = people.filter((p) => p.harness.isResolver);
    const byId = new Map(tasks.map((t) => [t.id, t]));
    const versionsByTask = new Map();
    versions.forEach((v) => {
        const list = versionsByTask.get(v.task_id) || [];
        list.push(v);
        versionsByTask.set(v.task_id, list);
    });
    const targetById = new Map(targets.map((t) => [t.id, t]));
    const projectById = new Map(projects.map((p) => [p.id, p]));
    const negative = qaFeedback.filter((f) => !f.is_system_feedback && !f.is_positive_feedback);
    const rows = [];

    negative.slice(0, 14).forEach((feedback, index) => {
        const task = byId.get(feedback.eval_task_id);
        if (!task) return;
        const rng = makeRng(`dispute:${feedback.id}`);
        const resolved = index % 3 !== 0;
        const resolver = resolvers[index % resolvers.length];
        const creator = people.find((p) => p.id === task.created_by);
        const overturned = resolved && rng() < D.DISPUTE_OVERTURN_SHARE;
        const currentVersion = (versionsByTask.get(task.id) || []).slice(-1)[0];
        const target = targetById.get(task.task_project_target_id);
        const project = target ? projectById.get(target.project_id) : null;

        let disputeStatus = 'pending';
        if (resolved) {
            disputeStatus = overturned ? 'approved' : 'rejected';
        }

        rows.push({
            id: intId(`dispute:${feedback.id}`, 41000, 41999),
            feedback_id: feedback.id,
            user_id: task.created_by,
            eval_task_id: task.id,
            team_id: task.team_id,
            dispute_status: disputeStatus,
            dispute_reason: pick(rng, W.DISPUTE_REASONS),
            dispute_data: {
                category: D.pickWeighted(rng, D.DISPUTE_CATEGORIES),
                feedbackId: feedback.id,
                screenshotKeys: feedback.feedback_data.screenshots || [],
                dispute_review_duration_seconds: resolved ? 180 + Math.floor(rng() * 900) : undefined,
                resolutionScreenshotKeys: resolved && rng() < 0.3
                    ? [`dispute-screenshots/${task.team_id}/${task.id}/resolve.png`]
                    : undefined
            },
            resolved_by: resolved ? resolver.id : null,
            resolved_at: resolved ? isoAt(-10 + index, 4) : null,
            resolution_reason: resolved ? pick(rng, W.RESOLUTION_REASONS) : null,
            leased_by: null,
            lease_expires_at: null,
            created_at: isoAt(-18 + index, index % 8),
            feedback_created_by: feedback.created_by,
            original_qa_workflow: null,
            eval_task: {
                id: task.id,
                key: task.key,
                created_by: task.created_by,
                eval_task_versions: currentVersion
                    ? { prompt: currentVersion.prompt, env_key: currentVersion.env_key, created_at: currentVersion.created_at }
                    : null
            },
            creator: creator
                ? { full_name: creator.full_name, email: creator.email }
                : null,
            resolver: resolved && resolver
                ? { full_name: resolver.full_name, email: resolver.email }
                : null,
            original_feedback_content: feedback.feedback_content,
            original_feedback_data: feedback.feedback_data,
            original_feedback_created_at: feedback.created_at,
            original_feedback_created_by: feedback.created_by
        });
    });

    return rows;
}

function buildFlags(tasks, people, versions, projects, targets) {
    const qaPeople = people.filter((p) => p.harness.isQa);
    const resolvers = people.filter((p) => p.harness.isResolver);
    const versionsByTask = new Map();
    versions.forEach((version) => {
        const current = versionsByTask.get(version.task_id);
        if (!current || version.version_no > current.version_no) {
            versionsByTask.set(version.task_id, version);
        }
    });
    const allVersionsByTask = new Map();
    versions.forEach((version) => {
        const list = allVersionsByTask.get(version.task_id) || [];
        list.push(version);
        allVersionsByTask.set(version.task_id, list);
    });
    const targetById = new Map(targets.map((t) => [t.id, t]));
    const projectById = new Map(projects.map((p) => [p.id, p]));
    const rows = [];

    tasks.filter((_task, index) => index % 7 === 2).forEach((task, index) => {
        const rng = makeRng(`flag:${task.key}`);
        const flagger = pickReviewer(qaPeople, task, index);
        const resolution = ['pending', 'pending', 'confirmed', 'dismissed'][index % 4];
        const resolved = resolution !== 'pending';
        const resolver = resolvers[index % resolvers.length];
        const version = versionsByTask.get(task.id);
        const creator = people.find((p) => p.id === task.created_by);
        const target = targetById.get(task.task_project_target_id);
        const project = target ? projectById.get(target.project_id) : null;
        const createdAt = isoAt(-14 + index, index % 6);

        rows.push({
            id: uuid(`flag:${task.key}`),
            task_id: task.id,
            flagger_id: flagger.id,
            reason: D.FLAG_REASONS[index % D.FLAG_REASONS.length],
            note: pick(rng, W.FLAG_NOTES),
            resolution: resolved ? resolution : null,
            resolved_at: resolved ? isoAt(-6 + index, 2) : null,
            resolved_by: resolved ? resolver.id : null,
            resolution_note: resolved ? pick(rng, W.RESOLUTION_REASONS) : null,
            created_at: createdAt,
            updated_at: createdAt,
            flagger: flagger
                ? { id: flagger.id, full_name: flagger.full_name, email: flagger.email }
                : null,
            resolver: resolved && resolver
                ? { id: resolver.id, full_name: resolver.full_name, email: resolver.email }
                : null,
            task: {
                id: task.id,
                key: task.key,
                team_id: task.team_id,
                created_by: task.created_by,
                task_lifecycle_status: task.task_lifecycle_status,
                task_project_target: target && project
                    ? { id: target.id, project: { id: project.id, name: project.name } }
                    : null,
                creator: creator
                    ? { id: creator.id, full_name: creator.full_name, email: creator.email }
                    : null,
                eval_task_versions: (allVersionsByTask.get(task.id) || []).map((v) => ({
                    prompt: v.prompt,
                    env_key: v.env_key
                }))
            }
        });
    });

    return rows;
}

function buildSessions(tasks, people, versions, verifierExecutions) {
    const qaPeople = people.filter((p) => p.harness.isQa);
    const sessions = [];
    const results = [];
    const versionsByTask = new Map();
    versions.forEach((v) => {
        const cur = versionsByTask.get(v.task_id);
        if (!cur || v.version_no > cur.version_no) versionsByTask.set(v.task_id, v);
    });
    const execByVersion = new Map(
        verifierExecutions.map((e) => [e.verifier_version_id, e])
    );

    tasks.filter((_task, index) => index % 3 === 0).forEach((task, index) => {
        const sessionId = uuid(`session:${task.key}`);
        const createdAt = isoAt(-25 + index, index % 9);
        const status = index % 5 === 0 ? 'cancelled' : (index % 3 === 0 ? 'completed' : 'in_progress');
        const completed = status === 'completed';
        const version = versionsByTask.get(task.id);
        const execRow = version ? execByVersion.get(version.verifier_version_id) : null;

        sessions.push({
            id: sessionId,
            created_at: createdAt,
            started_at: status === 'cancelled' ? null : isoAt(-24 + index, index % 9),
            ended_at: completed ? isoAt(-23 + index, index % 9) : null,
            team_id: task.team_id,
            status,
            model: completed ? pick(makeRng(`session-model:${task.key}`), ['claude-sonnet-4.5', 'gemini-3-pro-preview']) : null,
            verifier_execution: execRow ? execRow.id : null,
            eval_task: task.id,
            instance: `${task.env_key}-instance-${index % 4}`,
            available_tools: completed ? { tools: ['click', 'type', 'scroll'] } : null,
            attempt: 1,
            workflow_input_json: completed ? { prompt: version ? version.prompt : '' } : null,
            archived: false,
            metadata: completed ? { steps: 12 + index } : null,
            job_id: uuid(`job:${task.key}`),
            eval_task_version_id: version ? version.id : null,
            total_cost_usd: completed ? 0.02 + index * 0.001 : null,
            total_cached_tokens: completed ? 1000 + index * 50 : null,
            total_uncached_tokens: completed ? 500 + index * 20 : null,
            total_generated_tokens: completed ? 200 + index * 10 : null,
            total_cache_read_tokens: null,
            total_cache_creation_tokens: null
        });

        if (index % 2 === 0) {
            const reviewer = qaPeople[index % qaPeople.length];
            const verdicts = ['pass', 'fail', 'review_needed'];
            results.push({
                id: uuid(`qa_session_result:${task.key}`),
                qa_project_id: uuid(`qa_project:${index % 3}`),
                session_id: sessionId,
                team_id: task.team_id,
                reviewer_id: reviewer.id,
                verdict: verdicts[index % verdicts.length],
                difficulty: index % 4 === 0 ? 'medium' : null,
                notes: index % 4 === 0
                    ? 'Trace matches the stated workflow.'
                    : 'Trace skips the confirmation frame.',
                metadata: {},
                created_at: isoAt(-22 + index, 5),
                updated_at: isoAt(-22 + index, 5)
            });
        }
    });
    return { sessions, results };
}

function buildLeases(disputes, people) {
    const resolvers = people.filter((p) => p.harness.isResolver);
    return disputes
        .filter((d) => d.dispute_status === 'pending')
        .slice(0, 1)
        .map((dispute, index) => ({
            id: uuid(`eval_task_lease:${dispute.id}`),
            task_id: dispute.eval_task_id,
            owner_id: resolvers[index % resolvers.length].id,
            expires_at: isoAt(365),
            ended_at: null,
            created_at: isoAt(-1)
        }));
}

function buildHelpfulness(qaFeedback, people) {
    return qaFeedback.slice(0, 5).map((feedback, index) => ({
        id: uuid(`helpfulness:${feedback.id}`),
        feedback_id: feedback.id,
        user_id: people[index % people.length].id,
        is_helpful: index % 2 === 0,
        report_text: index % 2 === 0 ? null : 'Review does not point at a concrete step.',
        created_at: isoAt(-8 + index)
    }));
}

function buildGuidelines() {
    return W.GUIDELINE_SECTIONS.map((title, index) => ({
        id: uuid(`guideline:${index}`),
        title,
        body: `${title}. ${W.INSTRUCTION_PARTS[index % W.INSTRUCTION_PARTS.length]}`,
        updated_at: isoAt(-12 + index)
    }));
}

function buildAssessments(people) {
    return people.slice(0, 4).map((person, index) => ({
        id: uuid(`assessment:${index}`),
        candidate_id: person.id,
        candidate_name: person.full_name,
        status: index === 0 ? 'to_grade' : 'graded',
        submitted_at: isoAt(-9 + index, 2),
        score: index === 0 ? null : 3 + index
    }));
}

/** Local-calendar ISO so Daily Task Creation / QA / dispute-review plugins see a non-zero today. */
function localDayIso(hour, minute) {
    const d = new Date();
    d.setHours(hour, minute || 0, 0, 0);
    return d.toISOString();
}

/**
 * Stamp a handful of the default persona's (profiles[0]) rows with today's timestamps.
 * IDs stay stable; only dates move so dashboard day breakdowns are populated.
 */
function stampTodayActivity(people, tasks, qaFeedback, disputes) {
    const person = people[0];
    if (!person) return;
    tasks
        .filter((task) => task.created_by === person.id)
        .slice(0, 5)
        .forEach((task, index) => {
            task.created_at = localDayIso(9, index * 8);
        });
    qaFeedback
        .filter((row) => row.created_by === person.id && !row.is_system_feedback)
        .slice(0, 6)
        .forEach((row, index) => {
            row.created_at = localDayIso(11, index * 6);
        });
    const resolved = disputes.filter((d) => d.resolved_by === person.id);
    const toStamp = resolved.length >= 3
        ? resolved.slice(0, 4)
        : disputes.filter((d) => d.resolved_by === person.id || d.dispute_status === 'pending').slice(0, 4);
    toStamp.forEach((row, index) => {
        row.resolved_by = person.id;
        row.resolved_at = localDayIso(14, index * 9);
        if (row.dispute_status === 'pending') {
            row.dispute_status = index % 2 === 0 ? 'approved' : 'rejected';
        }
    });
}

function buildSeed() {
    resetFeedbackIdCounter();
    const teams = buildTeams();
    const people = buildPeople(teams);
    const teamMembers = buildTeamMembership(people, teams);
    const { projects, targets } = buildProjects(teams);
    const environments = buildEnvironments();
    const scenarios = buildScenarios();
    const { tasks, versions, verifiers, verifierVersions, verifierExecutions } =
        buildTasksAndVersions(people, teams, targets, scenarios);
    const qaFeedback = buildQaFeedback(tasks, versions, people);
    const disputes = buildDisputes(qaFeedback, tasks, people, versions, projects, targets);
    const flags = buildFlags(tasks, people, versions, projects, targets);
    const { sessions, results } = buildSessions(tasks, people, versions, verifierExecutions);
    const leases = buildLeases(disputes, people);
    const helpfulness = buildHelpfulness(qaFeedback, people);
    stampTodayActivity(people, tasks, qaFeedback, disputes);

    return {
        meta: {
            generatedFrom: 'test/harness/seed/generate.js',
            people: people.length,
            qaPeople: people.filter((p) => p.harness.isQa).length,
            resolvers: people.filter((p) => p.harness.isResolver).length,
            tasks: tasks.length,
            taskVersions: versions.length,
            qaFeedback: qaFeedback.length,
            disputes: disputes.length
        },
        teams,
        profiles: people,
        team_member: teamMembers,
        task_projects: projects,
        task_project_targets: targets,
        environments,
        task_scenarios: scenarios,
        tasks,
        task_versions: versions,
        verifiers,
        verifier_versions: verifierVersions,
        verifier_executions: verifierExecutions,
        qa_feedback: qaFeedback,
        disputes,
        task_flags: flags,
        sessions,
        qa_session_results: results,
        eval_task_leases: leases,
        feedback_helpfulness_ratings: helpfulness,
        guidelines: buildGuidelines(),
        assessments: buildAssessments(people)
    };
}

module.exports = { buildSeed, QA_COUNT, RESOLVER_COUNT };
