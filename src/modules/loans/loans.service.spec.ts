import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/sequelize';
import { NotFoundException } from '@nestjs/common';
import { LoansService } from './loans.service';
import { Loan, LoanStatus } from '../../database/models/loan.model';
import { Borrower } from '../../database/models/borrower.model';
import { Document } from '../../database/models/document.model';
import { IncomeRecord } from '../../database/models/income-record.model';
import { AccountRecord } from '../../database/models/account-record.model';

const LOAN_ID = 'loan-uuid-1';

const mockLoan = {
  id: LOAN_ID,
  loanNumber: '214',
  status: LoanStatus.COMPLETED,
};

describe('LoansService', () => {
  let service: LoansService;
  let loanModel: Record<string, jest.Mock>;
  let borrowerModel: Record<string, jest.Mock>;

  beforeEach(async () => {
    loanModel = { findAll: jest.fn(), findByPk: jest.fn() };
    borrowerModel = { findAll: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LoansService,
        { provide: getModelToken(Loan), useValue: loanModel },
        { provide: getModelToken(Borrower), useValue: borrowerModel },
        { provide: getModelToken(Document), useValue: {} },
        { provide: getModelToken(IncomeRecord), useValue: {} },
        { provide: getModelToken(AccountRecord), useValue: {} },
      ],
    }).compile();

    service = module.get(LoansService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('findAll', () => {
    it('returns all loans ordered by createdAt DESC', async () => {
      loanModel.findAll.mockResolvedValue([mockLoan]);

      const result = await service.findAll();

      expect(result).toEqual([mockLoan]);
      expect(loanModel.findAll).toHaveBeenCalledWith(
        expect.objectContaining({ order: [['createdAt', 'DESC']] }),
      );
    });

    it('includes documents in the response', async () => {
      loanModel.findAll.mockResolvedValue([mockLoan]);

      await service.findAll();

      expect(loanModel.findAll).toHaveBeenCalledWith(
        expect.objectContaining({
          include: expect.arrayContaining([
            expect.objectContaining({ model: Document }),
          ]),
        }),
      );
    });

    it('returns an empty array when no loans exist', async () => {
      loanModel.findAll.mockResolvedValue([]);

      const result = await service.findAll();

      expect(result).toEqual([]);
    });
  });

  describe('findOne', () => {
    it('returns the loan when found', async () => {
      loanModel.findByPk.mockResolvedValue(mockLoan);

      const result = await service.findOne(LOAN_ID);

      expect(result).toEqual(mockLoan);
      expect(loanModel.findByPk).toHaveBeenCalledWith(
        LOAN_ID,
        expect.objectContaining({
          include: expect.arrayContaining([
            expect.objectContaining({ model: Document }),
            expect.objectContaining({ model: Borrower }),
          ]),
        }),
      );
    });

    it('throws NotFoundException when loan does not exist', async () => {
      loanModel.findByPk.mockResolvedValue(null);

      await expect(service.findOne('unknown')).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.findOne('unknown')).rejects.toThrow(
        'Loan unknown not found',
      );
    });
  });

  describe('findBorrowers', () => {
    it('returns borrowers with income and account records', async () => {
      loanModel.findByPk.mockResolvedValue(mockLoan);
      const borrowers = [
        {
          id: 'b-1',
          name: 'John Homeowner',
          incomeRecords: [],
          accountRecords: [],
        },
      ];
      borrowerModel.findAll.mockResolvedValue(borrowers);

      const result = await service.findBorrowers(LOAN_ID);

      expect(result).toEqual(borrowers);
      expect(borrowerModel.findAll).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { loanId: LOAN_ID },
          include: expect.arrayContaining([
            expect.objectContaining({ model: IncomeRecord }),
            expect.objectContaining({ model: AccountRecord }),
          ]),
        }),
      );
    });

    it('throws NotFoundException when the loan does not exist', async () => {
      loanModel.findByPk.mockResolvedValue(null);

      await expect(service.findBorrowers('no-loan')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
