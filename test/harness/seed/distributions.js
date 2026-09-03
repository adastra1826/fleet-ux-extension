'use strict';

/**
 * Shapes and mixes the harness copies from production.
 *
 * These are *proportions and enum values only*. No name, email, UUID, prompt, or piece of
 * feedback prose is taken from real data; that all comes from the invented vocabulary in
 * words.js. Percentages are rounded from a 147,489-task sample.
 */

/**
 * `eval_tasks.task_lifecycle_status`.
 *
 * Long-tail values below ~0.1% (archived, PROPOSED, accepted-unused) are dropped: at harness
 * scale they round to zero anyway. `disputed` is kept via `LIFECYCLE_MINIMUMS` so the dispute
 * surfaces always have a task in a matching state.
 */
const LIFECYCLE_MIX = [
    { value: 'production', weight: 75.11 },
    { value: 'escalated-fleet-review', weight: 5.5 },
    { value: 'bugged', weight: 4.55 },
    { value: 'staging', weight: 4.11 },
    { value: 'discarded', weight: 3.45 },
    { value: 'dismissed', weight: 2.86 },
    { value: 'recovery-verifier', weight: 2.4 },
    { value: 'development', weight: 1.14 },
    { value: 'recovery-diff', weight: 0.5 },
    { value: 'platform_processing', weight: 0.25 },
    { value: 'disputed', weight: 0.11 }
];

/** Statuses that must appear at least once even though their real share rounds to zero. */
const LIFECYCLE_MINIMUMS = { disputed: 1 };

/** Statuses that mean the task reached a good end state. */
const LIFECYCLE_ACCEPTED = ['production', 'staging'];

/** `eval_task_versions` per task. Real mean is ~1.34; most tasks are never revised. */
const VERSION_MIX = [
    { value: 1, weight: 78.28 },
    { value: 2, weight: 14.35 },
    { value: 3, weight: 4.69 },
    { value: 4, weight: 1.66 },
    { value: 5, weight: 1.02 }
];

/** Share of tasks carrying at least one QA row. */
const QA_COVERAGE = 0.533;

/** Average QA rows per task, by version count. More revisions means more review rounds. */
const QA_ROWS_BY_VERSION = { 1: 1, 2: 2, 3: 3, 4: 4, 5: 4 };

/**
 * Share of QA rows that are system generated. All of them are negative in production, and
 * none carry a quality rating.
 */
const SYSTEM_FEEDBACK_SHARE = 0.074;

/**
 * Positive share among *human* rows. Combined with the all-negative system rows this lands
 * near the 48% positive rate across every QA row.
 */
const HUMAN_POSITIVE_SHARE = 0.518;

/** Share of QA rows flagged as bugged. */
const BUGGED_SHARE = 0.059;

/**
 * The four kinds of QA row, as shares of every row. Derived from the rates above so a
 * harness-sized sample reproduces them exactly instead of approaching them by coin flip:
 * approvals are the positive share of human rows, and bug flags come out of the negatives.
 */
const QA_ROW_KIND_MIX = [
    { value: 'approval', weight: HUMAN_POSITIVE_SHARE * (1 - SYSTEM_FEEDBACK_SHARE) },
    {
        value: 'discard',
        weight: (1 - HUMAN_POSITIVE_SHARE) * (1 - SYSTEM_FEEDBACK_SHARE) - BUGGED_SHARE
    },
    { value: 'bugged', weight: BUGGED_SHARE },
    { value: 'system', weight: SYSTEM_FEEDBACK_SHARE }
];

/** `feedback_data.prompt_quality_rating` on human rows. `null` is the common case. */
const PROMPT_QUALITY_MIX = [
    { value: null, weight: 90.59 },
    { value: 'top_10', weight: 5.24 },
    { value: 'bottom_10', weight: 4.17 }
];

/**
 * `feedback_data.rejection_reason` keys. The key list is the captured production set; the
 * weighting is our own estimate, since discard reasons are not retained in the offline data.
 * Only the two labels marked below are verbatim from captured payloads.
 */
const REJECTION_REASONS = [
    { key: 'unclear_prompt', label: 'Prompt is unclear or ambiguous', weight: 24 }, // captured
    { key: 'not_following_scenario', label: 'Workflow does not follow the scenario', weight: 20 },
    { key: 'verifier_broken', label: "Verifier doesn't correctly validate the task", weight: 18 }, // captured
    { key: 'too_simple', label: 'Task is too simple to be useful', weight: 13 },
    { key: 'factual_errors', label: 'Prompt or workflow contains factual errors', weight: 10 },
    { key: 'unrealistic_prompt', label: 'Prompt is unrealistic for this environment', weight: 7 },
    { key: 'impossible_task', label: 'Task cannot be completed as written', weight: 5 },
    { key: 'other', label: 'Other (please explain)', weight: 3 } // captured
];

/** Share of discards citing a second reason, matching the documented multi-reason payload. */
const MULTI_REASON_SHARE = 0.17;

/** `feedback_data.bug_reason`. Labels and mix are both real. */
const BUG_REASONS = [
    { label: 'Task cannot be graded correctly', weight: 56.5 },
    { label: 'Environment is broken or misconfigured', weight: 33.7 },
    { label: 'Other', weight: 5.5 },
    { label: 'Required data/state is missing from environment', weight: 2.3 },
    { label: 'App does not support required actions', weight: 1.2 },
    { label: 'User story is impossible to complete', weight: 0.8 }
];

