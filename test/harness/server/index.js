'use strict';

/**
 * Harness web server: fake Fleet pages, fake APIs and a local plugin CDN on one origin.
 *
 * Routes
 *   /<archetype path>            reconstructed page shell + the userscript
 *   /api/*                       Fleet web API
 *   /__harness/rest/v1/*         PostgREST-shaped reads over the synthetic seed
 *   /__harness/orchestrator/*    orchestrator API
 *   /__harness/internal/*        internal API
 *   /__harness/cdn/*             repo files (plugins, archetypes.json, fleet.user.js)
 *   /__harness/vendor/*          packaged jsDelivr libraries (Chart.js, highlight.js, Deep Chat)
 *   /__harness/{seed,personas,theme.json,health,vendor}
 */

const http = require('http');
const path = require('path');
const fs = require('fs');

const { buildSeed } = require('../seed/generate');
const { PostgrestEngine } = require('./postgrest');
const { FleetWebApi, jsonBody } = require('./fleet-web');
const { Personas, parseCookies } = require('./personas');
const { HarnessCdn, HARNESS_SECRETS_FILE } = require('./cdn');
const vendor = require('./vendor');
const ops = require('./ops');
const { renderPage } = require('../client/layout');
const { ARCHETYPES, archetypeForRequest } = require('../client/archetype-map');

const CLIENT_DIR = path.join(__dirname, '..', 'client');
const FLEET_CSS_DIR = path.join(__dirname, '..', '..', '..', 'local', 'context', 'css');
const FLEET_CSS_FILES = ['3dsq-32do17rw.css', '3cibrl7_ga4_t.css', '1_nwzq9jhfng-.css'];
const PORT = Number(process.env.HARNESS_PORT || 8787);
const HOST = process.env.HARNESS_HOST || '0.0.0.0';

function fleetCssAvailable() {
    return FLEET_CSS_FILES.every((name) => fs.existsSync(path.join(FLEET_CSS_DIR, name)));
}

function extensionEnabledFromReq(req) {
    const cookies = parseCookies(req.headers && req.headers.cookie);
    return cookies['fleet-ux-extension'] !== '0';
}

const seed = buildSeed();
const personas = new Personas(seed);
const engine = new PostgrestEngine(seed);
const fleetWeb = new FleetWebApi(seed, personas);
const cdn = new HarnessCdn(ops);

/** Minimal RPC stubs matching documented response shapes. */
function handleRpc(seed, rpcName, body) {
    if (rpcName === 'bump_eval_task_version') {
        const taskId = body.p_task_id;
        const task = seed.tasks.find((t) => t.id === taskId);
        if (!task) return JSON.stringify(null);
        const { uuid, isoAt } = require('../seed/rng');
        const prev = seed.task_versions.filter((v) => v.task_id === taskId).length;
        const versionNo = prev + 1;
        const versionId = uuid(`rpc-version:${taskId}:${versionNo}`);
        seed.task_versions.push({
            id: versionId,
            task_id: taskId,
            version_no: versionNo,
            created_at: isoAt(0),
            created_by: task.created_by,
            prompt: body.p_prompt || 'Revised from RPC',
            env_key: task.env_key,
            verifier_id: null,
            verifier_version_id: null,
            prev_version_id: task.current_version_id,
            resubmission_notes: null,
            scratchpad: null,
            env_variables: {},
            metadata: body.p_metadata || {},
            is_active: false,
            is_user_authored: true,
            version: null,
            tool_use_workflow: null,
            factual_answer: null,
            environment_version_id: null,
            ci_job_id: null,
            activity_event_id: null,
            attachments: null,
            graded: null
        });
        task.current_version_id = versionId;
        return JSON.stringify(versionId);
    }
    if (rpcName === 'end_user_lease') {
        const lease = seed.eval_task_leases.find(
            (l) => l.task_id === body.p_lease_id && l.owner_id === body.p_user_id && l.ended_at == null
        );
        if (lease) lease.ended_at = new Date().toISOString();
        return true;
    }
    if (rpcName === 'get_environments_needing_qa') {
        return seed.environments.slice(0, 3).map((env) => ({
            env_key: env.env_key,
            name: env.name,
            pending_count: 2
        }));
    }
    return [];
}

