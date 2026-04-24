import { Controller, Param, Post, UseGuards } from '@nestjs/common';
import { ApiKeyGuard } from '../../common/guards/api-key.guard';
import { IngestionService } from './ingestion.service';

@UseGuards(ApiKeyGuard)
@Controller('ingestion')
export class IngestionController {
  constructor(private readonly ingestionService: IngestionService) {}

  @Post('run')
  runAll() {
    return this.ingestionService.runAll();
  }

  @Post('loans/:loanNumber')
  runLoan(@Param('loanNumber') loanNumber: string) {
    return this.ingestionService.runLoan(loanNumber);
  }
}
