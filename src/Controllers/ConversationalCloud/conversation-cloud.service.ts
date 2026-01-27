import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import { AccountConfigDto, ApiKeyDto } from 'src/common/dto/shared.dto';
import { LPDomains } from 'src/constants/constants';
import { UserDto } from 'src/Controllers/AccountConfig/account-config.dto';
import { helper } from 'src/utils/HelperService';

import { APIService } from '../APIService/api-service';
import { HelperService } from '../HelperService/helper-service.service';
import { AppUserDto } from '../users/users.dto';

import {
  ConversationMetadata,
  PromptDto,
  PromptResponseDto,
} from './conversation-cloud.dto';
import {
  ConversationHistoryRecord,
  ConversationHistoryResponse,
} from './conversation-cloud.interfaces';

const context_ = helper.ctx;
const context = 'ConversationCloudService';

@Injectable()
export class ConversationCloudService {
  constructor(
    @InjectPinoLogger(ConversationCloudService.name)
    private readonly logger: PinoLogger,
    private readonly apiService: APIService,
    private readonly helperService: HelperService,
  ) {}

  async getPrompts(accountId: string, token: string): Promise<PromptDto[]> {
    const function_ = 'getPrompts';

    try {
      const domain = await this.helperService.getDomain(
        accountId,
        LPDomains.PromptLibrary,
      );

      if (!domain) {
        const error = helper.ctx(
          context,
          function_,
          'Domain not found for service: promptlibrary',
          accountId,
        );

        throw new NotFoundException(error);
      }

      const url = `https://${domain}/v2/accounts/${accountId}/prompts?source=convsim`;

      const headers = {
        Authorization: helper.insertBearer(token),
        Accept: 'application/json',
        'Content-Type': 'application/json; charset=utf-8',
      };

      const { data } = await this.apiService.get<PromptResponseDto>(url, {
        headers,
      });

      return data.successResult.prompts;
    } catch (error) {
      throw new InternalServerErrorException(
        context_(context, function_, String(error), accountId),
      );
    }
  }

  async getAccountConfigFeatures(
    accountId: string,
    token: string,
    user: AppUserDto,
  ): Promise<AccountConfigDto[]> | null {
    try {
      const domain = await this.helperService.getDomain(
        accountId,
        LPDomains.AccountConfigReadWrite,
      );

      let url = `https://${domain}/api/account/${accountId}/configuration/setting/properties?groups=loginSession&context_cascading=false&v=3.0&source=ccui`;
      const id = user?.id;

      if (id) {
        url += `&context_type=USER&context_id=${id}`;
      }

      const { data } = await this.apiService.get<AccountConfigDto[]>(url, {
        headers: {
          Authorization: helper.insertBearer(token),
        },
      });

      return data;
    } catch (error) {
      this.logger.error(error);
      throw new InternalServerErrorException(error);
    }
  }

  async getOneMessagingInteraction(
    authorization: string,
    accountId: string,
    conversationId: string,
  ): Promise<any> {
    try {
      const body = {
        conversationId: conversationId,
      };

      const domain = await this.helperService.getDomain(
        accountId,
        LPDomains.MessageHist,
      );

      if (!domain) {
        this.logger.error(`Domain not found for account ${accountId}`);
        throw new NotFoundException('Domain not found for account');
      }

      const url = `https://${domain}/messaging_history/api/account/${accountId}/conversations/conversation/search`;

      const headers = {
        authorization,
        Accept: 'application/json',
        'Content-Type': 'application/json',
        source: 'lp_sltk',
      };

      const { data } = await this.apiService.post<any>(url, body, {
        headers: headers,
      });

      return data;
    } catch (error) {
      const function_ = 'getOneMessagingInteraction';

      this.logger.error({
        fn: function_,
        accountId,
        conversationId,
        message: 'Error fetching messaging interaction',
        error,
      });

      throw new InternalServerErrorException(
        context_(context, function_, String(error), accountId),
      );
    }
  }

  async getConversationsByIds(
    token: string,
    accountId: string,
    conversationIds: string[],
    requestId?: string,
  ): Promise<ConversationHistoryRecord[]> {
    const function_ = 'getConversationsByIds';

    if (!conversationIds || conversationIds.length === 0) {
      this.logger.warn({
        fn: function_,
        accountId,
        message: 'No conversation IDs provided',
        requestId: requestId || 'N/A',
      });

      return [];
    }

    const body = {
      conversationIds,
      contentToRetrieve: [
        'messageRecords',
        'transfers',
        'agentParticipants',
        'messageScores',
        'conversationSurveys',
        'summary',
        'sdes',
        'unAuthSdes',
        'monitoring',
        'responseTime',
      ],
    };

    const domain = await this.helperService.getDomain(
      accountId,
      LPDomains.MessageHist,
    );

    if (!domain) {
      this.logger.error(`Domain not found for account ${accountId}`);
      throw new NotFoundException('Domain not found for account');
    }

    const url = `https://${domain}/messaging_history/api/account/${accountId}/conversations/conversation/search?limit=100&offset=0`;

    const headers = {
      authorization: helper.insertBearer(token),
      Accept: 'application/json',
      'Content-Type': 'application/json',
      source: 'CONV_SIM',
    };

    const { data } = await this.apiService.post<ConversationHistoryResponse>(
      url,
      body,
      { headers },
    );

    return data?.conversationHistoryRecords || [];
  }

