import { Global, Logger, Module } from '@nestjs/common';
import { APP_CONFIG, loadConfig } from './config.js';

@Global()
@Module({
  providers: [
    {
      provide: APP_CONFIG,
      // A factory, so every app boot reads the environment afresh.
      useFactory: () => loadConfig(process.env, (m) => new Logger('Config').warn(m)),
    },
  ],
  exports: [APP_CONFIG],
})
export class ConfigModule {}
