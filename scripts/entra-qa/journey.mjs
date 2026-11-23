import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { expect } from '@playwright/test';
import {
  check,
  planChecks,
  verifySavedPlan,
  matchOne,
  containsRef,
  evidenceBytes,
  verifyCountdown,
} from './resume.mjs';
import { assetForm, biaForm, riskForm, aiForm } from './forms.mjs';
import { title as t, note, date } from './records.mjs';
import { openQaModule, switchQaLocale, waitForQaIdle } from '../qa-browser-harness.mjs';

export async function journey({ api, page, people, step, isolated, report, resume }) {
  const { owner, reviewer, lead } = people,
    ids = resume?.ids || {},
    codes = resume?.codes || {};
  Object.assign(report.codes, codes);
  const post = (path, data, expected = [200, 201]) => api(path, { method: 'POST', data, expected });
  const grc = () => api('/api/grc');
  const row = async (id) => {
    const r = (await grc()).rows.find((v) => v.id === id);
    assert.ok(r, 'Missing persisted register record');
    return JSON.parse(r.data_json);
  };
  function remember(key, id, code) {
    assert.ok(id, key + ' missing ID');
    ids[key] = id;
    if (code) {
      codes[key] = code;
      report.codes[key] = code;
    }
  }
  const register = async (key, module, data, extra = {}) => {
    const res = await post('/api/grc', { module, data, ...extra });
    remember(key, res.id, res.code);
    return row(res.id);
  };
  if (resume) {
    await step('Persisted recovery plan and three independent roles', async () =>
      verifySavedPlan(api, resume),
    );
  } else {
    await step('Tier 1 supplier', async () => {
      const v = await post('/api/third-party-risk', {
        action: 'save-vendor',
        assignmentMode: 'directory',
        name: t.vendor,
        service: 'Entra ID / M365',
        legalEntity: 'Microsoft Corporation',
        category: 'Technology',
        criticality: 'critical',
        dataClassification: 'restricted',
        dataAccess: note + ' · kimlik ve erişim kayıtları',
        hostingLocation: 'Microsoft Cloud',
        businessOwner: lead,
        riskOwner: owner,
        reviewer,
        contact: 'supplier@example.invalid',
        contractEnd: date(365),
        nextReview: date(30),
        exitPlan: 'Kimlikleri yedekten geri yükle ve erişimi sonlandır.',
        impact: 5,
        likelihood: 4,
        controlMaturity: 2,
        treatmentPlan: note + ' · ISO 27001 / SOC 2 Type II / DPA belgeleri inceleme girdisidir.',
        dpa: true,
      });
      remember('vendor', v.vendorId, v.code);
      const p = (await api('/api/third-party-risk')).profiles.find((x) => x.vendorId === v.vendorId);
      assert.equal(p.criticality, 'critical');
      assert.match(String(p.tier), /1/);
      const a = (await api('/api/third-party-risk')).assessments.find((x) => x.vendorId === v.vendorId);
      assert.match(a.treatmentPlan, /SOC 2 Type II/);
      assert.match(a.treatmentPlan, /ISO 27001/);
      assert.match(a.treatmentPlan, /DPA/);
    });
    await step('Asset posture and supplier', async () => {
      assert.ok(ids.vendor);
      const x = await assetForm(page, owner, codes.vendor);
      remember('asset', x.id, x.code);
      const a = await row(x.id);
      assert.equal(a.vendor, ids.vendor);
      for (const k of ['backupStatus', 'edrStatus', 'siemStatus', 'vulnScan'])
        assert.equal(a[k], 'Kapsamda');
    });
    await step('BIA recovery objectives and dependencies', async () => {
      assert.ok(ids.asset && ids.vendor);
      const x = await biaForm(page, owner, reviewer, codes.asset, codes.vendor);
      remember('bia', x.id, x.code);
      const b = await row(x.id);
      assert.deepEqual(b.technologyRefs, [ids.asset]);
      assert.deepEqual(b.supplierRefs, [ids.vendor]);
      assert.deepEqual([b.rto, b.rpo, b.mtpd].map(Number), [2, 1, 4]);
    });
    await step('BCP inheritance and three independent roles', async () => {
      assert.ok(ids.bia);
      await waitForQaIdle(page);
      await page.reload();
      await switchQaLocale(page, 'en');
      await openQaModule(page, 'Business Continuity & Resilience');
      await page.locator('.continuity-hero button').filter({ hasText: /plan/i }).first().click();
      const d = page.getByRole('dialog');
      const pick = async (label, value) => {
        await waitForQaIdle(page);
        const input = d.getByRole('combobox', { name: label, exact: true });
        await input.fill(value);
        await d.getByRole('option').filter({ hasText: value }).first().click();
      };
      await pick('BIA reference', codes.bia);
      for (const [name, value] of [
        ['rtoHours', '2'],
        ['rpoHours', '1'],
        ['mtpdHours', '4'],
      ])
        await expect(d.locator('[name=' + name + ']')).toHaveValue(value);
      await expect(d).toContainText(codes.asset);
      await expect(d).toContainText(codes.vendor);
      await d.locator('[name=name]').fill(t.plan);
      await d
        .locator('[name=communicationPlan]')
        .fill(note + ' · kriz ekibini şirket içi kanaldan bilgilendir.');
      await pick('Independent reviewer', reviewer);
      await pick('Crisis lead', lead);
      await waitForQaIdle(page);
      const response = page.waitForResponse(
        (r) => r.url().endsWith('/api/continuity') && r.request().method() === 'POST',
      );
      await d.getByRole('button', { name: 'Create draft plan' }).click();
      const write = await response;
      assert.ok(write.ok(), 'BCP create HTTP ' + write.status());
      const result = await write.json();
      const p = (await api('/api/continuity')).plans.find((x) => x.id === result.id);
      remember('plan', p.id, p.code);
      planChecks(p, ids, codes, people);
      await expect(d).toBeHidden();
    });
    await step('ISO 27001 and SOC 2 control mappings', async () => {
      const idx = await api('/api/framework-posture');
      const desired = [
        [/27001/, 'A.8.5'],
        [/SOC 2/, 'CC6.1'],
      ];
      for (const [pattern] of desired) {
        const name = idx.catalog.find((n) => pattern.test(n));
        assert.ok(name);
        if (!idx.enrolled.includes(name)) {
          assert.ok(isolated, 'Required framework not enrolled: ' + name);
          await post('/api/framework-posture', { action: 'enroll', name });
        }
      }
      const c = await api('/api/framework-posture?controlEditor=');
      const mappings = desired.map(([p, ref]) => {
        const program = c.programs.find((v) => p.test(v.name));
        const clause = program.clauses.find((v) => v.ref === ref);
        assert.ok(clause, ref);
        return { name: program.name, ref, revision: clause.revision, linked: true };
      });
      await register(
        'control',
        'Kontroller',
        {
          controlTitle: t.control,
          owner,
          frequency: 'Aylık',
          implementation: 'Uygulanıyor',
          status: 'Taslak',
          description: note,
        },
        { controlMappings: mappings },
      );
      const saved = await api('/api/framework-posture?controlEditor=' + encodeURIComponent(ids.control));
      for (const m of mappings)
        assert.ok(
          saved.programs.find((x) => x.name === m.name).clauses.find((c) => c.ref === m.ref).linked,
        );
    });
    await step('Evidence upload, control reference and byte hash', async () => {
      assert.ok(ids.control);
      const bytes = evidenceBytes();
      await waitForQaIdle(page);
      await page.reload();
      await switchQaLocale(page, 'en');
      await openQaModule(page, 'Evidence Library');
      await page.locator('.module-head button.primary').click();
      const d = page.locator('.record-dialog');
      await d
        .locator('input[type=file]')
        .setInputFiles({ name: 'entra-ca-pim.json', mimeType: 'application/json', buffer: bytes });
      await d.locator('[name=evidenceTitle]').fill(t.evidence);
      const choose = async (label, query) => {
        await waitForQaIdle(page);
        await d.getByRole('combobox', { name: label, exact: true }).fill(query);
        await d.getByRole('option').filter({ hasText: query }).first().click();
      };
      await choose('Owner', owner);
      const verify = d.getByRole('combobox', { name: 'Reviewer', exact: true });
      await verify.fill(owner);
      await expect(d.getByRole('listbox', { name: 'Reviewer', exact: true })).toHaveAttribute(
        'aria-busy',
        'false',
      );
      await expect(d.getByRole('option').filter({ hasText: owner })).toHaveCount(0);
      await choose('Reviewer', reviewer);
      await choose('Related controls', codes.control);
      await d.locator('[name=period]').fill(date(0).slice(0, 7));
      await expect(d).toContainText(createHash('sha256').update(bytes).digest('hex'));
      const pending = page.waitForResponse(
        (r) => r.url().endsWith('/api/evidence') && r.request().method() === 'POST',
      );
      await d.locator('.form-actions .primary').click();
      const response = await pending;
      assert.equal(response.status(), 201);
      const x = await response.json();
      await expect(d).toBeHidden();
      remember('evidence', x.id, x.code);
      assert.equal(x.contentSha256, createHash('sha256').update(bytes).digest('hex'));
      const e = await row(x.id);
      assert.equal(e.contentSha256, x.contentSha256);
      assert.equal(e.controlRef, codes.control);
      const stored = (await grc()).rows.find((r) => r.id === x.id);
      const rejected = await post(
        '/api/evidence/review',
        { id: x.id, version: x.versionNo, expectedUpdatedAt: stored.updated_at },
        [403],
      );
      assert.equal(rejected.code, 'INDEPENDENT_REVIEWER_REQUIRED');
      assert.equal((await row(x.id)).reviewStatus, e.reviewStatus);
      assert.notEqual(e.reviewStatus, 'approved');
    });
    await step('Policy draft and control linkage', async () => {
      assert.ok(ids.control);
      const p = await post('/api/policy-lifecycle', {
        action: 'save-policy',
        autoCode: true,
        assignmentMode: 'directory',
        title: t.policy,
        category: 'security',
        classification: 'internal',
        owner,
        reviewer,
        audience: 'Tüm Çalışanlar',
        reviewFrequencyDays: 365,
      });
      remember('policy', p.id || p.policyId, p.code);
      await post('/api/policy-lifecycle', {
        action: 'create-version',
        policyId: ids.policy,
        summary: note + ' · kimlik ve erişim politikası',
        content:
          'Kritik kimliklerde FIDO2 kullanılır. PIM etkinleştirmeleri süreli ve bağımsız onaylıdır. Kayıtlar düzenli gözden geçirilir.',
        effectiveDate: date(0),
        controlRefs: [codes.control],
        riskRefs: [],
        regulationRefs: [],
      });
      const v = (await api('/api/policy-lifecycle')).versions.find((x) => x.policyId === ids.policy);
      assert.ok(v.controlRefs.includes(codes.control));
    });
    await step('Risk scoring and three references', async () => {
      assert.ok(ids.asset && ids.bia && ids.control);
      const x = await riskForm(page, owner, codes, date(30));
      remember('risk', x.id, x.code);
      const r = await row(x.id);
      assert.equal(Number(r.inherentLikelihood) * Number(r.inherentImpact), 20);
      assert.deepEqual(
        [r.asset, r.processLink, r.existingControls],
        [codes.asset, codes.bia, codes.control],
      );
    });
    await step('KRI thresholds and linked risk', async () => {
      assert.ok(ids.risk);
      const k = await post('/api/risk-appetite', {
        action: 'save-appetite',
        riskRefs: [ids.risk],
        category: 'cyber',
        statement: note + ' · Korumasız ayrıcalıklı kimlik sayısı sıfır olmalıdır.',
        kriName: t.kri,
        metricUnit: 'hesap',
        direction: 'upper',
        appetiteTarget: 0,
        warningThreshold: 1,
        breachThreshold: 2,
        owner,
        reviewer,
        frequencyDays: 30,
        validFrom: date(0),
        validUntil: date(365),
      });
      remember('kri', k.id, k.code);
      const a = (await api('/api/risk-appetite')).appetites.find((x) => x.id === k.id);
      assert.deepEqual([a.appetiteTarget, a.warningThreshold, a.breachThreshold].map(Number), [0, 1, 2]);
      assert.ok(JSON.stringify(a.riskRefs).includes(ids.risk));
    });
    await step('AI profile and go-live gate', async () => {
      assert.ok(ids.vendor && ids.asset && ids.control && ids.risk);
      const profile = {
        name: t.ai,
        model: 'Security Copilot',
        purpose: note + ' · Kimlik telemetrisini insan gözetimiyle analiz et.',
        unit: 'BT',
        architecture: 'embedded',
        deployment: 'saas',
        provider: 'Microsoft',
        vendor: [{ id: ids.vendor }],
        asset: [{ id: ids.asset }],
        risks: [{ id: ids.risk }],
        controls: [{ id: ids.control }],
        risk: 'limited',
        tools: '',
        write: false,
        hitl: 'Her öneri bir analist tarafından incelenir.',
        sources: ['pii'],
        pii: true,
        zdr: true,
        noTraining: true,
        transfer: false,
        owner,
        technical: lead,
        reviewer,
        impact: '4',
        likelihood: '3',
        sensitivity: '4',
        autonomy: '2',
        maturity: '3',
        controlNotes: note,
        reviewDate: date(90),
      };
      const path = '/api/ai/workspace';
      await post(path, { action: 'register', profile: { ...profile, reviewer: owner } }, [400, 422]);
      const m = await aiForm(page, profile, codes);
      remember('ai', m.id, m.code);
      const get = async () => (await api(path)).systems.find((s) => s.id === m.id);
      const src = await get();
      assert.equal(src.profile.zdr, true);
      assert.ok(src.profile.hitl);
      for (const [field, id] of [
        ['vendor', ids.vendor],
        ['asset', ids.asset],
        ['risks', ids.risk],
        ['controls', ids.control],
      ])
        assert.ok(
          src.profile[field].some((ref) => ref.id === id),
          'AI profile link ' + field,
        );
      assert.match(src.code, /^AIS-\d{3,}$/);
      report.codes.ai = src.code;
      assert.equal(
        (await post(path, { action: 'approve', id: m.id, revision: src.revision, note }, [403])).code,
        'sod',
      );
      const missing = await post(
        path,
        {
          action: 'submit',
          id: m.id,
          revision: src.revision,
          assessment: {
            privacy: 'Tatbikat için kişisel veri etkisi değerlendirildi.',
            checks: ['injection', 'dlp', 'output', 'access'],
            reportType: 'dpia',
          },
        },
        [400, 422],
      );
      assert.equal(missing.code, 'evidence');
      assert.equal((await get()).phase, src.phase);
    });
  }
  await step('Incident relations and 72-hour clock', async () => {
    assert.ok(ids.asset && ids.risk && ids.bia);
    const stamp = new Date(Date.now() - 3645000).toISOString();
    const input = {
      action: 'create',
      assignmentMode: 'directory',
      referenceMode: 'record-id',
      requestId: crypto.randomUUID(),
      title: t.incident,
      description: note + ' · Gerçek bir olay bildirimi içermez.',
      businessImpact: 'Tatbikat kapsamında kimlik hizmetinde etki değerlendirmesi.',
      severity: 'high',
      category: 'account-compromise',
      detectedAt: stamp,
      detectedDate: stamp.slice(0, 10),
      owner,
      commander: lead,
      reviewer,
      assetRefs: ids.asset,
      riskRef: ids.risk,
      biaRef: ids.bia,
      dataClassification: 'Restricted',
      personalData: true,
    };
    await post('/api/incidents', { ...input, reviewer: owner }, [400, 403, 422]);
    const old =
      resume &&
      matchOne((await api('/api/incidents')).incidents, (x) => x.title === t.incident, 'incident', true);
    if (old) {
      check(
        old.description === input.description &&
          old.declaredBy?.toLowerCase() === owner.toLowerCase() &&
          old.owner?.toLowerCase() === owner.toLowerCase() &&
          old.personalData &&
          containsRef(old.assetRefs, ids.asset, codes.asset) &&
          containsRef(old.riskRef, ids.risk, codes.risk) &&
          containsRef(old.biaRef, ids.bia, codes.bia),
        'incident.provenance',
      );
    }
    const i = old || (await post('/api/incidents', input));
    remember('incident', i.id);

    const registryKey = 'enterprise:incident:' + i.id;
    const registry = await post('/api/connected-grc/codes', { keys: [registryKey], ids: [registryKey] });
    const shortCode = registry.codes[registryKey];
    if (shortCode && /^INC-\d{3,}$/.test(shortCode)) remember('incident', i.id, shortCode);
    await switchQaLocale(page, 'en');
    await openQaModule(page, 'Security Incidents & Crisis');
    await page.getByLabel('Search incidents', { exact: true }).fill(t.incident);
    await page.locator('.incident-row-open').filter({ hasText: t.incident }).click();
    await verifyCountdown(page, old?.detectedAt || stamp);
    check(/^INC-\d{3,}$/.test(shortCode || ''), 'incident.short-code');
  });
  await step('Finding, corrective action and explicit SoD rejection', async () => {
    assert.ok(ids.incident && ids.risk && ids.control);
    const f = {
      action: 'create',
      assignmentMode: 'directory',
      referenceMode: 'record-id',
      sourceType: 'incident',
      sourceRef: ids.incident,
      sourceTitle: t.incident,
      findingType: 'nonconformity',
      title: t.finding,
      description: note + ' · İki sentetik hesapta süre sınırı eksik.',
      severity: 'high',
      owner,
      reviewer,
      rootCause: 'Eski PIM atamalarında süreli rol ilkesi uygulanmamış.',
      correctiveAction: 'İki örnek atamada süreli etkinleştirmeyi zorunlu kıl.',
      preventiveAction: 'Haftalık PIM uygunluk denetimini izleme kapsamına al.',
      dueDate: date(15),
      riskRef: ids.risk,
      controlRef: ids.control,
    };
    await post('/api/findings', { ...f, reviewer: owner }, [400, 403, 422]);
    const old =
      resume &&
      matchOne(
        (await api('/api/findings?view=graph')).findings,
        (x) => x.title === t.finding,
        'finding',
        true,
      );
    if (old) {
      const detail = (await api('/api/findings?view=decision&findingId=' + encodeURIComponent(old.id)))
        .record;
      check(
        detail.description === f.description &&
          detail.owner?.toLowerCase() === owner.toLowerCase() &&
          detail.reviewer?.toLowerCase() === reviewer.toLowerCase() &&
          detail.source_ref === ids.incident &&
          containsRef(detail.risk_ref, ids.risk, codes.risk) &&
          containsRef(detail.control_ref, ids.control, codes.control) &&
          ['open', 'in-progress'].includes(detail.status),
        'finding.provenance',
      );
    }
    const x = old || (await post('/api/findings', { ...f, sourceMode: 'record' }));
    remember('finding', x.id, x.code);
    const found = (await api('/api/findings?view=graph')).findings.find((v) => v.id === x.id);
    assert.equal(found.title, t.finding);
    const decision = async (operation, confirmation) => {
      const rev = await api('/api/findings?view=decision&findingId=' + encodeURIComponent(x.id));
      return post(
        '/api/findings',
        {
          action: 'transition',
          findingId: x.id,
          operation,
          note,
          confirmation,
          expectedRevision: rev.revision,
          decisionMode: 'reviewed',
        },
        operation === 'start' ? [200] : [400, 422],
      );
    };
    if (!old || old.status === 'open') await decision('start', 'CAPA AKSİYONUNU BAŞLAT');
    const rejected = await decision('submit', 'CAPA DOĞRULAMAYA GÖNDER');
    assert.equal(rejected.code, 'EVIDENCE_SELECTION');
    assert.equal(
      (await api('/api/findings?view=graph')).findings.find((v) => v.id === x.id).status,
      'in-progress',
    );
  });
  await step('Risk focus, two-hop provenance and drawer', async () => {
    assert.ok(ids.risk && ids.finding && ids.incident && ids.evidence && ids.policy);
    await waitForQaIdle(page);
    await page.reload();
    await switchQaLocale(page, 'en');
    await openQaModule(page, 'Connected GRC Map');
    await page.getByRole('textbox', { name: 'Find record' }).fill(codes.risk);
    await page.locator('#cm-record-options button').filter({ hasText: t.risk }).click();
    await page.getByRole('button', { name: 'Close details' }).click();
    const nodes = page.locator('.cm-network[data-mode=focus] .cm-node');
    for (const [lane, keys] of [
      [0, ['control', 'evidence', 'policy']],
      [1, ['risk']],
      [2, ['asset', 'bia', 'incident', 'finding']],
    ]) {
      for (const k of keys)
        await expect(
          nodes
            .and(page.locator('[data-lane="' + lane + '"]'))
            .filter({ hasText: t[k] })
            .first(),
        ).toBeVisible();
    }
    const boxes = await nodes.evaluateAll((ns) =>
      ns.map((n) => {
        const b = n.getBoundingClientRect();
        return [b.left, b.top, b.right, b.bottom];
      }),
    );
    for (let i = 0; i < boxes.length; i++)
      for (const b of boxes.slice(i + 1)) {
        const a = boxes[i];
        assert.ok(
          a[0] >= b[2] || b[0] >= a[2] || a[1] >= b[3] || b[1] >= a[3],
          'Overlapping focus cards',
        );
      }
    await nodes.filter({ hasText: t.risk }).click();
    await expect(page.locator('dialog.cm-drawer')).toBeVisible();
    await page.getByRole('button', { name: 'Close details' }).click();
  });
}
