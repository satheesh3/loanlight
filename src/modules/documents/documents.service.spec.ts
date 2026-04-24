import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/sequelize';
import { getQueueToken } from '@nestjs/bullmq';
import { NotFoundException } from '@nestjs/common';
import { DocumentsService } from './documents.service';
import {
  Document,
  ExtractionStatus,
  DocType,
} from '../../database/models/document.model';
import { ExtractionEvent } from '../../database/models/extraction-event.model';
import { Loan } from '../../database/models/loan.model';
import { EXTRACTION_QUEUE } from '../ingestion/ingestion.service';

const DOC_ID = 'doc-uuid-1';
const LOAN_ID = 'loan-uuid-1';

const mockDoc = {
  id: DOC_ID,
  loanId: LOAN_ID,
  fileName: 'W2 2024.pdf',
  docType: DocType.W2,
  extractionStatus: ExtractionStatus.COMPLETED,
  update: jest.fn().mockResolvedValue(undefined),
};

describe('DocumentsService', () => {
  let service: DocumentsService;
  let documentModel: Record<string, jest.Mock>;
  let queue: Record<string, jest.Mock>;

  beforeEach(async () => {
    documentModel = { findAll: jest.fn(), findByPk: jest.fn() };
    queue = { add: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DocumentsService,
        { provide: getModelToken(Document), useValue: documentModel },
        { provide: getModelToken(ExtractionEvent), useValue: {} },
        { provide: getModelToken(Loan), useValue: {} },
        { provide: getQueueToken(EXTRACTION_QUEUE), useValue: queue },
      ],
    }).compile();

    service = module.get(DocumentsService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('findAll', () => {
    it('returns all documents when no loanId is provided', async () => {
      documentModel.findAll.mockResolvedValue([mockDoc]);

      const result = await service.findAll();

      expect(result).toMatchObject([
        expect.objectContaining({
          id: DOC_ID,
          loanId: LOAN_ID,
          fileName: 'W2 2024.pdf',
          docType: DocType.W2,
          extractionStatus: ExtractionStatus.COMPLETED,
        }),
      ]);
      expect(documentModel.findAll).toHaveBeenCalledWith(
        expect.objectContaining({ where: {} }),
      );
    });

    it('filters by loanId when provided', async () => {
      documentModel.findAll.mockResolvedValue([mockDoc]);

      await service.findAll(LOAN_ID);

      expect(documentModel.findAll).toHaveBeenCalledWith(
        expect.objectContaining({ where: { loanId: LOAN_ID } }),
      );
    });

    it('orders results by createdAt ASC', async () => {
      documentModel.findAll.mockResolvedValue([]);

      await service.findAll();

      expect(documentModel.findAll).toHaveBeenCalledWith(
        expect.objectContaining({ order: [['createdAt', 'ASC']] }),
      );
    });

    it('returns an empty array when no documents match', async () => {
      documentModel.findAll.mockResolvedValue([]);

      const result = await service.findAll('unknown-loan');

      expect(result).toEqual([]);
    });
  });

  describe('findOne', () => {
    it('returns the document with loan and extraction events', async () => {
      documentModel.findByPk.mockResolvedValue(mockDoc);

      const result = await service.findOne(DOC_ID);

      expect(result).toMatchObject({
        id: DOC_ID,
        loanId: LOAN_ID,
        fileName: 'W2 2024.pdf',
        docType: DocType.W2,
        extractionStatus: ExtractionStatus.COMPLETED,
      });
      expect(documentModel.findByPk).toHaveBeenCalledWith(
        DOC_ID,
        expect.objectContaining({
          include: expect.arrayContaining([
            expect.objectContaining({ model: Loan }),
            expect.objectContaining({ model: ExtractionEvent }),
          ]),
        }),
      );
    });

    it('throws NotFoundException when document does not exist', async () => {
      documentModel.findByPk.mockResolvedValue(null);

      await expect(service.findOne('missing')).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.findOne('missing')).rejects.toThrow(
        'Document missing not found',
      );
    });
  });

  describe('reExtract', () => {
    it('resets extraction status to PENDING and enqueues a job', async () => {
      documentModel.findByPk.mockResolvedValue(mockDoc);
      queue.add.mockResolvedValue({});

      const result = await service.reExtract(DOC_ID);

      expect(mockDoc.update).toHaveBeenCalledWith({
        extractionStatus: ExtractionStatus.PENDING,
      });
      expect(queue.add).toHaveBeenCalledWith('extract', { documentId: DOC_ID });
      expect(result).toEqual({ queued: true, documentId: DOC_ID });
    });

    it('throws NotFoundException when document does not exist', async () => {
      documentModel.findByPk.mockResolvedValue(null);

      await expect(service.reExtract('missing')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('does not enqueue a job if document lookup fails', async () => {
      documentModel.findByPk.mockResolvedValue(null);

      await expect(service.reExtract('missing')).rejects.toThrow();
      expect(queue.add).not.toHaveBeenCalled();
    });
  });
});
