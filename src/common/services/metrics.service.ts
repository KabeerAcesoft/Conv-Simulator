import { Injectable, Logger } from '@nestjs/common';

interface MetricValue {
  timestamp: number;
  value: number;
  labels?: Record<string, string>;
}

interface CounterMetric {
  name: string;
  value: number;
  labels?: Record<string, string>;
}

interface HistogramMetric {
  name: string;
  values: number[];
  labels?: Record<string, string>;
}

@Injectable()
export class MetricsService {
  private readonly logger = new Logger(MetricsService.name);
  private counters = new Map<string, CounterMetric>();
  private gauges = new Map<string, MetricValue>();
  private histograms = new Map<string, HistogramMetric>();

  /**
   * Increment a counter metric
   */
  incrementCounter(
    name: string,
    value = 1,
    labels?: Record<string, string>,
  ): void {
    const key = this.generateKey(name, labels);
    const existing = this.counters.get(key) || { name, value: 0, labels };

    existing.value += value;
    this.counters.set(key, existing);
  }

  /**
   * Set a gauge metric value
   */
  setGauge(name: string, value: number, labels?: Record<string, string>): void {
    const key = this.generateKey(name, labels);

    this.gauges.set(key, {
      timestamp: Date.now(),
      value,
      labels,
    });
  }

  /**
   * Record a histogram value
   */
  recordHistogram(
    name: string,
    value: number,
    labels?: Record<string, string>,
  ): void {
    const key = this.generateKey(name, labels);
    const existing = this.histograms.get(key) || { name, values: [], labels };

    existing.values.push(value);

    // Keep only last 1000 values to prevent memory bloat
    if (existing.values.length > 1000) {
      existing.values = existing.values.slice(-1000);
    }

    this.histograms.set(key, existing);
  }

  /**
   * Record request metrics
   */
  recordRequest(
    method: string,
    endpoint: string,
    statusCode: number,
    duration: number,
    success: boolean,
  ): void {
    const labels = { method, endpoint, status: statusCode.toString() };

    // Count requests
    this.incrementCounter('http_requests_total', 1, labels);

    // Record duration
    this.recordHistogram('http_request_duration_ms', duration, labels);

    // Count errors
    if (!success) {
      this.incrementCounter('http_request_errors_total', 1, labels);
    }
  }

  /**
   * Record database operation metrics
   */
  recordDatabaseOperation(
    operation: string,
    collection: string,
    duration: number,
    success: boolean,
  ): void {
    const labels = { operation, collection };

    this.incrementCounter('database_operations_total', 1, labels);
    this.recordHistogram('database_operation_duration_ms', duration, labels);

    if (!success) {
      this.incrementCounter('database_operation_errors_total', 1, labels);
    }
  }

  /**
   * Record cache operation metrics
   */
  recordCacheOperation(
    operation: 'delete' | 'hit' | 'miss' | 'set',
    duration?: number,
  ): void {
    const labels = { operation };

    this.incrementCounter('cache_operations_total', 1, labels);

    if (duration !== undefined) {
      this.recordHistogram('cache_operation_duration_ms', duration, labels);
    }
  }

  /**
   * Record conversation simulation metrics
   */
  recordSimulationMetrics(
    accountId: string,
    status: 'completed' | 'failed' | 'started',
    duration?: number,
    conversationCount?: number,
  ): void {
    const labels = { accountId: this.hashAccountId(accountId), status };

    this.incrementCounter('simulation_operations_total', 1, labels);

    if (duration !== undefined) {
      this.recordHistogram('simulation_duration_ms', duration, labels);
    }

    if (conversationCount !== undefined) {
      this.recordHistogram(
        'simulation_conversation_count',
        conversationCount,
        labels,
      );
    }
  }

