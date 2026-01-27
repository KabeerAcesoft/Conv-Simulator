import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';

import { AccountConfigModule } from '../AccountConfig/account-config.module';
import { AIStudioModule } from '../AIStudio/ai-studio.module';
import { CachingModule } from '../Cache/cache.module';
import { AppConfigurationModule } from '../Configuration/configuration.module';
import { ConnectorAPIModule } from '../ConnectorAPI/connector-api.module';
import { ConversationCloudModule } from '../ConversationalCloud/conversation-cloud.module';
import { DatabaseModule } from '../Database/database.module';
import { SimulationModule } from '../Simulation/simulation.module';

import { MessageResponderService } from './schedule.responder.service';
import { ServiceWorkerService } from './schedule.service-worker.service';

@Module({
  controllers: [],
  imports: [
    HttpModule.register({
      timeout: 5000,
      maxRedirects: 5,
    }),
    ConnectorAPIModule,
    SimulationModule,
    AIStudioModule,
    AccountConfigModule,
    DatabaseModule,
    ConversationCloudModule,
    CachingModule,
    AppConfigurationModule,
  ],
  providers: [ServiceWorkerService, MessageResponderService],
  exports: [ServiceWorkerService, MessageResponderService],
})
export class SchedulingModule {}
