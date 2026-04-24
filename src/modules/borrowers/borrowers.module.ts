import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { Borrower } from '../../database/models/borrower.model';
import { IncomeRecord } from '../../database/models/income-record.model';
import { AccountRecord } from '../../database/models/account-record.model';
import { BorrowersService } from './borrowers.service';
import { BorrowersController } from './borrowers.controller';

@Module({
  imports: [
    SequelizeModule.forFeature([Borrower, IncomeRecord, AccountRecord]),
  ],
  providers: [BorrowersService],
  controllers: [BorrowersController],
})
export class BorrowersModule {}
