import { NestFactory, Reflector } from '@nestjs/core';
import { ClassSerializerInterceptor, ValidationPipe } from '@nestjs/common';
import { Sequelize } from 'sequelize-typescript';
import { AppModule } from './app.module';
import { ResponseValidationInterceptor } from './common/interceptors/response-validation.interceptor';
import { migrateUp } from './database/migrator';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  await migrateUp(app.get(Sequelize));
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
  app.useGlobalInterceptors(
    new ClassSerializerInterceptor(app.get(Reflector)),
    new ResponseValidationInterceptor(),
  );
  app.enableCors();
  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  console.log(`LoanLight API running on http://localhost:${port}`);
  console.log(`Queue dashboard: http://localhost:${port}/admin/queues`);
}
void bootstrap();
