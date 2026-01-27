import {
  Inject,
  Injectable,
  InternalServerErrorException,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import { CollectionReference } from '@google-cloud/firestore';

import { helper } from 'src/utils/HelperService';

import { UserDto } from '../AccountConfig/account-config.dto';
import { AccountConfigService } from '../AccountConfig/account-config.service';
import { AIStudioService } from '../AIStudio/ai-studio.service';
import { CacheService } from '../Cache/cache.service';
import {
  ApplicationSettingsDto,
  ServiceWorkerConfigDto,
} from '../Configuration/configuration.dto';
import { AppConfigurationService } from '../Configuration/configuration.service';
import { DatabaseService } from '../Database/database.service';

const { ctx } = helper;

export const context = '[ServiceWorkerService]';

@Injectable()
export class ServiceWorkerService implements OnModuleInit {
  minWarmUpDelay: number;
  maxWarmUpDelay: number;
  maxAccountConcurrency: number;
  maxRegionConcurrency: number;
  dev_account: string[];
  isInitialised = false;
  useDevURI: boolean;
  restrictAccount: boolean;
  pause: boolean;

  // @Cron(CronExpression.EVERY_2_HOURS, { name: CRON_NAMES.SERVICE_WORKER })
  // async handleCron2() {
  //   if (this.pause) return;
  //   this.setServiceWorkers();
  // }

  constructor(
    @InjectPinoLogger(ServiceWorkerService.name)
    private readonly logger: PinoLogger,
    private readonly accountConfigService: AccountConfigService,
    @Inject(ApplicationSettingsDto.collectionName)
    private applicationSettingsCollection: CollectionReference<ApplicationSettingsDto>,
    private readonly databaseService: DatabaseService,
    private readonly configService: ConfigService,
    private readonly cache: CacheService,
    private appConfigService: AppConfigurationService,
    private readonly aiStudioService: AIStudioService,
  ) {
    this.logger.setContext(context);

    this.maxRegionConcurrency =
      this.configService.get<number>('MAX_REGION_CONCURRENCY') || 5000;

    this.maxAccountConcurrency =
      this.configService.get<number>('MAX_ACCOUNT_CONCURRENCY') || 5000;

    this.maxWarmUpDelay = this.minWarmUpDelay =
      this.configService.get<number>('MIN_WARM_UP_DELAY') || 5000;

    this.maxWarmUpDelay =
      this.configService.get<number>('MAX_WARM_UP_DELAY') || 5000;

    const da =
      this.configService.get<string>('DEVELOPER_ACCOUNT_ID') || '31487986';

    this.dev_account = da.includes(',') ? da.split(',') : [da];

    this.restrictAccount = helper.toBoolean(
      this.configService.get<boolean>('RESTRICT_ACCOUNT') || false,
    );

    this.useDevURI = helper.toBoolean(
      this.configService.get<string>('USE_DEV_URI') || 'false',
    );

    this.restrictAccount = helper.toBoolean(
      this.configService.get<string>('RESTRICT_ACCOUNT') || 'false',
    );

    this.pause = helper.toBoolean(
      this.configService.get<string>('PAUSE') || 'false',
    );
  }

  async getApplicationSettingsAll(): Promise<ApplicationSettingsDto[]> {
    const function_ = 'getAllApplicationSettings';

    try {
      const zone = this.configService.get<string>('ZONE') || 'default';
      const existing = await this.applicationSettingsCollection.get();
      const settings: ApplicationSettingsDto[] = [];

      existing.forEach((document_) => {
        const setting = document_.data();

        if (
          setting &&
          zone.toLowerCase() === setting?.zone?.value?.toLowerCase()
        ) {
          settings.push(setting);
        }
      });

      return settings;
    } catch (error) {
      this.logger.error({
        fn: function_,
        error,
        message: 'Error getting all application settings',
      });

      throw new InternalServerErrorException(...ctx(context, function_, error));
    }
  }

  async setServiceWorker(
    accountId: string,
    user: UserDto,
    appKey: ServiceWorkerConfigDto,
  ): Promise<void> {
    this.logger.info({
      message: `Setting service worker for account ${accountId}`,
      accountId,
    });

    const missingKeys = Object.entries(appKey).filter(([, value]) => {
      return value === undefined || value === null || value === '';
    });

    if (missingKeys.length > 0) {
      this.logger.error({
        message: `Missing required properties in appKey: ${missingKeys.map(([key]) => key).join(', ')}`,
        accountId,
        service: AccountConfigService.name,
        function: 'setServiceWorker',
      });

      throw new InternalServerErrorException(
        `Missing required properties in appKey: ${missingKeys.map(([key]) => key).join(', ')}`,
      );
    }

    const loginResponse = await this.accountConfigService.userAPILogin(
      appKey,
      accountId,
    );

    this.logger.info({
      message: `Service worker set for account ${accountId}`,
      accountId,
      userId: user.loginName,
      appKeyId: appKey.appKey,
      service: AccountConfigService.name,
      function: 'setServiceWorker',
    });

    const { bearer } = loginResponse;

    if (!bearer) {
      this.logger.error({
        message: `Was unable to log in user ${user.loginName} for account ${accountId}`,
        accountId,
        service: AccountConfigService.name,
        function: 'setServiceWorker',
      });

      throw new InternalServerErrorException(
        `Was unable to log in user ${user.loginName} for account ${accountId}`,
      );
    }

    await this.cache.setServiceWorker(accountId, bearer);

    this.logger.info({
      message: `Service worker set for account ${accountId}`,
      accountId,
      userId: user.loginName,
      appKeyId: appKey.appKey,
      service: AccountConfigService.name,
      function: 'setServiceWorker',
    });
  }

  async setServiceWorkers(): Promise<void> {
    this.logger.info({
      message: 'Setting service workers for all accounts',
      service: AccountConfigService.name,
      function: 'setServiceWorkers',
    });

    const applicationSettingsList = (
      await this.getApplicationSettingsAll()
    ).filter((setting) =>
      this.restrictAccount
        ? this.dev_account.includes(setting.accountId)
        : true,
    );

    if (this.restrictAccount) {
      console.info(
        `Restricting service workers to developer account: ${this.dev_account}`,
      );
    }

    const results: Record<string, boolean> = {};

    for (const accountSettings of applicationSettingsList) {
      const { accountId } = accountSettings;

      try {
        /**
         * Test if existing token still valid before attempting to re-login
         */
        const worker = await this.appConfigService.getServiceWorker(
          accountSettings.accountId,
        );

        const setWorkerResult = await this.appConfigService.setServiceWorker(
          Object.assign({}, worker, {
            accountId: accountSettings.accountId,
          }),
        );

        Object.defineProperty(results, accountSettings.accountId, {
          value: setWorkerResult,
          enumerable: true,
          writable: true,
          configurable: true,
        });

        const { token } = (await this.cache.getServiceWorker(accountId)) || {};

        if (!token) {
          this.logger.error({
            fn: 'setServiceWorkers',
            level: 'error',
            message: 'No token found',
            accountId,
          });

          continue;
        }

        await this.accountConfigService.getAllUsers(accountId, token);
        const flowId = accountSettings?.defaultPrompt?.value;

        if (!flowId) {
          this.logger.error({
            message: `No default prompt found for account ${accountId}`,
            accountId,
            service: AccountConfigService.name,
            function: 'setServiceWorkers',
          });

          Object.defineProperty(results, accountId, {
            value: false,
            enumerable: true,
            writable: true,
            configurable: true,
          });

          continue;
        }

        await this.aiStudioService.getFlowResponse({
          accountId,
          token,
          flow_id: flowId,
          prompt: 'Test prompt for service worker',
        });

        Object.defineProperty(results, accountId, {
          value: true,
          enumerable: true,
          writable: true,
          configurable: true,
        });

        continue;
      } catch {
        Object.defineProperty(results, accountId, {
          value: false,
          enumerable: true,
          writable: true,
          configurable: true,
        });
      }
    }

    this.logger.info({
      message: 'Service workers set for all accounts',
      results,
      service: AccountConfigService.name,
      function: 'setServiceWorkers',
    });
  }

  async onModuleInit() {
    /*
    disabling service worker intialisation on start up
    Bot Access Token now validated when new simulation request is made, and refreshed if needed
    */
  }
}
