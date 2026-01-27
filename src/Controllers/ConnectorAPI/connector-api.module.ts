import { HttpModule } from '@nestjs/axios';
import { forwardRef, Module } from '@nestjs/common';

import { AIStudioModule } from '../AIStudio/ai-studio.module';
import { APIService } from '../APIService/api-service';
import { CachingModule } from '../Cache/cache.module';
import { ConversationCloudModule } from '../ConversationalCloud/conversation-cloud.module';
import { DatabaseModule } from '../Database/database.module';
import { HelperModule } from '../HelperService/helper-service.module';
import { SimulationModule } from '../Simulation/simulation.module';

import { ConnectorAPIController } from './connector-api.controller';
import { ConnectorAPIService } from './connector-api.service';

@Module({
  controllers: [ConnectorAPIController],
  providers: [ConnectorAPIService, APIService],
  imports: [
    CachingModule,
    forwardRef(() => DatabaseModule),
    forwardRef(() => SimulationModule),
    AIStudioModule,
    ConversationCloudModule,
    HelperModule,
    HttpModule.register({
      timeout: 5000,
      maxRedirects: 5,
    }),
  ],
  exports: [ConnectorAPIService],
})
export class ConnectorAPIModule {}
