import { Inject, Injectable } from '@nestjs/common';
import type { CreateActionDto, CreateAssessmentDto, CreateEvidenceDto, CreateRiskDto } from './dto';
import { GRC_REPOSITORY } from './grc.repository';
import type { GrcRepository, ResourceKind } from './grc.repository';

@Injectable()
export class GrcService {
  constructor(@Inject(GRC_REPOSITORY) private readonly repository: GrcRepository) {}

  async list(kind: ResourceKind, tenantId: string) {
    const items = await this.repository.list(kind, tenantId);
    return { items, total: items.length, page: 1, pageSize: 50 };
  }

  detail(kind: ResourceKind, tenantId: string, id: string) {
    return this.repository.detail(kind, tenantId, id);
  }

  createRisk(tenantId: string, input: CreateRiskDto) {
    return this.repository.createRisk(tenantId, input);
  }

  createEvidence(tenantId: string, input: CreateEvidenceDto) {
    return this.repository.createEvidence(tenantId, input);
  }

  createAssessment(tenantId: string, input: CreateAssessmentDto) {
    return this.repository.createAssessment(tenantId, input);
  }

  createAction(tenantId: string, findingId: string, input: CreateActionDto) {
    return this.repository.createAction(tenantId, findingId, input);
  }

  dashboard(tenantId: string) {
    return this.repository.dashboard(tenantId);
  }
}
