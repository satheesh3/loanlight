import {
  INestApplication,
  NotFoundException,
  ValidationPipe,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { Server } from 'node:http';
import request from 'supertest';
import { LoansController } from './loans.controller';
import { LoansService } from './loans.service';
import { LoanStatus } from '../../database/models/loan.model';

const LOAN_ID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';

const mockLoan = {
  id: LOAN_ID,
  loanNumber: '214',
  status: LoanStatus.COMPLETED,
  documents: [],
  borrowers: [],
};

const mockBorrowers = [
  {
    id: 'b-uuid-1',
    name: 'John Homeowner',
    address: '123 Main St',
    incomeRecords: [
      { id: 'ir-1', year: 2024, amount: 85000, documentId: 'doc-1' },
    ],
    accountRecords: [],
  },
];

describe('/loans (e2e)', () => {
  let app: INestApplication;
  const mockLoansService = {
    findAll: jest.fn(),
    findOne: jest.fn(),
    findBorrowers: jest.fn(),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [LoansController],
      providers: [{ provide: LoansService, useValue: mockLoansService }],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ transform: true, whitelist: true }),
    );
    await app.init();
  });

  afterAll(() => app.close());
  afterEach(() => jest.clearAllMocks());

  describe('GET /loans', () => {
    it('returns 200 with an array of loans', async () => {
      mockLoansService.findAll.mockResolvedValue([mockLoan]);

      const res = await request(app.getHttpServer() as Server)
        .get('/loans')
        .expect(200);

      expect(res.body).toHaveLength(1);
      expect(res.body).toMatchObject([{ loanNumber: '214' }]);
    });

    it('returns 200 with an empty array when no loans exist', async () => {
      mockLoansService.findAll.mockResolvedValue([]);

      const res = await request(app.getHttpServer() as Server)
        .get('/loans')
        .expect(200);

      expect(res.body).toEqual([]);
    });
  });

  describe('GET /loans/:id', () => {
    it('returns 200 with the loan detail', async () => {
      mockLoansService.findOne.mockResolvedValue(mockLoan);

      const res = await request(app.getHttpServer() as Server)
        .get(`/loans/${LOAN_ID}`)
        .expect(200);

      expect(res.body).toMatchObject({
        id: LOAN_ID,
        status: LoanStatus.COMPLETED,
      });
    });

    it('returns 404 when loan is not found', async () => {
      mockLoansService.findOne.mockRejectedValue(
        new NotFoundException('Loan not found'),
      );

      await request(app.getHttpServer() as Server)
        .get(`/loans/${LOAN_ID}`)
        .expect(404);
    });

    it('returns 400 when id is not a valid UUID', async () => {
      await request(app.getHttpServer() as Server)
        .get('/loans/not-a-uuid')
        .expect(400);

      expect(mockLoansService.findOne).not.toHaveBeenCalled();
    });
  });

  describe('GET /loans/:id/borrowers', () => {
    it('returns 200 with borrowers including income records', async () => {
      mockLoansService.findBorrowers.mockResolvedValue(mockBorrowers);

      const res = await request(app.getHttpServer() as Server)
        .get(`/loans/${LOAN_ID}/borrowers`)
        .expect(200);

      expect(res.body).toHaveLength(1);
      expect(res.body).toMatchObject([
        { name: 'John Homeowner', incomeRecords: [expect.anything()] },
      ]);
    });

    it('returns 404 when loan does not exist', async () => {
      mockLoansService.findBorrowers.mockRejectedValue(
        new NotFoundException('Loan not found'),
      );

      await request(app.getHttpServer() as Server)
        .get(`/loans/${LOAN_ID}/borrowers`)
        .expect(404);
    });

    it('returns an empty array when loan has no borrowers yet', async () => {
      mockLoansService.findBorrowers.mockResolvedValue([]);

      const res = await request(app.getHttpServer() as Server)
        .get(`/loans/${LOAN_ID}/borrowers`)
        .expect(200);

      expect(res.body).toEqual([]);
    });

    it('returns 400 when id is not a valid UUID', async () => {
      await request(app.getHttpServer() as Server)
        .get('/loans/not-a-uuid/borrowers')
        .expect(400);

      expect(mockLoansService.findBorrowers).not.toHaveBeenCalled();
    });
  });
});
