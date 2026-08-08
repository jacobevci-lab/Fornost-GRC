import { EvidenceStatus, PrismaClient, RecordStatus, RiskLevel } from '@prisma/client';
import type { Prisma } from '@prisma/client';

const prisma = new PrismaClient();
const tenantId = '11111111-1111-4111-8111-111111111111';

async function seed(tx: Prisma.TransactionClient) {
  await tx.tenant.upsert({
    where: { id: tenantId },
    update: {},
    create: { id: tenantId, name: 'Örnek Teknoloji A.Ş.', slug: 'ornek-teknoloji' },
  });

  const role = await tx.role.upsert({
    where: { tenantId_name: { tenantId, name: 'GRC Manager' } },
    update: {
      permissions: [
        'dashboard:read',
        'grc:read',
        'risk:write',
        'evidence:write',
        'assessment:write',
        'finding:write',
      ],
    },
    create: {
      tenantId,
      name: 'GRC Manager',
      permissions: [
        'dashboard:read',
        'grc:read',
        'risk:write',
        'evidence:write',
        'assessment:write',
        'finding:write',
      ],
    },
  });
  const user = await tx.user.upsert({
    where: { tenantId_email: { tenantId, email: 'grc.manager@example.invalid' } },
    update: {},
    create: {
      tenantId,
      email: 'grc.manager@example.invalid',
      displayName: 'Sentetik GRC Yöneticisi',
    },
  });
  await tx.userRole.upsert({
    where: { userId_roleId: { userId: user.id, roleId: role.id } },
    update: {},
    create: { userId: user.id, roleId: role.id },
  });
  await tx.userIdentity.upsert({
    where: {
      issuer_subject_userId: {
        issuer: 'https://login.microsoftonline.com/replace-tenant-id/v2.0',
        subject: 'replace-synthetic-oidc-subject',
        userId: user.id,
      },
    },
    update: {},
    create: {
      issuer: 'https://login.microsoftonline.com/replace-tenant-id/v2.0',
      subject: 'replace-synthetic-oidc-subject',
      userId: user.id,
    },
  });

  await tx.asset.upsert({
    where: { id: '22222222-2222-4222-8222-222222222222' },
    update: {},
    create: {
      id: '22222222-2222-4222-8222-222222222222',
      tenantId,
      name: 'Müşteri Portalı',
      type: 'Uygulama',
      owner: 'Dijital Kanallar',
      classification: 'Gizli',
      criticality: RiskLevel.CRITICAL,
      status: RecordStatus.OPEN,
    },
  });

  await tx.risk.upsert({
    where: { id: '33333333-3333-4333-8333-333333333333' },
    update: {},
    create: {
      id: '33333333-3333-4333-8333-333333333333',
      tenantId,
      assetId: '22222222-2222-4222-8222-222222222222',
      title: 'Yetkisiz müşteri verisi erişimi',
      description: 'Hatalı yetkilendirme müşteri verisinin açığa çıkmasına neden olabilir.',
      owner: 'Uygulama Güvenliği',
      likelihood: 3,
      impact: 5,
      level: RiskLevel.CRITICAL,
      status: RecordStatus.OPEN,
    },
  });

  await tx.control.upsert({
    where: {
      tenantId_code: {
        tenantId,
        code: 'UCL-IAM-01',
      },
    },
    update: {},
    create: {
      id: '44444444-4444-4444-8444-444444444444',
      tenantId,
      code: 'UCL-IAM-01',
      title: 'Erişim haklarının periyodik gözden geçirilmesi',
      objective: 'Gereksiz ve uygunsuz erişimlerin zamanında kaldırılmasını sağlamak.',
      owner: 'IAM Ekibi',
      status: RecordStatus.IN_PROGRESS,
    },
  });

  await tx.evidence.upsert({
    where: { id: '55555555-5555-4555-8555-555555555555' },
    update: {},
    create: {
      id: '55555555-5555-4555-8555-555555555555',
      tenantId,
      name: '2026 Q2 erişim gözden geçirme raporu',
      fileName: 'access-review-q2.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 842000,
      storageKey: `${tenantId}/seed/access-review-q2`,
      status: EvidenceStatus.SUITABLE,
    },
  });

  await tx.controlAssessment.upsert({
    where: { id: '66666666-6666-4666-8666-666666666666' },
    update: {},
    create: {
      id: '66666666-6666-4666-8666-666666666666',
      tenantId,
      controlId: '44444444-4444-4444-8444-444444444444',
      assessor: 'GRC Ekibi',
      designScore: 4,
      operatingScore: 3,
      notes: 'Örneklem kapsamı genişletilmeli.',
    },
  });

  await tx.finding.upsert({
    where: { id: '77777777-7777-4777-8777-777777777777' },
    update: {},
    create: {
      id: '77777777-7777-4777-8777-777777777777',
      tenantId,
      controlId: '44444444-4444-4444-8444-444444444444',
      riskId: '33333333-3333-4333-8333-333333333333',
      title: 'Ayrılan kullanıcı hesabı zamanında kapatılmamış',
      description: 'Bir örnek hesap SLA sonrasında aktif kalmıştır.',
      severity: RiskLevel.HIGH,
      owner: 'IAM Ekibi',
      status: RecordStatus.OPEN,
    },
  });

  await tx.audit.upsert({
    where: { id: '88888888-8888-4888-8888-888888888888' },
    update: {},
    create: {
      id: '88888888-8888-4888-8888-888888888888',
      tenantId,
      name: 'ISO 27001 İç Denetim 2026',
      type: 'INTERNAL',
      lead: 'İç Denetim',
      startsAt: new Date('2026-07-01T00:00:00.000Z'),
      endsAt: new Date('2026-09-30T23:59:59.000Z'),
      status: RecordStatus.IN_PROGRESS,
    },
  });
}

async function main() {
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`;
    await seed(tx);
  });
}

main().finally(() => prisma.$disconnect());
