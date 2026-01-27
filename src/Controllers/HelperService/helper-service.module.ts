import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';

import { HelperService } from './helper-service.service';

@Module({
  controllers: [],
  imports: [
    HttpModule.register({
      timeout: 5000,
      maxRedirects: 5,
    }),
  ],
  providers: [HelperService],
  exports: [HelperService],
})
export class HelperModule {}
