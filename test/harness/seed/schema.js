'use strict';

/**
 * Documented column sets for harness seed parity. Derived from local/api docs and samples.
 * Used by generate.js row builders and e2e coverage tests.
 */

const TABLES = {
    tasks: [
        'id', 'key', 'created_by', 'team_id', 'env_key', 'task_project_target_id', 'task_scenario_id',
        'task_lifecycle_status', 'current_version_id', 'created_at', 'updated_at', 'deleted_at',
        'task_modality', 'env_version_id', 'env_version', 'env_data_version', 'env_data_key',
        'ci_active', 'writer_metadata', 'qa_metadata', 'post_run_qa_ready_at', 'env_multi_app_seed_versions'
    ],
    task_versions: [
        'id', 'task_id', 'version_no', 'created_at', 'created_by', 'prompt', 'env_key',
        'verifier_id', 'verifier_version_id', 'prev_version_id', 'resubmission_notes', 'scratchpad',
        'env_variables', 'metadata', 'is_active', 'is_user_authored', 'version', 'tool_use_workflow',
        'factual_answer', 'environment_version_id', 'ci_job_id', 'activity_event_id', 'attachments', 'graded'
    ],
    qa_feedback: [
        'id', 'created_at', 'eval_task_id', 'feedback_content', 'is_positive_feedback',
        'is_system_feedback', 'created_by', 'is_admin_feedback', 'proposed_prompt_changes',
        'proposed_verifier_changes', 'feedback_data', 'qa_tool_use_workflow'
    ],
    sessions: [
        'id', 'created_at', 'started_at', 'ended_at', 'team_id', 'status', 'model',
        'verifier_execution', 'eval_task', 'instance', 'available_tools', 'attempt',
        'workflow_input_json', 'archived', 'metadata', 'job_id', 'eval_task_version_id',
        'total_cost_usd', 'total_cached_tokens', 'total_uncached_tokens', 'total_generated_tokens',
        'total_cache_read_tokens', 'total_cache_creation_tokens'
    ],
    environments: ['id', 'env_key', 'name', 'created_at', 'deleted_at'],
    task_project_targets: ['id', 'project_id', 'name', 'env_key', 'created_at'],
    task_projects: ['id', 'name', 'team_id', 'created_at', 'status', 'description', 'project_key'],
    verifier_versions: ['id', 'verifier_id', 'version', 'created_at', 'display_src'],
    verifier_executions: [
        'id', 'created_at', 'score', 'success', 'stdout', 'execution_time_ms', 'result',
        'verifier_id', 'environment_id', 'verifier_version_id'
    ],
    verifiers: ['id', 'key', 'team_id', 'created_at'],
    eval_task_leases: ['id', 'task_id', 'owner_id', 'expires_at', 'ended_at', 'created_at'],
    qa_session_results: [
        'id', 'qa_project_id', 'session_id', 'team_id', 'reviewer_id', 'verdict',
        'difficulty', 'notes', 'metadata', 'created_at', 'updated_at'
    ],
    feedback_helpfulness_ratings: ['id', 'feedback_id', 'user_id', 'is_helpful', 'report_text', 'created_at']
};

const ENUMS = {
    dispute_status: ['pending', 'approved', 'rejected', 'approved_with_revisions', 'approved_and_accepted'],
    team_member_role: ['MEMBER', 'ADMIN'],
    flag_resolution: [null, 'confirmed', 'dismissed'],
    session_status: ['cancelled', 'completed', 'in_progress'],
    qa_verdict: ['pass', 'fail', 'review_needed']
};

/** Assert a row exposes every documented column for its table. */
function assertRowColumns(tableName, row) {
    const columns = TABLES[tableName];
    if (!columns) return [];
    const missing = columns.filter((col) => !Object.prototype.hasOwnProperty.call(row, col));
    return missing;
}

/** Assert every row in a table array has all documented columns. */
function assertTable(tableName, rows) {
    const problems = [];
    (rows || []).forEach((row, index) => {
        const missing = assertRowColumns(tableName, row);
        if (missing.length) {
            problems.push({ index, missing });
        }
    });
    return problems;
}

module.exports = { TABLES, ENUMS, assertRowColumns, assertTable };
