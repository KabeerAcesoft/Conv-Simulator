import { HttpModule } from '@nestjs/axios';
import { forwardRef, Module } from '@nestjs/common';

import { AccountConfigModule } from '../AccountConfig/account-config.module';
import { AIStudioModule } from '../AIStudio/ai-studio.module';
import { CachingModule } from '../Cache/cache.module';
import { DatabaseModule } from '../Database/database.module';
import { HelperModule } from '../HelperService/helper-service.module';

import { AppConfigurationController } from './configuration.controller';
import { AppConfigurationService } from './configuration.service';

@Module({
  controllers: [AppConfigurationController],
  providers: [AppConfigurationService],
  imports: [
    forwardRef(() => AIStudioModule),
    forwardRef(() => DatabaseModule),
    HelperModule,
    HttpModule.register({
      timeout: 5000,
      maxRedirects: 5,
    }),
    forwardRef(() => CachingModule),
    AccountConfigModule,
  ],
  exports: [AppConfigurationService],
})
export class AppConfigurationModule {}
