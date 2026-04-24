import {
  INestApplication,
  NotFoundException,
  ValidationPipe,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { Server } from 'node:http';
import request from 'supertest';
import { BorrowersController } from './borrowers.controller';
import { BorrowersService } from './borrowers.service';
import { IncomeType } from '../../database/models/income-record.model';
import { DocType } from '../../database/models/document.model';

const BORROWER_ID = 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';

const mockBorrower = {
  id: BORROWER_ID,
  loanId: 'loan-1',
  name: 'John Homeowner',
  address: '123 Main St',
  ssnLast4: null,
  incomeRecords: [],
  accountRecords: [],
};

const mockIncomeRecords = [
  {
    id: 'ir-1',
    year: 2024,
    incomeType: IncomeType.W2,
    amount: 85000,
    employer: 'Acme Corp',
    period: 'annual',
    sourceSnippet: 'Box 1: $85,000',
    document: { id: 'doc-1', fileName: 'W2 2024.pdf', docType: DocType.W2 },
  },
  {
    id: 'ir-2',
    year: 2023,
    incomeType: IncomeType.W2,
    amount: 78000,
    employer: 'Acme Corp',
    period: 'annual',
    sourceSnippet: null,
    document: {
      id: 'doc-2',
      fileName: '1040 2023.pdf',
      docType: DocType.TAX_RETURN,
    },
  },
];

describe('/borrowers (e2e)', () => {
  let app: INestApplication;
  const mockBorrowersService = {
    findOne: jest.fn(),
    findIncome: jest.fn(),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [BorrowersController],
      providers: [
        { provide: BorrowersService, useValue: mockBorrowersService },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ transform: true, whitelist: true }),
    );
    await app.init();
  });

  afterAll(() => app.close());
  afterEach(() => jest.clearAllMocks());

  describe('GET /borrowers/:id', () => {
    it('returns 200 with the borrower profile', async () => {
      mockBorrowersService.findOne.mockResolvedValue(mockBorrower);

      const res = await request(app.getHttpServer() as Server)
        .get(`/borrowers/${BORROWER_ID}`)
        .expect(200);

      expect(res.body).toMatchObject({
        id: BORROWER_ID,
        name: 'John Homeowner',
      });
    });

    it('returns 404 when borrower is not found', async () => {
      mockBorrowersService.findOne.mockRejectedValue(
        new NotFoundException(`Borrower ${BORROWER_ID} not found`),
      );

      await request(app.getHttpServer() as Server)
        .get(`/borrowers/${BORROWER_ID}`)
        .expect(404);
    });

    it('returns 400 when id is not a valid UUID', async () => {
      await request(app.getHttpServer() as Server)
        .get('/borrowers/not-a-uuid')
        .expect(400);

      expect(mockBorrowersService.findOne).not.toHaveBeenCalled();
    });

    it('includes income and account record arrays in the response', async () => {
      mockBorrowersService.findOne.mockResolvedValue({
        ...mockBorrower,
        incomeRecords: mockIncomeRecords,
      });

      const res = await request(app.getHttpServer() as Server)
        .get(`/borrowers/${BORROWER_ID}`)
        .expect(200);

      expect(res.body).toMatchObject({
        incomeRecords: expect.arrayContaining([expect.anything()]),
        accountRecords: [],
      });
      expect(res.body).toHaveProperty('incomeRecords');
      const body = res.body as { incomeRecords: unknown[] };
      expect(body.incomeRecords).toHaveLength(2);
    });
  });

  describe('GET /borrowers/:id/income', () => {
    it('returns 200 with income records including source document refs', async () => {
      mockBorrowersService.findIncome.mockResolvedValue(mockIncomeRecords);

      const res = await request(app.getHttpServer() as Server)
        .get(`/borrowers/${BORROWER_ID}/income`)
        .expect(200);

      expect(res.body).toHaveLength(2);
      expect(res.body).toMatchObject(
        expect.arrayContaining([
          expect.objectContaining({
            incomeType: IncomeType.W2,
            document: expect.objectContaining({ fileName: 'W2 2024.pdf' }),
          }),
        ]),
      );
    });

    it('returns records sorted by year descending (most recent first)', async () => {
      mockBorrowersService.findIncome.mockResolvedValue(mockIncomeRecords);

      const res = await request(app.getHttpServer() as Server)
        .get(`/borrowers/${BORROWER_ID}/income`)
        .expect(200);

      expect(res.body).toMatchObject([{ year: 2024 }, { year: 2023 }]);
    });

    it('returns 404 when borrower does not exist', async () => {
      mockBorrowersService.findIncome.mockRejectedValue(
        new NotFoundException('Borrower not found'),
      );

      await request(app.getHttpServer() as Server)
        .get(`/borrowers/${BORROWER_ID}/income`)
        .expect(404);
    });

    it('returns 200 with an empty array when borrower has no income records', async () => {
      mockBorrowersService.findIncome.mockResolvedValue([]);

      const res = await request(app.getHttpServer() as Server)
        .get(`/borrowers/${BORROWER_ID}/income`)
        .expect(200);

      expect(res.body).toEqual([]);
    });

    it('returns 400 when id is not a valid UUID', async () => {
      await request(app.getHttpServer() as Server)
        .get('/borrowers/not-a-uuid/income')
        .expect(400);

      expect(mockBorrowersService.findIncome).not.toHaveBeenCalled();
    });
  });
});
