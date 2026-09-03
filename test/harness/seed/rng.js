'use strict';

const crypto = require('crypto');

/** Fixed namespace so every run of the harness produces the same graph. */
const NAMESPACE = 'fleet-ux-harness';

/** Deterministic UUID (v5-shaped) derived from a label. */
function uuid(label) {
    const hash = crypto.createHash('sha1').update(`${NAMESPACE}:${label}`).digest();
    const bytes = Buffer.from(hash.subarray(0, 16));
    bytes[6] = (bytes[6] & 0x0f) | 0x50;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = bytes.toString('hex');
    return [
        hex.slice(0, 8),
        hex.slice(8, 12),
        hex.slice(12, 16),
        hex.slice(16, 20),
        hex.slice(20, 32)
    ].join('-');
}

/** Stable positive integer derived from a label, for int-keyed rows. */
function intId(label, min, max) {
    const hash = crypto.createHash('sha1').update(`${NAMESPACE}:int:${label}`).digest();
    const span = max - min + 1;
    return min + (hash.readUInt32BE(0) % span);
}

/** Deterministic PRNG so ordering and picks never drift between runs. */
function makeRng(label) {
    const hash = crypto.createHash('sha1').update(`${NAMESPACE}:rng:${label}`).digest();
    let state = hash.readUInt32BE(0) || 1;
    return function next() {
        state ^= state << 13;
        state >>>= 0;
        state ^= state >> 17;
        state ^= state << 5;
        state >>>= 0;
        return state / 0xffffffff;
    };
}

function pick(rng, list) {
    return list[Math.floor(rng() * list.length) % list.length];
}

/** Base timestamp for the whole dataset: fixed so date filters are reproducible. */
const EPOCH = Date.parse('2026-01-06T09:00:00.000Z');

function isoAt(dayOffset, hourOffset) {
    const ms = EPOCH + dayOffset * 86400000 + (hourOffset || 0) * 3600000;
    return new Date(ms).toISOString();
}

/** Monotonic QA feedback ids — production uses serial integers, not UUIDs. */
let feedbackIdCounter = 1100000;

function nextFeedbackId() {
    feedbackIdCounter += 1;
    return feedbackIdCounter;
}

function resetFeedbackIdCounter(start) {
    feedbackIdCounter = start == null ? 1100000 : start;
}

module.exports = {
    uuid,
    intId,
    makeRng,
    pick,
    isoAt,
    EPOCH,
    nextFeedbackId,
    resetFeedbackIdCounter
};
