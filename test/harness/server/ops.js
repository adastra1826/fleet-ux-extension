'use strict';

/**
 * Harness ops gate. Encrypts the fake bundle in test/harness/seed/ops-bundle.json with a
 * well-known local password, so unlocking the Ops dashboard works offline without touching
 * the committed production ciphertext.
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

/** Well-known local password. Documented in docs/local-harness.md; not a secret. */
const HARNESS_OPS_PASSWORD = 'harness';

// Must match dev/utils/ops-password-crypto.mjs and the browser copy in ops-tab.js.
const FORMAT_PREFIX = 'fleet-ops1';
const FORMAT_VERSION = 1;
const PBKDF2_ITERATIONS = 310000;
const SALT_BYTES = 16;
const IV_BYTES = 12;
const AES_GCM_TAG_BYTES = 16;

const BUNDLE_PATH = path.join(__dirname, '..', 'seed', 'ops-bundle.json');

function sha256Hex(text) {
    return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

/** `opsAccess.passwordHash` value the harness swaps into the archetypes config it serves. */
function harnessPasswordHash() {
    return 'sha256-' + sha256Hex(HARNESS_OPS_PASSWORD);
}

function encryptBundle(plaintext, password) {
    const salt = crypto.randomBytes(SALT_BYTES);
    const iv = crypto.randomBytes(IV_BYTES);
    const key = crypto.pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, 32, 'sha256');
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv, {
        authTagLength: AES_GCM_TAG_BYTES
    });
    const body = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    const packed = Buffer.concat([Buffer.from([FORMAT_VERSION]), salt, iv, body, tag]);
    return `${FORMAT_PREFIX}:${packed.toString('base64')}`;
}

let cached = null;

/** `{ format, encrypted }` wrapper the extension expects at the configured secrets path. */
function encryptedBundleWrapper() {
    if (cached) return cached;
    const plaintext = fs.readFileSync(BUNDLE_PATH, 'utf8');
    JSON.parse(plaintext);
    cached = {
        format: FORMAT_PREFIX,
        encrypted: encryptBundle(plaintext, HARNESS_OPS_PASSWORD)
    };
    return cached;
}

function bundleJson() {
    return JSON.parse(fs.readFileSync(BUNDLE_PATH, 'utf8'));
}

module.exports = {
    HARNESS_OPS_PASSWORD,
    harnessPasswordHash,
    encryptedBundleWrapper,
    bundleJson
};
