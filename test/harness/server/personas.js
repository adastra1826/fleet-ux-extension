'use strict';

/**
 * Persona resolution. HTML pages Set-Cookie `current-user-id` / `current-team-id` /
 * `current-team-role` for the acting person (default: first resolver). The harness bar
 * rewrites those cookies when the persona picker changes. API routes resolve the actor
 * from them so permission rules (QA-only flagging, resolver-only resolutions) are enforceable.
 */

function parseCookies(header) {
    const out = {};
    String(header || '')
        .split(';')
        .forEach((part) => {
            const index = part.indexOf('=');
            if (index === -1) return;
            const key = part.slice(0, index).trim();
            const value = part.slice(index + 1).trim();
            if (key) out[key] = decodeURIComponent(value);
        });
    return out;
}

/** Base64url segment for the fake session JWTs handed to the extension. */
function b64url(value) {
    return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

/**
 * Build a structurally valid (unsigned) JWT. The extension only decodes the payload to read
 * `exp` and `role`; nothing verifies the signature, and no real key is involved.
 */
function makeJwt(payload) {
    const header = b64url({ alg: 'HS256', typ: 'JWT' });
    const body = b64url(payload);
    return `${header}.${body}.harness-not-a-real-signature`;
}

const YEAR_FROM_NOW = () => Math.floor(Date.now() / 1000) + 365 * 24 * 3600;

/** Anon key shape the extension accepts: role must be `anon`. */
function harnessAnonKey(projectRef) {
    return makeJwt({ role: 'anon', ref: projectRef, iss: 'fleet-ux-harness', exp: YEAR_FROM_NOW() });
}

function harnessUserJwt(person, projectRef) {
    return makeJwt({
        role: 'authenticated',
        ref: projectRef,
        sub: person ? person.id : 'harness-anonymous',
        email: person ? person.email : 'anonymous@harness.example',
        exp: YEAR_FROM_NOW()
    });
}

class Personas {
    constructor(seed) {
        this.seed = seed;
        this.projectRef = 'harnessproject';
    }

    all() {
        return this.seed.profiles.map((person) => ({
            id: person.id,
            name: person.full_name,
            email: person.email,
            teamId: person.harness.teamId,
            teamRole: person.harness.teamRole,
            isQa: person.harness.isQa,
            isResolver: person.harness.isResolver,
            label: person.harness.label
        }));
    }

    /** Acting person for a request, falling back to the first resolver. */
    resolve(req) {
        const cookies = parseCookies(req.headers.cookie);
        const id = cookies['current-user-id'];
        const found = id ? this.seed.profiles.find((p) => p.id === id) : null;
        const person = found || this.seed.profiles[0];
        return {
            person,
            teamId: cookies['current-team-id'] || person.harness.teamId,
            teamRole: cookies['current-team-role'] || person.harness.teamRole,
            isQa: !!person.harness.isQa,
            isResolver: !!person.harness.isResolver
        };
    }

    anonKey() {
        return harnessAnonKey(this.projectRef);
    }

    userJwt(person) {
        return harnessUserJwt(person, this.projectRef);
    }
}

module.exports = { Personas, parseCookies, harnessAnonKey, harnessUserJwt };
