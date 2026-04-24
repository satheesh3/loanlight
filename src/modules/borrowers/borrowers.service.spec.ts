import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/sequelize';
import { NotFoundException } from '@nestjs/common';
import { BorrowersService } from './borrowers.service';
import { Borrower } from '../../database/models/borrower.model';
import { IncomeRecord } from '../../database/models/income-record.model';
import { AccountRecord } from '../../database/models/account-record.model';
import { Document } from '../../database/models/document.model';

const BORROWER_ID = 'borrower-uuid-1';

const mockBorrower = {
  id: BORROWER_ID,
  loanId: 'loan-1',
  name: 'John Homeowner',
  address: '123 Main St',
  ssnLast4: '4321',
};

describe('BorrowersService', () => {
  let service: BorrowersService;
  let borrowerModel: Record<string, jest.Mock>;

  beforeEach(async () => {
    borrowerModel = { findByPk: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BorrowersService,
        { provide: getModelToken(Borrower), useValue: borrowerModel },
        { provide: getModelToken(IncomeRecord), useValue: {} },
        { provide: getModelToken(AccountRecord), useValue: {} },
      ],
    }).compile();

    service = module.get(BorrowersService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('findOne', () => {
    it('returns the borrower with income and account records', async () => {
      borrowerModel.findByPk.mockResolvedValue(mockBorrower);

      const result = await service.findOne(BORROWER_ID);

      expect(result).toEqual(mockBorrower);
      expect(borrowerModel.findByPk).toHaveBeenCalledWith(
        BORROWER_ID,
        expect.objectContaining({
          include: expect.arrayContaining([
            expect.objectContaining({ model: IncomeRecord }),
            expect.objectContaining({ model: AccountRecord }),
          ]),
        }),
      );
    });

    it('throws NotFoundException when borrower does not exist', async () => {
      borrowerModel.findByPk.mockResolvedValue(null);

      await expect(service.findOne('missing')).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.findOne('missing')).rejects.toThrow(
        'Borrower missing not found',
      );
    });

    it('includes nested source document on income records', async () => {
      borrowerModel.findByPk.mockResolvedValue(mockBorrower);

      await service.findOne(BORROWER_ID);

      type IncludeOption = {
        model: unknown;
        include?: Array<{ model: unknown }>;
      };
      const callArg = (
        borrowerModel.findByPk.mock.calls[0] as unknown[]
      )[1] as {
        include: IncludeOption[];
      };
      const incomeInclude = callArg.include.find(
        (i) => i.model === IncomeRecord,
      );
      expect(incomeInclude?.include).toEqual(
        expect.arrayContaining([expect.objectContaining({ model: Document })]),
      );
    });
  });

  describe('findIncome', () => {
    it('throws NotFoundException when borrower does not exist', async () => {
      borrowerModel.findByPk.mockResolvedValue(null);

      await expect(service.findIncome('missing')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('returns income records for a valid borrower', async () => {
      borrowerModel.findByPk.mockResolvedValue(mockBorrower);

      const findAllSpy = jest
        .spyOn(IncomeRecord, 'findAll')
        .mockResolvedValue([]);

      const result = await service.findIncome(BORROWER_ID);

      expect(result).toEqual([]);
      expect(findAllSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { borrowerId: BORROWER_ID },
          order: [['year', 'DESC']],
        }),
      );

      findAllSpy.mockRestore();
    });
  });
});
