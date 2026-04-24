import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { AdminAuthMiddleware } from './common/middleware/admin-auth.middleware';
import { ConfigModule } from '@nestjs/config';
import { SequelizeModule } from '@nestjs/sequelize';
import { BullModule } from '@nestjs/bullmq';
import { BullBoardModule } from '@bull-board/nestjs';
import { ExpressAdapter } from '@bull-board/express';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { databaseConfig } from './config/database.config';
import { StorageModule } from './modules/storage/storage.module';
import { ExtractionModule } from './modules/extraction/extraction.module';
import { IngestionModule } from './modules/ingestion/ingestion.module';
import { LoansModule } from './modules/loans/loans.module';
import { BorrowersModule } from './modules/borrowers/borrowers.module';
import { DocumentsModule } from './modules/documents/documents.module';
import { EXTRACTION_QUEUE } from './modules/ingestion/ingestion.service';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    SequelizeModule.forRootAsync({ useFactory: databaseConfig }),
    BullModule.forRoot({
      connection: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379', 10),
      },
    }),
    BullBoardModule.forRoot({
      route: '/admin/queues',
      adapter: ExpressAdapter,
    }),
    BullBoardModule.forFeature({
      name: EXTRACTION_QUEUE,
      adapter: BullMQAdapter,
    }),
    StorageModule,
    ExtractionModule,
    IngestionModule,
    LoansModule,
    BorrowersModule,
    DocumentsModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(AdminAuthMiddleware).forRoutes('/admin/queues*path');
  }
}
