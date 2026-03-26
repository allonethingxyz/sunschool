/**
 * Simple circuit breaker for external service calls.
 * Prevents cascade failures by short-circuiting requests to services
 * that are experiencing repeated failures.
 */

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerConfig {
  /** Service name for logging */
  name: string;
  /** Number of consecutive failures before opening the circuit (default: 3) */
  failureThreshold: number;
  /** Milliseconds before transitioning from OPEN to HALF_OPEN (default: 60000) */
  resetTimeMs: number;
}

const DEFAULT_CONFIG: Omit<CircuitBreakerConfig, 'name'> = {
  failureThreshold: 3,
  resetTimeMs: 60_000,
};

/** Global registry so the admin status endpoint can enumerate all breakers. */
const registry: Map<string, CircuitBreaker> = new Map();

export class CircuitBreaker {
  private state: CircuitState = 'CLOSED';
  private failures: number = 0;
  private lastFailureTime: Date | null = null;
  private readonly config: CircuitBreakerConfig;

  constructor(config: Partial<CircuitBreakerConfig> & { name: string }) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    registry.set(this.config.name, this);
  }

  /**
   * Returns true if a request should be allowed through.
   * - CLOSED: always allow
   * - OPEN: block unless resetTimeMs has elapsed (transition to HALF_OPEN)
   * - HALF_OPEN: allow exactly one probe request
   */
  canRequest(): boolean {
    if (this.state === 'CLOSED') {
      return true;
    }

    if (this.state === 'OPEN') {
      const elapsed = Date.now() - (this.lastFailureTime?.getTime() ?? 0);
      if (elapsed >= this.config.resetTimeMs) {
        this.state = 'HALF_OPEN';
        console.log(`[CircuitBreaker] ${this.config.name}: OPEN -> HALF_OPEN (${elapsed}ms elapsed, allowing probe request)`);
        return true;
      }
      console.log(`[CircuitBreaker] Circuit open for ${this.config.name} — blocking request (${Math.round((this.config.resetTimeMs - elapsed) / 1000)}s remaining)`);
      return false;
    }

    // HALF_OPEN — allow the single probe request
    return true;
  }

  /** Record a successful response. Resets the breaker to CLOSED. */
  recordSuccess(): void {
    if (this.state !== 'CLOSED') {
      console.log(`[CircuitBreaker] ${this.config.name}: ${this.state} -> CLOSED (success)`);
    }
    this.state = 'CLOSED';
    this.failures = 0;
  }

  /** Record a failure. May transition to OPEN. */
  recordFailure(): void {
    this.failures++;
    this.lastFailureTime = new Date();

    if (this.state === 'HALF_OPEN') {
      // Probe failed — back to OPEN
      this.state = 'OPEN';
      console.log(`[CircuitBreaker] ${this.config.name}: HALF_OPEN -> OPEN (probe failed)`);
      return;
    }

    if (this.failures >= this.config.failureThreshold) {
      this.state = 'OPEN';
      console.log(`[CircuitBreaker] ${this.config.name}: CLOSED -> OPEN (${this.failures} consecutive failures)`);
    }
  }

  /** Snapshot of current breaker state for observability. */
  getState(): { state: CircuitState; failures: number; lastFailure: Date | null } {
    return {
      state: this.state,
      failures: this.failures,
      lastFailure: this.lastFailureTime,
    };
  }
}

/** Return status of every registered circuit breaker. */
export function getAllCircuitBreakerStates(): Record<string, ReturnType<CircuitBreaker['getState']>> {
  const result: Record<string, ReturnType<CircuitBreaker['getState']>> = {};
  for (const [name, breaker] of registry) {
    result[name] = breaker.getState();
  }
  return result;
}
