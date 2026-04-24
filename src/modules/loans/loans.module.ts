import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { Loan } from '../../database/models/loan.model';
import { Borrower } from '../../database/models/borrower.model';
import { Document } from '../../database/models/document.model';
import { IncomeRecord } from '../../database/models/income-record.model';
import { AccountRecord } from '../../database/models/account-record.model';
import { LoansService } from './loans.service';
import { LoansController } from './loans.controller';

@Module({
  imports: [
    SequelizeModule.forFeature([
      Loan,
      Borrower,
      Document,
      IncomeRecord,
      AccountRecord,
    ]),
  ],
  providers: [LoansService],
  controllers: [LoansController],
})
export class LoansModule {}
