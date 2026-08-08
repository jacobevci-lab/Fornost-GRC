import { randomUUID } from 'node:crypto';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { EvidenceStatus, RecordStatus, RiskLevel } from '@prisma/client';
import type { Prisma } from '@prisma/client';
import type { CreateActionDto, CreateAssessmentDto, CreateEvidenceDto, CreateRiskDto } from './dto';
import { PrismaService } from '../database/prisma.service';

export const GRC_REPOSITORY = Symbol('GRC_REPOSITORY');

export type ResourceKind =
  'assets' | 'risks' | 'controls' | 'evidence' | 'assessments' | 'findings' | 'audits';

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
    return this.prisma.withTenant(tenantId, async (tx) => {
      switch (kind) {
        case 'assets':
          return tx.asset.findMany({ where: { tenantId, deletedAt: null } });
        case 'risks':
          return tx.risk.findMany({ where: { tenantId, deletedAt: null } });
        case 'controls':
          return tx.control.findMany({ where: { tenantId, deletedAt: null } });
        case 'evidence':
          return tx.evidence.findMany({ where: { tenantId, deletedAt: null } });
        case 'assessments':
          return tx.controlAssessment.findMany({ where: { tenantId } });
        case 'findings':
          return tx.finding.findMany({
            where: { tenantId, deletedAt: null },
            include: { actions: { where: { tenantId } } },
          });
        case 'audits':
          return tx.audit.findMany({ where: { tenantId, deletedAt: null } });
      }
    });
  }

  async detail(kind: ResourceKind, tenantId: string, id: string): Promise<unknown> {
    const where = { id, tenantId };
    const item = await this.prisma.withTenant(tenantId, async (tx) => {
      switch (kind) {
        case 'assets':
          return tx.asset.findFirst({ where: { ...where, deletedAt: null } });
        case 'risks':
          return tx.risk.findFirst({ where: { ...where, deletedAt: null } });
        case 'controls':
          return tx.control.findFirst({ where: { ...where, deletedAt: null } });
        case 'evidence':
          return tx.evidence.findFirst({ where: { ...where, deletedAt: null } });
        case 'assessments':
          return tx.controlAssessment.findFirst({ where });
        case 'findings':
          return tx.finding.findFirst({
            where: { ...where, deletedAt: null },
            include: { actions: { where: { tenantId } } },
          });
        case 'audits':
          return tx.audit.findFirst({ where: { ...where, deletedAt: null } });
      }
    });
    if (!item) throw new NotFoundException('Kayıt bulunamadı.');
    return item;
  }

  async createRisk(tenantId: string, input: CreateRiskDto): Promise<unknown> {
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
    return this.prisma.withTenant(tenantId, async (tx) => {
      await this.assertTenant(tx, tenantId);
      if (input.assetId) {
        const asset = await tx.asset.findFirst({
          where: { id: input.assetId, tenantId, deletedAt: null },
          select: { id: true },
        });
        if (!asset) throw new NotFoundException('Kayıt bulunamadı.');
      }
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
    const id = randomUUID();
    return this.prisma.withTenant(tenantId, async (tx) => {
      await this.assertTenant(tx, tenantId);
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
    const id = randomUUID();
    return this.prisma.withTenant(tenantId, async (tx) => {
      await this.assertTenant(tx, tenantId);
      const control = await tx.control.findFirst({
        where: { id: input.controlId, tenantId, deletedAt: null },
        select: { id: true },
      });
      if (!control) throw new NotFoundException('Kayıt bulunamadı.');
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
    const id = randomUUID();
    return this.prisma.withTenant(tenantId, async (tx) => {
      await this.assertTenant(tx, tenantId);
      const finding = await tx.finding.findFirst({
        where: { id: findingId, tenantId, deletedAt: null },
        select: { id: true },
      });
      if (!finding) throw new NotFoundException('Kayıt bulunamadı.');
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
    return this.prisma.withTenant(tenantId, async (tx) => {
      const [openRisks, criticalAssets, controls, assessedControls, openFindings] =
        await Promise.all([
          tx.risk.count({
            where: {
              tenantId,
              deletedAt: null,
              status: { notIn: [RecordStatus.CLOSED, RecordStatus.ARCHIVED] },
            },
          }),
          tx.asset.count({
            where: { tenantId, deletedAt: null, criticality: RiskLevel.CRITICAL },
          }),
          tx.control.count({ where: { tenantId, deletedAt: null } }),
          tx.control.count({
            where: { tenantId, deletedAt: null, assessments: { some: { tenantId } } },
          }),
          tx.finding.count({
            where: {
              tenantId,
              deletedAt: null,
              status: { notIn: [RecordStatus.CLOSED, RecordStatus.ARCHIVED] },
            },
          }),
        ]);
      return {
        tenantId,
        openRisks,
        criticalAssets,
        controlCoverage: controls === 0 ? 0 : Math.round((assessedControls / controls) * 100),
        openFindings,
      };
    });
  }

  private async assertTenant(tx: Prisma.TransactionClient, tenantId: string) {
    const tenant = await tx.tenant.findFirst({
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
