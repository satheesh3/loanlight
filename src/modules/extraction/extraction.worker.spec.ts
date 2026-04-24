import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/sequelize';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { Sequelize } from 'sequelize-typescript';
import { ExtractionWorker } from './extraction.worker';
import {
  Document,
  DocType,
  ExtractionStatus,
} from '../../database/models/document.model';
import { Borrower } from '../../database/models/borrower.model';
import { IncomeRecord } from '../../database/models/income-record.model';
import { AccountRecord } from '../../database/models/account-record.model';
import {
  ExtractionEvent,
  ExtractionEventStatus,
} from '../../database/models/extraction-event.model';
import { Loan, LoanStatus } from '../../database/models/loan.model';
import { StorageService } from '../storage/storage.service';
import { ExtractionService } from './extraction.service';

jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

const PDF_BUFFER = Buffer.from('%PDF-fake');

const MOCK_EXTRACTION = {
  result: {
    borrowers: [
      { name: 'John Homeowner', address: '123 Main St', ssnLast4: '4321' },
    ],
    incomeRecords: [
      {
        borrowerName: 'John Homeowner',
        year: 2024,
        incomeType: 'w2' as const,
        amount: 85000,
        employer: 'Acme Corp',
        period: 'annual',
        sourceSnippet: 'Box 1: $85,000',
      },
    ],
    accountRecords: [
      {
        borrowerName: 'John Homeowner',
        accountType: 'checking' as const,
        accountNumber: '****1234',
        institution: 'First Bank',
        balance: 10000,
        sourceSnippet: 'Ending Balance $10,000',
      },
    ],
  },
  modelUsed: 'claude-sonnet-4-6',
  inputTokens: 1000,
  outputTokens: 300,
};

interface MockDoc {
  id: string;
  loanId: string;
  fileName: string;
  docType: DocType;
  s3Key: string;
  extractionStatus: ExtractionStatus;
  update: jest.Mock;
}

