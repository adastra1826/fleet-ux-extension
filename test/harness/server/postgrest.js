'use strict';

/**
 * Minimal PostgREST-compatible read layer over the in-memory seed tables.
 *
 * Covers what the extension actually sends: `select` with embeds and aliases, the filter
 * operators listed in local/api/README.md, `order`, `limit`/`offset`, `or=(...)`/`and=(...)`
 * groups, exact counts, and the single-object accept header. It is not a general PostgREST
 * implementation and does not try to be.
 */

/** Embeddable relationships, keyed by parent table. */
const RELATIONSHIPS = {
    tasks: {
        task_versions: { table: 'task_versions', type: 'many', localKey: 'id', foreignKey: 'task_id' },
        task_versions_current: { table: 'task_versions', type: 'one', localKey: 'current_version_id', foreignKey: 'id' },
        qa_feedback: { table: 'qa_feedback', type: 'many', localKey: 'id', foreignKey: 'eval_task_id' },
        task_scenarios: { table: 'task_scenarios', type: 'one', localKey: 'task_scenario_id', foreignKey: 'id' },
        profiles: { table: 'profiles', type: 'one', localKey: 'created_by', foreignKey: 'id' },
        task_project_targets: { table: 'task_project_targets', type: 'one', localKey: 'task_project_target_id', foreignKey: 'id' },
        sessions: { table: 'sessions', type: 'many', localKey: 'id', foreignKey: 'eval_task' }
    },
    qa_feedback: {
        tasks: { table: 'tasks', type: 'one', localKey: 'eval_task_id', foreignKey: 'id' },
        profiles: { table: 'profiles', type: 'one', localKey: 'created_by', foreignKey: 'id' }
    },
    task_versions: {
        tasks: { table: 'tasks', type: 'one', localKey: 'task_id', foreignKey: 'id' },
        verifier_versions: { table: 'verifier_versions', type: 'one', localKey: 'verifier_version_id', foreignKey: 'id' }
    },
    team_member: {
        teams: { table: 'teams', type: 'one', localKey: 'team_id', foreignKey: 'id' },
        profiles: { table: 'profiles', type: 'one', localKey: 'profile_id', foreignKey: 'id' }
    },
    sessions: {
        qa_session_results: { table: 'qa_session_results', type: 'many', localKey: 'id', foreignKey: 'session_id' },
        tasks: { table: 'tasks', type: 'one', localKey: 'eval_task', foreignKey: 'id' }
    },
    verifier_versions: {
        verifiers: { table: 'verifiers', type: 'one', localKey: 'verifier_id', foreignKey: 'id' }
    },
    verifiers: {
        verifier_versions: { table: 'verifier_versions', type: 'many', localKey: 'id', foreignKey: 'verifier_id' }
    }
};

/** Alias names the bundle may use for an embed, mapped to the relationship key. */
const EMBED_ALIASES = {
    eval_tasks: 'tasks',
    eval_task_versions: 'task_versions',
    eval_task_qa_feedback: 'qa_feedback',
    creator: 'profiles',
    team: 'teams',
    reviewer: 'profiles',
    scenario: 'task_scenarios',
    target: 'task_project_targets'
};

/** Split a comma list while respecting parentheses (embeds nest selects). */
function splitTopLevel(input, separator) {
    const out = [];
    let depth = 0;
    let current = '';
    for (const char of String(input || '')) {
        if (char === '(') depth++;
        if (char === ')') depth--;
        if (char === separator && depth === 0) {
            out.push(current);
            current = '';
            continue;
        }
        current += char;
    }
    if (current.trim() !== '') out.push(current);
    return out.map((s) => s.trim()).filter(Boolean);
}

/**
 * Parse a `select` expression into plain columns and embed nodes.
 * Handles `alias:table(inner)`, `table!inner(inner)`, `*`.
 */
function parseSelect(select) {
    const parts = splitTopLevel(select || '*', ',');
    const columns = [];
    const embeds = [];
    parts.forEach((part) => {
        const openIndex = part.indexOf('(');
        if (openIndex === -1) {
            columns.push(part);
            return;
        }
        const head = part.slice(0, openIndex);
        const inner = part.slice(openIndex + 1, part.lastIndexOf(')'));
        let alias = null;
        let name = head;
        if (head.includes(':')) {
            const [aliasPart, namePart] = head.split(':');
            alias = aliasPart.trim();
            name = namePart.trim();
        }
        const requireMatch = name.endsWith('!inner');
        name = name.replace('!inner', '').trim();
        if (name.includes('!')) {
            name = name.split('!')[0];
        }
        embeds.push({
            alias: alias || name,
            name,
            inner,
            required: requireMatch
        });
    });
    if (columns.length === 0) columns.push('*');
    return { columns, embeds };
}

