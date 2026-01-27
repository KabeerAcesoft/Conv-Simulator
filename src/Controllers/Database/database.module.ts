import { HttpModule } from '@nestjs/axios';
import { forwardRef, Module } from '@nestjs/common';

import { AccountConfigModule } from '../AccountConfig/account-config.module';
import { AIStudioModule } from '../AIStudio/ai-studio.module';
import { CachingModule } from '../Cache/cache.module';
import { AppConfigurationModule } from '../Configuration/configuration.module';
import { ConnectorAPIModule } from '../ConnectorAPI/connector-api.module';
import { ConversationCloudModule } from '../ConversationalCloud/conversation-cloud.module';
import { HelperModule } from '../HelperService/helper-service.module';

import { DatabaseService } from './database.service';

@Module({
  controllers: [],
  providers: [DatabaseService],
  imports: [
    forwardRef(() => AppConfigurationModule),
    forwardRef(() => CachingModule),
    forwardRef(() => AccountConfigModule),
    ConversationCloudModule,
    AIStudioModule,
    forwardRef(() => ConnectorAPIModule),
    HelperModule,
    HttpModule.register({
      timeout: 5000,
      maxRedirects: 5,
    }),
  ],
  exports: [DatabaseService],
})
export class DatabaseModule {}