function makeDoc(overrides: Partial<MockDoc> = {}): MockDoc {
  return {
    id: 'doc-1',
    loanId: 'loan-1',
    fileName: 'W2 2024.pdf',
    docType: DocType.W2,
    s3Key: '214/W2 2024.pdf',
    extractionStatus: ExtractionStatus.PENDING,
    update: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function makeJob(documentId: string): Job<{ documentId: string }> {
  return { data: { documentId } } as Job<{ documentId: string }>;
}

describe('ExtractionWorker', () => {
  let worker: ExtractionWorker;
  let documentModel: Record<string, jest.Mock>;
  let borrowerModel: Record<string, jest.Mock>;
  let incomeRecordModel: Record<string, jest.Mock>;
  let accountRecordModel: Record<string, jest.Mock>;
  let extractionEventModel: Record<string, jest.Mock>;
  let loanModel: Record<string, jest.Mock>;
  let storageService: Record<string, jest.Mock>;
  let extractionService: Record<string, jest.Mock>;
  let sequelize: Record<string, jest.Mock>;

  beforeEach(async () => {
    documentModel = { findByPk: jest.fn(), findAll: jest.fn() };
    borrowerModel = { findOrCreate: jest.fn() };
    incomeRecordModel = { create: jest.fn(), destroy: jest.fn().mockResolvedValue(0) };
    accountRecordModel = { create: jest.fn(), destroy: jest.fn().mockResolvedValue(0) };
    extractionEventModel = { create: jest.fn() };
    loanModel = { update: jest.fn() };
    storageService = { download: jest.fn() };
    extractionService = { extractFromPdf: jest.fn() };

    sequelize = {
      transaction: jest
        .fn()
        .mockImplementation((fn: (t: any) => Promise<void>) => fn({})),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExtractionWorker,
        { provide: getModelToken(Document), useValue: documentModel },
        { provide: getModelToken(Borrower), useValue: borrowerModel },
        { provide: getModelToken(IncomeRecord), useValue: incomeRecordModel },
        { provide: getModelToken(AccountRecord), useValue: accountRecordModel },
        {
          provide: getModelToken(ExtractionEvent),
          useValue: extractionEventModel,
        },
        { provide: getModelToken(Loan), useValue: loanModel },
        { provide: StorageService, useValue: storageService },
        { provide: ExtractionService, useValue: extractionService },
        { provide: Sequelize, useValue: sequelize },
      ],
    }).compile();

    worker = module.get(ExtractionWorker);
  });

  afterEach(() => jest.clearAllMocks());

  describe('process', () => {
    it('throws when document is not found', async () => {
      documentModel.findByPk.mockResolvedValue(null);

      await expect(worker.process(makeJob('missing'))).rejects.toThrow(
        'Document not found: missing',
      );
    });

    it('downloads PDF, calls extraction, and persists all entities in a transaction', async () => {
      const doc = makeDoc();
      documentModel.findByPk.mockResolvedValue(doc);
      storageService.download.mockResolvedValue(PDF_BUFFER);
      extractionService.extractFromPdf.mockResolvedValue(MOCK_EXTRACTION);

      const mockBorrower = {
        id: 'borrower-1',
        address: null,
        update: jest.fn(),
      };
      borrowerModel.findOrCreate.mockResolvedValue([mockBorrower, true]);
      incomeRecordModel.create.mockResolvedValue({});
      accountRecordModel.create.mockResolvedValue({});
      extractionEventModel.create.mockResolvedValue({});
      documentModel.findAll.mockResolvedValue([
        { extractionStatus: ExtractionStatus.COMPLETED },
      ]);
      loanModel.update.mockResolvedValue([1]);

      await worker.process(makeJob('doc-1'));

      expect(storageService.download).toHaveBeenCalledWith('214/W2 2024.pdf');
      expect(extractionService.extractFromPdf).toHaveBeenCalledWith(
        PDF_BUFFER,
        DocType.W2,
        'W2 2024.pdf',
      );
      expect(borrowerModel.findOrCreate).toHaveBeenCalledTimes(
        1 + // from borrowers loop
          1 + // from incomeRecords loop
          1, // from accountRecords loop
      );
      expect(incomeRecordModel.create).toHaveBeenCalledTimes(1);
      expect(accountRecordModel.create).toHaveBeenCalledTimes(1);
      expect(doc.update).toHaveBeenCalledWith(
        { extractionStatus: ExtractionStatus.COMPLETED },
        expect.anything(),
      );
      expect(extractionEventModel.create).toHaveBeenCalledWith(
        expect.objectContaining({ status: ExtractionEventStatus.SUCCESS }),
        expect.anything(),
      );
    });

    it('logs ExtractionEvent with token counts on success', async () => {
      const doc = makeDoc();
      documentModel.findByPk.mockResolvedValue(doc);
      storageService.download.mockResolvedValue(PDF_BUFFER);
      extractionService.extractFromPdf.mockResolvedValue(MOCK_EXTRACTION);

      const mockBorrower = { id: 'b-1', address: null, update: jest.fn() };
      borrowerModel.findOrCreate.mockResolvedValue([mockBorrower, true]);
      incomeRecordModel.create.mockResolvedValue({});
      accountRecordModel.create.mockResolvedValue({});
      extractionEventModel.create.mockResolvedValue({});
      documentModel.findAll.mockResolvedValue([
        { extractionStatus: ExtractionStatus.COMPLETED },
      ]);
      loanModel.update.mockResolvedValue([1]);

      await worker.process(makeJob('doc-1'));

      expect(extractionEventModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          modelUsed: 'claude-sonnet-4-6',
          inputTokens: 1000,
          outputTokens: 300,
          status: ExtractionEventStatus.SUCCESS,
        }),
        expect.anything(),
      );
    });

    it('marks document as failed and logs ExtractionEvent on error', async () => {
      const doc = makeDoc();
      documentModel.findByPk.mockResolvedValue(doc);
      storageService.download.mockRejectedValue(new Error('S3 error'));
      extractionEventModel.create.mockResolvedValue({});

      await expect(worker.process(makeJob('doc-1'))).rejects.toThrow(
        'S3 error',
      );

      expect(doc.update).toHaveBeenCalledWith({
        extractionStatus: ExtractionStatus.FAILED,
      });
      expect(extractionEventModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          status: ExtractionEventStatus.FAILED,
          errorMessage: 'S3 error',
        }),
      );
    });

    it('sets loan status to COMPLETED when all docs succeed', async () => {
      const doc = makeDoc();
      documentModel.findByPk.mockResolvedValue(doc);
      storageService.download.mockResolvedValue(PDF_BUFFER);
      extractionService.extractFromPdf.mockResolvedValue({
        ...MOCK_EXTRACTION,
        result: { borrowers: [], incomeRecords: [], accountRecords: [] },
      });
      extractionEventModel.create.mockResolvedValue({});
      documentModel.findAll.mockResolvedValue([
        { extractionStatus: ExtractionStatus.COMPLETED },
        { extractionStatus: ExtractionStatus.COMPLETED },
      ]);
      loanModel.update.mockResolvedValue([1]);

      await worker.process(makeJob('doc-1'));

      expect(loanModel.update).toHaveBeenCalledWith(
        { status: LoanStatus.COMPLETED },
        { where: { id: 'loan-1' } },
      );
    });

    it('sets loan status to FAILED when any doc fails', async () => {
      const doc = makeDoc();
      documentModel.findByPk.mockResolvedValue(doc);
      storageService.download.mockResolvedValue(PDF_BUFFER);
      extractionService.extractFromPdf.mockResolvedValue({
        ...MOCK_EXTRACTION,
        result: { borrowers: [], incomeRecords: [], accountRecords: [] },
      });
      extractionEventModel.create.mockResolvedValue({});
      documentModel.findAll.mockResolvedValue([
        { extractionStatus: ExtractionStatus.COMPLETED },
        { extractionStatus: ExtractionStatus.FAILED },
      ]);
      loanModel.update.mockResolvedValue([1]);

      await worker.process(makeJob('doc-1'));

      expect(loanModel.update).toHaveBeenCalledWith(
        { status: LoanStatus.FAILED },
        { where: { id: 'loan-1' } },
      );
    });

    it('skips borrowers with empty names', async () => {
      const doc = makeDoc();
      documentModel.findByPk.mockResolvedValue(doc);
      storageService.download.mockResolvedValue(PDF_BUFFER);
      extractionService.extractFromPdf.mockResolvedValue({
        ...MOCK_EXTRACTION,
        result: {
          borrowers: [{ name: '' }, { name: '   ' }],
          incomeRecords: [],
          accountRecords: [],
        },
      });
      extractionEventModel.create.mockResolvedValue({});
      documentModel.findAll.mockResolvedValue([
        { extractionStatus: ExtractionStatus.COMPLETED },
      ]);
      loanModel.update.mockResolvedValue([1]);

      await worker.process(makeJob('doc-1'));

      expect(borrowerModel.findOrCreate).not.toHaveBeenCalled();
    });
  });
});
