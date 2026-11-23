'use strict';

const DEFAULTS = Object.freeze({ attempts: 4, baseDelayMs: 200, maxDelayMs: 5000 });

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const isTransient = (error) =>
  error?.name === 'AbortError' || error?.code === 'ECONNRESET' || [429, 502, 503, 504].includes(error?.status);

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
