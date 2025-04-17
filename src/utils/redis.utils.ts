import { authRedis, cacheRedis } from "../config/redis";

/**
 * Redis cache key prefixes
 * Using short prefixes to save space in Redis
 */
export const REDIS_CACHE_KEYS = {
  CAT: {
    DET: "c:d:", // For individual category details (was category:detail:)
    LST: "c:l:", // For category listings with various parameters (was category:list:)
    ALL: "c:*", // Pattern for all category-related cache entries (was category:*)
  },
  PRD: {
    DET: "p:d:",
    LST: "p:l:",
    ALL: "p:*",
  },
  STORE: {
    INFO: "s:i:", // For store information
  },
  AUTH: {
    FAILED_LOGIN: "auth:f:", // For tracking failed login attempts
    ACCOUNT_LOCK: "auth:l:", // For tracking account lockouts
  },
};

/**
 * Default cache expiration times (in seconds)
 */
export const CACHE_EXPIRY = {
  VERY_SHORT: 120, // 2 minutes
  SHORT: 300, // 5 minutes
  MEDIUM: 1800, // 30 minutes
  LONG: 3600, // 1 hour
  VERY_LONG: 86400, // 24 hours
};

/**
 * Failed login configuration
 */
export const FAILED_LOGIN_CONFIG = {
  MAX_ATTEMPTS: 5, // Maximum number of failed attempts before locking
  LOCKOUT_TIME: 3600, // Lock account for 1 hour (in seconds)
  ATTEMPT_EXPIRY: 1800, // Failed attempts reset after 30 minutes (in seconds)
};

/**
 * Auth Redis utility functions
 */
export const authRedisUtils = {
  /**
   * Set a key with expiration
   * @param key Redis key
   * @param value Value to store
   * @param expirySeconds Expiration time in seconds
   */
  async set(key: string, value: string, expirySeconds?: number): Promise<void> {
    if (expirySeconds) {
      await authRedis.set(key, value, "EX", expirySeconds);
    } else {
      await authRedis.set(key, value);
    }
  },

  /**
   * Get a value by key
   * @param key Redis key
   * @returns Value or null if not found
   */
  async get(key: string): Promise<string | null> {
    return await authRedis.get(key);
  },

  /**
   * Delete a key
   * @param key Redis key
   */
  async del(key: string): Promise<void> {
    await authRedis.del(key);
  },

  /**
   * Check if a key exists
   * @param key Redis key
   * @returns True if key exists
   */
  async exists(key: string): Promise<boolean> {
    const result = await authRedis.exists(key);
    return result === 1;
  },

  /**
   * Track failed login attempt for a specific identifier (username or email)
   * @param identifier Username or email
   * @returns Current failed attempt count and whether account is now locked
   */
  async trackFailedLoginAttempt(
    identifier: string
  ): Promise<{ attempts: number; isLocked: boolean }> {
    const failedKey =
      REDIS_CACHE_KEYS.AUTH.FAILED_LOGIN + identifier.toLowerCase();
    const lockKey =
      REDIS_CACHE_KEYS.AUTH.ACCOUNT_LOCK + identifier.toLowerCase();

    // Check if account is already locked
    const isLocked = await authRedis.exists(lockKey);
    if (isLocked) {
      // Return current attempts and locked status
      const attempts = await authRedis.get(failedKey);
      return { attempts: parseInt(attempts || "0"), isLocked: true };
    }

    // Increment failed attempts counter
    let attempts = await authRedis.incr(failedKey);
    // Set expiry on first creation
    if (attempts === 1) {
      await authRedis.expire(failedKey, FAILED_LOGIN_CONFIG.ATTEMPT_EXPIRY);
    }

    // Lock account if max attempts reached
    if (attempts >= FAILED_LOGIN_CONFIG.MAX_ATTEMPTS) {
      await authRedis.set(
        lockKey,
        Date.now().toString(),
        "EX",
        FAILED_LOGIN_CONFIG.LOCKOUT_TIME
      );
      return { attempts, isLocked: true };
    }

    return { attempts, isLocked: false };
  },

  /**
   * Reset failed login attempts for a user
   * @param identifier Username or email
   */
  async resetFailedLoginAttempts(identifier: string): Promise<void> {
    const failedKey =
      REDIS_CACHE_KEYS.AUTH.FAILED_LOGIN + identifier.toLowerCase();
    await authRedis.del(failedKey);
  },

  /**
   * Check if an account is locked due to too many failed attempts
   * @param identifier Username or email
   * @returns Lock information if locked, null otherwise
   */
  async isAccountLocked(
    identifier: string
  ): Promise<{ locked: boolean; remainingSeconds: number } | null> {
    const lockKey =
      REDIS_CACHE_KEYS.AUTH.ACCOUNT_LOCK + identifier.toLowerCase();
    const ttl = await authRedis.ttl(lockKey);

    if (ttl > 0) {
      return { locked: true, remainingSeconds: ttl };
    }

    return null;
  },

  /**
   * Unlock an account manually
   * @param identifier Username or email
   */
  async unlockAccount(identifier: string): Promise<void> {
    const lockKey =
      REDIS_CACHE_KEYS.AUTH.ACCOUNT_LOCK + identifier.toLowerCase();
    const failedKey =
      REDIS_CACHE_KEYS.AUTH.FAILED_LOGIN + identifier.toLowerCase();

    await authRedis.del(lockKey);
    await authRedis.del(failedKey);
  },
};

/**
 * Cache Redis utility functions
 */
export const cacheRedisUtils = {
  /**
   * Set a key with expiration
   * @param key Redis key
   * @param value Value to store (will be JSON stringified)
   * @param expirySeconds Expiration time in seconds
   */
  async set(key: string, value: any, expirySeconds = 3600): Promise<void> {
    const stringValue =
      typeof value === "string" ? value : JSON.stringify(value);
    await cacheRedis.set(key, stringValue, "EX", expirySeconds);
  },

  /**
   * Get and parse a value by key
   * @param key Redis key
   * @returns Parsed value or null if not found
   */
  async get<T = any>(key: string): Promise<T | null> {
    const data = await cacheRedis.get(key);
    if (!data) return null;

    try {
      return JSON.parse(data) as T;
    } catch (e) {
      return data as unknown as T;
    }
  },

  /**
   * Delete a key
   * @param key Redis key
   */
  async del(key: string): Promise<void> {
    await cacheRedis.del(key);
  },

  /**
   * Delete keys by pattern
   * @param pattern Key pattern with wildcard (e.g., "products:*")
   */
  async delByPattern(pattern: string): Promise<void> {
    const keys = await cacheRedis.keys(pattern);
    if (keys.length > 0) {
      await cacheRedis.del(...keys);
    }
  },

  /**
   * Set cache expiration
   * @param key Redis key
   * @param expirySeconds Expiration time in seconds
   */
  async expire(key: string, expirySeconds: number): Promise<void> {
    await cacheRedis.expire(key, expirySeconds);
  },
};
