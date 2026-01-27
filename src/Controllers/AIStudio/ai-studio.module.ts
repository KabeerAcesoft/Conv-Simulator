import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';

import { HelperModule } from '../HelperService/helper-service.module';

import { AIStudioService } from './ai-studio.service';

@Module({
  controllers: [],
  providers: [AIStudioService],
  imports: [
    HelperModule,
    HttpModule.register({
      timeout: 10000,
      maxRedirects: 5,
    }),
  ],
  exports: [AIStudioService],
})
export class AIStudioModule {}
