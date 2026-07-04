import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Secure HTTP headers.
  app.use(helmet());

  // Global input validation (whitelist strips unknown props; DTOs enforce shape).
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );

  // Flush in-flight work on SIGTERM/SIGINT instead of dropping connections.
  app.enableShutdownHooks();

  const port = parseInt(process.env.PORT ?? '3000', 10);
  await app.listen(port);
}
void bootstrap();
