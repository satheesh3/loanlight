import { Expose, Exclude, Type } from 'class-transformer';

@Exclude()
export class LoanIngestionResultDto {
  @Expose() loanNumber!: string;
  @Expose() loanId!: string;
  @Expose() documentsQueued!: number;
}

@Exclude()
export class IngestionRunResultDto {
  @Expose() loansProcessed!: number;
  @Expose() documentsQueued!: number;

  @Expose()
  @Type(() => LoanIngestionResultDto)
  loans!: LoanIngestionResultDto[];
}
