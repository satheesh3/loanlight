import { Transform } from 'class-transformer';
import { IsOptional, IsUUID } from 'class-validator';

export class GetDocumentsQueryDto {
  @IsOptional()
  @IsUUID('4', { message: 'loanId must be a valid UUID' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : undefined,
  )
  loanId?: string;
}
