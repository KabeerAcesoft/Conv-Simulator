import { HttpModule } from '@nestjs/axios';
import { forwardRef, Module } from '@nestjs/common';

import { AccountConfigModule } from '../AccountConfig/account-config.module';
import { AIStudioModule } from '../AIStudio/ai-studio.module';
import { CachingModule } from '../Cache/cache.module';
import { AppConfigurationModule } from '../Configuration/configuration.module';
import { ConnectorAPIModule } from '../ConnectorAPI/connector-api.module';
import { ConversationCloudModule } from '../ConversationalCloud/conversation-cloud.module';
import { DatabaseModule } from '../Database/database.module';
import { HelperModule } from '../HelperService/helper-service.module';

import { AIStudioConversationHandler } from './handlers/ai-studio-conversation.handler';
import { BaseConversationCreator } from './handlers/base-conversation-creator';
import { InternalConversationHandler } from './handlers/internal-conversation.handler';
import { AnalysisService } from './reports/analysis.service';
import { SimulatorController } from './simulation.controller';
import { SimulationService } from './simulation.service';

@Module({
  controllers: [SimulatorController],
  providers: [
    SimulationService,
    AnalysisService,
    BaseConversationCreator,
    AIStudioConversationHandler,
    InternalConversationHandler,
  ],
  imports: [
    CachingModule,
    forwardRef(() => AppConfigurationModule),
    forwardRef(() => AccountConfigModule),
    ConversationCloudModule,
    AIStudioModule,
    forwardRef(() => ConnectorAPIModule),
    HelperModule,
    forwardRef(() => DatabaseModule),
    HttpModule.register({
      timeout: 5000,
      maxRedirects: 5,
    }),
  ],
  exports: [SimulationService, AnalysisService],
})
export class SimulationModule {}
