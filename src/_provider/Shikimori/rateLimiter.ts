class RateLimiter {
  private lastRequestTime = 0;
  private requestCountInMinute = 0;

  private lastMinuteResetTime = 0;

  // See https://shikimori.one/api/doc for these limits, -1 is selected as adequate limit
  // 5 requests per second
  private readonly RPS_LIMIT = 4;
  // 90 requests per minute
  private readonly RPM_LIMIT = 89;

  private readonly SECOND_MS = 1000;

  private readonly MINUTE_MS = 60000;

  public async acquire() {
    const now = Date.now();

    // Reset minute count if a new minute has started
    if (now - this.lastMinuteResetTime > this.MINUTE_MS) {
      this.requestCountInMinute = 0;
      this.lastMinuteResetTime = now;
    }

    // Check RPM limit
    if (this.requestCountInMinute >= this.RPM_LIMIT) {
      const timeToWait = this.MINUTE_MS - (now - this.lastMinuteResetTime);
      if (timeToWait > 0) {
        await new Promise(resolve => setTimeout(resolve, timeToWait));
      }
      this.requestCountInMinute = 0; // Reset after waiting for the minute to pass
      this.lastMinuteResetTime = Date.now(); // Update reset time
    }

    // Check RPS limit
    const timeSinceLastRequest = now - this.lastRequestTime;
    if (timeSinceLastRequest < this.SECOND_MS / this.RPS_LIMIT) {
      const timeToWait = this.SECOND_MS / this.RPS_LIMIT - timeSinceLastRequest;
      await new Promise(resolve => setTimeout(resolve, timeToWait));
    }

    this.lastRequestTime = Date.now();
    this.requestCountInMinute++;
  }
}

export const shikimoriRateLimiter = new RateLimiter();
