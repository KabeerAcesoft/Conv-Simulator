import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';

import { CachingModule } from '../Cache/cache.module';
import { HelperModule } from '../HelperService/helper-service.module';

import { AccountConfigService } from './account-config.service';

@Module({
  controllers: [],
  providers: [AccountConfigService],
  imports: [
    CachingModule,
    HelperModule,
    HttpModule.register({
      timeout: 5000,
      maxRedirects: 5,
    }),
  ],
  exports: [AccountConfigService],
})
export class AccountConfigModule {}
