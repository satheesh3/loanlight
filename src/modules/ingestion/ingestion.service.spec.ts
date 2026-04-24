import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/sequelize';
import { getQueueToken } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import * as fs from 'fs';
import { IngestionService, EXTRACTION_QUEUE } from './ingestion.service';
import { Loan, LoanStatus } from '../../database/models/loan.model';
import {
  Document,
  ExtractionStatus,
  DocType,
} from '../../database/models/document.model';
import { StorageService } from '../storage/storage.service';
import { DocumentClassifierService } from './document-classifier.service';

jest.mock('fs');
jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

const LOAN_DOCS_PATH = '/fake/Loan Documents';

describe('IngestionService', () => {
  let service: IngestionService;
  let loanModel: Record<string, jest.Mock>;
  let documentModel: Record<string, jest.Mock>;
  let queue: Record<string, jest.Mock>;
  let storageService: Record<string, jest.Mock>;
  let classifier: Record<string, jest.Mock>;

  beforeEach(async () => {
    loanModel = { upsert: jest.fn() };
    documentModel = { upsert: jest.fn() };
    queue = { add: jest.fn() };
    storageService = { upload: jest.fn(), buildKey: jest.fn() };
    classifier = { classify: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IngestionService,
        { provide: getModelToken(Loan), useValue: loanModel },
        { provide: getModelToken(Document), useValue: documentModel },
        { provide: getQueueToken(EXTRACTION_QUEUE), useValue: queue },
        { provide: StorageService, useValue: storageService },
        { provide: DocumentClassifierService, useValue: classifier },
      ],
    }).compile();

    service = module.get(IngestionService);
    // Override the resolved loan docs path
    (service as unknown as { loanDocsPath: string }).loanDocsPath =
      LOAN_DOCS_PATH;
  });

  afterEach(() => jest.clearAllMocks());

  describe('runAll', () => {
    it('returns zero results when loan docs path does not exist', async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(false);

      const result = await service.runAll();

      expect(result.loansProcessed).toBe(0);
      expect(result.documentsQueued).toBe(0);
      expect(result.loans).toEqual([]);
    });

    it('processes each loan folder and returns aggregated counts', async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readdirSync as jest.Mock)
        .mockReturnValueOnce([
          { name: 'Loan 214', isDirectory: () => true },
        ] as any)
        .mockReturnValueOnce(['document.pdf', 'W2 2024.pdf']);
      (fs.readFileSync as jest.Mock).mockReturnValue(Buffer.from('%PDF'));

      loanModel.upsert.mockResolvedValue([{ id: 'loan-uuid-1' }]);
      documentModel.upsert.mockResolvedValue([{ id: 'doc-uuid-1' }]);
      storageService.buildKey.mockReturnValue('214/document.pdf');
      storageService.upload.mockResolvedValue('214/document.pdf');
      classifier.classify.mockReturnValue(DocType.APPLICATION);
      queue.add.mockResolvedValue({});

      const result = await service.runAll();

      expect(result.loansProcessed).toBe(1);
      expect(result.documentsQueued).toBe(2);
      expect(result.loans[0].loanNumber).toBe('214');
      expect(queue.add).toHaveBeenCalledTimes(2);
    });

    it('uploads each PDF to storage before enqueuing', async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readdirSync as jest.Mock)
        .mockReturnValueOnce([
          { name: 'Loan 214', isDirectory: () => true },
        ] as any)
        .mockReturnValueOnce(['paystub.pdf']);
      (fs.readFileSync as jest.Mock).mockReturnValue(Buffer.from('%PDF'));

      loanModel.upsert.mockResolvedValue([{ id: 'loan-1' }]);
      documentModel.upsert.mockResolvedValue([{ id: 'doc-1' }]);
      storageService.buildKey.mockReturnValue('214/paystub.pdf');
      storageService.upload.mockResolvedValue('214/paystub.pdf');
      classifier.classify.mockReturnValue(DocType.PAYSTUB);
      queue.add.mockResolvedValue({});

      await service.runAll();

      expect(storageService.upload).toHaveBeenCalledWith(
        '214/paystub.pdf',
        expect.any(Buffer),
      );
    });

    it('sets loan status to PROCESSING on upsert', async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readdirSync as jest.Mock)
        .mockReturnValueOnce([
          { name: 'Loan 214', isDirectory: () => true },
        ] as any)
        .mockReturnValueOnce([]);

      loanModel.upsert.mockResolvedValue([{ id: 'loan-1' }]);

      await service.runAll();

      expect(loanModel.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ status: LoanStatus.PROCESSING }),
      );
    });
  });

  describe('runLoan', () => {
    it('throws when the requested loan folder is not found', async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readdirSync as jest.Mock).mockReturnValueOnce([
        { name: 'Loan 214', isDirectory: () => true },
      ] as any);

      await expect(service.runLoan('999')).rejects.toThrow(
        'Loan folder not found: 999',
      );
    });

    it('ingests the matching loan folder', async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readdirSync as jest.Mock)
        .mockReturnValueOnce([
          { name: 'Loan 214', isDirectory: () => true },
        ] as any)
        .mockReturnValueOnce(['closing.pdf']);
      (fs.readFileSync as jest.Mock).mockReturnValue(Buffer.from('%PDF'));

      loanModel.upsert.mockResolvedValue([{ id: 'loan-214' }]);
      documentModel.upsert.mockResolvedValue([{ id: 'doc-1' }]);
      storageService.buildKey.mockReturnValue('214/closing.pdf');
      storageService.upload.mockResolvedValue('214/closing.pdf');
      classifier.classify.mockReturnValue(DocType.CLOSING_DISCLOSURE);
      queue.add.mockResolvedValue({});

      const result = await service.runLoan('214');

      expect(result.loanId).toBe('loan-214');
      expect(result.documentsQueued).toBe(1);
    });
  });

  describe('document classification during ingestion', () => {
    it('persists the classified docType on each document', async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readdirSync as jest.Mock)
        .mockReturnValueOnce([
          { name: 'Loan 214', isDirectory: () => true },
        ] as any)
        .mockReturnValueOnce(['W2 2024.pdf']);
      (fs.readFileSync as jest.Mock).mockReturnValue(Buffer.from('%PDF'));

      loanModel.upsert.mockResolvedValue([{ id: 'loan-1' }]);
      documentModel.upsert.mockResolvedValue([{ id: 'doc-1' }]);
      storageService.buildKey.mockReturnValue('214/W2 2024.pdf');
      storageService.upload.mockResolvedValue('214/W2 2024.pdf');
      classifier.classify.mockReturnValue(DocType.W2);
      queue.add.mockResolvedValue({});

      await service.runAll();

      expect(documentModel.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          docType: DocType.W2,
          extractionStatus: ExtractionStatus.PENDING,
        }),
      );
    });
  });
});
