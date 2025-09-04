// API Manager Service
// Handles rate limiting, caching, retry logic, and error recovery for compliance APIs

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number; // Time to live in milliseconds
}

interface RateLimitConfig {
  requests: number;
  windowMs: number;
  currentCount: number;
  windowStart: number;
}

interface RetryConfig {
  maxRetries: number;
  delayMs: number;
  backoffMultiplier: number;
}

export class ApiManager {
  private cache = new Map<string, CacheEntry<unknown>>();
  private rateLimits = new Map<string, RateLimitConfig>();
  private defaultRetryConfig: RetryConfig = {
    maxRetries: 3,
    delayMs: 1000,
    backoffMultiplier: 2
  };

  // Default rate limits for different APIs
  private readonly API_RATE_LIMITS = {
    nhtsa: { requests: 5, windowMs: 1000 }, // 5 requests per second
    fmcsa: { requests: 10, windowMs: 60000 }, // 10 requests per minute
    ifta: { requests: 30, windowMs: 60000 }, // 30 requests per minute
    default: { requests: 20, windowMs: 60000 } // 20 requests per minute
  };

  // Cache TTL for different data types (in milliseconds)
  private readonly CACHE_TTL = {
    vinDecoding: 24 * 60 * 60 * 1000, // 24 hours
    carrierInfo: 60 * 60 * 1000, // 1 hour
    inspectionHistory: 30 * 60 * 1000, // 30 minutes
    registrationStatus: 60 * 60 * 1000, // 1 hour
    insuranceStatus: 30 * 60 * 1000, // 30 minutes
    emissionsStatus: 60 * 60 * 1000, // 1 hour
    iftaData: 15 * 60 * 1000, // 15 minutes
    default: 60 * 60 * 1000 // 1 hour default
  };

  /**
   * Execute API call with rate limiting, caching, and retry logic
   */
  async executeApiCall<T>(
    cacheKey: string,
    apiCall: () => Promise<T>,
    options: {
      cacheType?: string;
      rateLimitKey?: string;
      retryConfig?: Partial<RetryConfig>;
      skipCache?: boolean;
    } = {}
  ): Promise<T> {
    const {
      cacheType = 'default' as keyof typeof this.CACHE_TTL,
      rateLimitKey = 'default',
      retryConfig = {},
      skipCache = false
    } = options;

    // Check cache first (unless skipped)
    if (!skipCache) {
      const cached = this.getFromCache<T>(cacheKey);
      if (cached) {
        console.log(`Cache hit for: ${cacheKey}`);
        return cached;
      }
    }

    // Check rate limit
    await this.enforceRateLimit(rateLimitKey);

    // Execute with retry logic
    const finalRetryConfig = { ...this.defaultRetryConfig, ...retryConfig };
    const result = await this.executeWithRetry(apiCall, finalRetryConfig);

    // Cache the result
    if (!skipCache && result) {
      this.setCache(cacheKey, result, this.CACHE_TTL[cacheType as keyof typeof this.CACHE_TTL] || this.CACHE_TTL.default);
    }

    return result;
  }

  /**
   * Get data from cache if valid
   */
  private getFromCache<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    const now = Date.now();
    if (now - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return null;
    }

