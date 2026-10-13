import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // Every route lives under /api: the Vite dev proxy, nginx and the compose healthchecks rely on it.
  app.setGlobalPrefix('api');
  app.enableShutdownHooks();
  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();
