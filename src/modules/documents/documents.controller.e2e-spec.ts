import {
  INestApplication,
  NotFoundException,
  ValidationPipe,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { Server } from 'node:http';
import request from 'supertest';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';
import {
  DocType,
  ExtractionStatus,
} from '../../database/models/document.model';

const DOC_ID = 'd0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
const LOAN_ID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';

const mockDoc = {
  id: DOC_ID,
  loanId: LOAN_ID,
  fileName: 'W2 2024.pdf',
  docType: DocType.W2,
  extractionStatus: ExtractionStatus.COMPLETED,
  loan: { id: LOAN_ID, loanNumber: '214' },
  extractionEvents: [],
};

describe('/documents (e2e)', () => {
  let app: INestApplication;
  const mockDocumentsService = {
    findAll: jest.fn(),
    findOne: jest.fn(),
    reExtract: jest.fn(),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [DocumentsController],
      providers: [
        { provide: DocumentsService, useValue: mockDocumentsService },
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

  describe('GET /documents', () => {
    it('returns 200 with all documents', async () => {
      mockDocumentsService.findAll.mockResolvedValue([mockDoc]);

      const res = await request(app.getHttpServer() as Server)
        .get('/documents')
        .expect(200);

      expect(res.body).toHaveLength(1);
      expect(res.body).toMatchObject([{ fileName: 'W2 2024.pdf' }]);
      expect(mockDocumentsService.findAll).toHaveBeenCalledWith(undefined);
    });

    it('filters by loanId when a valid UUID is provided', async () => {
      mockDocumentsService.findAll.mockResolvedValue([mockDoc]);

      await request(app.getHttpServer() as Server)
        .get(`/documents?loanId=${LOAN_ID}`)
        .expect(200);

      expect(mockDocumentsService.findAll).toHaveBeenCalledWith(LOAN_ID);
    });

    it('returns 400 when loanId is not a valid UUID', async () => {
      await request(app.getHttpServer() as Server)
        .get('/documents?loanId=not-a-uuid')
        .expect(400);

      expect(mockDocumentsService.findAll).not.toHaveBeenCalled();
    });

    it('returns 200 with an empty array when no documents exist', async () => {
      mockDocumentsService.findAll.mockResolvedValue([]);

      const res = await request(app.getHttpServer() as Server)
        .get('/documents')
        .expect(200);

      expect(res.body).toEqual([]);
    });
  });

  describe('GET /documents/:id', () => {
    it('returns 200 with document detail and extraction events', async () => {
      mockDocumentsService.findOne.mockResolvedValue(mockDoc);

      const res = await request(app.getHttpServer() as Server)
        .get(`/documents/${DOC_ID}`)
        .expect(200);

      expect(res.body).toMatchObject({
        id: DOC_ID,
        docType: DocType.W2,
        extractionStatus: ExtractionStatus.COMPLETED,
      });
    });

    it('returns 404 when document does not exist', async () => {
      mockDocumentsService.findOne.mockRejectedValue(
        new NotFoundException(`Document ${DOC_ID} not found`),
      );

      await request(app.getHttpServer() as Server)
        .get(`/documents/${DOC_ID}`)
        .expect(404);
    });

    it('returns 400 when id is not a valid UUID', async () => {
      await request(app.getHttpServer() as Server)
        .get('/documents/not-a-uuid')
        .expect(400);

      expect(mockDocumentsService.findOne).not.toHaveBeenCalled();
    });
  });

  describe('POST /documents/:id/re-extract', () => {
    it('returns 201 with queued status', async () => {
      mockDocumentsService.reExtract.mockResolvedValue({
        queued: true,
        documentId: DOC_ID,
      });

      const res = await request(app.getHttpServer() as Server)
        .post(`/documents/${DOC_ID}/re-extract`)
        .expect(201);

      expect(res.body).toMatchObject({ queued: true, documentId: DOC_ID });
      expect(mockDocumentsService.reExtract).toHaveBeenCalledWith(DOC_ID);
    });

    it('returns 404 when document does not exist', async () => {
      mockDocumentsService.reExtract.mockRejectedValue(
        new NotFoundException('Document not found'),
      );

      await request(app.getHttpServer() as Server)
        .post(`/documents/${DOC_ID}/re-extract`)
        .expect(404);
    });

    it('returns 400 when id is not a valid UUID', async () => {
      await request(app.getHttpServer() as Server)
        .post('/documents/not-a-uuid/re-extract')
        .expect(400);

      expect(mockDocumentsService.reExtract).not.toHaveBeenCalled();
    });
  });
});