  async getConversationById(
    token: string,
    accountId: string,
    conversationId: string[],
    requestId?: string,
  ): Promise<ConversationHistoryRecord[]> {
    const function_ = 'getConversationsById';

    if (!conversationId) {
      this.logger.error({
        fn: 'getConversationsById',
        accountId,
        message: 'No conversation ID provided',
        requestId: requestId || 'N/A',
      });

      throw new BadRequestException(
        helper.ctx(
          context,
          function_,
          'No conversation ID provided',
          requestId,
        ),
      );
    }

    const body = {
      conversationId,
    };

    const domain = await this.helperService.getDomain(
      accountId,
      LPDomains.MessageHist,
    );

    if (!domain) {
      this.logger.error(`Domain not found for account ${accountId}`);
      throw new NotFoundException('Domain not found for account');
    }

    const url = `https://${domain}/messaging_history/api/account/${accountId}/conversations/conversation/search`;

    const headers = {
      authorization: helper.insertBearer(token),
      Accept: 'application/json',
      'Content-Type': 'application/json',
      source: 'CONV_SIM',
    };

    const { data } = await this.apiService.post<ConversationHistoryResponse>(
      url,
      body,
      { headers },
    );

    return data?.conversationHistoryRecords || [];
  }

  async getAllOpenTaskConversationIds(
    token: string,
    accountId: string,
    conversationIds: string[],
    requestId?: string,
  ) {
    try {
      const chunks = helper.chunkArray(conversationIds, 100);

      const results = await Promise.all(
        chunks.map((chunk) =>
          this.getConversationsByIds(token, accountId, chunk, requestId),
        ),
      );

      return results.flat().map((record) => record.info.conversationId);
    } catch (error) {
      this.logger.error({
        // eslint-disable-next-line no-secrets/no-secrets
        fn: 'getAllOpenTaskConversationIds',
        accountId,
        message: 'Error fetching open task conversation IDs',
        error,
      });

      return null;
    }
  }

  async userAPILogin(user: UserDto, appKey: ApiKeyDto, accountId: string) {
    const domain = await this.helperService.getDomain(
      accountId,
      LPDomains.AgentVep,
    );

    const url = `https://${domain}/api/account/${accountId}/login?v=1.3`;

    const loginPayload = {
      username: user.loginName,
      appKey: appKey.keyId,
      secret: appKey.appSecret,
      accessToken: appKey.token,
      accessTokenSecret: appKey.tokenSecret,
    };

    const headers = {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    };

    const { data } = await this.apiService.post(url, loginPayload, { headers });

    return data;
  }

  async getConversationInfo(
    accountId: string,
    token: string,
    conversationId: string,
  ): Promise<{
    filtered: ConversationMetadata;
    transcript: string;
  } | null> {
    try {
      this.logger.debug({
        fn: 'getConversationInfo',
        accountId,
        conversationId,
        message: 'Getting conversation info',
      });

      if (!conversationId) {
        this.logger.error({
          fn: 'getConversationInfo',
          accountId,
          conversationId,
          message: 'Conversation ID is required',
        });

        return null;
      }

      const conversationDetails: ConversationHistoryRecord[] =
        await this.getConversationsByIds(token, accountId, [conversationId]);

      if (!conversationDetails || conversationDetails.length === 0) {
        this.logger.error({
          fn: 'getConversationInfo',
          accountId,
          conversationId,
          message: 'No conversation details found',
        });

        return null;
      }

      const cd = conversationDetails[0];
      const transcript = helper.transcriptToRaw(cd.messageRecords);

      this.logger.debug({
        fn: 'getConversationInfo',
        accountId,
        conversationId,
        message: 'Conversation details found',
        conversationDetails: cd,
      });

      const filtered: ConversationMetadata =
        helper.filterConversationDetails(cd);

      this.logger.debug({
        fn: 'getConversationInfo',
        accountId,
        conversationId,
        message: 'TRANSCRIPT',
        transcript,
      });

      return {
        filtered,
        transcript,
      };
    } catch (error) {
      this.logger.error({
        fn: 'getConversationInfo',
        accountId,
        conversationId,
        message: 'Error getting conversation info',
        error,
      });

      return null;
    }
  }
}
