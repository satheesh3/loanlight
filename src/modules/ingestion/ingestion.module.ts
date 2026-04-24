import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { BullModule } from '@nestjs/bullmq';
import { Loan } from '../../database/models/loan.model';
import { Document } from '../../database/models/document.model';
import { StorageModule } from '../storage/storage.module';
import { IngestionService, EXTRACTION_QUEUE } from './ingestion.service';
import { IngestionController } from './ingestion.controller';
import { DocumentClassifierService } from './document-classifier.service';

@Module({
  imports: [
    SequelizeModule.forFeature([Loan, Document]),
    BullModule.registerQueue({ name: EXTRACTION_QUEUE }),
    StorageModule,
  ],
  providers: [IngestionService, DocumentClassifierService],
  controllers: [IngestionController],
  exports: [DocumentClassifierService],
})
export class IngestionModule {}
