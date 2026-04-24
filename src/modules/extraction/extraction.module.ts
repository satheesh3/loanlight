import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { BullModule } from '@nestjs/bullmq';
import { ExtractionService } from './extraction.service';
import { ExtractionWorker } from './extraction.worker';
import { Document } from '../../database/models/document.model';
import { Borrower } from '../../database/models/borrower.model';
import { IncomeRecord } from '../../database/models/income-record.model';
import { AccountRecord } from '../../database/models/account-record.model';
import { ExtractionEvent } from '../../database/models/extraction-event.model';
import { Loan } from '../../database/models/loan.model';
import { StorageModule } from '../storage/storage.module';
import { EXTRACTION_QUEUE } from '../ingestion/ingestion.service';

@Module({
  imports: [
    SequelizeModule.forFeature([
      Document,
      Borrower,
      IncomeRecord,
      AccountRecord,
      ExtractionEvent,
      Loan,
    ]),
    BullModule.registerQueue({ name: EXTRACTION_QUEUE }),
    StorageModule,
  ],
  providers: [ExtractionService, ExtractionWorker],
  exports: [ExtractionService],
})
export class ExtractionModule {}
