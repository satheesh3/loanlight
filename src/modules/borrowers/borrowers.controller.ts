import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { BorrowersService } from './borrowers.service';

@Controller('borrowers')
export class BorrowersController {
  constructor(private readonly borrowersService: BorrowersService) {}

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.borrowersService.findOne(id);
  }

  @Get(':id/income')
  findIncome(@Param('id', ParseUUIDPipe) id: string) {
    return this.borrowersService.findIncome(id);
  }
}
