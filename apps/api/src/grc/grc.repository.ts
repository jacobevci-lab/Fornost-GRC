import { randomUUID } from 'node:crypto';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { EvidenceStatus, RecordStatus, RiskLevel } from '@prisma/client';
import type { Prisma } from '@prisma/client';
import type { CreateActionDto, CreateAssessmentDto, CreateEvidenceDto, CreateRiskDto } from './dto';
import { PrismaService } from '../database/prisma.service';

export const GRC_REPOSITORY = Symbol('GRC_REPOSITORY');

export type ResourceKind =
  | 'assets'
  | 'risks'
  | 'controls'
  | 'evidence'
  | 'assessments'
  | 'findings'
  | 'audits';

export interface GrcRepository {
  list(kind: ResourceKind, tenantId: string): Promise<unknown[]>;
  detail(kind: ResourceKind, tenantId: string, id: string): Promise<unknown>;
  createRisk(tenantId: string, input: CreateRiskDto): Promise<unknown>;
  createEvidence(tenantId: string, input: CreateEvidenceDto): Promise<unknown>;
  createAssessment(tenantId: string, input: CreateAssessmentDto): Promise<unknown>;
  createAction(tenantId: string, findingId: string, input: CreateActionDto): Promise<unknown>;
  dashboard(tenantId: string): Promise<{
    tenantId: string;
    openRisks: number;
    criticalAssets: number;
    controlCoverage: number;
    openFindings: number;
  }>;
}