  /**
   * Get current system metrics
   */
  getSystemMetrics(): Record<string, any> {
    const memUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();

    return {
      memory: {
        rss: memUsage.rss,
        heapUsed: memUsage.heapUsed,
        heapTotal: memUsage.heapTotal,
        external: memUsage.external,
      },
      cpu: {
        user: cpuUsage.user,
        system: cpuUsage.system,
      },
      uptime: process.uptime(),
      pid: process.pid,
    };
  }

  /**
   * Export all metrics in Prometheus format
   */
  exportMetrics(): string {
    const lines: string[] = [];

    // Export counters
    for (const [, metric] of this.counters.entries()) {
      const labelsString = this.formatLabels(metric.labels);

      lines.push(`# TYPE ${metric.name} counter`);
      lines.push(`${metric.name}${labelsString} ${metric.value}`);
    }

    // Export gauges
    for (const [key, metric] of this.gauges.entries()) {
      const name = key.split('|')[0];
      const labelsString = this.formatLabels(metric.labels);

      lines.push(`# TYPE ${name} gauge`);
      lines.push(`${name}${labelsString} ${metric.value}`);
    }

    // Export histograms (simplified - just averages)
    for (const [, metric] of this.histograms.entries()) {
      if (metric.values.length > 0) {
        const avg =
          metric.values.reduce((a, b) => a + b, 0) / metric.values.length;

        const labelsString = this.formatLabels(metric.labels);

        lines.push(`# TYPE ${metric.name}_avg gauge`);
        lines.push(`${metric.name}_avg${labelsString} ${avg}`);
        lines.push(`# TYPE ${metric.name}_count gauge`);

        lines.push(
          `${metric.name}_count${labelsString} ${metric.values.length}`,
        );
      }
    }

    return lines.join('\n') + '\n';
  }

  /**
   * Get metrics summary
   */
  getSummary(): Record<string, any> {
    const countersObject: Record<string, any> = {};
    const gaugesObject: Record<string, any> = {};
    const histogramsObject: Record<string, any> = {};

    for (const [key, metric] of this.counters.entries()) {
      Object.defineProperty(countersObject, key, {
        value: metric,
        enumerable: true,
        writable: true,
        configurable: true,
      });
    }

    for (const [key, metric] of this.gauges.entries()) {
      Object.defineProperty(gaugesObject, key, {
        value: metric,
        enumerable: true,
        writable: true,
        configurable: true,
      });
    }

    for (const [key, metric] of this.histograms.entries()) {
      if (metric.values.length > 0) {
        const sorted = [...metric.values].sort((a, b) => a - b);

        Object.defineProperty(histogramsObject, key, {
          value: {
            count: metric.values.length,
            min: Math.min(...metric.values),
            max: Math.max(...metric.values),
            avg:
              metric.values.reduce((a, b) => a + b, 0) / metric.values.length,
            p50: sorted[Math.floor(sorted.length * 0.5)],
            p90: sorted[Math.floor(sorted.length * 0.9)],
            p95: sorted[Math.floor(sorted.length * 0.95)],
            p99: sorted[Math.floor(sorted.length * 0.99)],
          },
          enumerable: true,
          writable: true,
          configurable: true,
        });
      }
    }

    return {
      counters: countersObject,
      gauges: gaugesObject,
      histograms: histogramsObject,
      system: this.getSystemMetrics(),
    };
  }

  private generateKey(name: string, labels?: Record<string, string>): string {
    if (!labels) return name;

    const labelString = Object.entries(labels)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}="${v}"`)
      .join(',');

    return `${name}|${labelString}`;
  }

  private formatLabels(labels?: Record<string, string>): string {
    if (!labels || Object.keys(labels).length === 0) return '';

    const labelString = Object.entries(labels)
      .map(([k, v]) => `${k}="${v}"`)
      .join(',');

    return `{${labelString}}`;
  }

  private hashAccountId(accountId: string): string {
    // Hash account ID for privacy in metrics
    return accountId.length > 8
      ? accountId.substring(0, 4) +
          '***' +
          accountId.substring(accountId.length - 4)
      : '***';
  }
}
