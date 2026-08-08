import { randomUUID } from 'node:crypto';
import { BadRequestException, ValidationPipe, VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { ApiExceptionFilter } from './common/api-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.use(helmet({ contentSecurityPolicy: false }));
  app.enableCors({
    origin: (process.env.CORS_ORIGINS ?? 'http://localhost:3000').split(','),
    methods: ['GET', 'POST', 'PATCH'],
    allowedHeaders: ['content-type', 'authorization', 'x-tenant-id', 'x-correlation-id'],
  });
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: (errors) => new BadRequestException({ code: 'VALIDATION_ERROR', errors }),
    }),
  );
  app.useGlobalFilters(new ApiExceptionFilter());
  const swagger = new DocumentBuilder()
    .setTitle('CISO-GRC API')
    .setVersion('0.1.0')
    .addApiKey({ type: 'apiKey', name: 'x-tenant-id', in: 'header' }, 'tenant')
    .build();
  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, swagger));
  app.use(
    (
      request: { headers: Record<string, string> },
      response: { setHeader: (key: string, value: string) => void },
      next: () => void,
    ) => {
      const correlationId = request.headers['x-correlation-id'] || randomUUID();
      request.headers['x-correlation-id'] = correlationId;
      response.setHeader('x-correlation-id', correlationId);
      next();
    },
  );
  await app.listen(Number(process.env.API_PORT ?? 3001));
}

void bootstrap();

