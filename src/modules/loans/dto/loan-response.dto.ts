import { Expose, Exclude, Type } from 'class-transformer';
import {
  IsArray,
  IsDate,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { LoanStatus } from '../../../database/models/loan.model';
import {
  DocType,
  ExtractionStatus,
} from '../../../database/models/document.model';

@Exclude()
export class DocumentSummaryDto {
  @Expose() @IsUUID('4') id!: string;
  @Expose() @IsString() fileName!: string;
  @Expose() @IsEnum(DocType) docType!: DocType;
  @Expose() @IsEnum(ExtractionStatus) extractionStatus!: ExtractionStatus;
}

@Exclude()
export class BorrowerSummaryDto {
  @Expose() @IsUUID('4') id!: string;
  @Expose() @IsString() name!: string;
  @Expose() @IsOptional() @IsString() address!: string | null;
}

@Exclude()
export class LoanResponseDto {
  @Expose() @IsUUID('4') id!: string;
  @Expose() @IsString() loanNumber!: string;
  @Expose() @IsEnum(LoanStatus) status!: LoanStatus;
  @Expose() @IsDate() createdAt!: Date;
  @Expose() @IsDate() updatedAt!: Date;

  @Expose()
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DocumentSummaryDto)
  documents?: DocumentSummaryDto[];

  @Expose()
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BorrowerSummaryDto)
  borrowers?: BorrowerSummaryDto[];
}
