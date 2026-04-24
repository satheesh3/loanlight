import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { LoansService } from './loans.service';

@Controller('loans')
export class LoansController {
  constructor(private readonly loansService: LoansService) {}

  @Get()
  findAll() {
    return this.loansService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.loansService.findOne(id);
  }

  @Get(':id/borrowers')
  findBorrowers(@Param('id', ParseUUIDPipe) id: string) {
    return this.loansService.findBorrowers(id);
  }
}
