// import CryptoJS from 'crypto-js'
import { HttpService } from '@nestjs/axios';
import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import { AxiosError } from 'axios';
import * as crypto from 'crypto';
import { randomBytes, scrypt } from 'crypto';
import { catchError, firstValueFrom, of } from 'rxjs';
import { promisify } from 'util';

import { cache } from 'src/utils/memCache';

import { BaseUriDto } from './helper-service.interfaces.dto';

const context = '[HelperService]';

@Injectable()
export class HelperService {
  password = process.env.SALT_TOKEN;
  algorithm = 'aes-256-ctr';
  iv = randomBytes(16);

  constructor(
    @InjectPinoLogger(HelperService.name)
    private readonly logger: PinoLogger,
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.logger.setContext(context);
  }

  async getDomains(accountId: string): Promise<BaseUriDto[]> | null {
    try {
      if (!accountId) {
        this.logger.error({
          fn: 'getDomains',
          message: 'No accountId provided',
          accountId: accountId,
        });

        throw new InternalServerErrorException('No accountId provided');
      }

      const url = `https://api.liveperson.net/api/account/${accountId}/service/baseURI.json?version=1.0`;

      const { data } = await firstValueFrom(
        this.httpService.get<{ baseURIs: BaseUriDto[] }>(url).pipe(
          catchError((error: AxiosError) => {
            this.logger.error({
              fn: 'getDomains',
              message: 'Failed to fetch baseURIs from LivePerson API',
              accountId,
              url,
              error: {
                status: error.response?.status,
                statusText: error.response?.statusText,
                data: error.response?.data,
                message: error.message,
              },
            });

            return of({ data: { baseURIs: [] } } as any);
          }),
        ),
      );

      if (!data.baseURIs || data.baseURIs.length === 0) {
        this.logger.error({
          fn: 'getDomains',
          message: 'No baseURIs found in API response',
          accountId,
          data,
        });

        return [];
      }

      const domains: BaseUriDto[] = data.baseURIs;

      const aiStudioPlatformService = data.baseURIs.find(
        (domain: BaseUriDto) => domain.service === 'aiStudioPlatformService',
      );

      if (!aiStudioPlatformService) {
        // add aiStudioPlatformService domain if not present
        const zone = this.configService.get('ZONE');

        let aisUri = 'p-us';

        if (zone) {
          if (zone === 'z2') {
            aisUri = 'p-eu';
          } else if (zone === 'z3') {
            aisUri = 'p-au';
          }
        }

        domains.push({
          account: accountId,
          service: 'aiStudioPlatformService',
          baseURI: `aistudio-${aisUri}.liveperson.net`,
        });
      }

      cache.add(`CSDS_${accountId}`, domains, 3600);

      return domains;
    } catch (error) {
      this.logger.error({
        fn: 'getDomains',
        message: 'Unexpected error in getDomains, returning fallback domains',
        accountId,
        error: error.message || error,
      });
    }
  }

  async getDomain(accountId: string, service: string): Promise<string | null> {
    try {
      const storedBaseURIs = cache.get(`CSDS_${accountId}`) as BaseUriDto[];

      if (!storedBaseURIs) {
        const domains = await this.getDomains(accountId);

        if (!domains || domains.length === 0) {
          this.logger.error({
            fn: 'getDomain',
            message: 'No domains found for account',
            accountId,
            service,
          });

          return null;
        }

        const domain: BaseUriDto = domains.find(
          (domain: BaseUriDto) => domain.service === service,
        );

        return domain?.baseURI || null;
      }

      const foundDomain = storedBaseURIs.find(
        (domain: BaseUriDto) => domain.service === service,
      );

      return foundDomain?.baseURI || null;
    } catch (error) {
      this.logger.error({
        fn: 'getDomain',
        message: 'Error getting domain, attempting fallback',
        accountId,
        service,
        error: error.message || error,
      });

      return null;
    }
  }

  generateKey = async (password: string): Promise<Buffer> => {
    const salt = randomBytes(16).toString('hex');

    const derivedKey: Buffer = (await promisify(scrypt)(
      password,
      salt,
      32,
    )) as Buffer;

    return derivedKey;
  };

  hash256(string_: string): any {
    return crypto.createHash('sha256').update(string_).digest('hex');
  }
}