function compareValues(left, right) {
    if (left === right) return 0;
    if (left == null) return -1;
    if (right == null) return 1;
    if (typeof left === 'number' && typeof right === 'number') return left < right ? -1 : 1;
    return String(left) < String(right) ? -1 : 1;
}

function coerce(raw) {
    if (raw === 'null') return null;
    if (raw === 'true') return true;
    if (raw === 'false') return false;
    if (raw !== '' && !Number.isNaN(Number(raw)) && /^-?\d+(\.\d+)?$/.test(raw)) return Number(raw);
    return raw;
}

function stripQuotes(value) {
    const text = String(value);
    if (text.length > 1 && text.startsWith('"') && text.endsWith('"')) {
        return text.slice(1, -1);
    }
    return text;
}

function likeToRegex(pattern, caseInsensitive) {
    const escaped = String(pattern)
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/[%*]/g, '.*')
        .replace(/_/g, '.');
    return new RegExp(`^${escaped}$`, caseInsensitive ? 'i' : '');
}

/** Evaluate one `column=operator.value` style condition against a row. */
function matchCondition(row, column, expression) {
    let expr = String(expression);
    let negate = false;
    if (expr.startsWith('not.')) {
        negate = true;
        expr = expr.slice(4);
    }
    const dotIndex = expr.indexOf('.');
    const operator = dotIndex === -1 ? 'eq' : expr.slice(0, dotIndex);
    const rawValue = dotIndex === -1 ? expr : expr.slice(dotIndex + 1);
    const actual = row[column];
    let result;

    switch (operator) {
        case 'eq':
            result = String(actual) === String(coerce(rawValue));
            break;
        case 'neq':
            result = String(actual) !== String(coerce(rawValue));
            break;
        case 'gt':
            result = compareValues(actual, coerce(rawValue)) > 0;
            break;
        case 'gte':
            result = compareValues(actual, coerce(rawValue)) >= 0;
            break;
        case 'lt':
            result = compareValues(actual, coerce(rawValue)) < 0;
            break;
        case 'lte':
            result = compareValues(actual, coerce(rawValue)) <= 0;
            break;
        case 'is':
            result = coerce(rawValue) === null ? actual == null : actual === coerce(rawValue);
            break;
        case 'in': {
            const list = rawValue.replace(/^\(/, '').replace(/\)$/, '');
            const values = splitTopLevel(list, ',').map((v) => String(coerce(stripQuotes(v))));
            result = values.includes(String(actual));
            break;
        }
        case 'like':
            result = actual != null && likeToRegex(rawValue, false).test(String(actual));
            break;
        case 'ilike':
            result = actual != null && likeToRegex(rawValue, true).test(String(actual));
            break;
        case 'cs':
        case 'contains':
            result = Array.isArray(actual) && String(actual).includes(rawValue);
            break;
        default:
            result = true;
            break;
    }
    return negate ? !result : result;
}

/** Evaluate an `or=(a.eq.1,b.is.null)` / `and=(...)` group. */
function matchGroup(row, groupExpression, mode) {
    const inner = String(groupExpression).replace(/^\(/, '').replace(/\)$/, '');
    const clauses = splitTopLevel(inner, ',');
    const results = clauses.map((clause) => {
        if (clause.startsWith('or(')) return matchGroup(row, clause.slice(2), 'or');
        if (clause.startsWith('and(')) return matchGroup(row, clause.slice(3), 'and');
        const firstDot = clause.indexOf('.');
        if (firstDot === -1) return true;
        const column = clause.slice(0, firstDot);
        return matchCondition(row, column, clause.slice(firstDot + 1));
    });
    return mode === 'or' ? results.some(Boolean) : results.every(Boolean);
}

const RESERVED_PARAMS = new Set(['select', 'order', 'limit', 'offset', 'or', 'and', 'on_conflict']);

