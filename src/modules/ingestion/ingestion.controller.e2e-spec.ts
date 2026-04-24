import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { Server } from 'node:http';
import request from 'supertest';
import { IngestionController } from './ingestion.controller';
import { IngestionService } from './ingestion.service';

const mockResult = {
  loansProcessed: 1,
  documentsQueued: 10,
  loans: [{ loanNumber: '214', loanId: 'loan-uuid-1', documentsQueued: 10 }],
};

describe('/ingestion (e2e)', () => {
  let app: INestApplication;
  const mockIngestionService = {
    runAll: jest.fn(),
    runLoan: jest.fn(),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [IngestionController],
      providers: [
        { provide: IngestionService, useValue: mockIngestionService },
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

  describe('POST /ingestion/run', () => {
    it('returns 201 with aggregated ingestion results', async () => {
      mockIngestionService.runAll.mockResolvedValue(mockResult);

      const res = await request(app.getHttpServer() as Server)
        .post('/ingestion/run')
        .expect(201);

      expect(res.body).toMatchObject({
        loansProcessed: 1,
        documentsQueued: 10,
        loans: [expect.anything()],
      });
    });

    it('returns 201 with zero counts when no loan folders exist', async () => {
      mockIngestionService.runAll.mockResolvedValue({
        loansProcessed: 0,
        documentsQueued: 0,
        loans: [],
      });

      const res = await request(app.getHttpServer() as Server)
        .post('/ingestion/run')
        .expect(201);

      expect(res.body).toMatchObject({ loansProcessed: 0 });
    });

    it('calls IngestionService.runAll exactly once', async () => {
      mockIngestionService.runAll.mockResolvedValue(mockResult);

      await request(app.getHttpServer() as Server).post('/ingestion/run');

      expect(mockIngestionService.runAll).toHaveBeenCalledTimes(1);
    });
  });

  describe('POST /ingestion/loans/:loanNumber', () => {
    it('returns 201 with the ingestion result for the specified loan', async () => {
      const singleResult = { loanId: 'loan-uuid-1', documentsQueued: 10 };
      mockIngestionService.runLoan.mockResolvedValue(singleResult);

      const res = await request(app.getHttpServer() as Server)
        .post('/ingestion/loans/214')
        .expect(201);

      expect(res.body).toMatchObject({
        loanId: 'loan-uuid-1',
        documentsQueued: 10,
      });
    });

    it('passes the loan number to IngestionService.runLoan', async () => {
      mockIngestionService.runLoan.mockResolvedValue({
        loanId: 'loan-1',
        documentsQueued: 5,
      });

      await request(app.getHttpServer() as Server).post('/ingestion/loans/214');

      expect(mockIngestionService.runLoan).toHaveBeenCalledWith('214');
    });

    it('returns 500 when the loan folder is not found', async () => {
      mockIngestionService.runLoan.mockRejectedValue(
        new Error('Loan folder not found: 999'),
      );

      await request(app.getHttpServer() as Server)
        .post('/ingestion/loans/999')
        .expect(500);
    });
  });
});
