import { Injectable, Logger } from '@nestjs/common';

enum CircuitState {
  CLOSED = 'CLOSED',
  HALF_OPEN = 'HALF_OPEN',
  OPEN = 'OPEN',
}

interface CircuitBreakerConfig {
  failureThreshold: number;
  successThreshold: number;
  timeout: number;
  monitoringPeriod: number;
}

interface CircuitStats {
  failures: number;
  successes: number;
  lastFailure: number | null;
  nextAttempt: number | null;
}

@Injectable()
export class CircuitBreakerService {
  private readonly logger = new Logger(CircuitBreakerService.name);
  private circuits = new Map<
    string,
    { config: CircuitBreakerConfig; state: CircuitState; stats: CircuitStats }
  >();

  private defaultConfig: CircuitBreakerConfig = {
    failureThreshold: 5, // Open circuit after 5 failures
    successThreshold: 2, // Close circuit after 2 successes
    timeout: 60000, // Wait 60 seconds before retry
    monitoringPeriod: 300000, // Reset stats every 5 minutes
  };

  /**
   * Execute a function with circuit breaker protection
   */
  async execute<T>(
    circuitName: string,
    operation: () => Promise<T>,
    config?: Partial<CircuitBreakerConfig>,
  ): Promise<T> {
    const circuit = this.getOrCreateCircuit(circuitName, config);

    if (this.shouldRejectRequest(circuit)) {
      const error = new Error(`Circuit breaker is OPEN for ${circuitName}`);

      error.name = 'CircuitBreakerOpenError';
      throw error;
    }

    try {
      const result = await operation();

      this.onSuccess(circuitName);

      return result;
    } catch (error) {
      this.onFailure(circuitName, error);
      throw error;
    }
  }

  /**
   * Get circuit breaker status for monitoring
   */
  getCircuitStatus(circuitName: string) {
    const circuit = this.circuits.get(circuitName);

    if (!circuit) {
      return { state: 'NOT_FOUND', stats: null };
    }

    return {
      state: circuit.state,
      stats: circuit.stats,
      config: circuit.config,
    };
  }

  /**
   * Get all circuit breaker statuses
   */
  getAllCircuitStatuses() {
    const statuses: Record<string, any> = {};

    for (const [name, circuit] of this.circuits.entries()) {
      Object.defineProperty(statuses, name, {
        value: {
          state: circuit.state,
          stats: circuit.stats,
          config: circuit.config,
        },
        enumerable: true,
        writable: true,
        configurable: true,
      });
    }

    return statuses;
  }

  /**
   * Manually reset a circuit breaker
   */
  resetCircuit(circuitName: string): void {
    const circuit = this.circuits.get(circuitName);

    if (circuit) {
      circuit.state = CircuitState.CLOSED;
      circuit.stats = this.createInitialStats();
      this.logger.log(`Circuit breaker ${circuitName} manually reset`);
    }
  }

  private getOrCreateCircuit(
    circuitName: string,
    configOverride?: Partial<CircuitBreakerConfig>,
  ) {
    if (!this.circuits.has(circuitName)) {
      const config = { ...this.defaultConfig, ...configOverride };

      this.circuits.set(circuitName, {
        state: CircuitState.CLOSED,
        stats: this.createInitialStats(),
        config,
      });
    }

    return this.circuits.get(circuitName);
  }

  private createInitialStats(): CircuitStats {
    return {
      failures: 0,
      successes: 0,
      lastFailure: null,
      nextAttempt: null,
    };
  }

  private shouldRejectRequest(circuit: {
    config: CircuitBreakerConfig;
    state: CircuitState;
    stats: CircuitStats;
  }): boolean {
    const now = Date.now();

    // Reset stats if monitoring period has elapsed
    if (
      circuit.stats.lastFailure &&
      now - circuit.stats.lastFailure > circuit.config.monitoringPeriod
    ) {
      circuit.stats = this.createInitialStats();
      circuit.state = CircuitState.CLOSED;
    }

    switch (circuit.state) {
      case CircuitState.CLOSED:
        return false;

      case CircuitState.HALF_OPEN:
        return false;

      case CircuitState.OPEN:
        if (circuit.stats.nextAttempt && now >= circuit.stats.nextAttempt) {
          circuit.state = CircuitState.HALF_OPEN;

          return false;
        }

        return true;

      default:
        return false;
    }
  }

  private onSuccess(circuitName: string): void {
    const circuit = this.circuits.get(circuitName);

    circuit.stats.successes++;

    if (circuit.state === CircuitState.HALF_OPEN) {
      if (circuit.stats.successes >= circuit.config.successThreshold) {
        circuit.state = CircuitState.CLOSED;
        circuit.stats = this.createInitialStats();

        this.logger.log(
          `Circuit breaker ${circuitName} closed after successful recovery`,
        );
      }
    }
  }

  private onFailure(circuitName: string, error: any): void {
    const circuit = this.circuits.get(circuitName);
    const now = Date.now();

    circuit.stats.failures++;
    circuit.stats.lastFailure = now;

    if (circuit.state === CircuitState.CLOSED) {
      if (circuit.stats.failures >= circuit.config.failureThreshold) {
        circuit.state = CircuitState.OPEN;
        circuit.stats.nextAttempt = now + circuit.config.timeout;

        this.logger.warn({
          message: `Circuit breaker ${circuitName} opened due to failures`,
          failures: circuit.stats.failures,
          threshold: circuit.config.failureThreshold,
          nextAttempt: new Date(circuit.stats.nextAttempt).toISOString(),
          error: error.message,
        });
      }
    } else if (circuit.state === CircuitState.HALF_OPEN) {
      circuit.state = CircuitState.OPEN;
      circuit.stats.nextAttempt = now + circuit.config.timeout;

      this.logger.warn({
        message: `Circuit breaker ${circuitName} opened again after failure in half-open state`,
        error: error.message,
      });
    }
  }
}
