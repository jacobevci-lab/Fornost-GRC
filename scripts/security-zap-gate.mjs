import fs from 'node:fs';
import assert from 'node:assert/strict';
const report = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
assert.ok(Array.isArray(report.site) && report.site.length > 0, 'ZAP must actually scan a site');
const alerts = report.site.flatMap(site=>site.alerts || []);
const high = alerts.filter(alert=>Number(alert.riskcode)>=3);
console.log('ZAP_SUMMARY', JSON.stringify({sites:report.site.length, alerts:alerts.length, high:high.length, medium:alerts.filter(a=>Number(a.riskcode)===2).length, low:alerts.filter(a=>Number(a.riskcode)===1).length}));
if (high.length) process.exitCode = 2;
