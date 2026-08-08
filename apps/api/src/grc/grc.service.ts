import { randomUUID } from 'node:crypto';
import { Injectable, NotFoundException } from '@nestjs/common';
import type { CreateActionDto, CreateAssessmentDto, CreateEvidenceDto, CreateRiskDto } from './dto';

const tenant = '11111111-1111-4111-8111-111111111111';
const seed = {
  assets: [
    {
      id: '22222222-2222-4222-8222-222222222222',
      tenantId: tenant,
      name: 'Müşteri Portalı',
      type: 'Uygulama',
      owner: 'Dijital Kanallar',
      classification: 'Gizli',
      criticality: 'CRITICAL',
    },
  ],
  risks: [
    {
      id: '33333333-3333-4333-8333-333333333333',
      tenantId: tenant,
      title: 'Yetkisiz müşteri verisi erişimi',
      description: 'Hatalı yetkilendirme müşteri verisinin açığa çıkmasına neden olabilir.',
      owner: 'Uygulama Güvenliği',
      likelihood: 3,
      impact: 5,
      level: 'CRITICAL',
      status: 'OPEN',
    },
  ],
  controls: [
    {
      id: '44444444-4444-4444-8444-444444444444',
      tenantId: tenant,
      code: 'UCL-IAM-01',
      title: 'Erişim haklarının periyodik gözden geçirilmesi',
      owner: 'IAM Ekibi',
      maturity: 3,
      status: 'IN_PROGRESS',
      frameworks: ['ISO 27001 A.5.18', 'NIST PR.AA-05'],
    },
  ],
  evidence: [
    {
      id: '55555555-5555-4555-8555-555555555555',
      tenantId: tenant,
      name: '2026 Q2 erişim gözden geçirme raporu',
      fileName: 'access-review-q2.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 842000,
      status: 'SUITABLE',
    },
  ],
  assessments: [
    {
      id: '66666666-6666-4666-8666-666666666666',
      tenantId: tenant,
      controlId: '44444444-4444-4444-8444-444444444444',
      assessor: 'GRC Ekibi',
      designScore: 4,
      operatingScore: 3,
      notes: 'Örneklem kapsamı genişletilmeli.',
    },
  ],
  findings: [
    {
      id: '77777777-7777-4777-8777-777777777777',
      tenantId: tenant,
      title: 'Ayrılan kullanıcı hesabı zamanında kapatılmamış',
      description: 'Bir örnek hesap SLA sonrasında aktif kalmıştır.',
      severity: 'HIGH',
      owner: 'IAM Ekibi',
      status: 'OPEN',
      actions: [] as unknown[],
    },
  ],
  audits: [
    {
      id: '88888888-8888-4888-8888-888888888888',
      tenantId: tenant,
      name: 'ISO 27001 İç Denetim 2026',
      lead: 'İç Denetim',
      status: 'IN_PROGRESS',
      progress: 46,
    },
  ],
};

@Injectable()
export class GrcService {
  list(kind: keyof typeof seed, tenantId: string) {
    const items = (seed[kind] as { id: string; tenantId: string }[]).filter(
      (item) => item.tenantId === tenantId,
    );
    return {
      items,
      total: items.length,
      page: 1,
      pageSize: 50,
    };
  }
  detail(kind: keyof typeof seed, tenantId: string, id: string) {
    const item = (seed[kind] as { id: string; tenantId: string }[]).find(
      (entry) => entry.tenantId === tenantId && entry.id === id,
    );
    if (!item) throw new NotFoundException('Kayıt bulunamadı.');
    return item;
  }
  createRisk(tenantId: string, input: CreateRiskDto) {
    const score = input.likelihood * input.impact;
    const item = {
      id: randomUUID(),
      tenantId,
      ...input,
      level: score >= 15 ? 'CRITICAL' : score >= 10 ? 'HIGH' : score >= 5 ? 'MEDIUM' : 'LOW',
      status: 'OPEN',
    };
    seed.risks.push(item);
    return item;
  }
  createEvidence(tenantId: string, input: CreateEvidenceDto) {
    const item = {
      id: randomUUID(),
      tenantId,
      ...input,
      storageKey: `${tenantId}/${randomUUID()}`,
      status: 'PENDING',
    };
    seed.evidence.push(item);
    return item;
  }
  createAssessment(tenantId: string, input: CreateAssessmentDto) {
    const item = { id: randomUUID(), tenantId, ...input, notes: input.notes ?? '' };
    seed.assessments.push(item);
    return item;
  }
  createAction(tenantId: string, findingId: string, input: CreateActionDto) {
    const finding = seed.findings.find(
      (entry) => entry.tenantId === tenantId && entry.id === findingId,
    );
    if (!finding) throw new NotFoundException('Kayıt bulunamadı.');
    const item = { id: randomUUID(), tenantId, findingId, ...input, status: 'OPEN' };
    finding.actions.push(item);
    return item;
  }
  dashboard(tenantId: string) {
    return {
      tenantId,
      openRisks: seed.risks.filter((item) => item.tenantId === tenantId).length,
      criticalAssets: seed.assets.filter(
        (item) => item.tenantId === tenantId && item.criticality === 'CRITICAL',
      ).length,
      controlCoverage: 68,
      openFindings: seed.findings.filter((item) => item.tenantId === tenantId).length,
    };
  }
}
