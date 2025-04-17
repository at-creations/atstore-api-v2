import Redis from "ioredis";
import { config } from "./env";

const AUTH_DB = 0;
const CACHE_DB = 1;

// Logger for Redis events
const logRedisError = (error: any, instance: string) => {
  console.error(`Redis ${instance} connection error:`, error);
};

/**
 * Redis connection for authentication and rate limiting
 */
export const authRedis = new Redis({
  host: config.REDIS_HOST,
  port: config.REDIS_PORT,
  password: config.REDIS_PASSWORD,
  db: AUTH_DB,
  retryStrategy: (times: number) => {
    const delay = Math.min(times * 50, 2000);
    console.log(`Retrying Redis connection in ${delay}ms...`);
    return delay;
  },
  maxRetriesPerRequest: 3,
})

authRedis.on("error", (error: any) => logRedisError(error, "AUTH"));
authRedis.on("connect", () => console.info(`Connected to Redis AUTH. DB: ${AUTH_DB}. Host: ${config.REDIS_HOST}:${config.REDIS_PORT}`));
authRedis.on("reconnecting", () => console.info("AUTH Redis reconnecting..."));
authRedis.on("ready", () => {
  console.info("AUTH Redis connection is ready");
  if (config.REDIS_AUTH_MAXMEMORY) {
    authRedis.config("SET", "maxmemory", config.REDIS_AUTH_MAXMEMORY);
    const policy = config.REDIS_AUTH_MAXMEMORY_POLICY || "allkeys-lru";
    authRedis.config("SET", "maxmemory-policy", policy);
    console.info(
      `AUTH Redis maxmemory set to ${config.REDIS_AUTH_MAXMEMORY} with policy ${policy}`
    );
  } else {
    console.info("AUTH Redis maxmemory not set, using default settings");
  }
});

/**
 * Redis connection for content caching
 */
export const cacheRedis = new Redis({
  host: config.REDIS_HOST,
  port: config.REDIS_PORT,
  password: config.REDIS_PASSWORD,
  db: CACHE_DB,
  retryStrategy: (times: number) => {
    const delay = Math.min(times * 50, 2000);
    console.log(`Retrying Redis connection in ${delay}ms...`);
    return delay;
  },
  maxRetriesPerRequest: 3,
});

cacheRedis.on("error", (error: any) => logRedisError(error, "CACHE"));
cacheRedis.on("connect", () => console.info(`Connected to Redis CACHE. DB: ${CACHE_DB}. Host: ${config.REDIS_HOST}:${config.REDIS_PORT}`));
cacheRedis.on("reconnecting", () => console.info("CACHE Redis reconnecting..."));
cacheRedis.on("ready", () => {
  console.info("CACHE Redis connection is ready");
  if (config.REDIS_MAXMEMORY) {
    cacheRedis.config("SET", "maxmemory", config.REDIS_MAXMEMORY);
    const policy = config.REDIS_MAXMEMORY_POLICY || "allkeys-lru";
    cacheRedis.config("SET", "maxmemory-policy", policy);
    console.info(`CACHE Redis maxmemory set to ${config.REDIS_MAXMEMORY} with policy ${policy}`);
  } else {
    console.info("CACHE Redis maxmemory not set, using default settings");
  }
});

/**
 * Graceful shutdown function for Redis connections
 */
export const disconnectRedis = async (): Promise<void> => {
  console.log("Closing Redis connections...");
  try {
    await Promise.all([authRedis.quit(), cacheRedis.quit()]);
    console.log("Redis connections closed successfully");
  } catch (error) {
    throw error;
  }
};

/**
 * Testing Redis connection
 */
export const testRedisConnection = async (): Promise<void> => {
  try {
    const status = await Promise.all([
      authRedis.ping(),
      cacheRedis.ping(),
    ]);
    console.log(`Redis connections are healthy: AUTH - ${status[0]}, CACHE - ${status[1]}`);
  } catch (error) {
    throw new Error("Redis connection test failed: " + error);
  }
}