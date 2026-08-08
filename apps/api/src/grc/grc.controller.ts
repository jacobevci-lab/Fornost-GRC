import { Body, Controller, Get, Inject, Param, Post } from '@nestjs/common';
import { ApiHeader, ApiTags } from '@nestjs/swagger';
import { TenantId } from '../common/tenant';
import { Public, RequirePermissions } from '../identity/identity.decorators';
import type { CreateActionDto, CreateAssessmentDto, CreateEvidenceDto, CreateRiskDto } from './dto';
import { GrcService } from './grc.service';

@ApiTags('GRC')
@ApiHeader({ name: 'x-tenant-id', required: true })
@Controller()
export class GrcController {
  constructor(@Inject(GrcService) private readonly grc: GrcService) {}
  @Public()
  @Get('health') health() {
    return { status: 'ok' };
  }
  @RequirePermissions('dashboard:read')
  @Get('dashboard') dashboard(@TenantId() tenantId: string) {
    return this.grc.dashboard(tenantId);
  }
  @RequirePermissions('grc:read')
  @Get(':resource') list(@TenantId() tenantId: string, @Param('resource') resource: string) {
    return this.grc.list(this.kind(resource), tenantId);
  }
  @RequirePermissions('grc:read')
  @Get(':resource/:id') detail(
    @TenantId() tenantId: string,
    @Param('resource') resource: string,
    @Param('id') id: string,
  ) {
    return this.grc.detail(this.kind(resource), tenantId, id);
  }
  @RequirePermissions('risk:write')
  @Post('risks') createRisk(@TenantId() tenantId: string, @Body() input: CreateRiskDto) {
    return this.grc.createRisk(tenantId, input);
  }
  @RequirePermissions('evidence:write')
  @Post('evidence') createEvidence(@TenantId() tenantId: string, @Body() input: CreateEvidenceDto) {
    return this.grc.createEvidence(tenantId, input);
  }
  @RequirePermissions('assessment:write')
  @Post('assessments') createAssessment(
    @TenantId() tenantId: string,
    @Body() input: CreateAssessmentDto,
  ) {
    return this.grc.createAssessment(tenantId, input);
  }
  @RequirePermissions('finding:write')
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
