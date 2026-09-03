'use strict';

/**
 * Downloads the jsDelivr files listed in server/vendor.js into this folder.
 * Run from anywhere: `node test/harness/vendor/fetch.js`
 */

const fs = require('fs');
const path = require('path');
const { ASSETS, VENDOR_ROOT } = require('../server/vendor');

async function fetchAsset(asset) {
    const dest = path.join(VENDOR_ROOT, asset.file);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    const response = await fetch(asset.url);
    if (!response.ok) {
        throw new Error(`HTTP ${response.status} for ${asset.url}`);
    }
    const body = await response.text();
    if (!body || body.length < 32) {
        throw new Error(`empty body for ${asset.url}`);
    }
    fs.writeFileSync(dest, body);
    return { id: asset.id, bytes: Buffer.byteLength(body), dest };
}

async function main() {
    const results = [];
    for (const asset of ASSETS) {
        results.push(await fetchAsset(asset));
    }
    for (const row of results) {
        // eslint-disable-next-line no-console
        console.log(`${row.id}: ${row.bytes} bytes → ${path.relative(VENDOR_ROOT, row.dest)}`);
    }
}

main().catch((error) => {
    // eslint-disable-next-line no-console
    console.error(error);
    process.exit(1);
});
