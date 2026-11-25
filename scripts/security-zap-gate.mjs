import fs from 'node:fs';
import assert from 'node:assert/strict';
// This gate consumes only the known scanner output, not an arbitrary CLI path.
assert.equal(process.argv[2], 'security-artifacts/zap/zap-active.json', 'Expected the active ZAP report path');
const descriptor = fs.openSync('security-artifacts/zap/zap-active.json', fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
let report;
try { report = JSON.parse(fs.readFileSync(descriptor, 'utf8')); }
finally { fs.closeSync(descriptor); }
assert.ok(Array.isArray(report.site) && report.site.length > 0, 'ZAP must actually scan a site');
const alerts = report.site.flatMap(site=>site.alerts || []);
const high = alerts.filter(alert=>Number(alert.riskcode)>=3);
console.log('ZAP_SUMMARY', JSON.stringify({sites:report.site.length, alerts:alerts.length, high:high.length, medium:alerts.filter(a=>Number(a.riskcode)===2).length, low:alerts.filter(a=>Number(a.riskcode)===1).length}));
if (high.length) process.exitCode = 2;
