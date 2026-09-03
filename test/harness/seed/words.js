'use strict';

/**
 * Synthetic vocabulary for generated free text. Invented here on purpose: nothing in this
 * file (or anything built from it) comes from a real task, review, or dispute.
 */

const PEOPLE = [
    { first: 'Avery', last: 'Blake' },
    { first: 'Rowan', last: 'Mercer' },
    { first: 'Sasha', last: 'Vandermeer' },
    { first: 'Elliot', last: 'Nakamura' },
    { first: 'Priya', last: 'Ashworth' },
    { first: 'Dorian', last: 'Whitfield' },
    { first: 'Marlowe', last: 'Okonkwo' },
    { first: 'Juno', last: 'Castellanos' },
    { first: 'Teodor', last: 'Lindqvist' },
    { first: 'Bex', last: 'Harrowgate' }
];

const ENV_KEYS = [
    'harness-ledger',
    'harness-atlas',
    'harness-clipboard',
    'harness-inventory',
    'harness-planner'
];

const PROJECTS = [
    'Harness Retail Ops',
    'Harness Travel Desk',
    'Harness Records Room',
    'Harness Field Service'
];

const TOOL_NAMES = [
    'search_records',
    'open_ledger_entry',
    'update_shipment',
    'list_pending_orders',
    'archive_document',
    'reconcile_invoice',
    'assign_ticket',
    'merge_vendor_records',
    'export_daily_summary',
    'adjust_seat_count',
    'close_service_call',
    'reissue_credit_note'
];

const SCENARIO_TITLES = [
    'Reconcile a mismatched invoice line',
    'Archive a closed maintenance ticket',
    'Split a shipment across two carriers',
    'Backfill a missing customer address',
    'Escalate a stalled refund request',
    'Merge two duplicate vendor records',
    'Re-run a failed nightly export',
    'Approve a pending seat change',
    'Reroute an order flagged for address review',
    'Release a hold on a delayed parts request',
    'Correct a mis-keyed serial number',
    'Close a service call with no parts used',
    'Reissue a credit note for a short shipment',
    'Reassign an unclaimed ticket after a shift change',
    'Restore an entry archived by mistake',
    'Cancel a duplicate booking without touching the original',
    'Update a warranty end date from a supplier note',
    'Consolidate two partial deliveries into one record',
    'Flag a lapsed maintenance contract for renewal',
    'Move a technician assignment to the following week',
    'Reconcile a stock count against the last audit',
    'Add a missing purchase order reference',
    'Withdraw an approval that was granted too early',
    'Split a combined charge into two cost centres'
];

const USER_STORY_PARTS = [
    'The operator opens the records console and confirms the entry is still unassigned.',
    'They compare the two candidate rows before deciding which one survives the merge.',
    'The change must be saved without clearing the existing audit note.',
    'If the queue is empty the operator should stop rather than inventing a record.',
    'Every edit is expected to leave a trace in the activity panel.',
    'The original reference stays untouched even when a replacement is created.',
    'Any value not visible in the environment should be left blank rather than guessed.',
    'The operator confirms the change took effect before moving on.',
    'A second approval is not required when the amount is under the standing limit.',
    'The record stays open until the linked ticket is closed.',
    'Filters are reset only after the result has been recorded.',
    'The operator works from the queue order rather than searching by name.'
];

const INSTRUCTION_PARTS = [
    'Work only inside the provided environment; do not open unrelated panels.',
    'Capture the final state before submitting so the reviewer can verify it.',
    'Prefer the smallest sequence of tool calls that satisfies the request.',
    'Leave the filter controls in their original position when you finish.',
    'Do not create supporting records that the prompt did not ask for.',
    'Stop and submit if the requested record cannot be found.',
    'Keep identifiers exactly as they appear on screen, including case.',
    'Record the confirmation message verbatim in the final step.'
];

const QA_POSITIVE = [
    'Workflow matches the user story and every tool call is justified.',
    'Clean run: parameters are specific and the final state is verifiable.',
    'Good scoping. The operator stopped at the right point instead of guessing.',
    'Each step follows from the last and the confirmation is captured.',
    'Prompt and workflow agree, and the verifier checks the state that matters.',
    'Reasonable path through the environment with no invented values.'
];

