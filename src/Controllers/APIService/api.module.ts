import { HttpModule } from '@nestjs/axios';
import { Global, Module } from '@nestjs/common';

import { AccountConfigModule } from '../AccountConfig/account-config.module';
import { HelperModule } from '../HelperService/helper-service.module';

import { APIService } from './api-service';

@Global()
@Module({
  controllers: [],
  providers: [APIService],
  imports: [
    AccountConfigModule,
    HelperModule,
    HttpModule.register({
      timeout: 5000,
      maxRedirects: 5,
    }),
  ],
  exports: [APIService],
})
export class APIModule {}
