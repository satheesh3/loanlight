import { Expose, Exclude, Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import {
  DocType,
  ExtractionStatus,
} from '../../../database/models/document.model';
import { ExtractionEventStatus } from '../../../database/models/extraction-event.model';

@Exclude()
export class LoanSummaryDto {
  @Expose() @IsUUID('4') id!: string;
  @Expose() @IsString() loanNumber!: string;
}

@Exclude()
export class ExtractionEventDto {
  @Expose() @IsUUID('4') id!: string;
  @Expose() @IsEnum(ExtractionEventStatus) status!: ExtractionEventStatus;
  @Expose() @IsOptional() @IsString() modelUsed!: string | null;
  @Expose() @IsOptional() @IsInt() inputTokens!: number | null;
  @Expose() @IsOptional() @IsInt() outputTokens!: number | null;
  @Expose() @IsOptional() @IsString() errorMessage!: string | null;
  @Expose() @IsDateString() createdAt!: Date;
}

@Exclude()
export class DocumentResponseDto {
  @Expose() @IsUUID('4') id!: string;
  @Expose() @IsUUID('4') loanId!: string;
  @Expose() @IsString() fileName!: string;
  @Expose() @IsOptional() @IsString() s3Key!: string | null;
  @Expose() @IsEnum(DocType) docType!: DocType;
  @Expose() @IsEnum(ExtractionStatus) extractionStatus!: ExtractionStatus;
  @Expose() @IsDateString() createdAt!: Date;
  @Expose() @IsDateString() updatedAt!: Date;

  @Expose()
  @IsOptional()
  @ValidateNested()
  @Type(() => LoanSummaryDto)
  loan?: LoanSummaryDto;

  @Expose()
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ExtractionEventDto)
  extractionEvents?: ExtractionEventDto[];
}
