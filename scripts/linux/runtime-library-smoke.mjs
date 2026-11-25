// Execute against the final image, not the build host. Uses only synthetic data.
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { gzipSync, gunzipSync, deflateRawSync, inflateRawSync } from 'node:zlib';
import { createHash, generateKeyPairSync, sign, verify } from 'node:crypto';
import { createSecureContext, rootCertificates } from 'node:tls';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

assert.equal(process.getuid(), 1000);
assert.match(process.version, /^v22\./);
assert.equal(process.config.variables.node_shared_zlib, false);
assert.equal(process.config.variables.node_shared_openssl, false);
for (const path of ['/bin/sh', '/bin/bash', '/usr/bin/apt', '/usr/bin/dpkg']) {
  assert.equal(existsSync(path), false, `Unexpected runtime tool: ${path}`);
}
const inventory = readdirSync('/var/lib/dpkg/status.d').filter(name => !name.endsWith('.md5sums'))
  .map(name => readFileSync(`/var/lib/dpkg/status.d/${name}`, 'utf8'));
for (const name of ['libgcc-s1', 'libstdc++6', 'libgomp1', 'gcc-14-base']) {
  assert.ok(inventory.some(entry => entry.split('\n').includes(`Package: ${name}`)), `Missing inventory: ${name}`);
}
for (const name of ['zlib1g', 'libssl3t64', 'libzstd1']) {
  assert.ok(!inventory.some(entry => entry.split('\n').includes(`Package: ${name}`)), `Unexpected system package: ${name}`);
}
// Check the actual payload as well as package inventory; keep bundled Node APIs.
for (const directory of readdirSync('/usr/lib', { withFileTypes: true }).filter(entry => entry.isDirectory() && entry.name.includes('linux-gnu'))) {
  assert.ok(!readdirSync(`/usr/lib/${directory.name}`).some(name => /^(libz|libzstd|libssl|libcrypto)\.so/.test(name)), 'Unused system library remains');
}
const payload = Buffer.from('Fornost evidence compression — synthetic fixture\n'.repeat(1024));
assert.deepEqual(gunzipSync(gzipSync(payload)), payload);
assert.deepEqual(inflateRawSync(deflateRawSync(payload)), payload);
assert.throws(() => inflateRawSync(Buffer.from('invalid compressed evidence')));
assert.equal(createHash('sha256').update(payload).digest('hex').length, 64);
const keys = generateKeyPairSync('rsa', { modulusLength: 2048 });
assert.ok(verify('sha256', payload, keys.publicKey, sign('sha256', payload, keys.privateKey)));
assert.ok(rootCertificates.length > 100);
assert.ok(createSecureContext({ minVersion: 'TLSv1.2' }).context);

const require = createRequire(import.meta.url);
const sharp = require('sharp');
const png = await sharp({ create: { width: 2, height: 2, channels: 4, background: '#ffffff' } }).png().toBuffer();
assert.equal((await sharp(png).metadata()).width, 2);
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const canvas = createCanvas(2, 2);
canvas.getContext('2d').drawImage(await loadImage(png), 0, 0);
assert.ok(canvas.toBuffer('image/png').length > 0);
const { PDFDocument } = await import('pdf-lib');
const pdf = await PDFDocument.create(); pdf.addPage();
assert.equal((await PDFDocument.load(await pdf.save())).getPageCount(), 1);
const wranglerRequire = createRequire(require.resolve('wrangler/package.json'));
const workerd = wranglerRequire('workerd').default;
assert.match(execFileSync(workerd, ['--version'], { encoding: 'utf8', timeout: 15000 }), /workerd/);
console.log('RUNTIME_LIBRARIES_PASS: nonroot Node22, truthful package inventory, no system zlib/OpenSSL, compression/error handling, crypto/TLS roots, sharp/canvas/PDF, workerd startup');
