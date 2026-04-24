import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { Server } from 'node:http';
import request from 'supertest';
import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('/ (e2e)', () => {
  let app: INestApplication;
  const mockAppService = {
    getHello: jest.fn(),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [{ provide: AppService, useValue: mockAppService }],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ transform: true, whitelist: true }),
    );
    await app.init();
  });

  afterAll(() => app.close());
  afterEach(() => jest.clearAllMocks());

  describe('GET /', () => {
    it('returns 200 with the hello message', async () => {
      mockAppService.getHello.mockReturnValue('Hello World!');

      const res = await request(app.getHttpServer() as Server)
        .get('/')
        .expect(200);

      expect(res.text).toBe('Hello World!');
    });

    it('calls AppService.getHello exactly once', async () => {
      mockAppService.getHello.mockReturnValue('Hello World!');

      await request(app.getHttpServer() as Server).get('/');

      expect(mockAppService.getHello).toHaveBeenCalledTimes(1);
    });
  });
});