/**
 * How often each optional text field rides along on a negative human row. Approximated from
 * the frequency of the matching display block.
 */
const FEEDBACK_FIELD_RATES = {
    attempted_actions: 0.95,
    task_feedback: 0.7,
    general_feedback: 0.23,
    grading_feedback: 0.03,
    environment_feedback: 0.015
};

/** Share of negative human rows carrying screenshot paths. */
const SCREENSHOT_SHARE = 0.12;

/** `dispute_data.category`. */
const DISPUTE_CATEGORIES = [
    { value: 'factual_error', weight: 36.3 },
    { value: 'misunderstanding', weight: 31.6 },
    { value: 'valid_approach', weight: 11.5 },
    { value: 'other', weight: 11.4 },
    { value: 'tool_issue', weight: 9.2 }
];

/**
 * How resolved disputes land. Production approves the dispute (overturning the original
 * review) roughly seven times out of ten.
 */
const DISPUTE_OVERTURN_SHARE = 0.695;

/** `task_flags.reason`. */
const FLAG_REASONS = ['ai_generated', 'possible_duplicate', 'poor_feedback_from_previous_qa', 'other'];

/**
 * Split `total` across weighted entries so the counts are whole numbers that still sum to
 * `total` (largest remainder), then apply any minimums by borrowing from the largest bucket.
 *
 * @param {{value:*, weight:number}[]} mix
 * @param {number} total
 * @param {Record<string, number>} [minimums] keyed by String(value)
 * @returns {{value:*, count:number}[]}
 */
function allocate(mix, total, minimums) {
    const weightSum = mix.reduce((sum, entry) => sum + entry.weight, 0);
    const exact = mix.map((entry) => (entry.weight / weightSum) * total);
    const counts = exact.map((n) => Math.floor(n));

    let remainder = total - counts.reduce((sum, n) => sum + n, 0);
    const byFraction = exact
        .map((n, index) => ({ index, fraction: n - Math.floor(n) }))
        .sort((a, b) => b.fraction - a.fraction || a.index - b.index);
    for (let i = 0; remainder > 0; i = (i + 1) % byFraction.length) {
        counts[byFraction[i].index] += 1;
        remainder -= 1;
    }

    Object.entries(minimums || {}).forEach(([value, minimum]) => {
        const index = mix.findIndex((entry) => String(entry.value) === value);
        if (index === -1 || counts[index] >= minimum) return;
        while (counts[index] < minimum) {
            let largest = 0;
            counts.forEach((count, i) => {
                if (i !== index && count > counts[largest]) largest = i;
            });
            counts[largest] -= 1;
            counts[index] += 1;
        }
    });

    return mix.map((entry, index) => ({ value: entry.value, count: counts[index] }));
}

/**
 * An allocation expanded into one entry per item, interleaved so a table sorted by key is not
 * one long run of the most common value.
 *
 * Each value is spaced by its own share of the total, so any slice of the output looks roughly
 * like the whole mix — the first page of a table is representative rather than one of each.
 *
 * @returns {*[]} exactly `total` values
 */
function spread(mix, total, minimums) {
    const buckets = allocate(mix, total, minimums)
        .filter((entry) => entry.count > 0)
        .map((entry) => {
            const step = total / entry.count;
            // Half a step of lead-in, so rare values land mid-run instead of all at the front.
            return { value: entry.value, remaining: entry.count, step, next: step / 2 };
        });

    const out = [];
    for (let i = 0; i < total; i++) {
        // Whichever value is furthest overdue relative to its own spacing goes next.
        let chosen = null;
        for (const bucket of buckets) {
            if (bucket.remaining === 0) continue;
            if (!chosen || bucket.next < chosen.next) chosen = bucket;
        }
        out.push(chosen.value);
        chosen.remaining -= 1;
        chosen.next += chosen.step;
    }
    return out;
}

/** Weighted pick from a `{ value, weight }` mix using a seeded rng. */
function pickWeighted(rng, mix) {
    const weightSum = mix.reduce((sum, entry) => sum + entry.weight, 0);
    let roll = rng() * weightSum;
    for (const entry of mix) {
        roll -= entry.weight;
        if (roll <= 0) return entry.value;
    }
    return mix[mix.length - 1].value;
}

/** Weighted pick returning the whole entry, for mixes with more than a `value` field. */
function pickWeightedEntry(rng, list) {
    const weightSum = list.reduce((sum, entry) => sum + entry.weight, 0);
    let roll = rng() * weightSum;
    for (const entry of list) {
        roll -= entry.weight;
        if (roll <= 0) return entry;
    }
    return list[list.length - 1];
}

module.exports = {
    LIFECYCLE_MIX,
    LIFECYCLE_MINIMUMS,
    LIFECYCLE_ACCEPTED,
    VERSION_MIX,
    QA_COVERAGE,
    QA_ROWS_BY_VERSION,
    QA_ROW_KIND_MIX,
    PROMPT_QUALITY_MIX,
    REJECTION_REASONS,
    MULTI_REASON_SHARE,
    BUG_REASONS,
    FEEDBACK_FIELD_RATES,
    SCREENSHOT_SHARE,
    DISPUTE_CATEGORIES,
    DISPUTE_OVERTURN_SHARE,
    FLAG_REASONS,
    spread,
    pickWeighted,
    pickWeightedEntry
};