function projectRow(row, columns) {
    if (columns.includes('*')) {
        const clone = { ...row };
        delete clone.harness;
        return clone;
    }
    const out = {};
    columns.forEach((column) => {
        const [alias, source] = column.includes(':')
            ? column.split(':').map((s) => s.trim())
            : [column, column];
        out[alias] = row[source];
    });
    return out;
}

class PostgrestEngine {
    constructor(seed) {
        this.seed = seed;
    }

    table(name) {
        const rows = this.seed[name];
        if (!Array.isArray(rows)) {
            const err = new Error(`relation "${name}" does not exist`);
            err.status = 404;
            err.code = 'PGRST205';
            throw err;
        }
        return rows;
    }

    /** Attach one embed to a projected row. */
    _attachEmbed(parentTable, sourceRow, embed) {
        let embedName = embed.name;
        let relationshipKey = EMBED_ALIASES[embedName] || embedName;
        if (embedName.includes('!')) {
            const hint = embedName.slice(embedName.indexOf('!') + 1);
            if (hint === 'eval_tasks_current_version_fk') {
                relationshipKey = 'task_versions_current';
            } else {
                relationshipKey = EMBED_ALIASES[embedName.split('!')[0]] || embedName.split('!')[0];
            }
        }
        const relationship = (RELATIONSHIPS[parentTable] || {})[relationshipKey]
            || (RELATIONSHIPS[parentTable] || {})[embed.name];

        if (!relationship) {
            // Unknown embed: mirror any same-named value already present on the seed row.
            return { value: sourceRow[embed.alias] ?? sourceRow[embed.name] ?? null, ok: true };
        }

        const localValue = sourceRow[relationship.localKey];
        const childRows = this.table(relationship.table).filter(
            (child) => String(child[relationship.foreignKey]) === String(localValue)
        );
        const { columns, embeds } = parseSelect(embed.inner);
        const projected = childRows.map((child) => {
            const out = projectRow(child, columns);
            embeds.forEach((nested) => {
                const nestedResult = this._attachEmbed(relationship.table, child, nested);
                out[nested.alias] = nestedResult.value;
            });
            return out;
        });

        if (relationship.type === 'one') {
            return { value: projected[0] || null, ok: projected.length > 0 };
        }
        return { value: projected, ok: projected.length > 0 };
    }

    /**
     * @param {string} tableName
     * @param {URLSearchParams} params
     * @returns {{ rows: any[], total: number }}
     */
    query(tableName, params) {
        let rows = this.table(tableName).slice();

        for (const [key, value] of params.entries()) {
            if (RESERVED_PARAMS.has(key)) continue;
            rows = rows.filter((row) => matchCondition(row, key, value));
        }
        if (params.has('or')) {
            rows = rows.filter((row) => matchGroup(row, params.get('or'), 'or'));
        }
        if (params.has('and')) {
            rows = rows.filter((row) => matchGroup(row, params.get('and'), 'and'));
        }

        const orderParam = params.get('order');
        if (orderParam) {
            const terms = splitTopLevel(orderParam, ',').map((term) => {
                const bits = term.split('.');
                return {
                    column: bits[0],
                    descending: bits.includes('desc'),
                    nullsLast: bits.includes('nullslast')
                };
            });
            rows.sort((a, b) => {
                for (const term of terms) {
                    const left = a[term.column];
                    const right = b[term.column];
                    if (left == null && right != null) return term.nullsLast ? 1 : -1;
                    if (left != null && right == null) return term.nullsLast ? -1 : 1;
                    const cmp = compareValues(left, right);
                    if (cmp !== 0) return term.descending ? -cmp : cmp;
                }
                return 0;
            });
        }

        const total = rows.length;
        const offset = Number(params.get('offset') || 0);
        const limit = params.has('limit') ? Number(params.get('limit')) : null;
        if (offset) rows = rows.slice(offset);
        if (limit != null) rows = rows.slice(0, limit);

        const { columns, embeds } = parseSelect(params.get('select'));
        const projected = [];
        rows.forEach((row) => {
            const out = projectRow(row, columns);
            let keep = true;
            embeds.forEach((embed) => {
                const result = this._attachEmbed(tableName, row, embed);
                out[embed.alias] = result.value;
                if (embed.required && !result.ok) keep = false;
            });
            if (keep) projected.push(out);
        });

        return { rows: projected, total };
    }
}

module.exports = { PostgrestEngine, parseSelect, matchCondition, matchGroup };
