import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse } from '@nestjs/swagger';

import { API_ROUTES } from '../../constants/constants';

import { ServiceWorkerConfigDto } from './configuration.dto';
import { AppConfigurationService } from './configuration.service';

@Controller(API_ROUTES.ACCOUNT_CONFIGURATION())
export class AppConfigurationController {
  constructor(private readonly service: AppConfigurationService) {}

  @Get(':accountId/test')
  test(@Param('accountId') accountId: string): string {
    return `Account ID is: ${accountId}`;
  }

  @ApiOperation({ summary: 'Run Simulation' })
  @ApiResponse({
    status: 200,
    description: 'Synthetic conversation has been successfully orchestrated.',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @Post('/:accountId/set-service-worker')
  async setServiceWorker(@Body() body: ServiceWorkerConfigDto): Promise<any> {
    const outcome = await this.service.setServiceWorker(body);

    return {
      outcome,
    };
  }

  @ApiOperation({ summary: 'Get Service Worker' })
  @ApiResponse({
    status: 200,
    description: 'Service worker configuration retrieved successfully.',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @Get('/:accountId/service-worker')
  async getServiceWorker(
    @Param('accountId') accountId: string,
  ): Promise<ServiceWorkerConfigDto | null> {
    const serviceWorker = await this.service.getServiceWorker(accountId);

    if (!serviceWorker) {
      return null;
    }

    return serviceWorker;
  }

  @Get('/:accountId/worker-status')
  async getWorkerStatus(@Param('accountId') accountId: string): Promise<any> {
    const workerStatus = await this.service.testServiceWorker(accountId);

    if (!workerStatus) {
      return null;
    }

    return workerStatus;
  }
}