function sendJson(res, status, body, extraHeaders) {
    const payload = JSON.stringify(body);
    res.writeHead(status, Object.assign(
        {
            'content-type': 'application/json; charset=utf-8',
            'access-control-allow-origin': '*',
            'cache-control': 'no-store'
        },
        extraHeaders || {}
    ));
    res.end(payload);
}

function sendText(res, status, body, contentType) {
    res.writeHead(status, {
        'content-type': contentType || 'text/plain; charset=utf-8',
        'cache-control': 'no-store'
    });
    res.end(body);
}

function serveClientFile(res, filename, contentType) {
    const absolute = path.join(CLIENT_DIR, filename);
    if (!absolute.startsWith(CLIENT_DIR) || !fs.existsSync(absolute)) {
        return sendText(res, 404, 'not found');
    }
    sendText(res, 200, fs.readFileSync(absolute, 'utf8'), contentType);
}

/** PostgREST reads, and the small set of writes the dashboard performs. */
async function handlePostgrest(req, res, url) {
    const relative = url.pathname.replace('/__harness/rest/v1', '').replace(/^\/+/, '');
    const [tableName] = relative.split('/');
    const method = req.method.toUpperCase();

    if (!tableName) return sendJson(res, 404, { message: 'table required' });

    if (relative.startsWith('rpc/')) {
        const rpcName = relative.slice('rpc/'.length);
        const body = method === 'POST' ? await jsonBody(req) : {};
        return sendJson(res, 200, handleRpc(seed, rpcName, body));
    }

    try {
        if (method === 'GET') {
            const { rows, total } = engine.query(tableName, url.searchParams);
            const wantsObject = String(req.headers.accept || '').includes('application/vnd.pgrst.object+json');
            if (wantsObject) {
                if (rows.length !== 1) {
                    return sendJson(res, 406, {
                        code: 'PGRST116',
                        message: `JSON object requested, multiple (or no) rows returned`
                    });
                }
                return sendJson(res, 200, rows[0]);
            }
            const offset = Number(url.searchParams.get('offset') || 0);
            const end = Math.max(offset + rows.length - 1, offset);
            return sendJson(res, 200, rows, {
                'content-range': `${offset}-${end}/${total}`
            });
        }

        const body = await jsonBody(req);
        const table = engine.table(tableName);

        if (method === 'POST') {
            const incoming = Array.isArray(body) ? body : [body];
            const written = incoming.map((row) => {
                const record = Object.assign({ id: `${tableName}-${table.length + 1}` }, row);
                // Upsert semantics when the caller asked for merge-duplicates.
                const conflictColumns = (url.searchParams.get('on_conflict') || '')
                    .split(',')
                    .map((s) => s.trim())
                    .filter(Boolean);
                if (conflictColumns.length) {
                    const existing = table.find((candidate) =>
                        conflictColumns.every((column) => String(candidate[column]) === String(record[column]))
                    );
                    if (existing) {
                        Object.assign(existing, row);
                        return existing;
                    }
                }
                table.push(record);
                return record;
            });
            return sendJson(res, 201, written);
        }

        if (method === 'PATCH') {
            const matched = table.filter((row) => {
                for (const [key, value] of url.searchParams.entries()) {
                    if (['select', 'order', 'limit', 'offset'].includes(key)) continue;
                    const expression = String(value);
                    const dot = expression.indexOf('.');
                    const operand = dot === -1 ? expression : expression.slice(dot + 1);
                    if (String(row[key]) !== operand) return false;
                }
                return true;
            });
            matched.forEach((row) => Object.assign(row, body));
            return sendJson(res, 200, matched);
        }

        if (method === 'DELETE') {
            return sendJson(res, 200, []);
        }

        return sendJson(res, 405, { message: `method ${method} not supported` });
    } catch (error) {
        return sendJson(res, error.status || 500, {
            code: error.code || 'PGRST000',
            message: error.message || 'harness postgrest failure'
        });
    }
}

