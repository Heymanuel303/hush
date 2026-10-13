import { Controller, Get } from '@nestjs/common';

// Served at /api/health once main.ts calls app.setGlobalPrefix('api'). The
// compose healthchecks, docker-smoke and the Playwright smoke test request it.
// It only proves the process answers; add a `SELECT 1` through your Prisma
// service and return 503 on failure if the deployment should notice a lost
// database.
@Controller('health')
export class HealthController {
  @Get()
  check(): { status: 'ok' } {
    return { status: 'ok' };
  }
}
