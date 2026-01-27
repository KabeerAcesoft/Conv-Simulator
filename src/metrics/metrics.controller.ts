import { Controller, Get, Header } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import { CircuitBreakerService } from '../common/services/circuit-breaker.service';
import { MetricsService } from '../common/services/metrics.service';

@ApiTags('metrics')
@Controller('metrics')
export class MetricsController {
  constructor(
    private readonly metricsService: MetricsService,
    private readonly circuitBreakerService: CircuitBreakerService,
  ) {}

  @ApiOperation({ summary: 'Get metrics in Prometheus format' })
  @ApiResponse({ status: 200, description: 'Metrics in Prometheus format' })
  @Get()
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  getPrometheusMetrics(): string {
    return this.metricsService.exportMetrics();
  }

  @ApiOperation({ summary: 'Get metrics summary' })
  @ApiResponse({ status: 200, description: 'Metrics summary in JSON format' })
  @Get('summary')
  getMetricsSummary() {
    return this.metricsService.getSummary();
  }

  @ApiOperation({ summary: 'Get circuit breaker statuses' })
  @ApiResponse({ status: 200, description: 'Circuit breaker statuses' })
  @Get('circuit-breakers')
  getCircuitBreakers() {
    return {
      circuitBreakers: this.circuitBreakerService.getAllCircuitStatuses(),
      timestamp: new Date().toISOString(),
    };
  }
}
