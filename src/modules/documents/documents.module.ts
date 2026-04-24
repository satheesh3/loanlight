import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { BullModule } from '@nestjs/bullmq';
import { Document } from '../../database/models/document.model';
import { ExtractionEvent } from '../../database/models/extraction-event.model';
import { Loan } from '../../database/models/loan.model';
import { DocumentsService } from './documents.service';
import { DocumentsController } from './documents.controller';
import { EXTRACTION_QUEUE } from '../ingestion/ingestion.service';

@Module({
  imports: [
    SequelizeModule.forFeature([Document, ExtractionEvent, Loan]),
    BullModule.registerQueue({ name: EXTRACTION_QUEUE }),
  ],
  providers: [DocumentsService],
  controllers: [DocumentsController],
})
export class DocumentsModule {}
