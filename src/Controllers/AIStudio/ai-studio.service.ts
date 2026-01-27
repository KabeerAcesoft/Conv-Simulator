import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import { LPDomains } from 'src/constants/constants';
import { helper } from 'src/utils/HelperService';

import { APIService } from '../APIService/api-service';
import { HelperService } from '../HelperService/helper-service.service';

import {
  AISConversationRequestDto,
  AISMessage,
  InvokeFlowRequestDto,
} from './ai-studio.dto';
import { createFlowRequestBody } from './promptlessFlow';

export const context = '[AIStudioService]';

@Injectable()
export class AIStudioService {
  constructor(
    @InjectPinoLogger(AIStudioService.name)
    private readonly logger: PinoLogger,
    private readonly helperService: HelperService,
    private readonly apiService: APIService,
  ) {
    this.logger.setContext(context);
  }

  /**
   * Start a conversation with the AI Studio service.
   * @param accountId The ID of the account.
   * @param token The authorization token.
   * @param body The request body containing conversation details.
   * @returns The response from the AI Studio service.
   */
  async startConversation(
    accountId: string,
    token: string,
    body: AISConversationRequestDto,
  ): Promise<any> {
    const domain = await this.helperService.getDomain(
      accountId,
      LPDomains.AIStudioPlatformService,
    );

    if (!domain) {
      this.logger.error({
        message: 'Domain not found for service: aistudio',
        accountId,
      });

      return null;
    }

    const url = `https://${domain}/api/v1/conversations`;

    const headers = {
      Authorization: helper.insertCCBearer(token),
      'Content-Type': 'application/json',
    };

    const response = await this.apiService.post<any>(url, body, {
      headers,
      timeout: 10000,
    });

    return response.data;
  }

  /**
   * Invoke a flow in the AI Studio service.
   * @param accountId The ID of the account.
   * @param token The authorization token.
   * @param body The request body containing flow details.
   * @param flowId The ID of the flow to invoke.
   * @returns The response from the AI Studio service.
   */
  async invokeFlow(
    accountId: string,
    token: string,
    body: InvokeFlowRequestDto,
    flowId: string,
  ): Promise<any> {
    const function_ = 'invokeFlow';

    try {
      const domain = await this.helperService.getDomain(
        accountId,
        LPDomains.AIStudioPlatformService,
      );

      if (!domain) {
        this.logger.error({
          fn: function_,
          message: 'Domain not found for service: aistudio',
          accountId,
        });

        throw new InternalServerErrorException(
          `${function_} - Domain not found for service: aistudio`,
        );
      }

      const url = `https://${domain}/api/v2/flows/${flowId}`;

      const headers = {
        Authorization: helper.insertCCBearer(token),
        'Content-Type': 'application/json',
      };

      const { data } = await this.apiService.post<any>(url, body, {
        headers,
        timeout: 20000,
      });

      return data[0];
    } catch (error) {
      this.logger.error({
        fn: function_,
        message: 'Error invoking flow',
        error: error.response || error,
        accountId,
        body,
        flowId,
      });

      throw new InternalServerErrorException(error.response);
    }
  }

  /**
   * Get the response from a flow in the AI Studio service.
   * @param params The parameters containing conversation and flow details.
   * @returns The response from the AI Studio service.
   */
  async getFlowResponse(parameters: {
    accountId: string;
    conv_id?: string;
    flow_id?: string;
    messages?: AISMessage[];
    prompt: string;
    text?: string;
    token: string;
  }): Promise<{
    id: string;
    speaker: string;
    text: string;
    time: number;
  }> {
    const { accountId, conv_id, token, prompt, flow_id, text, messages } =
      parameters;

    const domain = await this.helperService.getDomain(
      accountId,
      LPDomains.AIStudioPlatformService,
    );

    if (!domain) {
      this.logger.error({
        fn: 'getFlowResponse',
        message: 'Domain not found for service: aistudio',
        accountId,
      });

      throw new InternalServerErrorException(
        'Domain not found for service: aistudio',
      );
    }

    const body = createFlowRequestBody({
      prompt,
      flow_id,
      messages,
      conv_id,
      text,
    });

    const url = `https://${domain}/api/v2/flows/${flow_id}`;

    const headers = {
      Authorization: helper.insertCCBearer(token),
      'Content-Type': 'application/json',
    };

    const { data } = await this.apiService.post<
      {
        id: string;
        speaker: string;
        text: string;
        time: number;
      }[]
    >(url, body, {
      headers,
      timeout: 20000,
    });

    return data[0];
  }

  async listFlows(accountId: string, token: string): Promise<any> {
    const domain = await this.helperService.getDomain(
      accountId,
      LPDomains.AIStudioPlatformService,
    );

    if (!domain) {
      this.logger.error({
        fn: 'listFlows',
        message: 'Domain not found for service: aistudio',
        accountId,
      });

      return null;
    }

    // eslint-disable-next-line no-secrets/no-secrets
    const url = `https://${domain}/api/v2/flows?scroll_amount=-1&created_by=any&flow_type=all&account_id=${accountId}`;

    const headers = {
      Authorization: helper.insertCCBearer(token),
      'Content-Type': 'application/json',
    };

    const { data } = await this.apiService.get<any>(url, {
      headers,
      timeout: 10000,
    });

    return data;
  }
}