    return entry.data as T;
  }

  /**
   * Set data in cache
   */
  private setCache<T>(key: string, data: T, ttl: number): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl
    });

    // Clean up old entries periodically
    if (this.cache.size > 1000) {
      this.cleanupCache();
    }
  }

  /**
   * Clean up expired cache entries
   */
  private cleanupCache(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Enforce rate limiting for API calls
   */
  private async enforceRateLimit(rateLimitKey: string): Promise<void> {
    const config = this.API_RATE_LIMITS[rateLimitKey as keyof typeof this.API_RATE_LIMITS] || this.API_RATE_LIMITS.default;
    if (!config) return;

    const now = Date.now();
    let rateLimit = this.rateLimits.get(rateLimitKey);

    if (!rateLimit || now - rateLimit.windowStart > config.windowMs) {
      // Reset window
      rateLimit = {
        requests: config.requests,
        windowMs: config.windowMs,
        currentCount: 0,
        windowStart: now
      };
      this.rateLimits.set(rateLimitKey, rateLimit);
    }

    if (rateLimit.currentCount >= rateLimit.requests) {
      // Wait until window resets
      const waitTime = rateLimit.windowMs - (now - rateLimit.windowStart);
      console.log(`Rate limit reached for ${rateLimitKey}, waiting ${waitTime}ms`);
      await this.sleep(waitTime);
      
      // Reset after waiting
      rateLimit.currentCount = 0;
      rateLimit.windowStart = Date.now();
    }

    rateLimit.currentCount++;
  }

  /**
   * Execute API call with retry logic
   */
  private async executeWithRetry<T>(
    apiCall: () => Promise<T>,
    config: RetryConfig
  ): Promise<T> {
    let lastError: Error;
    let delay = config.delayMs;

    for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
      try {
        const result = await apiCall();
        if (attempt > 0) {
          console.log(`API call succeeded on attempt ${attempt + 1}`);
        }
        return result;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        if (attempt === config.maxRetries) {
          console.error(`API call failed after ${config.maxRetries + 1} attempts:`, lastError);
          throw lastError;
        }

        // Check if error is retryable
        if (!this.isRetryableError(lastError)) {
          console.error('Non-retryable error:', lastError);
          throw lastError;
        }

        console.warn(`API call failed (attempt ${attempt + 1}), retrying in ${delay}ms:`, lastError.message);
        await this.sleep(delay);
        delay *= config.backoffMultiplier;
      }
    }

    throw lastError!;
  }

  /**
   * Check if an error is retryable
   */
  private isRetryableError(error: Error): boolean {
    const message = error.message.toLowerCase();
    
    // Network errors are generally retryable
    if (message.includes('network') || message.includes('timeout') || message.includes('connection')) {
      return true;
    }

    // HTTP status codes that are retryable
    if (message.includes('500') || // Internal Server Error
        message.includes('502') || // Bad Gateway
        message.includes('503') || // Service Unavailable
        message.includes('504') || // Gateway Timeout
        message.includes('429')) { // Too Many Requests
      return true;
    }

    // Don't retry client errors (4xx except 429)
    if (message.includes('400') || message.includes('401') || 
        message.includes('403') || message.includes('404')) {
      return false;
    }

    // Default to retryable for unknown errors
    return true;
  }

  /**
   * Sleep utility function
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Clear all cache entries
   */
  clearCache(): void {
    this.cache.clear();
    console.log('API cache cleared');
  }

  /**
   * Clear cache for specific pattern
   */
  clearCachePattern(pattern: string): void {
    const regex = new RegExp(pattern);
    for (const key of this.cache.keys()) {
      if (regex.test(key)) {
        this.cache.delete(key);
      }
    }
    console.log(`Cache cleared for pattern: ${pattern}`);
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): {
    totalEntries: number;
    hitRate: number;
    memoryUsage: number;
  } {
    const totalEntries = this.cache.size;
    
    // Calculate approximate memory usage
    let memoryUsage = 0;
    for (const [key, entry] of this.cache.entries()) {
      memoryUsage += key.length * 2; // Approximate string size
      memoryUsage += JSON.stringify(entry.data).length * 2;
      memoryUsage += 24; // Overhead for timestamp, ttl, etc.
    }

    return {
      totalEntries,
      hitRate: 0, // Would need to track hits/misses to calculate
      memoryUsage: Math.round(memoryUsage / 1024) // KB
    };
  }

  /**
   * Get rate limit status for all APIs
   */
  getRateLimitStatus(): Record<string, {
    remaining: number;
    resetTime: number;
    windowMs: number;
  }> {
    const status: Record<string, { remaining: number; resetTime: number; windowMs: number }> = {};
    const now = Date.now();
    
    for (const [key, limit] of this.rateLimits.entries()) {
      const timeUntilReset = limit.windowMs - (now - limit.windowStart);
      status[key] = {
        remaining: Math.max(0, limit.requests - limit.currentCount),
        resetTime: timeUntilReset > 0 ? timeUntilReset : 0,
        windowMs: limit.windowMs
      };
    }
    
    return status;
  }

  /**
   * Force refresh cached data
   */
  async refreshCache<T>(
    cacheKey: string,
    apiCall: () => Promise<T>,
    cacheType: keyof typeof this.CACHE_TTL = 'default' as keyof typeof this.CACHE_TTL
  ): Promise<T> {
    this.cache.delete(cacheKey);
    return this.executeApiCall(cacheKey, apiCall, { cacheType, skipCache: false });
  }
}

// Export singleton instance
export const apiManager = new ApiManager();