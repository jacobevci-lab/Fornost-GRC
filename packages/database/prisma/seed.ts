import { PrismaClient, RecordStatus, RiskLevel } from '@prisma/client';

const prisma = new PrismaClient();
const tenantId = '11111111-1111-4111-8111-111111111111';

async function main() {
  await prisma.tenant.upsert({
    where: { id: tenantId },
    update: {},
    create: { id: tenantId, name: 'Örnek Teknoloji A.Ş.', slug: 'ornek-teknoloji' },
  });
  await prisma.asset.upsert({
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
}

main().finally(() => prisma.$disconnect());
