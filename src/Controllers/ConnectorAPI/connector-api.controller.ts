import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse } from '@nestjs/swagger';

import { API_ROUTES } from '../../constants/constants';

import { ConnectorAPIService } from './connector-api.service';

@Controller(API_ROUTES.CONNECTOR_API())
export class ConnectorAPIController {
  constructor(private service: ConnectorAPIService) {}

  @Get(':accountId/test')
  test(@Param('accountId') accountId: string): string {
    return `${API_ROUTES.CONNECTOR_API()} Account ID is: ${accountId}`;
  }

  @ApiOperation({ summary: 'Content Event' })
  @ApiResponse({
    status: 200,
    description: 'Content Event has been successfully created.',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @Post('/:accountId/content-event/conv-sim')
  async contentEvent(
    @Body() body: any,
    @Param('accountId') accountId: string,
  ): Promise<any> {
    await this.service.contentEvent(accountId, body);
  }

  @ApiOperation({ summary: 'Content Event' })
  @ApiResponse({
    status: 200,
    description: 'Content Event has been successfully created.',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @Post('/:accountId/state/conv-sim')
  async ExConversationChangeNotification(
    @Body() body: any,
    @Param('accountId') accountId: string,
  ): Promise<any> {
    await this.service.ExConversationChangeNotification(accountId, body);
  }

  @ApiOperation({ summary: 'Get App JWT' })
  @ApiResponse({
    status: 200,
    description: 'App JWT has been successfully retrieved.',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @Get('/:accountId/app-jwt')
  async getAppJwt(
    @Param('accountId') accountId: string,
  ): Promise<string | null> {
    const jwt = await this.service.getAppJwt(accountId);

    if (!jwt) {
      return null;
    }

    return jwt;
  }
}