async function handleRequest(req, res) {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = url.pathname;

    if (req.method === 'OPTIONS') {
        res.writeHead(204, {
            'access-control-allow-origin': '*',
            'access-control-allow-headers': '*',
            'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS'
        });
        return res.end();
    }

    // ------------------------------------------------------------- harness-only routes

    if (pathname === '/__harness/health') {
        return sendJson(res, 200, {
            ok: true,
            archetypes: ARCHETYPES.length,
            seed: seed.meta,
            vendor: vendor.manifest(),
            fleetCss: fleetCssAvailable()
        });
    }
    if (pathname === '/__harness/vendor') {
        return sendJson(res, 200, vendor.manifest());
    }
    if (pathname.startsWith('/__harness/vendor/')) {
        const result = vendor.serve(pathname.slice('/__harness/vendor/'.length));
        return sendText(res, result.status, result.body, result.contentType);
    }
    if (pathname === '/__harness/seed') {
        return sendJson(res, 200, seed);
    }
    if (pathname === '/__harness/personas') {
        return sendJson(res, 200, { personas: personas.all(), active: personas.resolve(req).person.id });
    }
    if (pathname === '/__harness/theme.json') {
        // The token map the client stylesheet applies, so specs can compare against it.
        return sendJson(res, 200, readThemeTokens());
    }
    if (pathname === '/__harness/theme.css') {
        return serveClientFile(res, 'theme.css', 'text/css; charset=utf-8');
    }
    if (pathname.startsWith('/__harness/fleet-css/')) {
        const name = pathname.slice('/__harness/fleet-css/'.length);
        if (!FLEET_CSS_FILES.includes(name)) return sendText(res, 404, 'not found');
        const absolute = path.join(FLEET_CSS_DIR, name);
        if (!absolute.startsWith(FLEET_CSS_DIR) || !fs.existsSync(absolute)) {
            return sendText(res, 404, 'not found');
        }
        return sendText(res, 200, fs.readFileSync(absolute, 'utf8'), 'text/css; charset=utf-8');
    }
    if (pathname === '/__harness/gm-polyfill.js') {
        return serveClientFile(res, 'gm-polyfill.js', 'application/javascript; charset=utf-8');
    }
    if (pathname === '/__harness/chrome.js') {
        return serveClientFile(res, 'chrome.js', 'application/javascript; charset=utf-8');
    }
    if (pathname === '/__harness/env-frame') {
        return sendText(
            res,
            200,
            `<!DOCTYPE html><html><head><link rel="stylesheet" href="/__harness/theme.css"></head>
             <body><div class="p-4 text-sm text-muted-foreground">Harness environment frame</div></body></html>`,
            'text/html; charset=utf-8'
        );
    }
    if (pathname === '/__harness/screenshot') {
        // 1x1 transparent PNG so screenshot panes have a real image to load.
        const png = Buffer.from(
            'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
            'base64'
        );
        res.writeHead(200, { 'content-type': 'image/png', 'cache-control': 'no-store' });
        return res.end(png);
    }

    if (pathname.startsWith('/__harness/cdn/')) {
        const repoPath = pathname.slice('/__harness/cdn/'.length);
        const result = cdn.serve(repoPath);
        return sendText(res, result.status, result.body, result.contentType);
    }
    if (pathname === `/${HARNESS_SECRETS_FILE}`) {
        return sendJson(res, 200, ops.encryptedBundleWrapper());
    }

    if (pathname.startsWith('/__harness/rest/v1')) {
        return handlePostgrest(req, res, url);
    }

    if (pathname.startsWith('/__harness/orchestrator/')) {
        const rest = pathname.replace('/__harness/orchestrator', '');
        const verifierVersion = rest.match(/^\/v1\/verifiers\/versions\/([^/]+)$/);
        if (verifierVersion) {
            const result = fleetWeb.verifierVersion(decodeURIComponent(verifierVersion[1]));
            return sendJson(res, result.status, result.body);
        }
        if (rest.startsWith('/v1/env/instances')) {
            return sendJson(res, 200, { instances: [] });
        }
        return sendJson(res, 404, { error: `harness orchestrator route not stubbed: ${rest}` });
    }

    if (pathname.startsWith('/__harness/internal/')) {
        const rest = pathname.replace('/__harness/internal', '');
        if (rest.startsWith('/v1/dispute-reviews/history')) {
            const result = fleetWeb.disputeReviewHistory(url);
            return sendJson(res, result.status, result.body);
        }
        return sendJson(res, 404, { error: `harness internal route not stubbed: ${rest}` });
    }

    if (pathname.startsWith('/__harness/openrouter/')) {
        // No AI provider in the harness; answer in the provider's error shape.
        return sendJson(res, 501, { error: { message: 'OpenRouter is not available in the harness.' } });
    }

    // ------------------------------------------------------------------- Fleet web API

    if (pathname.startsWith('/api/')) {
        if (pathname === '/api/tasks/task-events') {
            const result = fleetWeb.taskEvents(url);
            return sendJson(res, result.status, result.body);
        }
        const handled = await fleetWeb.handle(req, url);
        if (handled) return sendJson(res, handled.status, handled.body);
        return sendJson(res, 404, { success: false, error: `harness route not stubbed: ${pathname}` });
    }

    // Next.js server actions land here. Stubbed with a stable shape.
    if (req.method === 'POST' && (pathname === '/dashboard/team' || pathname.startsWith('/dashboard/data/'))) {
        return sendJson(res, 200, {
            success: true,
            harnessStub: true,
            members: seed.team_member.slice(0, 10)
        });
    }

    // ------------------------------------------------------------------------- pages

    if (pathname === '/' || pathname === '') {
        res.writeHead(302, { location: '/work/create' });
        return res.end();
    }

    const archetype = archetypeForRequest(pathname, url.search);
    const active = personas.resolve(req);
    const html = renderPage({
        archetype,
        seed,
        personas: personas.all(),
        activePersona: {
            id: active.person.id,
            name: active.person.full_name,
            teamId: active.teamId,
            teamRole: active.teamRole
        },
        session: {
            storageKey: `sb-${personas.projectRef}-auth-token`,
            accessToken: personas.userJwt(active.person),
            anonKey: personas.anonKey(),
            projectRef: personas.projectRef,
            // Absolute: the extension validates this as a URL before trusting it.
            restBaseUrl: `${url.origin}/__harness/rest/v1`
        },
        extensionEnabled: extensionEnabledFromReq(req),
        fleetCss: fleetCssAvailable()
    });
    return sendText(res, archetype ? 200 : 404, html, 'text/html; charset=utf-8');
}

