import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fixture } from './helpers/enterprise-route-fixture';
import { blankProfile, blankAssessment, controls, parseProfile, DeskError } from '../app/ai/governance-domain';
import { desk, register, getModel, assess, changeShadow } from '../app/ai/governance-store';
import { monitor, observationInput } from '../app/ai/governance-monitor';
import { appendEvidenceVersion, sha256HexBytes } from '../app/evidence/versioning';
import { aiWorkspaceSchema } from '../app/ai/governance-schema';
import type { Actor } from '../app/api/auth/security';
const person = (id: string): Actor => ({
  id,
  name: id,
  email: id + '@example.com',
  role: 'Admin',
  source: 'local'
});
const owner = person('owner'),
  reviewer = person('reviewer'),
  technical = person('technical');
const profile = {
  ...blankProfile,
  name: 'Demand forecast',
  model: 'Forecast v2',
  unit: 'Operations',
  purpose: 'Predict weekly service demand',
  provider: 'Private model',
  architecture: 'ml',
  deployment: 'private',
  risk: 'high',
  sources: ['rag'],
  owner: owner.email,
  technical: technical.email,
  reviewer: reviewer.email,
  impact: '2',
  likelihood: '2',
  sensitivity: '2',
  autonomy: '2',
  maturity: '4',
  controlNotes: 'Reviewed dataset and access logs',
  reviewDate: '2027-10-01'
};
const assessment = {
  ...blankAssessment,
  impact: 'Outliers affect the service forecasts across business units.',
  mitigation: 'Human reviewers validate uncertainty bounds before use.',
  checks: [...controls],
  reportType: 'bias'
};
const match = (code: string) => (e: unknown) => e instanceof DeskError && e.code === code;
function setup() {
  const f = fixture('findings', true);
  for (const file of readdirSync('drizzle').filter(n => n.endsWith('.sql')).sort()) f.sqlite.exec(readFileSync('drizzle/' + file, 'utf8'));
  for (const a of [owner, reviewer, technical]) f.sqlite.prepare('INSERT INTO local_users(id,name,email,password_hash,password_salt,role,status,created_at,updated_at) VALUES(?,?,?,\'fixture\',\'fixture\',?,\'Active\',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)').run(a.id!, a.name, a.email, a.role);
  return {
    ...f,
    env: {
      DB: f.db
    }
  };
}
test('runtime and migration apply the same governance schema and identity constraints', () => {
  assert.equal(aiWorkspaceSchema.slice(2).join(';\n\n') + ';\n', readFileSync('drizzle/0115_ai_governance_workspace.sql', 'utf8'));
  assert.throws(() => parseProfile({
    ...profile,
    reviewer: owner.email
  }), match('sod'));
  assert.throws(() => parseProfile({
    ...profile,
    architecture: 'agent',
    write: true
  }), match('agent'));
  assert.throws(() => parseProfile({
    ...profile,
    sources: ['public', 'rag']
  }), match('data'));
  assert.throws(() => observationInput({
    accuracy: null
  }, 'AIM-X'), match('metric'));
});
test('prohibited, incomplete assessments and legacy direct approvals cannot enable go-live', async () => {
  const f = setup();
  try {
    const {
      id
    } = await register(f.env, owner, {
      profile: {
        ...profile,
        risk: 'prohibited'
      }
    });
    let m = await getModel(f.db, id, owner);
    assert.equal(m.code, 'AIS-001');
    assert.throws(() => f.sqlite.prepare("UPDATE ai_model_inventory SET status='approved',approved_by=? WHERE id=?").run(reviewer.email, id), /AI_GATE_REQUIRED/);
    await assert.rejects(assess(f.env, owner, {
      action: 'submit',
      assessment
    }, m), match('prohibited'));
    await register(f.env, owner, {
      id,
      revision: m.revision,
      profile
    });
    m = await getModel(f.db, id, owner);
    await assert.rejects(assess(f.env, owner, {
      action: 'submit',
      assessment: {
        ...assessment,
        checks: []
      }
    }, m), match('guardrails'));
    await assert.rejects(assess(f.env, owner, {
      action: 'submit',
      assessment
    }, m), match('evidence'));
    await assert.rejects(assess(f.env, owner, {
      action: 'submit',
      assessment: {
        ...assessment,
        impact: ''
      }
    }, m), match('aia'));
    assert.equal((await getModel(f.db, id, owner)).phase, 'draft');
  } finally {
    f.sqlite.close();
  }
});
test('current library evidence, signer independence, monitoring, escalation and suspension hold across real database writes', async () => {
  const f = setup(),
    stamp = new Date().toISOString();
  try {
    f.sqlite.prepare("INSERT INTO simple_grc_records VALUES('AST-QA','Varlık Envanteri','{}',?,?)").run(stamp, stamp);
    const {
      id
    } = await register(f.env, owner, {
      profile: {
        ...profile,
        asset: [{
          id: 'AST-QA',
          label: ''
        }]
      }
    });
    const bytes = new TextEncoder().encode('Verified bias evaluation report'),
      hash = await sha256HexBytes(bytes),
      evidenceId = 'EVD-governance',
      key = 'evidence/' + evidenceId + '/bias.pdf';
    const v = await appendEvidenceVersion(f.db, {
      evidenceId,
      fileKey: key,
      fileName: 'bias.pdf',
      fileType: 'application/pdf',
      fileSize: bytes.length,
      contentSha256: hash,
      evidenceTitle: 'Model bias evaluation',
      owner: technical.email,
      period: 'Q4',
      frameworks: 'ISO/IEC 42001',
      controlRefs: '',
      changeNote: 'Reviewed results',
      createdBy: technical.email,
      createdAt: stamp
    }, {
      additionalStatements: c => [f.db.prepare("INSERT INTO simple_grc_records VALUES(?,'Kanıtlar',?,?,?)").bind(evidenceId, JSON.stringify({
        status: 'Approved',
        versionNo: c.versionNo,
        versionChainSha256: c.chainSha256
      }), stamp, stamp)]
    });
    f.sqlite.prepare('INSERT INTO simple_evidence_files VALUES(?,?,?,?,?)').run(key, 'bias.pdf', 'application/pdf', bytes, stamp);
    const load = () => getModel(f.db, id, owner),
      selection = {
        evidenceId,
        versionId: v.id
      };
    await assess(f.env, owner, {
      action: 'submit',
      assessment,
      evidenceSelection: selection
    }, await load());
    let m = await load();
    assert.equal(m.phase, 'review');
    await assert.rejects(assess(f.env, owner, {
      action: 'approve',
      note: 'Reviewed model'
    }, m), match('sod'));
    const sign = {
      action: 'approve',
      note: 'Independent review completed.'
    };
    f.sqlite.prepare("UPDATE simple_grc_records SET data_json=json_set(data_json,'$.status','Expired') WHERE id=?").run(evidenceId);
    await assert.rejects(assess(f.env, reviewer, sign, m), match('evidence'));
    f.sqlite.prepare("UPDATE simple_grc_records SET data_json=json_set(data_json,'$.status','Approved') WHERE id=?").run(evidenceId);
    await assess(f.env, reviewer, sign, m);
    m = await load();
    assert.equal(m.phase, 'production');
    assert.equal(m.pin!.contentSha256, hash);
    const metric = {
      action: 'monitor',
      accuracy: 92,
      errorRate: 1,
      driftScore: 41,
      biasScore: 1,
      p95LatencyMs: 8,
      sampleSize: 64,
      hallucination: 1,
      leakage: 1,
      note: 'The drift threshold was exceeded in the evaluation sample.'
    };
    const o = await monitor(f.env, technical, metric, m);
    const a = {
      observation: o.id,
      lang: 'en'
    };
    for (const action of ['incident', 'capa']) {
      const first = await monitor(f.env, technical, {
          ...a,
          action
        }, m),
        second = await monitor(f.env, technical, {
          ...a,
          action
        }, m);
      assert.equal(first.id, second.id);
    }
    const row = (await desk(f.db, owner)).systems[0];
    assert.equal(row.openIssue, true);
    assert.match(row.metrics[0].finding_code!, /^FND-\d{3}$/);
    assert.match(row.metrics[0].incident_code!, /^INC-\d{3}$/);
    for (const [table] of [['ai_model_changes', 'deployed'], ['ai_release_gates', 'approved']]) {
      const seed: Record<string, string | number> = {};
      for (const c of f.sqlite.prepare('PRAGMA table_info(' + table + ')').all()) if (c.notnull && !c.dflt_value) seed[String(c.name)] = c.type === 'INTEGER' ? 1 : 'test';
      Object.assign(seed, {
        id: 'pending',
        model_id: id,
        status: table === 'ai_model_changes' ? 'approved' : 'requested'
      });
      f.sqlite.prepare('INSERT INTO ' + table + '(' + Object.keys(seed).join(',') + ') VALUES(' + Object.keys(seed).map(() => '?').join(',') + ')').run(...Object.values(seed));

    }
    f.sqlite.prepare("UPDATE ai_release_gates SET status='approved',decided_by=? WHERE id='pending'").run(reviewer.email);
    await monitor(f.env, technical, {
      ...a,
      action: 'suspend'
    }, m);
    assert.equal((await load()).phase, 'suspended');
    assert.equal(f.sqlite.prepare("SELECT approved_by FROM ai_model_inventory WHERE id=?").get(id)?.approved_by, null);
    await assert.rejects(monitor(f.env, technical, metric, await load()), match('stage'));
    assert.equal(f.sqlite.prepare("SELECT status FROM ai_release_gates WHERE id='pending'").get()?.status,'revoked');
    for (const [table, status] of [['ai_model_changes', 'deployed'], ['ai_release_gates', 'approved']]) {
      assert.throws(() => f.sqlite.prepare('UPDATE ' + table + ' SET status=? WHERE id=?').run(status, 'pending'), /AI_GATE_REQUIRED/);
    }
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM ai_system_decisions WHERE action='approve'").get()?.n, 1);
  } finally {
    f.sqlite.close();
  }
});
test('Shadow decisions are exclusive and admission assigns one sequential AIS code', async () => {
  const f = setup();
  try {
    const {
      id
    } = await changeShadow(f.db, owner, {
      action: 'shadow',
      name: 'Unreviewed tool',
      note: 'Observed in procurement.'
    });
    const created = await register(f.env, owner, {
      profile,
      shadowId: id
    });
    await assert.rejects(register(f.env, owner, {
      profile,
      shadowId: id
    }));
    await assert.rejects(changeShadow(f.db, owner, {
      action: 'ban',
      id,
      note: 'Ban decision after admission'
    }));
    const data = await desk(f.db, owner);
    assert.equal(data.systems.length, 1);
    assert.equal(data.systems[0].phase, 'assessment');
    assert.equal(data.nextCode, 'AIS-002');
    assert.equal(data.shadow[0].model_id, created.id);
    const second = await changeShadow(f.db, owner, {
      action: 'shadow',
      name: 'Another tool',
      note: 'Raised by the review team.'
    });
    await changeShadow(f.db, reviewer, {
      action: 'ban',
      id: second.id,
      note: 'Use outside authorized scope.'
    });
    await assert.rejects(register(f.env, owner, {
      profile,
      shadowId: second.id
    }));
  } finally {
    f.sqlite.close();
  }
});
