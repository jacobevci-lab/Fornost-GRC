import { ApiProperty } from '@nestjs/swagger';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateRiskDto {
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(160) title!: string;
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(2000) description!: string;
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(120) owner!: string;
  @ApiProperty() @IsInt() @Min(1) @Max(5) likelihood!: number;
  @ApiProperty() @IsInt() @Min(1) @Max(5) impact!: number;
  @ApiProperty({ required: false }) @IsOptional() @IsUUID('4') assetId?: string;
}

export class CreateEvidenceDto {
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(160) name!: string;
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(255) fileName!: string;
  @ApiProperty({ enum: ['application/pdf', 'image/png', 'image/jpeg', 'text/csv'] })
  @IsIn(['application/pdf', 'image/png', 'image/jpeg', 'text/csv'])
  mimeType!: string;
  @ApiProperty({ maximum: 26214400 }) @IsInt() @Min(1) @Max(26_214_400) sizeBytes!: number;
}

export class CreateAssessmentDto {
  @ApiProperty() @IsUUID('4') controlId!: string;
  @ApiProperty() @IsString() @MaxLength(120) assessor!: string;
  @ApiProperty() @IsInt() @Min(0) @Max(5) designScore!: number;
  @ApiProperty() @IsInt() @Min(0) @Max(5) operatingScore!: number;
  @ApiProperty({ required: false }) @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}

export class CreateActionDto {
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(200) title!: string;
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(120) owner!: string;
  @ApiProperty() @IsString() @IsNotEmpty() dueAt!: string;
}