const QA_NEGATIVE = [
    'Step three passes a placeholder value that never appears in the environment.',
    'The workflow ends before the record is actually saved, so the outcome cannot be checked.',
    'Two tool calls repeat the same lookup without using the first result.',
    'The prompt asks for one record but the workflow edits a second unrelated one.',
    'The success condition is never observed, so a failed run would still pass.',
    'The prompt allows two readings and the workflow only satisfies one of them.',
    'This is a single lookup with no decision to make.',
    'The stated starting state does not match what the environment actually loads.'
];

/** Optional `attempted_actions` text on a discard. */
const QA_ATTEMPTED_ACTIONS = [
    'Loaded the environment, ran the workflow as written, and checked the activity panel afterwards.',
    'Re-ran the verifier against a clean state and against the submitted final state.',
    'Followed the prompt manually to see whether the described record exists at all.',
    'Compared the workflow parameters against the values visible in the starting state.',
    'Repeated the last two steps to confirm the result was not a timing problem.'
];

/** Optional `general_feedback` text. */
const QA_GENERAL_FEEDBACK = [
    'Worth another pass once the prompt wording is settled.',
    'The scenario is a good fit for this environment; the execution needs tightening.',
    'Several tasks in this batch share the same gap.',
    'No objection to the approach, only to how it is written up.'
];

/** Optional `environment_feedback` text. */
const QA_ENVIRONMENT_FEEDBACK = [
    'The records panel failed to load twice before returning results.',
    'The confirmation toast disappears too quickly to capture reliably.',
    'Seed data for this environment looks thinner than the prompt assumes.'
];

/** Optional `grading_feedback` text, used when a row is escalated. */
const QA_GRADING_FEEDBACK = [
    'Sending this up because the rubric does not cover a partial save.',
    'Escalating: two reviewers read the success condition differently.',
    'Needs a decision on whether this counts as out of scope.'
];

/** `bug_description` paired with a real `bug_reason` label. */
const BUG_DESCRIPTIONS = [
    'The verifier returns a pass even when the record is left unsaved.',
    'The environment loads without the ledger entry the prompt refers to.',
    'The action panel is disabled from the starting state, so no run can succeed.',
    'Grading depends on a field the environment never populates.',
    'The task cannot be completed without a permission the operator does not have.'
];

const DISPUTE_REASONS = [
    'The reviewer marked step two as invented, but the value is visible in the ledger panel.',
    'Return cites a missing save, yet the confirmation toast is present in the final frame.',
    'The duplicate flag looks incorrect: the two records differ by vendor code.',
    'The prompt was called ambiguous, but the user story fixes the intended reading.',
    'Marked too simple, though the workflow needs a branch on the hold status.',
    'The cited factual error is in the reviewer note, not in the prompt.'
];

const RESOLUTION_REASONS = [
    'Upheld the original return. The cited value is not reachable from the starting state.',
    'Overturned: the confirmation is visible and the workflow does complete the save.',
    'Partially upheld. Step two is fine, but the final verification step is still missing.',
    'Overturned. The reviewer applied a rule that does not apply to this environment.',
    'Upheld. The prompt does read two ways and needs rewording before it ships.'
];

const FLAG_NOTES = [
    'Prompt phrasing reads as machine generated and repeats the scenario title verbatim.',
    'Looks like a near duplicate of another task in the same project.',
    'Previous review approved this without addressing the missing save step.',
    'Same workflow as an earlier submission with only the record id changed.'
];

const GUIDELINE_SECTIONS = [
    'Scoping a tool-use task',
    'When to return instead of approve',
    'Recording environment state',
    'Handling duplicate submissions'
];

module.exports = {
    PEOPLE,
    ENV_KEYS,
    PROJECTS,
    TOOL_NAMES,
    SCENARIO_TITLES,
    USER_STORY_PARTS,
    INSTRUCTION_PARTS,
    QA_POSITIVE,
    QA_NEGATIVE,
    QA_ATTEMPTED_ACTIONS,
    QA_GENERAL_FEEDBACK,
    QA_ENVIRONMENT_FEEDBACK,
    QA_GRADING_FEEDBACK,
    BUG_DESCRIPTIONS,
    DISPUTE_REASONS,
    RESOLUTION_REASONS,
    FLAG_NOTES,
    GUIDELINE_SECTIONS
};
