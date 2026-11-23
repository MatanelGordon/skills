'use strict';

const DEFAULTS = Object.freeze({ attempts: 4, baseDelayMs: 200, maxDelayMs: 5000 });

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const TRANSIENT_NAMES = ['AbortError', 'TimeoutError'];
const TRANSIENT_STATUSES = [429, 502, 503, 504];

// fetch reports a dropped connection on error.cause, and AbortSignal.timeout() rejects with a TimeoutError.
const isTransient = (error) =>
  TRANSIENT_NAMES.includes(error?.name)
  || [error?.code, error?.cause?.code].includes('ECONNRESET')
  || TRANSIENT_STATUSES.includes(error?.status);

/**
 * Runs `operation` again after a transient failure, waiting longer each time
 * (exponential, with full jitter). Rethrows the last error once the attempts
 * are used up, and rethrows at once when `shouldRetry` says the error is final.
 */
async function retryWithBackoff(operation, options = {}) {
  const { attempts, baseDelayMs, maxDelayMs } = { ...DEFAULTS, ...options };
  const shouldRetry = options.shouldRetry ?? isTransient;

  for (let attempt = 1; ; attempt += 1) {
    try {
      return await operation(attempt);
    } catch (error) {
      if (attempt >= attempts || !shouldRetry(error)) throw error;
      const ceiling = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1));
      await sleep(Math.random() * ceiling);
    }
  }
}

module.exports = { retryWithBackoff, isTransient };
