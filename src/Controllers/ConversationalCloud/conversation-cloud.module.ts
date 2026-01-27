import { HttpModule } from '@nestjs/axios';
import { forwardRef, Module } from '@nestjs/common';

import { AccountConfigModule } from '../AccountConfig/account-config.module';
import { HelperModule } from '../HelperService/helper-service.module';

import { ConversationCloudService } from './conversation-cloud.service';

@Module({
  controllers: [],
  providers: [ConversationCloudService],
  imports: [
    forwardRef(() => AccountConfigModule),
    HelperModule,
    HttpModule.register({
      timeout: 5000,
      maxRedirects: 5,
    }),
  ],
  exports: [ConversationCloudService],
})
export class ConversationCloudModule {}
