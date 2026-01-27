import { HttpService } from '@nestjs/axios';
import {
  Inject,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import { CollectionReference } from '@google-cloud/firestore';
import { AxiosError } from 'axios';
import { catchError, firstValueFrom } from 'rxjs';

import { ApiKeyDto, AppInstallDto } from 'src/common/dto/shared.dto';
import { getApplicationConfig, LPDomains } from 'src/constants/constants';
import { ApplicationSettingsDto } from 'src/Controllers/Configuration/configuration.dto';
import { helper } from 'src/utils/HelperService';

import { ServiceWorkerConfigDto } from '../Configuration/configuration.dto';
import { HelperService } from '../HelperService/helper-service.service';

import { UserDto } from './account-config.dto';

const { ctx } = helper;
const context = `[AccountConfigService]`;

@Injectable()
export class AccountConfigService {
  constructor(
    @InjectPinoLogger(AccountConfigService.name)
    private readonly logger: PinoLogger,
    private readonly httpService: HttpService,
    private readonly helperService: HelperService,
    private readonly configService: ConfigService,
    @Inject(ApplicationSettingsDto.collectionName)
    private applicationSettingsCollection: CollectionReference<ApplicationSettingsDto>,
  ) {
    this.logger.setContext(AccountConfigService.name);
  }

  /**
   * Gets all CCUI Users
   * @param accountId The ID of the account.
   * @param token The authorization token.
   * @returns A promise that resolves to an array of UserDto objects or null.
   */
  async getAllUsers(
    accountId: string,
    token: string,
  ): Promise<UserDto[]> | null {
    try {
      const domain = await this.helperService.getDomain(
        accountId,
        LPDomains.AccountConfigReadWrite,
      );

      const url = `https://${domain}/api/account/${accountId}/configuration/le-users/users?v=6.0&select=$all`;

      const data = await firstValueFrom(
        this.httpService
          .get<UserDto[]>(url, {
            headers: {
              Authorization: helper.insertBearer(token),
            },
          })
          .pipe(
            catchError((error: AxiosError) => {
              this.logger.error({
                message: 'Error fetching all users',
                error: error.response.data,
              });

              throw new InternalServerErrorException({
                status: error.response.status,
                statusText: error.response.statusText,
                data: error.response.data,
              });
            }),
          ),
      );

      return data.data;
    } catch (error) {
      this.logger.error(error);
      throw new InternalServerErrorException(error);
    }
  }

  /**
   * Gets a single CCUI User by ID.
   * @param accountId The ID of the account.
   * @param userId The ID of the user.
   * @param token The authorization token.
   * @returns A promise that resolves to a UserDto object or null.
   */
  async getOneUser(
    accountId: string,
    userId: number,
    token: string,
  ): Promise<UserDto | null> {
    try {
      const Authorization = `Bearer ${token.replace('Bearer ', '')}`;

      const domain = await this.helperService.getDomain(
        accountId,
        LPDomains.AccountConfigReadWrite,
      );

      if (!domain) {
        this.logger.error({
          fn: 'getOneUser',
          message: 'Failed to get domain for accountConfigReadWrite service',
          accountId,
          userId,
        });

        return null;
      }

      const url = `https://${domain}/api/account/${accountId}/configuration/le-users/users/${userId}?v=6.0`;

      const data = await firstValueFrom(
        this.httpService
          .get<UserDto>(url, {
            headers: {
              Authorization,
            },
          })
          .pipe(
            catchError((error: AxiosError) => {
              this.logger.error(error.response.data);
              throw new InternalServerErrorException(error.response.data);
            }),
          ),
      );

      return data.data;
    } catch (error) {
      this.logger.error(error);
      throw new InternalServerErrorException(error);
    }
  }

  /**
   * Gets the application revision for a specific account.
   * @param accountId The ID of the account.
   * @param token The authorization token.
   * @returns A promise that resolves to the application revision string or void.
   */
  async getAppRevision(
    accountId: string,
    token: string,
  ): Promise<string | null> {
    try {
      const domain = await this.helperService.getDomain(
        accountId,
        LPDomains.AccountConfigReadWrite,
      );

      const url = `https://${domain}/api/account/${accountId}/configuration/app-install/installations/?v=1`;

      const data = await firstValueFrom(
        this.httpService
          .get<AppInstallDto[]>(url, {
            headers: { Authorization: helper.insertBearer(token) },
          })
          .pipe(
            catchError((error: AxiosError) => {
              this.logger.error(error.response.data);
              throw new InternalServerErrorException({
                fn: 'getAppRevision',
                status: error.response.status,
                statusText: error.response.statusText,
                data: error.response.data,
              });
            }),
          ),
      );

      const revision = data.headers['ac-revision'];

      return revision;
    } catch (error) {
      this.logger.error(error);
      throw new InternalServerErrorException(error);
    }
  }

  /**
   * updates the application install and adds webhooks
   * @param accountId The ID of the account.
   * @param token The authorization token.
   * @returns A promise that resolves to the result of the operation.
   */
  async enableWebhooks(accountId: string, token: string): Promise<any> {
    const functionKey = 'enableWebhooks';

    try {
      const environment = this.configService.get<string>('WEBHOOK_ENV');
      const match = await this.getAppRevision(accountId, token);
      const body = getApplicationConfig(environment || 'prod', accountId);

      this.logger.info({
        fn: functionKey,
        level: 'info',
        message: `Enabling webhooks for environment ${environment}`,
        accountId,
        body,
      });

      const domain = await this.helperService.getDomain(
        accountId,
        LPDomains.AccountConfigReadWrite,
      );

      const url = `https://${domain}/api/account/${accountId}/configuration/app-install/installations`;

      const headers = {
        'Content-Type': 'application/json',
        Authorization: helper.insertBearer(token),
        'If-Match': match, // this is the revision of the app install
      };

      await firstValueFrom(
        this.httpService.post(url, body, { headers }).pipe(
          catchError((error: AxiosError) => {
            this.logger.error({
              fn: functionKey,
              level: 'error',
              message: 'Error enabling webhooks',
              error: error.response.data,
              accountId,
            });

            throw new InternalServerErrorException(error);
          }),
        ),
      );

      return {
        success: true,
        message: 'Webhooks enabled successfully',
      };
    } catch (error) {
      this.logger.error({
        fn: functionKey,
        level: 'error',
        message: 'Error enabling webhooks',
        error: error.response.data,
        accountId,
      });

      throw new InternalServerErrorException(error);
    }
  }

  /**
   * Gets the webhooks for a specific account.
   * @param accountId The ID of the account.
   * @param token The authorization token.
   * @returns A promise that resolves to the webhooks configuration or null.
   */
  async getWebhooks(accountId: string, token: string): Promise<any> {
    const function_ = 'getWebhooks';

    try {
      const domain = await this.helperService.getDomain(
        accountId,
        LPDomains.AccountConfigReadWrite,
      );

      const appId = process.env.VUE_APP_CLIENT_ID;
      const url = `https://${domain}/api/account/${accountId}/configuration/app-install/installations/${appId}`;

      const headers = {
        'Content-Type': 'application/json',
        Authorization: helper.insertBearer(token),
      };

      const { data } = await firstValueFrom(
        this.httpService.get<AppInstallDto>(url, { headers }).pipe(
          catchError((error: AxiosError) => {
            this.logger.error(error.response.data);
            throw new InternalServerErrorException({
              fn: function_,
              status: error.response.status,
              statusText: error.response.statusText,
              data: error.response.data,
            });
          }),
        ),
      );

      const webhooks = data?.capabilities?.webhooks || {};

      return webhooks;
    } catch (error) {
      this.logger.error({
        fn: function_,
        level: 'error',
        message: 'Error fetching webhooks',
        error: error.response.data,
        accountId,
      });

      throw new InternalServerErrorException(error);
    }
  }

  /**
   * Disables webhooks for a specific account.
   * @param accountId The ID of the account.
   * @param token The authorization token.
   * @returns A promise that resolves to the result of the operation.
   */
  async disableWebhooks(accountId: string, token: string): Promise<any> {
    const function_ = 'disableWebhooks';

    try {
      const match = await this.getAppRevision(accountId, token);
      const body = getApplicationConfig(null, accountId);

      if ('capabilities' in body) {
        delete body.capabilities;
      }

      this.logger.info({
        fn: function_,
        level: 'info',
        message: `Disabling webhooks for environment: ${process.env.WEBHOOK_ENV}`,
        accountId,
      });

      const domain = await this.helperService.getDomain(
        accountId,
        LPDomains.AccountConfigReadWrite,
      );

      const url = `https://${domain}/api/account/${accountId}/configuration/app-install/installations`;

      const headers = {
        'Content-Type': 'application/json',
        Authorization: helper.insertBearer(token),
        'If-Match': match,
      };

      await firstValueFrom(
        this.httpService.post(url, body, { headers }).pipe(
          catchError((error: AxiosError) => {
            this.logger.error(error.response.data);
            throw new InternalServerErrorException(error);
          }),
        ),
      );

      return {
        success: true,
        message: 'Webhooks disabled successfully',
      };
    } catch (error) {
      this.logger.error({
        fn: function_,
        level: 'error',
        message: 'Error disabling webhooks',
        error: error,
        accountId,
      });
    }
  }

  /**
   * Gets the CCUI application key for a specific account by key ID.
   * @param accountId The ID of the account.
   * @param keyId The ID of the key.
   * @param token The authorization token.
   * @returns A promise that resolves to the application key or null.
   */
  async getAppKey(
    accountId: string,
    keyId: string,
    token: string,
  ): Promise<ApiKeyDto> | null {
    try {
      const domain = await this.helperService.getDomain(
        accountId,
        LPDomains.AppKeyManagement,
      );

      const url = `https://${domain}/app-key-manager/api/account/${accountId}/keys/${keyId}?v=1.0`;

      const { data } = await firstValueFrom(
        this.httpService
          .get<ApiKeyDto>(url, {
            headers: {
              Authorization: token,
            },
          })
          .pipe(
            catchError((error: AxiosError) => {
              this.logger.error(error.response.data);
              throw new InternalServerErrorException({
                status: error.response.status,
                statusText: error.response.statusText,
                data: error.response.data,
              });
            }),
          ),
      );

      return data;
    } catch (error) {
      this.logger.error(error);
      throw new InternalServerErrorException(error);
    }
  }

  /**
   * Gets all application settings (Firestore application record) for a specific account.
   * @param accountId The ID of the account.
   * @param token The authorization token.
   * @returns A promise that resolves to an array of application settings.
   */
  async getApplicationSettingsAll(): Promise<ApplicationSettingsDto[]> {
    const function_ = 'getAllApplicationSettings';

    try {
      const existing = await this.applicationSettingsCollection.get();
      const settings: ApplicationSettingsDto[] = [];

      existing.forEach((document_) => {
        const setting = document_.data();

        if (setting) {
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

  /**
   * Bot user login for CCUI
   * @param appKey The application key for the bot user.
   * @param accountId The ID of the account.
   * @returns A promise that resolves to the result of the login operation.
   */
  async userAPILogin(appKey: ServiceWorkerConfigDto, accountId: string) {
    const domain = await this.helperService.getDomain(
      accountId,
      LPDomains.AgentVep,
    );

    const url = `https://${domain}/api/account/${accountId}/login?v=1.3`;

    const headers = {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    };

    const { data } = await firstValueFrom(
      this.httpService
        .post(url, appKey, {
          headers: headers,
        })
        .pipe(
          catchError((error: AxiosError) => {
            console.error(error.response.data);
            throw new InternalServerErrorException(error.response.data);
          }),
        ),
    );

    return data;
  }
}
