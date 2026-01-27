import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';

import { AccountConfigModule } from 'src/Controllers/AccountConfig/account-config.module';
import { HelperModule } from 'src/Controllers/HelperService/helper-service.module';

@Module({
  imports: [
    PassportModule,
    HttpModule.register({
      timeout: 5000,
      maxRedirects: 5,
    }),
    AccountConfigModule,
    HelperModule,
  ],
  providers: [],
})
export class AuthModule {}
