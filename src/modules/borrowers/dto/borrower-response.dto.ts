import { Expose, Exclude, Type, Transform } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsNumber,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { IncomeType } from '../../../database/models/income-record.model';
import { AccountType } from '../../../database/models/account-record.model';

@Exclude()
export class SourceDocumentDto {
  @Expose() @IsUUID('4') id!: string;
  @Expose() @IsString() fileName!: string;
  @Expose() @IsString() docType!: string;
}

@Exclude()
export class IncomeRecordResponseDto {
  @Expose() @IsUUID('4') id!: string;
  @Expose() @IsOptional() @IsInt() year!: number | null;
  @Expose() @IsEnum(IncomeType) incomeType!: IncomeType;
  @Expose() @Transform(({ value }) => (value != null ? parseFloat(value) : value)) @IsNumber() amount!: number;
  @Expose() @IsOptional() @IsString() employer!: string | null;
  @Expose() @IsOptional() @IsString() period!: string | null;
  @Expose() @IsOptional() @IsString() sourceSnippet!: string | null;

  @Expose()
  @ValidateNested()
  @Type(() => SourceDocumentDto)
  document!: SourceDocumentDto;
}

@Exclude()
export class AccountRecordResponseDto {
  @Expose() @IsUUID('4') id!: string;
  @Expose() @IsEnum(AccountType) accountType!: AccountType;
  @Expose() @IsOptional() @IsString() accountNumber!: string | null;
  @Expose() @IsOptional() @IsString() institution!: string | null;
  @Expose() @Transform(({ value }) => (value != null ? parseFloat(value) : value)) @IsOptional() @IsNumber() balance!: number | null;
  @Expose() @IsOptional() @IsString() sourceSnippet!: string | null;

  @Expose()
  @ValidateNested()
  @Type(() => SourceDocumentDto)
  document!: SourceDocumentDto;
}

@Exclude()
export class BorrowerResponseDto {
  @Expose() @IsUUID('4') id!: string;
  @Expose() @IsUUID('4') loanId!: string;
  @Expose() @IsString() name!: string;
  @Expose() @IsOptional() @IsString() address!: string | null;
  @Expose() @IsOptional() @IsString() ssnLast4!: string | null;

  @Expose()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => IncomeRecordResponseDto)
  incomeRecords!: IncomeRecordResponseDto[];

  @Expose()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AccountRecordResponseDto)
  accountRecords!: AccountRecordResponseDto[];
}
