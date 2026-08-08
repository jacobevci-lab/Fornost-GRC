import { Body, Controller, Get, Inject, Param, Post } from '@nestjs/common';
import { ApiHeader, ApiTags } from '@nestjs/swagger';
import { TenantId } from '../common/tenant';
import type { CreateActionDto, CreateAssessmentDto, CreateEvidenceDto, CreateRiskDto } from './dto';
import { GrcService } from './grc.service';

@ApiTags('GRC')
@ApiHeader({ name: 'x-tenant-id', required: true })
@Controller()
export class GrcController {
  constructor(@Inject(GrcService) private readonly grc: GrcService) {}
  @Get('health') health() {
    return { status: 'ok' };
  }
  @Get('dashboard') dashboard(@TenantId() tenantId: string) {
    return this.grc.dashboard(tenantId);
  }
  @Get(':resource') list(@TenantId() tenantId: string, @Param('resource') resource: string) {
    return this.grc.list(this.kind(resource), tenantId);
  }
  @Get(':resource/:id') detail(
    @TenantId() tenantId: string,
    @Param('resource') resource: string,
    @Param('id') id: string,
  ) {
    return this.grc.detail(this.kind(resource), tenantId, id);
  }
  @Post('risks') createRisk(@TenantId() tenantId: string, @Body() input: CreateRiskDto) {
    return this.grc.createRisk(tenantId, input);
  }
  @Post('evidence') createEvidence(@TenantId() tenantId: string, @Body() input: CreateEvidenceDto) {
    return this.grc.createEvidence(tenantId, input);
  }
  @Post('assessments') createAssessment(
    @TenantId() tenantId: string,
    @Body() input: CreateAssessmentDto,
  ) {
    return this.grc.createAssessment(tenantId, input);
  }
  @Post('findings/:id/actions') createAction(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() input: CreateActionDto,
  ) {
    return this.grc.createAction(tenantId, id, input);
  }
  private kind(
    resource: string,
  ): 'assets' | 'risks' | 'controls' | 'evidence' | 'assessments' | 'findings' | 'audits' {
    const supported = [
      'assets',
      'risks',
      'controls',
      'evidence',
      'assessments',
      'findings',
      'audits',
    ] as const;
    if (!supported.includes(resource as (typeof supported)[number]))
      throw new Error('Desteklenmeyen kaynak.');
    return resource as (typeof supported)[number];
  }
}
