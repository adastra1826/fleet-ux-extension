'use strict';

/**
 * Local stand-in for the GitHub/jsDelivr plugin CDN. Serves files straight out of the
 * working tree (so editing a plugin only needs a page reload) and rewrites two fields in
 * archetypes.json on the way out: the ops password hash and the encrypted secrets filename
 * both point at harness-only values instead of the committed production ones.
 */

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const HARNESS_SECRETS_FILE = 'harness-ops-secrets.enc.json';

const CONTENT_TYPES = {
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.md': 'text/markdown; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.html': 'text/html; charset=utf-8'
};

/** Resolve a repo-relative path, refusing anything that escapes the repo. */
function resolveRepoPath(relative) {
    const clean = String(relative || '').split('?')[0].replace(/^\/+/, '');
    const absolute = path.resolve(REPO_ROOT, clean);
    if (absolute !== REPO_ROOT && !absolute.startsWith(REPO_ROOT + path.sep)) {
        return null;
    }
    return absolute;
}

class HarnessCdn {
    constructor(ops) {
        this.ops = ops;
    }

    /** archetypes.json with harness ops access patched in. */
    archetypesJson() {
        const raw = fs.readFileSync(path.join(REPO_ROOT, 'archetypes.json'), 'utf8');
        const config = JSON.parse(raw);
        config.opsAccess = { passwordHash: this.ops.harnessPasswordHash() };
        config.opsSecrets = { encryptedFile: HARNESS_SECRETS_FILE };
        return JSON.stringify(config, null, 2);
    }

    /**
     * @param {string} repoPath path relative to the repo root, e.g. `plugins/core/main/ui-lib.js`
     * @returns {{status:number, contentType:string, body:string}}
     */
    serve(repoPath) {
        const clean = String(repoPath || '').split('?')[0].replace(/^\/+/, '');

        if (clean === 'archetypes.json') {
            return {
                status: 200,
                contentType: CONTENT_TYPES['.json'],
                body: this.archetypesJson()
            };
        }

        if (clean === HARNESS_SECRETS_FILE) {
            return {
                status: 200,
                contentType: CONTENT_TYPES['.json'],
                body: JSON.stringify(this.ops.encryptedBundleWrapper(), null, 2)
            };
        }

        const absolute = resolveRepoPath(clean);
        if (!absolute || !fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) {
            return { status: 404, contentType: 'text/plain; charset=utf-8', body: `not found: ${clean}` };
        }

        return {
            status: 200,
            contentType: CONTENT_TYPES[path.extname(absolute)] || 'text/plain; charset=utf-8',
            body: fs.readFileSync(absolute, 'utf8')
        };
    }
}

module.exports = { HarnessCdn, REPO_ROOT, HARNESS_SECRETS_FILE, resolveRepoPath };