@Injectable()
export class PrismaGrcRepository implements GrcRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async list(kind: ResourceKind, tenantId: string): Promise<unknown[]> {
    switch (kind) {
      case 'assets':
        return this.prisma.asset.findMany({ where: { tenantId, deletedAt: null } });
      case 'risks':
        return this.prisma.risk.findMany({ where: { tenantId, deletedAt: null } });
      case 'controls':
        return this.prisma.control.findMany({ where: { tenantId, deletedAt: null } });
      case 'evidence':
        return this.prisma.evidence.findMany({ where: { tenantId, deletedAt: null } });
      case 'assessments':
        return this.prisma.controlAssessment.findMany({ where: { tenantId } });
      case 'findings':
        return this.prisma.finding.findMany({
          where: { tenantId, deletedAt: null },
          include: { actions: { where: { tenantId } } },
        });
      case 'audits':
        return this.prisma.audit.findMany({ where: { tenantId, deletedAt: null } });
    }
  }

  async detail(kind: ResourceKind, tenantId: string, id: string): Promise<unknown> {
    const where = { id, tenantId };
    let item: unknown;
    switch (kind) {
      case 'assets':
        item = await this.prisma.asset.findFirst({ where: { ...where, deletedAt: null } });
        break;
      case 'risks':
        item = await this.prisma.risk.findFirst({ where: { ...where, deletedAt: null } });
        break;
      case 'controls':
        item = await this.prisma.control.findFirst({ where: { ...where, deletedAt: null } });
        break;
      case 'evidence':
        item = await this.prisma.evidence.findFirst({ where: { ...where, deletedAt: null } });
        break;
      case 'assessments':
        item = await this.prisma.controlAssessment.findFirst({ where });
        break;
      case 'findings':
        item = await this.prisma.finding.findFirst({
          where: { ...where, deletedAt: null },
          include: { actions: { where: { tenantId } } },
        });
        break;
      case 'audits':
        item = await this.prisma.audit.findFirst({ where: { ...where, deletedAt: null } });
        break;
    }
    if (!item) throw new NotFoundException('Kayıt bulunamadı.');
    return item;
  }

  async createRisk(tenantId: string, input: CreateRiskDto): Promise<unknown> {
    await this.assertTenant(tenantId);
    if (input.assetId) {
      const asset = await this.prisma.asset.findFirst({
        where: { id: input.assetId, tenantId, deletedAt: null },
        select: { id: true },
      });
      if (!asset) throw new NotFoundException('Kayıt bulunamadı.');
    }
    const score = input.likelihood * input.impact;
    const level =
      score >= 15
        ? RiskLevel.CRITICAL
        : score >= 10
          ? RiskLevel.HIGH
          : score >= 5
            ? RiskLevel.MEDIUM
            : RiskLevel.LOW;
    const id = randomUUID();
    return this.prisma.$transaction(async (tx) => {
      const risk = await tx.risk.create({
        data: {
          id,
          tenantId,
          title: input.title,
          description: input.description,
          owner: input.owner,
          likelihood: input.likelihood,
          impact: input.impact,
          level,
          status: RecordStatus.OPEN,
          ...(input.assetId ? { assetId: input.assetId } : {}),
        },
      });
      await this.recordMutation(tx, tenantId, 'risk.created', 'Risk', id, {
        level,
        status: RecordStatus.OPEN,
      });
      return risk;
    });
  }

  async createEvidence(tenantId: string, input: CreateEvidenceDto): Promise<unknown> {
    await this.assertTenant(tenantId);
    const id = randomUUID();
    return this.prisma.$transaction(async (tx) => {
      const evidence = await tx.evidence.create({
        data: {
          id,
          tenantId,
          ...input,
          storageKey: `${tenantId}/${randomUUID()}`,
          status: EvidenceStatus.PENDING,
        },
      });
      await this.recordMutation(tx, tenantId, 'evidence.created', 'Evidence', id, {
        status: EvidenceStatus.PENDING,
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
      });
      return evidence;
    });
  }

  async createAssessment(tenantId: string, input: CreateAssessmentDto): Promise<unknown> {
    await this.assertTenant(tenantId);
    const control = await this.prisma.control.findFirst({
      where: { id: input.controlId, tenantId, deletedAt: null },
      select: { id: true },
    });
    if (!control) throw new NotFoundException('Kayıt bulunamadı.');
    const id = randomUUID();
    return this.prisma.$transaction(async (tx) => {
      const assessment = await tx.controlAssessment.create({
        data: { id, tenantId, ...input },
      });
      await this.recordMutation(tx, tenantId, 'assessment.created', 'ControlAssessment', id, {
        controlId: input.controlId,
      });
      return assessment;
    });
  }

  async createAction(
    tenantId: string,
    findingId: string,
    input: CreateActionDto,
  ): Promise<unknown> {
    await this.assertTenant(tenantId);
    const finding = await this.prisma.finding.findFirst({
      where: { id: findingId, tenantId, deletedAt: null },
      select: { id: true },
    });
    if (!finding) throw new NotFoundException('Kayıt bulunamadı.');
    const id = randomUUID();
    return this.prisma.$transaction(async (tx) => {
      const action = await tx.action.create({
        data: {
          id,
          tenantId,
          findingId,
          title: input.title,
          owner: input.owner,
          dueAt: new Date(input.dueAt),
          status: RecordStatus.OPEN,
        },
      });
      await this.recordMutation(tx, tenantId, 'action.created', 'Action', id, { findingId });
      return action;
    });
  }

  async dashboard(tenantId: string) {
    const [openRisks, criticalAssets, controls, assessedControls, openFindings] = await Promise.all([
      this.prisma.risk.count({
        where: { tenantId, deletedAt: null, status: { notIn: [RecordStatus.CLOSED, RecordStatus.ARCHIVED] } },
      }),
      this.prisma.asset.count({
        where: { tenantId, deletedAt: null, criticality: RiskLevel.CRITICAL },
      }),
      this.prisma.control.count({ where: { tenantId, deletedAt: null } }),
      this.prisma.control.count({
        where: { tenantId, deletedAt: null, assessments: { some: { tenantId } } },
      }),
      this.prisma.finding.count({
        where: { tenantId, deletedAt: null, status: { notIn: [RecordStatus.CLOSED, RecordStatus.ARCHIVED] } },
      }),
    ]);
    return {
      tenantId,
      openRisks,
      criticalAssets,
      controlCoverage: controls === 0 ? 0 : Math.round((assessedControls / controls) * 100),
      openFindings,
    };
  }

  private async assertTenant(tenantId: string) {
    const tenant = await this.prisma.tenant.findFirst({
      where: { id: tenantId, deletedAt: null },
      select: { id: true },
    });
    if (!tenant) throw new NotFoundException('Kayıt bulunamadı.');
  }

  private async recordMutation(
    tx: Prisma.TransactionClient,
    tenantId: string,
    eventType: string,
    resourceType: string,
    resourceId: string,
    metadata: Prisma.InputJsonValue,
  ) {
    const correlationId = randomUUID();
    await tx.auditLog.create({
      data: {
        tenantId,
        action: eventType,
        resourceType,
        resourceId,
        correlationId,
        metadata,
      },
    });
    await tx.outboxEvent.create({
      data: {
        tenantId,
        aggregateType: resourceType,
        aggregateId: resourceId,
        eventType,
        payload: { resourceId, correlationId },
      },
    });
  }
}
