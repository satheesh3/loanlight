import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { InjectQueue } from '@nestjs/bullmq';
import { plainToInstance } from 'class-transformer';
import { Queue } from 'bullmq';
import {
  Document,
  ExtractionStatus,
} from '../../database/models/document.model';
import { ExtractionEvent } from '../../database/models/extraction-event.model';
import { Loan } from '../../database/models/loan.model';
import { EXTRACTION_QUEUE } from '../ingestion/ingestion.service';
import { DocumentResponseDto } from './dto/document-response.dto';
import { modelToPlain } from '../../common/utils/model.utils';

const TO_DTO = { excludeExtraneousValues: true };

@Injectable()
export class DocumentsService {
  constructor(
    @InjectModel(Document) private documentModel: typeof Document,
    @InjectModel(ExtractionEvent) private eventModel: typeof ExtractionEvent,
    @InjectQueue(EXTRACTION_QUEUE) private queue: Queue,
  ) {}

  async findAll(loanId?: string): Promise<DocumentResponseDto[]> {
    const where = loanId ? { loanId } : {};
    const docs = await this.documentModel.findAll({
      where,
      include: [{ model: Loan, attributes: ['id', 'loanNumber'] }],
      order: [['createdAt', 'ASC']],
    });
    return plainToInstance(DocumentResponseDto, docs.map(modelToPlain), TO_DTO);
  }

  async findOne(id: string): Promise<DocumentResponseDto> {
    const doc = await this.documentModel.findByPk(id, {
      include: [
        { model: Loan, attributes: ['id', 'loanNumber'] },
        { model: ExtractionEvent, order: [['createdAt', 'DESC']], limit: 5 },
      ],
    });
    if (!doc) throw new NotFoundException(`Document ${id} not found`);
    return plainToInstance(DocumentResponseDto, modelToPlain(doc), TO_DTO);
  }

  async reExtract(
    id: string,
  ): Promise<{ queued: boolean; documentId: string }> {
    const doc = await this.documentModel.findByPk(id);
    if (!doc) throw new NotFoundException(`Document ${id} not found`);
    await doc.update({ extractionStatus: ExtractionStatus.PENDING });
    await this.queue.add('extract', { documentId: id });
    return { queued: true, documentId: id };
  }
}