let themeTokenCache = null;

/** Parse the `:root` / `.dark` blocks out of the client stylesheet. */
function readThemeTokens() {
    if (themeTokenCache) return themeTokenCache;
    const css = fs.readFileSync(path.join(CLIENT_DIR, 'theme.css'), 'utf8');
    const read = (selector) => {
        const start = css.indexOf(`${selector} {`);
        if (start === -1) return {};
        const end = css.indexOf('}', start);
        const block = css.slice(start, end);
        const tokens = {};
        block.replace(/(--[a-z0-9-]+)\s*:\s*([^;]+);/gi, (_m, name, value) => {
            tokens[name] = value.trim();
            return '';
        });
        return tokens;
    };
    themeTokenCache = { light: read(':root'), dark: read('.dark') };
    return themeTokenCache;
}

const server = http.createServer((req, res) => {
    handleRequest(req, res).catch((error) => {
        // eslint-disable-next-line no-console
        console.error('[harness] request failed', error);
        if (!res.headersSent) sendJson(res, 500, { error: String(error && error.message || error) });
    });
});

if (require.main === module) {
    server.listen(PORT, HOST, () => {
        // eslint-disable-next-line no-console
        console.log(`[harness] listening on http://localhost:${PORT}`);
        // eslint-disable-next-line no-console
        console.log(`[harness] ${ARCHETYPES.length} archetypes, ${seed.profiles.length} people, ops password "${ops.HARNESS_OPS_PASSWORD}"`);
    });
}

module.exports = { server, seed, engine, personas, fleetWeb, readThemeTokens };
